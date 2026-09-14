import { startReload, fireWeapon } from './combat.js';
import { initAudio, setMuted, uiSfx } from './audio.js';
import { isMiniZoomed } from './hud.js';
import { matches } from './keymap.js';
import { setPlayerOrder } from './ai.js';
import { SWITCH_POP_DURATION } from './weapon-fx.js';

let lastWheelT = 0;
let fpsCanvas = null;
// 指针锁定被拒/不支持时的兜底瞄准：记录上一帧绝对鼠标位置，以增量代替 movementX/Y
let fpsFallbackX = null;
let fpsFallbackY = null;
// pointer lock 首帧 movementX/Y 含光标回中偏移，锁定后首个 mousemove 丢弃一次增量
let firstLockFrame = false;

// 第一人称（fps/3D）视图已打入冷宫（attic/）：视角固定俯视，V 键与设置面板不再提供 fps
const VIEW_MODES = ['top'];

export function fpsCursorStyle(game) {
  return game && game.viewMode === 'fps' && (game.state === 'BUY' || game.state === 'LIVE') ? 'none' : '';
}

export function isFpsPointerLockActive(game) {
  return !!game && game.viewMode === 'fps' &&
    typeof document !== 'undefined' && document.pointerLockElement === fpsCanvas;
}

export function clearFpsMouseDeltas(game) {
  if (!game) return;
  game._mlookDx = 0;
  game._mlookDy = 0;
  fpsFallbackX = null;
  fpsFallbackY = null;
}

export function syncFpsCursor(game) {
  if (!fpsCanvas || typeof fpsCanvas.style === 'undefined') return;
  fpsCanvas.style.cursor = fpsCursorStyle(game);
}

export function requestFpsPointerLock(game) {
  if (!game || game.viewMode !== 'fps' || !fpsCanvas || typeof fpsCanvas.requestPointerLock !== 'function') return;
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  if (typeof document !== 'undefined' && document.pointerLockElement) return;
  try { fpsCanvas.requestPointerLock(); } catch (err) { /* 锁请求被浏览器拒绝时继续增量瞄准 */ }
}

export function setViewMode(game, mode) {
  game.viewMode = VIEW_MODES.includes(mode) ? mode : 'top';
  try { localStorage.setItem('cs2d_viewmode', game.viewMode); } catch (err) {}
  if (game.viewMode !== 'fps' && typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock();
  }
  syncFpsCursor(game);
  if (game.viewMode === 'fps') requestFpsPointerLock(game);
}

export function toggleViewMode(game) {
  setViewMode(game, VIEW_MODES[(VIEW_MODES.indexOf(game.viewMode) + 1) % VIEW_MODES.length]);
}

export function cycleSpectate(game, dir = 1) {
  if (!game || !game.player || !game.player.dead || game.state === 'END') return null;
  const p = game.player;
  let targets;
  if (game.cyber && !game.cyber.ended) {
    targets = game.entities.filter((ee) => ee.bot && !ee.dead);
  } else {
    targets = game.entities.filter((ee) => ee.team === p.team && !ee.dead);
  }
  if (!targets.length) return null;
  const step = ((dir % targets.length) + targets.length) % targets.length;
  game.spectateIdx = (game.spectateIdx + step) % targets.length;
  const target = targets[game.spectateIdx % targets.length];
  // 与 updateCamera 的 pickSpectateTarget 锁定机制同步：Q/E 切人后锁定新目标
  game._specTarget = target || null;
  game._specManual = null;
  game._specAngle = target ? target.angle : null;
  game._specPitch = target ? (target.pitch || 0) : null;
  return target;
}

