// Suhai control room. The qubit register first, then the plan it measured, quantum against
// classical, every answer checked, and a day you build yourself.

import { api, fmt } from "./api.js";
import { initMotion, segmented, tip, toast, countTo } from "./motion.js";
import { playIntro } from "./intro.js";
import { createScene, slotState, SLOT_PHASE } from "./scene.js";
import { liveTrace, scheduleGrid, bitsOf } from "./charts.js";
import { SERVICE, renderSlots, slotSentence, escapeHtml } from "./ui.js";
import { createRegister } from "./register.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

playIntro();
initMotion();

const PENALTY = 12;
const state = {
  battery: 1,
  slot: 1,
  encoding: "compact",
  layers: 1,
  source: "exact",
  scenario: null,
  exact: null,
  landscape: null,
  fcfsView: null,
  result: null,
  resultBattery: null,
  labBits: "00000000000",
  runId: null,
  running: false,
  msPerEval: null,
  recorded: false,     // true on the hosted site, where runs are replayed recordings
  runTimes: {},
  speed: 1,
};

/* ---------------------------------------------------------------------------
   Engine
--------------------------------------------------------------------------- */

async function checkEngine() {
  const dot = $("#engine .dot-live");
  const text = $("#engine-text");
  try {
    const h = await api.health();
    const e = h.engine;
    if (e.ms_per_eval) state.msPerEval = e.ms_per_eval;
    if (h.mode === "recorded") {
      state.recorded = true;
      state.runTimes = h.runs || {};
      dot.className = "dot-live";
      text.textContent = `Recorded on Qiskit ${e.qiskit}`;
      $("#engine").title = "This hosted page replays real runs recorded with Qiskit Aer. Run python serve.py for live runs.";
      $("#status").textContent = "This hosted page replays real Qiskit Aer runs step by step. Start python serve.py to run them live.";
      $("#rb-label").textContent = "Measure the qubits";
      return true;
    }
    dot.className = e.ready ? "dot-live" : "dot-live off";
    text.textContent = e.ready ? `Qiskit ${e.qiskit} ready` : "Qiskit missing";
    if (!e.ready) toast(`Qiskit is not available on the server. ${e.error || ""}`, "bad");
    return e.ready;
  } catch {
    dot.className = "dot-live off";
    text.textContent = "Server offline";
    toast("Cannot reach the server. Start it with python serve.py", "bad");
    return false;
  }
}

/* ---------------------------------------------------------------------------
   The village day
--------------------------------------------------------------------------- */

const scene = createScene($("#day-scene"), { mode: "board" });
const sourceSeg = segmented($("#source-seg"), (v) => setSource(v));
const batterySeg = segmented($("#battery-seg"), (v) => setBattery(Number(v)));

function currentView() {
  if (state.source === "qaoa" && state.result?.best_valid) return state.result.best_valid;
  if (state.source === "fcfs" && state.fcfsView) return state.fcfsView;
  return state.exact.view;
}

function setSlot(t, { animate = true } = {}) {
  state.slot = t;
  const view = currentView();
  scene[animate ? "animateTo" : "setPhase"](SLOT_PHASE[t], 1200);
  scene.setActive({ ...slotState(view, t, state.battery), labels: true });
  const cap = $("#scene-cap");
  cap.textContent = `${view.slots[t].name}. ${slotSentence(view.slots[t], view, state.battery)}`;
  cap.style.animation = "none"; void cap.offsetWidth; cap.style.animation = "";
  $$("#plan-slots .slotcol").forEach((c, k) => c.classList.toggle("now", k === t));
}

