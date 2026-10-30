// The links-extractor proof scenario: fake Claude and fake Codex work on one shared artifact at the same time. Codex's
// tests go red on Claude's first version; Codex challenges mid-session; Claude, still running, replies and fixes it; the
// shared tests go green. Used by test/session.test.mjs and by demo.mjs (no model, no network).
export const TESTS = ['bash', '-c', 'ls artifact/*.test.mjs >/dev/null 2>&1 || exit 0; node --test artifact/*.test.mjs'];
export const V1 = `export function links(html, base) {
  return [...html.matchAll(/<a\\s[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi)].map(m => ({ url: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }));
}
`;
export const V2 = `export function links(html, base) {
  const out = new Map();
  for (const m of html.matchAll(/<a\\s[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi)) {
    let url; try { url = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = ''; if (!out.has(url.href)) out.set(url.href, { url: url.href, text: m[2].replace(/<[^>]+>/g, '').trim() });
  }
  return [...out.values()];
}
`;
export const LINK_TESTS = `import test from 'node:test'; import assert from 'node:assert/strict'; import { links } from './links.mjs';
const base = 'https://example.test/markets/index.html';
test('absolute links with anchor text', () => assert.deepEqual(links('<a href="https://a.test/x">Apply <b>now</b></a>', base), [{ url: 'https://a.test/x', text: 'Apply now' }]));
test('relative links resolve against the page', () => assert.equal(links('<a href="./fair.html">Fair</a>', base)[0].url, 'https://example.test/markets/fair.html'));
test('duplicates collapse', () => assert.equal(links('<a href="/a">1</a><a href="/a#top">2</a>', base).length, 1));
`;

export function proofAgents() {
  const claude = { adapter: 'fake', script: [
    { call: 600 },
    { files: { 'artifact/links.mjs': V1 }, message: 'links extractor v1' },
    { emit: 'finding', body: 'links v1 is in (regex extractor); now working on anchor-text cleanup', label: 'v1' },
    { call: 500 },
    { await: { actor: 'codex', kind: 'challenge' }, label: 'ch', timeoutMs: 15000 },
    { emit: 'reply', body: 'Agreed on relative hrefs and duplicates: resolving against the page URL and deduplicating.', refs: ['ch'] },
    { call: 300 },
    { files: { 'artifact/links.mjs': V2 }, message: 'resolve relative links and dedupe (answers the Codex challenge)', refs: ['ch'] },
    { await: { actor: 'coordinator', kind: 'tested', data: { agent: 'claude', ok: true } }, label: 'green', timeoutMs: 15000 },
    { done: 'claude done' }] };
  const codex = { adapter: 'fake', script: [
    { call: 200 },
    { files: { 'artifact/links.test.mjs': LINK_TESTS }, message: 'tests for the shared link extractor' },
    { await: { actor: 'coordinator', kind: 'tested', data: { agent: 'claude', ok: false } }, label: 'red', timeoutMs: 15000 },
    { emit: 'challenge', body: 'Integration tests FAIL on links v1: relative hrefs are not resolved against the page URL, and duplicates are kept.', refs: ['red'] },
    { call: 800 },
    { await: { actor: 'claude', kind: 'reply' }, label: 'rep', timeoutMs: 15000 },
    { emit: 'note', body: 'Seen. I will add a mailto/javascript case next.', refs: ['rep'] },
    { await: { actor: 'coordinator', kind: 'tested', data: { agent: 'claude', ok: true } }, label: 'g', timeoutMs: 15000 },
    { done: 'codex done' }] };
  return { claude, codex };
}
