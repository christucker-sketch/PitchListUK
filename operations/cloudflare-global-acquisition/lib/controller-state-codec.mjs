const DEFAULT_CONTROLLER_STATE_CHUNK_BYTES = 512 * 1024;

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

export function chunkControllerStateText(text, maximumBytes = DEFAULT_CONTROLLER_STATE_CHUNK_BYTES) {
  const source = String(text ?? '');
  const max = Number(maximumBytes);
  if (!Number.isInteger(max) || max < 1024) throw new Error('maximumBytes must be an integer >= 1024');

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(source);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += max) {
    chunks.push(decoder.decode(bytes.slice(offset, Math.min(bytes.length, offset + max))));
  }
  if (!chunks.length) chunks.push('');
  return { chunks, bytes: bytes.length };
}

export function joinControllerStateChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('Controller state chunks are missing');
  return chunks.join('');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export { DEFAULT_CONTROLLER_STATE_CHUNK_BYTES };
