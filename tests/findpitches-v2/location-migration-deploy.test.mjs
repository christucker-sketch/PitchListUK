import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/findpitches-v2-shadow-deploy.yml',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../operations/findpitches-v2/migrations/0008_location_evidence_gate.sql',import.meta.url),'utf8');

test('repeat deployment tolerates only the exact already-applied location ALTER',()=>{
 assert.match(workflow,/0008_location_evidence_gate\\.sql/);
 assert.match(workflow,/duplicate column name: location_evidence_url: SQLITE_ERROR/);
 assert.match(workflow,/else\s+exit "\$rc"/);
 assert.match(migration,/ALTER TABLE customer_opportunities ADD COLUMN location_evidence_url TEXT/);
});
