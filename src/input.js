/**
 * Input — Teclado + Gamepad unificados
 * Lê ambos e expõe um objeto simples { left, right, up, down, buttonA, buttonB, start }
 */

const state = {
  left: false,
  right: false,
  up: false,
  down: false,
  buttonA: false,
  buttonB: false,
  start: false,
};

// Teclado
const keysDown = {};
document.addEventListener('keydown', e => {
  keysDown[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keysDown[e.code] = false; });

// Gamepad
function readGamepad() {
  const gamepads = navigator.getGamepads();
  if (!gamepads) return;
  const gp = gamepads[0];
  if (!gp) return;

  const ax0 = gp.axes[0] ?? 0;
  state.left = ax0 < -0.5;
  state.right = ax0 > 0.5;
  state.up = gp.axes[1] < -0.5;
  state.down = gp.axes[1] > 0.5;

  const b = gp.buttons;
  const dL = b[14]?.pressed;
  const dR = b[15]?.pressed;
  if (dL || dR) {
    state.left = !!dL;
    state.right = !!dR;
  }

  state.buttonA = gp.buttons[0]?.pressed || false;
  state.buttonB = gp.buttons[1]?.pressed || false;
  state.start = gp.buttons[9]?.pressed || false;
}

// Teclado override (sempre funciona, pra dev)
function readKeyboard() {
  const gpL = state.left;
  const gpR = state.right;
  const kL =
    !!keysDown['ArrowLeft'] ||
    !!keysDown['KeyA'] ||
    !!keysDown['Numpad4'] ||
    !!keysDown['KeyJ'];
  const kR =
    !!keysDown['ArrowRight'] ||
    !!keysDown['KeyD'] ||
    !!keysDown['Numpad6'] ||
    !!keysDown['KeyL'];
  state.left = kL || (gpL && !kR);
  state.right = kR || (gpR && !kL);
  if (state.left && state.right) {
    state.left = false;
    state.right = true;
  }
  if (keysDown['ArrowUp']) state.up = true;
  if (keysDown['ArrowDown']) state.down = true;
  if (keysDown['Space']) state.buttonA = true;
  if (keysDown['KeyX'] || keysDown['KeyC'] || keysDown['ShiftLeft']) state.buttonB = true;
  if (keysDown['Enter']) state.start = true;
}

export function poll() {
  // Reset
  state.left = false;
  state.right = false;
  state.up = false;
  state.down = false;
  state.buttonA = false;
  state.buttonB = false;
  state.start = false;

  readGamepad();
  readKeyboard();

  return state;
}

export function getState() {
  return state;
}
