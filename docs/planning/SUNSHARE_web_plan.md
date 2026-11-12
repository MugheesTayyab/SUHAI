# SunShare Continuity: Web App Context and Implementation Plan

Read this after `SUNSHARE_context_for_coding_agent.md`. That file explains the quantum work. This one explains the web app added on top of it, what is finished, and what is left before the deadline.

## 1. Analysis of where the project stood

| Area | State before this pass | Gap |
| --- | --- | --- |
| Quantum core (`src/`) | Complete, 18 tests passing, results recorded | None. Do not touch the maths |
| Reproduction (`run_all.py`) | Complete | None |
| README | Complete for the core | Did not mention any demo |
| Report (.docx) | Not started | Deliverable 2, still required |
| Video (3 min) | Script drafted in the plan | Needed something visual to show live |
| Submission | Not done | Deliverable 4 |
| Demo surface | Terminal and PNG files only | Judges score presentation (15 points) and want to see it work |

The original context said "no dashboard tonight". The team has since decided a web app is worth it for rubric E (presentation and defense) and to make rubric C (working, interpretable outputs) visible. The web layer was built so it cannot weaken B and C. It adds no solver and calls only the tested code.

## 2. Decisions for the web layer and why

| Decision | Reason |
| --- | --- |
| FastAPI backend that imports `src/` directly | The dashboard and the report can never disagree. One source of truth |
| Live QAOA runs stream progress through server sent events | Judges watch the optimiser search in real time. It proves the quantum part does real work |
| One optional `progress` callback added to `run_qaoa` | The only change to `src/`. Default is `None`, results are identical, all 18 core tests still pass |
| No frontend build step (plain ES modules, hand written SVG charts) | Nothing to install or compile on the stage laptop. `python serve.py` is the whole setup |
| The server calibrates its own speed at startup | The "about N seconds" estimate is measured on the machine in use, never a promise from another laptop |
| The standard 20 qubit encoding is capped at 2 layers on the quick budget | One layer takes minutes. The API refuses anything slower so a stray click cannot freeze the demo |
| Light, calm, glass theme. Manrope bold for headings, Inter for text | Matches the reference images the team chose. Premium without being dark |
| Copy has no dashes or colons in sentences, and every claim is backed by a number on screen | Reads as written by people, and keeps us inside the honest claims list |
| An honesty section on the story page | The organisers said limitations count in our favour. We show them, we do not bury them |

## 3. Architecture

```
Browser                                     Python (one process)
-------                                     --------------------
/            story page      ── fetch ──▶   server/app.py   FastAPI routes, input checks
/app         control room    ◀─ SSE ───          │
                                                 ▼
                                            server/engine.py
                                              • scenario variants (5 or 10 kWh battery)
                                              • exact, landscape, first come first served (cached)
                                              • plain language for the 16 fines
                                              • RunManager: one QAOA job at a time on a worker thread
                                                 │
                                                 ▼
                                            src/  (unchanged maths, tested)
                                              model · classical_solver · encode_compact
                                              encode_slack · qaoa_solver · decoder
```

## 4. API contract

| Route | Returns |
| --- | --- |
| `GET /api/health` | Status, Qiskit and Aer versions, measured ms per circuit evaluation |
| `GET /api/scenario?battery_blocks=1` | Slots, services, the 11 variables with plain labels |
| `GET /api/exact` | Exact best by enumeration, its schedule, 52 of 2,048 valid, time taken |
| `GET /api/landscape` | All 2,048 schedules as valid or not, with objective. Index k has qubit i equal to bit i of k |
| `GET /api/fcfs` | First come first served for all 24 arrival orders |
| `GET /api/fines?penalty=12` | The 16 fines, as code and as plain words, two marked three way |
| `GET /api/circuit` | Qubits, two qubit gates, depth for both encodings (46 vs 106) |
| `POST /api/evaluate` | Any hand made schedule: rules broken, benefit, objective, quantum cost, fines fired |
| `POST /api/runs` | Starts a live QAOA run. Body: encoding, layers, penalty, battery_blocks, shots, budget, seed |
| `GET /api/runs/{id}/stream` | Server sent events: queued, started, optimise, sample, layer_done, done or failed |
| `GET /api/runs/{id}` | Final result: shares, top 24 samples, benefit histogram, density over all 2,048 days |
| `DELETE /api/runs/{id}` | Stops a run between optimiser steps |
| `GET /api/evidence` | `results/results.json` from the recorded full run |

All routes are browsable and runnable at `/docs`.

## 5. Frontend map

