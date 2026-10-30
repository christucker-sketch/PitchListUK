// Session stream: the ONE append-only record of a live Claude+Codex session. Single writer (the coordinator process), so
// ordering needs no cross-process locking: every event gets the next seq, is appended as one JSON line and fsync'ed before
// anyone is told about it. Events are deduplicated by id (a retried delivery never appears twice). Bounded: at most
// maxEvents events and maxBytes bytes; past that, append refuses and the coordinator stops the session.
import { openSync, writeSync, fsyncSync, closeSync, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const KINDS = ['start', 'note', 'finding', 'question', 'challenge', 'reply', 'commit', 'merged', 'conflict', 'refused', 'call', 'limit', 'stop', 'done', 'error'];
export const ACTORS = ['claude', 'codex', 'coordinator'];
const BODY_MAX = 4000;

export function validateEvent(e) {
  if (!e || typeof e !== 'object') throw new Error('event must be an object');
  if (!ACTORS.includes(e.actor)) throw new Error(`bad actor ${e.actor}`);
  if (!KINDS.includes(e.kind)) throw new Error(`bad kind ${e.kind}`);
  if (typeof e.body !== 'string' || e.body.length > BODY_MAX) throw new Error(`body must be text of at most ${BODY_MAX} characters`);
  if (e.refs !== undefined && (!Array.isArray(e.refs) || e.refs.length > 8 || e.refs.some(r => !Number.isInteger(r) || r < 1))) throw new Error('refs must list up to 8 earlier seq numbers');
  if (e.id !== undefined && (typeof e.id !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(e.id))) throw new Error('bad id');
  return e;
}

export function openBus(path, { session, maxEvents = 2000, maxBytes = 4_000_000 } = {}) {
  const events = [], ids = new Set(); let bytes = 0;
  if (existsSync(path)) for (const line of readFileSync(path, 'utf8').split('\n')) if (line) { const e = JSON.parse(line); events.push(e); ids.add(e.id); bytes += Buffer.byteLength(line) + 1; }
  const fd = openSync(path, 'a');
  const listeners = new Set();
  return {
    // returns the stored event, or the EXISTING one for a duplicate id; throws when the stream is full or the event is invalid
    append(input) {
      const e = validateEvent({ ...input });
      if (e.id && ids.has(e.id)) return events.find(x => x.id === e.id);
      for (const r of e.refs ?? []) if (r > events.length) throw new Error(`ref ${r} points to an event that does not exist yet`);
      const ev = { seq: events.length + 1, id: e.id ?? randomUUID(), at: new Date().toISOString(), session, actor: e.actor, kind: e.kind, refs: e.refs ?? [], body: e.body, ...(e.data !== undefined ? { data: e.data } : {}) };
      const line = JSON.stringify(ev);
      if (events.length + 1 > maxEvents || bytes + line.length + 1 > maxBytes) throw new Error('session stream is full');
      writeSync(fd, line + '\n'); fsyncSync(fd);
      events.push(ev); ids.add(ev.id); bytes += Buffer.byteLength(line) + 1;
      for (const l of listeners) l(ev);
      return ev;
    },
    since: seq => events.slice(seq),
    get: seq => events[seq - 1],
    all: () => events.slice(),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { closeSync(fd); }
  };
}
