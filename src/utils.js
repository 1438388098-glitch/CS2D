import { ctx } from './ctx.js';

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
// 确定性哈希（FNV-1a 混合）：输入若干整数种子 → [0,1) 可复现伪随机，供特效 spec 播种（无 Math.random）
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
// 世界随机：走 ctx.rand（对局 seed 后全游戏可复现）；无参调用等价 Math.random()（0..1）
export function rand(a = 0, b = 1) { return a + ctx.rand() * (b - a); }
export function angNorm(a) {
  a %= Math.PI * 2;
  if (a < 0) a += Math.PI * 2;
  return a;
}
export function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// FPS 视角：屏幕系输入向量(ax,ay)按朝向角旋转为世界系向量（W=沿朝向前进，D=右平移）
export function rotateInputVector(ax, ay, angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  return { x: -ax * sa - ay * ca, y: ax * ca - ay * sa };
}

// 玩家屏幕最远可视距离（半对角）：bot 感知不得超过此值，保证与玩家视野公平
export function viewCap(game) {
  const w = game.canvasW || 1280, h = game.canvasH || 720;
  return Math.hypot(w, h) / 2;
}