export function initInput(game, canvasRef) {
  try { const v = localStorage.getItem('cs2d_viewmode'); if (VIEW_MODES.includes(v)) game.viewMode = v; } catch (err) {}
  fpsCanvas = canvasRef;
  syncFpsCursor(game);
  const keys = game.input.keys;
  const mouse = game.input.mouse;
  const windowRef = window;

  windowRef.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (matches(e.code, 'viewToggle')) { e.preventDefault(); toggleViewMode(game); }
    if ((matches(e.code, 'spectateNext') || matches(e.code, 'spectatePrev')) && game.player && game.player.dead && game.state !== 'END') {
      e.preventDefault();
      cycleSpectate(game, matches(e.code, 'spectateNext') ? 1 : -1);
    }
    // 玩家→bot 战术指令（F1 集合 / F2 攻A / F3 攻B / F4 守点）
    if (matches(e.code, 'orderFollow')) setPlayerOrder(game, 'follow');
    if (matches(e.code, 'orderSiteA')) setPlayerOrder(game, 'siteA');
    if (matches(e.code, 'orderSiteB')) setPlayerOrder(game, 'siteB');
    if (matches(e.code, 'orderHold')) setPlayerOrder(game, 'hold');
    if (matches(e.code, 'buy')) {
      if (game.ui.isBuyOpen()) game.ui.closeBuy();
      else { game.ui.openBuy(); uiSfx('panel', 0.3); if (document.pointerLockElement) document.exitPointerLock(); }
    }
    for (let i = 1; i <= 7; i++) {
      if (matches(e.code, 'buyCat' + i) && game.ui.isBuyOpen()) {
        e.preventDefault();
        game.ui.switchBuyCat(i - 1);
        break;
      }
    }
    if (matches(e.code, 'scoreboard')) {
      e.preventDefault();
      uiSfx('panel', 0.25);
      game.ui.toggleScoreboard(true);
    }
    if (matches(e.code, 'pause')) {
      // 无条件先解锁：MENU 态 Esc 也应释放指针锁定（否则光标永久消失）
      if (document.pointerLockElement) document.exitPointerLock();
      if (game.ui.isBuyOpen()) { game.ui.closeBuy(); return; }
      if (game.ui.isPaused()) game.ui.unpause();
      else if (game.state === 'MENU') return;
      else game.ui.pause();
    }
    if (matches(e.code, 'reload') && game.player) startReload(game.player, game);
    if (matches(e.code, 'weaponPrimary')) switchWeapon(game.player, 'primary');
    if (matches(e.code, 'weaponSecondary')) switchWeapon(game.player, 'secondary');
    if (matches(e.code, 'weaponKnife')) switchWeapon(game.player, 'knife');
    if (matches(e.code, 'nadeHe')) switchNade(game.player, 'he');
    if (matches(e.code, 'nadeFlash')) switchNade(game.player, 'flash');
    if (matches(e.code, 'nadeSmoke')) switchNade(game.player, 'smoke');
    if (matches(e.code, 'nadeDecoy')) switchNade(game.player, 'decoy');
    if (matches(e.code, 'lastWeapon')) {
      const p = game.player;
      if (p && p.lastSlot) switchWeapon(p, p.lastSlot);
    }
    if (matches(e.code, 'mute')) {
      game.opts.sound = !game.opts.sound;
      setMuted(!game.opts.sound);
      game.ui.setMuteLabel();
    }
  }, false);

  windowRef.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (matches(e.code, 'scoreboard')) game.ui.toggleScoreboard(false);
    // 快速投掷松键：若仍手持该投掷物则切回原武器
    if (matches(e.code, 'nadeHe') || matches(e.code, 'nadeFlash') || matches(e.code, 'nadeSmoke') || matches(e.code, 'nadeDecoy')) {
      const p = game.player;
      if (p && p.slot && p.slot.indexOf('nade:') === 0 && p.lastSlot) {
        p.slot = p.lastSlot;
        p.fireCd = Math.max(p.fireCd, 0.2);
      }
    }
  }, false);

  windowRef.addEventListener('mousemove', (e) => {
    // 同时记录绝对位置（俯视/跟随瞄准与 HUD 使用）
    const r = canvasRef.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (game.viewMode !== 'fps') return;
    if (isFpsPointerLockActive(game)) {
      // 标准 FPS 增量瞄准：pointer lock 下累积 X/Y 位移，游戏循环统一消费一次
      if (firstLockFrame) {
        // 锁定首帧 movementX/Y 含光标回中偏移，丢弃一次增量避免视角大跳
        firstLockFrame = false;
        fpsFallbackX = null;
        fpsFallbackY = null;
        return;
      }
      game._mlookDx = (game._mlookDx || 0) + (e.movementX || 0);
      game._mlookDy = (game._mlookDy || 0) + (e.movementY || 0);
      // 锁定期间重置兜底基线，避免解锁后首帧产生跳变
      fpsFallbackX = null;
      fpsFallbackY = null;
      return;
    }
    // 指针锁定被拒/不支持：以绝对坐标增量兜底瞄准（dX = curX - lastX），
    // 行为与 movementX/Y 一致（鼠标停→朝向停），避免无锁时 FPS 视角冻结
    if (fpsFallbackX != null && fpsFallbackY != null) {
      // 与 mousedown 相同的 UI 拦截判定：鼠标落在购买菜单/DOM 面板上时不累积瞄准
      const hit = typeof document !== 'undefined' && document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const onUi = hit && hit.closest && hit.closest('#ui, .cyber-panel, button, [data-speed], [data-skip]');
      const inAim = (game.state === 'BUY' || game.state === 'LIVE') &&
        (!game.ui || !game.ui.isPaused()) && !onUi;
      if (inAim) {
        game._mlookDx = (game._mlookDx || 0) + (mouse.x - fpsFallbackX);
        game._mlookDy = (game._mlookDy || 0) + (mouse.y - fpsFallbackY);
      }
    }
    fpsFallbackX = mouse.x;
    fpsFallbackY = mouse.y;
  }, false);

  canvasRef.addEventListener('mousedown', (e) => {
    initAudio();
    if (e.button === 0) {
      const hit = typeof document !== 'undefined' && document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const onUi = hit && hit.closest && hit.closest('#ui, .cyber-panel, button, [data-speed], [data-skip]');
      if (onUi) return;
      const cw = game.canvasW || window.innerWidth;
      const mmW = isMiniZoomed() ? 480 : 240;
      const mmH = isMiniZoomed() ? 360 : 180;
      const r = canvasRef.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const onMini = mx > cw - mmW - 12 && my < mmH + 10;
      if (!onMini) mouse.down = true;
      if (!onMini && game.viewMode === 'fps' && (game.state === 'BUY' || game.state === 'LIVE')) requestFpsPointerLock(game);
      if (game.player && game.player.dead && game.state !== 'END') {
        cycleSpectate(game, 1);
      }
    }
    if (e.button === 2) mouse.rdown = true;
  }, false);

  windowRef.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      mouse.down = false;
      mouse.wasDown = false;
    }
    if (e.button === 2) mouse.rdown = false;
  }, false);

  canvasRef.addEventListener('contextmenu', (e) => e.preventDefault(), false);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) firstLockFrame = true;
    if (!document.pointerLockElement && game.viewMode === 'fps') {
      clearFpsMouseDeltas(game);
    }
    // Esc 解锁兜底自动暂停（记分板开着时也暂停：Chrome 吞 Esc keydown，否则会落入未锁定未暂停的"裸奔"状态）
    if (!document.pointerLockElement && game.viewMode === 'fps' &&
        (game.state === 'BUY' || game.state === 'LIVE') &&
        game.ui && !game.ui.isPaused() && !(game.ui.isBuyOpen && game.ui.isBuyOpen())) {
      game.ui.pause();
    }
  }, false);

  windowRef.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    clearFpsMouseDeltas(game);
    mouse.down = false;
    mouse.rdown = false;
    mouse.wasDown = false;
    if (game.ui) game.ui.toggleScoreboard(false);
    if (game.state !== 'MENU' && game.ui && !game.ui.isPaused()) game.ui.pause();
  }, false);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const k in keys) keys[k] = false;
    clearFpsMouseDeltas(game);
    mouse.down = false;
    mouse.rdown = false;
    mouse.wasDown = false;
    if (game.ui) game.ui.toggleScoreboard(false);
    if (game.state !== 'MENU' && game.ui && !game.ui.isPaused()) game.ui.pause();
  }, false);

  windowRef.addEventListener('wheel', (e) => {
    const now = performance.now();
    if (now - lastWheelT < 80) return;
    lastWheelT = now;
    const p = game.player;
    if (!p) return;
    if (p.dead) {
      if (game.state !== 'END') cycleSpectate(game, e.deltaY > 0 ? 1 : -1);
      return;
    }
    const slots = ['primary', 'secondary', 'knife'];
    let idx = slots.indexOf(p.slot);
    if (idx < 0) idx = 1;
    idx = (idx + (e.deltaY > 0 ? 1 : -1) + slots.length) % slots.length;
    switchWeapon(p, slots[idx]);
  }, false);

  windowRef.addEventListener('resize', () => resizeCanvas(game, canvasRef));
}

