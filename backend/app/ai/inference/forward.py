"""Forward chaining, PL-FC-ENTAILS with an agenda (Russell & Norvig Fig. 7.15), plus a
decision layer that applies conflict resolution inside mutually exclusive action groups.

Used for SYSTEM EVENTS: a record was created, weather was refreshed, or a recommendation
was requested. Data-driven reasoning derives everything that follows from the percepts.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from app.ai.inference.conflict import resolve_conflicts
from app.ai.rules.rule import HornRule, Literal


@dataclass
class FiredRule:
    order: int
    code: str
    premises: list[str]
    conclusion: str


@dataclass
class ForwardResult:
    facts: dict[str, bool]                  # percepts + derived (derived are always True)
    derived: list[str]                      # derived symbols in derivation order
    fired: list[FiredRule]
    agenda_trace: list[str]                 # order in which atoms were popped from the agenda
    blocked: set[str] = field(default_factory=set)

    def entails(self, literal: Literal) -> bool:
        return literal.holds(self.facts) is True


def forward_chain(rules: Iterable[HornRule], percepts: Mapping[str, bool], *,
                  blocked: set[str] | None = None, query: Literal | None = None) -> ForwardResult:
    """Run PL-FC-ENTAILS until the agenda is empty (or ``query`` is proved).

    ``blocked`` symbols are never concluded; the decision layer uses this to suppress the
    conclusions of rules that lost conflict resolution.
    """
    rules = list(rules)
    blocked = blocked or set()
    count: dict[int, int] = {i: len(r.body) for i, r in enumerate(rules)}
    by_premise: dict[str, list[int]] = {}
    for i, r in enumerate(rules):
        for lit in r.body:
            by_premise.setdefault(lit.atom, []).append(i)

    facts: dict[str, bool] = dict(percepts)
    inferred: set[str] = set()
    agenda: deque[str] = deque(Literal(sym, val).atom for sym, val in percepts.items())
    fired: list[FiredRule] = []
    derived: list[str] = []
    trace: list[str] = []

    # Rules with an empty body would be facts; the rule language forbids them, but be safe.
    for i, r in enumerate(rules):
        if count[i] == 0 and r.head.symbol not in blocked:
            agenda.append(r.head.atom)

    while agenda:
        p = agenda.popleft()
        if p in inferred:
            continue
        inferred.add(p)
        trace.append(p)
        if query is not None and p == query.atom:
            break
        for i in by_premise.get(p, []):
            count[i] -= 1
            if count[i] == 0:
                rule = rules[i]
                head = rule.head
                if head.symbol in blocked:
                    continue
                fired.append(FiredRule(order=len(fired) + 1, code=rule.code,
                                       premises=[lit.atom for lit in rule.body],
                                       conclusion=head.atom))
                if head.symbol not in facts:
                    facts[head.symbol] = head.positive
                    derived.append(head.symbol)
                if head.atom not in inferred:
                    agenda.append(head.atom)
    return ForwardResult(facts=facts, derived=derived, fired=fired, agenda_trace=trace,
                         blocked=set(blocked))


@dataclass
class Decision:
    result: ForwardResult
    first_pass: ForwardResult
    winners: dict[str, HornRule]                 # action_group -> winning rule
    overridden: dict[str, list[HornRule]]        # action_group -> rules that fired but lost
    conflict_sets: dict[str, list[HornRule]]     # action_group -> all rules that fired


def decide(rules: Iterable[HornRule], percepts: Mapping[str, bool]) -> Decision:
    """Two-pass forward chaining with conflict resolution.

    Pass 1 computes the deductive closure and the conflict set of every action group.
    Conflict resolution selects one winner per group. Pass 2 re-runs chaining with the losing
    conclusions blocked, so nothing is derived from an overridden action.
    """
    rules = list(rules)
    first = forward_chain(rules, percepts)
    by_code = {r.code: r for r in rules}
    conflict_sets: dict[str, list[HornRule]] = {}
    for fr in first.fired:
        rule = by_code[fr.code]
        if rule.action_group:
            conflict_sets.setdefault(rule.action_group, []).append(rule)

    winners: dict[str, HornRule] = {}
    overridden: dict[str, list[HornRule]] = {}
    blocked: set[str] = set()
    for group, candidates in conflict_sets.items():
        winner, losers = resolve_conflicts(candidates)
        winners[group] = winner
        if losers:
            overridden[group] = losers
            for loser in losers:
                if loser.head.symbol != winner.head.symbol:
                    blocked.add(loser.head.symbol)

    final = forward_chain(rules, percepts, blocked=blocked) if blocked else first
    return Decision(result=final, first_pass=first, winners=winners, overridden=overridden,
                    conflict_sets=conflict_sets)
