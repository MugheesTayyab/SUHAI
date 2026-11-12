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
