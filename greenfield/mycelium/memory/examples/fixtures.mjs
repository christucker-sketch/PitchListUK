// Deterministic FAKE explorer fixtures (no model). Used by the offline demo, the tests and the proposed live DB proof.
// With synthetic=true every node and edge carries attributes.synthetic=true; the 2 assessments are identified by assessor
// `fixture-explorer-b/<run>` (assessments have no attributes column).
// Explorer B knows only a phrase; it finds explorer A's records by search, recalls their neighbourhood and extends it.
import { createExplorerMemory } from '../src/explorer.mjs';

export async function explorerA(db, { run = 'demo-run-1', synthetic = false, memoryOptions } = {}) {
  const a = createExplorerMemory(db, { agent: 'fixture-explorer-a', run, memoryOptions });
  const tag = synthetic ? { synthetic: true } : {};
  const finding = await a.contribute({ key: 'heat-tolerance', kind: 'discovery', tag,
    title: 'Strain K7 breaks down polymer P at 30 C',
    body: 'Mass loss of 18% in 72 h at 30 C; no loss in sterile control.',
    evidence: [{ kind: 'measurement', title: 'Plate 3 readings', body: '30 C: -18%; control: 0%' }] });
  const failure = await a.contribute({ key: 'cold-attempt', kind: 'failed_experiment', tag,
    title: 'Strain K7 shows no activity on polymer P at 10 C',
    body: 'No measurable mass loss after 7 days at 10 C. Conclusion at the time: activity needs warmth.',
    links: [{ to: finding.id, relation: 'tests_limit_of' }],
    evidence: [{ kind: 'measurement', title: 'Plate 5 readings', body: '10 C: 0% after 7 days' }] });
  return { finding: finding.id, failure: failure.id };
}

export async function explorerB(db, { run = 'demo-run-2', aRun = 'demo-run-1', synthetic = false, memoryOptions } = {}) {
  const b = createExplorerMemory(db, { agent: 'fixture-explorer-b', run, memoryOptions });
  const tag = synthetic ? { synthetic: true } : {};
  const hits = await b.search({ text: 'polymer P', kinds: ['discovery', 'failed_experiment'] });                       // B knows only a phrase, not A's ids
  const recalled = await b.recall({ from: hits.items.filter(h => h.provenance?.declared_by?.agent === 'fixture-explorer-a' && h.provenance?.declared_by?.run === aRun).map(h => h.id), maxDepth: 2 });
  const finding = recalled.items.find(r => r.kind === 'discovery'), failure = recalled.items.find(r => r.kind === 'failed_experiment');
  // An unexpected direction: an unrelated marine branch, recombined with A's finding, overturns A's cold-failure conclusion.
  const extension = await b.contribute({ key: 'cofactor-cold', kind: 'cross_branch_result', tag,
    title: 'K7 is active on polymer P at 10 C when a marine cofactor is added',
    body: 'Adding cofactor M (from the unrelated marine-sediment branch) gives 9% mass loss at 10 C in 7 days.',
    // Lineage = A's records B built on, in a stable order. A retry must resend the IDENTICAL payload, so never derive it
    // from a recall that could now also return B's own earlier write.
    sources: recalled.items.filter(r => r.provenance?.declared_by?.agent === 'fixture-explorer-a').map(r => r.id).sort(),
    evidence: [{ kind: 'measurement', title: 'Plate 9 readings', body: '10 C + cofactor M: -9%; 10 C alone: 0%' }],
    links: [{ to: finding.id, relation: 'recombines' }, { to: failure.id, relation: 'contradicts' }],
    stances: [{ node: failure.id, stance: 'contradicts', weight: 0.7, independenceKey: 'plate-9' },
              { node: finding.id, stance: 'supports', weight: 0.6, independenceKey: 'plate-9' }] });
  return { searched: hits.items.length, recalled: recalled.items.map(r => ({ id: r.id, kind: r.kind, by: r.provenance.declared_by.agent })),
    reusedFromA: recalled.items.filter(r => r.provenance.declared_by.agent === 'fixture-explorer-a').map(r => r.id),
    extension: extension.id, links: extension.links.length, stances: extension.stances.length,
    promptBytes: Buffer.byteLength(b.render(recalled)) };
}
