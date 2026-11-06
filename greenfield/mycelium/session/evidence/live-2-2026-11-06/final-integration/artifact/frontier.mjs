// Offline HTML anchor extraction. No DOM execution or network access.
const entities = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  Tab: '\t', NewLine: '\n', colon: ':', sol: '/', num: '#',
  copy: '©', reg: '®', trade: '™', hellip: '…', ndash: '–', mdash: '—',
  laquo: '«', raquo: '»', larr: '←', rarr: '→', euro: '€',
  eacute: 'é', Eacute: 'É', agrave: 'à', aacute: 'á', uuml: 'ü',
  ouml: 'ö', auml: 'ä', szlig: 'ß', ccedil: 'ç'
});

function decode(value) {
  return value.replace(/&(#x[0-9a-f]+;?|#[0-9]+;?|[a-z][a-z0-9]+;)/gi, (all, ref) => {
    if (ref[0] !== '#') return entities[ref.slice(0, -1)] ?? all;
    const hex = ref[1].toLowerCase() === 'x';
    const n = parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
    return n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)
      ? '\ufffd' : String.fromCodePoint(n);
  });
}

function webURL(value, base) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

// A forward-only tokenizer keeps quoted '>' characters inside attributes.
// Attributes are parsed individually: data-href and href inside title never match.
function tagAt(html, start) {
  let i = start + 1;
  const closing = html[i] === '/';
  if (closing) i++;
  const begin = i;
  while (i < html.length && /[a-z0-9:-]/i.test(html[i])) i++;
  if (i === begin || !/[a-z]/i.test(html[begin])) return null;
  const name = html.slice(begin, i).toLowerCase();
  const attrs = Object.create(null);
  while (i < html.length) {
    while (i < html.length && /[\t\n\f\r /]/.test(html[i])) i++;
    if (html[i] === '>') return { name, closing, attrs, end: i + 1 };
    if (i >= html.length) break;
    const a = i;
    while (i < html.length && !/[\t\n\f\r />=]/.test(html[i])) i++;
    if (a === i) { i++; continue; }
    const key = html.slice(a, i).toLowerCase();
    while (i < html.length && /[\t\n\f\r ]/.test(html[i])) i++;
    let value = '';
    if (html[i] === '=') {
      i++;
      while (i < html.length && /[\t\n\f\r ]/.test(html[i])) i++;
      if (html[i] === '"' || html[i] === "'") {
        const quote = html[i++];
        const v = i;
        while (i < html.length && html[i] !== quote) i++;
        if (i >= html.length) return { name: '', attrs, end: i };
        value = html.slice(v, i++);
      } else {
        const v = i;
        while (i < html.length && !/[\t\n\f\r >]/.test(html[i])) i++;
        value = html.slice(v, i);
      }
    }
    if (!Object.hasOwn(attrs, key)) attrs[key] = decode(value);
  }
  return { name: '', attrs, end: html.length };
}

export function expand(page, seen = []) {
  if (!page || typeof page.url !== 'string' || typeof page.html !== 'string') return [];
  const base = webURL(page.url);
  if (!base) return [];
  const visited = new Set([base]);
  if (Array.isArray(seen)) {
    for (const value of seen) {
      const url = webURL(value, base);
      if (url) visited.add(url);
    }
  }
  const result = [];
  let active = null;
  function finish() {
    if (!active) return;
    const href = active.href?.trim();
    if (href && !href.startsWith('#')) {
      const url = webURL(href, base);
      if (url && !visited.has(url)) {
        visited.add(url);
        result.push({ url, text: active.text.replace(/\s+/gu, ' ').trim(), from: page.url });
      }
    }
    active = null;
  }

  const html = page.html;
  // ASCII folding preserves offsets even for Unicode such as U+0130.
  const lower = html.replace(/[A-Z]/g, c => c.toLowerCase());
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i] !== '<') {
      const end = html.indexOf('<', i);
      const next = end < 0 ? html.length : end;
      if (active) active.text += decode(html.slice(i, next));
      i = next;
      continue;
    }
    const tag = tagAt(html, i);
    if (!tag) {
      if (html[i + 1] === '!' || html[i + 1] === '?') {
        const end = html.indexOf('>', i + 2);
        i = end < 0 ? html.length : end + 1;
      } else {
        if (active) active.text += '<';
        i++;
      }
      continue;
    }
    i = tag.end;
    if (!tag.closing && tag.name === 'plaintext') {
      if (active) active.text += html.slice(i);
      i = html.length;
      continue;
    }
    if (!tag.closing && ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'].includes(tag.name)) {
      // Raw/RCDATA content cannot introduce anchors.
      let end = lower.indexOf('</' + tag.name, i);
      while (end >= 0 && !/[\t\n\f\r />]/.test(lower[end + tag.name.length + 2] || '>')) {
        end = lower.indexOf('</' + tag.name, end + 2);
      }
      if (end < 0) { i = html.length; continue; }
      const close = tagAt(html, end);
      i = close ? close.end : html.length;
      continue;
    }
    if (tag.name === 'a') {
      finish();
      if (!tag.closing) active = { href: tag.attrs.href, text: '' };
    }
  }
  finish();
  return result;
}
