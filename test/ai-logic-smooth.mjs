import assert from 'node:assert/strict';
import { smoothBotLogic } from '../src/ai/smooth.js';
import { angDiff, angNorm } from '../src/utils.js';

{
  const e = {
    bot: true,
    angle: Math.PI,
    vx: 235,
    vy: 0
  };
  smoothBotLogic(e, 1 / 60, 0, 0, 0);
  assert.ok(Math.abs(angDiff(e.angle, Math.PI)) < Math.PI, 'large snap should start turning toward the desired angle');
  assert.ok(Math.abs(angDiff(e.angle, 0)) <= 9.5 / 60 + 1e-9, 'logical turn should be capped by turn rate');
  assert.ok(Math.hypot(e.vx, e.vy) < 235, 'full-speed decision should not appear instantly');
}

{
  const e = { bot: true, angle: 0.02, vx: 20, vy: 0 };
  const prevAngle = e.angle;
  const prevVx = e.vx;
  smoothBotLogic(e, 1 / 60, prevAngle, prevVx, 0);
  assert.ok(Math.abs(angDiff(e.angle, prevAngle)) < 1e-9, 'small logic changes should remain smooth and stable');
  assert.ok(Math.abs(e.vx - prevVx) < 1e-9, 'small velocity changes should not jitter');
}

{
  const e = { bot: true, angle: 0, vx: 0, vy: 0 };
  smoothBotLogic(e, 1 / 60, 0, 235, 0);
  assert.ok(Math.abs(e.vx - 115) < 1e-6, 'braking to zero should use the faster stop ramp');
  assert.ok(Math.abs(e.vy) < 1e-6);
}

console.log('ai-logic-smooth: all PASS');
