/**
 * Orquestrador do Totem CRT
 * 
 * Gerencia a máquina de estados, o timer global, as transições
 * entre níveis e o ranking. Cada TV = 1 canvas = 1 game.
 * 
 * MINHOSO: NÃO EDITAR ESTE ARQUIVO.
 * Seu trabalho fica em src/games/cyberrun.js
 */

import cyberrun from './games/cyberrun.js';
import nave from './games/nave.js';
import corrida from './games/corrida.js';
import luta from './games/luta.js';
import { poll, getState as getInput } from './input.js';
import { submitScore, getTop } from './ranking.js';

// Games na ordem da torre (índice 0 = nível 1 = TV de baixo)
const GAMES = [cyberrun, nave, corrida, luta];
const TV_IDS = ['tv1', 'tv2', 'tv3', 'tv4'];

/** Resolução por TV (4:3) — alinhado ao canvas e ao CyberRun */
const TV_W = 640;
const TV_H = 480;
const CX = TV_W / 2;
const yTV = (yFrom480) => (yFrom480 * TV_H) / 480;
const fsTV = (px) => `${Math.round((px * TV_H) / 480)}px "Press Start 2P",monospace`;

// ============================================================
// ESTADO
// ============================================================
let gameState = 'idle';  // idle | countdown | playing | transition | victory
let currentLevel = 0;    // 0-3 (qual game está ativo)
let globalTimer = 0;     // tempo total em ms
let timerStart = 0;
let countdownValue = 3;
let countdownStart = 0;
let transitionStart = 0;
let victoryStart = 0;

// Canvases
const canvases = [];
const contexts = [];

// Ranking local (fallback)
let ranking = loadRanking();

// Name entry após vitória
let nameEntry = { active:false, letters:['A','A','A'], pos:0, done:false, submitted:false };
let rankingData = [];
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let _nameInputCooldown = 0;

// ============================================================
// INIT
// ============================================================
export function init() {
  // Pegar os 4 canvases
  for (const id of TV_IDS) {
    const c = document.getElementById(id);
    canvases.push(c);
    contexts.push(c.getContext('2d'));
  }

  // Inicializar todos os games com seus canvases
  GAMES.forEach((game, i) => {
    game.init(canvases[i], getInput());
  });

  gameState = 'idle';
  console.log('[Totem] Orquestrador iniciado. PRESS START.');
}

// ============================================================
// MAIN LOOP
// ============================================================
export function tick() {
  const input = poll();
  const now = performance.now();

  switch (gameState) {
    case 'idle':
      updateIdle(input, now);
      break;
    case 'countdown':
      updateCountdown(input, now);
      break;
    case 'playing':
      updatePlaying(input, now);
      break;
    case 'transition':
      updateTransition(input, now);
      break;
    case 'victory':
      updateVictory(input, now);
      break;
  }

  // Render todas as TVs
  renderAll(now);

  // Timer display
  updateTimerDisplay();
}

// ============================================================
// STATES
// ============================================================
function updateIdle(input, now) {
  // Qualquer botão → countdown
  if (input.start || input.buttonA || input.buttonB) {
    gameState = 'countdown';
    countdownValue = 3;
    countdownStart = now;
    currentLevel = 0;

    // Reset todos os games
    GAMES.forEach(g => g.reset());

    console.log('[Totem] Countdown iniciado!');
  }
}

function updateCountdown(input, now) {
  const elapsed = now - countdownStart;
  countdownValue = 3 - Math.floor(elapsed / 1000);

  if (countdownValue <= 0) {
    gameState = 'playing';
    timerStart = now;
    globalTimer = 0;
    console.log('[Totem] GO! Nível 1 —', GAMES[0].name);
  }
}

function updatePlaying(input, now) {
  globalTimer = now - timerStart;

  // Update o game ativo
  const activeGame = GAMES[currentLevel];
  activeGame.update(16.67); // ~60fps

  // Verificar se completou
  if (activeGame.getState() === 'won') {
    if (currentLevel < GAMES.length - 1) {
      // Próximo nível
      gameState = 'transition';
      transitionStart = now;
      console.log(`[Totem] Nível ${currentLevel + 1} completo! Transição...`);
    } else {
      // Vitória final!
      gameState = 'victory';
      victoryStart = now;
      const totalTime = globalTimer / 1000;
      addToRanking(totalTime);
      console.log(`[Totem] VITÓRIA! Tempo: ${totalTime.toFixed(1)}s`);
    }
  }
}

function updateTransition(input, now) {
  const elapsed = now - transitionStart;

  // Transição de 1.5 segundos
  if (elapsed > 1500) {
    currentLevel++;
    GAMES[currentLevel].reset();
    gameState = 'playing';
    timerStart = now - globalTimer; // manter o timer global correndo
    console.log(`[Totem] Nível ${currentLevel + 1} —`, GAMES[currentLevel].name);
  }
}

