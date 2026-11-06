"""Model checking by truth-table enumeration: TT-ENTAILS (Russell & Norvig Fig. 7.10).

KB ⊨ α  iff  α is true in every model in which KB is true.
The enumeration is exponential (2^n models), so callers pass only the symbols relevant to
the query; a hard limit protects the server.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.ai.logic.syntax import Sentence, conjoin

MAX_SYMBOLS = 20


class ModelCheckingLimitError(ValueError):
    pass


@dataclass
class EntailmentResult:
    entailed: bool
    symbols: list[str]
    models_checked: int
    kb_models: int
    counterexample: dict[str, bool] | None = None
    example_models: list[dict[str, bool]] = field(default_factory=list)


def tt_entails(kb: Sequence[Sentence], alpha: Sentence, *, max_symbols: int = MAX_SYMBOLS,
               keep_examples: int = 3) -> EntailmentResult:
    kb_sentence = conjoin(kb)
    symbols = sorted(kb_sentence.symbols() | alpha.symbols())
    if len(symbols) > max_symbols:
        raise ModelCheckingLimitError(
            f"Truth-table enumeration over {len(symbols)} symbols (2^{len(symbols)} models) "
            f"exceeds the limit of {max_symbols}. Narrow the query to its relevant symbols.")

    stats = {"checked": 0, "kb_models": 0}
    examples: list[dict[str, bool]] = []
    counter: dict[str, dict[str, bool] | None] = {"model": None}

    def tt_check_all(remaining: list[str], model: dict[str, bool]) -> bool:
        if not remaining:
            stats["checked"] += 1
            if kb_sentence.evaluate(model):
                stats["kb_models"] += 1
                holds = alpha.evaluate(model)
                if holds and len(examples) < keep_examples:
                    examples.append(dict(model))
                if not holds and counter["model"] is None:
                    counter["model"] = dict(model)
                return holds
            return True  # when KB is false, the implication KB ⇒ α holds vacuously
        p, rest = remaining[0], remaining[1:]
        model[p] = True
        left = tt_check_all(rest, model)
        model[p] = False
        right = tt_check_all(rest, model)
        del model[p]
        return left and right

    entailed = tt_check_all(symbols, {})
    return EntailmentResult(
        entailed=entailed,
        symbols=symbols,
        models_checked=stats["checked"],
        kb_models=stats["kb_models"],
        counterexample=counter["model"],
        example_models=examples,
    )