function renderDay() {
  const view = currentView();
  renderSlots($("#plan-slots"), view);
  $$("#plan-slots .slotcol").forEach((c, k) => {
    c.classList.toggle("now", k === state.slot);
    c.addEventListener("click", () => setSlot(k));
  });
  const num = $("#df-benefit");
  num.dataset.from = parseInt(num.textContent, 10) || 0;
  countTo(num, view.benefit, { duration: 600, decimals: 0 });

  const waiting = view.unserved.length ? `${view.unserved.join(" and ").toLowerCase()} ${view.unserved.length > 1 ? "wait" : "waits"}` : "every service runs";
  const r = state.result;
  const where = {
    exact: `benefit, the best of all ${fmt.int(state.exact.n_total)} days. ${cap(waiting)}.`,
    qaoa: r?.best_valid ? `benefit, the best valid answer the circuit returned. ${r.best_valid.bits === state.exact.view.bits ? "It matches the exact best." : `${r.gap_to_exact} below the exact best.`}` : "",
    fcfs: state.fcfsView?.order ? `benefit when whoever asks first is served first, in the unluckiest order. ${cap(waiting)}.` : "",
  }[state.source];
  $("#df-text").textContent = where;
  const verdict = $("#df-verdict");
  verdict.className = `tag ${view.feasible ? "good" : "bad"}`;
  verdict.textContent = view.feasible ? "Keeps every rule" : "Breaks a rule";
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function setSource(v) {
  state.source = v;
  sourceSeg.set(v);
  renderDay();
  setSlot(state.slot);
}

async function setBattery(b) {
  if (state.running) { toast("Wait for the run to finish first"); batterySeg.set(state.battery); return; }
  const previous = state.battery;
  state.battery = b;
  try { await loadBase(); }
  catch (e) {
    state.battery = previous; batterySeg.set(previous);
    await loadBase().catch(() => {});
    toast(`Could not switch the battery. ${e.message}`, "bad");
    return;
  }
  if (state.resultBattery !== b) { state.result = null; resetRun(); setSource("exact"); }
  estimate();
}

/* ---------------------------------------------------------------------------
   Base data for one battery size
--------------------------------------------------------------------------- */

async function loadBase() {
  const b = state.battery;
  const [scenario, exact, landscape, fcfs] = await Promise.all([api.scenario(b), api.exact(b), api.landscape(b), api.fcfs(b)]);
  Object.assign(state, { scenario, exact, landscape });
  const worst = fcfs.orders.reduce((a, r) => (r.benefit < a.benefit ? r : a), fcfs.orders[0]);
  state.fcfsView = await api.evaluate(worst.bits, b, PENALTY);
  state.fcfsView.order = worst.order;
  const sun = scenario.slots.reduce((a, s) => a + s.solar_kwh, 0);
  $("#day-sub").textContent = `${sun} kWh of sun and a ${scenario.battery_kwh} kWh battery for four services`;
  state.fcfs = fcfs;
  if (!register) register = createRegister($("#register"), scenario);
  renderDay();
  renderVersus();
  drawSpace();
  buildMatrix();
  evaluateLab();
  setSlot(state.slot, { animate: false });
}

/* ---------------------------------------------------------------------------
   Every answer, checked
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   The register and its story
--------------------------------------------------------------------------- */

let register = null;
const IDLE_TITLE = "Eleven qubits decide who gets the sun.";
const IDLE_SUB = "Each qubit is one yes or no choice. Until it is measured, the register holds all 2,048 possible days at once.";
const WHEN = ["in the morning", "at midday", "in the afternoon", "in the evening"];

function headline(title, sub) {
  const h = $("#q-title"), p = $("#q-sub");
  if (title && h.textContent !== title) { h.textContent = title; h.classList.remove("title-swap"); void h.offsetWidth; h.classList.add("title-swap"); }
  if (sub != null) p.textContent = sub;
}

function describeDay(view) {
  const parts = view.slots.flatMap((s) => s.services.map((x) => `${x.name.toLowerCase()} ${WHEN[s.index]}${s.battery ? " with the battery" : ""}`));
  if (!parts.length) return "Nothing runs";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return list.charAt(0).toUpperCase() + list.slice(1);
}

/* ---------------------------------------------------------------------------
   Quantum vs classical
--------------------------------------------------------------------------- */

let evidence = null;
function renderVersus() {
  const b = state.battery, ex = state.exact, fc = state.fcfs, r = state.result;
  const sb = evidence?.same_budget;
  const recordedRow = (enc, layers) => (b === 1 && sb ? sb[enc].find((x) => x.reps === layers) : null);
  const mine = (enc) => (r && r.params.encoding === enc && r.params.battery_blocks === b ? r : null);
  const suhai = mine("compact"), std = mine("slack");
  // Compare like with like: the same number of layers on both sides when it was recorded.
  const L = suhai ? suhai.params.layers : std ? std.params.layers : 1;
  const sRec = recordedRow("compact", L) || recordedRow("compact", 1);
  const tRec = recordedRow("slack", L) || recordedRow("slack", 1);
  const q = (live, rec) => live
    ? { valid: live.valid_share, best: live.best_valid?.benefit ?? null, note: `your ${state.recorded ? "replay" : "run"}, ${live.params.layers} layer${live.params.layers > 1 ? "s" : ""}, ${live.seconds.toFixed(1)} s`, layers: live.params.layers }
    : rec ? { valid: rec.valid_share, best: rec.best_valid_benefit, note: `recorded, ${rec.reps} layer${rec.reps > 1 ? "s" : ""}, ${rec.seconds.toFixed(1)} s`, layers: rec.reps }
      : { valid: null, best: null, note: "measure the qubits to compare", layers: null };
  const S = q(suhai, sRec), T = q(std, tRec);
  const rows = [
    { cls: "q" + (suhai ? " mine" : ""), kind: "Quantum", name: "Suhai, 11 qubits", note: S.note, valid: S.valid, best: S.best, bar: "var(--brand)" },
    { cls: "q" + (std ? " mine" : ""), kind: "Quantum", name: "Standard, 20 qubits", note: T.note, valid: T.valid, best: T.best, bar: "#a99df2" },
    { cls: "c", kind: "Classical", name: "Check all 2,048 days", note: `exact answer, ${Math.max(1, Math.round(ex.milliseconds))} ms`, valid: 1, best: ex.benefit, bar: "var(--ink)" },
    { cls: "c", kind: "Classical", name: "First come first served", note: "the unluckiest of 24 arrival orders", valid: 1, best: fc ? fc.min : null, bar: "var(--ink-3)" },
    { cls: "c", kind: "Baseline", name: "Random guessing", note: "pick any of the 2,048 days", valid: ex.random?.valid_share ?? null, best: null, bar: "var(--coral)" },
  ];
  $("#vs-list").innerHTML = rows.map((x) => `
    <li class="vs-row ${x.cls}">
      <span class="vs-name"><b>${x.name}<span class="vs-kind">${x.kind}</span></b><small>${x.note}</small></span>
      <span class="vs-bar" style="--bar:${x.bar}">${x.valid == null ? '<em class="na">not measured</em>' : fmt.pct(x.valid)}<i data-w="${x.valid ?? 0}"></i></span>
      <span class="vs-best${x.best != null && x.best < ex.benefit ? " short" : ""}">${x.best ?? '<em class="na">none</em>'}</span>
    </li>`).join("");
  requestAnimationFrame(() => requestAnimationFrame(() => $$("#vs-list i[data-w]").forEach((i) => i.style.setProperty("--w", i.dataset.w))));

  const el = $("#vs-ratio");
  if (S.valid != null && T.valid > 0) {
    el.dataset.from = parseFloat(el.textContent) || 0;
    countTo(el, +(S.valid / T.valid).toFixed(1), { decimals: 1, suffix: "×", duration: 800 });
    const fair = S.layers === T.layers;
    $("#vs-what").textContent = `more valid answers than the standard quantum method${fair ? ` at ${S.layers} layer${S.layers > 1 ? "s" : ""}` : ""}, with 9 fewer qubits`;
  } else {
    el.textContent = "9";
    $("#vs-what").textContent = "fewer qubits than the standard quantum method. Measure the qubits to compare answers.";
  }
}

let grid;
function drawSpace(density = null) {
  if (grid) grid.stop();
  const land = state.landscape;
  grid = scheduleGrid($("#land"), {
    landscape: land, density, sweep: !!density,
    onHover: (k, e) => {
      const n = density ? density[k] : null;
      const kind = k === land.exact_index ? "The best possible day" : land.feasible[k] ? "Keeps every rule" : "Breaks a rule";
      tip.show(`<b>Day ${fmt.int(k + 1)}</b><hr>${kind}${n != null ? `<div class="row"><span class="k">Times the circuit returned it</span><span>${n.toLocaleString()}</span></div>` : ""}<div class="k" style="margin-top:6px">Click to try it yourself</div>`, e.clientX, e.clientY);
    },
    onClick: (k) => { setLabBits(bitsOf(k)); $("#lab").scrollIntoView({ behavior: "smooth", block: "center" }); },
  });
  $("#land-legend").innerHTML = density
    ? `<span><i class="lg ok"></i>Valid answers it returned</span><span><i class="lg bad"></i>Answers that broke a rule</span><span><i class="lg best"></i>Best day</span>`
    : `<span><i class="lg ok"></i>Keeps every rule</span><span><i class="lg no"></i>Breaks a rule</span><span><i class="lg best"></i>Best day</span>`;
  $("#space-sub").textContent = density
    ? `Darker squares came back more often. ${fmt.pct(state.result.valid_share)} of answers kept every rule, against ${fmt.pct(land.n_feasible / 2048)} for random guessing.`
    : `All 2,048 possible days. Only ${land.n_feasible} keep every rule and gold is the best.`;
}

/* ---------------------------------------------------------------------------
   Quantum planner
--------------------------------------------------------------------------- */

const trace = liveTrace($("#trace"), { height: 170 });
const encSeg = segmented($("#enc-seg"), (v) => { state.encoding = v; guardStandard(); estimate(); });
const layersSeg = segmented($("#layers-seg"), (v) => { state.layers = Number(v); estimate(); });

function guardStandard() {
  const std = state.encoding === "slack";
  $$("#layers-seg button").forEach((b) => { b.disabled = std && b.dataset.value === "3"; });
  if (std && state.layers > 2) { state.layers = 2; layersSeg.set(2); }
}

function estimate() {
  if (state.running) return;
  if (state.recorded) {
    const secs = state.runTimes[`${state.encoding}_${state.layers}_${state.battery}`];
    $("#rb-hint").textContent = secs == null ? "not recorded" : secs > 14 ? "sped up to 14 s" : `${secs.toFixed(1)} s`;
    return;
  }
  if (state.encoding === "slack") { $("#rb-hint").textContent = "several minutes"; return; }
  // COBYLA stops early with few angles. About 50 evaluations per start at one layer, the full budget later.
  let evals = 0;
  for (let p = 1; p <= state.layers; p++) evals += 3 * Math.min(150, 50 * p * p);
  const secs = Math.max(1, Math.round((evals * (state.msPerEval || 25)) / 1000 + 0.6 * state.layers));
  $("#rb-hint").textContent = secs < 60 ? `about ${secs} s` : `about ${Math.round(secs / 60)} min`;
}

function say(text) {
  const s = $("#status");
  if (s.textContent === text) return;
  s.textContent = text;
}

let timer, startedAt;
function setRunning(on) {
  state.running = on;
  const btn = $("#run-btn");
  btn.classList.toggle("running", on);
  $("#rb-label").textContent = on ? "Stop" : "Measure again";
  $$(".controls .seg button").forEach((b) => { if (on) b.dataset.was = b.disabled; b.disabled = on || b.dataset.was === "true"; });
  if (!on) { $$(".controls .seg button").forEach((b) => delete b.dataset.was); guardStandard(); estimate(); }
  clearInterval(timer);
  if (on) {
    startedAt = performance.now();
    timer = setInterval(() => { $("#rb-hint").textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)} s`; }, 100);
  }
}

function setFill(p) { $("#rb-fill").style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`; }

async function startRun() {
  if (state.running) return;
  const params = { encoding: state.encoding, layers: state.layers, penalty: PENALTY, battery_blocks: state.battery, budget: "quick", shots: 4096, seed: 42 };
  trace.reset();
  setFill(0.02);
  setRunning(true);
  $("#trace-shell").classList.add("open");
  register.superpose(true);
  headline("The circuit is learning.", "Every qubit is still every option at once. The optimiser tunes the circuit so the best days become the likely ones.");
  say("Building the circuit from the cost of every rule.");

  let run;
  try { run = await api.startRun(params); }
  catch (e) { setRunning(false); setFill(0); toast(e.message, "bad"); return; }
  state.runId = run.id;
  const iters = 150;
  let reps = 0, curStart = -1, startEvals = 0, lastSay = 0;

  state.speed = 1;
  api.follow(run.id, {
    onSpeed: (x) => { state.speed = x; },
    onEvent: async (kind, data) => {
      if (kind === "queued" && data.position > 1) say("Waiting for an earlier run to finish.");
      if (kind === "started") say(data.helper_qubits
        ? `${data.qubits} qubits, ${data.helper_qubits} of them helpers that only count leftover energy.`
        : `${data.qubits} qubits, one per decision. Tuning the angles.`);
      if (kind === "optimise") {
        if (data.reps !== reps) { reps = data.reps; curStart = -1; if (reps > 1) trace.layer(reps); }
        trace.push({ y: data.energy, start: data.start, reps: data.reps });
        if (data.start !== curStart) { curStart = data.start; startEvals = 0; }
        startEvals++;
        const inLayer = (data.start + Math.min(1, startEvals / iters)) / data.n_starts;
        setFill(0.03 + (((reps - 1) + inLayer * 0.92) / params.layers) * 0.92);
        const now = performance.now();
        if (now - lastSay > 400) { lastSay = now; say(`Tuning layer ${data.reps} of ${params.layers}, attempt ${data.start + 1} of ${data.n_starts}.`); }
      }
      if (kind === "sample") { say(`Measuring the tuned circuit ${fmt.int(data.shots)} times.`); headline("Measuring.", null); }
      if (kind === "layer_done") say("Checking every answer against the rules.");
      if (kind === "done") {
        try { finishRun((await api.getRun(run.id)).result); } catch (e) { toast(e.message, "bad"); }
        setRunning(false);
      }
      if (kind === "failed") { setRunning(false); setFill(0); register.superpose(); say(data.error); toast(data.error, "bad"); }
      if (kind === "cancelled") { setRunning(false); setFill(0); register.superpose(); headline(IDLE_TITLE, IDLE_SUB); say("Stopped. Nothing from that run is shown."); }
    },
    onError: (e) => { setRunning(false); setFill(0); toast(e.message, "bad"); },
  });
}

async function stopRun() {
  if (!state.running || !state.runId) return;
  try { await api.cancelRun(state.runId); } catch (e) { toast(e.message, "bad"); }
}

function finishRun(res) {
  if (!state.recorded && res.params.encoding === "compact" && trace.size) state.msPerEval = Math.max(1, (res.seconds * 1000 - 600 * res.params.layers) / trace.size);
  state.result = res;
  state.resultBattery = res.params.battery_blocks;
  setFill(1);
  setTimeout(() => { if (!state.running) setFill(0); }, 900);

  if (res.best_valid) {
    register.collapse(res.best_valid.bits).then(() => {
      const same = res.best_valid.bits === res.exact.view.bits;
      headline("Measured. Here is the day.", `${describeDay(res.best_valid)}. Benefit ${res.best_valid.benefit}${same ? ", the same day that checking all 2,048 finds." : `, ${res.gap_to_exact} below the exact best.`}`);
    });
  } else {
    register.superpose();
    headline("No valid day came back.", "Every measured day broke a rule. More circuit layers usually fix this.");
  }
  renderVersus();
  say(`${fmt.int(res.shots)} answers came back, ${fmt.int(res.distinct)} of them different. Every one was checked.${state.recorded ? state.speed > 1 ? ` Replayed ${state.speed.toFixed(0)} times faster than recorded.` : " Replayed at its recorded speed." : ""}`);
  $$("#source-seg button").forEach((b) => { if (b.dataset.value === "qaoa") b.disabled = !res.best_valid; });
  if (res.best_valid) setSource("qaoa");
  drawSpace(res.density);
  if (!res.best_valid) toast("No valid day came back. Try more layers.", "bad");
}

function resetRun() {
  trace.reset();
  setFill(0);
  $("#trace-shell").classList.remove("open");
  register?.superpose();
  headline(IDLE_TITLE, IDLE_SUB);
  renderVersus();
  say("Qiskit tunes the circuit, measures it 4,096 times and keeps the best day that breaks no rule.");
  $$("#source-seg button").forEach((b) => { if (b.dataset.value === "qaoa") b.disabled = true; });
}

$("#run-btn").addEventListener("click", () => (state.running ? stopRun() : startRun()));

/* ---------------------------------------------------------------------------
   Try your own day
--------------------------------------------------------------------------- */

function buildMatrix() {
  const scn = state.scenario;
  const vars = scn.variables;
  const SHORT_SLOT = ["Morn", "Noon", "Aft", "Eve"];
  const SHORT_SVC = { m: "Milk", i: "Irrigation", w: "Water", h: "Homes" };
  const head = `<span></span>${scn.slots.map((s) => `<span class="mx-head"><span class="full">${s.name}</span><span class="short">${SHORT_SLOT[s.index]}</span><small>${s.solar_kwh ? `${s.solar_kwh} kWh sun` : "no sun"}</small></span>`).join("")}`;
  const rows = scn.services.map((svc) => {
    const cells = scn.slots.map((s) => {
      const k = vars.findIndex((v) => v.kind === "service" && v.service === svc.key && v.slot === s.index);
      if (k < 0) return `<span class="mx-none"></span>`;
      return `<button class="mx-cell" data-k="${k}" style="--c:${SERVICE[svc.key].color}" aria-label="${escapeHtml(vars[k].label)}" title="Worth ${vars[k].benefit}">+${vars[k].benefit}</button>`;
    }).join("");
    return `<span class="mx-row"><span class="sw ${svc.key}"></span><span><span class="full">${svc.name.replace("Household essentials", "Homes")}</span><span class="short">${SHORT_SVC[svc.key]}</span><small>needs ${svc.energy_kwh} kWh</small></span></span>${cells}`;
  }).join("");
  const battery = `<span class="mx-row"><span class="sw d"></span><span>Battery<small>holds ${scn.battery_kwh} kWh</small></span></span>${scn.slots.map((s) => {
    const k = vars.findIndex((v) => v.kind === "battery" && v.slot === s.index);
    return `<button class="mx-cell" data-k="${k}" style="--c:var(--battery)" aria-label="Use the battery ${["in the morning", "at midday", "in the afternoon", "in the evening"][s.index]}" title="Adds 5 kWh to this slot">Use</button>`;
  }).join("")}`;
  $("#matrix").innerHTML = head + rows + battery;
  $$("#matrix .mx-cell").forEach((b) => b.addEventListener("click", () => {
    const k = Number(b.dataset.k);
    const arr = state.labBits.split("");
    arr[k] = arr[k] === "1" ? "0" : "1";
    setLabBits(arr.join(""));
  }));
  syncMatrix();
}

function syncMatrix() {
  $$("#matrix .mx-cell").forEach((b) => b.setAttribute("aria-pressed", String(state.labBits[Number(b.dataset.k)] === "1")));
}

function setLabBits(bits) {
  state.labBits = bits;
  syncMatrix();
  evaluateLab();
}

let labToken = 0;
async function evaluateLab() {
  const my = ++labToken;
  let v;
  try { v = await api.evaluate(state.labBits, state.battery, PENALTY); }
  catch (e) { toast(e.message, "bad"); return; }
  if (my !== labToken) return;

  // Mark the cells sitting in a slot that asks for more energy than it has.
  const over = new Set(v.slots.filter((s) => s.over).map((s) => s.index));
  $$("#matrix .mx-cell").forEach((b) => {
    const variable = state.scenario.variables[Number(b.dataset.k)];
    b.classList.toggle("clash", b.getAttribute("aria-pressed") === "true" && over.has(variable.slot));
  });

  const empty = !state.labBits.includes("1");
  const tag = empty ? `<span class="tag">Empty day</span>` : v.is_exact_best
    ? `<span class="tag sun">The best possible day</span>`
    : v.feasible ? `<span class="tag good">Keeps every rule</span>` : `<span class="tag bad">Breaks ${v.violations.length} rule${v.violations.length > 1 ? "s" : ""}</span>`;
  const lines = v.violations.length
    ? v.violations.map((x, k) => `<li style="--k:${k}">${escapeHtml(x)}</li>`)
    : [`<li class="ok">${empty ? "Nothing is switched on yet. Tap a slot above." : v.unserved.length ? `${escapeHtml(v.unserved.join(" and "))} ${v.unserved.length > 1 ? "wait" : "waits"}.` : "Every service runs."}</li>`];
  if (v.feasible && !v.is_exact_best && !empty) lines.push(`<li class="ok" style="--k:1">The best day scores ${state.exact.benefit}.</li>`);

  const prev = Number($("#vd-num")?.textContent) || 0;
  $("#verdict").innerHTML = `
    <div class="vd-score"><b class="num" id="vd-num" data-from="${prev}">${prev}</b><span>benefit</span></div>
    <div class="vd-body">${tag}<ul class="vd-list">${lines.join("")}</ul></div>`;
  countTo($("#vd-num"), v.benefit, { decimals: 0, duration: 450 });
}

$("#lab-best").addEventListener("click", () => setLabBits(state.exact.view.bits));
$("#lab-clear").addEventListener("click", () => setLabBits("00000000000"));

/* ---------------------------------------------------------------------------
   Keys and boot
--------------------------------------------------------------------------- */

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "r") { e.preventDefault(); startRun(); }
  else if (k === "escape") stopRun();
  else if (["1", "2", "3", "4"].includes(k)) setSlot(Number(k) - 1);
});

let touched = false;
["pointerdown", "keydown", "wheel"].forEach((ev) => window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));

(async () => {
  const ready = await checkEngine();
  estimate();
  if (!state.msPerEval && !state.recorded) setTimeout(async () => { await checkEngine(); estimate(); }, 4000);
  try { await loadBase(); }
  catch (e) { toast("Could not load the scenario from the server.", "bad"); console.error(e); return; }
  try { evidence = await api.evidence(); renderVersus(); } catch { /* the panel still shows the classical rows */ }
  if (!ready) $("#run-btn").disabled = true;
  if (ready && new URLSearchParams(location.search).has("autorun")) { touched = true; setTimeout(startRun, 400); return; }
  // A slow walk through the day while the page settles.
  [0, 1, 2, 3, 1].forEach((t, i) => setTimeout(() => { if (!state.running && !touched) setSlot(t); }, 2200 + i * 1800));
})();