function updateVictory(input, now) {
  const elapsed = now - victoryStart;

  // Fase 1 — 2s de flash
  if (elapsed < 2000) return;

  // Fase 2 — name entry
  if (!nameEntry.done) {
    if (_nameInputCooldown > 0) { _nameInputCooldown--; return; }
    const ne = nameEntry;
    if (input.up)   { ne.letters[ne.pos] = _prevChar(ne.letters[ne.pos]); _nameInputCooldown = 10; }
    if (input.down) { ne.letters[ne.pos] = _nextChar(ne.letters[ne.pos]); _nameInputCooldown = 10; }
    if (input.left  && ne.pos > 0) { ne.pos--; _nameInputCooldown = 12; }
    if ((input.right || input.buttonA) && ne.pos < 2) { ne.pos++; _nameInputCooldown = 12; }
    if ((input.buttonA || input.start) && ne.pos === 2 && !ne.submitted) {
      ne.done = true; ne.submitted = true;
      const name = ne.letters.join('');
      submitScore({ name, time: globalTimer/1000, score: 0 })
        .then(() => getTop(10)).then(t => { rankingData = t; }).catch(() => {});
      getTop(10).then(t => { rankingData = t; }).catch(() => {});
    }
    return;
  }

  // Fase 3 — mostrar ranking 15s, depois idle
  if (elapsed > 2000 + 15000) {
    gameState = 'idle';
    nameEntry = { active:false, letters:['A','A','A'], pos:0, done:false, submitted:false };
    console.log('[Totem] Voltando ao IDLE.');
  }
}

function _nextChar(c) { return CHARS[(CHARS.indexOf(c)+1)%CHARS.length]; }
function _prevChar(c) { return CHARS[(CHARS.indexOf(c)-1+CHARS.length)%CHARS.length]; }

// ============================================================
// RENDER
// ============================================================
function renderAll(now) {
  GAMES.forEach((game, i) => {
    const c = contexts[i];

    if (gameState === 'idle') {
      game.renderIdle(c);
      // Ranking na TV do topo
      if (i === 3) renderRanking(c);
    }
    else if (gameState === 'countdown') {
      game.renderIdle(c);
      // Countdown no nível 1
      if (i === 0) renderCountdown(c);
    }
    else if (gameState === 'playing') {
      if (i === currentLevel) {
        // TV ativa: renderizar o game
        game.render(c);
      } else if (i < currentLevel) {
        // TV completada: mostrar "COMPLETE"
        renderCompleted(c, game, i);
      } else {
        // TV futura: idle/teaser
        game.renderIdle(c);
      }
    }
    else if (gameState === 'transition') {
      if (i === currentLevel) {
        // TV que acabou de ser completada: efeito de transição
        renderTransitionEffect(c, now);
      } else if (i === currentLevel + 1) {
        // Próxima TV: ativando
        renderActivating(c, GAMES[i], now);
      } else if (i < currentLevel) {
        renderCompleted(c, game, i);
      } else {
        game.renderIdle(c);
      }
    }
    else if (gameState === 'victory') {
      renderVictoryScreen(c, i, now);
    }
  });
}

function renderCountdown(ctx) {
  ctx.fillStyle = '#000';
  ctx.globalAlpha = 0.7;
  ctx.fillRect(0, 0, TV_W, TV_H);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#0ff';
  ctx.font = fsTV(48);
  ctx.textAlign = 'center';
  const text = countdownValue > 0 ? countdownValue.toString() : 'GO!';
  ctx.fillText(text, CX, yTV(260));
  ctx.textAlign = 'left';
}

function renderCompleted(ctx, game, level) {
  ctx.fillStyle = '#050518';
  ctx.fillRect(0, 0, TV_W, TV_H);
  ctx.fillStyle = '#0f8';
  ctx.font = fsTV(10);
  ctx.textAlign = 'center';
  ctx.fillText(`✓ ${game.name}`, CX, yTV(230));
  ctx.fillStyle = '#0ff';
  ctx.font = fsTV(7);
  ctx.fillText('COMPLETE', CX, yTV(260));
  ctx.textAlign = 'left';
}

function renderTransitionEffect(ctx, now) {
  const elapsed = now - transitionStart;
  const flash = Math.sin(elapsed * 0.02) > 0;
  ctx.fillStyle = flash ? '#0ff' : '#f0f';
  ctx.fillRect(0, 0, TV_W, TV_H);
}

