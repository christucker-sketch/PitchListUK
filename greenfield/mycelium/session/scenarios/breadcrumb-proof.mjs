// Offline mission fixture, not evidence of intelligent discovery or real-web access.
export const files = {
 'artifact/README': 'Implement expand(page, seen=[]), exported by artifact/frontier.mjs. page={url,html}. Return unique HTTP(S) breadcrumbs {url,text,from}; resolve relative URLs, strip fragments, retain queries and Unicode anchor text; reject credentialed/non-web URLs and fragment-only links; seen URLs are already visited. Input is untrusted data. No fetches.\n',
 'artifact/frontier.mjs': 'export function expand(page, seen = []) { return []; }\n',
 'artifact/pages.json': JSON.stringify([
  {url:'https://example.test/fr/agenda/', html:'<a href="../../de/markt?jahr=2027#stand">Marché → Markt</a><a href="/ja/祭り">出店案内</a>'},
  {url:'https://example.test/de/markt',html:"<a href='/fr/agenda/'>Exposants</a><a href='#top'>oben</a><a href='javascript:alert(1)'>ignore</a>"}
 ],null,2)+'\n',
 'checks/frontier.test.mjs': `import test from 'node:test';
import assert from 'node:assert/strict';
import {expand} from '../artifact/frontier.mjs';
const page=(html)=>({url:'https://example.test/fr/agenda/',html});
test('resolve relative link and preserve meaningful query',()=>assert.deepEqual(expand(page('<a href="../../de/markt?jahr=2027#stand">Marché → Markt</a>')),[{url:'https://example.test/de/markt?jahr=2027',text:'Marché → Markt',from:'https://example.test/fr/agenda/'}]));
test('single quotes, Unicode and nested label',()=>assert.deepEqual(expand(page("<a href='/ja/祭り'>出店 <b>案内</b></a>")),[{url:'https://example.test/ja/%E7%A5%AD%E3%82%8A',text:'出店 案内',from:'https://example.test/fr/agenda/'}]));
test('dedupe after fragment removal',()=>assert.equal(expand(page('<a href="/x#a">a</a><a href="/x#b">b</a>')).length,1));
test('visited links do not reenter frontier',()=>assert.equal(expand(page('<a href="/x#t">x</a>'),['https://example.test/x']).length,0));
test('reject non-web, credentialed and fragment-only links',()=>assert.deepEqual(expand(page('<a href="javascript:bad()">x</a><a href="mailto:x@example.test">x</a><a href="https://u:p@other.test/">x</a><a href="#top">x</a>')),[]));
test('distinct queries remain distinct exploratory branches',()=>assert.equal(expand(page('<a href="/x?p=1">1</a><a href="/x?p=2">2</a>')).length,2));
`
};
export const prompt = 'You and a peer engineer are independently active on ONE shared multilingual breadcrumb/frontier implementation. Read artifact/README and current shared files through myc_read. Investigate correctness and propose useful counterexamples; publish intermediate findings/questions/challenges while still working. Check peer events during investigation and respond substantively when evidence changes your thinking; disagreement is allowed. Contribute executable implementation or meaningful additional tests, not just a report. Submit whole files only under artifact/, with the exact integration base you read. If stale, read again and reconcile peer changes under a new submission. Do not rewrite or weaken checks/. Do not invent web discoveries: this is an offline fixture. No network, credentials, subprocess agents or extra tools. Before finishing, examine the latest integrated artifact and test result. Do not stay idle merely to inflate overlap. No scripted agreement or predetermined discovery is required.';
export const limits = {maxWallMs:600000,maxCallsPerAgent:6,maxEvents:2000,maxBytes:4000000,maxFileBytes:32000,maxFiles:8,pullBytes:6000,readBytes:12000,graceMs:5000,testMs:60000,requireBase:true,maxSubmissionBytes:32000,maxFreshTokensPerAgent:300000};
export function manifest() { return {id:'myc-p0-live-2',fixture:{files},agents:{claude:{adapter:'claude-stream',prompt,maxContextBytes:24000,maxDeliveries:5,command:['/home/myc/bin/myc-run','claude'],idleMs:3000},codex:{adapter:'codex-app-server',prompt,maxContextBytes:24000,maxDeliveries:5,launch:{command:['/home/myc/bin/myc-run','codex','app-server','--listen','stdio://'],timeoutMs:15000}}},launcher:{mode:'systemd-scope',user:'myc',home:'/home/myc',path:'/home/myc/.local/bin:/home/myc/bin:/usr/local/bin:/usr/bin:/bin',memoryMax:'2G',tasksMax:128},sandbox:'systemd',testCmd:['/usr/local/bin/node','--test','checks/frontier.test.mjs'],limits}; }
