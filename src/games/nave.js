/**
 * NAVE — Nível 2 do Totem CRT
 * Space shooter vertical. ~60s por run.
 * 2 ondas de inimigos + boss que patrulha horizontal e verticalmente.
 * Powerups: speed | escudo | star rosa | spread (tiro triplo laranja).
 */

import { PW_SPEED_IMG, PW_SHIELD_IMG, PW_STAR_IMG, PW_SPREAD_IMG, PW_LIFE_IMG } from './nave-powerup-sprites.js';

// ─── ÁUDIO ───────────────────────────────────────────────────
let _ac = null;
function ac() { if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();return _ac; }

let _bgMusic=null;
function startBgMusic(){
  try{
    if(_bgMusic){_bgMusic.play().catch(()=>{});return;}
    _bgMusic=new Audio('/assets/Nave/bg_music.mp3');
    _bgMusic.loop=true;
    _bgMusic.volume=0.35;
    _bgMusic.play().catch(()=>{});
  }catch(e){}
}
function stopBgMusic(){
  if(_bgMusic){_bgMusic.pause();_bgMusic.currentTime=0;_bgMusic.volume=0.35;}
}
function fadeBgMusic(targetVol,durationMs){
  if(!_bgMusic)return;
  const startVol=_bgMusic.volume;
  const diff=targetVol-startVol;
  const steps=Math.ceil(durationMs/50);
  let step=0;
  const iv=setInterval(()=>{
    step++;
    if(!_bgMusic||step>=steps){clearInterval(iv);if(_bgMusic)_bgMusic.volume=targetVol;return;}
    _bgMusic.volume=startVol+diff*(step/steps);
  },50);
}
function sndCarStart(){
  try{
    const a=ac();
    const now=a.currentTime;
    const g=a.createGain();
    g.connect(a.destination);
    g.gain.setValueAtTime(0.3,now);
    g.gain.linearRampToValueAtTime(0.45,now+0.4);
    g.gain.linearRampToValueAtTime(0.25,now+1.2);
    g.gain.linearRampToValueAtTime(0,now+2.2);
    const o=a.createOscillator();
    const f=a.createBiquadFilter();
    f.type='lowpass';f.frequency.value=600;
    o.connect(f);f.connect(g);
    o.type='sawtooth';
    o.frequency.setValueAtTime(45,now);
    o.frequency.linearRampToValueAtTime(80,now+0.3);
    o.frequency.linearRampToValueAtTime(55,now+0.6);
    o.frequency.linearRampToValueAtTime(90,now+0.9);
    o.frequency.linearRampToValueAtTime(110,now+1.4);
    o.frequency.linearRampToValueAtTime(160,now+1.8);
    o.frequency.linearRampToValueAtTime(200,now+2.2);
    o.start(now);o.stop(now+2.3);
    const n=a.createBufferSource();
    const buf=a.createBuffer(1,a.sampleRate*2,a.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1);
    n.buffer=buf;
    const nf=a.createBiquadFilter();
    nf.type='bandpass';nf.frequency.value=200;nf.Q.value=0.5;
    const ng=a.createGain();
    ng.gain.setValueAtTime(0.08,now);
    ng.gain.linearRampToValueAtTime(0.15,now+0.5);
    ng.gain.linearRampToValueAtTime(0.05,now+2.0);
    ng.gain.linearRampToValueAtTime(0,now+2.2);
    n.connect(nf);nf.connect(ng);ng.connect(a.destination);
    n.start(now);n.stop(now+2.3);
  }catch(e){}
}
function sndShoot() {
  const a=ac(),o=a.createOscillator(),g=a.createGain();
  o.connect(g);g.connect(a.destination);o.type='square';
  o.frequency.setValueAtTime(880,a.currentTime);
  o.frequency.exponentialRampToValueAtTime(440,a.currentTime+0.06);
  g.gain.setValueAtTime(0.08,a.currentTime);g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+0.07);
  o.start();o.stop(a.currentTime+0.07);
}
function sndExplosion() {
  const a=ac(),sz=Math.floor(a.sampleRate*0.15),buf=a.createBuffer(1,sz,a.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=(Math.random()*2-1);
  const ns=a.createBufferSource();ns.buffer=buf;
  const f=a.createBiquadFilter();f.type='bandpass';f.frequency.value=300;f.Q.value=0.8;
  const g=a.createGain();g.gain.setValueAtTime(0.4,a.currentTime);g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+0.15);
  ns.connect(f);f.connect(g);g.connect(a.destination);ns.start();ns.stop(a.currentTime+0.15);
}
function sndHit() {
  const a=ac(),o=a.createOscillator(),g=a.createGain();
  o.connect(g);g.connect(a.destination);o.type='sawtooth';
  o.frequency.setValueAtTime(200,a.currentTime);o.frequency.exponentialRampToValueAtTime(60,a.currentTime+0.12);
  g.gain.setValueAtTime(0.2,a.currentTime);g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+0.14);
  o.start();o.stop(a.currentTime+0.14);
}
function sndPowerup() {
  const a=ac();
  [330,440,550,660].forEach((f,i)=>{
    const o=a.createOscillator(),g=a.createGain();
    o.connect(g);g.connect(a.destination);o.type='square';o.frequency.value=f;
    const t=a.currentTime+i*0.07;
    g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
    o.start(t);o.stop(t+0.1);
  });
}
function sndBossEntry() {
  const a=ac();
  [110,90,70,55].forEach((f,i)=>{
    const o=a.createOscillator(),g=a.createGain();
    o.connect(g);g.connect(a.destination);o.type='sawtooth';o.frequency.value=f;
    const t=a.currentTime+i*0.15;
    g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    o.start(t);o.stop(t+0.2);
  });
}
let _warnAudio=null;
function sndBossWarning(){
  try{
    stopBossWarningAudio();
    _warnAudio=new Audio('/assets/Nave/423929__deleted_user_7709760__severe-warning-alarm.wav');
    _warnAudio.volume=0.7;
    _warnAudio.play().catch(()=>{});
  }catch(e){}
}
function stopBossWarningAudio(){
  if(_warnAudio){_warnAudio.pause();_warnAudio.currentTime=0;_warnAudio=null;}
}
function sndVictory() {
  const a=ac();
  [330,440,550,660,880].forEach((f,i)=>{
    const o=a.createOscillator(),g=a.createGain();
    o.connect(g);g.connect(a.destination);o.type='square';o.frequency.value=f;
    const t=a.currentTime+i*0.1;
    g.gain.setValueAtTime(0.15,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.15);
    o.start(t);o.stop(t+0.15);
  });
}

// ─── CONSTANTES ──────────────────────────────────────────────
const W=640, H=480;
const PLAYER_W=74, PLAYER_H=76; // largura um pouco maior (sprite menos “apertado”)
/** Incrementar quando trocar assets/Nave/nave.png (evita cache do browser). */
const PLAYER_SHIP_SPRITE_VER=2;
/** Duração da animação de morte do jogador (só partículas + flash; sem sprite). */
const PLAYER_DEATH_FX_TICKS=78;
/** Incrementar ao trocar inimigo_01–04.png */
const ENEMY_SPRITE_VER=2;
const TOTAL_WAVES=2;           // 2 ondas normais antes do boss
const ENEMIES_W1=10;           // inimigos onda 1
const ENEMIES_W2=14;           // inimigos onda 2
const BOSS_HP=32;
const BOSS_P2_HP=48;
const BOSS_P2_DISPLAY_W=190, BOSS_P2_DISPLAY_H=190;
const BOSS_P2_POWERUP_INTERVAL=60;
/** Incrementar ao trocar assets/Nave/boss.png */
const BOSS_SPRITE_VER=1;
/** Incrementar ao trocar assets/Nave/cuidado.png */
const BOSS_WARNING_IMG_VER=2;
const BOSS_DISPLAY_W=144, BOSS_DISPLAY_H=144; // sprite 128² — escala imponente no ecrã
const BOSS_Y_MARGIN_TOP=8;
const BOSS_Y_MARGIN_BOTTOM=14;
const BOSS_VY=1.35;
/** Frames (~60fps) de aviso antes do boss aparecer */
const BOSS_WARNING_TICKS=180;
const SPAWN_INTERVAL=480;      // ms entre spawns (menor = mais pressão)
const MAX_LIVES=10;            // acertos (tiros/colisões) até reinício total
const STAR_KILL_RADIUS=88;     // raio do power-up rosa (star)
const POWERUP_DROP_CHANCE=0.42;
/** Dois sprites (laranja | cinza); escala variável; poucos no ecrã. */
const ASTEROID_COUNT=5;
const ASTEROID_SPRITE_VER=1;
/** Incrementar ao trocar bg_full.png / bg_nebula_01–02.png */
const BG_PARALLAX_VER=4;

// ─── ESTADO ──────────────────────────────────────────────────
let _ctx, _inputRef, _state='idle';
let _score=0, _wave=0, _frame=0;
let _stars=[], _asteroids=[], _particles=[];
let _player, _bullets=[], _enemies=[], _ebullets=[], _powerups=[];
let _boss=null, _bossAlive=false, _bossPhase=1;
let _waveEnemiesLeft=0, _spawnQueue=0, _spawnTimer=0;
let _playerShield=false, _shieldTimer=0;
let _playerStar=false, _starTimer=0; // zona rosa mata inimigos próximos
let _playerSpeed=false, _speedTimer=0;
let _playerSpread=false, _spreadTimer=0; // tiro triplo + nave tonalizada laranja
let _shootCooldown=0;
let _phase='wave'; // 'wave'|'between'|'boss_warning'|'boss'|'victory_anim'
let _victoryTimer=0;
let _bossWarningTicks=0;
let _lives=MAX_LIVES;
let _gameGen=0; // invalida setTimeouts após reinício
let _playerShipImg=null;
let _imgEnemyShooter=null, _imgEnemyTank=null, _imgEnemyGrunt=null, _imgEnemyZig=null;
let _imgAsteroid01=null, _imgAsteroid02=null;
let _imgBoss=null;
let _imgBossP2=null;
let _imgBossWarning=null;
let _bossTransitionTick=0;
const BOSS_TRANSITION_DURATION=90;
let _imgBgFull=null, _imgBgNebula1=null, _imgBgNebula2=null;
let _deathExplosionCx=0, _deathExplosionCy=0, _deathExplosionTick=0;
let _bossPowerupTimer=0;
let _bgMusicStarted=false;
const BOSS_POWERUP_INTERVAL=100;
let _paused=false;
let _pauseKeyHeld=false;

let _outroTick=0;
let _outroMusicFaded=false;
let _outroCarSndPlayed=false;
const OUTRO_SHIP_RISE=110;
const OUTRO_LAND=50;
const OUTRO_CAR_WAIT=40;
const OUTRO_CAR_DRIVE=100;
const OUTRO_TOTAL=OUTRO_SHIP_RISE+OUTRO_LAND+OUTRO_CAR_WAIT+OUTRO_CAR_DRIVE;
const PLAT_W=140, PLAT_H=180;
const CAR_W=72, CAR_H=80;
let _imgCarTopdown=null;

function loadPlayerShipSprite(){
  if(_playerShipImg)return;
  _playerShipImg=new Image();
  _playerShipImg.src='/assets/Nave/nave.png?v='+PLAYER_SHIP_SPRITE_VER;
}

function loadBossSprite(){
  if(!_imgBoss){
    _imgBoss=new Image();
    _imgBoss.src='/assets/Nave/boss.png?v='+BOSS_SPRITE_VER;
  }
  if(!_imgBossP2){
    _imgBossP2=new Image();
    _imgBossP2.src='/assets/Nave/boss_p2.png?v=1';
  }
}

function loadBossWarningImg(){
  if(_imgBossWarning)return;
  _imgBossWarning=new Image();
  _imgBossWarning.src='/assets/Nave/cuidado.png?v='+BOSS_WARNING_IMG_VER;
}

function loadEnemySprites(){
  if(!_imgEnemyShooter){
    _imgEnemyShooter=new Image();
    _imgEnemyShooter.src='/assets/Nave/inimigo_01.png?v='+ENEMY_SPRITE_VER;
  }
  if(!_imgEnemyTank){
    _imgEnemyTank=new Image();
    _imgEnemyTank.src='/assets/Nave/inimigo_02.png?v='+ENEMY_SPRITE_VER;
  }
  if(!_imgEnemyGrunt){
    _imgEnemyGrunt=new Image();
    _imgEnemyGrunt.src='/assets/Nave/inimigo_03.png?v='+ENEMY_SPRITE_VER;
  }
  if(!_imgEnemyZig){
    _imgEnemyZig=new Image();
    _imgEnemyZig.src='/assets/Nave/inimigo_04.png?v='+ENEMY_SPRITE_VER;
  }
}