| File | Job |
| --- | --- |
| `web/index.html`, `assets/js/landing.js` | Story page: hero with the living village, the day, the 2,048 grid, the encoding toggle, the 16 fines, how it runs, proof charts, what if, honesty |
| `web/app.html`, `assets/js/app.js` | Control room: hero scene with time of day scrubber and battery switch, KPI tiles, live run with optimiser trace, the plan, samples list, landscape density, rule lab, evidence |
| `assets/js/scene.js` | The village in SVG. Sun moves through the day, only powered services light up |
| `assets/js/charts.js` | Live trace, grouped bars, dot strip, histogram, 2,048 cell grid. Every chart has hover |
| `assets/js/motion.js` | Cursor ring, light that follows the cursor, magnetic buttons, tilt, word by word headlines, count ups, reveal with a safety net |
| `assets/js/api.js`, `ui.js` | API client, shared slot columns and icons |
| `assets/css/*.css` | Tokens and glass in `base.css`, one file per page |

Service colours were checked with a colour blind validator and every coloured block also carries its name.

## 6. What is built and verified

* 30 automated checks pass: the 18 original ones and 12 for the API, including a real streamed QAOA run.
* A scripted browser walkthrough clicked through every control with zero JavaScript errors: run, pick a sample, rule lab, time of day keys, 10 kWh battery (best becomes 28, nobody waits), unlucky queue, encoding switch, story page what if.
* The live run in the browser reproduces the recorded numbers exactly (24.5% valid at one layer, 45 of 4,096 samples are the exact best) because the seeds are fixed.
* Checked at 1440 px desktop and 390 px phone widths with no sideways scrolling.
* On the development laptop one layer takes about 5 seconds. The 2 layer quick run takes about 30 seconds.

## 7. Remaining work, in priority order

| # | Task | Owner | Time |
| --- | --- | --- | --- |
| 1 | On the stage laptop run `pip install -r requirements.txt`, `python -m pytest tests -q`, `python serve.py`. Click Run once | A | 10 min |
| 2 | Commit everything except `.venv`, push, make the repo public, clone into a fresh folder and repeat step 1 | A | 15 min |
| 3 | Report: add a "Demo" subsection with `docs/screens/control_room.png` and one sentence that the dashboard calls the same tested code | B | 10 min |
| 4 | Video: record using the script in section 8 | C | 40 min |
| 5 | Test every link in a private window. Submit the form by 11:15pm | All | 15 min |

If time is short, skip 3. Never skip 1, 2 and 5.

## 8. Stage and video script for the web app (about 90 seconds)

1. **Story page, hero.** "A village has too little sun for one day. Which service runs when?" Let the day loop run once.
2. **Scroll to the 2,048 grid.** Hover a few squares. "Only 52 of 2,048 days keep every rule. The server checks each one as I hover."
3. **Scroll to the encoding toggle.** Click Standard, then SunShare. "Twenty qubits become eleven. Less than half the two qubit gates."
4. **Open the control room. Press R.** "This is Qiskit running now. The green line is the best cost so far." Wait for Done.
5. **Point at the KPIs and the plan.** "About a quarter of samples keep every rule, ten times random guessing. The best valid sample is the exact best."
6. **Click a red row in the samples list.** "This one broke a rule. Here is which one. We never trust a sample we did not check."
7. **Press B.** "Give the battery one more block and the evening lights come on."
8. **Scroll to the honesty cards on the story page.** "No speedup, synthetic numbers, ideal simulator. We say it plainly."

## 9. Traps

* Start the server from the repository root, or imports of `src` fail.
* If the projector machine has no internet, Google Fonts fall back to system fonts. Everything else is local.
* A standard encoding run takes minutes. Do not start one on stage unless you mean to wait.
* `?shot` in the URL turns off entrance animations. It exists for screenshots. Do not present with it.
* Port 8000 busy? `python serve.py --port 8010`.
* Do not edit a test to make it pass. Do not change the scenario, penalty or variable order.

## 10. Where each rubric line is visible on screen

| Criterion | Where a judge sees it |
| --- | --- |
| A. Problem validity | Story sections 01 and 02. Supply per slot, four services, protected vaccine fridge, 52 of 2,048 valid |
| B. Quantum utilisation | Encoding toggle (20 to 11 qubits, 106 to 46 gates), the 16 fines with the two three way terms marked, live optimiser trace |
| C. Implementation and validation | Live run, samples checked one by one, exact best comparison, first come first served lottery, rule lab cost formula |
| D. Innovation | Compact encoding, the rule lab that prices any day exactly like the circuit, density of samples over all 2,048 days |
| E. Presentation | The story page itself, the control room, and the 90 second script above |
