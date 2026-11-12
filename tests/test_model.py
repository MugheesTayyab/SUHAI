from pathlib import Path

from src.classical_solver import fcfs_all_orders, solve_exact
from src.model import is_feasible, load_scenario, timetable, violations

SCN = load_scenario(Path(__file__).parent.parent / "data" / "sample_scenario.json")


def bits(**on):
    return tuple(1 if name in on else 0 for name in SCN.var_names)


def test_variable_order():
    assert SCN.var_names == ["m0", "m1", "i1", "i2", "w1", "w2", "h3",
                             "d0", "d1", "d2", "d3"]


def test_known_best_schedule_is_valid():
    assert is_feasible(SCN, bits(m0=1, i1=1, w2=1, d0=1))


def test_morning_milk_needs_battery():
    assert violations(SCN, bits(m0=1)) == ["Morning energy exceeded"]


def test_service_cannot_run_twice():
    assert "Milk chilling runs more than once" in violations(SCN, bits(m0=1, m1=1, d0=1))


def test_battery_block_used_once_only():
    assert violations(SCN, bits(d0=1, d3=1)) == ["Battery budget exceeded"]


def test_exact_optimum_is_25():
    exact = solve_exact(SCN)
    assert exact["benefit"] == 25
    assert exact["objective"] == 24.75
    assert exact["bits"] == bits(m0=1, i1=1, w2=1, d0=1)
    assert exact["n_total"] == 2048
    assert timetable(SCN, exact["bits"])["Evening"] == []


def test_fcfs_depends_on_arrival_order():
    scores = [score for _, score in fcfs_all_orders(SCN)]
    assert len(scores) == 24
    assert max(scores) == 25
    assert min(scores) < 25