export function resizeCanvas(game, canvasRef) {
  const nativeDpr = window.devicePixelRatio || 1;
  const dprLimit = (typeof game.dprLimit === 'number' && isFinite(game.dprLimit) && game.dprLimit >= 1)
    ? game.dprLimit
    : 2;
  const dpr = Math.min(nativeDpr, dprLimit);
  game.dprLimit = dprLimit;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvasRef.width = Math.round(w * dpr);
  canvasRef.height = Math.round(h * dpr);
  canvasRef.style.width = w + 'px';
  canvasRef.style.height = h + 'px';
  game.canvasW = w;
  game.canvasH = h;
  game.dpr = dpr;
}

export function switchWeapon(e, slot) {
  if (!e || e.dead) return;
  if (slot === 'primary' && !e.weapons.primary) return;
  if (slot === 'secondary' && !e.weapons.secondary) return;
  if (e.slot === slot) return;
  e.lastSlot = e.slot;
  e.slot = slot;
  e.reloading = false;
  e.reloadT = 0;
  e.fireCd = 0.25;
  e.scoped = false;
  e.switchT = SWITCH_POP_DURATION;
}

export function switchNade(e, nade) {
  if (!e || e.dead) return;
  if (e.weapons.nades[nade] <= 0) return;
  e.lastSlot = e.slot;
  e.slot = 'nade:' + nade;
  e.reloading = false;
  e.fireCd = 0.3;
  e.switchT = SWITCH_POP_DURATION;
}

// 快速投掷：切雷并立即抛出（瞄准即当前朝向）
export function quickThrow(e, nade, gameRef) {
  if (!e || e.dead) return;
  switchNade(e, nade);
  if (e.slot === 'nade:' + nade) {
    e.fireCd = 0;
    fireWeapon(e, gameRef);
  }
}

export function setKey(game, code, down) {
  game.input.keys[code] = down;
}

export function setMouse(game, x, y) {
  game.input.mouse.x = x;
  game.input.mouse.y = y;
}

export function setMouseDown(game, v) {
  game.input.mouse.down = v;
}
