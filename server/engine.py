"""Everything the web app needs, built only from the tested code in src/.

Nothing in this file solves the problem a second way. It loads the same
scenario, calls the same exact solver, the same encodings and the same
QAOA function that produced the report, and reshapes their answers for
the browser.
"""
from __future__ import annotations

import json
import platform
import threading
import time
import uuid
from dataclasses import replace
from functools import lru_cache
from itertools import product
from pathlib import Path

from src.classical_solver import fcfs_all_orders, solve_exact
from src.decoder import random_guess_reference, score_samples
from src.encode_compact import build_compact
from src.encode_slack import build_slack
from src.encoding import evaluate as poly_value
from src.model import Scenario, benefit, is_feasible, load_scenario, objective, violations

ROOT = Path(__file__).resolve().parent.parent
SCENARIO_FILE = ROOT / "data" / "sample_scenario.json"
RESULTS_FILE = ROOT / "results" / "results.json"
DEFAULT_PENALTY = 12

BUDGETS = {
    "quick": {"n_starts": 3, "maxiter": 150},      # the same budget used for the fair comparison
    "thorough": {"n_starts": 8, "maxiter": 300},   # the budget used for the depth study
}

SLOT_WORDS = {0: "in the morning", 1: "at midday", 2: "in the afternoon", 3: "in the evening"}

BASE = load_scenario(SCENARIO_FILE)


# --------------------------------------------------------------------------
# Scenario and schedules
# --------------------------------------------------------------------------

def scenario_for(battery_blocks: int) -> Scenario:
    return replace(BASE, battery_blocks=battery_blocks)


def bits_from_text(text: str) -> tuple:
    return tuple(int(c) for c in text)


def bits_to_text(bits) -> str:
    return "".join(str(int(b)) for b in bits)


def bits_to_index(bits) -> int:
    """Qubit i is bit i of the index. This matches encoding.cost_vector."""
    return sum(int(b) << i for i, b in enumerate(bits))


def describe_var(scn: Scenario, name: str) -> dict:
    slot = int(name[1:])
    if name.startswith("d"):
        return {"var": name, "kind": "battery", "slot": slot,
                "label": f"Battery {SLOT_WORDS[slot]}", "short": "Battery",
                "service": None, "benefit": None, "energy": 1}
    for var, svc, s, b in scn.service_vars:
        if var == name:
            return {"var": name, "kind": "service", "slot": s, "service": svc.key,
                    "label": f"{svc.name} {SLOT_WORDS[s]}", "short": svc.name,
                    "benefit": b, "energy": svc.energy}
    raise KeyError(name)


def describe_scenario(scn: Scenario) -> dict:
    return {
        "note": "Synthetic values chosen by the team. Energy is counted in blocks of 5 kWh.",
        "block_kwh": 5,
        "slots": [{"index": t, "name": scn.slot_names[t], "solar_blocks": scn.solar[t],
                   "solar_kwh": scn.solar[t] * 5} for t in range(scn.n_slots)],
        "battery_blocks": scn.battery_blocks,
        "battery_kwh": scn.battery_blocks * 5,
        "battery_cost": scn.battery_cost,
        "services": [{"key": s.key, "name": s.name, "energy": s.energy, "energy_kwh": s.energy * 5,
                      "options": [{"slot": t, "benefit": b, "var": f"{s.key}{t}"} for t, b in s.benefits]}
                     for s in scn.services],
        "variables": [describe_var(scn, n) for n in scn.var_names],
        "n_schedules": 2 ** scn.n_vars,
        "protected": "The clinic vaccine fridge is powered before optimisation and never competes.",
    }