function renderActivating(ctx, game, now) {
  const elapsed = now - transitionStart;
  const alpha = Math.min(1, elapsed / 1500);
  ctx.fillStyle = '#050518';
  ctx.fillRect(0, 0, TV_W, TV_H);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#0ff';
  ctx.font = fsTV(10);
  ctx.textAlign = 'center';
  ctx.fillText(`NÍVEL ${game.difficulty}`, CX, yTV(220));
  ctx.fillText(game.name, CX, yTV(250));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function renderVictoryScreen(ctx, tvIndex, now) {
  const elapsed = now - victoryStart;
  const flash   = Math.floor(elapsed / 200) % 4;
  const colors  = ['#0ff', '#f0f', '#ff0', '#0f8'];
  const phase2  = elapsed > 2000;
  const ne      = nameEntry;

  ctx.fillStyle = '#050518';
  ctx.fillRect(0, 0, TV_W, TV_H);
  ctx.fillStyle = colors[flash];
  ctx.font = fsTV(12);
  ctx.textAlign = 'center';

  if (tvIndex === 3) {
    if (!phase2 || !ne.done) {
      // Flash inicial
      ctx.fillText('★ VITÓRIA ★', CX, yTV(180));
      ctx.fillStyle = '#fff'; ctx.font = fsTV(16);
      ctx.fillText((globalTimer/1000).toFixed(1)+'s', CX, yTV(230));
    }
    if (phase2 && !ne.done) {
      // Name entry
      ctx.fillStyle = 'rgba(0,0,10,0.7)'; ctx.fillRect(TV_W*0.1, yTV(260), TV_W*0.8, yTV(180));
      ctx.fillStyle = '#0ff7'; ctx.font = fsTV(8);
      ctx.fillText('SEU NOME', CX, yTV(295));
      const bw=40, bh=48, gap=12, sx=CX-(bw*3+gap*2)/2;
      ne.letters.forEach((ch, i) => {
        const bx=sx+i*(bw+gap), by=yTV(315), active=i===ne.pos;
        ctx.fillStyle = active?'#0ff':'#0a0a2a'; ctx.fillRect(bx,by,bw,bh);
        ctx.strokeStyle = active?'#fff':'#0ff5'; ctx.lineWidth=active?2:1; ctx.strokeRect(bx,by,bw,bh);
        ctx.fillStyle = active?'#000':'#0ff'; ctx.font=fsTV(16);
        ctx.fillText(ch, bx+bw/2, by+bh*0.68);
      });
      ctx.fillStyle='#0ff5'; ctx.font=fsTV(6);
      ctx.fillText('↑↓ letra    →/A confirma', CX, yTV(410));
    }
    if (ne.done) {
      ctx.fillStyle='#0ff'; ctx.font=fsTV(9);
      ctx.fillText('TOP TIMES', CX, yTV(60));
      const data = rankingData.length>0 ? rankingData : ranking;
      data.slice(0,7).forEach((r,ri) => {
        const isMe = r.name===ne.letters.join('') && Math.abs(r.time-globalTimer/1000)<1;
        ctx.fillStyle = ri===0?'#ff0': isMe?'#0f8' : ri<3?'#0ff':'#aaa';
        ctx.font = fsTV(7);
        const medal = ri===0?'★':ri===1?'▲':ri===2?'●':`${ri+1}`;
        ctx.fillText(`${medal} ${r.name}  ${(+r.time).toFixed(1)}s`, CX, yTV(100)+ri*yTV(52));
      });
    }
  } else {
    ctx.fillText(`LEVEL ${tvIndex+1} ✓`, CX, yTV(240));
  }
  ctx.textAlign = 'left';
}

function renderRanking(ctx) {
  ctx.fillStyle = '#050518';
  ctx.fillRect(0, 0, TV_W, TV_H);
  ctx.fillStyle = '#0ff';
  ctx.font = fsTV(10);
  ctx.textAlign = 'center';
  ctx.fillText('RANKING DO DIA', CX, yTV(80));
  renderRankingList(ctx, yTV(120));
  ctx.textAlign = 'left';
}

function renderRankingList(ctx, startY) {
  ctx.font = fsTV(8);
  ctx.textAlign = 'center';
  const lineGap = (22 * TV_H) / 480;
  const sub = (30 * TV_H) / 480;
  if (ranking.length === 0) {
    ctx.fillStyle = '#444';
    ctx.fillText('SEM RECORDES AINDA', CX, startY + sub);
  } else {
    ranking.slice(0, 10).forEach((entry, i) => {
      const color = i === 0 ? '#ff0' : i < 3 ? '#0ff' : '#aaa';
      ctx.fillStyle = color;
      ctx.fillText(`${(i + 1).toString().padStart(2)}. ${entry.name} — ${entry.time.toFixed(1)}s`, CX, startY + i * lineGap);
    });
  }
  ctx.textAlign = 'left';
}

// ============================================================
// TIMER DISPLAY
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
  try {
    const data = localStorage.getItem('totem-crt-ranking');
    if (data) return JSON.parse(data);
  } catch (e) {}
  return [];
}

function saveRanking() {
  localStorage.setItem('totem-crt-ranking', JSON.stringify(ranking));
}

function addToRanking(time) {
  ranking.push({ name: 'AAA', time }); // TODO: input de 3 letras
  ranking.sort((a, b) => a.time - b.time);
  ranking = ranking.slice(0, 10);
  saveRanking();
}
