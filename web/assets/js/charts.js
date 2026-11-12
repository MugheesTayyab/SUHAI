// Small, hand written charts. Thin marks, quiet axes, a hover layer on every one.

import { tip } from "./motion.js";

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => {
    // CSS variables only work as style, never as SVG presentation attributes.
    if ((k === "fill" || k === "stroke") && String(v).includes("var(")) node.style[k] = v;
    else node.setAttribute(k, v);
  });
  if (parent) parent.append(node);
  return node;
};

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || step0;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function frame(container, height, pad) {
  container.innerHTML = "";
  const width = Math.max(260, container.clientWidth);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, class: "chart" }, container);
  return { svg, width, height, x0: pad.l, x1: width - pad.r, y0: height - pad.b, y1: pad.t };
}

/* ---------------------------------------------------------------------------
   Live optimiser trace. Thin raw line plus a bold best so far line.
--------------------------------------------------------------------------- */

export function liveTrace(container, { height = 230 } = {}) {
  const pad = { l: 46, r: 16, t: 14, b: 28 };
  let points = [];
  let layerMarks = [];
  let f, rawPath, bestPath, grid, dotEl, hoverLine, hoverDot, emptyText;
  let pending = false;

  function build() {
    f = frame(container, height, pad);
    grid = el("g", { class: "grid" }, f.svg);
    rawPath = el("path", { class: "raw", fill: "none" }, f.svg);
    bestPath = el("path", { class: "best", fill: "none" }, f.svg);
    dotEl = el("circle", { r: 5, class: "head", opacity: 0 }, f.svg);
    hoverLine = el("line", { class: "hover-line", y1: f.y1, y2: f.y0, opacity: 0 }, f.svg);
    hoverDot = el("circle", { r: 5, class: "hover-dot", opacity: 0 }, f.svg);
    emptyText = el("text", { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, class: "empty", "text-anchor": "middle" }, f.svg);
    emptyText.textContent = "Press Run and watch the optimiser search for better angles";
    const hit = el("rect", { x: f.x0, y: f.y1, width: f.x1 - f.x0, height: f.y0 - f.y1, fill: "transparent" }, f.svg);
    hit.addEventListener("pointermove", hover);
    hit.addEventListener("pointerleave", () => { tip.hide(); hoverLine.setAttribute("opacity", 0); hoverDot.setAttribute("opacity", 0); });
    draw();
  }

  function scales() {
    const n = Math.max(points.length, 20);
    let lo = Infinity, hi = -Infinity;
    points.forEach((p) => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
    if (!points.length) { lo = -4; hi = 2; }
    const padY = (hi - lo) * 0.08 || 0.5;
    lo -= padY; hi += padY;
    return {
      n, lo, hi,
      x: (i) => f.x0 + (i / (n - 1)) * (f.x1 - f.x0),
      y: (v) => f.y0 - ((v - lo) / (hi - lo)) * (f.y0 - f.y1),
    };
  }

  function draw() {
    pending = false;
    if (!f) return;
    const s = scales();
    grid.innerHTML = "";
    niceTicks(s.lo, s.hi, 4).forEach((v) => {
      el("line", { x1: f.x0, x2: f.x1, y1: s.y(v), y2: s.y(v) }, grid);
      el("text", { x: f.x0 - 8, y: s.y(v) + 4, "text-anchor": "end" }, grid).textContent = v.toFixed(1);
    });
    el("text", { x: f.x0, y: f.y0 + 20, class: "axis-title" }, grid).textContent = "Circuit evaluations";
    el("text", { x: f.x1, y: f.y0 + 20, "text-anchor": "end", class: "axis-title" }, grid).textContent = `${points.length.toLocaleString()} so far`;
    layerMarks.forEach((m) => {
      const x = s.x(m.index);
      el("line", { x1: x, x2: x, y1: f.y1, y2: f.y0, class: "layer-mark" }, grid);
      el("text", { x: x + 6, y: f.y1 + 12, class: "layer-text" }, grid).textContent = `${m.reps} layer${m.reps > 1 ? "s" : ""}`;
    });
    emptyText.style.display = points.length ? "none" : "";
    if (!points.length) { rawPath.setAttribute("d", ""); bestPath.setAttribute("d", ""); dotEl.setAttribute("opacity", 0); return; }
    let raw = "", best = "", bestSoFar = Infinity;
    points.forEach((p, i) => {
      const x = s.x(i).toFixed(1);
      raw += `${i ? "L" : "M"}${x} ${s.y(p.y).toFixed(1)}`;
      bestSoFar = Math.min(bestSoFar, p.y);
      p.best = bestSoFar;
      best += `${i ? "L" : "M"}${x} ${s.y(bestSoFar).toFixed(1)}`;
    });
    rawPath.setAttribute("d", raw);
    bestPath.setAttribute("d", best);
    const last = points[points.length - 1];
    dotEl.setAttribute("cx", s.x(points.length - 1));
    dotEl.setAttribute("cy", s.y(last.best));
    dotEl.setAttribute("opacity", 1);
  }

  function hover(e) {
    if (!points.length) return;
    const r = f.svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * f.width;
    const s = scales();
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - f.x0) / (f.x1 - f.x0)) * (s.n - 1))));
    const p = points[i];
    hoverLine.setAttribute("x1", s.x(i)); hoverLine.setAttribute("x2", s.x(i)); hoverLine.setAttribute("opacity", 1);
    hoverDot.setAttribute("cx", s.x(i)); hoverDot.setAttribute("cy", s.y(p.y)); hoverDot.setAttribute("opacity", 1);
    tip.show(`<b>Evaluation ${i + 1}</b><hr>
      <div class="row"><span class="k">This try</span><span>${p.y.toFixed(3)}</span></div>
      <div class="row"><span class="k">Best so far</span><span>${p.best.toFixed(3)}</span></div>
      <div class="row"><span class="k">Layers</span><span>${p.reps}</span></div>
      <div class="row"><span class="k">Starting point</span><span>${p.start + 1}</span></div>`, e.clientX, e.clientY);
  }

  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(draw); } };
  build();
  new ResizeObserver(() => build()).observe(container);

  return {
    push(p) { points.push(p); schedule(); },
    layer(reps) { layerMarks.push({ reps, index: points.length }); schedule(); },
    reset() { points = []; layerMarks = []; schedule(); },
    get size() { return points.length; },
  };
}

