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
// 雾/烟大团粒子更重：独立封顶避免整屏大圆填充拖垮软件 Canvas
export const MIST_MAX_PARTICLES = 60;
export const SMOKE_MAX_PARTICLES = 90;
export const SAND_COLOR = '200,175,125';
export const MIST_COLOR = '190,205,195';
export const SMOKE_WEATHER_COLOR = '125,115,100';

// 雪系 / 雨系地图关键词（weatherKind 简单规则，小写匹配）。
// 注意：官方图天气身份由 themeWeatherOf（THEMES 数据）驱动，此处关键词仅兜底自定义图 id；
// 因此关键词表不得包含 canal/blast 等官方图 id（fx-weather 测试钉住 canal -> null）。
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
    if (kind === 'rain') {
      tbl[i] = {
        u: hash01(s, i, 1), v: hash01(s, i, 2),
        speed: 380 + hash01(s, i, 4) * 280,
        len: 8 + hash01(s, i, 5) * 12,
        angle: 0.14 + hash01(s, i, 7) * 0.34,
        alpha: 0.22 + hash01(s, i, 6) * 0.5
      };
    } else if (kind === 'snow') {
      tbl[i] = {
        u: hash01(s, i, 1), v: hash01(s, i, 2),
        speed: 26 + hash01(s, i, 4) * 54,
        len: 1 + hash01(s, i, 5) * 2.4,
        alpha: 0.55 + hash01(s, i, 6) * 0.45,
        sway: 6 + hash01(s, i, 7) * 16,
        freq: 0.6 + hash01(s, i, 8) * 1.2,
        phase: hash01(s, i, 9) * Math.PI * 2
      };
    } else if (kind === 'mist' || kind === 'smoke') {
      // 大团缓慢漂移：风致横向漂 + 缓慢上浮 + 微摆；雾偏绿灰大而稀，烟偏暖灰小而密
      const big = kind === 'mist';
      tbl[i] = {
        u: hash01(s, i, 1), v: hash01(s, i, 2),
        speed: (big ? 4 : 8) + hash01(s, i, 4) * (big ? 10 : 12),
        rise: (big ? 2 : 4) + hash01(s, i, 10) * (big ? 4 : 6),
        len: big ? 24 + hash01(s, i, 5) * 36 : 10 + hash01(s, i, 5) * 16,
        alpha: (big ? 0.04 : 0.05) + hash01(s, i, 6) * (big ? 0.06 : 0.07),
        sway: 4 + hash01(s, i, 7) * 6,
        freq: 0.1 + hash01(s, i, 8) * 0.2,
        phase: hash01(s, i, 9) * Math.PI * 2
      };
    } else {
      // 沙霾：近水平快速风沙线（angle 相对垂直方向 ≈ 1.2~1.5 rad）
      tbl[i] = {
        u: hash01(s, i, 1), v: hash01(s, i, 2),
        speed: 90 + hash01(s, i, 4) * 130,
        len: 10 + hash01(s, i, 5) * 14,
        angle: 1.2 + hash01(s, i, 7) * 0.3,
        alpha: 0.1 + hash01(s, i, 6) * 0.18
      };
    }
  }
  if (paramCache.size >= PARAM_CACHE_MAX) paramCache.clear();
  paramCache.set(key, tbl);
  return tbl;
}

// 各 kind 粒子数封顶：雨雪/沙霾用全量，雾/烟大团独立降载
const KIND_CAPS = {
  rain: MAX_PARTICLES,
  snow: MAX_PARTICLES,
  sand: MAX_PARTICLES,
  mist: MIST_MAX_PARTICLES,
  smoke: SMOKE_MAX_PARTICLES
};

// 纯逻辑核心：返回 count 个天气粒子 [{x,y,len,angle,speed,alpha}]。
// rain 为斜短线（len=线长，angle=相对垂直的倾角，speed 快，x 带风漂移），
// snow 为小圆点（len=半径，angle 恒 0，speed 慢，x 左右摇摆），
// mist/smoke 为大团（len=半径，缓慢漂移上浮），sand 为近水平风沙线。
// t 为秒：沿运动方向匀速并用模运算回卷，保证循环且确定性，粒子永远在区域内。
export function weatherParticles(kind, t, count, w, h, seed) {
  const cap = KIND_CAPS[kind];
  if (!cap) return [];
  const n = clamp(Math.floor(Number(count) || 0), 0, cap);
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
    } else if (kind === 'snow') {
      let x = (q.u * width + q.sway * Math.sin(now * q.freq + q.phase)) % width;
      if (x < 0) x += width;
      const y = (q.v * height + now * q.speed) % height;
      out.push({ x, y, len: q.len, angle: 0, speed: q.speed, alpha: q.alpha });
    } else if (kind === 'mist' || kind === 'smoke') {
      let x = (q.u * width + now * q.speed + q.sway * Math.sin(now * q.freq + q.phase)) % width;
      if (x < 0) x += width;
      let y = (q.v * height - now * q.rise) % height;
      if (y < 0) y += height;
      out.push({ x, y, len: q.len, angle: 0, speed: q.speed, alpha: q.alpha });
    } else {
      let x = (q.u * width + now * q.speed * Math.sin(q.angle)) % width;
      if (x < 0) x += width;
      const y = (q.v * height + now * q.speed * Math.cos(q.angle)) % height;
      out.push({ x, y, len: q.len, angle: q.angle, speed: q.speed, alpha: q.alpha });
    }
  }
  return out;
}

// 绘制：rain/sand 逐粒画风线（沿角度方向），snow 逐粒画小圆点，mist/smoke 画双层软雾团。
// 纯绘制函数，可传 stub ctx 测试；非法输入静默跳过，收尾恢复 globalAlpha。
export function drawWeather(ctx, particles, kind) {
  if (!ctx || !Array.isArray(particles) || particles.length === 0) return;
  const isLine = kind === 'rain' || kind === 'sand';
  const isBlob = kind === 'mist' || kind === 'smoke';
  if (!isLine && kind !== 'snow' && !isBlob) return;
  const a01 = (p) => clamp(Number.isFinite(p.alpha) ? p.alpha : 0.5, 0, 1);
  ctx.save();
  if (isLine) {
    ctx.strokeStyle = 'rgba(' + (kind === 'rain' ? RAIN_COLOR : SAND_COLOR) + ',1)';
    ctx.lineWidth = kind === 'rain' ? 1.2 : 1.6;
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
  } else if (isBlob) {
    ctx.fillStyle = 'rgba(' + (kind === 'mist' ? MIST_COLOR : SMOKE_WEATHER_COLOR) + ',1)';
    for (const p of particles) {
      const x = Number.isFinite(p.x) ? p.x : 0;
      const y = Number.isFinite(p.y) ? p.y : 0;
      const r = Number.isFinite(p.len) && p.len > 0 ? p.len : 24;
      const a = a01(p);
      // 双层软团：外圈低 alpha + 内圈 1.3 倍，免建渐变也有柔和层次
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, a * 1.3);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
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
