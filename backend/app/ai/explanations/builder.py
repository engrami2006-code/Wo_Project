"""Explanation engine: turns an inference result into the explanation contract.

The contract answers six questions for every recommendation:
1. What was recommended?         -> recommendation
2. Which facts were used?        -> supporting_facts
3. Which rules were triggered?   -> triggered_rules (with firing order)
4. Why?                          -> reason (rendered from the rules on the derivation path)
5. Why not the alternatives?     -> alternatives (overridden, or the blocking conditions)
6. What could change it?         -> what_could_change / missing_data
"""

from __future__ import annotations

from typing import Any

from app.ai.inference.backward import BackwardChainer
from app.ai.inference.conflict import explain_win
from app.ai.inference.forward import Decision, FiredRule
from app.ai.knowledge_base.loader import KnowledgeSnapshot
from app.ai.perception.base import PerceptSet, render
from app.ai.perception.irrigation import MISSING_FIELD_HINTS
from app.ai.rules.rule import HornRule, Literal

INSUFFICIENT_EN = "Insufficient data to generate a recommendation."
INSUFFICIENT_AR = "لا توجد بيانات كافية لإعطاء توصية موثوقة."


def _role(rule: HornRule) -> str:
    if rule.action_group:
        return "decision"
    if rule.category == "alert" or rule.head.symbol.startswith("alert_"):
        return "alert"
    if rule.head.symbol.startswith("advise_"):
        return "advisory"
    return "intermediate"


def _vars_ar(variables: dict[str, Any]) -> dict[str, Any]:
    out = dict(variables)
    if "crop_name_ar" in out:
        out["crop_name"] = out["crop_name_ar"]
    return out


