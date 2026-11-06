# AI Core — the Knowledge-Based Agent

WO's decision support is a **knowledge-based agent** in the sense of Russell & Norvig, *AIMA* ch. 7. It contains no
machine learning, no trained model and no generative AI: every conclusion is derived by propositional inference over
rules stored in the database, from percepts computed from the user's own data. This document describes each part and
ends with a fully worked example that was produced by running the code.

| Part | Code | AIMA |
|---|---|---|
| Agent cycle (TELL/ASK) | `backend/app/ai/agent.py` | §7.1, Fig. 7.1 |
| Perception (numbers → percepts) | `backend/app/ai/perception/{base,irrigation,farm,hydroponics}.py` | §7.1 (MAKE-PERCEPT-SENTENCE) |
| Rule language (Horn clauses) | `backend/app/ai/rules/rule.py` | §7.5.3 |
| Forward chaining | `backend/app/ai/inference/forward.py` | §7.5.4, Fig. 7.15 |
| Conflict resolution | `backend/app/ai/inference/conflict.py` | production-system conflict resolution |
| Backward chaining | `backend/app/ai/inference/backward.py` | §7.5.4 |
| Explanations | `backend/app/ai/explanations/builder.py` | — |
| Knowledge base loading | `backend/app/ai/knowledge_base/loader.py` | — |
| Propositional logic, CNF, TT-ENTAILS, DPLL, resolution | `backend/app/ai/logic/` — see [logic.md](logic.md) | §7.4–7.6 |
| Chatbot NLU | `backend/app/ai/chatbot/nlu.py` + `backend/app/services/chatbot_service.py` | — |

None of the modules under `app/ai/` (except `knowledge_base/loader.py` and `seed.py`) touch the database. The services
in `backend/app/services/` load data, call these pure functions and persist the results.

---

## 1. The agent cycle (TELL / ASK)

`agent.py` implements AIMA Fig. 7.1:

```text
function KB-AGENT(percept) returns an action
    TELL(KB, MAKE-PERCEPT-SENTENCE(percept, t))
    action ← ASK(KB, MAKE-ACTION-QUERY(t))
    TELL(KB, MAKE-ACTION-SENTENCE(action, t))
    t ← t + 1
    return action
```

| AIMA step | WO implementation |
|---|---|
| `MAKE-PERCEPT-SENTENCE` | a `perceive_*` function returns a `PerceptSet` (symbol → true/false/unknown + evidence) |
| `TELL(percepts)` | `KBAgent.tell(percepts)` sets the working memory to `percepts.known()` — unknown percepts are **not** asserted |
| `ASK` (system event) | `KBAgent.ask_decision()` → `forward.decide(rules, working_memory)` (forward chaining + conflict resolution) |
| `ASK` (user question) | `KBAgent.ask_goal(goal)` → `BackwardChainer.ask(goal, working_memory)` |
| `TELL(action)` | `KBAgent.tell_action(action)` appends to `history` and increments `t`; the service then persists the action as a `recommendations` row (the durable "action sentence") |

`KBAgent.run_cycle(percepts, variables, …)` performs one full cycle: TELL → forward-chaining decision →
`ExplanationBuilder.build(...)` (which also runs backward chaining on the requested goals to find missing data) →
`tell_action`. The agent is created with the rule categories it may use:

| Caller | Categories | Focus |
|---|---|---|
| `irrigation_service.recommend` | `irrigation`, `decision`, `advisory`, `alert` | `focus_group="irrigation_action"`, goals `irrigate_today`, `skip_irrigation_today` |
| `hydro_service.evaluate_system` | `hydroponics` | `primary_symbols=HYDRO_PRIMARY`, goal `hydro_status_ok` |
| `alert_service._run_alert_rules` | `alert` | alerts only |

The rule set comes from `load_knowledge(db)`, which returns an immutable `KnowledgeSnapshot` (active rules as
`HornRule` objects, numeric parameters, parsed axioms, percept catalog) for every request, so knowledge-base edits are
visible immediately.

---

## 2. Perception layer

A **percept** (`perception/base.py::Percept`) is `{symbol, value: true | false | null, evidence, flip_en, flip_ar}`.

- `value = null` means **unknown**: an input it depends on is missing. Unknown percepts are never told to the KB; they
  carry `evidence.reason` and `evidence.missing_fields`, which become the explanation's `missing_data`.
- `evidence` holds the inputs, threshold and comparison that produced the value.
- `flip_en/flip_ar` describe the condition that would flip the percept (e.g. *"available water ≥ 1,892.7 L"*). The
  explanation uses them for *what could change this*.

### 2.1 Percept catalog

