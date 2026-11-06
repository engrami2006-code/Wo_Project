"""Horn rules with explicit negative knowledge.

Rule language:
    rule       := antecedent "=>" literal
    antecedent := literal ("&" literal)*
    literal    := symbol | "~" symbol

``~x`` in a rule body holds only when ``x`` is *known false* (it was perceived as false).
It does not hold when ``x`` is unknown. Negative literals are therefore only allowed on percept
symbols, whose falsity can be observed. For forward/backward chaining, ``~x`` is treated as
a distinct atom x̄, so the KB stays a set of definite clauses and chaining is sound and
complete (R&N §7.5.4). For model checking, ``~x`` is translated to classical ``¬x``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.ai.logic.syntax import (
    And,
    Implies,
    Not,
    ParseError,
    Sentence,
    Symbol,
    parse,
)


@dataclass(frozen=True, order=True)
class Literal:
    symbol: str
    positive: bool = True

    @property
    def atom(self) -> str:
        """Atom key used by chaining: ``x`` for known-true, ``~x`` for known-false."""
        return self.symbol if self.positive else f"~{self.symbol}"

    def holds(self, facts: dict[str, bool]) -> bool | None:
        if self.symbol not in facts:
            return None
        return facts[self.symbol] == self.positive

    def to_sentence(self) -> Sentence:
        return Symbol(self.symbol) if self.positive else Not(Symbol(self.symbol))

    def __str__(self) -> str:
        return self.atom

    @staticmethod
    def from_atom(atom: str) -> Literal:
        atom = atom.strip()
        if atom.startswith("~"):
            return Literal(atom[1:], False)
        return Literal(atom, True)


@dataclass(frozen=True)
class HornRule:
    code: str
    body: tuple[Literal, ...]
    head: Literal
    priority: int = 50
    action_group: str | None = None
    category: str = "general"
    meta: dict[str, Any] = field(default_factory=dict, compare=False, hash=False)

    @property
    def specificity(self) -> int:
        return len(self.body)

    def antecedent_text(self) -> str:
        return " & ".join(lit.atom for lit in self.body)

    def __str__(self) -> str:
        return f"{self.antecedent_text()} => {self.head.atom}"

    def to_sentence(self) -> Sentence:
        body: Sentence = (self.body[0].to_sentence() if len(self.body) == 1
                          else And(tuple(lit.to_sentence() for lit in self.body)))
        return Implies(body, self.head.to_sentence())


class RuleSyntaxError(ValueError):
    pass


def _literal_from_sentence(s: Sentence) -> Literal:
    if isinstance(s, Symbol):
        return Literal(s.name, True)
    if isinstance(s, Not) and isinstance(s.arg, Symbol):
        return Literal(s.arg.name, False)
    raise RuleSyntaxError(f"'{s}' is not a literal (expected `symbol` or `~symbol`)")


def parse_body(antecedent: str) -> tuple[Literal, ...]:
    try:
        s = parse(antecedent)
    except ParseError as exc:
        raise RuleSyntaxError(f"Antecedent: {exc}") from exc
    parts = s.args if isinstance(s, And) else (s,)
    lits = tuple(_literal_from_sentence(p) for p in parts)
    if len({lit.symbol for lit in lits}) != len(lits):
        raise RuleSyntaxError("A symbol appears more than once in the antecedent")
    return lits


def parse_head(consequent: str) -> Literal:
    try:
        s = parse(consequent)
    except ParseError as exc:
        raise RuleSyntaxError(f"Consequent: {exc}") from exc
    if not isinstance(s, Symbol):
        raise RuleSyntaxError("The consequent must be a single positive symbol (Horn form)")
    return Literal(s.name, True)


def build_rule(code: str, antecedent: str, consequent: str, *, priority: int = 50,
               action_group: str | None = None, category: str = "general",
               meta: dict[str, Any] | None = None) -> HornRule:
    body = parse_body(antecedent)
    head = parse_head(consequent)
    if head.symbol in {lit.symbol for lit in body}:
        raise RuleSyntaxError("The consequent cannot appear in its own antecedent")
    return HornRule(code=code, body=body, head=head, priority=priority, action_group=action_group,
                    category=category, meta=meta or {})
