/**
 * Orquestrador do Totem CRT
 *
 * Máquina de estados: idle → countdown → playing → transition → victory
 * Cada TV é um canvas 640×480. Os jogos renderizam direto neles.
 * O orquestrador cuida do countdown, transições, timer global e vitória.
 */

import cyberrun from './games/cyberrun.js';
import nave     from './games/nave.js';
import corrida  from './games/corrida.js';
import luta     from './games/luta.js';
import { poll, getState as getInput } from './input.js';

// Jogos na ordem da torre: índice 0 = TV1 = nível 1 (CyberRun)
const GAMES  = [cyberrun, nave, corrida, luta];
const TV_IDS = ['tv1', 'tv2', 'tv3', 'tv4'];

// Estado
let gameState      = 'idle';
let currentLevel   = 0;
let globalTimer    = 0;
let timerStart     = 0;
let countdownValue = 3;
let countdownStart = 0;
let transitionStart = 0;
let victoryStart   = 0;

// DOM
let canvases = [];
let contexts = [];

// Ranking
let ranking = loadRanking();

// ============================================================
// INIT
// ============================================================
export function init() {
  TV_IDS.forEach((id, i) => {
    const c = document.getElementById(id);
    canvases.push(c);
    contexts.push(c.getContext('2d'));
  });

  // Inicializa todos os jogos
  GAMES.forEach((game, i) => {
    game.init(canvases[i], getInput());
  });

  gameState = 'idle';
  console.log('[Totem] Pronto. PRESS START.');
}

// ============================================================
// TICK
// ============================================================
export function tick() {
  const input = poll();
  const now   = performance.now();

  switch (gameState) {
    case 'idle':       updateIdle(input, now);      break;
    case 'countdown':  updateCountdown(input, now); break;
    case 'playing':    updatePlaying(input, now);   break;
    case 'transition': updateTransition(now);       break;
    case 'victory':    updateVictory(now);          break;
  }

  renderAll(now);
  updateTimerDisplay();
}

// ============================================================
// STATES
// ============================================================
function updateIdle(input, now) {
  if (input.start || input.buttonA || input.buttonB) {
    gameState      = 'countdown';
    countdownValue = 3;
    countdownStart = now;
    currentLevel   = 0;
    GAMES.forEach(g => g.reset());
    console.log('[Totem] Countdown!');
  }
}

function updateCountdown(input, now) {
  countdownValue = 3 - Math.floor((now - countdownStart) / 1000);
  if (countdownValue <= 0) {
    gameState  = 'playing';
    timerStart = now;
    globalTimer = 0;
    console.log('[Totem] GO! Nível 1 —', GAMES[0].name);
  }
}

function updatePlaying(input, now) {
  globalTimer = now - timerStart;
  const activeGame = GAMES[currentLevel];
  activeGame.update(16.67);

  if (activeGame.getState() === 'won') {
    if (currentLevel < GAMES.length - 1) {
      gameState      = 'transition';
      transitionStart = now;
      console.log(`[Totem] Nível ${currentLevel + 1} completo!`);
    } else {
      gameState    = 'victory';
      victoryStart = now;
      addToRanking(globalTimer / 1000);
      console.log('[Totem] VITÓRIA! Tempo:', (globalTimer / 1000).toFixed(1) + 's');
    }
  }
}

function updateTransition(now) {
  if (now - transitionStart > 1800) {
    currentLevel++;
    GAMES[currentLevel].reset();
    gameState  = 'playing';
    timerStart = now - globalTimer;
    console.log(`[Totem] Nível ${currentLevel + 1} —`, GAMES[currentLevel].name);
  }
}

function updateVictory(now) {
  if (now - victoryStart > 12000) {
    gameState = 'idle';
    console.log('[Totem] Voltando ao idle.');
  }
}

// ============================================================
// RENDER
// ============================================================
function renderAll(now) {
  GAMES.forEach((game, i) => {
    const ctx = contexts[i];
    const W = canvases[i].width;
    const H = canvases[i].height;

    if (gameState === 'idle') {
      game.renderIdle(ctx);
      if (i === 0) renderPressStart(ctx, W, H, now);
    }
    else if (gameState === 'countdown') {
      game.renderIdle(ctx);
      if (i === 0) renderCountdown(ctx, W, H);
    }
    else if (gameState === 'playing') {
      if (i === currentLevel)     game.render(ctx);
      else if (i < currentLevel)  renderCompleted(ctx, W, H, game.name, i, now);
      else                        game.renderIdle(ctx);
    }
    else if (gameState === 'transition') {
      if (i === currentLevel)         renderTransitionFlash(ctx, W, H, now);
      else if (i === currentLevel + 1) renderActivating(ctx, W, H, GAMES[i], now);
      else if (i < currentLevel)       renderCompleted(ctx, W, H, game.name, i, now);
      else                             game.renderIdle(ctx);
    }
    else if (gameState === 'victory') {
      renderVictory(ctx, W, H, i, now);
    }
  });
}

