import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const port = Number(process.env.PORT || 8788);
const accessCode = process.env.PITCHLIST_DATABASE_ACCESS_CODE || 'pitchlist-test-access';
const env = {
  ...process.env,
  PITCHLIST_DATABASE_ACCESS_CODE: accessCode,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`
};

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp']
]);

const routes = [
  ['/api/customer-opportunities/search', './functions/api/customer-opportunities/search.js'],
  ['/api/billing/checkout', './functions/api/billing/checkout.js'],
  ['/api/billing/session', './functions/api/billing/session.js'],
  ['/api/billing/portal', './functions/api/billing/portal.js'],
  ['/api/billing/webhook', './functions/api/billing/webhook.js'],
  ['/api/vendor-profile/signup', './functions/api/vendor-profile/signup.js'],
  ['/api/vendor-profile/me', './functions/api/vendor-profile/me.js'],
  ['/api/vendors/search', './functions/api/vendors/search.js'],
  ['/api/sample-request', './functions/api/sample-request.js']
];

async function handlerFor(urlPath, method) {
  const route = routes.find(([prefix]) => urlPath === prefix);
  if (!route) return null;
  const mod = await import(pathToFileURL(path.join(root, route[1])));
  const suffix = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
  return mod[`onRequest${suffix}`] || null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${port}`}`);
    const api = await handlerFor(url.pathname, req.method || 'GET');
    if (api) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined
      });
      const response = await api({ request, env });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    if (filePath === '/database') filePath = '/database.html';
    const fullPath = path.normalize(path.join(publicRoot, filePath));
    if (!fullPath.startsWith(publicRoot)) throw new Error('Invalid path');
    const body = await fs.readFile(fullPath);
    res.writeHead(200, { 'content-type': mime.get(path.extname(fullPath)) || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`PitchList test backend on http://127.0.0.1:${port}/database?access=${accessCode}`);
});
