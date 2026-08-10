import { clamp } from './utils.js';

// 2D 击杀回放特效（candidate-310，渲染表现模块）。
// 玩家完成击杀（尤其爆头/多杀）时，屏幕中央显示击杀标签（KILL / 爆头! / DOUBLE KILL 等），
// 带缩放放大淡入、停留、淡出三段式动画。核心为确定性纯函数：
// 仅依赖 kind / streak / 传入时间 t（秒），不使用 Math.random 与 Date/performance，
// 同输入序列必然产生同输出，保证固定 seed 重放画面可复现。

export const KILL_LABEL_FADE_IN = 0.15; // 秒：缩放放大 + 淡入
export const KILL_LABEL_HOLD_AT = 0.8;  // 秒：完整显示停留起点
export const KILL_LABEL_DUR = 1.2;      // 秒：总时长（含淡出）
export const KILL_BURST_DUR = 0.35;     // 秒：标签背后的爆发纹持续时间

const KILL_LABEL_SCALE_MIN = 0.6;           // 淡入起始缩放
const KILL_LABEL_FADE_OUT_SCALE = 0.88;     // 淡出结束缩放
const KILL_LABEL_X = 0.5;  // 标签中心 x（相对画布宽比例）
const KILL_LABEL_Y = 0.35; // 标签中心 y（相对画布高比例）

const KILL_COLORS = {
  normal: '#eaf1f8',
  headshot: '#ffd34d',
  multikill: '#ff7a3c'
};
const KILL_SIZES = {
  normal: 44,
  headshot: 40,
  multikill: 48
};

// 多杀文案：与 ui.js STREAK_TEXTS 一致（2 双杀 / 3 三杀 / 4 四杀 / 5+ RAMPAGE）
const MULTIKILL_TEXTS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL' };
const MULTIKILL_RAMPAGE = 'RAMPAGE';

const BURST_BASE = {
  normal: { rays: 8, radius: 42 },
  headshot: { rays: 12, radius: 54 },
  multikill: { rays: 16, radius: 66 }
};

// 击杀爆发纹：标签出现时背后的放射线/光晕参数。
// t 为标签已流逝秒数，seed 只影响旋转起始角，画面仍完全确定。
export function killBurst(kind, t, seed) {
  const k = kind === 'headshot' ? 'headshot' : (kind === 'multikill' ? 'multikill' : 'normal');
  if (!Number.isFinite(t)) return null;
  if (t < 0 || t >= KILL_BURST_DUR) return null;
  const u = t / KILL_BURST_DUR;
  const base = BURST_BASE[k];
  const alpha = Math.pow(1 - u, 1.35);
  return {
    alpha,
    rays: base.rays,
    radius: base.radius + u * 84,
    rot: ((Math.floor(Math.abs(seed)) || 7) * 0.017) % (Math.PI * 2)
  };
}

// 击杀标签文案：normal → 'KILL'；headshot → '爆头!'；
// multikill 按连续击杀数 streak（≥5 显示 RAMPAGE，<2 视为双杀）。
export function killLabelText(kind, streak) {
  if (kind === 'headshot') return '爆头!';
  if (kind === 'multikill') {
    const n = Number.isFinite(streak) ? Math.max(2, Math.floor(streak)) : 2;
    return n >= 5 ? MULTIKILL_RAMPAGE : (MULTIKILL_TEXTS[n] || 'DOUBLE KILL');
  }
  return 'KILL';
}

