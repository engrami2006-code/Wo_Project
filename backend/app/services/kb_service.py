"""Knowledge-base management (super admin) and the Logic Lab (ASK with several engines)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.inference.backward import BackwardChainer
from app.ai.inference.forward import forward_chain
from app.ai.knowledge_base.loader import load_knowledge
from app.ai.knowledge_base.validation import validate_rules
from app.ai.logic.cnf import clause_str, to_cnf_clauses
from app.ai.logic.dpll import dpll_entails, pl_resolution
from app.ai.logic.model_checking import MAX_SYMBOLS, ModelCheckingLimitError, tt_entails
from app.ai.logic.syntax import Not, ParseError, Sentence, Symbol, parse
from app.ai.rules.rule import HornRule, Literal, RuleSyntaxError, build_rule
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.models import KnowledgeFact, KnowledgeRule, KnowledgeRuleHistory, PerceptDefinition, User
from app.models.base import FactKind, Role
from app.schemas.ai import RuleIn, RuleUpdate
from app.services.access import ensure_role
from app.services.audit import audit

RULE_FIELDS = ["code", "name_en", "name_ar", "category", "antecedent", "consequent", "action_group", "priority",
               "severity", "recommendation_en", "recommendation_ar", "explanation_en", "explanation_ar",
               "source", "is_active"]


def _snapshot(rule: KnowledgeRule) -> dict[str, Any]:
    return {f: getattr(rule, f) for f in RULE_FIELDS}


def list_facts(db: Session, kind: str | None = None) -> list[KnowledgeFact]:
    kb = load_knowledge(db)
    q = select(KnowledgeFact).where(KnowledgeFact.kb_id == kb.kb_id)
    if kind:
        q = q.where(KnowledgeFact.kind == FactKind(kind))
    return list(db.scalars(q.order_by(KnowledgeFact.kind, KnowledgeFact.key)))


def list_rules(db: Session, category: str | None = None, include_inactive: bool = True) -> list[KnowledgeRule]:
    kb = load_knowledge(db)
    q = select(KnowledgeRule).where(KnowledgeRule.kb_id == kb.kb_id)
    if category:
        q = q.where(KnowledgeRule.category == category)
    if not include_inactive:
        q = q.where(KnowledgeRule.is_active.is_(True))
    return list(db.scalars(q.order_by(KnowledgeRule.code)))


def list_percepts(db: Session) -> list[PerceptDefinition]:
    return list(db.scalars(select(PerceptDefinition).order_by(PerceptDefinition.category, PerceptDefinition.symbol)))


def _validate_candidate(db: Session, candidate: HornRule | None, replace_code: str | None = None,
                        remove_code: str | None = None) -> dict[str, Any]:
    kb = load_knowledge(db)
    rules = [r for r in kb.rules if r.code not in {replace_code, remove_code}]
    if candidate is not None:
        rules.append(candidate)
    report = validate_rules(rules, kb.axioms, kb.percept_symbols)
    return {"ok": report.ok, "consistent": report.consistent, "stats": report.stats,
            "issues": [{"severity": i.severity, "code": i.code, "message": i.message, "rules": i.rules,
                        "model": i.model} for i in report.issues]}


def validate(db: Session, candidate: RuleIn | None = None) -> dict[str, Any]:
    horn = None
    if candidate is not None:
        try:
            horn = build_rule(candidate.code, candidate.antecedent, candidate.consequent,
                              priority=candidate.priority, action_group=candidate.action_group,
                              category=candidate.category)
        except RuleSyntaxError as exc:
            raise ValidationAppError(str(exc)) from exc
    return _validate_candidate(db, horn, replace_code=candidate.code if candidate else None)


def create_rule(db: Session, user: User, data: RuleIn, ip: str | None) -> KnowledgeRule:
    ensure_role(user, {Role.SUPER_ADMIN}, "edit the knowledge base")
    kb = load_knowledge(db)
    if db.scalar(select(KnowledgeRule).where(KnowledgeRule.kb_id == kb.kb_id, KnowledgeRule.code == data.code)):
        raise ConflictError(f"Rule {data.code} already exists.")
    try:
        horn = build_rule(data.code, data.antecedent, data.consequent, priority=data.priority,
                          action_group=data.action_group, category=data.category)
    except RuleSyntaxError as exc:
        raise ValidationAppError(str(exc)) from exc
    report = _validate_candidate(db, horn if data.is_active else None)
    if not report["ok"]:
        raise ValidationAppError("The rule makes the knowledge base invalid.", details=report)
    rule = KnowledgeRule(kb_id=kb.kb_id, **data.model_dump(), updated_by_id=user.id)
    db.add(rule)
    db.flush()
    db.add(KnowledgeRuleHistory(rule_id=rule.id, rule_code=rule.code, version=1, change_type="create",
                                snapshot=_snapshot(rule), changed_by_id=user.id))
    audit(db, user, "kb.rule_create", "knowledge_rule", rule.id, {"code": rule.code}, ip)
    db.commit()
    db.refresh(rule)
    return rule


def get_rule(db: Session, rule_id: uuid.UUID) -> KnowledgeRule:
    rule = db.get(KnowledgeRule, rule_id)
    if rule is None:
        raise NotFoundError("Rule not found.")
    return rule


def update_rule(db: Session, user: User, rule_id: uuid.UUID, data: RuleUpdate, ip: str | None) -> KnowledgeRule:
    ensure_role(user, {Role.SUPER_ADMIN}, "edit the knowledge base")
    rule = get_rule(db, rule_id)
    changes = data.model_dump(exclude_unset=True)
    merged = {**_snapshot(rule), **changes}
    try:
        horn = build_rule(merged["code"], merged["antecedent"], merged["consequent"], priority=merged["priority"],
                          action_group=merged["action_group"], category=merged["category"])
    except RuleSyntaxError as exc:
        raise ValidationAppError(str(exc)) from exc
    report = _validate_candidate(db, horn if merged["is_active"] else None, replace_code=rule.code)
    if not report["ok"]:
        raise ValidationAppError("The change makes the knowledge base invalid.", details=report)
    for k, v in changes.items():
        setattr(rule, k, v)
    rule.version += 1
    rule.updated_by_id = user.id
    change_type = "update" if "is_active" not in changes else ("activate" if changes["is_active"] else "deactivate")
    db.add(KnowledgeRuleHistory(rule_id=rule.id, rule_code=rule.code, version=rule.version, change_type=change_type,
                                snapshot=_snapshot(rule), changed_by_id=user.id))
    audit(db, user, "kb.rule_update", "knowledge_rule", rule.id, {"code": rule.code, "fields": sorted(changes)}, ip)
    db.commit()
    db.refresh(rule)
    return rule


def rule_history(db: Session, rule_id: uuid.UUID) -> list[KnowledgeRuleHistory]:
    get_rule(db, rule_id)
    return list(db.scalars(select(KnowledgeRuleHistory).where(KnowledgeRuleHistory.rule_id == rule_id)
                           .order_by(KnowledgeRuleHistory.version)))


def update_fact(db: Session, user: User, fact_id: uuid.UUID, value: Any, source: str | None,
                ip: str | None) -> KnowledgeFact:
    ensure_role(user, {Role.SUPER_ADMIN}, "edit the knowledge base")
    fact = db.get(KnowledgeFact, fact_id)
    if fact is None:
        raise NotFoundError("Fact not found.")
    if fact.kind == FactKind.AXIOM:
        try:
            parse(str(value))
        except ParseError as exc:
            raise ValidationAppError(f"Axiom: {exc}") from exc
    else:
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValidationAppError("Parameter values must be numeric.")
        if value < 0:
            raise ValidationAppError("Parameter values cannot be negative.")
    if fact.kind == FactKind.SCIENTIFIC and not (source or fact.source):
        raise ValidationAppError("Scientific parameters must cite a source.")
    old = fact.value
    fact.value = value
    if source:
        fact.source = source
    fact.version += 1
    fact.updated_by_id = user.id
    if fact.kind == FactKind.AXIOM:
        db.flush()
        report = _validate_candidate(db, None)
        if not report["consistent"]:
            db.rollback()
            raise ValidationAppError("The axiom makes the knowledge base inconsistent.", details=report)
    audit(db, user, "kb.fact_update", "knowledge_fact", fact.id, {"key": fact.key, "old": old, "new": value}, ip)
    db.commit()
    db.refresh(fact)
    return fact


# ----------------------------------------------------------------------------- Logic Lab

def _relevant(rules: list[HornRule], symbols: set[str]) -> tuple[list[HornRule], set[str]]:
    closure = set(symbols)
    changed = True
    while changed:
        changed = False
        for r in rules:
            if r.head.symbol in closure:
                for lit in r.body:
                    if lit.symbol not in closure:
                        closure.add(lit.symbol)
                        changed = True
    return [r for r in rules if r.head.symbol in closure], closure


def ask(db: Session, facts: dict[str, bool], query: str, categories: list[str],
        include_axioms: bool) -> dict[str, Any]:
    kb = load_knowledge(db)
    unknown = sorted(set(facts) - kb.percept_symbols)
    if unknown:
        raise ValidationAppError(f"Unknown percept symbols: {', '.join(unknown)}")
    try:
        alpha = parse(query)
    except ParseError as exc:
        raise ValidationAppError(f"Query: {exc}") from exc
    rules = kb.rules_in(*categories)
    out: dict[str, Any] = {"query": str(alpha), "query_ascii": alpha.to_ascii(),
                           "query_cnf": [clause_str(c) for c in to_cnf_clauses(alpha)],
                           "tell": facts}

    # Forward chaining (complete for atomic queries over Horn KBs)
    fc = forward_chain(rules, facts)
    atomic = isinstance(alpha, Symbol) or (isinstance(alpha, Not) and isinstance(alpha.arg, Symbol))
    fc_answer = None
    if atomic:
        lit = Literal(alpha.name, True) if isinstance(alpha, Symbol) else Literal(alpha.arg.name, False)  # type: ignore[attr-defined]
        fc_answer = lit.holds(fc.facts) is True
    out["forward_chaining"] = {"entailed": fc_answer, "applicable": atomic,
                               "derived": fc.derived, "agenda": fc.agenda_trace,
                               "fired": [fr.__dict__ for fr in fc.fired]}
    # Backward chaining (atomic positive query)
    if isinstance(alpha, Symbol):
        bc = BackwardChainer(rules, kb.percept_symbols).ask(Literal(alpha.name), facts)
        out["backward_chaining"] = {"status": bc.status, "missing": bc.missing_percepts,
                                    "goals_expanded": bc.goals_expanded, "proof": bc.proof.to_dict()}
    else:
        out["backward_chaining"] = {"status": "not_applicable",
                                    "note": "Backward chaining answers a single positive goal symbol."}

    # Model checking on the relevant sub-KB
    rel_rules, closure = _relevant(rules, alpha.symbols())
    sentences: list[Sentence] = [r.to_sentence() for r in rel_rules]
    sentences += [Symbol(k) if v else Not(Symbol(k)) for k, v in sorted(facts.items()) if k in closure]
    if include_axioms:
        sentences += [a for a in kb.axioms.values() if a.symbols() <= closure]
    try:
        tt = tt_entails(sentences, alpha)
        out["model_checking"] = {"entailed": tt.entailed, "symbols": tt.symbols, "models_checked": tt.models_checked,
                                 "kb_models": tt.kb_models, "counterexample": tt.counterexample}
    except ModelCheckingLimitError as exc:
        out["model_checking"] = {"entailed": None, "error": str(exc), "limit": MAX_SYMBOLS}
    entailed, sat = dpll_entails(sentences, alpha)
    out["dpll"] = {"entailed": entailed, "calls": sat.stats.calls, "unit_propagations": sat.stats.unit_propagations,
                   "pure_assignments": sat.stats.pure_assignments, "clauses": sat.clauses,
                   "counter_model": None if entailed else {k: v for k, v in (sat.model or {}).items() if v}}
    if len(sentences) <= 40:
        res = pl_resolution(sentences, alpha, max_clauses=1500)
        out["resolution"] = {"entailed": res.entailed if not res.limit_reached else None,
                             "steps": res.steps[:25], "clauses_generated": res.clauses_generated,
                             "limit_reached": res.limit_reached}
    out["relevant_rules"] = [r.code for r in rel_rules]
    answers = [v for v in (fc_answer, out["model_checking"].get("entailed"), entailed) if v is not None]
    out["agreement"] = len(set(answers)) <= 1
    out["note"] = ("Forward chaining treats '~x' as a separate known-false atom (Horn semantics). Model checking "
                   "uses classical semantics, so it can also prove conclusions by case analysis.")
    return out
