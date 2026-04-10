// corrida.js — Corrida pseudo-3D estilo OutRun para Totem CRT
// Adaptado de javascript-racer (jakesgordon)
// ES Module, 640×480, sem dependências externas

import { getState as rushInputRef } from '../input.js';

const W = 640;
const H = 480;
const CAMERA_HEIGHT = 1000;
const FOV = 80; // degrees
const CAMERA_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
/** Segmentos desenhados por frame; 150 era pesado no totem (várias TVs + fundo denso). */
const DRAW_DISTANCE = 96;
const SEGMENT_LENGTH = 200;
const ROAD_WIDTH = 2000;
const TRACK_LENGTH = 200; // segmentos (1 volta)
const RUMBLE_LENGTH = 3; // segmentos por faixa de meio-fio
const LANES = 3;

// Cores neon cyberpunk
const COLORS = {
  SKY: '#050518',
  GRASS: '#050518',
  FOG: '#050518',
  LIGHT: { road: '#1a1a3a', grass: '#050518', rumble: '#0a0a1a', lane: '#0ff' },
  DARK: { road: '#101028', grass: '#030310', rumble: '#050510' },
  START: { road: '#0f0', grass: '#0f0', rumble: '#0f0' },
  FINISH: { road: '#f0f', grass: '#f0f', rumble: '#f0f' },
};

/** Orquestrador usa dt em ms (~16.67); test_corrida também. Física em segundos. */
function dtSeconds(dt) {
  if (dt == null || dt <= 0) return 1 / 60;
  return dt > 1 ? dt / 1000 : dt;
}

// Helpers matemáticos
const Util = {
  toInt: (obj, def) => {
    if (obj !== null) {
      const x = parseInt(obj, 10);
      if (!isNaN(x)) return x;
    }
    return Util.toInt(def, 0);
  },
  limit: (value, min, max) => Math.max(min, Math.min(value, max)),
  percentRemaining: (n, total) => (n % total) / total,
  accelerate: (v, accel, dt) => v + accel * dt,
  interpolate: (a, b, percent) => a + (b - a) * percent,
  easeIn: (a, b, percent) => a + (b - a) * Math.pow(percent, 2),
  easeOut: (a, b, percent) => a + (b - a) * (1 - Math.pow(1 - percent, 2)),
  easeInOut: (a, b, percent) => a + (b - a) * (-Math.cos(percent * Math.PI) / 2 + 0.5),
  increase: (start, increment, max) => {
    let result = start + increment;
    while (result >= max) result -= max;
    while (result < 0) result += max;
    return result;
  },
  project: (p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) => {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round(width / 2 + p.screen.scale * p.camera.x * (width / 2));
    p.screen.y = Math.round(height / 2 - p.screen.scale * p.camera.y * (height / 2));
    p.screen.w = Math.round(p.screen.scale * roadWidth * (width / 2));
  },
};

// Renderização
const Render = {
  polygon: (ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  },

  segment: (ctx, width, lanes, x1, y1, w1, x2, y2, w2, fog, color) => {
    const r1 = w1 / Math.max(6, 2 * lanes); // rumble width
    const r2 = w2 / Math.max(6, 2 * lanes);
    const l1 = w1 / Math.max(32, 8 * lanes); // lane marker width
    const l2 = w2 / Math.max(32, 8 * lanes);

    // Grama (fundo)
    ctx.fillStyle = color.grass;
    ctx.fillRect(0, y2, width, y1 - y2);

    // Meio-fio (rumble strips)
    Render.polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, color.rumble);
    Render.polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, color.rumble);

    // Pista
    Render.polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);

    // Linhas das pistas
    if (color.lane) {
      const lanew1 = (w1 * 2) / lanes;
      const lanew2 = (w2 * 2) / lanes;
      let lanex1 = x1 - w1 + lanew1;
      let lanex2 = x2 - w2 + lanew2;
      for (let lane = 1; lane < lanes; lane++, lanex1 += lanew1, lanex2 += lanew2) {
        Render.polygon(
          ctx,
          lanex1 - l1 / 2,
          y1,
          lanex1 + l1 / 2,
          y1,
          lanex2 + l2 / 2,
          y2,
          lanex2 - l2 / 2,
          y2,
          color.lane
        );
      }
    }

    // Fog
    if (fog < 1) {
      ctx.globalAlpha = 1 - fog;
      ctx.fillStyle = COLORS.FOG;
      ctx.fillRect(0, y2, width, y1 - y2);
      ctx.globalAlpha = 1;
    }
  },
};

// Estado do jogo
let _canvas = null;
let _ctx = null;
let _inputRef = null;

let segments = [];
let position = 0; // Z position do player
let playerX = 0; // -1 a 1
let speed = 0;
let playerZ = 0;
let state = 'idle'; // 'idle' | 'playing' | 'won'
let lapTime = 0;
/** Distância percorrida na volta (vitória quando >= trackLength) */
let distanceTraveled = 0;
let trackLength = 0;
let maxSpeed = 0;
let accel = 0;
let breaking = 0;
let decel = 0;
let offRoadDecel = 0;
let offRoadLimit = 0;
let centrifugal = 0.3;
/** Lateral por tecla: taxa base maior = resposta mais imediata (sem misturar com curva da pista) */
const STEER_INPUT_RATE = 5.5;
const STEER_SPEED_FLOOR = 0.2;

/** Cyber Boost — cargas (HUD + lógica futura) */
const BOOST_MAX_CHARGES = 5;
let boostCharges = BOOST_MAX_CHARGES;
const BOOST_DURATION_SEC = 1.8;
const BOOST_ACCEL_MULT = 4.6;
const BOOST_TOP_SPEED_MULT = 1.75;
const BOOST_FLASH_SEC = 0.32;
let boostTimer = 0;
let boostFlashTimer = 0;
let boostTextTimer = 0;
let boostInputLatch = false;
let boostKeyHeld = false;
const BOOST_RECHARGE_POINTS = [0.22, 0.47, 0.71, 0.9];
let boostRechargeFlags = BOOST_RECHARGE_POINTS.map(() => false);
let boostRechargeTextTimer = 0;
/** Neon / portal visível a partir desta distância ao fim (alinhar com explosão antecipada). */
const FINISH_NEON_DRAW_DISTANCE = SEGMENT_LENGTH * 322;
/** Escala de intensidade do arco (efeitos internos). */
const FINISH_GATE_DISTANCE = SEGMENT_LENGTH * 210;
/** Após cruzar o portal: explosão + interferência; depois tela “desafio final”; só então `won`. */
const PORTAL_FINALE_DURATION_SEC = 2.25;
/** Quanto tempo mostra “Teleporte ativando” + loading por cima da explosão (curto). */
const PORTAL_TELEPORT_UI_SEC = 0.9;
/** Em quanto tempo a barra de loading enche (ease). */
const PORTAL_TELEPORT_BAR_FILL_SEC = 0.68;
const TELEPORT_ACTIVATING_LABEL = 'Teleporte ativando';
const FINAL_CHALLENGE_DURATION_SEC = 4.9;
/**
 * Faltam ~este trecho ao fim quando ganha — muito antes do fim (sem tempo de “fechar” a volta; interceptação).
 */
const PORTAL_EXPLOSION_LEAD_PAST_GATE = SEGMENT_LENGTH * 298;
/** Título nos ecrãs finais / portal. */
const LAB_TRANSPORT_TITLE = 'Transportando para O Laboratorio';
const LAB_SUB_CRT = '// SEQUÊNCIA CRT — MODO TOTEM //';
const LAB_SUB_ORCH = 'AGUARDE A TRANSIÇÃO DO ORQUESTRADOR';
/** |playerX| ≥ isto: recentrar na pista + glitch (raio maior = só ao estar mais fora). */
const OFF_TRACK_RESPAWN_X = 2.82;
/** Distância ao fim onde começa interferência CRT (ligada ao trigger da explosão, um pouco antes). */
const PRE_EXPLOSION_INTERFERENCE_START = SEGMENT_LENGTH * 318;
const TRACK_RESPAWN_GLITCH_SEC = 0.58;
let portalFinaleT = 0;
let finalChallengeT = 0;
const ENEMY_CAR_COUNT = 23;
let enemyCars = [];
let enemyHitFxTimer = 0;
let enemyCollisionCooldown = 0;
let trackRespawnGlitchT = 0;
let enemyBlueSprite = null;
let enemyTruckSprite = null;

function onBoostKeyDown(ev) {
  if (ev.code === 'KeyX' || ev.code === 'KeyC' || ev.code === 'ShiftLeft') boostKeyHeld = true;
}

function onBoostKeyUp(ev) {
  if (ev.code === 'KeyX' || ev.code === 'KeyC' || ev.code === 'ShiftLeft') boostKeyHeld = false;
}

function enemySpriteUrl(filename) {
  return new URL(`../../assets/drive/backdrop/${filename}`, import.meta.url).href;
}

function loadEnemySprites() {
  enemyBlueSprite = null;
  enemyTruckSprite = null;
  const loadOne = (file, assign) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth) assign(img);
    };
    img.onerror = () => assign(null);
    img.src = enemySpriteUrl(file);
  };
  loadOne('carro_azul_01.png', (img) => {
    enemyBlueSprite = img;
  });
  loadOne('enemy_truck.png', (img) => {
    enemyTruckSprite = img;
  });
}

function resetEnemyCars() {
  enemyCars = [];
  if (trackLength <= 0) return;
  const laneOffsets = [-0.72, 0, 0.72];
  for (let i = 0; i < ENEMY_CAR_COUNT; i++) {
    const lane = laneOffsets[i % laneOffsets.length];
    const jitter = ((Math.sin(i * 37.17) + 1) * 0.5 - 0.5) * 0.18;
    const z = ((i + 1) / (ENEMY_CAR_COUNT + 1)) * trackLength;
    const speedMul = 0.28 + ((Math.sin(i * 11.13) + 1) * 0.5) * 0.4;
    enemyCars.push({
      z,
      offset: lane + jitter,
      speed: maxSpeed * speedMul,
      colorA: i % 2 === 0 ? '#22d3ee' : '#f472b6',
      colorB: i % 2 === 0 ? '#67e8f9' : '#f9a8d4',
      spriteKind: i % 2 === 0 ? 'blue' : 'truck',
    });
  }
}

/** Sprites do carro (projeto Race) — app/assets/drive/player_*.png */
function driveAssetUrl(filename) {
  return new URL(`../../assets/drive/${filename}`, import.meta.url).href;
}
const PLAYER_CAR_ASSETS = {
  straight: driveAssetUrl('player_straight.png'),
  left: driveAssetUrl('player_left.png'),
  right: driveAssetUrl('player_right.png'),
};
let playerCarImages = { straight: null, left: null, right: null };
let playerCarSpritesReady = false;

function loadPlayerCarSprites() {
  playerCarSpritesReady = false;
  playerCarImages = { straight: null, left: null, right: null };
  const loadOne = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  Promise.all([
    loadOne(PLAYER_CAR_ASSETS.straight),
    loadOne(PLAYER_CAR_ASSETS.left),
    loadOne(PLAYER_CAR_ASSETS.right),
  ]).then(([s, l, r]) => {
    playerCarImages.straight = s;
    playerCarImages.left = l || s;
    playerCarImages.right = r || s;
    playerCarSpritesReady = !!(s && s.naturalWidth);
  });
}

/** Sprites conforme teclas (setas), não posição na pista — alinhado ao Race full-res */
function pickPlayerCarImage() {
  if (!playerCarSpritesReady || !playerCarImages.straight || !_inputRef) return null;
  if (_inputRef.left) return playerCarImages.left || playerCarImages.straight;
  if (_inputRef.right) return playerCarImages.right || playerCarImages.straight;
  return playerCarImages.straight;
}

/** Escala extra do sprite no ecrã (ajuste visual) */
const PLAYER_CAR_DISPLAY_SCALE = 2.35;

function drawPlayerCarSprite(ctx, playerScreenX, playerScreenY, playerW, playerH, img) {
  if (!img || !img.naturalWidth) return false;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const destW = Math.max(playerW * 2.35, 72) * PLAYER_CAR_DISPLAY_SCALE;
  const destH = destW * (ih / iw);
  const drawX = W / 2 - destW / 2;
  const drawY = playerScreenY + playerH - destH;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, iw, ih, drawX, drawY, destW, destH);
  ctx.imageSmoothingEnabled = prevSmooth;
  return true;
}

// ─── Fundo synth (Race): gradiente + lua + silhuetas + estrelas + cidade em parallax ───
let backdropMoon = null;
let backdropLayers = [null, null, null, null];
let backdropFlyers = [null, null, null, null];
let backdropPalmTree = null;
let backdropAssetsTried = false;
let palmPlacements = [];

function backdropUrl(name) {
  return new URL(`../../assets/drive/backdrop/${name}`, import.meta.url).href;
}

