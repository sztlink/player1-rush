# -*- coding: utf-8 -*-
"""Gera src/games/cyberrun.js a partir do HTML v5 (cyberrun_extracted_raw.js)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "src/games/cyberrun_extracted_raw.js"
OUT = ROOT / "src/games/cyberrun.js"


def main():
    s = RAW.read_text(encoding="utf-8")

    s = s.replace("function update(){", "function simUpdate(){", 1)
    s = s.replace("function draw(){", "function simDraw(){", 1)
    s = s.replace("function loop(){update();draw();", "function loop(){simUpdate();simDraw();", 1)

    old_dom = """const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
"""
    new_dom = """let canvas=null,ctx=null;
let _inputRef=null;
"""
    s = s.replace(old_dom, new_dom)

    old_keys = """const keys={};
document.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});
document.addEventListener('keyup',e=>keys[e.code]=false);
const btnL=document.getElementById('btnL'),btnR=document.getElementById('btnR'),btnJump=document.getElementById('btnJump');
btnL.addEventListener('touchstart',e=>{e.preventDefault();keys['ArrowLeft']=true;},{passive:false});
btnL.addEventListener('touchend',e=>{e.preventDefault();keys['ArrowLeft']=false;},{passive:false});
btnR.addEventListener('touchstart',e=>{e.preventDefault();keys['ArrowRight']=true;},{passive:false});
btnR.addEventListener('touchend',e=>{e.preventDefault();keys['ArrowRight']=false;},{passive:false});
btnJump.addEventListener('touchstart',e=>{e.preventDefault();doJump();},{passive:false});
btnL.addEventListener('mousedown',()=>keys['ArrowLeft']=true);btnL.addEventListener('mouseup',()=>keys['ArrowLeft']=false);
btnR.addEventListener('mousedown',()=>keys['ArrowRight']=true);btnR.addEventListener('mouseup',()=>keys['ArrowRight']=false);
btnJump.addEventListener('mousedown',doJump);

"""
    new_keys = """const keys={};

function syncKeysFromInput(){
  if(!_inputRef)return;
  keys['ArrowLeft']=_inputRef.left;
  keys['ArrowRight']=_inputRef.right;
  keys['ArrowUp']=_inputRef.up;
  keys['Space']=_inputRef.buttonA;
}

