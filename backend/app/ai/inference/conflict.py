"""Conflict resolution for mutually exclusive conclusions (one action per action group).

Strategy (in order):
1. Priority (salience): the higher ``priority`` wins.
2. Specificity: the rule with more antecedent literals wins (it uses more information).
3. Rule order: the lower rule code wins, so results are deterministic.
"""

from __future__ import annotations

from app.ai.rules.rule import HornRule


def conflict_key(rule: HornRule) -> tuple[int, int, str]:
    # Sort descending by priority and specificity, ascending by code.
    return (-rule.priority, -rule.specificity, rule.code)


def resolve_conflicts(candidates: list[HornRule]) -> tuple[HornRule, list[HornRule]]:
    if not candidates:
        raise ValueError("Empty conflict set")
    ordered = sorted(candidates, key=conflict_key)
    return ordered[0], ordered[1:]


def explain_win(winner: HornRule, loser: HornRule) -> str:
    if winner.priority != loser.priority:
        return f"priority {winner.priority} > {loser.priority}"
    if winner.specificity != loser.specificity:
        return f"more specific ({winner.specificity} vs {loser.specificity} conditions)"
    return f"rule order ({winner.code} before {loser.code})"
