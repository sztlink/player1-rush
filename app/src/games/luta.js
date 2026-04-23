// luta.js — Fighting game adaptado do Chris Courses para Totem CRT
// Mecânica: Player vs Enemy AI, gravidade, combate, health bars

const W = 640;
const H = 480;
const GRAVITY = 0.5;
const GROUND_Y = 380;
const PLAYER_SPEED = 4;
const AI_SPEED = 2.5;
const JUMP_VEL = -13;
const ATTACK_COOLDOWN = 30;
const SPECIAL_COOLDOWN = 90;
const SPECIAL_SPEED = 5;
const GROUND_WAVE_COOLDOWN = 95;
const GROUND_WAVE_SPEED = 7.2;
const GROUND_WAVE_DAMAGE = 16;
const COMBO_WINDOW = 20;
const DASH_SPEED = 14;
const DASH_DURATION = 12;
const DASH_COOLDOWN = 30;
const BURST_DAMAGE = 12;
const BURST_KNOCKBACK = 14;
const BURST_COOLDOWN = 120;
const BURST_RADIUS = 100;

const P1_ATTACK_DAMAGE = 8;
const P1_SPECIAL_DAMAGE = 20;
const P1_HP = 100;

const P2_ATTACK_DAMAGE = 10;
const P2_HP = 180;
const P2_RANGED_DAMAGE = 8;

// Estado global do jogo
let state = 'idle'; // 'idle' | 'playing' | 'pre_phase2' | 'phase_transition' | 'dying' | 'won' | 'lost'
let _canvas = null;
let _inputRef = null;

// Entidades
let player = null;
let enemy = null;

// IA
let aiAttackTimer = 0;
let aiJumpTimer = 0;
let aiStrafeDir = 1;
let aiStrafeTimer = 0;
let aiRangedTimer = 0;
let aiMeleeCommitTimer = 0;
let prevButtonB = false;

// Audio context
let audioCtx = null;

// Timer de batalha
let battleTimer = 60;
let timerFrame = 0;

// Projéteis ativos
let projectiles = [];
let energyFields = [];
let groundWaves = [];
let bossTraps = [];
let bossTrapTimer = 0;
let bossPowers = [];
let bossPowerTimer = 0;

// Vidas do P1
const P1_MAX_LIVES = 5;
let p1Lives = P1_MAX_LIVES;
const BERSERKER_LIVES_THRESHOLD = 2;
const BERSERKER_DAMAGE_MULT = 1.35;

// Super meter
const SUPER_MAX = 100;
let superMeter = 0;
const P1_SUPER_AOE_RADIUS = 300;
const P1_SUPER_HP_FRACTION = 0.32;
const P1_SUPER_FLAT = 20;
const P1_SUPER_MAX_DURATION = 118;
let p1SuperFx = null;
let prevButtonX = false;
let bossCineFx = {
  flash: 0,
  shake: 0,
  glitch: 0,
  bars: 0
};

// Boss phase
let bossPhase = 1;
let phaseTransition = null;
const PHASE2_TRIGGER_PCT = 0.5;
const P2_PHASE2_HP_BONUS = 120;
const P2_PHASE2_SCALE = 1.4;
const P2_PHASE2_DAMAGE = 14;
const P2_PHASE2_SPEED = 3.2;
const TRAP_DAMAGE = 5;
const TRAP_STUN_DURATION = 60;
const TRAP_SPAWN_INTERVAL_MIN = 90;
const TRAP_SPAWN_INTERVAL_MAX = 180;
const TRAP_LIFETIME = 300;
const TRAP_MAX_ACTIVE = 4;
const BOSS_PROJ_SPEED = 4;
const BOSS_PROJ_DAMAGE = 12;
const BOSS_WAVE_DAMAGE = 10;
const BOSS_RAIN_DAMAGE = 8;
const BOSS_POWER_COOLDOWN = 120;

// Explosão digital
let deathExplosion = null;

// Victory FX
let victoryTimer = 0;
let victoryParticles = [];

function isP1Berserker() {
  return p1Lives <= BERSERKER_LIVES_THRESHOLD;
}

function scaleP1Damage(baseDamage) {
  if (!isP1Berserker()) return baseDamage;
  return Math.round(baseDamage * BERSERKER_DAMAGE_MULT);
}

function triggerBossCinematic(kind, intensity = 1) {
  if (bossPhase < 2) return;
  const i = Math.max(0.2, intensity);
  if (kind === 'spawn') {
    bossCineFx.flash = Math.max(bossCineFx.flash, 0.08 * i);
    bossCineFx.shake = Math.max(bossCineFx.shake, 0.9 * i);
    bossCineFx.glitch = Math.max(bossCineFx.glitch, 0.35 * i);
    bossCineFx.bars = Math.max(bossCineFx.bars, 0.4 * i);
  } else if (kind === 'impact') {
    bossCineFx.flash = Math.max(bossCineFx.flash, 0.2 * i);
    bossCineFx.shake = Math.max(bossCineFx.shake, 1.7 * i);
    bossCineFx.glitch = Math.max(bossCineFx.glitch, 0.65 * i);
    bossCineFx.bars = Math.max(bossCineFx.bars, 0.8 * i);
  } else {
    bossCineFx.flash = Math.max(bossCineFx.flash, 0.12 * i);
    bossCineFx.shake = Math.max(bossCineFx.shake, 1.1 * i);
    bossCineFx.glitch = Math.max(bossCineFx.glitch, 0.45 * i);
    bossCineFx.bars = Math.max(bossCineFx.bars, 0.55 * i);
  }
}

function updateBossCinematic() {
  bossCineFx.flash *= 0.9;
  bossCineFx.shake *= 0.86;
  bossCineFx.glitch *= 0.88;
  bossCineFx.bars *= 0.84;
  if (bossCineFx.flash < 0.002) bossCineFx.flash = 0;
  if (bossCineFx.shake < 0.02) bossCineFx.shake = 0;
  if (bossCineFx.glitch < 0.01) bossCineFx.glitch = 0;
  if (bossCineFx.bars < 0.01) bossCineFx.bars = 0;
}

function renderBossCinematic(ctx) {
  if (bossPhase < 2) return;
  if (bossCineFx.flash <= 0 && bossCineFx.glitch <= 0 && bossCineFx.bars <= 0) return;

  const pulse = 0.5 + 0.5 * Math.sin(bgOffset * 0.2);
  const flashA = Math.min(0.35, bossCineFx.flash);
  const glitchA = Math.min(0.3, bossCineFx.glitch);
  const barsA = Math.min(0.22, bossCineFx.bars);
  const shakePx = Math.min(6, bossCineFx.shake * 2.4);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, `rgba(255,70,220,${flashA * (0.6 + pulse * 0.4)})`);
  overlay.addColorStop(0.55, `rgba(120,0,200,${flashA * 0.45})`);
  overlay.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (glitchA > 0.01) {
    ctx.save();
    const shift = (Math.sin(bgOffset * 0.55) * 1.8) * (0.6 + glitchA) + Math.sin(bgOffset * 1.1) * shakePx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glitchA * 0.25;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.max(0, shift), 0, W - Math.abs(shift), H);
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(0, 0, W - Math.max(0, shift), H);
    ctx.restore();
  }

  if (barsA > 0.01) {
    ctx.save();
    ctx.globalAlpha = barsA;
    for (let i = 0; i < 5; i++) {
      const y = (bgOffset * 13 + i * 79 + Math.sin(bgOffset * 0.3 + i) * shakePx * 3) % H;
      const h = 1 + (i % 3);
      ctx.fillStyle = i % 2 ? 'rgba(255,0,255,0.6)' : 'rgba(0,255,255,0.45)';
      ctx.fillRect(0, y, W, h);
    }
    ctx.restore();
  }
}

function spawnVictoryFX() {
  victoryTimer = 0;
  victoryParticles = [];
  for (let i = 0; i < 50; i++) {
    victoryParticles.push({
      x: Math.random() * W,
      y: H + Math.random() * 40,
      vy: -1 - Math.random() * 3,
      vx: (Math.random() - 0.5) * 1.5,
      size: 1 + Math.random() * 3,
      color: ['#0ff', '#00ffaa', '#f0f', '#fff', '#ffff00', '#00aaff'][Math.floor(Math.random() * 6)],
      twinkle: Math.random() * Math.PI * 2
    });
  }
}

function spawnDeathExplosion(cx, cy) {
  const particles = [];
  const colors = ['#0ff', '#00ffaa', '#ff0055', '#f0f', '#fff', '#00aaff', '#ffff00'];

  // Ring burst
  for (let i = 0; i < 40; i++) {
    const angle = (Math.PI * 2 / 40) * i;
    const speed = 3 + Math.random() * 5;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 60 + Math.random() * 40,
      maxLife: 100,
      type: 'spark'
    });
  }

  // Glitch blocks
  for (let i = 0; i < 25; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      w: 4 + Math.random() * 16,
      h: 2 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 50 + Math.random() * 50,
      maxLife: 100,
      type: 'block',
      glitchTimer: 0
    });
  }

  // Data streams (vertical lines rising up)
  for (let i = 0; i < 15; i++) {
    particles.push({
      x: cx + (Math.random() - 0.5) * 120,
      y: cy,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -2 - Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 70 + Math.random() * 40,
      maxLife: 110,
      type: 'stream',
      chars: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () =>
        String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96))
      )
    });
  }

  // Shockwave rings
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: cx, y: cy,
      radius: 0,
      maxRadius: 100 + i * 60,
      speed: 3 + i * 1.5,
      color: i === 0 ? '#0ff' : i === 1 ? '#f0f' : '#fff',
      life: 30 + i * 10,
      maxLife: 40 + i * 10,
      type: 'ring'
    });
  }

  deathExplosion = { particles, timer: 0, fadeIn: 0 };
}

function updateDeathExplosion() {
  if (!deathExplosion) return;
  deathExplosion.timer++;
  if (deathExplosion.fadeIn < 1) deathExplosion.fadeIn += 0.02;

  deathExplosion.particles.forEach(p => {
    p.life--;
    if (p.type === 'spark') {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.size *= 0.98;
    } else if (p.type === 'block') {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.glitchTimer++;
      if (p.glitchTimer % 6 === 0) {
        p.x += (Math.random() - 0.5) * 8;
      }
    } else if (p.type === 'stream') {
      p.x += p.vx;
      p.y += p.vy;
    } else if (p.type === 'ring') {
      p.radius += p.speed;
    }
  });

  deathExplosion.particles = deathExplosion.particles.filter(p => p.life > 0);
}

