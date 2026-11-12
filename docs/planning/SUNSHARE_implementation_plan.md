# SUNSHARE CONTINUITY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, validate and submit SUNSHARE CONTINUITY: a Qiskit QAOA scheduler for limited village solar energy that needs 11 qubits where the standard encoding needs 20, checked against the exact answer.

**Architecture:** One scheduling model (11 yes or no choices) feeds four solvers: exact enumeration, first come first served, QAOA on the standard slack encoding (20 qubits), and QAOA on the SUNSHARE encoding (11 qubits). Every sampled quantum answer is decoded and validated against the original rules. One command reproduces every table and chart.

**Tech Stack:** Python 3.10 or newer, Qiskit 2.6.2, Qiskit Aer 0.18.2, NumPy, SciPy (COBYLA), Matplotlib, pytest.

## Global Constraints

* Deadline: 11:59pm tonight. The last commit before the cutoff is what gets judged. Make no commits after it.
* Domain: 6, Energy and Smart Infrastructure. Do not drift outside it.
* All four deliverables are required: GitHub repository, report in .docx (with architecture diagram), video of at most 3 minutes, submission form.
* Video link must be set to "anyone with the link".
* Simulator only. No hardware. No claim of quantum speedup anywhere.
* The test instance in `data/sample_scenario.json` must not change. Its exact best benefit is 25.
* All input values are synthetic and must be labelled as synthetic in the report.
* Credit reused code in the README. Do not copy tutorial code.
* Package versions are pinned in `requirements.txt`. Do not upgrade them tonight.
* Submission form: https://forms.gle/jSRrXaHkjVb7G7AK8

## Status of this plan

Every code block below was run before this plan was written. The test counts and result numbers shown as "expected" come from that run (2 CPU cores, Python 3.13). Your numbers should match or be very close. If a number differs slightly, report your own number, not the one printed here.

## What the run already showed

These are the headline results to build the report and video around.

| Finding | Number |
| --- | --- |
| Exact best benefit | 25 (milk in the morning with the battery, irrigation at midday, water in the afternoon) |
| Valid schedules among all options | 52 of 2048 (2.5%) |
| Qubits, standard versus SUNSHARE | 20 versus 11 |
| Two qubit gates per layer, standard versus SUNSHARE | 106 versus 46 |
| Simulation time at 1 layer, same optimiser budget | standard 142 seconds, SUNSHARE 1.4 seconds |
| Valid share at 1 layer, same optimiser budget | standard 5.3%, SUNSHARE 24.5% |
| Valid share at 2 layers, same optimiser budget | standard 10.0%, SUNSHARE 52.6% |
| SUNSHARE valid share at 1, 2, 3 layers | 24.5%, 52.6%, 69.8% |
| SUNSHARE exact best share at 1, 2, 3 layers | 1.1%, 3.1%, 6.9% (random guessing: 0.05%) |
| Best valid benefit found by QAOA | 25 at every depth, so the gap to exact is 0 |
| First come first served over 24 arrival orders | between 9 and 25, average 16.8, only 5 orders reach 25 |
| Battery raised to 10 kWh | exact best becomes 28 and households are served. QAOA also samples it |

Two honest observations to include in the limitations section:

* **Bigger fines are a trade off.** With penalty 40 the valid share at 3 layers rises to 89.2%, but the exact best share falls to 0.6%, because the circuit drifts toward "do nothing" schedules. Penalty 12 gives the best balance here.
* **The exact best is still a small share of samples** (6.9% at 3 layers). QAOA finds it because we take 4,096 samples and keep the best valid one. That is how QAOA is normally used, and it must be stated plainly.

## File Structure

```
sunshare-continuity/
  README.md               setup, how to reproduce, limitations, credits
  requirements.txt        pinned versions
  .gitignore
  run_all.py              one command reproduces every table and chart
  data/
    sample_scenario.json  the test instance
  src/
    __init__.py
    model.py              choices, rules, scoring, scenario loader
    classical_solver.py   exact enumeration, first come first served
    encoding.py           cost formula as a polynomial, conversion to qubit operator
    encode_compact.py     SUNSHARE encoding, 11 qubits
    encode_slack.py       standard encoding, 20 qubits
    qaoa_solver.py        QAOA circuit, angle tuning, sampling
    decoder.py            validates and scores sampled schedules
    figures.py            charts and architecture diagram
  tests/
    __init__.py
    test_model.py
    test_encodings.py
    test_qaoa.py
  results/                written by run_all.py
```

Differences from the layout in `SUNSHARE_CONTINUITY_final.md`: the scenario loader lives in `model.py` (no separate `scenario.py`), and `encoding.py` and `figures.py` were added.

## Timeline and Split

| By | Task | Owner if you are three |
| --- | --- | --- |
| 6:45pm | Tasks 1 to 3: code and tests passing | Person A |
| 7:15pm | Task 4: full run finished, results committed | Person A |
| 7:30pm | Task 5: README done, repository public on GitHub | Person A |
| 9:30pm | Task 6: report finished | Person B, starts at 6:15pm from the numbers above |
| 10:30pm | Task 7: video recorded and uploaded | Person C, drafts the script from 6:15pm |
| 11:15pm | Task 8: links tested, form submitted | Everyone |

Tasks 6 and 7 do not need to wait for the code. The numbers in this plan are enough to start writing.

---

### Task 1: Scheduling model and exact baseline

**Files:**
- Create: `requirements.txt`, `.gitignore`, `data/sample_scenario.json`
- Create: `src/__init__.py`, `src/model.py`, `src/classical_solver.py`
- Test: `tests/__init__.py`, `tests/test_model.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `load_scenario(path) -> Scenario` with `var_names` (list of 11 names in qubit order), `n_vars`, `n_slots`, `solar`, `battery_blocks`, `battery_cost`, `services`, `service_vars` (list of `(name, Service, slot, benefit)`).
  - `violations(scn, bits) -> list[str]`, `is_feasible(scn, bits) -> bool`, `benefit(scn, bits) -> float`, `objective(scn, bits) -> float`, `timetable(scn, bits) -> dict`.
  - `solve_exact(scn) -> dict` with keys `bits`, `objective`, `benefit`, `n_feasible`, `n_total`.
  - `first_come_first_served(scn, order) -> tuple`, `fcfs_all_orders(scn) -> list[(order, benefit)]`.
  - A schedule (`bits`) is always a tuple of 0 or 1 in `scn.var_names` order.

- [ ] **Step 1: Create the project skeleton and install packages**

```bash
mkdir sunshare-continuity && cd sunshare-continuity
git init
mkdir -p src tests data results
touch src/__init__.py tests/__init__.py
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

Create `requirements.txt`:

```text
qiskit==2.6.2
qiskit-aer==0.18.2
numpy==2.5.3
scipy==1.18.1
matplotlib==3.11.2
pytest==9.1.1
```

Create `.gitignore`:

```text
__pycache__/
.pytest_cache/
.venv/
*.pyc
```

Then install:

```bash
pip install -r requirements.txt
```

Expected: installs without errors. If `numpy==2.5.3` is not available for your Python version, change that one line to `numpy>=2.0` and nothing else.

- [ ] **Step 2: Create the test instance**

Create `data/sample_scenario.json`:

```json
{
  "note": "Illustrative synthetic values. Energy is counted in blocks of 5 kWh.",
  "slot_names": ["Morning", "Midday", "Afternoon", "Evening"],
  "solar_blocks": [2, 4, 2, 0],
  "battery_blocks": 1,
  "battery_cost": 0.25,
  "services": [
    {"name": "Milk chilling", "key": "m", "energy": 3, "benefits": {"0": 10, "1": 8}},
    {"name": "Irrigation", "key": "i", "energy": 3, "benefits": {"1": 7, "2": 4}},
    {"name": "Water purification", "key": "w", "energy": 2, "benefits": {"1": 6, "2": 8}},
    {"name": "Household essentials", "key": "h", "energy": 1, "benefits": {"3": 3}}
  ]
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/test_model.py`:

