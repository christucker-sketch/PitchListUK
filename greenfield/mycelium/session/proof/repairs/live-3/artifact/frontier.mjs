// Small dependency-free HTML tokenizer. Content is data: no DOM execution or fetches.
const entities = Object.assign(Object.create(null), {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  eacute: 'é', Eacute: 'É', agrave: 'à', auml: 'ä', ouml: 'ö',
  uuml: 'ü', szlig: 'ß', copy: '©', reg: '®', hellip: '…',
  ndash: '–', mdash: '—', laquo: '«', raquo: '»'
});
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi, (all, key) => {
    if (key[0] !== '#') return entities[key] ?? all;
    let n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    if (!n || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) n = 0xfffd;
    return String.fromCodePoint(n);
  });
}
function web(value, base) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value, base);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}
function hrefOf(attrs) {
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m;
  while ((m = re.exec(attrs))) {
    if (m[1].toLowerCase() === 'href') return decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return null;
}
export function expand(page, seen = []) {
  if (!page || typeof page.url !== 'string' || typeof page.html !== 'string') return [];
  const base = web(page.url);
  if (!base) return [];
  const used = new Set();
  if (Array.isArray(seen) || seen instanceof Set) {
    for (const value of seen) {
      const url = web(value, base);
      if (url) used.add(url);
    }
  }
  const html = page.html, out = [];
  let i = 0, active = null;
  function finish() {
    if (active && !used.has(active.url)) {
      used.add(active.url);
      out.push({ url: active.url, text: decode(active.parts.join('')).replace(/\s+/gu, ' ').trim(), from: page.url });
    }
    active = null;
  }
  while (i < html.length) {
    if (html[i] !== '<') {
      const end = html.indexOf('<', i);
      const stop = end < 0 ? html.length : end;
      if (active) active.parts.push(html.slice(i, stop));
      i = stop;
      continue;
    }
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const end = html.indexOf('>', i + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    // Only scan a tag when a tag name immediately follows '<' or '</'.
    const head = /^<\/?([a-z][a-z0-9:-]*)\b/i.exec(html.slice(i, i + 256));
    if (!head) {
      if (active) active.parts.push('<');
      i++;
      continue;
    }
    let j = i + head[0].length, quote = '', state = 'beforeAttribute';
    for (; j < html.length; j++) {
      const ch = html[j], space = /[\t\n\f\r ]/.test(ch);
      if (quote) { if (ch === quote) { quote = ''; state = 'beforeAttribute'; } continue; }
      if (ch === '>') break;
      // Quotes delimit a value only after '='. In attribute names and unquoted
      // values they are ordinary parse-error characters, never a tag-spanning quote.
      if (state === 'beforeValue') {
        if (space) continue;
        if (ch === '"' || ch === "'") quote = ch;
        else state = 'unquotedValue';
      } else if (state === 'unquotedValue') {
        if (space) state = 'beforeAttribute';
      } else if (ch === '=') state = 'beforeValue';
      else if (space) { if (state === 'attributeName') state = 'afterAttributeName'; }
      else state = 'attributeName';
    }
    if (j === html.length) break;
    const name = head[1].toLowerCase(), closing = html[i + 1] === '/';
    const attrs = html.slice(i + head[0].length, j);
    i = j + 1;
    if (name === 'a') {
      finish();
      if (!closing) {
        const href = hrefOf(attrs);
        if (href !== null && href.trim() && !href.trim().startsWith('#')) {
          const url = web(href.trim(), base);
          if (url && !used.has(url)) active = { url, parts: [] };
        }
      }
    } else if (!closing && ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'].includes(name)) {
      // A raw-text close must end at an HTML name boundary.
      const close = new RegExp('</' + name + '(?=[\\t\\n\\f\\r />])', 'ig');
      close.lastIndex = i;
      const match = close.exec(html);
      i = match ? match.index : html.length;
    } else if (!closing && name === 'plaintext') {
      i = html.length;
    }
  }
  finish();
  return out;
}
