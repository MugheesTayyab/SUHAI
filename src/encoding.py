"""Cost formulas as polynomials over 0/1 variables, and their qubit form.

A polynomial is a dict: frozenset of variable indices -> coefficient.
The empty frozenset holds the constant. Because x * x = x for 0/1
variables, a set of indices is enough to describe any product.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations

import numpy as np
from qiskit.quantum_info import SparsePauliOp


@dataclass
class Encoding:
    name: str
    var_names: list            # one name per qubit
    n_decision: int            # the first n_decision qubits are real choices
    poly: dict = field(default_factory=dict)
    fines: list = field(default_factory=list)   # readable list of penalty terms

    @property
    def n_qubits(self) -> int:
        return len(self.var_names)


def add_product(poly: dict, coeff: float, ones=(), zeros=()) -> None:
    """Add coeff * prod(x_i for i in ones) * prod(1 - x_j for j in zeros)."""
    ones = frozenset(ones)
    zeros = list(zeros)
    for k in range(len(zeros) + 1):
        for chosen in combinations(zeros, k):
            key = ones | frozenset(chosen)
            poly[key] = poly.get(key, 0.0) + coeff * (-1) ** k


def add_square(poly: dict, coeff: float, linear: dict, const: float) -> None:
    """Add coeff * (sum(a_i * x_i) + const) ** 2."""
    items = list(linear.items())
    add_product(poly, coeff * const * const)
    for i, a in items:
        add_product(poly, coeff * (a * a + 2 * a * const), ones=[i])
    for (i, a), (j, b) in combinations(items, 2):
        add_product(poly, coeff * 2 * a * b, ones=[i, j])


def evaluate(poly: dict, bits) -> float:
    return sum(c for key, c in poly.items() if all(bits[i] for i in key))


def cost_vector(poly: dict, n: int) -> np.ndarray:
    """Cost of every bitstring. Entry k has qubit i equal to bit i of k."""
    index = np.arange(2 ** n)
    total = np.zeros(2 ** n)
    for key, c in poly.items():
        mask = np.ones(2 ** n, dtype=bool)
        for i in key:
            mask &= ((index >> i) & 1).astype(bool)
        total += c * mask
    return total


def to_ising(poly: dict, n: int):
    """Replace every x_i by (1 - Z_i) / 2. Returns (operator, constant)."""
    z_terms: dict = {}
    for key, c in poly.items():
        members = sorted(key)
        scale = c / 2 ** len(members)
        for k in range(len(members) + 1):
            for sub in combinations(members, k):
                z_terms[sub] = z_terms.get(sub, 0.0) + scale * (-1) ** k
    offset = z_terms.pop((), 0.0)
    sparse = [("Z" * len(sub), list(sub), coeff)
              for sub, coeff in z_terms.items() if abs(coeff) > 1e-12]
    return SparsePauliOp.from_sparse_list(sparse, num_qubits=n).simplify(), offset
