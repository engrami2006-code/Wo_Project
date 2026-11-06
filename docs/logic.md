# Propositional Logic, Model Checking and KB Validation

The `backend/app/ai/logic/` package is a small, dependency-free implementation of propositional logic as taught in
AIMA ch. 7. It is used in two places: **knowledge-base validation** (every rule/axiom change, `POST
/api/knowledge-base/validate`) and the **Logic Lab** (`POST /api/knowledge-base/ask`), where a user can TELL percept
values and ASK any sentence with five engines side by side.

| File | Content | AIMA |
|---|---|---|
| `logic/syntax.py` | AST (`Symbol`, `Constant`, `Not`, `And`, `Or`, `Implies`, `Iff`), evaluation, tokenizer and parser | §7.4.1–7.4.2 |
| `logic/cnf.py` | conversion to conjunctive normal form, clause utilities | §7.5.2 |
| `logic/model_checking.py` | TT-ENTAILS (truth-table enumeration) | Fig. 7.10 |
| `logic/dpll.py` | DPLL satisfiability, entailment by refutation, PL-RESOLUTION | Fig. 7.17, Fig. 7.12 |
| `knowledge_base/validation.py` | KB validation with Clark's completion + DPLL | — |
| `services/kb_service.py::ask` | Logic Lab: FC, BC, TT-ENTAILS, DPLL, resolution on the relevant sub-KB | — |

---

## 1. Syntax

Sentences are immutable, hashable dataclasses. Operator precedence, tightest first: **¬ > ∧ > ∨ > ⇒ > ⇔**; `⇒` is
right-associative. Accepted spellings:

| Connective | Spellings |
|---|---|
| not | `~` `!` `¬` `not` |
| and | `&` `∧` `and` |
| or | `\|` `∨` `or` |
| implies | `=>` `->` `⇒` |
| iff | `<=>` `<->` `⇔` |
| constants | `true`, `false` |

The parser (`syntax.py::_Parser`) is a recursive-descent parser with one method per precedence level
(`iff → imp → or_ → and_ → not_ → atom`). Errors raise `ParseError` with the offending token. Every sentence prints in
Unicode (`str(s)`, e.g. `¬(stage_initial ∧ stage_mid)`) and in ASCII (`s.to_ascii()`, e.g. `~(stage_initial & stage_mid)`),
adding parentheses only where precedence requires them.

Rule symbols must match `^[a-z][a-z0-9_]*$` (`SYMBOL_RE`); the parser itself accepts any identifier.

## 2. Semantics

- `evaluate(model)` — truth value in a **complete** model (every symbol assigned), used by TT-ENTAILS.
- `evaluate_partial(model)` — three-valued evaluation in a **partial** model (`True`, `False` or `None` = undetermined),
  e.g. `And` is false as soon as one conjunct is false and undetermined if none is false but one is unknown.
- `symbols()` — the set of proposition symbols of a sentence.

## 3. Conjunctive normal form

`cnf.py::to_cnf_clauses(s)` follows the four textbook steps:

1. eliminate `⇔`: α ⇔ β ≡ (α ⇒ β) ∧ (β ⇒ α);
2. eliminate `⇒`: α ⇒ β ≡ ¬α ∨ β;
3. move `¬` inwards (De Morgan, double negation, ¬⊤ = ⊥) — negation normal form;
4. distribute `∨` over `∧`: CNF(a ∨ b) = { cₐ ∪ c_b : cₐ ∈ CNF(a), c_b ∈ CNF(b) }.

A clause is a `frozenset` of literals `(symbol, polarity)`; tautological clauses (containing x and ¬x) and duplicates
are removed. `clause_str` prints a clause (`□` for the empty clause).

Example — the rule `R-IRR-003` as a sentence and its CNF:

```text
irrigation_needed ∧ water_limited ∧ ¬water_critical ⇒ action_deficit_irrigation
CNF: action_deficit_irrigation ∨ ¬irrigation_needed ∨ water_critical ∨ ¬water_limited
```

## 4. Model checking: TT-ENTAILS

`model_checking.py::tt_entails(kb, α)` decides **KB ⊨ α** by enumerating all 2ⁿ models over the symbols of KB and α
(AIMA Fig. 7.10): α must be true in every model where KB is true. It returns `entailed`, the symbol list,
`models_checked`, the number of KB models, up to three example models and the first **counterexample** model.

