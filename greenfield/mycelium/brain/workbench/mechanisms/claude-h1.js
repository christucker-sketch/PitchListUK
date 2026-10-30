// Claude H1, corrected after Codex's E0 audit (e38c84ac): a frontier bandit over contexts that EMERGE from evidence (the
// link text a page was found through), with Thompson sampling from a correct Beta draw (Marsaglia-Tsang Gamma, real
// shapes, no independent clipping), forgetting, a 10% least-tried exploration floor, and revisit arms built ONLY from what
// it has observed (a page that showed a key), split by the last status seen. Reward = a new open key, or a status change
// on a revisit (evidence the world moved). It is a hypothesis, not the selected design.
function create(api) {
  const frontier = new Map(api.seeds.map(s => [s.id, s.text])), textOf = new Map(frontier), seen = new Set(frontier.keys());
  const keyed = new Map(), stats = new Map(), openKeys = new Set();
  const st = k => { if (!stats.has(k)) stats.set(k, { a: 1, b: 1, n: 0 }); return stats.get(k); };
  const gamma = k => { if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { const u1 = Math.random(), u2 = Math.random(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = Math.random(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
  const beta = (a, b) => { const x = gamma(a), y = gamma(b); return x / (x + y); };
  let last = null;
  return {
    choose(now) {
      const arms = new Map();
      for (const [id, w] of frontier) { const k = 'new:' + w; if (!arms.has(k)) arms.set(k, []); arms.get(k).push(id); }
      for (const [id, o] of keyed) { if (now - o.t < 60) continue; const k = 'revisit:' + o.status; if (!arms.has(k)) arms.set(k, []); arms.get(k).push(id); }
      if (!arms.size) return { wait: true };
      const keys = [...arms.keys()];
      let pickK;
      if (Math.random() < 0.1) pickK = keys.reduce((m, k) => st(k).n < st(m).n ? k : m, keys[0]);
      else { let bv = -1; for (const k of keys) { const v = beta(st(k).a, st(k).b); if (v > bv) { bv = v; pickK = k; } } }
      const ids = arms.get(pickK), id = ids[Math.floor(Math.random() * ids.length)];
      last = { arm: pickK, id };
      return { fetch: id };
    },
    observe(o) {
      const prev = keyed.get(o.id);
      frontier.delete(o.id);
      for (const l of o.links) if (!seen.has(l.to)) { seen.add(l.to); frontier.set(l.to, l.text); textOf.set(l.to, l.text); }
      let gain = false;
      if (o.key) { if (o.status === 'open' && !openKeys.has(o.key)) { openKeys.add(o.key); gain = true; } if (prev && prev.status !== o.status) gain = true; keyed.set(o.id, { status: o.status, t: o.t }); }
      if (last && last.id === o.id) { const s = st(last.arm); s.n++; if (gain) s.a++; else s.b++; if (s.a + s.b > 60) { s.a *= 0.95; s.b *= 0.95; } }
    }
  };
}
