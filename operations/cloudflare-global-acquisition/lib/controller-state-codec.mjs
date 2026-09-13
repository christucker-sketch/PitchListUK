const DEFAULT_CONTROLLER_STATE_CHUNK_BYTES = 384 * 1024;
const BASE64_CHUNK_PREFIX = 'b64:';

function validateRegionalControllerState(parsed, { kind, label, planSize }) {
  const allowedStatuses = new Set([
    'ready_discovery',
    'running_discovery',
    'reviewing_source_pr',
    'waiting_source_deploy',
    'ready_acquisition',
    'running_acquisition',
    'reviewing_data_pr',
    'waiting_frontend_deploy',
    'blocked'
  ]);
  if (parsed.controller_kind !== kind) throw new Error(`${label} controller state kind is invalid`);
  if (!allowedStatuses.has(String(parsed.status || ''))) throw new Error(`${label} controller state has an unsupported status`);
  const offset = Number(parsed.query_offset);
  const limit = Number(parsed.query_limit);
  const actualPlanSize = Number(parsed.plan_size);
  if (!Number.isInteger(offset) || offset < 0 || offset >= planSize) throw new Error(`${label} controller state query_offset is invalid`);
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error(`${label} controller state query_limit is invalid`);
  if (!Number.isInteger(actualPlanSize) || actualPlanSize !== planSize) throw new Error(`${label} controller state plan_size must be ${planSize}`);
  if (!Number.isInteger(Number(parsed.cycle || 0)) || Number(parsed.cycle || 0) < 0) throw new Error(`${label} controller state cycle is invalid`);
  if (parsed.active_instance !== null && (typeof parsed.active_instance !== 'object' || Array.isArray(parsed.active_instance))) {
    throw new Error(`${label} controller state active_instance is invalid`);
  }
  if (parsed.cloud_controller_intent !== null && (typeof parsed.cloud_controller_intent !== 'object' || Array.isArray(parsed.cloud_controller_intent))) {
    throw new Error(`${label} controller state cloud_controller_intent is invalid`);
  }
  if (!Array.isArray(parsed.results)) throw new Error(`${label} controller state results must be an array`);
  if (!parsed.totals || typeof parsed.totals !== 'object' || Array.isArray(parsed.totals)) throw new Error(`${label} controller state totals are missing`);
  return parsed;
}

export function validateControllerStateText(text) {
  const source = String(text ?? '');
  if (!source.trim()) throw new Error('Controller state snapshot is empty');
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Controller state snapshot is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Controller state snapshot must be a JSON object');
  }
  if (parsed.controller_kind === 'uk') return validateRegionalControllerState(parsed, { kind: 'uk', label: 'UK', planSize: 96 });
  if (parsed.controller_kind === 'ca') return validateRegionalControllerState(parsed, { kind: 'ca', label: 'Canada', planSize: 104 });
  if (!Array.isArray(parsed.priority_order) || parsed.priority_order.length !== 50) {
    throw new Error('Controller state snapshot must contain the 50-state priority_order');
  }
  if (!parsed.query_offsets || typeof parsed.query_offsets !== 'object') {
    throw new Error('Controller state snapshot is missing query_offsets');
  }
  if (!Array.isArray(parsed.deferred_units)) {
    throw new Error('Controller state snapshot is missing deferred_units');
  }
  return parsed;
}

function bytesToBase64(bytes) {
  let binary = '';
  const stride = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    const slice = bytes.subarray(offset, Math.min(bytes.length, offset + stride));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function chunkControllerStateText(text, maximumBytes = DEFAULT_CONTROLLER_STATE_CHUNK_BYTES) {
  const source = String(text ?? '');
  const max = Number(maximumBytes);
  if (!Number.isInteger(max) || max < 1024) throw new Error('maximumBytes must be an integer >= 1024');

  const bytes = new TextEncoder().encode(source);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += max) {
    const rawChunk = bytes.slice(offset, Math.min(bytes.length, offset + max));
    chunks.push(`${BASE64_CHUNK_PREFIX}${bytesToBase64(rawChunk)}`);
  }
  if (!chunks.length) chunks.push(`${BASE64_CHUNK_PREFIX}`);
  return { chunks, bytes: bytes.length };
}

export function joinControllerStateChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('Controller state chunks are missing');

  const encoded = chunks.every(chunk => String(chunk).startsWith(BASE64_CHUNK_PREFIX));
  const legacy = chunks.every(chunk => !String(chunk).startsWith(BASE64_CHUNK_PREFIX));
  if (legacy) return chunks.join('');
  if (!encoded) throw new Error('Controller state chunks mix legacy and byte-safe encodings');

  const byteChunks = chunks.map(chunk => base64ToBytes(String(chunk).slice(BASE64_CHUNK_PREFIX.length)));
  const total = byteChunks.reduce((sum, bytes) => sum + bytes.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const bytes of byteChunks) {
    joined.set(bytes, offset);
    offset += bytes.length;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(joined);
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export { BASE64_CHUNK_PREFIX, DEFAULT_CONTROLLER_STATE_CHUNK_BYTES };