Enumeration is exponential, so `MAX_SYMBOLS = 20` protects the server (`ModelCheckingLimitError`). The Logic Lab
therefore model-checks only the **relevant sub-KB**: `kb_service._relevant` computes the backward closure of the query's
symbols through rule heads and keeps only the rules concluding a symbol in that closure (plus the told facts on those
symbols, and the axioms whose symbols are all in the closure when `include_axioms` is set).

## 5. DPLL and resolution

### 5.1 DPLL

`dpll.py::dpll_clauses(clauses)` is AIMA Fig. 7.17:

- **early termination** — stop a branch as soon as a clause is false; succeed when every clause is true;
- **pure-symbol heuristic** — a symbol that appears with only one sign in the not-yet-satisfied clauses is assigned
  that sign;
- **unit-clause heuristic** — a clause with a single unassigned literal (and no true literal) forces that literal;
- otherwise **branch** on the next symbol (true, then false).

Statistics are returned (`calls`, `unit_propagations`, `pure_assignments`, `branches`). Entailment is decided by
refutation: `dpll_entails(kb, α)` = KB ∧ ¬α is **unsatisfiable**.

### 5.2 PL-RESOLUTION

`dpll.py::pl_resolution(kb, α, max_clauses=4000)` refutes KB ∧ ¬α by resolving pairs of clauses until the empty clause
appears (entailed) or no new clause can be added (not entailed). It records up to 60 resolution steps for display and
stops with `limit_reached` when the clause set exceeds `max_clauses`. The Logic Lab runs it only when the relevant
sub-KB has at most 40 sentences, with `max_clauses = 1500`.

### 5.3 A real Logic Lab run

Request sent to the running API (`POST /api/knowledge-base/ask`, default rule categories, no axioms):

```json
{"facts": {"et_demand_positive": true, "rain_covers_demand": false, "season_ended": false,
           "not_yet_planted": false, "water_limited": true, "water_critical": false},
 "query": "irrigate_today", "include_axioms": false}
```

Results returned by the five engines:

| Engine | Result | Work |
|---|---|---|
| Forward chaining | entailed | fired `R-IRR-001`, `R-ALR-005`, `R-IRR-003`, `R-IRR-009`; agenda of 10 atoms |
| Backward chaining | `proven` | 12 goals expanded |
| TT-ENTAILS | entailed | 12 symbols, 4,096 models checked, 6 models of the KB, no counterexample |
| DPLL (KB ∧ ¬α unsat) | entailed | 14 clauses, 13 calls, 9 unit propagations, 3 pure-symbol assignments |
| PL-RESOLUTION | entailed | 1,212 clauses generated, limit not reached |

Relevant rules: `R-IRR-001`, `R-IRR-002`, `R-IRR-003`, `R-IRR-004`, `R-IRR-008`, `R-IRR-009`, `R-IRR-010`;
`agreement = true`. The response also includes the CNF of the query, the FC trace, the BC proof tree and the first
resolution steps, e.g.

```text
action_critical_supply ∨ ¬irrigation_needed ∨ ¬water_critical  ,  ¬action_critical_supply ∨ irrigate_today
  ⟶ irrigate_today ∨ ¬irrigation_needed ∨ ¬water_critical
```

The note returned with every answer explains why the engines can, in principle, disagree: forward chaining treats `~x`
as a separate known-false atom (Horn semantics), while model checking uses classical semantics and can also prove
conclusions by case analysis.

---

## 6. Knowledge-base validation

`knowledge_base/validation.py::validate_rules(rules, axioms, percept_symbols)` is run:

- before every rule create/update and fact (axiom) update (`kb_service`), as a **gate** — the change is rejected when
  the report is not `ok`;
- on demand by `POST /api/knowledge-base/validate`, optionally "as if" a candidate rule were added or replaced.

### 6.1 Why Clark's completion

A set of definite clauses on its own is always satisfiable (make every head true), so checking "rules ∧ axioms" would
find almost nothing. The inference engine, however, derives a symbol **only** when one of its rule bodies holds. This is
exactly **Clark's completion**: for every derived symbol d with rules d ⇐ body₁, …, d ⇐ bodyₖ,

```text
d ⇔ (body₁ ∨ body₂ ∨ … ∨ bodyₖ)
```

Percept symbols stay free (they are whatever perception observes), constrained only by the axioms.

### 6.1.1 Domain axioms vs integrity constraints

