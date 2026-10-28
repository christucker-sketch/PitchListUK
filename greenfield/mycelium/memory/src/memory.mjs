import { randomUUID, createHash } from 'node:crypto';

function object(value) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('Metadata must be a JSON object.');
  return JSON.stringify(value);
}

// C10: no secrets in memory. History is immutable (002), so a stored secret could never be removed: refuse at write time.
const SECRET_RE = new RegExp([
  '-----BEGIN [A-Z ]*PRIVATE KEY-----', '\\bgh[pousr]_[A-Za-z0-9]{20,}', '\\bgithub_pat_[A-Za-z0-9_]{20,}',
  '\\bsk-[A-Za-z0-9_-]{20,}', '\\bxox[abprs]-[A-Za-z0-9-]{10,}', '\\bAKIA[0-9A-Z]{16}\\b', '\\bapi-[A-Za-z0-9]{20,}',
  'postgres(?:ql)?://[^:\\s/]+:[^@\\s]+@'].join('|'));
function noSecrets(...parts) {
  for (const p of parts) if (typeof p === 'string' && SECRET_RE.test(p)) throw new Error('Refused: content matches a credential pattern.');
}

// Turn 3 (concurrent firing) and C10 (retries): a stable id derived from what it identifies.
export function derivedId(...parts) {
  const h = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Append-only API: evolution, contradictions and corrections are new nodes/edges/assessments, not overwritten history.
export function nodeInsert({ id = randomUUID(), kind, title = '', body = '', attributes = {}, provenance = {}, observedAt = null,
  validFrom = null, validTo = null }) {
  const a = object(attributes), p = object(provenance); noSecrets(kind, title, body, a, p);
  return { text: `INSERT INTO mycelium_memory.nodes
    (id,kind,title,body,attributes,provenance,observed_at,valid_from,valid_to) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
    ON CONFLICT (id) DO NOTHING RETURNING id`,
    same: `SELECT (kind=$2 AND title=$3 AND body=$4 AND attributes=$5::jsonb AND provenance=$6::jsonb
      AND observed_at IS NOT DISTINCT FROM $7::timestamptz AND valid_from IS NOT DISTINCT FROM $8::timestamptz
      AND valid_to IS NOT DISTINCT FROM $9::timestamptz) AS same FROM mycelium_memory.nodes WHERE id=$1`,
    values: [id, kind, title, body, a, p, observedAt, validFrom, validTo] };
}

export function edgeInsert({ id = randomUUID(), source, target, relation, attributes = {}, provenance = {} }) {
  const a = object(attributes), p = object(provenance); noSecrets(relation, a, p);
  return { text: `INSERT INTO mycelium_memory.edges
    (id,source_id,target_id,relation,attributes,provenance) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
    ON CONFLICT (id) DO NOTHING RETURNING id`,
    same: `SELECT (source_id=$2 AND target_id=$3 AND relation=$4 AND attributes=$5::jsonb AND provenance=$6::jsonb) AS same
      FROM mycelium_memory.edges WHERE id=$1`,
    values: [id, source, target, relation, a, p] };
}

export function assessmentInsert({ id = randomUUID(), node = null, edge = null, stance, weight, assessor, basis, independenceKey,
  supersedes = null, validFrom = null, validTo = null }) {
  noSecrets(assessor, independenceKey);
  return { text: `INSERT INTO mycelium_memory.assessments
    (id,node_id,edge_id,stance,weight,assessor,basis_id,independence_key,supersedes,valid_from,valid_to)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING RETURNING id`,
    same: `SELECT (node_id IS NOT DISTINCT FROM $2::uuid AND edge_id IS NOT DISTINCT FROM $3::uuid AND stance=$4 AND weight=$5::real
      AND assessor=$6 AND basis_id=$7 AND independence_key=$8 AND supersedes IS NOT DISTINCT FROM $9::uuid
      AND valid_from IS NOT DISTINCT FROM $10::timestamptz AND valid_to IS NOT DISTINCT FROM $11::timestamptz) AS same
      FROM mycelium_memory.assessments WHERE id=$1`,
    values: [id, node, edge, stance, weight, assessor, basis, independenceKey, supersedes, validFrom, validTo] };
}

export const PREDICATES = ['condition_changed', 'evidence_added', 'contradiction_added', 'not_before'];
const LIMITS = { connections: 500, depth: 6, results: 1000, perLevel: 2000 };

export function createMemory(db, { maxDatabaseBytes = 900 * 1024 * 1024 } = {}) {
  // X2 / turn 3: admission throttles by measured capacity, never by topic or kind. History is never touched.
  async function admit() {
    const [r] = await db.query('SELECT pg_database_size(current_database())::bigint AS bytes');
    if (Number(r.bytes) >= maxDatabaseBytes) throw new Error(`Memory budget reached (${r.bytes} of ${maxDatabaseBytes} bytes); not admitted, retry later.`);
  }
  // Supplied ids make retries safe: an identical retry returns the id; a different payload under the same id is refused.
  async function insert(q) {
    await admit();
    const rows = await db.query(q.text, q.values);
    if (rows.length === 1) return rows[0].id;
    const [s] = await db.query(q.same, q.values);
    if (s?.same) return q.values[0];
    throw new Error(`Id ${q.values[0]} already exists with a different payload; nothing written.`);
  }
  const memory = {
    async appendNode(node) { return insert(nodeInsert(node)); },          // async: validation errors become rejections
    async appendEdge(edge) { return insert(edgeInsert(edge)); },
    async appendAssessment(a) { return insert(assessmentInsert(a)); },
    async getNode(id) { return (await db.query('SELECT * FROM mycelium_memory.nodes WHERE id=$1', [id]))[0] ?? null; },

    // C10: relation filter and keyset paging. Pass the last row's {recorded_at, id} as `after` for the next page.
    async connections(id, { relation = null, after = null, limit = 100 } = {}) {
      const n = Math.min(Math.max(1, limit | 0), LIMITS.connections);
      return db.query(`SELECT * FROM mycelium_memory.edges WHERE (source_id=$1 OR target_id=$1)
        AND ($2::text IS NULL OR relation=$2)
        AND ($3::timestamptz IS NULL OR (recorded_at, id) > ($3::timestamptz, $4::uuid))
        ORDER BY recorded_at, id LIMIT ${n}`, [id, relation, after?.recorded_at ?? null, after?.id ?? null]);
    },

    // C10: cycle-safe traversal with a global visited set (not per-path), depth and result budgets, both directions.
    async neighbourhood(id, { relations = null, maxDepth = 3, maxResults = 200 } = {}) {
      const depthCap = Math.min(Math.max(1, maxDepth | 0), LIMITS.depth), resultCap = Math.min(Math.max(1, maxResults | 0), LIMITS.results);
      const seen = new Map([[id, 0]]), edges = new Map(); let frontier = [id], truncated = false;
      for (let d = 1; d <= depthCap && frontier.length; d++) {
        const rows = await db.query(`SELECT id, source_id, target_id, relation FROM mycelium_memory.edges
          WHERE (source_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])) AND ($2::text[] IS NULL OR relation = ANY($2::text[]))
          ORDER BY recorded_at, id LIMIT ${LIMITS.perLevel + 1}`, [frontier, relations]);
        if (rows.length > LIMITS.perLevel) { truncated = true; rows.length = LIMITS.perLevel; }
        const next = [];
        for (const e of rows) {
          edges.set(e.id, e);
          for (const other of [e.source_id, e.target_id]) {
            if (seen.has(other)) continue;
            if (seen.size - 1 >= resultCap) { truncated = true; continue; }
            seen.set(other, d); next.push(other);
          }
        }
        frontier = next;
      }
      if (frontier.length && depthCap === LIMITS.depth) truncated = true;
      return { nodes: [...seen].filter(([n]) => n !== id).map(([n, depth]) => ({ id: n, depth })), edges: [...edges.values()], truncated };
    },

    // X2 + turn 3: belief is derived at read time from heads only; correlated evidence (one independence_key) counts once.
    async belief({ node = null, edge = null }) {
      if ((node === null) === (edge === null)) throw new Error('Give exactly one of node or edge.');
      const col = node !== null ? 'node_id' : 'edge_id', subject = node ?? edge;
      const stances = await db.query(`WITH k AS (SELECT stance, independence_key, max(weight) AS w FROM mycelium_memory.assessment_heads
          WHERE ${col}=$1 GROUP BY stance, independence_key)
        SELECT stance, count(*)::int AS independent_sources, sum(w)::float8 AS weight FROM k GROUP BY stance ORDER BY stance`, [subject]);
      const conflicts = await db.query(`SELECT assessor, count(*)::int AS heads FROM mycelium_memory.assessment_heads
        WHERE ${col}=$1 GROUP BY assessor HAVING count(*) > 1 ORDER BY assessor`, [subject]);
      return { stances, conflictingHeads: conflicts };
    },

    // Turn 3: a revisit trigger is an immutable node; a later `cancels` edge cancels it; firing creates a probe, never mutates.
    async appendRevisitTrigger({ target, predicate, params = {}, provenance = {} }) {
      if (!PREDICATES.includes(predicate)) throw new Error(`Unknown revisit predicate ${predicate}; allowed: ${PREDICATES.join(', ')}.`);
      if (predicate === 'condition_changed' && !(params.condition && params.kind)) throw new Error('condition_changed needs params.condition and params.kind.');
      if (predicate === 'not_before' && !(params.at && !Number.isNaN(Date.parse(params.at)))) throw new Error('not_before needs params.at (a timestamp).');
      const t = await memory.appendNode({ kind: 'revisit_trigger', attributes: { predicate, params, target }, provenance });
      await memory.appendEdge({ source: t, target, relation: 'revisits', provenance });
      return t;
    },
    async cancelRevisitTrigger(trigger, { by, provenance = {} }) {
      return memory.appendEdge({ source: by, target: trigger, relation: 'cancels', provenance });
    },
    // (trigger, cause) pairs whose predicate holds, for triggers not cancelled and causes not yet fired.
    async dueRevisits(now = new Date().toISOString()) {
      return db.query(`WITH t AS (
          SELECT n.id, n.recorded_at, n.attributes->>'predicate' AS predicate, n.attributes->'params' AS params,
                 (n.attributes->>'target')::uuid AS target
          FROM mycelium_memory.nodes n WHERE n.kind = 'revisit_trigger'
            AND NOT EXISTS (SELECT 1 FROM mycelium_memory.edges c WHERE c.target_id = n.id AND c.relation = 'cancels')),
        due AS (
          SELECT t.id AS trigger, t.target, t.predicate, 'time:' || (t.params->>'at') AS cause FROM t
            WHERE t.predicate = 'not_before' AND (t.params->>'at')::timestamptz <= $1::timestamptz
          UNION ALL
          SELECT t.id, t.target, t.predicate, a.id::text FROM t JOIN mycelium_memory.assessments a
            ON (a.node_id = t.target OR a.edge_id = t.target) AND a.recorded_at > t.recorded_at WHERE t.predicate = 'evidence_added'
          UNION ALL
          SELECT t.id, t.target, t.predicate, a.id::text FROM t JOIN mycelium_memory.assessments a
            ON (a.node_id = t.target OR a.edge_id = t.target) AND a.stance = 'contradicts' AND a.recorded_at > t.recorded_at
            WHERE t.predicate = 'contradiction_added'
          UNION ALL
          SELECT t.id, t.target, t.predicate, e.id::text FROM t JOIN mycelium_memory.edges e
            ON e.target_id = t.target AND e.relation = 'contradicts' AND e.recorded_at > t.recorded_at WHERE t.predicate = 'contradiction_added'
          UNION ALL
          SELECT t.id, t.target, t.predicate, n.id::text FROM t
            JOIN mycelium_memory.edges e ON e.target_id = (t.params->>'condition')::uuid
            JOIN mycelium_memory.nodes n ON n.id = e.source_id AND n.kind = t.params->>'kind' AND n.recorded_at > t.recorded_at
            WHERE t.predicate = 'condition_changed')
        SELECT DISTINCT trigger, target, predicate, cause FROM due d
        WHERE NOT EXISTS (SELECT 1 FROM mycelium_memory.edges f JOIN mycelium_memory.nodes p ON p.id = f.source_id
          WHERE f.target_id = d.trigger AND f.relation = 'fired_from' AND p.attributes->>'cause' = d.cause)
        ORDER BY trigger, cause`, [now]);
    },
    // Idempotent under concurrency: the probe id is derived from (trigger, cause), so a second firing returns the same probe.
    // Its payload is fully determined by (trigger, target, cause), so concurrent firers write identical rows.
    async fireRevisit({ trigger, target, cause }) {
      const probe = derivedId('revisit', trigger, cause), provenance = { fired_by: 'revisit_trigger' };
      await memory.appendNode({ id: probe, kind: 'probe', attributes: { trigger, cause, target }, provenance });
      await memory.appendEdge({ id: derivedId('fired_from', probe), source: probe, target: trigger, relation: 'fired_from', provenance });
      await memory.appendEdge({ id: derivedId('revisits', probe), source: probe, target, relation: 'revisits', provenance });
      return probe;
    }
  };
  return memory;
}
