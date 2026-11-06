"""Propositional logic: syntax, semantics, CNF, TT-ENTAILS, DPLL, resolution."""

import pytest

from app.ai.logic.cnf import clause_str, to_cnf_clauses
from app.ai.logic.dpll import dpll_entails, dpll_satisfiable, pl_resolution
from app.ai.logic.model_checking import ModelCheckingLimitError, tt_entails
from app.ai.logic.syntax import And, Iff, Implies, Not, Or, ParseError, Symbol, parse


def test_parser_precedence_matches_russell_norvig():
    s = parse("~a & b | c => d <=> e")
    assert isinstance(s, Iff)
    assert isinstance(s.left, Implies)
    assert isinstance(s.left.left, Or)
    assert isinstance(s.left.left.args[0], And)
    assert isinstance(s.left.left.args[0].args[0], Not)


def test_implication_is_right_associative_and_word_operators():
    s = parse("a -> b -> c")
    assert isinstance(s, Implies) and isinstance(s.right, Implies)
    assert parse("not a and b or c").to_ascii() == "~a & b | c"


def test_parse_errors():
    for bad in ("", "a &", "(a | b", "a $ b"):
        with pytest.raises(ParseError):
            parse(bad)


def test_evaluate_and_roundtrip():
    s = parse("(rain => wet) & (wet => slippery)")
    assert s.evaluate({"rain": True, "wet": True, "slippery": True})
    assert not s.evaluate({"rain": True, "wet": False, "slippery": True})
    assert parse(s.to_ascii()) == s


def test_cnf_of_biconditional():
    clauses = {clause_str(c) for c in to_cnf_clauses(parse("a <=> b"))}
    assert clauses == {"a ∨ ¬b", "¬a ∨ b"}


def test_tt_entails_modus_ponens_and_counterexample():
    kb = [parse("p => q"), Symbol("p")]
    assert tt_entails(kb, Symbol("q")).entailed
    res = tt_entails([parse("p => q")], Symbol("q"))
    assert not res.entailed
    assert res.counterexample is not None and res.counterexample["q"] is False
    assert res.models_checked == 4


def test_tt_entails_symbol_limit():
    kb = [parse(" & ".join(f"x{i}" for i in range(25)))]
    with pytest.raises(ModelCheckingLimitError):
        tt_entails(kb, Symbol("x0"))


def test_dpll_sat_unsat_and_entailment():
    assert dpll_satisfiable([parse("(a | b) & (~a | c) & (~b | c)")]).satisfiable
    assert not dpll_satisfiable([parse("a & ~a")]).satisfiable
    entailed, _ = dpll_entails([parse("a => b"), parse("b => c"), Symbol("a")], Symbol("c"))
    assert entailed
    entailed, res = dpll_entails([parse("a => b")], Symbol("b"))
    assert not entailed and res.model is not None


def test_resolution_proves_and_refuses():
    assert pl_resolution([parse("p => q"), parse("q => r"), Symbol("p")], Symbol("r")).entailed
    assert not pl_resolution([parse("p => q")], Symbol("r")).entailed


def test_model_checking_proves_by_cases_where_horn_chaining_cannot():
    """With b unknown, `a & b => c` and `a & ~b => c` still entail c classically (case analysis)."""
    kb = [parse("a & b => c"), parse("a & ~b => c"), Symbol("a")]
    assert tt_entails(kb, Symbol("c")).entailed
