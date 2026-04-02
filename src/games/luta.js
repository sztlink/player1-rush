// luta.js — Fighting game adaptado do Chris Courses para Totem CRT
// Mecânica: Player vs Enemy AI, gravidade, combate, health bars

const W = 640;
const H = 480;
const GRAVITY = 0.5;
const GROUND_Y = 380;
const PLAYER_SPEED = 4;
const AI_SPEED = 2.5;
const JUMP_VEL = -13;
const ATTACK_DAMAGE = 20;
const ATTACK_COOLDOWN = 30;

// Estado global do jogo
let state = 'idle'; // 'idle' | 'playing' | 'won'
let _canvas = null;
let _inputRef = null;

// Entidades
let player = null;
let enemy = null;

// IA
let aiAttackTimer = 0;
let aiJumpTimer = 0;

// Audio context
let audioCtx = null;

// Timer de batalha
let battleTimer = 60;
let timerFrame = 0;

// Background animation
let bgStars = [];
let bgOffset = 0;

// =============================================================================
// CLASSES
// =============================================================================

class Fighter {
  constructor(x, y, color, isPlayer = true) {
    this.x = x;
    this.y = y;
    this.w = 40;
    this.h = 70;
    this.vx = 0;
    this.vy = 0;
    this.color = color;
    this.isPlayer = isPlayer;
    
    this.health = 100;
    this.maxHealth = 100;
    
    this.attacking = false;
    this.attackFrame = 0;
    this.attackCooldown = 0;
    
    this.hitFlicker = 0;
    this.onGround = false;
    
    // Animation
    this.animFrame = 0;
    this.animTimer = 0;
    
    // Attack box
    this.attackBox = {
      x: 0,
      y: 0,
      w: 60,
      h: 40
    };
  }
  
  update(dt) {
    // Gravity
    if (this.y + this.h < GROUND_Y) {
      this.vy += GRAVITY;
      this.onGround = false;
    } else {
      this.y = GROUND_Y - this.h;
      this.vy = 0;
      this.onGround = true;
    }
    
    // Movement
    this.x += this.vx;
    this.y += this.vy;
    
    // Bounds
    if (this.x < 10) this.x = 10;
    if (this.x > W - this.w - 10) this.x = W - this.w - 10;
    
    // Attack cooldown
    if (this.attackCooldown > 0) this.attackCooldown--;
    
    // Attack animation
    if (this.attacking) {
      this.attackFrame++;
      if (this.attackFrame > 15) {
        this.attacking = false;
        this.attackFrame = 0;
      }
    }
    
    // Hit flicker
    if (this.hitFlicker > 0) this.hitFlicker--;
    
    // Idle animation
    this.animTimer++;
    if (this.animTimer % 8 === 0) {
      this.animFrame = (this.animFrame + 1) % 4;
    }
    
    // Update attack box position
    this.updateAttackBox();
  }
  
  updateAttackBox() {
    // Attack box à frente do fighter
    this.attackBox.x = this.x + (this.vx >= 0 ? this.w : -this.attackBox.w);
    this.attackBox.y = this.y + 15;
  }
  
  attack() {
    if (this.attackCooldown > 0 || this.attacking) return;
    this.attacking = true;
    this.attackFrame = 0;
    this.attackCooldown = ATTACK_COOLDOWN;
    sndPunch();
  }
  
  jump() {
    if (!this.onGround) return;
    this.vy = JUMP_VEL;
    sndJump();
  }
  
  takeHit(damage) {
    this.health -= damage;
    if (this.health < 0) this.health = 0;
    this.hitFlicker = 10;
    sndHit();
  }
  
  render(ctx) {
    ctx.save();
    
    // Flicker quando leva hit
    if (this.hitFlicker > 0 && this.hitFlicker % 4 < 2) {
      ctx.globalAlpha = 0.3;
    }
    
    // Corpo principal
    ctx.fillStyle = this.color;
    
    // Idle breathing animation
    const breathOffset = Math.sin(this.animFrame * 0.5) * 2;
    
    // Pernas
    ctx.fillRect(this.x + 10, this.y + this.h - 25, 8, 25);
    ctx.fillRect(this.x + 22, this.y + this.h - 25, 8, 25);
    
    // Corpo
    ctx.fillRect(this.x + 5, this.y + 20 + breathOffset, 30, 35);
    
    // Cabeça
    ctx.fillRect(this.x + 8, this.y + breathOffset, 24, 24);
    
    // Olhos (detalhes)
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x + 12, this.y + 8 + breathOffset, 4, 4);
    ctx.fillRect(this.x + 24, this.y + 8 + breathOffset, 4, 4);
    
    // Braços
    ctx.fillStyle = this.color;
    if (this.attacking && this.attackFrame < 8) {
      // Braço estendido quando atacando
      ctx.fillRect(this.x + (this.vx >= 0 ? 35 : -15), this.y + 25, 15, 8);
    } else {
      ctx.fillRect(this.x - 5, this.y + 25, 8, 20);
      ctx.fillRect(this.x + 37, this.y + 25, 8, 20);
    }
    
