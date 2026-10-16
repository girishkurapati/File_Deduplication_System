const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MAX_BODY = 1_000_000;
let lastScan = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}
function safeStat(file) {
  try { return fs.lstatSync(file); } catch { return null; }
}
function insideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function formatPath(p) { return p.split(path.sep).join('/'); }
function walk(root, current, out, errors) {
  let entries;
  try { entries = fs.readdirSync(current, { withFileTypes: true }); }
  catch (e) { errors.push({ path: current, message: e.message }); return; }
  for (const entry of entries) {
    if (['.git', 'node_modules', '.DS_Store', 'System Volume Information', '$RECYCLE.BIN'].includes(entry.name)) continue;
    const full = path.join(current, entry.name);
    let st;
    try { st = fs.lstatSync(full); } catch (e) { errors.push({ path: full, message: e.message }); continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(root, full, out, errors);
    else if (st.isFile()) out.push({ path: full, relativePath: formatPath(path.relative(root, full)), name: entry.name, size: st.size, modified: st.mtime.toISOString() });
  }
}
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
async function scanDirectory(root) {
  const errors = [];
  const files = [];
  walk(root, root, files, errors);
  const groups = new Map();
  let processed = 0;
  for (const f of files) {
    try {
      // Size is a cheap pre-filter; the full SHA-256 digest confirms content identity.
      const key = `${f.size}:${await hashFile(f.path)}`;
      f.hash = key.slice(key.indexOf(':') + 1);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    } catch (e) {
      errors.push({ path: f.path, message: e.message });
    }
    processed++;
  }
  const duplicateGroups = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.path.localeCompare(b.path));
    duplicateGroups.push({
      id: crypto.createHash('sha1').update(key + group.map(x => x.path).join('|')).digest('hex').slice(0, 12),
      hash: group[0].hash,
      size: group[0].size,
      count: group.length,
      recoverableBytes: group[0].size * (group.length - 1),
      files: group.map((f, index) => ({
        path: f.path,
        relativePath: f.relativePath,
        name: f.name,
        size: f.size,
        modified: f.modified,
        hash: f.hash,
        recommendedKeep: index === 0
      }))
    });
  }
  duplicateGroups.sort((a, b) => b.recoverableBytes - a.recoverableBytes);
  const duplicateFiles = duplicateGroups.reduce((n, g) => n + g.count - 1, 0);
  const recoverableBytes = duplicateGroups.reduce((n, g) => n + g.recoverableBytes, 0);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  return {
    root, scannedAt: new Date().toISOString(), totalFiles: files.length,
    totalBytes, duplicateGroups, duplicateFiles, recoverableBytes, errors
  };
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) { reject(new Error('Request too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function validDirectory(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Enter a directory path.');
  const resolved = path.resolve(input.trim());
  const st = safeStat(resolved);
  if (!st || !st.isDirectory() || st.isSymbolicLink()) throw new Error('That path is not an accessible directory.');
  const home = require('os').homedir();
  // Prevent scanning filesystem roots and a few high-risk system locations by accident.
  if (resolved === path.parse(resolved).root) throw new Error('For safety, choose a specific folder rather than a filesystem root.');
  if (process.platform === 'win32' && /^([A-Z]:\\Windows|[A-Z]:\\Program Files)(\\|$)/i.test(resolved)) {
    throw new Error('For safety, choose a personal or project folder, not a system directory.');
  }
  return resolved;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return send(res, 200, { ok: true, version: '1.0.0', lastScan: lastScan ? { scannedAt: lastScan.scannedAt, root: lastScan.root } : null });
  }
  if (req.method === 'POST' && url.pathname === '/api/scan') {
    try {
      const body = await parseBody(req);
      const root = validDirectory(body.directory);
      const result = await scanDirectory(root);
      lastScan = result;
      return send(res, 200, result);
    } catch (e) { return send(res, 400, { error: e.message || 'Scan failed.' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/delete') {
    try {
      const body = await parseBody(req);
      if (!lastScan || !Array.isArray(body.paths) || !body.paths.length) throw new Error('Scan first and select duplicate files to remove.');
      const root = lastScan.root;
      const known = new Set(lastScan.duplicateGroups.flatMap(g => g.files.filter(f => !f.recommendedKeep).map(f => f.path)));
      const requested = [...new Set(body.paths)];
      if (requested.some(p => typeof p !== 'string' || !known.has(p))) throw new Error('One or more files are not eligible duplicates from the latest scan.');
      const removed = [];
      for (const file of requested) {
        const resolved = path.resolve(file);
        if (!insideRoot(root, resolved)) throw new Error('A selected file is outside the scanned directory.');
        const st = safeStat(resolved);
        if (!st || !st.isFile() || st.isSymbolicLink()) continue;
        fs.unlinkSync(resolved);
        removed.push(file);
      }
      // Rescan after cleanup so the dashboard reflects the current directory.
      lastScan = await scanDirectory(root);
      return send(res, 200, { removed, scan: lastScan });
    } catch (e) { return send(res, 400, { error: e.message || 'Deletion failed.' }); }
  }
  if (req.method === 'GET') {
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const target = path.resolve(PUBLIC, '.' + requested);
    if (!insideRoot(PUBLIC, target)) return send(res, 403, { error: 'Forbidden' });
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
    return;
  }
  send(res, 404, { error: 'Not found' });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  File Deduplication System running at http://127.0.0.1:${PORT}`);
  console.log('  Local-only server. Keep this terminal open while using the dashboard.\n');
});