```python
from pathlib import Path

from src.classical_solver import fcfs_all_orders, solve_exact
from src.model import is_feasible, load_scenario, timetable, violations

SCN = load_scenario(Path(__file__).parent.parent / "data" / "sample_scenario.json")


def bits(**on):
    return tuple(1 if name in on else 0 for name in SCN.var_names)


def test_variable_order():
    assert SCN.var_names == ["m0", "m1", "i1", "i2", "w1", "w2", "h3",
                             "d0", "d1", "d2", "d3"]


def test_known_best_schedule_is_valid():
    assert is_feasible(SCN, bits(m0=1, i1=1, w2=1, d0=1))


def test_morning_milk_needs_battery():
    assert violations(SCN, bits(m0=1)) == ["Morning energy exceeded"]


def test_service_cannot_run_twice():
    assert "Milk chilling runs more than once" in violations(SCN, bits(m0=1, m1=1, d0=1))


def test_battery_block_used_once_only():
    assert violations(SCN, bits(d0=1, d3=1)) == ["Battery budget exceeded"]


def test_exact_optimum_is_25():
    exact = solve_exact(SCN)
    assert exact["benefit"] == 25
    assert exact["objective"] == 24.75
    assert exact["bits"] == bits(m0=1, i1=1, w2=1, d0=1)
    assert exact["n_total"] == 2048
    assert timetable(SCN, exact["bits"])["Evening"] == []


def test_fcfs_depends_on_arrival_order():
    scores = [score for _, score in fcfs_all_orders(SCN)]
    assert len(scores) == 24
    assert max(scores) == 25
    assert min(scores) < 25
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `python -m pytest tests/test_model.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'src.classical_solver'`

- [ ] **Step 5: Write the model**

Create `src/model.py`:

```python
"""SUNSHARE CONTINUITY scheduling model: choices, rules and scoring.

A schedule is a tuple of 0/1 values, one per decision variable, in the
order given by Scenario.var_names (service choices first, then battery).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Service:
    name: str
    key: str
    energy: int
    benefits: tuple  # ((slot, benefit), ...) for allowed slots only

    @property
    def slots(self) -> tuple:
        return tuple(slot for slot, _ in self.benefits)


@dataclass(frozen=True)
class Scenario:
    slot_names: tuple
    solar: tuple
    battery_blocks: int
    battery_cost: float
    services: tuple

    @property
    def n_slots(self) -> int:
        return len(self.solar)

    @property
    def service_vars(self) -> list:
        """(variable name, service, slot, benefit) for every service choice."""
        out = []
        for svc in self.services:
            for slot, benefit in svc.benefits:
                out.append((f"{svc.key}{slot}", svc, slot, benefit))
        return out

    @property
    def var_names(self) -> list:
        names = [name for name, _, _, _ in self.service_vars]
        return names + [f"d{t}" for t in range(self.n_slots)]

    @property
    def n_vars(self) -> int:
        return len(self.var_names)

    def index(self, name: str) -> int:
        return self.var_names.index(name)


def load_scenario(path) -> Scenario:
    raw = json.loads(Path(path).read_text())
    services = tuple(
        Service(
            name=s["name"],
            key=s["key"],
            energy=int(s["energy"]),
            benefits=tuple(sorted((int(t), b) for t, b in s["benefits"].items())),
        )
        for s in raw["services"]
    )
    return Scenario(
        slot_names=tuple(raw["slot_names"]),
        solar=tuple(raw["solar_blocks"]),
        battery_blocks=int(raw["battery_blocks"]),
        battery_cost=float(raw["battery_cost"]),
        services=services,
    )


def violations(scn: Scenario, bits) -> list:
    """Names of every rule this schedule breaks. Empty list means valid."""
    value = dict(zip(scn.var_names, bits))
    broken = []
    for svc in scn.services:
        if sum(value[f"{svc.key}{t}"] for t in svc.slots) > 1:
            broken.append(f"{svc.name} runs more than once")
    for t in range(scn.n_slots):
        used = sum(svc.energy * value[name]
                   for name, svc, slot, _ in scn.service_vars if slot == t)
        if used > scn.solar[t] + value[f"d{t}"]:
            broken.append(f"{scn.slot_names[t]} energy exceeded")
    if sum(value[f"d{t}"] for t in range(scn.n_slots)) > scn.battery_blocks:
        broken.append("Battery budget exceeded")
    return broken


def is_feasible(scn: Scenario, bits) -> bool:
    return not violations(scn, bits)


def benefit(scn: Scenario, bits) -> float:
    value = dict(zip(scn.var_names, bits))
    return sum(b * value[name] for name, _, _, b in scn.service_vars)


def battery_used(scn: Scenario, bits) -> int:
    value = dict(zip(scn.var_names, bits))
    return sum(value[f"d{t}"] for t in range(scn.n_slots))


def objective(scn: Scenario, bits) -> float:
    """What we maximise: benefit minus a small cost per battery block."""
    return benefit(scn, bits) - scn.battery_cost * battery_used(scn, bits)


def timetable(scn: Scenario, bits) -> dict:
    """Human readable schedule: slot name -> list of things happening."""
    value = dict(zip(scn.var_names, bits))
    table = {name: [] for name in scn.slot_names}
    for name, svc, slot, _ in scn.service_vars:
        if value[name]:
            table[scn.slot_names[slot]].append(svc.name)
    for t in range(scn.n_slots):
        if value[f"d{t}"]:
            table[scn.slot_names[t]].append("battery block")
    return table
```

- [ ] **Step 6: Write the classical solvers**

Create `src/classical_solver.py`:

```python
"""Classical references: exact enumeration and first come first served."""
from __future__ import annotations

from itertools import permutations, product

from src.model import Scenario, benefit, is_feasible, objective


def solve_exact(scn: Scenario) -> dict:
    """Try every schedule and keep the best valid one."""
    best_bits, best_obj, n_feasible = None, float("-inf"), 0
    for bits in product((0, 1), repeat=scn.n_vars):
        if not is_feasible(scn, bits):
            continue
        n_feasible += 1
        obj = objective(scn, bits)
        if obj > best_obj:
            best_bits, best_obj = bits, obj
    return {
        "bits": best_bits,
        "objective": best_obj,
        "benefit": benefit(scn, best_bits),
        "n_feasible": n_feasible,
        "n_total": 2 ** scn.n_vars,
    }


def first_come_first_served(scn: Scenario, order) -> tuple:
    """Serve services in arrival order. Each takes its earliest slot that
    still has enough energy, using a battery block if one is left."""
    value = {name: 0 for name in scn.var_names}
    free = list(scn.solar)
    battery_left = scn.battery_blocks
    for svc_index in order:
        svc = scn.services[svc_index]
        for t in svc.slots:
            if svc.energy <= free[t]:
                free[t] -= svc.energy
                value[f"{svc.key}{t}"] = 1
                break
            if battery_left > 0 and not value[f"d{t}"] and svc.energy <= free[t] + 1:
                free[t] = free[t] + 1 - svc.energy
                battery_left -= 1
                value[f"d{t}"] = 1
                value[f"{svc.key}{t}"] = 1
                break
    return tuple(value[name] for name in scn.var_names)


def fcfs_all_orders(scn: Scenario) -> list:
    """Benefit of first come first served for every possible arrival order."""
    out = []
    for order in permutations(range(len(scn.services))):
        bits = first_come_first_served(scn, order)
        assert is_feasible(scn, bits)
        out.append((order, benefit(scn, bits)))
    return out
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `python -m pytest tests/test_model.py -q`

Expected: `7 passed`

This is the gate for everything else. Do not continue until `test_exact_optimum_is_25` passes.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: scheduling model, exact enumeration and first come first served"
```

---

### Task 2: The two quantum encodings

**Files:**
- Create: `src/encoding.py`, `src/encode_compact.py`, `src/encode_slack.py`
- Test: `tests/test_encodings.py`

**Interfaces:**
- Consumes: `Scenario`, `is_feasible`, `objective`, `load_scenario` from `src/model.py`; `solve_exact` from `src/classical_solver.py`.
- Produces:
  - `Encoding` dataclass with `name`, `var_names` (one per qubit), `n_decision` (the first `n_decision` qubits are real choices), `poly` (dict: frozenset of variable indices -> coefficient), `fines` (readable list), and property `n_qubits`.
  - `build_compact(scn, penalty) -> Encoding` (11 qubits), `build_slack(scn, penalty) -> Encoding` (20 qubits).
  - `evaluate(poly, bits) -> float`, `cost_vector(poly, n) -> numpy array of length 2**n`, `to_ising(poly, n) -> (SparsePauliOp, offset)`.
  - Lower cost is better. For a valid schedule, cost equals minus the objective.

**Background for the team (needed to explain it to judges):**

* A cost formula is a sum of terms. Each term is a number times a product of yes or no variables.
* To put it on qubits, every variable `x` is replaced by `(1 - Z) / 2`, where `Z` is the qubit's Z operator. `to_ising` does exactly this.
* The standard encoding turns `energy used <= limit` into `energy used + helper = limit` and needs helper qubits to hold `helper`.
* The SUNSHARE encoding lists the smallest combinations that break each rule and fines exactly those. Example: at midday, milk and water together need 25 kWh but only 20 kWh of solar exists, so `m1 and w1 without d1` is fined.

- [ ] **Step 1: Write the failing test**

Create `tests/test_encodings.py`:

```python
from itertools import product
from pathlib import Path

import numpy as np
import pytest
from qiskit.quantum_info import SparsePauliOp

from src.classical_solver import solve_exact
from src.encode_compact import build_compact
from src.encode_slack import build_slack
from src.encoding import cost_vector, evaluate, to_ising
from src.model import is_feasible, load_scenario, objective

SCN = load_scenario(Path(__file__).parent.parent / "data" / "sample_scenario.json")
EXACT = solve_exact(SCN)


def test_compact_uses_11_qubits_and_16_fines():
    enc = build_compact(SCN, penalty=20)
    assert enc.n_qubits == 11
    assert len(enc.fines) == 16
    assert "m1 and w1 without d1" in enc.fines


def test_slack_uses_20_qubits():
    assert build_slack(SCN, penalty=20).n_qubits == 20


@pytest.mark.parametrize("penalty", [12, 20, 40])
def test_compact_cost_matches_model_on_every_schedule(penalty):
    enc = build_compact(SCN, penalty)
    for bits in product((0, 1), repeat=11):
        cost = evaluate(enc.poly, bits)
        if is_feasible(SCN, bits):
            assert cost == pytest.approx(-objective(SCN, bits))
        else:
            assert cost >= -objective(SCN, bits) + penalty - 1e-9


@pytest.mark.parametrize("penalty", [12, 20, 40])
def test_lowest_cost_is_the_exact_schedule(penalty):
    for build in (build_compact, build_slack):
        enc = build(SCN, penalty)
        costs = cost_vector(enc.poly, enc.n_qubits)
        k = int(np.argmin(costs))
        bits = tuple((k >> i) & 1 for i in range(enc.n_decision))
        assert bits == EXACT["bits"]
        assert costs[k] == pytest.approx(-EXACT["objective"])


def test_operator_diagonal_equals_cost_vector():
    enc = build_compact(SCN, penalty=20)
    op, offset = to_ising(enc.poly, enc.n_qubits)
    assert isinstance(op, SparsePauliOp)
    diagonal = np.real(np.diag(op.to_matrix())) + offset
    assert np.allclose(diagonal, cost_vector(enc.poly, enc.n_qubits))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_encodings.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'src.encode_compact'`

- [ ] **Step 3: Write the shared polynomial helpers**

Create `src/encoding.py`:

```python
"""Cost formulas as polynomials over 0/1 variables, and their qubit form.

