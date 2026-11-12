"""Checks for the web API. They prove the dashboard shows the same answers as the report."""
import json

from fastapi.testclient import TestClient

from server.app import app

client = TestClient(app)
BEST = "10100101000"          # milk morning, irrigation midday, water afternoon, battery morning


def test_health_reports_qiskit():
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["engine"]["ready"] is True


def test_exact_matches_the_report():
    body = client.get("/api/exact").json()
    assert body["benefit"] == 25
    assert body["objective"] == 24.75
    assert body["n_feasible"] == 52 and body["n_total"] == 2048
    assert body["view"]["bits"] == BEST
    assert body["view"]["unserved"] == ["Household essentials"]


def test_bigger_battery_serves_households():
    body = client.get("/api/exact", params={"battery_blocks": 2}).json()
    assert body["benefit"] == 28
    assert body["view"]["unserved"] == []


def test_every_route_works_with_the_bigger_battery():
    for route in ("/api/scenario", "/api/landscape", "/api/fcfs", "/api/fines"):
        assert client.get(route, params={"battery_blocks": 2}).status_code == 200, route
    fines = client.get("/api/fines", params={"battery_blocks": 2}).json()["fines"]
    assert all(f["plain"] for f in fines)
    r = client.post("/api/evaluate", json={"bits": "10100101000", "battery_blocks": 2})
    assert r.status_code == 200


def test_landscape_counts_every_schedule():
    body = client.get("/api/landscape").json()
    assert len(body["feasible"]) == 2048
    assert body["n_feasible"] == 52
    assert body["feasible"][body["exact_index"]] == 1


def test_sixteen_fines_two_of_them_three_way():
    body = client.get("/api/fines").json()
    assert body["count"] == 16
    assert body["higher_order"] == 2
    assert all(f["plain"] for f in body["fines"])


def test_evaluate_cost_is_objective_plus_fines():
    best = client.post("/api/evaluate", json={"bits": BEST}).json()
    assert best["feasible"] and best["is_exact_best"]
    assert best["fines_fired"] == []
    assert best["quantum_cost"] == -24.75

    broken = client.post("/api/evaluate", json={"bits": "11000000000"}).json()   # milk twice, no battery
    assert not broken["feasible"]
    assert len(broken["fines_fired"]) >= 1
    expected = -broken["objective"] + 12 * len(broken["fines_fired"])
    assert abs(broken["quantum_cost"] - expected) < 1e-9


def test_evaluate_rejects_bad_input():
    assert client.post("/api/evaluate", json={"bits": "1010"}).status_code == 422
    assert client.post("/api/evaluate", json={"bits": "1010010100x"}).status_code == 422


def test_fcfs_range():
    body = client.get("/api/fcfs").json()
    assert len(body["orders"]) == 24
    assert body["min"] == 9 and body["max"] == 25 and body["reaching_best"] == 5


def test_standard_encoding_guard():
    r = client.post("/api/runs", json={"encoding": "slack", "layers": 3})
    assert r.status_code == 422


def test_live_run_streams_and_finds_valid_schedules():
    r = client.post("/api/runs", json={"layers": 1, "shots": 1024})
    assert r.status_code == 202
    run_id = r.json()["id"]
    kinds = []
    with client.stream("GET", f"/api/runs/{run_id}/stream") as stream:
        for line in stream.iter_lines():
            if line.startswith("data: "):
                kinds.append(json.loads(line[6:])["kind"])
                if kinds[-1] in ("done", "failed", "cancelled"):
                    break
    assert kinds[-1] == "done", kinds[-3:]
    assert "optimise" in kinds and "sample" in kinds and "layer_done" in kinds

    result = client.get(f"/api/runs/{run_id}").json()["result"]
    assert result["qubits"] == 11 and result["helper_qubits"] == 0
    assert result["shots"] == 1024
    assert sum(result["density"]) == 1024
    assert result["valid_share"] > 0.0253            # better than random guessing
    assert result["best_valid"]["feasible"] is True


def test_cancel_unknown_run():
    assert client.delete("/api/runs/nope").status_code == 409
    assert client.get("/api/runs/nope").status_code == 404
