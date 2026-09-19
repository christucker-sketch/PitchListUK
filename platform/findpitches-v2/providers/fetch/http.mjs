const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 1_500_000;

export function createHttpFetchProvider({
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  userAgent = 'FindPitchesBot/2.0 (+https://findpitches.com)'
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('findpitches_v2_fetch_impl_invalid');

  return Object.freeze({
    async fetch(url) {
      const target = new URL(String(url));
      if (!['https:', 'http:'].includes(target.protocol)) {
        throw new Error('findpitches_v2_fetch_protocol_rejected');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout'), Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

      try {
        const response = await fetchImpl(target.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.7,*/*;q=0.1',
            'user-agent': userAgent
          }
        });

        if (!response.ok) throw new Error(`findpitches_v2_fetch_http_${response.status}`);

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > maxBytes) throw new Error('findpitches_v2_fetch_too_large');

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
          throw new Error(`findpitches_v2_fetch_content_type_unsupported:${contentType || 'unknown'}`);
        }

        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error('findpitches_v2_fetch_too_large');

        return Object.freeze({
          requested_url: target.toString(),
          final_url: response.url || target.toString(),
          content_type: contentType,
          body
        });
      } finally {
        clearTimeout(timer);
      }
    }
  });
}

export { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_BYTES };
