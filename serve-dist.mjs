import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import http from 'node:http';

const [, , rootArg, portArg] = process.argv;
const root = resolve(rootArg || 'dist');
const port = Number(portArg || 5173);
const apiTarget = new URL(process.env.API_TARGET || 'http://localhost:3000');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveFile(res, file) {
  res.writeHead(200, {
    'content-type': mime[extname(file)] || 'application/octet-stream',
    'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
}

function proxyApi(req, res) {
  const target = new URL(req.url, apiTarget);
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: req.method,
      headers: req.headers,
    },
    proxyRes => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', err => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`API proxy failed: ${err.message}`);
  });
  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  if (!req.url) return res.end();
  if (req.url.startsWith('/api/')) return proxyApi(req, res);

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const candidate = join(root, urlPath === '/' ? 'index.html' : urlPath);
  const file = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(root, 'index.html');
  serveFile(res, file);
}).listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