A polynomial is a dict: frozenset of variable indices -> coefficient.
The empty frozenset holds the constant. Because x * x = x for 0/1
variables, a set of indices is enough to describe any product.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

import numpy as np
from qiskit.quantum_info import SparsePauliOp


@dataclass
class Encoding:
    name: str
    var_names: list            # one name per qubit
    n_decision: int            # the first n_decision qubits are real choices
    poly: dict = field(default_factory=dict)
    fines: list = field(default_factory=list)   # readable list of penalty terms

    @property
    def n_qubits(self) -> int:
        return len(self.var_names)


def add_product(poly: dict, coeff: float, ones=(), zeros=()) -> None:
    """Add coeff * prod(x_i for i in ones) * prod(1 - x_j for j in zeros)."""
    ones = frozenset(ones)
    zeros = list(zeros)
    for k in range(len(zeros) + 1):
        for chosen in combinations(zeros, k):
            key = ones | frozenset(chosen)
            poly[key] = poly.get(key, 0.0) + coeff * (-1) ** k


def add_square(poly: dict, coeff: float, linear: dict, const: float) -> None:
    """Add coeff * (sum(a_i * x_i) + const) ** 2."""
    items = list(linear.items())
    add_product(poly, coeff * const * const)
    for i, a in items:
        add_product(poly, coeff * (a * a + 2 * a * const), ones=[i])
    for (i, a), (j, b) in combinations(items, 2):
        add_product(poly, coeff * 2 * a * b, ones=[i, j])


def evaluate(poly: dict, bits) -> float:
    return sum(c for key, c in poly.items() if all(bits[i] for i in key))


def cost_vector(poly: dict, n: int) -> np.ndarray:
    """Cost of every bitstring. Entry k has qubit i equal to bit i of k."""
    index = np.arange(2 ** n)
    total = np.zeros(2 ** n)
    for key, c in poly.items():
        mask = np.ones(2 ** n, dtype=bool)
        for i in key:
            mask &= ((index >> i) & 1).astype(bool)
        total += c * mask
    return total


def to_ising(poly: dict, n: int):
    """Replace every x_i by (1 - Z_i) / 2. Returns (operator, constant)."""
    z_terms: dict = {}
    for key, c in poly.items():
        members = sorted(key)
        scale = c / 2 ** len(members)
        for k in range(len(members) + 1):
            for sub in combinations(members, k):
                z_terms[sub] = z_terms.get(sub, 0.0) + scale * (-1) ** k
    offset = z_terms.pop((), 0.0)
    sparse = [("Z" * len(sub), list(sub), coeff)
              for sub, coeff in z_terms.items() if abs(coeff) > 1e-12]
    return SparsePauliOp.from_sparse_list(sparse, num_qubits=n).simplify(), offset
```

- [ ] **Step 4: Write the SUNSHARE encoding**

Create `src/encode_compact.py`:

```python
"""SUNSHARE encoding: fine the exact combinations that break a rule.

No helper qubits. Each rule is replaced by a short list of "this small
combination is not allowed" fines.
"""
from __future__ import annotations

from itertools import combinations

from src.encoding import Encoding, add_product
from src.model import Scenario


def _minimal_sets_over(items: list, limit: int) -> list:
    """Smallest groups of (index, energy) whose total energy is above limit."""
    found = []
    for size in range(1, len(items) + 1):
        for group in combinations(items, size):
            if sum(e for _, e in group) <= limit:
                continue
            ids = frozenset(i for i, _ in group)
            if not any(prev <= ids for prev in found):
                found.append(ids)
    return found


def build_compact(scn: Scenario, penalty: float) -> Encoding:
    names = scn.var_names
    enc = Encoding(name="compact", var_names=list(names), n_decision=len(names))
    idx = {name: i for i, name in enumerate(names)}

    def fine(ones, zeros=()):
        add_product(enc.poly, penalty, ones=ones, zeros=zeros)
        text = " and ".join(names[i] for i in sorted(ones))
        if zeros:
            text += " without " + " or ".join(names[j] for j in sorted(zeros))
        enc.fines.append(text)

    # Objective: reward benefit, charge a little for battery use.
    for name, _, _, b in scn.service_vars:
        add_product(enc.poly, -b, ones=[idx[name]])
    for t in range(scn.n_slots):
        add_product(enc.poly, scn.battery_cost, ones=[idx[f"d{t}"]])

    # Rule 1: a service runs at most once.
    for svc in scn.services:
        for a, b in combinations(svc.slots, 2):
            fine([idx[f"{svc.key}{a}"], idx[f"{svc.key}{b}"]])

    # Rule 2: energy in each slot. One battery block adds one unit.
    for t in range(scn.n_slots):
        items = [(idx[name], svc.energy)
                 for name, svc, slot, _ in scn.service_vars if slot == t]
        d = idx[f"d{t}"]
        never_ok = _minimal_sets_over(items, scn.solar[t] + 1)
        for group in never_ok:
            fine(group)
        for group in _minimal_sets_over(items, scn.solar[t]):
            if group not in never_ok:
                fine(group, zeros=[d])

    # Rule 3: at most battery_blocks dispatches in total.
    battery = [idx[f"d{t}"] for t in range(scn.n_slots)]
    for group in combinations(battery, scn.battery_blocks + 1):
        fine(group)
    return enc
```

- [ ] **Step 5: Write the standard encoding**

Create `src/encode_slack.py`:

```python
"""Standard encoding: every "cannot exceed" rule gets helper (slack) qubits.

lhs <= limit becomes lhs + s = limit, with s written in binary, and the
fine is penalty * (lhs + s - limit) ** 2.
"""
from __future__ import annotations

from itertools import combinations

from src.encoding import Encoding, add_product, add_square
from src.model import Scenario


