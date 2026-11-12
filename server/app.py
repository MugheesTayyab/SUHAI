"""Suhai web server.

Start it with:  python serve.py
Then open:      http://127.0.0.1:8000        (story)
                http://127.0.0.1:8000/app    (control room)
                http://127.0.0.1:8000/docs   (every API route, try them live)
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator

from server import engine

WEB = engine.ROOT / "web"
STARTED = time.time()
runs = engine.RunManager()


def _prewarm() -> None:
    """Compute the slow, cacheable things once so the first click on stage is instant."""
    steps = []
    for battery in (1, 2):
        steps += [lambda b=battery: engine.exact_for(b), lambda b=battery: engine.landscape_for(b),
                  lambda b=battery: engine.fcfs_for(b),
                  lambda b=battery: engine.fines_for(b, engine.DEFAULT_PENALTY)]
    if engine.engine_info()["ready"]:
        steps.append(engine.calibrate)
        steps += [lambda e=enc: engine.circuit_stats_for(e, 1, engine.DEFAULT_PENALTY)
                  for enc in ("compact", "slack")]
    for step in steps:          # one failing step never blocks the others
        try:
            step()
        except Exception as exc:
            print(f"  prewarm step failed: {type(exc).__name__}: {exc}", flush=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=_prewarm, daemon=True, name="prewarm").start()
    yield


app = FastAPI(
    title="Suhai API",
    version="1.0.0",
    description="Quantum scheduling of limited village solar energy. "
                "Every route calls the same tested code that produced the report.",
    lifespan=lifespan,
)


# --------------------------------------------------------------------------
# Request models
# --------------------------------------------------------------------------

Battery = Field(1, ge=1, le=2, description="Battery size in 5 kWh blocks. 1 is the test instance.")


class EvaluateRequest(BaseModel):
    bits: str = Field(..., description="11 characters of 0 and 1 in the order m0 m1 i1 i2 w1 w2 h3 d0 d1 d2 d3")
    battery_blocks: int = Battery
    penalty: float = Field(engine.DEFAULT_PENALTY, ge=1, le=100)

    @field_validator("bits")
    @classmethod
    def eleven_bits(cls, v: str) -> str:
        v = v.strip()
        if len(v) != len(engine.BASE.var_names) or set(v) - {"0", "1"}:
            raise ValueError("bits must be exactly 11 characters, each 0 or 1")
        return v


class RunRequest(BaseModel):
    encoding: Literal["compact", "slack"] = "compact"
    layers: int = Field(1, ge=1, le=3)
    penalty: float = Field(engine.DEFAULT_PENALTY, ge=1, le=100)
    battery_blocks: int = Battery
    shots: int = Field(4096, ge=256, le=16384)
    budget: Literal["quick", "thorough"] = "quick"
    seed: int = Field(42, ge=0, le=10_000)

    @model_validator(mode="after")
    def keep_standard_runs_sane(self):
        if self.encoding == "slack" and (self.layers > 2 or self.budget != "quick"):
            raise ValueError("The 20 qubit standard encoding is limited to 2 layers on the quick "
                             "budget. One layer already takes about two minutes on a laptop.")
        return self


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.get("/api/health", tags=["system"])
def health():
    info = engine.engine_info()
    return {"status": "ok", "uptime_seconds": round(time.time() - STARTED, 1),
            "engine": info, "busy": runs.busy(),
            "recorded_results": bool(engine.recorded_results())}


@app.get("/api/scenario", tags=["model"])
def scenario(battery_blocks: int = Query(1, ge=1, le=2)):
    return engine.describe_scenario(engine.scenario_for(battery_blocks))


@app.get("/api/exact", tags=["classical"])
def exact(battery_blocks: int = Query(1, ge=1, le=2)):
    """The true best schedule, found by checking all 2,048 options."""
    return engine.exact_public(battery_blocks)


@app.get("/api/landscape", tags=["classical"])
def landscape(battery_blocks: int = Query(1, ge=1, le=2)):
    """All 2,048 schedules: valid or not, and their objective. Index k has qubit i equal to bit i of k."""
    return engine.landscape_for(battery_blocks)


@app.get("/api/fcfs", tags=["classical"])
def fcfs(battery_blocks: int = Query(1, ge=1, le=2)):
    """First come first served for all 24 arrival orders."""
    return engine.fcfs_for(battery_blocks)


@app.get("/api/fines", tags=["quantum"])
def fines(battery_blocks: int = Query(1, ge=1, le=2),
          penalty: float = Query(engine.DEFAULT_PENALTY, ge=1, le=100)):
    """The penalty terms of the 11 qubit Suhai encoding, in code and in plain words."""
    items = engine.fines_for(battery_blocks, penalty)
    return {"penalty": penalty, "count": len(items),
            "higher_order": sum(1 for f in items if f["order"] >= 3), "fines": items}


@app.get("/api/circuit", tags=["quantum"])
def circuit(battery_blocks: int = Query(1, ge=1, le=2),
            penalty: float = Query(engine.DEFAULT_PENALTY, ge=1, le=100),
            reps: int = Query(1, ge=1, le=3)):
    """Circuit size of both encodings after translation to cx, rz, sx and x gates."""
    if not engine.engine_info()["ready"]:
        raise HTTPException(503, "Qiskit is not installed in this Python environment")
    return {"compact": engine.circuit_stats_for("compact", battery_blocks, penalty, reps),
            "slack": engine.circuit_stats_for("slack", battery_blocks, penalty, reps),
            "reps": reps}


@app.post("/api/evaluate", tags=["model"])
def evaluate(req: EvaluateRequest):
    """Score any schedule by hand: rules broken, benefit, and its quantum cost."""
    return engine.evaluate_bits(req.bits, req.battery_blocks, req.penalty)


@app.get("/api/evidence", tags=["results"])
def evidence():
    """The full reproduction run written by run_all.py, used for the proof charts."""
    data = engine.recorded_results()
    if not data:
        raise HTTPException(404, "results/results.json not found. Run python run_all.py first.")
    return data


@app.post("/api/runs", status_code=202, tags=["quantum"])
def start_run(req: RunRequest):
    """Start a live QAOA run in Qiskit. Follow it with /api/runs/{id}/stream."""
    if not engine.engine_info()["ready"]:
        raise HTTPException(503, "Qiskit is not installed in this Python environment")
    run = runs.submit(req.model_dump())
    return {"id": run.id, "status": run.status}


@app.get("/api/runs/{run_id}", tags=["quantum"])
def get_run(run_id: str):
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, "No run with that id")
    return run.public()


@app.delete("/api/runs/{run_id}", tags=["quantum"])
def cancel_run(run_id: str):
    if not runs.cancel(run_id):
        raise HTTPException(409, "That run is not running")
    return {"id": run_id, "status": "cancelling"}


@app.get("/api/runs/{run_id}/stream", tags=["quantum"])
async def stream_run(run_id: str, request: Request):
    """Server sent events: queued, started, optimise, sample, layer_done, then done or failed."""
    run = runs.get(run_id)
    if run is None:
        raise HTTPException(404, "No run with that id")

    async def events():
        seq = 0
        last_beat = time.time()
        yield "retry: 1500\n\n"
        while True:
            if await request.is_disconnected():
                return
            batch = run.events_since(seq)
            for ev in batch:
                seq = ev["seq"] + 1
                yield f"id: {ev['seq']}\nevent: {ev['kind']}\ndata: {json.dumps(ev)}\n\n"
                if ev["kind"] in ("done", "failed", "cancelled"):
                    return
            if batch:
                last_beat = time.time()
            else:
                if time.time() - last_beat > 10:
                    last_beat = time.time()
                    yield ": keep-alive\n\n"
                await asyncio.sleep(0.05)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------

@app.get("/app", include_in_schema=False)
def control_room():
    return FileResponse(WEB / "app.html")


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
