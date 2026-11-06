"""Perception: grounding numeric data into propositional percepts (the agent's TELL input).

A percept is a symbol whose truth value is either observed (True/False) or **unknown**
(None). Unknown percepts are never asserted; they become missing data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def fmt_num(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "—"
    if abs(value - round(value)) < 1e-9 and digits <= 1:
        return f"{value:,.0f}"
    return f"{value:,.{digits}f}"


@dataclass
class Percept:
    symbol: str
    value: bool | None
    evidence: dict[str, Any] = field(default_factory=dict)
    flip_en: str | None = None
    flip_ar: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"symbol": self.symbol, "value": self.value, "evidence": self.evidence,
                "flip_en": self.flip_en, "flip_ar": self.flip_ar}


class PerceptSet:
    def __init__(self) -> None:
        self._items: dict[str, Percept] = {}

    def add(self, symbol: str, value: bool | None, evidence: dict[str, Any] | None = None,
            flip_en: str | None = None, flip_ar: str | None = None) -> None:
        self._items[symbol] = Percept(symbol, value, evidence or {}, flip_en, flip_ar)

    def unknown(self, symbol: str, reason: str, fields: list[str] | None = None) -> None:
        """Mark a percept as unknown; ``fields`` are the data items whose absence caused it."""
        evidence: dict[str, Any] = {"reason": reason}
        if fields is not None:
            evidence["missing_fields"] = fields
        self.add(symbol, None, evidence)

    def known(self) -> dict[str, bool]:
        return {s: p.value for s, p in self._items.items() if p.value is not None}

    def unknown_symbols(self) -> list[str]:
        return [s for s, p in self._items.items() if p.value is None]

    def get(self, symbol: str) -> Percept | None:
        return self._items.get(symbol)

    def all(self) -> list[Percept]:
        return list(self._items.values())

    def to_list(self) -> list[dict[str, Any]]:
        return [p.to_dict() for p in self._items.values()]


class SafeVars(dict[str, Any]):
    """Template variables; missing keys render as an em dash instead of raising."""

    def __missing__(self, key: str) -> str:
        return "—"


def render(template: str | None, variables: dict[str, Any]) -> str:
    if not template:
        return ""
    try:
        return template.format_map(SafeVars(variables))
    except (ValueError, IndexError):
        return template