// ============================================================
// OVERLAYS
// ============================================================
function renderPressStart(ctx, W, H, now) {
  if (Math.floor(now / 700) % 2 === 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,255,255,0.9)';
    ctx.font = `${Math.round(H * 0.055)}px "Press Start 2P",monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('PRESS START', W / 2, H - Math.round(H * 0.05));
    ctx.restore();
  }
}

function renderCountdown(ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const text = countdownValue > 0 ? String(countdownValue) : 'GO!';
  ctx.fillStyle = '#0ff';
  ctx.font = `${Math.round(H * 0.3)}px "Press Start 2P",monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);
  ctx.restore();
}

function renderCompleted(ctx, W, H, name, level, now) {
  // Mantém o último frame do jogo visível, escurece levemente
  ctx.save();
  ctx.fillStyle = 'rgba(0,5,20,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0f8';
  ctx.font = `${Math.round(H * 0.07)}px "Press Start 2P",monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`✓ ${name}`, W / 2, H / 2 - H * 0.05);
  ctx.fillStyle = '#0ff';
  ctx.font = `${Math.round(H * 0.05)}px "Press Start 2P",monospace`;
  ctx.fillText('COMPLETE', W / 2, H / 2 + H * 0.07);
  ctx.restore();
}

function renderTransitionFlash(ctx, W, H, now) {
  const t = now - transitionStart;
  const flash = Math.sin(t * 0.02) > 0;
  ctx.save();
  ctx.fillStyle = flash ? 'rgba(0,255,255,0.5)' : 'rgba(255,0,255,0.5)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function renderActivating(ctx, W, H, game, now) {
  const elapsed = now - transitionStart;
  const alpha = Math.min(1, elapsed / 1800);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#0ff';
  ctx.font = `${Math.round(H * 0.07)}px "Press Start 2P",monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`NÍVEL ${game.difficulty}`, W / 2, H / 2 - H * 0.05);
  ctx.fillText(game.name, W / 2, H / 2 + H * 0.07);
  ctx.restore();
}

function renderVictory(ctx, W, H, tvIdx, now) {
  const t = now - victoryStart;
  const colors = ['#0ff', '#f0f', '#ff0', '#0f8'];
  const flash  = colors[Math.floor(t / 180) % colors.length];
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,24,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = flash;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (tvIdx === 3) {
    ctx.font = `${Math.round(H * 0.09)}px "Press Start 2P",monospace`;
    ctx.fillText('★ VITÓRIA ★', W / 2, H * 0.22);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(H * 0.12)}px "Press Start 2P",monospace`;
    ctx.fillText((globalTimer / 1000).toFixed(1) + 's', W / 2, H * 0.42);
    ctx.fillStyle = '#0ff';
    ctx.font = `${Math.round(H * 0.045)}px "Press Start 2P",monospace`;
    ctx.fillText('RANKING', W / 2, H * 0.58);
    ranking.slice(0, 5).forEach((r, ri) => {
      ctx.fillStyle = ri === 0 ? '#ff0' : ri < 3 ? '#0ff' : '#888';
      ctx.font = `${Math.round(H * 0.038)}px "Press Start 2P",monospace`;
      ctx.fillText(`${ri + 1}. ${r.time.toFixed(1)}s`, W / 2, H * 0.67 + ri * H * 0.065);
    });
  } else {
    ctx.font = `${Math.round(H * 0.09)}px "Press Start 2P",monospace`;
    ctx.fillText('★ ★ ★', W / 2, H / 2);
  }
  ctx.restore();
}

// ============================================================
// TIMER
// ============================================================
function updateTimerDisplay() {
  const el = document.getElementById('timer-global');
  if (!el) return;
  if (gameState === 'playing' || gameState === 'transition') {
    el.textContent = (globalTimer / 1000).toFixed(1) + 's';
    el.style.display = 'block';
  } else if (gameState === 'victory') {
    el.textContent = (globalTimer / 1000).toFixed(1) + 's ★';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ============================================================
// RANKING
// ============================================================
function loadRanking() {
  try { const d = localStorage.getItem('totem-crt-ranking'); if (d) return JSON.parse(d); }
  catch (e) {}
  return [];
}
function saveRanking() {
  localStorage.setItem('totem-crt-ranking', JSON.stringify(ranking));
}
function addToRanking(totalTime) {
  ranking.push({ time: totalTime });
  ranking.sort((a, b) => a.time - b.time);
  ranking = ranking.slice(0, 10);
  saveRanking();
}
