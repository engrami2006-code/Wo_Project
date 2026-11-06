"""Loads the active knowledge base from the database into an immutable in-memory snapshot."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.logic.syntax import Sentence, parse
from app.ai.rules.rule import HornRule, build_rule
from app.models import KnowledgeBase, KnowledgeFact, KnowledgeRule, PerceptDefinition
from app.models.base import FactKind


@dataclass
class KnowledgeSnapshot:
    kb_id: Any
    version: int
    rules: list[HornRule]
    params: dict[str, Any]
    axioms: dict[str, Sentence]
    percepts: dict[str, dict[str, Any]]
    param_meta: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def percept_symbols(self) -> set[str]:
        return set(self.percepts)

    def rules_in(self, *categories: str) -> list[HornRule]:
        return [r for r in self.rules if r.category in categories]

    def rule(self, code: str) -> HornRule | None:
        return next((r for r in self.rules if r.code == code), None)

    def param(self, key: str) -> Any:
        if key not in self.params:
            raise KeyError(f"Knowledge-base parameter '{key}' is not defined")
        return self.params[key]


def rule_from_row(row: KnowledgeRule) -> HornRule:
    meta = {
        "name_en": row.name_en, "name_ar": row.name_ar,
        "recommendation_en": row.recommendation_en, "recommendation_ar": row.recommendation_ar,
        "explanation_en": row.explanation_en, "explanation_ar": row.explanation_ar,
        "severity": row.severity, "source": row.source, "version": row.version, "id": str(row.id),
    }
    return build_rule(row.code, row.antecedent, row.consequent, priority=row.priority,
                      action_group=row.action_group, category=row.category, meta=meta)


def load_knowledge(db: Session) -> KnowledgeSnapshot:
    kb = db.scalar(select(KnowledgeBase).where(KnowledgeBase.is_active.is_(True))
                   .order_by(KnowledgeBase.created_at))
    if kb is None:
        raise RuntimeError("No active knowledge base. Run `alembic upgrade head` to load it.")
    rows = db.scalars(select(KnowledgeRule).where(KnowledgeRule.kb_id == kb.id,
                                                  KnowledgeRule.is_active.is_(True))
                      .order_by(KnowledgeRule.code)).all()
    rules = [rule_from_row(r) for r in rows]
    facts = db.scalars(select(KnowledgeFact).where(KnowledgeFact.kb_id == kb.id,
                                                   KnowledgeFact.is_active.is_(True))).all()
    params: dict[str, Any] = {}
    axioms: dict[str, Sentence] = {}
    meta: dict[str, dict[str, Any]] = {}
    for f in facts:
        if f.kind == FactKind.AXIOM:
            axioms[f.key] = parse(str(f.value))
        else:
            params[f.key] = f.value
            meta[f.key] = {"kind": f.kind.value, "unit": f.unit, "source": f.source,
                           "description_en": f.description_en, "description_ar": f.description_ar}
    percepts = {
        p.symbol: {"category": p.category, "description_en": p.description_en,
                   "description_ar": p.description_ar, "depends_on": list(p.depends_on),
                   "threshold_key": p.threshold_key}
        for p in db.scalars(select(PerceptDefinition).where(PerceptDefinition.kb_id == kb.id))
    }
    return KnowledgeSnapshot(kb_id=kb.id, version=kb.version, rules=rules, params=params,
                             axioms=axioms, percepts=percepts, param_meta=meta)