"""
    s = s.replace(old_keys, new_keys)

    s = s.replace(
        "function simUpdate(){\n  if(state!=='playing')return;",
        "function simUpdate(){\n  syncKeysFromInput();\n  if(state!=='playing')return;",
        1,
    )

    s = s.replace(
        """function updateHUD(){
  document.getElementById('sd').textContent=score;
  document.getElementById('td').textContent=timer.toFixed(2)+'s';
  document.getElementById('bd').textContent=bestTime!==null?bestTime.toFixed(2)+'s':'--';
  const ld=document.getElementById('ld');
  ld.textContent='♥'.repeat(Math.max(0,lives))+'♡'.repeat(Math.max(0,3-lives));
  ld.style.color=lives===1?'#f00':lives===2?'#f84':'#f44';
  const pn=document.getElementById('pwn'),pf=document.getElementById('pwFill'),pl=document.getElementById('pwLabel');
  if(powerupActive){
    const pct=Math.round(powerupTimer/powerupDuration*100);
    pf.style.width=pct+'%';
    pf.style.background=powerupActive==='speed'?'linear-gradient(90deg,#f80,#ff0)':powerupActive==='shield'?'linear-gradient(90deg,#08f,#0ff)':'linear-gradient(90deg,#80f,#f0f)';
    pl.textContent=PW[powerupActive].name;pn.textContent=PW[powerupActive].name;pn.style.color=PW[powerupActive].hue;
  }else{pf.style.width='0%';pl.textContent='';pn.textContent='--';pn.style.color='#0ff';}
}""",
        "function updateHUD(){}",
        1,
    )

    s = s.replace(
        "if(bestTime===null||finalTime<bestTime)bestTime=finalTime;setTimeout(showWin,900);",
        "if(bestTime===null||finalTime<bestTime)bestTime=finalTime;",
        1,
    )

    s = s.replace(
        """function loseLife(){
  lives--;shakeTimer=20;spawn(player.x,player.y,'#f00',12,5);updateHUD();sndHurt();
  if(lives<=0){player.dead=true;sndDead();setTimeout(showDead,600);}
  else{
    player.x=Math.max(cam.x+60,80);player.y=GROUND-RENDER_H;
    player.vy=0;player.vx=0;player.onGround=true;player.hurt=90;powerupActive=null;powerupTimer=0;
  }
}""",
        """function loseLife(){
  lives--; if(lives<1) lives=3;
  shakeTimer=20;spawn(player.x,player.y,'#f00',12,5);updateHUD();sndHurt();
  player.x=Math.max(cam.x+60,80);player.y=GROUND-RENDER_H;
  player.vy=0;player.vx=0;player.onGround=true;player.hurt=90;powerupActive=null;powerupTimer=0;
  player.dead=false;
}""",
        1,
    )

    import re as _re
    s = _re.sub(
        r"function showWin\(\)\{.*?\n\}\nfunction showDead",
        "function showWin(){}\nfunction showDead",
        s,
        count=1,
        flags=_re.DOTALL,
    )
    s = _re.sub(
        r"function showDead\(\)\{.*?\n\}\nfunction startGame",
        "function showDead(){}\nfunction startGame",
        s,
        count=1,
        flags=_re.DOTALL,
    )

    s = s.replace(
        """function startGame(){
  document.getElementById('overlay').style.display='none';
  if(animId)cancelAnimationFrame(animId);resetGame();loop();
  bgMusic.currentTime=0;bgMusic.play().catch(function(){});
}""",
        """function startGame(){
  if(animId)cancelAnimationFrame(animId);
  resetGame();
  bgMusic.currentTime=0;bgMusic.play().catch(function(){});
}""",
        1,
    )

    # Remover loop órfão, IIFE menu (dependia de #menuBg) e botão HTML
    s = _re.sub(
        r"\nfunction loop\(\)\{simUpdate\(\);simDraw\(\);animId=requestAnimationFrame\(loop\);\}\n",
        "\n",
        s,
        count=1,
    )
    s = _re.sub(
        r"\n//[^\n]*\n\(function initMenuBg\(\)\{.*?\}\)\(\);\s*",
        "\n",
        s,
        count=1,
        flags=_re.DOTALL,
    )
    s = s.replace("document.getElementById('startBtn').onclick=startGame;\n", "")

    tail = r'''

function drawCanvasHUD(c){
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.font='9px "Press Start 2P",monospace';
  c.fillStyle='#0ff';
  c.textAlign='left';
  c.fillText('SCORE '+score,56,42);
  c.fillStyle='#ff0';
  c.fillText((bestTime!==null?bestTime.toFixed(2):'--')+'s BEST',56,58);
  c.textAlign='center';
  c.fillStyle='#0ff';
  c.font='11px "Press Start 2P",monospace';
  c.fillText(timer.toFixed(2)+'s',320,36);
  c.font='10px "Press Start 2P",monospace';
  c.fillStyle=lives===1?'#f00':lives===2?'#f84':'#f44';
  const h='\u2665';
  c.fillText(h.repeat(Math.max(0,lives))+String.fromCharCode(0x2661).repeat(Math.max(0,3-lives)),320,56);
  c.textAlign='right';
  c.fillStyle='#0ff';
  c.font='9px "Press Start 2P",monospace';
  let pw='--';
  if(powerupActive&&PW[powerupActive]) pw=PW[powerupActive].name;
  c.fillText('PWR '+pw,584,42);
  if(powerupActive&&powerupDuration>0){
    const pct=Math.max(0,Math.min(1,powerupTimer/powerupDuration));
    c.fillStyle='#111';
    c.fillRect(56,64,528,6);
    c.fillStyle=powerupActive==='speed'?'#fa0':powerupActive==='shield'?'#0af':'#c6f';
    c.fillRect(56,64,528*pct,6);
  }
  c.restore();
}

let _menuStarsCache=null;
function drawMenuIdle(c){
  const t=performance.now();
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.clearRect(0,0,640,480);
  c.scale(640/1024,480/768);
  const mW=W,mH=H;
  const horizY=mH*0.52;
  if(!_menuStarsCache){
    _menuStarsCache=Array.from({length:80},()=>({x:Math.random()*mW,y:Math.random()*horizY*0.92,r:Math.random()<0.25?2:1,tw:Math.random()*Math.PI*2}));
  }
  const mStars=_menuStarsCache;
  const sky=c.createLinearGradient(0,0,0,horizY);
  sky.addColorStop(0,'#020010');sky.addColorStop(0.55,'#0c0028');sky.addColorStop(0.82,'#200040');sky.addColorStop(1,'#550025');
  c.fillStyle=sky;c.fillRect(0,0,mW,horizY);
  const fl=c.createLinearGradient(0,horizY,0,mH);
  fl.addColorStop(0,'#0a0018');fl.addColorStop(1,'#000008');
  c.fillStyle=fl;c.fillRect(0,horizY,mW,mH-horizY);
  c.save();
  c.beginPath();c.arc(mW/2,horizY,190,Math.PI,0);c.closePath();c.clip();
  const bands=['#ff0080','#ff0060','#ff1040','#ff4000','#ff7000','#ffaa00'];
  const bH=190/bands.length;
  bands.forEach(function(col,i){c.fillStyle=col;c.fillRect(mW/2-190,horizY-190+i*bH,380,bH+1);});
  c.restore();
  const sg=c.createRadialGradient(mW/2,horizY,60,mW/2,horizY,240);
  sg.addColorStop(0,'rgba(255,60,128,0.22)');sg.addColorStop(1,'rgba(255,0,80,0)');
  c.fillStyle=sg;c.beginPath();c.arc(mW/2,horizY,240,0,Math.PI*2);c.fill();
  mStars.forEach(function(s){const tw=0.35+0.65*Math.sin(t*0.0015+s.tw);c.globalAlpha=tw;c.fillStyle=s.r>1?'#9acfff':'#ffffff';c.fillRect(s.x,s.y,s.r,s.r);});
  c.globalAlpha=1;
  const hg=c.createLinearGradient(0,horizY-18,0,horizY+18);
  hg.addColorStop(0,'rgba(255,0,120,0)');hg.addColorStop(0.5,'rgba(255,0,120,0.7)');hg.addColorStop(1,'rgba(255,0,120,0)');
  c.fillStyle=hg;c.fillRect(0,horizY-18,mW,36);
  for(let i=1;i<=14;i++){
    const p=(i/14),pp=p*p,gy=horizY+(mH-horizY)*pp;
    c.strokeStyle='#cc00ff';c.globalAlpha=0.08+0.45*pp;c.lineWidth=1;
    c.beginPath();c.moveTo(0,gy);c.lineTo(mW,gy);c.stroke();
  }
  const fanN=18;
  for(let i=0;i<=fanN;i++){
    const p=i/fanN,ex=p*mW,distFromCenter=Math.abs(p-0.5)*2;
    c.strokeStyle='#00ffff';c.globalAlpha=0.06+0.22*distFromCenter;c.lineWidth=1;
    c.beginPath();c.moveTo(mW/2,horizY);c.lineTo(ex,mH);c.stroke();
  }
  c.globalAlpha=1;
  c.setTransform(1,0,0,1,0,0);
  c.textAlign='center';
  const titleY=248;
  c.shadowColor='#f0f';c.shadowBlur=14;
  c.fillStyle='#ffe6ff';c.font='28px "Press Start 2P",monospace';
  c.fillText('CYBER RUN',320,titleY);
  c.shadowBlur=0;
  c.shadowColor='#0ff';c.shadowBlur=6;
  c.fillStyle='#9ef';c.font='11px "Press Start 2P",monospace';
  c.fillText('PRESS START',320,titleY+56);
  c.shadowBlur=0;
  c.textAlign='left';
  c.restore();
}

const cyberrunGame={
  id:'cyberrun',
  name:'CYBER RUN',
  difficulty:1,

  init(canvasEl,input){
    canvas=canvasEl;
    ctx=canvas.getContext('2d');
    _inputRef=input;
    state='menu';
  },

  update(_dt){
    if(!_inputRef)return;
    syncKeysFromInput();
    if(state==='playing') simUpdate();
  },

  render(c){
    ctx=c;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,640,480);
    ctx.scale(640/1024,480/768);
    simDraw();
    ctx.restore();
    drawCanvasHUD(c);
  },

  getState(){
    if(!player)return 'playing';
    return player.won?'won':'playing';
  },

  renderIdle(c){
    drawMenuIdle(c);
  },

  reset(){
    startGame();
  },

  destroy(){
    try{if(animId)cancelAnimationFrame(animId);}catch(e){}
    try{bgMusic.pause();}catch(e){}
  },
};

export default cyberrunGame;
'''

    OUT.write_text(s + tail, encoding="utf-8")
    print("Wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
