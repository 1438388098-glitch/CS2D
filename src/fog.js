import { getMap, passableTolerant, los } from './map.js';

export function fogEnabled(game) {
  return !!(game && game.opts && game.opts.fog);
}

function fogBlocked(game, x, y, map) {
  if (!map) return true;
  if (x < 0 || y < 0 || x > map.W || y > map.H) return true;
  if (!passableTolerant(x, y)) return true;
  for (const s of game.smokes || []) {
    const dx = x - s.x, dy = y - s.y;
    if (dx * dx + dy * dy < (s.r + 8) * (s.r + 8)) return true;
  }
  return false;
}

export function castRayEndpoint(game, x, y, angle, radius, step = 8) {
  const map = getMap();
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let px = x, py = y;
  for (let d = step; d <= radius; d += step) {
    px = x + cos * d;
    py = y + sin * d;
    if (fogBlocked(game, px, py, map)) break;
  }
  return { x: px, y: py };
}

export function canSeeInFog(game, viewer, target, radius = 560) {
  if (!fogEnabled(game)) return true;
  radius = Math.min(radius, 560);
  const d = Math.hypot(target.x - viewer.x, target.y - viewer.y);
  if (d > radius) return false;
  // 兼容历史距离辅助：viewer 落在墙内时保留距离判断，实际对局中玩家/bot 始终在可行走格。
  if (!passableTolerant(viewer.x, viewer.y)) return true;
  return los(game, viewer.x, viewer.y, target.x, target.y, viewer.height || 0);
}

export function hasLineOfSight(game, viewer, target, radius = 560) {
  if (!viewer || !target) return false;
  if (!los(game, viewer.x, viewer.y, target.x, target.y, viewer.height || 0)) return false;
  return canSeeInFog(game, viewer, target, radius);
}

export function castVisionPolygon(game, x, y, radius = 560, rays = 72) {
  const points = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    points.push(castRayEndpoint(game, x, y, a, radius));
  }
  return points;
}
