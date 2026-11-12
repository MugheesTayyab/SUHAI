// The qubit register, Suhai's signature picture. One circle per yes or no decision.
// Before measurement every circle breathes between empty and full, because the circuit holds
// all 2,048 days at once. Measurement collapses each one to on or off, left to right.
// Only transform and opacity move, so it stays smooth on any laptop.

import { SERVICE } from "./ui.js?v=20261112c";

const SHORT = { m: "Milk", i: "Irrigation", w: "Water", h: "Homes" };

export function createRegister(el, scn, { labels = true } = {}) {
  const vars = scn.variables;
  const colour = (v) => (v.kind === "battery" ? "var(--battery)" : SERVICE[v.service].color);
  const qubit = (v, k) => `
    <span class="qubit" data-k="${k}" style="--c:${colour(v)};--d:${(k * 0.37) % 1.3}s" title="${v.label}">
      <i class="q-ring"></i><i class="q-core"></i>
    </span>${labels ? `<span class="q-name">${v.kind === "battery" ? "Battery" : SHORT[v.service]}</span>` : ""}`;

  if (labels) {
    el.innerHTML = scn.slots.map((s) => {
      const mine = vars.map((v, k) => [v, k]).filter(([v]) => v.slot === s.index);
      return `<div class="q-group">
        <div class="q-slot"><b>${s.name}</b><span class="q-sun">${s.solar_blocks ? "<i></i>".repeat(s.solar_blocks) : "no sun"}</span></div>
        <div class="q-cells">${mine.map(([v, k]) => `<span class="q-cell">${qubit(v, k)}</span>`).join("")}</div>
      </div>`;
    }).join("");
  } else {
    el.innerHTML = vars.map((v, k) => qubit(v, k)).join("");
  }
  el.classList.add("register", "superpose", labels ? "labelled" : "mini");
  const cells = [...el.querySelectorAll(".qubit")].sort((a, b) => a.dataset.k - b.dataset.k);
  let timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  return {
    // Every day at once. `fast` while the optimiser is working.
    superpose(fast = false) {
      clear();
      el.classList.remove("measured");
      el.classList.add("superpose");
      el.classList.toggle("learning", fast);
      cells.forEach((c) => c.classList.remove("one", "zero"));
    },
    // Collapse to one day, qubit by qubit in the visual order on screen.
    collapse(bits, { step = 85 } = {}) {
      clear();
      el.classList.remove("learning");
      const order = [...el.querySelectorAll(".qubit")];
      return new Promise((done) => {
        order.forEach((c, i) => timers.push(setTimeout(() => {
          c.classList.remove("one", "zero");
          void c.offsetWidth;
          c.classList.add(bits[Number(c.dataset.k)] === "1" ? "one" : "zero");
          if (i === order.length - 1) {
            el.classList.remove("superpose");
            el.classList.add("measured");
            done();
          }
        }, i * step)));
      });
    },
  };
}