def schedule_view(scn: Scenario, bits) -> dict:
    """A schedule the browser can draw: what runs in each slot and why it is or is not valid."""
    bits = tuple(int(b) for b in bits)
    value = dict(zip(scn.var_names, bits))
    slots = []
    for t in range(scn.n_slots):
        running = [{"var": var, "key": svc.key, "name": svc.name, "energy": svc.energy, "benefit": b}
                   for var, svc, slot, b in scn.service_vars if slot == t and value[var]]
        battery = bool(value[f"d{t}"])
        used = sum(s["energy"] for s in running)
        capacity = scn.solar[t] + int(battery)
        slots.append({"index": t, "name": scn.slot_names[t], "solar": scn.solar[t], "battery": battery,
                      "used": used, "capacity": capacity, "spare": capacity - used,
                      "over": used > capacity, "services": running})
    counts = {s.key: sum(value[f"{s.key}{t}"] for t in s.slots) for s in scn.services}
    return {
        "bits": bits_to_text(bits),
        "index": bits_to_index(bits),
        "slots": slots,
        "served": [s.name for s in scn.services if counts[s.key] >= 1],
        "unserved": [s.name for s in scn.services if counts[s.key] == 0],
        "benefit": benefit(scn, bits),
        "objective": round(objective(scn, bits), 4),
        "battery_used": sum(value[f"d{t}"] for t in range(scn.n_slots)),
        "feasible": is_feasible(scn, bits),
        "violations": violations(scn, bits),
    }


# --------------------------------------------------------------------------
# The 16 fines, in plain words
# --------------------------------------------------------------------------

def _parse_fine(text: str, names: list) -> tuple:
    ones_text, _, zeros_text = text.partition(" without ")
    ones = [names.index(n) for n in ones_text.split(" and ")]
    zeros = [names.index(n) for n in zeros_text.split(" or ")] if zeros_text else []
    return ones, zeros


def _plain_fine(scn: Scenario, ones: list, zeros: list) -> str:
    names = scn.var_names
    parts = [describe_var(scn, names[i]) for i in ones]
    if all(p["kind"] == "battery" for p in parts):
        when = [SLOT_WORDS[p["slot"]] for p in parts]
        if len(when) == 2:
            return f"Battery spent {when[0]} and again {when[1]}"
        return f"Battery spent {', '.join(when[:-1])} and {when[-1]}, one block too many"
    services = {p["service"] for p in parts}
    if len(parts) > 1 and len(services) == 1:
        return f"{parts[0]['short']} scheduled twice"
    slot_word = SLOT_WORDS[parts[0]["slot"]]
    who = " and ".join(p["short"].lower() if k else p["short"] for k, p in enumerate(parts))
    if zeros:
        return f"{who} {slot_word} without the battery"
    if len(parts) == 1:
        return f"{who} {slot_word} can never fit"
    return f"{who} cannot share the {scn.slot_names[parts[0]['slot']].lower()} sun"


@lru_cache(maxsize=16)
def compact_encoding(battery_blocks: int, penalty: float):
    return build_compact(scenario_for(battery_blocks), penalty)


@lru_cache(maxsize=16)
def fines_for(battery_blocks: int, penalty: float) -> list:
    scn = scenario_for(battery_blocks)
    enc = compact_encoding(battery_blocks, penalty)
    out = []
    for k, text in enumerate(enc.fines):
        ones, zeros = _parse_fine(text, scn.var_names)
        out.append({"id": k, "code": text, "plain": _plain_fine(scn, ones, zeros),
                    "ones": [scn.var_names[i] for i in ones],
                    "zeros": [scn.var_names[i] for i in zeros],
                    "order": len(ones) + len(zeros)})
    return out


def evaluate_bits(bits_text: str, battery_blocks: int, penalty: float) -> dict:
    """Score any hand made schedule exactly the way the quantum cost sees it."""
    scn = scenario_for(battery_blocks)
    bits = bits_from_text(bits_text)
    enc = compact_encoding(battery_blocks, penalty)
    value = dict(zip(scn.var_names, bits))
    fired = [f["id"] for f in fines_for(battery_blocks, penalty)
             if all(value[v] for v in f["ones"]) and not any(value[v] for v in f["zeros"])]
    exact = exact_for(battery_blocks)
    view = schedule_view(scn, bits)
    view.update({
        "penalty": penalty,
        "quantum_cost": round(poly_value(enc.poly, bits), 4),
        "fines_fired": fired,
        "best_objective": exact["objective"],
        "is_exact_best": bits_to_text(bits) == exact["view"]["bits"],
    })
    return view


