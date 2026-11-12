// Checks the browser's rule checker against Python. Called by tests/test_static.py.
// Usage: node tests/check_static.mjs <expected.json>
import { readFileSync } from "node:fs";
import { evaluateFromTable } from "../web/assets/js/static.js";

const expected = JSON.parse(readFileSync(process.argv[2], "utf8"));
const read = (name) => JSON.parse(readFileSync(new URL(`../web/data/${name}.json`, import.meta.url), "utf8"));
let checked = 0;
const bad = [];
for (const b of [1, 2]) {
  const scn = read(`scenario_${b}`), table = read(`eval_${b}`), exact = read(`exact_${b}`);
  for (const want of expected[b]) {
    const got = evaluateFromTable(scn, table, exact.view.bits, want.bits);
    checked++;
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`battery ${b} ${want.bits}`);
  }
}
console.log(JSON.stringify({ checked, mismatches: bad.length, first: bad.slice(0, 5) }));
