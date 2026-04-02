/**
 * NAVE — Nível 2 do Totem CRT
 * Space shooter vertical. ~60s por run.
 * 2 ondas de inimigos + boss que patrulha o topo.
 * Powerups: rapidez, tiro duplo, escudo.
 */

// ─── ÁUDIO ───────────────────────────────────────────────────
let _ac = null;
function ac() { if(!_ac)_ac=new(window.AudioContext||window.webkitAudioContext)();return _ac; }
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
const TOTAL_WAVES=2;           // 2 ondas normais antes do boss
const ENEMIES_W1=6;            // inimigos onda 1
const ENEMIES_W2=9;            // inimigos onda 2
const BOSS_HP=8;               // pancadas para matar o boss
const SPAWN_INTERVAL=900;      // ms entre inimigos (onda 1)

// ─── ESTADO ──────────────────────────────────────────────────
let _ctx, _inputRef, _state='idle';
let _score=0, _wave=0, _frame=0;
let _stars=[], _particles=[];
let _player, _bullets=[], _enemies=[], _ebullets=[], _powerups=[];
let _boss=null, _bossAlive=false;
let _waveEnemiesLeft=0, _spawnQueue=0, _spawnTimer=0;
let _playerShield=false, _shieldTimer=0;
let _playerDouble=false, _doubleTimer=0;
let _playerSpeed=false, _speedTimer=0;
let _shootCooldown=0;
let _phase='wave'; // 'wave'|'boss'|'victory_anim'
let _victoryTimer=0;

// ─── HELPERS ─────────────────────────────────────────────────
function rnd(a,b){return a+Math.random()*(b-a);}
function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function particle(x,y,col,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=rnd(1,5);
    _particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:30,col});
  }
}

// ─── INIT ────────────────────────────────────────────────────
function initGame(){
  _score=0; _wave=0; _frame=0; _phase='wave';
  _bullets=[]; _enemies=[]; _ebullets=[]; _powerups=[]; _particles=[];
  _boss=null; _bossAlive=false;
  _playerShield=false; _shieldTimer=0;
  _playerDouble=false; _doubleTimer=0;
  _playerSpeed=false; _speedTimer=0;
  _shootCooldown=0;
  _player={x:W/2-15,y:H-70,w:30,h:40,vx:0,hurtTimer:0};
  _stars=Array.from({length:80},()=>({x:rnd(0,W),y:rnd(0,H),s:rnd(0.5,2),v:rnd(0.5,2)}));
  startWave(1);
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
  _phase='boss';
  _bossAlive=true;
  _boss={
    x:W/2-45, y:30, w:90, h:70,
    hp:BOSS_HP, maxHp:BOSS_HP,
    vx:1.8, dir:1,
    shootTimer:0, shootCooldown:90,
    hurtTimer:0,
  };
  sndBossEntry();
}

