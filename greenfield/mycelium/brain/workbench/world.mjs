// Inquiry workbench: a hidden world built from a declarative CASE, and the ONLY channel a mechanism has to it: observe().
// Fixes the E0 defects Codex found (e38c84ac): no truth object ever reaches a mechanism (views are built from observation
// records alone); revisit eligibility is the mechanism's own choice over anything it has observed; opportunities have a real
// lifecycle (open -> closed -> reopened); revisits can reveal changed links; observations can be wrong; identity is a key
// that duplicates share, so copies are not new finds; some sources are unlearnable decoys.
// Case authors (Claude, Codex) describe worlds as data. Mechanisms never see the case, family names or truth.

export function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const DEFAULT_SHARED = ['events', 'more', 'info', 'contact', 'about', 'page', 'here', 'details', 'summer', 'local', 'market', 'fair'];
const LIMITS = { families: 12, pages: 6000, budget: 5000, out: 20, words: 12 };

// Strict case validation: a case is data only, bounded so the evaluator stays inside its sandbox budget.
export function parseCase(c) {
  const fail = m => { throw new Error(`case ${c?.name ?? '?'}: ${m}`); };
  const only = (o, keys, what) => { if (!o || typeof o !== 'object' || Array.isArray(o)) fail(`${what} must be an object`); for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${what} has unknown field ${k}`); };
  const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(`${what} must be a number ${lo}-${hi}`); return v; };
  const int = (v, lo, hi, what) => { if (!Number.isInteger(v)) fail(`${what} must be an integer (whole number)`); return num(v, lo, hi, what); };   // C-03: no silent rounding
  only(c, ['name', 'author', 'description', 'budget', 'anchorSignal', 'shared', 'families', 'seeds', 'linkChurn', 'dupRate'], 'case');
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(c.name ?? '')) fail('name must be a lowercase slug');
  if (!['claude', 'codex', 'baseline'].includes(c.author)) fail('author must be claude, codex or baseline');
  if (typeof c.description !== 'string' || c.description.length > 600) fail('description must be text of at most 600 characters');
  int(c.budget, 50, LIMITS.budget, 'budget'); num(c.anchorSignal ?? 0.7, 0, 1, 'anchorSignal');
  num(c.linkChurn ?? 0, 0, 1, 'linkChurn'); num(c.dupRate ?? 0, 0, 0.9, 'dupRate');
  if (c.shared !== undefined && (!Array.isArray(c.shared) || c.shared.length < 1 || c.shared.length > 40 || c.shared.some(w => typeof w !== 'string' || w.length > 30))) fail('shared must list 1-40 short words');
  const fams = Object.entries(c.families ?? {});
  if (fams.length < 1 || fams.length > LIMITS.families) fail(`families must list 1-${LIMITS.families}`);
  let pages = 0, seedCount = 0;
  for (const [f, s] of fams) {
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(f)) fail(`family name ${f}`);
    only(s, ['n', 'yield', 'out', 'to', 'words', 'noise', 'schedule', 'decoy', 'seeds'], `family ${f}`);
    pages += int(s.n, 1, LIMITS.pages, `${f}.n`); num(s.yield, 0, 1, `${f}.yield`); int(s.out, 0, LIMITS.out, `${f}.out`);
    num(s.noise ?? 0, 0, 0.5, `${f}.noise`); seedCount += int(s.seeds ?? 0, 0, 50, `${f}.seeds`);
    if (!Array.isArray(s.words) || s.words.length < 1 || s.words.length > LIMITS.words || s.words.some(w => typeof w !== 'string' || w.length > 30)) fail(`${f}.words must list 1-${LIMITS.words} short words`);
    only(s.to ?? {}, fams.map(x => x[0]), `${f}.to`);
    const tw = Object.values(s.to ?? {}); if (s.out > 0 && (!tw.length || tw.some(w => typeof w !== 'number' || w < 0) || Math.abs(tw.reduce((a, b) => a + b, 0) - 1) > 1e-6)) fail(`${f}.to weights must sum to 1`);
    if (!/^(always|closes_mid|opens_mid|cycle:[1-9][0-9]{0,3})$/.test(s.schedule ?? 'always')) fail(`${f}.schedule must be always, closes_mid, opens_mid or cycle:<period>`);
    if (s.decoy !== undefined && typeof s.decoy !== 'boolean') fail(`${f}.decoy must be true or false`);
  }
  if (pages > LIMITS.pages) fail(`at most ${LIMITS.pages} pages in total`);
  if (seedCount < 1) fail('at least one family must give seeds');
  if (c.seeds !== undefined && (!Array.isArray(c.seeds) || c.seeds.length < 1 || c.seeds.length > 30 || c.seeds.some(s => !Number.isInteger(s) || s < 0) || new Set(c.seeds).size !== c.seeds.length)) fail('seeds must list 1-30 distinct non-negative integers (a repeated seed is not an independent world)');
  return c;
}

// The hidden world. Truth stays inside this closure; only observe() and the scorer can read it.
export function makeWorld(caseSpec, seed) {
  const c = parseCase(caseSpec), r = rng(seed), budget = c.budget, half = Math.floor(budget / 2);
  const shared = c.shared ?? DEFAULT_SHARED, signal = c.anchorSignal ?? 0.7, fams = Object.entries(c.families);
  const pages = [], byFam = {};
  for (const [f, s] of fams) { byFam[f] = []; for (let i = 0; i < s.n; i++) { byFam[f].push(pages.length); pages.push({ id: pages.length, fam: f, links: [], opp: null }); } }
  const linkFor = (spec) => {
    let x = r(), tf = null; for (const [f, w] of Object.entries(spec.to ?? {})) { if ((x -= w) <= 0) { tf = f; break; } } tf ??= Object.keys(spec.to)[0];
    return { to: pick(r, byFam[tf]), text: r() < signal ? pick(r, c.families[tf].words) : pick(r, shared) };
  };
  let keys = 0; const yielders = [];
  for (const p of pages) {
    const s = c.families[p.fam];
    for (let k = 0; k < s.out; k++) { const l = linkFor(s); if (l.to !== p.id) p.links.push(l); }
    if (r() < s.yield) {
      const sch = s.schedule ?? 'always';
      const windows = sch === 'always' ? [[0, budget]] : sch === 'closes_mid' ? [[0, half]] : sch === 'opens_mid' ? [[half, budget]]
        : (() => { const per = Number(sch.split(':')[1]), off = Math.floor(r() * per), w = []; for (let t = -off; t < budget; t += 2 * per) w.push([Math.max(0, t), Math.min(budget, t + per)]); return w.filter(([a, b]) => b > a); })();
      p.opp = { key: `k${keys++}`, windows, decoy: !!s.decoy, noise: s.noise ?? 0 };
      yielders.push(p);
    }
  }
  const dup = c.dupRate ?? 0;
  for (const p of yielders) if (r() < dup && yielders.length > 1) { const q = pick(r, yielders); if (q !== p && !q.opp.decoy && !p.opp.decoy) p.opp = { ...q.opp, windows: q.opp.windows }; }
  const seedLinks = [];
  for (const [f, s] of fams) for (let i = 0; i < (s.seeds ?? 0) && i < byFam[f].length; i++) seedLinks.push({ id: byFam[f][i], text: 'seed' });
  const openAt = (p, t) => p.opp && p.opp.windows.some(([a, b]) => t >= a && t < b);
  const churn = c.linkChurn ?? 0;

  // the only door into the world
  function observe(id, t) {
    const p = pages[id]; if (!p) throw new Error('no such page');
    let status = 'none';
    if (p.opp) {
      if (p.opp.decoy) status = r() < 0.5 ? 'open' : 'closed';                     // unlearnable: random each visit
      else status = openAt(p, t) ? 'open' : 'closed';
      if (r() < p.opp.noise) status = status === 'open' ? 'closed' : 'open';          // the source can be wrong
    }
    if (churn && r() < churn && p.links.length) { const s = c.families[p.fam]; p.links[Math.floor(r() * p.links.length)] = linkFor(s); }   // pages change
    return { id, status, key: p.opp ? p.opp.key : null, links: p.links.map(l => ({ to: l.to, text: l.text })) };
  }
  // evaluator-only: the truth needed to score. Never passed to a mechanism.
  const truth = {
    trulyOpen: (id, t) => !!(pages[id].opp && !pages[id].opp.decoy && openAt(pages[id], t)),
    keyOf: id => pages[id].opp?.key ?? null,
    // every reopening with ITS OWN open interval [at, end): a find inside another interval does not detect it (C-01)
    reopenings: () => { const out = []; const seen = new Set(); for (const p of pages) if (p.opp && !p.opp.decoy && !seen.has(p.opp.key)) { seen.add(p.opp.key); p.opp.windows.slice(1).forEach(([a, b]) => out.push({ key: p.opp.key, at: a, end: b })); } return out; },
    familyOf: id => pages[id].fam,
    pageCount: pages.length
  };
  return { budget, seedLinks, observe, truth, name: c.name };
}
