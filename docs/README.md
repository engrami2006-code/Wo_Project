# WO — Water Optimization · Documentation

WO is a **knowledge-based intelligent decision support system** for agricultural water management, built for an
Introduction to Artificial Intelligence course. The reference text is Russell & Norvig, *Artificial Intelligence: A
Modern Approach*. It turns a farm's own data into explained decisions. A symbolic agent (TELL/ASK, forward and
backward chaining over Horn rules, model checking) decides irrigation and hydroponic actions. A\* search allocates
land between crops, and a CSP solver schedules irrigation. There is no machine learning and no generative AI. Every
recommendation lists the facts, rules, calculations and alternatives behind it.

Everything in these pages was written from the code in `backend/app/` and `frontend/src/`. The numeric examples were
produced by running that code; each page says how.

Project overview and quick start: [../README.md](../README.md) (English) · [../README_AR.md](../README_AR.md)
(Arabic). Review of the original build prompt and how it was rebuilt:
[../prompt/PROMPT_REVIEW_AR.md](../prompt/PROMPT_REVIEW_AR.md) (Arabic).

## Start here

| If you want to… | Read |
|---|---|
| understand the system in five minutes | [architecture.md](architecture.md) → [uml/README.md](uml/README.md) |
| find where each course concept is implemented, tested and shown | [traceability.md](traceability.md) |
| run WO locally (setup scripts, PostgreSQL or SQLite) or in Docker | [deployment.md](deployment.md) |
| see what WO does **not** do | [limitations.md](limitations.md) |

## All pages

### System

| Page | Contents |
|---|---|
| [architecture.md](architecture.md) | Runtime topology, technology versions, backend and frontend structure, layering rules, request flow, design decisions |
| [database.md](database.md) | Conventions, reference vs operational data, all 26 tables (columns, keys, indexes, checks), JSON columns, migrations |
| [api.md](api.md) | Conventions (auth, error envelope, pagination), all 82 operations, real request/response examples, the impact endpoint |
| [security.md](security.md) | Argon2id, JWT with revocation, roles and the farm permission matrix, 404-not-403 isolation, rate limiting, headers/CORS, audit log |
| [deployment.md](deployment.md) | Setup scripts for Windows and macOS/Linux, manual setup, SQLite fallback, environment variables, migrations, super admin, Docker Compose, optional demo data, VS Code workspace, production checklist |
| [testing.md](testing.md) | 88 backend tests (pytest, SQLite or PostgreSQL) and 17 frontend tests (Vitest), each mapped to spec §18; static checks; QA results of 2026-10-03 |

### AI and algorithms

| Page | Course chapter | Contents |
|---|---|---|
| [ai.md](ai.md) | ch. 7 | The knowledge-based agent: perception layer, rule language with known-false literals, forward chaining (PL-FC-ENTAILS) with conflict resolution, backward chaining with missing data, explanation contract, certainty, alerts, chatbot NLU, **a fully worked example computed with the code** |
| [knowledge-base.md](knowledge-base.md) | ch. 7 | Sources; all 39 rules, 16 parameters, 8 axioms and 27 percepts; agronomic reference tables; editing, versioning, audit |
| [logic.md](logic.md) | §7.4–7.6 | Syntax and semantics, CNF, TT-ENTAILS, DPLL, resolution, KB validation (Clark completion, domain axioms vs integrity constraints) with the **actual validation report** and a real Logic Lab run |
| [search.md](search.md) | ch. 3 | Land distribution as a search problem, admissible heuristics, BFS/UCS/Greedy/A\*, **a real comparison run** |
| [csp.md](csp.md) | ch. 6 | Irrigation scheduling as a CSP; AC-3, MRV + degree, LCV, forward checking; **real feasible and infeasible runs** |

### Domain

| Page | Contents |
|---|---|
| [agronomy.md](agronomy.md) | FAO-56 single crop coefficient pipeline (growth stage, Kc, ETc, effective rain, net and gross requirement), with worked numbers |
| [hydroponics.md](hydroponics.md) | Hydroponic systems, measured water balance, range checks and KB evaluation |
| [weather.md](weather.md) | Open-Meteo provider, payload validation, fresh / cached / unavailable fallback, snapshots; air humidity is not soil moisture |
| [limitations.md](limitations.md) | Honest list of simplifications, what is not yet verified, and future work |

### Diagrams and screenshots

- [uml/](uml/README.md): 11 Mermaid diagrams (architecture, use cases, 4 class diagrams, KB-AI components, chatbot
  sequence, irrigation flow, land-distribution search, ER), each as source, SVG and PNG.
- [screenshots/](screenshots/): 62 screenshots of the running application in English and Arabic, desktop and mobile.

### Presentation

`../presentation/WO-Presentation.html` is a 16-slide deck in English and Arabic. Move between slides with the arrow
keys, Space or PageUp/PageDown, or by clicking (the left third of the screen goes back). Press **F** for full
screen, **N** for speaker notes and **L** to switch the language; `?lang=ar` opens the deck in Arabic. Every statistic on a slide shows its source (FAO
AQUASTAT). The deck is also exported as `../presentation/WO-Presentation.pdf`, with previews in
`../presentation/preview/`.

## Key facts at a glance

All values were checked against the code or a run:

| | |
|---|---|
| REST operations (OpenAPI) | 82 |
| Database tables | 26 (2 Alembic migrations: schema, reference knowledge) |
| Knowledge base | 39 Horn rules · 16 parameters · 8 axioms · 27 percepts |
| FAO-56 reference crops | 32 |
| Roles | `SUPER_ADMIN`, `COMPANY_OWNER`, `FARM_MANAGER`, `EMPLOYEE`, `INDIVIDUAL` |
| Frontend pages | 22, Arabic and English with full RTL |
| Search limits | ≤ 60 land units, ≤ 6 candidate crops, 200,000-node budget |
| Model-checking limit | TT-ENTAILS refuses more than 20 symbols |

WO never claims a percentage of water saved. It computes *measured* savings only against a baseline period that the
farm itself recorded. *Apparent* savings (calculated requirement minus recorded use) are shown with a note that they
are not proof of real savings (see [api.md §4](api.md#4-impact-endpoint-and-the-four-quantities)).