def build_slack(scn: Scenario, penalty: float) -> Encoding:
    names = list(scn.var_names)
    enc = Encoding(name="slack", var_names=names, n_decision=len(names))
    idx = {name: i for i, name in enumerate(names)}

    def slack_rule(label: str, linear: dict, limit: int) -> None:
        lowest = sum(a for a in linear.values() if a < 0)
        s_max = limit - lowest
        n_bits = max(1, int(s_max).bit_length())
        terms = dict(linear)
        for k in range(n_bits):
            enc.var_names.append(f"s_{label}_{k}")
            terms[len(enc.var_names) - 1] = 2 ** k
        add_square(enc.poly, penalty, terms, -limit)
        enc.fines.append(f"{label}: {n_bits} helper qubits")

    for name, _, _, b in scn.service_vars:
        add_product(enc.poly, -b, ones=[idx[name]])
    for t in range(scn.n_slots):
        add_product(enc.poly, scn.battery_cost, ones=[idx[f"d{t}"]])

    for svc in scn.services:
        for a, b in combinations(svc.slots, 2):
            add_product(enc.poly, penalty,
                        ones=[idx[f"{svc.key}{a}"], idx[f"{svc.key}{b}"]])

    for t in range(scn.n_slots):
        linear = {idx[name]: svc.energy
                  for name, svc, slot, _ in scn.service_vars if slot == t}
        linear[idx[f"d{t}"]] = -1
        slack_rule(scn.slot_names[t].lower(), linear, scn.solar[t])

    slack_rule("battery", {idx[f"d{t}"]: 1 for t in range(scn.n_slots)},
               scn.battery_blocks)
    return enc
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `python -m pytest tests -q`

Expected: `16 passed` (7 from Task 1, 9 new).

What the new tests prove, in words you can use in the report:

* The SUNSHARE encoding uses 11 qubits and exactly 16 fines. The standard encoding uses 20 qubits.
* On all 2,048 schedules, the SUNSHARE cost equals the true objective for valid schedules and is worse by at least the penalty for invalid ones.
* For penalties 12, 20 and 40, the lowest cost bitstring of both encodings is the exact best schedule.
* The Qiskit operator's diagonal equals the cost of every bitstring, so the mapping to qubits is correct.

- [ ] **Step 7: Print the 16 fines for the report**

Run:

```bash
python -c "from src.model import load_scenario; from src.encode_compact import build_compact; print(*build_compact(load_scenario('data/sample_scenario.json'), 12).fines, sep='\n')"
```

Expected:

```text
m0 and m1
i1 and i2
w1 and w2
m0 without d0
m1 and i1
m1 and w1 without d1
i1 and w1 without d1
i2 and w2
i2 without d2
h3 without d3
d0 and d1
d0 and d2
d0 and d3
d1 and d2
d1 and d3
d2 and d3
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: compact 11 qubit encoding and standard 20 qubit slack encoding"
```

---

### Task 3: QAOA solver and decoder

**Files:**
- Create: `src/qaoa_solver.py`, `src/decoder.py`
- Test: `tests/test_qaoa.py`

**Interfaces:**
- Consumes: `Encoding`, `to_ising` from `src/encoding.py`; `Scenario`, `benefit`, `is_feasible`, `objective` from `src/model.py`; the dict returned by `solve_exact`.
- Produces:
  - `build_ansatz(enc, reps) -> (QAOAAnsatz circuit, SparsePauliOp)`.
  - `circuit_stats(enc, reps) -> dict` with keys `qubits`, `depth`, `two_qubit_gates`, `total_gates`.
  - `run_qaoa(enc, reps=1, n_starts=8, shots=4096, maxiter=300, seed=42, previous=None) -> dict` with keys `counts` (dict: decision bits tuple -> number of samples), `shots`, `reps`, `angles` (dict: parameter name -> value), `energy`, `seconds`.
  - `depth_study(enc, max_reps=3, **kwargs) -> list` of `run_qaoa` results for 1 to `max_reps` layers.
  - `score_samples(scn, counts, exact) -> dict` with keys `valid_share`, `optimum_share`, `best_valid_bits`, `best_valid_benefit`, `gap_to_exact`, `mean_valid_benefit`, `most_common_bits`, `most_common_is_valid`.
  - `random_guess_reference(exact) -> dict` with keys `valid_share`, `optimum_share`.

**Background for the team:**

* `QAOAAnsatz` is Qiskit's QAOA circuit. Each layer applies the cost operator (angle gamma) and then a mixing step (angle beta).
* The Aer `EstimatorV2` computes the average cost of the circuit for given angles. COBYLA, a classical optimizer from SciPy, changes the angles to lower that average.
* A deeper circuit starts from the best angles of the shallower one, with the new layer at zero. A zero layer changes nothing, so a deeper circuit can only match or improve the result.
* The Aer `SamplerV2` then measures the circuit 4,096 times. Qiskit prints bitstrings with qubit 0 on the right, so the code reverses each string before reading it.
* Helper qubits are dropped when decoding. Only the 11 decision bits are checked against the original rules.

- [ ] **Step 1: Write the failing test**

Create `tests/test_qaoa.py`:

```python
from pathlib import Path

from src.classical_solver import solve_exact
from src.decoder import random_guess_reference, score_samples
from src.encode_compact import build_compact
from src.model import load_scenario
from src.qaoa_solver import circuit_stats, run_qaoa

SCN = load_scenario(Path(__file__).parent.parent / "data" / "sample_scenario.json")
EXACT = solve_exact(SCN)


def test_circuit_uses_one_qubit_per_choice():
    assert circuit_stats(build_compact(SCN, 12), reps=1)["qubits"] == 11


def test_qaoa_beats_random_guessing():
    run = run_qaoa(build_compact(SCN, 12), reps=1, n_starts=3, maxiter=150)
    assert sum(run["counts"].values()) == 4096
    assert all(len(bits) == 11 for bits in run["counts"])
    score = score_samples(SCN, run["counts"], EXACT)
    reference = random_guess_reference(EXACT)
    assert score["valid_share"] > 3 * reference["valid_share"]
    assert score["optimum_share"] > 3 * reference["optimum_share"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_qaoa.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'src.decoder'`

- [ ] **Step 3: Write the QAOA solver**

Create `src/qaoa_solver.py`:

```python
"""QAOA in Qiskit: build the circuit, tune its angles, sample schedules."""
from __future__ import annotations

import time

import numpy as np
from qiskit import transpile
from qiskit.circuit.library import QAOAAnsatz
from qiskit_aer import AerSimulator
from qiskit_aer.primitives import EstimatorV2, SamplerV2
from scipy.optimize import minimize

from src.encoding import Encoding, to_ising

BASIS = ["cx", "rz", "sx", "x"]


def build_ansatz(enc: Encoding, reps: int):
    """QAOA circuit for this encoding, plus the cost operator it minimises.

    The operator is divided by its largest coefficient so the angles stay
    in a sensible range. This does not change which schedule is best.
    """
    operator, _ = to_ising(enc.poly, enc.n_qubits)
    scale = float(np.max(np.abs(operator.coeffs)))
    operator = (operator / scale).simplify()
    ansatz = QAOAAnsatz(cost_operator=operator, reps=reps)
    return ansatz, operator


def circuit_stats(enc: Encoding, reps: int) -> dict:
    """Size of the circuit after translation to a common hardware gate set."""
    ansatz, _ = build_ansatz(enc, reps)
    compiled = transpile(ansatz, basis_gates=BASIS, optimization_level=1,
                         seed_transpiler=7)
    ops = compiled.count_ops()
    return {"qubits": enc.n_qubits, "depth": compiled.depth(),
            "two_qubit_gates": int(ops.get("cx", 0)),
            "total_gates": int(sum(ops.values()))}


def _angles_from_previous(params, previous: dict) -> np.ndarray:
    """Start a deeper circuit from the best shallower one. Layers that did
    not exist before start at zero, which leaves the circuit unchanged."""
    return np.array([previous.get(p.name, 0.0) for p in params])


def run_qaoa(enc: Encoding, reps: int = 1, n_starts: int = 8, shots: int = 4096,
             maxiter: int = 300, seed: int = 42, previous: dict | None = None) -> dict:
    """Tune the angles from several starts, then sample the best circuit.

    previous: angles (by parameter name) from a shallower run, used as one
    of the starting points. Returns counts keyed by the decision bits only
    (helper qubits dropped), as tuples in Encoding.var_names order.
    """
    started = time.time()
    ansatz, operator = build_ansatz(enc, reps)
    backend = AerSimulator(method="statevector")
    compiled = transpile(ansatz, backend, optimization_level=1, seed_transpiler=7)
    params = list(compiled.parameters)
    estimator = EstimatorV2(options={"default_precision": 0.0,
                                     "backend_options": {"method": "statevector"}})

    def energy(values) -> float:
        job = estimator.run([(compiled, operator, values)])
        return float(job.result()[0].data.evs)

    rng = np.random.default_rng(seed)
    starts = [rng.uniform(0, np.pi, len(params)) for _ in range(n_starts)]
    if previous is not None:
        base = _angles_from_previous(params, previous)
        starts = [base] + [base + rng.normal(0, 0.1, len(params))
                           for _ in range(n_starts - 1)]
    best = None
    for start in starts:
        res = minimize(energy, start, method="COBYLA", options={"maxiter": maxiter})
        if best is None or res.fun < best.fun:
            best = res

    measured = compiled.copy()
    measured.measure_all()
    sampler = SamplerV2(seed=seed, options={"backend_options": {"method": "statevector"}})
    raw = sampler.run([(measured, best.x)], shots=shots).result()[0].data.meas.get_counts()

    counts: dict = {}
    for bitstring, n in raw.items():
        qubit_bits = bitstring[::-1]                    # qubit 0 first
        decision = tuple(int(b) for b in qubit_bits[:enc.n_decision])
        counts[decision] = counts.get(decision, 0) + n
    return {"counts": counts, "shots": shots, "reps": reps,
            "angles": {p.name: float(x) for p, x in zip(params, best.x)},
            "energy": float(best.fun), "seconds": time.time() - started}


def depth_study(enc: Encoding, max_reps: int = 3, **kwargs) -> list:
    """Run p = 1, 2, ... max_reps, each starting from the one before."""
    runs, previous = [], None
    for reps in range(1, max_reps + 1):
        run = run_qaoa(enc, reps=reps, previous=previous, **kwargs)
        previous = run["angles"]
        runs.append(run)
    return runs
```