function loadAsteroidSprites(){
  if(!_imgAsteroid01){
    _imgAsteroid01=new Image();
    _imgAsteroid01.src='/assets/Nave/asteroid_01.png?v='+ASTEROID_SPRITE_VER;
  }
  if(!_imgAsteroid02){
    _imgAsteroid02=new Image();
    _imgAsteroid02.src='/assets/Nave/asteroid_02.png?v='+ASTEROID_SPRITE_VER;
  }
}

function loadBackgroundSprites(){
  if(!_imgBgFull){
    _imgBgFull=new Image();
    _imgBgFull.src='/assets/Nave/bg_full.png?v='+BG_PARALLAX_VER;
  }
  if(!_imgBgNebula1){
    _imgBgNebula1=new Image();
    _imgBgNebula1.src='/assets/Nave/bg_nebula_01.png?v='+BG_PARALLAX_VER;
  }
  if(!_imgBgNebula2){
    _imgBgNebula2=new Image();
    _imgBgNebula2.src='/assets/Nave/bg_nebula_02.png?v='+BG_PARALLAX_VER;
  }
}

function loadCarSprite(){
  if(!_imgCarTopdown){
    _imgCarTopdown=new Image();
    _imgCarTopdown.src='/assets/Nave/car_topdown.png?v=2';
  }
}

/**
 * Camada esticada ao canvas; scroll em pixéis. Só movimento suave (sem saltos) para não “piscar”.
 */
function drawParallaxFullCanvas(ctx,img,scrollX,scrollY){
  const tw=img.naturalWidth, th=img.naturalHeight;
  if(tw<=0||th<=0)return;
  const bleed=56;
  const dw=W+bleed*2, dh=H+bleed*2;
  const dx=-bleed-scrollX;
  const dy=-bleed-scrollY;
  ctx.save();
  ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
  ctx.drawImage(img,0,0,tw,th,dx,dy,dw,dh);
  ctx.restore();
}

/**
 * Full → Nebula-0001 → Nebula-0002 → estrelas.
 * Parallax só com senos (sem wrap nem scroll linear): evita saltos e flicker. Não é preciso redimensionar os PNGs.
 */
function drawBgLayers(ctx){
  ctx.fillStyle='#050510';
  ctx.fillRect(0,0,W,H);
  const full=_imgBgFull, neb1=_imgBgNebula1, neb2=_imgBgNebula2;
  const t=_frame;
  const smooth=ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled=true;
  const fX=Math.sin(t*0.0065)*15+Math.cos(t*0.0045)*7;
  const fY=Math.cos(t*0.0058)*19+Math.sin(t*0.0078)*9;
  const n1X=Math.sin(t*0.0105)*22+Math.cos(t*0.0072)*10;
  const n1Y=Math.cos(t*0.0092)*26+Math.sin(t*0.0115)*12;
  const n2X=Math.cos(t*0.0135)*28+Math.sin(t*0.0098)*12;
  const n2Y=Math.sin(t*0.0125)*29+Math.cos(t*0.0105)*14;
  if(full&&full.complete&&full.naturalWidth>0)drawParallaxFullCanvas(ctx,full,fX,fY);
  if(neb1&&neb1.complete&&neb1.naturalWidth>0){
    ctx.globalAlpha=0.96;
    drawParallaxFullCanvas(ctx,neb1,n1X,n1Y);
    ctx.globalAlpha=1;
  }
  if(neb2&&neb2.complete&&neb2.naturalWidth>0){
    ctx.globalAlpha=0.94;
    drawParallaxFullCanvas(ctx,neb2,n2X,n2Y);
    ctx.globalAlpha=1;
  }
  ctx.imageSmoothingEnabled=smooth;
}

function drawStarsForeground(ctx){
  _stars.forEach(s=>{
    ctx.fillStyle='#fff';
    ctx.globalAlpha=0.4+0.3*Math.sin(_frame*0.05+s.x);
    ctx.fillRect(s.x,s.y,s.s,s.s);
  });
  ctx.globalAlpha=1;
}

/** Tamanho no ecrã: mistura pequenos, médios e grandes. */
function randomAsteroidSize(){
  const t=Math.random();
  if(t<0.35)return rnd(32,42);
  if(t<0.7)return rnd(46,58);
  return rnd(62,84);
}

function initAsteroidsField(){
  _asteroids=[];
  for(let i=0;i<ASTEROID_COUNT;i++){
    const sz=randomAsteroidSize();
    _asteroids.push({
      x:rnd(6,W-sz-6),
      y:rnd(-H*1.5,-sz),
      variant:Math.random()<0.5?0:1,
      w:sz,h:sz,
      v:rnd(0.5,1.15),
    });
  }
}

// ─── HELPERS ─────────────────────────────────────────────────
function rnd(a,b){return a+Math.random()*(b-a);}
function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function dist2(ax,ay,bx,by){const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;}

function bossHitRadius(){
  if(!_boss)return 0;
  return Math.min(_boss.w,_boss.h)*0.46;
}
function bulletHitsBoss(b){
  if(!_boss||!_bossAlive)return false;
  const cx=_boss.x+_boss.w/2, cy=_boss.y+_boss.h/2;
  const bx=b.x+b.w/2, by=b.y+b.h/2;
  const br=bossHitRadius();
  const bbul=Math.max(b.w,b.h)*0.35;
  const d=br+bbul;
  return dist2(bx,by,cx,cy)<d*d;
}
function playerHitsBossCircle(){
  if(!_boss||!_bossAlive)return false;
  const cx=_boss.x+_boss.w/2, cy=_boss.y+_boss.h/2;
  const pcx=_player.x+_player.w/2, pcy=_player.y+_player.h/2;
  const br=bossHitRadius();
  const pr=Math.max(_player.w,_player.h)*0.42;
  const d=br+pr;
  return dist2(pcx,pcy,cx,cy)<d*d;
}

function spawnBossMegaExplosion(cx,cy){
  sparkBurst(cx,cy,{n:95,cols:['#ffee44','#ff4400','#ffffff','#ffaa00','#ffffcc','#ff8800'],smin:2.5,smax:12,lmin:42,lmax:98,szmin:3,szmax:10,spread:44,drag:0.973});
  sparkBurst(cx,cy,{n:72,cols:['#ff6600','#ffcc00','#fff','#ff2200','#ffaa66'],smin:2,smax:11,lmin:38,lmax:88,szmin:2,szmax:9,spread:36,drag:0.978});
  sparkBurst(cx,cy,{n:58,cols:['#aef','#fff','#ffaa66','#ff4400'],smin:1.8,smax:9,lmin:28,lmax:72,szmin:2,szmax:7,spread:28,drag:0.982});
  sparkBurst(cx,cy,{n:48,cols:['#221100','#ff8800','#ffff00','#ffffff'],smin:3,smax:13,lmin:55,lmax:110,szmin:4,szmax:11,spread:22,drag:0.968});
}

function pushSpark(p){
  _particles.push({
    x:p.x,y:p.y,vx:p.vx,vy:p.vy,
    life:p.life,maxLife:p.maxLife,col:p.col,
    sz:p.sz!=null?p.sz:3,
    drag:p.drag!=null?p.drag:1,
  });
}

/** Rajada genérica (pixels quadrados + opacidade por vida). */
function sparkBurst(cx,cy,opts){
  const n=opts.n??14;
  const cols=opts.cols??['#f84','#fc4','#fff'];
  const smin=opts.smin??1.2, smax=opts.smax??5.2;
  const lmin=opts.lmin??18, lmax=opts.lmax??38;
  const szmin=opts.szmin??2, szmax=opts.szmax??4;
  const spread=opts.spread??5;
  const drag=opts.drag??1;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=rnd(smin,smax);
    const ml=Math.floor(rnd(lmin,lmax));
    pushSpark({
      x:cx+rnd(-spread,spread),y:cy+rnd(-spread,spread),
      vx:Math.cos(a)*s,vy:Math.sin(a)*s,
      life:ml,maxLife:ml,
      col:cols[Math.floor(Math.random()*cols.length)],
      sz:rnd(szmin,szmax),drag,
    });
  }
}

function particle(x,y,col,n){
  sparkBurst(x,y,{n,cols:[col],smin:1,smax:4.8,lmin:22,lmax:32,szmin:3,szmax:3,spread:2});
}

const ENEMY_EXP_PRESET={
  tank:{n:30,cols:['#ff4422','#ffaa33','#ffee88','#663322','#fff8e0'],smin:1.6,smax:7,lmin:20,lmax:50,szmin:2,szmax:5,spread:8,drag:0.985},
  shooter:{n:24,cols:['#ff66ee','#aa55ff','#ffffff','#ff2288','#eeccee'],smin:1.4,smax:6.2,lmin:18,lmax:44,szmin:2,szmax:4,spread:6,drag:0.987},
  zig:{n:26,cols:['#ff8822','#ffcc44','#ffffaa','#cc5522','#fff'],smin:1.5,smax:6.8,lmin:18,lmax:46,szmin:2,szmax:5,spread:7,drag:0.986},
  grunt:{n:22,cols:['#ff4444','#ff8844','#ffcc66','#ffffff','#ff2222'],smin:1.3,smax:6,lmin:18,lmax:42,szmin:2,szmax:4,spread:6,drag:0.987},
};

function spawnEnemyExplosion(cx,cy,kind){
  const pr=ENEMY_EXP_PRESET[kind]||ENEMY_EXP_PRESET.grunt;
  sparkBurst(cx,cy,pr);
}

function spawnPlayerDeathBurst(){
  const cx=_deathExplosionCx, cy=_deathExplosionCy;
  sparkBurst(cx,cy,{
    n:52,cols:['#7ef','#aff','#ffea88','#fff','#4ae','#cef','#ff8844'],
    smin:2.2,smax:8.5,lmin:36,lmax:72,szmin:2,szmax:6,spread:16,drag:0.982,
  });
}

// ─── INIT ────────────────────────────────────────────────────
function initGame(){
  _gameGen++;
  stopBossWarningAudio();
  _score=0; _wave=0; _frame=0; _phase='wave';
  _bullets=[]; _enemies=[]; _ebullets=[]; _powerups=[]; _particles=[]; _asteroids=[];
  _boss=null; _bossAlive=false; _bossPhase=1; _bossPowerupTimer=0;
  _playerShield=false; _shieldTimer=0;
  _playerStar=false; _starTimer=0;
  _playerSpeed=false; _speedTimer=0;
  _playerSpread=false; _spreadTimer=0;
  _shootCooldown=0;
  _lives=MAX_LIVES;
  _player={x:W/2-PLAYER_W/2,y:H-30-PLAYER_H,w:PLAYER_W,h:PLAYER_H,vx:0,hurtTimer:0};
  _stars=Array.from({length:80},()=>({x:rnd(0,W),y:rnd(0,H),s:rnd(0.5,2),v:rnd(0.5,2)}));
  initAsteroidsField();
  startWave(1);
}

/** Dano ao jogador: escudo bloqueia. 8 vidas → ao zerar anima explosão e reinicia. */
function registerPlayerHit(){
  if(_state==='dying')return;
  if(_playerShield)return;
  _lives--;
  _player.hurtTimer=45;
  sndHit();
  if(_lives<=0){
    _deathExplosionCx=_player.x+_player.w/2;
    _deathExplosionCy=_player.y+_player.h/2;
    _deathExplosionTick=0;
    _state='dying';
    spawnPlayerDeathBurst();
    sndExplosion();
  }
}

function tickParticles(){
  _particles.forEach(p=>{
    p.x+=p.vx;p.y+=p.vy;
    if(p.drag!=null&&p.drag!==1){p.vx*=p.drag;p.vy*=p.drag;}
    p.life--;
  });
  _particles=_particles.filter(p=>p.life>0);
}

/** Partículas amarelo/ciano à volta da nave (power-up velocidade). */
function emitSpeedAuraParticles(){
  if(!_playerSpeed||_state!=='playing')return;
  if(_frame%4!==0)return;
  const pcx=_player.x+_player.w/2, pcy=_player.y+_player.h/2;
  const hw=_player.w*0.52, hh=_player.h*0.48;
  const a=Math.random()*Math.PI*2;
  const r=16+Math.random()*(hw+20);
  const cols=['#ffff66','#eeff88','#aef8ff','#fffde8','#ffff00','#b8f0ff'];
  const ml=12+Math.floor(Math.random()*14);
  pushSpark({
    x:pcx+Math.cos(a)*r,y:pcy+Math.sin(a)*r,
    vx:(Math.random()-0.5)*1.1,vy:(Math.random()-0.5)*1.1,
    life:ml,maxLife:ml,
    col:cols[Math.floor(Math.random()*cols.length)],
    sz:rnd(1.6,3),drag:0.92,
  });
}

