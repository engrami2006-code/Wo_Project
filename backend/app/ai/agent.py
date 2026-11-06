"""The WO knowledge-based agent (Russell & Norvig Fig. 7.1).

    function KB-AGENT(percept) returns an action
        TELL(KB, MAKE-PERCEPT-SENTENCE(percept, t))
        action ← ASK(KB, MAKE-ACTION-QUERY(t))
        TELL(KB, MAKE-ACTION-SENTENCE(action, t))
        t ← t + 1
        return action

Here, TELL asserts the grounded percepts in working memory. ASK either derives the decision
by forward chaining (system events) or proves a goal by backward chaining (user questions).
The chosen action is persisted as a Recommendation, which is the action sentence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.ai.explanations.builder import ExplanationBuilder
from app.ai.inference.backward import BackwardChainer, BackwardResult
from app.ai.inference.forward import Decision, decide
from app.ai.knowledge_base.loader import KnowledgeSnapshot
from app.ai.perception.base import PerceptSet
from app.ai.rules.rule import HornRule, Literal

IRRIGATION_CATEGORIES = ("irrigation", "decision", "advisory", "alert")
HYDRO_CATEGORIES = ("hydroponics",)
ALERT_CATEGORIES = ("alert",)

HYDRO_PRIMARY = ["advise_lower_ph", "advise_raise_ph", "advise_dilute_solution",
                 "advise_increase_nutrients", "advise_check_loop_integrity", "advise_check_leaks",
                 "hydro_status_ok"]


@dataclass
class AgentCycle:
    t: int
    percepts: dict[str, bool]
    decision: Decision | None = None
    explanation: dict[str, Any] = field(default_factory=dict)


class KBAgent:
    def __init__(self, kb: KnowledgeSnapshot, categories: tuple[str, ...]) -> None:
        self.kb = kb
        self.rules: list[HornRule] = kb.rules_in(*categories)
        self.t = 0
        self.working_memory: dict[str, bool] = {}
        self.percepts: PerceptSet | None = None
        self.history: list[dict[str, Any]] = []

    # TELL ------------------------------------------------------------------------------
    def tell(self, percepts: PerceptSet) -> None:
        self.percepts = percepts
        self.working_memory = percepts.known()

    def tell_action(self, action: str | None) -> None:
        self.history.append({"t": self.t, "action": action})
        self.t += 1

    # ASK -------------------------------------------------------------------------------
    def ask_decision(self) -> Decision:
        return decide(self.rules, self.working_memory)

    def ask_goal(self, goal: str) -> BackwardResult:
        chainer = BackwardChainer(self.rules, self.kb.percept_symbols)
        return chainer.ask(Literal.from_atom(goal), self.working_memory)

    # One full cycle --------------------------------------------------------------------
    def run_cycle(self, percepts: PerceptSet, variables: dict[str, Any], *, focus_group: str | None = None,
                  primary_symbols: list[str] | None = None, goals: list[str] | None = None,
                  amounts: dict[str, float | None] | None = None, calculation: dict[str, Any] | None = None,
                  data_quality: str = "fresh") -> AgentCycle:
        self.tell(percepts)
        decision = self.ask_decision()
        builder = ExplanationBuilder(self.kb, percepts, variables)
        explanation = builder.build(decision, focus_group=focus_group, primary_symbols=primary_symbols,
                                    goals=goals, amounts=amounts, calculation=calculation,
                                    data_quality=data_quality)
        action = explanation["recommendation"]["action"] if explanation["recommendation"] else None
        self.tell_action(action)
        return AgentCycle(t=self.t, percepts=dict(self.working_memory), decision=decision,
                          explanation=explanation)