- [ ] **Step 4: Write the decoder**

Create `src/decoder.py`:

```python
"""Turn measured bitstrings back into schedules and score them honestly."""
from __future__ import annotations

from src.model import Scenario, benefit, is_feasible, objective


def score_samples(scn: Scenario, counts: dict, exact: dict) -> dict:
    """Check every sampled schedule against the original rules."""
    shots = sum(counts.values())
    valid = {bits: n for bits, n in counts.items() if is_feasible(scn, bits)}
    valid_shots = sum(valid.values())
    best_bits = max(valid, key=lambda b: objective(scn, b)) if valid else None
    most_common = max(counts, key=counts.get)
    return {
        "valid_share": valid_shots / shots,
        "optimum_share": counts.get(exact["bits"], 0) / shots,
        "best_valid_bits": best_bits,
        "best_valid_benefit": benefit(scn, best_bits) if valid else None,
        "gap_to_exact": (exact["benefit"] - benefit(scn, best_bits)) if valid else None,
        "mean_valid_benefit": (sum(benefit(scn, b) * n for b, n in valid.items())
                               / valid_shots) if valid else None,
        "most_common_bits": most_common,
        "most_common_is_valid": is_feasible(scn, most_common),
    }


def random_guess_reference(exact: dict) -> dict:
    """What uniform random guessing over the decision bits would achieve."""
    return {"valid_share": exact["n_feasible"] / exact["n_total"],
            "optimum_share": 1 / exact["n_total"]}
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `python -m pytest tests -q`

Expected: `18 passed` in about 5 seconds. A deprecation warning from Qiskit about `QAOAAnsatz` may be printed. It is harmless tonight.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: QAOA solver with depth study and honest sample decoding"
```

---

### Task 4: One command reproduction, charts and architecture diagram

**Files:**
- Create: `src/figures.py`, `run_all.py`
- Output: `results/summary.md`, `results/results.json`, seven PNG files

**Interfaces:**
- Consumes: everything produced by Tasks 1 to 3.
- Produces: `python run_all.py` (full, about 9 minutes on 2 cores) and `python run_all.py --quick` (skips the 20 qubit runs, about 4 minutes).

- [ ] **Step 1: Write the figures module**

Create `src/figures.py`:

```python
"""Charts and the architecture diagram for the report and the video."""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

SURFACE, INK, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
OURS, STANDARD, NEUTRAL = "#2a78d6", "#eb6834", "#8a8983"


def _style(ax, title):
    ax.set_facecolor(SURFACE)
    ax.set_title(title, fontsize=11, color=INK, loc="left", pad=10)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=MUTED, length=0, labelsize=9)


def _label_bars(ax, bars, fmt):
    for bar in bars:
        ax.annotate(fmt(bar.get_height()), (bar.get_x() + bar.get_width() / 2, bar.get_height()),
                    ha="center", va="bottom", fontsize=9, color=INK,
                    xytext=(0, 3), textcoords="offset points")


def _save(fig, path):
    fig.patch.set_facecolor(SURFACE)
    fig.tight_layout()
    fig.savefig(path, dpi=200, facecolor=SURFACE)
    plt.close(fig)


def encoding_cost(stats_standard: dict, stats_ours: dict, path) -> None:
    """Three small panels (different units), same two encodings in each."""
    fig, axes = plt.subplots(1, 3, figsize=(9, 3.2))
    panels = [("qubits", "Qubits"), ("two_qubit_gates", "Two qubit gates (1 layer)"),
              ("depth", "Circuit depth (1 layer)")]
    for ax, (key, title) in zip(axes, panels):
        bars = ax.bar(["Standard", "SUNSHARE"], [stats_standard[key], stats_ours[key]],
                      color=[STANDARD, OURS], width=0.55)
        _style(ax, title)
        _label_bars(ax, bars, lambda v: f"{v:.0f}")
        ax.set_ylim(0, max(stats_standard[key], stats_ours[key]) * 1.18)
    _save(fig, path)


def quality_comparison(rows_standard: list, rows_ours: list, random_ref: dict, path) -> None:
    """Valid share and best answer share, both encodings, same optimiser budget."""
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.6))
    panels = [("valid_share", "Share of valid schedules"),
              ("optimum_share", "Share of samples equal to the exact best")]
    depths = [r["reps"] for r in rows_ours]
    for ax, (key, title) in zip(axes, panels):
        x = range(len(depths))
        b1 = ax.bar([i - 0.2 for i in x], [100 * r[key] for r in rows_standard], width=0.38,
                    color=STANDARD, label="Standard, 20 qubits")
        b2 = ax.bar([i + 0.2 for i in x], [100 * r[key] for r in rows_ours], width=0.38,
                    color=OURS, label="SUNSHARE, 11 qubits")
        ax.axhline(100 * random_ref[key], color=NEUTRAL, linestyle="--", linewidth=1.2,
                   label="Random guessing")
        _style(ax, title)
        ax.set_xticks(list(x), [f"{p} layer" + ("s" if p > 1 else "") for p in depths])
        ax.set_ylabel("% of samples", color=MUTED, fontsize=9)
        digits = 2 if key == "optimum_share" else 1
        _label_bars(ax, list(b1) + list(b2), lambda v, d=digits: f"{v:.{d}f}")
        ax.set_ylim(0, max(100 * r[key] for r in rows_standard + rows_ours) * 1.25 + 0.5)
    axes[0].legend(frameon=False, fontsize=8, labelcolor=MUTED, loc="upper left")
    _save(fig, path)


def depth_chart(rows: list, random_ref: dict, path) -> None:
    """How the SUNSHARE encoding improves with more QAOA layers."""
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.4))
    panels = [("valid_share", "Valid schedules, SUNSHARE encoding"),
              ("optimum_share", "Exact best schedule, SUNSHARE encoding")]
    for ax, (key, title) in zip(axes, panels):
        bars = ax.bar([f"{r['reps']} layer" + ("s" if r["reps"] > 1 else "") for r in rows],
                      [100 * r[key] for r in rows], color=OURS, width=0.55)
        ax.axhline(100 * random_ref[key], color=NEUTRAL, linestyle="--", linewidth=1.2,
                   label=f"Random guessing ({100 * random_ref[key]:.2f}%)")
        ax.legend(frameon=False, fontsize=8, labelcolor=MUTED, loc="upper left")
        _style(ax, title)
        ax.set_ylabel("% of samples", color=MUTED, fontsize=9)
        _label_bars(ax, bars, lambda v: f"{v:.1f}")
        ax.set_ylim(0, max(100 * r[key] for r in rows) * 1.2)
    _save(fig, path)


def fcfs_chart(scores: list, exact_benefit: float, path) -> None:
    """First come first served depends on who asks first."""
    values = sorted(set(scores))
    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    bars = ax.bar([str(int(v)) for v in values], [scores.count(v) for v in values],
                  color=[OURS if v == exact_benefit else NEUTRAL for v in values], width=0.55)
    _style(ax, "First come first served: benefit over all 24 arrival orders")
    ax.set_xlabel(f"Total benefit (exact best is {exact_benefit:.0f})", color=MUTED, fontsize=9)
    ax.set_ylabel("Arrival orders", color=MUTED, fontsize=9)
    _label_bars(ax, bars, lambda v: f"{v:.0f}")
    ax.set_ylim(0, max(scores.count(v) for v in values) * 1.25)
    _save(fig, path)


def timetable_chart(scn, bits, title, path) -> None:
    """The schedule as a grid: one row per service, one column per slot."""
    value = dict(zip(scn.var_names, bits))
    rows = [svc.name for svc in scn.services] + ["Battery block"]
    fig, ax = plt.subplots(figsize=(7.5, 3.2))
    ax.set_facecolor(SURFACE)
    for r, svc in enumerate(scn.services):
        for t in range(scn.n_slots):
            allowed = t in svc.slots
            on = allowed and value[f"{svc.key}{t}"]
            color = OURS if on else ("#eeede9" if allowed else SURFACE)
            ax.add_patch(FancyBboxPatch((t + 0.04, r + 0.08), 0.92, 0.84,
                         boxstyle="round,pad=0,rounding_size=0.06", color=color))
            if on:
                ax.text(t + 0.5, r + 0.5, f"{svc.energy * 5} kWh", ha="center", va="center",
                        color="white", fontsize=9)
    r = len(scn.services)
    for t in range(scn.n_slots):
        on = value[f"d{t}"]
        ax.add_patch(FancyBboxPatch((t + 0.04, r + 0.08), 0.92, 0.84,
                     boxstyle="round,pad=0,rounding_size=0.06",
                     color=STANDARD if on else "#eeede9"))
        if on:
            ax.text(t + 0.5, r + 0.5, "5 kWh", ha="center", va="center", color="white", fontsize=9)
    ax.set_xlim(0, scn.n_slots)
    ax.set_ylim(len(rows), 0)
    ax.set_xticks([t + 0.5 for t in range(scn.n_slots)],
                  [f"{n}\n{scn.solar[t] * 5} kWh solar" for t, n in enumerate(scn.slot_names)])
    ax.set_yticks([i + 0.5 for i in range(len(rows))], rows)
    ax.tick_params(colors=MUTED, length=0, labelsize=9)
    for side in ax.spines.values():
        side.set_visible(False)
    ax.set_title(title, fontsize=11, color=INK, loc="left", pad=10)
    _save(fig, path)


def architecture_diagram(path) -> None:
    """Boxes and arrows for the report."""
    boxes = {
        "input": (0.5, 5.0, "Scenario input\nsolar, battery, services,\ntime windows, benefit scores"),
        "protect": (0.5, 3.7, "Protect critical loads\n(removed before optimisation)"),
        "model": (0.5, 2.4, "Scheduling model\n11 yes or no choices, 4 rules"),
        "ours": (0.11, 1.1, "SUNSHARE encoding\n11 qubits, 16 fines"),
        "std": (0.37, 1.1, "Standard encoding\n20 qubits, 9 helpers"),
        "exact": (0.63, 1.1, "Exact enumeration\n2,048 schedules"),
        "fcfs": (0.89, 1.1, "First come\nfirst served"),
        "qaoa": (0.24, -0.2, "QAOA in Qiskit\ncircuit, tune angles, sample"),
        "decode": (0.24, -1.5, "Decode and validate\nevery sampled schedule"),
        "results": (0.6, -2.8, "Results and comparison\ntables, charts, timetable"),
    }
    arrows = [("input", "protect"), ("protect", "model"), ("model", "ours"), ("model", "std"),
              ("model", "exact"), ("model", "fcfs"), ("ours", "qaoa"), ("std", "qaoa"),
              ("qaoa", "decode"), ("decode", "results"), ("exact", "results"), ("fcfs", "results")]
    quantum = {"ours", "std", "qaoa"}
    fig, ax = plt.subplots(figsize=(9, 8))
    ax.set_xlim(-0.08, 1.08)
    ax.set_ylim(-3.4, 6.3)
    ax.axis("off")
    w, h = 0.22, 0.8
    for key, (x, y, text) in boxes.items():
        edge = OURS if key in quantum else NEUTRAL
        ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                     boxstyle="round,pad=0.01,rounding_size=0.03", facecolor="white",
                     edgecolor=edge, linewidth=1.6))
        ax.text(x, y, text, ha="center", va="center", fontsize=8.5, color=INK)
    for a, b in arrows:
        xa, ya, _ = boxes[a]
        xb, yb, _ = boxes[b]
        ax.annotate("", xy=(xb, yb + h / 2 + 0.03), xytext=(xa, ya - h / 2 - 0.03),
                    arrowprops=dict(arrowstyle="->", color=MUTED, linewidth=1.1))
    ax.text(-0.06, 6.2, "SUNSHARE CONTINUITY architecture (blue outline = quantum path)",
            fontsize=11, color=INK, va="top")
    _save(fig, path)
```

