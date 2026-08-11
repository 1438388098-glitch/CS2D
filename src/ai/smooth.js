import { clamp, angDiff, angNorm } from '../utils.js';

const LOGIC_TURN_RATE = 9.5;
const LOGIC_ACCEL = 2400;
const LOGIC_STOP_ACCEL = 7200;

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// 逻辑层运动平滑：AI 决策会直接写 e.angle/e.vx/e.vy，这里把本帧产生的
// 瞬时跳变限制为可感知但不过度的转向/加减速。开火/投掷已经使用决策后的
// 原始值执行，因此不改变当前帧动作，只让下一帧继承平滑后的逻辑状态。
export function smoothBotLogic(e, dt, prevAngle, prevVx, prevVy) {
  if (!e || !e.bot || !(dt > 0)) return;
  const t = Math.min(dt, 0.05);
  const maxTurn = Math.max(0, LOGIC_TURN_RATE * t);
  const fromAngle = num(prevAngle, e.angle || 0);
  const turn = clamp(angDiff(num(e.angle, fromAngle), fromAngle), -maxTurn, maxTurn);
  e.angle = angNorm(fromAngle + turn);

  const fromVx = num(prevVx, 0);
  const fromVy = num(prevVy, 0);
  const wantVx = num(e.vx, fromVx);
  const wantVy = num(e.vy, fromVy);
  const targetSpeed = Math.hypot(wantVx, wantVy);
  const maxAccel = targetSpeed < 5 ? LOGIC_STOP_ACCEL : LOGIC_ACCEL;
  const dvx = wantVx - fromVx;
  const dvy = wantVy - fromVy;
  const dSpeed = Math.hypot(dvx, dvy);
  const maxDelta = maxAccel * t;
  const k = dSpeed > maxDelta ? maxDelta / dSpeed : 1;
  e.vx = fromVx + dvx * k;
  e.vy = fromVy + dvy * k;
}