function renderDeathExplosion(ctx) {
  if (!deathExplosion) return;

  deathExplosion.particles.forEach(p => {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();

    if (p.type === 'spark') {
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.type === 'block') {
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = alpha * 0.3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    } else if (p.type === 'stream') {
      ctx.globalAlpha = alpha * 0.6;
      ctx.font = '8px monospace';
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      p.chars.forEach((ch, i) => {
        ctx.fillText(ch, p.x, p.y + i * 10);
      });
    } else if (p.type === 'ring') {
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  });
}

// Background animation
let bgOffset = 0;
let bgRaindrops = [];
let bgSmoke = [];
let bgEmbers = [];
let bgImage = null;
let bgImageLoaded = false;
const BG_PHASE2_SRC =
  'assets/fight/Cenario_002.png';
let bgImageP2 = null;
let bgImageP2Loaded = false;
let bgImageP2InitDone = false;
/** true durante transição / fase 2 — troca o fundo no primeiro frame do overlay (flash cobre a troca) */
let showBossPhase2Background = false;

const PRE_PHASE2_DURATION = 110;
let prePhase2Timer = 0;
/** explosões no canvas — substituir por sprites depois */
let prePhase2Explosions = [];
let bossImploding = false;

// =============================================================================
// SPRITE SYSTEM
// =============================================================================

const SPRITE_SCALE = 3;
const DESTROYER_SCALE_FIX = 0.72;

const SPRITE_DEFS = {
  'Enemy-Punk': {
    basePath: 'assets/fight',
    defaultFacingRight: false,
    animations: {
      idle:  { folder: 'Destroyer/Idle',  prefix: 'idle',  count: 5, speed: 8, loop: true },
      walk:  { folder: 'Destroyer/Walk',  prefix: 'walk',  count: 8, speed: 6, loop: true },
      punch: { folder: 'Destroyer/Punch', prefix: 'punch', count: 3, speed: 5, loop: false },
      hurt:  { folder: 'Destroyer/Hurt',  prefix: 'hurt',  count: 3, speed: 6, loop: false },
      shot:  { folder: 'Destroyer/Shot',  prefix: 'shot',  count: 8, speed: 5, loop: true },
      chargeHit: { folder: 'Destroyer/ChargeImpact', prefix: 'charge', count: 5, speed: 4, loop: false },
      dead:  { folder: 'Destroyer/Dead',  prefix: 'dead',  count: 7, speed: 7, loop: false },
    }
  },
  'Brawler-Girl': {
    basePath: 'assets/fight/Brawler-Girl',
    defaultFacingRight: true,
    animations: {
      idle:      { folder: 'Idle',      prefix: 'idle',      count: 4,  speed: 8, loop: true },
      walk:      { folder: 'Walk',      prefix: 'walk',      count: 10, speed: 5, loop: true },
      punch:     { folder: 'Punch',     prefix: 'punch',     count: 3,  speed: 5, loop: false },
      kick:      { folder: 'Kick',      prefix: 'kick',      count: 5,  speed: 5, loop: false },
      jab:       { folder: 'Jab',       prefix: 'jab',       count: 3,  speed: 4, loop: false },
      jump:      { folder: 'Jump',      prefix: 'jump',      count: 4,  speed: 6, loop: false },
      jump_kick: { folder: 'Jump_kick', prefix: 'jump_kick', count: 3,  speed: 5, loop: false },
      dive_kick: { folder: 'Dive_kick', prefix: 'dive_kick', count: 5,  speed: 5, loop: false },
      hurt:      { folder: 'Hurt',      prefix: 'hurt',      count: 2,  speed: 6, loop: false },
    }
  }
};

const spriteCache = {};
let spritesToLoad = 0;
let spritesLoadedCount = 0;
let spritesReady = false;

function loadAllSprites() {
  if (spritesReady || spritesToLoad > 0) return;

  for (const [charName, def] of Object.entries(SPRITE_DEFS)) {
    spriteCache[charName] = {};
    for (const [animName, anim] of Object.entries(def.animations)) {
      spriteCache[charName][animName] = [];
      for (let i = 1; i <= anim.count; i++) {
        spritesToLoad++;
        const img = new Image();
        img.onload = () => {
          spritesLoadedCount++;
          if (spritesLoadedCount >= spritesToLoad) spritesReady = true;
        };
        img.src = `${def.basePath}/${anim.folder}/${anim.prefix}${i}.png`;
        spriteCache[charName][animName].push(img);
      }
    }
  }
}

function getSprite(charName, animName, frameIndex) {
  const frames = spriteCache[charName]?.[animName];
  if (!frames || frames.length === 0) return null;
  return frames[frameIndex % frames.length];
}

// =============================================================================
// CLASSES
// =============================================================================

class Fighter {
  constructor(x, y, charName, isPlayer = true) {
    this.x = x;
    this.y = y;
    this.w = 50;
    this.h = 80;
    this.vx = 0;
    this.vy = 0;
    this.charName = charName;
    this.isPlayer = isPlayer;

    this.maxHealth = isPlayer ? P1_HP : P2_HP;
    this.health = this.maxHealth;

    this.attacking = false;
    this.attackFrame = 0;
    this.attackCooldown = 0;

    this.hitFlicker = 0;
    this.hitLanded = false;
    this.onGround = false;
    this.facingRight = isPlayer;
    this.stunTimer = 0;

    // Sprite animation
    this.currentAnim = 'idle';
    this.prevAnim = 'idle';
    this.spriteFrame = 0;
    this.spriteTimer = 0;
    this.forcedAnim = null;
    this.forcedAnimTimer = 0;
    this.queuedProjectileTimer = 0;
    this.queuedProjectileDirRight = true;

    this.attackBox = { x: 0, y: 0, w: 60, h: 40 };

    // Combo / special
    this.inputBuffer = [];
    this.specialCooldown = 0;
    this.prevBackPressed = false;

    // Dash
    this.dashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDir = 1;
    this.fwdBuffer = [];
    this.prevFwdPressed = false;
    this.afterimages = [];

    // Burst (energy field)
    this.bfBuffer = [];
    this.burstCooldown = 0;
    this.groundWaveCooldown = 0;
  }

  getAnimState() {
    const def = SPRITE_DEFS[this.charName];
    if (this.health <= 0 && def.animations.dead) return 'dead';
    if (this.hitFlicker > 0) return 'hurt';
    if (this.forcedAnimTimer > 0 && this.forcedAnim && def.animations[this.forcedAnim]) return this.forcedAnim;
    if (!this.onGround) {
      if (this.attacking && def.animations.jump_kick) {
        // Falling + attack = dive_kick, rising + attack = jump_kick
        if (this.vy > 0 && def.animations.dive_kick) return 'dive_kick';
        return 'jump_kick';
      }
      return def.animations.jump ? 'jump' : 'idle';
    }
    if (this.attacking) return 'punch';
    if (Math.abs(this.vx) > 0.5) return 'walk';
    return 'idle';
  }

  update(dt) {
    if (this.stunTimer > 0) {
      this.stunTimer--;
      this.vx = 0;
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y + this.h >= GROUND_Y) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        this.onGround = true;
      }
      if (this.hitFlicker > 0) this.hitFlicker--;
      return;
    }

    this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;

    if (this.y + this.h >= GROUND_Y) {
      this.y = GROUND_Y - this.h;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    if (this.x < 10) this.x = 10;
    if (this.x > W - this.w - 10) this.x = W - this.w - 10;

    const opponent = this.isPlayer ? enemy : player;
    if (opponent) {
      const dx = opponent.x - this.x;
      if (Math.abs(dx) > 4) this.facingRight = dx > 0;
    }

    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.dashCooldown > 0) this.dashCooldown--;
    if (this.burstCooldown > 0) this.burstCooldown--;
    if (this.groundWaveCooldown > 0) this.groundWaveCooldown--;
    if (this.forcedAnimTimer > 0) this.forcedAnimTimer--;

    if (!this.isPlayer && this.queuedProjectileTimer > 0) {
      this.queuedProjectileTimer--;
      if (this.queuedProjectileTimer <= 0 && state === 'playing' && this.health > 0) {
        const px = this.queuedProjectileDirRight ? this.x + this.w + 8 : this.x - 8;
        const py = this.y - 45;
        projectiles.push(new Projectile(px, py, this.queuedProjectileDirRight, this));
        sndShoot();
      }
    }

    // Dash movement
    if (this.dashing) {
      this.vx = DASH_SPEED * this.dashDir;
      this.dashTimer--;

      this.afterimages.push({
        x: this.x, y: this.y, w: this.w, h: this.h,
        anim: this.currentAnim, frame: this.spriteFrame,
        facingRight: this.facingRight, alpha: 0.7, life: 18,
        tint: this.afterimages.length % 2 === 0 ? [0, 255, 255] : [0, 200, 255]
      });

      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.vx = 0;
      }
    }

    // Afterimages decay
    this.afterimages.forEach(a => { a.life--; a.alpha -= 0.04; });
    this.afterimages = this.afterimages.filter(a => a.life > 0 && a.alpha > 0);

    if (this.attacking) {
      this.attackFrame++;
      if (this.attackFrame > 15) {
        this.attacking = false;
        this.attackFrame = 0;
      }
    }

    if (this.hitFlicker > 0) this.hitFlicker--;

    // Sprite animation state machine
    const newAnim = this.getAnimState();
    if (newAnim !== this.currentAnim) {
      this.currentAnim = newAnim;
      this.spriteFrame = 0;
      this.spriteTimer = 0;
    }

    const def = SPRITE_DEFS[this.charName];
    const animDef = def.animations[this.currentAnim] || def.animations.idle;

    this.spriteTimer++;
    if (this.spriteTimer >= animDef.speed) {
      this.spriteTimer = 0;
      if (this.spriteFrame < animDef.count - 1) {
        this.spriteFrame++;
      } else if (animDef.loop) {
        this.spriteFrame = 0;
      }
    }

    this.updateAttackBox();
  }

  updateAttackBox() {
    this.attackBox.x = this.x + (this.facingRight ? this.w : -this.attackBox.w);
    this.attackBox.y = this.y + 15;
  }

  attack() {
    if (this.attackCooldown > 0 || this.attacking) return;
    this.attacking = true;
    this.attackFrame = 0;
    this.hitLanded = false;
    this.attackCooldown = ATTACK_COOLDOWN;
    sndPunch();
  }

  jump() {
    if (!this.onGround) return;
    this.vy = JUMP_VEL;
    sndJump();
  }

  recordBack(frameCount) {
    this.inputBuffer.push(frameCount);
    if (this.inputBuffer.length > 5) this.inputBuffer.shift();
  }

  checkCombo(frameCount) {
    if (this.specialCooldown > 0) return false;
    const buf = this.inputBuffer;
    if (buf.length < 2) return false;
    const last = buf[buf.length - 1];
    const prev = buf[buf.length - 2];
    return (last - prev) <= COMBO_WINDOW;
  }

  recordFwd(frameCount) {
    this.fwdBuffer.push(frameCount);
    if (this.fwdBuffer.length > 5) this.fwdBuffer.shift();
  }

  checkDashCombo(frameCount) {
    if (this.dashCooldown > 0 || this.dashing) return false;
    const buf = this.fwdBuffer;
    if (buf.length < 2) return false;
    const last = buf[buf.length - 1];
    const prev = buf[buf.length - 2];
    return (last - prev) <= COMBO_WINDOW;
  }

  startDash() {
    if (this.dashCooldown > 0 || this.dashing) return;
    this.dashing = true;
    this.dashTimer = DASH_DURATION;
    this.dashDir = this.facingRight ? 1 : -1;
    this.dashCooldown = DASH_COOLDOWN;
  }

  fireSpecial() {
    if (this.specialCooldown > 0) return;
    this.specialCooldown = SPECIAL_COOLDOWN;

    const px = this.facingRight ? this.x + this.w + 10 : this.x - 10;
    const py = this.y;
    projectiles.push(new Projectile(px, py, this.facingRight, this));
    sndSpecial();
  }

  recordBackFwd(frameCount, type) {
    this.bfBuffer.push({ frame: frameCount, type });
    if (this.bfBuffer.length > 6) this.bfBuffer.shift();
  }

  checkBurstCombo(frameCount) {
    if (this.burstCooldown > 0) return false;
    const buf = this.bfBuffer;
    if (buf.length < 2) return false;
    let lastFwd = -1, lastBack = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].type === 'fwd' && lastFwd < 0) lastFwd = i;
      if (buf[i].type === 'back' && lastBack < 0) lastBack = i;
    }
    if (lastBack < 0 || lastFwd < 0) return false;
    if (lastBack >= lastFwd) return false;
    return (buf[lastFwd].frame - buf[lastBack].frame) <= COMBO_WINDOW;
  }

  fireBurst() {
    if (this.burstCooldown > 0) return;
    this.burstCooldown = BURST_COOLDOWN;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    energyFields.push(new EnergyField(cx, cy, this));
    sndBurst();
  }

  fireGroundWave() {
    if (this.groundWaveCooldown > 0) return false;
    this.groundWaveCooldown = GROUND_WAVE_COOLDOWN;
    const gx = this.facingRight ? this.x + this.w + 4 : this.x - 4;
    groundWaves.push(new GroundWave(gx, this, this.facingRight));
    sndSpecial();
    return true;
  }

  takeHit(damage) {
    this.health -= damage;
    if (this.health < 0) this.health = 0;
    const def = SPRITE_DEFS[this.charName];
    const hurtAnim = def?.animations?.hurt;
    // Keep hurt state long enough to display all hurt frames.
    this.hitFlicker = hurtAnim ? Math.max(10, hurtAnim.count * hurtAnim.speed + 2) : 10;
    sndHit();
  }

  triggerAnim(animName) {
    const def = SPRITE_DEFS[this.charName];
    const anim = def?.animations?.[animName];
    if (!anim) return;
    this.forcedAnim = animName;
    this.forcedAnimTimer = Math.max(4, anim.count * anim.speed);
  }

  queueRangedShot(dirRight) {
    const def = SPRITE_DEFS[this.charName];
    const shotAnim = def?.animations?.shot;
    this.queuedProjectileDirRight = !!dirRight;
    this.queuedProjectileTimer = shotAnim ? Math.max(4, Math.floor(shotAnim.count * shotAnim.speed * 0.62)) : 8;
    this.triggerAnim('shot');
  }

  renderSprite(ctx, sprite, posX, posY, w, h, fRight, alpha) {
    if (!sprite || !sprite.complete || sprite.naturalWidth === 0) return;
    const sw = sprite.naturalWidth;
    const sh = sprite.naturalHeight;
    const dw = sw * SPRITE_SCALE;
    const dh = sh * SPRITE_SCALE;
    const centerX = posX + w / 2;
    const dY = posY + h - dh;
    const def = SPRITE_DEFS[this.charName];
    const needsFlip = fRight !== def.defaultFacingRight;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (needsFlip) {
      ctx.translate(centerX, dY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -dw / 2, 0, dw, dh);
    } else {
      ctx.drawImage(sprite, centerX - dw / 2, dY, dw, dh);
    }
    ctx.restore();
  }

  render(ctx) {
    // Afterimages (echo) — sprite copies with fade
    this.afterimages.forEach(a => {
      const ghostSprite = getSprite(this.charName, a.anim, a.frame);
      if (!ghostSprite || !ghostSprite.complete) return;
      const sw = ghostSprite.naturalWidth;
      const sh = ghostSprite.naturalHeight;
      const dw = sw * SPRITE_SCALE;
      const dh = sh * SPRITE_SCALE;
      const gx = a.x + a.w / 2;
      const gy = a.y + a.h - dh;
      const def = SPRITE_DEFS[this.charName];
      const flip = a.facingRight !== def.defaultFacingRight;

      ctx.save();
      ctx.globalAlpha = a.alpha * 0.55;

      if (flip) {
        ctx.translate(gx, gy);
        ctx.scale(-1, 1);
        ctx.drawImage(ghostSprite, -dw / 2, 0, dw, dh);
      } else {
        ctx.drawImage(ghostSprite, gx - dw / 2, gy, dw, dh);
      }

      ctx.restore();
    });

    // Main sprite
    const sprite = getSprite(this.charName, this.currentAnim, this.spriteFrame);

    ctx.save();
    if (!this.isPlayer && bossImploding) {
      const st = 0.15 + 0.85 * Math.abs(Math.sin(bgOffset * 0.55));
      const flick = bgOffset % 5 < 2 ? st * 0.35 : st;
      ctx.globalAlpha = flick;
    } else if (this.hitFlicker > 0 && this.hitFlicker % 4 < 2) {
      ctx.globalAlpha = 0.3;
    }

    if (!sprite || !sprite.complete || sprite.naturalWidth === 0) {
      ctx.fillStyle = this.isPlayer ? '#0ff' : '#f0f';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.restore();
      return;
    }

    const sw = sprite.naturalWidth;
    const sh = sprite.naturalHeight;
    const enemyScaleFix = (!this.isPlayer && this.charName === 'Enemy-Punk') ? DESTROYER_SCALE_FIX : 1;
    const scale = (!this.isPlayer && bossPhase >= 2)
      ? SPRITE_SCALE * enemyScaleFix * P2_PHASE2_SCALE
      : SPRITE_SCALE * enemyScaleFix;
    const dw = sw * scale;
    const dh = sh * scale;

    const cx = this.x + this.w / 2;
    const drawY = this.y + this.h - dh;

    const def = SPRITE_DEFS[this.charName];
    const needsFlip = this.facingRight !== def.defaultFacingRight;

    if (needsFlip) {
      ctx.translate(cx, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -dw / 2, 0, dw, dh);
      if (this.isPlayer && isP1Berserker()) {
        const pulse = 0.55 + 0.45 * Math.sin(bgOffset * 0.18);
        const pulse2 = 0.5 + 0.5 * Math.sin(bgOffset * 0.31 + 1.1);
        // Chromatic edge aura without rectangular overlays.
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,70,170,${0.28 + 0.18 * pulse2})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff2bcf';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(0, dh * 0.55, dw * 0.42, dh * 0.47, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(0,255,255,${0.22 + 0.16 * pulse2})`;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        ctx.ellipse(0, dh * 0.55, dw * 0.38, dh * 0.43, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const aura = ctx.createRadialGradient(0, dh * 0.55, 10, 0, dh * 0.55, dw * 0.78);
        aura.addColorStop(0, `rgba(255,40,190,${0.3 * pulse})`);
        aura.addColorStop(0.55, `rgba(130,0,235,${0.25 * pulse})`);
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = aura;
        ctx.fillRect(-dw * 0.9, -dh * 0.1, dw * 1.8, dh * 1.3);

        // Scanline glitch on top of sprite (no rectangle frame).
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(0,255,255,${0.15 + 0.12 * pulse})`;
        for (let i = 0; i < 5; i++) {
          const sy = 5 + ((bgOffset * 4 + i * 9) % Math.max(12, dh - 12));
          ctx.fillRect(-dw / 2 + 4, sy, dw - 8, 1);
        }

        // Ground energy ring + sparks around feet.
        const feetY = dh - 4;
        ctx.strokeStyle = `rgba(255,80,220,${0.4 + 0.35 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff2bcf';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(0, feetY, dw * (0.23 + 0.02 * pulse2), 6 + 2 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 / 6) * i + bgOffset * 0.06;
          const sx = Math.cos(a) * (dw * 0.18);
          const sy = feetY + Math.sin(a) * 4;
          const ss = 1.5 + (i % 2);
          ctx.fillStyle = i % 2 ? 'rgba(255,90,200,0.75)' : 'rgba(0,255,255,0.65)';
          ctx.fillRect(sx, sy, ss, ss);
        }
      }
    } else {
      ctx.drawImage(sprite, cx - dw / 2, drawY, dw, dh);
      if (this.isPlayer && isP1Berserker()) {
        const pulse = 0.55 + 0.45 * Math.sin(bgOffset * 0.18);
        const pulse2 = 0.5 + 0.5 * Math.sin(bgOffset * 0.31 + 1.1);
        // Chromatic edge aura without rectangular overlays.
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,70,170,${0.28 + 0.18 * pulse2})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff2bcf';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(cx, drawY + dh * 0.55, dw * 0.42, dh * 0.47, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(0,255,255,${0.22 + 0.16 * pulse2})`;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        ctx.ellipse(cx, drawY + dh * 0.55, dw * 0.38, dh * 0.43, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const aura = ctx.createRadialGradient(cx, drawY + dh * 0.55, 10, cx, drawY + dh * 0.55, dw * 0.78);
        aura.addColorStop(0, `rgba(255,40,190,${0.3 * pulse})`);
        aura.addColorStop(0.55, `rgba(130,0,235,${0.25 * pulse})`);
        aura.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = aura;
        ctx.fillRect(cx - dw * 0.9, drawY - dh * 0.1, dw * 1.8, dh * 1.3);

        // Scanline glitch on top of sprite (no rectangle frame).
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(0,255,255,${0.15 + 0.12 * pulse})`;
        for (let i = 0; i < 5; i++) {
          const sy = drawY + 5 + ((bgOffset * 4 + i * 9) % Math.max(12, dh - 12));
          ctx.fillRect(cx - dw / 2 + 4, sy, dw - 8, 1);
        }

        // Ground energy ring + sparks around feet.
        const feetY = drawY + dh - 4;
        ctx.strokeStyle = `rgba(255,80,220,${0.4 + 0.35 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff2bcf';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(cx, feetY, dw * (0.23 + 0.02 * pulse2), 6 + 2 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 / 6) * i + bgOffset * 0.06;
          const sx = cx + Math.cos(a) * (dw * 0.18);
          const sy = feetY + Math.sin(a) * 4;
          const ss = 1.5 + (i % 2);
          ctx.fillStyle = i % 2 ? 'rgba(255,90,200,0.75)' : 'rgba(0,255,255,0.65)';
          ctx.fillRect(sx, sy, ss, ss);
        }
      }
    }

    ctx.restore();
  }
}

// =============================================================================
// PROJECTILE — Energy Blast
// =============================================================================

