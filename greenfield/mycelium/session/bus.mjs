// Session stream: the ONE append-only record of a live Claude+Codex session. Exactly one writer (the coordinator) holds
// an exclusive lock file for the stream's lifetime (P0-03). Every event gets the next seq, is appended as one JSON line
// and fsync'ed before anyone is told about it.
// - Deduplication by id is exact (P0-02): retrying the SAME event returns the stored one; reusing an id with a different
//   actor, kind, body, refs or data is a collision and is refused.
// - Bounds are in encoded UTF-8 bytes (P0-01): a record that would cross maxBytes is refused BEFORE anything is written;
//   data payloads are bounded too. Control records (stop, exit, limit, done...) have a reserved headroom so stopping
//   can never be blocked by a full stream.
// - Reopening validates every stored record (P0-04): schema, session, contiguous seq, backward refs. A torn final line
//   (a crash mid-append) is reported as such and is not silently repaired.
import { openSync, writeSync, fsyncSync, closeSync, readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const KINDS = ['start', 'note', 'finding', 'question', 'challenge', 'reply', 'grant', 'call', 'commit', 'merged', 'tested', 'conflict', 'refused', 'limit', 'stop', 'exit', 'done', 'error'];
export const AGENT_KINDS = ['note', 'finding', 'question', 'challenge', 'reply'];   // what a model may publish itself
export const CONTROL_KINDS = ['stop', 'exit', 'limit', 'done', 'error', 'refused'];
export const ACTORS = ['claude', 'codex', 'coordinator'];
const BODY_MAX = 4000, DATA_MAX = 8192, CONTROL_RESERVE = { events: 64, bytes: 128 * 1024 };
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

export function validateEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('event must be an object');
  if (!ACTORS.includes(e.actor)) throw new Error(`bad actor ${e.actor}`);
  if (!KINDS.includes(e.kind)) throw new Error(`bad kind ${e.kind}`);
  if (typeof e.body !== 'string' || Buffer.byteLength(e.body) > BODY_MAX) throw new Error(`body must be text of at most ${BODY_MAX} bytes`);
  if (e.refs !== undefined && (!Array.isArray(e.refs) || e.refs.length > 8 || e.refs.some(r => !Number.isInteger(r) || r < 1))) throw new Error('refs must list up to 8 earlier seq numbers');
  if (e.id !== undefined && (typeof e.id !== 'string' || !/^[A-Za-z0-9._:-]{1,96}$/.test(e.id))) throw new Error('bad id');
  if (e.data !== undefined && Buffer.byteLength(JSON.stringify(e.data)) > DATA_MAX) throw new Error(`data must be at most ${DATA_MAX} bytes of JSON`);
  return e;
}
const same = (a, b) => a.actor === b.actor && a.kind === b.kind && a.body === b.body
  && JSON.stringify(a.refs ?? []) === JSON.stringify(b.refs ?? []) && JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null);

function load(path, session) {
  const events = [], ids = new Map(); let bytes = 0;
  if (!existsSync(path)) return { events, ids, bytes };
  const raw = readFileSync(path, 'utf8'), lines = raw.split('\n');
  const torn = raw.length > 0 && !raw.endsWith('\n');
  lines.forEach((line, i) => {
    if (!line) return;
    const last = i === lines.length - 1;
    let e; try { e = JSON.parse(line); } catch { throw new Error(last && torn ? `torn trailing record in ${path} (a crash during append); not repaired automatically` : `invalid record at line ${i + 1} in ${path}`); }
    try { validateEvent(e); } catch (err) { throw new Error(`invalid record at line ${i + 1}: ${err.message}`); }
    if (e.seq !== events.length + 1) throw new Error(`invalid record at line ${i + 1}: seq ${e.seq}, expected ${events.length + 1}`);
    if (e.session !== session) throw new Error(`invalid record at line ${i + 1}: session ${e.session}, expected ${session}`);
    if (typeof e.at !== 'string' || !ISO.test(e.at)) throw new Error(`invalid record at line ${i + 1}: bad timestamp`);
    if (typeof e.id !== 'string' || ids.has(e.id)) throw new Error(`invalid record at line ${i + 1}: missing or repeated id`);
    if (e.refs.some(r => r >= e.seq)) throw new Error(`invalid record at line ${i + 1}: a ref points forwards`);
    events.push(e); ids.set(e.id, e); bytes += Buffer.byteLength(line) + 1;
  });
  if (torn) throw new Error(`torn trailing record in ${path} (a crash during append); not repaired automatically`);
  return { events, ids, bytes };
}

export function openBus(path, { session, maxEvents = 2000, maxBytes = 4_000_000 } = {}) {
  if (typeof session !== 'string' || !session) throw new Error('session id required');
  const lock = path + '.lock';
  let lfd;
  try { lfd = openSync(lock, 'wx'); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let owner = '?'; try { owner = readFileSync(lock, 'utf8').trim(); } catch {}
    throw new Error(`another writer holds the stream lock ${lock} (pid ${owner}); a stale lock after a crash must be inspected and removed by hand`);
  }
  writeFileSync(lfd, `${process.pid}\n`);
  let st;
  try { st = load(path, session); } catch (e) { closeSync(lfd); unlinkSync(lock); throw e; }
  const { events, ids } = st; let bytes = st.bytes;
  const fd = openSync(path, 'a');
  const listeners = new Set();
  let closed = false;
  return {
    // returns the stored event (also for an exact retry of the same id); throws on collision, invalid input or a full stream
    append(input) {
      if (closed) throw new Error('stream closed');
      const e = validateEvent({ ...input });
      if (e.id && ids.has(e.id)) {
        const prior = ids.get(e.id);
        if (same(prior, e)) return prior;
        throw new Error(`id collision: ${e.id} already names a different event`);
      }
      for (const r of e.refs ?? []) if (r > events.length) throw new Error(`ref ${r} points to an event that does not exist yet`);
      const ev = { seq: events.length + 1, id: e.id ?? randomUUID(), at: new Date().toISOString(), session, actor: e.actor, kind: e.kind, refs: e.refs ?? [], body: e.body, ...(e.data !== undefined ? { data: e.data } : {}) };
      const line = JSON.stringify(ev) + '\n', n = Buffer.byteLength(line);
      const control = e.actor === 'coordinator' && CONTROL_KINDS.includes(e.kind);
      const capE = maxEvents + (control ? CONTROL_RESERVE.events : 0), capB = maxBytes + (control ? CONTROL_RESERVE.bytes : 0);
      if (events.length + 1 > capE || bytes + n > capB) throw new Error('session stream is full');
      writeSync(fd, line); fsyncSync(fd);
      events.push(ev); ids.set(ev.id, ev); bytes += n;
      for (const l of listeners) l(ev);
      return ev;
    },
    since: seq => events.slice(seq),
    get: seq => events[seq - 1],
    byId: id => ids.get(id),
    get head() { return events.length; },
    all: () => events.slice(),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { if (closed) return; closed = true; closeSync(fd); closeSync(lfd); try { unlinkSync(lock); } catch {} }
  };
}
