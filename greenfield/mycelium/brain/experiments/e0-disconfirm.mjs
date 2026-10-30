// E0-D: deliberate attempts to BREAK E0's headline (H1 beats a fixed workflow after change, on the unnamed route and on
// reopenings). Each variant removes one assumption Claude built into the world. Same 20 paired worlds, no calls, no network.
import { experiment, LEX_WITH_NOVEL } from './e0-sim.mjs';
const variants = [
  ['baseline E0 (as published)', {}],
  ['no world change (stationary)', { world: { change: false } }],
  ['weak evidence: anchors 30% informative', { world: { signal: 0.3 } }],
  ['uninformative anchors (signal 0)', { world: { signal: 0 } }],
  ['fixed lexicon already knows the "unnamed" route', { lexicon: LEX_WITH_NOVEL }],
  ['short run: 400 fetches', { budget: 400 }]
];
const d = (res, a, b, k) => { const x = res._rows[a].map((r, i) => r[k] - res._rows[b][i][k]); const mu = x.reduce((p, q) => p + q, 0) / x.length;
  const se = Math.sqrt(x.reduce((p, q) => p + (q - mu) ** 2, 0) / (x.length - 1) / x.length); return `${mu >= 0 ? '+' : ''}${mu.toFixed(2)} ± ${se.toFixed(2)}`; };
console.log('variant | H1−B0 per100 | H1−B0 afterChange | H1−B0 unnamed route | H1−B0 reopened | H1−B1 per100 (memory) | H2−B0 per100');
for (const [name, opt] of variants) {
  const res = experiment({ runs: 20, ...opt });
  console.log([name, d(res, 'H1 frontier bandit', 'B0 fixed workflow', 'per100'), d(res, 'H1 frontier bandit', 'B0 fixed workflow', 'afterChange'),
    d(res, 'H1 frontier bandit', 'B0 fixed workflow', 'novel'), d(res, 'H1 frontier bandit', 'B0 fixed workflow', 'reopened'),
    d(res, 'H1 frontier bandit', 'B1 bandit, no cross-session memory', 'per100'), d(res, 'H2 spreading activation', 'B0 fixed workflow', 'per100')].join(' | '));
}
