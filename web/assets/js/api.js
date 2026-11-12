// Client for the Suhai API. It works in two modes and picks one by itself.
//
// live      `python serve.py` is behind the page. Every call goes to the tested Python code
//           and QAOA runs live in Qiskit Aer.
// recorded  The hosted site (Vercel). The same Python code wrote web/data/ ahead of time
//           with build_static.py, rules are checked from that table in the browser, and runs
//           are real Qiskit Aer recordings replayed with their own timings.
//
// /api/health decides. On Vercel it is rewritten to /data/health.json, which says "recorded".

import { evaluateFromTable, replay } from "./static.js";

const cache = new Map();

async function request(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = body && body.detail;
    const message = Array.isArray(detail)
      ? detail.map((d) => d.msg.replace(/^Value error, /, "")).join(". ")
      : detail || `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return body;
}

function cached(path) {
  if (!cache.has(path)) cache.set(path, request(path).catch((e) => { cache.delete(path); throw e; }));
  return cache.get(path);
}

const health = cached("/api/health").catch(() => ({ mode: "offline", engine: { ready: false } }));
const recorded = health.then((h) => h.mode === "recorded");
const pick = async (live, fallback) => ((await recorded) ? fallback() : live());
const data = (name) => cached(`/data/${name}.json`);

const replays = new Map();

export const api = {
  mode: () => health.then((h) => h.mode || "live"),
  // Live mode asks again each time, because the server measures its own speed after start up.
  health: async () => ((await recorded) ? health : request("/api/health")),

  scenario: (b = 1) => pick(() => cached(`/api/scenario?battery_blocks=${b}`), () => data(`scenario_${b}`)),
  exact: (b = 1) => pick(() => cached(`/api/exact?battery_blocks=${b}`), () => data(`exact_${b}`)),
  landscape: (b = 1) => pick(() => cached(`/api/landscape?battery_blocks=${b}`), () => data(`landscape_${b}`)),
  fcfs: (b = 1) => pick(() => cached(`/api/fcfs?battery_blocks=${b}`), () => data(`fcfs_${b}`)),
  circuit: (b = 1, penalty = 12) => pick(() => cached(`/api/circuit?battery_blocks=${b}&penalty=${penalty}`), () => data(`circuit_${b}`)),
  evidence: () => pick(() => cached("/api/evidence"), () => data("evidence")),

  evaluate(bits, b = 1, penalty = 12) {
    const key = `eval:${bits}:${b}:${penalty}`;
    if (!cache.has(key)) {
      const job = pick(
        () => request("/api/evaluate", { method: "POST", body: JSON.stringify({ bits, battery_blocks: b, penalty }) }),
        async () => {
          if (penalty !== 12) throw new Error("The hosted site scores schedules with the default fine of 12");
          const [scn, table, exact] = await Promise.all([data(`scenario_${b}`), data(`eval_${b}`), data(`exact_${b}`)]);
          return evaluateFromTable(scn, table, exact.view.bits, bits);
        });
      cache.set(key, job.catch((e) => { cache.delete(key); throw e; }));
    }
    return cache.get(key);
  },

  async startRun(p) {
    if (!(await recorded)) return request("/api/runs", { method: "POST", body: JSON.stringify(p) });
    const id = `${p.encoding}_${p.layers}_${p.battery_blocks}`;
    const h = await health;
    if (!h.runs || !(id in h.runs)) throw new Error("That setup has no recorded run. Start python serve.py to run it live.");
    return { id, status: "queued" };
  },
  async getRun(id) {
    if (!(await recorded)) return request(`/api/runs/${id}`);
    return { id, status: "done", result: (await data(`runs/${id}`)).result };
  },
  async cancelRun(id) {
    if (!(await recorded)) return request(`/api/runs/${id}`, { method: "DELETE" });
    replays.get(id)?.stop();
    return { id, status: "cancelling" };
  },

  // Follow a run. handlers: { onEvent(kind, data), onError(err), onSpeed(x) }. Returns a close function.
  follow(id, { onEvent, onError, onSpeed }) {
    let close = () => {};
    recorded.then(async (isRecorded) => {
      if (isRecorded) {
        try {
          const rec = await data(`runs/${id}`);
          const handle = replay(rec, { onEvent });
          replays.set(id, handle);
          onSpeed && onSpeed(handle.speed);
          close = () => handle.stop();
        } catch (e) { onError && onError(e); }
        return;
      }
      const source = new EventSource(`/api/runs/${id}/stream`);
      const kinds = ["queued", "started", "optimise", "sample", "layer_done", "done", "failed", "cancelled"];
      let finished = false;
      kinds.forEach((kind) => source.addEventListener(kind, (e) => {
        const ev = JSON.parse(e.data);
        onEvent(kind, ev.data, ev);
        if (kind === "done" || kind === "failed" || kind === "cancelled") { finished = true; source.close(); }
      }));
      source.onerror = () => {
        if (finished) return;
        source.close();
        onError && onError(new Error("Lost the live connection to the server"));
      };
      close = () => source.close();
    });
    return () => close();
  },
};

export const fmt = {
  pct(x, digits = 1) {
    if (x == null || Number.isNaN(x)) return "n/a";
    return `${(100 * x).toFixed(digits)}%`;
  },
  int(x) { return x == null ? "n/a" : Math.round(x).toLocaleString("en-US"); },
  num(x, digits = 2) { return x == null ? "n/a" : Number(x).toFixed(digits); },
};