- [ ] **Step 2: Write the runner**

Create `run_all.py`:

```python
"""Reproduce every number, table and chart: python run_all.py

Add --quick to skip the slow 20 qubit runs (useful for a live demo).
"""
from __future__ import annotations

import json
import sys
import time
from dataclasses import replace
from pathlib import Path

from src import figures
from src.classical_solver import fcfs_all_orders, solve_exact
from src.decoder import random_guess_reference, score_samples
from src.encode_compact import build_compact
from src.encode_slack import build_slack
from src.model import load_scenario, timetable
from src.qaoa_solver import circuit_stats, depth_study

ROOT = Path(__file__).parent
OUT = ROOT / "results"
PENALTY = 12
PENALTIES = (12, 20, 40)
FAIR_BUDGET = dict(n_starts=3, maxiter=150)     # same for both encodings


def scored_runs(scn, enc, exact, max_reps, **budget) -> list:
    rows = []
    for run in depth_study(enc, max_reps, **budget):
        row = score_samples(scn, run["counts"], exact)
        row.update(reps=run["reps"], energy=run["energy"], seconds=round(run["seconds"], 1))
        rows.append(row)
        print(f"  {enc.name:8s} layers={row['reps']} valid={row['valid_share']:.3f} "
              f"best={row['optimum_share']:.4f} time={row['seconds']}s", flush=True)
    return rows


def main(quick: bool) -> None:
    started = time.time()
    OUT.mkdir(exist_ok=True)
    scn = load_scenario(ROOT / "data" / "sample_scenario.json")
    exact = solve_exact(scn)
    random_ref = random_guess_reference(exact)
    fcfs = [score for _, score in fcfs_all_orders(scn)]
    print("Exact best benefit:", exact["benefit"], timetable(scn, exact["bits"]))

    compact = build_compact(scn, PENALTY)
    slack = build_slack(scn, PENALTY)
    stats = {"compact": circuit_stats(compact, 1), "slack": circuit_stats(slack, 1)}

    print("SUNSHARE encoding, full optimiser budget")
    depth_rows = scored_runs(scn, compact, exact, 3)
    print("Penalty sensitivity")
    sensitivity = {p: scored_runs(scn, build_compact(scn, p), exact, 3)
                   for p in PENALTIES if p != PENALTY}
    sensitivity[PENALTY] = depth_rows

    print("Same budget comparison")
    fair_compact = scored_runs(scn, compact, exact, 2, **FAIR_BUDGET)
    fair_slack = [] if quick else scored_runs(scn, slack, exact, 2, **FAIR_BUDGET)

    print("What if the battery had two blocks (10 kWh)?")
    scn2 = replace(scn, battery_blocks=2)
    exact2 = solve_exact(scn2)
    whatif_rows = scored_runs(scn2, build_compact(scn2, PENALTY), exact2, 3)

    figures.architecture_diagram(OUT / "architecture.png")
    figures.fcfs_chart(fcfs, exact["benefit"], OUT / "fcfs_orders.png")
    figures.depth_chart(depth_rows, random_ref, OUT / "depth_study.png")
    best_bits = depth_rows[-1]["best_valid_bits"]
    figures.timetable_chart(scn, best_bits, "Best valid schedule sampled by QAOA (5 kWh battery)",
                            OUT / "timetable.png")
    figures.timetable_chart(scn2, whatif_rows[-1]["best_valid_bits"],
                            "Best valid schedule sampled by QAOA (10 kWh battery)",
                            OUT / "timetable_whatif.png")
    if fair_slack:
        figures.encoding_cost(stats["slack"], stats["compact"], OUT / "encoding_cost.png")
        figures.quality_comparison(fair_slack, fair_compact, random_ref, OUT / "quality_comparison.png")

    results = {
        "exact": exact, "random_guess": random_ref, "circuit_stats": stats,
        "fines": compact.fines,
        "fcfs": {"scores": fcfs, "min": min(fcfs), "max": max(fcfs),
                 "mean": sum(fcfs) / len(fcfs), "orders_reaching_best": fcfs.count(exact["benefit"])},
        "depth_study": depth_rows, "penalty_sensitivity": sensitivity,
        "same_budget": {"compact": fair_compact, "slack": fair_slack, "budget": FAIR_BUDGET},
        "whatif_two_battery_blocks": {"exact": exact2, "qaoa": whatif_rows},
        "total_seconds": round(time.time() - started, 1),
    }
    (OUT / "results.json").write_text(json.dumps(results, indent=2, default=list))
    (OUT / "summary.md").write_text(summary(results))
    print(f"Done in {results['total_seconds']}s. See {OUT}")


def pct(x, digits: int = 1) -> str:
    return f"{100 * x:.{digits}f}%"


def summary(r: dict) -> str:
    lines = ["# SUNSHARE CONTINUITY results", "",
             f"Exact best benefit: {r['exact']['benefit']:.0f} "
             f"({r['exact']['n_feasible']} valid schedules out of {r['exact']['n_total']}).", "",
             "## Encoding cost (1 QAOA layer)", "",
             "| Encoding | Qubits | Two qubit gates | Depth |", "| --- | --- | --- | --- |"]
    for key, label in (("slack", "Standard"), ("compact", "SUNSHARE")):
        s = r["circuit_stats"][key]
        lines.append(f"| {label} | {s['qubits']} | {s['two_qubit_gates']} | {s['depth']} |")
    lines += ["", "## SUNSHARE encoding by depth", "",
              "| Layers | Valid share | Exact best share | Best valid benefit | Gap |",
              "| --- | --- | --- | --- | --- |"]
    for row in r["depth_study"]:
        lines.append(f"| {row['reps']} | {pct(row['valid_share'])} | {pct(row['optimum_share'], 2)} "
                     f"| {row['best_valid_benefit']} | {row['gap_to_exact']} |")
    ref = r["random_guess"]
    lines += ["", f"Random guessing: {pct(ref['valid_share'])} valid, "
                  f"{pct(ref['optimum_share'], 2)} exact best.", "",
              "## Same optimiser budget, both encodings", "",
              "| Encoding | Layers | Valid share | Exact best share | Seconds |",
              "| --- | --- | --- | --- | --- |"]
    for key, label in (("slack", "Standard"), ("compact", "SUNSHARE")):
        for row in r["same_budget"][key]:
            lines.append(f"| {label} | {row['reps']} | {pct(row['valid_share'])} "
                         f"| {pct(row['optimum_share'], 2)} | {row['seconds']} |")
    lines += ["", "## Penalty sensitivity (SUNSHARE encoding)", "",
              "| Penalty | Layers | Valid share | Exact best share |", "| --- | --- | --- | --- |"]
    for p in sorted(r["penalty_sensitivity"]):
        for row in r["penalty_sensitivity"][p]:
            lines.append(f"| {p} | {row['reps']} | {pct(row['valid_share'])} "
                         f"| {pct(row['optimum_share'], 2)} |")
    f = r["fcfs"]
    w = r["whatif_two_battery_blocks"]
    lines += ["", "## First come first served", "",
              f"Over all 24 arrival orders: lowest {f['min']:.0f}, highest {f['max']:.0f}, "
              f"average {f['mean']:.1f}. Only {f['orders_reaching_best']} orders reach the best.", "",
              "## What if the battery had 10 kWh", "",
              f"Exact best benefit rises to {w['exact']['benefit']:.0f}. "
              f"Best valid benefit sampled by QAOA at 3 layers: {w['qaoa'][-1]['best_valid_benefit']}.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    main(quick="--quick" in sys.argv)
```

