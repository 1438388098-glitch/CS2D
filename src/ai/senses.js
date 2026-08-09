import { BOT_AI } from '../config.js';
import { los } from '../map.js';

const HEAR_BASE = Math.round(BOT_AI.HEAR_RADIUS * 0.9);

export function weaponHearRadius(w) {
  if (!w) return HEAR_BASE;
  if (w.kind === 'sniper') return HEAR_BASE * 1.3;
  if (w.kind === 'shotgun') return HEAR_BASE * 1.2;
  if (w.kind === 'rifle') return HEAR_BASE * 1.15;
  if (w.kind === 'smg') return HEAR_BASE * 0.9;
  if (w.kind === 'pistol') return HEAR_BASE * 0.8;
  return HEAR_BASE;
}

function remember(e, x, y, game, conf) {
  e.lastKnown = { x, y };
  e.lastKnownT = 0;
  if (!e.memory) e.memory = [];
  e.memory.push({ x, y, t: game.time, conf });
  if (e.memory.length > 8) e.memory.shift();
}

export function hearGunshot(e, shooter, game, weapon) {
  const clear = los(game, e.x, e.y, shooter.x, shooter.y);
  const radius = weaponHearRadius(weapon) * (clear ? 1 : 0.55);
  const dx = shooter.x - e.x, dy = shooter.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > radius) return false;
  const angle = Math.atan2(dy, dx);
  const err = Math.sin(game.time * 5 + (e.anchorIdx || 0) * 2.7) * 0.28;
  const spread = Math.max(34, d * (clear ? 0.26 : 0.4));
  const px = e.x + Math.cos(angle) * d + Math.cos(angle + Math.PI / 2) * spread * err;
  const py = e.y + Math.sin(angle) * d + Math.sin(angle + Math.PI / 2) * spread * err;
  e.lastHear = { angle, dist: d, x: shooter.x, y: shooter.y, t: game.time };
  remember(e, px, py, game, clear ? 0.55 : 0.35);
  return true;
}

export function hearWorldSound(e, game) {
  const s = game.lastSound;
  if (!s) return false;
  const age = game.time - s.t;
  if (age > 0.75) return false;
  const d = Math.hypot(e.x - s.x, e.y - s.y);
  if (d > s.radius) return false;
  e.lastHear = { angle: Math.atan2(s.y - e.y, s.x - e.x), dist: d, t: game.time };
  remember(e, s.x, s.y, game, s.conf || 0.55);
  return true;
}

export function hearStep(e, game) {
  const s = game.lastStep;
  if (!s || s.team === e.team) return false;
  const age = game.time - s.t;
  if (age > 0.6) return false;
  const radius = s.walk ? 380 : 760;
  const d = Math.hypot(e.x - s.x, e.y - s.y);
  if (d > radius) return false;
  e.lastHear = { angle: Math.atan2(s.y - e.y, s.x - e.x), dist: d, t: game.time };
  // 脚步位置模糊化：只能定位大致区域（±110px），不能精确锁点——防静步偷袭者被隔墙精确定位
  remember(e, s.x + Math.sin(game.time * 3 + (e.anchorIdx || 0) * 2.2) * 140, s.y + Math.cos(game.time * 4 + (e.anchorIdx || 0) * 1.3) * 140, game, s.walk ? 0.32 : 0.48);
  return true;
}
