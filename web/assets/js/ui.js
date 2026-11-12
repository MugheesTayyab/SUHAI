// Pieces shared by the story page and the control room.

const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICON = {
  m: svg('<path d="M12 2v20M4.9 6l14.2 12M4.9 18L19.1 6"/><path d="M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>'),
  i: svg('<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z"/>'),
  w: svg('<path d="M12 2.7C9 7 6 10.2 6 14a6 6 0 0 0 12 0c0-3.8-3-7-6-11.3z"/>'),
  h: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  d: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  clinic: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="3"'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
};

export const SERVICE = {
  m: { name: "Milk chilling", color: "var(--milk)", line: "Fresh milk from the morning collection, kept cold." },
  i: { name: "Irrigation", color: "var(--irr)", line: "Pumping water to the fields. It can wait a little." },
  w: { name: "Water purification", color: "var(--water)", line: "Clean drinking water for every household." },
  h: { name: "Household essentials", color: "var(--home)", line: "Lights and phone charging after dark." },
};

export const SLOT_WORD = ["in the morning", "at midday", "in the afternoon", "in the evening"];

// Columns of 5 kWh blocks for each slot: what runs, what is spare, where the battery helps.
export function renderSlots(container, view, { compact = false } = {}) {
  container.innerHTML = view.slots.map((s) => {
    const cells = [];
    let k = 0;
    s.services.forEach((svc) => {
      for (let b = 0; b < svc.energy; b++) {
        const label = b === 0 ? (compact ? svc.name.split(" ")[0] : svc.name) : "";
        // When the battery is in play, the block above the solar line is the battery block.
        const fromBattery = s.battery && k === s.solar;
        cells.push(`<div class="cell bg-${svc.key}${fromBattery ? " from-batt" : ""}" style="--k:${k++}" title="${svc.name}${fromBattery ? ", powered by the battery block" : ""}">${label}</div>`);
      }
    });
    const spare = Math.max(0, s.capacity - s.used);
    for (let b = 0; b < spare; b++) cells.push(`<div class="cell spare" style="--k:${k++}">${b === 0 ? "spare" : ""}</div>`);
    const rows = Math.max(5, s.used, s.capacity);
    const cap = s.over
      ? `<span class="sc-cap over-text">Needs ${s.used}, has ${s.capacity}</span>`
      : `<span class="sc-cap">${s.used} of ${s.capacity} block${s.capacity === 1 ? "" : "s"} used</span>`;
    const bat = s.battery ? `<span class="sc-bat">${ICON.d.replace('width="18" height="18"', 'width="11" height="11"')} battery block</span>` : `<span class="sc-bat off">solar only</span>`;
    return `<div class="slotcol">
      <span class="sc-name">${s.name}</span>
      ${cap}${bat}
      <div class="stack${s.over ? " is-over" : ""}" style="--rows:${rows}">${cells.join("") || '<div class="cell spare" style="--k:0;border-color:rgba(18,28,22,.15);color:var(--ink-3)">no sun</div>'}</div>
    </div>`;
  }).join("");
}

export function slotChips(slot) {
  const chips = slot.services.map((s) => `<span class="chip"><span class="sw ${s.key}"></span>${s.name}</span>`);
  if (slot.battery) chips.push(`<span class="chip bat">Battery</span>`);
  if (!chips.length) chips.push(`<span class="chip none">Nothing runs</span>`);
  return chips.join("");
}

export function slotSentence(slot, view = null, batteryBlocks = 1) {
  const names = slot.services.map((s) => s.name.toLowerCase());
  if (!names.length) {
    if (slot.solar > 0) return "Nothing scheduled";
    if (view && view.battery_used >= batteryBlocks) return "No sun, and the battery was spent earlier, so homes stay dark";
    return "No sun and nothing scheduled, so homes stay dark";
  }
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const what = list.charAt(0).toUpperCase() + list.slice(1);
  return `${what} running${slot.battery ? " with the battery" : ""} · ${slot.used} of ${slot.capacity} blocks in use`;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
