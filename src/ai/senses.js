import { BOT_AI } from '../config.js';
import { los } from '../map.js';
import { shouldRefreshObjective } from './shared.js';

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

function remember(e, x, y, game, conf, vx = 0, vy = 0) {
  // 记忆速度外推：若能目击目标，附带其 vx/vy（core 消费时按 age×速度外推当前位置）。
  // 始终保证 vx/vy 为数字（默认 0），旧调用/字段缺失不破坏下游。
  const svx = Number.isFinite(vx) ? vx : 0;
  const svy = Number.isFinite(vy) ? vy : 0;
  // 警报覆盖缓存：新警报置信度高于旧目标时立即覆盖 lastKnown（不等 TTL），
  // 否则保留更强的旧目标；记忆槽始终记录本次感知
  const alert = { x, y, t: game.time, conf, vx: svx, vy: svy };
  if (shouldRefreshObjective(e.lastKnown, alert, game.time)) {
    e.lastKnown = { x, y, conf, t: game.time, vx: svx, vy: svy };
    e.lastKnownT = 0;
  }
  if (!e.memory) e.memory = [];
  e.memory.push({ x, y, t: game.time, conf, vx: svx, vy: svy });
  if (e.memory.length > 8) e.memory.shift();
}

export function hearGunshot(e, shooter, game, weapon) {
  if (hearSuppressed(e, game)) return false;
  const clear = los(game, e.x, e.y, shooter.x, shooter.y);
  const radius = weaponHearRadius(weapon) * (clear ? 1 : 0.55) * thunderMul(game);
  const dx = shooter.x - e.x, dy = shooter.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > radius) return false;
  const angle = Math.atan2(dy, dx);
  const err = Math.sin(game.time * 5 + (e.anchorIdx || 0) * 2.7) * 0.28;
  const spread = Math.max(34, d * (clear ? 0.26 : 0.4));
  const px = e.x + Math.cos(angle) * d + Math.cos(angle + Math.PI / 2) * spread * err;
  const py = e.y + Math.sin(angle) * d + Math.sin(angle + Math.PI / 2) * spread * err;
  // 能直接看到枪手时附带其移动速度（供记忆外推）；隔墙听声则无速度信息
  const vx = clear ? (shooter.vx || 0) : 0;
  const vy = clear ? (shooter.vy || 0) : 0;
  e.lastHear = { angle, dist: d, x: shooter.x, y: shooter.y, t: game.time, conf: clear ? 0.55 : 0.35, vx, vy };
  remember(e, px, py, game, clear ? 0.55 : 0.35, vx, vy);
  return true;
}

export function hearSuppressed(e, game) {
  const emp = game && game.empPulse;
  return !!(emp && game.time < emp.until && Math.hypot(e.x - emp.x, e.y - emp.y) < emp.r);
}

// 雷暴窗口内声源半径减半（candidate-568）：雷声掩盖脚步/枪声
function thunderMul(game) {
  return game && game.thunderUntil && game.time < game.thunderUntil ? 0.5 : 1;
}

export function hearWorldSound(e, game) {
  if (hearSuppressed(e, game)) return false;
  const s = game.lastSound;
  if (!s) return false;
  const sRadius = s.radius * thunderMul(game);
  const age = game.time - s.t;
  if (age > 0.75) return false;
  const d = Math.hypot(e.x - s.x, e.y - s.y);
  if (d > sRadius) return false;
  // 世界音源（爆炸/拆装弹）为静态源；若调用方附带音源移动速度则使用，否则 0
  const vx = Number.isFinite(s.vx) ? s.vx : 0;
  const vy = Number.isFinite(s.vy) ? s.vy : 0;
  e.lastHear = { angle: Math.atan2(s.y - e.y, s.x - e.x), dist: d, t: game.time, conf: s.conf || 0.55, vx, vy };
  remember(e, s.x, s.y, game, s.conf || 0.55, vx, vy);
  return true;
}

export function hearStep(e, game) {
  if (hearSuppressed(e, game)) return false;
  const s = game.lastStep;
  if (!s || s.team === e.team) return false;
  const age = game.time - s.t;
  if (age > 0.6) return false;
  const radius = (s.walk ? 380 : 760) * thunderMul(game);
  const d = Math.hypot(e.x - s.x, e.y - s.y);
  if (d > radius) return false;
  // 若能目击脚步声源附近的移动敌人，附带其速度（供记忆外推）
  let vx = Number.isFinite(s.vx) ? s.vx : 0;
  let vy = Number.isFinite(s.vy) ? s.vy : 0;
  if (!vx && !vy && game.entities) {
    for (const o of game.entities) {
      if (o === e || o.dead || o.team === e.team) continue;
      if (Math.hypot(o.x - s.x, o.y - s.y) > 160) continue;
      if (!o.vx && !o.vy) continue;
      if (!los(game, e.x, e.y, o.x, o.y)) continue;
      vx = o.vx || 0; vy = o.vy || 0;
      break;
    }
  }
  e.lastHear = { angle: Math.atan2(s.y - e.y, s.x - e.x), dist: d, t: game.time, conf: s.walk ? 0.32 : 0.48, vx, vy };
  // 脚步位置模糊化：只能定位大致区域（±110px），不能精确锁点——防静步偷袭者被隔墙精确定位
  remember(e, s.x + Math.sin(game.time * 3 + (e.anchorIdx || 0) * 2.2) * 140, s.y + Math.cos(game.time * 4 + (e.anchorIdx || 0) * 1.3) * 140, game, s.walk ? 0.32 : 0.48, vx, vy);
  return true;
}