The catalog is stored in `knowledge_percepts` (27 symbols, full list in
[knowledge-base.md §5](knowledge-base.md#5-percept-catalog)). How each one is computed:

| Symbol(s) | Computed in | True when | Unknown when |
|---|---|---|---|
| `weather_available` | `irrigation.py`, `farm.py::perceive_weather` | weather status is `fresh` or `cached` | never (false when `unavailable`) |
| `weather_stale` | same | snapshot age > `stale_weather_hours` (12 h) | never (false when there is no snapshot) |
| `not_yet_planted`, `stage_initial`, `stage_development`, `stage_mid`, `stage_late`, `season_ended` | `irrigation.py` via `fao56.growth_stage` | exactly one of them, from days since planting vs FAO-56 stage lengths (or a manual stage override) | no planting date and no override; or stage lengths undefined for an annual crop |
| `et_demand_positive` | `irrigation.py` | ETc > 0 | ET0 missing (no weather and no manual ET0), or no stage |
| `rain_covers_demand` | `irrigation.py` | P_eff ≥ ETc, with P_eff = `effective_rainfall_fraction` × P | precipitation (or ETc) missing |
| `rain_expected` | `irrigation.py` | forecast P ≥ `rain_event_min_mm` (1 mm) | precipitation missing |
| `high_evaporative_demand` | `irrigation.py` | ET0 ≥ `high_et0_mm` (7 mm/day) | ET0 missing |
| `water_sufficient` / `water_limited` | `irrigation.py` | available ≥ gross requirement / available < gross requirement | available water not recorded, or gross requirement not computable |
| `water_critical` | `irrigation.py` | available < `critical_supply_ratio` (0.5) × gross | same |
| `drought_sensitive_crop` | `irrigation.py` | crop Ky > 1 (FAO-33) | Ky not documented for the crop |
| `low_efficiency_method` | `irrigation.py` | efficiency < `low_efficiency_threshold` (0.70) | never |
| `usage_spike` | `farm.py::perceive_usage` | latest day's farm total > `usage_spike_factor` (1.5) × median of up to 30 earlier days | no records, or fewer than `min_history_days` (7) earlier days |
| `records_missing` | `farm.py::perceive_records_gap` | days since the last record of an active planting > `missing_record_days` (3) | never |
| `ph_below_range`, `ph_above_range`, `ec_below_range`, `ec_above_range` | `hydroponics.py` | latest reading outside the **system's configured** min/max | no record, no reading, or the corresponding bound is not configured |
| `closed_loop_discharge` | `hydroponics.py` | closed-loop system reports discharged water > 0 | discharge not recorded (false for open systems) |
| `hydro_records_missing` | `hydroponics.py` | active system with no record, or latest record older than `hydro_missing_record_days` (2) | never |
| `hydro_usage_spike` | `hydroponics.py` | latest input/day > 1.5 × median of earlier records | fewer than 7 earlier records |
| `hydro_unaccounted_high` | `hydroponics.py` | unaccounted water / input > `hydro_unaccounted_fraction` (0.10) | water balance incomplete (see [hydroponics.md](hydroponics.md)) |

The stage percepts are mutually exclusive by construction, which matches `axiom_stage_exclusive`; likewise
`water_sufficient` and `water_limited` are always complementary (`axiom_water_partition`) and `water_critical` implies
`water_limited` (`axiom_water_critical`).

### 2.2 Data quality

`perceive_irrigation` also sets `data_quality`, reported with every irrigation explanation:

| Value | Condition (checked in this order) |
|---|---|
| `manual_et0` | the request supplied `et0_override_mm` |
| `stale_weather` | the weather snapshot is older than `stale_weather_hours` |
| `fresh` | weather status is `fresh` or `cached` and not stale |
| `no_weather` | no weather snapshot and no manual ET0 |

Every hydroponic evaluation reports `data_quality = "measured"`. `hydro_service.evaluate_system` passes it to the
agent cycle, so the value is the same in the record response, in `GET /api/hydroponics/{id}/evaluation`, in the
chatbot's hydroponic answer and in the stored hydroponic recommendation (`add_record` copies the explanation's
`data_quality`).

---

## 3. Rule language and known-false semantics

```text
rule       := antecedent "=>" literal
antecedent := literal ("&" literal)*
literal    := symbol | "~" symbol
symbol     := [a-z][a-z0-9_]*
```

`rules/rule.py::build_rule` parses the antecedent with the general propositional parser and then insists that it is a
conjunction of literals, that no symbol appears twice, that the consequent is a **single positive symbol**, and that
the consequent does not appear in its own body.

**`~x` means "x is known to be false".** It holds only when the percept `x` was observed as false, never when `x` is
unknown. Internally `Literal.atom` is `"x"` for a positive literal and `"~x"` for a negative one, and forward/backward
chaining treat `"~x"` as **a separate atom** (x̄) that is asserted only by perception. Consequences:

1. Every rule is a **definite clause** `l₁ ∧ … ∧ lₖ ⇒ h` over the atoms {x, x̄}. The knowledge base stays in Horn form,
   so PL-FC-ENTAILS and backward chaining remain **sound and complete** for atomic queries (AIMA §7.5.4) and run in
   time linear in the size of the KB.
2. "False" and "missing" are different states. A rule such as `R-IRR-001` (`… ∧ ~rain_covers_demand ∧ …`) cannot fire
   when the precipitation forecast is missing — the agent reports missing data instead of assuming no rain.
3. Negation is only meaningful for observable symbols. Validation rejects `~d` for a derived symbol `d`
   (`negation_on_derived`), and rules may not conclude percepts (`head_is_percept`).

For model checking and DPLL, `Literal.to_sentence()` translates `~x` to classical `¬x`
(`HornRule.to_sentence()` → `Implies(And(...), Symbol(head))`). Because classical semantics can prove some conclusions
by case analysis that Horn chaining cannot, the Logic Lab reports the results of all engines and an `agreement` flag
(`kb_service.ask`).

---

## 4. Forward chaining (PL-FC-ENTAILS) with conflict resolution

### 4.1 PL-FC-ENTAILS

`forward.py::forward_chain(rules, percepts, blocked=None, query=None)` is AIMA Fig. 7.15:

```text
count[r]  ← number of body literals of r
agenda    ← the atoms of all known percepts (x or ~x), in perception order
inferred  ← {}
while agenda not empty:
    p ← POP(agenda)                         # FIFO (collections.deque.popleft)
    if p in inferred: continue
    inferred ← inferred ∪ {p};  trace.append(p)
    if p = query: stop
    for each rule r with p in its body:
        count[r] ← count[r] − 1
        if count[r] = 0 and head(r) ∉ blocked:
            record FiredRule(order, code, premises, conclusion)
            facts[head(r)] ← true;  PUSH(head(r), agenda)
```

The result (`ForwardResult`) contains the final facts, the derived symbols in derivation order, the fired rules with
their firing order, and the **agenda trace** (the order in which atoms were popped). The trace is shown in the UI
("Agenda order") and returned in `explanation.trace.agenda`.

### 4.2 Two-pass decision with conflict resolution

Rules that represent alternative actions share an `action_group` (in the reference KB: `irrigation_action`).
`forward.py::decide` works in two passes:

1. **Pass 1** computes the full deductive closure. Every fired rule with an `action_group` joins that group's
   **conflict set**.
2. **Conflict resolution** (`conflict.py::resolve_conflicts`) orders each conflict set by the key
   `(-priority, -specificity, code)`:
   1. highest `priority` (salience),
   2. then the most **specific** rule (more antecedent literals = more information used),
   3. then the lowest rule code (deterministic tie-break).

   The first rule wins; the others are *overridden*. The heads of losing rules (when different from the winner's head)
   are added to a `blocked` set.
3. **Pass 2** re-runs forward chaining with the losing conclusions blocked, so nothing is derived from an overridden
   action (for example, `irrigate_today` cannot be derived from a losing `action_full_irrigation`). If nothing was
   blocked, pass 1 is the final result.

`conflict.py::explain_win` produces the human-readable reason ("priority 80 > 60", "more specific (3 vs 2
conditions)" or "rule order (…)") used for overridden alternatives.

In the reference knowledge base the irrigation actions are designed so that, in any world allowed by the axioms, at
most one group member can fire; model checking confirms this (no `overlap_resolved` or `conflict` issue in the
validation report, see [logic.md §6](logic.md#6-knowledge-base-validation)). Conflict resolution therefore matters when
an administrator adds overlapping rules — equal-priority overlaps are rejected at save time, different-priority overlaps
are resolved by the procedure above.

---

## 5. Backward chaining (AND-OR proof search with missing data)

`backward.py::BackwardChainer.ask(goal, facts)` answers a single goal literal by goal-directed AND-OR search. Each node
of the proof tree (`ProofNode`) has one of three statuses:

| Status | Meaning |
|---|---|
| `proven` | the literal is a known fact, or every body literal of some rule for it is proven |
| `disproven` | the literal is known to be the opposite, or every rule for it has a body literal that is disproven, or no rule concludes it |
| `unknown` | not proven, and at least one rule depends on a percept that is not known yet |

Algorithm (`prove(lit, visiting)`):

- known fact → `proven` / `disproven`;
- a **percept** that is not known → `unknown` leaf with reason *"percept not available (missing data)"*;
- a negative literal on a non-percept → `disproven` (negation is only defined for percepts);
- a symbol already on the current path → `disproven` ("cycle detected") — loop detection;
- otherwise an **OR node** over the rules concluding the symbol (sorted by priority, highest first). For each rule an
  **AND node** proves all body literals; the OR node stops at the first proven rule. Results are memoised per atom.

After the search, `collect` walks only through `unknown` nodes and gathers the unknown percept leaves. These are the
**missing percepts** — exactly the data that would be needed to answer. They are returned only when the goal is not
proven.

Where backward chaining is used:

- **Every irrigation explanation**: goals `irrigate_today` and `skip_irrigation_today`; when no action wins, their
  missing percepts become `missing_data` (with user-facing hints from `perception/irrigation.py::MISSING_FIELD_HINTS`).
- **The chatbot**: `missing_data` drives slot filling. It asks for ET0 and rain when weather fields are missing, and
  for the available water when only that is missing (§9.4).
- **The Logic Lab** (`POST /api/knowledge-base/ask`) for any positive goal symbol, with the full proof tree; the UI
  renders it with `frontend/src/components/explain/ProofTree.tsx`.

---

## 6. Explanation contract

`explanations/builder.py::ExplanationBuilder.build` turns a `Decision` into the dictionary returned by the API
(`explanation` in `POST /api/irrigation/recommendation`, `evaluation` in hydroponic responses, `payload` of stored
recommendations). It answers six questions:

| Key | Content | How it is computed |
|---|---|---|
| `recommendation` | `{action, rule, title_en/ar, text_en/ar, amount_l}` or `null` | winner of `focus_group`, or the first true symbol of `primary_symbols` that a fired rule concluded; texts are the rule's recommendation templates rendered with the perception variables; `amount_l` comes from the service (`gross_l` for full irrigation, the available water for deficit/critical, 0 for postpone/no irrigation) |
| `reason_en/ar` | sentence(s) | explanation templates of the fired rules on the **derivation path** of the winning conclusion (premises first) |
| `supporting_facts` | percepts and derived symbols with `value`, `evidence`, `used`, `derived` | `used` = the atom appears as a premise of a fired rule |
| `triggered_rules` | every fired rule with `fired_order`, antecedent, consequent, priority, group, role (`decision`/`alert`/`advisory`/`intermediate`), rendered explanation and source | from the forward-chaining result |
| `advisories`, `alerts` | fired `advise_*` and `alert_*` rules with rendered texts and severity | used by the alert service to create `alerts` rows |
| `alternatives` | the other rules of the focus group: `status="overridden"` (conditions held but lost conflict resolution, with the reason) or `status="not_fired"` with `blocking` leaves (each `false` or `unknown`) | `blockers()` follows derived symbols down to percepts (depth ≤ 3) |
| `what_could_change` | `{rule, condition_en/ar, effect_en/ar}` | only for alternatives whose blockers are all **known false** percepts with a flip text; the condition is the conjunction of the flips |
| `missing_data` | `{symbol, fields, hints, reason}` | when there is no winner: missing percepts of the backward-chaining goals |
| `calculation` | inputs, parameters, method, steps, result | from the FAO-56 calculation (irrigation only) |
| `certainty`, `data_quality`, `kb_version` | see §7 | |
| `trace` | engine name, `agenda`, `fired`, `conflict_resolution` (group, winner, candidates, overridden), `blocked`, `backward_chaining` (goal, status, missing, goals_expanded, proof) | |
| `percepts`, `fired_codes` | raw percept list and fired rule codes | used for alert evidence and UI keys |

**Insufficient-data rule.** If no recommendation can be derived, `recommendation` is `null`, `certainty` is
`insufficient_data` and the reason is exactly *"Insufficient data to generate a recommendation."* /
«لا توجد بيانات كافية لإعطاء توصية موثوقة.» (`INSUFFICIENT_EN/AR`), followed by `missing_data`.

The UI renders the contract with `frontend/src/components/explain/RecommendationCard.tsx` (sections *Recommendation ·
Why? · Facts used · Rules triggered · Why not alternatives · What could change this · Missing data*) and
`ReasoningFlow.tsx` (KB → Facts → Rules → Inference → Recommendation → Explanation).

---

## 7. Certainty

WO is deterministic and uses **no probabilities**.

- `certainty = "entailed"` — the recommended action is logically derived (forward chaining) from the known percepts
  and the active rules.
- `certainty = "insufficient_data"` — no action could be derived; `missing_data` lists what is needed.

Uncertainty about the *inputs* is expressed separately by `data_quality` (§2.2) and by the weather status
(`fresh | cached | unavailable`), never by a confidence score.

---

## 8. Alerts are forward-chaining output

`backend/app/services/alert_service.py` runs the agent with the `alert` category after the relevant events (weather
read/refresh, water record created, irrigation recommendation persisted, `POST /api/alerts/evaluate`) and the
hydroponic `alert_*` rules after each hydroponic record. `apply_alerts`:

- creates an `alerts` row for each fired alert rule in scope, with `evidence = {percepts, rule}`;
- deduplicates by `dedupe_key = "<rule code>|<scope>"` (for example `R-ALR-005|planting:<id>:irrigation`): an alert
  that is still open or acknowledged is not created again;
- **auto-resolves** open alerts in scope whose rule no longer fires (`resolved_reason` = *"Condition no longer holds
  (re-evaluated by the inference engine)."*).

---

## 9. Chatbot: deterministic NLU pipeline

The assistant (`POST /api/chatbot/query`) is a conversational front-end to the agent. It never generates free text:
every answer is a template filled with computed values.

```text
message ─▶ normalize ─▶ detect_intent ─▶ extract entities ─▶ dialogue state (slots) ─▶ intent handler
                                                              (session.state)            │
        ◀── template answer (AR/EN) + options + explanation ◀── services / KB agent ◀────┘
```

### 9.1 Normalisation (`nlu.py::normalize`)

1. Arabic-Indic and Persian digits → ASCII digits (`٠١٢…` → `012…`, `٫` → `.`, `،` → `,`);
2. remove tashkeel (diacritics) and tatweel `ـ`;
3. unify `أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`, `ئ → ي`;
4. lower-case;
5. strip thousands separators between digits (`5,000` → `5000`) and protect decimal points and commas between
   digits (`6.2` and `6,2` stay as decimals);
6. replace the remaining punctuation (`؟ ? ! . , ; : ( ) [ ] " ' « »`) with spaces and collapse whitespace.

Tokens are also compared after `strip_al`, which removes the definite article `ال`, `لل` and a one-letter proclitic
(`و ب ل ف`) before `ال`.

### 9.2 Intent detection (`detect_intent`)

`INTENT_PATTERNS` holds Arabic and English patterns for ten intents: `irrigation_advice`, `water_requirement`,
`water_usage`, `hydroponic_status`, `weather`, `alerts`, `explain_last`, `land_distribution`, `greeting`, `help`.

- a single-word pattern scores **1.0** if it matches a token (or its `strip_al` form);
- a multi-word pattern scores **1.0 + 0.5 × (number of spaces)** if it appears as a phrase;
- the best score must reach `INTENT_THRESHOLD = 1.0`;
- ties: `explain_last` wins a tie it is part of ("why …" questions); otherwise a single domain intent beats
  `greeting`/`help`; any other tie is **ambiguous** and the bot returns a fallback with suggestion chips.

Real outputs of `normalize` + `detect_intent` (run with the code on 2026-10-03):

| Message | Normalised | Intent (scores) | Entities |
|---|---|---|---|
| هل أسقي الطماطم اليوم؟ | `هل اسقي الطماطم اليوم` | `irrigation_advice` (3.5) | date = today |
| هل أسقي الطماطم بُكره؟ | `هل اسقي الطماطم بكره` | `irrigation_advice` (3.5) | date = tomorrow |
| Should I irrigate the tomatoes today? | `should i irrigate the tomatoes today` | `irrigation_advice` (1.0) | date = today |
| عندي ٣ م3 ماء | `عندي 3 م3 ماء` | none | quantity = 3000 L |
| كم استهلكت هذا الأسبوع؟ | `كم استهلكت هذا الاسبوع` | `water_usage` (1.0) | — |
| ليش؟ | `ليش` | `explain_last` (1.0) | — |
| Why should I irrigate? | `why should i irrigate` | `explain_last` (tie 1.0 / 1.0 with `irrigation_advice`) | — |
| hello, what is the weather | `hello what is the weather` | `weather` (domain beats greeting) | — |
| blah blah | `blah blah` | none → fallback | — |
| ET0 6.2 rain 0 | `et0 6.2 rain 0` | `weather` (1.0) | labelled: ET0 = 6.2, rain = 0 |
| التبخر 6.2 المطر 0 | `التبخر 6.2 المطر 0` | `weather` (1.0) | labelled: ET0 = 6.2, rain = 0 |
| ET0: 5.5, rain: 1.2 | `et0 5.5 rain 1.2` | `weather` (1.0) | labelled: ET0 = 5.5, rain = 1.2 |
| الماء 5000 | `الماء 5000` | none | labelled: water = 5000; quantity = 5000 L |
| 5,000 لتر | `5000 لتر` | none | quantity = 5000 L |
| ٦٫٢ و ٠ | `6.2 و 0` | none | numbers = 6.2, 0 |

All rows were re-run on 2026-10-03 after the normalisation change in steps 5–6. The first nine rows give the same
results as before; the last six show labelled inputs, decimals and thousands separators. A message such as "ET0 6.2 rain 0" scores as `weather` because of the word
"rain". When the bot has just asked for weather inputs, §9.4 treats it as the answer to that question.

### 9.3 Entities

| Entity | Function | Recognises |
|---|---|---|
| quantity (L) | `extract_quantity_l` | a number with `L`, `liter(s)`, `litre(s)`, `لتر`, `ليتر` (litres) or `m3`, `م3`, `متر مكعب`, `kl` (× 1000); a bare number ≥ 1 is read as litres |
| date | `extract_date` | today (`اليوم`, `today`, `now`, `الحين`, `الان`), tomorrow (`بكره`, `بكرا`, `غدا`, `باكر`, `tomorrow`), yesterday (`امس`, `البارحه`, `yesterday`), or `YYYY-MM-DD` |
| planting | `match_candidates` | the user's **own** active plantings, matched by crop English/Arabic name, crop code, crop aliases and variety |
| hydroponic system / farm | `ChatbotService.hydro` / `.weather` | normalised system or farm name contained in the message |
| labelled manual inputs | `extract_labeled` | a number directly after a label (optionally followed by `:` or `=`): **ET0** (`et0`, `eto`, `et₀`, `تبخر`, `التبخر`, `التبخر النتح`, `تبخر نتح`), **rain** (`rain`, `rainfall`, `precipitation`, `مطر`, `المطر`, `امطار`, `الامطار`, `هطول`, `الهطول`), **water** (`water`, `available`, `ماء`, `الماء`, `مياه`, `المياه`, `متاح`, `المتاح`). The longest matching label wins. |
| bare numbers | `numbers` | all numbers in the message, in order (used when the bot asked for weather inputs and the reply has no labels) |

All candidate lists come from `visible_farms_query(user)`, so the chatbot can only see the user's farms.

### 9.4 Dialogue state and slot filling

`chat_sessions.state` (JSON) persists between messages. It holds:

- `slots`: `planting_id`, `system_id`, `date`, and the manual inputs `et0_override_mm`,
  `precipitation_override_mm` and `available_water_l`;
- `pending`: `{intent, slot}` of an open question, where `slot` ∈ `planting`, `system`, `weather_inputs`,
  `available_water_l`;
- `options_map`: chip label/value → id;
- `last`: a summary of the last answer, used by `explain_last`.

Rules in `ChatbotService.handle`:

- **Answering a pending question.** A message answers the open question if any of these is true:
  - it has no intent, the same intent, or is one of the offered options;
  - the pending slot is `weather_inputs` and the message has an ET0/rain label or any number;
  - the pending slot is `available_water_l`, the message has a quantity, and its intent is not `water_usage`.

  The answer then fills the pending slot:

  | Pending slot | Filled from |
  |---|---|
  | `planting` | a chip, or a single matched crop → `planting_id` |
  | `system` | a chip → `system_id` |
  | `weather_inputs` | unlabelled numbers: the first → `et0_override_mm`, the second → `precipitation_override_mm` |
  | `available_water_l` | the quantity, or the labelled water value → `available_water_l` (skipped when the message carries ET0/rain labels) |
- **Labelled numbers in any message** are stored as manual inputs: ET0 → `et0_override_mm`, rain →
  `precipitation_override_mm`, water → `available_water_l`. The optional request fields `et0_override_mm`,
  `precipitation_override_mm` and `available_water_l` of `POST /api/chatbot/query` overwrite them. The values in use
  are echoed in `nlu.entities.manual_inputs`.
- **A new, different intent** keeps the three manual inputs and forgets the other slots, including the previous
  planting.

Slot filling is driven by the agent:

- **More than one candidate planting** → `status="clarification"`, *"Which planting do you mean?"* with up to 8
  quick-reply options.
- **Recommendation not possible** → `status="missing_data"`. The reply starts with the fixed sentence *"Insufficient
  data to generate a recommendation."* (Arabic: «لا توجد بيانات كافية لإعطاء توصية موثوقة.») and lists the
  explanation's `missing_data` hints. Then:
  1. if a missing field is `et0` or `precipitation`, the bot sets `pending = {irrigation_advice, weather_inputs}` and
     asks for today's ET0 and expected rain, e.g. *"ET0 6.2 rain 0"*. Weather is asked for first because the water
     comparison depends on the requirement, which needs ET0;
  2. otherwise, if `available_water` is missing, it sets `pending = {irrigation_advice, available_water_l}` and asks
     *"How many litres of water are available today?"*.

This dialogue is tested end to end in `backend/tests/test_ai_endpoints.py::test_chatbot_slot_filling_offline_weather_then_water`
(weather offline):

1. «هل أسقي الطماطم اليوم؟» → missing data, asks for ET0 and rain;
2. «التبخر 6.2 المطر 0» → missing data, asks how many litres are available;
3. «5000 لتر» → answer `action_deficit_irrigation` (R-IRR-003);
4. «ليش؟» → `explain_last`.

### 9.5 Intent handlers

| Intent | Handler | Data used |
|---|---|---|
| `irrigation_advice` | `irrigation` | `irrigation_service.recommend(..., persist=False)` with the manual ET0, rain and available water from the slots: a full agent cycle. The chat does **not** store a recommendation. |
| `water_requirement` | `requirement` | `irrigation_service.prepare` (with the manual ET0/rain, if any) → FAO-56 result (ETc, P_eff, NIR, net, gross) |
| `water_usage` | `usage` | `water_service.analytics` for the last 7 days |
| `hydroponic_status` | `hydro` | `hydro_service.evaluate_system` (agent with hydroponic rules) |
| `weather` | `weather` | `weather_service.get_weather`; states that humidity is *air humidity, not soil moisture* |
| `alerts` | `alerts` | up to 5 open alerts |
| `explain_last` | `explain` | the stored summary: reason, rules, facts used, what could change |
| `land_distribution` | `land` | static guidance pointing to the Land Distribution page |
| `greeting`, `help` | `greeting` | capability statement + suggestion chips |

Every user and assistant message is stored in `chat_messages` with its NLU result or explanation payload.

---

## 10. Fully worked example (computed with the code)

The following was produced by running the real modules (`perceive_irrigation` → `KBAgent.run_cycle`) with the
reference knowledge base from `reference_data.py`, i.e. the same content migration `0002` loads. The input values are
an **illustrative scenario** chosen for this document, not measured data.

<details><summary>Script used (run from <code>backend/</code> with <code>/home/claude/.venv-wo/bin/python</code>)</summary>

```python
from datetime import date
from app.ai.knowledge_base import reference_data as ref
from app.ai.knowledge_base.loader import KnowledgeSnapshot
from app.ai.logic.syntax import parse
from app.ai.rules.rule import build_rule
from app.agronomy.fao56 import CropParams
from app.ai.perception.irrigation import IrrigationContext, WeatherDay, perceive_irrigation
from app.ai.agent import KBAgent, IRRIGATION_CATEGORIES

# Knowledge snapshot built from reference_data (same content as migration 0002, no database needed)
rules = [build_rule(r["code"], r["antecedent"], r["consequent"], priority=r["priority"],
                    action_group=r["action_group"], category=r["category"], meta=r)
         for r in sorted(ref.rule_rows(), key=lambda r: r["code"])]
kb = KnowledgeSnapshot("ref", 1, rules, {f["key"]: f["value"] for f in ref.FACTS},
                       {a["key"]: parse(a["value"]) for a in ref.axioms()},
                       {p["symbol"]: p for p in ref.percept_rows()})

t = next(r for r in ref.crop_rows() if r["code"] == "tomato")
crop = CropParams(t["name_en"], t["kc_ini"], t["kc_mid"], t["kc_end"], t["l_ini"], t["l_dev"],
                  t["l_mid"], t["l_late"], t["max_height_m"], t["is_perennial"], t["ky"])
ctx = IrrigationContext(crop=crop, crop_name_en="Tomato", crop_name_ar="طماطم", area_m2=500.0,
        efficiency=0.90, efficiency_source="Drip default (FAO TM4)", target_date=date(2026, 10, 3),
        planting_date=date(2026, 8, 20), stage_override=None, available_water_l=1200.0,
        available_source="request",
        weather=WeatherDay(status="fresh", snapshot_id="example", age_hours=2.0, et0_mm=6.2,
                           precipitation_mm=2.0, rh_min=30.0, wind_mean_10m=3.0), params=kb.params)
perc = perceive_irrigation(ctx)
cycle = KBAgent(kb, IRRIGATION_CATEGORIES).run_cycle(
    perc.percepts, perc.variables, focus_group="irrigation_action",
    goals=["irrigate_today", "skip_irrigation_today"],
    amounts={"action_deficit_irrigation": 1200.0}, calculation=perc.calculation,
    data_quality=perc.data_quality)
explanation = cycle.explanation
```

</details>

### 10.1 Inputs

| Input | Value |
|---|---|
| Crop | Tomato — FAO-56 row: Kc_ini 0.6, Kc_mid 1.15, Kc_end 0.80; L = 30/40/40/25 days; h = 0.6 m; Ky = 1.05 |
| Planting date → target date | 2026-08-20 → 2026-10-03 (44 days) |
| Area, method | 500 m², drip (efficiency 0.90, FAO TM4) |
| Weather (status `fresh`, 2.0 h old) | ET0 6.2 mm, precipitation 2.0 mm, RHmin 30 %, mean wind at 10 m 3.0 m/s |
| Available water today | 1,200 L |

### 10.2 FAO-56 calculation (`calculation.steps`)

| Step | Formula | Values | Result |
|---|---|---|---|
| Growth stage | days since planting vs Table 11 | day 44; L = 30/40/40/25 | `development` (day 14 of 40) |
| Wind conversion | u₂ = u₁₀ · 4.87 / ln(67.8·10 − 5.42) (Eq. 47) | u₁₀ = 3.0 | u₂ = 2.244 m/s |
| Kc_mid adjustment | Kc_mid + \[0.04(u₂−2) − 0.004(RHmin−45)\]·(h/3)^0.3 (Eq. 62) | 1.15, u₂ 2.244, RHmin 30, h 0.6 | 1.193 (Δ = +0.043) |
| Kc_end adjustment | same, because Kc_end ≥ 0.45 (Eq. 65) | 0.80 | 0.843 |
| Crop coefficient | Kc = Kc_ini + (i/L_dev)(Kc_mid − Kc_ini) (Eq. 66) | 0.6 + (14/40)(1.193 − 0.6) | **0.8076** |
| Crop ET | ETc = Kc × ET0 | 0.8076 × 6.2 | **5.007 mm/day** |
| Effective rain | P_eff = 0.8 × P | 0.8 × 2.0 | 1.600 mm |
| Net requirement | NIR = max(0, ETc − P_eff) | 5.007 − 1.600 | 3.407 mm |
| Net volume | NIR × area (1 mm·m² = 1 L) | 3.407 × 500 | 1,703.45 L |
| Gross volume | net / efficiency | 1,703.45 / 0.90 | **1,892.72 L** |

### 10.3 Percepts (TELL)

All 17 irrigation percepts are known in this scenario:

| Percept | Value | Evidence |
|---|---|---|
| `weather_available` | true | status `fresh` |
| `weather_stale` | false | age 2.0 h ≤ 12 h |
| `not_yet_planted`, `stage_initial`, `stage_mid`, `stage_late`, `season_ended` | false | day 44, stage `development` |
| `stage_development` | true | day 44 |
| `et_demand_positive` | true | ETc = 5.007 mm |
| `rain_covers_demand` | false | P_eff 1.6 < ETc 5.007 |
| `rain_expected` | true | P 2.0 ≥ 1.0 mm |
| `high_evaporative_demand` | false | ET0 6.2 < 7.0 |
| `water_sufficient` | false | 1,200 < 1,892.72 L (coverage 63.4 %) |
| `water_limited` | true | same |
| `water_critical` | false | 1,200 ≥ 0.5 × 1,892.72 = 946.4 L |
| `drought_sensitive_crop` | true | Ky 1.05 > 1 |
| `low_efficiency_method` | false | 0.90 ≥ 0.70 |

### 10.4 Agenda and fired rules (ASK by forward chaining)

Agenda trace (21 atoms, in pop order):

```text
weather_available, ~weather_stale, ~not_yet_planted, ~stage_initial, stage_development, ~stage_mid,
~stage_late, ~season_ended, et_demand_positive, ~rain_covers_demand, rain_expected,
~high_evaporative_demand, ~water_sufficient, water_limited, ~water_critical, drought_sensitive_crop,
~low_efficiency_method, irrigation_needed, alert_water_shortage, action_deficit_irrigation, irrigate_today
```

| Order | Rule | Premises | Conclusion |
|---|---|---|---|
| 1 | `R-IRR-001` | et_demand_positive, ~rain_covers_demand, ~season_ended, ~not_yet_planted | `irrigation_needed` |
| 2 | `R-ALR-005` | irrigation_needed, water_limited | `alert_water_shortage` |
| 3 | `R-IRR-003` | irrigation_needed, water_limited, ~water_critical | `action_deficit_irrigation` |
| 4 | `R-IRR-009` | action_deficit_irrigation | `irrigate_today` |

Conflict resolution: group `irrigation_action`, candidates `[R-IRR-003]`, winner `R-IRR-003`, nothing overridden,
nothing blocked (so pass 2 was not needed).

Backward chaining on the decision goals: `irrigate_today` **proven** (12 goals expanded); `skip_irrigation_today`
**disproven** (12 goals expanded).

### 10.5 Recommendation and reason

```json
{
  "action": "action_deficit_irrigation",
  "rule": "R-IRR-003",
  "title_en": "Deficit irrigation",
  "text_en": "Apply the available 1,200 L (63% of the 1,892.7 L requirement) to Tomato.",
  "text_ar": "استخدم الماء المتاح 1,200 لتر (63% من الاحتياج 1,892.7 لتر) لري طماطم.",
  "amount_l": 1200.0
}
```

`reason_en`: *"The crop is in season, ETc (5.01 mm) is positive and effective rain (1.60 mm) does not cover it. Supply
is limited: 1,200 L available vs 1,892.7 L required, but above the critical ratio."* — the explanation templates of
`R-IRR-001` and `R-IRR-003` (the derivation path of `action_deficit_irrigation`).

`certainty = "entailed"`, `data_quality = "fresh"`. Alert produced: `R-ALR-005` *Water shortage* (warning) —
*"Available water (1,200 L) is below today's requirement (1,892.7 L) for Tomato."*

### 10.6 Why not the alternatives

| Rule | Status | Reason |
|---|---|---|
| `R-IRR-002` Full irrigation | not fired | `water_sufficient` is false |
| `R-IRR-004` Critical water shortage | not fired | `water_critical` is false |
| `R-IRR-005` Postpone: rain covers demand | not fired | `rain_covers_demand` is false |
| `R-IRR-006` No irrigation: season ended | not fired | `season_ended` is false |
| `R-IRR-007` No irrigation: not yet planted | not fired | `not_yet_planted` is false |
| `R-IRR-013` No irrigation: no evaporative demand | not fired | `~et_demand_positive` is false |

### 10.7 What could change the decision

| Condition | Effect |
|---|---|
| available water ≥ 1,892.7 L | → Full irrigation (`R-IRR-002`) |
| available water < 946.4 L | → Critical water shortage (`R-IRR-004`) |
| effective rain ≥ 5.01 mm | → Postpone: rain covers demand (`R-IRR-005`) |

(The other three alternatives have blockers without a flip text — stage and season percepts — so they are not listed.)

### 10.8 Same planting, available water not recorded

Running the same script with `available_water_l=None` (and no farm daily allowance) gives:

- `water_sufficient`, `water_limited`, `water_critical` are **unknown** (reason *"available water for the day is not
  recorded"*, missing field `available_water`); only `R-IRR-001` fires;
- `recommendation = null`, `certainty = "insufficient_data"`, reason *"Insufficient data to generate a
  recommendation."*;
- backward chaining: `irrigate_today` **unknown** with missing percepts `water_sufficient`, `water_limited`,
  `water_critical` (15 goals expanded); `skip_irrigation_today` disproven;
- `missing_data[0].hints` = *"Water available today (litres)"* / «كمية الماء المتاحة اليوم (لتر)»;
- alternatives `R-IRR-002/003/004` are reported with blockers in state `unknown`, so they are not offered under *what
  could change*.

In the chatbot, this is the case that triggers the follow-up question *"How many litres of water are available
today?"*. Only `available_water` is missing here, because ET0 and rain are known.

### 10.9 A real API response (manual ET0, offline weather)

For comparison, this response was returned by the running API (`POST /api/irrigation/recommendation`, `persist=false`)
for a tomato planting of 1,000 m² in mid-season with `et0_override_mm = 6.0`, `precipitation_override_mm = 0` and
`available_water_l = 3000`, while weather was unavailable (offline mode):

- calculation: Kc = 1.15 (climatic adjustment skipped — no RHmin/u₂), ETc = 6.9 mm, NIR = 6.9 mm, net 6,900 L,
  gross 7,666.67 L, coverage 39.1 %;
- fired in order: `R-ALR-001` (weather unavailable), `R-IRR-001`, `R-ADV-003` (protect the sensitive stage),
  `R-ALR-005`, `R-IRR-004`, `R-ALR-006`, `R-IRR-010`;
- recommendation `action_critical_supply` (`R-IRR-004`): *"Critical shortage: apply the available 3,000 L (39% of
  need) and prioritise this planting only if it is the most sensitive."*;
- advisory `R-ADV-003`: *"Tomato is mid-season and drought-sensitive (Ky = 1.05): give it priority when sharing limited
  water."*;
- `certainty = "entailed"`, `data_quality = "manual_et0"`;
- what could change: available water ≥ 7,666.7 L → `R-IRR-002`; ≥ 3,833.3 L → `R-IRR-003`; effective rain ≥ 6.90 mm →
  `R-IRR-005`.
