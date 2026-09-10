import { DurableObject } from 'cloudflare:workers';

import {
  chunkControllerStateText,
  joinControllerStateChunks,
  sha256Hex,
  validateControllerStateText
} from '../lib/controller-state-codec.mjs';
import { assertControllerCutoverPreflightReady } from '../lib/controller-cutover-preflight.mjs';

function validSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
}

export class ControllerStateDurableObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS controller_state_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        imported_at TEXT NOT NULL,
        source TEXT NOT NULL,
        authority TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS controller_state_chunks (
        version INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (version, chunk_index)
      )
    `);
  }

  readMeta() {
    const rows = [...this.ctx.storage.sql.exec(`
      SELECT version, sha256, byte_length, chunk_count, imported_at, source, authority
      FROM controller_state_meta
      WHERE singleton = 1
    `)];
    return rows[0] || null;
  }

  readSnapshotText(meta = this.readMeta()) {
    if (!meta) return null;
    const rows = [...this.ctx.storage.sql.exec(`
      SELECT chunk_index, payload
      FROM controller_state_chunks
      WHERE version = ?
      ORDER BY chunk_index ASC
    `, meta.version)];
    if (rows.length !== Number(meta.chunk_count)) {
      throw new Error(`Controller state snapshot ${meta.version} is incomplete: ${rows.length}/${meta.chunk_count} chunks`);
    }
    return joinControllerStateChunks(rows.map(row => row.payload));
  }

  async writeSnapshot(raw, { source, authority }) {
    validateControllerStateText(raw);
    const checksum = await sha256Hex(raw);
    const { chunks, bytes } = chunkControllerStateText(raw);
    const previous = this.readMeta();
    const version = Number(previous?.version || 0) + 1;

    for (let index = 0; index < chunks.length; index += 1) {
      this.ctx.storage.sql.exec(`
        INSERT INTO controller_state_chunks (version, chunk_index, payload)
        VALUES (?, ?, ?)
      `, version, index, chunks[index]);
    }

    const reconstructed = joinControllerStateChunks(chunks);
    const reconstructedChecksum = await sha256Hex(reconstructed);
    if (reconstructedChecksum !== checksum) {
      this.ctx.storage.sql.exec('DELETE FROM controller_state_chunks WHERE version = ?', version);
      throw new Error('Controller state chunk verification failed before manifest switch');
    }

    const importedAt = new Date().toISOString();
    this.ctx.storage.sql.exec(`
      INSERT INTO controller_state_meta (
        singleton, version, sha256, byte_length, chunk_count, imported_at, source, authority
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        version = excluded.version,
        sha256 = excluded.sha256,
        byte_length = excluded.byte_length,
        chunk_count = excluded.chunk_count,
        imported_at = excluded.imported_at,
        source = excluded.source,
        authority = excluded.authority
    `, version, checksum, bytes, chunks.length, importedAt, source, authority);

    this.ctx.storage.sql.exec('DELETE FROM controller_state_chunks WHERE version < ?', Math.max(1, version - 2));

    return {
      version,
      sha256: checksum,
      byte_length: bytes,
      chunk_count: chunks.length,
      imported_at: importedAt,
      source,
      authority
    };
  }

  async importSnapshot(request) {
    const raw = await request.text();
    const source = request.headers.get('x-findpitches-state-source') || 'unknown';
    const authority = request.headers.get('x-findpitches-state-authority') || 'shadow';
    if (!['shadow', 'authoritative'].includes(authority)) {
      return Response.json({ ok: false, error: 'invalid_controller_state_authority' }, { status: 400 });
    }
    const written = await this.writeSnapshot(raw, { source, authority });
    return Response.json({ ok: true, ...written }, { status: 201 });
  }

  checkpointPreconditions(request, meta, invalidError) {
    const expectedVersion = Number(request.headers.get('x-findpitches-expected-state-version'));
    const expectedSha256 = String(request.headers.get('x-findpitches-expected-state-sha256') || '').trim().toLowerCase();
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || !validSha256(expectedSha256)) {
      return { error: Response.json({ ok: false, error: invalidError }, { status: 400 }) };
    }
    if (Number(meta.version) !== expectedVersion || String(meta.sha256).toLowerCase() !== expectedSha256) {
      return { error: Response.json({
        ok: false,
        error: 'controller_state_precondition_failed',
        current: { version: meta.version, sha256: meta.sha256, authority: meta.authority }
      }, { status: 409 }) };
    }
    return { expectedVersion, expectedSha256 };
  }

  async checkpointSnapshot(request) {
    const meta = this.readMeta();
    if (!meta) return Response.json({ ok: false, error: 'controller_state_not_initialized' }, { status: 404 });
    if (meta.authority !== 'authoritative') {
      return Response.json({ ok: false, error: 'controller_state_not_authoritative', current_authority: meta.authority }, { status: 409 });
    }

    const precondition = this.checkpointPreconditions(request, meta, 'invalid_controller_checkpoint_precondition');
    if (precondition.error) return precondition.error;
    const raw = await request.text();
    const written = await this.writeSnapshot(raw, {
      source: 'cloudflare-us-controller',
      authority: 'authoritative'
    });
    return Response.json({ ok: true, changed: true, ...written }, { status: 201 });
  }

  async checkpointShadowPreflight(request) {
    const meta = this.readMeta();
    if (!meta) return Response.json({ ok: false, error: 'controller_state_not_initialized' }, { status: 404 });
    if (meta.authority !== 'shadow') {
      return Response.json({ ok: false, error: 'controller_preflight_requires_shadow_authority', current_authority: meta.authority }, { status: 409 });
    }
    const precondition = this.checkpointPreconditions(request, meta, 'invalid_controller_preflight_precondition');
    if (precondition.error) return precondition.error;

    const raw = await request.text();
    let state;
    try {
      validateControllerStateText(raw);
      state = JSON.parse(raw);
      assertControllerCutoverPreflightReady(state);
    } catch (error) {
      return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 });
    }
    const written = await this.writeSnapshot(raw, {
      source: 'cloudflare-us-controller-preflight',
      authority: 'shadow'
    });
    return Response.json({ ok: true, changed: true, ...written }, { status: 201 });
  }

  async transitionAuthority(request, targetAuthority) {
    const meta = this.readMeta();
    if (!meta) return Response.json({ ok: false, error: 'controller_state_not_initialized' }, { status: 404 });

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'invalid_authority_transition_payload' }, { status: 400 });
    }

    const expectedVersion = Number(body?.expected_version);
    const expectedSha256 = String(body?.expected_sha256 || '').trim().toLowerCase();
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || !validSha256(expectedSha256)) {
      return Response.json({ ok: false, error: 'invalid_authority_transition_precondition' }, { status: 400 });
    }

    if (Number(meta.version) !== expectedVersion || String(meta.sha256).toLowerCase() !== expectedSha256) {
      return Response.json({
        ok: false,
        error: 'controller_state_precondition_failed',
        current: { version: meta.version, sha256: meta.sha256, authority: meta.authority }
      }, { status: 409 });
    }

    if (meta.authority === targetAuthority) {
      return Response.json({ ok: true, changed: false, state: meta });
    }

    const expectedCurrentAuthority = targetAuthority === 'authoritative' ? 'shadow' : 'authoritative';
    if (meta.authority !== expectedCurrentAuthority) {
      return Response.json({ ok: false, error: 'invalid_controller_authority_transition', current_authority: meta.authority }, { status: 409 });
    }

    if (targetAuthority === 'authoritative') {
      try {
        const state = JSON.parse(this.readSnapshotText(meta));
        assertControllerCutoverPreflightReady(state);
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
      }
    }

    this.ctx.storage.sql.exec(`
      UPDATE controller_state_meta
      SET authority = ?
      WHERE singleton = 1 AND version = ? AND sha256 = ? AND authority = ?
    `, targetAuthority, expectedVersion, expectedSha256, expectedCurrentAuthority);

    const updated = this.readMeta();
    if (!updated || updated.authority !== targetAuthority || Number(updated.version) !== expectedVersion || String(updated.sha256).toLowerCase() !== expectedSha256) {
      return Response.json({ ok: false, error: 'controller_authority_transition_failed' }, { status: 409 });
    }

    return Response.json({ ok: true, changed: true, state: updated });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/meta') {
      return Response.json({ ok: true, state: this.readMeta() });
    }

    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const meta = this.readMeta();
      if (!meta) return Response.json({ ok: false, error: 'controller_state_not_initialized' }, { status: 404 });
      const text = this.readSnapshotText(meta);
      const checksum = await sha256Hex(text);
      if (checksum !== meta.sha256) {
        return Response.json({ ok: false, error: 'controller_state_checksum_mismatch' }, { status: 500 });
      }
      return new Response(text, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-findpitches-state-version': String(meta.version),
          'x-findpitches-state-sha256': meta.sha256,
          'x-findpitches-state-authority': meta.authority
        }
      });
    }

    if (request.method === 'PUT' && url.pathname === '/snapshot') {
      try {
        return await this.importSnapshot(request);
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 });
      }
    }

    if (request.method === 'PUT' && url.pathname === '/checkpoint') {
      try {
        return await this.checkpointSnapshot(request);
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 });
      }
    }

    if (request.method === 'PUT' && url.pathname === '/preflight') {
      try {
        return await this.checkpointShadowPreflight(request);
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 });
      }
    }

    if (request.method === 'POST' && url.pathname === '/promote') {
      return this.transitionAuthority(request, 'authoritative');
    }

    if (request.method === 'POST' && url.pathname === '/demote') {
      return this.transitionAuthority(request, 'shadow');
    }

    return new Response('Not found', { status: 404 });
  }
}
