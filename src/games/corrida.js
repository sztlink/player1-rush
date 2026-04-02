// corrida.js — Corrida pseudo-3D estilo OutRun para Totem CRT
// Adaptado de javascript-racer (jakesgordon)
// ES Module, 640×480, sem dependências externas

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
let trackLength = 0;
let maxSpeed = 0;
let accel = 0;
let breaking = 0;
let decel = 0;
let offRoadDecel = 0;
let offRoadLimit = 0;
let centrifugal = 0.3;

// Web Audio API — sons sintetizados
let audioCtx = null;
let engineOsc = null;
let engineGain = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(audioCtx.destination);

    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 80;
    engineOsc.connect(engineGain);
    engineOsc.start();
  } catch (e) {
    console.warn('Web Audio não disponível:', e);
  }
}

function updateEngineSound() {
  if (!engineOsc || !engineGain) return;
  const speedPercent = speed / maxSpeed;
  engineGain.gain.value = state === 'playing' ? 0.05 * speedPercent : 0;
  engineOsc.frequency.value = 80 + speedPercent * 200; // 80Hz a 280Hz
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

// Update
function updateGame(dt) {
  if (state !== 'playing') return;

  const playerSegment = findSegment(position + playerZ);
  const speedPercent = speed / maxSpeed;
  const dx = dt * 2 * speedPercent; // atravessar de -1 a 1 em 1 segundo no max speed
  const startPosition = position;

  // Input lateral
  if (_inputRef.left) {
    playerX -= dx;
  } else if (_inputRef.right) {
    playerX += dx;
  }

  // Efeito centrífugo das curvas
  playerX -= dx * speedPercent * playerSegment.curve * centrifugal;

  // Aceleração/freio
  if (_inputRef.up || _inputRef.buttonA) {
    speed = Util.accelerate(speed, accel, dt);
  } else if (_inputRef.down) {
    speed = Util.accelerate(speed, breaking, dt);
  } else {
    speed = Util.accelerate(speed, decel, dt);
  }

  // Off-road (fora da pista)
  if (playerX < -1 || playerX > 1) {
    if (speed > offRoadLimit) {
      speed = Util.accelerate(speed, offRoadDecel, dt);
    }
  }

  // Limites
  playerX = Util.limit(playerX, -3, 3);
  speed = Util.limit(speed, 0, maxSpeed);

  // Atualizar posição Z
  position = Util.increase(position, dt * speed, trackLength);

  // Lap time
  lapTime += dt;

  // Vitória: completar 1 volta
  if (position > playerZ && startPosition < playerZ) {
    state = 'won';
    playWinSound();
  }

  updateEngineSound();
}

function updateIdle(dt) {
  // Câmera percorrendo a pista em velocidade constante
  position = Util.increase(position, dt * (maxSpeed / 2), trackLength);
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

  // Limpar canvas
  ctx.fillStyle = COLORS.SKY;
  ctx.fillRect(0, 0, W, H);

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

  // Player (carro simplificado como retângulo)
  if (state === 'playing') {
    const playerScale = CAMERA_DEPTH / playerZ;
    const playerW = 40 * playerScale;
    const playerH = 20 * playerScale;
    const playerScreenX = W / 2 - playerW / 2;
    const playerScreenY =
      H / 2 -
      (CAMERA_DEPTH / playerZ) * Util.interpolate(playerSegment.p1.camera.y, playerSegment.p2.camera.y, playerPercent) * (H / 2) -
      playerH;

    ctx.fillStyle = '#f0f';
    ctx.fillRect(playerScreenX, playerScreenY, playerW, playerH);
  }

  // HUD
  renderHUD(ctx);
}

function renderHUD(ctx) {
  ctx.fillStyle = '#0ff';
  ctx.font = '16px monospace';
  ctx.textAlign = 'right';

  // Speed (top-right)
  const speedKmh = Math.round((speed / maxSpeed) * 200);
  ctx.fillText(`${speedKmh} km/h`, W - 10, 25);

  // Lap time / position (top-left)
  ctx.textAlign = 'left';
  const lapPercent = Math.round((position / trackLength) * 100);
  ctx.fillText(`LAP: ${lapPercent}%`, 10, 25);
  ctx.fillText(`TIME: ${lapTime.toFixed(1)}s`, 10, 50);

  if (state === 'won') {
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VITORIA!', W / 2, H / 2);
    ctx.font = '16px monospace';
    ctx.fillText(`Tempo: ${lapTime.toFixed(2)}s`, W / 2, H / 2 + 40);
  }
}

function renderIdleScreen(ctx) {
  const baseSegment = findSegment(position);
  const basePercent = Util.percentRemaining(position, SEGMENT_LENGTH);

  let maxy = H;
  let x = 0;
  let dx = -(baseSegment.curve * basePercent);

  ctx.fillStyle = COLORS.SKY;
  ctx.fillRect(0, 0, W, H);

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
    accel = maxSpeed / 5;
    breaking = -maxSpeed;
    decel = -maxSpeed / 5;
    offRoadDecel = -maxSpeed / 2;
    offRoadLimit = maxSpeed / 4;
    playerZ = CAMERA_HEIGHT * CAMERA_DEPTH;

    buildTrack();
    initAudio();
    this.reset();
    state = 'idle'; // orquestrador controla o início
  },

  update(dt) {
    if (state === 'idle') {
      updateIdle(dt);
      // Start: buttonA ou up
      if (_inputRef.buttonA || _inputRef.up) {
        state = 'playing';
        position = playerZ; // começar logo após a linha de start
        speed = 0;
        playerX = 0;
        lapTime = 0;
      }
    } else if (state === 'playing') {
      updateGame(dt);
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
    return state;
  },

  reset() {
    state = 'playing';
    position = 0;
    playerX = 0;
    speed = 0;
    lapTime = 0;
  },

  destroy() {
    if (engineOsc) {
      engineOsc.stop();
      engineOsc.disconnect();
      engineOsc = null;
    }
    if (engineGain) {
      engineGain.disconnect();
      engineGain = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  },
};

export default corrida;
