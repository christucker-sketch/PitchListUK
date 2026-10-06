import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMutationCount} from '../../operations/findpitches-v3/controlled-pilot.mjs';
test('pilot integrity checks detect deleted or changed prior facts while allowing appended evidence',()=>{
  const before={records:{one:'a'},facts:{fact:'b'}};
  assert.equal(sourceMutationCount(before,{records:{one:'a',two:'c'},facts:{fact:'b',fresh:'d'}}),0);
  assert.equal(sourceMutationCount(before,{records:{one:'x'},facts:{}}),2);
});
