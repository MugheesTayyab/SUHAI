import { api, fmt } from "./api.js";
import { initMotion, refreshMotion, segmented, tip, toast, countTo } from "./motion.js";
// Suhai control room
import { createScene, slotState, SLOT_PHASE } from "./scene.js";
import { liveTrace, groupedBars, dotStrip, histogram, scheduleGrid, bitsOf } from "./charts.js";
import { SERVICE, renderSlots, slotSentence, escapeHtml } from "./ui.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

initMotion();

const state = {
  battery: 1,
  slot: 1,
  encoding: "compact",
  layers: 1,
  penalty: 12,
  budget: "quick",
  source: "exact",
  scenario: null,
  exact: null,
  landscape: null,
  fcfs: null,
  fines: null,
  circuit: null,
  result: null,        // last finished live run
  resultBattery: null,
  picked: null,        // a sample picked from the list
  fcfsView: null,
  labBits: "10100101000",
  runId: null,
  closeStream: null,
  running: false,
};

/* ---------------------------------------------------------------------------
   Engine status
--------------------------------------------------------------------------- */

async function checkEngine() {
  const dot = $("#engine .dot-live");
  const text = $("#engine-text");
  try {
    const h = await api.health();
    const e = h.engine;
    if (e.ms_per_eval) state.msPerEval = e.ms_per_eval;
    if (e.ready) {
      dot.className = "dot-live";
      text.textContent = `Qiskit ${e.qiskit} · Aer ${e.qiskit_aer} · online`;
    } else {
      dot.className = "dot-live off";
      text.textContent = "Qiskit missing";
      toast(`Qiskit is not available on the server. ${e.error || ""}`, "bad");
    }
    return e.ready;
  } catch {
    dot.className = "dot-live off";
    text.textContent = "Server offline";
    toast("Cannot reach the server. Start it with python serve.py", "bad");
    return false;
  }
}

/* ---------------------------------------------------------------------------
   Hero: scene, scrubber, battery
--------------------------------------------------------------------------- */

