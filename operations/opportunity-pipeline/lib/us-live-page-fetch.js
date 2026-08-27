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

async function fetchApprovedPage({ source, url }, options = {}) {
  if (!source || source.status !== 'approved-pilot') throw new Error('live fetch requires approved Texas source');
  const target = url || source.source_url;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
  const response = await fetch(target, {
    redirect: 'follow',
    signal,
    headers: {
      'user-agent': 'PitchList-US-Staging/1.0 (+staging-only)',
      'accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1'
    }
  });
  if (!response.ok) throw new Error(`fetch ${response.status} ${response.statusText}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
    throw new Error(`unsupported content-type: ${contentType}`);
  }
  const html = await response.text();
  const finalUrl = response.url || target;
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
    application_deadline: source.application_deadline || ''
  };
}

module.exports = { decodeHtmlEntities, stripNonContentChrome, htmlToText, extractTitle, extractLinks, fetchApprovedPage };
