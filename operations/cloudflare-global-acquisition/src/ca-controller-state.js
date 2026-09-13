import { DurableObject } from 'cloudflare:workers';

import { sha256Hex, validateControllerStateText } from '../lib/controller-state-codec.mjs';

function validSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
}

export class CaControllerStateDurableObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ca_controller_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        payload TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        source TEXT NOT NULL,
        authority TEXT NOT NULL
      )
    `);
  }

  readRow() {
    const rows = [...this.ctx.storage.sql.exec(`
      SELECT version, sha256, payload, imported_at, source, authority
      FROM ca_controller_state
      WHERE singleton = 1
    `)];
    return rows[0] || null;
  }

  async write(raw, { source, authority }) {
    const parsed = validateControllerStateText(raw);
    if (parsed.controller_kind !== 'ca') throw new Error('ca_controller_snapshot_kind_invalid');
    if (!['shadow', 'authoritative'].includes(authority)) throw new Error('ca_controller_authority_invalid');
    const previous = this.readRow();
    const version = Number(previous?.version || 0) + 1;
    const sha256 = await sha256Hex(raw);
    const importedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(`
      INSERT INTO ca_controller_state (singleton, version, sha256, payload, imported_at, source, authority)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        version = excluded.version,
        sha256 = excluded.sha256,
        payload = excluded.payload,
        imported_at = excluded.imported_at,
        source = excluded.source,
        authority = excluded.authority
    `, version, sha256, raw, importedAt, source, authority);
    return { version, sha256, imported_at: importedAt, source, authority };
  }

  precondition(request, row) {
    const version = Number(request.headers.get('x-findpitches-expected-state-version'));
    const sha256 = String(request.headers.get('x-findpitches-expected-state-sha256') || '').trim().toLowerCase();
    if (!Number.isInteger(version) || version <= 0 || !validSha256(sha256)) return { error: 'ca_controller_checkpoint_precondition_invalid', status: 400 };
    if (Number(row.version) !== version || String(row.sha256).toLowerCase() !== sha256) return { error: 'ca_controller_state_precondition_failed', status: 409 };
    return null;
  }

  async importSnapshot(request) {
    if (this.readRow()) return Response.json({ ok: false, error: 'ca_controller_state_already_initialized' }, { status: 409 });
    const authority = request.headers.get('x-findpitches-state-authority') || 'shadow';
    const source = request.headers.get('x-findpitches-state-source') || 'cloudflare-ca-controller-bootstrap';
    const written = await this.write(await request.text(), { source, authority });
    return Response.json({ ok: true, changed: true, ...written }, { status: 201 });
  }

  async checkpoint(request) {
    const row = this.readRow();
    if (!row) return Response.json({ ok: false, error: 'ca_controller_state_not_initialized' }, { status: 404 });
    if (row.authority !== 'authoritative') return Response.json({ ok: false, error: 'ca_controller_state_not_authoritative', current_authority: row.authority }, { status: 409 });
    const failure = this.precondition(request, row);
    if (failure) return Response.json({ ok: false, error: failure.error, current: { version: row.version, sha256: row.sha256, authority: row.authority } }, { status: failure.status });
    const written = await this.write(await request.text(), { source: 'cloudflare-ca-controller', authority: 'authoritative' });
    return Response.json({ ok: true, changed: true, ...written }, { status: 201 });
  }

  async transitionAuthority(request, targetAuthority) {
    const row = this.readRow();
    if (!row) return Response.json({ ok: false, error: 'ca_controller_state_not_initialized' }, { status: 404 });
    let body;
    try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'ca_controller_authority_payload_invalid' }, { status: 400 }); }
    const expectedVersion = Number(body?.expected_version);
    const expectedSha256 = String(body?.expected_sha256 || '').trim().toLowerCase();
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || !validSha256(expectedSha256)) {
      return Response.json({ ok: false, error: 'ca_controller_authority_precondition_invalid' }, { status: 400 });
    }
    if (Number(row.version) !== expectedVersion || String(row.sha256).toLowerCase() !== expectedSha256) {
      return Response.json({ ok: false, error: 'ca_controller_state_precondition_failed', current: { version: row.version, sha256: row.sha256, authority: row.authority } }, { status: 409 });
    }
    if (row.authority === targetAuthority) return Response.json({ ok: true, changed: false, state: { version: row.version, sha256: row.sha256, authority: row.authority, source: row.source, imported_at: row.imported_at } });
    const expectedCurrent = targetAuthority === 'authoritative' ? 'shadow' : 'authoritative';
    if (row.authority !== expectedCurrent) return Response.json({ ok: false, error: 'ca_controller_authority_transition_invalid', current_authority: row.authority }, { status: 409 });
    const state = validateControllerStateText(row.payload);
    if (state.controller_kind !== 'ca') return Response.json({ ok: false, error: 'ca_controller_snapshot_kind_invalid' }, { status: 409 });
    if (targetAuthority === 'authoritative') {
      if (state.active_instance || state.cloud_controller_intent || state.pending_source_pr || state.pending_data_pr || state.pending_deployment) {
        return Response.json({ ok: false, error: 'ca_controller_promotion_requires_clean_checkpoint' }, { status: 409 });
      }
      if (!['ready_discovery', 'ready_acquisition'].includes(state.status)) {
        return Response.json({ ok: false, error: 'ca_controller_promotion_status_invalid', status_value: state.status }, { status: 409 });
      }
    }
    this.ctx.storage.sql.exec(`
      UPDATE ca_controller_state
      SET authority = ?, source = ?
      WHERE singleton = 1 AND version = ? AND sha256 = ? AND authority = ?
    `, targetAuthority, targetAuthority === 'authoritative' ? 'cloudflare-ca-controller-cutover' : 'cloudflare-ca-controller-rollback', expectedVersion, expectedSha256, expectedCurrent);
    const updated = this.readRow();
    if (!updated || updated.authority !== targetAuthority) return Response.json({ ok: false, error: 'ca_controller_authority_transition_failed' }, { status: 409 });
    return Response.json({ ok: true, changed: true, state: { version: updated.version, sha256: updated.sha256, authority: updated.authority, source: updated.source, imported_at: updated.imported_at } });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/meta') {
      const row = this.readRow();
      return row
        ? Response.json({ ok: true, state: { version: row.version, sha256: row.sha256, imported_at: row.imported_at, source: row.source, authority: row.authority } })
        : Response.json({ ok: false, error: 'ca_controller_state_not_initialized' }, { status: 404 });
    }
    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const row = this.readRow();
      if (!row) return Response.json({ ok: false, error: 'ca_controller_state_not_initialized' }, { status: 404 });
      return new Response(row.payload, { headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-findpitches-state-version': String(row.version),
        'x-findpitches-state-sha256': row.sha256,
        'x-findpitches-state-authority': row.authority,
        'x-findpitches-state-source': row.source,
        'x-findpitches-state-imported-at': row.imported_at
      } });
    }
    if (request.method === 'PUT' && url.pathname === '/snapshot') {
      try { return await this.importSnapshot(request); }
      catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 }); }
    }
    if (request.method === 'PUT' && url.pathname === '/checkpoint') {
      try { return await this.checkpoint(request); }
      catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 }); }
    }
    if (request.method === 'POST' && url.pathname === '/promote') return this.transitionAuthority(request, 'authoritative');
    if (request.method === 'POST' && url.pathname === '/demote') return this.transitionAuthority(request, 'shadow');
    return new Response('Not found', { status: 404 });
  }
}