const scene = createScene($("#hp-scene"), { mode: "board" });
$("#overview").addEventListener("pointermove", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  scene.parallax((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
});

const slotSeg = segmented($("#slot-seg"), (v) => setSlot(Number(v)));
const batterySeg = segmented($("#battery-seg"), (v) => setBattery(Number(v)));

function currentView() {
  if (state.source === "qaoa" && state.result?.best_valid) return state.result.best_valid;
  if (state.source === "sample" && state.picked) return state.picked;
  if (state.source === "fcfs" && state.fcfsView) return state.fcfsView;
  return state.exact.view;
}

function setSlot(t, { animate = true } = {}) {
  state.slot = t;
  slotSeg.set(t);
  const view = currentView();
  scene[animate ? "animateTo" : "setPhase"](SLOT_PHASE[t], 1300);
  scene.setActive({ ...slotState(view, t, state.battery), labels: true });
  const cap = $("#hp-caption");
  cap.textContent = slotSentence(view.slots[t], view, state.battery);
  cap.style.animation = "none"; void cap.offsetWidth; cap.style.animation = "";
  $$("#plan-slots .slotcol").forEach((c, k) => c.classList.toggle("now", k === t));
}

function renderHero() {
  const scn = state.scenario;
  const solar = scn.slots.reduce((a, s) => a + s.solar_kwh, 0);
  $("#hp-sub").textContent = `${solar} kWh of sun and ${scn.battery_kwh} kWh of battery for four services.`;
  const view = currentView();
  $("#hp-benefit").textContent = view.benefit;
  $("#hp-benefit-src").textContent = { qaoa: "QAOA best", exact: "exact best", fcfs: "unlucky queue", sample: "picked sample" }[state.source];
  // A schedule that breaks a rule is not a plan, so it has no gap to report.
  $("#hp-gap").textContent = view.feasible ? state.exact.benefit - view.benefit : "✕";
  $("#hp-gap-l").textContent = view.feasible ? "gap to exact best" : "breaks a rule";
}

async function setBattery(b) {
  if (state.running) { toast("Wait for the run to finish before changing the battery"); batterySeg.set(state.battery); return; }
  const previous = state.battery;
  state.battery = b;
  try {
    await loadBase();
  } catch (e) {
    state.battery = previous;
    batterySeg.set(previous);
    await loadBase().catch(() => {});
    toast(`Could not switch the battery. ${e.message}`, "bad");
    return;
  }
  if (state.resultBattery !== b) {
    state.result = null; state.picked = null;
    resetRunViews();
    setSource("exact");
  }
  toast(b === 2 ? "Battery doubled to 10 kWh. The exact best is now " + state.exact.benefit + "." : "Back to the 5 kWh test instance.");
}

/* ---------------------------------------------------------------------------
   Base data for the current battery size
--------------------------------------------------------------------------- */

async function loadBase() {
  const b = state.battery;
  const [scenario, exact, landscape, fcfs, fines] = await Promise.all([
    api.scenario(b), api.exact(b), api.landscape(b), api.fcfs(b), api.fines(b, state.penalty),
  ]);
  Object.assign(state, { scenario, exact, landscape, fcfs, fines });
  const worst = fcfs.orders.reduce((a, r) => (r.benefit < a.benefit ? r : a), fcfs.orders[0]);
  state.fcfsView = await api.evaluate(worst.bits, b, state.penalty);
  state.fcfsView.order = worst.order;
  $("#foot-ms").textContent = `${Math.max(1, Math.round(exact.milliseconds))} ms on this server`;
  renderHero();
  renderPlan();
  drawLandscape();
  buildSwitches();
  evaluateLab();
  setSlot(state.slot, { animate: false });
}

/* ---------------------------------------------------------------------------
   KPIs
--------------------------------------------------------------------------- */

async function initKpis() {
  try {
    const circuit = await api.circuit(1, 12);
    state.circuit = circuit;
    $("#k-qubits").textContent = circuit.compact.qubits;
    $("#k-qubits-std").textContent = circuit.slack.qubits;
    $("#k-gates").textContent = circuit.compact.two_qubit_gates;
    $("#k-gates-std").textContent = circuit.slack.two_qubit_gates;
  } catch { /* the recorded numbers already on the page stay */ }
  try {
    const ev = await api.evidence();
    const r = ev.depth_study[0];
    $("#k-valid").textContent = fmt.pct(r.valid_share);
    $("#k-hits").textContent = Math.round(r.optimum_share * 4096);
    $("#k-hits-s").textContent = `${fmt.pct(r.optimum_share, 2)} of samples, one layer`;
    $("#k-valid-s").textContent = `Random guessing gets ${fmt.pct(ev.random_guess.valid_share)}`;
  } catch { /* keep defaults */ }
}

function liveKpis(res) {
  $$("[data-src]").forEach((t) => { t.className = "tag live"; t.textContent = "Live"; });
  const v = $("#k-valid"); v.dataset.from = parseFloat(v.textContent) || 0;
  countTo(v, +(res.valid_share * 100).toFixed(1), { suffix: "%", decimals: 1, duration: 900 });
  const h = $("#k-hits"); h.dataset.from = parseInt(h.textContent.replace(/,/g, ""), 10) || 0;
  countTo(h, res.exact_hits, { decimals: 0, duration: 900 });
  $("#k-shots").textContent = fmt.int(res.shots);
  $("#k-hits-s").textContent = `${fmt.pct(res.optimum_share, 2)} of samples · random would be ${fmt.pct(res.random.optimum_share, 2)}`;
  $("#k-valid-s").textContent = `Random guessing gets ${fmt.pct(res.random.valid_share)}`;
  const std = res.params.encoding === "slack";
  const c = state.circuit;
  $("#k-qubits").textContent = res.qubits;
  $("#k-qubits-l").textContent = std ? `including ${res.helper_qubits} helper qubits` : "and zero helper qubits";
  $("#k-qubits-s").innerHTML = std ? `Suhai needs only <b>${c ? c.compact.qubits : 11}</b>` : `The standard method needs <b>${c ? c.slack.qubits : 20}</b>`;
  if (c) {
    $("#k-gates").textContent = std ? c.slack.two_qubit_gates : c.compact.two_qubit_gates;
    $("#k-gates-s").innerHTML = std ? `Suhai <b>${c.compact.two_qubit_gates}</b>` : `Standard method <b>${c.slack.two_qubit_gates}</b>`;
  }
}

/* ---------------------------------------------------------------------------
   Plan panel
--------------------------------------------------------------------------- */

const sourceSeg = segmented($("#source-seg"), (v) => setSource(v));

function setSource(v) {
  state.source = v;
  sourceSeg.set(v);
  renderPlan();
  renderHero();
  setSlot(state.slot);
}

function renderPlan() {
  const view = currentView();
  renderSlots($("#plan-slots"), view);
  $$("#plan-slots .slotcol").forEach((c, k) => {
    c.classList.toggle("now", k === state.slot);
    c.addEventListener("click", () => setSlot(k));
  });
  $("#pf-benefit").textContent = view.benefit;
  $("#pf-battery").textContent = view.battery_used;
  $("#pf-unserved").textContent = view.unserved.length ? view.unserved.join(", ") : "Nobody";
  const verdict = $("#pf-verdict");
  verdict.className = `tag ${view.feasible ? "good" : "bad"}`;
  verdict.textContent = view.feasible ? "Keeps every rule" : `Breaks ${view.violations.length} rule${view.violations.length > 1 ? "s" : ""}`;
  const note = $("#plan-note");
  const r = state.result;
  note.textContent = {
    exact: `The exact best, found by checking all ${fmt.int(state.exact.n_total)} days. Only ${state.exact.n_feasible} of them keep every rule.`,
    qaoa: r && r.best_valid ? `The best valid schedule among ${fmt.int(r.shots)} samples. ${r.best_valid.bits === state.exact.view.bits ? "It is the exact best, the same schedule enumeration found." : `It scores ${r.gap_to_exact} below the exact best.`}` : "",
    fcfs: state.fcfsView?.order ? `Serve whoever asks first. In this order (${state.fcfsView.order.join(", ")}) the day scores only ${state.fcfsView.benefit}.` : "",
    sample: state.picked ? `One schedule the circuit returned, checked against the rules.` : "",
  }[state.source];
}

/* ---------------------------------------------------------------------------
   Landscape
--------------------------------------------------------------------------- */

let grid;
function drawLandscape(density = null) {
  if (grid) grid.stop();
  const canvas = $("#land");
  const land = state.landscape;
  grid = scheduleGrid(canvas, {
    landscape: land,
    density,
    onHover: (k, e) => {
      const n = density ? density[k] : null;
      const kind = k === land.exact_index ? "The exact best day" : land.feasible[k] ? "Keeps every rule" : "Breaks a rule";
      tip.show(`<b>Day ${fmt.int(k + 1)}</b><hr>${kind}${land.feasible[k] ? `<div class="row"><span class="k">Objective</span><span>${land.objective[k]}</span></div>` : ""}${n != null ? `<div class="row"><span class="k">Samples here</span><span>${n.toLocaleString()}</span></div>` : ""}<div class="k" style="margin-top:6px">Click to open it in the rule lab</div>`, e.clientX, e.clientY);
    },
    onClick: (k) => { setLabBits(bitsOf(k)); $("#lab").scrollIntoView({ behavior: "smooth", block: "start" }); },
  });
  $("#land-legend").innerHTML = density
    ? `<span><i class="lg" style="background:rgba(111,165,30,.9)"></i>Valid days the circuit sampled</span><span><i class="lg bad"></i>Invalid days it sampled</span><span><i class="lg no"></i>Never sampled</span><span><i class="lg best"></i>Exact best</span>`
    : `<span><i class="lg ok"></i>Keeps every rule</span><span><i class="lg no"></i>Breaks a rule</span><span><i class="lg best"></i>Exact best</span>`;
  $("#land-note").textContent = density
    ? `Brighter squares were sampled more often. ${fmt.pct(state.result.valid_share)} of all samples landed on a valid day, against ${fmt.pct(state.landscape.n_feasible / 2048)} for random guessing.`
    : `All 2,048 possible days. Green squares keep every rule. The gold one is the best.`;
}

/* ---------------------------------------------------------------------------
   Live run
--------------------------------------------------------------------------- */

const trace = liveTrace($("#trace"));
const encSeg = segmented($("#enc-seg"), (v) => { state.encoding = v; guardStandard(); estimate(); });
const layersSeg = segmented($("#layers-seg"), (v) => { state.layers = Number(v); estimate(); });
const penaltySeg = segmented($("#penalty-seg"), async (v) => {
  state.penalty = Number(v);
  state.fines = await api.fines(state.battery, state.penalty);
  evaluateLab();
  estimate();
});

function guardStandard() {
  const std = state.encoding === "slack";
  $$("#layers-seg button").forEach((b) => { b.disabled = std && b.dataset.value === "3"; });
  if (std && state.layers > 2) { state.layers = 2; layersSeg.set(2); }
}

function estimate() {
  const b = state.budget === "quick" ? { starts: 3, iters: 150 } : { starts: 8, iters: 300 };
  const label = `${b.starts} starts × ${b.iters} steps`;
  if (state.encoding === "slack") {
    $("#estimate").textContent = `Several minutes on this machine · 20 qubits · ${label}`;
    return;
  }
  // COBYLA stops early when there are few angles. Measured here, about 50 evaluations per start
  // at one layer, and the full step budget from two layers on.
  let evals = 0;
  for (let p = 1; p <= state.layers; p++) evals += b.starts * Math.min(b.iters, 50 * p * p);
  const ms = state.msPerEval || 25;
  const secs = Math.max(1, Math.round((evals * ms) / 1000 + 0.6 * state.layers));
  const when = secs < 60 ? `About ${secs} second${secs === 1 ? "" : "s"}` : `About ${Math.round(secs / 60)} minute${secs >= 90 ? "s" : ""}`;
  $("#estimate").textContent = `${when} on this machine · ${label} · 4,096 shots`;
}

let timerHandle, startedAt;
function setRunning(on) {
  state.running = on;
  const btn = $("#run-btn");
  btn.classList.toggle("running", on);
  btn.querySelector(".run-label").textContent = on ? "Running" : "Run again";
  btn.querySelector(".arrow").textContent = on ? "◌" : "→";
  $("#run-top").disabled = on;
  $("#cancel-btn").hidden = !on;
  $$(".controls .seg button").forEach((b) => { if (on) b.dataset.wasDisabled = b.disabled; b.disabled = on || b.dataset.wasDisabled === "true"; });
  if (!on) { guardStandard(); $$(".controls .seg button").forEach((b) => delete b.dataset.wasDisabled); }
  clearInterval(timerHandle);
  if (on) {
    startedAt = performance.now();
    timerHandle = setInterval(() => { $("#run-timer").textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)} s`; }, 100);
  }
}

function setStage(name) {
  const order = ["build", "optimise", "sample", "check"];
  const k = order.indexOf(name);
  $$("#stage .st").forEach((s, i) => {
    s.classList.toggle("on", i === k);
    s.classList.toggle("done", k >= 0 && i < k || name === "complete");
  });
}

function setTag(text, cls = "") {
  const t = $("#run-tag");
  t.className = `tag ${cls}`;
  t.textContent = text;
}

async function startRun() {
  if (state.running) return;
  const params = {
    encoding: state.encoding, layers: state.layers, penalty: state.penalty,
    battery_blocks: state.battery, budget: state.budget, shots: 4096, seed: 42,
  };
  trace.reset();
  $("#layer-chips").innerHTML = "";
  $("#progress-bar").style.width = "2%";
  setStage("build");
  setTag("Starting", "sun");
  $("#run-status-text").textContent = "Building the QAOA circuit from the cost operator.";
  setRunning(true);
  document.getElementById("run").scrollIntoView({ behavior: "smooth", block: "nearest" });

  let run;
  try {
    run = await api.startRun(params);
  } catch (e) {
    setRunning(false); setTag("Error", "bad"); setStage("");
    toast(e.message, "bad");
    return;
  }
  state.runId = run.id;
  const budget = state.budget === "quick" ? { starts: 3, iters: 150 } : { starts: 8, iters: 300 };
  const totalLayers = params.layers;
  let currentReps = 0;
  let lastText = 0;
  let curStart = -1;
  let startEvals = 0;

  state.closeStream = api.follow(run.id, {
    onEvent: async (kind, data) => {
      if (kind === "queued" && data.position > 1) $("#run-status-text").textContent = `Waiting for ${data.position - 1} earlier run to finish.`;
      if (kind === "started") {
        setTag("Running", "live");
        $("#run-status-text").textContent = data.helper_qubits
          ? `${data.qubits} qubits. ${data.helper_qubits} of them are helper qubits that only count leftover energy.`
          : `${data.qubits} qubits, no helpers, ${data.penalty_terms} fines. Tuning the angles now.`;
      }
      if (kind === "optimise") {
        if (data.reps !== currentReps) {
          currentReps = data.reps;
          curStart = -1;
          if (currentReps > 1) trace.layer(currentReps);
          setStage("optimise");
        }
        trace.push({ y: data.energy, start: data.start, reps: data.reps });
        // Rough progress: layers done, then starting points done, then steps inside one start.
        if (data.start !== curStart) { curStart = data.start; startEvals = 0; }
        startEvals++;
        const perLayer = 1 / totalLayers;
        const inLayer = (data.start + Math.min(1, startEvals / budget.iters)) / data.n_starts;
        const p = ((currentReps - 1) + inLayer * 0.92) * perLayer;
        $("#progress-bar").style.width = `${Math.min(98, 3 + p * 95)}%`;
        const now = performance.now();
        if (now - lastText > 120) {
          lastText = now;
          $("#run-status-text").textContent = `Layer ${data.reps} of ${totalLayers} · starting point ${data.start + 1} of ${data.n_starts} · cost ${data.energy.toFixed(3)}`;
        }
      }
      if (kind === "sample") {
        setStage("sample");
        $("#run-status-text").textContent = `Measuring the tuned circuit ${fmt.int(data.shots)} times.`;
      }
      if (kind === "layer_done") {
        setStage("check");
        const chip = document.createElement("span");
        chip.className = "lchip";
        chip.innerHTML = `<b>${data.reps} layer${data.reps > 1 ? "s" : ""}</b><span>${fmt.pct(data.valid_share)} valid</span><span>${fmt.pct(data.optimum_share, 2)} exact best</span><span class="muted">${data.seconds.toFixed(1)} s</span>`;
        $("#layer-chips").append(chip);
      }
      if (kind === "done") {
        try {
          const full = await api.getRun(run.id);
          finishRun(full.result);
        } catch (e) { toast(e.message, "bad"); }
        setRunning(false);
      }
      if (kind === "failed") {
        setRunning(false); setTag("Failed", "bad"); setStage("");
        $("#run-status-text").textContent = data.error;
        toast(data.error, "bad");
      }
      if (kind === "cancelled") {
        setRunning(false); setTag("Stopped"); setStage("");
        $("#progress-bar").style.width = "0";
        $("#run-status-text").textContent = "Run stopped. Nothing from it is shown.";
      }
    },
    onError: (e) => { setRunning(false); setTag("Error", "bad"); toast(e.message, "bad"); },
  });
}

async function cancelRun() {
  if (!state.running || !state.runId) return;
  try { await api.cancelRun(state.runId); } catch (e) { toast(e.message, "bad"); }
}

function finishRun(res) {
  if (res.params.encoding === "compact" && trace.size) {
    state.msPerEval = Math.max(1, (res.seconds * 1000 - 600 * res.params.layers) / trace.size);
    estimate();
  }
  state.result = res;
  state.resultBattery = res.params.battery_blocks;
  $("#progress-bar").style.width = "100%";
  setStage("complete");
  setTag("Done", "good");
  $("#run-timer").textContent = `${res.seconds.toFixed(1)} s`;
  const enc = res.params.encoding === "compact" ? "Suhai" : "Standard";
  $("#run-status-text").textContent = `${enc} encoding, ${res.qubits} qubits, ${res.params.layers} layer${res.params.layers > 1 ? "s" : ""}. ${fmt.int(res.shots)} samples, ${fmt.int(res.distinct)} different days, every one checked.`;

  $$("#source-seg button").forEach((b) => { if (b.dataset.value === "qaoa") b.disabled = !res.best_valid; });
  if (res.best_valid) setSource("qaoa");
  liveKpis(res);
  renderSamples(res);
  drawLandscape(res.density);

  if (!res.best_valid) toast("No valid schedule was sampled. Try more layers or a bigger penalty.", "bad");
  else if (res.best_valid.bits === res.exact.view.bits) toast(`Best valid sample scores ${res.best_valid.benefit}. It is the exact best schedule.`);
  else toast(`Best valid sample scores ${res.best_valid.benefit}, ${res.gap_to_exact} below the exact best.`);
}

function resetRunViews() {
  trace.reset();
  $("#layer-chips").innerHTML = "";
  $("#progress-bar").style.width = "0";
  setStage("");
  setTag("Idle");
  $("#run-timer").textContent = "0.0 s";
  $("#run-status-text").textContent = "QAOA on the Aer statevector simulator. Pick a setup and press Run.";
  $("#sample-list").innerHTML = `<li class="empty-row">Run QAOA and the top schedules land here, each one checked against the rules.</li>`;
  $("#hist").innerHTML = "";
  $("#hist-head").innerHTML = "";
  $("#samples-tag").className = "tag"; $("#samples-tag").textContent = "No run yet";
  $$("#source-seg button").forEach((b) => { if (b.dataset.value === "qaoa" || b.dataset.value === "sample") b.disabled = true; });
}

/* ---------------------------------------------------------------------------
   Samples
--------------------------------------------------------------------------- */

const GROUPS = ["m", "m", "i", "i", "w", "w", "h", "d", "d", "d", "d"];
function bitHtml(bits) {
  return `<span class="bitstr">${bits.split("").map((b, i) => `${i === 7 ? '<span class="gap"></span>' : ""}<span class="g-${GROUPS[i]}${b === "1" ? " on" : ""}">${b}</span>`).join("")}</span>`;
}

function renderSamples(res) {
  $("#samples-tag").className = "tag live";
  $("#samples-tag").textContent = `${fmt.int(res.distinct)} distinct days`;
  $("#samples-note").textContent = `Top ${res.top_samples.length} of ${fmt.int(res.distinct)} different schedules in ${fmt.int(res.shots)} samples. Click one to inspect it.`;
  histogram($("#hist"), { rows: res.benefit_histogram, invalid: res.invalid_shots, shots: res.shots, best: state.exact.benefit });
  const top = res.top_samples[0].count;
  $("#sample-list").innerHTML = res.top_samples.map((s, k) => {
    const cls = s.is_exact ? "best" : s.feasible ? "" : "bad";
    const tag = s.is_exact ? `<span class="tag sun">Exact best</span>` : s.feasible ? `<span class="tag good">Valid · ${s.benefit}</span>` : `<span class="tag bad">${s.violations.length} broken</span>`;
    return `<li class="srow ${cls}" style="--k:${k}" data-bits="${s.bits}" title="${escapeHtml(s.feasible ? "Keeps every rule" : s.violations.join(". "))}">
      <span class="rk">${k + 1}</span>${bitHtml(s.bits)}
      <span class="sbar"><i style="width:${(s.count / top) * 100}%"></i></span>
      <span class="meta"><span class="num muted">${fmt.pct(s.share, 2)}</span>${tag}</span>
    </li>`;
  }).join("");
  $$("#sample-list .srow").forEach((row) => row.addEventListener("click", () => pickSample(row.dataset.bits)));
}

async function pickSample(bits) {
  $$("#sample-list .srow").forEach((r) => r.classList.toggle("sel", r.dataset.bits === bits));
  try {
    state.picked = await api.evaluate(bits, state.battery, state.penalty);
    $$("#source-seg button").forEach((b) => { if (b.dataset.value === "sample") b.disabled = false; });
    setSource("sample");
    setLabBits(bits, { scroll: false });
  } catch (e) { toast(e.message, "bad"); }
}

/* ---------------------------------------------------------------------------
   Rule lab
--------------------------------------------------------------------------- */

function buildSwitches() {
  const vars = state.scenario.variables;
  const color = { m: "var(--milk)", i: "var(--irr)", w: "var(--water)", h: "var(--home)" };
  const sw = (v, k) => `
    <button class="qswitch" data-k="${k}" aria-pressed="${state.labBits[k] === "1"}" style="--c:${v.kind === "battery" ? "var(--battery)" : color[v.service]}">
      <span class="qs-top"><span class="qs-var">${v.var}</span><span class="toggle"></span></span>
      <span class="qs-name">${v.kind === "battery" ? `Battery ${state.scenario.slots[v.slot].name.toLowerCase()}` : `${v.short} · ${state.scenario.slots[v.slot].name.toLowerCase()}`}</span>
      <span class="qs-meta">${v.kind === "battery" ? "adds 1 block, costs 0.25" : `${v.energy} blocks · worth ${v.benefit}`}</span>
    </button>`;
  $("#switches").innerHTML = `<span class="sw-group-title">Seven service choices</span>`
    + vars.slice(0, 7).map((v, k) => sw(v, k)).join("")
    + `<span class="sw-group-title">Four battery choices</span>`
    + vars.slice(7).map((v, k) => sw(v, k + 7)).join("");
  $$("#switches .qswitch").forEach((b) => b.addEventListener("click", () => {
    const k = Number(b.dataset.k);
    const arr = state.labBits.split("");
    arr[k] = arr[k] === "1" ? "0" : "1";
    setLabBits(arr.join(""), { scroll: false });
  }));
}

function setLabBits(bits, { scroll = false } = {}) {
  state.labBits = bits;
  $$("#switches .qswitch").forEach((b) => b.setAttribute("aria-pressed", String(bits[Number(b.dataset.k)] === "1")));
  evaluateLab();
  if (scroll) $("#lab").scrollIntoView({ behavior: "smooth" });
}

let labToken = 0;
async function evaluateLab() {
  if (!state.fines) return;
  const my = ++labToken;
  let v;
  try { v = await api.evaluate(state.labBits, state.battery, state.penalty); }
  catch (e) { toast(e.message, "bad"); return; }
  if (my !== labToken) return;
  const fired = new Set(v.fines_fired);
  const best = v.best_objective;
  const head = v.is_exact_best
    ? `<span class="tag sun">This is the exact best</span>`
    : v.feasible ? `<span class="tag good">Keeps every rule</span>` : `<span class="tag bad">Breaks ${v.violations.length} rule${v.violations.length > 1 ? "s" : ""}</span>`;
  const msg = v.is_exact_best
    ? "Nothing scores higher. The circuit is rewarded most for exactly this day."
    : v.feasible
      ? `Valid, but ${(best - v.objective).toFixed(2)} below the best objective of ${best}.`
      : "The quantum cost adds the penalty for every fine below, so the optimiser tunes the circuit away from days like this.";
  const list = v.violations.length
    ? v.violations.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
    : `<li class="ok">Every rule holds. ${v.unserved.length ? `${escapeHtml(v.unserved.join(", "))} ${v.unserved.length > 1 ? "wait" : "waits"}.` : "Every service runs."}</li>`;
  $("#verdict").innerHTML = `
    <div class="vd-top"><b>Your day</b>${head}</div>
    <p class="muted small" style="margin:0">${msg}</p>
    <div class="vd-nums">
      <div><span>Benefit</span><b class="num">${v.benefit}</b></div>
      <div><span>Objective</span><b class="num">${v.objective}</b></div>
      <div><span>Quantum cost</span><b class="num">${v.quantum_cost}</b></div>
    </div>
    <ul class="vd-list">${list}</ul>
    <div class="vd-formula">cost = −${v.benefit} + 0.25 × ${v.battery_used} + ${v.penalty} × ${fired.size} fine${fired.size === 1 ? "" : "s"} = ${v.quantum_cost}</div>
    <div class="mini-plan"><div class="slots" id="lab-slots"></div></div>`;
  renderSlots($("#lab-slots"), v, { compact: true });
  $("#lf-note").textContent = fired.size ? `${fired.size} fine${fired.size > 1 ? "s" : ""} fired · each adds ${v.penalty} to the cost` : `No fines fired · each would add ${v.penalty} to the cost`;
  $("#fine-grid").innerHTML = state.fines.fines.map((f) => `
    <div class="fchip${fired.has(f.id) ? " fired" : ""}">
      <span class="fc-code"><span>${escapeHtml(f.code)}</span>${f.order >= 3 ? "<span>3 way</span>" : ""}</span>
      <span class="fc-plain">${escapeHtml(f.plain)}</span>
    </div>`).join("");
}

$("#lab-best").addEventListener("click", () => setLabBits(state.exact.view.bits));
$("#lab-clear").addEventListener("click", () => setLabBits("00000000000"));
$("#lab-random").addEventListener("click", () => setLabBits(Array.from({ length: 11 }, () => (Math.random() < 0.35 ? "1" : "0")).join("")));

/* ---------------------------------------------------------------------------
   Evidence (recorded full run)
--------------------------------------------------------------------------- */

async function evidence() {
  let ev;
  try { ev = await api.evidence(); } catch { $("#evidence .ev-grid").innerHTML = `<p class="muted">Run python run_all.py to record the full study.</p>`; return; }
  const rnd = ev.random_guess;
  groupedBars($("#ev-depth"), {
    groups: ev.depth_study.map((r) => `${r.reps} layer${r.reps > 1 ? "s" : ""}`),
    series: [{ name: "Suhai valid share", color: "var(--green)", values: ev.depth_study.map((r) => r.valid_share) }],
    reference: { value: rnd.valid_share, label: `Random ${fmt.pct(rnd.valid_share)}` },
    height: 200, max: 1,
  });
  const pens = Object.keys(ev.penalty_sensitivity).map(Number).sort((a, b) => a - b);
  const at3 = (p) => ev.penalty_sensitivity[String(p)].find((r) => r.reps === 3) || ev.penalty_sensitivity[String(p)].slice(-1)[0];
  groupedBars($("#ev-penalty"), {
    groups: pens.map((p) => `Penalty ${p}`),
    series: [
      { name: "Valid share", color: "var(--green)", values: pens.map((p) => at3(p).valid_share) },
      { name: "Exact best share", color: "var(--sun)", values: pens.map((p) => at3(p).optimum_share), note: "Bigger fines push the circuit toward doing nothing, which is valid but not best" },
    ],
    height: 200, max: 1,
  });
  dotStrip($("#ev-fcfs"), { rows: state.fcfs?.orders || [], best: state.exact?.benefit || 25, height: 200 });
}

/* ---------------------------------------------------------------------------
   Rail, shortcuts, help
--------------------------------------------------------------------------- */

(() => {
  const links = $$(".top-links a");
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id}`)); });
  }, { rootMargin: "-40% 0px -55% 0px" });
  ["run", "samples", "lab", "evidence"].forEach((id) => spy.observe(document.getElementById(id)));
})();


