// Thin client for the Suhai API. Every call goes to the same Python code that produced the report.

const cache = new Map();

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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

export const api = {
  health: () => request("/api/health"),
  scenario: (battery = 1) => cached(`/api/scenario?battery_blocks=${battery}`),
  exact: (battery = 1) => cached(`/api/exact?battery_blocks=${battery}`),
  landscape: (battery = 1) => cached(`/api/landscape?battery_blocks=${battery}`),
  fcfs: (battery = 1) => cached(`/api/fcfs?battery_blocks=${battery}`),
  fines: (battery = 1, penalty = 12) => cached(`/api/fines?battery_blocks=${battery}&penalty=${penalty}`),
  circuit: (battery = 1, penalty = 12) => cached(`/api/circuit?battery_blocks=${battery}&penalty=${penalty}`),
  evidence: () => cached("/api/evidence"),

  evaluate(bits, battery = 1, penalty = 12) {
    const key = `eval:${bits}:${battery}:${penalty}`;
    if (!cache.has(key)) {
      cache.set(key, request("/api/evaluate", {
        method: "POST",
        body: JSON.stringify({ bits, battery_blocks: battery, penalty }),
      }).catch((e) => { cache.delete(key); throw e; }));
    }
    return cache.get(key);
  },

  startRun: (params) => request("/api/runs", { method: "POST", body: JSON.stringify(params) }),
  getRun: (id) => request(`/api/runs/${id}`),
  cancelRun: (id) => request(`/api/runs/${id}`, { method: "DELETE" }),

  // Follow a run live. handlers: { onEvent(kind, data), onError(err) }. Returns a close function.
  follow(id, { onEvent, onError }) {
    const source = new EventSource(`/api/runs/${id}/stream`);
    const kinds = ["queued", "started", "optimise", "sample", "layer_done", "done", "failed", "cancelled"];
    let finished = false;
    kinds.forEach((kind) => {
      source.addEventListener(kind, (e) => {
        const ev = JSON.parse(e.data);
        onEvent(kind, ev.data, ev);
        if (kind === "done" || kind === "failed" || kind === "cancelled") {
          finished = true;
          source.close();
        }
      });
    });
    source.onerror = () => {
      if (finished) return;
      source.close();
      onError && onError(new Error("Lost the live connection to the server"));
    };
    return () => source.close();
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
