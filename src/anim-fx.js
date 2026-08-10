// 2D 玩家/bot 移动动画平滑（backlog candidate-301，渲染表现模块）：
// 移动中角色脚下出现左右脚交替摆动的小足迹与轻量脚步尘埃粒子，站立时静止。
// 核心逻辑纯函数、确定性：脚步相位 / 尘埃粒子全部由累积移动距离 dist、时间 t、
// 固定 seed 的确定性哈希导出，不使用 Math.random —— 同输入同输出，可独立单测。

export const STEP_LEN = 34;        // 一个完整步态周期（左右脚各落地一次）覆盖的移动像素
export const DUST_LIFE_DIST = 22;  // 尘埃自落脚后按移动距离计的存活长度（px）
export const DUST_PER_STEP = 2;    // 每次落脚生成的最大尘埃粒子数
export const DUST_COLOR = '186,170,138';

// 确定性哈希：任意数量数值 → [0,1)，同输入恒同输出
export function hash01(...nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    const x = Math.floor(Math.abs(n)) >>> 0;
    h ^= x + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

// 脚步相位（纯计算）：
//   dist  累积移动距离(px)；调用方在实体站立时应传入 0（渲染层移动累计归零）
//   t     当前时间(秒)，保留给时间驱动装饰（stepDust 使用）
//   seed  实体固定种子，决定步态相位偏移，让不同角色脚步自然错开
// 返回 { phase, swinging }：
//   phase    ∈[0,1) 当前步态周期进度（累积距离确定），供左右脚交替摆动
//            （相位差 0.5 即另一只脚落地）
//   swinging ∈[0,1] 当前脚摆动幅度：0=双脚落地静止，1=跨步中段；站立(dist=0)时为 0
export function stepCycle(dist, t, seed) {
  const safe = Math.max(0, dist);
  const off = hash01(Math.floor(Math.abs(seed)) || 1, 97);
  const steps = safe / STEP_LEN + off;
  const phase = steps - Math.floor(steps);
  const swinging = safe > 0 ? Math.abs(Math.sin(phase * Math.PI * 2)) : 0;
  return { phase, swinging };
}

// 脚步尘埃（纯计算）：返回粒子数组 [{dx, dy, r, alpha, p}]。
//   dx 沿朝向左右偏移、dy 沿朝向反方向（运动后方）偏移，均为相对实体脚底的世界偏移(px)
//   p  ∈[0,1) 粒子寿命进度；r 半径；alpha 透明度
// 粒子在每次落脚（每半个步态周期）由 seed 确定性生成，按移动距离存活 DUST_LIFE_DIST。
// 站立(dist=0)或 count<=0 时返回空数组。
export function stepDust(dist, t, seed, count) {
  const out = [];
  const safe = Math.max(0, dist);
  const n = Math.floor(count) | 0;
  if (safe <= 0 || n <= 0) return out;
  const gap = STEP_LEN / 2;          // 相邻两次落脚（左→右）间隔的移动距离
  const ff = safe / gap;             // 已落脚步数
  const frac = ff - Math.floor(ff);  // 距最近一次落脚的距离比例 [0,1)
  const s = Math.floor(Math.abs(seed)) || 1;
  for (let i = 0; i < n; i++) {
    const age = (i + frac) * gap;    // 该粒子对应的落脚点已走过的距离
    if (age >= DUST_LIFE_DIST) continue;
    const p = age / DUST_LIFE_DIST;
    const u = hash01(s, i, 1);
    const v = hash01(s, i, 2);
    const w = hash01(s, i, 3);
    const side = (i % 2 === 0 ? -1 : 1) * (0.8 + u * 1.1);          // 左右脚落点交替横向偏移
    const back = 0.5 + v * 2.4 * p;                                 // 向后方漂移随寿命增大
    const tw = 0.8 + 0.2 * Math.sin(t * (4 + u * 3) + w * Math.PI * 2); // 时间微闪
    const r = (0.6 + w * 0.8) * (1 - p * 0.4);
    const alpha = Math.pow(1 - p, 1.3) * (0.14 + w * 0.12) * tw;
    out.push({ dx: side + Math.sin(frac * Math.PI) * 1.5, dy: back, r, alpha, p });
  }
  return out;
}

// 绘制脚步动画层（实体之下）：左右脚交替小足迹 + 轻量尘埃。
// fx = { phase, swinging, dust }，即 stepCycle 与 stepDust 的合并结果。
// 使用世界坐标（实体内嵌了 render 的世界变换），朝向由 e.angle 决定。
export function drawStepFx(ctx, e, fx) {
  if (!ctx || !e || !fx) return;
  const a = e.angle || 0;
  const c = Math.cos(a), s = Math.sin(a);
  const rx = -s, ry = c; // 朝向右侧单位向量
  ctx.save();
  ctx.lineCap = 'round';
  if (fx.swinging > 0) {
    const amp = 3.2 * Math.min(1, fx.swinging);
    const fwd = fx.phase * Math.PI * 2;
    for (let foot = 0; foot < 2; foot++) {
      const ph = fwd + (foot === 0 ? 0 : Math.PI);
      const along = Math.sin(ph) * amp;                  // 左右脚交替前/后摆动
      const side = foot === 0 ? 3.6 : -3.6;
      const planted = Math.max(0, foot === 0 ? Math.cos(ph) : -Math.cos(ph)); // 落地相重的脚
      ctx.globalAlpha = 0.2 + 0.16 * planted;
      ctx.beginPath();
      ctx.ellipse(e.x + rx * side + c * along, e.y + ry * side + s * along + 4, 3.4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (fx.dust && fx.dust.length) {
    ctx.fillStyle = 'rgb(' + DUST_COLOR + ')';
    for (const d of fx.dust) {
      ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha));
      ctx.beginPath();
      ctx.arc(e.x + rx * d.dx - c * d.dy, e.y + ry * d.dx - s * d.dy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