# --------------------------------------------------------------------------
# Classical references
# --------------------------------------------------------------------------

@lru_cache(maxsize=4)
def exact_for(battery_blocks: int) -> dict:
    scn = scenario_for(battery_blocks)
    started = time.perf_counter()
    result = solve_exact(scn)
    ms = (time.perf_counter() - started) * 1000
    return {"objective": result["objective"], "benefit": result["benefit"],
            "n_feasible": result["n_feasible"], "n_total": result["n_total"],
            "milliseconds": round(ms, 1), "view": schedule_view(scn, result["bits"]),
            "bits": tuple(result["bits"]),
            "random": random_guess_reference(result)}


def exact_public(battery_blocks: int) -> dict:
    out = dict(exact_for(battery_blocks))
    out.pop("bits")
    return out


@lru_cache(maxsize=4)
def landscape_for(battery_blocks: int) -> dict:
    """Every one of the 2,048 schedules, in index order, as valid or not and its score."""
    scn = scenario_for(battery_blocks)
    n = scn.n_vars
    feasible = [0] * (2 ** n)
    score = [0.0] * (2 ** n)
    for bits in product((0, 1), repeat=n):
        k = bits_to_index(bits)
        feasible[k] = int(is_feasible(scn, bits))
        score[k] = round(objective(scn, bits), 2)
    exact = exact_for(battery_blocks)
    return {"n_vars": n, "feasible": feasible, "objective": score,
            "exact_index": exact["view"]["index"], "n_feasible": sum(feasible)}


@lru_cache(maxsize=4)
def fcfs_for(battery_blocks: int) -> dict:
    scn = scenario_for(battery_blocks)
    from src.classical_solver import first_come_first_served
    rows = []
    for order, score in fcfs_all_orders(scn):
        bits = first_come_first_served(scn, order)
        rows.append({"order": [scn.services[i].name for i in order], "benefit": score,
                     "bits": bits_to_text(bits)})
    scores = [r["benefit"] for r in rows]
    best = exact_for(battery_blocks)["benefit"]
    return {"orders": rows, "min": min(scores), "max": max(scores),
            "mean": round(sum(scores) / len(scores), 2),
            "reaching_best": scores.count(best), "best": best}


# --------------------------------------------------------------------------
# Circuit size (needs Qiskit, cached because transpiling 20 qubits takes a moment)
# --------------------------------------------------------------------------

_stats_lock = threading.Lock()
_stats_cache: dict = {}


def circuit_stats_for(encoding: str, battery_blocks: int, penalty: float, reps: int = 1) -> dict:
    key = (encoding, battery_blocks, penalty, reps)
    with _stats_lock:
        if key in _stats_cache:
            return _stats_cache[key]
    from src.qaoa_solver import circuit_stats
    scn = scenario_for(battery_blocks)
    enc = build_compact(scn, penalty) if encoding == "compact" else build_slack(scn, penalty)
    stats = circuit_stats(enc, reps)
    stats["helper_qubits"] = enc.n_qubits - enc.n_decision
    if encoding == "compact":
        stats["penalty_terms"] = len(enc.fines)          # the 16 fines
    else:
        stats["limits_with_helpers"] = len(enc.fines)    # 4 slot limits and the battery limit
    with _stats_lock:
        _stats_cache[key] = stats
    return stats


SPEED: dict = {"ms_per_eval": None}


def calibrate(samples: int = 15) -> float:
    """Time one cost evaluation of the 11 qubit circuit on this machine, so the
    dashboard can promise a run time it can actually keep."""
    import numpy as np
    from qiskit import transpile
    from qiskit_aer import AerSimulator
    from qiskit_aer.primitives import EstimatorV2
    from src.qaoa_solver import build_ansatz

    ansatz, operator = build_ansatz(compact_encoding(1, DEFAULT_PENALTY), 1)
    compiled = transpile(ansatz, AerSimulator(method="statevector"), optimization_level=1, seed_transpiler=7)
    est = EstimatorV2(options={"default_precision": 0.0, "backend_options": {"method": "statevector"}})
    est.run([(compiled, operator, [0.1, 0.2])]).result()
    rng = np.random.default_rng(0)
    started = time.perf_counter()
    for _ in range(samples):
        est.run([(compiled, operator, rng.uniform(0, np.pi, 2))]).result()
    SPEED["ms_per_eval"] = round((time.perf_counter() - started) * 1000 / samples, 2)
    return SPEED["ms_per_eval"]