/* ---------------------------------------------------------------------------
   Grouped bars, for valid share by number of layers.
--------------------------------------------------------------------------- */

export function groupedBars(container, { groups, series, reference, height = 240, format = (v) => `${(v * 100).toFixed(1)}%`, max }) {
  const draw = () => {
    const pad = { l: 44, r: reference ? 64 : 12, t: 16, b: 34 };
    const f = frame(container, height, pad);
    const top = max ?? Math.max(...series.flatMap((s) => s.values.filter((v) => v != null)), reference ? reference.value : 0) * 1.15;
    const y = (v) => f.y0 - (v / top) * (f.y0 - f.y1);
    const g = el("g", { class: "grid" }, f.svg);
    niceTicks(0, top, 4).forEach((v) => {
      el("line", { x1: f.x0, x2: f.x1, y1: y(v), y2: y(v) }, g);
      el("text", { x: f.x0 - 8, y: y(v) + 4, "text-anchor": "end" }, g).textContent = format(v).replace(".0%", "%");
    });
    const band = (f.x1 - f.x0) / groups.length;
    const inner = Math.min(46, (band * 0.7) / series.length);
    groups.forEach((label, gi) => {
      const cx = f.x0 + band * (gi + 0.5);
      el("text", { x: cx, y: f.y0 + 22, "text-anchor": "middle", class: "x-label" }, f.svg).textContent = label;
      series.forEach((s, si) => {
        const v = s.values[gi];
        if (v == null) return;
        const x = cx - (series.length * inner) / 2 + si * inner + 1;
        const h = f.y0 - y(v);
        const bar = el("rect", { x, y: f.y0 - h, width: inner - 2, height: Math.max(0, h), rx: 4, fill: s.color, class: "bar grow" }, f.svg);
        bar.style.animationDelay = `${gi * 90 + si * 60}ms`;
        if (h > 22) {
          const t = el("text", { x: x + (inner - 2) / 2, y: f.y0 - h - 7, "text-anchor": "middle", class: "bar-value" }, f.svg);
          t.textContent = format(v);
        }
        const hit = el("rect", { x: x - 2, y: f.y1, width: inner + 2, height: f.y0 - f.y1, fill: "transparent" }, f.svg);
        hit.addEventListener("pointermove", (e) => tip.show(`<b>${s.name}</b><hr><div class="row"><span class="k">${label}</span><span>${format(v)}</span></div>${s.note ? `<div class="k" style="margin-top:6px">${s.note}</div>` : ""}`, e.clientX, e.clientY));
        hit.addEventListener("pointerleave", () => tip.hide());
      });
    });
    if (reference) {
      const ry = y(reference.value);
      el("line", { x1: f.x0, x2: f.x1, y1: ry, y2: ry, class: "ref-line" }, f.svg);
      // The label lives in the right margin so it never sits on a bar.
      const words = reference.label.split(" ");
      const t = el("text", { x: f.x1 + 6, y: ry - (words.length > 2 ? 4 : -4), class: "ref-text" }, f.svg);
      const mid = Math.ceil(words.length / 2);
      [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean).forEach((line, i) => {
        el("tspan", { x: f.x1 + 6, dy: i ? 13 : 0 }, t).textContent = line;
      });
    }
  };
  draw();
  new ResizeObserver(draw).observe(container);
}

