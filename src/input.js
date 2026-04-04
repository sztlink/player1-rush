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
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keysDown[e.code] = false; });

// Gamepad
function readGamepad() {
  const gamepads = navigator.getGamepads();
  if (!gamepads) return;
  const gp = gamepads[0];
  if (!gp) return;

  // Eixos (joystick)
  state.left  = gp.axes[0] < -0.5;
  state.right = gp.axes[0] > 0.5;
  state.up    = gp.axes[1] < -0.5;
  state.down  = gp.axes[1] > 0.5;

  // Botões (layout padrão: A=0, B=1, Start=9)
  state.buttonA = gp.buttons[0]?.pressed || false;
  state.buttonB = gp.buttons[1]?.pressed || false;
  state.start   = gp.buttons[9]?.pressed || false;
}

// Teclado override (sempre funciona, pra dev)
function readKeyboard() {
  if (keysDown['ArrowLeft'])  state.left = true;
  if (keysDown['ArrowRight']) state.right = true;
  // Seta ↑ = "up". buttonA no teclado = só Espaço (atirar na NAVE, pulo no CyberRun, etc.)
  if (keysDown['ArrowUp']) state.up = true;
  if (keysDown['ArrowDown'])  state.down = true;
  if (keysDown['Space']) state.buttonA = true;
  if (keysDown['KeyX']) state.buttonB = true;
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
