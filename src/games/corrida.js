// corrida.js — Corrida pseudo-3D estilo OutRun para Totem CRT
// Adaptado de javascript-racer (jakesgordon)
// ES Module, 640×480, sem dependências externas

import { getState as rushInputRef } from '../input.js';

const W = 640;
const H = 480;
const CAMERA_HEIGHT = 1000;
const FOV = 80; // degrees
const CAMERA_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const DRAW_DISTANCE = 150;
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

/** Orquestrador: dt em ms (~16.67). Física em segundos. */
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
let distanceTraveled = 0;
let trackLength = 0;
let maxSpeed = 0;
let accel = 0;
let breaking = 0;
let decel = 0;
let offRoadDecel = 0;
let offRoadLimit = 0;
let centrifugal = 0.3;
const STEER_INPUT_RATE = 5.5;
const STEER_SPEED_FLOOR = 0.2;

const BOOST_MAX_CHARGES = 3;
let boostCharges = BOOST_MAX_CHARGES;
const BOOST_DURATION_SEC = 1.3;
const BOOST_ACCEL_MULT = 2.2;
const BOOST_TOP_SPEED_MULT = 1.35;
const BOOST_FLASH_SEC = 0.2;
let boostTimer = 0;
let boostFlashTimer = 0;
let boostTextTimer = 0;
let boostInputLatch = false;

/** Sprites do carro (Race) — ficheiros em app/assets/drive/ */
function driveAssetUrl(filename) {
  return new URL(`../../app/assets/drive/${filename}`, import.meta.url).href;
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

function pickPlayerCarImage() {
  if (!playerCarSpritesReady || !playerCarImages.straight || !_inputRef) return null;
  if (_inputRef.left) return playerCarImages.left || playerCarImages.straight;
  if (_inputRef.right) return playerCarImages.right || playerCarImages.straight;
  return playerCarImages.straight;
}

const PLAYER_CAR_DISPLAY_SCALE = 2;

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
let backdropAssetsTried = false;

function backdropUrl(name) {
  return new URL(`../../app/assets/drive/backdrop/${name}`, import.meta.url).href;
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
}

function rndStar(k) {
  const s = Math.sin(k * 12.9898 + k * k * 0.001) * 43758.5453;
  return s - Math.floor(s);
}

/** Adaptado de Race/common.js — neonSynthBackdrop (640×480) */
function renderRaceBackdrop(ctx, positionAlongTrack, playerYShift) {
  const w = W;
  const h = H;
  const v = playerYShift || 0;
  const tStars = performance.now() * 0.001;
  const backdropPan = 0.35;
  const skyOffset = positionAlongTrack * 0.00014 * backdropPan;
  const hillOffset = positionAlongTrack * 0.00019 * backdropPan;
  const treeOffset = positionAlongTrack * 0.00024 * backdropPan;
  const hasCity = backdropLayers.some((x) => x && x.naturalWidth);

  function drawNeonMoon(img) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const moonW = w * 0.18;
    const moonH = moonW * (ih / iw);
    const mx = w * 0.74;
    const my = h * 0.14;
    const pulse = 0.92 + 0.08 * Math.sin(performance.now() * 0.0018);
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
    if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'high';
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
    for (let px = 0; px <= w; px += 4) {
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

  drawWireRidge(skyOffset * 120, h * 0.44 + v * 0.03, 42, 'rgba(150, 90, 255, 0.48)', '#aa66ff', 0.9, 54, 9);
  drawWireRidge(hillOffset * 170, h * 0.5 + v * 0.05, 56, 'rgba(220, 45, 65, 0.52)', '#dd3355', 1.0, 44, 19);
  drawWireRidge(treeOffset * 230, h * 0.56 + v * 0.07, 70, 'rgba(200, 90, 110, 0.46)', '#cc6677', 1.05, 34, 31);

  const starColors = [
    '#ffffff', '#ffd8e0', '#ff8888', '#ff5566', '#cc2233', '#ffaaaa',
    '#b088ff', '#8866dd', '#aa77ee', '#9977ff', '#aaddff', '#9988ee',
    '#aa88ff', '#8866cc', '#7744bb', '#bba0ff', '#c8b0ff',
    '#ddaaff', '#cc99ff', '#8866cc', '#b8a8ff',
  ];
  for (let i = 0; i < 220; i++) {
    const x = rndStar(i * 3.17 + 1) * w;
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

  const cityScroll = 0.09;
  if (hasCity) {
    drawParallaxLayer(backdropLayers[0], skyOffset * 0.1 * cityScroll, 0.6, 0.27, 0.3, 1.0, 0.48, 'screen');
    drawParallaxLayer(backdropLayers[1], hillOffset * 0.2 * cityScroll, 0.72, 0.31, 0.33, 1.0, 0.5, 'screen');
    drawParallaxLayer(backdropLayers[2], treeOffset * 0.34 * cityScroll, 0.84, 0.35, 0.36, 1.02, 0.52, 'screen');
    drawParallaxLayer(backdropLayers[3], (treeOffset * 0.52 + skyOffset * 0.08) * cityScroll, 1.0, 0.15, 0.42, 0.92, 0.26, 'source-over');
  }
}

// Web Audio API — contexto para efeitos pontuais (ex.: vitória)
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio não disponível:', e);
  }
}

function playWinSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 440;
  gain.gain.value = 0.1;
  osc.start();
  osc.stop(audioCtx.currentTime + 0.5);
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
}