/* ---------------------------------------------------------------------------
   Dot strip, for first come first served over all 24 arrival orders.
--------------------------------------------------------------------------- */

export function dotStrip(container, { rows, best, height = 170, color = "var(--slate)" }) {
  const draw = () => {
    const pad = { l: 16, r: 16, t: 18, b: 34 };
    const f = frame(container, height, pad);
    const lo = 5, hi = 30;
    const x = (v) => f.x0 + ((v - lo) / (hi - lo)) * (f.x1 - f.x0);
    const g = el("g", { class: "grid" }, f.svg);
    [5, 10, 15, 20, 25, 30].forEach((v) => {
      el("line", { x1: x(v), x2: x(v), y1: f.y1, y2: f.y0 }, g);
      el("text", { x: x(v), y: f.y0 + 20, "text-anchor": "middle" }, g).textContent = v;
    });
    const bx = x(best);
    el("line", { x1: bx, x2: bx, y1: f.y1 - 6, y2: f.y0, class: "best-line" }, f.svg);
    el("text", { x: bx - 6, y: f.y1 + 4, "text-anchor": "end", class: "ref-text strong" }, f.svg).textContent = `Exact best ${best}`;
    const stacks = {};
    rows.forEach((r, k) => {
      const level = (stacks[r.benefit] = (stacks[r.benefit] || 0) + 1) - 1;
      const cy = f.y0 - 12 - level * 15;
      const c = el("circle", { cx: x(r.benefit), cy, r: 6, fill: r.benefit === best ? "var(--green)" : color, stroke: "var(--paper)", "stroke-width": 2, class: "dot pop" }, f.svg);
      c.style.animationDelay = `${k * 30}ms`;
      const hit = el("circle", { cx: x(r.benefit), cy, r: 10, fill: "transparent" }, f.svg);
      hit.addEventListener("pointermove", (e) => tip.show(`<b>Benefit ${r.benefit}</b><hr><div class="k">Arrival order</div>${r.order.map((n, i) => `${i + 1}. ${n}`).join("<br>")}`, e.clientX, e.clientY));
      hit.addEventListener("pointerleave", () => tip.hide());
    });
  };
  draw();
  new ResizeObserver(draw).observe(container);
}

/* ---------------------------------------------------------------------------
   Benefit histogram of the valid samples from a live run.
--------------------------------------------------------------------------- */

