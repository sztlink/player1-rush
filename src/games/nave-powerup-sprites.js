/**
 * nave-powerup-sprites.js
 * Sprites dos powerups gerados por canvas — sem assets externos.
 * Cores alinhadas ao PW_AURA de nave.js.
 * ctx.drawImage() aceita HTMLCanvasElement nativamente.
 *
 * speed  → raio (amarelo  #ffff66)
 * shield → escudo (verde   #00ff88)
 * star   → estrela (magenta #ff00ff)
 * spread → 3 balas (laranja #ffaa44)
 * life   → coração (vermelho #ff4444)
 */

function makePowerupCanvas(type) {
  const c = document.createElement('canvas');
  c.width = 34;
  c.height = 34;
  const ctx = c.getContext('2d');
  const cx = 17, cy = 17;

  const palette = {
    speed:  { main: '#ffff66', accent: '#ffee22', bg: 'rgba(60,40,0,0.7)'   },
    shield: { main: '#00ff88', accent: '#00cc44', bg: 'rgba(0,40,20,0.7)'   },
    star:   { main: '#ff00ff', accent: '#aa00ff', bg: 'rgba(40,0,40,0.7)'   },
    spread: { main: '#ffaa44', accent: '#ff6600', bg: 'rgba(50,20,0,0.7)'   },
    life:   { main: '#ff4444', accent: '#ff0000', bg: 'rgba(40,0,0,0.7)'    },
  };

  const { main, accent, bg } = palette[type];

  // Fundo circular suave
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();

  // Borda colorida
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ícone principal
  ctx.fillStyle = main;
  ctx.shadowColor = main;
  ctx.shadowBlur = 10;

  if (type === 'speed') {
    // Raio
    ctx.beginPath();
    ctx.moveTo(20, 4);
    ctx.lineTo(12, 17);
    ctx.lineTo(17, 17);
    ctx.lineTo(14, 30);
    ctx.lineTo(22, 17);
    ctx.lineTo(17, 17);
    ctx.closePath();
    ctx.fill();

  } else if (type === 'shield') {
    // Escudo
    ctx.beginPath();
    ctx.moveTo(17, 4);
    ctx.lineTo(27, 9);
    ctx.lineTo(27, 18);
    ctx.quadraticCurveTo(27, 27, 17, 31);
    ctx.quadraticCurveTo(7, 27, 7, 18);
    ctx.lineTo(7, 9);
    ctx.closePath();
    ctx.fill();
    // Cruz interna
    ctx.fillStyle = bg;
    ctx.shadowBlur = 0;
    ctx.fillRect(15, 10, 4, 14);
    ctx.fillRect(10, 15, 14, 4);

  } else if (type === 'star') {
    // Estrela 5 pontas
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 13 : 5;
      const angle = (i * Math.PI / 5) - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

  } else if (type === 'spread') {
    // 3 projéteis em leque
    const barW = 4, barH = 16;
    // central
    ctx.fillRect(cx - barW / 2, cy - barH / 2, barW, barH);
    // esquerda (leve diagonal)
    ctx.save();
    ctx.translate(cx - 8, cy);
    ctx.rotate(-0.25);
    ctx.fillRect(-barW / 2, -barH / 2, barW, barH);
    ctx.restore();
    // direita (leve diagonal)
    ctx.save();
    ctx.translate(cx + 8, cy);
    ctx.rotate(0.25);
    ctx.fillRect(-barW / 2, -barH / 2, barW, barH);
    ctx.restore();

  } else if (type === 'life') {
    // Coração
    ctx.beginPath();
    ctx.moveTo(17, 27);
    ctx.bezierCurveTo(3, 19, 3, 7, 11, 7);
    ctx.bezierCurveTo(14, 7, 17, 10, 17, 10);
    ctx.bezierCurveTo(17, 10, 20, 7, 23, 7);
    ctx.bezierCurveTo(31, 7, 31, 19, 17, 27);
    ctx.fill();
  }

  return c;
}

export const PW_SPEED_IMG  = makePowerupCanvas('speed');
export const PW_SHIELD_IMG = makePowerupCanvas('shield');
export const PW_STAR_IMG   = makePowerupCanvas('star');
export const PW_SPREAD_IMG = makePowerupCanvas('spread');
export const PW_LIFE_IMG   = makePowerupCanvas('life');
