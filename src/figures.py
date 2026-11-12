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