export function histogram(container, { rows, invalid, shots, best, height = 150 }) {
  const pad = { l: 12, r: 12, t: 12, b: 26 };
  const f = frame(container, height, pad);
  // Valid days get their own scale. The invalid share would flatten everything else.
  const all = rows.length ? rows : [{ benefit: 0, shots: 0 }];
  const top = Math.max(...all.map((r) => r.shots), 1);
  const head = container.previousElementSibling;
  if (head && head.classList.contains("hist-head")) {
    head.innerHTML = `<span><b>${((1 - invalid / shots) * 100).toFixed(1)}%</b> of samples kept every rule. Their benefit spread is below.</span><span class="bad-share">${((invalid / shots) * 100).toFixed(1)}% broke a rule</span>`;
  }
  const band = (f.x1 - f.x0) / all.length;
  all.forEach((r, i) => {
    const h = (r.shots / top) * (f.y0 - f.y1);
    const x = f.x0 + i * band + 1;
    const fill = r.benefit === best ? "var(--green)" : "#9fc96a";
    const bar = el("rect", { x, y: f.y0 - h, width: Math.max(2, band - 2), height: Math.max(0, h), rx: 3, fill, class: "grow" }, f.svg);
    bar.style.animationDelay = `${i * 25}ms`;
    if (r.benefit === best || i === 0 || i === all.length - 1 || i % 4 === 0) {
      el("text", { x: x + band / 2 - 1, y: f.y0 + 17, "text-anchor": "middle", class: "x-label small" }, f.svg).textContent = r.benefit;
    }
    const hit = el("rect", { x, y: f.y1, width: band, height: f.y0 - f.y1, fill: "transparent" }, f.svg);
    hit.addEventListener("pointermove", (e) => tip.show(`<b>Benefit ${r.benefit}${r.benefit === best ? ", the exact best" : ""}</b><hr><div class="row"><span class="k">Samples</span><span>${r.shots.toLocaleString()}</span></div><div class="row"><span class="k">Share</span><span>${((r.shots / shots) * 100).toFixed(2)}%</span></div>`, e.clientX, e.clientY));
    hit.addEventListener("pointerleave", () => tip.hide());
  });
}

/* ---------------------------------------------------------------------------
   All 2,048 schedules as a grid on canvas. Optional sample density overlay.
   Drawn once. A hover repaints only the two cells that changed, so it costs
   nothing while idle.
--------------------------------------------------------------------------- */

export function scheduleGrid(canvas, { landscape, cols = 64, density = null, onHover, onClick }) {
  const ctx = canvas.getContext("2d");
  const n = landscape.feasible.length;
  const rows = Math.ceil(n / cols);
  const maxDensity = density ? Math.max(...density) : 0;
  let size = 10, gap = 2, hovered = -1, alive = true;

  function layout() {
    const w = canvas.parentElement.clientWidth;
    size = Math.max(4, Math.floor((w - (cols - 1) * 2) / cols));
    gap = size > 7 ? 2 : 1;
    const cw = cols * size + (cols - 1) * gap;
    const ch = rows * size + (rows - 1) * gap;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function colour(k) {
    if (k === landscape.exact_index) return "#f2b33d";
    if (density) {
      const d = density[k];
      if (!d) return landscape.feasible[k] ? "rgba(47,107,60,0.14)" : "rgba(17,19,17,0.05)";
      const a = 0.3 + 0.7 * Math.sqrt(d / maxDensity);
      return landscape.feasible[k] ? `rgba(79,154,46,${a.toFixed(3)})` : `rgba(196,85,63,${a.toFixed(3)})`;
    }
    return landscape.feasible[k] ? "#8fc354" : "rgba(17,19,17,0.07)";
  }

  function cell(k) {
    const x = (k % cols) * (size + gap), y = Math.floor(k / cols) * (size + gap);
    ctx.clearRect(x - 1, y - 1, size + 2, size + 2);
    ctx.fillStyle = colour(k);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, size, size, Math.min(2, size / 4)); else ctx.rect(x, y, size, size);
    ctx.fill();
    if (k === hovered) {
      ctx.strokeStyle = "#111311"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
    }
  }

  function drawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let k = 0; k < n; k++) cell(k);
  }

  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / (size + gap));
    const row = Math.floor((e.clientY - r.top) / (size + gap));
    if (c < 0 || c >= cols || row < 0 || row >= rows) return -1;
    const k = row * cols + c;
    return k < n ? k : -1;
  }

  const onMove = (e) => {
    const k = cellAt(e);
    if (k !== hovered) {
      const old = hovered; hovered = k;
      if (old >= 0) cell(old);
      if (k >= 0) { cell(k); onHover && onHover(k, e); }
    }
    if (k < 0) tip.hide(); else tip.move(e.clientX, e.clientY);
  };
  const onLeave = () => { const old = hovered; hovered = -1; if (old >= 0) cell(old); tip.hide(); };
  const onTap = (e) => { const k = cellAt(e); if (k >= 0 && onClick) onClick(k); };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onTap);

  let pending = false;
  const ro = new ResizeObserver(() => {
    if (pending || !alive) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; layout(); drawAll(); });
  });
  layout(); drawAll();
  ro.observe(canvas.parentElement);

  return {
    stop() {
      alive = false; ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onTap);
    },
  };
}

export const bitsOf = (k, n = 11) => Array.from({ length: n }, (_, i) => (k >> i) & 1).join("");
