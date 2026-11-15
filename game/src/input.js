// Keyboard and mouse, read once a frame. Movement keys give a direction vector;
// confirm / pause / dash / restart are edge-triggered actions the loop consumes.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;
export const ACTION_LEVEL_1 = 32;
export const ACTION_LEVEL_2 = 64;
export const ACTION_LEVEL_3 = 128;

const MOVE_KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 640, y: 300, down: false, clicked: false };

  function canvasPoint(clientX, clientY) {
    // Same letterbox math as the renderer: the 1280x720 field is scaled to fit.
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 1280, rect.height / 720);
    const offX = (rect.width - 1280 * scale) / 2;
    const offY = (rect.height - 720 * scale) / 2;
    return {
      x: (clientX - rect.left - offX) / scale,
      y: (clientY - rect.top - offY) / scale,
    };
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') { actions |= ACTION_CONFIRM; event.preventDefault(); }
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') actions |= ACTION_DASH;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Digit1') actions |= ACTION_LEVEL_1;
    if (event.code === 'Digit2') actions |= ACTION_LEVEL_2;
    if (event.code === 'Digit3') actions |= ACTION_LEVEL_3;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const p = canvasPoint(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  }

  function onMouseDown(event) {
    const p = canvasPoint(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onBlur() {
    held.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  /** Unit movement vector from the keys currently held (0,0 when none). */
  function direction() {
    let x = 0;
    let y = 0;
    for (const code of held) {
      const v = MOVE_KEYS[code];
      if (v) { x += v[0]; y += v[1]; }
    }
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    const len = Math.hypot(x, y);
    return { x: x / len, y: y / len };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  function takeClick() {
    const c = mouse.clicked;
    mouse.clicked = false;
    return c;
  }

  return { direction, takeActions, takeClick, mouse, heldKeys: held };
}
