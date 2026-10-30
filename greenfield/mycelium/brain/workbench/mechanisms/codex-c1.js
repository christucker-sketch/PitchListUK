// C1, smallest executable component: rival forecasts buy discriminating rechecks.
// Models predict an OBSERVATION, not hidden truth: persistence, observed frequency,
// and a dwell-time/flip hypothesis. Loss is recorded prospectively, before updating.
// Known-key aliases share one watch; surprise is not a discovery reward. At most
// one in five frontier-time slots funds a discriminator. This is a bounded C1
// allocator experiment, NOT the full model/representation-generating brain.
function create(api) {
  const nodes = new Map(), frontier = new Map(), contexts = new Map();
  const watches = new Map(), opened = new Set();
  let pending = null, checks = 0;
  const context = text => {
    if (!contexts.has(text)) contexts.set(text, { fresh: 0, novel: 0, n: 0, opens: 0,
      checks: 0, loss: [0, 0, 0], gaps: 0, dwell: 150 });
    return contexts.get(text);
  };
  const add = (id, text, at) => {
    if (nodes.has(id)) return;
    const n = { id, text, at, t: -1, status: null, key: null };
    nodes.set(id, n); frontier.set(id, n); context(text);
  };
  for (const s of api.seeds) add(s.id, s.text, 0);
  const forecasts = (n, now) => {
    const c = context(n.text), base = (c.opens + 1) / (c.n + 2);
    if (n.t < 0 || !n.key) return [base, base, base];
    const stable = n.status === 'open' ? 0.95 : 0.05;
    const flips = Math.floor((now - n.t) / Math.max(12, c.dwell));
    return [stable, base, c.gaps >= 2 && flips % 2 ? 1 - stable : stable];
  };
  const mixture = (n, now) => {
    const c = context(n.text), pred = forecasts(n, now);
    const w = c.loss.map(x => Math.exp(-4 * x / Math.max(1, c.checks)));
    const z = w.reduce((a, b) => a + b, 0);
    const p = pred.reduce((s, x, i) => s + x * w[i] / z, 0);
    const disagreement = pred.reduce((s, x, i) => s + w[i] / z * (x - p) * (x - p), 0);
    return { p, disagreement, pred };
  };
  const take = (n, now) => {
    pending = { id: n.id, pred: forecasts(n, now), tested: n.t >= 0 && !!n.key };
    return { fetch: n.id };
  };
  return {
    choose(now) {
      let fresh = null, freshValue = -Infinity;
      for (const n of frontier.values()) {
        const c = context(n.text);
        // Consequence: a new observed key; plus uncertainty/age to avoid locking
        // onto one successful vocabulary. Contexts arise from observations only.
        const v = (c.novel + 1) / (c.fresh + 4) + 0.3 / Math.sqrt(c.fresh + 1)
          + Math.min(1, (now - n.at) / Math.max(1, api.budget));
        if (v > freshValue) { freshValue = v; fresh = n; }
      }
      let probe = null, probeValue = -Infinity;
      for (const n of watches.values()) {
        const age = now - n.t;
        if (age < 24) continue;
        const c = context(n.text), m = mixture(n, now);
        const unknownKey = !opened.has(n.key);
        // A probe must either resolve a not-yet-open key, discriminate rival
        // forecasts, or test stale evidence; changed status alone earns no reward.
        const v = (unknownKey ? m.p : 0) + 2 * m.disagreement / Math.sqrt(1 + c.checks)
          + (age >= 150 ? 0.15 : 0);
        if (v > probeValue) { probeValue = v; probe = n; }
      }
      if (probe && (!fresh || now % 5 === 4) && probeValue > 0.02) return take(probe, now);
      if (fresh) return take(fresh, now);
      return { wait: true };
    },
    observe(o) {
      const n = nodes.get(o.id);
      if (!n) return;
      const c = context(n.text), wasFresh = n.t < 0;
      // Forecasts above are frozen before this observation; never fitted to it.
      if (pending && pending.id === o.id && pending.tested) {
        const y = o.status === 'open' ? 1 : 0;
        c.checks++; checks++;
        pending.pred.forEach((p, i) => { c.loss[i] += (p - y) * (p - y); });
        if (n.status !== o.status && o.status !== 'none') {
          c.gaps++; c.dwell += ((o.t - n.t) - c.dwell) / c.gaps;
        }
      }
      if (wasFresh) { c.fresh++; if (o.key && !watches.has(o.key)) c.novel++; }
      c.n++; if (o.status === 'open') c.opens++;
      frontier.delete(o.id);
      n.t = o.t; n.status = o.status; n.key = o.key;
      if (o.key) {
        // Transfer the latest observed key state to its existing representative;
        // aliases do not purchase independent evidence or additional watch slots.
        const representative = watches.get(o.key) || n;
        representative.t = o.t; representative.status = o.status;
        watches.set(o.key, representative);
        if (o.status === 'open') opened.add(o.key);
      }
      for (const l of o.links) add(l.to, l.text, o.t);
      pending = null;
    },
    // Read-only instrumentation for prospective-loss regressions. The evaluator
    // does not use this method or pass it any privileged state.
    diagnostics() {
      const loss = [0, 0, 0];
      for (const c of contexts.values()) c.loss.forEach((x, i) => { loss[i] += x; });
      return { checks, watches: watches.size, contexts: contexts.size, frontier: frontier.size,
        loss: { persistence: loss[0], frequency: loss[1], dwell: loss[2] } };
    }
  };
}
