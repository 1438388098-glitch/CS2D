// 2D 环境氛围粒子：轻量漂浮尘埃/灰尘。
// 纯装饰层，不影响碰撞 / LOS / 逻辑；极低绘制成本（视口网格内少量微尘）。
// 确定性：所有位置 / 相位 / 半径 / 透明度由固定 seed 的确定性哈希导出，
// 不依赖 Math.random —— 同 seed 同 t 画面完全可复现。

export const DUST_CELL = 256;
export const DUST_PER_CELL = 2;
export const DUST_COLOR = '210,214,220';

// 确定性哈希收敛到 utils.js（单一实现，避免多处副本漂移破坏确定性回放）；
// 此处保留 re-export 以兼容旧 import 路径（boom/impact/shadow/smoke/weapon-fx 均从本模块引入）。
import { hash01 } from './utils.js';
export { hash01 };

// 纯逻辑核心：返回 [{x,y,r,alpha}]，count 个漂浮微尘分布在 [0,w)×[0,h)。
// t 为秒（相位漂移），drift 幅度 < 12px 保证永远留在区域内。
export function ambientDust(seed, t, count, w, h) {
  const s = Math.floor(Math.abs(seed)) || 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const u = hash01(s, i, 1);
    const v = hash01(s, i, 2);
    const phase = hash01(s, i, 3) * Math.PI * 2;
    const speed = 0.15 + hash01(s, i, 4) * 0.35;
    const ampX = 10 * (0.4 + hash01(s, i, 5) * 0.6);
    const ampY = 10 * (0.4 + hash01(s, i, 6) * 0.6);
    const r = 0.5 + hash01(s, i, 7) * 2;
    const baseA = 0.06 + hash01(s, i, 8) * 0.16;
    const tw = 0.6 + 0.4 * Math.sin(t * (0.5 + hash01(s, i, 9) * 1.2) + phase);
    let x = (u * w + ampX * Math.sin(phase + t * speed)) % w;
    if (x < 0) x += w;
    let y = (v * h + ampY * Math.cos(phase + t * speed * 0.8)) % h;
    if (y < 0) y += h;
    out.push({ x, y, r, alpha: baseA * tw });
  }
  return out;
}

// 绘制入口：只生成并绘制相机视口内的微尘（视口网格 × 每格 2 粒），轻量且确定性。
// 已处于世界变换（ctx 平移/缩放到位），微尘坐标即世界坐标。
export function drawAmbientDust(ctx, game) {
  if (!ctx || !game) return;
  const z = game.zoom || 1;
  const cw = game.canvasW || (ctx.canvas ? ctx.canvas.width / (game.dpr || 1) : 1280);
  const ch = game.canvasH || (ctx.canvas ? ctx.canvas.height / (game.dpr || 1) : 720);
  const viewW = cw / z;
  const viewH = ch / z;
  const cx = game.camX || 0;
  const cy = game.camY || 0;
  const seed = Math.floor(Math.abs((game.opts && game.opts.seed != null ? game.opts.seed : game.seed) || 1)) || 1;
  const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
  const cell = DUST_CELL;
  const x0 = Math.floor((cx - viewW / 2) / cell);
  const y0 = Math.floor((cy - viewH / 2) / cell);
  const x1 = Math.floor((cx + viewW / 2) / cell);
  const y1 = Math.floor((cy + viewH / 2) / cell);
  ctx.save();
  ctx.fillStyle = 'rgb(' + DUST_COLOR + ')';
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const cellSeed = Math.floor(hash01(seed, gx, gy) * 4294967296);
      const offX = gx * cell;
      const offY = gy * cell;
      for (const p of ambientDust(cellSeed, t, DUST_PER_CELL, cell, cell)) {
        ctx.globalAlpha = p.alpha;
        const size = p.r * 2;
        ctx.fillRect(offX + p.x - p.r, offY + p.y - p.r, size, size);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
