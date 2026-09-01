function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripNonContentChrome(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, ' ');
}

function htmlToText(html) {
  return decodeHtmlEntities(stripNonContentChrome(html)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchor = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(stripNonContentChrome(html)))) {
    try {
      const url = new URL(decodeHtmlEntities(match[2]), baseUrl).toString();
      links.push({ text: htmlToText(match[3]), url });
    } catch {
      // Ignore malformed links; the staging pipeline fails closed elsewhere.
    }
  }
  return links;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTextTarget(target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const retries = Math.max(0, Number(options.retries ?? 2));
  const maxBytes = Math.max(0, Number(options.maxBytes || 0));
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
      const response = await fetchImpl(target, {
        redirect: 'follow',
        signal,
        headers: {
          'user-agent': 'FindPitches-Opportunity-Research/1.0 (+https://findpitches.com)',
          'accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'accept-language': 'en-US,en;q=0.9'
        }
      });

      if (!response.ok) {
        const error = new Error(`fetch ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
        throw new Error(`unsupported content-type: ${contentType}`);
      }

      return {
        html: await readResponseText(response, { maxBytes }),
        finalUrl: response.url || target
      };
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || isRetryableStatus(Number(error.status));
      if (!retryable || attempt >= retries) break;
      await sleep(Math.min(1000 * (2 ** attempt), 4000));
    }
  }

  throw lastError || new Error('fetch failed');
}

async function readResponseText(response, options = {}) {
  const maxBytes = Math.max(0, Number(options.maxBytes || 0));
  if (!maxBytes) return response.text();

  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`response body exceeds ${maxBytes} byte limit`);
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(`response body exceeds ${maxBytes} byte limit`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new Error(`response body exceeds ${maxBytes} byte limit`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock?.();
  }
}

async function fetchApprovedPage({ source, url }, options = {}) {
  if (!source || source.status !== 'approved-pilot') throw new Error('live fetch requires approved Texas source');

  const primary = url || source.source_url;
  const fallback = source.application_url && source.application_url !== primary ? source.application_url : '';
  let fetched;
  let primaryError = null;

  try {
    fetched = await fetchTextTarget(primary, options);
  } catch (error) {
    primaryError = error;
    if (!fallback) throw error;
    try {
      fetched = await fetchTextTarget(fallback, options);
    } catch (fallbackError) {
      throw new Error(`source fetch failed (${primaryError.message}); application fallback failed (${fallbackError.message})`);
    }
  }

  const { html, finalUrl } = fetched;
  return {
    url: finalUrl,
    title: extractTitle(html) || source.name,
    text: htmlToText(html),
    links: extractLinks(html, finalUrl),
    application_url: source.application_url,
    organiser: source.organiser,
    locality: source.locality,
    recurring: source.recurring,
    event_start: source.event_start || '',
    application_deadline: source.application_deadline || '',
    fetch_route: primaryError ? 'application_fallback' : 'source'
  };
}

module.exports = {
  decodeHtmlEntities,
  stripNonContentChrome,
  htmlToText,
  extractTitle,
  extractLinks,
  isRetryableStatus,
  readResponseText,
  fetchTextTarget,
  fetchApprovedPage
};
