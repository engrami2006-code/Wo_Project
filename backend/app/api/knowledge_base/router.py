from __future__ import annotations

import uuid
from collections import Counter
from typing import Any

from fastapi import APIRouter, Request, status

from app.ai.knowledge_base.loader import load_knowledge
from app.core.deps import DB, CurrentUser, client_ip
from app.schemas.ai import (
    FactOut,
    FactUpdate,
    LogicAskRequest,
    PerceptOut,
    RuleHistoryOut,
    RuleIn,
    RuleOut,
    RuleUpdate,
    ValidationRequest,
)
from app.schemas.common import ERROR_RESPONSES
from app.services import kb_service

router = APIRouter(prefix="/knowledge-base", tags=["Knowledge base & logic"], responses=ERROR_RESPONSES)


@router.get("", response_model=dict[str, Any], summary="Knowledge-base overview")
def overview(user: CurrentUser, db: DB) -> dict[str, Any]:
    kb = load_knowledge(db)
    rules = kb_service.list_rules(db)
    facts = kb_service.list_facts(db)
    return {"kb_id": str(kb.kb_id), "version": kb.version, "rules_total": len(rules),
            "rules_active": sum(1 for r in rules if r.is_active),
            "rules_by_category": dict(Counter(r.category for r in rules)),
            "facts_by_kind": dict(Counter(f.kind.value for f in facts)),
            "percepts": len(kb.percepts), "action_groups": sorted({r.action_group for r in rules if r.action_group}),
            "pipeline": ["User question / system event", "Query handler", "Context builder", "Real farm data",
                         "Perception (numbers → percepts)", "Knowledge base (facts + rules)",
                         "Inference engine (forward / backward chaining)", "Conflict resolution",
                         "Recommendation", "Explanation"]}


@router.get("/facts", response_model=list[FactOut], summary="Facts: scientific parameters, policy thresholds, axioms")
def facts(user: CurrentUser, db: DB, kind: str | None = None) -> list[FactOut]:
    return [FactOut.model_validate(f) for f in kb_service.list_facts(db, kind)]


@router.patch("/facts/{fact_id}", response_model=FactOut, summary="Edit a parameter or axiom (super admin)")
def update_fact(fact_id: uuid.UUID, data: FactUpdate, user: CurrentUser, db: DB, request: Request) -> FactOut:
    return FactOut.model_validate(kb_service.update_fact(db, user, fact_id, data.value, data.source, client_ip(request)))


@router.get("/rules", response_model=list[RuleOut], summary="Rules (Horn clauses)")
def rules(user: CurrentUser, db: DB, category: str | None = None) -> list[RuleOut]:
    return [RuleOut.model_validate(r) for r in kb_service.list_rules(db, category)]


@router.post("/rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED,
             summary="Add a rule (validated by DPLL model checking before saving)")
def create_rule(data: RuleIn, user: CurrentUser, db: DB, request: Request) -> RuleOut:
    return RuleOut.model_validate(kb_service.create_rule(db, user, data, client_ip(request)))


@router.get("/rules/{rule_id}", response_model=RuleOut, summary="Get a rule")
def get_rule(rule_id: uuid.UUID, user: CurrentUser, db: DB) -> RuleOut:
    return RuleOut.model_validate(kb_service.get_rule(db, rule_id))


@router.patch("/rules/{rule_id}", response_model=RuleOut, summary="Edit / (de)activate a rule (versioned, audited)")
def update_rule(rule_id: uuid.UUID, data: RuleUpdate, user: CurrentUser, db: DB, request: Request) -> RuleOut:
    return RuleOut.model_validate(kb_service.update_rule(db, user, rule_id, data, client_ip(request)))


@router.get("/rules/{rule_id}/history", response_model=list[RuleHistoryOut], summary="Version history of a rule")
def history(rule_id: uuid.UUID, user: CurrentUser, db: DB) -> list[RuleHistoryOut]:
    return [RuleHistoryOut.model_validate(h) for h in kb_service.rule_history(db, rule_id)]


@router.get("/percepts", response_model=list[PerceptOut], summary="Percept catalog (how numbers become symbols)")
def percepts(user: CurrentUser, db: DB) -> list[PerceptOut]:
    return [PerceptOut.model_validate(p) for p in kb_service.list_percepts(db)]


@router.post("/validate", response_model=dict[str, Any],
             summary="Model-check the KB: consistency, dead rules, conflicts, coverage, redundancy")
def validate(data: ValidationRequest, user: CurrentUser, db: DB) -> dict[str, Any]:
    return kb_service.validate(db, data.candidate)


@router.post("/ask", response_model=dict[str, Any],
             summary="Logic Lab: TELL facts, ASK a sentence with FC, BC, TT-ENTAILS, DPLL and resolution")
def ask(data: LogicAskRequest, user: CurrentUser, db: DB) -> dict[str, Any]:
    return kb_service.ask(db, data.facts, data.query, data.categories, data.include_axioms)
