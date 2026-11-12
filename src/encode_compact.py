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
