// 2D 雨雪天气氛围特效（candidate-244，渲染表现模块）。
// 屏幕层飘落特效：雨天为斜落雨丝（短线），雪天为飘落雪粒（小圆点）。
// 与 ambient-fx（尘埃漂浮）不同，本模块按地图 id 决定天气类型（weatherKind），
// 全部粒子位置 / 长度 / 角度 / 速度 / 透明度由固定 seed 的确定性哈希导出，
// 不使用 Math.random —— 同 seed 同 t 画面完全可复现（回放 / 测试友好）。
// 轻量：粒子数封顶 MAX_PARTICLES（200），绘制为单段线段或圆形，不影响性能。
import { clamp, hash01 } from './utils.js';
export { hash01 };

export const MAX_PARTICLES = 200;
export const RAIN_COLOR = '168,190,240';
export const SNOW_COLOR = '245,248,255';

// 雪系 / 雨系地图关键词（weatherKind 简单规则，小写匹配）
const SNOW_IDS = ['arctic', 'snow', 'frost', 'glacier', 'winter', 'ice'];
const RAIN_IDS = ['rain', 'storm', 'monsoon', 'drizzle', 'typhoon'];

// 地图天气判定：按地图 id 简单规则 —— 名字含雪系关键词 → 'snow'，
// 含雨系关键词 → 'rain'，否则 null（无雨雪特效）。大小写不敏感。
export function weatherKind(mapId) {
  if (mapId == null) return null;
  const id = String(mapId).toLowerCase();
  if (SNOW_IDS.some((k) => id.includes(k))) return 'snow';
  if (RAIN_IDS.some((k) => id.includes(k))) return 'rain';
  return null;
}

// 静态参数表缓存：粒子的 (u,v,speed,len,angle,alpha,sway,freq,phase) 只依赖 (kind,seed,count,w,h)，
// 每帧只重算随时间变化的位置，省去 200 粒 × 多次哈希与查表
const paramCache = new Map();
const PARAM_CACHE_MAX = 8;
function paramTable(kind, s, n, width, height) {
  const key = kind + '|' + s + '|' + n + '|' + width + 'x' + height;
  let tbl = paramCache.get(key);
  if (tbl) return tbl;
  tbl = new Array(n);
  for (let i = 0; i < n; i++) {
    tbl[i] = kind === 'rain'
      ? {
          u: hash01(s, i, 1), v: hash01(s, i, 2),
          speed: 380 + hash01(s, i, 4) * 280,
          len: 8 + hash01(s, i, 5) * 12,
          angle: 0.14 + hash01(s, i, 7) * 0.34,
          alpha: 0.22 + hash01(s, i, 6) * 0.5
        }
      : {
          u: hash01(s, i, 1), v: hash01(s, i, 2),
          speed: 26 + hash01(s, i, 4) * 54,
          len: 1 + hash01(s, i, 5) * 2.4,
          alpha: 0.55 + hash01(s, i, 6) * 0.45,
          sway: 6 + hash01(s, i, 7) * 16,
          freq: 0.6 + hash01(s, i, 8) * 1.2,
          phase: hash01(s, i, 9) * Math.PI * 2
        };
  }
  if (paramCache.size >= PARAM_CACHE_MAX) paramCache.clear();
  paramCache.set(key, tbl);
  return tbl;
}

// 纯逻辑核心：返回 count 个雨/雪粒子 [{x,y,len,angle,speed,alpha}]。
// rain 为斜短线（len=线长，angle=相对垂直的倾角，speed 快，x 带风漂移），
// snow 为小圆点（len=半径，angle 恒 0，speed 慢，x 左右摇摆）。
// t 为秒：沿 y 匀速下落并用模运算回卷，保证循环且确定性，粒子永远在区域内。
export function weatherParticles(kind, t, count, w, h, seed) {
  if (kind !== 'rain' && kind !== 'snow') return [];
  const n = clamp(Math.floor(Number(count) || 0), 0, MAX_PARTICLES);
  const width = Number.isFinite(w) && w > 0 ? w : 640;
  const height = Number.isFinite(h) && h > 0 ? h : 480;
  const s = Math.floor(Math.abs(seed)) || 1;
  const now = Number.isFinite(t) ? t : 0;
  const tbl = paramTable(kind, s, n, width, height);
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = tbl[i];
    if (kind === 'rain') {
      const windX = q.speed * 0.14 * Math.sin(q.angle);
      let x = (q.u * width + now * windX) % width;
      if (x < 0) x += width;
      const y = (q.v * height + now * q.speed) % height;
      out.push({ x, y, len: q.len, angle: q.angle, speed: q.speed, alpha: q.alpha });
    } else {
      let x = (q.u * width + q.sway * Math.sin(now * q.freq + q.phase)) % width;
      if (x < 0) x += width;
      const y = (q.v * height + now * q.speed) % height;
      out.push({ x, y, len: q.len, angle: 0, speed: q.speed, alpha: q.alpha });
    }
  }
  return out;
}

// 绘制：rain 逐粒画短线（沿角度方向），snow 逐粒画小圆点。
// 纯绘制函数，可传 stub ctx 测试；非法输入静默跳过，收尾恢复 globalAlpha。
export function drawWeather(ctx, particles, kind) {
  if (!ctx || !Array.isArray(particles) || particles.length === 0) return;
  if (kind !== 'rain' && kind !== 'snow') return;
  const a01 = (p) => clamp(Number.isFinite(p.alpha) ? p.alpha : 0.5, 0, 1);
  ctx.save();
  if (kind === 'rain') {
    ctx.strokeStyle = 'rgba(' + RAIN_COLOR + ',1)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (const p of particles) {
      const x = Number.isFinite(p.x) ? p.x : 0;
      const y = Number.isFinite(p.y) ? p.y : 0;
      const len = Number.isFinite(p.len) && p.len > 0 ? p.len : 8;
      const ang = Number.isFinite(p.angle) ? p.angle : 0.2;
      ctx.globalAlpha = a01(p);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(ang) * len, y + Math.cos(ang) * len);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(' + SNOW_COLOR + ',1)';
    for (const p of particles) {
      const x = Number.isFinite(p.x) ? p.x : 0;
      const y = Number.isFinite(p.y) ? p.y : 0;
      const r = Number.isFinite(p.len) && p.len > 0 ? p.len : 1.5;
      ctx.globalAlpha = a01(p);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
