"""Idempotent loader of reference knowledge. Called by Alembic data migration 0002 and by tests."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.knowledge_base import reference_data as ref
from app.models import (
    Crop,
    HydroponicProfile,
    IrrigationMethod,
    KnowledgeBase,
    KnowledgeFact,
    KnowledgeRule,
    KnowledgeRuleHistory,
    PerceptDefinition,
)
from app.models.base import FactKind


def seed_reference_knowledge(db: Session) -> KnowledgeBase:
    kb = db.scalar(select(KnowledgeBase).where(KnowledgeBase.name == ref.KB_NAME))
    if kb is None:
        kb = KnowledgeBase(name=ref.KB_NAME, version=1, is_active=True,
                           description="Rules, axioms, parameters and percept catalog of the WO "
                                       "knowledge-based agent.")
        db.add(kb)
        db.flush()

    existing_facts = set(db.scalars(select(KnowledgeFact.key).where(KnowledgeFact.kb_id == kb.id)))
    for row in [*ref.FACTS, *ref.axioms()]:
        if row["key"] not in existing_facts:
            db.add(KnowledgeFact(kb_id=kb.id, key=row["key"], value=row["value"], unit=row["unit"],
                                 kind=FactKind(row["kind"]), category=row["category"],
                                 description_en=row["description_en"],
                                 description_ar=row["description_ar"], source=row["source"]))

    existing_rules = set(db.scalars(select(KnowledgeRule.code).where(KnowledgeRule.kb_id == kb.id)))
    for row in ref.rule_rows():
        if row["code"] in existing_rules:
            continue
        rule = KnowledgeRule(kb_id=kb.id, **row)
        db.add(rule)
        db.flush()
        db.add(KnowledgeRuleHistory(rule_id=rule.id, rule_code=rule.code, version=1,
                                    change_type="create", snapshot=row))

    existing_percepts = set(db.scalars(select(PerceptDefinition.symbol)
                                       .where(PerceptDefinition.kb_id == kb.id)))
    for row in ref.percept_rows():
        if row["symbol"] not in existing_percepts:
            db.add(PerceptDefinition(kb_id=kb.id, **row))

    existing_crops = set(db.scalars(select(Crop.code).where(Crop.is_reference.is_(True))))
    for row in ref.crop_rows():
        if row["code"] not in existing_crops:
            db.add(Crop(**row))

    existing_methods = set(db.scalars(select(IrrigationMethod.code)))
    for row in ref.IRRIGATION_METHODS:
        if row["code"] not in existing_methods:
            db.add(IrrigationMethod(**row))

    existing_profiles = set(db.scalars(select(HydroponicProfile.code)))
    for row in ref.HYDRO_PROFILES:
        if row["code"] not in existing_profiles:
            db.add(HydroponicProfile(**row))

    db.flush()
    return kb
