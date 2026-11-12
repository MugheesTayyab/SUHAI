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
             maxiter: int = 300, seed: int = 42, previous: dict | None = None,
             progress=None) -> dict:
    """Tune the angles from several starts, then sample the best circuit.

    previous: angles (by parameter name) from a shallower run, used as one
    of the starting points. Returns counts keyed by the decision bits only
    (helper qubits dropped), as tuples in Encoding.var_names order.
    progress: optional function called with a small dict after every cost
    evaluation and before sampling. The web dashboard uses it to draw the
    optimiser live. It never changes the result.
    """
    started = time.time()
    ansatz, operator = build_ansatz(enc, reps)
    backend = AerSimulator(method="statevector")
    compiled = transpile(ansatz, backend, optimization_level=1, seed_transpiler=7)
    params = list(compiled.parameters)
    estimator = EstimatorV2(options={"default_precision": 0.0,
                                     "backend_options": {"method": "statevector"}})

    tracker = {"start": 0, "evals": 0}

    def energy(values) -> float:
        job = estimator.run([(compiled, operator, values)])
        value = float(job.result()[0].data.evs)
        tracker["evals"] += 1
        if progress is not None:
            progress({"stage": "optimise", "reps": reps, "start": tracker["start"],
                      "n_starts": n_starts, "evaluation": tracker["evals"],
                      "energy": value})
        return value

    rng = np.random.default_rng(seed)
    starts = [rng.uniform(0, np.pi, len(params)) for _ in range(n_starts)]
    if previous is not None:
        base = _angles_from_previous(params, previous)
        starts = [base] + [base + rng.normal(0, 0.1, len(params))
                           for _ in range(n_starts - 1)]
    best = None
    for k, start in enumerate(starts):
        tracker["start"] = k
        res = minimize(energy, start, method="COBYLA", options={"maxiter": maxiter})
        if best is None or res.fun < best.fun:
            best = res

    if progress is not None:
        progress({"stage": "sample", "reps": reps, "shots": shots,
                  "energy": float(best.fun)})
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
