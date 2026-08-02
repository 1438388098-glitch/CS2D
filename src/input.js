import { startReload, fireWeapon } from './combat.js';
import { initAudio, setMuted } from './audio.js';
import { isMiniZoomed } from './hud.js';
import { matches } from './keymap.js';
import { setPlayerOrder } from './ai.js';

let lastWheelT = 0;

export function initInput(game, canvasRef) {
  const keys = game.input.keys;
  const mouse = game.input.mouse;
  const windowRef = window;

  windowRef.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    // 玩家→bot 战术指令（F1 集合 / F2 攻A / F3 攻B / F4 守点）
    if (e.code === 'F1') setPlayerOrder(game, 'follow');
    if (e.code === 'F2') setPlayerOrder(game, 'siteA');
    if (e.code === 'F3') setPlayerOrder(game, 'siteB');
    if (e.code === 'F4') setPlayerOrder(game, 'hold');
    if (matches(e.code, 'buy')) {
      if (game.ui.isBuyOpen()) game.ui.closeBuy();
      else game.ui.openBuy();
    }
    if (/^Digit[1-7]$/.test(e.code) && game.ui.isBuyOpen()) {
      e.preventDefault();
      game.ui.switchBuyCat(parseInt(e.code.slice(5), 10) - 1);
    }
    if (matches(e.code, 'scoreboard')) {
      e.preventDefault();
      game.ui.toggleScoreboard(true);
    }
    if (matches(e.code, 'pause')) {
      if (game.ui.isBuyOpen()) { game.ui.closeBuy(); return; }
      if (game.ui.isPaused()) game.ui.unpause();
      else if (game.state === 'MENU') return;
      else game.ui.pause();
    }
    if (matches(e.code, 'reload') && game.player) startReload(game.player, game);
    if (matches(e.code, 'weaponPrimary')) switchWeapon(game.player, 'primary');
    if (matches(e.code, 'weaponSecondary')) switchWeapon(game.player, 'secondary');
    if (matches(e.code, 'weaponKnife')) switchWeapon(game.player, 'knife');
    if (matches(e.code, 'nadeHe')) quickThrow(game.player, 'he', game);
    if (matches(e.code, 'nadeFlash')) quickThrow(game.player, 'flash', game);
    if (matches(e.code, 'nadeSmoke')) quickThrow(game.player, 'smoke', game);
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
    if (matches(e.code, 'nadeHe') || matches(e.code, 'nadeFlash') || matches(e.code, 'nadeSmoke')) {
      const p = game.player;
      if (p && p.slot && p.slot.indexOf('nade:') === 0 && p.lastSlot) {
        p.slot = p.lastSlot;
        p.fireCd = Math.max(p.fireCd, 0.2);
      }
    }
  }, false);

  windowRef.addEventListener('mousemove', (e) => {
    const r = canvasRef.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }, false);

  canvasRef.addEventListener('mousedown', (e) => {
    initAudio();
    if (e.button === 0) {
      const cw = game.canvasW || window.innerWidth;
      const mmW = isMiniZoomed() ? 480 : 240;
      const mmH = isMiniZoomed() ? 360 : 180;
      const r = canvasRef.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const onMini = mx > cw - mmW - 12 && my < mmH + 10;
      if (!onMini) mouse.down = true;
      if (game.player && game.player.dead && game.state !== 'END') {
        const mates = game.entities.filter((ee) => ee.team === game.player.team && !ee.dead);
        if (mates.length) game.spectateIdx = (game.spectateIdx + 1) % mates.length;
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

  windowRef.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    mouse.down = false;
    mouse.rdown = false;
    mouse.wasDown = false;
    if (game.ui) game.ui.toggleScoreboard(false);
    if (game.state !== 'MENU' && game.ui && !game.ui.isPaused()) game.ui.pause();
  }, false);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const k in keys) keys[k] = false;
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
    if (!p || p.dead) return;
    const slots = ['primary', 'secondary', 'knife'];
    let idx = slots.indexOf(p.slot);
    if (idx < 0) idx = 1;
    idx = (idx + (e.deltaY > 0 ? 1 : -1) + slots.length) % slots.length;
    switchWeapon(p, slots[idx]);
  }, false);

  windowRef.addEventListener('resize', () => resizeCanvas(game, canvasRef));
}

export function resizeCanvas(game, canvasRef) {
  const dpr = window.devicePixelRatio || 1;
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
}

export function switchNade(e, nade) {
  if (!e || e.dead) return;
  if (e.weapons.nades[nade] <= 0) return;
  e.lastSlot = e.slot;
  e.slot = 'nade:' + nade;
  e.reloading = false;
  e.fireCd = 0.3;
}

// 快速投掷：切雷并立即抛出（瞄准即当前朝向）
export function quickThrow(e, nade, gameRef) {
  if (!e || e.dead) return;
  switchNade(e, nade);
  if (e.slot === 'nade:' + nade) fireWeapon(e, gameRef);
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