class Projectile {
  constructor(x, y, dirRight, owner) {
    this.x = x;
    this.y = y;
    this.w = 56;
    this.h = 36;
    this.dirRight = dirRight;
    this.owner = owner;
    this.alive = true;
    this.life = 0;
    this.trail = [];
    this.exploding = false;
    this.explodeFrame = 0;
    this.explodeTick = 0;
    this.dataChars = [];
    for (let i = 0; i < 8; i++) {
      this.dataChars.push({
        char: String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)),
        offsetY: (Math.random() - 0.5) * 24,
        speed: 0.5 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.4
      });
    }
  }

  update() {
    if (this.exploding) {
      this.explodeTick++;
      if (this.explodeTick % 3 === 0) this.explodeFrame++;
      if (this.explodeFrame >= 5) this.alive = false;
      return;
    }

    this.x += this.dirRight ? SPECIAL_SPEED : -SPECIAL_SPEED;
    this.life++;

    this.trail.push({ x: this.x, y: this.y, alpha: 1 });
    if (this.trail.length > 20) this.trail.shift();
    this.trail.forEach(t => { t.alpha -= 0.05; });

    // Randomize data chars periodically
    if (this.life % 4 === 0) {
      const idx = Math.floor(Math.random() * this.dataChars.length);
      this.dataChars[idx].char = String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96));
    }

    if (this.x < -60 || this.x > W + 60) this.alive = false;
  }

  render(ctx) {
    const t = bgOffset;
    const pulse = 0.7 + 0.3 * Math.sin(t * 0.2 + this.life * 0.3);
    const isPlayer = this.owner === player;

    if (!isPlayer) {
      if (this.exploding) {
        ctx.save();
        const ip = Math.min(1, this.explodeFrame / 4);
        const r = 14 + ip * 18;
        const blast = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
        blast.addColorStop(0, `rgba(255,255,255,${0.9 - ip * 0.2})`);
        blast.addColorStop(0.35, `rgba(255,90,230,${0.75 - ip * 0.25})`);
        blast.addColorStop(1, 'rgba(120,0,255,0)');
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = blast;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(255,140,245,${0.6 - ip * 0.35})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff40dd';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * (0.7 + ip * 0.25), 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
        return;
      }

      // Phase 1 boss custom shot (cyberpunk procedural).
      const dir = this.dirRight ? 1 : -1;
      const p = 0.65 + 0.35 * Math.sin(this.life * 0.45);
      ctx.save();

      // Tail ribbon
      ctx.strokeStyle = `rgba(255,70,230,${0.45 + 0.2 * p})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff2be3';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(this.x - dir * 30, this.y + Math.sin(this.life * 0.2) * 1.6);
      ctx.lineTo(this.x - dir * 12, this.y - Math.sin(this.life * 0.32) * 2.2);
      ctx.lineTo(this.x + dir * 4, this.y);
      ctx.stroke();

      // Core orb
      const coreR = 11 + 3 * p;
      const core = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, coreR);
      core.addColorStop(0, 'rgba(255,255,255,0.95)');
      core.addColorStop(0.28, 'rgba(255,140,245,0.9)');
      core.addColorStop(0.75, 'rgba(160,30,255,0.55)');
      core.addColorStop(1, 'rgba(90,0,180,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(this.x, this.y, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Digital shards around core
      ctx.shadowBlur = 0;
      for (let i = 0; i < 6; i++) {
        const a = this.life * 0.18 + i * (Math.PI * 2 / 6);
        const sx = this.x + Math.cos(a) * (9 + 2 * p);
        const sy = this.y + Math.sin(a) * (6 + 1.5 * p);
        const ss = 1.5 + (i % 2);
        ctx.fillStyle = i % 2 ? 'rgba(255,90,220,0.8)' : 'rgba(120,255,255,0.65)';
        ctx.fillRect(sx, sy, ss, ss);
      }

      // Front highlight
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(this.x + dir * 2, this.y - 1, 3.8, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    const coreColor = isPlayer ? '#00ffff' : '#ff00ff';
    const glowColor = isPlayer ? 'rgba(0,255,255,' : 'rgba(255,0,255,';
    const trailDir = this.dirRight ? -1 : 1;

    // Digital data trail (katakana stream behind projectile)
    this.dataChars.forEach((dc, i) => {
      const dist = (i + 1) * 10 * trailDir;
      const dx = this.x + dist + Math.sin(this.life * 0.2 + i) * 2;
      const dy = this.y + dc.offsetY;
      ctx.save();
      ctx.font = '8px monospace';
      ctx.fillStyle = coreColor;
      ctx.globalAlpha = dc.alpha * (1 - i / this.dataChars.length) * 0.6;
      ctx.fillText(dc.char, dx, dy);
      ctx.restore();
    });

    // Energy trail (glow orbs)
    this.trail.forEach((tr, i) => {
      if (tr.alpha <= 0) return;
      const trSize = 18 * (tr.alpha * 0.6 + 0.4);
      ctx.save();
      ctx.globalAlpha = tr.alpha * 0.35;
      const g = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, trSize);
      g.addColorStop(0, glowColor + '0.6)');
      g.addColorStop(0.5, glowColor + '0.2)');
      g.addColorStop(1, glowColor + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, trSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Small digital sparks along trail
      if (i % 3 === 0 && tr.alpha > 0.3) {
        ctx.save();
        ctx.fillStyle = coreColor;
        ctx.globalAlpha = tr.alpha * 0.5;
        const sx = tr.x + (Math.random() - 0.5) * 12;
        const sy = tr.y + (Math.random() - 0.5) * 12;
        ctx.fillRect(sx, sy, 2, 2);
        ctx.restore();
      }
    });

    // Connecting line (energy beam)
    if (this.trail.length > 2) {
      const tail = this.trail[0];
      ctx.save();
      ctx.strokeStyle = coreColor;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 3;
      ctx.shadowColor = coreColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();

    // Outer glow (large)
    const outerR = 55 * pulse;
    const outerGlow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, outerR);
    outerGlow.addColorStop(0, glowColor + '0.4)');
    outerGlow.addColorStop(0.4, glowColor + '0.15)');
    outerGlow.addColorStop(1, glowColor + '0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Ring around core
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.life * 0.4);
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 26 * pulse, 17 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Core white (big)
    ctx.globalAlpha = 1;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 30 * pulse;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 20 * pulse, 13 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    // Core color
    ctx.shadowBlur = 20;
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright spot
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.beginPath();
    ctx.ellipse(this.x - 3, this.y - 2, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }
}

// =============================================================================
// P1 GROUND WAVE — Down + Punch power
// =============================================================================

class GroundWave {
  constructor(x, owner, dirRight = true) {
    this.x = x;
    this.y = GROUND_Y;
    this.owner = owner;
    this.dirRight = dirRight;
    this.alive = true;
    this.life = 0;
    this.maxLife = 140;
    this.w = 62;
    this.h = 0;
    this.hitDone = false;
    this.shards = Array.from({ length: 12 }, (_, i) => ({
      phase: Math.random() * Math.PI * 2 + i * 0.55,
      amp: 3 + Math.random() * 7,
      dx: (Math.random() - 0.5) * 28
    }));
  }

  update() {
    this.life++;
    this.x += this.dirRight ? GROUND_WAVE_SPEED : -GROUND_WAVE_SPEED;
    // Column rises from the ground until near the top of screen.
    const rise = Math.min(1, this.life / 32);
    this.h = Math.max(26, (GROUND_Y - 24) * rise);

    if (this.x < -90 || this.x > W + 90 || this.life > this.maxLife) this.alive = false;
  }

  getBox() {
    return { x: this.x - this.w / 2, y: GROUND_Y - this.h, w: this.w, h: this.h };
  }

  render(ctx) {
    const pulse = 0.66 + 0.34 * Math.sin(this.life * 0.32);
    const alpha = Math.max(0, 1 - this.life / this.maxLife);
    const headX = this.x;
    const trailDir = this.dirRight ? -1 : 1;
    const topY = GROUND_Y - this.h;

    ctx.save();

    // Ground glow trail
    for (let i = 0; i < 8; i++) {
      const tx = headX + trailDir * i * 14;
      const ta = alpha * (1 - i / 8) * 0.3;
      const g = ctx.createRadialGradient(tx, GROUND_Y - 2, 0, tx, GROUND_Y - 2, 18 + i * 2);
      g.addColorStop(0, `rgba(190,70,255,${ta * 1.2})`);
      g.addColorStop(0.5, `rgba(135,40,235,${ta})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tx, GROUND_Y - 2, 20 + i * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main vertical wave column (similar to boss phase 2 wave)
    const colGrad = ctx.createLinearGradient(headX, GROUND_Y, headX, topY);
    colGrad.addColorStop(0, `rgba(170,50,255,${0.65 * alpha})`);
    colGrad.addColorStop(0.45, `rgba(215,120,255,${0.38 * alpha})`);
    colGrad.addColorStop(1, 'rgba(130,0,255,0)');
    ctx.fillStyle = colGrad;
    ctx.fillRect(headX - this.w / 2, topY, this.w, this.h);

    ctx.shadowColor = '#a200ff';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = `rgba(228,150,255,${0.55 * alpha})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(headX - this.w / 2, GROUND_Y);
    ctx.lineTo(headX - this.w / 2, topY);
    ctx.lineTo(headX + this.w / 2, topY);
    ctx.lineTo(headX + this.w / 2, GROUND_Y);
    ctx.stroke();

    // Inner wave ribbons
    ctx.strokeStyle = `rgba(255,180,255,${0.4 * alpha})`;
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 3; r++) {
      const ox = (r - 1) * 9;
      ctx.beginPath();
      for (let i = 0; i <= 11; i++) {
        const tt = i / 11;
        const ry = GROUND_Y - this.h * tt;
        const rx = headX + ox + Math.sin(this.life * 0.25 + tt * 8 + r) * (4 + pulse * 2);
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.stroke();
    }

    // Glitch shards
    ctx.shadowBlur = 0;
    this.shards.forEach((s, i) => {
      const t = (i % 8) / 8;
      const sx = headX + s.dx * (0.55 + pulse * 0.4);
      const sy = GROUND_Y - this.h * t - Math.sin(this.life * 0.22 + s.phase) * s.amp;
      const sz = 2 + (i % 4);
      ctx.fillStyle = i % 2 === 0
        ? `rgba(242,160,255,${0.45 * alpha})`
        : `rgba(180,255,255,${0.36 * alpha})`;
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    });

    // Crest flash at top
    const crestR = 10 + pulse * 4;
    const crest = ctx.createRadialGradient(headX, topY, 0, headX, topY, crestR);
    crest.addColorStop(0, `rgba(255,255,255,${0.85 * alpha})`);
    crest.addColorStop(0.35, `rgba(240,130,255,${0.7 * alpha})`);
    crest.addColorStop(1, 'rgba(150,0,255,0)');
    ctx.fillStyle = crest;
    ctx.beginPath();
    ctx.arc(headX, topY, crestR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// =============================================================================
// ENERGY FIELD — Burst Push
// =============================================================================

class EnergyField {
  constructor(cx, cy, owner) {
    this.cx = cx;
    this.cy = cy;
    this.owner = owner;
    this.radius = 0;
    this.maxRadius = BURST_RADIUS;
    this.life = 0;
    this.maxLife = 30;
    this.alive = true;
    this.hitDone = false;
    this.sparks = [];
    this.hexagons = [];
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i + Math.random() * 0.3;
      this.sparks.push({
        angle,
        dist: 0,
        speed: 3 + Math.random() * 4,
        size: 2 + Math.random() * 3,
        alpha: 1,
        char: String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96))
      });
    }
    for (let i = 0; i < 6; i++) {
      this.hexagons.push({
        angle: (Math.PI * 2 / 6) * i,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        scale: 0.5 + Math.random() * 0.5
      });
    }
  }

  update() {
    this.life++;
    const t = this.life / this.maxLife;
    this.radius = this.maxRadius * Math.min(1, t * 2.5);

    this.sparks.forEach(s => {
      s.dist += s.speed;
      s.alpha = Math.max(0, 1 - t);
    });
    this.hexagons.forEach(h => {
      h.angle += h.rotSpeed;
    });

    if (!this.hitDone && this.radius > 30) {
      const target = this.owner === player ? enemy : player;
      if (target) {
        const dx = (target.x + target.w / 2) - this.cx;
        const dy = (target.y + target.h / 2) - this.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.radius + 30) {
          const burstDmg = this.owner === player ? scaleP1Damage(BURST_DAMAGE) : BURST_DAMAGE;
          target.takeHit(burstDmg);
          if (this.owner === player) superMeter = Math.min(SUPER_MAX, superMeter + 10);
          const pushDir = dx > 0 ? 1 : -1;
          target.x += pushDir * BURST_KNOCKBACK * 6;
          target.vy = -6;
          if (target.x < 10) target.x = 10;
          if (target.x > W - target.w - 10) target.x = W - target.w - 10;
          this.hitDone = true;
        }
      }
    }

    if (this.life >= this.maxLife) this.alive = false;
  }

  render(ctx) {
    const t = this.life / this.maxLife;
    const alpha = Math.max(0, 1 - t * 0.8);
    const pulse = 0.8 + 0.2 * Math.sin(this.life * 0.8);

    ctx.save();

    // Shockwave ring (outer)
    const ringAlpha = alpha * 0.5;
    ctx.strokeStyle = `rgba(0,255,255,${ringAlpha})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Second ring
    ctx.strokeStyle = `rgba(255,0,255,${ringAlpha * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#f0f';
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius * 0.75, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow fill
    const grad = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.radius);
    grad.addColorStop(0, `rgba(0,255,255,${alpha * 0.25 * pulse})`);
    grad.addColorStop(0.4, `rgba(100,200,255,${alpha * 0.12})`);
    grad.addColorStop(0.7, `rgba(255,0,255,${alpha * 0.06})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Hexagonal grid pattern
    ctx.shadowBlur = 0;
    this.hexagons.forEach(h => {
      const hx = this.cx + Math.cos(h.angle) * this.radius * 0.5;
      const hy = this.cy + Math.sin(h.angle) * this.radius * 0.5;
      const s = 10 * h.scale * pulse;
      ctx.strokeStyle = `rgba(0,255,255,${alpha * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i + h.angle;
        const px = hx + Math.cos(a) * s;
        const py = hy + Math.sin(a) * s;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    });

    // Energy sparks with data chars
    this.sparks.forEach(s => {
      if (s.alpha <= 0) return;
      const sx = this.cx + Math.cos(s.angle) * s.dist;
      const sy = this.cy + Math.sin(s.angle) * s.dist;

      ctx.fillStyle = `rgba(0,255,255,${s.alpha * 0.8})`;
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 6;
      ctx.fillRect(sx - s.size / 2, sy - s.size / 2, s.size, s.size);

      ctx.shadowBlur = 0;
      ctx.font = '7px monospace';
      ctx.fillStyle = `rgba(0,255,255,${s.alpha * 0.5})`;
      ctx.fillText(s.char, sx + 4, sy - 2);
    });

    // Center flash
    if (t < 0.3) {
      const flashAlpha = (1 - t / 0.3) * 0.6;
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, 15 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }

    // Glitch lines radiating outward
    if (t < 0.6) {
      ctx.strokeStyle = `rgba(0,255,255,${alpha * 0.4})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 / 8) * i + this.life * 0.1;
        const r1 = this.radius * 0.3;
        const r2 = this.radius * (0.7 + Math.random() * 0.3);
        ctx.beginPath();
        ctx.moveTo(this.cx + Math.cos(a) * r1, this.cy + Math.sin(a) * r1);
        ctx.lineTo(this.cx + Math.cos(a) * r2, this.cy + Math.sin(a) * r2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

// =============================================================================
// BOSS TRAP — Ground hazards (Phase 2)
// =============================================================================

class BossTrap {
  constructor(x) {
    this.x = x;
    this.y = GROUND_Y;
    this.w = 70;
    this.h = 22;
    this.life = 0;
    this.maxLife = TRAP_LIFETIME;
    this.alive = true;
    this.activated = false;
    this.spawnDone = false;
    this.pulseOffset = Math.random() * Math.PI * 2;
    this.glitchChars = Array.from({ length: 8 }, () =>
      String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96))
    );
    this.sparks = [];
  }

  update() {
    this.life++;

    if (this.life > 15) this.spawnDone = true;

    // Randomize chars
    if (this.life % 8 === 0) {
      const idx = Math.floor(Math.random() * this.glitchChars.length);
      this.glitchChars[idx] = String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96));
    }

    // Check collision with player
    if (this.spawnDone && !this.activated && player && player.stunTimer <= 0) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h;
      if (px > this.x - this.w / 2 && px < this.x + this.w / 2 && py >= GROUND_Y - 5) {
        this.activated = true;
        player.stunTimer = TRAP_STUN_DURATION;
        player.takeHit(TRAP_DAMAGE);
        sndTrap();
        for (let i = 0; i < 18; i++) {
          this.sparks.push({
            x: this.x + (Math.random() - 0.5) * this.w,
            y: this.y - Math.random() * 30,
            vx: (Math.random() - 0.5) * 6,
            vy: -2 - Math.random() * 6,
            life: 20 + Math.random() * 20,
            size: 1.5 + Math.random() * 3
          });
        }
      }
    }

    // Update sparks
    this.sparks.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.15;
      s.life--;
    });
    this.sparks = this.sparks.filter(s => s.life > 0);

    if (this.activated && this.sparks.length === 0) this.alive = false;
    if (this.life >= this.maxLife) this.alive = false;
  }

  render(ctx) {
    const t = this.life;
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.12 + this.pulseOffset);
    const spawnAlpha = this.spawnDone ? 1 : t / 15;
    const fadeOut = this.activated ? Math.max(0, 1 - (t - this.life) * 0.1) : 1;
    const dying = this.life > this.maxLife - 40;
    const dyingAlpha = dying ? (this.maxLife - this.life) / 40 : 1;
    const alpha = spawnAlpha * fadeOut * dyingAlpha;

    if (alpha <= 0 && this.sparks.length === 0) return;

    const cx = this.x;
    const cy = this.y;

    ctx.save();

    if (!this.activated) {
      // Warning glow on ground
      const glowR = this.w * 0.85;
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glowGrad.addColorStop(0, `rgba(255,0,80,${0.25 * pulse * alpha})`);
      glowGrad.addColorStop(0.4, `rgba(255,0,80,${0.12 * alpha})`);
      glowGrad.addColorStop(0.7, `rgba(255,0,60,${0.05 * alpha})`);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Main electric line on ground
      ctx.strokeStyle = `rgba(255,0,100,${0.6 * pulse * alpha})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff0066';
      ctx.shadowBlur = 14 * pulse;
      ctx.beginPath();
      ctx.moveTo(cx - this.w / 2, cy);
      ctx.lineTo(cx + this.w / 2, cy);
      ctx.stroke();

      // Double zigzag electricity
      for (let row = 0; row < 2; row++) {
        ctx.strokeStyle = `rgba(255,${80 + row * 80},${180 + row * 40},${(0.5 + row * 0.15) * pulse * alpha})`;
        ctx.lineWidth = 1.5 - row * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - this.w / 2, cy);
        for (let i = 1; i <= 12; i++) {
          const lx = cx - this.w / 2 + (this.w / 12) * i;
          const amp = (6 + row * 3) * pulse * (Math.random() * 0.5 + 0.5);
          const ly = cy + (i % 2 === 0 ? -amp : amp);
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }

      // Vertical energy pillars
      ctx.strokeStyle = `rgba(255,0,120,${0.2 * pulse * alpha})`;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 6;
      for (let i = 0; i < 3; i++) {
        const px = cx - this.w / 3 + (this.w / 3) * i + Math.sin(t * 0.1 + i) * 3;
        const ph = 15 + Math.sin(t * 0.2 + i * 2) * 8;
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px, cy - ph);
        ctx.stroke();
      }

      // Danger symbols / data chars
      ctx.shadowBlur = 0;
      ctx.font = '8px monospace';
      ctx.fillStyle = `rgba(255,0,100,${0.45 * alpha})`;
      this.glitchChars.forEach((ch, i) => {
        const gx = cx - this.w / 2 + 4 + i * 9;
        const gy = cy - 10 - Math.sin(t * 0.15 + i) * 3;
        ctx.fillText(ch, gx, gy);
      });

      // Hazard warning symbol
      if (t % 30 < 15) {
        ctx.font = `bold 10px ${HUD_FONT}`;
        ctx.fillStyle = `rgba(255,0,80,${0.5 * pulse * alpha})`;
        ctx.textAlign = 'center';
        ctx.fillText('⚠', cx, cy - 18);
        ctx.textAlign = 'left';
      }

      // Helper label for P1: subtle cyberpunk glitch text above trap
      const labelY = cy - 28 - Math.sin(t * 0.1) * 1.5;
      const jitterX = (Math.random() - 0.5) * 1.2;
      const textAlpha = 0.58 * alpha;
      ctx.textAlign = 'center';
      ctx.font = `bold 9px ${HUD_FONT}`;
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(0,255,255,${textAlpha * 0.5})`;
      ctx.fillText('ARMADILHA', cx - 1 + jitterX, labelY + 0.4);
      ctx.fillStyle = `rgba(255,0,170,${textAlpha * 0.45})`;
      ctx.fillText('ARMADILHA', cx + 1 + jitterX, labelY - 0.4);
      ctx.fillStyle = `rgba(255,90,170,${textAlpha})`;
      ctx.fillText('ARMADILHA', cx + jitterX, labelY);
      ctx.textAlign = 'left';

      // Corner marks
      const hw = this.w / 2;
      ctx.strokeStyle = `rgba(255,0,100,${0.4 * alpha})`;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      // Left corner
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy + 2);
      ctx.lineTo(cx - hw, cy - 6);
      ctx.lineTo(cx - hw + 5, cy - 6);
      ctx.stroke();
      // Right corner
      ctx.beginPath();
      ctx.moveTo(cx + hw, cy + 2);
      ctx.lineTo(cx + hw, cy - 6);
      ctx.lineTo(cx + hw - 5, cy - 6);
      ctx.stroke();

      // Pulsing ring when about to disappear
      if (dying) {
        ctx.strokeStyle = `rgba(255,0,100,${0.3 * pulse * dyingAlpha})`;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, this.w / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Activation sparks
    this.sparks.forEach(s => {
      ctx.fillStyle = `rgba(255,${50 + Math.random() * 100},${150 + Math.random() * 105},${Math.min(1, s.life / 8)})`;
      ctx.shadowColor = '#ff0066';
      ctx.shadowBlur = 4;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    });

    ctx.restore();
  }
}

// =============================================================================
// BOSS POWERS (Phase 2)
// =============================================================================

class BossProjectile {
  constructor(x, y, dirRight) {
    this.x = x;
    this.y = y;
    this.dirRight = dirRight;
    this.alive = true;
    this.life = 0;
    this.trail = [];
    this.w = 72;
    this.h = 44;
    this.hitDone = false;
    triggerBossCinematic('spawn', 0.9);
  }

  update() {
    this.x += this.dirRight ? BOSS_PROJ_SPEED : -BOSS_PROJ_SPEED;
    this.life++;
    this.trail.push({ x: this.x, y: this.y, alpha: 1 });
    if (this.trail.length > 18) this.trail.shift();
    this.trail.forEach(t => { t.alpha -= 0.055; });

    if (!this.hitDone && player) {
      const dx = Math.abs((player.x + player.w / 2) - this.x);
      const dy = Math.abs((player.y + player.h / 2) - this.y);
      if (dx < 40 && dy < 32) {
        player.takeHit(BOSS_PROJ_DAMAGE);
        this.hitDone = true;
        this.alive = false;
        triggerBossCinematic('impact', 1.1);
      }
    }
    if (this.x < -60 || this.x > W + 60) this.alive = false;
  }