def engine_info() -> dict:
    info = {"python": platform.python_version(), "qiskit": None, "qiskit_aer": None,
            "simulator": "Aer statevector", "ready": False,
            "ms_per_eval": SPEED["ms_per_eval"]}
    try:
        import qiskit
        import qiskit_aer
        info.update(qiskit=qiskit.__version__, qiskit_aer=qiskit_aer.__version__, ready=True)
    except Exception as exc:  # reported to the browser, never hidden
        info["error"] = f"{type(exc).__name__}: {exc}"
    return info


@lru_cache(maxsize=1)
def recorded_results() -> dict:
    """The full reproduction run written by run_all.py."""
    if not RESULTS_FILE.exists():
        return {}
    return json.loads(RESULTS_FILE.read_text())


# --------------------------------------------------------------------------
# Live QAOA runs
# --------------------------------------------------------------------------

class RunCancelled(Exception):
    pass


class Run:
    def __init__(self, params: dict):
        self.id = uuid.uuid4().hex[:10]
        self.params = params
        self.status = "queued"
        self.events: list = []
        self.result: dict | None = None
        self.error: str | None = None
        self.created = time.time()
        self.started: float | None = None
        self.cancelled = False
        self._lock = threading.Lock()

    def emit(self, kind: str, data: dict) -> None:
        with self._lock:
            self.events.append({"seq": len(self.events), "kind": kind, "data": data,
                                "t": round(time.time() - (self.started or self.created), 3)})

    def events_since(self, seq: int) -> list:
        with self._lock:
            return self.events[seq:]

    def public(self) -> dict:
        return {"id": self.id, "status": self.status, "params": self.params,
                "error": self.error, "result": self.result,
                "events": len(self.events)}


class RunManager:
    """One QAOA run at a time, on a worker thread, with live progress events."""

    MAX_KEPT = 30

    def __init__(self):
        self.runs: dict = {}
        self._queue: list = []
        self._lock = threading.Lock()
        self._wake = threading.Event()
        threading.Thread(target=self._worker, daemon=True, name="qaoa-worker").start()

    def submit(self, params: dict) -> Run:
        run = Run(params)
        with self._lock:
            self.runs[run.id] = run
            self._queue.append(run)
            position = len(self._queue)
            self._trim()
        run.emit("queued", {"position": position})
        self._wake.set()
        return run

    def get(self, run_id: str) -> Run | None:
        return self.runs.get(run_id)

    def cancel(self, run_id: str) -> bool:
        run = self.runs.get(run_id)
        if run is None or run.status in ("done", "failed", "cancelled"):
            return False
        run.cancelled = True
        return True

    def busy(self) -> bool:
        return any(r.status in ("queued", "running") for r in self.runs.values())

    def _trim(self) -> None:
        finished = [r for r in self.runs.values() if r.status in ("done", "failed", "cancelled")]
        finished.sort(key=lambda r: r.created)
        while len(self.runs) > self.MAX_KEPT and finished:
            self.runs.pop(finished.pop(0).id, None)

    def _worker(self) -> None:
        while True:
            self._wake.wait()
            with self._lock:
                run = self._queue.pop(0) if self._queue else None
                if not self._queue:
                    self._wake.clear()
            if run is None:
                continue
            if run.cancelled:
                run.status = "cancelled"
                run.emit("cancelled", {})
                continue
            execute(run)


