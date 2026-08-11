import { angDiff, angNorm, clamp } from './utils.js';

const BOT_POS_SMOOTH = 5;
const BOT_TURN_RATE = 2.4;
const SNAP_DIST = 140;

function finiteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function viewX(e) {
  return e && e.bot && finiteNum(e._rx) ? e._rx : e.x;
}

export function viewY(e) {
  return e && e.bot && finiteNum(e._ry) ? e._ry : e.y;
}

export function viewAngle(e) {
  return e && e.bot && finiteNum(e._ra) ? e._ra : (e.angle || 0);
}

export function smoothRenderEntities(game, dt) {
  if (!game || !game.entities) return;
  const t = Math.max(0, dt || 0);
  for (const e of game.entities) {
    if (!e || !e.bot || e.dead) continue;
    if (!finiteNum(e._rx) || !finiteNum(e._ry)) {
      e._rx = e.x;
      e._ry = e.y;
    }
    if (!finiteNum(e._ra)) e._ra = e.angle || 0;
    const dist = Math.hypot(e.x - e._rx, e.y - e._ry);
    if (dist > SNAP_DIST) {
      e._rx = e.x;
      e._ry = e.y;
      e._ra = e.angle || 0;
      continue;
    }
    const k = 1 - Math.exp(-BOT_POS_SMOOTH * t);
    const speed = Math.hypot(e.vx || 0, e.vy || 0);
    const maxCatchUp = speed > 0 ? speed * t * 1.25 : 0;
    const step = dist > 0 ? Math.min(dist * k, maxCatchUp) : 0;
    const f = dist > 0 ? step / dist : 0;
    e._rx += (e.x - e._rx) * f;
    e._ry += (e.y - e._ry) * f;
    const maxTurn = Math.max(0, BOT_TURN_RATE * t);
    e._ra = angNorm(e._ra + clamp(angDiff(e.angle || 0, e._ra), -maxTurn, maxTurn));
  }
}