$("#run-btn").addEventListener("click", startRun);
$("#run-top").addEventListener("click", startRun);
$("#cancel-btn").addEventListener("click", cancelRun);

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "r") { e.preventDefault(); startRun(); }
  else if (k === "escape") cancelRun();
  else if (["1", "2", "3", "4"].includes(k)) setSlot(Number(k) - 1);
  else if (k === "b") { const next = state.battery === 1 ? 2 : 1; batterySeg.set(next); setBattery(next); }
  else if (k === "e" && !state.running) { state.encoding = state.encoding === "compact" ? "slack" : "compact"; encSeg.set(state.encoding); guardStandard(); estimate(); }
});

/* ---------------------------------------------------------------------------
   Boot
--------------------------------------------------------------------------- */

let touched = false;
["pointerdown", "keydown", "wheel"].forEach((ev) => window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));

(async () => {
  const ready = await checkEngine();
  estimate();
  if (!state.msPerEval) setTimeout(async () => { await checkEngine(); estimate(); }, 4000);
  try {
    await loadBase();
  } catch (e) {
    toast("Could not load the scenario from the server.", "bad");
    console.error(e);
    return;
  }
  initKpis();
  evidence();
  refreshMotion(document);
  if (!ready) { $("#run-btn").disabled = true; $("#run-top").disabled = true; }
  // Stage helper: /app?autorun starts a run as soon as the page is ready.
  if (ready && new URLSearchParams(location.search).has("autorun")) { touched = true; setTimeout(startRun, 400); return; }
  // Gentle tour of the day while the page settles.
  [0, 1, 2, 3, 1].forEach((t, i) => setTimeout(() => { if (!state.running && !touched) setSlot(t); }, 600 + i * 1500));
})();

