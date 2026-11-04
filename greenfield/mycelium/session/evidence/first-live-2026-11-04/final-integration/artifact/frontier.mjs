// Breadcrumb frontier: extract unique HTTP(S) links from an untrusted page.
// Pure string processing; never fetches anything.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
      return String.fromCodePoint(cp);
    }
    const v = NAMED[body.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function textOf(inner) {
  return decodeEntities(inner.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ''))
    .replace(/[\s ]+/gu, ' ')
    .trim();
}

// Tokenize the attribute string of a start tag; the first href wins, as with
// duplicate attributes in HTML. Values inside quotes never look like names.
function hrefOf(attrs) {
  const attr = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m;
  while ((m = attr.exec(attrs)) !== null) {
    if (m[1].toLowerCase() === 'href') return decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return null;
}

// Canonical key for a URL: parsed href without fragment, or null if not a
// plain (non-credentialed) http(s) URL.
function normalize(raw, base) {
  let u;
  try {
    u = base === undefined ? new URL(raw) : new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username !== '' || u.password !== '') return null;
  u.hash = '';
  return u.href;
}

export function expand(page, seen = []) {
  if (!page || typeof page !== 'object') return [];
  const from = typeof page.url === 'string' ? normalize(page.url) : null;
  if (from === null) return [];
  const html = typeof page.html === 'string' ? page.html : '';

  // The page being expanded is itself visited.
  const visited = new Set([from]);
  for (const s of Array.isArray(seen) ? seen : []) {
    if (typeof s !== 'string') continue;
    const k = normalize(s);
    if (k !== null) visited.add(k);
  }

  // Comments and raw-text elements cannot contain real anchors.
  const body = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|textarea|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');

  const out = [];
  const anchor = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)(?=<\/a\s*>|<a\b|$)/gi;
  let m;
  while ((m = anchor.exec(body)) !== null) {
    const href = hrefOf(m[1]);
    if (href === null) continue;
    const trimmed = href.trim();
    if (trimmed.startsWith('#')) continue;
    const url = normalize(trimmed, from);
    if (url === null || visited.has(url)) continue;
    visited.add(url);
    out.push({ url, text: textOf(m[2]), from });
  }
  return out;
}
