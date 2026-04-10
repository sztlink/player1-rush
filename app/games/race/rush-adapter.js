(function () {
  function hide(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
  }

  function show(elId, display) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.style.display = display || 'flex';
    el.setAttribute('aria-hidden', 'false');
  }

  function clearInput() {
    window.keyLeft = false;
    window.keyRight = false;
    window.keyFaster = false;
    window.keySlower = false;
  }

  function setInput(input) {
    input = input || {};
    window.keyLeft = !!input.left;
    window.keyRight = !!input.right;
    window.keyFaster = !!(input.up || input.buttonA);
    window.keySlower = !!input.down;
  }

  function ensureCanvasSize() {
    if (typeof window.reset === 'function') {
      window.reset({ width: 640, height: 480 });
    }
  }

  function setIdleMode() {
    ensureCanvasSize();
    clearInput();
    window.gamePaused = false;
    window.runFinished = false;
    window.boostTimeRemaining = 0;
    window.speed = 0;
    window.playerX = 0;
    window.gameStarted = false;
    if (typeof window.setStartOverlayVisible === 'function') {
      window.setStartOverlayVisible(true);
    }
    hide('finish-overlay');
    hide('boss-transition');
    hide('pause-overlay');
    if (window.Game && typeof window.Game.pauseBackgroundMusic === 'function') {
      window.Game.pauseBackgroundMusic();
    }
  }

  function resetForRush() {
    ensureCanvasSize();
    if (typeof window.restartSpeedRun === 'function') {
      window.restartSpeedRun();
    }
    if (typeof window.startGame === 'function') {
      window.startGame();
    }
    clearInput();
    window.gamePaused = false;
    window.runFinished = false;
    window.boostTimeRemaining = 0;
    hide('finish-overlay');
    hide('boss-transition');
    hide('pause-overlay');
    if (typeof window.setStartOverlayVisible === 'function') {
      window.setStartOverlayVisible(false);
    }
    if (window.Game && typeof window.Game.tryPlayBackgroundMusic === 'function') {
      window.Game.tryPlayBackgroundMusic();
    }
  }

  function destroy() {
    clearInput();
    if (window.Game && typeof window.Game.pauseBackgroundMusic === 'function') {
      window.Game.pauseBackgroundMusic();
    }
  }

  window.RushRaceAdapter = {
    isReady: function () {
      return !!(document.getElementById('canvas') && typeof window.reset === 'function');
    },
    getCanvas: function () {
      return document.getElementById('canvas');
    },
    getState: function () {
      return window.runFinished ? 'won' : 'playing';
    },
    setInput: setInput,
    setIdleMode: setIdleMode,
    resetForRush: resetForRush,
    destroy: destroy,
  };
})();
