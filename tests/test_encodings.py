from itertools import product
from pathlib import Path

import numpy as np
import pytest
from qiskit.quantum_info import SparsePauliOp

from src.classical_solver import solve_exact
from src.encode_compact import build_compact
from src.encode_slack import build_slack
from src.encoding import cost_vector, evaluate, to_ising
from src.model import is_feasible, load_scenario, objective

SCN = load_scenario(Path(__file__).parent.parent / "data" / "sample_scenario.json")
EXACT = solve_exact(SCN)


def test_compact_uses_11_qubits_and_16_fines():
    enc = build_compact(SCN, penalty=20)
    assert enc.n_qubits == 11
    assert len(enc.fines) == 16
    assert "m1 and w1 without d1" in enc.fines


def test_slack_uses_20_qubits():
    assert build_slack(SCN, penalty=20).n_qubits == 20


@pytest.mark.parametrize("penalty", [12, 20, 40])
def test_compact_cost_matches_model_on_every_schedule(penalty):
    enc = build_compact(SCN, penalty)
    for bits in product((0, 1), repeat=11):
        cost = evaluate(enc.poly, bits)
        if is_feasible(SCN, bits):
            assert cost == pytest.approx(-objective(SCN, bits))
        else:
            assert cost >= -objective(SCN, bits) + penalty - 1e-9


@pytest.mark.parametrize("penalty", [12, 20, 40])
def test_lowest_cost_is_the_exact_schedule(penalty):
    for build in (build_compact, build_slack):
        enc = build(SCN, penalty)
        costs = cost_vector(enc.poly, enc.n_qubits)
        k = int(np.argmin(costs))
        bits = tuple((k >> i) & 1 for i in range(enc.n_decision))
        assert bits == EXACT["bits"]
        assert costs[k] == pytest.approx(-EXACT["objective"])


def test_operator_diagonal_equals_cost_vector():
    enc = build_compact(SCN, penalty=20)
    op, offset = to_ising(enc.poly, enc.n_qubits)
    assert isinstance(op, SparsePauliOp)
    diagonal = np.real(np.diag(op.to_matrix())) + offset
    assert np.allclose(diagonal, cost_vector(enc.poly, enc.n_qubits))
