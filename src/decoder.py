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