def execute(run: Run) -> None:
    from src.qaoa_solver import run_qaoa

    p = run.params
    run.status = "running"
    run.started = time.time()
    try:
        scn = scenario_for(p["battery_blocks"])
        exact = exact_for(p["battery_blocks"])
        build = build_compact if p["encoding"] == "compact" else build_slack
        enc = build(scn, p["penalty"])
        budget = BUDGETS[p["budget"]]
        run.emit("started", {"qubits": enc.n_qubits, "decision_qubits": enc.n_decision,
                             "helper_qubits": enc.n_qubits - enc.n_decision,
                             "penalty_terms": len(enc.fines) if p["encoding"] == "compact" else None,
                             "budget": budget,
                             "layers": p["layers"]})

        last_sent = {"t": 0.0}

        def progress(info: dict) -> None:
            if run.cancelled:
                raise RunCancelled()
            now = time.time()
            # Send every step while it is cheap; thin out only on very long runs.
            if info["stage"] == "optimise" and info["evaluation"] > 600 and now - last_sent["t"] < 0.03:
                return
            last_sent["t"] = now
            run.emit(info["stage"], info)

        layers, previous, final = [], None, None
        for reps in range(1, p["layers"] + 1):
            out = run_qaoa(enc, reps=reps, shots=p["shots"], seed=p["seed"],
                           previous=previous, progress=progress, **budget)
            previous = out["angles"]
            scored = score_samples(scn, out["counts"], exact)
            row = {"reps": reps, "valid_share": scored["valid_share"],
                   "optimum_share": scored["optimum_share"],
                   "best_valid_benefit": scored["best_valid_benefit"],
                   "gap_to_exact": scored["gap_to_exact"],
                   "energy": out["energy"], "seconds": round(out["seconds"], 2)}
            layers.append(row)
            run.emit("layer_done", row)
            final = (out, scored)

        out, scored = final
        run.result = summarise(scn, exact, out, scored, layers, p, enc, time.time() - run.started)
        run.status = "done"
        run.emit("done", {"seconds": run.result["seconds"]})
    except RunCancelled:
        run.status = "cancelled"
        run.emit("cancelled", {})
    except Exception as exc:
        run.status = "failed"
        run.error = f"{type(exc).__name__}: {exc}"
        run.emit("failed", {"error": run.error})


def summarise(scn, exact, out, scored, layers, params, enc, seconds) -> dict:
    counts = out["counts"]
    shots = sum(counts.values())
    density = [0] * (2 ** scn.n_vars)
    for bits, n in counts.items():
        density[bits_to_index(bits)] += n

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], bits_to_text(kv[0])))
    top = []
    for bits, n in ranked[:24]:
        top.append({"bits": bits_to_text(bits), "count": n, "share": n / shots,
                    "feasible": is_feasible(scn, bits), "benefit": benefit(scn, bits),
                    "objective": round(objective(scn, bits), 2),
                    "violations": violations(scn, bits),
                    "is_exact": tuple(bits) == exact["bits"]})

    histogram: dict = {}
    invalid = 0
    for bits, n in counts.items():
        if is_feasible(scn, bits):
            b = benefit(scn, bits)
            histogram[b] = histogram.get(b, 0) + n
        else:
            invalid += n

    best_bits = scored["best_valid_bits"]
    return {
        "params": params,
        "seconds": round(seconds, 2),
        "qubits": enc.n_qubits,
        "helper_qubits": enc.n_qubits - enc.n_decision,
        "shots": shots,
        "distinct": len(counts),
        "layers": layers,
        "valid_share": scored["valid_share"],
        "optimum_share": scored["optimum_share"],
        "exact_hits": counts.get(exact["bits"], 0),
        "gap_to_exact": scored["gap_to_exact"],
        "mean_valid_benefit": scored["mean_valid_benefit"],
        "best_valid": schedule_view(scn, best_bits) if best_bits else None,
        "most_common": schedule_view(scn, scored["most_common_bits"]),
        "exact": exact_public(params["battery_blocks"]),
        "random": exact["random"],
        "top_samples": top,
        "benefit_histogram": [{"benefit": b, "shots": histogram[b]} for b in sorted(histogram)],
        "invalid_shots": invalid,
        "density": density,
        "angles": out["angles"],
    }