`validate_rules` splits the axioms into two kinds:

| Kind | Test in the code | Role | Reference KB |
|---|---|---|---|
| **Domain axioms** | every symbol of the axiom is a percept (`a.symbols() <= percept_symbols`) | part of the background theory: they restrict which percept worlds can exist | 7: `axiom_stage_at_least_one`, `axiom_stage_exclusive`, `axiom_water_partition`, `axiom_water_critical`, `axiom_ph_exclusive`, `axiom_ec_exclusive`, `axiom_weather_stale` |
| **Integrity constraints** | the axiom mentions at least one derived symbol | checked separately, never assumed | 1: `axiom_irrigation_decision` = `¬(irrigate_today ∧ skip_irrigation_today)` |

The background theory is `domain axioms ∧ completion(rules)` (`validation.py::completion`). Its models are exactly
the worlds the inference engine can produce from complete percept assignments.

An integrity constraint is kept out of the background because the background would otherwise silently remove the
very worlds that violate it. With `¬(irrigate_today ∧ skip_irrigation_today)` assumed, a rule set that derives both
would simply have those worlds excluded, and no check would notice. Instead, each integrity constraint c is tested
for **violability**: is `background ∧ ¬c` satisfiable?

Each check below is one DPLL satisfiability call on the background plus an extra sentence.

### 6.2 The checks

| # | Check | Satisfiability question | Issue (severity) |
|---|---|---|---|
| 1 | Vocabulary | (syntactic) `~x` only on percepts; every body symbol is a percept or some rule's head; no rule concludes a percept | `negation_on_derived`, `unknown_symbol`, `head_is_percept` (error) |
| 2 | Global consistency | SAT(background)? | `inconsistent_kb` (error) — validation stops here |
| 2b | Integrity constraints | for each integrity constraint c: SAT(background ∧ ¬c)? | SAT → `integrity_violation` (error) with a witness model (true percepts and derived symbols) |
| 3 | Dead rules | for each rule: SAT(background ∧ body)? | `dead_rule` (warning) when UNSAT |
| 4 | Conflicts | for each pair of rules in the same `action_group` with **different heads**: SAT(background ∧ body_a ∧ body_b)? | equal priority → `conflict` (error); different priority → `overlap_resolved` (info); both include a witness model (true percepts only) |
| 5 | Coverage | for `COMPLETE_GROUPS = {"irrigation_action"}`: SAT(background ∧ ¬(h₁ ∨ … ∨ hₖ))? | SAT → `coverage_gap` (warning) with a witness world; UNSAT → `coverage_complete` (info) |
| 6 | Redundancy | (syntactic) same head and body a strict subset of another rule's body | `subsumed_rule` (warning) |

`ValidationReport.ok` is true when the KB is consistent and there is no `error` issue; warnings and infos do not block
a change. Rule creates and updates are gated on `ok`. An axiom edit (`update_fact`) is gated only on `consistent`,
so an `integrity_violation` caused by an axiom edit is reported by `POST /api/knowledge-base/validate` but does not
block that edit.

### 6.3 Actual report for the reference knowledge base

Output of `validate_rules` on the reference KB (39 rules, 8 axioms, of which 7 are domain axioms and 1 is an
integrity constraint, and 27 percepts). It was re-run with the current code on 2026-10-03:

```json
{
  "ok": true,
  "consistent": true,
  "stats": {"rules": 39, "axioms": 8, "sat_calls": 60, "dpll_calls": 2655},
  "issues": [
    {
      "severity": "info",
      "code": "coverage_complete",
      "message": "Every complete world (all percepts known, axioms respected) yields exactly one 'irrigation_action' decision path.",
      "rules": ["R-IRR-002", "R-IRR-003", "R-IRR-004", "R-IRR-005", "R-IRR-006", "R-IRR-007", "R-IRR-013"],
      "model": null
    }
  ]
}
```

Reading the report:

- **60 SAT calls** = 1 (consistency) + 1 (the integrity constraint) + 39 (one dead-rule check per rule) + 18 (pairs in
  `irrigation_action`: C(7,2) = 21 minus the 3 pairs among `R-IRR-006/007/013`, which share the head
  `action_no_irrigation`) + 1 (coverage). The 60 calls made 2,655 recursive DPLL calls in total. The whole validation
  took about 270 ms in this environment.
