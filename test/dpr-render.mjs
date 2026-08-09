import assert from 'node:assert/strict';
import { applyDevicePixelRatio } from '../src/render-utils.js';

function makeCanvas() {
  return { width: 0, height: 0, style: {} };
}

{
  const canvas = makeCanvas();
  const res = applyDevicePixelRatio(canvas, 2, 1280, 720);
  assert.equal(res.dpr, 2);
  assert.equal(canvas.width, 2560, 'canvas backing store should use DPR');
  assert.equal(canvas.height, 1440, 'canvas backing store should use DPR');
  assert.equal(canvas.style.width, '1280px');
  assert.equal(canvas.style.height, '720px');
}

{
  const canvas = makeCanvas();
  const res = applyDevicePixelRatio(canvas, 0, 800, 450);
  assert.equal(res.dpr, 1, 'invalid DPR should fall back to 1');
  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 450);
}

console.log('dpr-render: all PASS');
