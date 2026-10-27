import { randomUUID } from 'node:crypto';

function object(value) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('Metadata must be a JSON object.');
  return JSON.stringify(value);
}

// Append-only API: evolution, contradictions and corrections are new nodes/edges, not overwritten history.
export function nodeInsert({ id = randomUUID(), kind, title = '', body = '', attributes = {}, provenance = {}, observedAt = null }) {
  return { text: `INSERT INTO mycelium_memory.nodes
    (id,kind,title,body,attributes,provenance,observed_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id`,
    values: [id, kind, title, body, object(attributes), object(provenance), observedAt] };
}

export function edgeInsert({ id = randomUUID(), source, target, relation, attributes = {}, provenance = {} }) {
  return { text: `INSERT INTO mycelium_memory.edges
    (id,source_id,target_id,relation,attributes,provenance) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id`,
    values: [id, source, target, relation, object(attributes), object(provenance)] };
}

export function createMemory(db) {
  return {
    async appendNode(node) { const q = nodeInsert(node); return (await db.query(q.text, q.values))[0].id; },
    async appendEdge(edge) { const q = edgeInsert(edge); return (await db.query(q.text, q.values))[0].id; },
    async getNode(id) { return (await db.query('SELECT * FROM mycelium_memory.nodes WHERE id=$1', [id]))[0] ?? null; },
    async connections(id) {
      return db.query('SELECT * FROM mycelium_memory.edges WHERE source_id=$1 OR target_id=$1 ORDER BY recorded_at,id LIMIT 100', [id]);
    }
  };
}