- **Integrity constraint holds**: no percept world derives both `irrigate_today` and `skip_irrigation_today`.
- **No dead rule**: every rule body is satisfiable under the domain axioms and the completion.
- **No conflict and no overlap**: no two irrigation actions with different heads can fire in the same world.
- **Coverage complete**: there is no complete world in which no irrigation action fires. (The check itself proves
  "at least one"; together with the absence of overlaps this gives the "exactly one" in the message.)
- **No subsumed rule.**

The test `backend/tests/test_kb_validation.py::test_reference_kb_is_consistent_conflict_free_and_complete` checks the
same properties.

### 6.4 What a rejected change looks like

Validating a hypothetical candidate rule `R-IRR-099: irrigation_needed & water_limited => action_full_irrigation`
(`action_group = irrigation_action`, priority 60) produces `ok = false` (67 SAT calls, 2,863 DPLL calls). The relevant issues:

```json
{"severity": "error", "code": "conflict",
 "message": "R-IRR-003 and R-IRR-099 (irrigation_action) can fire together with equal priority 60; the outcome would depend only on rule order.",
 "rules": ["R-IRR-003", "R-IRR-099"],
 "model": {"et_demand_positive": true, "water_limited": true, "stage_mid": true, "weather_available": true, "…": "…"}}
{"severity": "info", "code": "overlap_resolved",
 "message": "R-IRR-004 and R-IRR-099 (irrigation_action) can fire together; conflict resolution picks the higher priority.",
 "rules": ["R-IRR-004", "R-IRR-099"]}
```

(The witness `model` lists every percept that is true in the satisfying assignment; it is shortened here.) Through
`POST /api/knowledge-base/rules` this candidate would be refused with `422` and this report in `error.details`.

A candidate that negates a derived symbol, e.g. `R-ADV-099: ~irrigation_needed & weather_available =>
advise_refresh_weather`, is refused by the vocabulary check:

```json
{"severity": "error", "code": "negation_on_derived",
 "message": "R-ADV-099: '~irrigation_needed' negates a derived symbol. Negation is only defined for percepts (observable facts).",
 "rules": ["R-ADV-099"]}
```

A candidate that can derive both sides of the integrity constraint, e.g. `R-IRR-098: stage_mid & weather_available =>
irrigate_today` (category `irrigation`, priority 40, no action group), is refused with `integrity_violation`
(61 SAT calls). The witness is a world with `stage_mid` and `weather_available` but without `et_demand_positive`.
There, `R-IRR-013` (no evaporative demand) concludes `action_no_irrigation`, `R-IRR-012` derives
`skip_irrigation_today`, and the candidate derives `irrigate_today`:

```json
{"severity": "error", "code": "integrity_violation",
 "message": "Integrity constraint 'axiom_irrigation_decision' (¬(irrigate_today ∧ skip_irrigation_today)) can be violated: some percept world derives both sides.",
 "rules": [],
 "model": {"stage_mid": true, "weather_available": true, "action_no_irrigation": true,
           "skip_irrigation_today": true, "irrigate_today": true, "…": "…"}}
```

The three demonstrations were produced by running `validate_rules` on the reference rules plus the candidate. None of
the candidates is part of the shipped knowledge base. The test
`backend/tests/test_kb_validation.py::test_integrity_constraint_violation_is_reported_with_a_witness` checks the same
behaviour with a different candidate (`action_full_irrigation & rain_expected => skip_irrigation_today`): it expects
an `integrity_violation` error whose witness derives both `irrigate_today` and `skip_irrigation_today`.

---

## 7. Logic Lab endpoint

`POST /api/knowledge-base/ask` (`schemas/ai.py::LogicAskRequest`):

| Field | Meaning |
|---|---|
| `facts` | percept truth values to TELL (≤ 60; unknown symbols are rejected with `422`) |
| `query` | any propositional sentence (≤ 500 chars) |
| `categories` | rule categories to include (default `irrigation`, `decision`, `advisory`, `alert`) |
| `include_axioms` | add the axioms whose symbols are all relevant |

Response keys: `query`, `query_ascii`, `query_cnf`, `tell`, `forward_chaining` (only applicable to a literal query),
`backward_chaining` (only for a positive symbol), `model_checking`, `dpll`, `resolution` (when ≤ 40 sentences),
`relevant_rules`, `agreement`, `note`. The UI is `frontend/src/components/kb/LogicLab.tsx` (screenshot:
`docs/screenshots/kb-logic-lab-en.png`).