function updatePlayerDeathExplosion(){
  _frame++;
  _deathExplosionTick++;
  if(_deathExplosionTick>4&&_deathExplosionTick%7===0&&_deathExplosionTick<52){
    sparkBurst(_deathExplosionCx,_deathExplosionCy,{
      n:11,cols:['#ffaa55','#fff','#9ef','#ff6600'],
      smin:1.2,smax:5,lmin:14,lmax:32,szmin:2,szmax:4,spread:14,drag:0.99,
    });
  }
  tickParticles();
  if(_deathExplosionTick>=PLAYER_DEATH_FX_TICKS){
    initGame();
    _state='playing';
  }
}

function drawPlayerDeathExplosion(ctx){
  const cx=_deathExplosionCx, cy=_deathExplosionCy;
  const t=_deathExplosionTick;
  const u=Math.min(1,t/PLAYER_DEATH_FX_TICKS);
  const alpha=1-u;
  const r=(t/PLAYER_DEATH_FX_TICKS)*100;
  const smooth=ctx.imageSmoothingEnabled;
  ctx.save();
  ctx.imageSmoothingEnabled=true;
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r+55);
  g.addColorStop(0,`rgba(255,255,230,${0.55*alpha})`);
  g.addColorStop(0.25,`rgba(255,160,60,${0.35*alpha})`);
  g.addColorStop(0.55,`rgba(255,80,30,${0.18*alpha})`);
  g.addColorStop(1,'rgba(40,20,80,0)');
  ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(cx,cy,r+58,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=`rgba(255,255,255,${0.5*alpha})`;
  ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(cx,cy,r*0.92+8,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle=`rgba(120,220,255,${0.35*alpha})`;
  ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(cx,cy,r*0.65+4,0,Math.PI*2);ctx.stroke();
  ctx.restore();
  ctx.imageSmoothingEnabled=smooth;
}

function makeEnemy(slotIndex,waveNum){
  const cols=3, col=slotIndex%cols;
  // margem para sprites largos (zig ~84px); drawImage usa e.w×e.h
  const baseX=col*(W/cols)+rnd(8,W/cols-96);
  const r=Math.random();
  let kind='grunt';
  if(waveNum>=2){
    if(r<0.30)kind='shooter';
    else if(r<0.50)kind='zig';
    else if(r<0.62)kind='tank';
  } else {
    if(r<0.22)kind='shooter';
    else if(r<0.40)kind='zig';
    else if(r<0.52)kind='tank';
  }
  const e={x:baseX,y:0,kind,hurtTimer:0,active:true};
  if(kind==='tank'){
    e.w=86;e.h=86;e.hp=2;e.vx=rnd(-0.58,0.58);e.vy=rnd(1.55,2.25);
    e.shootTimer=0;e.shootEvery=Math.floor(rnd(88,112));
  } else if(kind==='zig'){
    e.w=84;e.h=73;e.hp=1;e.vx=rnd(-1.25,1.25);e.vy=rnd(2.2,3.2);e.zigPhase=rnd(0,Math.PI*2);
    e.shootTimer=0;e.shootEvery=Math.floor(rnd(54,70));
  } else if(kind==='shooter'){
    e.w=71;e.h=86;e.hp=1;e.vx=rnd(-0.7,0.7);e.vy=rnd(1.55,2.35);e.shootTimer=0;e.shootEvery=46;
  } else {
    e.w=82;e.h=82;e.hp=1;e.vx=rnd(-0.95,0.95);e.vy=rnd(1.95,3.05);
    e.shootTimer=0;e.shootEvery=Math.floor(rnd(64,84));
  }
  e.y=-(e.h+14);
  return e;
}

function startWave(n){
  _wave=n;
  _phase='wave';
  const count=n===1?ENEMIES_W1:ENEMIES_W2;
  _waveEnemiesLeft=count;
  _spawnQueue=count;
  _spawnTimer=0;
  _enemies=[];
}

function spawnBoss(){
  const bw=BOSS_DISPLAY_W, bh=BOSS_DISPLAY_H;
  const ySpan=Math.max(0,H-bh-BOSS_Y_MARGIN_TOP-BOSS_Y_MARGIN_BOTTOM);
  const y0=BOSS_Y_MARGIN_TOP+ySpan*0.18;
  stopBossWarningAudio();
  _phase='boss';
  _bossAlive=true;
  _bossPhase=1;
  _bossPowerupTimer=0;
  _boss={
    x:W/2-bw/2, y:y0, w:bw, h:bh,
    hp:BOSS_HP, maxHp:BOSS_HP,
    vx:1.65, dir:1,
    vy:BOSS_VY, yDir:1,
    shootTimer:0, shootCooldown:36,
    hurtTimer:0,
    angle:0, angVel:0.021,
  };
  sndBossEntry();
  // Power-ups de boas-vindas ao boss
  const welcome=['spread','shield','life','speed','star'];
  for(let i=0;i<welcome.length;i++){
    _powerups.push({
      x:60+i*((W-120)/4)-10,
      y:rnd(H*0.45,H*0.65),
      w:20,h:20,
      type:welcome[i],
      collected:false,
    });
  }
}

/** 8 tiros em estrela (cardinais + diagonais), rotação com o sprite. */
function spawnBossCardinalVolley(){
  const b=_boss;
  if(!b)return;
  const ang=b.angle;
  const v=4.65, bc='#ff5533';
  const cx=b.x+b.w/2, cy=b.y+b.h/2;
  const arm=Math.max(b.w,b.h)*0.48;
  for(let i=0;i<8;i++){
    const a=ang+i*(Math.PI/4);
    const dvx=Math.sin(a), dvy=-Math.cos(a);
    const x=cx+dvx*arm-3, y=cy+dvy*arm-3;
    _ebullets.push({x,y,w:6,h:6,vx:dvx*v,vy:dvy*v,col:bc});
  }
}

/** Fase 2: padrões de tiro variados, projéteis maiores e mais perigosos */
function spawnBossP2Volley(){
  const b=_boss;
  if(!b)return;
  const cx=b.x+b.w/2, cy=b.y+b.h/2;
  const arm=Math.max(b.w,b.h)*0.45;
  const pattern=_frame%3;

  if(pattern===0){
    // Espiral dupla: 12 tiros grandes em espiral
    const baseAng=_frame*0.08;
    for(let i=0;i<12;i++){
      const a=baseAng+i*(Math.PI*2/12);
      const dvx=Math.sin(a), dvy=Math.cos(a);
      const spd=3.2+Math.sin(i*0.8)*0.8;
      _ebullets.push({x:cx+dvx*arm-5,y:cy+dvy*arm-5,w:10,h:10,vx:dvx*spd,vy:dvy*spd,col:'#ff00ff',p2:true});
    }
  } else if(pattern===1){
    // Chuva direcionada: 5 tiros grandes apontados para o player
    const px=_player.x+_player.w/2, py=_player.y+_player.h/2;
    const da=Math.atan2(py-cy,px-cx);
    for(let i=-2;i<=2;i++){
      const a=da+i*0.2;
      const spd=4.5;
      _ebullets.push({x:cx+Math.cos(a)*arm-6,y:cy+Math.sin(a)*arm-6,w:12,h:12,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,col:'#ff4400',p2:true});
    }
  } else {
    // Anel expandindo: 16 tiros médios em círculo
    for(let i=0;i<16;i++){
      const a=i*(Math.PI*2/16);
      const dvx=Math.sin(a), dvy=Math.cos(a);
      _ebullets.push({x:cx+dvx*arm-4,y:cy+dvy*arm-4,w:8,h:8,vx:dvx*3.5,vy:dvy*3.5,col:'#ff6600',p2:true});
    }
  }
}

// ─── PAUSE ────────────────────────────────────────────────────
const _pauseKeys=new Set();
function _onPauseKeyDown(e){ _pauseKeys.add(e.code); }
function _onPauseKeyUp(e){ _pauseKeys.delete(e.code); }
if(typeof window!=='undefined'){
  window.addEventListener('keydown',_onPauseKeyDown);
  window.addEventListener('keyup',_onPauseKeyUp);
}

// ─── UPDATE ──────────────────────────────────────────────────
function update(dt){
  // Toggle pausa com P
  if(_pauseKeys.has('KeyP')){
    if(!_pauseKeyHeld){
      _pauseKeyHeld=true;
      _paused=!_paused;
      if(_bgMusic) _bgMusic.volume=_paused?0.07:0.35;
    }
  } else { _pauseKeyHeld=false; }
  if(_paused&&_state==='playing')return;

  if(_state==='dying'){
    updatePlayerDeathExplosion();
    return;
  }
  if(_state!=='playing')return;
  if(!_bgMusicStarted){ _bgMusicStarted=true; startBgMusic(); }
  _frame++;
  if(_phase==='boss_warning'){
    _bossWarningTicks--;
    if(_bossWarningTicks<=0)spawnBoss();
  }
  if(_phase==='outro'){
    _outroTick++;
    if(!_outroMusicFaded){ _outroMusicFaded=true; fadeBgMusic(0.12,1500); }
    const carStartTick=OUTRO_SHIP_RISE+OUTRO_LAND+OUTRO_CAR_WAIT-10;
    if(_outroTick>=carStartTick&&!_outroCarSndPlayed){ _outroCarSndPlayed=true; sndCarStart(); }
    const cx=W/2;
    const platBottom=H*0.55;
    const targetX=cx-PLAYER_W/2;
    const targetY=platBottom-PLAYER_H-16;
    if(_outroTick<=OUTRO_SHIP_RISE){
      _player.x+=( targetX - _player.x)*0.06;
      _player.y+=( targetY - _player.y)*0.04;
    }
    if(_outroTick>OUTRO_SHIP_RISE&&_outroTick<=OUTRO_SHIP_RISE+OUTRO_LAND){
      _player.x=targetX;
      const landU=(_outroTick-OUTRO_SHIP_RISE)/OUTRO_LAND;
      _player.y=targetY+landU*2;
    }
    if(_outroTick>=OUTRO_TOTAL){ _state='won'; stopBgMusic(); }
    _stars.forEach(s=>{s.y+=s.v*0.3;if(s.y>H){s.y=0;s.x=rnd(0,W);}});
    tickParticles();
    _frame++;
    return;
  }

  const inp=_inputRef||{};
  const spd=(_playerSpeed?9.5:5);

  // Player move
  if(inp.left  && _player.x>0)         _player.x-=spd;
  if(inp.right && _player.x<W-_player.w) _player.x+=spd;
  if(inp.up    && _player.y>0)          _player.y-=spd;
  if(inp.down  && _player.y<H-_player.h) _player.y+=spd;

  // Shoot
  _shootCooldown--;
  if(inp.buttonA&&_shootCooldown<=0){
    const mid=_player.x+_player.w/2;
    const p2=_bossPhase===2;
    if(_playerSpread){
      const vy=p2?13:11;
      const bw=p2?6:4, bh=p2?14:11, bwc=p2?7:5, bhc=p2?17:14;
      const c1=p2?'#ff44ff':'#ff9922', c2=p2?'#ffaaff':'#ffcc55';
      _bullets.push({x:mid-11,y:_player.y,w:bw,h:bh,v:vy,vx:-2.05,col:c1});
      _bullets.push({x:mid-bwc/2,y:_player.y,w:bwc,h:bhc,v:vy+1,vx:0,col:c2});
      _bullets.push({x:mid+7,y:_player.y,w:bw,h:bh,v:vy,vx:2.05,col:c1});
      _shootCooldown=_playerSpeed?6:12;
    } else if(p2){
      _bullets.push({x:mid-3,y:_player.y,w:6,h:16,v:12,col:'#ff44ff'});
      _shootCooldown=_playerSpeed?4:8;
    } else {
      _bullets.push({x:mid-2,y:_player.y,w:4,h:12,v:10});
      _shootCooldown=_playerSpeed?5:11;
    }
    sndShoot();
  }

  // Timers powerup
  if(_playerShield){_shieldTimer--;if(_shieldTimer<=0)_playerShield=false;}
  if(_playerStar){_starTimer--;if(_starTimer<=0)_playerStar=false;}
  if(_playerSpeed){_speedTimer--;if(_speedTimer<=0)_playerSpeed=false;}
  if(_playerSpread){_spreadTimer--;if(_spreadTimer<=0)_playerSpread=false;}
  if(_player.hurtTimer>0)_player.hurtTimer--;

  // Stars
  _stars.forEach(s=>{s.y+=s.v;if(s.y>H){s.y=0;s.x=rnd(0,W);}});

  // Asteroides (rolam com o fundo; 2 sprites, poucos)
  _asteroids.forEach(a=>{
    a.y+=a.v;
    if(a.y>H+24){a.y=rnd(-120,-40);a.x=rnd(4,W-a.w-4);}
  });

  // Bullets player
  _bullets.forEach(b=>{b.x+=(b.vx||0);b.y-=b.v;});
  _bullets=_bullets.filter(b=>b.y>-20&&b.x>-24&&b.x<W+24);

  // PHASE: wave
  if(_phase==='wave'){
    // Spawn
    _spawnTimer+=dt;
    if(_spawnQueue>0&&_spawnTimer>=SPAWN_INTERVAL){
      _spawnTimer=0; _spawnQueue--;
      const idx=_waveEnemiesLeft-_spawnQueue-1;
      _enemies.push(makeEnemy(idx,_wave));
    }

    // Move enemies + tiros (todos os tipos disparam; shooter é o mais rápido)
    _enemies.forEach(e=>{
      if(e.kind==='zig'){
        e.vx+=Math.sin(_frame*0.055+e.zigPhase)*0.17;
        e.vx=Math.max(-2.9,Math.min(2.9,e.vx));
      }
      e.x+=e.vx; e.y+=e.vy;
      if(e.x<0||e.x>W-e.w)e.vx*=-1;
      if(e.hurtTimer>0)e.hurtTimer--;
      if(e.y>35&&e.y<H-100&&e.shootEvery>0){
        e.shootTimer++;
        if(e.shootTimer>=e.shootEvery){
          e.shootTimer=0;
          const cx=e.x+e.w/2;
          _ebullets.push({x:cx-2.5,y:e.y+e.h,w:5,h:11,vx:rnd(-0.45,0.45),vy:4.65});
        }
      }
    });

    // Bullet x enemy
    _bullets.forEach(b=>{
      _enemies.forEach(e=>{
        if(e.active===false)return;
        if(hit(b,e)){
          b.y=-999; e.hp--;
          if(e.hp<=0){
            spawnEnemyExplosion(e.x+e.w/2,e.y+e.h/2,e.kind);
            sndExplosion(); _score+=e.kind==='tank'?18:12; e.active=false;
            _waveEnemiesLeft--;
            if(Math.random()<POWERUP_DROP_CHANCE) dropPowerup(e.x+e.w/2,e.y+e.h/2);
          } else { sndHit(); e.hurtTimer=8; }
        }
      });
    });
    _enemies=_enemies.filter(e=>{
      if(e.active===false) return false;
      if(e.y>H+50){ _waveEnemiesLeft--; return false; } // escapou — conta como morto
      return true;
    });

    // Player x enemy
    _enemies.forEach(e=>{
      if(!hit(_player,e))return;
      spawnEnemyExplosion(e.x+e.w/2,e.y+e.h/2,e.kind);
      e.active=false; _waveEnemiesLeft--;
      if(_playerShield){
        sndExplosion(); _score+=8;
        return;
      }
      registerPlayerHit();
    });

    // Zona STAR (rosa): mata inimigos e tiros na área (boss não afectado aqui)
    if(_playerStar){
      const pcx=_player.x+_player.w/2, pcy=_player.y+_player.h/2, R=STAR_KILL_RADIUS, R2=R*R;
      _enemies.forEach(e=>{
        if(e.active===false)return;
        const ecx=e.x+e.w/2, ecy=e.y+e.h/2;
        if(dist2(ecx,ecy,pcx,pcy)<=R2){
          sparkBurst(ecx,ecy,{n:26,cols:['#ff66ff','#ffccff','#ffffff','#aa44ff'],smin:1.8,smax:7,lmin:20,lmax:48,szmin:2,szmax:5,spread:10,drag:0.985});
          sndExplosion(); _score+=14; e.active=false; _waveEnemiesLeft--;
        }
      });
      _ebullets.forEach(b=>{
        const bx=b.x+b.w/2, by=b.y+b.h/2;
        if(dist2(bx,by,pcx,pcy)<=R2)b.y=H+99;
      });
    }

    // Wave complete?
    if(_spawnQueue===0&&_enemies.length===0){
      const g=_gameGen;
      if(_wave<TOTAL_WAVES){
        setTimeout(()=>{if(g!==_gameGen)return; startWave(_wave+1);},1200);
        _phase='between';
      } else {
        _ebullets=[];
        _bossWarningTicks=BOSS_WARNING_TICKS;
        _phase='boss_warning';
        sndBossWarning();
      }
    }
  }

  // PHASE: boss
  if(_phase==='boss'&&_boss&&_bossAlive){
    const yMin=BOSS_Y_MARGIN_TOP;
    const yMax=H-_boss.h-BOSS_Y_MARGIN_BOTTOM;
    _boss.x+=_boss.vx*_boss.dir;
    if(_boss.x<8||_boss.x>W-_boss.w-8)_boss.dir*=-1;
    _boss.y+=_boss.vy*_boss.yDir;
    if(_boss.y<=yMin){_boss.y=yMin;_boss.yDir=1;}
    if(_boss.y>=yMax){_boss.y=yMax;_boss.yDir=-1;}
    if(_bossPhase===1) _boss.angle+=_boss.angVel;
    else _boss.angle=0;
    if(_boss.hurtTimer>0)_boss.hurtTimer--;

    const pwInterval=_bossPhase===2?BOSS_P2_POWERUP_INTERVAL:BOSS_POWERUP_INTERVAL;
    _bossPowerupTimer++;
    if(_bossPowerupTimer>=pwInterval){
      _bossPowerupTimer=0;
      const types=['speed','shield','star','spread','life'];
      const t=types[Math.floor(Math.random()*types.length)];
      const px=rnd(40,W-60);
      _powerups.push({x:px,y:-20,w:20,h:20,type:t,collected:false});
    }

    // Boss atira
    _boss.shootTimer++;
    if(_boss.shootTimer>=_boss.shootCooldown){
      _boss.shootTimer=0;
      if(_bossPhase===2) spawnBossP2Volley();
      else spawnBossCardinalVolley();
    }

    // Bullet player x boss
    _bullets.forEach(b=>{
      if(_boss&&bulletHitsBoss(b)){
        b.y=-999; _boss.hp--; _boss.hurtTimer=8;
        sparkBurst(_boss.x+_boss.w/2,_boss.y+_boss.h/2,{n:16,cols:['#6ff','#0ff','#fff'],smin:1.5,smax:5.5,lmin:16,lmax:36,szmin:2,szmax:4,spread:6,drag:0.99});
        if(_boss.hp<=0){
          if(_bossPhase===1){
            _score+=300;
            _phase='boss_transition';
            _bossTransitionTick=0;
            _ebullets=[];
            const bcx2=_boss.x+_boss.w/2, bcy2=_boss.y+_boss.h/2;
            sparkBurst(bcx2,bcy2,{n:120,cols:['#fff','#ff0','#f80','#f0f','#0ff','#ffaa00'],smin:3,smax:14,lmin:50,lmax:110,szmin:3,szmax:12,spread:50,drag:0.97});
            sparkBurst(bcx2,bcy2,{n:80,cols:['#ffffff','#ffee88','#ff6600'],smin:2,smax:10,lmin:40,lmax:90,szmin:2,szmax:8,spread:35,drag:0.975});
            for(let i=0;i<40;i++){
              const a=Math.random()*Math.PI*2;
              const r=rnd(20,200);
              sparkBurst(bcx2+Math.cos(a)*r,bcy2+Math.sin(a)*r,{n:8,cols:['#fff','#ff0','#f80'],smin:1,smax:5,lmin:20,lmax:50,szmin:1.5,szmax:5,spread:10,drag:0.98});
            }
            sndBossEntry();
          } else {
            _bossAlive=false; _score+=700;
            spawnBossMegaExplosion(_boss.x+_boss.w/2,_boss.y+_boss.h/2);
            sndVictory();
            _phase='victory_anim';
            _victoryTimer=120;
          }
        } else { sndHit(); }
      }
    });

    // Player x boss
    if(_boss&&playerHitsBossCircle()){
      if(!_playerShield)registerPlayerHit();
    }
  }

  // Boss transition (fase 1 → 2)
  if(_phase==='boss_transition'){
    _bossTransitionTick++;
    tickParticles();
    if(_bossTransitionTick%3===0){
      const rx=rnd(0,W), ry=rnd(0,H);
      sparkBurst(rx,ry,{n:6,cols:['#fff','#ff0','#f80','#f0f'],smin:1,smax:4,lmin:12,lmax:30,szmin:1.5,szmax:4,spread:8,drag:0.98});
    }
    if(_bossTransitionTick===Math.floor(BOSS_TRANSITION_DURATION*0.55)){
      _bossPhase=2;
      _boss.hp=BOSS_P2_HP;
      _boss.maxHp=BOSS_P2_HP;
      _boss.angVel=0;
      _boss.angle=0;
      _boss.shootCooldown=24;
      _bossPowerupTimer=0;
      _lives=MAX_LIVES;
    }
    if(_bossTransitionTick>=BOSS_TRANSITION_DURATION){
      _phase='boss';
      const welcome2=['life','spread','shield','speed','star','life'];
      for(let i=0;i<welcome2.length;i++){
        _powerups.push({x:40+i*((W-80)/5)-10,y:rnd(H*0.5,H*0.7),w:20,h:20,type:welcome2[i],collected:false});
      }
    }
  }

  // Victory animation
  if(_phase==='victory_anim'){
    _victoryTimer--;
    particle(rnd(0,W),rnd(0,H/2),'#ff0',2);
    if(_victoryTimer<=0){ _phase='outro'; _outroTick=0; _outroMusicFaded=false; _outroCarSndPlayed=false; }
  }

  // Enemy bullets
  _ebullets.forEach(b=>{b.x+=b.vx;b.y+=b.vy;});
  _ebullets=_ebullets.filter(b=>b.y>-40&&b.y<H+40&&b.x>-40&&b.x<W+40);

  // Tiros inimigos: escudo verde anula o tiro (sem perder vida)
  _ebullets.forEach(b=>{
    if(!hit(_player,b))return;
    b.y=H+99;
    if(_playerShield){
      particle(b.x,b.y,'#0f8',4);
      return;
    }
    registerPlayerHit();
  });

  // Powerups
  _powerups.forEach(p=>{p.y+=1.5;});
  _powerups.forEach(p=>{
    if(hit(_player,p)){
      p.collected=true; sndPowerup();
      if(p.type==='speed'){_playerSpeed=true;_speedTimer=340;}
      if(p.type==='shield'){_playerShield=true;_shieldTimer=420;}
      if(p.type==='star'){_playerStar=true;_starTimer=420;}
      if(p.type==='spread'){_playerSpread=true;_spreadTimer=380;}
      if(p.type==='life'){_lives=Math.min(_lives+5,MAX_LIVES);}
    }
  });
  _powerups=_powerups.filter(p=>!p.collected&&p.y<H+20);

  // Asteroide × jogador (só com iframes de dano; escudo bloqueia em registerPlayerHit)
  if(_player.hurtTimer<=0){
    for(let i=0;i<_asteroids.length;i++){
      const a=_asteroids[i];
      if(hit(_player,a)){
        particle(a.x+a.w/2,a.y+a.h/2,'#886644',4);
        registerPlayerHit();
        break;
      }
    }
  }

  emitSpeedAuraParticles();
  tickParticles();
}

function dropPowerup(x,y){
  const r=Math.random();
  const t=r<0.15?'life':['speed','shield','star','spread'][Math.floor(Math.random()*4)];
  _powerups.push({x:x-10,y,w:20,h:20,type:t,collected:false});
}

// ─── RENDER ──────────────────────────────────────────────────
const PW_COLS={speed:'#ff0',star:'#f0f',shield:'#0f8',spread:'#f80',life:'#f44'};
const PW_LABEL={speed:'S',star:'★',shield:'O',spread:'T',life:'+'};
/** Cores de aura (speed | escudo | star | spread | life). */
const PW_AURA={
  speed:{c1:'#ffff66',c2:'#a8eeff',c3:'#fffacd',orb:'#ffee22'},
  star:{c1:'#ff00ff',c2:'#aa00ff',c3:'#ff66ff',orb:'#ff00aa'},
  shield:{c1:'#00ff88',c2:'#00cc44',c3:'#88ffaa',orb:'#00aa55'},
  spread:{c1:'#ffaa44',c2:'#ff6600',c3:'#ffcc88',orb:'#ee5500'},
  life:{c1:'#ff4444',c2:'#ff0000',c3:'#ff8888',orb:'#cc0000'},
};

function _orbRing(ctx, cx, cy, ac, t, n, r1, r2, dir){
  ctx.shadowBlur=0;
  for(let i=0;i<n;i++){
    const ang=dir*t*0.0022+i*(Math.PI*2/n);
    const ang2=-dir*t*0.0033+i*(Math.PI*2/n)+Math.PI/n;
    const rr1=r1+3*Math.sin(t*0.004+i*1.3);
    const rr2=r2+2*Math.sin(t*0.005+i*0.9+1.2);
    const ox=cx+Math.cos(ang)*rr1, oy=cy+Math.sin(ang)*rr1;
    ctx.globalAlpha=0.5+0.5*Math.sin(t*0.006+i*0.8);
    ctx.fillStyle=i%2===0?ac.c1:ac.c3;
    ctx.beginPath();ctx.arc(ox,oy,2.2,0,Math.PI*2);ctx.fill();
    const ox2=cx+Math.cos(ang2)*rr2, oy2=cy+Math.sin(ang2)*rr2;
    ctx.globalAlpha=0.4+0.4*Math.sin(t*0.005+i*1.1+0.5);
    ctx.fillStyle=i%2===0?ac.c2:ac.orb;
    ctx.beginPath();ctx.arc(ox2,oy2,1.8,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}

/** Auras: escudo/star/speed com gradiente + orbes. Spread: só traços/pontos (sem elipse laranja). */
function drawSpreadPowerFx(ctx, pcx, pcy, hw, hh, t){
  const w=0.5+0.5*Math.sin(t*0.007);
  const noseY=pcy-hh-3;
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle='rgba(200,230,255,'+(0.4+0.35*w)+')';
  ctx.lineWidth=1.25;
  ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(pcx-hw*0.55,noseY+10);
  ctx.lineTo(pcx,noseY-1);
  ctx.lineTo(pcx+hw*0.55,noseY+10);
  ctx.stroke();
  ctx.globalAlpha=0.55+0.35*w;
  ctx.fillStyle='#e8f4ff';
  for(let i=0;i<3;i++){
    const x=pcx+(i-1)*(hw*0.28);
    const y=noseY-3+2.2*Math.sin(t*0.011+i*1.4);
    ctx.beginPath();ctx.arc(x,y,2.1,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=0.35+0.25*w;
  ctx.strokeStyle='rgba(160,210,255,0.7)';
  ctx.lineWidth=1;
  ctx.setLineDash([3,5]);
  ctx.beginPath();
  ctx.arc(pcx,noseY+4,hw*0.75,Math.PI*1.05,Math.PI*1.95);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPlayerPowerAuras(ctx, pcx, pcy, hw, hh, t){
  const pulse=0.5+0.5*Math.sin(t*0.005);
  const pulse2=0.5+0.5*Math.sin(t*0.004+1.5);
  ctx.shadowBlur=0;
  ctx.globalCompositeOperation='source-over';
  if(_playerShield){
    const ac=PW_AURA.shield, r=hw+16;
    ctx.save();
    const g1=ctx.createRadialGradient(pcx,pcy,hw*0.28,pcx,pcy,r+12+7*pulse);
    g1.addColorStop(0,'rgba(0,255,136,'+(0.11+0.07*pulse2)+')');
    g1.addColorStop(0.55,'rgba(0,255,136,'+(0.05+0.035*pulse)+')');
    g1.addColorStop(1,'rgba(0,255,136,0)');
    ctx.fillStyle=g1;
    ctx.beginPath();ctx.ellipse(pcx,pcy,r+7*pulse,hh+12+7*pulse,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    _orbRing(ctx,pcx,pcy,ac,t,8,r+4,r-6,1);
  }
  if(_playerStar){
    const ac=PW_AURA.star, r=hw+28;
    const p3=0.5+0.5*Math.sin(t*0.007+2.1);
    ctx.save();
    const g2=ctx.createRadialGradient(pcx,pcy,hw*0.28,pcx,pcy,r+16+9*pulse);
    g2.addColorStop(0,'rgba(255,0,255,'+(0.1+0.07*p3)+')');
    g2.addColorStop(0.55,'rgba(180,0,200,'+(0.06+0.04*pulse)+')');
    g2.addColorStop(1,'rgba(255,0,255,0)');
    ctx.fillStyle=g2;
    ctx.beginPath();ctx.ellipse(pcx,pcy,r+9*pulse,hh+18+9*pulse,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    _orbRing(ctx,pcx,pcy,ac,t,10,r+6,r-4,1);
  }
  if(_playerSpeed){
    const ac=PW_AURA.speed;
    ctx.save();
    const g3=ctx.createRadialGradient(pcx,pcy,hw*0.22,pcx,pcy,hw+20+11*pulse);
    g3.addColorStop(0,'rgba(255,255,140,'+(0.09+0.06*pulse2)+')');
    g3.addColorStop(0.42,'rgba(170,235,255,'+(0.07+0.05*pulse)+')');
    g3.addColorStop(0.78,'rgba(255,250,200,'+(0.03+0.02*pulse2)+')');
    g3.addColorStop(1,'rgba(255,255,220,0)');
    ctx.fillStyle=g3;
    ctx.beginPath();ctx.ellipse(pcx,pcy,hw+11*pulse,hh+11*pulse,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.4+0.25*pulse2;
    ctx.strokeStyle='rgba(200,245,255,0.55)';
    ctx.lineWidth=1.2;
    ctx.beginPath();ctx.ellipse(pcx,pcy,hw+14+6*pulse,hh+14+6*pulse,0,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=0.35+0.2*pulse;
    ctx.strokeStyle='rgba(255,255,120,0.5)';
    ctx.beginPath();ctx.ellipse(pcx,pcy,hw+8+4*pulse,hh+8+4*pulse,0,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
    ctx.restore();
    _orbRing(ctx,pcx,pcy,ac,t,8,hw+15,hh+7,1);
  }
  if(_playerSpread){
    drawSpreadPowerFx(ctx, pcx, pcy, hw, hh, t);
  }
  ctx.globalAlpha=1;
}

function drawBG(ctx){
  drawBgLayers(ctx);
  drawStarsForeground(ctx);
}

function drawAsteroids(ctx){
  const smooth=ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled=false;
  for(let i=0;i<_asteroids.length;i++){
    const a=_asteroids[i];
    const img=a.variant===0?_imgAsteroid01:_imgAsteroid02;
    if(!img||!img.complete||img.naturalWidth<=0)continue;
    ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight,a.x,a.y,a.w,a.h);
  }
  ctx.imageSmoothingEnabled=smooth;
}

function drawPlayer(ctx){
  const p=_player;
  if(p.hurtTimer>0&&Math.floor(_frame/3)%2===0)return;
  const t=performance.now();
  const pcx=p.x+p.w/2, pcy=p.y+p.h/2, hw=p.w/2, hh=p.h/2;
  if(_playerStar){
    ctx.save();
    ctx.strokeStyle='rgba(255,0,255,0.35)';
    ctx.lineWidth=2;
    ctx.setLineDash([6,6]);
    ctx.beginPath();ctx.arc(pcx,pcy,STAR_KILL_RADIUS,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  // corpo (sprite assets/Nave/nave.png ou fallback)
  const spr=_playerShipImg;
  if(spr&&spr.complete&&spr.naturalWidth>0){
    ctx.drawImage(spr,p.x,p.y,p.w,p.h);
  } else {
    ctx.fillStyle='#0ff';
    ctx.beginPath();
    ctx.moveTo(p.x+p.w/2,p.y);
    ctx.lineTo(p.x+p.w,p.y+p.h*0.7);
    ctx.lineTo(p.x+p.w*0.7,p.y+p.h);
    ctx.lineTo(p.x+p.w*0.3,p.y+p.h);
    ctx.lineTo(p.x,p.y+p.h*0.7);
    ctx.closePath();ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath();ctx.arc(p.x+p.w/2,p.y+p.h*0.4,5,0,Math.PI*2);ctx.fill();
  }
  // propulsão
  ctx.fillStyle=_playerSpread?'#ffb040':(_playerSpeed?'#ffe866':'#f80');ctx.globalAlpha=0.6+0.4*Math.sin(_frame*0.3);
  ctx.fillRect(p.x+p.w/2-4,p.y+p.h,8,6+Math.sin(_frame*0.4)*4);
  if(_playerStar){
    ctx.fillStyle='#f0f';ctx.globalAlpha=0.85;
    ctx.fillRect(p.x+3,p.y+p.h,4,3+Math.sin(_frame*0.5)*2);
    ctx.fillRect(p.x+p.w-7,p.y+p.h,4,3+Math.sin(_frame*0.5)*2);
    ctx.globalAlpha=1;
  }
  ctx.globalAlpha=1;
  drawPlayerPowerAuras(ctx, pcx, pcy, hw, hh, t);
}

function drawEnemy(ctx,e){
  const hurt=e.hurtTimer>0&&Math.floor(_frame/2)%2===0;
  const k=e.kind||'grunt';
  // inimigo_01 shooter | 02 tank | 03 grunt | 04 zig
  if(k==='shooter'){
    const img=_imgEnemyShooter;
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,e.x,e.y,e.w,e.h);
      if(hurt){ctx.fillStyle='rgba(255,255,255,0.72)';ctx.fillRect(e.x,e.y,e.w,e.h);}
      return;
    }
  }
  if(k==='tank'){
    const img=_imgEnemyTank;
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,e.x,e.y,e.w,e.h);
      if(hurt){ctx.fillStyle='rgba(255,255,255,0.72)';ctx.fillRect(e.x,e.y,e.w,e.h);}
      return;
    }
  }
  if(k==='grunt'){
    const img=_imgEnemyGrunt;
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,e.x,e.y,e.w,e.h);
      if(hurt){ctx.fillStyle='rgba(255,255,255,0.72)';ctx.fillRect(e.x,e.y,e.w,e.h);}
      return;
    }
  }
  if(k==='zig'){
    const img=_imgEnemyZig;
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,e.x,e.y,e.w,e.h);
      if(hurt){ctx.fillStyle='rgba(255,255,255,0.72)';ctx.fillRect(e.x,e.y,e.w,e.h);}
      return;
    }
  }
  let body=hurt?'#fff':k==='tank'?'#b22':k==='shooter'?'#c228b8':k==='zig'?'#e62':'#f33';
  let inner=hurt?'#f33':k==='tank'?'#611':k==='shooter'?'#509':k==='zig'?'#a31':'#a00';
  ctx.fillStyle=body;
  ctx.fillRect(e.x,e.y,e.w,e.h);
  ctx.fillStyle=inner;
  ctx.fillRect(e.x+4,e.y+4,e.w-8,e.h-8);
  ctx.fillStyle=k==='shooter'?'#ff9':'#ff0';
  ctx.fillRect(e.x+6,e.y+8,4,4);
  ctx.fillRect(e.x+e.w-10,e.y+8,4,4);
  if(k==='tank'&&!hurt){
    ctx.fillStyle='#400';ctx.fillRect(e.x+e.w/2-3,e.y+10,6,8);
  }
  if(k==='shooter'&&!hurt){
    ctx.fillStyle='#f0f';ctx.fillRect(e.x+e.w/2-2,e.y+e.h-6,4,5);
  }
}

function drawBoss(ctx){
  if(!_boss||(!_bossAlive&&_phase!=='boss_transition'))return;
  const b=_boss;
  const hurt=b.hurtTimer>0&&Math.floor(_frame/2)%2===0;
  const t=_frame;
  const pulse=0.7+0.3*Math.sin(t*0.12);
  const pulse2=0.5+0.5*Math.sin(t*0.08+1.0);
  const pulse3=0.5+0.5*Math.sin(t*0.06+2.5);
  const img=_bossPhase===2?_imgBossP2:_imgBoss;
  const bcx=b.x+b.w/2, bcy=b.y+b.h/2;
  const br=Math.max(b.w,b.h)*0.58;
  const hpPct=b.hp/b.maxHp;
  const rage=1-hpPct;

  ctx.save();

  // === AURA LAYER 1: outer pulsing glow (vermelho/laranja) ===
  const g1=ctx.createRadialGradient(bcx,bcy,br*0.3,bcx,bcy,br*(1.6+0.3*pulse));
  g1.addColorStop(0,'rgba(255,60,0,0)');
  g1.addColorStop(0.5,`rgba(255,40,0,${(0.12+0.08*rage)*pulse})`);
  g1.addColorStop(0.8,`rgba(200,0,0,${(0.08+0.06*rage)*pulse2})`);
  g1.addColorStop(1,'rgba(120,0,0,0)');
  ctx.fillStyle=g1;
  ctx.beginPath();ctx.arc(bcx,bcy,br*(1.6+0.3*pulse),0,Math.PI*2);ctx.fill();

  // === AURA LAYER 2: inner magenta/purple menace glow ===
  const g2=ctx.createRadialGradient(bcx,bcy,br*0.2,bcx,bcy,br*(1.2+0.15*pulse2));
  g2.addColorStop(0,`rgba(180,0,120,${0.06+0.06*rage})`);
  g2.addColorStop(0.6,`rgba(120,0,80,${(0.10+0.08*rage)*pulse3})`);
  g2.addColorStop(1,'rgba(80,0,40,0)');
  ctx.fillStyle=g2;
  ctx.beginPath();ctx.arc(bcx,bcy,br*(1.2+0.15*pulse2),0,Math.PI*2);ctx.fill();

  // === ROTATING ORB RING (outer) ===
  const orbCount=12;
  for(let i=0;i<orbCount;i++){
    const ang=t*0.03+i*(Math.PI*2/orbCount);
    const r1=br*(1.2+0.15*Math.sin(t*0.05+i*1.1));
    const ox=bcx+Math.cos(ang)*r1, oy=bcy+Math.sin(ang)*r1;
    ctx.shadowColor='#ff2200';ctx.shadowBlur=6+4*pulse;
    ctx.globalAlpha=0.5+0.4*Math.sin(t*0.07+i*0.9);
    ctx.fillStyle=i%3===0?'#ff4400':i%3===1?'#ff0066':'#ff8800';
    ctx.beginPath();ctx.arc(ox,oy,2.5+rage,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;ctx.globalAlpha=1;

  // === ROTATING ORB RING (inner, counter-rotate) ===
  const innerOrbs=8;
  for(let i=0;i<innerOrbs;i++){
    const ang=-t*0.04+i*(Math.PI*2/innerOrbs)+Math.PI/innerOrbs;
    const r2=br*(0.85+0.1*Math.sin(t*0.06+i*1.5));
    const ox=bcx+Math.cos(ang)*r2, oy=bcy+Math.sin(ang)*r2;
    ctx.shadowColor='#cc0044';ctx.shadowBlur=5;
    ctx.globalAlpha=0.4+0.4*Math.sin(t*0.06+i*1.2+0.5);
    ctx.fillStyle=i%2===0?'#ff0044':'#cc00aa';
    ctx.beginPath();ctx.arc(ox,oy,2,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;ctx.globalAlpha=1;

  // === CORNER SPARKS (4 grandes, girando devagar) ===
  for(let i=0;i<4;i++){
    const ang=t*0.02+i*(Math.PI/2)+(Math.PI/4);
    const sr=br*(1.35+0.2*pulse3);
    const sx=bcx+Math.cos(ang)*sr, sy=bcy+Math.sin(ang)*sr;
    ctx.save();
    ctx.shadowColor='#ff3300';ctx.shadowBlur=10+6*pulse;
    ctx.globalAlpha=0.7+0.3*Math.sin(t*0.08+i);
    ctx.fillStyle='#ff4400';
    ctx.fillRect(sx-3,sy-3,6,6);
    ctx.globalAlpha=0.35;
    ctx.fillStyle='#ffaa00';
    ctx.fillRect(sx-1.5,sy-1.5,3,3);
    ctx.restore();
  }

  // === ELECTRIC ARCS (raios entre orbs) ===
  if(rage>0.3){
    ctx.save();
    ctx.strokeStyle=`rgba(255,100,0,${0.2+0.3*rage})`;
    ctx.lineWidth=1;ctx.shadowColor='#ff4400';ctx.shadowBlur=4;
    const arcCount=Math.floor(2+rage*4);
    for(let i=0;i<arcCount;i++){
      const a1=t*0.03+i*(Math.PI*2/arcCount);
      const a2=a1+0.5+Math.sin(t*0.1+i)*0.3;
      const r=br*(1.1+0.1*Math.sin(t*0.07+i));
      const x1=bcx+Math.cos(a1)*r, y1=bcy+Math.sin(a1)*r;
      const x2=bcx+Math.cos(a2)*r, y2=bcy+Math.sin(a2)*r;
      const mx=(x1+x2)/2+(Math.random()-0.5)*10;
      const my=(y1+y2)/2+(Math.random()-0.5)*10;
      ctx.globalAlpha=0.3+0.4*Math.sin(t*0.15+i*2);
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(mx,my);ctx.lineTo(x2,y2);ctx.stroke();
    }
    ctx.restore();
  }

  // === PULSING DANGER RING ===
  ctx.save();
  ctx.strokeStyle=`rgba(255,0,0,${(0.15+0.15*rage)*pulse})`;
  ctx.lineWidth=1.5;ctx.shadowColor='#ff0000';ctx.shadowBlur=8*pulse;
  ctx.beginPath();ctx.arc(bcx,bcy,br*(1.4+0.1*pulse),0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle=`rgba(255,0,80,${(0.1+0.1*rage)*pulse2})`;
  ctx.lineWidth=1;ctx.shadowBlur=4*pulse2;
  ctx.beginPath();ctx.arc(bcx,bcy,br*(1.5+0.15*pulse2),0,Math.PI*2);ctx.stroke();
  ctx.restore();

  // === BOSS SPRITE ===
  const smooth=ctx.imageSmoothingEnabled;
  const ang=b.angle||0;
  if(img&&img.complete&&img.naturalWidth>0){
    ctx.imageSmoothingEnabled=false;
    ctx.save();
    ctx.translate(bcx,bcy);
    ctx.rotate(ang);
    ctx.shadowColor='#ff2200';ctx.shadowBlur=14+10*pulse;
    ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight,-b.w/2,-b.h/2,b.w,b.h);
    ctx.shadowBlur=0;
    if(hurt){
      const hr=Math.max(b.w,b.h)*0.6;
      const hg=ctx.createRadialGradient(0,0,hr*0.1,0,0,hr);
      hg.addColorStop(0,'rgba(255,255,255,0.5)');
      hg.addColorStop(0.4,'rgba(255,120,60,0.3)');
      hg.addColorStop(0.7,'rgba(255,50,0,0.15)');
      hg.addColorStop(1,'rgba(255,0,0,0)');
      ctx.fillStyle=hg;
      ctx.beginPath();ctx.arc(0,0,hr,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    ctx.imageSmoothingEnabled=smooth;
  } else {
    ctx.imageSmoothingEnabled=false;
    ctx.save();
    ctx.translate(bcx,bcy);
    ctx.rotate(ang);
    ctx.fillStyle=hurt?'#fff':`rgba(220,${Math.floor(40*pulse)},20,1)`;
    ctx.fillRect(-b.w/2,-b.h/2,b.w,b.h);
    ctx.fillStyle='#600';
    ctx.fillRect(-b.w/2+12,-b.h/2+12,b.w-24,b.h-24);
    ctx.fillStyle='#ff0';
    ctx.fillRect(-6,-6,12,12);
    if(hurt){
      const hr=Math.max(b.w,b.h)*0.6;
      const hg=ctx.createRadialGradient(0,0,hr*0.1,0,0,hr);
      hg.addColorStop(0,'rgba(255,255,255,0.5)');
      hg.addColorStop(0.4,'rgba(255,120,60,0.3)');
      hg.addColorStop(0.7,'rgba(255,50,0,0.15)');
      hg.addColorStop(1,'rgba(255,0,0,0)');
      ctx.fillStyle=hg;
      ctx.beginPath();ctx.arc(0,0,hr,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    ctx.imageSmoothingEnabled=smooth;
  }

  ctx.restore();

  // === HP BAR ===
  const isP2=_bossPhase===2;
  const barW=isP2?b.w+60:b.w+20, barX=bcx-barW/2;
  const barY=b.y-18, barH=isP2?10:8;
  ctx.fillStyle='#1a0000';ctx.fillRect(barX-1,barY-1,barW+2,barH+2);
  ctx.fillStyle=isP2?'#200020':'#300';ctx.fillRect(barX,barY,barW,barH);
  const hpCol=isP2?(hpPct>0.5?'#f0f':hpPct>0.25?'#ff0':'#f00'):(hpPct>0.5?'#0f0':hpPct>0.25?'#ff0':'#f00');
  ctx.fillStyle=hpCol;ctx.fillRect(barX,barY,barW*hpPct,barH);
  ctx.save();
  ctx.shadowColor=hpCol;ctx.shadowBlur=isP2?10:6;
  ctx.fillStyle=hpCol;ctx.globalAlpha=0.4;
  ctx.fillRect(barX,barY,barW*hpPct,barH);
  ctx.restore();
  if(isP2){
    ctx.fillStyle='rgba(255,0,255,0.7)';ctx.font='7px "Press Start 2P",monospace';
    ctx.textAlign='center';ctx.fillText('★ FASE 2 ★',bcx,barY-4);ctx.textAlign='left';
  }
  ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.globalAlpha=0.5;
  ctx.strokeRect(barX,barY,barW,barH);ctx.globalAlpha=1;
}

function drawBossWarning(ctx){
  if(_phase!=='boss_warning')return;
  const im=_imgBossWarning;
  const blink=0.62+0.38*Math.sin(_frame*0.14);
  if(im&&im.complete&&im.naturalWidth>0){
    const iw=im.naturalWidth, ih=im.naturalHeight;
    const sc=Math.max(W/iw,H/ih);
    const dw=iw*sc, dh=ih*sc;
    const x=(W-dw)/2, y=(H-dh)/2;
    ctx.save();
    ctx.fillStyle='rgba(5,5,18,0.72)';
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=blink;
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(im,x,y,dw,dh);
    ctx.globalAlpha=0.22+0.15*Math.sin(_frame*0.11);
    ctx.strokeStyle='#66ffff';
    ctx.lineWidth=2;
    ctx.strokeRect(x+2,y+2,dw-4,dh-4);
    ctx.globalAlpha=1;
    ctx.restore();
  } else {
    const pulse=0.72+0.28*Math.sin(_frame*0.14);
    const barH=48;
    const yy=Math.floor(H*0.2);
    ctx.fillStyle=`rgba(140,0,24,${0.42+0.1*pulse})`;
    ctx.fillRect(0,yy,W,barH);
    ctx.fillStyle=`rgba(255,235,220,${0.88*pulse})`;
    ctx.font='10px "Press Start 2P",monospace';
    ctx.textAlign='center';
    ctx.fillText('CUIDADO!',W/2,yy+31);
    ctx.textAlign='left';
  }
}

function drawHUD(ctx){
  ctx.fillStyle='rgba(0,0,10,0.72)';ctx.fillRect(2,2,220,52);
  ctx.strokeStyle='rgba(0,255,255,0.25)';ctx.lineWidth=1;ctx.strokeRect(2,2,220,52);

  ctx.fillStyle='#0ff';ctx.font='11px "Press Start 2P",monospace';ctx.fillText('SCORE',10,22);
  ctx.fillStyle='#ff0';ctx.font='16px "Press Start 2P",monospace';ctx.fillText(String(_score),10,46);

  ctx.fillStyle='#8f8';ctx.font='11px "Press Start 2P",monospace';ctx.fillText('VIDA',120,22);
  ctx.fillStyle='#fff';ctx.font='16px "Press Start 2P",monospace';ctx.fillText(String(_lives),120,46);

  const wlabel=_phase==='boss_warning'?'CUIDADO':
                (_phase==='boss'||_phase==='victory_anim')?(_bossPhase===2?'BOSS ★2':'BOSS'):
                _phase==='between'?'NEXT...':('WAVE '+_wave+'/'+TOTAL_WAVES);
  ctx.fillStyle='rgba(0,0,10,0.72)';ctx.fillRect(W-130,2,127,38);
  ctx.strokeStyle='rgba(255,0,255,0.25)';ctx.lineWidth=1;ctx.strokeRect(W-130,2,127,38);
  ctx.fillStyle='#f0f';ctx.font='12px "Press Start 2P",monospace';
  ctx.textAlign='right';ctx.fillText(wlabel,W-10,30);ctx.textAlign='left';

  let px=8;
  ['speed','star','shield','spread'].forEach(t=>{
    const active=t==='speed'?_playerSpeed:t==='star'?_playerStar:t==='shield'?_playerShield:_playerSpread;
    if(!active)return;
    ctx.fillStyle=PW_COLS[t];ctx.globalAlpha=0.85;
    ctx.fillRect(px,H-36,28,28);
    ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.strokeRect(px,H-36,28,28);
    ctx.fillStyle=t==='star'||t==='spread'?'#fff':'#000';ctx.globalAlpha=1;
    ctx.font='12px "Press Start 2P",monospace';ctx.fillText(PW_LABEL[t],px+5,H-15);
    px+=36;
  });
}

function drawPowerup(ctx,p){
  const t=performance.now();
  const bob=Math.sin(t*0.003+p.x*0.01)*5;
  const cx=p.x+p.w/2, cy=p.y+bob+p.h/2;
  const ac=PW_AURA[p.type];
  const pulse=0.5+0.5*Math.sin(t*0.005+p.x*0.02);
  const pulse2=0.5+0.5*Math.sin(t*0.004+p.x*0.02+1.5);
  const pulse3=0.5+0.5*Math.sin(t*0.006+p.x*0.02+3);
  const img=p.type==='speed'?PW_SPEED_IMG:p.type==='shield'?PW_SHIELD_IMG:p.type==='spread'?PW_SPREAD_IMG:p.type==='life'?PW_LIFE_IMG:PW_STAR_IMG;
  const spr=34;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  ctx.shadowColor=ac.c1;ctx.shadowBlur=24+14*pulse;
  ctx.globalAlpha=0.12+0.10*pulse2;
  ctx.fillStyle=ac.c1;
  ctx.beginPath();ctx.ellipse(cx,cy,20+7*pulse,20+7*pulse,0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  ctx.globalAlpha=0.18+0.12*pulse;
  ctx.fillStyle=ac.c2;
  ctx.beginPath();ctx.ellipse(cx,cy,14+5*pulse2,14+5*pulse2,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  const orbCount=8;
  for(let i=0;i<orbCount;i++){
    const ang=t*0.002+i*(Math.PI*2/orbCount);
    const ang2=-t*0.003+i*(Math.PI*2/orbCount)+Math.PI/orbCount;
    const r1=17+4*Math.sin(t*0.004+i*1.3);
    const r2=13+3*Math.sin(t*0.005+i*0.9+1.2);
    const ox=cx+Math.cos(ang)*r1, oy=cy+Math.sin(ang)*r1;
    ctx.shadowColor=ac.c1;ctx.shadowBlur=8;
    ctx.globalAlpha=0.5+0.5*Math.sin(t*0.006+i*0.8);
    ctx.fillStyle=i%2===0?ac.c1:ac.c3;
    ctx.beginPath();ctx.arc(ox,oy,2.5,0,Math.PI*2);ctx.fill();
    const ox2=cx+Math.cos(ang2)*r2, oy2=cy+Math.sin(ang2)*r2;
    ctx.globalAlpha=0.4+0.4*Math.sin(t*0.005+i*1.1+0.5);
    ctx.fillStyle=i%2===0?ac.c2:ac.orb;
    ctx.beginPath();ctx.arc(ox2,oy2,2,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;ctx.globalAlpha=1;
  for(let i=0;i<4;i++){
    const ang=t*0.0035+i*(Math.PI/2)+(Math.PI/4);
    const sr=22+5*pulse;
    const sx=cx+Math.cos(ang)*sr, sy=cy+Math.sin(ang)*sr;
    ctx.shadowColor=ac.c1;ctx.shadowBlur=10;
    ctx.globalAlpha=0.7+0.3*Math.sin(t*0.007+i);
    ctx.fillStyle=ac.c1;ctx.fillRect(sx-2,sy-2,4,4);
    ctx.globalAlpha=0.3;ctx.fillStyle=ac.c3;ctx.fillRect(sx-1,sy-1,2,2);
  }
  ctx.shadowBlur=0;ctx.globalAlpha=1;
  ctx.shadowColor=ac.c1;ctx.shadowBlur=14+8*pulse;
  ctx.drawImage(img,cx-spr/2,cy-spr/2+bob,spr,spr);
  ctx.shadowBlur=0;
  ctx.globalAlpha=0.15+0.10*pulse3;
  ctx.fillStyle='#ffffff';
  ctx.beginPath();ctx.ellipse(cx-4,cy-8+bob,7,4,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;
  ctx.restore();
}

function drawBullets(ctx){
  _bullets.forEach(b=>{
    ctx.fillStyle=b.col||'#0ff';ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle=b.col?'#fff8e0':'#fff';
    ctx.globalAlpha=b.col?0.5:0.4;
    ctx.fillRect(b.x+1,b.y,2,Math.min(5,b.h-1));
    ctx.globalAlpha=1;
  });
  _ebullets.forEach(b=>{
    if(b.p2){
      const bcx=b.x+b.w/2, bcy=b.y+b.h/2;
      const r=b.w/2;
      ctx.save();
      ctx.shadowColor=b.col||'#ff0000';ctx.shadowBlur=8;
      const g=ctx.createRadialGradient(bcx,bcy,0,bcx,bcy,r);
      g.addColorStop(0,'#ffffff');
      g.addColorStop(0.35,b.col||'#ff4400');
      g.addColorStop(1,'rgba(255,0,0,0)');
      ctx.fillStyle=g;
      ctx.beginPath();ctx.arc(bcx,bcy,r+2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=b.col||'#ff4400';
      ctx.beginPath();ctx.arc(bcx,bcy,r*0.6,0,Math.PI*2);ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle=b.col||'#f0f';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle=b.col?'#ffccaa':'#fff';
      ctx.globalAlpha=0.45;
      ctx.fillRect(b.x+1,b.y+1,Math.min(3,b.w-2),Math.min(4,b.h-2));
      ctx.globalAlpha=1;
    }
  });
}

function drawParticles(ctx){
  _particles.forEach(p=>{
    const m=p.maxLife||30;
    ctx.fillStyle=p.col;
    ctx.globalAlpha=Math.min(1,(p.life/m)*1.08);
    const sz=p.sz!=null?p.sz:3;
    const h=sz*0.5;
    ctx.fillRect(Math.round(p.x-h),Math.round(p.y-h),sz,sz);
  });
  ctx.globalAlpha=1;
}

function drawVictoryOverlay(ctx){
  ctx.fillStyle='rgba(0,0,10,0.4)';ctx.fillRect(0,0,W,H);
  const t=_frame*0.05;
  ctx.fillStyle=`hsl(${(t*50)%360},100%,60%)`;
  ctx.font='14px "Press Start 2P",monospace';ctx.textAlign='center';
  ctx.fillText('BOSS DESTRUÍDO!',W/2,H/2-10);
  ctx.fillStyle='#ff0';ctx.font='8px "Press Start 2P",monospace';
  ctx.fillText('SCORE: '+_score,W/2,H/2+12);
  ctx.textAlign='left';
}

function drawBossTransition(ctx){
  const u=_bossTransitionTick/BOSS_TRANSITION_DURATION;
  const bcx=_boss?_boss.x+_boss.w/2:W/2;
  const bcy=_boss?_boss.y+_boss.h/2:H*0.3;

  // Flash branco que cresce do centro do boss
  if(u<0.5){
    const flashU=u/0.5;
    const flashR=flashU*Math.max(W,H)*1.2;
    const ease=flashU*flashU;
    ctx.save();
    const g=ctx.createRadialGradient(bcx,bcy,0,bcx,bcy,flashR);
    g.addColorStop(0,`rgba(255,255,255,${0.9*ease})`);
    g.addColorStop(0.3,`rgba(255,220,150,${0.7*ease})`);
    g.addColorStop(0.6,`rgba(255,120,0,${0.4*ease})`);
    g.addColorStop(1,'rgba(255,60,0,0)');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  } else {
    // Flash desvanece
    const fadeU=(u-0.5)/0.5;
    const alpha=1-fadeU*fadeU;
    ctx.save();
    ctx.fillStyle=`rgba(255,255,255,${0.85*alpha})`;
    ctx.fillRect(0,0,W,H);

    // Texto "FASE 2" aparecendo
    if(fadeU>0.2){
      const textAlpha=Math.min(1,(fadeU-0.2)/0.4);
      const pulse=0.7+0.3*Math.sin(_frame*0.15);
      ctx.textAlign='center';
      ctx.font='24px "Press Start 2P",monospace';
      ctx.shadowColor='#ff0000';ctx.shadowBlur=30*pulse;
      ctx.fillStyle=`rgba(255,0,0,${0.4*textAlpha*pulse})`;
      ctx.fillText('FASE 2',W/2,H/2);
      ctx.shadowBlur=14*pulse;
      ctx.fillStyle=`rgba(255,100,0,${0.7*textAlpha*pulse})`;
      ctx.fillText('FASE 2',W/2,H/2);
      ctx.shadowBlur=6;
      ctx.fillStyle=`rgba(255,255,255,${textAlpha})`;
      ctx.fillText('FASE 2',W/2,H/2);
      ctx.textAlign='left';
    }
    ctx.restore();
  }
}

function drawPauseOverlay(ctx){
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.fillRect(0,0,W,H);
  const t=performance.now();
  const pulse=0.7+0.3*Math.sin(t*0.004);
  ctx.save();
  ctx.textAlign='center';
  ctx.font='28px "Press Start 2P",monospace';
  ctx.shadowColor='#0ff';ctx.shadowBlur=24*pulse;
  ctx.fillStyle='#0ff';ctx.globalAlpha=0.3*pulse;
  ctx.fillText('PAUSADO',W/2,H/2-10);
  ctx.shadowBlur=12*pulse;
  ctx.fillStyle='#aaffff';ctx.globalAlpha=0.7*pulse;
  ctx.fillText('PAUSADO',W/2,H/2-10);
  ctx.shadowBlur=4;
  ctx.fillStyle='#ffffff';ctx.globalAlpha=1;
  ctx.fillText('PAUSADO',W/2,H/2-10);
  ctx.font='10px "Press Start 2P",monospace';
  ctx.shadowBlur=0;
  ctx.fillStyle=`rgba(200,200,255,${0.4+0.3*pulse})`;
  ctx.fillText('PRESSIONE P PARA CONTINUAR',W/2,H/2+30);
  ctx.restore();
}

function drawOutroCutscene(ctx){
  const cx=W/2;
  const platX=cx-PLAT_W/2;
  const platBottom=H*0.55;
  const platTop=0;
  const platH=platBottom-platTop;
  const pulse=0.5+0.5*Math.sin(_frame*0.06);
  const pulse2=0.5+0.5*Math.sin(_frame*0.04+1.2);

  ctx.save();

  // Sombra da plataforma
  ctx.fillStyle='rgba(0,0,0,0.4)';
  ctx.fillRect(platX+5,platTop+5,PLAT_W,platH);

  // Superfície preta
  ctx.fillStyle='#0a0820';
  ctx.fillRect(platX,platTop,PLAT_W,platH);
  ctx.fillStyle='#1a1040';
  ctx.fillRect(platX+3,platTop+3,PLAT_W-6,platH-6);

  // Borda neon cyan (topo só nos lados, pois vai até o topo da tela)
  ctx.strokeStyle='#0ff';ctx.lineWidth=2;
  ctx.globalAlpha=0.9;
  ctx.beginPath();
  ctx.moveTo(platX,platBottom);
  ctx.lineTo(platX,platTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(platX+PLAT_W,platBottom);
  ctx.lineTo(platX+PLAT_W,platTop);
  ctx.stroke();
  // Borda inferior
  ctx.beginPath();
  ctx.moveTo(platX,platBottom);
  ctx.lineTo(platX+PLAT_W,platBottom);
  ctx.stroke();
  ctx.globalAlpha=1;

  // Borda neon magenta interna
  ctx.strokeStyle='#f0f';ctx.lineWidth=1;
  ctx.globalAlpha=0.5;
  ctx.beginPath();
  ctx.moveTo(platX+4,platBottom-4);
  ctx.lineTo(platX+4,platTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(platX+PLAT_W-4,platBottom-4);
  ctx.lineTo(platX+PLAT_W-4,platTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(platX+4,platBottom-4);
  ctx.lineTo(platX+PLAT_W-4,platBottom-4);
  ctx.stroke();
  ctx.globalAlpha=1;

  // Glow dots (como CyberRun)
  ctx.fillStyle='#0ff';ctx.globalAlpha=0.4;
  for(let dy=16;dy<platH-4;dy+=18){
    ctx.fillRect(platX+10,platTop+dy,4,2);
    ctx.fillRect(platX+PLAT_W-14,platTop+dy,4,2);
  }
  ctx.globalAlpha=1;

  // Linhas de grade no chão
  ctx.fillStyle='#f0f';ctx.globalAlpha=0.08;
  for(let gy=platTop;gy<platBottom;gy+=12)
    ctx.fillRect(platX+6,gy,PLAT_W-12,1);
  for(let gx=platX+12;gx<platX+PLAT_W-8;gx+=14)
    ctx.fillRect(gx,platTop,1,platH);
  ctx.globalAlpha=1;

  // Faixa central tracejada (estilo pista)
  ctx.strokeStyle='rgba(255,0,255,0.2)';ctx.lineWidth=1;
  ctx.setLineDash([8,6]);
  ctx.beginPath();
  ctx.moveTo(cx,platTop+10);
  ctx.lineTo(cx,platBottom-10);
  ctx.stroke();
  ctx.setLineDash([]);

  // Glow pulsante nas bordas
  ctx.save();
  ctx.shadowColor='#0ff';ctx.shadowBlur=12+8*pulse;
  ctx.globalAlpha=0.15+0.1*pulse;
  ctx.fillStyle='#0ff';
  ctx.fillRect(platX,platTop,2,platH);
  ctx.fillRect(platX+PLAT_W-2,platTop,2,platH);
  ctx.shadowColor='#f0f';ctx.shadowBlur=10+6*pulse2;
  ctx.fillStyle='#f0f';
  ctx.fillRect(platX,platBottom-2,PLAT_W,2);
  ctx.restore();

  ctx.restore();

  // --- Carro top-down (desenhado em código) ---
  const carPhase=_outroTick-(OUTRO_SHIP_RISE+OUTRO_LAND);
  let carX=cx-CAR_W/2;
  let carCY=platBottom-CAR_H-30;
  let carAlpha=1;
  const carDriving=carPhase>OUTRO_CAR_WAIT;

  if(carDriving){
    const driveU=Math.min(1,(carPhase-OUTRO_CAR_WAIT)/OUTRO_CAR_DRIVE);
    const ease=driveU*driveU*(3-2*driveU);
    carCY=carCY - ease*(H*0.8+CAR_H);
    if(driveU>0.6) carAlpha=1-(driveU-0.6)/0.4;
  }

  if(carAlpha>0.01){
    ctx.save();
    ctx.globalAlpha=carAlpha;

    const cw=CAR_W, ch=CAR_H;
    const cLeft=carX, cTop=carCY;

    const carSpr=_imgCarTopdown;
    if(carSpr&&carSpr.complete&&carSpr.naturalWidth>0){
      ctx.drawImage(carSpr,cLeft,cTop,cw,ch);
    } else {
      ctx.fillStyle='#cc1133';
      ctx.fillRect(cLeft+6,cTop+4,cw-12,ch-8);
      ctx.fillStyle='#4488ee';
      ctx.fillRect(cLeft+14,cTop+ch*0.25,cw-28,ch*0.28);
    }

    // Propulsão traseira quando sai
    if(carDriving){
      const flicker=0.5+0.5*Math.sin(_frame*0.5);
      ctx.globalAlpha=carAlpha*flicker;
      ctx.save();
      ctx.shadowColor='#ff4400';ctx.shadowBlur=8;
      ctx.fillStyle='#ff6622';
      ctx.fillRect(cLeft+cw*0.28,cTop+ch,cw*0.16,8+Math.sin(_frame*0.4)*5);
      ctx.fillRect(cLeft+cw*0.56,cTop+ch,cw*0.16,8+Math.sin(_frame*0.35)*5);
      ctx.fillStyle='#ffaa44';
      ctx.fillRect(cLeft+cw*0.32,cTop+ch,cw*0.1,4+Math.sin(_frame*0.6)*3);
      ctx.fillRect(cLeft+cw*0.6,cTop+ch,cw*0.1,4+Math.sin(_frame*0.55)*3);
      ctx.restore();
      ctx.globalAlpha=carAlpha;
    }

    ctx.globalAlpha=1;
    ctx.restore();
  }

  // --- Nave do jogador ---
  const spr=_playerShipImg;
  if(spr&&spr.complete&&spr.naturalWidth>0){
    ctx.drawImage(spr,_player.x,_player.y,PLAYER_W,PLAYER_H);
  } else {
    ctx.fillStyle='#0ff';
    ctx.beginPath();
    ctx.moveTo(_player.x+PLAYER_W/2,_player.y);
    ctx.lineTo(_player.x+PLAYER_W,_player.y+PLAYER_H*0.7);
    ctx.lineTo(_player.x+PLAYER_W*0.7,_player.y+PLAYER_H);
    ctx.lineTo(_player.x+PLAYER_W*0.3,_player.y+PLAYER_H);
    ctx.lineTo(_player.x,_player.y+PLAYER_H*0.7);
    ctx.closePath();ctx.fill();
  }

  // Propulsão da nave enquanto voa
  if(_outroTick<OUTRO_SHIP_RISE+OUTRO_LAND){
    ctx.save();
    ctx.shadowColor='#ff6600';ctx.shadowBlur=10;
    ctx.fillStyle='#f80';ctx.globalAlpha=0.6+0.3*Math.sin(_frame*0.3);
    ctx.fillRect(_player.x+PLAYER_W/2-4,_player.y+PLAYER_H,8,6+Math.sin(_frame*0.4)*4);
    ctx.fillStyle='#ff4';ctx.globalAlpha=0.4+0.2*Math.sin(_frame*0.5);
    ctx.fillRect(_player.x+PLAYER_W/2-2,_player.y+PLAYER_H+2,4,3+Math.sin(_frame*0.6)*2);
    ctx.restore();
  }

  // --- Texto grande neon ---
  const tp=0.7+0.3*Math.sin(_frame*0.04);
  const textY=H*0.72;
  ctx.textAlign='center';

  if(_outroTick<OUTRO_SHIP_RISE){
    const txt='ATERRISSANDO...';
    ctx.save();
    ctx.font='18px "Press Start 2P",monospace';
    ctx.shadowColor='#0ff';ctx.shadowBlur=30*tp;
    ctx.fillStyle='#0ff';ctx.globalAlpha=0.3*tp;
    ctx.fillText(txt,W/2,textY);
    ctx.shadowBlur=16*tp;
    ctx.fillStyle='#aaffff';ctx.globalAlpha=0.7*tp;
    ctx.fillText(txt,W/2,textY);
    ctx.shadowBlur=6;
    ctx.fillStyle='#ffffff';ctx.globalAlpha=tp;
    ctx.fillText(txt,W/2,textY);
    ctx.globalAlpha=1;
    ctx.restore();
  } else if(_outroTick<OUTRO_SHIP_RISE+OUTRO_LAND+OUTRO_CAR_WAIT){
    const txt='NAVE POUSOU';
    ctx.save();
    ctx.font='20px "Press Start 2P",monospace';
    ctx.shadowColor='#f0f';ctx.shadowBlur=30*tp;
    ctx.fillStyle='#f0f';ctx.globalAlpha=0.3*tp;
    ctx.fillText(txt,W/2,textY);
    ctx.shadowBlur=16*tp;
    ctx.fillStyle='#ffaaff';ctx.globalAlpha=0.7*tp;
    ctx.fillText(txt,W/2,textY);
    ctx.shadowBlur=6;
    ctx.fillStyle='#ffffff';ctx.globalAlpha=tp;
    ctx.fillText(txt,W/2,textY);
    ctx.globalAlpha=1;
    ctx.restore();
  } else {
    const txt='PRÓXIMA MISSÃO...';
    const blink=0.5+0.5*Math.sin(_frame*0.12);
    ctx.save();
    ctx.font='20px "Press Start 2P",monospace';
    ctx.shadowColor='#0ff';ctx.shadowBlur=36*blink;
    ctx.fillStyle='#0ff';ctx.globalAlpha=0.35*blink;
    ctx.fillText(txt,W/2,textY);
    ctx.shadowColor='#00ffaa';ctx.shadowBlur=18*blink;
    ctx.fillStyle='#88ffee';ctx.globalAlpha=0.75*blink;
    ctx.fillText(txt,W/2,textY);
    ctx.shadowBlur=8;
    ctx.fillStyle='#ffffff';ctx.globalAlpha=blink;
    ctx.fillText(txt,W/2,textY);
    ctx.globalAlpha=1;
    // Seta piscante
    ctx.font='24px "Press Start 2P",monospace';
    ctx.shadowColor='#0ff';ctx.shadowBlur=20*blink;
    ctx.fillStyle=`rgba(0,255,255,${0.9*blink})`;
    ctx.fillText('▲',W/2,textY-30);
    ctx.restore();
  }
  ctx.textAlign='left';
}

// ─── INTERFACE MINIGAME ───────────────────────────────────────
const nave = {
  id: 'nave',
  name: 'STELLARIX',
  difficulty: 2,

  init(canvasEl, inputRef) {
    _ctx      = canvasEl.getContext('2d');
    _inputRef = inputRef;
    loadPlayerShipSprite();
    loadBossSprite();
    loadBossWarningImg();
    loadEnemySprites();
    loadAsteroidSprites();
    loadBackgroundSprites();
    loadCarSprite();
    _stars    = Array.from({length:80},()=>({x:rnd(0,W),y:rnd(0,H),s:rnd(0.5,2),v:rnd(0.5,2)}));
    _particles= [];
    _state    = 'idle';
    _frame    = 0;
  },

  update(dt) { update(dt); },

  render(renderCtx) {
    const ctx=renderCtx;
    drawBG(ctx);
    drawAsteroids(ctx);
    drawBullets(ctx);
    _powerups.forEach(p=>drawPowerup(ctx,p));
    _enemies.forEach(e=>drawEnemy(ctx,e));
    drawBoss(ctx);
    if(_state==='dying')drawPlayerDeathExplosion(ctx);
    else drawPlayer(ctx);
    drawParticles(ctx);
    drawBossWarning(ctx);
    drawHUD(ctx);
    if(_phase==='victory_anim') drawVictoryOverlay(ctx);
    if(_phase==='boss_transition') drawBossTransition(ctx);
    if(_phase==='outro') drawOutroCutscene(ctx);
    if(_paused) drawPauseOverlay(ctx);
  },

  getState() { return _state; },

  renderIdle(renderCtx) {
    const ctx=renderCtx;
    _frame++;
    const t=performance.now();
    drawBgLayers(ctx);
    _stars.forEach(s=>{
      s.y+=s.v;if(s.y>H){s.y=0;s.x=rnd(0,W);}
    });
    drawStarsForeground(ctx);

    const cx=W/2, titleY=165;
    const titleStr='STELLARIX';
    const gPulse=0.88+0.12*Math.sin(t*0.0038);

    ctx.save();
    ctx.textAlign='center';
    ctx.lineJoin='round';
    ctx.font='36px "Press Start 2P",monospace';

    ctx.shadowColor='#6600ff';
    ctx.shadowBlur=48*gPulse;
    ctx.fillStyle='#e0ccff';
    ctx.fillText(titleStr,cx,titleY);

    ctx.shadowColor='#aa44ff';
    ctx.shadowBlur=22*gPulse;
    ctx.fillStyle='#f0e8ff';
    ctx.fillText(titleStr,cx,titleY);

    ctx.shadowColor='#cc88ff';
    ctx.shadowBlur=10*gPulse;
    ctx.fillStyle='#ffffff';
    ctx.fillText(titleStr,cx,titleY);

    ctx.shadowBlur=0;
    ctx.lineWidth=3;
    ctx.strokeStyle='rgba(100,0,220,0.75)';
    ctx.strokeText(titleStr,cx,titleY);
    ctx.lineWidth=1.2;
    ctx.strokeStyle='rgba(200,160,255,0.9)';
    ctx.strokeText(titleStr,cx,titleY);
    ctx.fillStyle='#fffaff';
    ctx.fillText(titleStr,cx,titleY);

    ctx.font='8px "Press Start 2P",monospace';
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(180,200,255,0.55)';
    ctx.fillText('SPACE SHOOTER',cx,titleY+28);

    const shipSpr=_playerShipImg;
    const shipY=titleY+50;
    const shipBob=Math.sin(t*0.002)*6;
    if(shipSpr&&shipSpr.complete&&shipSpr.naturalWidth>0){
      ctx.shadowColor='#6600ff';ctx.shadowBlur=18+10*gPulse;
      ctx.drawImage(shipSpr,cx-PLAYER_W/2,shipY+shipBob,PLAYER_W,PLAYER_H);
      ctx.shadowBlur=0;
    }
    ctx.fillStyle='#f80';ctx.globalAlpha=0.6+0.4*Math.sin(t*0.005);
    ctx.fillRect(cx-4,shipY+shipBob+PLAYER_H,8,6+Math.sin(t*0.006)*4);
    ctx.globalAlpha=1;

    const pressPulse=0.5+0.5*Math.sin(t*0.006);
    ctx.globalAlpha=0.5+0.5*pressPulse;
    ctx.shadowColor='#aa66ff';ctx.shadowBlur=6+14*pressPulse;
    ctx.fillStyle='#ccbbff';ctx.font='12px "Press Start 2P",monospace';
    ctx.fillText('PRESS START',cx,titleY+180);
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.textAlign='left';
    ctx.restore();
  },

  reset() {
    initGame();
    _state = 'playing';
    _bgMusicStarted = false;
    _paused = false;
  },

  destroy() {
    stopBgMusic();
    stopBossWarningAudio();
  },
};

export default nave;
