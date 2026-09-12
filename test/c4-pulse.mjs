// C4 终局红脉冲（Round 7）契约测试：bombPulseAlpha 包络 + drawBombPulse stub 安全。
// 契约：
//   bombPulseAlpha —— timer ≥10 或 ≤0 → 0；强度随 (10-timer)/10 线性推进；
//                     呼吸相位与蜂鸣间隔对齐（beepT=interval 时最亮，=0 时最暗）；
//                     间隔分档 bt<5 → 0.25s，<10 → 0.5s。
//   drawBombPulse —— stub ctx 安全；alpha ≤0.005 跳过绘制。
import assert from 'node:assert/strict';
import { bombPulseAlpha, drawBombPulse } from '../src/c4-pulse-fx.js';

{
  assert.equal(bombPulseAlpha(12, 0, 0), 0, 'beyond 10s window -> 0');
  assert.equal(bombPulseAlpha(0, 0, 0), 0, 'at explosion -> 0');
  assert.equal(bombPulseAlpha(NaN, 0.1, 0), 0, 'non-finite timer safe');

  // 同相位下，越接近爆炸整体越强
  const early = bombPulseAlpha(9, 0.25, 0);
  const late = bombPulseAlpha(3, 0.125, 0); // 0.25s 档同相位点
  assert.ok(late > early, 'envelope grows toward detonation');

  // 呼吸相位：beepT=interval → phase 1 最亮；beepT=0 → phase 0 最暗
  const bright = bombPulseAlpha(9, 0.5, 0);  // 0.5s 档满相位
  const dark = bombPulseAlpha(9, 0, 0);
  assert.ok(bright > dark, 'pulse breathes with beep cadence');
  assert.ok(bright <= 9 / 10 * 0.32 + 1e-9, 'bounded by envelope');

  // 分档：bt<5 用 0.25 间隔
  const fastPhase = bombPulseAlpha(3, 0.25, 0);
  assert.ok(fastPhase > bombPulseAlpha(3, 0, 0), 'fast interval still breathes');
}

{
  const calls = [];
  const stub = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    createRadialGradient() { return { addColorStop() { calls.push('stop'); } }; },
    fillRect(...a) { calls.push(['rect', ...a]); }
  };
  drawBombPulse(stub, 1280, 720, 0.3);
  assert.ok(calls.includes('save') && calls.includes('restore'), 'save/restore balanced');
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'rect'), 'covers full screen');
  calls.length = 0;
  drawBombPulse(stub, 1280, 720, 0);
  assert.equal(calls.length, 0, 'alpha ~0 skips drawing');
}

console.log('c4-pulse: all PASS');
