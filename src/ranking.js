/**
 * Ranking client — local-first
 *
 * POST /api/ranking → salva localmente + tenta sync ao Portal
 * GET  /api/ranking → top 20
 *
 * Fallback: se o servidor não responder, usa localStorage
 * (garante que o jogo nunca trava por causa do ranking)
 */

const API = '/api/ranking';

export async function submitScore({ name, time, score, levels }) {
  const entry = {
    name:   String(name).toUpperCase().trim().slice(0, 3).padEnd(3, '_'),
    time:   parseFloat(time.toFixed(2)),
    score:  parseInt(score, 10),
    levels: levels || [],
  };

  // Salvar localmente no localStorage imediatamente (fallback offline)
  _saveLocal(entry);

  // Tentar servidor (local-first: servidor local na mesma máquina)
  try {
    const res = await fetch(API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(entry),
      signal:  AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.entry;
    }
  } catch {
    // Servidor indisponível — localStorage tem o dado
    console.log('[ranking] offline — salvo em localStorage');
  }

  return entry;
}

export async function getTop(limit = 10) {
  // Tentar servidor
  try {
    const res = await fetch(`${API}?limit=${limit}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      return data.ranking || [];
    }
  } catch {}

  // Fallback: localStorage
  return _getLocal(limit);
}

// ─── localStorage fallback ───────────────────────────────────
const LS_KEY = 'totem-crt-ranking-v3';

function _saveLocal(entry) {
  try {
    const all = _getLocal(1000);
    all.push({ ...entry, date: new Date().toISOString(), id: Date.now().toString() });
    all.sort((a, b) => a.time - b.time);
    localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 200)));
  } catch {}
}

function _getLocal(limit) {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return data.sort((a, b) => a.time - b.time).slice(0, limit);
  } catch {
    return [];
  }
}
