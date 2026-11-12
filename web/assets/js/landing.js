import { api, fmt } from "./api.js";
import { initMotion, segmented, tip, toast, countTo } from "./motion.js";
import { groupedBars, dotStrip, scheduleGrid, bitsOf } from "./charts.js";
import { renderSlots, escapeHtml } from "./ui.js";
import { hillSVG } from "./hill.js";
import { playIntro } from "./intro.js";
import { createRegister } from "./register.js";

const $ = (s, r = document) => r.querySelector(s);
const SWATCH = { m: "m", i: "i", w: "w", h: "h" };

$("#hero-art").innerHTML = hillSVG();
playIntro();
initMotion();

/* ---------- The day, as one table ---------- */

async function dayTable() {
  const scn = await api.scenario(1);
  const head = `<thead><tr><th scope="col"></th>${scn.slots.map((s) => `<th scope="col">${s.name}</th>`).join("")}</tr></thead>`;
  const sun = `<tr class="sun-row"><th scope="row">Sun</th>${scn.slots.map((s) => `<td><span class="blocks" title="${s.solar_kwh} kWh">${
    s.solar_blocks ? "<i></i>".repeat(s.solar_blocks) : '<i class="none"></i>'}</span></td>`).join("")}</tr>`;
  const rows = scn.services.map((svc) => {
    const best = Math.max(...svc.options.map((o) => o.benefit));
    const cells = scn.slots.map((s) => {
      const o = svc.options.find((x) => x.slot === s.index);
      return o ? `<td><span class="worth${o.benefit === best ? " top" : ""}">${o.benefit}</span></td>` : `<td><span class="nope">·</span></td>`;
    }).join("");
    return `<tr><th scope="row"><span class="svc"><span class="sw ${SWATCH[svc.key]}"></span>${svc.name}<span class="kwh">${svc.energy_kwh} kWh</span></span></th>${cells}</tr>`;
  }).join("");
  $("#day-table").innerHTML = `${head}<tbody>${sun}${rows}</tbody>`;
}

/* ---------- 2,048 possible days ---------- */

const WHEN = ["in the morning", "at midday", "in the afternoon", "in the evening"];

async function space() {
  const land = await api.landscape(1);
  const detail = $("#space-detail");
  let token = 0;
  scheduleGrid($("#landscape"), {
    landscape: land,
    onHover: async (k, e) => {
      const ok = land.feasible[k];
      tip.show(`<b>Day ${fmt.int(k + 1)}</b><hr>${k === land.exact_index ? "The best possible day" : ok ? "Keeps every rule" : "Breaks at least one rule"}`, e.clientX, e.clientY);
      const my = ++token;
      try {
        const v = await api.evaluate(bitsOf(k), 1, 12);
        if (my !== token) return;
        const runs = v.slots.flatMap((s) => s.services.map((x) => `${x.name.toLowerCase()} ${WHEN[s.index]}`));
        const what = runs.length ? runs.join(", ") : "nothing";
        detail.innerHTML = v.feasible
          ? `<b>Day ${fmt.int(k + 1)}</b> runs ${escapeHtml(what)}. Benefit ${v.benefit}${v.is_exact_best ? ", the best possible." : "."}`
          : `<b>Day ${fmt.int(k + 1)}</b> breaks a rule. ${escapeHtml(v.violations.join(". "))}.`;
      } catch { /* hover detail is best effort */ }
    },
  });
}

/* ---------- Method: the encoding toggle ---------- */

const HELPERS = 9;

async function method() {
  const scn = await api.scenario(1);
  $("#qubits").innerHTML = scn.variables.map((v) => `<span class="qb ${v.kind === "battery" ? "bat" : v.service}" title="${escapeHtml(v.label)}"></span>`).join("")
    + Array.from({ length: HELPERS }, (_, k) => `<span class="qb helper" style="--k:${k}" title="Helper qubit that only counts spare energy"></span>`).join("");

  let stats;
  try { stats = await api.circuit(1, 12); } catch { stats = (await api.evidence()).circuit_stats; }
  const box = $(".encode");
  const set = (which) => {
    box.classList.toggle("compact", which === "compact");
    box.classList.toggle("slack", which === "slack");
    const s = stats[which];
    const put = (id, v, max) => {
      const el = $(`#es-${id}`);
      el.dataset.from = el.textContent || 0;
      countTo(el, v, { duration: 400, decimals: 0 });
      $(`#es-${id}b`).style.width = `${(v / max) * 100}%`;
    };
    put("q", s.qubits, stats.slack.qubits);
    put("g", s.two_qubit_gates, stats.slack.two_qubit_gates);
    put("d", s.depth, Math.max(stats.slack.depth, stats.compact.depth));
  };
  segmented($("#enc-toggle"), set);
  set("compact");
}

/* ---------- Results, every figure tied to the recorded run ---------- */

