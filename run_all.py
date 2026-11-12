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
