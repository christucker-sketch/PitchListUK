import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalSql } from '../src/schema.mjs';
for (const name of ['001_memory.sql','002_integrity_assessments.sql','003_redaction.sql','runtime_grants.sql']) {
  const source=await readFile(new URL(`../sql/${name}`,import.meta.url),'utf8');
  console.log(`${createHash('sha256').update(canonicalSql(source)).digest('hex')}  ${name} (canonical LF)`);
}
