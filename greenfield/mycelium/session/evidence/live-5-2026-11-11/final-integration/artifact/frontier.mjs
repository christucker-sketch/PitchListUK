const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
  });
}

function normalize(raw, base) {
  let u;
  try { u = base === undefined ? new URL(raw) : new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  u.hash = '';
  return u.href;
}

// Drop non-rendered regions so anchors inside them are not followed.
function visible(html) {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style|template|textarea|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');
}

export function expand(page, seen = []) {
  const base = normalize(String(page?.url ?? ''));
  if (!base) return [];
  const html = visible(String(page?.html ?? ''));
  const visited = new Set();
  for (const s of Array.isArray(seen) ? seen : []) {
    const n = normalize(String(s));
    if (n) visited.add(n);
  }
  const out = [];
  const re = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/a\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    // Consume entire attributes so href-like text inside quoted values is inert.
    const attrs = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>\x60=]+)))?/g;
    let attr;
    let rawHref;
    while ((attr = attrs.exec(m[1]))) {
      if (attr[1].toLowerCase() === 'href') {
        rawHref = attr[2] ?? attr[3] ?? attr[4] ?? '';
        break; // HTML keeps the first occurrence of a duplicated attribute.
      }
    }
    if (rawHref === undefined) continue;
    const href = decode(rawHref).trim();
    if (!href || href.startsWith('#')) continue;
    const url = normalize(href, base);
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const text = decode(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    out.push({ url, text, from: base });
  }
  return out;
}
