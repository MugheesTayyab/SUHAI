// The village, drawn by hand in SVG. It lives through one day and lights up only what the schedule powers.

import { reduced } from "./motion.js";

const SKY = [
  // phase, top, middle, horizon
  [0.0, "#f3d4b9", "#fae3c9", "#fff0d8"],
  [0.22, "#cfe2ee", "#ebf1e4", "#fff3d6"],
  [0.5, "#bfdcef", "#e4f0f1", "#f8f6e4"],
  [0.74, "#e6d6b6", "#f7e2bd", "#ffebc9"],
  [1.0, "#bdb6d8", "#e6cad0", "#f7dac5"],
];

// Where the sun sits for each named slot of the day.
export const SLOT_PHASE = [0.2, 0.5, 0.74, 0.97];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
};
const smooth = (t) => t * t * (3 - 2 * t);

function skyAt(p) {
  for (let k = 0; k < SKY.length - 1; k++) {
    const [p0, ...c0] = SKY[k];
    const [p1, ...c1] = SKY[k + 1];
    if (p >= p0 && p <= p1) {
      const t = smooth((p - p0) / (p1 - p0));
      return c0.map((c, i) => mix(c, c1[i], t));
    }
  }
  return SKY[SKY.length - 1].slice(1);
}

const panel = (x, y, w = 64, h = 32, skew = 14) => `
  <g transform="translate(${x} ${y})">
    <polygon points="0,${h} ${w},${h} ${w + skew},0 ${skew},0" fill="url(#ss-panel)" stroke="#e8eef8" stroke-width="1.6"/>
    <path d="M${w / 3} ${h} L${w / 3 + skew} 0 M${(2 * w) / 3} ${h} L${(2 * w) / 3 + skew} 0 M${skew / 2} ${h / 2} L${w + skew / 2} ${h / 2}" stroke="rgba(232,238,248,.55)" stroke-width="1"/>
    <path d="M${w / 2} ${h} L${w / 2 + 2} ${h + 16}" stroke="#7d8a82" stroke-width="3" stroke-linecap="round"/>
  </g>`;

const house = (x, y, s = 1, id = "") => `
  <g transform="translate(${x} ${y}) scale(${s})" class="ss-house">
    <path d="M0 28 L24 6 L48 28 Z" fill="#c9785a"/>
    <rect x="5" y="27" width="38" height="28" rx="2" fill="#f6efe4"/>
    <rect class="ss-win ${id}" x="11" y="34" width="9" height="9" rx="1.5" fill="#cfd8d2"/>
    <rect class="ss-win ${id}" x="28" y="34" width="9" height="9" rx="1.5" fill="#cfd8d2"/>
    <rect x="20" y="44" width="8" height="11" rx="1" fill="#8a6d58"/>
  </g>`;

const label = (id, x, y, text, color, k = 1) => `
  <g class="ss-label" id="${id}" transform="translate(${x} ${y}) scale(${k})">
    <rect x="${-text.length * 3.6 - 22}" y="-15" width="${text.length * 7.2 + 44}" height="30" rx="15" fill="rgba(255,255,255,.9)" stroke="rgba(255,255,255,1)"/>
    <circle cx="${-text.length * 3.6 - 8}" cy="0" r="4.5" fill="${color}"/>
    <text x="${4}" y="4.5" text-anchor="middle" font-size="13" font-weight="600" fill="#121c16">${text}</text>
  </g>`;

function markup(mode) {
  return fixVars(rawMarkup(mode));
}

const fixVars = (html) => html.replace(/(fill|stroke)="(var\([^"]+\))"/g, 'style="$1:$2"');

