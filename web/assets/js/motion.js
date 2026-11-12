// Motion, kept small on purpose. Short fades, no cursor effects, nothing that runs forever.

export const shot = new URLSearchParams(location.search).has("shot");
if (shot) document.documentElement.classList.add("shot");
export const reduced = shot || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Numbers count up once, when first seen ---------- */

export function countTo(el, target, { duration = 900, decimals, suffix = "", prefix = "" } = {}) {
  const d = decimals ?? (String(target).split(".")[1] || "").length;
  const fmt = (v) => prefix + v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + suffix;
  if (reduced) { el.textContent = fmt(Number(target)); return; }
  const from = Number(el.dataset.from || 0);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = fmt(from + (target - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Reveal on scroll, with a safety net so nothing stays hidden ---------- */

function show(el) {
  if (el.classList.contains("in")) return;
  el.classList.add("in");
  if (el.dataset.count != null) {
    countTo(el, Number(el.dataset.count), {
      suffix: el.dataset.suffix || "", prefix: el.dataset.prefix || "",
      decimals: el.dataset.decimals != null ? Number(el.dataset.decimals) : undefined,
    });
  }
  el.dispatchEvent(new CustomEvent("reveal"));
  if (io) io.unobserve(el);
}

const io = "IntersectionObserver" in window && !shot
  ? new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && show(e.target)), { rootMargin: "0px 0px -8% 0px" })
  : null;

let queued = false;
function sweep() {
  queued = false;
  const h = window.innerHeight;
  document.querySelectorAll("[data-reveal]:not(.in), [data-count]:not(.in), [data-watch]:not(.in)").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (shot || (r.bottom > 0 && r.top < h)) show(el);
  });
}
const scheduleSweep = () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } };
window.addEventListener("load", scheduleSweep);
[400, 1500].forEach((t) => setTimeout(scheduleSweep, t));

export function reveal(root = document) {
  root.querySelectorAll("[data-reveal], [data-count], [data-watch]").forEach((el) => { if (io) io.observe(el); else show(el); });
  scheduleSweep();
}

/* ---------- Segmented controls ---------- */

export function segmented(el, onChange) {
  const buttons = [...el.querySelectorAll("button")];
  let thumb = el.querySelector(".thumb");
  if (!thumb) { thumb = document.createElement("span"); thumb.className = "thumb"; el.prepend(thumb); }
  const place = () => {
    const on = buttons.find((b) => b.getAttribute("aria-pressed") === "true") || buttons[0];
    thumb.style.left = `${on.offsetLeft}px`;
    thumb.style.width = `${on.offsetWidth}px`;
  };
  buttons.forEach((b) => b.addEventListener("click", () => {
    if (b.disabled) return;
    buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    place();
    onChange && onChange(b.dataset.value, b);
  }));
  new ResizeObserver(place).observe(el);
  requestAnimationFrame(place);
  return {
    set(value) { buttons.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.value === String(value)))); place(); },
    get() { return (buttons.find((b) => b.getAttribute("aria-pressed") === "true") || buttons[0]).dataset.value; },
    place,
  };
}

/* ---------- Tooltip ---------- */

let tipEl;
export const tip = {
  show(html, x, y) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "tooltip"); document.body.append(tipEl); }
    tipEl.innerHTML = html;
    tipEl.classList.add("on");
    tip.move(x, y);
  },
  move(x, y) {
    if (!tipEl) return;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 10) left = x - w - 14;
    if (top + h > window.innerHeight - 10) top = y - h - 14;
    tipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  },
  hide() { tipEl && tipEl.classList.remove("on"); },
};

/* ---------- Toast ---------- */

export function toast(message, kind = "") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.append(box); }
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = message;
  box.append(t);
  setTimeout(() => t.remove(), 4200);
}

export function initMotion() { reveal(); }
export function refreshMotion(root) { reveal(root); }
