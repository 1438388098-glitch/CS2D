// 2D 环境光照与阴影增强（candidate-309，渲染表现模块）。
// 场景增加轻量光照感：墙体/木箱/油桶/车辆等掩体朝光源相反方向投射柔和的
// 半透明投影条，营造 2D 立体感。独立纯逻辑模块，不触碰 render.js / textures.js。
// 核心全部为确定性纯函数：不使用 Math.random，仅由 (tileX, tileY, tileType,
// lightDirRad) 决定 —— 同输入必然同输出，可稳定重放。
// 性能可控：visibleShadows 只扫描视口(+阴影外扩边距)范围内的瓦片，绝不循环全图。

import { hash01 } from './ambient-fx.js';

// 默认瓦片尺寸（像素），与 config.TILE=40 一致；调用方可用 grid.tile / 描述符 tile 覆盖
export const DEFAULT_TILE = 40;

// 瓦片字符 -> 阴影类别映射
export const WALL_CHARS = new Set(['#', '=']); // 实墙 / 薄木墙
export const CRATE_CHARS = new Set(['C', 'D', 'o']); // 矮掩体 / 可炸木箱 / 油桶
export const VEHICLE_CHARS = new Set(); // 车辆预留（当前贴图集无车辆瓦片）

// 各类别基础阴影参数（长度/宽度为瓦片单位；alpha 为透明度 0..1）
const CATEGORY = {
  wall: { alpha: 0.34, w: 0.92, len: 1.15 },
  crate: { alpha: 0.26, w: 0.86, len: 0.8 },
  vehicle: { alpha: 0.2, w: 1.05, len: 1.4 },
  ground: { alpha: 0, w: 0, len: 0 }
};

// 最远投影长度上界（含逐瓦片抖动）：视口外扩边距 = ceil(MAX_SHADOW_LEN + 0.5)
export const MAX_SHADOW_LEN = 1.6;

const MARGIN_TILES = Math.ceil(MAX_SHADOW_LEN + 0.5); // 3

// 软影烘焙参数：先画核心影，再画两层更宽更长的羽化影，最后由
// softenShadowLayer 对整层做一次低强度模糊，抹掉瓦片接缝和投影末端硬边。
// 这些值只在 shadowLayer 重建时使用，不会进入每帧渲染。
export const SOFT_SHADOW_BLUR_RADIUS = 3;
const SOFT_PASSES = [
  { alpha: 1.0, w: 0.62, len: 0.78, fade: 0.58 },
  { alpha: 0.42, w: 0.98, len: 0.94, fade: 0.78 },
  { alpha: 0.18, w: 1.34, len: 1.12, fade: 0.88 }
];

// 瓦片字符 -> 阴影类别（未知字符一律视为普通地面，不投影）。
// 同时接受显式类别名（'wall'/'crate'/'vehicle'/'ground'），供车辆等
// 尚无地图字符的类别直接调用；VEHICLE_CHARS 为将来地图字符的扩展点。
export function categoryFor(ch) {
  if (ch === 'wall' || ch === 'crate' || ch === 'vehicle' || ch === 'ground') return ch;
  if (WALL_CHARS.has(ch)) return 'wall';
  if (CRATE_CHARS.has(ch)) return 'crate';
  if (VEHICLE_CHARS.has(ch)) return 'vehicle';
  return 'ground';
}

// 单个瓦片阴影参数：返回 { dx, dy, alpha, w, len }。
// dx/dy 为投影方向单位向量（朝光源相反方向，即光自 lightDirRad 来、影向 -lightDirRad 去）；
// alpha 透明度，w 投影带宽度（瓦片单位），len 投影长度（瓦片单位）。
// 普通地面返回全零（不投影）；alpha/len 带逐瓦片确定性抖动（±8%），同格恒复现。
export function shadowFor(tileX, tileY, tileType, lightDirRad) {
  const gx = Math.floor(Number.isFinite(tileX) ? tileX : 0);
  const gy = Math.floor(Number.isFinite(tileY) ? tileY : 0);
  const base = CATEGORY[categoryFor(tileType)];
  if (!base || base.len <= 0) return { dx: 0, dy: 0, alpha: 0, w: 0, len: 0 };
  const ang = (Number.isFinite(lightDirRad) ? lightDirRad : 0) + Math.PI;
  const jA = 0.92 + hash01(gx, gy) * 0.16;
  const jL = 0.92 + hash01(gx, gy, 2) * 0.16;
  return {
    dx: Math.cos(ang),
    dy: Math.sin(ang),
    alpha: +(base.alpha * jA).toFixed(4),
    w: base.w,
    len: +(base.len * jL).toFixed(3)
  };
}

// 瓦片包围盒是否落入「视口 + 阴影外扩边距」内
function inShadowBounds(tx, ty, T, vx, vy, vw, vh) {
  const m = MARGIN_TILES * T;
  const px = tx * T, py = ty * T;
  return px < vx + vw + m && px + T > vx - m && py < vy + vh + m && py + T > vy - m;
}

function pushShadow(out, tx, ty, T, ch, lightDirRad) {
  const s = shadowFor(tx, ty, ch, lightDirRad);
  if (!(s.len > 0) || !(s.alpha > 0)) return;
  out.push({ tx, ty, tile: T, ch: ch == null ? '' : ch, dx: s.dx, dy: s.dy, alpha: s.alpha, w: s.w, len: s.len });
}

