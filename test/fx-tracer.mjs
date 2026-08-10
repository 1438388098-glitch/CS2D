// 2D 弹道拖尾增强测试：tracerStyle 纯函数（{alpha,width,len,color} 确定性派生）+ TRACER_LIFE 常量
// 契约：tracerStyle(t, weaponKind) 按武器口径返回样式，t∈[0,1] 为剩余寿命进度；
//       大威力（rifle/sniper）比小威力（smg/pistol）拖尾更长、更亮、更粗；
//       alpha 随 t 单调衰减，t>=1 归零；同输入必同输出（无 Math.random）。
import assert from 'node:assert/strict';
import { tracerStyle, TRACER_LIFE } from '../src/render.js';

const ALL_KINDS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];

// 返回结构：包含 alpha/width/len/color 且数值合法
{
  for (const kind of ALL_KINDS) {
    const s = tracerStyle(0, kind);
    assert.equal(typeof s.alpha, 'number', kind + ' alpha is number');
    assert.equal(typeof s.width, 'number', kind + ' width is number');
    assert.equal(typeof s.len, 'number', kind + ' len is number');
    assert.equal(typeof s.color, 'string', kind + ' color is string');
    assert.ok(Number.isFinite(s.alpha) && s.width > 0 && s.len > 0, kind + ' sane magnitudes');
  }
}

// 确定性：同输入 → 同输出
{
  for (const kind of ALL_KINDS) {
    assert.deepEqual(tracerStyle(0.42, kind), tracerStyle(0.42, kind), kind + ' deterministic');
  }
}

// 口径分档：狙击 > 步枪 > 冲锋枪 > 手枪（长度/宽度/亮度均大威力占优）
{
  const p = tracerStyle(0, 'pistol');
  const smg = tracerStyle(0, 'smg');
  const r = tracerStyle(0, 'rifle');
  const sn = tracerStyle(0, 'sniper');
  assert.ok(sn.len > r.len, 'sniper len > rifle len');
  assert.ok(r.len > smg.len, 'rifle len > smg len');
  assert.ok(smg.len > p.len, 'smg len > pistol len');
  assert.ok(sn.width > r.width, 'sniper wider than rifle');
  assert.ok(r.width > p.width, 'rifle wider than pistol');
  assert.ok(sn.alpha > r.alpha, 'sniper brighter than rifle');
  assert.ok(r.alpha > smg.alpha, 'rifle brighter than smg');
  assert.ok(smg.alpha > p.alpha, 'smg brighter than pistol');
}

// 衰减渐变：t 增大 → alpha 单调不增，t>=1 归零（发射点亮 → 末端/过期淡出）
{
  const fresh = tracerStyle(0, 'rifle').alpha;
  assert.ok(fresh > 0, 'fresh tracer visible');
  let prev = fresh;
  for (let i = 1; i <= 10; i++) {
    const a = tracerStyle(i / 10, 'rifle').alpha;
    assert.ok(a <= prev, 'alpha monotonic at t=' + i / 10);
    prev = a;
  }
  assert.equal(tracerStyle(1, 'rifle').alpha, 0, 'expired tracer invisible');
  assert.equal(tracerStyle(2, 'rifle').alpha, 0, 'over-age tracer clamped invisible');
}

// 兜底：未知武器类型走 default，结果仍合法
{
  const s = tracerStyle(0.5, 'rocket-launcher');
  assert.ok(Number.isFinite(s.alpha) && s.width > 0 && s.len > 0, 'unknown kind falls back');
}

// TRACER_LIFE：比旧 0.09s 更长，保证拖尾有足够可见时长
{
  assert.ok(TRACER_LIFE >= 0.14, 'tracer life extended past 0.09s');
  assert.equal(TRACER_LIFE, 0.16, 'tracer life constant 0.16s');
}

console.log('fx-tracer: all PASS');
