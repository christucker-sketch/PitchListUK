async function fetchText(url, limit = 160000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'PitchListUKBot/0.1 (+https://pitchlist.uk)' }
    });
    clearTimeout(timeout);
    if (!response.ok) return '';
    const text = await response.text();
    return text.slice(0, limit);
  } catch {
    return '';
  }
}

function cleanHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = cleanHtml(m[2]).slice(0, 160);
    try {
      const url = new URL(href, baseUrl).toString();
      links.push({ url, label });
    } catch {}
  }
  return links;
}

module.exports = { fetchText, cleanHtml, extractLinks };
