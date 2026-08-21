const https = require('https');
const { loadEnvValue } = require('./config');

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers }, timeout: 30000 }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Serper request failed with HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.write(body);
    req.end();
  });
}

async function serperSearch(query, { num = 10 } = {}) {
  const apiKey = loadEnvValue('SERPER_API_KEY');
  if (!apiKey) throw new Error('SERPER_API_KEY is not present in the process environment');
  const raw = await postJson('https://google.serper.dev/search', { q: query, num, gl: 'uk', hl: 'en' }, { 'X-API-KEY': apiKey });
  return (raw.organic || []).slice(0, num).map((item, index) => ({
    query,
    rank: index + 1,
    title: item.title || '',
    url: item.link || '',
    snippet: item.snippet || '',
  })).filter(r => /^https?:\/\//.test(r.url));
}

module.exports = { serperSearch };
