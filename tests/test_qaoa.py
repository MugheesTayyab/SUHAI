from pathlib import Path

from src.classical_solver import solve_exact
from src.decoder import random_guess_reference, score_samples
from src.encode_compact import build_compact
from src.model import load_scenario
from src.qaoa_solver import circuit_stats, run_qaoa

SCN = load_scenario(Path(__file__).parent.parent / "data" / "sample_scenario.json")
EXACT = solve_exact(SCN)


def test_circuit_uses_one_qubit_per_choice():
    assert circuit_stats(build_compact(SCN, 12), reps=1)["qubits"] == 11


def test_qaoa_beats_random_guessing():
    run = run_qaoa(build_compact(SCN, 12), reps=1, n_starts=3, maxiter=150)
    assert sum(run["counts"].values()) == 4096
    assert all(len(bits) == 11 for bits in run["counts"])
    score = score_samples(SCN, run["counts"], EXACT)
    reference = random_guess_reference(EXACT)
    assert score["valid_share"] > 3 * reference["valid_share"]
    assert score["optimum_share"] > 3 * reference["optimum_share"]