function rawMarkup(mode) {
  const viewBox = mode === "board" ? "740 420 860 365" : "0 0 1600 900";
  const k = mode === "board" ? 0.72 : 1;
  return `
<svg class="ss-scene" viewBox="${viewBox}" preserveAspectRatio="${mode === "board" ? "xMidYMax" : "xMidYMid"} slice" role="img"
     aria-label="A village with solar panels, a battery, a clinic, a milk chiller, a water purifier, homes and a field">
  <defs>
    <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfdcef"/><stop offset=".55" stop-color="#e4f0f1"/><stop offset="1" stop-color="#f8f6e4"/>
    </linearGradient>
    <radialGradient id="ss-glow"><stop offset="0" stop-color="#fff3c8" stop-opacity="1"/><stop offset=".22" stop-color="#ffd978" stop-opacity=".75"/><stop offset=".5" stop-color="#ffcf6a" stop-opacity=".28"/><stop offset="1" stop-color="#ffcf6a" stop-opacity="0"/></radialGradient>
    <radialGradient id="ss-core"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#fff4cf"/><stop offset="1" stop-color="#ffd36a"/></radialGradient>
    <linearGradient id="ss-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbdcb4"/><stop offset="1" stop-color="#e2ead3"/></linearGradient>
    <linearGradient id="ss-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3d083"/><stop offset="1" stop-color="#94bd62"/></linearGradient>
    <linearGradient id="ss-near" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9d160"/><stop offset=".6" stop-color="#83b445"/><stop offset="1" stop-color="#5f8f2f"/></linearGradient>
    <linearGradient id="ss-panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f5f9a"/><stop offset=".55" stop-color="#24406f"/><stop offset="1" stop-color="#1b2f52"/></linearGradient>
    <linearGradient id="ss-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <pattern id="ss-rows" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
      <rect width="26" height="26" fill="transparent"/><rect width="26" height="3" y="11" fill="rgba(40,80,20,.16)"/>
    </pattern>
    <filter id="ss-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <clipPath id="ss-array-clip"><rect x="870" y="548" width="260" height="96"/></clipPath>
  </defs>

  <rect class="ss-sky" x="0" y="0" width="1600" height="900" fill="url(#ss-sky)"/>
  <g class="ss-stars" opacity="0">
    ${[[220, 90], [430, 160], [640, 70], [980, 120], [1180, 60], [1380, 150], [1500, 80], [820, 200]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff"/>`).join("")}
  </g>

  <g data-depth="0.15"><g class="ss-sun">
    <circle class="ss-sun-glow" r="300" fill="url(#ss-glow)"/>
    <g class="ss-rays">${Array.from({ length: 12 }, (_, i) => `<rect x="-1.5" y="-130" width="3" height="46" rx="1.5" fill="#fff3c4" opacity=".55" transform="rotate(${i * 30})"/>`).join("")}</g>
    <circle r="58" fill="url(#ss-core)"/>
    <circle r="54" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
  </g></g>

  <g class="ss-clouds" data-depth="0.25">
    <g class="ss-cloud c1"><ellipse cx="260" cy="190" rx="90" ry="26" fill="#fff" opacity=".75"/><ellipse cx="300" cy="172" rx="56" ry="30" fill="#fff" opacity=".8"/></g>
    <g class="ss-cloud c2"><ellipse cx="1080" cy="140" rx="120" ry="28" fill="#fff" opacity=".6"/><ellipse cx="1040" cy="122" rx="62" ry="30" fill="#fff" opacity=".7"/></g>
    <g class="ss-cloud c3"><ellipse cx="1420" cy="260" rx="80" ry="20" fill="#fff" opacity=".55"/></g>
  </g>

  <g data-depth="0.35"><path d="M0 600 C 180 520, 360 540, 520 560 S 860 500, 1040 540 S 1380 520, 1600 548 L1600 900 L0 900 Z" fill="url(#ss-far)"/></g>

  <g data-depth="0.55">
    <path d="M0 655 C 260 610, 520 618, 780 640 S 1260 612, 1600 628 L1600 900 L0 900 Z" fill="url(#ss-mid)"/>

    <!-- energy flow lines, drawn under the buildings -->
    <g class="ss-flows" fill="none" stroke-width="3.2" stroke-linecap="round">
      <path class="ss-flow f-clinic" d="M1000 600 Q 1110 540 1218 596" stroke="#8fd14f"/>
      <path class="ss-flow f-m" d="M1000 600 Q 1160 520 1312 604" style="stroke:var(--milk)"/>
      <path class="ss-flow f-w" d="M1000 600 Q 1200 500 1396 590" style="stroke:var(--water)"/>
      <path class="ss-flow f-h" d="M1000 600 Q 1260 500 1500 612" style="stroke:var(--home)"/>
      <path class="ss-flow f-i" d="M1000 640 Q 1160 690 1310 742" style="stroke:var(--irr)"/>
      <path class="ss-flow f-bat" d="M1142 598 Q 1150 560 1160 560" style="stroke:var(--battery)" stroke-dasharray="2 7"/>
    </g>

    <!-- solar array -->
    <g class="ss-array">
      ${panel(884, 556, 60, 28)}${panel(952, 556, 60, 28)}${panel(1020, 556, 60, 28)}
      ${panel(876, 590, 66, 32)}${panel(948, 590, 66, 32)}${panel(1020, 590, 66, 32)}
      <g clip-path="url(#ss-array-clip)"><rect class="ss-shine" x="840" y="540" width="70" height="110" fill="url(#ss-shine)" transform="skewX(-20)"/></g>
    </g>

    <!-- battery -->
    <g class="ss-battery" transform="translate(1124 572)">
      <rect x="0" y="0" width="36" height="56" rx="7" fill="#26332b"/>
      <rect x="12" y="-5" width="12" height="6" rx="2" fill="#26332b"/>
      <rect class="ss-bat-level" x="6" y="8" width="24" height="40" rx="3" fill="#b9e34f"/>
      <path d="M20 16 L13 30 H19 L16 42 L24 26 H18 Z" fill="#26332b" opacity=".75"/>
    </g>

    <!-- clinic, always powered -->
    <g class="ss-clinic" transform="translate(1176 560)">
      <rect x="0" y="22" width="84" height="50" rx="3" fill="#fbfbf7"/>
      <path d="M-6 24 L42 0 L90 24 Z" fill="#dfe6dd"/>
      <rect x="34" y="34" width="16" height="16" rx="2" fill="#fff"/>
      <path d="M42 36 V48 M36 42 H48" stroke="#2e6b3c" stroke-width="4" stroke-linecap="round"/>
      <rect x="10" y="52" width="14" height="20" rx="1" fill="#b7c4bb"/>
      <circle class="ss-clinic-pulse" cx="72" cy="34" r="4" fill="#5ec33a"/>
    </g>

    <!-- milk chiller -->
    <g class="ss-chiller" transform="translate(1282 578)">
      <rect x="0" y="10" width="64" height="46" rx="4" fill="#f3f7fb"/>
      <rect x="-4" y="4" width="72" height="10" rx="3" fill="#5f8fcb"/>
      <g transform="translate(32 33)"><g class="ss-frost" stroke="#2a78d6" stroke-width="2.4" stroke-linecap="round">
        <path d="M0 -11 V11 M-9.5 -5.5 L9.5 5.5 M-9.5 5.5 L9.5 -5.5"/>
      </g></g>
    </g>

    <!-- water purifier -->
    <g class="ss-tank" transform="translate(1368 548)">
      <path d="M6 72 L10 40 M46 72 L42 40" stroke="#7d8a82" stroke-width="3"/>
      <rect x="2" y="6" width="48" height="38" rx="10" fill="#efe3ec"/>
      <ellipse cx="26" cy="8" rx="24" ry="7" fill="#e3cfdd"/>
      <path d="M26 16 C 20 24, 18 28, 18 31 a8 8 0 0 0 16 0 c0 -3 -2 -7 -8 -15 Z" fill="#b5509a"/>
      <g class="ss-drops">
        <circle cx="20" cy="60" r="2.4" fill="#b5509a"/><circle cx="30" cy="66" r="2" fill="#b5509a"/>
      </g>
    </g>

    <!-- homes -->
    ${house(1440, 580, 1, "h")}${house(1494, 590, 0.86, "h")}${house(1540, 576, 1, "h")}
  </g>

  <g data-depth="0.8">
    <path d="M0 760 C 260 716, 520 690, 820 712 S 1300 792, 1600 742 L1600 900 L0 900 Z" fill="url(#ss-near)"/>
    <path d="M0 760 C 260 716, 520 690, 820 712 S 1300 792, 1600 742 L1600 900 L0 900 Z" fill="url(#ss-rows)"/>
    <!-- irrigation sprinklers -->
    <g class="ss-sprinklers">
      ${[[1190, 772], [1310, 784], [1430, 772]].map(([x, y]) => `
        <g transform="translate(${x} ${y})">
          <path d="M0 0 V-12" stroke="#5a6b5f" stroke-width="3" stroke-linecap="round"/>
          <g class="ss-spray" fill="none" stroke="#7fc7e8" stroke-width="2.2" stroke-linecap="round">
            <path d="M0 -12 Q -26 -40 -48 -6"/><path d="M0 -12 Q 26 -40 48 -6"/><path d="M0 -12 Q -12 -46 -26 -10" opacity=".7"/><path d="M0 -12 Q 12 -46 26 -10" opacity=".7"/>
          </g>
        </g>`).join("")}
    </g>
  </g>

  <g class="ss-labels">
    ${label("ss-l-clinic", 1218, 528, "Clinic fridge", "#5ec33a", k)}
    ${label("ss-l-m", 1314, 556, "Milk chiller", "var(--milk)", k)}
    ${label("ss-l-w", 1394, 524, "Water purifier", "var(--water)", k)}
    ${label("ss-l-h", 1500, 556, "Homes", "var(--home)", k)}
    ${label("ss-l-i", 1310, 712, "Irrigation", "var(--irr)", k)}
    ${label("ss-l-bat", 1142, 540, "Battery", "var(--battery)", k)}
  </g>
