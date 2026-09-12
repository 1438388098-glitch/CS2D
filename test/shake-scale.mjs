// 屏幕震动强度（Round 12）契约测试：shakeScaleFor 纯函数。
// 契约：reduceMotion → 0；shakeScale 夹取 [0,1.5]；缺省 → 1；非法值 → 1。
import assert from 'node:assert/strict';
import { shakeScaleFor } from '../src/render.js';

{
  assert.equal(shakeScaleFor(null), 1, 'no opts default 1');
  assert.equal(shakeScaleFor(undefined), 1, 'undefined opts default 1');
  assert.equal(shakeScaleFor({}), 1, 'empty opts default 1');
  assert.equal(shakeScaleFor({ reduceMotion: true, shakeScale: 1 }), 0, 'reduce motion wins');
  assert.equal(shakeScaleFor({ shakeScale: 0 }), 0, '0 disables shake');
  assert.equal(shakeScaleFor({ shakeScale: 1.25 }), 1.25, 'custom scale');
  assert.equal(shakeScaleFor({ shakeScale: 9 }), 1.5, 'clamped to max');
  assert.equal(shakeScaleFor({ shakeScale: NaN }), 1, 'invalid falls back');
}

console.log('shake-scale: all PASS');
