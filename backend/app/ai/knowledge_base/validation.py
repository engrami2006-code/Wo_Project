"""Knowledge-base validation by model checking (DPLL satisfiability).

Checks run whenever a rule is created or edited:

1. **Syntax / vocabulary.** Negative literals only on percept symbols; no unknown symbols.
2. **Global consistency.** Domain axioms ∧ rule completion is satisfiable, and no integrity
   constraint over derived symbols (e.g. never irrigate and skip together) can be violated.
3. **Dead rules.** A rule whose body can never be true under the axioms.
4. **Conflicts.** Two rules of the same action group with *equal priority* whose bodies can be
   true together. Different priorities are reported as resolvable overlaps.
5. **Coverage.** For a decision group, is there a complete world where no action fires?
6. **Redundancy.** A rule subsumed by another rule with the same head and a subset body.

Derived symbols use **Clark's completion**: d ⇔ (body₁ ∨ body₂ ∨ …). Percept symbols are free,
subject only to the axioms. This captures exactly the worlds the inference engine can produce.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from app.ai.logic.dpll import dpll_satisfiable
from app.ai.logic.syntax import And, Iff, Not, Sentence, Symbol, conjoin, disjoin
from app.ai.rules.rule import HornRule

COMPLETE_GROUPS = {"irrigation_action"}


@dataclass
class ValidationIssue:
    severity: str  # error | warning | info
    code: str
    message: str
    rules: list[str] = field(default_factory=list)
    model: dict[str, bool] | None = None


@dataclass
class ValidationReport:
    consistent: bool
    issues: list[ValidationIssue]
    stats: dict[str, Any]

    @property
    def ok(self) -> bool:
        return self.consistent and not any(i.severity == "error" for i in self.issues)


def body_sentence(rule: HornRule) -> Sentence:
    return conjoin(lit.to_sentence() for lit in rule.body)


def completion(rules: Iterable[HornRule]) -> list[Sentence]:
    by_head: dict[str, list[HornRule]] = {}
    for r in rules:
        by_head.setdefault(r.head.symbol, []).append(r)
    return [Iff(Symbol(head), disjoin(body_sentence(r) for r in rs)) for head, rs in by_head.items()]


def _trim_model(model: dict[str, bool] | None, keep: set[str]) -> dict[str, bool] | None:
    if model is None:
        return None
    return {k: v for k, v in sorted(model.items()) if k in keep and v}


def validate_rules(rules: list[HornRule], axioms: dict[str, Sentence],
                   percept_symbols: set[str]) -> ValidationReport:
    issues: list[ValidationIssue] = []
    stats = {"rules": len(rules), "axioms": len(axioms), "sat_calls": 0, "dpll_calls": 0}
    heads = {r.head.symbol for r in rules}

    # 1. vocabulary
    for r in rules:
        for lit in r.body:
            if not lit.positive and lit.symbol not in percept_symbols:
                issues.append(ValidationIssue(
                    "error", "negation_on_derived",
                    f"{r.code}: '~{lit.symbol}' negates a derived symbol. Negation is only defined for "
                    f"percepts (observable facts).", [r.code]))
            if lit.symbol not in percept_symbols and lit.symbol not in heads:
                issues.append(ValidationIssue(
                    "error", "unknown_symbol",
                    f"{r.code}: '{lit.symbol}' is neither a percept nor concluded by any rule, so the "
                    f"rule can never fire.", [r.code]))
        if r.head.symbol in percept_symbols:
            issues.append(ValidationIssue(
                "error", "head_is_percept",
                f"{r.code}: rules must not conclude percept symbols ('{r.head.symbol}').", [r.code]))

    # Domain axioms constrain percepts only; integrity constraints mention derived symbols and are
    # checked separately (otherwise they would silently remove the very worlds that violate them).
    domain = {k: a for k, a in axioms.items() if a.symbols() <= percept_symbols}
    integrity = {k: a for k, a in axioms.items() if k not in domain}
    background = [*domain.values(), *completion(rules)]

    def sat(extra: list[Sentence]) -> tuple[bool, dict[str, bool] | None]:
        res = dpll_satisfiable([*background, *extra])
        stats["sat_calls"] += 1
        stats["dpll_calls"] += res.stats.calls
        return res.satisfiable, res.model

    # 2. global consistency
    consistent, _ = sat([])
    if not consistent:
        issues.append(ValidationIssue("error", "inconsistent_kb",
                                      "The axioms together with the rules are unsatisfiable."))
        return ValidationReport(False, issues, stats)

    # 2b. integrity constraints on derived symbols
    for key, constraint in integrity.items():
        ok, model = sat([Not(constraint)])
        if ok:
            issues.append(ValidationIssue(
                "error", "integrity_violation",
                f"Integrity constraint '{key}' ({constraint}) can be violated: some percept world derives both "
                f"sides.", [], _trim_model(model, percept_symbols | heads)))

    # 3. dead rules
    for r in rules:
        ok, _ = sat([body_sentence(r)])
        if not ok:
            issues.append(ValidationIssue("warning", "dead_rule",
                                          f"{r.code}: its conditions can never hold together under "
                                          f"the axioms.", [r.code]))

    # 4. conflicts inside action groups
    groups: dict[str, list[HornRule]] = {}
    for r in rules:
        if r.action_group:
            groups.setdefault(r.action_group, []).append(r)
    for group, members in groups.items():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                a, b = members[i], members[j]
                if a.head.symbol == b.head.symbol:
                    continue
                ok, model = sat([body_sentence(a), body_sentence(b)])
                if ok:
                    if a.priority == b.priority:
                        issues.append(ValidationIssue(
                            "error", "conflict",
                            f"{a.code} and {b.code} ({group}) can fire together with equal priority "
                            f"{a.priority}; the outcome would depend only on rule order.",
                            [a.code, b.code], _trim_model(model, percept_symbols)))
                    else:
                        issues.append(ValidationIssue(
                            "info", "overlap_resolved",
                            f"{a.code} and {b.code} ({group}) can fire together; conflict resolution "
                            f"picks the higher priority.", [a.code, b.code],
                            _trim_model(model, percept_symbols)))

    # 5. coverage of decision groups (complete-knowledge worlds)
    for group in COMPLETE_GROUPS & set(groups):
        none_fires = Not(disjoin(Symbol(r.head.symbol) for r in groups[group]))
        ok, model = sat([none_fires])
        if ok:
            issues.append(ValidationIssue(
                "warning", "coverage_gap",
                f"There is a complete world in which no '{group}' rule fires.",
                [r.code for r in groups[group]], _trim_model(model, percept_symbols)))
        else:
            issues.append(ValidationIssue(
                "info", "coverage_complete",
                f"Every complete world (all percepts known, axioms respected) yields exactly one "
                f"'{group}' decision path.", [r.code for r in groups[group]]))

    # 6. redundancy (subsumption)
    for a in rules:
        for b in rules:
            if a is b or a.head != b.head:
                continue
            if set(a.body) < set(b.body):
                issues.append(ValidationIssue(
                    "warning", "subsumed_rule",
                    f"{b.code} is subsumed by {a.code}: same conclusion with a superset of conditions.",
                    [a.code, b.code]))

    return ValidationReport(True, issues, stats)


def kb_as_sentences(rules: Iterable[HornRule], axioms: dict[str, Sentence]) -> list[Sentence]:
    return [*axioms.values(), *(r.to_sentence() for r in rules)]


def facts_as_sentences(facts: dict[str, bool]) -> list[Sentence]:
    return [Symbol(k) if v else Not(Symbol(k)) for k, v in sorted(facts.items())]


__all__ = ["ValidationIssue", "ValidationReport", "validate_rules", "completion",
           "kb_as_sentences", "facts_as_sentences", "And"]