- [ ] **Step 3: Run the quick version first**

Run: `python run_all.py --quick`

Expected: finishes in about 4 minutes and prints lines like these:

```text
Exact best benefit: 25 {'Morning': ['Milk chilling', 'battery block'], 'Midday': ['Irrigation'], 'Afternoon': ['Water purification'], 'Evening': []}
SUNSHARE encoding, full optimiser budget
  compact  layers=1 valid=0.245 best=0.0110 time=3.4s
  compact  layers=2 valid=0.526 best=0.0315 time=16.4s
  compact  layers=3 valid=0.698 best=0.0688 time=25.1s
```

Open `results/timetable.png` and `results/architecture.png` and check they look right.

- [ ] **Step 4: Run the full version**

Run: `python run_all.py`

Expected: finishes in about 9 minutes. The two 20 qubit runs are the slow part. Start this and work on the README while it runs.

Expected content of `results/summary.md`:

````markdown
# SUNSHARE CONTINUITY results

Exact best benefit: 25 (52 valid schedules out of 2048).

## Encoding cost (1 QAOA layer)

| Encoding | Qubits | Two qubit gates | Depth |
| --- | --- | --- | --- |
| Standard | 20 | 106 | 60 |
| SUNSHARE | 11 | 46 | 55 |

## SUNSHARE encoding by depth

| Layers | Valid share | Exact best share | Best valid benefit | Gap |
| --- | --- | --- | --- | --- |
| 1 | 24.5% | 1.10% | 25 | 0 |
| 2 | 52.6% | 3.15% | 25 | 0 |
| 3 | 69.8% | 6.88% | 25 | 0 |

Random guessing: 2.5% valid, 0.05% exact best.

## Same optimiser budget, both encodings

| Encoding | Layers | Valid share | Exact best share | Seconds |
| --- | --- | --- | --- | --- |
| Standard | 1 | 5.3% | 0.05% | 142.4 |
| Standard | 2 | 10.0% | 0.17% | 199.9 |
| SUNSHARE | 1 | 24.5% | 1.10% | 1.4 |
| SUNSHARE | 2 | 52.6% | 3.15% | 4.5 |

## Penalty sensitivity (SUNSHARE encoding)

| Penalty | Layers | Valid share | Exact best share |
| --- | --- | --- | --- |
| 12 | 1 | 24.5% | 1.10% |
| 12 | 2 | 52.6% | 3.15% |
| 12 | 3 | 69.8% | 6.88% |
| 20 | 1 | 33.1% | 0.73% |
| 20 | 2 | 65.7% | 1.93% |
| 20 | 3 | 84.1% | 2.83% |
| 40 | 1 | 38.2% | 0.68% |
| 40 | 2 | 75.3% | 0.76% |
| 40 | 3 | 89.2% | 0.61% |

## First come first served

Over all 24 arrival orders: lowest 9, highest 25, average 16.8. Only 5 orders reach the best.

## What if the battery had 10 kWh

Exact best benefit rises to 28. Best valid benefit sampled by QAOA at 3 layers: 28.
````

- [ ] **Step 5: Look at every chart**

Open all seven PNG files in `results/`. Check that no label overlaps and every number is readable. These go into the report and the video.

- [ ] **Step 6: Commit code and results**

```bash
git add .
git commit -m "feat: one command reproduction with charts, tables and architecture diagram"
```

---

### Task 5: README and public GitHub repository

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the finished repository.
- Produces: a public GitHub link for the report and the submission form.

- [ ] **Step 1: Write the README**

Create `README.md`:

````markdown
# SUNSHARE CONTINUITY

Quantum scheduling of limited solar energy for essential village services.
Built for the Qiskit Fall Fest 2026 Hackathon, domain 6: Energy and Smart Infrastructure.

## The problem

A village solar installation with a small battery powers a milk chiller, an
irrigation pump, a water purifier and household lighting. There is not enough
energy to run everything, and the sun is not available in every time slot.
Which service should run in which slot?

The clinic's vaccine fridge is protected first and is never part of the trade.

## What this repository does

1. Describes the day as 11 yes or no choices (7 service choices, 4 battery choices).
2. Finds the true best schedule by checking all 2,048 options.
3. Builds two quantum encodings of the same problem:
   * the standard one with helper (slack) qubits: 20 qubits
   * the SUNSHARE one that fines exact rule breaking combinations: 11 qubits
4. Runs QAOA in Qiskit on both, samples schedules, and checks every sample
   against the original rules.
5. Compares everything with the exact answer, with first come first served,
   and with random guessing.

## Setup

Python 3.10 or newer.

```
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Reproduce every result

```
python -m pytest tests -q        # 18 checks, about 5 seconds
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
| `depth_study.png` | SUNSHARE encoding at 1, 2 and 3 QAOA layers |
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
| `src/encode_compact.py` | SUNSHARE encoding, 11 qubits |
| `src/encode_slack.py` | Standard encoding, 20 qubits |
| `src/qaoa_solver.py` | QAOA circuit, angle tuning, sampling |
| `src/decoder.py` | Validates and scores sampled schedules |
| `src/figures.py` | Charts and architecture diagram |
| `run_all.py` | One command that reproduces everything |

## Honest limitations

* The instance is tiny. Exact enumeration solves it instantly. We claim no quantum speedup.
* All input values are synthetic. Benefit scores are human value judgments.
* The battery is simplified: already charged, used in whole blocks, no wear.
* The SUNSHARE encoding grows quickly if many services can share one slot.
* Two of its fines involve three choices at once, so it is a QUBO plus two higher order terms.
* Results come from an ideal simulator. Real hardware noise would lower quality.

## Credits

* Qiskit and Qiskit Aer (IBM), NumPy, SciPy, Matplotlib.
* No tutorial code was copied. Development was assisted by an AI coding
  assistant. All code was reviewed and run by the team.
````

If the event rules require stating how AI tools were used, keep the last credit line. Decide this as a team, and keep it truthful.

- [ ] **Step 2: Create the public repository and push**