class ExplanationBuilder:
    def __init__(self, kb: KnowledgeSnapshot, percepts: PerceptSet, variables: dict[str, Any]) -> None:
        self.kb = kb
        self.percepts = percepts
        self.v_en = variables
        self.v_ar = _vars_ar(variables)
        self.rules = {r.code: r for r in kb.rules}

    # ---------------------------------------------------------------- helpers
    def text(self, rule: HornRule, field: str) -> tuple[str, str]:
        en = render(rule.meta.get(f"{field}_en"), self.v_en)
        ar = render(rule.meta.get(f"{field}_ar"), self.v_ar)
        return en, ar

    def describe_rule(self, rule: HornRule, fired: FiredRule | None = None) -> dict[str, Any]:
        expl_en, expl_ar = self.text(rule, "explanation")
        return {
            "code": rule.code, "name_en": rule.meta.get("name_en", rule.code),
            "name_ar": rule.meta.get("name_ar", rule.code), "antecedent": rule.antecedent_text(),
            "consequent": rule.head.atom, "priority": rule.priority, "action_group": rule.action_group,
            "category": rule.category, "role": _role(rule), "fired_order": fired.order if fired else None,
            "explanation_en": expl_en, "explanation_ar": expl_ar,
            "source": render(rule.meta.get("source"), self.v_en),
        }

    def derivation_path(self, decision: Decision, symbol: str) -> list[FiredRule]:
        """Fired rules that established ``symbol`` and, recursively, its derived premises."""
        by_conclusion: dict[str, FiredRule] = {}
        for fr in decision.result.fired:
            by_conclusion.setdefault(fr.conclusion, fr)
        path: list[FiredRule] = []
        seen: set[str] = set()

        def visit(atom: str) -> None:
            if atom in seen or atom not in by_conclusion:
                return
            seen.add(atom)
            fr = by_conclusion[atom]
            for prem in fr.premises:
                visit(prem)
            path.append(fr)

        visit(symbol)
        return path

    def blockers(self, literal: Literal, facts: dict[str, bool], depth: int = 0) -> list[dict[str, Any]]:
        """Why a literal does not hold: leaf percepts that are false or unknown."""
        state = literal.holds(facts)
        if state is True:
            return []
        if literal.symbol in self.kb.percept_symbols or depth > 3:
            percept = self.percepts.get(literal.symbol)
            known = percept is not None and percept.value is not None
            desc = self.kb.percepts.get(literal.symbol, {})
            return [{
                "literal": literal.atom, "state": "false" if known else "unknown",
                "description_en": desc.get("description_en", literal.symbol),
                "description_ar": desc.get("description_ar", literal.symbol),
                "flip_en": percept.flip_en if percept else None,
                "flip_ar": percept.flip_ar if percept else None,
                "reason": None if known else (percept.evidence.get("reason") if percept else "not perceived"),
            }]
        # derived symbol: explain through the rule that came closest to firing
        candidates = [r for r in self.kb.rules if r.head.symbol == literal.symbol]
        best: list[dict[str, Any]] | None = None
        for r in candidates:
            leaves: list[dict[str, Any]] = []
            for b in r.body:
                leaves.extend(self.blockers(b, facts, depth + 1))
            if best is None or len(leaves) < len(best):
                best = leaves
        return best or [{"literal": literal.atom, "state": "not_derived",
                         "description_en": literal.symbol, "description_ar": literal.symbol,
                         "flip_en": None, "flip_ar": None, "reason": "no rule concludes it"}]

    # ---------------------------------------------------------------- main
    def build(self, decision: Decision, *, focus_group: str | None = None,
              primary_symbols: list[str] | None = None, goals: list[str] | None = None,
              amounts: dict[str, float | None] | None = None, calculation: dict[str, Any] | None = None,
              data_quality: str = "fresh") -> dict[str, Any]:
        facts = decision.result.facts
        fired_by_code = {fr.code: fr for fr in decision.result.fired}
        amounts = amounts or {}

        # 1. primary recommendation
        winner: HornRule | None = None
        if focus_group and focus_group in decision.winners:
            winner = decision.winners[focus_group]
        elif primary_symbols:
            for sym in primary_symbols:
                if facts.get(sym) is True:
                    winner = next((self.rules[fr.code] for fr in decision.result.fired
                                   if fr.conclusion == sym), None)
                    if winner:
                        break

        triggered = [self.describe_rule(self.rules[fr.code], fr) for fr in decision.result.fired]
        supporting: list[dict[str, Any]] = []
        used_atoms = {p for fr in decision.result.fired for p in fr.premises}
        for p in self.percepts.all():
            if p.value is None:
                continue
            atom = p.symbol if p.value else f"~{p.symbol}"
            desc = self.kb.percepts.get(p.symbol, {})
            supporting.append({"symbol": p.symbol, "value": p.value, "used": atom in used_atoms,
                               "derived": False, "evidence": p.evidence,
                               "description_en": desc.get("description_en", p.symbol),
                               "description_ar": desc.get("description_ar", p.symbol)})
        for sym in decision.result.derived:
            supporting.append({"symbol": sym, "value": True, "used": sym in used_atoms, "derived": True,
                               "evidence": {"derived_by": next((fr.code for fr in decision.result.fired
                                                                if fr.conclusion == sym), None)},
                               "description_en": sym.replace("_", " "),
                               "description_ar": sym.replace("_", " ")})
        supporting.sort(key=lambda s: (not s["used"], s["derived"], s["symbol"]))

        advisories, alerts = [], []
        for fr in decision.result.fired:
            rule = self.rules[fr.code]
            role = _role(rule)
            if role == "advisory" and rule is not winner:
                ren, rar = self.text(rule, "recommendation")
                advisories.append({"code": rule.code, "symbol": rule.head.symbol, "text_en": ren,
                                   "text_ar": rar, "name_en": rule.meta.get("name_en"),
                                   "name_ar": rule.meta.get("name_ar")})
            elif role == "alert":
                een, ear = self.text(rule, "explanation")
                alerts.append({"code": rule.code, "symbol": rule.head.symbol,
                               "severity": rule.meta.get("severity") or "info",
                               "title_en": rule.meta.get("name_en"), "title_ar": rule.meta.get("name_ar"),
                               "message_en": een, "message_ar": ear})

        # 2. alternatives & what could change
        alternatives: list[dict[str, Any]] = []
        could_change: list[dict[str, Any]] = []
        group_rules = [r for r in self.kb.rules if focus_group and r.action_group == focus_group]
        for rule in group_rules:
            if winner is not None and rule.code == winner.code:
                continue
            name_en, name_ar = rule.meta.get("name_en", rule.code), rule.meta.get("name_ar", rule.code)
            if rule in decision.overridden.get(focus_group or "", []):
                assert winner is not None
                why = explain_win(winner, rule)
                alternatives.append({"rule": rule.code, "action": rule.head.symbol, "name_en": name_en,
                                     "name_ar": name_ar, "status": "overridden", "blocking": [],
                                     "reason_en": f"Its conditions held, but {winner.code} won ({why}).",
                                     "reason_ar": f"تحققت شروطها لكن القاعدة {winner.code} فازت ({why})."})
                continue
            leaves: list[dict[str, Any]] = []
            for lit in rule.body:
                leaves.extend(self.blockers(lit, facts))
            # de-duplicate
            uniq: dict[str, dict[str, Any]] = {b["literal"]: b for b in leaves}
            leaves = list(uniq.values())
            reasons_en = [f"{b['literal']} is {b['state']}" for b in leaves]
            alternatives.append({"rule": rule.code, "action": rule.head.symbol, "name_en": name_en,
                                 "name_ar": name_ar, "status": "not_fired", "blocking": leaves,
                                 "reason_en": "Not applicable: " + "; ".join(reasons_en),
                                 "reason_ar": "غير منطبقة: " + "؛ ".join(
                                     f"{b['literal']} {'غير متحقق' if b['state'] == 'false' else 'غير معروف'}"
                                     for b in leaves)})
            if leaves and all(b["state"] == "false" and b["flip_en"] for b in leaves):
                could_change.append({
                    "rule": rule.code, "action": rule.head.symbol,
                    "condition_en": " and ".join(b["flip_en"] for b in leaves),
                    "condition_ar": " و ".join(b["flip_ar"] or b["flip_en"] for b in leaves),
                    "effect_en": f"→ {name_en} ({rule.code})", "effect_ar": f"← {name_ar} ({rule.code})"})

        # 3. missing data via backward chaining on the decision goals
        missing: list[dict[str, Any]] = []
        bc_results = []
        if goals:
            chainer = BackwardChainer(self.kb.rules, self.kb.percept_symbols)
            known = {k: v for k, v in facts.items() if k in self.kb.percept_symbols}
            for g in goals:
                bc_results.append(chainer.ask(Literal(g), known))
        if winner is None:
            seen_fields: set[str] = set()
            symbols = []
            for res in bc_results:
                for s in res.missing_percepts:
                    if s not in symbols:
                        symbols.append(s)
            for s in symbols:
                desc = self.kb.percepts.get(s, {})
                perc = self.percepts.get(s)
                fields: list[str] = list(perc.evidence.get("missing_fields") or []
                                         if perc and "missing_fields" in perc.evidence
                                         else desc.get("depends_on", []))
                missing.append({
                    "symbol": s, "fields": fields,
                    "hints": [MISSING_FIELD_HINTS.get(f, {"en": f, "ar": f}) for f in fields
                              if f not in seen_fields],
                    "reason": perc.evidence.get("reason") if perc else "not perceived"})
                seen_fields.update(fields)

        # 4. recommendation + reason
        if winner is not None:
            path = self.derivation_path(decision, winner.head.symbol)
            reason_en = " ".join(self.text(self.rules[fr.code], "explanation")[0] for fr in path)
            reason_ar = " ".join(self.text(self.rules[fr.code], "explanation")[1] for fr in path)
            rec_en, rec_ar = self.text(winner, "recommendation")
            recommendation = {
                "action": winner.head.symbol, "rule": winner.code,
                "title_en": winner.meta.get("name_en"), "title_ar": winner.meta.get("name_ar"),
                "text_en": rec_en, "text_ar": rec_ar, "amount_l": amounts.get(winner.head.symbol),
            }
            certainty = "entailed"
        else:
            reason_en, reason_ar = INSUFFICIENT_EN, INSUFFICIENT_AR
            recommendation = None
            certainty = "insufficient_data"

        conflict_info = [{"group": g, "winner": w.code,
                          "candidates": [r.code for r in decision.conflict_sets.get(g, [])],
                          "overridden": [r.code for r in decision.overridden.get(g, [])]}
                         for g, w in decision.winners.items()]
        return {
            "recommendation": recommendation,
            "reason_en": reason_en, "reason_ar": reason_ar,
            "supporting_facts": supporting,
            "triggered_rules": triggered,
            "advisories": advisories,
            "alerts": alerts,
            "alternatives": alternatives,
            "what_could_change": could_change,
            "missing_data": missing,
            "calculation": calculation,
            "certainty": certainty,
            "data_quality": data_quality,
            "kb_version": self.kb.version,
            "trace": {
                "engine": "forward_chaining (PL-FC-ENTAILS, agenda) + conflict resolution",
                "agenda": decision.result.agenda_trace,
                "fired": [{"order": fr.order, "code": fr.code, "premises": fr.premises,
                           "conclusion": fr.conclusion} for fr in decision.result.fired],
                "conflict_resolution": conflict_info,
                "blocked": sorted(decision.result.blocked),
                "backward_chaining": [{"goal": r.goal, "status": r.status, "missing": r.missing_percepts,
                                       "goals_expanded": r.goals_expanded, "proof": r.proof.to_dict()}
                                      for r in bc_results],
            },
            "percepts": self.percepts.to_list(),
            "fired_codes": list(fired_by_code),
        }
