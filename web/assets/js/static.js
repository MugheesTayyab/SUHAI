// The hosted site has no Python behind it. These two helpers stand in for the server,
// using files that build_static.py wrote with the very same Python code.
// No DOM in here, so Node can check it against Python (see tests/check_static.mjs).

// Rebuild exactly what POST /api/evaluate returns, from the scenario and the score table.
export function evaluateFromTable(scn, table, exactBits, bits) {
  const names = scn.variables.map((v) => v.var);
  const val = bits.split("").map(Number);
  const index = val.reduce((acc, b, i) => acc + (b << i), 0);
  const [benefit, objective, quantumCost, violationIds, fired] = table.rows[index];
  const on = (name) => val[names.indexOf(name)] === 1;
  const serviceName = Object.fromEntries(scn.services.map((s) => [s.key, s.name]));

  const slots = scn.slots.map((s) => {
    const services = scn.variables
      .filter((v) => v.kind === "service" && v.slot === s.index && on(v.var))
      .map((v) => ({ var: v.var, key: v.service, name: serviceName[v.service], energy: v.energy, benefit: v.benefit }));
    const battery = on(`d${s.index}`);
    const used = services.reduce((a, x) => a + x.energy, 0);
    const capacity = s.solar_blocks + (battery ? 1 : 0);
    return { index: s.index, name: s.name, solar: s.solar_blocks, battery, used, capacity,
      spare: capacity - used, over: used > capacity, services };
  });
  const runs = (key) => scn.variables.filter((v) => v.service === key && on(v.var)).length;
  const violations = violationIds.map((k) => table.violations[k]);
  return {
    bits, index, slots,
    served: scn.services.filter((s) => runs(s.key) >= 1).map((s) => s.name),
    unserved: scn.services.filter((s) => runs(s.key) === 0).map((s) => s.name),
    benefit, objective,
    battery_used: scn.slots.filter((s) => on(`d${s.index}`)).length,
    feasible: violations.length === 0,
    violations,
    penalty: table.penalty,
    quantum_cost: quantumCost,
    fines_fired: fired,
    best_objective: table.best_objective,
    is_exact_best: bits === exactBits,
  };
}

// Play a recorded run back with its real timings. Runs longer than `cap` seconds are sped up
// evenly so the whole thing fits, and the caller is told by how much.
export function replay(record, { onEvent, cap = 14, now = () => performance.now(), frame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  const events = record.events;
  const total = events.length ? events[events.length - 1].t : 0;
  const speed = total > cap ? total / cap : 1;
  const start = now();
  let next = 0, raf = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    const elapsed = (now() - start) / 1000 * speed;
    while (next < events.length && events[next].t <= elapsed) {
      const ev = events[next++];
      onEvent(ev.kind, ev.data, ev);
    }
    if (next < events.length) raf = frame(tick);
  };
  raf = frame(tick);
  return {
    speed,
    stop() {
      if (stopped || next >= events.length) return false;
      stopped = true;
      cancelFrame(raf);
      onEvent("cancelled", {}, { kind: "cancelled" });
      return true;
    },
  };
}
