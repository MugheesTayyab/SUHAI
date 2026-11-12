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
