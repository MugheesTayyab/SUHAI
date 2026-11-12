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
