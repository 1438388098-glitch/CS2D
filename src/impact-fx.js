// 2D 子弹落地印记（candidate-241）：子弹命中墙体/地面/掩体后留下的短暂弹孔。
// 视觉形态：墙面裂纹（crack）/ 地面黑点灼痕（spot）/ 木箱星形木屑痕（star），
// 弹孔形态/朝向/尺寸/射线数由撞击点 (x,y) + seed 的确定性哈希导出（无 Math.random），
// 同输入必得同弹孔；绘制为纯函数（可传 stub ctx 测试）。
// 纯装饰层：不影响碰撞 / LOS / 逻辑，与 fog.js / combat.js 完全解耦。

import { clamp } from './utils.js';
import { hash01 } from './ambient-fx.js';

// 弹孔总生命周期（秒）：存活期内先稳定显示、末端短暂淡出
export const IMPACT_LIFE = 10;
// 秒：从该时刻起开始线性淡出（占生命末段 ~25%）
export const IMPACT_FADE_START = 7.5;

// 各表面基准样式：shapes 权重表（越靠前命中概率越高）、尺寸与射线数范围
const TILE_BASE = {
  wall: { shapes: ['crack', 'crack', 'crack', 'spot'], minSize: 3.5, maxSize: 5, minArms: 3, maxArms: 5 },
  ground: { shapes: ['spot', 'spot', 'spot', 'crack'], minSize: 4.5, maxSize: 6.5, minArms: 3, maxArms: 4 },
  crate: { shapes: ['star', 'star', 'crack'], minSize: 6.5, maxSize: 9.5, minArms: 4, maxArms: 6 }
};

// 表面颜色（r,g,b），alpha 由绘制时按透明度混合
const TILE_COLOR = {
  wall: { r: 24, g: 26, b: 30 },
  ground: { r: 30, g: 26, b: 21 },
  crate: { r: 54, g: 35, b: 22 }
};

// 归一化表面：支持英文风格词 / 地图瓦片字符，未知输入按墙面处理
export function normalizeImpactTile(tileType) {
  const c = String(tileType == null ? '' : tileType).trim().toLowerCase();
  if (!c) return 'wall';
  if (c === 'wall' || c === 'concrete' || c === 'stone' || c === '#' || c === '=') return 'wall';
  if (c === 'crate' || c === 'box' || c === 'wood' || c === 'barrel' || c === 'd' || c === 'c' || c === 'o') return 'crate';
  if (c === 'ground' || c === 'floor' || c === 'dirt' || c === 'sand' || c === 'grass' || c === '.') return 'ground';
  if (c === '~' || c === '≈' || c === '^' || c === 'R' || c === 'a' || c === 'b' || c === 'c' || c === 't') return 'ground';
  return 'wall';
}

function num(v, dflt) {
  return Number.isFinite(v) ? v : dflt;
}

function seedNum(seed) {
  const s = Math.floor(Math.abs(seed));
  return (Number.isFinite(s) && s !== 0) ? s : 1;
}

function pickShape(shapes, u) {
  if (shapes.length <= 1) return shapes[0];
  return shapes[Math.min(shapes.length - 1, Math.floor(u * shapes.length))];
}

// 弹孔描述：{x,y,shape,rot,size,alpha}（含确定性附字段 n/spread/tile）。
//  - shape ∈ {crack, spot, star}，随表面风格 + 位置哈希在样式权重表内挑选；
//  - rot 为旋转角（弧度，[0,2π)），size 为印记半径（px），alpha 为出生透明度；
//  - n 为裂纹射线 / 星形棘刺数，spread 为射线张角抖动量（打破完全对称）。
export function impactMark(x, y, tileType, seed) {
  const px = num(x, 0);
  const py = num(y, 0);
  const tile = normalizeImpactTile(tileType);
  const s = seedNum(seed);
  const base = TILE_BASE[tile];
  const u1 = hash01(s, px, py, 11);
  const u2 = hash01(s, px, py, 12);
  const u3 = hash01(s, px, py, 13);
  const u4 = hash01(s, px, py, 14);
  const u5 = hash01(s, px, py, 15);
  const shape = pickShape(base.shapes, u1);
  const rot = u2 * Math.PI * 2;
  const size = base.minSize + u3 * (base.maxSize - base.minSize);
  const alpha = 0.92 + u4 * 0.08;
  const n = base.minArms + Math.floor(u5 * (base.maxArms - base.minArms + 1));
  const spread = (hash01(s, px, py, 16) - 0.5) * 0.5;
  return { x: px, y: py, shape, rot, size, alpha, n, spread, tile };
}

