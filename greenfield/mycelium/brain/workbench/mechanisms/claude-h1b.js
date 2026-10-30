// Claude H1b: H1 with the two defects its own counterexamples exposed (decoy -19, weak cues -50 against baseline-fixed).
// 1. Reward is no longer "anything changed" or "a new open key": a context (the link text a page was found through) earns
//    credit for an open key only in proportion to its MEASURED RELIABILITY, 2*agreement-1 on short confirm re-checks
//    (chance agreement on a binary status is 0.5, so an unlearnable source scores ~0 and stops being funded).
// 2. Revisits use a watch list re-checked oldest-first once due (the rule that beat H1 on weak cues), but the share of fetches
//    spent on revisits vs new pages is itself learned (a two-arm Thompson bandit rewarded by new open keys and by
//    closed->open reappearances on reliable pages), and unreliable contexts are dropped from the watch list.
// Hypothesis, not a selected design. Predicted before running: beats baseline-fixed on decoy (FAILED: -15.0 +/- 2.8 on the
// 6-seed board, better than H1's -18.8 but still a loss), closes most of the weak-cue gap (HELD: -16.2 +/- 1.9, from -50.0),
// keeps most of H1's gain on strong cues (HELD: e0 +98.2, enumerable +63.7). Not predicted: it LOSES on churn-and-noise
// (-13.8 +/- 2.2; H1 +1.3). Incremental frontier/watch structures: ~25% less CPU than H1 and no 50 ms call timeouts.
function create(api) {
  const CONFIRM_AFTER = 30, CONFIRMS_PER_CTX = 8, PERIOD = 150, FLOOR = 0.15;
  const frontier = new Map(), seen = new Set(api.seeds.map(s => s.id)), ctxOf = new Map(api.seeds.map(s => [s.id, s.text]));
  const keyed = new Map(), openKeys = new Set(), stats = new Map(), rel = new Map(), confirmQ = [];
  const mode = { fresh: { a: 1, b: 1 }, revisit: { a: 1, b: 1 } };
  const st = k => { if (!stats.has(k)) stats.set(k, { a: 1, b: 1, n: 0 }); return stats.get(k); };
  const rl = c => { if (!rel.has(c)) rel.set(c, { agree: 3, n: 4 }); return rel.get(c); };
  const reliability = c => { const r = rl(c); return Math.max(0, 2 * (r.agree / r.n) - 1); };
  const gamma = k => { if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { const u1 = Math.random(), u2 = Math.random(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = Math.random(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
  const beta = (a, b) => { const x = gamma(a), y = gamma(b); return x / (x + y); };
  const decay = s => { if (s.a + s.b > 60) { s.a *= 0.95; s.b *= 0.95; } };
  const watchable = id => { const c = ctxOf.get(id), r = rl(c); return r.n < 8 || reliability(c) >= 0.3; };
  // keyed is kept in last-check order (delete + set), so the first watchable entry is the oldest: O(skipped), not O(all)
  const dueRevisit = now => { for (const [id, o] of keyed) { if (!watchable(id)) continue; return now - o.t >= PERIOD ? id : null; } return null; };
  const arms = new Map(), pos = new Map();                      // incremental arms (text -> ids), swap-remove on fetch
  const addF = (id, w) => { frontier.set(id, w); if (!arms.has(w)) arms.set(w, []); const a = arms.get(w); pos.set(id, a.length); a.push(id); };
  const delF = id => { const w = frontier.get(id); if (w === undefined) return; frontier.delete(id); const a = arms.get(w), i = pos.get(id), j = a.pop();
    if (j !== id) { a[i] = j; pos.set(j, i); } pos.delete(id); if (!a.length) arms.delete(w); };
  for (const s of api.seeds) addF(s.id, s.text);
  let last = null;
  return {
    choose(now) {
      while (confirmQ.length && confirmQ[0].at <= now) {           // a short confirm re-check measures a context's reliability
        const q = confirmQ.shift(); if (rl(q.ctx).n < CONFIRMS_PER_CTX + 4) { last = { kind: 'confirm', id: q.id, ctx: q.ctx, was: q.status }; return { fetch: q.id }; }
      }
      const rev = dueRevisit(now), canFresh = frontier.size > 0;
      if (!rev && !canFresh) return { wait: true };
      let m = 'fresh';
      if (rev && !canFresh) m = 'revisit';
      else if (rev) { const u = Math.random(); m = u < FLOOR / 2 ? 'revisit' : u < FLOOR ? 'fresh' : beta(mode.revisit.a, mode.revisit.b) > beta(mode.fresh.a, mode.fresh.b) ? 'revisit' : 'fresh'; }
      if (m === 'revisit') { last = { kind: 'revisit', id: rev }; return { fetch: rev }; }
      const keys = [...arms.keys()]; let pick;
      if (Math.random() < 0.1) pick = keys.reduce((a, k) => st(k).n < st(a).n ? k : a, keys[0]);
      else { let bv = -1; for (const k of keys) { const v = beta(st(k).a, st(k).b); if (v > bv) { bv = v; pick = k; } } }
      const ids = arms.get(pick), id = ids[Math.floor(Math.random() * ids.length)];
      last = { kind: 'fresh', id, arm: pick }; return { fetch: id };
    },
    observe(o) {
      const prev = keyed.get(o.id), ctx = ctxOf.get(o.id);
      delF(o.id);
      for (const l of o.links) if (!seen.has(l.to)) { seen.add(l.to); addF(l.to, l.text); ctxOf.set(l.to, l.text); }
      let credit = 0;
      if (o.key) {
        const r = reliability(ctx), newOpen = o.status === 'open' && !openKeys.has(o.key);
        if (newOpen) { openKeys.add(o.key); credit = r; }
        if (prev && prev.status === 'closed' && o.status === 'open') credit = Math.max(credit, r);
        if (!prev && rl(ctx).n < CONFIRMS_PER_CTX + 4) confirmQ.push({ id: o.id, ctx, status: o.status, at: o.t + CONFIRM_AFTER });
        keyed.delete(o.id); keyed.set(o.id, { status: o.status, t: o.t });
      }
      if (!last || last.id !== o.id) return;
      if (last.kind === 'confirm') { const r = rl(last.ctx); r.n++; if (o.status === last.was) r.agree++; return; }
      const s = last.kind === 'fresh' ? st(last.arm) : null, mm = mode[last.kind];
      if (s) { s.n++; s.a += credit; s.b += 1 - credit; decay(s); }
      mm.a += credit; mm.b += 1 - credit; decay(mm);
    }
  };
}
