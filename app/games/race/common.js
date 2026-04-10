//=========================================================================
// minimalist DOM helpers
//=========================================================================

var Dom = {

  get:  function(id)                     { return ((id instanceof HTMLElement) || (id === document)) ? id : document.getElementById(id); },
  set:  function(id, html)               { Dom.get(id).innerHTML = html;                        },
  on:   function(ele, type, fn, capture) { Dom.get(ele).addEventListener(type, fn, capture);    },
  un:   function(ele, type, fn, capture) { Dom.get(ele).removeEventListener(type, fn, capture); },
  show: function(ele, type)              { Dom.get(ele).style.display = (type || 'block');      },
  blur: function(ev)                     { ev.target.blur();                                    },

  addClassName:    function(ele, name)     { Dom.toggleClassName(ele, name, true);  },
  removeClassName: function(ele, name)     { Dom.toggleClassName(ele, name, false); },
  toggleClassName: function(ele, name, on) {
    ele = Dom.get(ele);
    var classes = ele.className.split(' ');
    var n = classes.indexOf(name);
    on = (typeof on == 'undefined') ? (n < 0) : on;
    if (on && (n < 0))
      classes.push(name);
    else if (!on && (n >= 0))
      classes.splice(n, 1);
    ele.className = classes.join(' ');
  },

  storage: window.localStorage || {}

}

//=========================================================================
// general purpose helpers (mostly math)
//=========================================================================

var Util = {

  timestamp:        function()                  { return new Date().getTime();                                    },
  toInt:            function(obj, def)          { if (obj !== null) { var x = parseInt(obj, 10); if (!isNaN(x)) return x; } return Util.toInt(def, 0); },
  toFloat:          function(obj, def)          { if (obj !== null) { var x = parseFloat(obj);   if (!isNaN(x)) return x; } return Util.toFloat(def, 0.0); },
  limit:            function(value, min, max)   { return Math.max(min, Math.min(value, max));                     },
  randomInt:        function(min, max)          { return Math.round(Util.interpolate(min, max, Math.random()));   },
  randomChoice:     function(options)           { return options[Util.randomInt(0, options.length-1)];            },
  percentRemaining: function(n, total)          { return (n%total)/total;                                         },
  accelerate:       function(v, accel, dt)      { return v + (accel * dt);                                        },
  interpolate:      function(a,b,percent)       { return a + (b-a)*percent                                        },
  easeIn:           function(a,b,percent)       { return a + (b-a)*Math.pow(percent,2);                           },
  easeOut:          function(a,b,percent)       { return a + (b-a)*(1-Math.pow(1-percent,2));                     },
  easeInOut:        function(a,b,percent)       { return a + (b-a)*((-Math.cos(percent*Math.PI)/2) + 0.5);        },
  exponentialFog:   function(distance, density) { return 1 / (Math.pow(Math.E, (distance * distance * density))); },

  increase:  function(start, increment, max) { // with looping
    var result = start + increment;
    while (result >= max)
      result -= max;
    while (result < 0)
      result += max;
    return result;
  },

  project: function(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x     = (p.world.x || 0) - cameraX;
    p.camera.y     = (p.world.y || 0) - cameraY;
    p.camera.z     = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth/p.camera.z;
    p.screen.x     = Math.round((width/2)  + (p.screen.scale * p.camera.x  * width/2));
    p.screen.y     = Math.round((height/2) - (p.screen.scale * p.camera.y  * height/2));
    p.screen.w     = Math.round(             (p.screen.scale * roadWidth   * width/2));
  },

  overlap: function(x1, w1, x2, w2, percent) {
    var half = (percent || 1)/2;
    var min1 = x1 - (w1*half);
    var max1 = x1 + (w1*half);
    var min2 = x2 - (w2*half);
    var max2 = x2 + (w2*half);
    return ! ((max1 < min2) || (min1 > max2));
  },

  // Cruza uma linha de mundo Z (ex.: marca na pista) entre z0 e z0+delta (delta > 0), com pista fechada em trackLen.
  crossesWorldZLine: function(z0, delta, lineZ, trackLen) {
    if (delta <= 0 || trackLen <= 0) return false;
    lineZ = ((lineZ % trackLen) + trackLen) % trackLen;
    var zEnd = z0 + delta;
    var kmin = Math.floor((z0 - lineZ) / trackLen);
    var kmax = Math.ceil((zEnd - lineZ) / trackLen);
    var k, lz;
    for (k = kmin; k <= kmax; k++) {
      lz = lineZ + k * trackLen;
      if (lz > z0 && lz <= zEnd) return true;
    }
    return false;
  }

}

//=========================================================================
// POLYFILL for requestAnimationFrame
//=========================================================================

if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  window.requestAnimationFrame = window.webkitRequestAnimationFrame || 
                                 window.mozRequestAnimationFrame    || 
                                 window.oRequestAnimationFrame      || 
                                 window.msRequestAnimationFrame     || 
                                 function(callback, element) {
                                   window.setTimeout(callback, 1000 / 60);
                                 }
}

//=========================================================================
// GAME LOOP helpers
//=========================================================================

var Game = {  // a modified version of the game loop from my previous boulderdash game - see http://codeincomplete.com/posts/2011/10/25/javascript_boulderdash/#gameloop

  run: function(options) {

    Game.loadImages(options.images, function(images) {

      options.ready(images); // tell caller to initialize itself because images are loaded and we're ready to rumble

      Game.setKeyListener(options.keys);

      var canvas = options.canvas,    // canvas render target is provided by caller
          update = options.update,    // method to update game logic is provided by caller
          render = options.render,    // method to render the game is provided by caller
          step   = options.step,      // fixed frame step (1/fps) is specified by caller
//          stats  = options.stats,     // stats instance is provided by caller
          now    = null,
          last   = Util.timestamp(),
          dt     = 0,
          gdt    = 0;

      function frame() {
        now = Util.timestamp();
        dt  = Math.min(1, (now - last) / 1000); // using requestAnimationFrame have to be able to handle large delta's caused when it 'hibernates' in a background or non-visible tab
        gdt = gdt + dt;
        while (gdt > step) {
          gdt = gdt - step;
          update(step);
        }
        render();
//        stats.update();
        last = now;
        requestAnimationFrame(frame, canvas);
      }
      frame(); // lets get this party started
      Game.playMusic();
    });
  },

  //---------------------------------------------------------------------------

  loadImages: function(names, callback) { // load multiple images and callback when ALL images have loaded
    var result = [];
    var count  = names.length;

    var onload = function() {
      if (--count == 0)
        callback(result);
    };

    for(var n = 0 ; n < names.length ; n++) {
      var name = names[n];
      result[n] = document.createElement('img');
      Dom.on(result[n], 'load', onload);
      result[n].src = "images/" + name + ".png";
    }
  },

  //---------------------------------------------------------------------------

  setKeyListener: function(keys) {
    var onkey = function(keyCode, mode) {
      var n, k;
      for(n = 0 ; n < keys.length ; n++) {
        k = keys[n];
        k.mode = k.mode || 'up';
        if ((k.key == keyCode) || (k.keys && (k.keys.indexOf(keyCode) >= 0))) {
          if (k.mode == mode) {
            k.action.call();
          }
        }
      }
    };
    Dom.on(document, 'keydown', function(ev) { onkey(ev.keyCode, 'down'); } );
    Dom.on(document, 'keyup',   function(ev) { onkey(ev.keyCode, 'up');   } );
  },

  //---------------------------------------------------------------------------

/*
  stats: function(parentId, id) { // construct mr.doobs FPS counter - along with friendly good/bad/ok message box

    var result = new Stats();
    result.domElement.id = id || 'stats';
    Dom.get(parentId).appendChild(result.domElement);

    var msg = document.createElement('div');
    msg.style.cssText = "border: 2px solid gray; padding: 5px; margin-top: 5px; text-align: left; font-size: 1.15em; text-align: right;";
    msg.innerHTML = "Your canvas performance is ";
    Dom.get(parentId).appendChild(msg);

    var value = document.createElement('span');
    value.innerHTML = "...";
    msg.appendChild(value);

    setInterval(function() {
      var fps   = result.current();
      var ok    = (fps > 50) ? 'good'  : (fps < 30) ? 'bad' : 'ok';
      var color = (fps > 50) ? 'green' : (fps < 30) ? 'red' : 'gray';
      value.innerHTML       = ok;
      value.style.color     = color;
      msg.style.borderColor = color;
    }, 5000);
    return result;
  },

*/
  //---------------------------------------------------------------------------

  playMusic: function() {
    var music = document.getElementById('bg-music');
    if (!music) return;
    music.loop = true;
    music.volume = 0.32;
    music.muted = (Dom.storage.musicMuted === 'true');
  },

  tryPlayBackgroundMusic: function() {
    var music = document.getElementById('bg-music');
    if (!music || music.muted) return;
    var p = music.play();
    if (p && typeof p.catch === 'function')
      p.catch(function() {});
  },

  pauseBackgroundMusic: function() {
    var music = document.getElementById('bg-music');
    if (music && !music.paused) music.pause();
  },

  resumeBackgroundMusic: function() {
    Game.tryPlayBackgroundMusic();
  }

}

