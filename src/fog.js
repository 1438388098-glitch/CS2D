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

export function castRayEndpoint(game, x, y, angle, radius = fogVisionRadius(game), step = 0) {
  const map = getMap();
  if (!Number.isFinite(radius) || radius <= 0) radius = fogVisionRadius(game);
  // 步长自适应：默认取半格宽（≥12px），对角线级射程（~3000px）下单次重算的步进量减半
  const stepEff = step > 0 ? step : Math.max(12, ((map && map.tile) || 24) / 2);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let px = x, py = y;
  for (let d = stepEff; d <= radius; d += stepEff) {
    px = x + cos * d;
    py = y + sin * d;
    if (fogBlocked(game, px, py, map)) break;
  }
  return { x: px, y: py };
}

const FOG_RADIUS = 540;

export function fogVisionRadius(game) {
  const map = getMap();
  if (map && map.W && map.H) {
    return Math.hypot(map.W, map.H) + Math.max(1, map.tile || 1);
  }
  return FOG_RADIUS;
}

export function canSeeInFog(game, viewer, target, radius = fogVisionRadius(game)) {
  if (!fogEnabled(game)) return true;
  radius = Math.min(radius, fogVisionRadius(game));
  const d = Math.hypot(target.x - viewer.x, target.y - viewer.y);
  if (d > radius) return false;
  // 兼容历史距离辅助：viewer 落在墙内时保留距离判断，实际对局中玩家/bot 始终在可行走格。
  if (!passableTolerant(viewer.x, viewer.y)) return true;
  return los(game, viewer.x, viewer.y, target.x, target.y, viewer.height || 0);
}

export function hasLineOfSight(game, viewer, target, radius = fogVisionRadius(game)) {
  if (!viewer || !target) return false;
  if (!los(game, viewer.x, viewer.y, target.x, target.y, viewer.height || 0)) return false;
  return canSeeInFog(game, viewer, target, radius);
}

// 半身目击采样：沿视线垂直方向采「头顶/中心/脚」三点（模拟身体轮廓宽度）。
// 中心被墙挡住但侧缘/头部露出 → 人眼能看到半身，故仍算部分可见。
// 蹲下时有效点向中心收紧（受弹面积变小，更难探出掩体）。
const BODY_HALF = 14;
const BODY_HALF_CROUCH = 6;

export function hasPartialLineOfSight(game, viewer, target, radius = fogVisionRadius(game)) {
  if (!viewer || !target) return { visible: false, visiblePoints: 0 };
  const dx = target.x - viewer.x, dy = target.y - viewer.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-3 ? -dy / d : 1;
  const uy = d > 1e-3 ? dx / d : 0;
  const half = target.crouched ? BODY_HALF_CROUCH : BODY_HALF;
  const pts = [
    { x: target.x + ux * half, y: target.y + uy * half },
    { x: target.x, y: target.y },
    { x: target.x - ux * half, y: target.y - uy * half }
  ];
  const optH = viewer.height || 0;
  const tH = target.height || 0;
  let visiblePoints = 0;
  for (const p of pts) {
    if (!los(game, viewer.x, viewer.y, p.x, p.y, optH)) continue;
    if (!canSeeInFog(game, viewer, { x: p.x, y: p.y, height: tH }, radius)) continue;
    visiblePoints++;
  }
  return { visible: visiblePoints > 0, visiblePoints };
}

export function castVisionPolygon(game, x, y, radius = fogVisionRadius(game), rays = 72) {
  const points = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    points.push(castRayEndpoint(game, x, y, a, radius));
  }
  return points;
}