// ─── UPDATE ──────────────────────────────────────────────────
function update(dt){
  if(_state!=='playing')return;
  _frame++;
  const inp=_inputRef||{};
  const spd=(_playerSpeed?7:4);

  // Player move
  if(inp.left  && _player.x>0)         _player.x-=spd;
  if(inp.right && _player.x<W-_player.w) _player.x+=spd;
  if(inp.up    && _player.y>H/2)        _player.y-=spd;
  if(inp.down  && _player.y<H-_player.h) _player.y+=spd;

  // Shoot
  _shootCooldown--;
  if((inp.buttonA||inp.up)&&_shootCooldown<=0){
    const bx=_player.x+_player.w/2-2;
    _bullets.push({x:bx,y:_player.y,w:4,h:12,v:10});
    if(_playerDouble){
      _bullets.push({x:_player.x-2,y:_player.y+10,w:4,h:12,v:10});
      _bullets.push({x:_player.x+_player.w-2,y:_player.y+10,w:4,h:12,v:10});
    }
    _shootCooldown=_playerSpeed?6:12;
    sndShoot();
  }

  // Timers powerup
  if(_playerShield){_shieldTimer--;if(_shieldTimer<=0)_playerShield=false;}
  if(_playerDouble){_doubleTimer--;if(_doubleTimer<=0)_playerDouble=false;}
  if(_playerSpeed) {_speedTimer--;if(_speedTimer<=0)_playerSpeed=false;}
  if(_player.hurtTimer>0)_player.hurtTimer--;

  // Stars
  _stars.forEach(s=>{s.y+=s.v;if(s.y>H){s.y=0;s.x=rnd(0,W);}});

  // Bullets player
  _bullets.forEach(b=>{b.y-=b.v;});
  _bullets=_bullets.filter(b=>b.y>-20);

  // PHASE: wave
  if(_phase==='wave'){
    // Spawn
    _spawnTimer+=dt;
    if(_spawnQueue>0&&_spawnTimer>=SPAWN_INTERVAL){
      _spawnTimer=0; _spawnQueue--;
      const cols=3, col=(_waveEnemiesLeft-_spawnQueue-1)%cols;
      _enemies.push({
        x:col*(W/cols)+rnd(10,W/cols-40), y:-40, w:28,h:28,
        vx:rnd(-0.8,0.8), vy:rnd(1.4,2.2),
        hp:1, hurtTimer:0
      });
    }

    // Move enemies
    _enemies.forEach(e=>{
      e.x+=e.vx; e.y+=e.vy;
      if(e.x<0||e.x>W-e.w)e.vx*=-1;
      if(e.hurtTimer>0)e.hurtTimer--;
    });

    // Bullet x enemy
    _bullets.forEach(b=>{
      _enemies.forEach(e=>{
        if(e.active===false)return;
        if(hit(b,e)){
          b.y=-999; e.hp--;
          if(e.hp<=0){
            particle(e.x+e.w/2,e.y+e.h/2,'#f44',6);
            sndExplosion(); _score+=10; e.active=false;
            _waveEnemiesLeft--;
            // chance powerup
            if(Math.random()<0.25) dropPowerup(e.x+e.w/2,e.y+e.h/2);
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
      if(hit(_player,e)){
        particle(e.x+e.w/2,e.y+e.h/2,'#f44',4);
        e.active=false; _waveEnemiesLeft--;
        if(!_playerShield){_player.hurtTimer=30;sndHit();}
      }
    });

    // Wave complete?
    if(_spawnQueue===0&&_enemies.length===0){  // todos spawnados e tela limpa = onda concluída
      if(_wave<TOTAL_WAVES){
        setTimeout(()=>startWave(_wave+1),1200);
      } else {
        setTimeout(()=>spawnBoss(),1500);
      }
      _phase='between';
    }
  }

  // PHASE: boss
  if(_phase==='boss'&&_boss&&_bossAlive){
    // Boss patrulha o topo, NÃO cai
    _boss.x+=_boss.vx*_boss.dir;
    if(_boss.x<20||_boss.x>W-_boss.w-20)_boss.dir*=-1;
    // Boss desce levemente e sobe (bobbing)
    _boss.y=30+Math.sin(_frame*0.03)*15;
    if(_boss.hurtTimer>0)_boss.hurtTimer--;

    // Boss atira
    _boss.shootTimer++;
    if(_boss.shootTimer>=_boss.shootCooldown){
      _boss.shootTimer=0;
      // tiro em spread: 3 balas
      const cx=_boss.x+_boss.w/2;
      _ebullets.push({x:cx-3,y:_boss.y+_boss.h,w:5,h:12,vx:-1.5,vy:3.5});
      _ebullets.push({x:cx-3,y:_boss.y+_boss.h,w:5,h:12,vx:0,  vy:4});
      _ebullets.push({x:cx-3,y:_boss.y+_boss.h,w:5,h:12,vx:1.5, vy:3.5});
    }

    // Bullet player x boss
    _bullets.forEach(b=>{
      if(_boss&&hit(b,_boss)){
        b.y=-999; _boss.hp--; _boss.hurtTimer=8;
        particle(_boss.x+_boss.w/2,_boss.y+_boss.h/2,'#0ff',4);
        if(_boss.hp<=0){
          _bossAlive=false; _score+=500;
          particle(_boss.x+_boss.w/2,_boss.y+_boss.h/2,'#ff0',20);
          sndVictory();
          _phase='victory_anim';
          _victoryTimer=120;
        } else { sndHit(); }
      }
    });

    // Player x boss
    if(_boss&&hit(_player,_boss)){
      if(!_playerShield){_player.hurtTimer=40;sndHit();}
    }
  }

  // Victory animation
  if(_phase==='victory_anim'){
    _victoryTimer--;
    particle(rnd(0,W),rnd(0,H/2),'#ff0',2);
    if(_victoryTimer<=0) _state='won';
  }

  // Enemy bullets
  _ebullets.forEach(b=>{b.x+=b.vx;b.y+=b.vy;});
  _ebullets=_ebullets.filter(b=>b.y<H+20&&b.x>-20&&b.x<W+20);

  // Player x enemy bullets
  _ebullets.forEach(b=>{
    if(hit(_player,b)){
      b.y=H+99;
      if(!_playerShield){_player.hurtTimer=40;sndHit();}
    }
  });

  // Powerups
  _powerups.forEach(p=>{p.y+=1.5;});
  _powerups.forEach(p=>{
    if(hit(_player,p)){
      p.collected=true; sndPowerup();
      if(p.type==='speed'){_playerSpeed=true;_speedTimer=300;}
      if(p.type==='double'){_playerDouble=true;_doubleTimer=400;}
      if(p.type==='shield'){_playerShield=true;_shieldTimer=350;}
    }
  });
  _powerups=_powerups.filter(p=>!p.collected&&p.y<H+20);

  // Particles
  _particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;});
  _particles=_particles.filter(p=>p.life>0);
}

function dropPowerup(x,y){
  const types=['speed','double','shield'];
  const t=types[Math.floor(Math.random()*types.length)];
  _powerups.push({x:x-10,y,w:20,h:20,type:t,collected:false});
}

// ─── RENDER ──────────────────────────────────────────────────
const PW_COLS={speed:'#ff0',double:'#0ff',shield:'#0f8'};
const PW_LABEL={speed:'S',double:'×2',shield:'O'};

function drawBG(ctx){
  ctx.fillStyle='#050510';ctx.fillRect(0,0,W,H);
  _stars.forEach(s=>{
    ctx.fillStyle='#fff';ctx.globalAlpha=0.4+0.3*Math.sin(_frame*0.05+s.x);
    ctx.fillRect(s.x,s.y,s.s,s.s);
  });
  ctx.globalAlpha=1;
}

function drawPlayer(ctx){
  const p=_player;
  if(p.hurtTimer>0&&Math.floor(_frame/3)%2===0)return;
  // escudo
  if(_playerShield){
    ctx.strokeStyle='#0f8';ctx.lineWidth=2;ctx.globalAlpha=0.6+0.3*Math.sin(_frame*0.15);
    ctx.beginPath();ctx.arc(p.x+p.w/2,p.y+p.h/2,28,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
  }
  // corpo
  ctx.fillStyle=_playerSpeed?'#ff0':'#0ff';
  // fuselagem
  ctx.beginPath();
  ctx.moveTo(p.x+p.w/2,p.y);
  ctx.lineTo(p.x+p.w,p.y+p.h*0.7);
  ctx.lineTo(p.x+p.w*0.7,p.y+p.h);
  ctx.lineTo(p.x+p.w*0.3,p.y+p.h);
  ctx.lineTo(p.x,p.y+p.h*0.7);
  ctx.closePath();ctx.fill();
  // cockpit
  ctx.fillStyle='#000';
  ctx.beginPath();ctx.arc(p.x+p.w/2,p.y+p.h*0.4,5,0,Math.PI*2);ctx.fill();
  // propulsão
  ctx.fillStyle='#f80';ctx.globalAlpha=0.6+0.4*Math.sin(_frame*0.3);
  ctx.fillRect(p.x+p.w/2-4,p.y+p.h,8,6+Math.sin(_frame*0.4)*4);
  if(_playerDouble){
    ctx.fillRect(p.x+4,p.y+p.h,5,4+Math.sin(_frame*0.4)*3);
    ctx.fillRect(p.x+p.w-9,p.y+p.h,5,4+Math.sin(_frame*0.4)*3);
  }
  ctx.globalAlpha=1;
}

function drawEnemy(ctx,e){
  const hurt=e.hurtTimer>0&&Math.floor(_frame/2)%2===0;
  ctx.fillStyle=hurt?'#fff':'#f33';
  ctx.fillRect(e.x,e.y,e.w,e.h);
  ctx.fillStyle=hurt?'#f33':'#a00';
  ctx.fillRect(e.x+4,e.y+4,e.w-8,e.h-8);
  ctx.fillStyle='#ff0';
  ctx.fillRect(e.x+6,e.y+8,4,4);
  ctx.fillRect(e.x+e.w-10,e.y+8,4,4);
}

function drawBoss(ctx){
  if(!_boss||!_bossAlive)return;
  const b=_boss;
  const hurt=b.hurtTimer>0&&Math.floor(_frame/2)%2===0;
  const pulse=0.7+0.3*Math.sin(_frame*0.12);
  // glow
  ctx.fillStyle=`rgba(255,50,0,${0.12*pulse})`;
  ctx.fillRect(b.x-10,b.y-10,b.w+20,b.h+20);
  // body
  ctx.fillStyle=hurt?'#fff':`rgba(220,${Math.floor(40*pulse)},20,1)`;
  ctx.fillRect(b.x,b.y,b.w,b.h);
  ctx.fillStyle='#600';
  ctx.fillRect(b.x+8,b.y+8,b.w-16,b.h-16);
  // olhos
  ctx.fillStyle='#ff0';
  ctx.fillRect(b.x+18,b.y+22,10,10);
  ctx.fillRect(b.x+b.w-28,b.y+22,10,10);
  // pupila
  ctx.fillStyle='#000';
  ctx.fillRect(b.x+21,b.y+25,4,4);
  ctx.fillRect(b.x+b.w-25,b.y+25,4,4);
  // HP bar
  const hpPct=b.hp/b.maxHp;
  ctx.fillStyle='#300';ctx.fillRect(b.x,b.y-12,b.w,6);
  ctx.fillStyle=hpPct>0.5?'#0f0':hpPct>0.25?'#ff0':'#f00';
  ctx.fillRect(b.x,b.y-12,b.w*hpPct,6);
  ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.globalAlpha=0.4;
  ctx.strokeRect(b.x,b.y-12,b.w,6);ctx.globalAlpha=1;
}

function drawHUD(ctx){
  // Score
  ctx.fillStyle='rgba(0,0,10,0.6)';ctx.fillRect(3,3,100,24);
  ctx.fillStyle='#0ff7';ctx.font='6px "Press Start 2P",monospace';ctx.fillText('SCORE',7,13);
  ctx.fillStyle='#ff0';ctx.font='9px "Press Start 2P",monospace';ctx.fillText(String(_score),7,24);
  // Wave
  const wlabel=_phase==='boss'||_phase==='victory_anim'?'BOSS':
                _phase==='between'?'NEXT...':('WAVE '+_wave+'/'+TOTAL_WAVES);
  ctx.fillStyle='rgba(0,0,10,0.6)';ctx.fillRect(W-130,3,127,24);
  ctx.fillStyle='#f0f';ctx.font='6px "Press Start 2P",monospace';
  ctx.textAlign='right';ctx.fillText(wlabel,W-7,20);ctx.textAlign='left';
  // Powerup activos
  let px=7;
  ['speed','double','shield'].forEach(t=>{
    const active=t==='speed'?_playerSpeed:t==='double'?_playerDouble:_playerShield;
    if(!active)return;
    ctx.fillStyle=PW_COLS[t];ctx.globalAlpha=0.85;
    ctx.fillRect(px,H-22,18,18);
    ctx.fillStyle='#000';ctx.globalAlpha=1;
    ctx.font='7px "Press Start 2P",monospace';ctx.fillText(PW_LABEL[t],px+2,H-8);
    px+=24;
  });
}

function drawPowerup(ctx,p){
  const c=PW_COLS[p.type];
  const bob=Math.sin(_frame*0.1+p.x)*3;
  ctx.fillStyle=c;ctx.globalAlpha=0.9;
  ctx.fillRect(p.x,p.y+bob,p.w,p.h);
  ctx.fillStyle='#000';ctx.globalAlpha=1;
  ctx.font='7px "Press Start 2P",monospace';ctx.fillText(PW_LABEL[p.type],p.x+3,p.y+bob+13);
}

function drawBullets(ctx){
  _bullets.forEach(b=>{
    ctx.fillStyle='#0ff';ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#fff';ctx.globalAlpha=0.4;ctx.fillRect(b.x+1,b.y,2,4);ctx.globalAlpha=1;
  });
  _ebullets.forEach(b=>{
    ctx.fillStyle='#f0f';ctx.fillRect(b.x,b.y,b.w,b.h);
  });
}

function drawParticles(ctx){
  _particles.forEach(p=>{
    ctx.fillStyle=p.col;ctx.globalAlpha=p.life/30;
    ctx.fillRect(Math.round(p.x),Math.round(p.y),3,3);
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

// ─── INTERFACE MINIGAME ───────────────────────────────────────
const nave = {
  id: 'nave',
  name: 'NAVE',
  difficulty: 2,

  init(canvasEl, inputRef) {
    _ctx      = canvasEl.getContext('2d');
    _inputRef = inputRef;
    _stars    = Array.from({length:80},()=>({x:rnd(0,W),y:rnd(0,H),s:rnd(0.5,2),v:rnd(0.5,2)}));
    _particles= [];
    _state    = 'idle';
    _frame    = 0;
  },

  update(dt) { update(dt); },

  render(renderCtx) {
    const ctx=renderCtx;
    drawBG(ctx);
    drawBullets(ctx);
    _powerups.forEach(p=>drawPowerup(ctx,p));
    _enemies.forEach(e=>drawEnemy(ctx,e));
    drawBoss(ctx);
    drawPlayer(ctx);
    drawParticles(ctx);
    drawHUD(ctx);
    if(_phase==='victory_anim') drawVictoryOverlay(ctx);
  },

  getState() { return _state; },

  renderIdle(renderCtx) {
    const ctx=renderCtx;
    _frame++;
    // fundo animado
    ctx.fillStyle='#050510';ctx.fillRect(0,0,W,H);
    _stars.forEach(s=>{
      s.y+=s.v;if(s.y>H){s.y=0;s.x=rnd(0,W);}
      ctx.fillStyle='#fff';ctx.globalAlpha=0.5;
      ctx.fillRect(s.x,s.y,s.s,s.s);
    });
    ctx.globalAlpha=1;
    // nave piscando no centro
    if(Math.floor(_frame/30)%2===0){
      const cx=W/2-15, cy=H*0.6;
      ctx.fillStyle='#0ff';
      ctx.beginPath();ctx.moveTo(cx+15,cy);ctx.lineTo(cx+30,cy+28);
      ctx.lineTo(cx+21,cy+40);ctx.lineTo(cx+9,cy+40);ctx.lineTo(cx,cy+28);
      ctx.closePath();ctx.fill();
    }
  },

  reset() {
    initGame();
    _state = 'playing';
  },

  destroy() {
    _ctx=null; _inputRef=null;
  },
};

export default nave;