function findSegment(z) {
  return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
}

// Update (dtSec = segundos)
function updateGame(dtSec) {
  if (state !== 'playing' || !_inputRef) return;

  const playerSegment = findSegment(position + playerZ);
  const speedPercent = speed / maxSpeed;
  const steerSpeed = Math.max(speedPercent, STEER_SPEED_FLOOR);
  const steerDx = dtSec * STEER_INPUT_RATE * steerSpeed;
  if (_inputRef.left) {
    playerX -= steerDx;
  } else if (_inputRef.right) {
    playerX += steerDx;
  }
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

  // Off-road (fora da pista)
  if (playerX < -1 || playerX > 1) {
    if (speed > offRoadLimit) {
      speed = Util.accelerate(speed, offRoadDecel, dtSec);
    }
  }

  // Limites
  playerX = Util.limit(playerX, -3, 3);
  speed = Util.limit(speed, 0, maxSpeed);

  // Atualizar posição Z
  position = Util.increase(position, dtSec * speed, trackLength);

  // Lap time (segundos)
  lapTime += dtSec;

  distanceTraveled += dtSec * speed;
  if (distanceTraveled >= trackLength) {
    state = 'won';
    playWinSound();
  }
}

function updateIdle(dtSec) {
  // Câmera percorrendo a pista em velocidade constante
  position = Util.increase(position, dtSec * (maxSpeed / 2), trackLength);
}

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

    maxy = segment.p1.screen.y;
  }

  // Player — sprites PNG do Race (fallback retângulo)
  if (state === 'playing') {
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

    renderDriveHud(ctx);
  }

  if (state === 'won') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('VITÓRIA', W / 2, H / 2);
    ctx.font = '14px monospace';
    ctx.fillText(`${lapTime.toFixed(2)}s`, W / 2, H / 2 + 28);
    ctx.textAlign = 'left';
  }
}

function renderIdleScreen(ctx) {
  const baseSegment = findSegment(position);
  const basePercent = Util.percentRemaining(position, SEGMENT_LENGTH);

  let maxy = H;
  let x = 0;
  let dx = -(baseSegment.curve * basePercent);

  renderRaceBackdrop(ctx, position, 0);

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

  // Título
  ctx.fillStyle = '#0ff';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CORRIDA', W / 2, H / 2 - 40);
  ctx.font = '20px monospace';
  ctx.fillText('Pressione START', W / 2, H / 2 + 20);
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
    initAudio();
    loadPlayerCarSprites();
    loadBackdropAssets();
    this.reset();
    state = 'idle'; // orquestrador controla o início
  },

  update(dt) {
    if (!_inputRef) _inputRef = rushInputRef();
    const dtSec = dtSeconds(dt);
    if (state === 'idle') {
      updateIdle(dtSec);
      // Start: buttonA ou up
      if (_inputRef.buttonA || _inputRef.up) {
        state = 'playing';
        position = playerZ; // começar logo após a linha de start
        speed = 0;
        playerX = 0;
        lapTime = 0;
        distanceTraveled = 0;
        boostCharges = BOOST_MAX_CHARGES;
      }
    } else if (state === 'playing') {
      updateGame(dtSec);
    } else if (state === 'won') {
      // Aguardar reset
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
    return state === 'won' ? 'won' : 'playing';
  },

  reset() {
    state = 'playing';
    position = 0;
    playerX = 0;
    speed = 0;
    lapTime = 0;
    distanceTraveled = 0;
    boostCharges = BOOST_MAX_CHARGES;
    initAudio();
  },

  destroy() {
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  },
};

export default corrida;