async function results() {
  const [ev, fc] = await Promise.all([api.evidence(), api.fcfs(1)]);
  const fair = ev.same_budget, depth = ev.depth_study, rnd = ev.random_guess;
  const c1 = fair.compact.find((r) => r.reps === 1);
  const s1 = fair.slack.find((r) => r.reps === 1);

  if (c1 && s1) duel(ev, c1, s1);
  $("#cl-best").textContent = ev.exact.benefit;
  try { const ex = await api.exact(1); $("#cl-ms").textContent = `${Math.max(1, Math.round(ex.milliseconds))} ms`; } catch { /* keep 1 ms */ }
  if (c1 && s1) $("#ratio").textContent = `${(c1.valid_share / s1.valid_share).toFixed(1)} times the valid answers.`;
  const shares = depth.map((r) => r.optimum_share * 100);
  $("#rare-text").textContent = `It appears in ${Math.floor(Math.min(...shares))} to ${Math.ceil(Math.max(...shares))} percent of answers. We keep the best valid one out of 4,096.`;

  const once = (id, fn) => {
    const fig = $(`#${id}`).closest("figure");
    let done = false;
    const go = () => { if (!done) { done = true; fn(); } };
    if (fig.classList.contains("in")) go(); else fig.addEventListener("reveal", go, { once: true });
  };
  once("chart-fair", () => groupedBars($("#chart-fair"), {
    groups: ["1 layer", "2 layers"],
    series: [
      { name: "Suhai, 11 qubits", color: "var(--brand)", values: [1, 2].map((p) => fair.compact.find((r) => r.reps === p)?.valid_share ?? null) },
      { name: "Standard, 20 qubits", color: "var(--slate)", values: [1, 2].map((p) => fair.slack.find((r) => r.reps === p)?.valid_share ?? null) },
    ],
    reference: { value: rnd.valid_share, label: `Random ${fmt.pct(rnd.valid_share)}` },
    height: 220,
  }));
  once("chart-depth", () => groupedBars($("#chart-depth"), {
    groups: depth.map((r) => `${r.reps} layer${r.reps > 1 ? "s" : ""}`),
    series: [{ name: "Suhai, exact best share", color: "var(--brand)", values: depth.map((r) => r.optimum_share), note: "Share of 4,096 samples that were exactly the best day" }],
    reference: { value: rnd.optimum_share, label: "Random 0.05%" },
    format: (v) => `${(v * 100).toFixed(2)}%`,
    height: 220,
  }));
  $("#fc-min").textContent = fc.min;
  $("#fc-max").textContent = fc.max;
  $("#fc-best").textContent = fc.reaching_best;
  once("chart-fcfs", () => dotStrip($("#chart-fcfs"), { rows: fc.orders, best: fc.best, height: 150 }));
}

/* ---------- Head to head: Suhai against the standard encoding ---------- */

function duel(ev, c1, s1) {
  const cs = ev.circuit_stats;
  // [label, Suhai, Standard, how to print, lower is better]
  const rows = [
    ["Qubits", cs.compact.qubits, cs.slack.qubits, (v) => v, true],
    ["Two qubit gates per layer", cs.compact.two_qubit_gates, cs.slack.two_qubit_gates, (v) => v, true],
    ["Answers that keep every rule", c1.valid_share, s1.valid_share, (v) => fmt.pct(v), false],
    ["Answers that are the best day", c1.optimum_share, s1.optimum_share, (v) => fmt.pct(v, 2), false],
    ["Simulator time for one layer", c1.seconds, s1.seconds, (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} s`, true],
    ["Best day found", c1.best_valid_benefit, s1.best_valid_benefit, (v) => v, false],
  ];
  const box = $("#duel");
  box.insertAdjacentHTML("beforeend", rows.map(([label, a, b, f, low], k) => {
    const max = Math.max(a, b) || 1;
    const win = a === b ? "" : (low ? a < b : a > b) ? "a" : "b";
    const cell = (v, who) => `<span class="duel-cell${win === who ? " win" : ""}"><b class="num">${f(v)}</b><i style="--w:${(v / max).toFixed(3)}"></i></span>`;
    return `<div class="duel-row" style="--k:${k}"><span class="duel-label">${label}${low ? "<small>lower is better</small>" : ""}</span>${cell(a, "a")}${cell(b, "b")}</div>`;
  }).join(""));
}

/* ---------- The register motif ---------- */

async function registers() {
  const [scn, ex] = await Promise.all([api.scenario(1), api.exact(1)]);
  [["#hero-reg", 0], ["#close-reg", 1600]].forEach(([sel, offset]) => {
    const el = $(sel);
    if (!el) return;
    const reg = createRegister(el, scn, { labels: false });
    let visible = false, timer = 0;
    // Superposition, then a measurement that lands on the best day, then back again.
    const cycle = () => {
      if (!visible) return;
      reg.superpose();
      timer = setTimeout(() => reg.collapse(ex.view.bits, { step: 70 }).then(() => { timer = setTimeout(cycle, 2600); }), 2600);
    };
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) timer = setTimeout(cycle, offset);
      if (!visible) clearTimeout(timer);
    }).observe(el);
  });
}

/* ---------- What if ---------- */

async function whatif() {
  const render = async (b) => {
    const ex = await api.exact(b);
    const score = $("#wi-score");
    score.dataset.from = score.textContent;
    countTo(score, ex.benefit, { duration: 400, decimals: 0 });
    const all = ex.view.unserved.length === 0;
    const tag = $("#wi-tag");
    tag.className = `tag ${all ? "good" : "sun"}`;
    tag.textContent = all ? "Every service runs" : `${ex.view.unserved.join(", ")} wait`;
    renderSlots($("#wi-slots"), ex.view, { compact: true });
  };
  segmented($("#battery-toggle"), (v) => render(Number(v)).catch((e) => toast(e.message, "bad")));
  await render(1);
}

// The hosted copy has no Python server, so there are no interactive API docs to link to.
api.mode().then((m) => { if (m === "recorded") $("#api-link")?.remove(); });

Promise.allSettled([dayTable(), space(), method(), results(), whatif(), registers()]).then((r) => {
  if (r.some((x) => x.status === "rejected")) {
    console.error(r.filter((x) => x.status === "rejected"));
    toast("The server did not answer. Start it with python serve.py", "bad");
  }
});
