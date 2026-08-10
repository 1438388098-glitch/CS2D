// 2D 手雷飞行轨迹预览（candidate-307）：纯函数轨迹计算 + 虚线绘制。
// 轨迹与 src/grenades.js 实际投掷物理一致：初速沿投掷角方向、线速度按 1.6/s 线性衰减，
// 确定性（无 Math.random），纯预览装饰，不参与实际投掷判定。

// 时间步长（约 60Hz）与线速度阻尼系数，与 updateGrenades 中 `g.vx *= max(0, 1 - 1.6*dt)` 一致
export const NADE_DT = 1 / 60;
export const NADE_DAMP = 1.6;
// 初速与 throwGrenade 一致：HE/闪光 560，烟雾 480
export const NADE_SPEED = { he: 560, flash: 560, smoke: 480 };
// 出手点偏移，与 throwGrenade 的 `e.x + Math.cos(e.angle) * 20` 一致
export const NADE_ORIGIN_DIST = 20;

// 计算从 (x0,y0) 沿 ang 方向、初速 power 的轨迹点数组（含起点，共 steps+1 个点）。
// 每个点 = 上一位置沿当前速度前进 dt，随后速度按阻尼衰减，模拟实际抛体直线带减速。
export function nadeTrajectory(x0, y0, ang, power, steps = 40) {
  const pts = [];
  let x = x0, y = y0;
  let vx = Math.cos(ang) * power;
  let vy = Math.sin(ang) * power;
  const damp = Math.max(0, 1 - NADE_DAMP * NADE_DT);
  pts.push({ x, y });
  for (let i = 0; i < steps; i++) {
    x += vx * NADE_DT;
    y += vy * NADE_DT;
    vx *= damp;
    vy *= damp;
    pts.push({ x, y });
  }
  return pts;
}

// 虚线预览弧：起点/终点落在真实轨迹上，中段沿轨迹法向轻微上弯形成抛物线弧视觉。
// 需在已应用世界坐标变换的 2D ctx 上调用。
export function drawNadeTrajectory(ctx, pts) {
  if (!ctx || !pts || pts.length < 2) return;
  const n = pts.length;
  const last = pts[n - 1];
  const dx = last.x - pts[0].x;
  const dy = last.y - pts[0].y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = Math.min(80, len * 0.18);
  const pathPts = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const bend = Math.sin(Math.PI * t) * amp;
    pathPts.push({ x: pts[i].x + nx * bend, y: pts[i].y + ny * bend });
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,222,130,0.15)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(pathPts[0].x, pathPts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,222,130,0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pathPts[0].x, pathPts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,222,130,0.9)';
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
