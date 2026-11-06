"""WO Assistant: a conversational interface to the knowledge-based agent.

It answers only from application data, KB facts/rules, deterministic calculations and
available weather. When data is missing it says so and asks for exactly what backward
chaining reported as missing. It never generates free text: every answer is a template
filled with computed values.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.chatbot.nlu import (
    Candidate,
    detect_intent,
    extract_date,
    extract_labeled,
    extract_quantity_l,
    is_arabic,
    match_candidates,
    normalize,
    numbers,
)
from app.ai.knowledge_base.loader import load_knowledge
from app.core.errors import AppError, NotFoundError
from app.models import (
    Alert,
    ChatMessage,
    ChatSession,
    Farm,
    FarmCrop,
    HydroponicSystem,
    User,
)
from app.models.base import AlertStatus, PlantingStatus, utcnow
from app.schemas.ai import IrrigationRequest
from app.services import hydro_service, irrigation_service, water_service, weather_service
from app.services.access import visible_farms_query

NO_DATA_AR = "لا توجد بيانات كافية لإعطاء توصية موثوقة."
NO_DATA_EN = "Insufficient data to generate a recommendation."


def _t(lang: str, en: str, ar: str) -> str:
    return ar if lang == "ar" else en


def _fmt(x: float | None, d: int = 1) -> str:
    if x is None:
        return "—"
    return f"{x:,.{d}f}" if abs(x - round(x)) > 1e-9 else f"{x:,.0f}"


class ChatbotService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user

    # ------------------------------------------------------------------ data access (scoped)
    def farms(self) -> list[Farm]:
        return list(self.db.scalars(visible_farms_query(self.user)))

    def plantings(self) -> list[FarmCrop]:
        ids = [f.id for f in self.farms()]
        if not ids:
            return []
        return list(self.db.scalars(select(FarmCrop).where(FarmCrop.farm_id.in_(ids),
                                                           FarmCrop.status == PlantingStatus.ACTIVE)))

    def systems(self) -> list[HydroponicSystem]:
        ids = [f.id for f in self.farms()]
        if not ids:
            return []
        return list(self.db.scalars(select(HydroponicSystem).where(HydroponicSystem.farm_id.in_(ids))))

    def planting_candidates(self) -> list[Candidate]:
        farms = {f.id: f for f in self.farms()}
        out = []
        for p in self.plantings():
            farm = farms.get(p.farm_id)
            label_en = f"{p.crop.name_en}{' ' + p.variety if p.variety else ''} — {farm.name if farm else ''} ({_fmt(p.area_m2, 0)} m²)"
            label_ar = f"{p.crop.name_ar}{' ' + p.variety if p.variety else ''} — {farm.name if farm else ''} ({_fmt(p.area_m2, 0)} م²)"
            names = [p.crop.name_en, p.crop.name_ar, p.crop.code.replace("_", " "), *p.crop.aliases]
            if p.variety:
                names.append(p.variety)
            out.append(Candidate(str(p.id), label_en, label_ar, names, {"farm_id": str(p.farm_id)}))
        return out

    # ------------------------------------------------------------------ session
    def session(self, session_id: uuid.UUID | None, lang: str) -> ChatSession:
        if session_id is not None:
            s = self.db.get(ChatSession, session_id)
            if s is None or s.user_id != self.user.id:
                raise NotFoundError("Chat session not found.")
            return s
        s = ChatSession(user_id=self.user.id, language=lang, state={})
        self.db.add(s)
        self.db.flush()
        return s

    # ------------------------------------------------------------------ entry point
    def handle(self, message: str, session_id: uuid.UUID | None, language: str | None,
               manual: dict[str, float] | None = None) -> dict[str, Any]:
        lang = language or ("ar" if is_arabic(message) else "en")
        session = self.session(session_id, lang)
        state = dict(session.state or {})
        norm = normalize(message)
        today = date.today()
        intent_res = detect_intent(norm)
        quantity = extract_quantity_l(norm)
        target = extract_date(norm, today)
        mentioned = match_candidates(norm, self.planting_candidates())
        pending = state.get("pending")
        option_pick = state.get("options_map", {}).get(message.strip())

        nlu = {"normalized": norm, "intent": intent_res.intent, "scores": intent_res.scores,
               "entities": {"quantity_l": quantity, "date": target.isoformat() if target else None,
                            "plantings": [c.id for c in mentioned]}}

        intent = intent_res.intent
        labeled = extract_labeled(norm)
        nums = numbers(norm)
        slot = (pending or {}).get("slot")
        answers_pending = bool(pending) and (
            intent is None or intent == pending["intent"] or option_pick is not None
            or (slot == "weather_inputs" and (bool({"et0", "rain"} & set(labeled)) or bool(nums)))
            or (slot == "available_water_l" and quantity is not None and intent not in ("water_usage",)))
        # Continue a pending slot-filling dialogue when the user answers the question.
        if pending and answers_pending:
            intent = pending["intent"]
            if slot == "available_water_l" and quantity is not None and not ({"et0", "rain"} & set(labeled)):
                state.setdefault("slots", {})["available_water_l"] = labeled.get("water", quantity)
            if slot == "planting" and (option_pick or len(mentioned) == 1):
                state.setdefault("slots", {})["planting_id"] = option_pick or mentioned[0].id
            if slot == "system" and option_pick:
                state.setdefault("slots", {})["system_id"] = option_pick
            if slot == "weather_inputs" and not ({"et0", "rain"} & set(labeled)):
                if nums:
                    state.setdefault("slots", {})["et0_override_mm"] = nums[0]
                if len(nums) > 1:
                    state.setdefault("slots", {})["precipitation_override_mm"] = nums[1]
        elif intent is not None and intent != (pending or {}).get("intent"):
            # A new question: keep manual weather/water inputs, forget the previous target.
            keep = {k: v for k, v in state.get("slots", {}).items()
                    if k in ("et0_override_mm", "precipitation_override_mm", "available_water_l")}
            state["slots"] = keep
        state.pop("pending", None)
        state.pop("options_map", None)
        slots = state.setdefault("slots", {})
        if target is not None:
            slots["date"] = target.isoformat()
        # Manual inputs (offline weather / water availability): labelled numbers or explicit fields.
        if "et0" in labeled:
            slots["et0_override_mm"] = labeled["et0"]
        if "rain" in labeled:
            slots["precipitation_override_mm"] = labeled["rain"]
        if "water" in labeled:
            slots["available_water_l"] = labeled["water"]
        for key, value in (manual or {}).items():
            slots[key] = value
        nlu["entities"]["manual_inputs"] = {k: slots[k] for k in ("et0_override_mm", "precipitation_override_mm",
                                                                    "available_water_l") if k in slots}

        handler = {
            "irrigation_advice": self.irrigation, "water_requirement": self.requirement,
            "water_usage": self.usage, "hydroponic_status": self.hydro, "weather": self.weather,
            "alerts": self.alerts, "explain_last": self.explain, "land_distribution": self.land,
            "greeting": self.greeting, "help": self.greeting,
        }.get(intent or "")
        if handler is None:
            reply = self.fallback(lang, intent_res.ambiguous)
        else:
            reply = handler(lang, state, mentioned, norm)
        reply["nlu"] = nlu
        reply["intent"] = intent

        session.state = state
        session.language = lang
        self.db.add(ChatMessage(session_id=session.id, role="user", text=message, payload={"nlu": nlu}))
        self.db.add(ChatMessage(session_id=session.id, role="assistant", text=reply["text"],
                                payload={"status": reply["status"], "options": reply.get("options", []),
                                         "explanation": reply.get("explanation")}))
        self.db.commit()
        reply["session_id"] = session.id
        reply["language"] = lang
        return reply

    # ------------------------------------------------------------------ helpers
    def _choose_planting(self, lang: str, state: dict[str, Any], mentioned: list[Candidate],
                         intent: str) -> tuple[str | None, dict[str, Any] | None]:
        slots = state.setdefault("slots", {})
        if slots.get("planting_id"):
            return slots["planting_id"], None
        all_c = self.planting_candidates()
        if not all_c:
            return None, {"status": "missing_data", "options": [], "text": _t(
                lang, "You have no active plantings yet. Add a crop to a farm first, then ask again.",
                "لا توجد لديك زراعات نشطة بعد. أضف محصولًا إلى مزرعة ثم اسأل مرة أخرى.")}
        pool = mentioned or all_c
        if len(pool) == 1:
            slots["planting_id"] = pool[0].id
            return pool[0].id, None
        options = [{"label": c.label_ar if lang == "ar" else c.label_en, "value": c.id} for c in pool[:8]]
        state["pending"] = {"intent": intent, "slot": "planting"}
        state["options_map"] = {o["label"]: o["value"] for o in options} | {o["value"]: o["value"] for o in options}
        return None, {"status": "clarification", "options": options, "text": _t(
            lang, "Which planting do you mean?", "أي زراعة تقصد؟")}

    def _target(self, state: dict[str, Any]) -> date:
        d = state.get("slots", {}).get("date")
        return date.fromisoformat(d) if d else date.today()

    # ------------------------------------------------------------------ intents
    def irrigation(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        pid, early = self._choose_planting(lang, state, mentioned, "irrigation_advice")
        if early:
            return early
        slots = state["slots"]
        req = IrrigationRequest(farm_crop_id=uuid.UUID(pid), target_date=self._target(state),
                                available_water_l=slots.get("available_water_l"),
                                et0_override_mm=slots.get("et0_override_mm"),
                                precipitation_override_mm=slots.get("precipitation_override_mm"), persist=False)
        try:
            res = irrigation_service.recommend(self.db, self.user, req, None)
        except AppError as exc:  # e.g. the planting has no irrigation method yet
            return {"status": "missing_data", "options": [], "text": _t(
                lang, f"{NO_DATA_EN} {getattr(exc, 'message', '')}", f"{NO_DATA_AR} {getattr(exc, 'message', '')}")}
        expl = res["explanation"]
        state["last"] = {"kind": "irrigation", "planting_id": pid, "summary": _summary(expl)}
        rec = expl["recommendation"]
        if rec is None:
            missing = expl["missing_data"]
            fields = {f for m in missing for f in m["fields"]}
            needs_weather = bool(fields & {"et0", "precipitation"})
            needs_water = "available_water" in fields
            hints = []
            for m in missing:
                for h in m["hints"]:
                    text = h["ar"] if lang == "ar" else h["en"]
                    if text not in hints:
                        hints.append(text)
            text = _t(lang, NO_DATA_EN, NO_DATA_AR) + "\n" + _t(lang, "I need:", "أحتاج:") + "\n" + \
                "\n".join(f"• {h}" for h in hints)
            if needs_weather:
                # Weather first: the water comparison depends on the requirement, which needs ET0.
                state["pending"] = {"intent": "irrigation_advice", "slot": "weather_inputs"}
                text += "\n" + _t(lang, "Weather data is unavailable. Send today's ET0 and expected rain, e.g. "
                                        "\"ET0 6.2 rain 0\".",
                                  "بيانات الطقس غير متوفرة. أرسل قيمة التبخر-النتح المرجعي والمطر المتوقع اليوم، "
                                  "مثل: «التبخر 6.2 المطر 0».")
            elif needs_water:
                state["pending"] = {"intent": "irrigation_advice", "slot": "available_water_l"}
                text += "\n" + _t(lang, "How many litres of water are available today?",
                                  "كم لترًا من الماء متاح اليوم؟")
            return {"status": "missing_data", "options": [], "text": text, "explanation": expl}
        text = _answer_text(lang, expl)
        return {"status": "answer", "options": [], "text": text, "explanation": expl}

    def requirement(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        pid, early = self._choose_planting(lang, state, mentioned, "water_requirement")
        if early:
            return early
        slots = state.get("slots", {})
        prep = irrigation_service.prepare(self.db, self.user, uuid.UUID(pid), self._target(state), None,
                                          slots.get("et0_override_mm"), slots.get("precipitation_override_mm"))
        r = prep.perception.calculation["result"]
        if r.get("etc_mm") is None:
            demand = prep.perception.percepts.get("et_demand_positive")
            reason = demand.evidence.get("reason") if demand else ""
            return {"status": "missing_data", "options": [], "text": _t(
                lang, f"{NO_DATA_EN} ({reason})", f"{NO_DATA_AR} ({reason})")}
        crop = prep.planting.crop
        stage = prep.perception.variables.get("stage", "—")
        if r.get("gross_l") is None:
            text = _t(lang,
                      f"{crop.name_en} ({stage} stage): ETc = {_fmt(r['etc_mm'], 2)} mm/day (Kc {_fmt(r['kc'], 3)} × ET0 {_fmt(r['et0_mm'], 2)}). "
                      "Precipitation is unknown, so the net volume cannot be computed.",
                      f"{crop.name_ar} (مرحلة {stage}): ETc = {_fmt(r['etc_mm'], 2)} مم/يوم (Kc {_fmt(r['kc'], 3)} × ET0 {_fmt(r['et0_mm'], 2)}). "
                      "الهطول غير معروف لذلك لا يمكن حساب الحجم الصافي.")
        else:
            text = _t(lang,
                      f"{crop.name_en} ({stage} stage) needs {_fmt(r['gross_l'])} L today: ETc {_fmt(r['etc_mm'], 2)} mm "
                      f"− effective rain {_fmt(r['p_eff_mm'], 2)} mm = {_fmt(r['nir_mm'], 2)} mm × {_fmt(prep.planting.area_m2, 0)} m² "
                      f"= {_fmt(r['net_l'])} L net, ÷ efficiency.",
                      f"يحتاج {crop.name_ar} (مرحلة {stage}) إلى {_fmt(r['gross_l'])} لتر اليوم: ETc {_fmt(r['etc_mm'], 2)} مم "
                      f"− المطر الفعّال {_fmt(r['p_eff_mm'], 2)} مم = {_fmt(r['nir_mm'], 2)} مم × {_fmt(prep.planting.area_m2, 0)} م² "
                      f"= {_fmt(r['net_l'])} لتر صافي، مقسومًا على الكفاءة.")
        return {"status": "answer", "options": [], "text": text,
                "explanation": {"calculation": prep.perception.calculation}}

    def usage(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        farms = self.farms()
        if not farms:
            return {"status": "missing_data", "options": [], "text": _t(
                lang, "No farms yet.", "لا توجد مزارع بعد.")}
        today = date.today()
        a = water_service.analytics(self.db, self.user, farm_id=None, period="day",
                                    date_from=today - timedelta(days=6), date_to=today)
        if not a["has_data"]:
            return {"status": "answer", "options": [], "text": _t(
                lang, "No water records in the last 7 days.", "لا توجد سجلات مياه خلال آخر 7 أيام.")}
        today_total = next((s["total_l"] for s in a["series"] if s["period"] == today.isoformat()), 0.0)
        return {"status": "answer", "options": [], "text": _t(
            lang, f"Recorded water use: {_fmt(a['total_l'])} L in the last 7 days "
                  f"({a['days_with_records']} days with records); today {_fmt(today_total)} L.",
            f"الاستهلاك المسجل: {_fmt(a['total_l'])} لتر خلال آخر 7 أيام "
            f"({a['days_with_records']} أيام فيها سجلات)؛ اليوم {_fmt(today_total)} لتر.")}

    def hydro(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        systems = self.systems()
        if not systems:
            return {"status": "missing_data", "options": [], "text": _t(
                lang, "No hydroponic systems configured.", "لا توجد أنظمة زراعة مائية مُعرّفة.")}
        chosen_id = state.get("slots", {}).get("system_id")
        named = [s for s in systems if normalize(s.name) in norm]
        pool = [s for s in systems if str(s.id) == chosen_id] or named or systems
        if len(pool) > 1:
            options = [{"label": s.name, "value": str(s.id)} for s in pool[:8]]
            state["pending"] = {"intent": "hydroponic_status", "slot": "system"}
            state["options_map"] = {o["label"]: o["value"] for o in options} | {o["value"]: o["value"] for o in options}
            return {"status": "clarification", "options": options,
                    "text": _t(lang, "Which hydroponic system?", "أي نظام زراعة مائية؟")}
        system = pool[0]
        expl = hydro_service.evaluate_system(self.db, system)
        state["last"] = {"kind": "hydroponic", "system_id": str(system.id), "summary": _summary(expl)}
        rec = expl["recommendation"]
        if rec is None:
            hints = sorted({(h["ar"] if lang == "ar" else h["en"]) for m in expl["missing_data"] for h in m["hints"]})
            return {"status": "missing_data", "options": [], "explanation": expl, "text": _t(
                lang, NO_DATA_EN, NO_DATA_AR) + "\n" + "\n".join(f"• {h}" for h in hints)}
        return {"status": "answer", "options": [], "text": _answer_text(lang, expl), "explanation": expl}

    def weather(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        farms = self.farms()
        if not farms:
            return {"status": "missing_data", "options": [], "text": _t(lang, "No farms yet.", "لا توجد مزارع بعد.")}
        named = [f for f in farms if normalize(f.name) in norm]
        farm = (named or farms)[0]
        kb = load_knowledge(self.db)
        ws = weather_service.get_weather(self.db, farm, kb.params)
        if ws.status == "unavailable":
            return {"status": "answer", "options": [], "text": _t(
                lang, f"Weather data is currently unavailable for {farm.name}.",
                f"بيانات الطقس غير متوفرة حاليًا لمزرعة {farm.name}.")}
        day = weather_service.day_values(ws, self._target(state))
        cur = ws.snapshot.current if ws.snapshot else {}
        src = _t(lang, "fresh", "حديثة") if ws.status == "fresh" else _t(
            lang, f"saved snapshot, {_fmt(ws.age_hours)} h old", f"لقطة محفوظة عمرها {_fmt(ws.age_hours)} ساعة")
        return {"status": "answer", "options": [], "text": _t(
            lang, f"{farm.name} ({src}): ET0 {_fmt(day.et0_mm, 2)} mm, precipitation {_fmt(day.precipitation_mm)} mm, "
                  f"air temperature {_fmt(cur.get('temperature_2m'))} °C, air humidity {_fmt(cur.get('relative_humidity_2m'), 0)} % "
                  "(air humidity, not soil moisture).",
            f"{farm.name} ({src}): ET0 {_fmt(day.et0_mm, 2)} مم، الهطول {_fmt(day.precipitation_mm)} مم، "
            f"حرارة الهواء {_fmt(cur.get('temperature_2m'))} °م، رطوبة الهواء {_fmt(cur.get('relative_humidity_2m'), 0)}٪ "
            "(رطوبة الهواء وليست رطوبة التربة).")}

    def alerts(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        ids = [f.id for f in self.farms()]
        items = list(self.db.scalars(select(Alert).where(Alert.farm_id.in_(ids), Alert.status == AlertStatus.OPEN)
                                     .order_by(Alert.created_at.desc()).limit(5))) if ids else []
        if not items:
            return {"status": "answer", "options": [], "text": _t(lang, "No open alerts.", "لا توجد تنبيهات مفتوحة.")}
        lines = [f"• [{a.severity.value}] {a.title_ar if lang == 'ar' else a.title_en} — "
                 f"{a.message_ar if lang == 'ar' else a.message_en} ({a.rule_code})" for a in items]
        return {"status": "answer", "options": [], "text": _t(lang, "Open alerts:", "التنبيهات المفتوحة:") + "\n" + "\n".join(lines)}

    def explain(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        last = state.get("last")
        if not last:
            return {"status": "fallback", "options": [], "text": _t(
                lang, "There is no previous recommendation to explain yet. Ask me about irrigation first.",
                "لا توجد توصية سابقة لشرحها بعد. اسألني عن الري أولًا.")}
        s = last["summary"]
        lines = [_t(lang, "How I reasoned:", "كيف وصلت إلى القرار:"),
                 (s["reason_ar"] if lang == "ar" else s["reason_en"]),
                 _t(lang, "Rules triggered: ", "القواعد المفعّلة: ") + ", ".join(s["rules"]),
                 _t(lang, "Facts used: ", "الحقائق المستخدمة: ") + ", ".join(s["facts"])]
        if s["changes"]:
            lines.append(_t(lang, "What could change it: ", "ما الذي قد يغيّر القرار: ") + "; ".join(
                s["changes_ar"] if lang == "ar" else s["changes"]))
        return {"status": "answer", "options": [], "text": "\n".join(lines)}

    def land(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        return {"status": "answer", "options": [], "text": _t(
            lang, "Land distribution is solved with A* search on the Land Distribution page. I need the total area, "
                  "the season's available water, and each candidate crop with its expected yield per m².",
            "يُحل توزيع الأرض بخوارزمية البحث A* في صفحة توزيع الأرض. أحتاج المساحة الكلية، والماء المتاح للموسم، "
            "وكل محصول مرشح مع إنتاجيته المتوقعة لكل م².")}

    def greeting(self, lang: str, state: dict[str, Any], mentioned: list[Candidate], norm: str) -> dict[str, Any]:
        return {"status": "answer", "options": _suggestions(lang), "text": _t(
            lang, "Hello! I am the WO assistant. I answer from your farm data and the knowledge base only — "
                  "irrigation decisions, water requirements, water use, hydroponic status, weather and alerts.",
            "أهلًا! أنا مساعد WO. أجيب فقط من بيانات مزرعتك وقاعدة المعرفة: قرارات الري، والاحتياج المائي، "
            "والاستهلاك، وحالة الزراعة المائية، والطقس، والتنبيهات.")}

    def fallback(self, lang: str, ambiguous: list[str]) -> dict[str, Any]:
        text = _t(lang, "I did not understand the question. I can answer these:",
                  "لم أفهم السؤال. أستطيع الإجابة عن هذه الأسئلة:")
        return {"status": "fallback", "options": _suggestions(lang), "text": text}


def _suggestions(lang: str) -> list[dict[str, str]]:
    items = [("Should I irrigate today?", "هل أسقي اليوم؟"), ("How much water does my crop need?", "كم يحتاج محصولي من الماء؟"),
             ("Water usage this week", "كم استهلكت هذا الأسبوع؟"), ("Hydroponic status", "حالة المحلول في الزراعة المائية"),
             ("Weather today", "الطقس اليوم"), ("Open alerts", "التنبيهات")]
    return [{"label": ar if lang == "ar" else en, "value": ar if lang == "ar" else en} for en, ar in items]


def _summary(expl: dict[str, Any]) -> dict[str, Any]:
    return {"reason_en": expl["reason_en"], "reason_ar": expl["reason_ar"],
            "rules": [r["code"] for r in expl["triggered_rules"]],
            "facts": [f"{f['symbol']}={'T' if f['value'] else 'F'}" for f in expl["supporting_facts"] if f["used"]],
            "changes": [f"{c['condition_en']} {c['effect_en']}" for c in expl["what_could_change"]],
            "changes_ar": [f"{c['condition_ar']} {c['effect_ar']}" for c in expl["what_could_change"]]}


def _answer_text(lang: str, expl: dict[str, Any]) -> str:
    rec = expl["recommendation"]
    lines = [
        _t(lang, "Recommendation: ", "التوصية: ") + (rec["text_ar"] if lang == "ar" else rec["text_en"]),
        _t(lang, "Why: ", "السبب: ") + (expl["reason_ar"] if lang == "ar" else expl["reason_en"]),
        _t(lang, "Rules: ", "القواعد: ") + ", ".join(r["code"] for r in expl["triggered_rules"]),
    ]
    for a in expl.get("advisories", []):
        lines.append("• " + (a["text_ar"] if lang == "ar" else a["text_en"]))
    quality = expl.get("data_quality")
    labels = {"manual_et0": ("manual ET0 entered by you (weather offline)", "قيمة ET0 يدوية أدخلتها (الطقس غير متصل)"),
              "stale_weather": ("weather snapshot is stale", "لقطة الطقس قديمة"),
              "no_weather": ("no weather data", "لا توجد بيانات طقس")}
    if quality in labels:
        en, ar = labels[quality]
        lines.append(_t(lang, f"Data quality: {en}", f"جودة البيانات: {ar}"))
    return "\n".join(lines)


def history(db: Session, user: User, session_id: uuid.UUID) -> list[ChatMessage]:
    s = db.get(ChatSession, session_id)
    if s is None or s.user_id != user.id:
        raise NotFoundError("Chat session not found.")
    return list(db.scalars(select(ChatMessage).where(ChatMessage.session_id == session_id)
                           .order_by(ChatMessage.created_at)))


__all__ = ["ChatbotService", "history", "utcnow"]
