// 拆弹音效契约（Round 2）：中断播 beepWarn（区别于倒计时蜂鸣），不再用普通 beep。
import assert from 'node:assert/strict';
import { ctx } from '../src/ctx.js';
import { defuseBomb } from '../src/bomb.js';

{
  const sfx = [];
  const on = (p) => sfx.push(p);
  ctx.bus.on('sfx', on);

  const e = { team: 'ct', x: 200, y: 200, defuseT: 1.2, weapons: { kit: false } };
  const game = { bomb: { planted: true, x: 0, y: 0, defusing: true, defuseT: 1 }, dt: 0.016, time: 10 };
  // 距离 283 > 55 → 中断分支
  defuseBomb(e, game);
  ctx.bus.off ? ctx.bus.off('sfx', on) : null;

  assert.ok(sfx.some((s) => s.name === 'beepWarn'), 'interrupt plays beepWarn');
  assert.ok(!sfx.some((s) => s.name === 'beep'), 'no plain beep on interrupt');
}

console.log('bomb-sfx: all PASS');
