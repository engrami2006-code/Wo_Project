"""Conversion to Conjunctive Normal Form (Russell & Norvig §7.5.2).

1. Eliminate ⇔ :  α ⇔ β  ≡  (α ⇒ β) ∧ (β ⇒ α)
2. Eliminate ⇒ :  α ⇒ β  ≡  ¬α ∨ β
3. Move ¬ inwards (De Morgan, double negation)
4. Distribute ∨ over ∧

Clauses are represented as ``frozenset[Literal]`` where ``Literal = (symbol, polarity)``.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.ai.logic.syntax import (
    And,
    Constant,
    Iff,
    Implies,
    Not,
    Or,
    Sentence,
    Symbol,
    conjoin,
    disjoin,
)

Literal = tuple[str, bool]
Clause = frozenset[Literal]


def eliminate_iff_implies(s: Sentence) -> Sentence:
    if isinstance(s, (Symbol, Constant)):
        return s
    if isinstance(s, Not):
        return Not(eliminate_iff_implies(s.arg))
    if isinstance(s, And):
        return And(tuple(eliminate_iff_implies(a) for a in s.args))
    if isinstance(s, Or):
        return Or(tuple(eliminate_iff_implies(a) for a in s.args))
    if isinstance(s, Implies):
        return Or((Not(eliminate_iff_implies(s.left)), eliminate_iff_implies(s.right)))
    if isinstance(s, Iff):
        a, b = eliminate_iff_implies(s.left), eliminate_iff_implies(s.right)
        return And((Or((Not(a), b)), Or((Not(b), a))))
    raise TypeError(f"Unknown sentence type: {type(s).__name__}")


def move_not_inwards(s: Sentence) -> Sentence:
    if isinstance(s, Not):
        a = s.arg
        if isinstance(a, Symbol):
            return s
        if isinstance(a, Constant):
            return Constant(not a.value)
        if isinstance(a, Not):
            return move_not_inwards(a.arg)
        if isinstance(a, And):
            return Or(tuple(move_not_inwards(Not(x)) for x in a.args))
        if isinstance(a, Or):
            return And(tuple(move_not_inwards(Not(x)) for x in a.args))
        raise ValueError("Implications must be eliminated before moving negation inwards")
    if isinstance(s, And):
        return And(tuple(move_not_inwards(a) for a in s.args))
    if isinstance(s, Or):
        return Or(tuple(move_not_inwards(a) for a in s.args))
    return s


def _clauses_of(s: Sentence) -> list[Clause] | None:
    """Return clauses for an NNF sentence; ``None`` means the sentence is valid (True)."""
    if isinstance(s, Constant):
        return None if s.value else [frozenset()]
    if isinstance(s, Symbol):
        return [frozenset({(s.name, True)})]
    if isinstance(s, Not) and isinstance(s.arg, Symbol):
        return [frozenset({(s.arg.name, False)})]
    if isinstance(s, And):
        out: list[Clause] = []
        for a in s.args:
            sub = _clauses_of(a)
            if sub is None:
                continue
            out.extend(sub)
        return out
    if isinstance(s, Or):
        # Distribute: CNF(a ∨ b) = { ca ∪ cb : ca ∈ CNF(a), cb ∈ CNF(b) }
        acc: list[Clause] = [frozenset()]
        for a in s.args:
            sub = _clauses_of(a)
            if sub is None:
                return None
            acc = [c1 | c2 for c1 in acc for c2 in sub]
        return acc
    raise ValueError(f"Sentence is not in negation normal form: {s}")


def is_tautology(clause: Clause) -> bool:
    return any((sym, not pol) in clause for sym, pol in clause)


def to_cnf_clauses(s: Sentence) -> list[Clause]:
    nnf = move_not_inwards(eliminate_iff_implies(s))
    clauses = _clauses_of(nnf) or []
    unique: list[Clause] = []
    seen: set[Clause] = set()
    for c in clauses:
        if is_tautology(c) or c in seen:
            continue
        seen.add(c)
        unique.append(c)
    return unique


def clauses_for(sentences: Iterable[Sentence]) -> list[Clause]:
    out: list[Clause] = []
    seen: set[Clause] = set()
    for s in sentences:
        for c in to_cnf_clauses(s):
            if c not in seen:
                seen.add(c)
                out.append(c)
    return out


def clause_to_sentence(clause: Clause) -> Sentence:
    lits = [Symbol(n) if p else Not(Symbol(n)) for n, p in sorted(clause)]
    return disjoin(lits)


def cnf_to_sentence(clauses: Iterable[Clause]) -> Sentence:
    return conjoin(clause_to_sentence(c) for c in clauses)


def clause_str(clause: Clause) -> str:
    if not clause:
        return "□"  # the empty clause
    return " ∨ ".join(n if p else f"¬{n}" for n, p in sorted(clause))
