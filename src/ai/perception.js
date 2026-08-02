// 感知层：视野判定（公平约束：感知距离 ≤ 玩家屏幕最远可视距离）
import { BOT_AI, DIFF } from '../config.js';
import { los } from '../map.js';
import { angDiff, viewCap } from '../utils.js';

export function findVisibleEnemy(e, game) {
  let best = null;
  // 感知距离上限 = min(难度视野, 玩家屏幕最远可视距离)——不开"屏幕外透视"
  let bestD = Math.min((e.aiParams || DIFF[game.opts.diff]).view, viewCap(game));
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > bestD) continue;
    const a = Math.atan2(o.y - e.y, o.x - e.x);
    if (Math.abs(angDiff(a, e.angle)) > BOT_AI.FOV) continue;
    if (!los(game, e.x, e.y, o.x, o.y, e.height)) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