</svg>`;
}

export function createScene(container, { mode = "hero" } = {}) {
  container.insertAdjacentHTML("afterbegin", markup(mode));
  const svg = container.querySelector(".ss-scene");
  svg.classList.add(`mode-${mode}`);
  const stops = svg.querySelectorAll("#ss-sky stop");
  const sun = svg.querySelector(".ss-sun");
  const glow = svg.querySelector(".ss-sun-glow");
  const stars = svg.querySelector(".ss-stars");
  const layers = [...svg.querySelectorAll("[data-depth]")];
  const batLevel = svg.querySelector(".ss-bat-level");
  let phase = 0.5;
  let raf = null;

  function setPhase(p) {
    phase = Math.max(0, Math.min(1, p));
    const [top, middle, horizon] = skyAt(phase);
    stops[0].setAttribute("stop-color", top);
    stops[1].setAttribute("stop-color", middle);
    stops[2].setAttribute("stop-color", horizon);
    // The sun rides an arc from the left hills, over the top, and sets behind the right hills.
    const angle = Math.PI * (1 - phase);
    const x = 800 + Math.cos(angle) * 720;
    const y = 640 - Math.sin(angle) * 500;
    sun.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    const height = Math.sin(angle);
    glow.setAttribute("opacity", (0.35 + 0.65 * height).toFixed(2));
    sun.style.opacity = phase > 0.93 ? String(Math.max(0, 1 - (phase - 0.93) / 0.07)) : "1";
    stars.setAttribute("opacity", phase > 0.88 ? ((phase - 0.88) / 0.12 * 0.8).toFixed(2) : "0");
    svg.style.setProperty("--daylight", height.toFixed(2));
    svg.classList.toggle("is-dusk", phase > 0.9);
  }

  function setActive(state = {}) {
    // state: { m, i, w, h, battery, batteryLevel (0..1), labels }
    ["m", "i", "w", "h"].forEach((k) => svg.classList.toggle(`on-${k}`, !!state[k]));
    svg.classList.toggle("on-bat", !!state.battery);
    svg.classList.toggle("show-labels", state.labels !== false);
    if (state.batteryLevel != null) {
      const h = 40 * Math.max(0.04, state.batteryLevel);
      batLevel.setAttribute("height", h.toFixed(1));
      batLevel.setAttribute("y", (48 - h).toFixed(1));
      batLevel.setAttribute("fill", state.batteryLevel > 0.2 ? "#b9e34f" : "#f2b33d");
    }
  }

  function animateTo(target, duration = 1600) {
    cancelAnimationFrame(raf);
    if (reduced) { setPhase(target); return; }
    const from = phase;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setPhase(from + (target - from) * e);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function parallax() {
    return;
    layers.forEach((g) => {
      const d = Number(g.dataset.depth);
      g.style.transform = `translate(${(nx * d * 26).toFixed(2)}px, ${(ny * d * 12).toFixed(2)}px)`;
    });
  }

  setPhase(phase);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => svg.classList.toggle("is-paused", !e.isIntersecting)).observe(svg);
  }
  return { svg, setPhase, setActive, animateTo, parallax, get phase() { return phase; } };
}

// Turn a schedule view from the API into what the scene should light up for one slot.
export function slotState(view, slot, batteryBlocks = 1) {
  const s = view.slots[slot];
  const keys = new Set(s.services.map((x) => x.key));
  const usedBefore = view.slots.slice(0, slot + 1).filter((x) => x.battery).length;
  return {
    m: keys.has("m"), i: keys.has("i"), w: keys.has("w"), h: keys.has("h"),
    battery: s.battery,
    batteryLevel: 1 - usedBefore / batteryBlocks,
  };
}
