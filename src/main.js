import { init, tick } from './orchestrator.js';
init();
function loop() { tick(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
