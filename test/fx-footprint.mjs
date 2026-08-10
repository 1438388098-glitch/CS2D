import assert from 'node:assert/strict';
import {
  footprintsForPath,
  drawFootprint,
  FOOTPRINT_GAP,
  FOOTPRINT_LIFE,
  FOOTPRINT_TIME_LIFE
} from '../src/footprint-fx.js';

// 沿直线路径，长度足够时生成脚印
{
  const path = [];
  for (let i = 0; i <= 60; i++) path.push({ x: i * 8, y: 0 });
  const fps = footprintsForPath(path, 0, 7);
  assert.ok(fps.length >= 12, '60*8=480px 应产生 >=12 个脚印，实际 ' + fps.length);
  assert.ok(fps.length <= 18, '脚印数量应约为 480/30=16，实际 ' + fps.length);
}

// 站立/过短路径 → 空
{
  assert.deepEqual(footprintsForPath([{ x: 0, y: 0 }], 0, 1), [], '单点无脚印');
  assert.deepEqual(footprintsForPath([{ x: 0, y: 0 }, { x: 5, y: 0 }], 0, 1), [], '短于脚印间距无脚印');
}

// 确定性：同输入同输出
{
  const path = [{ x: 0, y: 0 }, { x: 120, y: 40 }, { x: 240, y: 20 }];
  const a = footprintsForPath(path, 1.5, 42);
  const b = footprintsForPath(path, 1.5, 42);
  assert.deepEqual(a, b, '同 seed 同输入输出应完全一致');
  const c = footprintsForPath(path, 1.5, 43);
  assert.notDeepEqual(a.map(f => f.x), c.map(f => f.x), '不同 seed 脚印横向位置应不同');
}

// 时间老化：alpha 随时间减小
{
  const path = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  const fresh = footprintsForPath(path, 0.1, 9);
  const old = footprintsForPath(path, FOOTPRINT_TIME_LIFE - 0.1, 9);
  assert.ok(fresh.length === old.length, '脚印数量与时间无关');
  const avgAlpha = (arr) => arr.reduce((s, f) => s + f.alpha, 0) / arr.length;
  assert.ok(avgAlpha(old) < avgAlpha(fresh), '时间越久平均透明度越低');
  const expired = footprintsForPath(path, FOOTPRINT_TIME_LIFE + 1, 9);
  for (const f of expired) assert.ok(f.alpha <= 0.45, '过期脚印 alpha 应很低');
}

// 脚印间距恒定
{
  const path = [];
  for (let i = 0; i <= 40; i++) path.push({ x: i * 10, y: 0 });
  const fps = footprintsForPath(path, 0, 3);
  for (let i = 1; i < fps.length; i++) {
    const d = Math.hypot(fps[i].x - fps[i - 1].x, fps[i].y - fps[i - 1].y);
    assert.ok(Math.abs(d - FOOTPRINT_GAP) < 4.5, '脚印间距应约等于 FOOTPRINT_GAP（允许左右脚横移影响），实际 ' + d);
  }
}

// 朝向沿路径方向
{
  const path = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
  const fps = footprintsForPath(path, 0, 5);
  assert.ok(fps.length > 0);
  for (const f of fps) assert.ok(Math.abs(f.ang) < 0.2, '沿 +x 方向的脚印朝向应接近 0，实际 ' + f.ang);
}

// 绘制：stub ctx
{
  const calls = [];
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x, y) => calls.push('translate:' + x + ',' + y),
    rotate: (a) => calls.push('rotate:' + a),
    set globalAlpha(v) { this._a = v; },
    beginPath: () => calls.push('beginPath'),
    ellipse: () => calls.push('ellipse'),
    fill: () => calls.push('fill'),
    set fillStyle(v) { this._fs = v; }
  };
  drawFootprint(ctx, { x: 10, y: 20, ang: 0.5, alpha: 0.8 });
  assert.ok(calls.includes('save') && calls.includes('restore'), 'save/restore 应配对');
  assert.ok(calls.includes('translate:10,20'), '应在脚印位置平移');
  assert.ok(calls.filter(c => c === 'ellipse').length >= 2, '应绘制前掌+脚跟两段');
  assert.ok(calls.filter(c => c === 'fill').length >= 2, '应填充两段');

  // alpha<=0 → no-op
  const nctx = { save: () => calls.push('s'), restore: () => calls.push('r') };
  const before = calls.length;
  drawFootprint(nctx, { x: 0, y: 0, ang: 0, alpha: 0 });
  assert.equal(calls.length, before, 'alpha=0 时不应绘制');
}

console.log('fx-footprint: all PASS');