Create an empty public repository named `sunshare-continuity` on github.com (no README, no licence), then:

```bash
git add README.md
git commit -m "docs: README with setup, reproduction steps, limitations and credits"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sunshare-continuity.git
git push -u origin main
```

Replace `YOUR_USERNAME` with the account that owns the repository.

- [ ] **Step 3: Prove a stranger can run it**

```bash
cd /tmp && git clone https://github.com/YOUR_USERNAME/sunshare-continuity.git check && cd check
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests -q
```

Expected: `18 passed`. Open the repository link in a private browser window and confirm it loads without signing in.

---

### Task 6: Report (.docx)

**Files:**
- Create: `SUNSHARE_CONTINUITY_report.docx` (outside the repository, or in `report/` if you want it versioned)

**Interfaces:**
- Consumes: `results/summary.md`, the seven PNG files, the list of 16 fines, the GitHub link.
- Produces: the .docx file to upload with the form.

Write in plain sentences. No dashes used as punctuation and no dates. Keep it to about four pages. Use these sections in this order, which follows the six steps in the challenge brief.

- [ ] **Step 1: Title block**

Title "SUNSHARE CONTINUITY: Quantum Scheduling of Limited Solar Energy for Essential Village Services". Then team name, member names, domain "Energy and Smart Infrastructure", and the GitHub link.

- [ ] **Step 2: Section 1, Problem statement (rubric A)**

Three short paragraphs: who it serves (operators of small community solar installations), the situation (four services, four time slots, not enough energy, one battery block), and the question (which service runs in which slot for the most benefit without breaking any energy limit). State that the vaccine fridge is protected before optimization.

- [ ] **Step 3: Section 2, Formulation (rubric A)**

Include the two instance tables (supply per slot, and services with energy, allowed slots and benefit scores) from `SUNSHARE_CONTINUITY_final.md` section 4. List the 11 decision variables, the objective (benefit minus 0.25 per battery block), and the four rules. State that all values are synthetic.

- [ ] **Step 4: Section 3, Quantum approach and justification (rubric B)**

Explain why QAOA fits (yes or no choices that interact). Explain the standard encoding (9 helper qubits, 20 total) and the SUNSHARE encoding (16 fines, 11 qubits). Paste the list of 16 fines as a table. State that two fines involve three choices, so the model is a QUBO plus two higher order terms, and that QAOA applies these as three qubit interactions. Insert `encoding_cost.png`.

- [ ] **Step 5: Section 4, Architecture (required diagram)**

Insert `architecture.png` with a two sentence caption.

- [ ] **Step 6: Section 5, Implementation (rubric C)**

One paragraph: Qiskit `QAOAAnsatz`, Aer statevector simulator, Aer Estimator for the average cost, COBYLA for the angles, Aer Sampler with 4,096 shots, every sample decoded and checked against the original rules. Mention the 18 automated checks and what they prove (use the four bullet points from Task 2, Step 6).

- [ ] **Step 7: Section 6, Results and classical comparison (rubric C)**

Paste the tables from `results/summary.md`. Insert `quality_comparison.png`, `depth_study.png`, `fcfs_orders.png`, `timetable.png` and `timetable_whatif.png`. State these sentences with your own final numbers:

* The exact best benefit is 25. QAOA with the SUNSHARE encoding sampled that schedule at every depth, so the gap is 0.
* At the same optimiser budget and 1 layer, 24.5% of SUNSHARE samples were valid against 5.3% for the standard encoding. Random guessing gives 2.5%.
* With 3 layers the SUNSHARE valid share reached 69.8% and the exact best appeared in 6.9% of samples, against 0.05% for random guessing.
* First come first served scored between 9 and 25 depending on arrival order, with an average of 16.8.
* With a 10 kWh battery the exact best rises to 28 and households are served.

- [ ] **Step 8: Section 7, Limitations and trade offs (rubric B and the "Reflect" step)**

Use the limitations list from the README, plus the two observations from "What the run already showed" (bigger fines trade valid share against best share; the exact best is a small share of samples). Add one sentence on runtime: exact enumeration takes well under a second, QAOA simulation takes seconds to minutes, so there is no speed benefit at this size.

- [ ] **Step 9: Section 8, Reproducibility and credits**

The three commands from the README, the pinned versions, the fixed seeds, and the credits.

- [ ] **Step 10: Export check**

Save as .docx. Reopen the file and confirm every image shows and every table fits the page width.

---

### Task 7: Video (at most 3 minutes)

**Files:**
- Create: one video file, uploaded to Google Drive

**Interfaces:**
- Consumes: the charts in `results/`, a terminal ready to run `python run_all.py --quick`.
- Produces: a share link set to "anyone with the link".

- [ ] **Step 1: Prepare the screen**

Open in this order: `timetable.png`, `encoding_cost.png`, a terminal in the repository, `quality_comparison.png`, `depth_study.png`, `fcfs_orders.png`, `timetable_whatif.png`. Run `python run_all.py --quick` once beforehand so you know it works on the recording machine.

- [ ] **Step 2: Record with this script (about 390 words)**

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:25 | Title, then the supply and services tables | "A village solar installation powers a milk chiller, an irrigation pump, a water purifier and household lighting. There is not enough energy for all of them, and the sun is not there in every time slot. So which service runs when? That is SUNSHARE CONTINUITY. The clinic's vaccine fridge is protected first and is never traded." |
| 0:25 to 1:05 | The list of 11 choices, then `encoding_cost.png` | "We describe the day as 11 yes or no choices. Each one becomes a qubit. The standard method handles energy limits by adding helper qubits, which takes this problem to 20 qubits. Qubits are the scarcest resource on today's machines, so we did it differently. We list the exact small combinations that break a rule, 16 of them, and fine only those. That needs 11 qubits and less than half the two qubit gates." |
| 1:05 to 1:45 | Terminal running `python run_all.py --quick`, then `timetable.png` | "Here is QAOA running in Qiskit on the simulator. A classical optimizer tunes the circuit, then we sample it 4,096 times and check every sample against the original rules. The best valid schedule it found is milk in the morning using the battery, irrigation at midday, and water in the afternoon. Households get no power because the only battery block was needed in the morning." |
| 1:45 to 2:25 | `quality_comparison.png`, `depth_study.png`, `fcfs_orders.png` | "We checked all 2,048 schedules by brute force. The true best scores 25, and QAOA found exactly that. With the same optimiser budget, 24.5% of our samples were valid, against 5.3% for the standard encoding and 2.5% for random guessing. With three layers that rises to 69.8%. First come first served scores anywhere from 9 to 25 depending on who asks first." |
| 2:25 to 2:42 | `timetable_whatif.png` | "If we raise the battery from 5 to 10 kilowatt hours, the schedule changes and households get their evening power." |
| 2:42 to 3:00 | Limitations slide | "To be clear about limits: this is a tiny instance with synthetic data, on an ideal simulator. Brute force is faster here, and we claim no quantum speedup. What we show is a correct, tested mapping of a real scheduling problem onto fewer qubits." |

Replace the numbers with your own final numbers if they differ.

- [ ] **Step 3: Check the length**

The file must be 3:00 or shorter. If it runs long, cut the first come first served sentence first.

- [ ] **Step 4: Upload and share**

Upload to Google Drive. Set sharing to "anyone with the link" as viewer. Open the link in a private browser window and confirm it plays without signing in.

---

### Task 8: Submit

- [ ] **Step 1: Final repository check**

Run `git status` and confirm nothing is uncommitted. Run `git log -1` and confirm the last commit time is before 11:59pm. Push.

- [ ] **Step 2: Test every link in a private browser window**

GitHub repository, video link, and the report if it is shared by link.

- [ ] **Step 3: Fill in the form**

Open https://forms.gle/jSRrXaHkjVb7G7AK8 and submit the repository link, the report, and the video link. Aim to submit by 11:15pm.

- [ ] **Step 4: Stop**

Make no more commits after submitting.

---

## If something goes wrong

| Problem | What to do |
| --- | --- |
| `pip install` fails on a pinned version | Loosen only that line to `>=` the major version, reinstall, rerun the tests |
| The full run is too slow on your laptop | Use `python run_all.py --quick`. Report the 20 qubit quality comparison only if you ran it yourself. Otherwise report the qubit and gate counts only, which need no long run |
| Your numbers differ from this plan | Report your numbers. Small differences are normal |
| A test fails | Do not edit the test to make it pass. Compare your file with the code block in this plan character by character |
| You run out of time for the report | Keep sections 1, 2, 3, 6 and 7, plus the architecture diagram. Those carry the rubric points |

## Not in this plan

Left out on purpose so the core is finished well: the Streamlit dashboard, memory across days, warm start QAOA, real hardware runs and noise models. Mention them as future work in the report.
