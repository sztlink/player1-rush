/**
 * Totem CRT — Servidor local-first
 *
 * Responsabilidades:
 *   1. Serve arquivos estáticos do app/
 *   2. API de ranking (GET/POST /api/ranking)
 *   3. Sync para Portal AYA quando online (background, falha silenciosamente)
 *
 * Uso: node server.js [porta]
 * Default: porta 3000
 */

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

const PORT    = parseInt(process.argv[2] || '3000', 10);
const APP_DIR = path.join(__dirname, 'app');
const DB_FILE = path.join(__dirname, 'ranking.json');

// ─── Portal AYA sync config ──────────────────────────────────
// Se PORTAL_URL estiver definido (env ou config.json), ativa sync
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}

const PORTAL_URL   = process.env.PORTAL_URL   || config.portalUrl   || null;
const PORTAL_TOKEN = process.env.PORTAL_TOKEN || config.portalToken || null;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

// ─── Banco local (JSON file) ─────────────────────────────────
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { entries: [], lastSync: null };
  }
}

function saveDB(db) {
  // Escrita atômica: write temp → rename
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function addEntry(entry) {
  const db = loadDB();
  const record = {
    id:      Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name:    String(entry.name || 'AAA').toUpperCase().slice(0, 3),
    time:    parseFloat(entry.time)   || 0,
    score:   parseInt(entry.score, 10) || 0,
    levels:  entry.levels || [],
    date:    new Date().toISOString(),
    synced:  false,
  };
  db.entries.push(record);
  // Manter só os últimos 1000 (exposição de 3 meses tem ~15k visitas esperadas — filtrar top)
  db.entries.sort((a, b) => a.time - b.time);
  saveDB(db);
  console.log(`[ranking] novo: ${record.name} ${record.time.toFixed(1)}s score:${record.score}`);

  // Tentar sync imediato (não bloqueia)
  syncToPortal([record]).catch(() => {});

  return record;
}

function getTop(limit = 20) {
  const db = loadDB();
  return db.entries
    .sort((a, b) => a.time - b.time)
    .slice(0, limit);
}

// ─── Sync para Portal AYA ────────────────────────────────────
async function syncToPortal(entries) {
  if (!PORTAL_URL || !PORTAL_TOKEN) return;
  try {
    const res = await fetch(`${PORTAL_URL}/api/totem/ranking/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PORTAL_TOKEN}`,
      },
      body: JSON.stringify({ entries }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      // Marcar como sincronizados
      const db = loadDB();
      const ids = new Set(entries.map(e => e.id));
      db.entries.forEach(e => { if (ids.has(e.id)) e.synced = true; });
      db.lastSync = new Date().toISOString();
      saveDB(db);
      console.log(`[sync] ${entries.length} entrada(s) → Portal OK`);
    }
  } catch {
    // Offline ou Portal fora — falha silenciosa
  }
}

function syncPending() {
  const db = loadDB();
  const pending = db.entries.filter(e => !e.synced);
  if (pending.length > 0) {
    syncToPortal(pending).catch(() => {});
  }
}

// ─── HTTP Server ─────────────────────────────────────────────
const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsed  = url.parse(req.url);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  // ── API ──────────────────────────────────────────────────
  if (pathname === '/api/ranking' && req.method === 'GET') {
    const top = getTop(20);
    sendJSON(res, 200, { ok: true, count: top.length, ranking: top });
    return;
  }

  if (pathname === '/api/ranking' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const entry  = JSON.parse(body);
        const record = addEntry(entry);
        sendJSON(res, 201, { ok: true, entry: record });
      } catch (e) {
        sendJSON(res, 400, { ok: false, error: e.message });
      }
    });
    return;
  }

  // ── Static files ─────────────────────────────────────────
  let filePath = path.join(APP_DIR, decodeURIComponent(pathname));
  if (filePath.endsWith('/') || filePath === APP_DIR) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found: ' + pathname); return;
  }
  if (fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🕹  Totem CRT — servidor rodando`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://192.168.15.146:${PORT}  (rede local)`);
  console.log(`   ranking: ${DB_FILE}`);
  console.log(`   portal sync: ${PORTAL_URL || 'desativado (offline)'}\n`);

  // Sync periódico
  setInterval(syncPending, SYNC_INTERVAL_MS);
});
