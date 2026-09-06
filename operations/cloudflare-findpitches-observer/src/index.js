const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: jsonHeaders });
}

function unauthorized() {
  return json({ ok: false, error: 'unauthorized' }, 401);
}

function normalizeLimit(value, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function safeSource(value) {
  const source = String(value || '').trim();
  if (!source || source.length > 100) throw new Error('invalid source');
  return source;
}

function safeObservedAt(value) {
  const text = String(value || '').trim();
  const date = text ? new Date(text) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('invalid observed_at');
  return date.toISOString();
}

function parseBearer(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ''));
  const right = new TextEncoder().encode(String(b || ''));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function ingest(request, env) {
  if (!env.INGEST_TOKEN || !constantTimeEqual(parseBearer(request), env.INGEST_TOKEN)) {
    return unauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const source = safeSource(body.source);
  const observedAt = safeObservedAt(body.observed_at);
  const receivedAt = new Date().toISOString();
  const status = body.status && typeof body.status === 'object' ? body.status : null;
  const events = Array.isArray(body.events) ? body.events.slice(0, 250) : [];

  const statements = [];

  if (status) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO latest_status (source, observed_at, received_at, payload_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET
          observed_at = excluded.observed_at,
          received_at = excluded.received_at,
          payload_json = excluded.payload_json
      `).bind(source, observedAt, receivedAt, JSON.stringify(status))
    );
  }

  for (const event of events) {
    const message = String(event?.message || '').trim().slice(0, 4000);
    if (!message) continue;
    const level = String(event?.level || 'info').slice(0, 20);
    const eventType = String(event?.event_type || 'log').slice(0, 80);
    const eventObservedAt = safeObservedAt(event?.observed_at || observedAt);
    const payload = event?.payload && typeof event.payload === 'object'
      ? JSON.stringify(event.payload)
      : null;
    statements.push(
      env.DB.prepare(`
        INSERT INTO events
          (source, observed_at, received_at, level, event_type, message, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(source, eventObservedAt, receivedAt, level, eventType, message, payload)
    );
  }

  if (statements.length) await env.DB.batch(statements);

  return json({ ok: true, source, status_written: Boolean(status), events_written: statements.length - (status ? 1 : 0), received_at: receivedAt });
}

async function getStatus(url, env) {
  const source = url.searchParams.get('source');
  const query = source
    ? env.DB.prepare('SELECT source, observed_at, received_at, payload_json FROM latest_status WHERE source = ?').bind(source)
    : env.DB.prepare('SELECT source, observed_at, received_at, payload_json FROM latest_status ORDER BY received_at DESC');
  const result = await query.all();
  const rows = (result.results || []).map((row) => ({
    source: row.source,
    observed_at: row.observed_at,
    received_at: row.received_at,
    status: JSON.parse(row.payload_json)
  }));
  return json(source ? (rows[0] || null) : rows);
}

async function getEvents(url, env) {
  const limit = normalizeLimit(url.searchParams.get('limit'));
  const source = url.searchParams.get('source');
  const rows = source
    ? await env.DB.prepare(`
        SELECT id, source, observed_at, received_at, level, event_type, message, payload_json
        FROM events WHERE source = ? ORDER BY id DESC LIMIT ?
      `).bind(source, limit).all()
    : await env.DB.prepare(`
        SELECT id, source, observed_at, received_at, level, event_type, message, payload_json
        FROM events ORDER BY id DESC LIMIT ?
      `).bind(limit).all();

  return json((rows.results || []).map((row) => ({
    ...row,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    payload_json: undefined
  })));
}

async function health(env) {
  const latest = await env.DB.prepare('SELECT MAX(received_at) AS received_at FROM latest_status').first();
  return json({ ok: true, service: 'findpitches-observer', latest_received_at: latest?.received_at || null, now: new Date().toISOString() });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/ingest') return await ingest(request, env);
      if (request.method === 'GET' && url.pathname === '/status') return await getStatus(url, env);
      if (request.method === 'GET' && url.pathname === '/events') return await getEvents(url, env);
      if (request.method === 'GET' && url.pathname === '/health') return await health(env);
      return json({
        ok: true,
        service: 'findpitches-observer',
        endpoints: ['GET /health', 'GET /status', 'GET /events?limit=100', 'POST /ingest']
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 500);
    }
  }
};
