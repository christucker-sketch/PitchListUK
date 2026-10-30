// Experiment E0 (offline, synthetic, NO model calls, NO network): do competing attention mechanisms actually ADAPT?
// A hidden "pitch world" of pages. A policy sees only what it has fetched: each fetch costs 1 and reveals whether the page
// currently holds an OPEN opportunity, plus its outlinks with noisy anchor words. The policy is never told which hidden
// family a page belongs to, and no route list is given: routes must be discovered from evidence.
// Halfway through, the world changes: one productive family closes for the season, and opportunities REOPEN on pages
// that were already seen in another family. A policy only scores reopened opportunities if it chooses to revisit.
//   node e0-sim.mjs [runs=20] [budget=1500]       prints mean ± sd per policy over seeded worlds
// What E0 can show: whether a mechanism changes its choices after feedback and after environmental change, discovers a
// route the seed did not name, keeps diversity, and revisits. What it CANNOT show: real-world value. That needs E2+.

export function rng(seed) {   // mulberry32: deterministic, seedable
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

// Hidden families: size, chance a page holds an opportunity, outlinks per page, where they link, own anchor vocabulary.
const FAMILIES = {
  hub:       { n: 30,  yield: 0.02, out: 14, to: { organiser: 0.55, noise: 0.25, platform: 0.12, council: 0.08 }, words: ['directory', 'members', 'listings'] },
  organiser: { n: 600, yield: 0.15, out: 3,  to: { organiser: 0.6, platform: 0.2, noise: 0.15, novel: 0.05 }, words: ['stallholders', 'traders', 'exhibitors'] },
  platform:  { n: 200, yield: 0.6,  out: 2,  to: { platform: 0.9, organiser: 0.1 }, words: ['apply', 'vendor-application', 'booking'] },
  council:   { n: 300, yield: 0.25, out: 4,  to: { council: 0.8, novel: 0.15, noise: 0.05 }, words: ['licence', 'street-trading', 'permit'] },
  noise:     { n: 800, yield: 0.005, out: 5, to: { noise: 0.7, organiser: 0.2, hub: 0.1 }, words: ['news', 'photos', 'follow'] },
  novel:     { n: 150, yield: 0.5,  out: 3,  to: { novel: 0.8, council: 0.2 }, words: ['programme', 'pitch-scheme', 'kerbside'] }
};
const SHARED = ['events', 'more', 'info', 'contact', 'about', 'page', 'here', 'details', 'summer', 'local', 'market', 'fair'];

export function makeWorld(seed, budget) {
  const r = rng(seed), pages = [], byFam = {};
  for (const [f, spec] of Object.entries(FAMILIES)) { byFam[f] = []; for (let i = 0; i < spec.n; i++) { const id = pages.length; pages.push({ id, fam: f, links: [], opp: null }); byFam[f].push(id); } }
  const half = Math.floor(budget / 2);
  let oppId = 0;
  for (const p of pages) {
    const spec = FAMILIES[p.fam];
    for (let k = 0; k < spec.out; k++) {
      let x = r(), tf = null; for (const [f, w] of Object.entries(spec.to)) { if ((x -= w) <= 0) { tf = f; break; } } tf ??= Object.keys(spec.to)[0];
      const t = pick(r, byFam[tf]); if (t === p.id) continue;
      const word = r() < 0.7 ? pick(r, FAMILIES[tf].words) : pick(r, SHARED);   // anchors are a NOISY hint, not a label
      p.links.push({ to: t, word });
    }
    if (r() < spec.yield) {
      // platform listings close at mid-run (season end); council openings are closed now and REOPEN after mid-run
      if (p.fam === 'platform') p.opp = { id: oppId++, open: [0, half] };
      else if (p.fam === 'council' && r() < 0.6) p.opp = { id: oppId++, open: [half, budget] };
      else p.opp = { id: oppId++, open: [0, budget] };
      if (p.fam === 'platform' && r() < 0.3) p.dupOf = true;   // platform pages often repeat an organiser's listing
    }
  }
  const seeds = [...byFam.hub.slice(0, 5), ...byFam.noise.slice(0, 5)].map(id => ({ to: id, word: 'seed' }));
  return { pages, seeds, half, budget };
}

// ---- policies: each gets the same observations; none is told families ----
// Each returns { name, choose(state) -> pageId, learn(obs), session() }.
const LEX = ['traders', 'stallholders', 'exhibitors', 'apply', 'vendor-application', 'booking'];   // a fixed hand lexicon, as in a classic crawler
export const policies = {
  // B0: a plain fixed workflow: static keyword priority, then FIFO; a fixed revisit schedule; never learns
  fixed: () => {
    let t = 0;
    return { name: 'B0 fixed workflow', session() {},
      choose: s => { t++;
        if (t % 400 === 0 && s.yielded.length) return s.yielded[(t / 400) % s.yielded.length | 0];
        let best = null, bs = -1; for (const [id, w] of s.frontier) { const sc = LEX.includes(w) ? 1 : 0; if (sc > bs) { bs = sc; best = id; } } return best; },
      learn() {} };
  },
  // H1: frontier bandit over EMERGENT contexts (anchor words seen so far) and revisit-arms; Thompson sampling + diversity floor
  bandit: ({ memory = true } = {}) => {
    let stats = new Map();
    const st = k => { if (!stats.has(k)) stats.set(k, { a: 1, b: 1, n: 0 }); return stats.get(k); };
    const beta = (r, a, b) => { const g = k => { let x = 0; for (let i = 0; i < k; i++) x -= Math.log(r()); return x; }; const x = g(Math.min(a, 30)), y = g(Math.min(b, 30)); return x / (x + y); };
    return { name: memory ? 'H1 frontier bandit' : 'B1 bandit, no cross-session memory',
      session() { if (!memory) stats = new Map(); },
      choose: s => {
        const r = s.r, arms = new Map();
        for (const [id, w] of s.frontier) { if (!arms.has(w)) arms.set(w, []); arms.get(w).push(id); }
        for (const p of s.yielded) { if (s.now - s.lastFetch.get(p) < 120) continue; const k = 'revisit:' + s.wordOf.get(p); if (!arms.has(k)) arms.set(k, []); arms.get(k).push(p); }
        if (!arms.size) return null;
        let keys = [...arms.keys()];
        if (r() < 0.1) { keys.sort((x, y) => st(x).n - st(y).n); return pick(r, arms.get(keys[0])); }   // diversity floor
        let bk = null, bv = -1; for (const k of keys) { const v = beta(r, st(k).a, st(k).b); if (v > bv) { bv = v; bk = k; } }
        return pick(r, arms.get(bk)); },
      learn: o => { const k = o.revisit ? 'revisit:' + o.word : o.word; const x = st(k); x.n++; if (o.gain) x.a++; else x.b++;
        if (x.a + x.b > 60) { x.a *= 0.95; x.b *= 0.95; } }   // forgetting: lets estimates track a changing world
    };
  },
  // H2: spreading activation ("growth tips"): yield feeds activation to a page's links and siblings; activation decays;
  // pages that once yielded regain activation slowly, so they get revisited; unseen anchor words get a novelty bonus
  activation: () => {
    const act = new Map(), seenWords = new Map();
    const bump = (id, v) => act.set(id, (act.get(id) ?? 0) + v);
    return { name: 'H2 spreading activation', session() {},
      choose: s => {
        for (const p of s.yielded) bump(p, 0.004);
        let best = null, bv = -Infinity;
        for (const [id, w] of s.frontier) { const v = (act.get(id) ?? 0) + 0.3 / Math.sqrt(1 + (seenWords.get(w) ?? 0)) + s.r() * 0.01; if (v > bv) { bv = v; best = id; } }
        for (const p of s.yielded) { if (s.now - s.lastFetch.get(p) < 120) continue; const v = act.get(p) ?? 0; if (v > bv) { bv = v; best = p; } }
        return best; },
      learn: o => {
        seenWords.set(o.word, (seenWords.get(o.word) ?? 0) + 1);
        for (const [k, v] of act) act.set(k, v * 0.97);
        if (o.page != null) act.set(o.page, 0);
        if (o.gain) { for (const l of o.links) bump(l.to, 1); for (const sib of o.siblings) bump(sib, 0.5); }
      } };
  }
};

export function run(world, policy, { seed = 1, session = 300 } = {}) {
  const r = rng(seed * 7919 + 13), { pages, budget, half } = world;
  const frontier = new Map(world.seeds.map(l => [l.to, l.word])), wordOf = new Map(world.seeds.map(l => [l.to, l.word]));
  const parentOf = new Map(), childrenOf = new Map(), lastFetch = new Map(), yielded = [], captured = new Set();
  const m = { fetches: 0, unique: 0, uniqueAfterChange: 0, reopenedCaught: 0, novelUnique: 0, words: new Map(), revisits: 0 };
  for (let now = 0; now < budget; now++) {
    if (now > 0 && now % session === 0) policy.session();
    const id = policy.choose({ r, now, frontier, yielded, lastFetch, wordOf });
    if (id == null) break;
    const p = pages[id], revisit = lastFetch.has(id), word = wordOf.get(id) ?? 'seed';
    frontier.delete(id); lastFetch.set(id, now); m.fetches++; if (revisit) m.revisits++;
    m.words.set(word, (m.words.get(word) ?? 0) + 1);
    const open = p.opp && now >= p.opp.open[0] && now < p.opp.open[1];
    let gain = false;
    if (open && !p.dupOf && !captured.has(p.opp.id)) {
      captured.add(p.opp.id); gain = true; m.unique++;
      if (now >= half) m.uniqueAfterChange++;
      if (p.fam === 'council' && p.opp.open[0] === half && revisit) m.reopenedCaught++;
      if (p.fam === 'novel') m.novelUnique++;
    }
    if (p.opp && !yielded.includes(id)) yielded.push(id);
    const links = revisit ? [] : p.links;
    for (const l of links) { if (!lastFetch.has(l.to) && !frontier.has(l.to)) { frontier.set(l.to, l.word); wordOf.set(l.to, l.word); parentOf.set(l.to, id); } }
    if (!revisit) childrenOf.set(id, links.map(l => l.to));
    const siblings = (childrenOf.get(parentOf.get(id)) ?? []).filter(x => x !== id && !lastFetch.has(x));
    policy.learn({ page: id, word, revisit, gain, links, siblings });
  }
  const tot = [...m.words.values()].reduce((a, b) => a + b, 0);
  const entropy = -[...m.words.values()].reduce((h, c) => h + (c / tot) * Math.log2(c / tot), 0);
  return { per100: 100 * m.unique / m.fetches, unique: m.unique, afterChange: m.uniqueAfterChange, reopened: m.reopenedCaught, novel: m.novelUnique, revisits: m.revisits, entropy };
}

export function experiment({ runs = 20, budget = 1500 } = {}) {
  const make = { 'B0 fixed workflow': () => policies.fixed(), 'B1 bandit, no cross-session memory': () => policies.bandit({ memory: false }),
    'H1 frontier bandit': () => policies.bandit(), 'H2 spreading activation': () => policies.activation() };
  const out = {}; Object.defineProperty(out, '_rows', { value: {}, enumerable: false });
  for (const [name, f] of Object.entries(make)) {
    const rows = []; for (let s = 1; s <= runs; s++) rows.push(run(makeWorld(1000 + s, budget), f(), { seed: s }));
    out._rows[name] = rows;
    out[name] = Object.fromEntries(Object.keys(rows[0]).map(k => { const v = rows.map(x => x[k]), mu = v.reduce((a, b) => a + b, 0) / v.length;
      return [k, { mean: mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, v.length - 1)) }]; }));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(process.argv[2] ?? 20), budget = Number(process.argv[3] ?? 1500), res = experiment({ runs, budget });
  const cols = [['per100', 'unique open opps / 100 fetches'], ['afterChange', 'unique, after the world changes'], ['reopened', 'reopened opps caught by revisiting'],
    ['novel', 'unique from the route no seed named'], ['revisits', 'revisits'], ['entropy', 'diversity of anchors fetched (bits)']];
  console.log(`E0: ${runs} seeded worlds, ${budget} fetches each (synthetic; no model, no network)\n`);
  console.log(['policy', ...cols.map(c => c[1])].join(' | '));
  for (const [name, r] of Object.entries(res)) console.log([name, ...cols.map(([k]) => `${r[k].mean.toFixed(k === 'entropy' || k === 'per100' ? 2 : 1)} ± ${r[k].sd.toFixed(1)}`)].join(' | '));
  console.log('\npaired differences on the same worlds (mean ± standard error):');
  for (const [a, b] of [['H1 frontier bandit', 'B0 fixed workflow'], ['H1 frontier bandit', 'B1 bandit, no cross-session memory'], ['H2 spreading activation', 'B0 fixed workflow']])
    console.log(`${a} − ${b}: ` + ['per100', 'afterChange', 'novel', 'reopened'].map(k => { const d = res._rows[a].map((x, i) => x[k] - res._rows[b][i][k]);
      const mu = d.reduce((x, y) => x + y, 0) / d.length, se = Math.sqrt(d.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, d.length - 1) / d.length); return `${k} ${mu >= 0 ? '+' : ''}${mu.toFixed(2)} ± ${se.toFixed(2)}`; }).join('; '));
}
