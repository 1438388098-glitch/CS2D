import { clamp } from './utils.js';

// follow 相机平滑跟随（candidate-166，界面交互模块）。
// 目标：跟随视角在目标靠近时（如残局 bot 靠近玩家）平滑减速避免视角跳变；
// 切换跟随目标时平滑过渡。核心为确定性纯函数 smoothFollow：
// 仅依赖传入位置 / 距离 / dt / opts，不使用 Math.random 与 Date/performance，
// 同输入必然产生同输出；距离远时快速跟随（高 lerp 速率），
// 距离近时减速防抖（低 lerp 速率），并可选限制单帧位移实现切换平滑。

export const FOLLOW_MAX_RATE = 18;   // 远距离跟随速率（指数趋近 /s）
export const FOLLOW_MIN_RATE = 5;    // 近距离减速速率
export const FOLLOW_NEAR_DIST = 90;  // 该距离内进入减速区
export const FOLLOW_FAR_DIST = 480;  // 该距离外视为远距离全速跟随
export const FOLLOW_SNAP_DIST = 1.5; // 低于该距离直接贴合目标，避免亚像素抖动
export const FOLLOW_MAX_STEP = 1800; // 单帧最大位移（px/s），切换目标时平滑过渡

// 平滑跟随：返回 {x, y}，相机从 (curX,curY) 向 (targetX,targetY) 指数趋近。
// dist 为当前相机到目标的距离（可选，缺省用位置反算）。
// 速率随距离插值：dist ≤ nearDist 用 minRate，≥ farDist 用 maxRate。
// maxStep>0 时限制单帧位移 ≤ maxStep*dt，使远距离切换目标表现为平滑滑行而非瞬移。
export function smoothFollow(curX, curY, targetX, targetY, dist, dt, opts = {}) {
  const maxRate = Number.isFinite(opts.maxRate) ? opts.maxRate : FOLLOW_MAX_RATE;
  const minRate = Number.isFinite(opts.minRate) ? opts.minRate : FOLLOW_MIN_RATE;
  const nearDist = Number.isFinite(opts.nearDist) ? opts.nearDist : FOLLOW_NEAR_DIST;
  const farDist = Number.isFinite(opts.farDist) ? opts.farDist : FOLLOW_FAR_DIST;
  const snapDist = Number.isFinite(opts.snapDist) ? opts.snapDist : FOLLOW_SNAP_DIST;
  const maxStep = Number.isFinite(opts.maxStep) ? opts.maxStep : FOLLOW_MAX_STEP;
  const dx = targetX - curX;
  const dy = targetY - curY;
  const d = Math.hypot(dx, dy);
  const dd = Number.isFinite(dist) && dist >= 0 ? dist : d;
  if (dd <= snapDist) return { x: targetX, y: targetY };
  const t = clamp((dd - nearDist) / (farDist - nearDist), 0, 1);
  const rate = minRate + (maxRate - minRate) * t;
  let k = Math.min(1, Math.max(0, rate * dt));
  if (d > 0 && maxStep > 0) {
    const maxMove = maxStep * Math.max(0, dt);
    const move = d * k;
    if (move > maxMove) k = maxMove / d;
  }
  return { x: curX + dx * k, y: curY + dy * k };
}
