"""Backward chaining: goal-directed AND-OR proof search over Horn rules.

Used for USER QUESTIONS ("Should I irrigate today?"). The search starts from the goal and
works back through rules to percepts. Each node gets one of three statuses:

* ``proven``    every literal of some rule body is proven
* ``disproven`` every rule for the goal has a body literal that is known false
* ``unknown``   no rule is proven and some rule depends on a percept that is not known yet

Unknown percept leaves are exactly the **missing data** needed to answer, so the chatbot
asks for them instead of guessing.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from app.ai.rules.rule import HornRule, Literal

PROVEN = "proven"
DISPROVEN = "disproven"
UNKNOWN = "unknown"
MISSING_REASON = "percept not available (missing data)"


@dataclass
class ProofNode:
    literal: str
    status: str
    via_rule: str | None = None
    reason: str = ""
    children: list[ProofNode] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"literal": self.literal, "status": self.status, "via_rule": self.via_rule,
                "reason": self.reason, "children": [c.to_dict() for c in self.children]}


@dataclass
class BackwardResult:
    goal: str
    status: str
    proof: ProofNode
    missing_percepts: list[str]
    goals_expanded: int


class BackwardChainer:
    def __init__(self, rules: Iterable[HornRule], percept_symbols: set[str]) -> None:
        self.rules = list(rules)
        self.percepts = percept_symbols
        self.by_head: dict[str, list[HornRule]] = {}
        for r in self.rules:
            self.by_head.setdefault(r.head.symbol, []).append(r)
        for lst in self.by_head.values():
            lst.sort(key=lambda r: (-r.priority, r.code))

    def ask(self, goal: Literal, facts: Mapping[str, bool]) -> BackwardResult:
        stats = {"expanded": 0}
        missing: list[str] = []
        memo: dict[str, ProofNode] = {}

        def prove(lit: Literal, visiting: frozenset[str]) -> ProofNode:
            stats["expanded"] += 1
            known = lit.holds(dict(facts))
            if known is True:
                return ProofNode(lit.atom, PROVEN, reason="known fact")
            if known is False:
                return ProofNode(lit.atom, DISPROVEN, reason="known to be the opposite")
            if lit.symbol in self.percepts:
                return ProofNode(lit.atom, UNKNOWN, reason=MISSING_REASON)
            if not lit.positive:
                return ProofNode(lit.atom, DISPROVEN,
                                 reason="negative literals are only defined for percepts")
            if lit.symbol in visiting:
                return ProofNode(lit.atom, DISPROVEN, reason="cycle detected")
            if lit.atom in memo:
                return memo[lit.atom]
            rules = self.by_head.get(lit.symbol, [])
            if not rules:
                node = ProofNode(lit.atom, DISPROVEN, reason="no rule concludes this symbol")
                memo[lit.atom] = node
                return node
            or_children: list[ProofNode] = []
            status = DISPROVEN
            for rule in rules:
                and_children = [prove(b, visiting | {lit.symbol}) for b in rule.body]
                if all(c.status == PROVEN for c in and_children):
                    rstatus = PROVEN
                elif any(c.status == DISPROVEN for c in and_children):
                    rstatus = DISPROVEN
                else:
                    rstatus = UNKNOWN
                rule_node = ProofNode(f"{rule.code}: {rule}", rstatus, via_rule=rule.code,
                                      children=and_children)
                or_children.append(rule_node)
                if rstatus == PROVEN:
                    status = PROVEN
                    break
                if rstatus == UNKNOWN:
                    status = UNKNOWN
            via = next((c.via_rule for c in or_children if c.status == PROVEN), None)
            node = ProofNode(lit.atom, status, via_rule=via, children=or_children,
                             reason={"proven": "proved by a rule", "unknown": "depends on missing data",
                                     "disproven": "no rule can establish it"}[status])
            memo[lit.atom] = node
            return node

        root = prove(goal, frozenset())

        def collect(node: ProofNode) -> None:
            # Only unknown leaves reachable through unknown nodes block the answer.
            if node.status != UNKNOWN:
                return
            if not node.children and node.reason == MISSING_REASON:
                symbol = node.literal.lstrip("~")
                if symbol not in missing:
                    missing.append(symbol)
                return
            for child in node.children:
                collect(child)

        collect(root)
        return BackwardResult(goal=goal.atom, status=root.status, proof=root,
                              missing_percepts=missing if root.status != PROVEN else [],
                              goals_expanded=stats["expanded"])
