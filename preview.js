const http = require('http');
const path = require('path');
const fs = require('fs');

const DIST_DIR = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 8080;

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      return res.end('Not found');
    }

    const ext = path.extname(filePath);
    const mime =
      {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
      }[ext] || 'text/plain; charset=utf-8';

    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const resolved = urlPath === '/' ? path.join(DIST_DIR, 'index.html') : path.join(DIST_DIR, urlPath);
  const candidate = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? path.join(resolved, 'index.html') : resolved;
  serveFile(candidate, res);
});

server.listen(PORT, () => {
  console.log(`Serving dist/ at http://localhost:${PORT}`);
});
