// Bounded JSON-lines app-server transport. No process launch, credentials, network or retries.
import { StringDecoder } from 'node:string_decoder';

export class CodexRpc {
  constructor({ readable, writable, timeoutMs = 5000, maxBytes = 65536, maxPending = 8 }) {
    Object.assign(this, { readable, writable, timeoutMs, maxBytes, maxPending });
    this.pending = new Map(); this.next = 0; this.buffer = ''; this.decoder = new StringDecoder('utf8');
    this.inbound = 0; this.notifications = Promise.resolve();
    this.onNotification = () => {}; this.onRequest = async () => { throw new Error('unsupported server request'); };
    this.onFailure = () => {};
    readable.on('data', chunk => {
      try {
        if (chunk.length > maxBytes * maxPending) throw new Error('RPC input burst limit');
        this.buffer += this.decoder.write(Buffer.from(chunk));
        let i;
        while ((i = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, i); this.buffer = this.buffer.slice(i + 1);
          if (Buffer.byteLength(line) > maxBytes) throw new Error('RPC frame too large');
          if (line.trim()) this.receive(JSON.parse(line));
        }
        if (Buffer.byteLength(this.buffer) > maxBytes) throw new Error('RPC frame too large');
      } catch (e) { this.fail(e); }
    });
    readable.on('end', () => this.fail(new Error('app-server closed; dispatch outcome may be unknown')));
    readable.on('error', e => this.fail(e)); writable.on('error', e => this.fail(e));
  }
  write(message) {
    if (this.closed) throw this.closed;
    const line = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(line) > this.maxBytes) throw new Error('RPC outbound frame too large');
    if (!this.writable.write(line)) this.fail(new Error('RPC backpressure; stop instead of buffering indefinitely'));
  }
  request(method, params) {
    if (this.closed) return Promise.reject(this.closed);
    if (this.pending.size >= this.maxPending) return Promise.reject(new Error('RPC pending limit'));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`RPC timeout ${method}; outcome unknown, never retry automatically`)), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (e) { this.fail(e); }
    });
  }
  notify(method, params) { this.write({ method, ...(params ? { params } : {}) }); }
  receive(m) {
    if (this.closed) return;
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('bad RPC envelope');
    if (typeof m.method === 'string') {
      if (++this.inbound > this.maxPending) throw new Error('RPC inbound work limit');
      if (m.id !== undefined) {
        Promise.resolve().then(() => this.onRequest(m)).then(result => {
          this.write({ id: m.id, result });
        }).catch(e => { try { this.write({ id: m.id, error: { code: -32603, message: 'session request refused' } }); } catch {} this.fail(e); }).finally(() => { this.inbound--; });
      } else {
        this.notifications = this.notifications.then(() => this.onNotification(m)).catch(e => this.fail(e)).finally(() => { this.inbound--; });
      }
    } else {
      const p = this.pending.get(m.id);
      if (!p) throw new Error('unexpected or duplicate RPC response');
      this.pending.delete(m.id); clearTimeout(p.timer);
      if (m.error) p.reject(Object.assign(new Error(`app-server refused: ${m.error.code}`), { rpcError: m.error }));
      else if (!Object.hasOwn(m, 'result')) p.reject(new Error('RPC response missing result'));
      else p.resolve(m.result);
    }
  }
  fail(error) {
    if (this.closed) return;
    this.closed = error;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.onFailure(error);
  }
  close() { this.fail(new Error('RPC closed')); }
}