  render(ctx) {
    const pulse = 0.7 + 0.3 * Math.sin(this.life * 0.3);

    this.trail.forEach(tr => {
      if (tr.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = tr.alpha * 0.3;
      const g = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 24);
      g.addColorStop(0, 'rgba(255,0,255,0.5)');
      g.addColorStop(1, 'rgba(255,0,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    const outerR = 66 * pulse;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, outerR);
    g.addColorStop(0, `rgba(255,0,255,${0.35 * pulse})`);
    g.addColorStop(0.5, 'rgba(255,0,200,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, outerR, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 32 * pulse;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 24 * pulse, 15 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

class BossGroundWave {
  constructor(startX, dirRight) {
    this.x = startX;
    this.dirRight = dirRight;
    this.alive = true;
    this.life = 0;
    this.speed = 5.4;
    this.w = 84;
    this.h = 86;
    this.hitPlayers = new Set();
    this.sparks = [];
    triggerBossCinematic('spawn', 1.15);
  }

  update() {
    this.x += this.dirRight ? this.speed : -this.speed;
    this.life++;

    if (this.life % 2 === 0) {
      this.sparks.push({
        x: this.x + (Math.random() - 0.5) * this.w,
        y: GROUND_Y - Math.random() * this.h,
        vy: -1 - Math.random() * 2,
        life: 10 + Math.random() * 10,
        size: 1 + Math.random() * 2
      });
    }
    this.sparks.forEach(s => { s.y += s.vy; s.life--; });
    this.sparks = this.sparks.filter(s => s.life > 0);

    if (player && !this.hitPlayers.has('p1')) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h;
      if (Math.abs(px - this.x) < this.w * 0.58 && py >= GROUND_Y - 14) {
        player.takeHit(BOSS_WAVE_DAMAGE);
        player.vy = -8;
        this.hitPlayers.add('p1');
        triggerBossCinematic('impact', 1.3);
      }
    }

    if (this.x < -80 || this.x > W + 80) this.alive = false;
  }

  render(ctx) {
    const pulse = 0.7 + 0.3 * Math.sin(this.life * 0.4);
    const waveH = this.h * pulse;

    ctx.save();

    // Ground energy column
    const grad = ctx.createLinearGradient(this.x, GROUND_Y, this.x, GROUND_Y - waveH);
    grad.addColorStop(0, `rgba(255,0,180,0.72)`);
    grad.addColorStop(0.5, `rgba(255,0,255,0.35)`);
    grad.addColorStop(1, 'rgba(255,0,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(this.x - this.w / 2, GROUND_Y - waveH, this.w, waveH);

    // Glow
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = `rgba(255,0,255,${0.6 * pulse})`;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(this.x - this.w / 2, GROUND_Y);
    ctx.lineTo(this.x - this.w / 2, GROUND_Y - waveH);
    ctx.lineTo(this.x + this.w / 2, GROUND_Y - waveH);
    ctx.lineTo(this.x + this.w / 2, GROUND_Y);
    ctx.stroke();

    // Base flash
    ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255,100,255,${0.55 * pulse})`;
    ctx.fillRect(this.x - this.w / 2 - 8, GROUND_Y - 4, this.w + 16, 4);

    // Sparks
    ctx.shadowBlur = 4;
    this.sparks.forEach(s => {
      ctx.fillStyle = `rgba(255,${150 + Math.random() * 100},255,${Math.min(1, s.life / 6)})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    });

    ctx.restore();
  }
}

class BossEnergyRain {
  constructor() {
    this.alive = true;
    this.life = 0;
    this.maxLife = 90;
    this.drops = [];
    this.impacts = [];
    triggerBossCinematic('spawn', 1.2);
    const numDrops = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numDrops; i++) {
      this.drops.push({
        x: 40 + Math.random() * (W - 80),
        y: -20 - Math.random() * 60,
        targetY: GROUND_Y,
        speed: 4.6 + Math.random() * 3.2,
        hit: false,
        radius: 36 + Math.random() * 20,
        delay: i * 6
      });
    }
  }

  update() {
    this.life++;

    this.drops.forEach(d => {
      if (this.life < d.delay) return;
      if (d.hit) return;
      d.y += d.speed;
      if (d.y >= d.targetY) {
        d.y = d.targetY;
        d.hit = true;
        this.impacts.push({
          x: d.x, radius: 0, maxRadius: d.radius,
          alpha: 0.8, life: 20
        });
        if (player) {
          const dx = Math.abs((player.x + player.w / 2) - d.x);
          if (dx < d.radius && player.y + player.h >= GROUND_Y - 10) {
            player.takeHit(BOSS_RAIN_DAMAGE);
            triggerBossCinematic('impact', 1.25);
          }
        }
      }
    });

    this.impacts.forEach(imp => {
      imp.radius = Math.min(imp.maxRadius, imp.radius + imp.maxRadius / 6);
      imp.alpha *= 0.9;
      imp.life--;
    });
    this.impacts = this.impacts.filter(imp => imp.life > 0);

    if (this.life >= this.maxLife && this.impacts.length === 0) this.alive = false;
  }

  render(ctx) {
    ctx.save();

    // Warning markers on ground before drops hit
    this.drops.forEach(d => {
      if (this.life < d.delay || d.hit) return;
      const progress = Math.min(1, (d.targetY - d.y) / 200);
      ctx.strokeStyle = `rgba(255,0,100,${0.3 + 0.3 * (1 - progress)})`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(d.x, GROUND_Y, d.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Falling energy bolts
    this.drops.forEach(d => {
      if (this.life < d.delay || d.hit) return;
      const boltH = 30;
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#ff80ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - boltH);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - boltH);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();

      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 18);
      g.addColorStop(0, 'rgba(255,0,255,0.4)');
      g.addColorStop(1, 'rgba(255,0,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 18, 0, Math.PI * 2);
      ctx.fill();
    });

    // Impact explosions
    this.impacts.forEach(imp => {
      ctx.shadowColor = '#ff0066';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(255,0,150,${imp.alpha})`;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(imp.x, GROUND_Y, imp.radius, 0, Math.PI * 2);
      ctx.stroke();

      const ig = ctx.createRadialGradient(imp.x, GROUND_Y, 0, imp.x, GROUND_Y, imp.radius);
      ig.addColorStop(0, `rgba(255,0,180,${imp.alpha * 0.3})`);
      ig.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.arc(imp.x, GROUND_Y, imp.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }
}

function sndBossShoot() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(250, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.25);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
  o.start(t); o.stop(t + 0.25);
}

function sndBossWave() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(100, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
  o.start(t); o.stop(t + 0.4);
}

function sndBossRain() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
  o1.type = 'sine';
  o1.frequency.setValueAtTime(500, t);
  o1.frequency.exponentialRampToValueAtTime(150, t + 0.5);
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(700, t);
  o2.frequency.exponentialRampToValueAtTime(200, t + 0.5);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
  o1.start(t); o2.start(t);
  o1.stop(t + 0.5); o2.stop(t + 0.5);
}

// =============================================================================
// P1 SUPER — Overclock Nova (full-screen cyberpunk strike)
// =============================================================================

function sndP1SuperCharge() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(200, t + 0.4);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
  o.start(t);
  o.stop(t + 0.4);
}

function sndP1SuperImpact() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'square';
    o.frequency.setValueAtTime(120 + i * 40, t + i * 0.05);
    o.frequency.exponentialRampToValueAtTime(40, t + i * 0.05 + 0.35);
    g.gain.setValueAtTime(0.1, t + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.05 + 0.35);
    o.start(t + i * 0.05);
    o.stop(t + i * 0.05 + 0.35);
  }
  const noise = audioCtx.createOscillator();
  const ng = audioCtx.createGain();
  noise.connect(ng);
  ng.connect(audioCtx.destination);
  noise.type = 'sawtooth';
  noise.frequency.setValueAtTime(400, t);
  noise.frequency.exponentialRampToValueAtTime(50, t + 0.5);
  ng.gain.setValueAtTime(0.08, t);
  ng.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
  noise.start(t);
  noise.stop(t + 0.5);
}

function tryFireP1Super() {
  if (superMeter < SUPER_MAX || p1SuperFx) return false;
  superMeter = 0;
  p1SuperFx = {
    t: 0,
    max: P1_SUPER_MAX_DURATION,
    dealt: false,
    bolts: [],
    particles: [],
    rings: [],
    glitchBars: []
  };
  for (let i = 0; i < 24; i++) {
    p1SuperFx.bolts.push({
      x: Math.random() * W,
      y: -20 - Math.random() * 200,
      len: 40 + Math.random() * 120,
      speed: 12 + Math.random() * 16,
      phase: Math.random() * Math.PI * 2,
      w: 2 + Math.random() * 3
    });
  }
  for (let i = 0; i < 60; i++) {
    p1SuperFx.particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 30 + Math.random() * 80,
      size: 1 + Math.random() * 2
    });
  }
  for (let i = 0; i < 5; i++) {
    p1SuperFx.rings.push({ r: 0, maxR: 200 + i * 40, alpha: 0.6 - i * 0.1, slow: 0.02 + i * 0.01 });
  }
  sndP1SuperCharge();
  return true;
}

function updateP1Super() {
  if (!p1SuperFx) return false;
  const fx = p1SuperFx;
  fx.t++;
  bgOffset += 3;

  fx.bolts.forEach(b => {
    b.y += b.speed;
    b.x += Math.sin(fx.t * 0.1 + b.phase) * 2;
    if (b.y > H + 50) b.y = -100 - Math.random() * 200;
  });

  fx.particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
  });
  fx.particles = fx.particles.filter(p => p.life > 0);

  if (fx.t % 4 === 0) {
    fx.glitchBars.push({
      y: Math.random() * H,
      h: 3 + Math.random() * 20,
      dx: (Math.random() - 0.5) * 30,
      life: 8 + Math.random() * 8,
      col: Math.random() < 0.5 ? '#ff00aa' : '#00ffff'
    });
  }
  fx.glitchBars.forEach(g => { g.life--; });
  fx.glitchBars = fx.glitchBars.filter(g => g.life > 0);

  fx.rings.forEach(r => {
    r.r = Math.min(r.maxR, r.r + 14 + fx.t * 0.3);
  });

  if (!fx.dealt && fx.t === 50 && player && enemy) {
    const pcx = player.x + player.w / 2;
    const ecx = enemy.x + enemy.w / 2;
    if (Math.abs(ecx - pcx) <= P1_SUPER_AOE_RADIUS) {
      const raw = Math.floor(enemy.maxHealth * P1_SUPER_HP_FRACTION) + P1_SUPER_FLAT;
      const dmg = Math.min(95, Math.max(40, scaleP1Damage(raw)));
      enemy.takeHit(dmg);
      sndP1SuperImpact();
    }
    fx.dealt = true;
  }

  if (fx.t >= fx.max) p1SuperFx = null;
  return true;
}

function renderP1Super(ctx) {
  if (!p1SuperFx) return;
  const fx = p1SuperFx;
  const t = fx.t;
  const prog = t / fx.max;
  const pcx = player ? player.x + player.w / 2 : W / 2;
  const pcy = player ? player.y + player.h / 2 : H / 2;

  const shake = t > 45 && t < 85 ? (Math.random() - 0.5) * (6 * (1 - Math.abs(t - 65) / 20)) : 0;
  const sy = shake;
  ctx.save();
  ctx.translate(shake, sy);

  // Dark veil
  ctx.fillStyle = `rgba(0,5,25,${0.35 + 0.25 * Math.sin(t * 0.08)})`;
  ctx.fillRect(0, 0, W, H);

  // Expanding rings from player
  fx.rings.forEach((r, i) => {
    ctx.strokeStyle = `rgba(0,255,255,${r.alpha * (1 - prog) * 0.5})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(pcx, pcy, Math.min(r.r, r.maxR), 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.shadowBlur = 0;

  // Huge AOE preview (faint)
  if (t < 55) {
    const aoeA = 0.15 + 0.1 * Math.sin(t * 0.2);
    ctx.strokeStyle = `rgba(255,0,200,${aoeA})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(pcx, pcy, P1_SUPER_AOE_RADIUS * (0.3 + (t / 55) * 0.7), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Lightning bolts
  fx.bolts.forEach(b => {
    ctx.strokeStyle = `rgba(0,255,255,${0.4 + 0.3 * Math.sin(t * 0.3 + b.phase)})`;
    ctx.lineWidth = b.w;
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    let ly = b.y;
    for (let s = 0; s < 8; s++) {
      ly += b.len / 8;
      const jx = b.x + (Math.random() - 0.5) * 25;
      ctx.lineTo(jx, ly);
    }
    ctx.stroke();
  });
  ctx.shadowBlur = 0;

  // Glitch bars
  fx.glitchBars.forEach(g => {
    ctx.globalAlpha = g.life / 12;
    ctx.fillStyle = g.col;
    ctx.fillRect(g.dx, g.y, W, g.h);
  });
  ctx.globalAlpha = 1;

  // Particles
  fx.particles.forEach(p => {
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = Math.random() < 0.5 ? '#0ff' : '#f0f';
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  // Hex grid fragment
  if (t > 20) {
    ctx.strokeStyle = `rgba(0,255,200,${0.15 * (1 - prog * 0.5)})`;
    ctx.lineWidth = 0.5;
    const gs = 40;
    for (let gx = 0; gx < W + gs; gx += gs) {
      for (let gy = 0; gy < H + gs; gy += gs) {
        const ox = (gx + t * 2) % (gs * 2);
        ctx.strokeRect(ox + shake, gy, gs * 0.9, gs * 0.9);
      }
    }
  }

  // Center flash on impact frame
  if (t >= 48 && t <= 58) {
    const flash = 1 - Math.abs(t - 53) / 5;
    ctx.fillStyle = `rgba(255,255,255,${0.5 * flash})`;
    ctx.fillRect(0, 0, W, H);
    const ringGrad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, P1_SUPER_AOE_RADIUS);
    ringGrad.addColorStop(0, `rgba(0,255,255,${0.45 * flash})`);
    ringGrad.addColorStop(0.4, `rgba(255,0,255,${0.2 * flash})`);
    ringGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(pcx, pcy, P1_SUPER_AOE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = 70 + Math.sin(t * 0.08) * 3;
  ctx.font = `bold 22px ${HUD_FONT}`;
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#ff0088';
  ctx.fillText('OVERCLOCK NOVA', W / 2 - 2 + shake, titleY);
  ctx.fillStyle = '#00ffff';
  ctx.fillText('OVERCLOCK NOVA', W / 2 + 2 + shake, titleY);
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 0.2);
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fff';
  ctx.fillText('OVERCLOCK NOVA', W / 2 + shake, titleY);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  ctx.font = `8px ${HUD_FONT}`;
  ctx.fillStyle = 'rgba(0,255,255,0.5)';
  ctx.fillText('[ SYSTEM LIMITER — DISABLED ]', W / 2 + shake, titleY + 22);

  // Scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);

  ctx.restore();
}

// =============================================================================
// COLLISION DETECTION
// =============================================================================

function checkCollision(box1, box2) {
  return (
    box1.x < box2.x + box2.w &&
    box1.x + box1.w > box2.x &&
    box1.y < box2.y + box2.h &&
    box1.y + box1.h > box2.y
  );
}

function checkHit(attacker, defender) {
  if (!attacker.attacking) return false;
  if (attacker.hitLanded) return false;
  if (attacker.attackFrame < 3 || attacker.attackFrame > 8) return false;
  
  const attackBox = attacker.attackBox;
  const defenderBox = { x: defender.x, y: defender.y, w: defender.w, h: defender.h };
  
  if (checkCollision(attackBox, defenderBox)) {
    attacker.hitLanded = true;
    return true;
  }
  return false;
}

// =============================================================================
// ENEMY AI
// =============================================================================

let aiState = 'chase';
let aiStateTimer = 0;
let aiComboCount = 0;
let aiDodgeCooldown = 0;
let aiBlockTimer = 0;
let aiFeintTimer = 0;
let aiPunishWindow = 0;
let aiLastPlayerHP = 100;
let aiPatternMemory = [];
let aiPreferredRange = 80;

function updateEnemyAI(dt) {
  if (!enemy || state !== 'playing') return;

  const prevVx = enemy.vx;
  enemy.vx = 0;

  const distX = player.x - enemy.x;
  const absDist = Math.abs(distX);
  const dirToPlayer = distX > 0 ? 1 : -1;
  const healthPct = enemy.health / enemy.maxHealth;
  const playerHealthPct = player.health / player.maxHealth;
  const aiSpeed = bossPhase >= 2 ? P2_PHASE2_SPEED : AI_SPEED;
  const atkDmg = bossPhase >= 2 ? P2_PHASE2_DAMAGE : P2_ATTACK_DAMAGE;

  // Track player attack patterns for adaptation
  if (player.attacking && aiPatternMemory.length < 50) {
    aiPatternMemory.push({ dist: absDist, time: bgOffset });
  }

  // Detect if player just attacked and missed (punish window)
  if (player.attacking && absDist > 100) {
    aiPunishWindow = 30;
  }
  if (aiPunishWindow > 0) aiPunishWindow--;
  if (aiDodgeCooldown > 0) aiDodgeCooldown--;
  if (aiFeintTimer > 0) aiFeintTimer--;

  // Determine preferred fighting range based on health and phase
  if (bossPhase >= 2) {
    aiPreferredRange = healthPct > 0.5 ? 130 : healthPct > 0.25 ? 110 : 90;
  } else {
    // Phase 1: keep more mid-range spacing; don't glue to P1.
    aiPreferredRange = healthPct > 0.6 ? 140 : healthPct > 0.3 ? 125 : 105;
  }

  // State machine transitions
  aiStateTimer--;
  if (aiStateTimer <= 0) {
    const roll = Math.random();

    if (bossPhase >= 2) {
      // Phase 2: more varied movement, less sticking to player
      if (aiPunishWindow > 0) {
        aiState = 'punish';
        aiStateTimer = 20 + Math.random() * 10;
      } else if (healthPct < 0.25) {
        aiState = roll < 0.35 ? 'aggressive' : roll < 0.55 ? 'retreat' : roll < 0.75 ? 'circle' : 'bait';
        aiStateTimer = 30 + Math.random() * 25;
      } else if (absDist < 80) {
        aiState = roll < 0.35 ? 'retreat' : roll < 0.55 ? 'circle' : roll < 0.75 ? 'bait' : 'aggressive';
        aiStateTimer = 30 + Math.random() * 35;
      } else if (absDist > 200) {
        aiState = roll < 0.5 ? 'chase' : roll < 0.75 ? 'aggressive' : 'circle';
        aiStateTimer = 40 + Math.random() * 30;
      } else {
        aiState = roll < 0.2 ? 'chase' : roll < 0.4 ? 'circle' : roll < 0.6 ? 'bait' : roll < 0.8 ? 'retreat' : 'aggressive';
        aiStateTimer = 35 + Math.random() * 40;
      }
    } else {
      if (aiPunishWindow > 0) {
        aiState = 'punish';
        aiStateTimer = 25 + Math.random() * 15;
      } else if (healthPct < 0.2) {
        aiState = roll < 0.5 ? 'aggressive' : roll < 0.75 ? 'retreat' : 'bait';
        aiStateTimer = 40 + Math.random() * 30;
      } else if (healthPct < 0.5) {
        aiState = roll < 0.3 ? 'aggressive' : roll < 0.5 ? 'circle' : roll < 0.7 ? 'bait' : 'chase';
        aiStateTimer = 50 + Math.random() * 60;
      } else if (playerHealthPct < 0.4) {
        aiState = roll < 0.6 ? 'aggressive' : 'chase';
        aiStateTimer = 60 + Math.random() * 40;
      } else if (absDist < 60) {
        aiState = roll < 0.3 ? 'retreat' : roll < 0.5 ? 'circle' : roll < 0.8 ? 'aggressive' : 'bait';
        aiStateTimer = 40 + Math.random() * 50;
      } else {
        aiState = roll < 0.35 ? 'chase' : roll < 0.6 ? 'circle' : roll < 0.8 ? 'aggressive' : 'bait';
        aiStateTimer = 60 + Math.random() * 80;
      }
    }
  }

  // Movement based on state
  const circleMin = bossPhase >= 2 ? 80 : 50;
  const circleMax = bossPhase >= 2 ? 180 : 140;
  const retreatDist = bossPhase >= 2 ? 200 : 150;

  aiMeleeCommitTimer--;

  if (aiState === 'chase') {
    if (absDist > aiPreferredRange) {
      enemy.vx = dirToPlayer * aiSpeed;
    } else if (bossPhase >= 2 && absDist > 40) {
      enemy.vx = dirToPlayer * aiSpeed * 0.35;
    } else if (bossPhase < 2 && absDist < aiPreferredRange - 20) {
      enemy.vx = -dirToPlayer * aiSpeed * 0.35;
    }
    // Phase 2: avoid sticking to player at point-blank range.
    if (bossPhase >= 2 && absDist < 38) {
      enemy.vx = -dirToPlayer * aiSpeed * 0.75;
    } else if (bossPhase >= 2 && absDist < 60) {
      enemy.vx = 0;
    }
  } else if (aiState === 'circle') {
    if (absDist > circleMax) {
      enemy.vx = dirToPlayer * aiSpeed * 0.9;
    } else if (absDist < circleMin) {
      enemy.vx = -dirToPlayer * aiSpeed * 0.8;
    } else {
      if (bossPhase >= 2) {
        const strafeDir = Math.sin(bgOffset * 0.07 + Math.cos(bgOffset * 0.03) * 2);
        enemy.vx = (strafeDir > 0 ? 1 : -1) * aiSpeed * 0.6;
      } else {
        // Phase 1: keep strafe direction for a short window to avoid jitter.
        aiStrafeTimer--;
        if (aiStrafeTimer <= 0) {
          aiStrafeDir = Math.random() < 0.5 ? -1 : 1;
          aiStrafeTimer = 24 + Math.random() * 22;
        }
        enemy.vx = aiStrafeDir * aiSpeed * 0.55;
      }
    }
  } else if (aiState === 'retreat') {
    if (absDist < retreatDist) {
      enemy.vx = -dirToPlayer * aiSpeed * 0.9;
      if (aiFeintTimer <= 0 && absDist < 90 && Math.random() < 0.02) {
        aiState = 'punish';
        aiStateTimer = 15;
        aiFeintTimer = 120;
      }
    }
  } else if (aiState === 'aggressive') {
    if (bossPhase < 2 && aiMeleeCommitTimer <= 0) {
      // In phase 1, only close in during short commit windows.
      if (Math.random() < 0.035 && absDist < 170) {
        aiMeleeCommitTimer = 28 + Math.random() * 18;
      } else if (absDist < 120) {
        enemy.vx = -dirToPlayer * aiSpeed * 0.45;
      }
    }

    if (aiMeleeCommitTimer > 0 || bossPhase >= 2) {
      if (absDist > 45) {
        enemy.vx = dirToPlayer * aiSpeed * 1.4;
      } else {
        enemy.vx = dirToPlayer * aiSpeed * 0.3;
      }
    }
  } else if (aiState === 'punish') {
    if (absDist > 40) {
      enemy.vx = dirToPlayer * aiSpeed * 1.6;
    }
  } else if (aiState === 'bait') {
    const baitFreq = bossPhase >= 2 ? 0.06 : 0.1;
    const baitCycle = Math.sin(bgOffset * baitFreq + Math.cos(bgOffset * 0.04) * 1.5);
    if (baitCycle > 0.2) {
      enemy.vx = dirToPlayer * aiSpeed * (bossPhase >= 2 ? 1.0 : 0.8);
    } else if (baitCycle < -0.2) {
      enemy.vx = -dirToPlayer * aiSpeed * (bossPhase >= 2 ? 0.9 : 0.6);
    }
  }

  // Keep enemy on screen
  if (enemy.x < 20) enemy.vx = Math.max(enemy.vx, aiSpeed * 0.5);
  if (enemy.x > W - 60) enemy.vx = Math.min(enemy.vx, -aiSpeed * 0.5);

  // Phase 1 only: smooth horizontal acceleration to reduce twitchy movement.
  if (bossPhase < 2 && enemy.onGround) {
    const maxStep = aiSpeed * 0.22;
    const delta = enemy.vx - prevVx;
    if (delta > maxStep) enemy.vx = prevVx + maxStep;
    else if (delta < -maxStep) enemy.vx = prevVx - maxStep;
    if (Math.abs(enemy.vx) < 0.05) enemy.vx = 0;
  }

  // Attack logic — varies by state and distance
  aiAttackTimer--;
  if (aiAttackTimer <= 0 && !enemy.attacking) {
    let shouldAttack = false;
    let nextCooldown = 90;

    if (aiState === 'punish' && absDist < 90) {
      shouldAttack = true;
      nextCooldown = 20 + Math.random() * 20;
    } else if (aiState === 'aggressive' && absDist < 100 && (bossPhase >= 2 || aiMeleeCommitTimer > 0 || absDist < 62)) {
      shouldAttack = true;
      // Combo: rapid successive hits
      if (aiComboCount < 2 + Math.floor(Math.random() * 2)) {
        nextCooldown = 18 + Math.random() * 15;
        aiComboCount++;
      } else {
        nextCooldown = 70 + Math.random() * 50;
        aiComboCount = 0;
      }
    } else if (aiState === 'bait' && absDist < 80 && Math.sin(bgOffset * 0.1) > 0.2) {
      shouldAttack = true;
      nextCooldown = 60 + Math.random() * 50;
    } else if ((aiState === 'chase' || aiState === 'circle') && absDist < 110 && absDist > 18) {
      shouldAttack = true;
      nextCooldown = 80 + Math.random() * 60;
    }

    if (shouldAttack) {
      enemy.attack();
      aiAttackTimer = bossPhase >= 2 ? nextCooldown * 0.65 : nextCooldown;
      if (bossPhase < 2) aiMeleeCommitTimer = 0;
    }
  }

  // Phase 2 anti-stall: if too close and not attacking, force quick reposition.
  if (bossPhase >= 2 && !enemy.attacking && absDist < 24) {
    enemy.vx = -dirToPlayer * aiSpeed * 1.1;
    if (aiState !== 'retreat' && Math.random() < 0.2) {
      aiState = 'retreat';
      aiStateTimer = 20 + Math.random() * 20;
    }
  }

  // Phase 1 ranged pressure: boss occasionally shoots at medium/long range.
  aiRangedTimer--;
  if (bossPhase < 2 && aiRangedTimer <= 0 && !enemy.attacking && enemy.onGround) {
    const hasClearRange = absDist > 130 && absDist < 320;
    const lowProjectileDensity = projectiles.filter(p => p.owner === enemy && p.alive).length < 1;
    if (hasClearRange && lowProjectileDensity && Math.random() < 0.75) {
      enemy.queueRangedShot(enemy.facingRight);
      aiRangedTimer = 95 + Math.random() * 65;
    } else {
      aiRangedTimer = 28 + Math.random() * 20;
    }
  }

  // Reactive dodge — jump or backstep when player attacks
  if (player.attacking && absDist < 95 && aiDodgeCooldown <= 0) {
    const dodgeRoll = Math.random();
    if (dodgeRoll < 0.25 && enemy.onGround) {
      // Jump dodge
      enemy.jump();
      aiDodgeCooldown = 40;
    } else if (dodgeRoll < 0.45) {
      // Backstep dodge
      enemy.vx = -dirToPlayer * aiSpeed * 2;
      aiDodgeCooldown = 30;
    }
  }

  // Dodge projectiles
  for (const proj of projectiles) {
    if (!proj.alive || proj.owner !== player) continue;
    const projDist = Math.abs(proj.x - enemy.x);
    const projApproaching = proj.dirRight ? (proj.x < enemy.x) : (proj.x > enemy.x);
    if (projDist < 120 && projApproaching && enemy.onGround && aiDodgeCooldown <= 0) {
      // Do not always dodge projectiles: add reaction chance.
      const dodgeChance = bossPhase >= 2 ? 0.62 : 0.45;
      if (Math.random() < dodgeChance) {
        enemy.jump();
        aiDodgeCooldown = 50;
      } else {
        // Small hesitation window so the AI doesn't re-roll every frame.
        aiDodgeCooldown = 18;
      }
      break;
    }
  }

  // Strategic jump
  aiJumpTimer--;
  if (aiJumpTimer <= 0 && enemy.onGround) {
    if (aiState === 'aggressive' && absDist > 90 && absDist < 180) {
      // Jump-in attack
      enemy.jump();
      aiJumpTimer = 60 + Math.random() * 60;
    } else if (aiState === 'retreat' && absDist < 60) {
      // Escape jump
      enemy.jump();
      enemy.vx = -dirToPlayer * AI_SPEED;
      aiJumpTimer = 70 + Math.random() * 50;
    } else if (Math.random() < 0.08) {
      enemy.jump();
      aiJumpTimer = 90 + Math.random() * 80;
    } else {
      aiJumpTimer = 40 + Math.random() * 40;
    }
  }

  // Face player
  enemy.facingRight = distX > 0;

  // Phase 2: spawn ground traps
  if (bossPhase >= 2) {
    bossTrapTimer--;
    if (bossTrapTimer <= 0 && bossTraps.filter(t => !t.activated).length < TRAP_MAX_ACTIVE) {
      const trapX = 40 + Math.random() * (W - 80);
      bossTraps.push(new BossTrap(trapX));
      sndTrapSpawn();
      bossTrapTimer = TRAP_SPAWN_INTERVAL_MIN + Math.random() * (TRAP_SPAWN_INTERVAL_MAX - TRAP_SPAWN_INTERVAL_MIN);
    }

    // Boss powers: projectile, ground wave, energy rain
    bossPowerTimer--;
    if (bossPowerTimer <= 0) {
      const powerRoll = Math.random();
      if (powerRoll < 0.35) {
        // Projectile at player
        const px = enemy.facingRight ? enemy.x + enemy.w + 10 : enemy.x - 10;
        const py = enemy.y + enemy.h * 0.16;
        bossPowers.push(new BossProjectile(px, py, enemy.facingRight));
        enemy.triggerAnim('shot');
        sndBossShoot();
        bossPowerTimer = BOSS_POWER_COOLDOWN * 0.6;
      } else if (powerRoll < 0.65) {
        // Ground wave from boss position
        bossPowers.push(new BossGroundWave(enemy.x + enemy.w / 2, true));
        bossPowers.push(new BossGroundWave(enemy.x + enemy.w / 2, false));
        sndBossWave();
        bossPowerTimer = BOSS_POWER_COOLDOWN;
      } else {
        // Energy rain from sky
        bossPowers.push(new BossEnergyRain());
        sndBossRain();
        bossPowerTimer = BOSS_POWER_COOLDOWN * 1.3;
      }
    }
  }
}

// =============================================================================
// SOUNDS (Web Audio API)
// =============================================================================

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function sndPunch() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
  
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

function sndJump() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
  
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

function sndHit() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'square';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.08);
  
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

function sndVictory() {
  if (!audioCtx) return;
  const notes = [261.63, 329.63, 392.00, 523.25]; // C E G C
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.15);
    
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.15 + 0.3);
    
    osc.start(audioCtx.currentTime + i * 0.15);
    osc.stop(audioCtx.currentTime + i * 0.15 + 0.3);
  });
}

function sndSpecial() {
  if (!audioCtx) return;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(audioCtx.destination);

  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(600, audioCtx.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.3);

  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  osc1.start();
  osc2.start();
  osc1.stop(audioCtx.currentTime + 0.3);
  osc2.stop(audioCtx.currentTime + 0.3);
}

function sndBurst() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  const noise = audioCtx.createOscillator();
  const noiseGain = audioCtx.createGain();
  noise.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.type = 'sawtooth';
  noise.frequency.setValueAtTime(150, t);
  noise.frequency.exponentialRampToValueAtTime(50, t + 0.4);
  noiseGain.gain.setValueAtTime(0.18, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
  noise.start(t);
  noise.stop(t + 0.4);

  const bass = audioCtx.createOscillator();
  const bassGain = audioCtx.createGain();
  bass.connect(bassGain);
  bassGain.connect(audioCtx.destination);
  bass.type = 'sine';
  bass.frequency.setValueAtTime(80, t);
  bass.frequency.exponentialRampToValueAtTime(30, t + 0.3);
  bassGain.gain.setValueAtTime(0.2, t);
  bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
  bass.start(t);
  bass.stop(t + 0.3);

  const hi = audioCtx.createOscillator();
  const hiGain = audioCtx.createGain();
  hi.connect(hiGain);
  hiGain.connect(audioCtx.destination);
  hi.type = 'square';
  hi.frequency.setValueAtTime(800, t);
  hi.frequency.exponentialRampToValueAtTime(200, t + 0.2);
  hiGain.gain.setValueAtTime(0.06, t);
  hiGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
  hi.start(t);
  hi.stop(t + 0.2);
}

function sndTrap() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  const buzz = audioCtx.createOscillator();
  const buzzGain = audioCtx.createGain();
  buzz.connect(buzzGain);
  buzzGain.connect(audioCtx.destination);
  buzz.type = 'sawtooth';
  buzz.frequency.setValueAtTime(120, t);
  buzz.frequency.exponentialRampToValueAtTime(60, t + 0.3);
  buzzGain.gain.setValueAtTime(0.12, t);
  buzzGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
  buzz.start(t);
  buzz.stop(t + 0.3);

  const zap = audioCtx.createOscillator();
  const zapGain = audioCtx.createGain();
  zap.connect(zapGain);
  zapGain.connect(audioCtx.destination);
  zap.type = 'square';
  zap.frequency.setValueAtTime(600, t);
  zap.frequency.exponentialRampToValueAtTime(150, t + 0.15);
  zapGain.gain.setValueAtTime(0.08, t);
  zapGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
  zap.start(t);
  zap.stop(t + 0.15);
}

function sndTrapSpawn() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
  osc.start(t);
  osc.stop(t + 0.2);
}

function sndRespawn() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.2);
  
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

// =============================================================================
// BACKGROUND — Cyberpunk Arena
// =============================================================================

function initBackground() {
  if (!bgImage) {
    bgImage = new Image();
    bgImage.onload = () => { bgImageLoaded = true; };
    bgImage.src = 'assets/fight/Cenario_001.png';
  }

  if (!bgImageP2InitDone) {
    bgImageP2InitDone = true;
    bgImageP2 = new Image();
    bgImageP2.onload = () => { bgImageP2Loaded = true; };
    bgImageP2.onerror = () => { bgImageP2Loaded = false; };
    bgImageP2.src = BG_PHASE2_SRC;
  }

  bgRaindrops = [];
  for (let i = 0; i < 120; i++) {
    bgRaindrops.push({
      x: Math.random() * W,
      y: Math.random() * GROUND_Y,
      len: 4 + Math.random() * 12,
      speed: 6 + Math.random() * 8,
      alpha: 0.08 + Math.random() * 0.18
    });
  }

  bgSmoke = [];
  for (let i = 0; i < 8; i++) {
    bgSmoke.push({
      x: Math.random() * W,
      y: GROUND_Y - 10 - Math.random() * 30,
      r: 20 + Math.random() * 40,
      vx: -0.15 + Math.random() * 0.3,
      alpha: 0.02 + Math.random() * 0.04
    });
  }

  bgEmbers = [];
  for (let i = 0; i < 42; i++) {
    bgEmbers.push({
      x: Math.random() * W,
      y: GROUND_Y + Math.random() * (H - GROUND_Y + 20),
      vy: 0.5 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.45,
      size: 1 + Math.random() * 2.4,
      alpha: 0.25 + Math.random() * 0.55,
      life: 40 + Math.random() * 70,
      maxLife: 40 + Math.random() * 70
    });
  }

  bgOffset = 0;
}

function renderBackground(ctx) {
  const t = bgOffset;

  if (
    state === 'phase_transition' &&
    !showBossPhase2Background &&
    bgImageP2Loaded &&
    bgImageP2
  ) {
    showBossPhase2Background = true;
  }

  // --- Background image (fase 2: após swap na transição ou bossPhase >= 2) ---
  if (
    bgImageP2Loaded &&
    bgImageP2 &&
    (bossPhase >= 2 || showBossPhase2Background)
  ) {
    ctx.drawImage(bgImageP2, 0, 0, W, H);
  } else if (bgImageLoaded && bgImage) {
    ctx.drawImage(bgImage, 0, 0, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#020012');
    sky.addColorStop(0.5, '#0a0028');
    sky.addColorStop(1, '#050510');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  // --- Smoke / steam ---
  bgSmoke.forEach(s => {
    s.x += s.vx;
    s.y -= 0.1;
    if (s.y < GROUND_Y - 80) { s.y = GROUND_Y - 5; s.x = Math.random() * W; }
    if (s.x < -50) s.x = W + 50;
    if (s.x > W + 50) s.x = -50;
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    grad.addColorStop(0, `rgba(160, 120, 200, ${s.alpha})`);
    grad.addColorStop(1, 'rgba(80, 40, 120, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });

  // --- Rain ---
  ctx.strokeStyle = 'rgba(180, 210, 255, 0.15)';
  ctx.lineWidth = 1;
  bgRaindrops.forEach(r => {
    r.y += r.speed;
    r.x -= 1.2;
    if (r.y > GROUND_Y) {
      r.y = -r.len;
      r.x = Math.random() * (W + 60);
    }
    if (r.x < -10) r.x = W + 10;
    ctx.globalAlpha = r.alpha;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x - 1.2 * (r.len / r.speed) * 2, r.y + r.len);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // --- Scanline overlay ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  // --- Phase 2: rising red embers from destroyed ground ---
  if (bossPhase >= 2 && state !== 'phase_transition') {
    bgEmbers.forEach(e => {
      e.y -= e.vy;
      e.x += e.vx + Math.sin((t + e.y) * 0.03) * 0.15;
      e.life--;

      if (e.life <= 0 || e.y < -20) {
        e.x = Math.random() * W;
        e.y = GROUND_Y + Math.random() * (H - GROUND_Y + 24);
        e.vy = 0.55 + Math.random() * 2.1;
        e.vx = (Math.random() - 0.5) * 0.5;
        e.size = 1 + Math.random() * 2.6;
        e.alpha = 0.25 + Math.random() * 0.6;
        e.maxLife = 40 + Math.random() * 80;
        e.life = e.maxLife;
      }

      const lifePct = e.life / e.maxLife;
      ctx.save();
      ctx.globalAlpha = e.alpha * Math.max(0, lifePct) * (0.7 + 0.3 * Math.sin(t * 0.2 + e.x * 0.05));
      ctx.shadowColor = '#ff2a2a';
      ctx.shadowBlur = 8;
      ctx.fillStyle = lifePct > 0.45 ? '#ff4b3a' : '#ffb36a';
      ctx.fillRect(e.x, e.y, e.size, e.size * 1.8);
      ctx.restore();
    });
  }

  if (bossPhase >= 2 && state !== 'phase_transition') {
    renderBossPhase2ScreenEffect(ctx, t);
  }

  bgOffset += 1;
}

function renderBossPhase2ScreenEffect(ctx, t) {
  const pulse = 0.45 + 0.55 * Math.sin(t * 0.06);
  const pulse2 = 0.5 + 0.5 * Math.sin(t * 0.11 + 1.2);

  ctx.save();

  // Tom magenta / perigo sobre a cena
  ctx.globalCompositeOperation = 'multiply';
  const tint = ctx.createLinearGradient(0, 0, W, H);
  tint.addColorStop(0, `rgba(80, 0, 90, ${0.22 + pulse * 0.06})`);
  tint.addColorStop(0.4, `rgba(120, 0, 80, ${0.14 + pulse2 * 0.08})`);
  tint.addColorStop(1, `rgba(40, 0, 100, ${0.2 + pulse * 0.05})`);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'screen';

  const wash = ctx.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.45, W * 0.75);
  wash.addColorStop(0, `rgba(255, 0, 120, ${0.06 * pulse})`);
  wash.addColorStop(0.55, 'rgba(255, 0, 200, 0)');
  wash.addColorStop(1, `rgba(0, 200, 255, ${0.04 * pulse2})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'source-over';

  // Vignette escuro nas bordas
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.65, 'rgba(0,0,0,0.12)');
  vig.addColorStop(1, 'rgba(10,0,25,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Barras de glitch horizontais (fracas, aleatórias)
  if (t % 5 === 0) {
    const gy = Math.random() * H;
    ctx.globalAlpha = 0.08 + Math.random() * 0.1;
    ctx.fillStyle = Math.random() < 0.5 ? '#ff0088' : '#00ffff';
    ctx.fillRect((Math.random() - 0.5) * 20, gy, W, 2 + Math.random() * 10);
  }
  ctx.globalAlpha = 1;

  // Borda pulsante de alerta
  ctx.strokeStyle = `rgba(255,0,100,${0.25 + 0.2 * pulse})`;
  ctx.lineWidth = 2 + pulse;
  ctx.shadowColor = '#ff0066';
  ctx.shadowBlur = 12 * pulse;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.strokeStyle = `rgba(0,255,255,${0.12 + 0.1 * pulse2})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.shadowBlur = 0;

  // Scanlines extras (mais densas na fase 2)
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) {
    if (y % 4 !== 0) ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;

  // Partículas digitais drift
  const seed = Math.floor(t / 3);
  ctx.fillStyle = 'rgba(255,0,180,0.12)';
  for (let i = 0; i < 12; i++) {
    const px = ((seed * 37 + i * 97) % W) + Math.sin(t * 0.02 + i) * 15;
    const py = ((t * 2 + i * 41) % H);
    ctx.fillRect(px, py, 1 + (i % 2), 2);
  }

  ctx.restore();
}

// =============================================================================
// HUD — Cyberpunk Neon
// =============================================================================

const HUD_FONT = '"Press Start 2P", monospace';
const TIMER_BOX_W = 62;
const BAR_GAP = 6;
const BAR_W = (W - TIMER_BOX_W - BAR_GAP * 2 - 16) / 2;
const BAR_H = 16;
const BAR_Y = 26;
const BAR_PAD = 8;

function hudRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
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

function drawHealthBar(ctx, x, y, w, h, pct, colorA, colorB, glowColor, flip) {
  const t = bgOffset;
  const pulse = 0.7 + 0.3 * Math.sin(t * 0.06);

  // Panel background
  const panelX = flip ? x - 8 : x - 8;
  const panelW = w + 16;
  ctx.save();
  hudRoundRect(ctx, panelX, y - 4, panelW, h + 8, 3);
  const bg = ctx.createLinearGradient(panelX, y, panelX, y + h);
  bg.addColorStop(0, 'rgba(10, 5, 30, 0.92)');
  bg.addColorStop(1, 'rgba(5, 2, 18, 0.95)');
  ctx.fillStyle = bg;
  ctx.fill();

  // Border glow
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8 * pulse;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 1.5;
  hudRoundRect(ctx, panelX, y - 4, panelW, h + 8, 3);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner border
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  hudRoundRect(ctx, panelX + 2, y - 2, panelW - 4, h + 4, 2);
  ctx.stroke();
  ctx.restore();

  // Bar track
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);

  // Health fill
  const fillW = Math.max(0, w * pct);
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, fillW, h);

    // Shine highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, fillW, h * 0.35);

    // Glow on fill edge
    if (pct < 1) {
      ctx.save();
      ctx.shadowColor = colorB;
      ctx.shadowBlur = 10;
      ctx.fillStyle = colorB;
      ctx.globalAlpha = 0.6 * pulse;
      ctx.fillRect(x + fillW - 3, y, 3, h);
      ctx.restore();
    }

    // Segment lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const sx = x + (w / 5) * i;
      if (sx < x + fillW) {
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.lineTo(sx, y + h);
        ctx.stroke();
      }
    }
  }

  // Low health warning pulse
  if (pct <= 0.25 && pct > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 0, 0, ${0.1 + 0.1 * Math.sin(t * 0.15)})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

function renderHUD(ctx) {
  const t = bgOffset;
  const pulse = 0.65 + 0.35 * Math.sin(t * 0.05);
  const cx = W / 2;

  // === Layout: bars almost touching the center timer box ===
  const pBarX = BAR_PAD;
  const eBarX = cx + TIMER_BOX_W / 2 + BAR_GAP;
  const pBarW = cx - TIMER_BOX_W / 2 - BAR_GAP - BAR_PAD;
  const eBarW = pBarW;

  // === PLAYER HEALTH (left → fills toward center) ===
  const pPct = player.health / player.maxHealth;
  drawHealthBar(ctx, pBarX, BAR_Y, pBarW, BAR_H, pPct, '#00ffff', '#00ff88', 'rgba(0,255,255,0.7)', false);

  // Player label
  ctx.save();
  ctx.font = `7px ${HUD_FONT}`;
  ctx.textAlign = 'left';
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#0ff';
  ctx.fillText('P1', pBarX + 2, BAR_Y - 7);
  ctx.shadowBlur = 0;
  ctx.restore();

  // P1 Lives
  const livesY = BAR_Y + BAR_H + 5;
  for (let i = 0; i < P1_MAX_LIVES; i++) {
    const lx = pBarX + i * 14 + 2;
    const alive = i < p1Lives;
    ctx.save();
    if (alive) {
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#0ff';
    } else {
      ctx.fillStyle = 'rgba(0,255,255,0.15)';
    }
    ctx.beginPath();
    const s = 4;
    ctx.moveTo(lx, livesY + s);
    ctx.bezierCurveTo(lx, livesY, lx - s, livesY, lx - s, livesY + s * 0.6);
    ctx.bezierCurveTo(lx - s, livesY + s * 1.4, lx, livesY + s * 1.8, lx, livesY + s * 2.2);
    ctx.bezierCurveTo(lx, livesY + s * 1.8, lx + s, livesY + s * 1.4, lx + s, livesY + s * 0.6);
    ctx.bezierCurveTo(lx + s, livesY, lx, livesY, lx, livesY + s);
    ctx.fill();
    ctx.restore();
  }

  // === ONDA GLITCH BAR (below lives, larger and slightly lower) ===
  const superY = livesY + 22;
  const superBarW = pBarW * 0.7;
  const superBarH = 9;
  const superPct = superMeter / SUPER_MAX;
  const superFull = superMeter >= SUPER_MAX;

  // Background
  ctx.save();
  ctx.fillStyle = 'rgba(10,0,30,0.7)';
  ctx.strokeStyle = 'rgba(180,120,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(pBarX, superY, superBarW, superBarH);
  ctx.fill();
  ctx.stroke();

  // Fill
  if (superPct > 0) {
    const fillW = superBarW * superPct;
    const superGrad = ctx.createLinearGradient(pBarX, superY, pBarX + fillW, superY);
    if (superFull) {
      const flashAlpha = 0.7 + 0.3 * Math.sin(t * 0.15);
      superGrad.addColorStop(0, `rgba(255,200,0,${flashAlpha})`);
      superGrad.addColorStop(0.5, `rgba(255,255,100,${flashAlpha})`);
      superGrad.addColorStop(1, `rgba(255,180,0,${flashAlpha})`);
    } else {
      superGrad.addColorStop(0, '#a040ff');
      superGrad.addColorStop(0.5, '#c060ff');
      superGrad.addColorStop(1, '#8020dd');
    }
    ctx.fillStyle = superGrad;
    ctx.fillRect(pBarX, superY, fillW, superBarH);

    // Glow on top
    ctx.shadowColor = superFull ? '#ffcc00' : '#a040ff';
    ctx.shadowBlur = superFull ? 10 * pulse : 4;
    ctx.fillStyle = superFull ? 'rgba(255,255,150,0.3)' : 'rgba(180,100,255,0.2)';
    ctx.fillRect(pBarX, superY, fillW, superBarH / 2);
    ctx.shadowBlur = 0;
  }

  // Segment lines
  for (let i = 1; i < 4; i++) {
    const sx = pBarX + (superBarW / 4) * i;
    ctx.strokeStyle = 'rgba(180,120,255,0.25)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, superY);
    ctx.lineTo(sx, superY + superBarH);
    ctx.stroke();
  }

  // Label — cyberpunk styled power name
  const labelX = pBarX;
  const labelY = superY - 6;
  ctx.textAlign = 'left';

  if (superFull) {
    // Glitch offset when full
    const glitchX = Math.random() < 0.1 ? (Math.random() - 0.5) * 4 : 0;
    const glitchY = Math.random() < 0.08 ? (Math.random() - 0.5) * 2 : 0;

    // Cinematic neon frame when full
    ctx.save();
    ctx.strokeStyle = `rgba(255,210,120,${0.45 + 0.25 * pulse})`;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#ffdd66';
    ctx.shadowBlur = 14 + 8 * pulse;
    ctx.strokeRect(pBarX - 3, superY - 2, superBarW + 6, superBarH + 4);
    ctx.restore();

    // Chromatic text layers
    ctx.font = `bold 8px ${HUD_FONT}`;
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#ff3ca8';
    ctx.fillText('⚡ OVERCLOCK NOVA ⚡', labelX - 1 + glitchX, labelY + glitchY);
    ctx.fillStyle = '#00ffff';
    ctx.fillText('⚡ OVERCLOCK NOVA ⚡', labelX + 1 + glitchX, labelY + glitchY);

    // Main text with stronger glow
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#ffd86a';
    ctx.shadowBlur = 18 * pulse;
    ctx.fillStyle = `rgba(255,238,120,${0.84 + 0.16 * pulse})`;
    ctx.fillText('⚡ OVERCLOCK NOVA ⚡', labelX + glitchX, labelY + glitchY);
    ctx.shadowBlur = 0;

    // Dual shine sweep across bar
    const sweepX = pBarX + ((t * 2.4) % (superBarW + 30)) - 15;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#fff';
    ctx.fillRect(sweepX, superY - 1, 4, superBarH + 2);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffd7ff';
    ctx.fillRect(sweepX - 9, superY, 3, superBarH);

    // Small energy sparks over the bar
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 4; i++) {
      const sx = pBarX + ((t * (1.6 + i * 0.3) + i * 37) % superBarW);
      const sy = superY - 2 + Math.sin(t * 0.18 + i) * 2;
      ctx.fillStyle = i % 2 ? '#ffe37a' : '#9fffff';
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  } else {
    // Dim version with stronger visibility while charging
    ctx.font = `bold 7px ${HUD_FONT}`;

    // Subtle chromatic
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('OVERCLOCK NOVA', labelX - 0.5, labelY);
    ctx.fillStyle = '#00ffff';
    ctx.fillText('OVERCLOCK NOVA', labelX + 0.5, labelY);

    ctx.globalAlpha = 0.65 + superPct * 0.25;
    ctx.shadowColor = '#a040ff';
    ctx.shadowBlur = 5 + superPct * 6;
    ctx.fillStyle = `rgba(210,150,255,${0.68 + superPct * 0.3})`;
    ctx.fillText('OVERCLOCK NOVA', labelX, labelY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Percentage indicator
    ctx.font = `5px ${HUD_FONT}`;
    ctx.fillStyle = 'rgba(210,150,255,0.55)';
    ctx.fillText(`${Math.floor(superPct * 100)}%`, labelX + superBarW - 20, labelY);
  }
  ctx.restore();

  // === ENEMY HEALTH (right → fills toward center) ===
  const ePct = enemy.health / enemy.maxHealth;
  drawHealthBar(ctx, eBarX, BAR_Y, eBarW, BAR_H, ePct, '#ff00ff', '#ff0044', 'rgba(255,0,255,0.7)', true);

  // === BERSERKER HUD ALERT ===
  if (isP1Berserker()) {
    const bPulse = 0.5 + 0.5 * Math.sin(t * 0.32);
    const blink = Math.sin(t * 0.5) > -0.15 ? 1 : 0.45;
    const bx = W / 2;
    const by = BAR_Y + BAR_H + 30;

    ctx.save();
    ctx.textAlign = 'center';

    // Glitch chroma shadows
    ctx.font = `bold 8px ${HUD_FONT}`;
    ctx.globalAlpha = 0.32 * blink;
    ctx.fillStyle = '#ff0066';
    ctx.fillText('MODO BERSERKER ONLINE', bx - 1.2, by);
    ctx.fillStyle = '#00ffff';
    ctx.fillText('MODO BERSERKER ONLINE', bx + 1.2, by);

    // Main neon text
    ctx.globalAlpha = 0.86 * blink;
    ctx.shadowColor = '#ff2bcf';
    ctx.shadowBlur = 12 + 8 * bPulse;
    ctx.fillStyle = `rgba(255,150,220,${0.82 + 0.18 * bPulse})`;
    ctx.fillText('MODO BERSERKER ONLINE', bx, by);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Enemy label
  ctx.save();
  ctx.font = `7px ${HUD_FONT}`;
  ctx.textAlign = 'right';
  ctx.shadowColor = '#f0f';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#f0f';
  ctx.fillText('P2', eBarX + eBarW - 2, BAR_Y - 7);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Corner tick (enemy)
  ctx.strokeStyle = 'rgba(255,0,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(eBarX + eBarW, BAR_Y + BAR_H + 3);
  ctx.lineTo(eBarX + eBarW, BAR_Y + BAR_H + 7);
  ctx.lineTo(eBarX + eBarW - 10, BAR_Y + BAR_H + 7);
  ctx.stroke();

  // === TIMER (center, large hi-tech) ===
  const timerStr = battleTimer.toString().padStart(2, '0');
  const timerLow = battleTimer <= 10;
  const timerBoxH = BAR_H + 24;
  const tx = cx - TIMER_BOX_W / 2;
  const ty = BAR_Y - 10;

  // Timer panel bg
  ctx.save();
  hudRoundRect(ctx, tx, ty, TIMER_BOX_W, timerBoxH, 4);
  const tbg = ctx.createLinearGradient(tx, ty, tx, ty + timerBoxH);
  tbg.addColorStop(0, 'rgba(15, 3, 35, 0.95)');
  tbg.addColorStop(0.5, 'rgba(8, 2, 22, 0.97)');
  tbg.addColorStop(1, 'rgba(4, 1, 14, 0.98)');
  ctx.fillStyle = tbg;
  ctx.fill();

  // Timer outer border
  const bCol = timerLow ? `rgba(255,30,30,${0.55 + 0.45 * pulse})` : 'rgba(180,160,255,0.45)';
  ctx.shadowColor = timerLow ? '#ff0000' : 'rgba(160,140,255,0.5)';
  ctx.shadowBlur = timerLow ? 16 * pulse : 8;
  ctx.strokeStyle = bCol;
  ctx.lineWidth = 1.8;
  hudRoundRect(ctx, tx, ty, TIMER_BOX_W, timerBoxH, 4);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner border
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  hudRoundRect(ctx, tx + 2, ty + 2, TIMER_BOX_W - 4, timerBoxH - 4, 3);
  ctx.stroke();

  // Corner accents on timer box
  const cLen = 7;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,255,255,0.5)';
  ctx.beginPath(); ctx.moveTo(tx, ty + cLen); ctx.lineTo(tx, ty); ctx.lineTo(tx + cLen, ty); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx, ty + timerBoxH - cLen); ctx.lineTo(tx, ty + timerBoxH); ctx.lineTo(tx + cLen, ty + timerBoxH); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,0,255,0.5)';
  ctx.beginPath(); ctx.moveTo(tx + TIMER_BOX_W - cLen, ty); ctx.lineTo(tx + TIMER_BOX_W, ty); ctx.lineTo(tx + TIMER_BOX_W, ty + cLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx + TIMER_BOX_W - cLen, ty + timerBoxH); ctx.lineTo(tx + TIMER_BOX_W, ty + timerBoxH); ctx.lineTo(tx + TIMER_BOX_W, ty + timerBoxH - cLen); ctx.stroke();
  ctx.restore();

  // Timer number — large
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const timerCY = ty + timerBoxH / 2 + 2;

  if (timerLow) {
    const flash = Math.sin(t * 0.15) > 0;
    // Chromatic aberration
    ctx.font = `20px ${HUD_FONT}`;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ff0000';
    ctx.fillText(timerStr, cx - 1.5, timerCY);
    ctx.fillStyle = '#0000ff';
    ctx.fillText(timerStr, cx + 1.5, timerCY);
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 18 * pulse;
    ctx.fillStyle = flash ? '#ff1111' : '#ff5544';
    ctx.fillText(timerStr, cx, timerCY);
  } else {
    // Chromatic aberration subtle
    ctx.font = `20px ${HUD_FONT}`;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#0ff';
    ctx.fillText(timerStr, cx - 1, timerCY);
    ctx.fillStyle = '#f0f';
    ctx.fillText(timerStr, cx + 1, timerCY);
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(200,180,255,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.fillText(timerStr, cx, timerCY);
  }
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  // Timer label "TIME"
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `5px ${HUD_FONT}`;
  ctx.fillStyle = timerLow ? `rgba(255,100,100,${0.4 + 0.3 * pulse})` : 'rgba(180,160,255,0.4)';
  ctx.fillText('TIME', cx, ty - 2);
  ctx.restore();

  // === Connecting lines: bars → timer ===
  // Left bar → timer
  ctx.strokeStyle = 'rgba(0,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pBarX + pBarW, BAR_Y + BAR_H / 2);
  ctx.lineTo(tx, BAR_Y + BAR_H / 2);
  ctx.stroke();
  // Right bar → timer
  ctx.strokeStyle = 'rgba(255,0,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(eBarX, BAR_Y + BAR_H / 2);
  ctx.lineTo(tx + TIMER_BOX_W, BAR_Y + BAR_H / 2);
  ctx.stroke();

  // === Top edge decorative corners ===
  ctx.strokeStyle = 'rgba(0,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, 14); ctx.lineTo(4, 4); ctx.lineTo(16, 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,0,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(W - 4, 14); ctx.lineTo(W - 4, 4); ctx.lineTo(W - 16, 4);
  ctx.stroke();
}

// =============================================================================
// GAME LOGIC
// =============================================================================

function startGame() {
  state = 'playing';
  battleTimer = 60;
  timerFrame = 0;
  gameFrameCount = 0;
  projectiles = [];
  energyFields = [];
  groundWaves = [];
  bossTraps = [];
  bossTrapTimer = 0;
  bossPowers = [];
  bossPowerTimer = 0;
  p1Lives = P1_MAX_LIVES;
  superMeter = 0;
  p1SuperFx = null;
  prevButtonX = false;
  prevButtonB = false;
  showBossPhase2Background = false;
  bossCineFx = { flash: 0, shake: 0, glitch: 0, bars: 0 };
  bossPhase = 1;
  phaseTransition = null;
  prePhase2Timer = 0;
  prePhase2Explosions = [];
  bossImploding = false;
  
  player = new Fighter(100, 300, 'Brawler-Girl', true);
  enemy = new Fighter(500, 300, 'Enemy-Punk', false);
  
  aiAttackTimer = 90;
  aiJumpTimer = 60;
  aiStrafeDir = 1;
  aiStrafeTimer = 0;
  aiRangedTimer = 70;
  aiMeleeCommitTimer = 0;
  aiState = 'chase';
  aiStateTimer = 0;
  aiComboCount = 0;
  aiDodgeCooldown = 0;
  aiBlockTimer = 0;
  aiFeintTimer = 0;
  aiPunishWindow = 0;
  aiPatternMemory = [];
  aiPreferredRange = 80;
  
  initBackground();
  initAudio();
}

function respawnPlayer() {
  player.health = player.maxHealth;
  player.x = 100;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  player.attacking = false;
  player.attackFrame = 0;
  player.hitLanded = false;
  player.hitFlicker = 0;
  player.currentAnim = 'idle';
  player.spriteFrame = 0;
  player.spriteTimer = 0;
  player.dashing = false;
  player.dashTimer = 0;
  player.afterimages = [];
  player.burstCooldown = 0;
  player.groundWaveCooldown = 0;
  bossCineFx = { flash: 0, shake: 0, glitch: 0, bars: 0 };
  player.bfBuffer = [];
  player.stunTimer = 0;
  sndRespawn();
}

function loseLife() {
  p1Lives--;
  spawnDeathExplosion(player.x + player.w / 2, player.y + player.h / 2);
  state = 'dying';
}

// =============================================================================
// PRE PHASE 2 — Boss “implode” + explosões no canvas (sprites depois)
// =============================================================================

function spawnPrePhase2Sequence() {
  prePhase2Timer = 0;
  prePhase2Explosions = [];
  bossImploding = true;
  for (let i = 0; i < 16; i++) {
    prePhase2Explosions.push({
      x: 30 + Math.random() * (W - 60),
      y: 60 + Math.random() * (GROUND_Y - 100),
      life: -Math.floor(i * 3),
      maxLife: 42 + Math.floor(Math.random() * 28),
      maxR: 50 + Math.random() * 110,
      r: 0,
      rot: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.45 ? 'cyan' : 'magenta',
      sparks: []
    });
  }
  sndPrePhase2Rumble();
}

function sndPrePhase2Rumble() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(45, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.25);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
  o.start(t);
  o.stop(t + 0.35);
}

function sndPrePhase2Pop() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(200 + Math.random() * 150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
  o.start(t);
  o.stop(t + 0.12);
}

function updatePrePhase2() {
  prePhase2Timer++;
  bgOffset++;

  if (prePhase2Timer % 6 === 0) {
    prePhase2Explosions.push({
      x: 20 + Math.random() * (W - 40),
      y: 40 + Math.random() * (GROUND_Y - 120),
      life: 0,
      maxLife: 38 + Math.floor(Math.random() * 30),
      maxR: 45 + Math.random() * 95,
      r: 0,
      rot: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.5 ? 'cyan' : 'magenta',
      sparks: []
    });
    if (prePhase2Timer % 18 === 0) sndPrePhase2Pop();
  }

  if (prePhase2Timer % 4 === 0) {
    const ex = enemy ? enemy.x + enemy.w / 2 : W / 2;
    const ey = enemy ? enemy.y + enemy.h / 2 : GROUND_Y - 60;
    prePhase2Explosions.push({
      x: ex + (Math.random() - 0.5) * 100,
      y: ey + (Math.random() - 0.5) * 80,
      life: 0,
      maxLife: 48 + Math.floor(Math.random() * 20),
      maxR: 70 + Math.random() * 50,
      r: 0,
      rot: Math.random() * Math.PI * 2,
      hue: 'both',
      sparks: []
    });
  }

  prePhase2Explosions.forEach(e => {
    e.life++;
    e.r = Math.min(e.maxR, e.r + 5 + e.life * 0.35);
    if (e.life % 4 === 0 && e.sparks.length < 12) {
      for (let s = 0; s < 3; s++) {
        e.sparks.push({
          ang: Math.random() * Math.PI * 2,
          dist: e.r * 0.4,
          speed: 2 + Math.random() * 5,
          life: 20 + Math.random() * 15
        });
      }
    }
    e.sparks.forEach(sp => {
      sp.dist += sp.speed;
      sp.life--;
    });
    e.sparks = e.sparks.filter(sp => sp.life > 0);
  });

  prePhase2Explosions = prePhase2Explosions.filter(e => e.life < e.maxLife + 15);
  if (prePhase2Explosions.length > 42) {
    prePhase2Explosions = prePhase2Explosions.slice(-38);
  }

  if (enemy) {
    enemy.vx = 0;
    enemy.hitFlicker = 20;
  }
  if (player) player.vx = 0;

  if (prePhase2Timer >= PRE_PHASE2_DURATION) {
    bossImploding = false;
    prePhase2Explosions = [];
    state = 'phase_transition';
    spawnPhaseTransition();
  }
}

function renderPrePhase2Explosions(ctx) {
  const col = (h) => {
    if (h === 'cyan') return { c: '#00ffff', e: 'rgba(0,255,255,' };
    if (h === 'magenta') return { c: '#ff00ff', e: 'rgba(255,0,255,' };
    return { c: '#ffffff', e: 'rgba(255,100,200,' };
  };

  prePhase2Explosions.forEach(e => {
    if (e.life < 0) return;
    const t = e.life / e.maxLife;
    const alpha = Math.max(0, 1 - t * 0.95);
    const hueKey =
      e.hue === 'both' ? (Math.floor(e.x + e.y) % 2 === 0 ? 'cyan' : 'magenta') : e.hue;
    const { c, e: epre } = col(hueKey);

    ctx.save();
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
    g.addColorStop(0, `${epre}${0.45 * alpha})`);
    g.addColorStop(0.45, `${epre}${0.12 * alpha})`);
    g.addColorStop(0.85, 'rgba(255,50,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.5 * alpha;
    ctx.lineWidth = 2;
    ctx.shadowColor = c;
    ctx.shadowBlur = 20 * alpha;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.92, e.rot, e.rot + Math.PI * 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.65, -e.rot, -e.rot + Math.PI * 1.2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // “placeholder” de sprite — cruz / fragmentos (substituir por sprites)
    ctx.globalAlpha = 0.35 * alpha;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i + e.rot;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * e.r * 0.2, e.y + Math.sin(a) * e.r * 0.2);
      ctx.lineTo(e.x + Math.cos(a) * e.r * 0.95, e.y + Math.sin(a) * e.r * 0.95);
      ctx.stroke();
    }

    e.sparks.forEach((sp, si) => {
      const sx = e.x + Math.cos(sp.ang) * sp.dist;
      const sy = e.y + Math.sin(sp.ang) * sp.dist;
      const sz = 2 + (si % 4) * 0.5;
      const pink = 50 + (si % 6) * 18;
      ctx.fillStyle = `rgba(255,${pink},255,${Math.min(1, sp.life / 15)})`;
      ctx.fillRect(sx - 1, sy - 1, sz, sz);
    });

    ctx.restore();
  });

  // Piscar / glitch na tela (sincronizado com timer + bgOffset, sem Math.random)
  const T = prePhase2Timer;
  const B = bgOffset;
  const strobe = (T + B) % 7;
  const hit = strobe < 2 || T % 6 === 0 || T % 6 === 2 || (T + B) % 9 < 2;

  ctx.save();
  ctx.globalAlpha = 0.05 + (strobe % 4) * 0.015;
  ctx.fillStyle = '#ff0044';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (hit) {
    ctx.save();
    const phase = (T + B) % 5;
    let flash = 'rgba(255,255,255,';
    if (phase === 1) flash = 'rgba(0,255,255,';
    else if (phase === 2) flash = 'rgba(255,0,255,';
    else if (phase === 3) flash = 'rgba(255,255,0,';
    ctx.globalAlpha = 0.14 + (strobe % 3) * 0.08;
    ctx.fillStyle = flash + '0.42)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if ((T + B * 2) % 5 === 0 || (T + B) % 11 === 1) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  for (let i = 0; i < 7; i++) {
    const y = ((T * 19 + i * 53 + B * 11) % (H - 6)) + 1;
    const bh = 1 + ((i + T) % 5);
    ctx.save();
    ctx.globalAlpha = 0.2 + ((i + T) % 4) * 0.06;
    ctx.fillStyle = (i + T + B) % 2 === 0 ? 'rgba(0,255,255,0.55)' : 'rgba(255,0,255,0.5)';
    ctx.fillRect(0, y, W, bh);
    ctx.restore();
  }

  const sliceY = (T * 37 + B * 3) % (H - 32);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = 'rgba(255,0,255,0.4)';
  ctx.fillRect(0, sliceY, W, 28);
  ctx.fillStyle = 'rgba(0,255,255,0.35)';
  ctx.fillRect(4, sliceY + 2, W - 8, 24);
  ctx.restore();

  for (let j = 0; j < 12; j++) {
    const gy = j * 14 + ((T + B) % 7);
    ctx.save();
    ctx.globalAlpha = 0.04 + (j % 3) * 0.02;
    ctx.fillStyle = j % 2 === 0 ? '#000' : 'rgba(0,255,255,0.15)';
    ctx.fillRect(0, gy, W, 1);
    ctx.restore();
  }
}

// =============================================================================
// PHASE TRANSITION — Fullscreen Cyberpunk Glitch Explosion
// =============================================================================

function spawnPhaseTransition() {
  phaseTransition = {
    timer: 0,
    maxTimer: 150,
    flash: 1,
    glitchBars: [],
    sparks: [],
    dataStreams: [],
    shockwaves: [],
    hexGrid: [],
    warningText: 'DANGER',
    phase: 'explode'
  };
  for (let i = 0; i < 30; i++) {
    phaseTransition.sparks.push({
      x: W / 2 + (Math.random() - 0.5) * 60,
      y: H / 2 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      size: 1 + Math.random() * 4,
      life: 40 + Math.random() * 80,
      color: Math.random() < 0.5 ? '#ff0044' : '#ff00ff'
    });
  }
  for (let i = 0; i < 15; i++) {
    phaseTransition.dataStreams.push({
      x: Math.random() * W,
      y: -Math.random() * H,
      speed: 2 + Math.random() * 5,
      chars: Array.from({ length: 8 + Math.floor(Math.random() * 12) }, () =>
        String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96))
      ),
      alpha: 0.3 + Math.random() * 0.5
    });
  }
  for (let i = 0; i < 8; i++) {
    phaseTransition.hexGrid.push({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 20 + Math.random() * 40,
      angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.05
    });
  }
  sndPhaseTransition();
  // Troca o fundo já no 1º frame da transição; o flash branco do renderPhaseTransition cobre o corte
  showBossPhase2Background = !!(bgImageP2Loaded && bgImageP2 && bgImageP2.complete);
}

function updatePhaseTransition() {
  if (!phaseTransition) return;
  phaseTransition.timer++;
  const t = phaseTransition.timer;

  if (t < 20) phaseTransition.flash = 1 - t / 20;
  else phaseTransition.flash = 0;

  // Generate glitch bars
  if (t % 3 === 0 && t < 100) {
    phaseTransition.glitchBars.push({
      y: Math.random() * H,
      h: 2 + Math.random() * 15,
      offset: (Math.random() - 0.5) * 40,
      alpha: 0.5 + Math.random() * 0.5,
      life: 5 + Math.random() * 10,
      color: Math.random() < 0.3 ? '#ff0044' : Math.random() < 0.6 ? '#00ffff' : '#ff00ff'
    });
  }
  phaseTransition.glitchBars.forEach(g => { g.life--; g.alpha *= 0.92; });
  phaseTransition.glitchBars = phaseTransition.glitchBars.filter(g => g.life > 0);

  // Shockwaves
  if (t === 5 || t === 25 || t === 50) {
    phaseTransition.shockwaves.push({ radius: 0, maxRadius: Math.max(W, H), alpha: 0.8 });
  }
  phaseTransition.shockwaves.forEach(s => {
    s.radius += 8;
    s.alpha *= 0.96;
  });
  phaseTransition.shockwaves = phaseTransition.shockwaves.filter(s => s.alpha > 0.02);

  // Sparks
  phaseTransition.sparks.forEach(s => {
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= 0.98;
    s.vy *= 0.98;
    s.life--;
  });
  phaseTransition.sparks = phaseTransition.sparks.filter(s => s.life > 0);

  // Data streams (matrix rain)
  phaseTransition.dataStreams.forEach(d => {
    d.y += d.speed;
    if (d.y > H + 100) { d.y = -80; d.x = Math.random() * W; }
    if (t % 6 === 0) {
      const idx = Math.floor(Math.random() * d.chars.length);
      d.chars[idx] = String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96));
    }
  });

  // Hexagons
  phaseTransition.hexGrid.forEach(h => { h.angle += h.rotSpeed; });

  // Warning text cycle
  if (t % 20 < 10) phaseTransition.warningText = '⚠ PHASE 2 ⚠';
  else phaseTransition.warningText = '⚠ DANGER ⚠';

  // Apply phase 2 changes at midpoint
  if (t === 75) {
    activatePhase2();
  }

  if (t >= phaseTransition.maxTimer) {
    phaseTransition = null;
    state = 'playing';
  }
}

function renderPhaseTransition(ctx) {
  if (!phaseTransition) return;
  const pt = phaseTransition;
  const t = pt.timer;
  const progress = t / pt.maxTimer;
  const cx = W / 2;
  const cy = H / 2;

  // White flash
  if (pt.flash > 0) {
    ctx.save();
    ctx.globalAlpha = pt.flash;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Dark overlay building up then fading
  const overlayAlpha = t < 40 ? Math.min(0.85, t / 40) : Math.max(0, 0.85 - (t - 100) / 50);
  ctx.fillStyle = `rgba(0,0,8,${overlayAlpha})`;
  ctx.fillRect(0, 0, W, H);

  // Shockwave rings
  pt.shockwaves.forEach(s => {
    ctx.save();
    ctx.strokeStyle = `rgba(255,0,100,${s.alpha})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff0066';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(cx, cy, s.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0,255,255,${s.alpha * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, s.radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  // Data streams (matrix rain)
  if (t < 120) {
    pt.dataStreams.forEach(d => {
      ctx.save();
      ctx.font = '10px monospace';
      d.chars.forEach((ch, i) => {
        const dy = d.y + i * 12;
        if (dy < 0 || dy > H) return;
        ctx.globalAlpha = d.alpha * (1 - i / d.chars.length) * Math.min(1, (120 - t) / 30);
        ctx.fillStyle = i === 0 ? '#ffffff' : '#ff0066';
        ctx.shadowColor = '#ff0066';
        ctx.shadowBlur = i === 0 ? 8 : 2;
        ctx.fillText(ch, d.x, dy);
      });
      ctx.restore();
    });
  }

  // Glitch bars
  pt.glitchBars.forEach(g => {
    ctx.save();
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = g.color;
    ctx.fillRect(g.offset, g.y, W, g.h);
    ctx.restore();
  });

  // Hexagonal grid
  if (t > 20 && t < 110) {
    const hexAlpha = Math.min(0.3, (t - 20) / 60) * Math.min(1, (110 - t) / 30);
    pt.hexGrid.forEach(h => {
      ctx.save();
      ctx.strokeStyle = `rgba(255,0,100,${hexAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i + h.angle;
        const px = h.x + Math.cos(a) * h.size;
        const py = h.y + Math.sin(a) * h.size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });
  }

  // Sparks
  pt.sparks.forEach(s => {
    ctx.save();
    ctx.globalAlpha = Math.min(1, s.life / 20);
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 6;
    ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    ctx.restore();
  });

  // Warning text
  if (t > 30 && t < 120) {
    const txtAlpha = Math.min(1, (t - 30) / 15) * Math.min(1, (120 - t) / 15);
    const glitchX = Math.random() < 0.15 ? (Math.random() - 0.5) * 10 : 0;
    const glitchY = Math.random() < 0.1 ? (Math.random() - 0.5) * 5 : 0;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Chromatic aberration
    ctx.font = `bold 28px ${HUD_FONT}`;
    ctx.globalAlpha = txtAlpha * 0.4;
    ctx.fillStyle = '#ff0044';
    ctx.fillText(pt.warningText, cx - 2 + glitchX, cy + glitchY);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(pt.warningText, cx + 2 + glitchX, cy + glitchY);

    // Main text
    ctx.globalAlpha = txtAlpha;
    ctx.shadowColor = '#ff0066';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff';
    ctx.fillText(pt.warningText, cx + glitchX, cy + glitchY);
    ctx.shadowBlur = 0;

    // Sub text
    if (t > 60 && t < 110) {
      const subAlpha = Math.min(1, (t - 60) / 10) * Math.min(1, (110 - t) / 10);
      ctx.font = `bold 10px ${HUD_FONT}`;
      ctx.globalAlpha = subAlpha * 0.8;
      ctx.fillStyle = '#ff0066';
      ctx.fillText('[ POWER INCREASING ]', cx, cy + 30);
    }
    ctx.restore();
  }

  // Scanlines over everything
  if (t < 120) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < H; y += 2) {
      ctx.fillRect(0, y, W, 1);
    }
  }

  // Screen border flash
  if (t < 80) {
    const borderAlpha = 0.4 * (1 - t / 80);
    ctx.save();
    ctx.strokeStyle = `rgba(255,0,100,${borderAlpha})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff0066';
    ctx.shadowBlur = 20;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.restore();
  }
}

function activatePhase2() {
  bossPhase = 2;
  enemy.maxHealth = P2_HP + P2_PHASE2_HP_BONUS;
  enemy.health = enemy.maxHealth;
  enemy.w = Math.floor(50 * P2_PHASE2_SCALE);
  enemy.h = Math.floor(80 * P2_PHASE2_SCALE);
  enemy.y = GROUND_Y - enemy.h;
  enemy.attackBox.w = Math.floor(60 * P2_PHASE2_SCALE);
  enemy.attackBox.h = Math.floor(40 * P2_PHASE2_SCALE);
}

function sndPhaseTransition() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  // Deep rumble
  const rumble = audioCtx.createOscillator();
  const rumbleGain = audioCtx.createGain();
  rumble.connect(rumbleGain);
  rumbleGain.connect(audioCtx.destination);
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(60, t);
  rumble.frequency.exponentialRampToValueAtTime(25, t + 1.5);
  rumbleGain.gain.setValueAtTime(0.2, t);
  rumbleGain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
  rumble.start(t);
  rumble.stop(t + 1.5);

  // Rising alarm
  const alarm = audioCtx.createOscillator();
  const alarmGain = audioCtx.createGain();
  alarm.connect(alarmGain);
  alarmGain.connect(audioCtx.destination);
  alarm.type = 'square';
  alarm.frequency.setValueAtTime(200, t);
  alarm.frequency.exponentialRampToValueAtTime(800, t + 0.8);
  alarm.frequency.exponentialRampToValueAtTime(200, t + 1.6);
  alarmGain.gain.setValueAtTime(0.08, t);
  alarmGain.gain.linearRampToValueAtTime(0.12, t + 0.8);
  alarmGain.gain.exponentialRampToValueAtTime(0.01, t + 1.6);
  alarm.start(t);
  alarm.stop(t + 1.6);

  // Impact hit
  const impact = audioCtx.createOscillator();
  const impactGain = audioCtx.createGain();
  impact.connect(impactGain);
  impactGain.connect(audioCtx.destination);
  impact.type = 'sine';
  impact.frequency.setValueAtTime(100, t + 0.3);
  impact.frequency.exponentialRampToValueAtTime(30, t + 0.8);
  impactGain.gain.setValueAtTime(0, t);
  impactGain.gain.linearRampToValueAtTime(0.25, t + 0.3);
  impactGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
  impact.start(t);
  impact.stop(t + 0.8);
}

function checkWinCondition() {
  if (enemy.health <= 0) {
    p1SuperFx = null;
    if (bossPhase === 1) {
      state = 'pre_phase2';
      spawnPrePhase2Sequence();
      return true;
    }

    // Phase 2: wait for enemy death animation to finish before victory screen.
    const eDef = SPRITE_DEFS[enemy.charName];
    const deadAnim = eDef?.animations?.dead;
    if (deadAnim) {
      enemy.vx = 0;
      enemy.attacking = false;
      enemy.attackFrame = 0;
      const deadDone = enemy.currentAnim === 'dead' && enemy.spriteFrame >= deadAnim.count - 1;
      if (!deadDone) return false;
    }

    state = 'won';
    spawnVictoryFX();
    sndVictory();
    return true;
  }
  
  if (player.health <= 0) {
    loseLife();
    return true;
  }
  
  if (battleTimer <= 0) {
    if (player.health >= enemy.health) {
      state = 'won';
      sndVictory();
    } else {
      loseLife();
    }
    return true;
  }
  
  return false;
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

let gameFrameCount = 0;

function handleInput() {
  if (!_inputRef || state !== 'playing') return;
  if (player.stunTimer > 0) { player.vx = 0; return; }
  if (p1SuperFx) {
    prevButtonX = !!_inputRef.buttonX;
    return;
  }

  const input = _inputRef;
  const bPressed = !!input.buttonB;

  const bxPressed = !!input.buttonX;
  if (bxPressed && !prevButtonX && superMeter >= SUPER_MAX) {
    if (tryFireP1Super()) {
      prevButtonX = true;
      return;
    }
  }
  prevButtonX = bxPressed;

  if (!player.dashing) {
    player.vx = 0;
    if (input.left) player.vx = -PLAYER_SPEED;
    if (input.right) player.vx = PLAYER_SPEED;
  }
  
  // Combo detection: back, back, punch → special
  const backPressed = player.facingRight ? input.left : input.right;
  if (backPressed && !player.prevBackPressed) {
    player.recordBack(gameFrameCount);
    player.recordBackFwd(gameFrameCount, 'back');
  }
  player.prevBackPressed = backPressed;
  
  // Combo detection: forward, forward → dash
  const fwdPressed = player.facingRight ? input.right : input.left;
  if (fwdPressed && !player.prevFwdPressed) {
    player.recordFwd(gameFrameCount);
    player.recordBackFwd(gameFrameCount, 'fwd');
    if (player.checkDashCombo(gameFrameCount)) {
      player.startDash();
      player.fwdBuffer = [];
    }
  }
  player.prevFwdPressed = fwdPressed;
  
  if (input.up || input.buttonA) {
    player.jump();
  }
  
  if (bPressed && !prevButtonB) {
    if (input.down) {
      player.fireGroundWave();
    } else if (player.checkCombo(gameFrameCount)) {
      player.fireSpecial();
      player.inputBuffer = [];
      player.bfBuffer = [];
    } else if (player.checkBurstCombo(gameFrameCount)) {
      player.fireBurst();
      player.bfBuffer = [];
      player.inputBuffer = [];
    } else {
      player.attack();
    }
  }
  prevButtonB = bPressed;
  
  gameFrameCount++;
}

// =============================================================================
// MAIN GAME INTERFACE
// =============================================================================

const luta = {
  id: 'luta',
  name: 'LUTA',
  difficulty: 4,
  
  init(canvasEl, inputRef) {
    _canvas = canvasEl;
    _inputRef = inputRef;
    state = 'idle';
    
    loadAllSprites();
    
    player = new Fighter(150, 300, 'Brawler-Girl', true);
    enemy = new Fighter(450, 300, 'Enemy-Punk', false);
    
    initBackground();
    initAudio();
  },
  
  update(dt) {
    updateBossCinematic();

    if (state === 'idle') {
      // Advance sprite animation for idle display
      if (player) {
        player.vx = 0;
        const pDef = SPRITE_DEFS[player.charName].animations.idle;
        player.spriteTimer++;
        if (player.spriteTimer >= pDef.speed) {
          player.spriteTimer = 0;
          player.spriteFrame = (player.spriteFrame + 1) % pDef.count;
        }
      }
      if (enemy) {
        enemy.vx = 0;
        const eDef = SPRITE_DEFS[enemy.charName].animations.idle;
        enemy.spriteTimer++;
        if (enemy.spriteTimer >= eDef.speed) {
          enemy.spriteTimer = 0;
          enemy.spriteFrame = (enemy.spriteFrame + 1) % eDef.count;
        }
      }
      
      if (_inputRef) {
        const input = _inputRef;
        if (input.buttonA || input.buttonB || input.up || input.down || input.left || input.right) {
          startGame();
        }
      }
      return;
    }
    
    if (state === 'playing') {
      if (p1SuperFx) {
        updateP1Super();
        if (player) { player.vx = 0; player.dashing = false; }
        if (enemy) enemy.vx = 0;
        player.update(dt);
        enemy.update(dt);
        checkWinCondition();
      } else {
      handleInput();
      
      player.update(dt);
      enemy.update(dt);

      if (player && enemy && !player.dashing) {
        const overlap = (player.x + player.w) - enemy.x;
        const overlapR = (enemy.x + enemy.w) - player.x;
        const minOverlap = Math.min(overlap, overlapR);
        if (overlap > 0 && overlapR > 0 && minOverlap > 0) {
          const push = minOverlap / 2 + 1;
          if (player.x < enemy.x) {
            player.x -= push;
            enemy.x += push;
          } else {
            player.x += push;
            enemy.x -= push;
          }
          if (player.x < 10) player.x = 10;
          if (player.x > W - player.w - 10) player.x = W - player.w - 10;
          if (enemy.x < 10) enemy.x = 10;
          if (enemy.x > W - enemy.w - 10) enemy.x = W - enemy.w - 10;
        }
      }
      
      updateEnemyAI(dt);
      
      if (checkHit(player, enemy)) {
        enemy.takeHit(scaleP1Damage(P1_ATTACK_DAMAGE));
        superMeter = Math.min(SUPER_MAX, superMeter + 8);
      }
      if (checkHit(enemy, player)) {
        const dmg = bossPhase >= 2 ? P2_PHASE2_DAMAGE : P2_ATTACK_DAMAGE;
        player.takeHit(dmg);
        superMeter = Math.min(SUPER_MAX, superMeter + 5);
      }

      projectiles.forEach(p => {
        p.update();
        if (!p.alive) return;
        if (p.exploding) return;
        const target = p.owner === player ? enemy : player;
        const pBox = p.getBox();
        const tBox = { x: target.x, y: target.y, w: target.w, h: target.h };
        if (checkCollision(pBox, tBox)) {
          const projDmg = p.owner === enemy ? P2_RANGED_DAMAGE : scaleP1Damage(P1_SPECIAL_DAMAGE);
          target.takeHit(projDmg);
          if (p.owner === enemy) {
            p.exploding = true;
            p.explodeFrame = 0;
            p.explodeTick = 0;
          } else {
            p.alive = false;
          }
          if (p.owner === player) superMeter = Math.min(SUPER_MAX, superMeter + 12);
        }
      });

      energyFields.forEach(ef => ef.update());
      energyFields = energyFields.filter(ef => ef.alive);
      projectiles = projectiles.filter(p => p.alive);
      groundWaves.forEach(gw => gw.update());
      groundWaves.forEach(gw => {
        if (!gw.alive || gw.hitDone || !enemy) return;
        const gBox = gw.getBox();
        const eBox = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
        if (checkCollision(gBox, eBox)) {
          enemy.takeHit(scaleP1Damage(GROUND_WAVE_DAMAGE));
          gw.hitDone = true;
          superMeter = Math.min(SUPER_MAX, superMeter + 10);
        }
      });
      groundWaves = groundWaves.filter(gw => gw.alive);

      bossTraps.forEach(bt => bt.update());
      bossTraps = bossTraps.filter(bt => bt.alive);

      bossPowers.forEach(bp => bp.update());
      bossPowers = bossPowers.filter(bp => bp.alive);
      
      timerFrame++;
      if (timerFrame >= 60) {
        timerFrame = 0;
        battleTimer--;
        if (battleTimer < 0) battleTimer = 0;
      }
      
      checkWinCondition();
      }
    }

    if (state === 'pre_phase2') {
      updatePrePhase2();
      if (player) {
        player.vx = 0;
        player.dashing = false;
      }
      if (enemy) enemy.vx = 0;
      if (player) player.update(dt);
      if (enemy) enemy.update(dt);
      return;
    }
    
    if (state === 'phase_transition') {
      bgOffset++;
      updatePhaseTransition();
      return;
    }

    if (state === 'dying') {
      bgOffset++;
      updateDeathExplosion();

      if (!deathExplosion || deathExplosion.timer > 60) {
        deathExplosion = null;
        if (p1Lives <= 0) {
          state = 'lost';
        } else {
          respawnPlayer();
          state = 'playing';
        }
      }
    }
    
    if (state === 'won') {
      bgOffset++;
      victoryTimer++;
      if (player) {
        const pDef = SPRITE_DEFS[player.charName].animations.idle;
        player.spriteTimer++;
        if (player.spriteTimer >= pDef.speed) {
          player.spriteTimer = 0;
          player.spriteFrame = (player.spriteFrame + 1) % pDef.count;
        }
      }
      victoryParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      });
    }
    
    if (state === 'lost') {
      bgOffset++;
      updateDeathExplosion();

      if (deathExplosion && deathExplosion.particles.length === 0) {
        deathExplosion = null;
      }

      if (_inputRef && (!deathExplosion || deathExplosion.timer > 60)) {
        const input = _inputRef;
        if (input.buttonA || input.buttonB || input.up || input.down || input.left || input.right) {
          deathExplosion = null;
          startGame();
        }
      }
    }
  },
  
  render(renderCtx) {
    if (state === 'idle') {
      this.renderIdle(renderCtx);
      return;
    }
    
    renderBackground(renderCtx);
    
    // Render boss traps (below fighters)
    bossTraps.forEach(bt => bt.render(renderCtx));

    // Render fighters
    if (enemy) enemy.render(renderCtx);
    if (player) player.render(renderCtx);

    // Render stun effect on player
    if (player && player.stunTimer > 0) {
      const sx = player.x + player.w / 2;
      const sy = player.y + 5;
      const stunAlpha = 0.3 + 0.3 * Math.sin(player.stunTimer * 0.3);
      renderCtx.save();
      renderCtx.strokeStyle = `rgba(255,0,100,${stunAlpha})`;
      renderCtx.lineWidth = 1;
      renderCtx.shadowColor = '#ff0066';
      renderCtx.shadowBlur = 6;
      for (let i = 0; i < 3; i++) {
        const r = 12 + i * 6;
        const a = player.stunTimer * 0.15 + i * 2;
        renderCtx.beginPath();
        renderCtx.arc(sx + Math.cos(a) * 4, sy + Math.sin(a) * 2, r, 0, Math.PI * 2);
        renderCtx.stroke();
      }
      // Electric zaps around player
      renderCtx.strokeStyle = `rgba(255,100,200,${0.4 + 0.3 * Math.sin(player.stunTimer * 0.5)})`;
      renderCtx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 / 4) * i + player.stunTimer * 0.2;
        const r1 = 8;
        const r2 = 18 + Math.random() * 8;
        renderCtx.beginPath();
        renderCtx.moveTo(sx + Math.cos(angle) * r1, sy + Math.sin(angle) * r1);
        const midX = sx + Math.cos(angle + 0.3) * (r1 + r2) / 2;
        const midY = sy + Math.sin(angle - 0.2) * (r1 + r2) / 2;
        renderCtx.lineTo(midX, midY);
        renderCtx.lineTo(sx + Math.cos(angle) * r2, sy + Math.sin(angle) * r2);
        renderCtx.stroke();
      }
      renderCtx.restore();
    }

    if (state === 'pre_phase2') {
      renderPrePhase2Explosions(renderCtx);
    }
    
    // Render projectiles and boss powers
    projectiles.forEach(p => p.render(renderCtx));
    groundWaves.forEach(gw => gw.render(renderCtx));
    energyFields.forEach(ef => ef.render(renderCtx));
    bossPowers.forEach(bp => bp.render(renderCtx));
    renderBossCinematic(renderCtx);
    
    // Phase transition overlay
    if (state === 'phase_transition') {
      renderPhaseTransition(renderCtx);
      return;
    }

    // Render HUD
    if (state === 'playing' || state === 'pre_phase2' || state === 'dying') {
      renderHUD(renderCtx);
    }

    if (p1SuperFx && state === 'playing') {
      renderP1Super(renderCtx);
    }
    
    // Dying explosion
    if (state === 'dying' && deathExplosion) {
      if (deathExplosion.timer < 6) {
        renderCtx.save();
        renderCtx.globalAlpha = 1 - deathExplosion.timer / 6;
        renderCtx.fillStyle = '#fff';
        renderCtx.fillRect(0, 0, W, H);
        renderCtx.restore();
      }
      renderDeathExplosion(renderCtx);
      
      if (deathExplosion.timer < 30) {
        renderCtx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = 0; y < H; y += 2) {
          renderCtx.fillRect(0, y, W, 1);
        }
      }
    }
    
    // Victory screen — Cyberpunk
    if (state === 'won') {
      const vt = victoryTimer;
      const fadeIn = Math.min(1, vt / 30);
      const cx = W / 2;
      const cy = H / 2;

      // Dark overlay with fade
      renderCtx.fillStyle = `rgba(0, 0, 10, ${0.75 * fadeIn})`;
      renderCtx.fillRect(0, 0, W, H);

      // Flash at start
      if (vt < 8) {
        renderCtx.save();
        renderCtx.globalAlpha = 1 - vt / 8;
        renderCtx.fillStyle = '#0ff';
        renderCtx.fillRect(0, 0, W, H);
        renderCtx.restore();
      }

      // Floating particles
      victoryParticles.forEach(p => {
        const tw = 0.4 + 0.4 * Math.sin(vt * 0.06 + p.twinkle);
        renderCtx.save();
        renderCtx.globalAlpha = tw * fadeIn;
        renderCtx.shadowColor = p.color;
        renderCtx.shadowBlur = 6;
        renderCtx.fillStyle = p.color;
        renderCtx.fillRect(p.x, p.y, p.size, p.size);
        renderCtx.restore();
      });

      // Horizontal glitch bars
      if (fadeIn >= 1) {
        renderCtx.save();
        for (let i = 0; i < 4; i++) {
          if (Math.sin(vt * 0.15 + i * 2) > 0.85) {
            const gy = Math.random() * H;
            const gh = 1 + Math.random() * 3;
            renderCtx.globalAlpha = 0.08 + Math.random() * 0.06;
            renderCtx.fillStyle = Math.random() > 0.5 ? '#0ff' : '#f0f';
            renderCtx.fillRect(0, gy, W, gh);
          }
        }
        renderCtx.restore();
      }

      // Neon frame around center
      const frameW = 340;
      const frameH = 120;
      const fx = cx - frameW / 2;
      const fy = cy - frameH / 2 - 10;
      const framePulse = 0.6 + 0.4 * Math.sin(vt * 0.06);

      renderCtx.save();
      renderCtx.globalAlpha = fadeIn;
      renderCtx.strokeStyle = `rgba(0,255,255,${0.3 * framePulse})`;
      renderCtx.shadowColor = '#0ff';
      renderCtx.shadowBlur = 12 * framePulse;
      renderCtx.lineWidth = 1.5;
      renderCtx.strokeRect(fx, fy, frameW, frameH);
      renderCtx.shadowBlur = 0;

      // Corner accents
      const cLen = 14;
      renderCtx.lineWidth = 2;
      renderCtx.strokeStyle = '#0ff';
      renderCtx.globalAlpha = fadeIn * 0.8;
      renderCtx.beginPath(); renderCtx.moveTo(fx, fy + cLen); renderCtx.lineTo(fx, fy); renderCtx.lineTo(fx + cLen, fy); renderCtx.stroke();
      renderCtx.beginPath(); renderCtx.moveTo(fx + frameW - cLen, fy); renderCtx.lineTo(fx + frameW, fy); renderCtx.lineTo(fx + frameW, fy + cLen); renderCtx.stroke();
      renderCtx.strokeStyle = '#f0f';
      renderCtx.beginPath(); renderCtx.moveTo(fx, fy + frameH - cLen); renderCtx.lineTo(fx, fy + frameH); renderCtx.lineTo(fx + cLen, fy + frameH); renderCtx.stroke();
      renderCtx.beginPath(); renderCtx.moveTo(fx + frameW - cLen, fy + frameH); renderCtx.lineTo(fx + frameW, fy + frameH); renderCtx.lineTo(fx + frameW, fy + frameH - cLen); renderCtx.stroke();
      renderCtx.restore();

      // Main text — "VICTORY"
      if (fadeIn >= 0.5) {
        const textAlpha = Math.min(1, (fadeIn - 0.5) * 2);
        const glitchX = Math.sin(vt * 0.25) > 0.92 ? (Math.random() - 0.5) * 8 : 0;
        const glitchY = Math.sin(vt * 0.35) > 0.95 ? (Math.random() - 0.5) * 4 : 0;

        renderCtx.save();
        renderCtx.textAlign = 'center';
        renderCtx.font = 'bold 56px monospace';

        // Chromatic aberration
        renderCtx.globalAlpha = textAlpha * 0.2;
        renderCtx.fillStyle = '#ff0000';
        renderCtx.fillText('VICTORY', cx - 2.5 + glitchX, cy - 8 + glitchY);
        renderCtx.fillStyle = '#0000ff';
        renderCtx.fillText('VICTORY', cx + 2.5 + glitchX, cy - 8 + glitchY);

        // Main glow text
        renderCtx.globalAlpha = textAlpha;
        renderCtx.shadowColor = '#0ff';
        renderCtx.shadowBlur = 25 * framePulse;
        renderCtx.fillStyle = '#0ff';
        renderCtx.fillText('VICTORY', cx + glitchX, cy - 8 + glitchY);
        renderCtx.shadowBlur = 0;

        // White overlay for shine
        renderCtx.globalAlpha = textAlpha * 0.35;
        renderCtx.fillStyle = '#fff';
        renderCtx.fillText('VICTORY', cx + glitchX, cy - 8 + glitchY);
        renderCtx.restore();
      }

      // Sub label — decorative line + text
      if (fadeIn >= 0.8) {
        const subAlpha = Math.min(1, (fadeIn - 0.8) * 5);

        renderCtx.save();
        renderCtx.globalAlpha = subAlpha * 0.4;
        renderCtx.strokeStyle = '#f0f';
        renderCtx.shadowColor = '#f0f';
        renderCtx.shadowBlur = 6;
        renderCtx.lineWidth = 1;
        renderCtx.beginPath();
        renderCtx.moveTo(cx - 100, cy + 20);
        renderCtx.lineTo(cx + 100, cy + 20);
        renderCtx.stroke();
        renderCtx.shadowBlur = 0;
        renderCtx.restore();

        renderCtx.save();
        renderCtx.textAlign = 'center';
        renderCtx.font = '10px monospace';
        renderCtx.fillStyle = '#f0f';
        renderCtx.globalAlpha = subAlpha * (0.4 + 0.3 * Math.sin(vt * 0.04));
        renderCtx.fillText('[ ENEMY TERMINATED ]', cx, cy + 34);
        renderCtx.restore();
      }

      // "Press any button" blink
      if (vt > 60) {
        renderCtx.save();
        renderCtx.textAlign = 'center';
        renderCtx.font = '12px monospace';
        renderCtx.fillStyle = '#fff';
        renderCtx.globalAlpha = 0.4 + 0.4 * Math.sin(vt * 0.06);
        renderCtx.fillText('Press any button to continue', cx, cy + 55);
        renderCtx.textAlign = 'left';
        renderCtx.restore();
      }

      // Scanlines
      renderCtx.save();
      renderCtx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let y = 0; y < H; y += 3) {
        renderCtx.fillRect(0, y, W, 1);
      }
      renderCtx.restore();
    }
    
    // Game Over screen
    if (state === 'lost') {
      const expProgress = deathExplosion ? Math.min(1, deathExplosion.timer / 40) : 1;
      renderCtx.fillStyle = `rgba(0, 0, 0, ${0.8 * expProgress})`;
      renderCtx.fillRect(0, 0, W, H);

      // Flash on explosion start
      if (deathExplosion && deathExplosion.timer < 6) {
        renderCtx.save();
        renderCtx.globalAlpha = 1 - deathExplosion.timer / 6;
        renderCtx.fillStyle = '#fff';
        renderCtx.fillRect(0, 0, W, H);
        renderCtx.restore();
      }

      renderDeathExplosion(renderCtx);

      // Show text after explosion settles
      if (!deathExplosion || deathExplosion.timer > 50) {
        const textAlpha = deathExplosion ? Math.min(1, (deathExplosion.timer - 50) / 20) : 1;
        const t = bgOffset;
        const pulse = 0.7 + 0.3 * Math.sin(t * 0.08);

        renderCtx.save();
        renderCtx.globalAlpha = textAlpha;
        renderCtx.textAlign = 'center';

        // Glitch offset
        const glitchX = Math.sin(t * 0.3) > 0.9 ? (Math.random() - 0.5) * 6 : 0;

        // Chromatic aberration
        renderCtx.font = 'bold 52px monospace';
        renderCtx.globalAlpha = textAlpha * 0.25;
        renderCtx.fillStyle = '#ff0000';
        renderCtx.fillText('GAME OVER', W / 2 - 2 + glitchX, H / 2 - 20);
        renderCtx.fillStyle = '#0000ff';
        renderCtx.fillText('GAME OVER', W / 2 + 2 + glitchX, H / 2 - 20);

        renderCtx.globalAlpha = textAlpha;
        renderCtx.shadowColor = '#ff0033';
        renderCtx.shadowBlur = 20 * pulse;
        renderCtx.fillStyle = '#ff0033';
        renderCtx.fillText('GAME OVER', W / 2 + glitchX, H / 2 - 20);
        renderCtx.shadowBlur = 0;

        renderCtx.fillStyle = '#fff';
        renderCtx.font = '16px monospace';
        renderCtx.globalAlpha = textAlpha * (0.5 + 0.5 * Math.sin(t * 0.05));
        renderCtx.fillText('Press any button to retry', W / 2, H / 2 + 40);
        renderCtx.textAlign = 'left';
        renderCtx.restore();
      }

      // Scanlines during explosion
      if (deathExplosion && deathExplosion.timer < 30) {
        renderCtx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = 0; y < H; y += 2) {
          renderCtx.fillRect(0, y, W, 1);
        }
      }
    }
  },
  
  renderIdle(renderCtx) {
    renderBackground(renderCtx);

    const t = bgOffset;
    const pulse = 0.55 + 0.45 * Math.sin(t * 0.07);
    const cx = W / 2;
    const panelY = H / 2 - 102;
    const panelH = 184;

    renderCtx.save();

    // Cinematic dark panel
    const panelGrad = renderCtx.createLinearGradient(0, panelY, 0, panelY + panelH);
    panelGrad.addColorStop(0, 'rgba(6, 4, 22, 0.8)');
    panelGrad.addColorStop(0.5, 'rgba(12, 8, 30, 0.86)');
    panelGrad.addColorStop(1, 'rgba(3, 2, 14, 0.82)');
    renderCtx.fillStyle = panelGrad;
    renderCtx.fillRect(0, panelY, W, panelH);

    // Neon frame
    renderCtx.strokeStyle = `rgba(0,255,255,${0.25 + 0.2 * pulse})`;
    renderCtx.lineWidth = 1.6;
    renderCtx.shadowColor = '#00ffff';
    renderCtx.shadowBlur = 12 * pulse;
    renderCtx.strokeRect(14, panelY + 14, W - 28, panelH - 28);
    renderCtx.shadowBlur = 0;
    renderCtx.strokeStyle = `rgba(255,0,200,${0.2 + 0.16 * pulse})`;
    renderCtx.lineWidth = 1;
    renderCtx.strokeRect(20, panelY + 20, W - 40, panelH - 40);

    // Occasional glitch bars
    for (let i = 0; i < 3; i++) {
      if (Math.sin(t * 0.19 + i * 1.7) > 0.78) {
        const gy = panelY + 26 + ((t * (1.8 + i * 0.25) + i * 29) % (panelH - 52));
        renderCtx.globalAlpha = 0.12 + i * 0.03;
        renderCtx.fillStyle = i % 2 ? '#ff00b7' : '#00ffff';
        renderCtx.fillRect(22, gy, W - 44, 2 + (i % 2));
      }
    }
    renderCtx.globalAlpha = 1;

    // Subtitle
    renderCtx.textAlign = 'center';
    renderCtx.font = '10px monospace';
    renderCtx.fillStyle = `rgba(170,255,255,${0.7 + 0.25 * pulse})`;
    renderCtx.fillText('CYBERPUNK ARENA PROTOCOL v2.0', cx, panelY + 34);

    // Main title with chromatic glitch
    const glitchX = Math.sin(t * 0.22) > 0.9 ? (Math.random() - 0.5) * 6 : 0;
    const glitchY = Math.sin(t * 0.28) > 0.94 ? (Math.random() - 0.5) * 3 : 0;
    renderCtx.font = 'bold 58px monospace';
    renderCtx.globalAlpha = 0.24;
    renderCtx.fillStyle = '#ff0048';
    renderCtx.fillText('GLITCH FIGHTERS', cx - 2 + glitchX, panelY + 94 + glitchY);
    renderCtx.fillStyle = '#003bff';
    renderCtx.fillText('GLITCH FIGHTERS', cx + 2 + glitchX, panelY + 94 + glitchY);

    renderCtx.globalAlpha = 1;
    renderCtx.shadowColor = '#00ffff';
    renderCtx.shadowBlur = 22 * pulse;
    renderCtx.fillStyle = `rgba(170,255,255,${0.86 + 0.14 * pulse})`;
    renderCtx.fillText('GLITCH FIGHTERS', cx + glitchX, panelY + 94 + glitchY);
    renderCtx.shadowBlur = 0;

    renderCtx.globalAlpha = 0.35;
    renderCtx.fillStyle = '#ffffff';
    renderCtx.fillText('GLITCH FIGHTERS', cx + glitchX, panelY + 94 + glitchY);
    renderCtx.globalAlpha = 1;

    // Flavor text
    renderCtx.font = '12px monospace';
    renderCtx.fillStyle = `rgba(255,140,240,${0.65 + 0.25 * Math.sin(t * 0.09)})`;
    renderCtx.fillText('BRAWL. BREAK. BECOME DATA.', cx, panelY + 122);

    // Start prompt
    const promptA = 0.42 + 0.5 * Math.sin(t * 0.11);
    renderCtx.font = '15px monospace';
    renderCtx.fillStyle = `rgba(255,255,255,${promptA})`;
    renderCtx.fillText('Press any button to enter the arena', cx, panelY + 154);

    renderCtx.restore();
    renderCtx.textAlign = 'left';
  },
  
  getState() {
    return state;
  },
  
  reset() {
    state = 'playing';
    battleTimer = 60;
    timerFrame = 0;
    gameFrameCount = 0;
    projectiles = [];
    energyFields = [];
    bossTraps = [];
    bossTrapTimer = 0;
    bossPowers = [];
    bossPowerTimer = 0;
    p1Lives = P1_MAX_LIVES;
    superMeter = 0;
    p1SuperFx = null;
    prevButtonX = false;
    showBossPhase2Background = false;
    bossPhase = 1;
    phaseTransition = null;
    
    player = new Fighter(150, 300, 'Brawler-Girl', true);
    enemy = new Fighter(450, 300, 'Enemy-Punk', false);
    
    initBackground();
  },
  
  destroy() {
    _canvas = null;
    _inputRef = null;
    player = null;
    enemy = null;
    state = 'idle';
    
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  }
};

export default luta;
