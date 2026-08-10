// 2D 脚步脚印（backlog candidate-242，渲染表现模块）：
// 玩家/bot 移动时脚下留下短暂脚印痕迹（浅色小脚印，随移动距离/时间淡出），
// 让移动轨迹在短时间内可见。核心逻辑纯函数、确定性：脚印位置/朝向由
// 累积移动距离与固定 seed 的确定性哈希导出，不使用 Math.random。

export const FOOTPRINT_GAP = 30;         // 相邻脚印的移动间距（px）
export const FOOTPRINT_LIFE = 260;       // 脚印按移动距离计的存活长度（px）
export const FOOTPRINT_TIME_LIFE = 6;    // 脚印按时间计的最大存活（秒），两者取小
export const FOOTPRINT_COLOR = '146,138,120';

// 确定性哈希：任意数量数值 → [0,1)，同输入恒同输出（与 anim-fx 同套路）
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

// 沿路径生成脚印序列（纯计算）：
//   path 世界坐标点数组 [{x,y}]（移动轨迹采样）
//   t    当前时间(秒)
//   seed 角色固定种子
// 返回脚印数组 [{x, y, ang, alpha, age}]：
//   x/y   脚印世界坐标（沿路径按 FOOTPRINT_GAP 取点，左右脚交替横向错开）
//   ang   脚印朝向（取路径方向角，确定性加抖动）
//   age   ∈[0,1) 脚印寿命进度（0=刚留下，越接近 1 越旧）
//   alpha 当前透明度（越旧越淡）
// 站立路径（长度不足一个脚印间距）时返回空数组。
export function footprintsForPath(path, t, seed) {
  const out = [];
  if (!path || path.length < 2) return out;
  const s = Math.floor(Math.abs(seed)) || 1;
  let prevX = path[0].x, prevY = path[0].y;
  let dist = 0;
  let mark = 0;
  const total = path.length - 1;
  for (let i = 1; i <= total; i++) {
    const px = path[i].x, py = path[i].y;
    const seg = Math.hypot(px - prevX, py - prevY);
    if (seg <= 0) { prevX = px; prevY = py; continue; }
    const nx = (px - prevX) / seg, ny = (py - prevY) / seg;
    dist += seg;
    while (dist - mark >= FOOTPRINT_GAP) {
      mark += FOOTPRINT_GAP;
      const along = mark;
      // 在该段内按 mark 距离内插出脚印位置
      let fx = prevX + nx * (seg - (dist - mark)) ;
      let fy = prevY + ny * (seg - (dist - mark));
      // 距离差保护：直接用 mark 时刻的坐标更稳
      fx = prevX + nx * (along - (dist - seg));
      fy = prevY + ny * (along - (dist - seg));
      const ang = Math.atan2(ny, nx);
      const jitter = (hash01(s, mark, 5) - 0.5) * 0.18;
      const side = (Math.floor(mark / FOOTPRINT_GAP) % 2 === 0 ? -1 : 1);
      const ox = -ny * side * 2.2, oy = nx * side * 2.2;
      const fp = {
        x: fx + ox + (hash01(s, mark, 6) - 0.5) * 2,
        y: fy + oy + (hash01(s, mark, 7) - 0.5) * 2,
        ang: ang + jitter,
        age: 0,
        alpha: 1
      };
      out.push(fp);
    }
    prevX = px; prevY = py;
  }
  // 按移动距离与时间同时老化
  for (const fp of out) {
    const ageByTime = t / FOOTPRINT_TIME_LIFE;
    const lifeFrac = Math.min(1, Math.max(0, ageByTime));
    fp.age = lifeFrac;
    fp.alpha = Math.pow(1 - lifeFrac, 1.4) * (0.3 + hash01(s, Math.floor(fp.x), Math.floor(fp.y)) * 0.12);
  }
  return out;
}

// 绘制单个脚印（简化的鞋印：两段错位椭圆）。
export function drawFootprint(ctx, fp) {
  if (!ctx || !fp || fp.alpha <= 0.004) return;
  ctx.save();
  ctx.translate(fp.x, fp.y);
  ctx.rotate(fp.ang || 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, fp.alpha));
  ctx.fillStyle = 'rgb(' + FOOTPRINT_COLOR + ')';
  // 前掌
  ctx.beginPath();
  ctx.ellipse(1.6, 0, 2.6, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // 脚跟（略窄，向后错开）
  ctx.beginPath();
  ctx.ellipse(-1.8, 0.3, 1.9, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
