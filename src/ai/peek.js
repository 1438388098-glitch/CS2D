// AI 掩体后对枪（candidate-221）：掩体 peek 相位规划（纯函数、确定性、可单测）
//
// 问题：AI 在掩体后与敌人对枪时行为简单（站桩对射 / 不会利用掩体 peek）。
// 方案：纯函数按"掩体存在 + 敌人位置 + 当前时刻"给出 peek 相位
//   { action: 'hold'|'peek'|'recover', dir, duration, anchorX, anchorY, peekX, peekY }
//   hold    隐蔽不动（缩在掩体后，不暴露不开火）
//   peek    短暂探出掩体（移向探出点 + 开火，combat.js 按 peekSkill 减免散布）
//   recover 缩回掩体锚点
//   三相位周期性重复 → 减少持续暴露时间，拟合人类"探头打→缩回"节奏。
//
// 几何模型：
//   coverBehind 在 bot 背对敌人的扇区内寻找"隐蔽锚点"（敌人看不见的可走格），
//   再在该点四周找"探出点"（能从掩体后看到敌人的可走格）。上层把 bot 在
//   锚点↔探出点之间往复移动，即完成 peek。纯网格视线 gridLos 与 map.js los 同语义。
//
// 设计约束：
//   - 核心逻辑纯函数：不读游戏全局状态，只读入参 map（含 grid/tile）与 e/enemy 坐标。
//   - 确定性：同输入（坐标/时刻/身份字段）恒同输出，与对局 seed 无关。
//   - 复用 map.js 的 walkableChar 纯判定，视线阻挡语义与 map.js losBlocked 一致。
//   - 可读 aiParams.peekSkill/peekChance（不写不改 ai-genome 网络权重）。
import { walkableChar } from '../map.js';
import { clamp } from '../utils.js';

const PEEK_STEP_MIN = 18;
const PEEK_STEP_MAX = 72;
const PEEK_STEP_INC = 9;

// 像素坐标 → grid 字符；越界/无地图视为实墙 '#'
export function gridCharAt(map, x, y) {
  if (!map || !map.grid || !map.grid.length) return '#';
  const T = map.tile || 40;
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || ty >= map.grid.length || tx >= map.grid[0].length) return '#';
  return map.grid[ty][tx];
}

function inGrid(map, tx, ty) {
  return !!map && !!map.grid && ty >= 0 && tx >= 0 && ty < map.grid.length && tx < map.grid[0].length;
}

// 与 map.js passableTolerant 一致的"擦角可过"判定（纯网格版，无全局 MAP 依赖）：
// 采样点落在墙格边缘 12% 内、且相邻瓦片可通行时，视为可擦角通过
export function passableAt(map, x, y) {
  if (!map || !map.grid || !map.grid.length) return false;
  const T = map.tile || 40;
  const fx = Math.floor(x / T), fy = Math.floor(y / T);
  if (!inGrid(map, fx, fy)) return false;
  if (walkableChar(map.grid[fy][fx])) return true;
  const ox = (x - fx * T) / T, oy = (y - fy * T) / T;
  const TOL = 0.12;
  if (ox < TOL && inGrid(map, fx - 1, fy) && walkableChar(map.grid[fy][fx - 1])) return true;
  if (ox > 1 - TOL && inGrid(map, fx + 1, fy) && walkableChar(map.grid[fy][fx + 1])) return true;
  if (oy < TOL && inGrid(map, fx, fy - 1) && walkableChar(map.grid[fy - 1][fx])) return true;
  if (oy > 1 - TOL && inGrid(map, fx, fy + 1) && walkableChar(map.grid[fy + 1][fx])) return true;
  return false;
}

// 与 map.js losBlocked 一致的视线阻挡语义（含擦角容差）：
// 不可走格阻挡视线；薄墙 '=' 可看穿；低掩体 'C' 仅阻挡非高处（optH!==1）观察者
export function blocksView(map, x, y, optH = 0) {
  if (passableAt(map, x, y)) return false;
  const c = gridCharAt(map, x, y);
  if (c === '=') return false;
  if (c === 'C' && optH === 1) return false;
  return true;
}

export function walkableAt(map, x, y) {
  return walkableChar(gridCharAt(map, x, y));
}

// 纯网格视线（无烟雾/无全局状态）：true = 通视，false = 被墙阻挡
export function gridLos(map, ax, ay, bx, by, optH = 0) {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1) return true;
  const steps = Math.ceil(d / 6);
  for (let i = 0; i <= steps; i++) {
    const x = ax + (bx - ax) * i / steps;
    const y = ay + (by - ay) * i / steps;
    if (blocksView(map, x, y, optH)) return false;
  }
  return true;
}