// 过滤可视范围内的掩体瓦片并返回投影阴影数组（避免全图循环）。
// tiles 支持两种形态：
//   1) { grid: string[], tile? }     地图网格对象，只扫描视口(+边距)行/列
//   2) [{ tx, ty, ch, tile? }, ...]  显式瓦片描述符数组（逐格过滤）
// viewport 为世界像素视口 { x, y, w, h }（x,y 为视口左上角）。
// 普通地面瓦片不出现在结果中；返回元素含像素坐标所需信息，可直接交给 drawShadows。
export function visibleShadows(tiles, viewport, lightDirRad) {
  if (!tiles) return [];
  const ok = viewport && Number.isFinite(viewport.w) && Number.isFinite(viewport.h) && viewport.w > 0 && viewport.h > 0;
  const vx = ok && Number.isFinite(viewport.x) ? viewport.x : -Infinity;
  const vy = ok && Number.isFinite(viewport.y) ? viewport.y : -Infinity;
  const vw = ok ? viewport.w : Infinity;
  const vh = ok ? viewport.h : Infinity;
  const out = [];
  if (Array.isArray(tiles)) {
    for (const el of tiles) {
      if (!el || !Number.isFinite(el.tx) || !Number.isFinite(el.ty)) continue;
      const T = el.tile > 0 ? el.tile : DEFAULT_TILE;
      if (!inShadowBounds(el.tx, el.ty, T, vx, vy, vw, vh)) continue;
      pushShadow(out, el.tx, el.ty, T, el.ch != null ? el.ch : el.type, lightDirRad);
    }
  } else if (tiles.grid && tiles.grid.length) {
    const grid = tiles.grid;
    const T = tiles.tile > 0 ? tiles.tile : DEFAULT_TILE;
    const mx = MARGIN_TILES;
    const x0 = Math.max(0, Math.floor(vx / T) - mx);
    const y0 = Math.max(0, Math.floor(vy / T) - mx);
    const x1 = Math.min(grid[0].length - 1, Math.ceil((vx + vw) / T) + mx);
    const y1 = Math.min(grid.length - 1, Math.ceil((vy + vh) / T) + mx);
    for (let ty = y0; ty <= y1; ty++) {
      const row = grid[ty];
      if (!row) continue;
      for (let tx = x0; tx <= x1; tx++) {
        pushShadow(out, tx, ty, T, row[tx], lightDirRad);
      }
    }
  }
  return out;
}

// 绘制单层投影条：自掩体背面沿投影方向渐隐的半透明四边形。
// 优先使用沿投影方向的线性渐变（根部实、末端透明）；ctx 无 createLinearGradient
// 时回退为等透明度四边形。
function drawShadowPass(ctx, s, alphaScale, wScale, lenScale, fadeStop) {
  const T = s.tile > 0 ? s.tile : DEFAULT_TILE;
  const cx = Math.floor(s.tx) * T + T / 2;
  const cy = Math.floor(s.ty) * T + T / 2;
  const dx = s.dx, dy = s.dy;
  const px = -dy, py = dx; // 投影方向垂直单位向量
  const ox = cx + dx * T * 0.5, oy = cy + dy * T * 0.5; // 掩体背面边缘（根部）
  const tx = ox + dx * s.len * lenScale * T, ty = oy + dy * s.len * lenScale * T; // 投影末端
  const hw = s.w * wScale * T * 0.5;
  const alpha = Math.max(0, Math.min(1, s.alpha * alphaScale));
  ctx.beginPath();
  ctx.moveTo(ox + px * hw, oy + py * hw);
  ctx.lineTo(ox - px * hw, oy - py * hw);
  ctx.lineTo(tx - px * hw, ty - py * hw);
  ctx.lineTo(tx + px * hw, ty + py * hw);
  ctx.closePath();
  if (typeof ctx.createLinearGradient === 'function') {
    const g = ctx.createLinearGradient(ox, oy, tx, ty);
    g.addColorStop(0, 'rgba(8,10,14,' + alpha.toFixed(3) + ')');
    g.addColorStop(fadeStop, 'rgba(8,10,14,' + (alpha * 0.35).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(8,10,14,0)');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = 'rgba(8,10,14,' + alpha.toFixed(3) + ')';
  }
  ctx.fill();
}

// 绘制投影条：每块掩体由核心影 + 两层羽化影叠加，形成比单四边形更柔的轮廓。
// alpha/len 非正或 ctx 缺失时为空操作。
export function drawShadows(ctx, shadows) {
  if (!ctx || !shadows || !shadows.length) return;
  let has = false;
  for (const s of shadows) {
    if (s && s.alpha > 0 && s.len > 0) { has = true; break; }
  }
  if (!has) return;
  ctx.save();
  for (const s of shadows) {
    if (!s || !(s.alpha > 0) || !(s.len > 0) || !Number.isFinite(s.len) || !Number.isFinite(s.alpha)) continue;
    for (const pass of SOFT_PASSES) {
      drawShadowPass(ctx, s, pass.alpha, pass.w, pass.len, pass.fade);
    }
  }
  ctx.restore();
}

// 对整张阴影层做一次低强度模糊，抹掉投影边缘和相邻瓦片间的硬接缝。
// 不支持 Canvas filter 的环境原样复制，仍保留多层羽化效果。
export function softenShadowLayer(src, radius = SOFT_SHADOW_BLUR_RADIUS) {
  if (!src || !src.width || !src.height || typeof document === 'undefined') return src;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const octx = out.getContext('2d');
  if (!octx) return src;
  if (typeof octx.filter === 'string') {
    octx.filter = 'blur(' + radius + 'px)';
    octx.drawImage(src, 0, 0);
    octx.filter = 'none';
  } else {
    octx.drawImage(src, 0, 0);
  }
  return out;
}
