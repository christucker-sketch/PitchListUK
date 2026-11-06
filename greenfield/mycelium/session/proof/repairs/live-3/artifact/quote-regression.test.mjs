import test from 'node:test';
import assert from 'node:assert/strict';
import {expand} from './frontier.mjs';
const urls=html=>expand({url:'https://example.test/',html}).map(x=>x.url);
test('quotes inside attribute names or unquoted values do not swallow later anchors',()=>{
 for(const prefix of ["<span don't>ignored</span>",'<span data=x"y>ignored</span>',"<span data=x'y>ignored</span>"])
  assert.deepEqual(urls(prefix+'<a href="/real">real</a>'),['https://example.test/real']);
});
test('a genuinely quoted attribute value may contain > and a fake anchor',()=>{
 assert.deepEqual(urls('<span title="x > <a href=/fake>" ></span><a href=/real>real</a>'),['https://example.test/real']);
});