    // Attack aura
    if (this.attacking && this.attackFrame < 10) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 - (this.attackFrame / 15);
      ctx.strokeRect(
        this.x - 5 - this.attackFrame,
        this.y - 5 - this.attackFrame,
        this.w + 10 + this.attackFrame * 2,
        this.h + 10 + this.attackFrame * 2
      );
    }
    
    ctx.restore();
    
    // Debug: Attack box (comentado)
    // if (this.attacking && this.attackFrame >= 3 && this.attackFrame <= 8) {
    //   ctx.strokeStyle = '#ff0';
    //   ctx.lineWidth = 2;
    //   ctx.strokeRect(this.attackBox.x, this.attackBox.y, this.attackBox.w, this.attackBox.h);
    // }
  }
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
  if (attacker.attackFrame < 3 || attacker.attackFrame > 8) return false;
  
  const attackBox = attacker.attackBox;
  const defenderBox = { x: defender.x, y: defender.y, w: defender.w, h: defender.h };
  
  return checkCollision(attackBox, defenderBox);
}

// =============================================================================
// ENEMY AI
// =============================================================================

function updateEnemyAI(dt) {
  if (!enemy || state !== 'playing') return;
  
  // Reset velocity
  enemy.vx = 0;
  
  // Mover em direção ao player
  const distX = player.x - enemy.x;
  if (Math.abs(distX) > 100) {
    enemy.vx = distX > 0 ? AI_SPEED : -AI_SPEED;
  } else if (Math.abs(distX) > 50) {
    enemy.vx = distX > 0 ? AI_SPEED * 0.5 : -AI_SPEED * 0.5;
  }
  
  // Atacar quando próximo
  aiAttackTimer--;
  if (aiAttackTimer <= 0 && Math.abs(distX) < 120 && Math.abs(distX) > 40) {
    enemy.attack();
    aiAttackTimer = 90 + Math.random() * 60;
  }
  
  // Pular às vezes (evitar ou aproximar)
  aiJumpTimer--;
  if (aiJumpTimer <= 0) {
    if (Math.random() < 0.3 && enemy.onGround) {
      enemy.jump();
    }
    aiJumpTimer = 60 + Math.random() * 120;
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
// BACKGROUND
// =============================================================================

function initBackground() {
  bgStars = [];
  for (let i = 0; i < 30; i++) {
    bgStars.push({
      x: Math.random() * W,
      y: Math.random() * (GROUND_Y - 50),
      size: Math.random() * 2 + 1,
      speed: Math.random() * 0.3 + 0.1
    });
  }
}

function renderBackground(ctx) {
  // Gradient sky
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#050510');
  grad.addColorStop(0.6, '#0a0020');
  grad.addColorStop(1, '#0f0030');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  
  // Stars
  ctx.fillStyle = '#fff';
  bgStars.forEach(star => {
    ctx.globalAlpha = 0.3 + Math.sin(bgOffset * star.speed) * 0.2;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
  ctx.globalAlpha = 1;
  
  // Perspective grid lines
  ctx.strokeStyle = '#0ff';
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const x = i * 80 + (bgOffset % 80);
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  
  // Ground line with glow
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  // Ground reflection effect
  ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  
  bgOffset += 0.5;
}

// =============================================================================
// HUD
// =============================================================================

function renderHUD(ctx) {
  // Health bars background
  ctx.fillStyle = '#222';
  ctx.fillRect(20, 20, 200, 20);
  ctx.fillRect(W - 220, 20, 200, 20);
  
  // Player health
  const playerHealthWidth = (player.health / player.maxHealth) * 200;
  const playerGrad = ctx.createLinearGradient(20, 20, 220, 20);
  playerGrad.addColorStop(0, '#0ff');
  playerGrad.addColorStop(1, '#0f0');
  ctx.fillStyle = playerGrad;
  ctx.fillRect(20, 20, playerHealthWidth, 20);
  
  // Enemy health
  const enemyHealthWidth = (enemy.health / enemy.maxHealth) * 200;
  const enemyGrad = ctx.createLinearGradient(W - 220, 20, W - 20, 20);
  enemyGrad.addColorStop(0, '#f0f');
  enemyGrad.addColorStop(1, '#f00');
  ctx.fillStyle = enemyGrad;
  ctx.fillRect(W - 220, 20, enemyHealthWidth, 20);
  
  // Health bar borders
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 200, 20);
  ctx.strokeRect(W - 220, 20, 200, 20);
  
  // Player name
  ctx.fillStyle = '#0ff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('PLAYER', 22, 55);
  
  // Enemy name
  ctx.fillStyle = '#f0f';
  ctx.fillText('ENEMY', W - 75, 55);
  
  // Timer
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(battleTimer.toString().padStart(2, '0'), W / 2, 35);
  ctx.textAlign = 'left';
}

// =============================================================================
// GAME LOGIC
// =============================================================================

function startGame() {
  state = 'playing';
  battleTimer = 60;
  timerFrame = 0;
  
  // Reset fighters
  player = new Fighter(100, 200, '#0ff', true);
  enemy = new Fighter(500, 200, '#f0f', false);
  
  aiAttackTimer = 90;
  aiJumpTimer = 60;
  
  initBackground();
  initAudio();
}

function respawnPlayer() {
  player.health = player.maxHealth;
  player.x = 100;
  player.y = 200;
  player.vx = 0;
  player.vy = 0;
  player.attacking = false;
  player.hitFlicker = 0;
  sndRespawn();
}

function checkWinCondition() {
  if (enemy.health <= 0) {
    state = 'won';
    sndVictory();
    return true;
  }
  
  if (player.health <= 0) {
    respawnPlayer();
    return true;
  }
  
  if (battleTimer <= 0) {
    // Time up — player wins if has more health
    if (player.health >= enemy.health) {
      state = 'won';
      sndVictory();
    } else {
      respawnPlayer();
    }
    return true;
  }
  
  return false;
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

function handleInput() {
  if (!_inputRef || state !== 'playing') return;
  
  const input = _inputRef;
  
  // Reset velocity
  player.vx = 0;
  
  // Movement
  if (input.left) {
    player.vx = -PLAYER_SPEED;
  }
  if (input.right) {
    player.vx = PLAYER_SPEED;
  }
  
  // Jump
  if (input.up || input.buttonA) {
    player.jump();
  }
  
  // Attack
  if (input.down || input.buttonB) {
    player.attack();
  }
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
    
    // Create fighters for idle state
    player = new Fighter(150, 200, '#0ff', true);
    enemy = new Fighter(450, 200, '#f0f', false);
    
    initBackground();
    initAudio();
  },
  
  update(dt) {
    if (state === 'idle') {
      // Idle animation
      player.animTimer++;
      enemy.animTimer++;
      if (player.animTimer % 8 === 0) {
        player.animFrame = (player.animFrame + 1) % 4;
        enemy.animFrame = (enemy.animFrame + 1) % 4;
      }
      
      // Start on any button press
      if (_inputRef) {
        const input = _inputRef;
        if (input.buttonA || input.buttonB || input.up || input.down || input.left || input.right) {
          startGame();
        }
      }
      return;
    }
    
    if (state === 'playing') {
      // Handle input
      handleInput();
      
      // Update entities
      player.update(dt);
      enemy.update(dt);
      
      // Enemy AI
      updateEnemyAI(dt);
      
      // Collision detection
      if (checkHit(player, enemy)) {
        enemy.takeHit(ATTACK_DAMAGE);
      }
      if (checkHit(enemy, player)) {
        player.takeHit(ATTACK_DAMAGE);
      }
      
      // Timer
      timerFrame++;
      if (timerFrame >= 60) {
        timerFrame = 0;
        battleTimer--;
        if (battleTimer < 0) battleTimer = 0;
      }
      
      // Check win/lose
      checkWinCondition();
    }
    
    if (state === 'won') {
      // Victory animation
      enemy.animTimer++;
      if (enemy.animTimer % 8 === 0) {
        enemy.animFrame = (enemy.animFrame + 1) % 4;
      }
    }
  },
  
  render(renderCtx) {
    if (state === 'idle') {
      this.renderIdle(renderCtx);
      return;
    }
    
    renderBackground(renderCtx);
    
    // Render fighters
    if (enemy) enemy.render(renderCtx);
    if (player) player.render(renderCtx);
    
    // Render HUD
    if (state === 'playing') {
      renderHUD(renderCtx);
    }
    
    // Victory screen
    if (state === 'won') {
      renderCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      renderCtx.fillRect(0, 0, W, H);
      
      renderCtx.fillStyle = '#0ff';
      renderCtx.font = 'bold 48px monospace';
      renderCtx.textAlign = 'center';
      renderCtx.fillText('VICTORY!', W / 2, H / 2 - 20);
      
      renderCtx.fillStyle = '#fff';
      renderCtx.font = '16px monospace';
      renderCtx.fillText('Press any button to continue', W / 2, H / 2 + 40);
      renderCtx.textAlign = 'left';
    }
  },
  
  renderIdle(renderCtx) {
    renderBackground(renderCtx);
    
    // Render fighters in idle pose
    if (enemy) enemy.render(renderCtx);
    if (player) player.render(renderCtx);
    
    // Title
    renderCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    renderCtx.fillRect(0, H / 2 - 80, W, 140);
    
    renderCtx.fillStyle = '#0ff';
    renderCtx.font = 'bold 64px monospace';
    renderCtx.textAlign = 'center';
    renderCtx.shadowColor = '#0ff';
    renderCtx.shadowBlur = 20;
    renderCtx.fillText('LUTA', W / 2, H / 2);
    renderCtx.shadowBlur = 0;
    
    renderCtx.fillStyle = '#fff';
    renderCtx.font = '18px monospace';
    renderCtx.fillText('Press any button to fight', W / 2, H / 2 + 50);
    renderCtx.textAlign = 'left';
  },
  
  getState() {
    return state;
  },
  
  reset() {
    state = 'playing';
    battleTimer = 60;
    timerFrame = 0;
    
    // Reset to idle fighters
    player = new Fighter(150, 200, '#0ff', true);
    enemy = new Fighter(450, 200, '#f0f', false);
    
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
