# Suhai

### Power what matters. When it matters.

**Live site: [suhai.vercel.app](https://suhai.vercel.app)** · **Control room: [suhai.vercel.app/app](https://suhai.vercel.app/app)** · **Code: [github.com/MugheesTayyab/SUHAI](https://github.com/MugheesTayyab/SUHAI)**

Built for the Qiskit Fall Fest 2026 Hackathon, domain 6, Energy and Smart Infrastructure.

![Suhai home page](docs/screens/hero.png)

## The problem, in one breath

685 million people had no electricity at all in 2022
([Tracking SDG7, 2024](https://www.worldbank.org/en/news/press-release/2024/06/11/progress-on-basic-energy-access-reverses-for-first-time-in-a-decade)),
and many more live on a small solar system that cannot run everything at once.

Picture one village. The sun gives 40 kWh in a day, most of it at midday and none after dark.
A small battery holds 5 kWh more. Four services want that energy.

* **Milk chilling.** Raw milk spoils within hours without cold.
* **Irrigation.** The fields need water while the sun is up.
* **Water purification.** Families need clean drinking water.
* **Household essentials.** Light and phone charging after dark.

There is not enough for all of them. Today the choice is usually made by whoever asks first.
In the unlucky order, that day is worth **9**. Planned well, the very same sunlight is worth **25**.

The clinic's vaccine fridge is powered first, every time, and is never part of the trade.

![Why it matters](docs/screens/impact.png)

## What Suhai does

Suhai turns the day into **11 yes or no choices**. Seven say which service runs in which part of the day.
Four say where the battery is used. That makes 2,048 possible days, and only 52 of them keep every rule.

A quantum computer holds all 2,048 days at once. Suhai tunes it so the good days become likely,
measures it 4,096 times, and **checks every single answer against the rules** before anyone acts on it.
What comes out is one plan anyone in the village can follow, written in plain words.

![The 11 qubits after measurement](docs/screens/qubits_measured.png)

Each circle is one qubit, and each qubit is one real decision. Before measurement they flicker,
because every day is still possible. After measurement they settle into the plan. Here they chose
milk in the morning with the battery, irrigation at midday and water in the afternoon. That is
benefit 25, **the same day you get by checking all 2,048 by hand.**

![The plan and the comparison](docs/screens/plan_and_comparison.png)

## Why this is the clever part

The usual way to put energy limits on qubits adds **helper qubits** that only count spare energy.
For this village that means 9 helpers, so **20 qubits**.

Suhai instead lists the 16 smallest combinations that break a rule, like "milk chilling twice" or
"irrigation in the afternoon without the battery", and fines each one directly. No helpers.
**11 qubits, and every one of them is a real decision.**

![Suhai against the standard method](docs/screens/quantum_vs_classical.png)

## Results at a glance

From our recorded run (`results/results.json`, Qiskit 2.6.2, Aer statevector simulator, seeds fixed).
Both encodings got the same optimiser budget: 3 starting points, 150 steps per layer.

| Measure | Standard, 20 qubits | Suhai, 11 qubits |
| --- | --- | --- |
| Helper qubits | 9 | **0** |
| Two qubit gates per layer | 106 | **46** |
| Circuit depth per layer | 60 | **55** |
| Answers that keep every rule, 1 layer | 6.2% | **24.5%** |
| Answers that keep every rule, 2 layers | 10.0% | **52.6%** |
| Answers that are the exact best, 2 layers | 0.24% | **3.12%** |
| Simulator time, 1 layer | 136 s | **3.7 s** |
| Best day found | 25 | 25 |

* **3.9 times** the valid answers on the same budget, with 9 fewer qubits.
* Checking all 2,048 days gives the exact best, 25. Only 52 days are valid at all.
* Suhai at 1, 2 and 3 layers (larger budget): 24.5%, 52.6% and 69.8% valid. The best valid answer is the exact best at every depth.
* Random guessing: 2.5% valid. First come first served over all 24 arrival orders: 9 to 25, average 16.8.
* With a 10 kWh battery the best day rises to 28 and households get evening light. The circuit finds that day too.

**What we do not claim.** A classical computer checks all 2,048 days faster on a village this small,
and we say so on every page. There is no quantum speedup here. The gain is fewer qubits and gates for
the same answer, which is what today's small, noisy quantum computers need.

## For judges: where each criterion is answered

| Criterion | Where to look |
| --- | --- |
| A. Problem validity | Home page "Why it matters" and "The problem": the goal, the four rules and the test village. `src/model.py` |
| B. Meaningful quantum use | The 11 qubit encoding with 16 fines against the 20 qubit standard one. `src/encode_compact.py`, `src/encode_slack.py`, `src/qaoa_solver.py` |
| C. Implementation and validation | Every sample checked against the rules, exact answer by enumeration, 34 automated tests, one command reproduces every number. `run_all.py`, `tests/` |
| D. Innovation | Fines on exact rule breaking combinations instead of helper qubits, and a protected clinic outside the optimiser |
| E. Presentation | The live site and control room, where you press Measure and watch the qubits choose the day |

## Setup

Python 3.10 or newer.

```
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## See it live (web app)

```
python serve.py                  # opens http://127.0.0.1:8000
```

| Page | What it does |
| --- | --- |
| `/` | The story. The village day, the 2,048 possible schedules, the encoding, the proof, and what we do not claim |
| `/app` | The control room. Runs QAOA live in Qiskit and streams every optimiser step to the browser |
| `/app?autorun` | Same, and starts a run as soon as the page loads. Handy on stage |
| `/docs` | Every API route, documented and runnable |

The web app adds no new solver. Every route calls the same functions in `src/`
that produced the report, so the dashboard and the report cannot disagree.
Shortcuts in the control room: `R` run, `Esc` stop, `1` to `4` time of day,
`B` battery size, `E` encoding.

![Control room](docs/screens/control_room.png)

## Put it online (Vercel)

The hosted copy is a static site, so it loads from the CDN with no cold start.
Vercel cannot run Qiskit inside a request, so the same Python code writes
everything ahead of time:

```
python build_static.py           # writes web/data/, records all 10 QAOA runs (about 20 minutes)
python build_static.py --no-runs # data only, keeps the runs already recorded
```

Then import the repository in Vercel. `vercel.json` does the rest: no build
step, `web/` is served as is, `/app` works without `.html`, and `/api/health`
points at `web/data/health.json` so the page knows it is the hosted copy.
`.vercelignore` uploads only `web/`.

On the hosted copy everything the browser checks is real. Schedules are scored
from the table Python wrote, and `tests/test_static.py` proves it matches Python
on all 4,096 schedules. QAOA runs are real Qiskit Aer runs, recorded once and
replayed step by step with their own timings. The page says so. For live runs on
stage, use `python serve.py`. The same pages then talk to Qiskit directly.

## Reproduce every result

```
python -m pytest tests -q        # 34 checks (18 core, 12 web API, 4 hosted copy), about 50 seconds
python run_all.py                # all tables and charts, about 10 minutes
python run_all.py --quick        # skips the slow 20 qubit runs, about 4 minutes
```

Outputs are written to `results/`:

| File | Content |
| --- | --- |
| `summary.md` | All result tables |
| `results.json` | Every number, machine readable |
| `architecture.png` | Architecture diagram |
| `encoding_cost.png` | Qubits and circuit size, both encodings |
| `quality_comparison.png` | Valid share and best answer share, both encodings |
| `depth_study.png` | Suhai encoding at 1, 2 and 3 QAOA layers |
| `fcfs_orders.png` | First come first served over all arrival orders |
| `timetable.png` | Best valid schedule sampled by QAOA |
| `timetable_whatif.png` | Same with a 10 kWh battery |

Random seeds are fixed. Small differences between machines are normal.

## Code map

| File | Job |
| --- | --- |
| `data/sample_scenario.json` | The test instance (synthetic values) |
| `src/model.py` | Choices, rules, scoring |
| `src/classical_solver.py` | Exact enumeration and first come first served |
| `src/encoding.py` | Cost formula as a polynomial, and its conversion to a qubit operator |
| `src/encode_compact.py` | Suhai encoding, 11 qubits |
| `src/encode_slack.py` | Standard encoding, 20 qubits |
| `src/qaoa_solver.py` | QAOA circuit, angle tuning, sampling |
| `src/decoder.py` | Validates and scores sampled schedules |
| `src/figures.py` | Charts and architecture diagram |
| `run_all.py` | One command that reproduces everything |
| `serve.py` | Starts the web app |
| `build_static.py` | Writes `web/data/` for the hosted copy and records the QAOA runs |
| `vercel.json`, `.vercelignore` | Hosting setup, static only |
| `server/engine.py` | Reshapes answers from `src/` for the browser, runs live QAOA jobs on a worker thread |
| `server/app.py` | FastAPI routes, request checks, live progress stream (server sent events) |
| `web/` | Story page and control room. Plain HTML, CSS and JavaScript, no build step |
| `web/assets/js/api.js` | Talks to the live server, or to `web/data/` on the hosted copy |
| `tests/test_server.py` | Proves the API returns the same answers as the report |
| `tests/test_static.py` | Proves the hosted copy says exactly what the live server says |

## Honest limitations

* The instance is tiny. Exact enumeration solves it instantly. We claim no quantum speedup.
* All input values are synthetic. Benefit scores are human value judgments.
* The battery is simplified: already charged, used in whole blocks, no wear.
* The Suhai encoding grows quickly if many services can share one slot.
* Two of its fines involve three choices at once, so it is a QUBO plus two higher order terms.
* Results come from an ideal simulator. Real hardware noise would lower quality.

## Credits

* Qiskit and Qiskit Aer (IBM), NumPy, SciPy, Matplotlib.
* Web app: FastAPI and Uvicorn. Font from Google Fonts (Geist).
  Charts and the village illustration are hand written SVG, no chart library.
* No tutorial code was copied. Development was assisted by an AI coding
  assistant. All code was reviewed and run by the team.
