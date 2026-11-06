"""Propositional logic: syntax (AST), semantics (truth in a model) and a parser.

Grammar (precedence from tightest to loosest, as in Russell & Norvig §7.4.1):
    ¬  >  ∧  >  ∨  >  ⇒  >  ⇔          (⇒ is right-associative)

Accepted operator spellings:
    not : ~  !  ¬  not
    and : &  ∧  and
    or  : |  ∨  or
    imp : =>  ->  ⇒
    iff : <=>  <->  ⇔
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass


class Sentence:
    """Base class for all propositional sentences (immutable, hashable)."""

    def symbols(self) -> set[str]:
        raise NotImplementedError

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        """Truth value in a *complete* model (every symbol assigned)."""
        raise NotImplementedError

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        """Truth value in a partial model; ``None`` if undetermined (used by DPLL)."""
        raise NotImplementedError

    def to_ascii(self) -> str:
        raise NotImplementedError

    def __str__(self) -> str:  # pretty, unicode
        raise NotImplementedError

    # Convenience constructors -------------------------------------------------
    def __invert__(self) -> Sentence:
        return Not(self)

    def __and__(self, other: Sentence) -> Sentence:
        return And((self, other))

    def __or__(self, other: Sentence) -> Sentence:
        return Or((self, other))

    def implies(self, other: Sentence) -> Sentence:
        return Implies(self, other)


@dataclass(frozen=True)
class Symbol(Sentence):
    name: str

    def symbols(self) -> set[str]:
        return {self.name}

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return bool(model[self.name])

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        return model.get(self.name)

    def to_ascii(self) -> str:
        return self.name

    def __str__(self) -> str:
        return self.name


@dataclass(frozen=True)
class Constant(Sentence):
    value: bool

    def symbols(self) -> set[str]:
        return set()

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return self.value

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        return self.value

    def to_ascii(self) -> str:
        return "True" if self.value else "False"

    def __str__(self) -> str:
        return "⊤" if self.value else "⊥"


TRUE = Constant(True)
FALSE = Constant(False)


@dataclass(frozen=True)
class Not(Sentence):
    arg: Sentence

    def symbols(self) -> set[str]:
        return self.arg.symbols()

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return not self.arg.evaluate(model)

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        v = self.arg.evaluate_partial(model)
        return None if v is None else not v

    def to_ascii(self) -> str:
        return f"~{_wrap_ascii(self.arg, 5)}"

    def __str__(self) -> str:
        return f"¬{_wrap(self.arg, 5)}"


@dataclass(frozen=True)
class And(Sentence):
    args: tuple[Sentence, ...]

    def symbols(self) -> set[str]:
        out: set[str] = set()
        for a in self.args:
            out |= a.symbols()
        return out

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return all(a.evaluate(model) for a in self.args)

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        unknown = False
        for a in self.args:
            v = a.evaluate_partial(model)
            if v is False:
                return False
            if v is None:
                unknown = True
        return None if unknown else True

    def to_ascii(self) -> str:
        return " & ".join(_wrap_ascii(a, 4) for a in self.args)

    def __str__(self) -> str:
        return " ∧ ".join(_wrap(a, 4) for a in self.args)


@dataclass(frozen=True)
class Or(Sentence):
    args: tuple[Sentence, ...]

    def symbols(self) -> set[str]:
        out: set[str] = set()
        for a in self.args:
            out |= a.symbols()
        return out

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return any(a.evaluate(model) for a in self.args)

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        unknown = False
        for a in self.args:
            v = a.evaluate_partial(model)
            if v is True:
                return True
            if v is None:
                unknown = True
        return None if unknown else False

    def to_ascii(self) -> str:
        return " | ".join(_wrap_ascii(a, 3) for a in self.args)

    def __str__(self) -> str:
        return " ∨ ".join(_wrap(a, 3) for a in self.args)


@dataclass(frozen=True)
class Implies(Sentence):
    left: Sentence
    right: Sentence

    def symbols(self) -> set[str]:
        return self.left.symbols() | self.right.symbols()

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return (not self.left.evaluate(model)) or self.right.evaluate(model)

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        lv = self.left.evaluate_partial(model)
        rv = self.right.evaluate_partial(model)
        if lv is False or rv is True:
            return True
        if lv is True and rv is False:
            return False
        return None

    def to_ascii(self) -> str:
        return f"{_wrap_ascii(self.left, 2)} => {_wrap_ascii(self.right, 1)}"

    def __str__(self) -> str:
        return f"{_wrap(self.left, 2)} ⇒ {_wrap(self.right, 1)}"


@dataclass(frozen=True)
class Iff(Sentence):
    left: Sentence
    right: Sentence

    def symbols(self) -> set[str]:
        return self.left.symbols() | self.right.symbols()

    def evaluate(self, model: Mapping[str, bool]) -> bool:
        return self.left.evaluate(model) == self.right.evaluate(model)

    def evaluate_partial(self, model: Mapping[str, bool]) -> bool | None:
        lv = self.left.evaluate_partial(model)
        rv = self.right.evaluate_partial(model)
        if lv is None or rv is None:
            return None
        return lv == rv

    def to_ascii(self) -> str:
        return f"{_wrap_ascii(self.left, 1)} <=> {_wrap_ascii(self.right, 1)}"

    def __str__(self) -> str:
        return f"{_wrap(self.left, 1)} ⇔ {_wrap(self.right, 1)}"


def _prec(s: Sentence) -> int:
    if isinstance(s, (Symbol, Constant)):
        return 6
    if isinstance(s, Not):
        return 5
    if isinstance(s, And):
        return 4
    if isinstance(s, Or):
        return 3
    if isinstance(s, Implies):
        return 2
    return 1


def _wrap(s: Sentence, parent_prec: int) -> str:
    text = str(s)
    return f"({text})" if _prec(s) < parent_prec or (_prec(s) == parent_prec and parent_prec <= 2) else text


def _wrap_ascii(s: Sentence, parent_prec: int) -> str:
    text = s.to_ascii()
    return f"({text})" if _prec(s) < parent_prec or (_prec(s) == parent_prec and parent_prec <= 2) else text


def conjoin(sentences: Iterable[Sentence]) -> Sentence:
    items = tuple(sentences)
    if not items:
        return TRUE
    if len(items) == 1:
        return items[0]
    return And(items)


def disjoin(sentences: Iterable[Sentence]) -> Sentence:
    items = tuple(sentences)
    if not items:
        return FALSE
    if len(items) == 1:
        return items[0]
    return Or(items)


# --------------------------------------------------------------------------- parser

class ParseError(ValueError):
    pass


_TOKEN_RE = re.compile(
    r"\s*(?:(<=>|<->|⇔)|(=>|->|⇒)|(&|∧)|(\||∨)|(~|!|¬)|(\()|(\))|([A-Za-z_][A-Za-z0-9_]*))"
)
_WORD_OPS = {"and": "AND", "or": "OR", "not": "NOT"}
SYMBOL_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def tokenize(text: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    pos = 0
    text = text.strip()
    while pos < len(text):
        m = _TOKEN_RE.match(text, pos)
        if not m or m.end() == pos:
            raise ParseError(f"Unexpected character at position {pos}: {text[pos]!r}")
        iff, imp, and_, or_, not_, lp, rp, word = m.groups()
        if iff:
            tokens.append(("IFF", iff))
        elif imp:
            tokens.append(("IMP", imp))
        elif and_:
            tokens.append(("AND", and_))
        elif or_:
            tokens.append(("OR", or_))
        elif not_:
            tokens.append(("NOT", not_))
        elif lp:
            tokens.append(("LP", lp))
        elif rp:
            tokens.append(("RP", rp))
        elif word:
            low = word.lower()
            if low in _WORD_OPS:
                tokens.append((_WORD_OPS[low], word))
            elif low in ("true", "false"):
                tokens.append(("CONST", low))
            else:
                tokens.append(("SYM", word))
        pos = m.end()
    return tokens


class _Parser:
    def __init__(self, tokens: list[tuple[str, str]]) -> None:
        self.tokens = tokens
        self.i = 0

    def peek(self) -> str | None:
        return self.tokens[self.i][0] if self.i < len(self.tokens) else None

    def take(self, kind: str) -> str:
        if self.peek() != kind:
            got = self.tokens[self.i][1] if self.i < len(self.tokens) else "end of input"
            raise ParseError(f"Expected {kind}, got {got!r}")
        value = self.tokens[self.i][1]
        self.i += 1
        return value

    def parse(self) -> Sentence:
        if not self.tokens:
            raise ParseError("Empty sentence")
        s = self.iff()
        if self.i != len(self.tokens):
            raise ParseError(f"Unexpected token {self.tokens[self.i][1]!r}")
        return s

    def iff(self) -> Sentence:
        left = self.imp()
        while self.peek() == "IFF":
            self.take("IFF")
            left = Iff(left, self.imp())
        return left

    def imp(self) -> Sentence:
        left = self.or_()
        if self.peek() == "IMP":
            self.take("IMP")
            return Implies(left, self.imp())  # right-associative
        return left

    def or_(self) -> Sentence:
        items = [self.and_()]
        while self.peek() == "OR":
            self.take("OR")
            items.append(self.and_())
        return items[0] if len(items) == 1 else Or(tuple(items))

    def and_(self) -> Sentence:
        items = [self.not_()]
        while self.peek() == "AND":
            self.take("AND")
            items.append(self.not_())
        return items[0] if len(items) == 1 else And(tuple(items))

    def not_(self) -> Sentence:
        if self.peek() == "NOT":
            self.take("NOT")
            return Not(self.not_())
        return self.atom()

    def atom(self) -> Sentence:
        kind = self.peek()
        if kind == "LP":
            self.take("LP")
            s = self.iff()
            self.take("RP")
            return s
        if kind == "CONST":
            return TRUE if self.take("CONST") == "true" else FALSE
        if kind == "SYM":
            return Symbol(self.take("SYM"))
        got = self.tokens[self.i][1] if self.i < len(self.tokens) else "end of input"
        raise ParseError(f"Expected a symbol or '(', got {got!r}")


def parse(text: str) -> Sentence:
    """Parse a propositional sentence from text."""
    return _Parser(tokenize(text)).parse()