// 在锚点四周找"探出点"：可走格 + 能看到敌人，且离锚点尽量近（步进扫描两侧）。
// 返回 { peekX, peekY, dir }；找不到返回 null。
function findPeekPoint(map, e, enemy, ax, ay, h) {
  const toEn = Math.atan2(enemy.y - ay, enemy.x - ax);
  for (const side of [1, -1]) {
    for (let step = PEEK_STEP_MIN; step <= PEEK_STEP_MAX; step += PEEK_STEP_INC) {
      const x = ax + Math.cos(toEn + Math.PI / 2 * side) * step;
      const y = ay + Math.sin(toEn + Math.PI / 2 * side) * step;
      if (!walkableAt(map, x, y)) break; // 撞墙则此侧加大步长无意义
      if (gridLos(map, x, y, enemy.x, enemy.y, h)) {
        return { peekX: x, peekY: y, dir: side };
      }
    }
  }
  return null;
}

// 掩体探测：在 bot 朝向敌人反方向的扇区内找"能躲人的掩体锚点 + 探出点"。
// 返回 { anchorX, anchorY, peekX, peekY, dir, dist }；附近无可利用掩体返回 null。
export function coverBehind(e, enemy, map) {
  if (!e || !enemy || Number.isNaN(e.x) || Number.isNaN(enemy.x) || Number.isNaN(e.y) || Number.isNaN(enemy.y)) return null;
  const h = e.height || 0;
  const baseAng = Math.atan2(e.y - enemy.y, e.x - enemy.x);
  for (let d = 44; d <= 108; d += 16) {
    for (let aDeg = -50; aDeg <= 50; aDeg += 12.5) {
      const ang = baseAng + aDeg * Math.PI / 180;
      const x = e.x + Math.cos(ang) * d;
      const y = e.y + Math.sin(ang) * d;
      if (!walkableAt(map, x, y)) continue;
      if (gridLos(map, x, y, enemy.x, enemy.y, h)) continue; // 可见 → 不是掩体
      const pk = findPeekPoint(map, e, enemy, x, y, h);
      if (!pk) continue;
      return { anchorX: x, anchorY: y, peekX: pk.peekX, peekY: pk.peekY, dir: pk.dir, dist: d };
    }
  }
  return null;
}

// 探身技能（可读 aiParams.peekSkill；未定义回退默认 0.7）
export function peekSkillOf(e) {
  const s = e && e.aiParams && e.aiParams.peekSkill;
  return s !== undefined ? clamp(s, 0.1, 1.2) : 0.7;
}

// 每 bot 确定性相位偏移（只读身份字段，不改变训练权重）
export function phaseSeed(e) {
  const a = e && e.anchorIdx !== undefined ? e.anchorIdx : 0;
  const l = e && e.laneIdx !== undefined ? e.laneIdx : 0;
  const n = e && e.name ? e.name.length : 0;
  return (a * 37 + l * 13 + n * 7) % 100;
}

// 相位时长（skill 高 → 探出更短、缩回更快、隐蔽更短 → 更频繁 peek）
export function peekDurations(skill) {
  return {
    peek: 0.2 + (1 - skill) * 0.24,
    recover: 0.16 + (1 - skill) * 0.18,
    hold: 0.5 + (1 - skill) * 0.4
  };
}

// 纯相位判定（不含几何）：按时刻 t 输出当前相位与剩余时长。
// 供集成层在缓存了掩体锚点后，逐帧只更新相位（保持锚点/探出点稳定，避免沿墙漂移）。
export function peekPhase(e, t) {
  const dur = peekDurations(peekSkillOf(e));
  const period = dur.peek + dur.recover + dur.hold;
  const ph = ((t + phaseSeed(e) * 0.37) % period + period) % period;
  if (ph < dur.peek) return { action: 'peek', duration: dur.peek - ph };
  if (ph < dur.peek + dur.recover) return { action: 'recover', duration: dur.peek + dur.recover - ph };
  return { action: 'hold', duration: period - ph };
}

// 掩体后对枪相位规划（纯函数、确定性）
// 输入：e（bot，含 anchorIdx/laneIdx/height）、enemy（敌方 {x,y}）、t（当前时刻 s）、map（含 grid/tile）
// 输出：null（无掩体/无法 peek）或 { action, dir, duration, anchorX, anchorY, peekX, peekY }
//   duration：当前相位剩余时长（s），供上层做切换协调
export function peekPlan(e, enemy, t, map) {
  const cover = coverBehind(e, enemy, map);
  if (!cover) return null;
  const ph = peekPhase(e, t);
  return {
    action: ph.action, dir: cover.dir, duration: ph.duration,
    anchorX: cover.anchorX, anchorY: cover.anchorY,
    peekX: cover.peekX, peekY: cover.peekY
  };
}
