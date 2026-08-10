// 感知层：视野判定（公平约束：感知距离 ≤ 玩家屏幕最远可视距离）
import {BOT_AI, diffOf} from '../config.js';
import {angDiff, viewCap} from '../utils.js';
import {fogEnabled, hasPartialLineOfSight} from '../fog.js';
import {recordOppPos} from './oppmodel.js';

const SPATIAL_CELL = 240;
const AI_VIEW_CAP = 680;

function buildSpatial(game, tick) {
  const grid = new Map();
  for (const o of game.entities) {
    if (o.dead) continue;
    const cx = Math.floor(o.x / SPATIAL_CELL), cy = Math.floor(o.y / SPATIAL_CELL);
    const k = cx + ',' + cy;
    const list = grid.get(k);
    if (list) list.push(o);
    else grid.set(k, [o]);
  }
  game.spatial = { tick, grid };
}

function nearbySpatial(e, game, radius) {
  const cell = SPATIAL_CELL;
  const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell);
  const span = Math.max(1, Math.ceil(radius / cell));
  const out = [];
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const list = game.spatial.grid.get((cx + dx) + ',' + (cy + dy));
      if (list) out.push(...list);
    }
  }
  return out;
}

export function findVisibleEnemy(e, game) {
  let best = null;
  let bestD = Math.min((e.aiParams || diffOf(game)).view, viewCap(game), BOT_AI.MAX_VIEW || Infinity, AI_VIEW_CAP);
  if (fogEnabled(game)) bestD = Math.min(bestD, 540);
  let bestScore = -Infinity;
  const tick = Math.floor(game.time * 30);
  if (!game.spatial || game.spatial.tick !== tick) buildSpatial(game, tick);
  for (const o of nearbySpatial(e, game, bestD)) {
    if (o === e || o.dead || o.team === e.team) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > bestD) continue;
    const a = Math.atan2(o.y - e.y, o.x - e.x);
    if (Math.abs(angDiff(a, e.angle)) > BOT_AI.FOV) continue;
    const losRes = hasPartialLineOfSight(game, e, o, bestD);
    if (!losRes.visible) continue;
    // 半身目击：身体中心被墙挡住但侧缘/头部露出 → 仍可发现但置信降低（半身 0.55 / 全身 1.0）
    const conf = losRes.visiblePoints >= 3 ? 1.0 : 0.55;
    const priority = -d
      + (o.hasBomb ? 1000 : 0)
      + (o.plantT > 0 || o.defuseT > 0 ? 1200 : 0)
      + (o.hp < 40 ? 200 : 0)
      - (conf < 1 ? 250 : 0);
    if (priority > bestScore) { bestScore = priority; best = o; best.conf = conf; }
  }

  // S3 对手建模：H11 队目击到 CT 时记录站位（合法情报，非透视）
  if (best && e.aiParams && e.aiParams.oppModel) {
    recordOppPos(game, best.x, best.y, 1, { eventType: 'sight' });
  }
  return best;
}
