"""DPLL satisfiability (Russell & Norvig Fig. 7.17) and PL-Resolution (Fig. 7.12).

DPLL improves on truth-table enumeration with early termination, the pure-symbol heuristic
and the unit-clause heuristic. It is used to validate the knowledge base whenever rules change.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from app.ai.logic.cnf import Clause, clause_str, clauses_for
from app.ai.logic.syntax import Not, Sentence


@dataclass
class DPLLStats:
    calls: int = 0
    unit_propagations: int = 0
    pure_assignments: int = 0
    branches: int = 0


@dataclass
class SatResult:
    satisfiable: bool
    model: dict[str, bool] | None
    stats: DPLLStats
    clauses: int
    symbols: int


def _clause_value(clause: Clause, model: dict[str, bool]) -> bool | None:
    unknown = False
    for sym, pol in clause:
        if sym in model:
            if model[sym] == pol:
                return True
        else:
            unknown = True
    return None if unknown else False


def _find_pure_symbol(symbols: Sequence[str], clauses: Iterable[Clause],
                      model: dict[str, bool]) -> tuple[str, bool] | None:
    pos: set[str] = set()
    neg: set[str] = set()
    for clause in clauses:
        if _clause_value(clause, model) is True:
            continue
        for sym, pol in clause:
            if sym in model:
                continue
            (pos if pol else neg).add(sym)
    for sym in symbols:
        if sym in pos and sym not in neg:
            return sym, True
        if sym in neg and sym not in pos:
            return sym, False
    return None


def _find_unit_clause(clauses: Iterable[Clause], model: dict[str, bool]) -> tuple[str, bool] | None:
    for clause in clauses:
        unassigned: list[tuple[str, bool]] = []
        satisfied = False
        for sym, pol in clause:
            if sym in model:
                if model[sym] == pol:
                    satisfied = True
                    break
            else:
                unassigned.append((sym, pol))
        if not satisfied and len(unassigned) == 1:
            return unassigned[0]
    return None


def dpll_clauses(clauses: list[Clause]) -> SatResult:
    symbols = sorted({sym for c in clauses for sym, _ in c})
    stats = DPLLStats()

    def dpll(syms: list[str], model: dict[str, bool]) -> dict[str, bool] | None:
        stats.calls += 1
        all_true = True
        for clause in clauses:
            v = _clause_value(clause, model)
            if v is False:
                return None
            if v is None:
                all_true = False
        if all_true:
            return dict(model)
        pure = _find_pure_symbol(syms, clauses, model)
        if pure:
            sym, val = pure
            stats.pure_assignments += 1
            return dpll([s for s in syms if s != sym], {**model, sym: val})
        unit = _find_unit_clause(clauses, model)
        if unit:
            sym, val = unit
            stats.unit_propagations += 1
            return dpll([s for s in syms if s != sym], {**model, sym: val})
        if not syms:
            return None
        p, rest = syms[0], syms[1:]
        stats.branches += 1
        return dpll(rest, {**model, p: True}) or dpll(rest, {**model, p: False})

    if any(len(c) == 0 for c in clauses):
        return SatResult(False, None, stats, len(clauses), len(symbols))
    model = dpll(list(symbols), {})
    if model is not None:
        for s in symbols:  # complete the model for display
            model.setdefault(s, False)
    return SatResult(model is not None, model, stats, len(clauses), len(symbols))


def dpll_satisfiable(sentences: Sequence[Sentence]) -> SatResult:
    return dpll_clauses(clauses_for(sentences))


def dpll_entails(kb: Sequence[Sentence], alpha: Sentence) -> tuple[bool, SatResult]:
    """KB ⊨ α  iff  KB ∧ ¬α is unsatisfiable (proof by contradiction)."""
    result = dpll_satisfiable([*kb, Not(alpha)])
    return (not result.satisfiable), result


# --------------------------------------------------------------------------- resolution

@dataclass
class ResolutionResult:
    entailed: bool
    steps: list[dict[str, str]] = field(default_factory=list)
    clauses_generated: int = 0
    limit_reached: bool = False


def _resolve(ci: Clause, cj: Clause) -> list[Clause]:
    out = []
    for sym, pol in ci:
        if (sym, not pol) in cj:
            resolvent = (ci - {(sym, pol)}) | (cj - {(sym, not pol)})
            out.append(frozenset(resolvent))
    return out


def pl_resolution(kb: Sequence[Sentence], alpha: Sentence, *, max_clauses: int = 4000) -> ResolutionResult:
    """PL-RESOLUTION: refute KB ∧ ¬α by deriving the empty clause."""
    from app.ai.logic.cnf import is_tautology

    clauses: set[Clause] = set(clauses_for([*kb, Not(alpha)]))
    result = ResolutionResult(entailed=False)
    new: set[Clause] = set()
    while True:
        items = list(clauses)
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                for r in _resolve(items[i], items[j]):
                    if is_tautology(r):
                        continue
                    if r not in clauses and r not in new and len(result.steps) < 60:
                        result.steps.append({"from": f"{clause_str(items[i])}  ,  {clause_str(items[j])}",
                                             "resolvent": clause_str(r)})
                    if not r:
                        result.entailed = True
                        result.clauses_generated = len(clauses) + len(new)
                        return result
                    new.add(r)
                    if len(clauses) + len(new) > max_clauses:
                        result.limit_reached = True
                        result.clauses_generated = len(clauses) + len(new)
                        return result
        if new.issubset(clauses):
            result.clauses_generated = len(clauses)
            return result
        clauses |= new