function loadBackdropAssets() {
  if (backdropAssetsTried) return;
  backdropAssetsTried = true;
  const loadImg = (url) =>
    new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url;
    });
  loadImg(backdropUrl('lua.png')).then((img) => {
    backdropMoon = img && img.naturalWidth ? img : null;
  });
  const files = ['Night4X_0006_1.png', 'Night4X_0004_3.png', 'Night4X_0003_4.png', 'Night4X_0001_6.png'];
  files.forEach((f, i) => {
    loadImg(backdropUrl(f)).then((img) => {
      if (img && img.naturalWidth) backdropLayers[i] = img;
    });
  });
  const flyerFiles = ['fly_police.png', 'fly_yellow.png', 'fly_truck.png', 'fly_red.png'];
  flyerFiles.forEach((f, i) => {
    loadImg(backdropUrl(f)).then((img) => {
      if (img && img.naturalWidth) backdropFlyers[i] = img;
    });
  });
  loadImg(backdropUrl('palm_tree.png')).then((img) => {
    backdropPalmTree = img && img.naturalWidth ? img : null;
  });
}

function rndStar(k) {
  const s = Math.sin(k * 12.9898 + k * k * 0.001) * 43758.5453;
  return s - Math.floor(s);
}

/** Adaptado de Race/common.js — neonSynthBackdrop (640×480) */
function renderRaceBackdrop(ctx, positionAlongTrack, playerYShift, opts) {
  const idleStatic = !!(opts && opts.idleStatic);
  const w = W;
  const h = H;
  const v = playerYShift || 0;
  const panTrack = idleStatic ? 0 : positionAlongTrack;
  const tStars = idleStatic ? 0.72 : performance.now() * 0.001;
  // Pan global do fundo (ridges + estrelas + offsets da cidade) — mais lento = menos “estranho”
  const backdropPan = 0.35;
  const skyOffset = panTrack * 0.00014 * backdropPan;
  const hillOffset = panTrack * 0.00019 * backdropPan;
  const treeOffset = panTrack * 0.00024 * backdropPan;
  const hasCity = backdropLayers.some((x) => x && x.naturalWidth);

  function drawNeonMoon(img) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const moonW = w * 0.18;
    const moonH = moonW * (ih / iw);
    const mx = w * 0.74;
    const my = h * 0.14;
    const pulse = idleStatic ? 0.96 : 0.92 + 0.08 * Math.sin(performance.now() * 0.0018);
    const r = Math.max(moonW, moonH) * 0.95;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let g = ctx.createRadialGradient(mx, my, r * 0.1, mx, my, r * 1.55);
    g.addColorStop(0, 'rgba(255, 60, 70, 0.52)');
    g.addColorStop(0.45, 'rgba(160, 20, 35, 0.22)');
    g.addColorStop(1, 'rgba(40, 0, 8, 0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.68 * pulse;
    ctx.beginPath();
    ctx.arc(mx, my, r * 1.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.shadowColor = '#ff3344';
    ctx.shadowBlur = r * 0.42;
    ctx.drawImage(img, 0, 0, iw, ih, mx - moonW * 0.5, my - moonH * 0.5, moonW, moonH);
    ctx.restore();
  }

  function drawParallaxLayer(img, scroll, alpha, yBaseFrac, hFrac, scaleMul, cropTopFrac, blendMode) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const sy = Math.floor(ih * cropTopFrac);
    const sh = Math.max(1, ih - sy);
    const targetH = h * hFrac;
    const baseScale = targetH / sh;
    const s = baseScale * scaleMul;
    const dw = iw * s;
    const dy = Math.round(h * yBaseFrac);
    const scrollPx = scroll * dw;
    const off = scrollPx - Math.floor(scrollPx / dw) * dw;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = blendMode || 'screen';
    ctx.imageSmoothingEnabled = true;
    if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'low';
    for (let n = -1; n <= Math.ceil(w / dw) + 1; n++) {
      const dx = Math.round(n * dw - off);
      ctx.drawImage(img, 0, sy, iw, sh, dx, dy, Math.round(dw), Math.round(targetH));
    }
    ctx.restore();
  }

  function ridgeY(px, baseY, scroll, amp, seed) {
    const nx = px + scroll + seed;
    return (
      baseY +
      Math.sin(nx * 0.0065) * amp +
      Math.sin(nx * 0.017) * amp * 0.55 +
      Math.sin(nx * 0.038) * amp * 0.28
    );
  }

  function drawWireRidge(scroll, baseY, amp, color, glow, lineW, vertEvery, seed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = glow;
    ctx.shadowBlur = lineW * 5.5;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 6) {
      const y = ridgeY(px, baseY, scroll, amp, seed);
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.shadowBlur = lineW * 2.8;
    for (let px = 0; px <= w; px += vertEvery) {
      const y = ridgeY(px, baseY, scroll, amp, seed);
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#2a0a0c');
  skyGrad.addColorStop(0.28, '#180508');
  skyGrad.addColorStop(0.52, '#0c0204');
  skyGrad.addColorStop(0.78, '#040001');
  skyGrad.addColorStop(1, '#000000');
  ctx.save();
  ctx.globalAlpha = hasCity ? 0.62 : 1;
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  drawNeonMoon(backdropMoon);

  drawWireRidge(skyOffset * 120, h * 0.44 + v * 0.03, 42, 'rgba(150, 90, 255, 0.48)', '#aa66ff', 0.9, 72, 9);
  drawWireRidge(hillOffset * 170, h * 0.5 + v * 0.05, 56, 'rgba(220, 45, 65, 0.52)', '#dd3355', 1.0, 60, 19);
  drawWireRidge(treeOffset * 230, h * 0.56 + v * 0.07, 70, 'rgba(200, 90, 110, 0.46)', '#cc6677', 1.05, 48, 31);

  const starColors = [
    '#ffffff', '#ffd8e0', '#ff8888', '#ff5566', '#cc2233', '#ffaaaa',
    '#b088ff', '#8866dd', '#aa77ee', '#9977ff', '#aaddff', '#9988ee',
    '#aa88ff', '#8866cc', '#7744bb', '#bba0ff', '#c8b0ff',
    '#ddaaff', '#cc99ff', '#8866cc', '#b8a8ff',
  ];
  const starDrift = performance.now() * 0.000055;
  for (let i = 0; i < 115; i++) {
    const baseX = rndStar(i * 3.17 + 1) * w;
    const x = ((baseX - starDrift * (38 + rndStar(i * 8.71 + 1) * 140) + w * 1000) % w + w) % w;
    const y = rndStar(i * 5.91 + 2) * h * 0.58;
    const ph = rndStar(i * 7.23 + 3) * Math.PI * 2;
    const fq = 1.0 + rndStar(i * 11.7 + 4) * 5;
    const tw = 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(tStars * fq + ph));
    ctx.globalAlpha = tw * (0.48 + rndStar(i * 19.4) * 0.48);
    ctx.fillStyle = starColors[Math.floor(rndStar(i * 17.31 + i * 0.01) * starColors.length) % starColors.length];
    let sz = 2;
    const rsz = rndStar(i * 2.71 + 9);
    if (rsz > 0.5) sz = 3;
    if (rsz > 0.82) sz = 4;
    ctx.fillRect(Math.floor(x), Math.floor(y), sz, sz);
  }
  ctx.globalAlpha = 1;

  // Trânsito aéreo cyberpunk (sprites do usuário) em profundidades distintas
  const flyerDefs = [
    { img: backdropFlyers[0], yFrac: 0.18, scale: 0.42, speedMul: 0.22, alpha: 0.88, phase: 0.02, dir: -1 },
    { img: backdropFlyers[1], yFrac: 0.24, scale: 0.36, speedMul: 0.31, alpha: 0.82, phase: 0.13, dir: 1 },
    { img: backdropFlyers[2], yFrac: 0.31, scale: 0.56, speedMul: 0.18, alpha: 0.78, phase: 0.25, dir: -1 },
    { img: backdropFlyers[3], yFrac: 0.22, scale: 0.34, speedMul: 0.35, alpha: 0.86, phase: 0.38, dir: 1 },
    { img: backdropFlyers[0], yFrac: 0.27, scale: 0.3, speedMul: 0.42, alpha: 0.72, phase: 0.49, dir: 1 },
    { img: backdropFlyers[1], yFrac: 0.34, scale: 0.28, speedMul: 0.4, alpha: 0.68, phase: 0.61, dir: -1 },
    { img: backdropFlyers[2], yFrac: 0.2, scale: 0.46, speedMul: 0.24, alpha: 0.74, phase: 0.74, dir: 1 },
    { img: backdropFlyers[3], yFrac: 0.3, scale: 0.32, speedMul: 0.37, alpha: 0.7, phase: 0.87, dir: -1 },
  ];
  if (!idleStatic) {
    const timeNow = performance.now() * 0.001;
    ctx.save();
    for (let i = 0; i < flyerDefs.length; i++) {
      const fd = flyerDefs[i];
      const img = fd.img;
      if (!img || !img.complete || !img.naturalWidth) continue;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const bob = Math.sin(timeNow * 1.5 * (1.2 + i * 0.22) + i) * (2 + i * 0.6);
      const dw = iw * fd.scale;
      const dh = ih * fd.scale;
      const dir = fd.dir || -1;
      const speedPx = 150 + fd.speedMul * 300;
      const travel = w + dw * 2 + 220;
      const sweep = (timeNow * speedPx * 0.1 + fd.phase * travel) % travel;
      const x = dir < 0 ? (w + dw + 110) - sweep : (-dw - 110) + sweep;
      const y = h * fd.yFrac + bob;
      ctx.globalAlpha = fd.alpha;
      if (dir > 0) {
        ctx.save();
        ctx.translate(x + dw, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, dw, dh);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  const cityScroll = 0.09;
  if (hasCity) {
    drawParallaxLayer(backdropLayers[0], skyOffset * 0.1 * cityScroll, 0.6, 0.27, 0.3, 1.0, 0.48, 'screen');
    drawParallaxLayer(backdropLayers[1], hillOffset * 0.2 * cityScroll, 0.72, 0.31, 0.33, 1.0, 0.5, 'screen');
    drawParallaxLayer(backdropLayers[2], treeOffset * 0.34 * cityScroll, 0.84, 0.35, 0.36, 1.02, 0.52, 'screen');
    drawParallaxLayer(backdropLayers[3], (treeOffset * 0.52 + skyOffset * 0.08) * cityScroll, 1.0, 0.15, 0.42, 0.92, 0.26, 'source-over');
  }
}

let bgMusic = null;
let engineLoop = null;
let boostSfx = null;
let portalExplosionSfx = null;

/** Provisório: silencia música, motor, boost e explosão do portal (tecla M + botão). */
let driveAudioMuted = false;
let _driveMuteBtn = null;

function updateDriveMuteButton() {
  if (!_driveMuteBtn) return;
  _driveMuteBtn.textContent = driveAudioMuted ? '🔇' : '🔊';
  _driveMuteBtn.title = driveAudioMuted ? 'Ligar som (M)' : 'Silenciar (M)';
  _driveMuteBtn.setAttribute('aria-label', driveAudioMuted ? 'Som desligado. Tecla M para ligar.' : 'Som ligado. Tecla M para silenciar.');
  _driveMuteBtn.setAttribute('aria-pressed', driveAudioMuted ? 'true' : 'false');
}

function setDriveAudioMuted(muted) {
  driveAudioMuted = !!muted;
  initDriveAudioElements();
  if (driveAudioMuted) {
    if (bgMusic) bgMusic.pause();
    if (engineLoop) engineLoop.pause();
    if (boostSfx) boostSfx.pause();
    if (portalExplosionSfx) portalExplosionSfx.pause();
  } else {
    startBackgroundMusic();
  }
  updateDriveMuteButton();
}

function toggleDriveAudioMute() {
  setDriveAudioMuted(!driveAudioMuted);
}

function onDriveMuteKeyDown(ev) {
  if (ev.code !== 'KeyM') return;
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  ev.preventDefault();
  toggleDriveAudioMute();
}

function ensureDriveMuteButton() {
  if (!_canvas || _driveMuteBtn?.isConnected) return;
  const parent = _canvas.parentElement;
  if (!parent) return;
  const cs = getComputedStyle(parent);
  if (cs.position === 'static') parent.style.position = 'relative';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = [
    'position:absolute',
    'top:6px',
    'right:6px',
    'z-index:20',
    'font-size:14px',
    'line-height:1',
    'padding:4px 6px',
    'cursor:pointer',
    'background:rgba(8,8,20,.9)',
    'color:#9cf',
    'border:1px solid #0ff',
    'border-radius:2px',
    'image-rendering:pixelated',
  ].join(';');
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDriveAudioMute();
  });
  parent.appendChild(btn);
  _driveMuteBtn = btn;
  updateDriveMuteButton();
}

function driveAudioUrl(filename) {
  return new URL(`../../assets/drive/Audios/${filename}`, import.meta.url).href;
}
const BG_MUSIC_SRC = driveAudioUrl('nikitakondrashev-cyberpunk-437545 (1).mp3');
const ENGINE_LOOP_SRC = driveAudioUrl('freesound_community-engine-47745.mp3');
const BOOST_SFX_SRC = driveAudioUrl('716972__newlocknew__expldsgn_engine-ignition-burstengine-startnitroflareblast.mp3');
const PORTAL_EXPLOSION_SRC = driveAudioUrl('490266__anomaex__sci-fi_explosion_2.wav');

function initDriveAudioElements() {
  if (!bgMusic) {
    bgMusic = new Audio(BG_MUSIC_SRC);
    bgMusic.loop = true;
    bgMusic.volume = 0.24;
  }
  if (!engineLoop) {
    engineLoop = new Audio(ENGINE_LOOP_SRC);
    engineLoop.loop = true;
    engineLoop.volume = 0.14;
  }
  if (!boostSfx) {
    boostSfx = new Audio(BOOST_SFX_SRC);
    boostSfx.loop = false;
    boostSfx.volume = 0.42;
  }
}

function startBackgroundMusic() {
  initDriveAudioElements();
  if (!bgMusic) return;
  if (driveAudioMuted) {
    bgMusic.pause();
    return;
  }
  bgMusic.play().catch(() => {});
}

function updateEngineLoop() {
  if (!engineLoop) return;
  if (driveAudioMuted) {
    if (!engineLoop.paused) engineLoop.pause();
    return;
  }
  const drivingFinale = state === 'won' && portalFinaleT > 0;
  const moving =
    (state === 'playing' || drivingFinale) && speed > maxSpeed * 0.03;
  if (!moving) {
    if (!engineLoop.paused) engineLoop.pause();
    return;
  }
  const speedPct = Math.min(1, Math.max(0, speed / (maxSpeed * BOOST_TOP_SPEED_MULT)));
  engineLoop.volume = 0.1 + speedPct * 0.2;
  if (engineLoop.paused) engineLoop.play().catch(() => {});
}

function playBoostSfx() {
  if (driveAudioMuted || !boostSfx) return;
  try {
    boostSfx.currentTime = 0;
  } catch (_) {}
  boostSfx.play().catch(() => {});
}

function playPortalExplosionSfx() {
  if (driveAudioMuted) return;
  if (!portalExplosionSfx) {
    portalExplosionSfx = new Audio(PORTAL_EXPLOSION_SRC);
    portalExplosionSfx.volume = 0.58;
  }
  try {
    portalExplosionSfx.currentTime = 0;
  } catch (_) {}
  portalExplosionSfx.play().catch(() => {});
}

function initAudio() {
  initDriveAudioElements();
}

// Construção da pista
function lastY() {
  return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
}

function addSegment(curve, y) {
  const n = segments.length;
  segments.push({
    index: n,
    p1: { world: { y: lastY(), z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
    p2: { world: { y: y, z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
    curve: curve,
    color: Math.floor(n / RUMBLE_LENGTH) % 2 ? COLORS.DARK : COLORS.LIGHT,
  });
}

function addRoad(enter, hold, leave, curve, y) {
  const startY = lastY();
  const endY = startY + Util.toInt(y, 0) * SEGMENT_LENGTH;
  const total = enter + hold + leave;
  for (let n = 0; n < enter; n++) {
    addSegment(Util.easeIn(0, curve, n / enter), Util.easeInOut(startY, endY, n / total));
  }
  for (let n = 0; n < hold; n++) {
    addSegment(curve, Util.easeInOut(startY, endY, (enter + n) / total));
  }
  for (let n = 0; n < leave; n++) {
    addSegment(Util.easeInOut(curve, 0, n / leave), Util.easeInOut(startY, endY, (enter + hold + n) / total));
  }
}

const ROAD = {
  LENGTH: { SHORT: 25, MEDIUM: 50, LONG: 100 },
  HILL: { LOW: 20, MEDIUM: 40, HIGH: 60 },
  CURVE: { EASY: 2, MEDIUM: 4, HARD: 6 },
};

function addStraight(num = ROAD.LENGTH.MEDIUM) {
  addRoad(num, num, num, 0, 0);
}

function addCurve(num = ROAD.LENGTH.MEDIUM, curve = ROAD.CURVE.MEDIUM, height = 0) {
  addRoad(num, num, num, curve, height);
}

function addHill(num = ROAD.LENGTH.MEDIUM, height = ROAD.HILL.MEDIUM) {
  addRoad(num, num, num, 0, height);
}

function buildPalmPlacement() {
  palmPlacements = new Array(segments.length);
  for (let i = 0; i < segments.length; i++) {
    const leftRoll = rndStar(i * 0.127 + 0.37);
    const rightRoll = rndStar(i * 0.149 + 0.79);
    palmPlacements[i] = {
      left: leftRoll > 0.93,
      right: rightRoll > 0.94,
      leftVar: Math.floor(leftRoll * 10000),
      rightVar: Math.floor(rightRoll * 10000) + 3,
    };
  }
}

function buildTrack() {
  segments = [];

  // Pista com variedade: retas, curvas e morros
  addStraight(ROAD.LENGTH.SHORT);
  addCurve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.EASY, ROAD.HILL.LOW);
  addStraight(ROAD.LENGTH.MEDIUM);
  addCurve(ROAD.LENGTH.LONG, -ROAD.CURVE.MEDIUM, 0);
  addHill(ROAD.LENGTH.MEDIUM, ROAD.HILL.MEDIUM);
  addStraight(ROAD.LENGTH.SHORT);
  addCurve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.HARD, ROAD.HILL.LOW);
  addStraight(ROAD.LENGTH.MEDIUM);
  addCurve(ROAD.LENGTH.LONG, ROAD.CURVE.MEDIUM, -ROAD.HILL.LOW);
  addHill(ROAD.LENGTH.LONG, ROAD.HILL.HIGH);
  addStraight(ROAD.LENGTH.MEDIUM);

  // Cores especiais nos segmentos de start/finish
  const startIdx = 2;
  segments[startIdx].color = COLORS.START;
  segments[startIdx + 1].color = COLORS.START;

  for (let n = 0; n < RUMBLE_LENGTH; n++) {
    segments[segments.length - 1 - n].color = COLORS.FINISH;
  }

  trackLength = segments.length * SEGMENT_LENGTH;
  buildPalmPlacement();
}

function findSegment(z) {
  return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
}

// Update (dtSec = segundos)
function updateGame(dtSec) {
  const portalFinaleDrive = state === 'won' && portalFinaleT > 0;
  if ((!portalFinaleDrive && state !== 'playing') || !_inputRef) return;
  if (enemyHitFxTimer > 0) enemyHitFxTimer = Math.max(0, enemyHitFxTimer - dtSec);
  if (enemyCollisionCooldown > 0) enemyCollisionCooldown = Math.max(0, enemyCollisionCooldown - dtSec);
  if (trackRespawnGlitchT > 0) trackRespawnGlitchT = Math.max(0, trackRespawnGlitchT - dtSec);

  const playerSegment = findSegment(position + playerZ);
  const speedPercentRaw = speed / maxSpeed;
  const speedPercent = Math.min(1, Math.max(0, speedPercentRaw));
  const boostPressed = !!_inputRef.buttonB || boostKeyHeld;
  /** Só com boost de velocidade ativo — segurar B sem carga não altera a física de viragem. */
  const steerFromBoost = boostTimer > 0;
  const steerBasis = steerFromBoost
    ? Math.max(STEER_SPEED_FLOOR, speedPercent, Math.min(1.1, speedPercentRaw * 0.68))
    : Math.max(speedPercent, STEER_SPEED_FLOOR);
  const boostTap = boostPressed && !boostInputLatch;
  if (boostTap && boostCharges > 0 && boostTimer <= 0) {
    boostCharges -= 1;
    boostTimer = BOOST_DURATION_SEC;
    boostFlashTimer = BOOST_FLASH_SEC;
    boostTextTimer = BOOST_DURATION_SEC;
    speed = Math.max(speed, maxSpeed * 1.05);
    playBoostSfx();
  }
  boostInputLatch = boostPressed;

  if (boostTimer > 0) boostTimer = Math.max(0, boostTimer - dtSec);
  if (boostFlashTimer > 0) boostFlashTimer = Math.max(0, boostFlashTimer - dtSec);
  if (boostTextTimer > 0) boostTextTimer = Math.max(0, boostTextTimer - dtSec);
  if (boostRechargeTextTimer > 0) boostRechargeTextTimer = Math.max(0, boostRechargeTextTimer - dtSec);

  // Guiar: direita tem prioridade; boost não exagera na lateral (mais controlo).
  const steerSpeed = steerBasis * (steerFromBoost ? 1.14 : 1);
  const steerDx = dtSec * STEER_INPUT_RATE * steerSpeed;
  if (_inputRef.right) playerX += steerDx;
  else if (_inputRef.left) playerX -= steerDx;
  // Curvas da pista (só com velocidade; como no pseudo-3D clássico)
  const curveDx = dtSec * 2 * speedPercent;
  playerX -= curveDx * speedPercent * playerSegment.curve * centrifugal;

  // Aceleração/freio
  if (_inputRef.up || _inputRef.buttonA) {
    speed = Util.accelerate(speed, accel, dtSec);
  } else if (_inputRef.down) {
    speed = Util.accelerate(speed, breaking, dtSec);
  } else {
    speed = Util.accelerate(speed, decel, dtSec);
  }
  if (boostTimer > 0) {
    speed = Util.accelerate(speed, accel * (BOOST_ACCEL_MULT - 1), dtSec);
  }

  // Fora da pista: desaceleração progressiva até voltar (quanto mais longe, mais forte o freio)
  const roadEdge = 1;
  const ax = Math.abs(playerX);
  if (ax > roadEdge) {
    const excess = ax - roadEdge;
    const severity = Math.min(excess / 2.15, 1);
    const targetCap = offRoadLimit * (1 - severity * 0.94);
    let drag = offRoadDecel * (1 + severity * 2.4);
    if (boostTimer > 0) drag *= 1.95;
    if (speed > targetCap) {
      speed = Util.accelerate(speed, drag, dtSec);
      let strip = dtSec * maxSpeed * (0.12 + severity * 0.55);
      if (boostTimer > 0) strip += dtSec * maxSpeed * (0.16 + severity * 0.52);
      speed = Math.max(targetCap, speed - strip);
    }
  }

  if (Math.abs(playerX) >= OFF_TRACK_RESPAWN_X) {
    playerX = 0;
    speed = Math.min(speed, maxSpeed * 0.36);
    boostTimer = 0;
    boostFlashTimer = Math.max(boostFlashTimer, 0.14);
    trackRespawnGlitchT = TRACK_RESPAWN_GLITCH_SEC;
  }

  // Limites
  playerX = Util.limit(playerX, -3, 3);
  speed = Util.limit(speed, 0, maxSpeed * (boostTimer > 0 ? BOOST_TOP_SPEED_MULT : 1));

  // Atualizar posição Z
  position = Util.increase(position, dtSec * speed, trackLength);

  // Lap time (segundos)
  lapTime += dtSec;

  const beforeDist = distanceTraveled;
  if (!portalFinaleDrive) {
    distanceTraveled += dtSec * speed;
  }
  if (trackLength > 0 && !portalFinaleDrive) {
    for (let i = 0; i < BOOST_RECHARGE_POINTS.length; i++) {
      if (boostRechargeFlags[i]) continue;
      if (distanceTraveled >= trackLength * BOOST_RECHARGE_POINTS[i]) {
        boostRechargeFlags[i] = true;
        const prev = boostCharges;
        boostCharges = Math.min(BOOST_MAX_CHARGES, boostCharges + 1);
        if (boostCharges > prev) boostRechargeTextTimer = 1.1;
      }
    }
  }

  // Tráfego inimigo (carros rivais) + colisão
  const playerWorldZ = position + playerZ;
  for (const enemy of enemyCars) {
    enemy.z = Util.increase(enemy.z, dtSec * enemy.speed, trackLength);
    let dz = enemy.z - playerWorldZ;
    while (dz > trackLength / 2) dz -= trackLength;
    while (dz < -trackLength / 2) dz += trackLength;
    // Janela de colisão mais ampla para garantir contato em todos os carros visíveis
    const nearZ = dz > -SEGMENT_LENGTH * 0.14 && dz < SEGMENT_LENGTH * 0.62;
    if (!nearZ) continue;
    const hitX = Math.abs(enemy.offset - playerX) < 0.31;
    if (hitX && enemyCollisionCooldown <= 0) {
      speed = Math.max(0, speed * 0.22);
      enemyHitFxTimer = Math.max(enemyHitFxTimer, 0.38);
      boostTimer = 0;
      boostFlashTimer = Math.max(boostFlashTimer, 0.12);
      enemyCollisionCooldown = 0.22;
    }
  }

  let finishPlane = 0;
  if (trackLength > 0) {
    const lead = PORTAL_EXPLOSION_LEAD_PAST_GATE;
    finishPlane =
      trackLength > lead + SEGMENT_LENGTH * 10
        ? trackLength - lead
        : Math.max(SEGMENT_LENGTH * 3, trackLength - SEGMENT_LENGTH * 10);
  }
  const crossedFinishLine =
    trackLength > 0 &&
    beforeDist < finishPlane &&
    distanceTraveled >= finishPlane;
  const completedLap = trackLength > 0 && beforeDist < trackLength && distanceTraveled >= trackLength;
  if (state === 'playing' && (crossedFinishLine || completedLap)) {
    distanceTraveled = trackLength;
    state = 'won';
    portalFinaleT = PORTAL_FINALE_DURATION_SEC;
    finalChallengeT = 0;
    playPortalExplosionSfx();
    if (bgMusic) bgMusic.pause();
  }

  updateEngineLoop();
}

function updateIdle(_dtSec) {
  // Menu: pista e fundo congelados; só o texto anima em renderIdleScreen.
  updateEngineLoop();
}

// ─── HUD cyberpunk: velocidade + % até ao fim ───
const HUD_CYBER_FONT = '"Orbitron", "Segoe UI", sans-serif';

function cyberRoundRect(ctx, x, y, w, h, rad) {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const HUD_PANEL_R = 5;
const HUD_PANEL_TICK = 9;

/** Fundo dos painéis (progresso / velocidade / boost) — mesmo DNA visual */
function drawCyberHudPanelBg(ctx, bx, by, bw, bh, variant) {
  let g0;
  let g1;
  let g2;
  let glow;
  let stroke;
  let tickA;
  let tickB;
  let speedCorners;
  if (variant === 'progress') {
    g0 = 'rgba(52, 20, 58, 0.94)';
    g1 = 'rgba(26, 10, 36, 0.97)';
    g2 = 'rgba(10, 3, 18, 0.99)';
    glow = 'rgba(236, 72, 153, 0.4)';
    stroke = 'rgba(251, 186, 206, 0.9)';
    tickA = 'rgba(34, 211, 238, 0.65)';
    tickB = 'rgba(251, 113, 133, 0.55)';
    speedCorners = false;
  } else if (variant === 'speed') {
    g0 = 'rgba(14, 38, 54, 0.94)';
    g1 = 'rgba(8, 24, 42, 0.97)';
    g2 = 'rgba(3, 12, 24, 0.99)';
    glow = 'rgba(34, 211, 238, 0.38)';
    stroke = 'rgba(165, 243, 252, 0.9)';
    tickA = 'rgba(244, 114, 182, 0.58)';
    tickB = 'rgba(34, 211, 238, 0.68)';
    speedCorners = true;
  } else {
    g0 = 'rgba(48, 22, 72, 0.94)';
    g1 = 'rgba(22, 10, 42, 0.97)';
    g2 = 'rgba(6, 2, 18, 0.99)';
    glow = 'rgba(139, 92, 246, 0.45)';
    stroke = 'rgba(196, 181, 253, 0.88)';
    tickA = 'rgba(34, 211, 238, 0.65)';
    tickB = 'rgba(244, 114, 182, 0.55)';
    speedCorners = false;
  }

  ctx.save();
  cyberRoundRect(ctx, bx, by, bw, bh, HUD_PANEL_R);
  const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
  bg.addColorStop(0, g0);
  bg.addColorStop(0.45, g1);
  bg.addColorStop(1, g2);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  cyberRoundRect(ctx, bx, by, bw, bh, HUD_PANEL_R);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  cyberRoundRect(ctx, bx + 3, by + 3, bw - 6, bh - 6, 3);
  ctx.stroke();

  const t = HUD_PANEL_TICK;
  ctx.lineWidth = 1.25;
  if (speedCorners) {
    ctx.strokeStyle = tickA;
    ctx.beginPath();
    ctx.moveTo(bx + bw - 8, by + t);
    ctx.lineTo(bx + bw - 8, by + 5);
    ctx.lineTo(bx + bw - 8 - t + 3, by + 5);
    ctx.stroke();
    ctx.strokeStyle = tickB;
    ctx.beginPath();
    ctx.moveTo(bx + 8, by + bh - t);
    ctx.lineTo(bx + 8, by + bh - 5);
    ctx.lineTo(bx + 8 + t - 3, by + bh - 5);
    ctx.stroke();
  } else {
    ctx.strokeStyle = tickA;
    ctx.beginPath();
    ctx.moveTo(bx + 8, by + t);
    ctx.lineTo(bx + 8, by + 5);
    ctx.lineTo(bx + 8 + t - 3, by + 5);
    ctx.stroke();
    ctx.strokeStyle = tickB;
    ctx.beginPath();
    ctx.moveTo(bx + bw - 8, by + bh - t);
    ctx.lineTo(bx + bw - 8, by + bh - 5);
    ctx.lineTo(bx + bw - 8 - t + 3, by + bh - 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHudGradientDivider(ctx, x0, x1, y, variant) {
  const lg = ctx.createLinearGradient(x0, y, x1, y);
  if (variant === 'progress') {
    lg.addColorStop(0, 'rgba(34, 211, 238, 0)');
    lg.addColorStop(0.5, 'rgba(251, 186, 206, 0.55)');
    lg.addColorStop(1, 'rgba(244, 114, 182, 0)');
  } else {
    lg.addColorStop(0, 'rgba(244, 114, 182, 0)');
    lg.addColorStop(0.5, 'rgba(103, 232, 249, 0.55)');
    lg.addColorStop(1, 'rgba(34, 211, 238, 0)');
  }
  ctx.strokeStyle = lg;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
}

function drawCyberBoostPanelBg(ctx, bx, by, bw, bh) {
  drawCyberHudPanelBg(ctx, bx, by, bw, bh, 'boost');
}

/** Título + linha divisória em gradiente (estático) */
function drawCyberBoostTitle(ctx, bx, by, bw) {
  const cx = bx + bw / 2;
  const ty = by + 17;
  const label = 'CYBER BOOST';
  const fontStr = `600 11px ${HUD_CYBER_FONT}`;
  ctx.font = fontStr;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(45, 212, 191, 0.5)';
  ctx.fillText(label, cx - 1.5, ty);
  ctx.fillStyle = 'rgba(244, 114, 182, 0.48)';
  ctx.fillText(label, cx + 1.5, ty);

  ctx.save();
  ctx.shadowColor = 'rgba(192, 168, 255, 0.75)';
  ctx.shadowBlur = 9;
  ctx.fillStyle = '#faf5ff';
  ctx.fillText(label, cx, ty);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ede9fe';
  ctx.fillText(label, cx, ty);
  ctx.restore();

  const divY = ty + 7;
  const lg = ctx.createLinearGradient(bx + 10, divY, bx + bw - 10, divY);
  lg.addColorStop(0, 'rgba(34, 211, 238, 0)');
  lg.addColorStop(0.45, 'rgba(216, 180, 254, 0.65)');
  lg.addColorStop(1, 'rgba(244, 114, 182, 0)');
  ctx.strokeStyle = lg;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(bx + 12, divY);
  ctx.lineTo(bx + bw - 12, divY);
  ctx.stroke();

  ctx.textAlign = 'left';
}

function drawCyberBoostPip(ctx, cx, cy, r, filled) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = filled ? 'rgba(167, 139, 250, 0.55)' : 'rgba(70, 55, 95, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (filled) {
    const g = ctx.createRadialGradient(cx - r * 0.42, cy - r * 0.42, 0, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, '#f0abfc');
    g.addColorStop(0.55, '#c084fc');
    g.addColorStop(0.82, '#7c3aed');
    g.addColorStop(1, '#4c1d95');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(192, 181, 253, 0.7)';
    ctx.shadowBlur = 9;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(10, 6, 22, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(55, 48, 78, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function renderBoostFx(ctx) {
  if (boostTimer <= 0 && boostFlashTimer <= 0 && boostTextTimer <= 0 && boostRechargeTextTimer <= 0 && enemyHitFxTimer <= 0) return;

  const now = performance.now() * 0.001;
  const boostNorm = boostTimer > 0 ? Math.min(1, boostTimer / BOOST_DURATION_SEC) : 0;

  ctx.save();
  if (boostTimer > 0) {
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(34, 211, 238, 0)');
    veil.addColorStop(0.35, `rgba(56, 189, 248, ${0.09 + boostNorm * 0.14})`);
    veil.addColorStop(0.75, `rgba(244, 114, 182, ${0.08 + boostNorm * 0.12})`);
    veil.addColorStop(1, 'rgba(244, 114, 182, 0)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.28 + boostNorm * 0.34})`;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 22; i++) {
      const y = Math.floor((i / 22) * H);
      const drift = Math.sin(now * 14 + i * 0.75) * 36;
      ctx.beginPath();
      ctx.moveTo(W / 2 + drift, y);
      ctx.lineTo(W / 2 + drift + (Math.sin(now * 7 + i * 1.11) > 0 ? 1 : -1) * (48 + boostNorm * 150), y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  if (boostFlashTimer > 0) {
    const flash = Math.min(1, boostFlashTimer / BOOST_FLASH_SEC);
    ctx.fillStyle = `rgba(236, 253, 255, ${flash * 0.38})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (boostTextTimer > 0) {
    const pulse = 0.72 + 0.28 * Math.sin(now * 18);
    const y = H * 0.21;
    const text = 'CYBER BOOST';
    ctx.textAlign = 'center';
    ctx.font = `800 30px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.52 * pulse})`;
    ctx.fillText(text, W / 2 - 3, y);
    ctx.fillStyle = `rgba(244, 114, 182, ${0.52 * pulse})`;
    ctx.fillText(text, W / 2 + 3, y);
    ctx.shadowColor = `rgba(196, 181, 253, ${0.75 + 0.2 * pulse})`;
    ctx.shadowBlur = 18;
    const g = ctx.createLinearGradient(W / 2 - 180, y - 8, W / 2 + 180, y + 8);
    g.addColorStop(0, '#67e8f9');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(1, '#f9a8d4');
    ctx.fillStyle = g;
    ctx.fillText(text, W / 2, y);
    ctx.shadowBlur = 0;
    ctx.font = `600 12px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = `rgba(236, 253, 255, ${0.75 * pulse})`;
    ctx.fillText('HYPER ACCELERATION', W / 2, y + 18);
    ctx.textAlign = 'left';
  }
  if (boostRechargeTextTimer > 0) {
    const pulse = 0.7 + 0.3 * Math.sin(now * 20);
    const y = H * 0.3;
    ctx.textAlign = 'center';
    ctx.font = `700 18px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.4 * pulse})`;
    ctx.fillText('CYBERBOOST +1', W / 2 - 1.5, y);
    ctx.fillStyle = `rgba(244, 114, 182, ${0.36 * pulse})`;
    ctx.fillText('CYBERBOOST +1', W / 2 + 1.5, y);
    ctx.shadowColor = 'rgba(103, 232, 249, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ecfeff';
    ctx.fillText('CYBERBOOST +1', W / 2, y);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }
  if (enemyHitFxTimer > 0) {
    const hit = Math.min(1, enemyHitFxTimer / 0.38);
    const noiseA = 0.08 + hit * 0.14;
    const noiseB = 0.04 + hit * 0.1;
    ctx.fillStyle = `rgba(236, 253, 255, ${0.05 + hit * 0.09})`;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 12; i++) {
      const yy = Math.floor((i / 12) * H + Math.sin(performance.now() * 0.025 + i) * 2);
      ctx.strokeStyle = `rgba(226, 232, 240, ${noiseA})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const xx = Math.floor((i / 6) * W + Math.sin(performance.now() * 0.031 + i * 1.8) * 5);
      ctx.strokeStyle = `rgba(148, 163, 184, ${noiseB})`;
      ctx.beginPath();
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, H);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Neon roxo em volta do carro (boost ativo). */
function renderPlayerBoostPurpleNeon(ctx, sx, sy, sw, sh) {
  if (boostTimer <= 0) return;
  const cx = sx + sw * 0.5;
  const cy = sy + sh * 0.52;
  const t = performance.now() * 0.001;
  const pulse = 0.65 + 0.35 * Math.sin(t * 14);
  const rx = sw * 0.62 + pulse * 5;
  const ry = sh * 0.58 + pulse * 4;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry) * 1.45);
  g.addColorStop(0, `rgba(216, 180, 254, ${0.26 * pulse})`);
  g.addColorStop(0.32, `rgba(147, 51, 234, ${0.4 * pulse})`);
  g.addColorStop(0.62, `rgba(88, 28, 135, ${0.24 * pulse})`);
  g.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.22, ry * 1.38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(196, 181, 253, ${0.58 + 0.22 * pulse})`;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = 'rgba(168, 85, 247, 0.95)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.06, ry * 1.14, t * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(124, 58, 237, ${0.48 + 0.28 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 1.22, ry * 1.32, -t * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Fullscreen curto ao recentrar na pista. */
function renderTrackSnapGlitch(ctx) {
  if (trackRespawnGlitchT <= 0) return;
  const u = Math.min(1, trackRespawnGlitchT / TRACK_RESPAWN_GLITCH_SEC);
  const fk = (performance.now() / 26) | 0;
  const t = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 14; i++) {
    const y = ((i * 67 + fk * 3) % (H + 40)) - 20;
    const sh = 4 + (i % 5) * 2;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.07 * u})`;
    ctx.fillRect(((Math.sin(t * 20 + i) * 38) | 0), y, W, sh);
    ctx.fillStyle = `rgba(244, 114, 182, ${0.055 * u})`;
    ctx.fillRect(((Math.sin(t * 17 + i) * -30) | 0), y + 1, W, 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  if ((fk & 1) === 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.2 * u})`;
    ctx.fillRect(0, 0, W, H);
  }
  const shift = 5 + ((u * 8) | 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(168, 85, 247, ${0.14 * u})`;
  ctx.fillRect(shift, 0, W - shift * 2, H);
  ctx.fillStyle = `rgba(34, 211, 238, ${0.09 * u})`;
  ctx.fillRect(-shift, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  for (let n = 0; n < 32; n++) {
    const nx = ((Math.sin(fk * 0.19 + n * 2.1) * 0.5 + 0.5) * (W - 6)) | 0;
    const ny = ((Math.cos(fk * 0.14 + n * 1.7) * 0.5 + 0.5) * (H - 6)) | 0;
    const tw = 0.5 + 0.5 * Math.sin(fk * 0.31 + n);
    ctx.fillStyle = `rgba(248, 250, 252, ${0.05 * u * tw})`;
    ctx.fillRect(nx, ny, 2 + (n % 4), 2);
  }
  ctx.fillStyle = `rgba(2, 6, 23, ${0.28 * u})`;
  ctx.fillRect(0, 0, W, H * 0.05);
  ctx.fillRect(0, H * 0.95, W, H * 0.05);
  ctx.restore();
}

/** Interferência CRT em ecrã inteiro antes da explosão (cresce ao aproximar do fim). */
function renderPreFinaleInterference(ctx) {
  if (state !== 'playing' || trackLength <= 0) return;
  const remaining = Math.max(0, trackLength - distanceTraveled);
  if (remaining > PRE_EXPLOSION_INTERFERENCE_START) return;
  const raw = 1 - remaining / PRE_EXPLOSION_INTERFERENCE_START;
  const intens = Math.max(0, Math.min(1, Math.pow(raw, 0.8)));
  if (intens < 0.03) return;

  const now = performance.now();
  const t = now * 0.001;
  const fk = (now * 0.041) | 0;
  const cx = W * 0.5;
  const cy = H * 0.5;
  const pulse = 0.82 + 0.18 * Math.sin(t * 6.4);

  ctx.save();

  const vig = ctx.createRadialGradient(cx, cy, H * 0.06, cx, cy, H * 0.78);
  const va = 0.14 * intens * pulse;
  vig.addColorStop(0, 'rgba(15, 23, 42, 0)');
  vig.addColorStop(0.48, `rgba(55, 15, 88, ${va * 0.4})`);
  vig.addColorStop(1, `rgba(2, 4, 16, ${va * 1.08})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(0, 0, 0, ${0.18 * intens})`;
  for (let y = 0; y < H; y += 3) {
    if (((y + fk) & 2) !== 0) ctx.fillRect(0, y, W, 1);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalCompositeOperation = 'screen';
  for (let b = 0; b < 32; b++) {
    const phase = t * (2.2 + b * 0.07) + b * 0.65;
    const yb = ((phase * 52 + b * 23) % (H + 100)) - 50;
    const bh = 2 + (b % 5);
    const a = (0.035 + (b % 6) * 0.014) * intens;
    const ox = (Math.sin(t * 12 + b * 0.9) * 18 * intens) | 0;
    ctx.fillStyle = b % 2 === 0 ? `rgba(56, 189, 248, ${a})` : `rgba(244, 114, 182, ${a})`;
    ctx.fillRect(ox, yb | 0, W, bh);
  }

  for (let v = 0; v < 14; v++) {
    const xv = ((Math.sin(t * 3.3 + v * 1.33) * 0.5 + 0.5) * (W - 24)) | 0;
    const skew = ((Math.sin(t * 7.5 + v) * 9 * intens) | 0);
    ctx.fillStyle = `rgba(167, 139, 250, ${0.065 * intens})`;
    ctx.fillRect(xv, 0, 2 + (v % 4), H);
    ctx.fillStyle = `rgba(34, 211, 238, ${0.045 * intens})`;
    ctx.fillRect(xv + skew, 0, 2, H);
  }

  const rgbShift = 4 + ((intens * 11) | 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255, 100, 200, ${0.045 * intens})`;
  ctx.fillRect(rgbShift, 0, W, H);
  ctx.fillStyle = `rgba(100, 230, 255, ${0.042 * intens})`;
  ctx.fillRect(-rgbShift, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const specks = 48 + (intens * 72) | 0;
  for (let n = 0; n < specks; n++) {
    const nx = ((Math.sin(fk * 0.12 + n * 2.71) * 0.5 + 0.5) * (W - 4)) | 0;
    const ny = ((Math.cos(fk * 0.1 + n * 2.09) * 0.5 + 0.5) * (H - 4)) | 0;
    const flick = 0.5 + 0.5 * Math.sin(t * 28 + n * 0.66);
    const m = (n + fk) % 4;
    ctx.fillStyle =
      m === 0
        ? `rgba(248, 250, 252, ${0.038 * intens * flick})`
        : m === 1
          ? `rgba(192, 132, 252, ${0.048 * intens * flick})`
          : m === 2
            ? `rgba(34, 211, 238, ${0.036 * intens * flick})`
            : `rgba(251, 113, 133, ${0.032 * intens * flick})`;
    ctx.fillRect(nx, ny, 1 + (n & 2), 1 + ((n >> 1) & 2));
  }

  ctx.strokeStyle = `rgba(34, 211, 238, ${0.22 + 0.2 * intens})`;
  ctx.lineWidth = 1;
  const br = 20 + intens * 26;
  const pad = 12;
  const corner = (x0, y0, hx, hy) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + hy * br);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + hx * br, y0);
    ctx.stroke();
  };
  corner(pad, pad, 1, 1);
  corner(W - pad, pad, -1, 1);
  corner(pad, H - pad, 1, -1);
  corner(W - pad, H - pad, -1, -1);

  ctx.strokeStyle = `rgba(244, 114, 182, ${0.12 * intens})`;
  ctx.globalAlpha = 0.5 * intens;
  for (let g = 0; g < 9; g++) {
    const gy = H * (0.1 + g * 0.1) + Math.sin(t * 4.8 + g) * 8 * intens;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy + Math.sin(t * 3.7 + g * 0.85) * 12 * intens);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (intens > 0.5 && (fk & 9) === 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.025 * intens})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.globalCompositeOperation = 'screen';
  for (let r = 0; r < 5; r++) {
    const rr = 80 + r * 90 + Math.sin(t * 5 + r) * 40 * intens;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    gr.addColorStop(0, `rgba(168, 85, 247, ${0.04 * intens * (1 - r * 0.12)})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
}

function drawRechargePickupOnSegment(ctx, segment, pct) {
  const x = Util.interpolate(segment.p1.screen.x, segment.p2.screen.x, pct);
  const yRoad = Util.interpolate(segment.p1.screen.y, segment.p2.screen.y, pct);
  const roadHalfW = Util.interpolate(segment.p1.screen.w, segment.p2.screen.w, pct);
  const y = yRoad - 2;
  const halfLen = Math.max(26, Math.min(roadHalfW * 1.05, 240));
  const now = performance.now() * 0.001;
  const pulse = 0.6 + 0.4 * Math.sin(now * 12 + segment.index * 0.07);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, halfLen * 0.8);
  halo.addColorStop(0, `rgba(34, 211, 238, ${0.22 * pulse})`);
  halo.addColorStop(0.55, `rgba(244, 114, 182, ${0.18 * pulse})`);
  halo.addColorStop(1, 'rgba(8, 12, 24, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(x, y, halfLen * 0.95, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  const lg = ctx.createLinearGradient(x - halfLen, y, x + halfLen, y);
  lg.addColorStop(0, 'rgba(34, 211, 238, 0)');
  lg.addColorStop(0.18, `rgba(34, 211, 238, ${0.45 + 0.3 * pulse})`);
  lg.addColorStop(0.5, `rgba(244, 114, 182, ${0.4 + 0.35 * pulse})`);
  lg.addColorStop(0.82, `rgba(34, 211, 238, ${0.45 + 0.3 * pulse})`);
  lg.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.strokeStyle = lg;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(x - halfLen, y);
  ctx.lineTo(x + halfLen, y);
  ctx.stroke();

  ctx.strokeStyle = `rgba(236, 253, 255, ${0.5 + 0.35 * pulse})`;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x - halfLen * 0.92, y);
  ctx.lineTo(x + halfLen * 0.92, y);
  ctx.stroke();

  ctx.strokeStyle = `rgba(244, 114, 182, ${0.2 + 0.2 * pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - halfLen * 0.55, y + 3);
  ctx.lineTo(x + halfLen * 0.55, y + 3);
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function renderRechargePointFx(ctx) {
  if (state !== 'playing' || trackLength <= 0) return;
  let nearestDist = Infinity;
  for (let i = 0; i < BOOST_RECHARGE_POINTS.length; i++) {
    if (boostRechargeFlags[i]) continue;
    const d = trackLength * BOOST_RECHARGE_POINTS[i] - distanceTraveled;
    if (d > 0 && d < nearestDist) nearestDist = d;
  }
  if (!isFinite(nearestDist)) return;

  const appearDist = SEGMENT_LENGTH * 28;
  if (nearestDist > appearDist) return;
  const t = 1 - nearestDist / appearDist;
  const now = performance.now() * 0.001;
  const pulse = 0.6 + 0.4 * Math.sin(now * 10);
  const cx = W * 0.5;
  const cy = H * (0.24 + (1 - t) * 0.06);
  const r = 9 + t * 18;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.6);
  halo.addColorStop(0, `rgba(34, 211, 238, ${0.25 + 0.25 * t})`);
  halo.addColorStop(0.45, `rgba(244, 114, 182, ${0.12 + 0.22 * t})`);
  halo.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 3.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(125, 211, 252, ${0.45 + 0.4 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(244, 114, 182, ${0.35 + 0.35 * pulse})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';

  ctx.textAlign = 'center';
  ctx.font = `700 11px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = `rgba(236, 253, 255, ${0.72 + 0.24 * pulse})`;
  ctx.fillText('RECARGA BOOST', cx, cy - r - 10);
  ctx.textAlign = 'left';
  ctx.restore();
}

function renderFinishTechGateFx(ctx) {
  if (state !== 'playing' || trackLength <= 0) return;
  const remaining = Math.max(0, trackLength - distanceTraveled);
  if (remaining > FINISH_NEON_DRAW_DISTANCE) return;

  const tNeon = Math.max(0, Math.min(1, 1 - remaining / FINISH_NEON_DRAW_DISTANCE));
  const tArc = Math.max(0, Math.min(1, 1 - remaining / FINISH_GATE_DISTANCE));
  const now = performance.now() * 0.001;
  const pulse = 0.58 + 0.42 * Math.sin(now * 12.8);
  const cx = W * 0.5;
  const baseY = H * 0.74;
  const gateW = W * 0.56;
  const gateH = H * 0.22;
  const vis = 0.22 + 0.78 * tNeon;
  const cy = baseY - gateH * 0.5;
  const rOuter = gateH * 0.72;
  const rMid = rOuter * 0.72;
  const rInner = rOuter * 0.46;
  const left = cx - gateW * 0.5;
  const right = cx + gateW * 0.5;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, gateW * 0.68);
  halo.addColorStop(0, `rgba(34, 211, 238, ${(0.26 + 0.34 * tArc) * vis})`);
  halo.addColorStop(0.52, `rgba(244, 114, 182, ${(0.18 + 0.28 * tArc) * vis})`);
  halo.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Base no chão
  const floorGlow = ctx.createRadialGradient(cx, baseY + 1, 0, cx, baseY + 1, gateW * 0.75);
  floorGlow.addColorStop(0, `rgba(34, 211, 238, ${(0.32 + 0.28 * tArc) * vis})`);
  floorGlow.addColorStop(0.5, `rgba(244, 114, 182, ${(0.2 + 0.22 * tArc) * vis})`);
  floorGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = floorGlow;
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 2, gateW * 0.78, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pilares neon laterais — bem visíveis de longe como “fim de fase”
  const pillarW = 11 + tNeon * 17;
  const pillarTop = cy - rOuter * 1.5 - tNeon * 48;
  const pillarBot = baseY + 32;
  const pxL = left - pillarW * 2.85;
  const pxR = right + pillarW * 1.55;
  const pAlpha = (0.5 + 0.42 * pulse) * vis;
  const mkPillarGrad = (x0) => {
    const g = ctx.createLinearGradient(x0, pillarTop, x0 + pillarW * 0.5, pillarBot);
    g.addColorStop(0, `rgba(244, 114, 182, ${pAlpha})`);
    g.addColorStop(0.42, `rgba(34, 211, 238, ${pAlpha * 0.92})`);
    g.addColorStop(1, `rgba(6, 182, 212, ${pAlpha * 0.28})`);
    return g;
  };
  ctx.shadowBlur = 26;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.75)';
  ctx.fillStyle = mkPillarGrad(pxL);
  ctx.fillRect(pxL, pillarTop, pillarW, pillarBot - pillarTop);
  ctx.shadowColor = 'rgba(244, 114, 182, 0.72)';
  ctx.fillStyle = mkPillarGrad(pxR);
  ctx.fillRect(pxR, pillarTop, pillarW, pillarBot - pillarTop);
  ctx.shadowBlur = 0;

  const finishLineGrad = ctx.createLinearGradient(left, baseY, right, baseY);
  finishLineGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
  finishLineGrad.addColorStop(0.2, `rgba(34, 211, 238, ${(0.6 + 0.25 * pulse) * vis})`);
  finishLineGrad.addColorStop(0.5, `rgba(244, 114, 182, ${(0.55 + 0.28 * pulse) * vis})`);
  finishLineGrad.addColorStop(0.8, `rgba(34, 211, 238, ${(0.6 + 0.25 * pulse) * vis})`);
  finishLineGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.strokeStyle = finishLineGrad;
  ctx.lineWidth = 4.5;
  ctx.shadowColor = 'rgba(236, 253, 255, 0.9)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(left, baseY + 1);
  ctx.lineTo(right, baseY + 1);
  ctx.stroke();

  // Anéis concêntricos hard-tech
  ctx.shadowColor = 'rgba(34, 211, 238, 0.95)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = `rgba(103, 232, 249, ${(0.66 + 0.3 * pulse) * vis})`;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowColor = 'rgba(244, 114, 182, 0.95)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(244, 114, 182, ${(0.56 + 0.34 * pulse) * vis})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, rMid, now * 0.7, now * 0.7 + Math.PI * 1.65);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rMid, now * 0.7 + Math.PI * 1.85, now * 0.7 + Math.PI * 3.2);
  ctx.stroke();

  ctx.shadowColor = 'rgba(236, 253, 255, 0.9)';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = `rgba(236, 253, 255, ${(0.55 + 0.35 * pulse) * vis})`;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, -now * 1.1, -now * 1.1 + Math.PI * 2);
  ctx.stroke();

  // Segmentos rotativos e "braços" tecnológicos
  for (let i = 0; i < 10; i++) {
    const a = now * 1.55 + i * ((Math.PI * 2) / 10);
    const x0 = cx + Math.cos(a) * (rMid * 1.02);
    const y0 = cy + Math.sin(a) * (rMid * 1.02);
    const x1 = cx + Math.cos(a) * (rOuter * 1.26);
    const y1 = cy + Math.sin(a) * (rOuter * 1.26);
    ctx.strokeStyle = i % 2 === 0
      ? `rgba(34, 211, 238, ${(0.42 + 0.26 * pulse) * vis})`
      : `rgba(244, 114, 182, ${(0.34 + 0.24 * pulse) * vis})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Interferência: scanlines e jitter digital
  const glitch = Math.sin(now * 31) * 2.2;
  ctx.strokeStyle = `rgba(236, 253, 255, ${(0.14 + 0.18 * pulse) * vis})`;
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    const yy = cy + i * 5 + Math.sin(now * 19 + i) * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - rOuter * 1.08 + glitch, yy);
    ctx.lineTo(cx + rOuter * 1.08 - glitch, yy);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(248, 250, 252, ${(0.12 + 0.12 * pulse) * vis})`;
  for (let i = 0; i < 7; i++) {
    const px = cx - rOuter * 0.8 + (i / 6) * (rOuter * 1.6) + Math.sin(now * 23 + i * 1.3) * 1.4;
    const py = cy + Math.sin(now * 17 + i * 0.9) * 5;
    ctx.fillRect(px, py, 2, 2);
  }

  const titleY = cy - rOuter * 1.38 - tNeon * 28;
  ctx.textAlign = 'center';
  ctx.font = `800 ${11 + tNeon * 9}px ${HUD_CYBER_FONT}`;
  ctx.shadowBlur = 24;
  ctx.shadowColor = 'rgba(244, 114, 182, 0.95)';
  ctx.fillStyle = `rgba(248, 250, 252, ${0.9 * vis})`;
  ctx.fillText(LAB_TRANSPORT_TITLE, cx, titleY);
  ctx.shadowBlur = 14;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.7)';
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.55 * vis})`;
  ctx.lineWidth = 1.25;
  ctx.strokeText(LAB_TRANSPORT_TITLE, cx, titleY);

  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawEnemyCarSprite(ctx, x, y, w, h, colorA, colorB, spriteKind) {
  ctx.save();
  const sprite = spriteKind === 'truck' ? enemyTruckSprite : enemyBlueSprite;
  if (sprite && sprite.complete && sprite.naturalWidth) {
    const iw = sprite.naturalWidth;
    const ih = sprite.naturalHeight;
    const scale = spriteKind === 'truck' ? 1.72 : 1.56;
    const yScale = spriteKind === 'truck' ? 1.95 : 1.78;
    ctx.drawImage(sprite, 0, 0, iw, ih, x - w * 0.26, y - h * 0.32, w * scale, h * yScale);
    ctx.restore();
    return;
  }
  const body = ctx.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, colorA);
  body.addColorStop(1, colorB);
  ctx.fillStyle = body;
  ctx.shadowColor = colorA;
  ctx.shadowBlur = 8;
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(5, 8, 20, 0.9)';
  ctx.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.35);
  ctx.fillStyle = 'rgba(236, 253, 255, 0.8)';
  ctx.fillRect(x + w * 0.23, y + h * 0.24, w * 0.54, h * 0.09);

  ctx.fillStyle = 'rgba(236, 72, 153, 0.9)';
  ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
  ctx.restore();
}

function renderRainOverlay(ctx) {
  const rainTime = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 105; i++) {
    const r0 = rndStar(i * 1.73 + 0.13);
    const r1 = rndStar(i * 2.91 + 0.57);
    const r2 = rndStar(i * 4.37 + 0.91);
    const speed = 1 + r2 * 2.6;
    const x = ((r0 + rainTime * (0.38 + speed * 0.28)) * (W + 140)) % (W + 140) - 70;
    const y = ((r1 + rainTime * (1.18 + speed * 0.95)) * (H + 200)) % (H + 200) - 100;
    const len = 8 + r2 * 14;
    const drift = 2.5 + r2 * 3.6;
    ctx.strokeStyle = `rgba(186, 230, 253, ${0.2 + r2 * 0.32})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - drift, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPalmTreeOnSegment(ctx, segment, side, variant) {
  if (!backdropPalmTree || !backdropPalmTree.complete || !backdropPalmTree.naturalWidth) return;
  const iw = backdropPalmTree.naturalWidth;
  const ih = backdropPalmTree.naturalHeight;
  const roadX = segment.p1.screen.x;
  const roadW = segment.p1.screen.w;
  if (!isFinite(roadX) || !isFinite(roadW)) return;
  const baseScale = Math.max(0.18, Math.min(2.4, roadW / 320));
  const rand = rndStar(variant * 0.173 + segment.index * 0.019 + (side < 0 ? 1.3 : 2.1));
  const scale = baseScale;
  const treeH = ih * scale * 0.22;
  const treeW = iw * scale * 0.22;
  const margin = 10 + rand * 26;
  const x = side < 0 ? roadX - roadW - treeW - margin : roadX + roadW + margin;
  const y = segment.p1.screen.y - treeH + 3;
  if (y > H + 30 || y < -treeH - 30) return;
  return { x, y, w: treeW, h: treeH };
}

function renderDriveHud(ctx) {
  if (state !== 'playing') return;

  const speedKmh = maxSpeed > 0 ? Math.round((speed / maxSpeed) * 200) : 0;
  const spdPct = maxSpeed > 0 ? Math.min(1, Math.max(0, speed / maxSpeed)) : 0;
  const progressPct = trackLength > 0 ? Math.min(100, Math.round((distanceTraveled / trackLength) * 100)) : 0;

  const pw = 122;
  const ph = 66;
  const pad = 10;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  const lx = pad;
  const ly = pad;
  drawCyberHudPanelBg(ctx, lx, ly, pw, ph, 'progress');
  ctx.textAlign = 'left';
  const plx = lx + 10;
  const ply = ly + 18;
  ctx.font = `600 9px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = 'rgba(45, 212, 191, 0.45)';
  ctx.fillText('PROGRESSO', plx - 1, ply);
  ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
  ctx.fillText('PROGRESSO', plx + 1, ply);
  ctx.shadowColor = 'rgba(251, 182, 206, 0.55)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#fff5fb';
  ctx.fillText('PROGRESSO', plx, ply);
  ctx.shadowBlur = 0;
  ctx.font = `700 22px ${HUD_CYBER_FONT}`;
  const pctY = ly + 40;
  ctx.fillStyle = 'rgba(34, 211, 238, 0.32)';
  ctx.fillText(`${progressPct}%`, plx - 1, pctY);
  ctx.fillStyle = 'rgba(251, 113, 133, 0.35)';
  ctx.fillText(`${progressPct}%`, plx + 1, pctY);
  ctx.shadowColor = 'rgba(244, 114, 182, 0.45)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffe4f3';
  ctx.fillText(`${progressPct}%`, plx, pctY);
  ctx.shadowBlur = 0;
  ctx.font = `600 7px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = 'rgba(251, 207, 232, 0.72)';
  ctx.fillText('ATÉ AO FIM', plx, ly + 50);

  drawHudGradientDivider(ctx, lx + 12, lx + pw - 12, ly + ph - 14, 'progress');

  const barW = pw - 20;
  const barH = 4;
  const barX = lx + 10;
  const barY = ly + ph - 10;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  cyberRoundRect(ctx, barX, barY, barW, barH, 1);
  ctx.fill();
  const fillW = Math.max(0, (barW * progressPct) / 100);
  if (fillW > 0.5) {
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    g.addColorStop(0, '#ff00aa');
    g.addColorStop(1, '#00ffe8');
    ctx.fillStyle = g;
    ctx.fillRect(barX, barY, fillW, barH);
  }

  const rx = W - pad - pw;
  const ry = pad;
  drawCyberHudPanelBg(ctx, rx, ry, pw, ph, 'speed');
  ctx.textAlign = 'right';
  const prx = rx + pw - 10;
  const vty = ry + 16;
  ctx.font = `600 9px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = 'rgba(244, 114, 182, 0.42)';
  ctx.fillText('VELOCIDADE', prx + 1, vty);
  ctx.fillStyle = 'rgba(45, 212, 191, 0.42)';
  ctx.fillText('VELOCIDADE', prx - 1, vty);
  ctx.shadowColor = 'rgba(103, 232, 249, 0.5)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ecfeff';
  ctx.fillText('VELOCIDADE', prx, vty);
  ctx.shadowBlur = 0;
  ctx.font = `700 22px ${HUD_CYBER_FONT}`;
  const skY = ry + 36;
  ctx.fillStyle = 'rgba(244, 114, 182, 0.35)';
  ctx.fillText(String(speedKmh), prx + 1, skY);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.32)';
  ctx.fillText(String(speedKmh), prx - 1, skY);
  ctx.shadowColor = 'rgba(34, 211, 238, 0.45)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#cffafe';
  ctx.fillText(String(speedKmh), prx, skY);
  ctx.shadowBlur = 0;
  ctx.font = `600 7px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = 'rgba(165, 243, 252, 0.75)';
  ctx.fillText('KM/H', prx, ry + 48);

  drawHudGradientDivider(ctx, rx + 12, rx + pw - 12, ry + ph - 14, 'speed');

  const spdBarX = rx + 10;
  const spdBarY = ry + ph - 10;
  const spdBarW = pw - 20;
  const spdBarH = 5;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  cyberRoundRect(ctx, spdBarX, spdBarY, spdBarW, spdBarH, 1);
  ctx.fill();
  const spdFillW = spdBarW * spdPct;
  if (spdFillW > 0.5) {
    const sg = ctx.createLinearGradient(spdBarX, spdBarY, spdBarX + spdBarW, spdBarY);
    sg.addColorStop(0, '#7c3aed');
    sg.addColorStop(0.48, '#c026d3');
    sg.addColorStop(1, '#f472b6');
    ctx.fillStyle = sg;
    ctx.fillRect(spdBarX, spdBarY, spdFillW, spdBarH);
  }

  const boostW = 172;
  const boostH = 64;
  const bx = pad;
  const by = H - boostH - pad;
  drawCyberBoostPanelBg(ctx, bx, by, boostW, boostH);
  drawCyberBoostTitle(ctx, bx, by, boostW);
  const pipR = 7;
  const pipGap = 14;
  const pipsY = by + 44;
  const pipsStartX = bx + boostW / 2 - (BOOST_MAX_CHARGES * (pipR * 2) + (BOOST_MAX_CHARGES - 1) * pipGap) / 2 + pipR;
  const charges = Math.max(0, Math.min(BOOST_MAX_CHARGES, boostCharges));
  for (let i = 0; i < BOOST_MAX_CHARGES; i++) {
    drawCyberBoostPip(ctx, pipsStartX + i * (pipR * 2 + pipGap), pipsY, pipR, i < charges);
  }
  const cpY = by + 54;
  const cpStartX = bx + 20;
  const cpGap = (boostW - 40) / Math.max(1, BOOST_RECHARGE_POINTS.length - 1);
  for (let i = 0; i < BOOST_RECHARGE_POINTS.length; i++) {
    const mx = cpStartX + i * cpGap;
    const active = boostRechargeFlags[i];
    ctx.beginPath();
    ctx.arc(mx, cpY, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = active ? 'rgba(244, 114, 182, 0.9)' : 'rgba(103, 232, 249, 0.45)';
    ctx.fill();
  }
  if (boostTimer > 0) {
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.02);
    ctx.textAlign = 'center';
    ctx.font = `700 8px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.45 + pulse * 0.35})`;
    ctx.fillText('ATIVO', bx + boostW / 2, by + boostH - 9);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

/** Explosão sci-fi + glitch pesado (scanlines, ruído, anéis neon) após o portal. */
function renderPortalFinaleOverlay(ctx) {
  if (state !== 'won' || portalFinaleT <= 0) return;

  const total = PORTAL_FINALE_DURATION_SEC;
  const elapsed = total - portalFinaleT;
  const u = Util.limit(elapsed / total, 0, 1);
  const nowMs = performance.now();
  const t = nowMs * 0.001;
  const frameKey = (nowMs / 28) | 0;

  const cx = W * 0.5;
  const cy = H * 0.52;
  const boom = 1 - Math.exp(-u * 4.8);

  ctx.save();

  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 6; i++) {
    const ri = (28 + i * 48 + u * 300) * (0.94 + 0.06 * Math.sin(t * 9 + i * 0.7));
    const alpha = (0.5 - i * 0.065) * boom * (1 - u * 0.28);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, ri);
    gr.addColorStop(0, `rgba(255, 252, 255, ${alpha * 0.95})`);
    gr.addColorStop(0.22, `rgba(34, 211, 238, ${alpha * 0.88})`);
    gr.addColorStop(0.5, `rgba(244, 114, 182, ${alpha * 0.55})`);
    gr.addColorStop(0.78, `rgba(168, 85, 247, ${alpha * 0.28})`);
    gr.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, ri, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = `rgba(236, 253, 255, ${0.28 * boom})`;
  ctx.lineWidth = 1.8;
  for (let k = 0; k < 32; k++) {
    const ang = (k / 32) * Math.PI * 2 + t * 1.35 + frameKey * 0.01;
    const len = 60 + boom * 360 + (k % 6) * 28;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 16, cy + Math.sin(ang) * 8);
    ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.62);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 14; j++) {
    const pj = (j / 14) * Math.PI * 2 - t * 2.1;
    const rj = 24 + boom * (180 + j * 22);
    ctx.strokeStyle = `rgba(103, 232, 249, ${(0.35 - j * 0.018) * boom})`;
    ctx.lineWidth = 2.2 - j * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, rj, pj, pj + Math.PI * 1.1);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';

  const scanA = 0.1 + (1 - u) * 0.32;
  ctx.fillStyle = `rgba(0, 0, 0, ${scanA})`;
  for (let y = 0; y < H; y += 4) {
    if (((y + frameKey) & 1) === 0) ctx.fillRect(0, y, W, 2);
  }

  const gInt = (1 - u * 0.35) * 0.9;
  for (let g = 0; g < 20; g++) {
    const gy = ((Math.sin(frameKey * 0.11 + g * 1.9) * 0.5 + 0.5) * (H - 24)) | 0;
    const gh = 3 + (g % 6) * 5;
    const gx = (Math.sin(nowMs * 0.018 + g * 2.3) * 22 * gInt) | 0;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.12 * gInt})`;
    ctx.fillRect(gx, gy, W, gh);
    ctx.fillStyle = `rgba(244, 114, 182, ${0.1 * gInt})`;
    ctx.fillRect(-gx, gy + 2, W, 2);
  }

  ctx.globalCompositeOperation = 'screen';
  for (let n = 0; n < 72; n++) {
    const nx = ((Math.sin(frameKey * 0.13 + n * 2.07) * 0.5 + 0.5) * (W - 4)) | 0;
    const ny = ((Math.cos(frameKey * 0.09 + n * 1.41) * 0.5 + 0.5) * (H - 4)) | 0;
    const m = (n + frameKey) % 8;
    const r = m < 3 ? 34 : m < 5 ? 244 : 250;
    const gg = m < 3 ? 211 : m < 5 ? 114 : 250;
    const b = m < 3 ? 238 : m < 5 ? 182 : 255;
    ctx.fillStyle = `rgba(${r},${gg},${b},${0.12 + (n % 5) * 0.06})`;
    ctx.fillRect(nx, ny, 1 + (n & 3), 1 + ((n >> 1) & 2));
  }

  if (((frameKey + (u * 7) | 0) & 3) === 0 || Math.random() < 0.18 + boom * 0.22) {
    ctx.fillStyle = `rgba(200, 245, 255, ${0.05 + Math.random() * 0.18})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (Math.random() < 0.14 + (1 - u) * 0.12) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 + Math.random() * 0.2})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.globalCompositeOperation = 'source-over';
  const vx = ctx.createRadialGradient(cx, cy, H * 0.18, cx, cy, H * 0.92);
  vx.addColorStop(0, 'rgba(0,0,0,0)');
  vx.addColorStop(0.55, `rgba(40, 10, 60, ${0.25 + 0.2 * (1 - u)})`);
  vx.addColorStop(1, `rgba(2, 0, 12, ${0.55 + 0.25 * boom})`);
  ctx.fillStyle = vx;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  if (elapsed >= PORTAL_TELEPORT_UI_SEC) {
    ctx.font = `700 8px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = `rgba(236, 253, 255, ${0.35 + 0.4 * Math.sin(t * 14)})`;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(LAB_TRANSPORT_TITLE, cx, H * 0.14);
    ctx.shadowBlur = 0;
  }

  // Por cima da explosão: teleporte + loading (breve, antes da tela final)
  if (elapsed < PORTAL_TELEPORT_UI_SEC) {
    const loadT = Math.min(1, elapsed / PORTAL_TELEPORT_BAR_FILL_SEC);
    const eased = 1 - Math.pow(1 - loadT, 2.35);
    const ly = H * 0.34;
    const panelW = Math.min(W * 0.5, 300);
    const panelH = 86;
    const px = cx - panelW * 0.5;
    const py = ly - 28;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 4, 22, 0.55)';
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.45 + 0.25 * Math.sin(t * 11)})`;
    ctx.lineWidth = 1.5;
    cyberRoundRect(ctx, px, py, panelW, panelH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = `800 16px ${HUD_CYBER_FONT}`;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.85)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#f5f3ff';
    ctx.fillText(TELEPORT_ACTIVATING_LABEL, cx, ly);
    ctx.shadowBlur = 0;

    ctx.font = `600 8px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = `rgba(186, 230, 253, ${0.65 + 0.25 * Math.sin(t * 9)})`;
    ctx.fillText('// LOCK ON COORDENADAS //', cx, ly + 16);

    const bw = panelW - 48;
    const bh = 7;
    const bx = cx - bw * 0.5;
    const by = ly + 30;
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.55)';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(bx, by, bw, bh);
    const fillW = Math.max(0, (bw - 3) * eased);
    const barGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
    barGrad.addColorStop(0, '#a78bfa');
    barGrad.addColorStop(0.55, '#c084fc');
    barGrad.addColorStop(1, '#22d3ee');
    ctx.fillStyle = barGrad;
    ctx.fillRect(bx + 1.5, by + 1.5, fillW, bh - 3);

    const pct = Math.round(eased * 100);
    ctx.font = `700 9px ${HUD_CYBER_FONT}`;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
    ctx.fillText(`${pct}%`, cx, by + bh + 14);

    const dotY = by + bh + 28;
    const nDots = 8;
    const wave = (t * 5) % nDots;
    for (let d = 0; d < nDots; d++) {
      const dist = Math.min(Math.abs(d - wave), Math.abs(d - wave + nDots), Math.abs(d - wave - nDots));
      const a = 0.25 + 0.65 * Math.max(0, 1 - dist * 0.85);
      ctx.fillStyle = `rgba(34, 211, 238, ${a * (0.5 + 0.5 * eased)})`;
      ctx.beginPath();
      ctx.arc(cx - (nDots * 5) + d * 11, dotY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  ctx.textAlign = 'left';

  ctx.restore();
}

/** Tela cheia após o glitch do portal — convite ao próximo nível do totem. */
function renderFinalChallengeScreen(ctx) {
  if (state !== 'won' || finalChallengeT <= 0) return;

  const nowMs = performance.now();
  const t = nowMs * 0.001;
  const pulse = 0.55 + 0.45 * Math.sin(t * 5.2);
  const glitch = (Math.sin(nowMs * 0.031) * 4) | 0;
  const cx = W * 0.5;
  const cy = H * 0.46;

  ctx.save();

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#070510');
  bg.addColorStop(0.45, '#12082a');
  bg.addColorStop(1, '#051018');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = `rgba(34, 211, 238, ${0.08 + pulse * 0.06})`;
  ctx.lineWidth = 1;
  const gridStep = 42;
  for (let x = 0; x < W; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x + glitch, 0);
    ctx.lineTo(x + glitch, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);

  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 36; i++) {
    const nx = ((Math.sin(t * 2.1 + i * 1.7) * 0.5 + 0.5) * W) | 0;
    const ny = ((Math.cos(t * 1.8 + i * 2.3) * 0.5 + 0.5) * H) | 0;
    ctx.fillStyle = `rgba(244, 114, 182, ${0.04 + (i % 5) * 0.02})`;
    ctx.fillRect(nx, ny, 2, 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  const pad = 28;
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.45 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.6)';
  ctx.shadowBlur = 12;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(244, 114, 182, ${0.35 + pulse * 0.25})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 6, pad + 6, W - (pad + 6) * 2, H - (pad + 6) * 2);

  const title = LAB_TRANSPORT_TITLE;
  ctx.textAlign = 'center';
  ctx.font = `800 17px ${HUD_CYBER_FONT}`;
  const chrom = 2.2;
  ctx.fillStyle = `rgba(244, 114, 182, ${0.55 + pulse * 0.25})`;
  ctx.fillText(title, cx + chrom, cy + chrom);
  ctx.fillStyle = `rgba(34, 211, 238, ${0.55 + pulse * 0.25})`;
  ctx.fillText(title, cx - chrom, cy - chrom);
  ctx.shadowColor = 'rgba(236, 253, 255, 0.95)';
  ctx.shadowBlur = 18 + pulse * 10;
  ctx.fillStyle = `rgba(236, 253, 255, ${0.92 + pulse * 0.06})`;
  ctx.fillText(title, cx, cy);
  ctx.shadowBlur = 0;

  ctx.font = `600 9px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = `rgba(103, 232, 249, ${0.5 + pulse * 0.35})`;
  ctx.fillText(LAB_SUB_CRT, cx, cy + 32);
  ctx.font = `600 8px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = `rgba(244, 114, 182, ${0.42 + pulse * 0.28})`;
  ctx.fillText(LAB_SUB_ORCH, cx, cy + 52);

  ctx.textAlign = 'left';

  ctx.restore();
}

// Render
function renderGame(ctx) {
  const baseSegment = findSegment(position);
  const basePercent = Util.percentRemaining(position, SEGMENT_LENGTH);
  const playerSegment = findSegment(position + playerZ);
  const playerPercent = Util.percentRemaining(position + playerZ, SEGMENT_LENGTH);
  const playerY = Util.interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

  let maxy = H;
  let x = 0;
  let dx = -(baseSegment.curve * basePercent);
  const palmDrawQueue = [];

  // Céu + cidade (Race backdrop)
  renderRaceBackdrop(ctx, position, playerY * 0.02);

  // Renderizar segmentos de trás pra frente
  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const segment = segments[(baseSegment.index + n) % segments.length];
    segment.looped = segment.index < baseSegment.index;
    segment.fog = 1 / Math.pow(Math.E, ((n / DRAW_DISTANCE) * (n / DRAW_DISTANCE)) * 5); // exponential fog
    segment.clip = maxy;

    Util.project(
      segment.p1,
      playerX * ROAD_WIDTH - x,
      playerY + CAMERA_HEIGHT,
      position - (segment.looped ? trackLength : 0),
      CAMERA_DEPTH,
      W,
      H,
      ROAD_WIDTH
    );
    Util.project(
      segment.p2,
      playerX * ROAD_WIDTH - x - dx,
      playerY + CAMERA_HEIGHT,
      position - (segment.looped ? trackLength : 0),
      CAMERA_DEPTH,
      W,
      H,
      ROAD_WIDTH
    );

    x = x + dx;
    dx = dx + segment.curve;

    const palmCfg = palmPlacements[segment.index];
    if (palmCfg && segment.p1.camera.z > CAMERA_DEPTH) {
      if (palmCfg.left) {
        const palm = drawPalmTreeOnSegment(ctx, segment, -1, palmCfg.leftVar);
        if (palm) palmDrawQueue.push(palm);
      }
      if (palmCfg.right) {
        const palm = drawPalmTreeOnSegment(ctx, segment, 1, palmCfg.rightVar);
        if (palm) palmDrawQueue.push(palm);
      }
    }

    // Culling
    if (
      segment.p1.camera.z <= CAMERA_DEPTH || // atrás da câmera
      segment.p2.screen.y >= segment.p1.screen.y || // back face cull
      segment.p2.screen.y >= maxy // clip por morro já renderizado
    ) {
      continue;
    }

    Render.segment(
      ctx,
      W,
      LANES,
      segment.p1.screen.x,
      segment.p1.screen.y,
      segment.p1.screen.w,
      segment.p2.screen.x,
      segment.p2.screen.y,
      segment.p2.screen.w,
      segment.fog,
      segment.color
    );

    for (let i = 0; i < BOOST_RECHARGE_POINTS.length; i++) {
      if (boostRechargeFlags[i]) continue;
      const z = trackLength * BOOST_RECHARGE_POINTS[i];
      const idx = Math.floor(z / SEGMENT_LENGTH) % segments.length;
      if (idx !== segment.index) continue;
      const pct = Util.percentRemaining(z, SEGMENT_LENGTH);
      drawRechargePickupOnSegment(ctx, segment, pct);
    }

    maxy = segment.p1.screen.y;
  }

  if (backdropPalmTree && backdropPalmTree.complete && backdropPalmTree.naturalWidth) {
    const iw = backdropPalmTree.naturalWidth;
    const ih = backdropPalmTree.naturalHeight;
    palmDrawQueue.sort((a, b) => a.y - b.y);
    for (const p of palmDrawQueue) {
      ctx.drawImage(backdropPalmTree, 0, 0, iw, ih, p.x, p.y, p.w, p.h);
    }
  }

  // Render dos carros inimigos (do fundo para frente)
  const enemyDraw = [];
  for (const enemy of enemyCars) {
    let dz = enemy.z - position;
    while (dz < 0) dz += trackLength;
    if (dz <= 0 || dz > DRAW_DISTANCE * SEGMENT_LENGTH) continue;
    const seg = findSegment(enemy.z);
    const pct = Util.percentRemaining(enemy.z, SEGMENT_LENGTH);
    const sx = Util.interpolate(seg.p1.screen.x, seg.p2.screen.x, pct);
    const sy = Util.interpolate(seg.p1.screen.y, seg.p2.screen.y, pct);
    const sw = Util.interpolate(seg.p1.screen.w, seg.p2.screen.w, pct);
    if (!isFinite(sx) || !isFinite(sy) || !isFinite(sw) || sy < 0 || sy > H + 40) continue;
    const carW = Math.max(18, sw * 0.26);
    const carH = carW * 0.56;
    const carX = sx + sw * enemy.offset - carW * 0.5;
    const carY = sy - carH;
    enemyDraw.push({ x: carX, y: carY, w: carW, h: carH, colorA: enemy.colorA, colorB: enemy.colorB, spriteKind: enemy.spriteKind });
  }
  enemyDraw.sort((a, b) => a.y - b.y);
  for (const d of enemyDraw) {
    drawEnemyCarSprite(ctx, d.x, d.y, d.w, d.h, d.colorA, d.colorB, d.spriteKind);
  }

  // Player + HUD (mantém cena congelada durante o outro do portal)
  const showDriveScene = state === 'playing' || (state === 'won' && portalFinaleT > 0);
  if (showDriveScene) {
    const playerScale = CAMERA_DEPTH / playerZ;
    const playerW = 40 * playerScale;
    const playerH = 20 * playerScale;
    const playerScreenX = W / 2 - playerW / 2;
    const playerScreenY =
      H / 2 -
      (CAMERA_DEPTH / playerZ) * Util.interpolate(playerSegment.p1.camera.y, playerSegment.p2.camera.y, playerPercent) * (H / 2) -
      playerH;

    const carImg = pickPlayerCarImage();
    if (!drawPlayerCarSprite(ctx, playerScreenX, playerScreenY, playerW, playerH, carImg)) {
      ctx.fillStyle = '#f0f';
      ctx.fillRect(playerScreenX, playerScreenY, playerW, playerH);
    }

    renderRechargePointFx(ctx);
    renderFinishTechGateFx(ctx);
    renderBoostFx(ctx);
    if (boostTimer > 0) {
      renderPlayerBoostPurpleNeon(ctx, playerScreenX, playerScreenY, playerW, playerH);
    }
    renderPreFinaleInterference(ctx);
    renderDriveHud(ctx);
    if (trackRespawnGlitchT > 0) renderTrackSnapGlitch(ctx);
  }

  const showRain = state === 'playing' || (state === 'won' && portalFinaleT > 0);
  if (showRain) renderRainOverlay(ctx);
  if (state === 'won' && portalFinaleT > 0) {
    renderPortalFinaleOverlay(ctx);
  } else if (state === 'won' && finalChallengeT > 0) {
    renderFinalChallengeScreen(ctx);
  }
}

function renderIdleScreen(ctx) {
  const baseSegment = findSegment(position);
  const basePercent = Util.percentRemaining(position, SEGMENT_LENGTH);

  let maxy = H;
  let x = 0;
  let dx = -(baseSegment.curve * basePercent);
  const palmDrawQueue = [];

  renderRaceBackdrop(ctx, 0, 0, { idleStatic: true });

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const segment = segments[(baseSegment.index + n) % segments.length];
    segment.looped = segment.index < baseSegment.index;
    segment.fog = 1 / Math.pow(Math.E, ((n / DRAW_DISTANCE) * (n / DRAW_DISTANCE)) * 5);
    segment.clip = maxy;

    Util.project(
      segment.p1,
      -x,
      CAMERA_HEIGHT,
      position - (segment.looped ? trackLength : 0),
      CAMERA_DEPTH,
      W,
      H,
      ROAD_WIDTH
    );
    Util.project(
      segment.p2,
      -x - dx,
      CAMERA_HEIGHT,
      position - (segment.looped ? trackLength : 0),
      CAMERA_DEPTH,
      W,
      H,
      ROAD_WIDTH
    );

    x = x + dx;
    dx = dx + segment.curve;

    const palmCfg = palmPlacements[segment.index];
    if (palmCfg && segment.p1.camera.z > CAMERA_DEPTH) {
      if (palmCfg.left) {
        const palm = drawPalmTreeOnSegment(ctx, segment, -1, palmCfg.leftVar);
        if (palm) palmDrawQueue.push(palm);
      }
      if (palmCfg.right) {
        const palm = drawPalmTreeOnSegment(ctx, segment, 1, palmCfg.rightVar);
        if (palm) palmDrawQueue.push(palm);
      }
    }

    if (
      segment.p1.camera.z <= CAMERA_DEPTH ||
      segment.p2.screen.y >= segment.p1.screen.y ||
      segment.p2.screen.y >= maxy
    ) {
      continue;
    }

    Render.segment(
      ctx,
      W,
      LANES,
      segment.p1.screen.x,
      segment.p1.screen.y,
      segment.p1.screen.w,
      segment.p2.screen.x,
      segment.p2.screen.y,
      segment.p2.screen.w,
      segment.fog,
      segment.color
    );

    maxy = segment.p1.screen.y;
  }

  if (backdropPalmTree && backdropPalmTree.complete && backdropPalmTree.naturalWidth) {
    const iw = backdropPalmTree.naturalWidth;
    const ih = backdropPalmTree.naturalHeight;
    palmDrawQueue.sort((a, b) => a.y - b.y);
    for (const p of palmDrawQueue) {
      ctx.drawImage(backdropPalmTree, 0, 0, iw, ih, p.x, p.y, p.w, p.h);
    }
  }

  // Overlay inicial: neon + press start
  const t = performance.now() * 0.001;
  const pulse = 0.62 + 0.38 * Math.sin(t * 3.8);
  const pressPulse = 0.5 + 0.5 * Math.sin(t * 7.2);
  const cx = W / 2;
  const titleY = H * 0.44;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  ctx.font = `800 46px ${HUD_CYBER_FONT}`;
  const title = 'NEON RACE';
  const glitch = Math.sin(t * 26) * 1.8;
  const glitch2 = Math.sin(t * 41 + 1.7) * 1.1;
  ctx.fillStyle = `rgba(34, 211, 238, ${0.34 * pulse})`;
  ctx.fillText(title, cx - 2 + glitch, titleY);
  ctx.fillStyle = `rgba(244, 114, 182, ${0.34 * pulse})`;
  ctx.fillText(title, cx + 2 - glitch, titleY);
  ctx.shadowColor = 'rgba(196, 181, 253, 0.92)';
  ctx.shadowBlur = 22 * pulse;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, cx + glitch2 * 0.4, titleY);
  ctx.shadowBlur = 0;

  // Interferência horizontal sutil no título
  ctx.strokeStyle = `rgba(236, 253, 255, ${0.14 + 0.12 * pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 142 + glitch, titleY - 12);
  ctx.lineTo(cx + 142 - glitch, titleY - 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 126 - glitch2, titleY + 8);
  ctx.lineTo(cx + 126 + glitch2, titleY + 8);
  ctx.stroke();

  const lineY = titleY + 16;
  const lineW = Math.min(W * 0.56, 380);
  const lg = ctx.createLinearGradient(cx - lineW * 0.5, lineY, cx + lineW * 0.5, lineY);
  lg.addColorStop(0, 'rgba(34, 211, 238, 0)');
  lg.addColorStop(0.5, `rgba(216, 180, 254, ${0.6 + 0.25 * pulse})`);
  lg.addColorStop(1, 'rgba(244, 114, 182, 0)');
  ctx.strokeStyle = lg;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - lineW * 0.48, lineY);
  ctx.lineTo(cx + lineW * 0.48, lineY);
  ctx.stroke();

  ctx.font = `700 11px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = `rgba(165, 243, 252, ${0.68 + 0.22 * pulse})`;
  ctx.fillText('NEON STREET CIRCUIT', cx, titleY + 38);

  ctx.font = `700 17px ${HUD_CYBER_FONT}`;
  ctx.fillStyle = `rgba(186, 230, 253, ${0.46 + 0.54 * pressPulse})`;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.75)';
  ctx.shadowBlur = 12 * pressPulse;
  ctx.fillText('PRESS START', cx, titleY + 78);
  ctx.shadowBlur = 0;

  ctx.textAlign = 'left';
  ctx.restore();
}

// Interface do Totem CRT
const corrida = {
  id: 'corrida',
  name: 'CORRIDA',
  difficulty: 3,

  init(canvasEl, inputRef) {
    _canvas = canvasEl;
    _ctx = _canvas.getContext('2d');
    _inputRef = inputRef;

    // Constantes de jogo
    maxSpeed = SEGMENT_LENGTH / (1 / 60); // 60 fps
    accel = maxSpeed / 3;
    breaking = -maxSpeed;
    decel = -maxSpeed / 6;
    offRoadDecel = -maxSpeed / 2;
    offRoadLimit = maxSpeed / 4;
    playerZ = CAMERA_HEIGHT * CAMERA_DEPTH;

    buildTrack();
    resetEnemyCars();
    initAudio();
    loadPlayerCarSprites();
    loadEnemySprites();
    loadBackdropAssets();
    document.addEventListener('keydown', onBoostKeyDown);
    document.addEventListener('keyup', onBoostKeyUp);
    document.addEventListener('keydown', onDriveMuteKeyDown);
    ensureDriveMuteButton();
    this.reset(); // idle, sem música — só toca ao premir start na corrida (totem ou teste)
  },

  update(dt) {
    if (!_inputRef) _inputRef = rushInputRef();
    const dtSec = dtSeconds(dt);
    if (state === 'idle') {
      updateIdle(dtSec);
      // Start: buttonA ou up
      if (_inputRef.buttonA || _inputRef.up) {
        startBackgroundMusic();
        state = 'playing';
        position = playerZ; // começar logo após a linha de start
        speed = 0;
        playerX = 0;
        lapTime = 0;
        distanceTraveled = 0;
        boostCharges = BOOST_MAX_CHARGES;
        boostTimer = 0;
        boostFlashTimer = 0;
        boostTextTimer = 0;
        boostRechargeTextTimer = 0;
        boostInputLatch = false;
        boostRechargeFlags = BOOST_RECHARGE_POINTS.map(() => false);
        enemyHitFxTimer = 0;
        enemyCollisionCooldown = 0;
        trackRespawnGlitchT = 0;
        resetEnemyCars();
      }
    } else if (state === 'playing') {
      updateGame(dtSec);
    } else if (state === 'won') {
      if (portalFinaleT > 0) {
        updateGame(dtSec);
        portalFinaleT = Math.max(0, portalFinaleT - dtSec);
        if (portalFinaleT <= 0) {
          portalFinaleT = 0;
          finalChallengeT = FINAL_CHALLENGE_DURATION_SEC;
          if (engineLoop) engineLoop.pause();
        }
      } else if (finalChallengeT > 0) {
        finalChallengeT = Math.max(0, finalChallengeT - dtSec);
      }
    }
  },

  render(renderCtx) {
    if (state === 'idle') {
      this.renderIdle(renderCtx);
    } else {
      renderGame(renderCtx);
    }
  },

  renderIdle(renderCtx) {
    renderIdleScreen(renderCtx);
  },

  getState() {
    if (state === 'won' && (portalFinaleT > 0 || finalChallengeT > 0)) return 'playing';
    return state === 'won' ? 'won' : 'playing';
  },

  reset() {
    state = 'idle';
    portalFinaleT = 0;
    finalChallengeT = 0;
    position = 0;
    playerX = 0;
    speed = 0;
    lapTime = 0;
    distanceTraveled = 0;
    boostCharges = BOOST_MAX_CHARGES;
    boostTimer = 0;
    boostFlashTimer = 0;
    boostTextTimer = 0;
    boostRechargeTextTimer = 0;
    boostInputLatch = false;
    boostRechargeFlags = BOOST_RECHARGE_POINTS.map(() => false);
    enemyHitFxTimer = 0;
    enemyCollisionCooldown = 0;
    trackRespawnGlitchT = 0;
    resetEnemyCars();
    initAudio();
    if (bgMusic) {
      bgMusic.pause();
      try {
        bgMusic.currentTime = 0;
      } catch (_) {}
    }
    if (engineLoop) {
      engineLoop.pause();
      try {
        engineLoop.currentTime = 0;
      } catch (_) {}
    }
  },

  destroy() {
    document.removeEventListener('keydown', onBoostKeyDown);
    document.removeEventListener('keyup', onBoostKeyUp);
    document.removeEventListener('keydown', onDriveMuteKeyDown);
    boostKeyHeld = false;
    if (_driveMuteBtn && _driveMuteBtn.parentNode) {
      _driveMuteBtn.parentNode.removeChild(_driveMuteBtn);
    }
    _driveMuteBtn = null;
    if (engineLoop) {
      engineLoop.pause();
      engineLoop.currentTime = 0;
      engineLoop = null;
    }
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
      bgMusic = null;
    }
    if (boostSfx) {
      boostSfx.pause();
      boostSfx.currentTime = 0;
      boostSfx = null;
    }
    if (portalExplosionSfx) {
      portalExplosionSfx.pause();
      portalExplosionSfx.currentTime = 0;
      portalExplosionSfx = null;
    }
  },
};

export default corrida;
