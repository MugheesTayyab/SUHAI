"""Build the static site that Vercel serves.

    python build_static.py              # data files plus all 10 recorded runs (about 20 minutes)
    python build_static.py --no-runs    # data files only, keeps any runs already recorded

Everything is written to web/data/ by calling the same functions the live
server calls, so the hosted site and `python serve.py` cannot disagree.
A hosted page has no Python behind it, so QAOA runs are recorded here with
Qiskit Aer and replayed in the browser, step by step, with their real timings.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from itertools import product
from pathlib import Path

from server import engine

OUT = engine.ROOT / "web" / "data"
PENALTY = engine.DEFAULT_PENALTY

# Every combination the control room offers. The 20 qubit encoding stops at two layers.
RUN_GRID = [("compact", layers, b) for b in (1, 2) for layers in (1, 2, 3)] + \
           [("slack", layers, b) for b in (1, 2) for layers in (1, 2)]


def write(name: str, data) -> None:
    path = OUT / name
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"  {name:28s} {path.stat().st_size / 1024:7.1f} KB", flush=True)


def eval_table(battery: int) -> dict:
    """Every one of the 2,048 schedules scored exactly as /api/evaluate would.
    The browser rebuilds the slot picture from the scenario, so only the scores travel."""
    scn = engine.scenario_for(battery)
    words: list = []
    rows = [None] * (2 ** scn.n_vars)
    for bits in product((0, 1), repeat=scn.n_vars):
        text = engine.bits_to_text(bits)
        v = engine.evaluate_bits(text, battery, PENALTY)
        ids = []
        for w in v["violations"]:
            if w not in words:
                words.append(w)
            ids.append(words.index(w))
        rows[v["index"]] = [v["benefit"], v["objective"], v["quantum_cost"], ids, v["fines_fired"]]
    exact = engine.exact_for(battery)
    return {"penalty": PENALTY, "best_objective": exact["objective"], "exact_bits": exact["view"]["bits"],
            "violations": words, "rows": rows}


def record_run(encoding: str, layers: int, battery: int) -> dict:
    params = {"encoding": encoding, "layers": layers, "penalty": PENALTY, "battery_blocks": battery,
              "shots": 4096, "budget": "quick", "seed": 42}
    run = engine.Run(params)
    engine.execute(run)
    if run.status != "done":
        raise RuntimeError(f"run {params} ended as {run.status}: {run.error}")
    return {"params": params, "recorded": time.strftime("%Y-%m-%d"),
            "events": [{"kind": e["kind"], "t": e["t"], "data": e["data"]} for e in run.events],
            "result": run.result}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-runs", action="store_true", help="skip recording QAOA runs")
    ap.add_argument("--only", choices=["compact", "slack"], help="record runs for one encoding only")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "runs").mkdir(exist_ok=True)

    print("Data files")
    info = engine.engine_info()
    # The first solve pays for imports and warm up. Time a warm one, as a laptop would see it.
    for b in (1, 2):
        engine.exact_for(b)
    engine.exact_for.cache_clear()
    for b in (1, 2):
        write(f"scenario_{b}.json", engine.describe_scenario(engine.scenario_for(b)))
        write(f"exact_{b}.json", engine.exact_public(b))
        write(f"landscape_{b}.json", engine.landscape_for(b))
        write(f"fcfs_{b}.json", engine.fcfs_for(b))
        write(f"eval_{b}.json", eval_table(b))
    evidence = engine.recorded_results()
    if evidence:
        write("evidence.json", evidence)
    if info["ready"]:
        write("circuit_1.json", {"compact": engine.circuit_stats_for("compact", 1, PENALTY),
                                 "slack": engine.circuit_stats_for("slack", 1, PENALTY), "reps": 1})
        info["ms_per_eval"] = engine.calibrate()

    if not args.no_runs:
        if not info["ready"]:
            sys.exit("Qiskit is not installed, so runs cannot be recorded.")
        print("Recorded runs")
        for enc, layers, b in RUN_GRID:
            if args.only and enc != args.only:
                continue
            started = time.time()
            write(f"runs/{enc}_{layers}_{b}.json", record_run(enc, layers, b))
            print(f"    took {time.time() - started:.1f} s", flush=True)

    runs = {p.stem: json.loads(p.read_text(encoding="utf-8"))["result"]["seconds"]
            for p in sorted((OUT / "runs").glob("*.json"))}
    write("health.json", {"status": "ok", "mode": "recorded", "engine": {**info, "ready": bool(runs)},
                          "runs": runs, "built": time.strftime("%Y-%m-%d %H:%M")})


if __name__ == "__main__":
    main()