// 三段式动画包络：返回 { scale, alpha }。
// t ≤ 0 → 起手（alpha 0 / scale 最小）；[0,0.15) 放大淡入；
// [0.15,0.8) 停留（scale/alpha 恒为 1）；[0.8,1.2) 淡出缩小；
// t ≥ 1.2 → 结束（alpha 0）。非有限 t 由调用方回退为 0。
function labelEnvelope(t) {
  if (t < KILL_LABEL_FADE_IN) {
    if (t <= 0) return { scale: KILL_LABEL_SCALE_MIN, alpha: 0 };
    const u = t / KILL_LABEL_FADE_IN;
    const ease = 1 - Math.pow(1 - u, 3); // easeOutCubic：先快后慢放大
    return { scale: KILL_LABEL_SCALE_MIN + (1 - KILL_LABEL_SCALE_MIN) * ease, alpha: u };
  }
  if (t < KILL_LABEL_HOLD_AT) return { scale: 1, alpha: 1 };
  if (t < KILL_LABEL_DUR) {
    const u = (t - KILL_LABEL_HOLD_AT) / (KILL_LABEL_DUR - KILL_LABEL_HOLD_AT);
    return { scale: 1 - (1 - KILL_LABEL_FADE_OUT_SCALE) * u, alpha: 1 - u };
  }
  return { scale: KILL_LABEL_FADE_OUT_SCALE, alpha: 0 };
}

// 击杀标签参数：返回 { text, color, scale, alpha, x, y, size }。
// text/color/size 按 kind 取；scale/alpha 由 t 驱动三段式动画；
// x/y 为标签中心（相对画布宽高比例，默认居中偏上），由绘制函数换算成像素。
export function killLabel(kind, streak, t) {
  const k = kind === 'headshot' ? 'headshot' : (kind === 'multikill' ? 'multikill' : 'normal');
  const tt = Number.isFinite(t) ? Math.max(0, t) : 0;
  const env = labelEnvelope(tt);
  return {
    kind: k,
    text: killLabelText(k, streak),
    color: KILL_COLORS[k],
    scale: env.scale,
    alpha: env.alpha,
    x: KILL_LABEL_X,
    y: KILL_LABEL_Y,
    size: KILL_SIZES[k],
    burst: killBurst(k, tt, Math.floor(tt * 1000) || 7)
  };
}

// 绘制：以 fx.x/fx.y（画布比例）为中心居中放大文字，黑色描边 + kind 填充色。
// 含中文（如 爆头!）时回退到中文字体族，其余用 Segoe UI。
export function drawKillLabel(ctx, fx) {
  if (!ctx || !fx || !(fx.alpha > 0)) return;
  const w = ctx.canvas ? ctx.canvas.width : 0;
  const h = ctx.canvas ? ctx.canvas.height : 0;
  if (!(w > 0) || !(h > 0)) return;
  const cx = (typeof fx.x === 'number' ? fx.x : KILL_LABEL_X) * w;
  const cy = (typeof fx.y === 'number' ? fx.y : KILL_LABEL_Y) * h;
  const scale = typeof fx.scale === 'number' && fx.scale > 0 ? fx.scale : 1;
  const size = typeof fx.size === 'number' && fx.size > 0 ? fx.size : KILL_SIZES.normal;
  const cjk = /[\u4e00-\u9fff]/.test(String(fx.text));
  ctx.save();
  ctx.globalAlpha = clamp(fx.alpha, 0, 1);
  const burst = fx.burst;
  if (burst && burst.alpha > 0 && burst.rays > 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(burst.rot || 0);
    ctx.globalAlpha = clamp(burst.alpha * fx.alpha * 0.7, 0, 1);
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < burst.rays; i++) {
      const a = i / burst.rays * Math.PI * 2;
      const r0 = burst.radius * 0.18;
      const r1 = burst.radius * (i % 2 === 0 ? 1 : 0.62);
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.globalAlpha = clamp(burst.alpha * fx.alpha * 0.16, 0, 1);
    ctx.fillStyle = fx.color;
    ctx.beginPath();
    ctx.arc(0, 0, burst.radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 ' + Math.round(size * scale) + "px '" + (cjk ? 'Microsoft YaHei' : 'Segoe UI') + "',sans-serif";
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeText(fx.text, cx, cy);
  ctx.fillStyle = fx.color;
  ctx.fillText(fx.text, cx, cy);
  ctx.restore();
}