// 透明度随弹孔年龄（秒）变化：出生即满，进入 FADE_START 后线性衰减至 0。
export function impactAlpha(age) {
  const a = num(age, NaN);
  if (!(a >= 0) || a >= IMPACT_LIFE) return 0;
  if (a <= IMPACT_FADE_START) return 1;
  return 1 - (a - IMPACT_FADE_START) / (IMPACT_LIFE - IMPACT_FADE_START);
}

// 命中点集合 -> 当前时刻仍存活的弹孔（含衰减后 alpha）：
// 每个 hit 可为 {x,y,tileType?,seed?,t0?}，t0 为撞击时刻（缺省 0，调用方记录 spawn 时间推进 t）；
// 输出弹孔按 (t0, id) 升序，纯函数无状态，同 (hits, t) 恒同输出。
export function impactMarksAt(hits, t) {
  if (!Array.isArray(hits) || hits.length === 0) return [];
  const ts = num(t, 0);
  const out = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!h) continue;
    const px = num(h.x, NaN);
    const py = num(h.y, NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    const t0 = num(h.t0, 0);
    const age = ts - t0;
    if (age < 0 || age >= IMPACT_LIFE) continue;
    const mark = impactMark(px, py, h.tileType, num(h.seed, i));
    out.push({
      id: i,
      x: mark.x,
      y: mark.y,
      shape: mark.shape,
      rot: mark.rot,
      size: mark.size,
      alpha: mark.alpha * impactAlpha(age),
      n: mark.n,
      spread: mark.spread,
      tile: mark.tile,
      t0,
      age
    });
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.id - b.id);
}

function rgba(col, a) {
  return 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + clamp(a, 0, 1) + ')';
}

// 绘制单个弹孔（纯绘制，可在已应用世界变换的 2D ctx 上调用，也可传 stub ctx 测试）。
// 按 shape 绘制：crack=中心黑点 + 放射裂纹；spot=黑点 + 外围浅环；star=放射棘刺。
export function drawImpact(ctx, mark) {
  if (!ctx || !mark) return;
  const alpha = clamp(num(mark.alpha, 1), 0, 1);
  if (!(alpha > 0)) return;
  const x = num(mark.x, NaN);
  const y = num(mark.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const size = Math.max(1, num(mark.size, 5));
  const rot = num(mark.rot, 0);
  const n = clamp(Math.floor(num(mark.n, 3)), 3, 8);
  const spread = num(mark.spread, 0);
  const col = TILE_COLOR[mark.tile] || TILE_COLOR.wall;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, size * 0.22);
  if (mark.shape === 'crack') {
    ctx.strokeStyle = rgba(col, alpha);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + spread;
      const r = size * (0.55 + 0.5 * hash01(x, y, i, 7));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * size * 0.12, Math.sin(a) * size * 0.12);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(col, alpha);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (mark.shape === 'star') {
    ctx.fillStyle = rgba(col, alpha);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + spread;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * size * 0.9, Math.sin(a) * size * 0.9);
      ctx.lineTo(Math.cos(a + 0.3) * size * 0.18, Math.sin(a + 0.3) * size * 0.18);
      ctx.lineTo(Math.cos(a - 0.3) * size * 0.18, Math.sin(a - 0.3) * size * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = rgba(col, alpha);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(col, alpha * 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
