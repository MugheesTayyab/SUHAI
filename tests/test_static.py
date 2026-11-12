"""The hosted site (Vercel) must say exactly what the live server says.

build_static.py writes web/data/ from server/engine.py. These checks fail if the data
is stale, if the browser's rule checker drifts from Python, or if a recording is broken.
"""
import json
import shutil
import subprocess
from itertools import product
from pathlib import Path

import pytest

from server import engine

DATA = engine.ROOT / "web" / "data"
pytestmark = pytest.mark.skipif(not (DATA / "health.json").exists(),
                                reason="run python build_static.py first")


def load(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def roundtrip(obj):
    return json.loads(json.dumps(obj))


@pytest.mark.parametrize("b", [1, 2])
def test_data_matches_engine(b):
    assert load(f"scenario_{b}") == roundtrip(engine.describe_scenario(engine.scenario_for(b)))
    assert load(f"landscape_{b}") == roundtrip(engine.landscape_for(b))
    assert load(f"fcfs_{b}") == roundtrip(engine.fcfs_for(b))
    exact = load(f"exact_{b}")
    live = roundtrip(engine.exact_public(b))
    exact.pop("milliseconds"); live.pop("milliseconds")
    assert exact == live


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_browser_rule_checker_matches_python(tmp_path):
    expected = {b: [roundtrip(engine.evaluate_bits(engine.bits_to_text(bits), b, engine.DEFAULT_PENALTY))
                    for bits in product((0, 1), repeat=11)] for b in (1, 2)}
    path = tmp_path / "expected.json"
    path.write_text(json.dumps(expected))
    out = subprocess.run(["node", str(engine.ROOT / "tests" / "check_static.mjs"), str(path)],
                         capture_output=True, text=True, check=True)
    report = json.loads(out.stdout)
    assert report == {"checked": 4096, "mismatches": 0, "first": []}


def test_recorded_runs_are_complete_and_honest():
    health = load("health")
    assert health["mode"] == "recorded"
    runs = health["runs"]
    assert runs, "no runs recorded"
    for key, seconds in runs.items():
        rec = load(f"runs/{key}")
        kinds = [e["kind"] for e in rec["events"]]
        # Recorded straight from engine.execute, so there is no queue: it starts at "started".
        assert kinds[0] == "started" and kinds[-1] == "done"
        assert "optimise" in kinds and kinds.count("layer_done") == rec["params"]["layers"]
        res = rec["result"]
        assert res["seconds"] == seconds and res["shots"] == 4096
        assert sum(res["density"]) == 4096
        # Every claim on screen is recomputed from the recorded samples.
        b = rec["params"]["battery_blocks"]
        land = engine.landscape_for(b)
        valid = sum(n for k, n in enumerate(res["density"]) if land["feasible"][k])
        assert valid / 4096 == pytest.approx(res["valid_share"])
        if res["best_valid"]:
            assert res["best_valid"]["feasible"]
