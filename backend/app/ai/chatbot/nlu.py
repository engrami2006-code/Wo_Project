"""Deterministic natural-language understanding for Arabic and English (no ML, no LLM).

Pipeline: normalize → tokenize → weighted pattern matching (intents) → entity extraction
(dates, quantities, the user's own crops / systems / farms).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

_TASHKEEL = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = "ـ"
_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫،", "01234567890123456789.,")


def normalize(text: str) -> str:
    """Normalize Arabic orthographic variants, digits and case."""
    t = text.translate(_AR_DIGITS)
    t = _TASHKEEL.sub("", t).replace(_TATWEEL, "")
    t = re.sub("[إأآٱ]", "ا", t)
    t = t.replace("ة", "ه").replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    t = t.lower()
    t = re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", t)  # thousands separator: 5,000 -> 5000
    t = re.sub(r"(\d)[.,](\d)", lambda m: m.group(1) + "\x00" + m.group(2), t)  # protect decimals
    t = re.sub(r"[؟?!.,;:()\[\]\"'«»]", " ", t).replace("\x00", ".")
    return re.sub(r"\s+", " ", t).strip()


def is_arabic(text: str) -> bool:
    return bool(re.search(r"[؀-ۿ]", text))


def strip_al(word: str) -> str:
    """Remove the Arabic definite article and common one-letter proclitics (و، ب، ل، ف)."""
    w = word
    if len(w) > 3 and w[0] in "وبلف" and w[1:3] == "ال":
        w = w[1:]
    if len(w) > 3 and w.startswith("ال") or len(w) > 3 and w.startswith("لل"):
        w = w[2:]
    return w


INTENT_PATTERNS: dict[str, list[str]] = {
    "irrigation_advice": ["اسقي", "اسقى", "نسقي", "يسقي", "سقي", "اروي", "الري", "ري", "هل اسقي", "متي اسقي",
                          "كم اسقي", "irrigate", "irrigation", "should i water", "water today", "watering",
                          "water the"],
    "water_requirement": ["احتياج", "الاحتياج", "كم تحتاج", "كم يحتاج", "احتياج المياه", "الاحتياج المائي",
                          "requirement", "how much water does", "water need", "needs water"],
    "water_usage": ["استهلاك", "استهلكت", "استهلكنا", "صرفت", "المستخدمه", "usage", "consumption", "consumed",
                    "how much did", "used"],
    "hydroponic_status": ["هيدروبونيك", "الزراعه المائيه", "زراعه مائيه", "المحلول", "محلول", "ph", "ec",
                          "حموضه", "الحموضه", "ملوحه", "الخزان", "hydroponic", "hydroponics", "nutrient solution",
                          "reservoir", "nft", "dwc"],
    "weather": ["طقس", "الطقس", "الجو", "مطر", "امطار", "حراره", "الحراره", "رطوبه", "weather", "rain",
                "temperature", "forecast", "humidity"],
    "alerts": ["تنبيه", "تنبيهات", "تحذير", "تحذيرات", "انذار", "alert", "alerts", "warning", "warnings"],
    "explain_last": ["ليش", "لماذا", "ليه", "وضح", "اشرح", "السبب", "كيف وصلت", "why", "explain", "reason",
                     "how did you"],
    "land_distribution": ["توزيع الارض", "توزيع المساحه", "اوزع", "تقسيم الارض", "توزيع المحاصيل",
                          "land distribution", "allocate land", "distribute land", "land allocation", "a*"],
    "greeting": ["مرحبا", "السلام", "هلا", "اهلا", "صباح الخير", "مساء الخير", "hello", "hi", "hey",
                 "good morning", "good evening"],
    "help": ["مساعده", "ساعدني", "وش تقدر", "ماذا تستطيع", "ايش تسوي", "help", "what can you do"],
}

INTENT_THRESHOLD = 1.0


@dataclass
class IntentResult:
    intent: str | None
    scores: dict[str, float]
    ambiguous: list[str] = field(default_factory=list)


def _tokens(norm: str) -> list[str]:
    return [strip_al(w) for w in norm.split()]


def detect_intent(norm: str) -> IntentResult:
    padded = f" {norm} "
    tokens = set(_tokens(norm)) | set(norm.split())
    scores: dict[str, float] = {}
    for intent, patterns in INTENT_PATTERNS.items():
        score = 0.0
        for pat in patterns:
            p = normalize(pat)
            if " " in p:
                if f" {p} " in padded:
                    score += 1.0 + 0.5 * p.count(" ")  # phrases weigh more
            elif p in tokens or strip_al(p) in tokens:
                score += 1.0
        if score:
            scores[intent] = score
    if not scores:
        return IntentResult(None, {})
    best = max(scores.values())
    top = sorted(i for i, s in scores.items() if s == best)
    # "why" questions about irrigation are explanations of the last answer
    if "explain_last" in scores and scores["explain_last"] >= 1 and len(top) > 1 and "explain_last" in top:
        return IntentResult("explain_last", scores)
    if best < INTENT_THRESHOLD:
        return IntentResult(None, scores)
    if len(top) > 1:
        # a domain intent beats greeting/help when both match
        domain = [i for i in top if i not in ("greeting", "help")]
        if len(domain) == 1:
            return IntentResult(domain[0], scores)
        return IntentResult(None, scores, ambiguous=top)
    return IntentResult(top[0], scores)


# --------------------------------------------------------------------------- entities

_QTY = re.compile(r"(\d+(?:[.,]\d+)?)\s*(k\s*l|kl|m3|م3|متر مكعب|متر٣|لتر|ليتر|l|liters?|litres?)?\b",
                  re.IGNORECASE)


def extract_quantity_l(norm: str) -> float | None:
    for m in _QTY.finditer(norm):
        value = float(m.group(1).replace(",", "."))
        unit = (m.group(2) or "").replace(" ", "")
        if unit in ("m3", "م3", "مترمكعب", "متر٣", "kl"):
            return value * 1000.0
        if unit or value >= 1:
            return value
    return None


def extract_date(norm: str, today: date) -> date | None:
    words = set(norm.split())
    if words & {"بكره", "بكرا", "غدا", "باكر", "tomorrow"}:
        return today + timedelta(days=1)
    if words & {"امس", "البارحه", "yesterday"}:
        return today - timedelta(days=1)
    if words & {"اليوم", "today", "now", "الحين", "الان"}:
        return today
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", norm)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


@dataclass
class Candidate:
    id: str
    label_en: str
    label_ar: str
    names: list[str]   # normalized names and aliases to match
    meta: dict[str, Any] = field(default_factory=dict)


def match_candidates(norm: str, candidates: list[Candidate]) -> list[Candidate]:
    tokens = set(_tokens(norm)) | set(norm.split())
    padded = f" {norm} "
    hits = []
    for c in candidates:
        for name in c.names:
            n = normalize(name)
            if not n:
                continue
            if (" " in n and f" {n} " in padded) or n in tokens or strip_al(n) in tokens:
                hits.append(c)
                break
    return hits


LABELS: dict[str, list[str]] = {
    "et0": ["et0", "eto", "et₀", "تبخر", "التبخر", "التبخر النتح", "تبخر نتح"],
    "rain": ["rain", "rainfall", "precipitation", "مطر", "المطر", "امطار", "الامطار", "هطول", "الهطول"],
    "water": ["water", "available", "ماء", "الماء", "مياه", "المياه", "متاح", "المتاح"],
}
_NUM = r"(?<![a-z\u0600-\u06ff\d.])(\d+(?:[.,]\d+)?)"


def extract_labeled(norm: str) -> dict[str, float]:
    """Numbers introduced by a label, e.g. 'et0 6.2 rain 0' or 'التبخر 6.2 المطر 0'."""
    out: dict[str, float] = {}
    for key, labels in LABELS.items():
        for label in sorted(labels, key=len, reverse=True):
            m = re.search(rf"(?:^|\s){re.escape(normalize(label))}\s*[:=]?\s*{_NUM}", norm)
            if m:
                out[key] = float(m.group(1).replace(",", "."))
                break
    return out


def numbers(norm: str) -> list[float]:
    return [float(x.replace(",", ".")) for x in re.findall(_NUM, norm)]