//=========================================================================
// canvas rendering helpers
//=========================================================================

var Render = {

  polygon: function(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  },

  //---------------------------------------------------------------------------
  // Bermas “cyber”: grelha neon em perspectiva (sem textura — só linhas).

  _cyberNeonStroke: function(ctx, x0, y0, x1, y1, color, fog, pulse) {
    var scale = 0.5 + 0.5 * (1 - fog);
    var a = 0.48 * pulse * (1 - fog * 0.82);
    if (a < 0.035) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = 3.2 * scale;
    ctx.globalAlpha = a * 0.4;
    ctx.stroke();
    ctx.lineWidth = 1.15 * scale;
    ctx.globalAlpha = a;
    ctx.stroke();
    ctx.restore();
  },

  cyberRoadSides: function(ctx, width, fog, y1, y2, lx, lx2, rx, rx2, phase) {
    var pulse = 0.82 + 0.18 * Math.sin(phase * 2.1);
    var cols = [0.12, 0.34, 0.56, 0.78];
    var rows = [0.18, 0.42, 0.64, 0.86];
    var colors = ['#00d4ff', '#d42844', '#9d4dff', '#c86bff'];
    var i, t, yt, xa, xb, wob, c;
    if (lx > 2) {
      for (i = 0; i < cols.length; i++) {
        wob = 0.04 * Math.sin(phase * 1.4 + i * 1.9);
        c = colors[i % colors.length];
        xa = (cols[i] + wob) * lx;
        xb = (cols[i] + wob) * lx2;
        Render._cyberNeonStroke(ctx, xa, y1, xb, y2, c, fog, pulse);
      }
      for (i = 0; i < rows.length; i++) {
        t = rows[i] + 0.03 * Math.sin(phase * 0.9 + i);
        yt = y1 + t * (y2 - y1);
        xa = (1 - t) * lx + t * lx2;
        c = colors[(i + 2) % colors.length];
        Render._cyberNeonStroke(ctx, 0, yt, xa, yt, c, fog, pulse * 0.92);
      }
    }
    if (rx < width - 2) {
      for (i = 0; i < cols.length; i++) {
        wob = 0.04 * Math.sin(phase * 1.4 + i * 1.9 + 2.1);
        c = colors[(i + 1) % colors.length];
        xa = rx + (cols[i] + wob) * (width - rx);
        xb = rx2 + (cols[i] + wob) * (width - rx2);
        Render._cyberNeonStroke(ctx, xa, y1, xb, y2, c, fog, pulse);
      }
      for (i = 0; i < rows.length; i++) {
        t = rows[i] + 0.03 * Math.sin(phase * 0.9 + i + 1.3);
        yt = y1 + t * (y2 - y1);
        xa = (1 - t) * rx + t * rx2;
        c = colors[(i + 3) % colors.length];
        Render._cyberNeonStroke(ctx, xa, yt, width, yt, c, fog, pulse * 0.92);
      }
    }
  },

  segment: function(ctx, width, lanes, x1, y1, w1, x2, y2, w2, fog, color, cyberPhase, segmentIndex) {

    var r1 = Render.rumbleWidth(w1, lanes),
        r2 = Render.rumbleWidth(w2, lanes),
        l1 = Render.laneMarkerWidth(w1, lanes),
        l2 = Render.laneMarkerWidth(w2, lanes),
        lanew1, lanew2, lanex1, lanex2, lane,
        lx, lx2, rx, rx2;
    
    ctx.fillStyle = color.grass;
    ctx.fillRect(0, y2, width, y1 - y2);

    lx = x1 - w1 - r1;
    lx2 = x2 - w2 - r2;
    rx = x1 + w1 + r1;
    rx2 = x2 + w2 + r2;
    if (cyberPhase != null)
      Render.cyberRoadSides(ctx, width, fog, y1, y2, lx, lx2, rx, rx2, cyberPhase);

    Render.polygon(ctx, x1-w1-r1, y1, x1-w1, y1, x2-w2, y2, x2-w2-r2, y2, color.rumble);
    Render.polygon(ctx, x1+w1+r1, y1, x1+w1, y1, x2+w2, y2, x2+w2+r2, y2, color.rumble);
    Render.polygon(ctx, x1-w1,    y1, x1+w1, y1, x2+w2, y2, x2-w2,    y2, color.road);
    
    if (color.lane) {
      lanew1 = w1*2/lanes;
      lanew2 = w2*2/lanes;
      lanex1 = x1 - w1 + lanew1;
      lanex2 = x2 - w2 + lanew2;
      for(lane = 1 ; lane < lanes ; lanex1 += lanew1, lanex2 += lanew2, lane++)
        Render.polygon(ctx, lanex1 - l1/2, y1, lanex1 + l1/2, y1, lanex2 + l2/2, y2, lanex2 - l2/2, y2, color.lane);
    }
  },

  //---------------------------------------------------------------------------
  // Zonas de glitch na pista: scanlines + ruído (faixa vertical do segmento).

  glitchStretch: function(ctx, width, yTop, yBottom, phase) {
    if (yBottom <= yTop + 0.5) return;
    var y, k, a;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, yTop, width, yBottom - yTop);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = 'rgba(255, 35, 85, 0.5)';
    ctx.fillRect(0, yTop, width, yBottom - yTop);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.1;
    for (y = yTop; y < yBottom; y += 4) {
      a = 0.5 + 0.5 * Math.sin(y * 0.41 + phase * 3.1);
      ctx.fillStyle = a > 0.55 ? 'rgba(255, 0, 90, 0.45)' : 'rgba(0, 200, 255, 0.25)';
      ctx.fillRect(0, y, width, 1.2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.055;
    for (y = yTop; y < yBottom; y += 5) {
      k = Math.sin(y * 18.3 + phase * 37) * 0.5 + 0.5;
      if (k < 0.22) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(width * (0.12 + 0.65 * Math.sin(y * 0.02 + phase)), y, width * 0.2, 1.1);
      }
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.05;
    for (y = yTop; y < yBottom; y += 9) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(width * 0.25 + Math.sin(y * 0.1 + phase * 0.7) * 4, y, width * 0.12, 0.7);
    }
    ctx.restore();
  },

  //---------------------------------------------------------------------------

  background: function(ctx, background, width, height, layer, rotation, offset) {

    rotation = rotation || 0;
    offset   = offset   || 0;

    var imageW = layer.w / 2;
    var imageH = layer.h;
    var sourceY = layer.y;

    // Escala uniforme (object-fit: cover) — evita esticar a faixa aos rácios do ecrã
    var scale  = Math.max(width / imageW, height / imageH);
    var tileW  = imageW * scale;
    var tileH  = imageH * scale;
    var destY  = (height - tileH) / 2 + offset;

    var scrollSrc = layer.w * rotation;
    scrollSrc = scrollSrc - Math.floor(scrollSrc / layer.w) * layer.w;
    if (scrollSrc < 0) scrollSrc += layer.w;

    var offsetX = (scrollSrc % imageW) / imageW * tileW;
    var nMin = Math.floor((0 + offsetX) / tileW) - 2;
    var nMax = Math.ceil((width + offsetX) / tileW) + 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    for (var n = nMin; n <= nMax; n++) {
      var destX = n * tileW - offsetX;
      var phase = (scrollSrc + n * imageW) % layer.w;
      if (phase < 0) phase += layer.w;

      var sx = layer.x + phase;
      var sw = Math.min(imageW, layer.x + layer.w - sx);
      if (sw <= 0) {
        sx = layer.x;
        sw = imageW;
      }

      var dw1 = sw * scale;
      ctx.drawImage(background, sx, sourceY, sw, imageH, destX, destY, dw1, tileH);

      if (sw < imageW) {
        var sw2 = imageW - sw;
        ctx.drawImage(background, layer.x, sourceY, sw2, imageH, destX + dw1, destY, sw2 * scale, tileH);
      }
    }

    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Fundo synth: degradê + estrelas + 4 camadas em parallax (sem sol/montanhas).
  //---------------------------------------------------------------------------

  neonSynthBackdrop: function(ctx, width, height, skyOffset, hillOffset, treeOffset, vertShift, backLayers, moonImage) {
    var w = width, h = height;
    var v = vertShift || 0;
    var x, y, nx, i;
    var tStars = Util.timestamp() * 0.001;

    function rndStar(k) {
      var s = Math.sin(k * 12.9898 + k * k * 0.001) * 43758.5453;
      return s - Math.floor(s);
    }

    function drawNeonMoon(img) {
      if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var moonW = w * 0.18;
      var moonH = moonW * (ih / iw);
      var mx = w * 0.74;
      var my = h * 0.14;
      var pulse = 0.92 + 0.08 * Math.sin(Util.timestamp() * 0.0018);
      var r = Math.max(moonW, moonH) * 0.95;
      var g;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      g = ctx.createRadialGradient(mx, my, r * 0.1, mx, my, r * 1.55);
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
      if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var sy = Math.floor(ih * cropTopFrac);
      var sh = Math.max(1, ih - sy);
      var targetH = h * hFrac;
      var baseScale = targetH / sh;
      var s = baseScale * scaleMul;
      var dw = iw * s;
      var dy = Math.round(h * yBaseFrac);
      var scrollPx = scroll * dw;
      var off = scrollPx - Math.floor(scrollPx / dw) * dw;
      var n, dx;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blendMode || 'screen';
      ctx.imageSmoothingEnabled = true;
      if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'high';
      for (n = -1; n <= Math.ceil(w / dw) + 1; n++) {
        dx = Math.round(n * dw - off);
        ctx.drawImage(img, 0, sy, iw, sh, dx, dy, Math.round(dw), Math.round(targetH));
      }
      ctx.restore();
    }

    function ridgeY(px, baseY, scroll, amp, seed) {
      nx = px + scroll + seed;
      return baseY
        + Math.sin(nx * 0.0065) * amp
        + Math.sin(nx * 0.017) * amp * 0.55
        + Math.sin(nx * 0.038) * amp * 0.28;
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
      for (x = 0; x <= w; x += 4) {
        y = ridgeY(x, baseY, scroll, amp, seed);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.45;
      ctx.shadowBlur = lineW * 2.8;
      for (x = 0; x <= w; x += vertEvery) {
        y = ridgeY(x, baseY, scroll, amp, seed);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Sem drawCoverImage da primeira camada: evita duplicar a mesma textura com o parallax
    // (moiré / “piscar” nos prédios quando o tile e o fundo competem em subpixel).

    var skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#2a0a0c');
    skyGrad.addColorStop(0.28, '#180508');
    skyGrad.addColorStop(0.52, '#0c0204');
    skyGrad.addColorStop(0.78, '#040001');
    skyGrad.addColorStop(1, '#000000');
    ctx.save();
    ctx.globalAlpha = (backLayers && backLayers.length && backLayers[0]) ? 0.62 : 1;
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Lua atras das camadas do horizonte, com aura neon vermelha.
    drawNeonMoon(moonImage);

    // Montanhas neon atras de tudo (linhas mais finas).
    drawWireRidge(skyOffset * 120,  h * 0.44 + v * 0.03, 42, 'rgba(150, 90, 255, 0.48)', '#aa66ff', 0.9, 54, 9);
    drawWireRidge(hillOffset * 170, h * 0.50 + v * 0.05, 56, 'rgba(220, 45, 65, 0.52)', '#dd3355', 1.0, 44, 19);
    drawWireRidge(treeOffset * 230, h * 0.56 + v * 0.07, 70, 'rgba(200, 90, 110, 0.46)', '#cc6677', 1.05, 34, 31);

    var starColors = [
      '#ffffff', '#ffd8e0', '#ff8888', '#ff5566', '#cc2233', '#ffaaaa',
      '#b088ff', '#8866dd', '#aa77ee', '#9977ff', '#aaddff', '#9988ee',
      '#aa88ff', '#8866cc', '#7744bb', '#bba0ff', '#c8b0ff',
      '#ddaaff', '#cc99ff', '#8866cc', '#b8a8ff'
    ];
    for (i = 0; i < 300; i++) {
      x = rndStar(i * 3.17 + 1) * w + skyOffset * 500;
      x = ((x % w) + w) % w;
      y = rndStar(i * 5.91 + 2) * h * 0.58;
      var ph = rndStar(i * 7.23 + 3) * Math.PI * 2;
      var fq = 1.0 + rndStar(i * 11.7 + 4) * 5;
      var tw = 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(tStars * fq + ph));
      ctx.globalAlpha = tw * (0.48 + rndStar(i * 19.4) * 0.48);
      ctx.fillStyle = starColors[Math.floor(rndStar(i * 17.31 + i * 0.01) * starColors.length) % starColors.length];
      var sz = 2;
      var rsz = rndStar(i * 2.71 + 9);
      if (rsz > 0.5) sz = 3;
      if (rsz > 0.82) sz = 4;
      ctx.fillRect(Math.floor(x), Math.floor(y), sz, sz);
    }
    ctx.globalAlpha = 1;

    if (backLayers && backLayers.length) {
      // 4 camadas em ordem: distante -> principal (mais aparente).
      // Camadas ancoradas no horizonte (visiveis) recortando topo vazio das imagens.
      drawParallaxLayer(backLayers[0], skyOffset  * 0.10, 0.60, 0.27, 0.30, 1.00, 0.48, 'screen');
      drawParallaxLayer(backLayers[1], hillOffset * 0.20, 0.72, 0.31, 0.33, 1.00, 0.50, 'screen');
      drawParallaxLayer(backLayers[2], treeOffset * 0.34, 0.84, 0.35, 0.36, 1.02, 0.52, 'screen');
      // Camada principal: mais visivel e com blend normal.
      // Camada principal menor, mais alta e com mais repeticao horizontal.
      drawParallaxLayer(backLayers[3], treeOffset * 0.52 + skyOffset * 0.08, 1.0, 0.15, 0.42, 0.92, 0.26, 'source-over');
    }

  },

  //---------------------------------------------------------------------------

  sprite: function(ctx, width, height, resolution, roadWidth, sprites, sprite, scale, destX, destY, offsetX, offsetY, clipY) {

                    //  scale for projection AND relative to roadWidth (for tweakUI)
    var destW  = (sprite.w * scale * width/2) * (SPRITES.SCALE * roadWidth);
    var destH  = (sprite.h * scale * width/2) * (SPRITES.SCALE * roadWidth);

    destX = destX + (destW * (offsetX || 0));
    destY = destY + (destH * (offsetY || 0));

    var clipH = clipY ? Math.max(0, destY+destH-clipY) : 0;
    if (clipH < destH)
      ctx.drawImage(sprites, sprite.x, sprite.y, sprite.w, sprite.h - (sprite.h*clipH/destH), destX, destY, destW, destH - clipH);

  },

  //---------------------------------------------------------------------------
  // NPC com PNG externo (mesma escala que sprite()).

  npcCarPng: function(ctx, width, height, resolution, roadWidth, spritesheet, image, sprite, scale, destX, destY, offsetX, offsetY, clipY, fallbackSheetSprite) {
    fallbackSheetSprite = fallbackSheetSprite || SPRITES.CAR01;
    if (!image || !image.complete || image.naturalWidth <= 0) {
      Render.sprite(ctx, width, height, resolution, roadWidth, spritesheet, fallbackSheetSprite, scale, destX, destY, offsetX, offsetY, clipY);
      return;
    }
    var s = Render.NPC_PNG_DISPLAY_SCALE;
    var destW  = (sprite.w * scale * width/2) * (SPRITES.SCALE * roadWidth) * s;
    var destH  = (sprite.h * scale * width/2) * (SPRITES.SCALE * roadWidth) * s;
    destX = destX + (destW * (offsetX || 0));
    destY = destY + (destH * (offsetY || 0));
    var clipH = clipY ? Math.max(0, destY+destH-clipY) : 0;
    if (clipH >= destH) return;
    var srcH = image.naturalHeight;
    var srcW = image.naturalWidth;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, srcW, srcH - (srcH * clipH / destH), destX, destY, destW, destH - clipH);
    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Billboard com imagem externa (PNG com alpha), usado para laterais da pista.

  billboardImage: function(ctx, width, height, resolution, roadWidth, image, scale, destX, destY, offsetX, offsetY, clipY, sizeMul) {
    if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    sizeMul = sizeMul || 1;
    var srcW = image.naturalWidth;
    var srcH = image.naturalHeight;
    var destW  = (srcW * scale * width/2) * (SPRITES.SCALE * roadWidth) * sizeMul;
    var destH  = (srcH * scale * width/2) * (SPRITES.SCALE * roadWidth) * sizeMul;
    destX = destX + (destW * (offsetX || 0));
    destY = destY + (destH * (offsetY || 0));
    var clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH >= destH) return;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(image, 0, 0, srcW, srcH - (srcH * clipH / destH), destX, destY, destW, destH - clipH);
    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Billboard com aura neon (ex.: arvore roxa).

  billboardNeonAuraImage: function(ctx, width, height, resolution, roadWidth, image, scale, destX, destY, offsetX, offsetY, clipY, sizeMul, auraColor) {
    if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    sizeMul = sizeMul || 1;
    auraColor = auraColor || 'rgba(196, 80, 255, 0.85)';
    var srcW = image.naturalWidth;
    var srcH = image.naturalHeight;
    var destW  = (srcW * scale * width/2) * (SPRITES.SCALE * roadWidth) * sizeMul;
    var destH  = (srcH * scale * width/2) * (SPRITES.SCALE * roadWidth) * sizeMul;
    destX = destX + (destW * (offsetX || 0));
    destY = destY + (destH * (offsetY || 0));
    var clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH >= destH) return;
    var drawH = destH - clipH;
    var cx = destX + destW * 0.5;
    var cy = destY + drawH * 0.52;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.24;
    var g = ctx.createRadialGradient(cx, cy, destW * 0.08, cx, cy, Math.max(destW, drawH) * 0.7);
    g.addColorStop(0, auraColor);
    g.addColorStop(0.55, 'rgba(170, 70, 255, 0.28)');
    g.addColorStop(1, 'rgba(110, 0, 160, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, destW * 0.52, drawH * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(image, 0, 0, srcW, srcH - (srcH * clipH / destH), destX, destY, destW, drawH);
    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // PNG full-res: reto / esquerda / direita (SPRITES.PLAYER_STRAIGHT.w mantém SPRITES.SCALE global).
  PLAYER_STRAIGHT_FULLRES_DISPLAY: 1.07,
  NPC_PNG_DISPLAY_SCALE: 1.14,

  player: function(ctx, width, height, resolution, roadWidth, sprites, speedPercent, scale, destX, destY, steer, updown, boostGlitch, playerCarPng) {

    var bounce = (1.5 * Math.random() * speedPercent * resolution) * Util.randomChoice([-1,1]);

    var pngStraight = playerCarPng && playerCarPng.straight && playerCarPng.straight.complete && playerCarPng.straight.naturalWidth > 0;
    var pngLeft = playerCarPng && playerCarPng.left && playerCarPng.left.complete && playerCarPng.left.naturalWidth > 0;
    var pngRight = playerCarPng && playerCarPng.right && playerCarPng.right.complete && playerCarPng.right.naturalWidth > 0;
    var usePng = pngStraight;

    var sprite;
    var playerImg = null;
    if (usePng) {
      sprite = SPRITES.PLAYER_STRAIGHT;
      if (steer < 0 && pngLeft) playerImg = playerCarPng.left;
      else if (steer > 0 && pngRight) playerImg = playerCarPng.right;
      else playerImg = playerCarPng.straight;
    } else if (steer < 0)
      sprite = (updown > 0) ? SPRITES.PLAYER_UPHILL_LEFT : SPRITES.PLAYER_LEFT;
    else if (steer > 0)
      sprite = (updown > 0) ? SPRITES.PLAYER_UPHILL_RIGHT : SPRITES.PLAYER_RIGHT;
    else
      sprite = (updown > 0) ? SPRITES.PLAYER_UPHILL_STRAIGHT : SPRITES.PLAYER_STRAIGHT;

    var destW  = (sprite.w * scale * width/2) * (SPRITES.SCALE * roadWidth);
    var destH  = (sprite.h * scale * width/2) * (SPRITES.SCALE * roadWidth);
    if (usePng) {
      destW *= Render.PLAYER_STRAIGHT_FULLRES_DISPLAY;
      destH *= Render.PLAYER_STRAIGHT_FULLRES_DISPLAY;
    }
    var px = destX + (destW * -0.5);
    var py = destY + (destH * -1) + bounce;

    var srcSheet = usePng ? playerImg : sprites;
    var srcX0 = usePng ? 0 : sprite.x;
    var srcY0 = usePng ? 0 : sprite.y;
    var srcW0 = usePng ? playerImg.naturalWidth : sprite.w;
    var srcH0 = usePng ? playerImg.naturalHeight : sprite.h;
    var tNow = Util.timestamp() * 0.001;

    if (!boostGlitch) {
      if (usePng) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(playerImg, 0, 0, srcW0, srcH0, px, py, destW, destH);
        ctx.restore();
      } else {
        Render.sprite(ctx, width, height, resolution, roadWidth, sprites, sprite, scale, destX, destY + bounce, -0.5, -1);
      }
      return;
    }

    if (usePng) {
      ctx.imageSmoothingEnabled = true;
      if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'high';
    }

    var t = tNow;
    var s, sh, dh, jx, sy;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(srcSheet, srcX0, srcY0, srcW0, srcH0, px - 5, py, destW, destH);
    ctx.drawImage(srcSheet, srcX0, srcY0, srcW0, srcH0, px + 5, py, destW, destH);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(srcSheet, srcX0, srcY0, srcW0, srcH0, px - 2, py + 1, destW, destH);
    ctx.drawImage(srcSheet, srcX0, srcY0, srcW0, srcH0, px + 3, py - 1, destW, destH);
    ctx.restore();

    sh = srcH0 / 14;
    dh = destH / 14;
    for (s = 0; s < 14; s++) {
      sy = srcY0 + s * sh;
      jx = Math.sin(t * 13 + s * 1.05) * 3.2 + Math.sin(t * 37 + s * 2.1) * 1.8;
      if (Math.sin(s * 3.17 + t * 20) > 0.88) jx += (Math.random() - 0.5) * 5;
      ctx.drawImage(srcSheet, srcX0, sy, srcW0, sh, px + jx, py + s * dh, destW, dh);
    }

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = t * 45;
    ctx.strokeStyle = 'rgba(140, 100, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 1, py, destW + 2, destH);
    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Pickup de boost: flutua acima da pista (orb + anel hex + raio), sombra no solo.

  boostPickup: function(ctx, width, height, resolution, roadWidth, scale, destX, destYRoad, fog, phase, clipY) {
    var t = Util.timestamp() / 1000;
    var alpha = Math.max(0.52, 1 - fog * 0.72);
    var baseR = Math.max(18, width * 0.021 * scale * roadWidth);
    var bob = Math.sin(t * 0.004 + phase) * (baseR * 0.38);
    var lift = baseR * 2.15 + bob;
    var cx = destX;
    var cy = destYRoad - lift;
    var spin = t * 0.85 + phase;
    var pulse = 0.9 + 0.1 * Math.sin(t * 0.005 + phase * 1.7);
    var i, a, px, py;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipY) {
      ctx.beginPath();
      ctx.rect(0, 0, width, clipY);
      ctx.clip();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, destYRoad + baseR * 0.22, baseR * 1.05 * pulse, baseR * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    var beam = ctx.createLinearGradient(cx, cy, cx, destYRoad);
    beam.addColorStop(0, 'rgba(130, 90, 255, 0)');
    beam.addColorStop(0.45, 'rgba(200, 40, 60, 0.16)');
    beam.addColorStop(1, 'rgba(130, 90, 255, 0.1)');
    ctx.fillStyle = beam;
    ctx.fillRect(cx - baseR * 0.4, cy, baseR * 0.8, destYRoad - cy);

    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.rotate(spin);

    ctx.strokeStyle = '#a888ff';
    ctx.lineWidth = Math.max(2, baseR * 0.11);
    ctx.shadowColor = '#cc2244';
    ctx.shadowBlur = baseR * 0.45;
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      px = Math.cos(a) * baseR * 1.18;
      py = Math.sin(a) * baseR * 1.18;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = baseR * 0.25;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1, baseR * 0.04);
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.08;
      px = Math.cos(a) * baseR * 1.02;
      py = Math.sin(a) * baseR * 1.02;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.shadowBlur = 0;
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, baseR * 0.92);
    g.addColorStop(0, 'rgba(255, 70, 95, 0.98)');
    g.addColorStop(0.45, 'rgba(90, 20, 70, 0.88)');
    g.addColorStop(1, 'rgba(0, 30, 70, 0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 0.74, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 140, 255, 0.9)';
    ctx.lineWidth = Math.max(1.5, baseR * 0.055);
    ctx.stroke();

    ctx.rotate(-spin * 0.55);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#a888ff';
    ctx.shadowBlur = baseR * 0.22;
    ctx.beginPath();
    ctx.moveTo(baseR * 0.06, -baseR * 0.52);
    ctx.lineTo(baseR * 0.3, -baseR * 0.1);
    ctx.lineTo(baseR * 0.05, -baseR * 0.07);
    ctx.lineTo(baseR * 0.24, baseR * 0.5);
    ctx.lineTo(-baseR * 0.22, 0.04);
    ctx.lineTo(-baseR * 0.03, -baseR * 0.08);
    ctx.lineTo(baseR * 0.06, -baseR * 0.52);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Linha de recarga no solo (perpendicular à direção da pista neste segmento).

  boostLine: function(ctx, width, height, resolution, x1, y1, w1, x2, y2, w2, zFrac, fog, clipY) {
    var f = Util.limit(zFrac, 0.02, 0.98);
    var lx = Util.interpolate(x1 - w1, x2 - w2, f);
    var ly = Util.interpolate(y1, y2, f);
    var rx = Util.interpolate(x1 + w1, x2 + w2, f);
    var t = Util.timestamp() * 0.001;
    var pulse = 0.85 + 0.15 * Math.sin(t * 3.2 + f * 12);
    var alpha = Math.max(0.55, 1 - fog * 0.7);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipY) {
      ctx.beginPath();
      ctx.rect(0, 0, width, clipY);
      ctx.clip();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#cc2244';
    ctx.shadowBlur = 10 * resolution * pulse;
    ctx.strokeStyle = 'rgba(255, 55, 85, 0.95)';
    ctx.lineWidth = Math.max(5, 6 * resolution) * pulse;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ly);
    ctx.stroke();

    ctx.shadowBlur = 5 * resolution * pulse;
    ctx.strokeStyle = 'rgba(140, 100, 255, 0.95)';
    ctx.lineWidth = Math.max(2.5, 3 * resolution);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ly);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = Math.max(1, 1.2 * resolution);
    ctx.setLineDash([10 * resolution, 6 * resolution]);
    ctx.lineDashOffset = t * 40 * resolution;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ly);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Linha de chegada — faixas coloridas (speed run).

  finishLine: function(ctx, width, height, resolution, x1, y1, w1, x2, y2, w2, zFrac, fog, clipY) {
    var f = Util.limit(zFrac, 0.02, 0.98);
    var lx = Util.interpolate(x1 - w1, x2 - w2, f);
    var ly = Util.interpolate(y1, y2, f);
    var rx = Util.interpolate(x1 + w1, x2 + w2, f);
    var t = Util.timestamp() * 0.001;
    var colors = ['#cc2244', '#ffee00', '#a888ff', '#ff6600', '#8844ff', '#ffffff', '#9d4dff'];
    var alpha = Math.max(0.72, 1 - fog * 0.65);
    var band = Math.max(2.2, 2.8 * resolution);
    var j, dy, c, phase;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipY) {
      ctx.beginPath();
      ctx.rect(0, 0, width, clipY);
      ctx.clip();
    }

    ctx.lineCap = 'round';
    phase = Math.floor(t * 3) % colors.length;
    for (j = -4; j <= 4; j++) {
      dy = j * band * 0.32;
      c = colors[(j + phase + 99) % colors.length];
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 9 * resolution;
      ctx.lineWidth = Math.max(2.5, band * 0.42);
      ctx.beginPath();
      ctx.moveTo(lx, ly + dy);
      ctx.lineTo(rx, ly + dy);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = Math.max(1.2, 1.4 * resolution);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ly);
    ctx.stroke();

    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Barreira antes do portal: painel + riscas + postes e travessas neon (sem texto).

  phaseEndBarrier: function(ctx, width, height, resolution, x1, y1, w1, x2, y2, w2, zFrac, fog, clipY) {
    var f = Util.limit(zFrac, 0.06, 0.94);
    var lx = Util.interpolate(x1 - w1, x2 - w2, f);
    var ly = Util.interpolate(y1, y2, f);
    var rx = Util.interpolate(x1 + w1, x2 + w2, f);
    var t = Util.timestamp() * 0.001;
    var pulse = 0.88 + 0.12 * Math.sin(t * 5);
    var alpha = Math.max(0.62, 1 - fog * 0.55);
    var roadW = rx - lx;
    var postOut = Math.max(14, roadW * 0.06);
    var postH = Math.max(roadW * 0.55, 42 * resolution);
    var pxL = lx - postOut;
    var pxR = rx + postOut;
    var yTop = ly - postH;
    var k, yy, stripe, g;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipY) {
      ctx.beginPath();
      ctx.rect(0, 0, width, clipY);
      ctx.clip();
    }

    g = ctx.createLinearGradient(pxL, ly, pxR, yTop);
    g.addColorStop(0, 'rgba(200, 30, 60, 0.22)');
    g.addColorStop(0.5, 'rgba(255, 60, 120, 0.14)');
    g.addColorStop(1, 'rgba(80, 0, 40, 0.18)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ly);
    ctx.lineTo(rx, yTop);
    ctx.lineTo(lx, yTop);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * 0.35 * pulse;
    for (stripe = -2; stripe < 18; stripe++) {
      ctx.strokeStyle = stripe % 2 === 0 ? 'rgba(255, 80, 120, 0.5)' : 'rgba(0, 255, 240, 0.35)';
      ctx.lineWidth = Math.max(1.5, 2 * resolution);
      ctx.beginPath();
      ctx.moveTo(pxL + stripe * (roadW * 0.11), ly);
      ctx.lineTo(pxL + stripe * (roadW * 0.11) + roadW * 0.35, yTop);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (k = 0; k < 2; k++) {
      ctx.strokeStyle = k === 0 ? 'rgba(255, 50, 100, 0.95)' : 'rgba(0, 255, 255, 0.75)';
      ctx.shadowColor = k === 0 ? '#ff3366' : '#00fff0';
      ctx.shadowBlur = (10 - k * 2) * resolution * pulse;
      ctx.lineWidth = Math.max(3.5, 5 * resolution);
      ctx.beginPath();
      ctx.moveTo(pxL, ly);
      ctx.lineTo(pxL, yTop);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pxR, ly);
      ctx.lineTo(pxR, yTop);
      ctx.stroke();
    }

    ctx.shadowBlur = 6 * resolution * pulse;
    for (k = 0; k < 4; k++) {
      yy = ly - postH * (0.22 + k * 0.22);
      ctx.strokeStyle = k % 2 === 0 ? '#ffee00' : '#ff00aa';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.lineWidth = Math.max(2, 2.6 * resolution);
      ctx.beginPath();
      ctx.moveTo(pxL, yy);
      ctx.lineTo(pxR, yy);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Portal final — versão chamativa: solo, feixes, anéis rotativos, ondas, partículas.

  portalNeon: function(ctx, width, height, resolution, roadWidth, x1, y1, w1, x2, y2, w2, zFrac, fog, clipY, phase) {
    var f = Util.limit(zFrac, 0.06, 0.94);
    var cx = Util.interpolate(x1, x2, f);
    var cy = Util.interpolate(y1, y2, f);
    var rw = Util.interpolate(w1, w2, f) * 1.02;
    var t = Util.timestamp() * 0.001;
    var ph = phase || 0;
    var pulse = 0.9 + 0.1 * Math.sin(t * 0.006 + ph);
    var alpha = Math.max(0.82, 1 - fog * 0.38);
    var spin = t * 1.15 + ph;
    var spin2 = -t * 0.85 + ph * 0.7;
    var k, rxx, ryy, gy, i, ang, pr, px, py, hue;
    var portalCy = cy - rw * 0.28;
    var colors = [
      '#ff00cc', '#00fff0', '#ffee00', '#a888ff', '#cc2244', '#00ff88', '#ff6600',
      '#ff44aa', '#44ffee', '#ffffff', '#aa66ff', '#ff3366', '#66ffcc', '#ffaa00', '#e040ff'
    ];

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipY) {
      ctx.beginPath();
      ctx.rect(0, 0, width, clipY);
      ctx.clip();
    }

    ctx.globalAlpha = alpha * 0.72;
    var glowG = ctx.createRadialGradient(cx, cy + 4, 0, cx, cy + 4, rw * 1.55);
    glowG.addColorStop(0, 'rgba(255, 80, 255, 0.72)');
    glowG.addColorStop(0.2, 'rgba(130, 90, 255, 0.58)');
    glowG.addColorStop(0.4, 'rgba(200, 40, 90, 0.48)');
    glowG.addColorStop(0.62, 'rgba(0, 255, 240, 0.22)');
    glowG.addColorStop(0.78, 'rgba(255, 220, 80, 0.14)');
    glowG.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowG;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, rw * 1.32 * pulse, rw * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * 0.55;
    var glowG2 = ctx.createRadialGradient(cx, portalCy, 0, cx, portalCy, rw * 1.1);
    glowG2.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    glowG2.addColorStop(0.45, 'rgba(0, 255, 255, 0.2)');
    glowG2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowG2;
    ctx.beginPath();
    ctx.ellipse(cx, portalCy, rw * 0.95 * pulse, rw * 0.42 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = alpha * 0.62;
    for (k = 0; k < 4; k++) {
      rxx = rw * (1.18 + k * 0.12) * (0.96 + 0.04 * Math.sin(t * 4 + k));
      ryy = rxx * 0.48;
      ctx.strokeStyle = 'rgba(130, 90, 255, ' + (0.72 - k * 0.14) + ')';
      ctx.shadowColor = k % 2 === 0 ? '#00fff0' : '#ff44cc';
      ctx.shadowBlur = (7 - k) * resolution * 1.05;
      ctx.lineWidth = Math.max(0.55, 0.95 * resolution);
      ctx.beginPath();
      ctx.ellipse(cx, portalCy, rxx, ryy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    ctx.globalAlpha = alpha * 0.62;
    var bx, beam;
    for (k = -1; k <= 1; k += 2) {
      bx = cx + k * rw * 0.52;
      beam = ctx.createLinearGradient(bx, cy + 8, bx, portalCy - rw * 1.5);
      beam.addColorStop(0, 'rgba(255, 0, 200, 0)');
      beam.addColorStop(0.25, 'rgba(0, 255, 255, 0.55)');
      beam.addColorStop(0.5, 'rgba(255, 255, 255, 0.38)');
      beam.addColorStop(0.72, 'rgba(255, 0, 140, 0.35)');
      beam.addColorStop(1, 'rgba(100, 0, 255, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(bx - rw * 0.08, cy + 4);
      ctx.lineTo(bx + rw * 0.08, cy + 4);
      ctx.lineTo(bx + rw * 0.02, portalCy - rw * 1.45);
      ctx.lineTo(bx - rw * 0.02, portalCy - rw * 1.45);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = alpha;
    ctx.setLineDash([rw * 0.04, rw * 0.035]);
    ctx.lineDashOffset = t * 45;
    for (k = 0; k < 14; k++) {
      rxx = rw * (1.15 - k * 0.072) * pulse;
      ryy = rxx * 0.52;
      gy = portalCy - k * (4.2 + resolution * 1.9);
      hue = colors[k % colors.length];
      ctx.strokeStyle = hue;
      ctx.shadowColor = hue;
      ctx.shadowBlur = Math.max(3, (10 - k * 0.5) * resolution * 1.15);
      ctx.lineWidth = Math.max(0.55, (1.15 - k * 0.055) * resolution);
      ctx.beginPath();
      ctx.ellipse(cx, gy, rxx, ryy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.translate(cx, portalCy);
    ctx.rotate(spin);
    ctx.lineWidth = Math.max(0.35, 0.65 * resolution);
    ctx.setLineDash([rw * 0.035, rw * 0.028]);
    ctx.lineDashOffset = t * 72;
    for (k = 0; k < 4; k++) {
      rxx = rw * (0.76 - k * 0.11);
      ryy = rxx * 0.5;
      ctx.globalAlpha = alpha * (0.72 - k * 0.12);
      ctx.strokeStyle = k % 3 === 0 ? 'rgba(0, 255, 240, 0.95)' : (k % 3 === 1 ? 'rgba(255, 60, 200, 0.92)' : 'rgba(255, 230, 80, 0.9)');
      ctx.shadowColor = k % 3 === 0 ? '#00fff0' : (k % 3 === 1 ? '#ff44cc' : '#ffee66');
      ctx.shadowBlur = (5 - k) * resolution * 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rxx, ryy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.save();
    ctx.translate(cx, portalCy);
    ctx.rotate(spin * 0.55);
    ctx.lineWidth = Math.max(0.35, 0.55 * resolution);
    ctx.globalAlpha = alpha * 0.75;
    for (k = 0; k < 2; k++) {
      rxx = rw * (0.88 - k * 0.06);
      ryy = rxx * 0.48;
      ctx.strokeStyle = 'rgba(130, 90, 255, 0.55)';
      ctx.shadowColor = '#a888ff';
      ctx.shadowBlur = 3 * resolution;
      ctx.beginPath();
      for (var h = 0; h < 6; h++) {
        ang = (h / 6) * Math.PI * 2 - Math.PI / 2 + spin2 * 0.3;
        px = Math.cos(ang) * rxx;
        py = Math.sin(ang) * ryy;
        if (h === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.save();
    ctx.translate(cx, portalCy);
    ctx.rotate(spin2);
    ctx.globalAlpha = alpha * 0.72;
    for (k = 0; k < 2; k++) {
      rxx = rw * (0.55 - k * 0.1);
      ryy = rxx * 0.45;
      ctx.strokeStyle = 'rgba(255, 220, 80, 0.95)';
      ctx.shadowColor = '#ffd040';
      ctx.shadowBlur = 4 * resolution;
      ctx.lineWidth = Math.max(0.35, 0.6 * resolution);
      ctx.setLineDash([rw * 0.02, rw * 0.018]);
      ctx.lineDashOffset = -t * 55;
      ctx.beginPath();
      ctx.ellipse(0, 0, rxx, ryy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.globalAlpha = alpha * 0.88;
    for (i = 0; i < 88; i++) {
      ang = (i / 88) * Math.PI * 2 + t * 1.8 + ph;
      pr = rw * (0.18 + 0.78 * (0.5 + 0.5 * Math.sin(t * 3.2 + i * 0.4)));
      px = cx + Math.cos(ang) * pr;
      py = portalCy + Math.sin(ang) * pr * 0.48;
      ctx.fillStyle = colors[i % colors.length];
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 3.2 * resolution;
      ctx.globalAlpha = alpha * (0.3 + 0.42 * Math.sin(t * 5 + i));
      ctx.fillRect(px - 0.5, py - 0.5, 1.2, 1.2);
    }
    ctx.shadowBlur = 0;

    ctx.globalAlpha = alpha;
    var coreG = ctx.createRadialGradient(cx, portalCy - rw * 0.05, 0, cx, portalCy, rw * 0.55);
    coreG.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    coreG.addColorStop(0.1, 'rgba(0, 255, 255, 0.42)');
    coreG.addColorStop(0.22, 'rgba(130, 90, 255, 0.45)');
    coreG.addColorStop(0.38, 'rgba(255, 0, 180, 0.32)');
    coreG.addColorStop(0.55, 'rgba(200, 40, 60, 0.28)');
    coreG.addColorStop(1, 'rgba(5, 0, 18, 0.35)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.ellipse(cx, portalCy, rw * 0.34 * pulse, rw * 0.2 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.95)';
    ctx.lineWidth = Math.max(0.55, 0.95 * resolution);
    ctx.globalAlpha = alpha * (0.65 + 0.35 * Math.sin(t * 8));
    ctx.shadowColor = '#00fff0';
    ctx.shadowBlur = 7 * resolution;
    ctx.beginPath();
    ctx.ellipse(cx, portalCy, rw * 0.36 * pulse, rw * 0.21 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 60, 200, 0.75)';
    ctx.shadowColor = '#ff44cc';
    ctx.lineWidth = Math.max(0.35, 0.55 * resolution);
    ctx.beginPath();
    ctx.ellipse(cx, portalCy, rw * 0.37 * pulse, rw * 0.215 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = alpha * 0.92;
    var L = rw * 0.42;
    ctx.strokeStyle = '#a888ff';
    ctx.lineWidth = Math.max(0.55, 0.95 * resolution);
    ctx.shadowColor = '#a888ff';
    ctx.shadowBlur = 4 * resolution;
    ctx.beginPath();
    ctx.moveTo(cx - L, portalCy - L * 0.5);
    ctx.lineTo(cx - L * 0.55, portalCy - L * 0.5);
    ctx.moveTo(cx - L, portalCy - L * 0.5);
    ctx.lineTo(cx - L, portalCy - L * 0.1);
    ctx.moveTo(cx + L, portalCy - L * 0.5);
    ctx.lineTo(cx + L * 0.55, portalCy - L * 0.5);
    ctx.moveTo(cx + L, portalCy - L * 0.5);
    ctx.lineTo(cx + L, portalCy - L * 0.1);
    ctx.stroke();
    ctx.strokeStyle = '#cc2244';
    ctx.lineWidth = Math.max(0.55, 0.95 * resolution);
    ctx.shadowColor = '#cc2244';
    ctx.shadowBlur = 4 * resolution;
    ctx.beginPath();
    ctx.moveTo(cx - L, portalCy + L * 0.35);
    ctx.lineTo(cx - L * 0.55, portalCy + L * 0.35);
    ctx.moveTo(cx - L, portalCy + L * 0.35);
    ctx.lineTo(cx - L, portalCy - L * 0.05);
    ctx.moveTo(cx + L, portalCy + L * 0.35);
    ctx.lineTo(cx + L * 0.55, portalCy + L * 0.35);
    ctx.moveTo(cx + L, portalCy + L * 0.35);
    ctx.lineTo(cx + L, portalCy - L * 0.05);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  },

  //---------------------------------------------------------------------------
  // Véu glitch + desfoque sobre a estrada após o portal (esconde geometria longínqua).
  // zSplitFrom: número em ]0,1[ = só a metade “longe” do segmento (do plano zSplit até p2); null = trapezóide inteiro.

  portalGlitchVeil: function(ctx, width, height, resolution, x1, y1, w1, x2, y2, w2, fog, clipY, zSplitFrom) {
    var x1t, y1t, w1t, x2t, y2t, w2t;
    if (zSplitFrom != null && zSplitFrom !== undefined) {
      var zf = Util.limit(zSplitFrom, 0.05, 0.95);
      x1t = Util.interpolate(x1, x2, zf);
      y1t = Util.interpolate(y1, y2, zf);
      w1t = Util.interpolate(w1, w2, zf);
      x2t = x2;
      y2t = y2;
      w2t = w2;
    } else {
      x1t = x1;
      y1t = y1;
      w1t = w1;
      x2t = x2;
      y2t = y2;
      w2t = w2;
    }

    var t = Util.timestamp() * 0.001;
    var alpha = Math.max(0.78, 1 - fog * 0.45);
    var yMin = Math.min(y1t, y2t);
    var yMax = Math.max(y1t, y2t);
    var xMin = Math.min(x1t - w1t, x2t - w2t) - 12;
    var xMax = Math.max(x1t + w1t, x2t + w2t) + 12;
    var blurPx = Math.max(1.6, 3 * resolution);
    var yy, phase, fx, g;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (clipY) {
      ctx.beginPath();
      ctx.rect(0, 0, width, clipY);
      ctx.clip();
    }
    ctx.beginPath();
    ctx.moveTo(x1t - w1t, y1t);
    ctx.lineTo(x1t + w1t, y1t);
    ctx.lineTo(x2t + w2t, y2t);
    ctx.lineTo(x2t - w2t, y2t);
    ctx.closePath();
    ctx.clip();

    ctx.filter = 'blur(' + blurPx + 'px)';
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(xMin, yMin - 6, xMax - xMin, yMax - yMin + 12);
    ctx.fillStyle = 'rgba(40,0,72,0.52)';
    ctx.fillRect(xMin, yMin - 6, xMax - xMin, yMax - yMin + 12);
    ctx.filter = 'none';

    g = ctx.createLinearGradient(0, y2t, 0, y1t);
    g.addColorStop(0, 'rgba(120,80,200,0.12)');
    g.addColorStop(0.45, 'rgba(200,35,55,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = g;
    ctx.fillRect(xMin, yMin - 6, xMax - xMin, yMax - yMin + 12);

    for (yy = yMin; yy <= yMax; yy += 3) {
      phase = yy * 0.088 + t * 14;
      fx = Math.sin(phase * 3.1) * 12 * resolution + Math.sin(t * 21 + yy * 0.13) * 7;
      ctx.globalAlpha = alpha * (0.4 + 0.32 * Math.abs(Math.sin(phase)));
      ctx.fillStyle = 'rgba(130,90,255,0.16)';
      ctx.fillRect(xMin + fx, yy, xMax - xMin, 1.2);
      ctx.fillStyle = 'rgba(200,40,60,0.12)';
      ctx.fillRect(xMin + fx * 0.55 + 4, yy + 1, xMax - xMin, 1);
    }

    ctx.globalAlpha = alpha * 0.52;
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 1;
    for (yy = yMin; yy <= yMax; yy += 2) {
      ctx.beginPath();
      ctx.moveTo(xMin, yy);
      ctx.lineTo(xMax, yy);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (yy = yMin; yy <= yMax; yy += 17) {
      if (Math.abs(Math.sin(yy * 0.31 + t * 9)) < 0.35) continue;
      ctx.beginPath();
      ctx.moveTo(xMin + Math.sin(t * 11 + yy) * 20, yy);
      ctx.lineTo(xMax + Math.sin(t * 7 + yy * 0.5) * 25, yy + 2);
      ctx.stroke();
    }

    ctx.restore();
  },

  fog: function(ctx, x, y, width, height, fog) {
    if (fog < 1) {
      ctx.globalAlpha = (1-fog)
      ctx.fillStyle = COLORS.FOG;
      ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = 1;
    }
  },

  rumbleWidth:     function(projectedRoadWidth, lanes) { return projectedRoadWidth/Math.max(6,  2*lanes); },
  laneMarkerWidth: function(projectedRoadWidth, lanes) { return projectedRoadWidth/Math.max(32, 8*lanes); }

}

//=============================================================================
// RACING GAME CONSTANTS
//=============================================================================

var KEY = {
  LEFT:  37,
  UP:    38,
  RIGHT: 39,
  DOWN:  40,
  A:     65,
  D:     68,
  P:     80,
  S:     83,
  W:     87,
  SPACE: 32,
  ENTER: 13
};

var COLORS = {
  SKY:  '#0a0414',
  TREE: '#1a0630',
  FOG:  '#140820',
  LIGHT:  { road: '#2e2448', grass: '#050210', rumble: '#d42855', lane: '#9966ee'  },
  DARK:   { road: '#2a2038', grass: '#04010c', rumble: '#a81848', lane: '#7755cc'  },
  START:  { road: '#f0f0ff', grass: '#e8e0ff', rumble: '#d42844'                     },
  FINISH: { road: '#0a0010', grass: '#050008', rumble: '#ff0055'                     }
};

var BACKGROUND = {
  HILLS: { x:   5, y:   5, w: 1280, h: 480 },
  SKY:   { x:   5, y: 495, w: 1280, h: 480 },
  TREES: { x:   5, y: 985, w: 1280, h: 480 }
};

var SPRITES = {
  PALM_TREE:              { x:    5, y:    5, w:  215, h:  540 },
  BILLBOARD08:            { x:  230, y:    5, w:  385, h:  265 },
  TREE1:                  { x:  625, y:    5, w:  360, h:  360 },
  DEAD_TREE1:             { x:    5, y:  555, w:  135, h:  332 },
  BILLBOARD09:            { x:  150, y:  555, w:  328, h:  282 },
  BOULDER3:               { x:  230, y:  280, w:  320, h:  220 },
  COLUMN:                 { x:  995, y:    5, w:  200, h:  315 },
  BILLBOARD01:            { x:  625, y:  375, w:  300, h:  170 },
  BILLBOARD06:            { x:  488, y:  555, w:  298, h:  190 },
  BILLBOARD05:            { x:    5, y:  897, w:  298, h:  190 },
  BILLBOARD07:            { x:  313, y:  897, w:  298, h:  190 },
  BOULDER2:               { x:  621, y:  897, w:  298, h:  140 },
  TREE2:                  { x: 1205, y:    5, w:  282, h:  295 },
  BILLBOARD04:            { x: 1205, y:  310, w:  268, h:  170 },
  DEAD_TREE2:             { x: 1205, y:  490, w:  150, h:  260 },
  BOULDER1:               { x: 1205, y:  760, w:  168, h:  248 },
  BUSH1:                  { x:    5, y: 1097, w:  240, h:  155 },
  CACTUS:                 { x:  929, y:  897, w:  235, h:  118 },
  BUSH2:                  { x:  255, y: 1097, w:  232, h:  152 },
  BILLBOARD03:            { x:    5, y: 1262, w:  230, h:  220 },
  BILLBOARD02:            { x:  245, y: 1262, w:  215, h:  220 },
  STUMP:                  { x:  995, y:  330, w:  195, h:  140 },
  SEMI:                   { x: 1365, y:  490, w:  122, h:  144 },
  TRUCK:                  { x: 1365, y:  644, w:  100, h:   78 },
  NPC_TRUCK:              { w: 100, h: 78, useExternalPng: true },
  CAR03:                  { x: 1383, y:  760, w:   88, h:   55 },
  CAR02:                  { x: 1383, y:  825, w:   80, h:   59 },
  CAR04:                  { x: 1383, y:  894, w:   80, h:   57 },
  CAR01:                  { x: 1205, y: 1018, w:   80, h:   56 },
  NPC_BLUE_CAR:           { w: 80, h: 56, useExternalPng: true },
  NPC_PINK_CAR:           { w: 80, h: 59, useExternalPng: true },
  PLAYER_UPHILL_LEFT:     { x: 1383, y:  961, w:   80, h:   45 },
  PLAYER_UPHILL_STRAIGHT: { x: 1295, y: 1018, w:   80, h:   45 },
  PLAYER_UPHILL_RIGHT:    { x: 1385, y: 1018, w:   80, h:   45 },
  PLAYER_LEFT:            { x:  995, y:  480, w:   80, h:   41 },
  PLAYER_STRAIGHT:        { x: 1085, y:  480, w:   80, h:   40 },
  PLAYER_RIGHT:           { x:  995, y:  531, w:   80, h:   41 }
};

SPRITES.SCALE = 0.3 * (1/SPRITES.PLAYER_STRAIGHT.w) // the reference sprite width should be 1/3rd the (half-)roadWidth

SPRITES.BILLBOARDS = [SPRITES.BILLBOARD01, SPRITES.BILLBOARD02, SPRITES.BILLBOARD03, SPRITES.BILLBOARD04, SPRITES.BILLBOARD05, SPRITES.BILLBOARD06, SPRITES.BILLBOARD07, SPRITES.BILLBOARD08, SPRITES.BILLBOARD09];
//SPRITES.PLANTS     = [SPRITES.TREE1, SPRITES.TREE2, SPRITES.DEAD_TREE1, SPRITES.DEAD_TREE2, SPRITES.PALM_TREE, SPRITES.BUSH1, SPRITES.BUSH2, SPRITES.CACTUS, SPRITES.STUMP, SPRITES.BOULDER1, SPRITES.BOULDER2, SPRITES.BOULDER3];
SPRITES.PLANTS     = [SPRITES.TREE1, SPRITES.TREE2, SPRITES.DEAD_TREE1, SPRITES.DEAD_TREE2, SPRITES.PALM_TREE, SPRITES.BUSH2, SPRITES.CACTUS, SPRITES.STUMP, SPRITES.BOULDER1, SPRITES.BOULDER2];
// NPC_TRUCK repetido 3x no pool: camião PNG aparece com mais frequência (~3/8 dos spawns).
SPRITES.CARS       = [SPRITES.NPC_BLUE_CAR, SPRITES.NPC_PINK_CAR, SPRITES.CAR03, SPRITES.CAR04, SPRITES.SEMI, SPRITES.NPC_TRUCK, SPRITES.NPC_TRUCK, SPRITES.NPC_TRUCK];

