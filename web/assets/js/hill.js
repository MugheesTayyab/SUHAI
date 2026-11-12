// The hero illustration. One static SVG: a green hill, the village, its clinic and its solar field.
// No animation loop and no filters, so it costs nothing after the first paint.

const tree = (x, y, s = 1, dark = false) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-2.5" y="-6" width="5" height="18" rx="2" fill="#7a5b3d"/>
    <circle cx="-9" cy="-14" r="14" fill="${dark ? "#4d8a33" : "#5c9b3c"}"/>
    <circle cx="9" cy="-16" r="15" fill="${dark ? "#55943a" : "#6aab45"}"/>
    <circle cx="0" cy="-28" r="15" fill="${dark ? "#629f40" : "#79bb4f"}"/>
    <circle cx="-4" cy="-32" r="7" fill="#9bd06a" opacity=".55"/>
  </g>`;

const bush = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="-10" cy="0" r="10" fill="#5c9b3c"/><circle cx="6" cy="-3" r="12" fill="#6aab45"/><circle cx="18" cy="2" r="8" fill="#5c9b3c"/>
  </g>`;

const house = (x, y, s = 1, roof = "#5d6b78", wall = "#eee6d6") => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-34 -2 L0 -34 L34 -2 Z" fill="${roof}"/>
    <path d="M0 -34 L34 -2 L40 -2 L4 -36 Z" fill="#46525e"/>
    <rect x="-28" y="-4" width="56" height="40" fill="${wall}"/>
    <rect x="28" y="-4" width="10" height="40" fill="#d6ccba"/>
    <rect x="-20" y="4" width="11" height="11" rx="1" fill="#f3c955"/>
    <rect x="8" y="4" width="11" height="11" rx="1" fill="#f3c955"/>
    <rect x="-5" y="18" width="10" height="18" fill="#7b6450"/>
    <rect x="16" y="-30" width="7" height="14" fill="#8a6f5a"/>
  </g>`;

const panelRow = (x, y, count) => Array.from({ length: count }, (_, i) => `
  <g transform="translate(${x + i * 46} ${y})">
    <polygon points="0,26 40,26 48,0 8,0" fill="#2f4f86" stroke="#dfe7f3" stroke-width="1.4"/>
    <path d="M13 26 L21 0 M27 26 L35 0 M4 13 L44 13" stroke="#9fb3d6" stroke-width=".8" opacity=".8"/>
    <path d="M20 26 L20 36" stroke="#7d877f" stroke-width="2.5"/>
  </g>`).join("");

export function hillSVG() {
  return `
<svg class="hill" viewBox="100 228 1240 332" preserveAspectRatio="xMidYMax meet" role="img"
     aria-label="A village on a green hill with homes, a clinic, a water tank and a small solar field">
  <defs>
    <linearGradient id="h-mound" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b5dc82"/><stop offset=".45" stop-color="#8cc25a"/><stop offset="1" stop-color="#5f9a3a"/>
    </linearGradient>
    <linearGradient id="h-far" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfdcc3"/><stop offset="1" stop-color="#dfe5d9"/>
    </linearGradient>
    <radialGradient id="h-light" cx=".5" cy=".2" r=".6">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- far hills, very quiet -->
  <path d="M0 470 C 180 400, 330 420, 470 440 S 760 380, 900 410 S 1240 420, 1440 400 L1440 560 L0 560 Z" fill="url(#h-far)"/>

  <!-- the hill -->
  <path d="M40 560 C 190 470, 400 318, 720 300 C 1040 318, 1250 470, 1400 560 Z" fill="url(#h-mound)"/>
  <path d="M40 560 C 190 470, 400 318, 720 300 C 1040 318, 1250 470, 1400 560 Z" fill="url(#h-light)"/>

  <!-- footpath from the village -->
  <path d="M705 330 C 690 380, 760 410, 720 460 S 650 520, 690 560" fill="none" stroke="#efe6c8" stroke-width="12" stroke-linecap="round" opacity=".85"/>

  <!-- trees behind the village -->
  ${tree(520, 312, 1.05, true)}${tree(575, 298, 1.2, true)}${tree(870, 300, 1.15, true)}${tree(930, 318, 1, true)}${tree(640, 290, .9, true)}

  <!-- village on the crest -->
  ${house(600, 312, 1, "#5d6b78", "#efe7d7")}
  ${house(690, 300, 1.12, "#6a5f55", "#f1e9da")}
  <!-- clinic -->
  <g transform="translate(800 296)">
    <path d="M-44 0 L0 -26 L44 0 Z" fill="#d9dfd6"/>
    <rect x="-38" y="-2" width="76" height="42" fill="#fbfbf7"/>
    <rect x="-8" y="6" width="16" height="16" rx="2" fill="#fff" stroke="#e3e7e1"/>
    <path d="M0 9 V19 M-5 14 H5" stroke="#2f6b3c" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="-30" y="22" width="12" height="18" fill="#b9c4bc"/>
    <rect x="18" y="8" width="12" height="10" rx="1" fill="#cfe2ef"/>
  </g>
  <!-- water tank -->
  <g transform="translate(880 300)">
    <path d="M-12 40 L-9 8 M12 40 L9 8" stroke="#7d877f" stroke-width="3"/>
    <rect x="-17" y="-16" width="34" height="26" rx="8" fill="#e9dde6"/>
    <ellipse cx="0" cy="-15" rx="17" ry="5" fill="#ddcbd8"/>
  </g>

  <!-- trees on the slopes -->
  ${tree(430, 380, 1.15)}${tree(380, 410, 1.3)}${tree(470, 420, .95)}${tree(320, 456, 1.35)}${tree(250, 500, 1.4)}
  ${tree(1010, 372, 1.1)}${tree(1080, 410, 1.3)}${tree(1150, 450, 1.25)}${tree(1220, 492, 1.4)}
  ${tree(560, 400, .9)}${tree(600, 450, 1.05)}

  <!-- the solar field -->
  <g transform="translate(800 446)">
    ${panelRow(0, 0, 4)}
    ${panelRow(-18, 34, 4)}
  </g>
  <!-- battery cabinet beside the field -->
  <g transform="translate(1000 452)">
    <rect x="0" y="0" width="26" height="40" rx="5" fill="#26332b"/>
    <rect x="8" y="-4" width="10" height="5" rx="1.5" fill="#26332b"/>
    <rect x="5" y="8" width="16" height="26" rx="2" fill="#c6e77a"/>
  </g>

  <!-- foreground bushes -->
  ${bush(120, 548, 1.6)}${bush(1330, 548, 1.6)}${bush(480, 540, 1.1)}${bush(980, 548, 1.2)}
</svg>`;
}
