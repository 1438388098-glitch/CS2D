// 2D 爆炸冲击波增强（candidate-298）测试：enhancedBoomSpec 纯函数 + boomDust 粒子 + drawEnhancedBoom 绘制。
// 契约：enhancedBoomSpec(p) → {x,y,flash,outer,inner,alpha,texture,groundDust,t}，确定性（无 Math.random）；
//       boomDust(p, seed, count) → [{x,y,r,alpha,vx,vy}]，count<=0 / 缺 p → 空数组；
//       drawEnhancedBoom 对空 spec / 晚期 spec 安全，逐层绘制（flash 填充、主环+内环+纹理环描边、烟尘填充）。
import assert from 'node:assert/strict';
import {
  enhancedBoomSpec,
  boomDust,
  drawEnhancedBoom,
  BOOM_TEXTURE_SEGMENTS,
  BOOM_DUST_COUNT_MIN,
  BOOM_DUST_COUNT_MAX,
  BOOM_DUST_ALPHA_MIN,
  BOOM_DUST_ALPHA_MAX,
  BOOM_DUST_SIZE_MIN
} from '../src/boom-fx.js';

const base = { x: 320, y: 240, size: 160, life: 0.5, maxLife: 0.5 };

// 结构：返回键齐全、数值有限、t 正确
{
  const s = enhancedBoomSpec(base);
  for (const k of ['x', 'y', 'flash', 'outer', 'inner', 'alpha', 'texture', 'groundDust', 't']) {
    assert.ok(k in s, `has key ${k}`);
  }
  assert.equal(s.x, 320, 'x passthrough');
  assert.equal(s.y, 240, 'y passthrough');
  assert.equal(s.t, 0, 'fresh boom starts at t=0');
  assert.ok(Number.isFinite(s.flash) && Number.isFinite(s.outer) && Number.isFinite(s.inner), 'radii finite');
  assert.ok(s.alpha >= 0 && s.alpha <= 0.8, 'alpha within [0, 0.8]');
}

// t 进度 / 外扩 / 衰减：fresh → mid → late
{
  const fresh = enhancedBoomSpec(base);
  const mid = enhancedBoomSpec({ ...base, life: 0.25 });
  const late = enhancedBoomSpec({ ...base, life: 0 });
  assert.ok(mid.t > 0.4 && mid.t < 0.6, 'mid advances progress');
  assert.equal(late.t, 1, 'late reaches full progress');
  assert.ok(mid.outer > fresh.outer && mid.outer < 160, 'outer expands outward');
  assert.ok(late.outer > mid.outer, 'outer largest at end');
  assert.ok(mid.alpha < fresh.alpha && mid.alpha > 0, 'main ring fades as it expands');
  assert.equal(late.alpha, 0, 'late ring invisible');
  assert.ok(mid.inner > fresh.inner && mid.inner < mid.outer, 'inner ring expands within outer');
}

// 爆闪：快速衰减，late 归零
{
  const fresh = enhancedBoomSpec(base);
  const mid = enhancedBoomSpec({ ...base, life: 0.3 });
  const late = enhancedBoomSpec({ ...base, life: 0 });
  assert.ok(fresh.flash > 0.9, 'flash bright at impact');
  assert.ok(mid.flash < fresh.flash, 'flash decays quickly');
  assert.equal(late.flash, 0, 'flash gone at end');
}

// 确定性：同输入 → 同输出（无 Math.random）
{
  assert.deepEqual(enhancedBoomSpec(base), enhancedBoomSpec(base), 'same p -> identical spec');
  assert.deepEqual(boomDust(base, 7, 8), boomDust(base, 7, 8), 'same (p,seed,count) -> identical dust');
}

// 生命周期边缘：缺 p → null；life 越界被 clamp；缺 maxLife 用默认 0.5
{
  assert.equal(enhancedBoomSpec(null), null, 'no p -> null');
  const over = enhancedBoomSpec({ ...base, life: 9 });
  assert.equal(over.t, 0, 'life clamped to maxLife');
  const noMax = enhancedBoomSpec({ ...base, life: 0.25 });
  assert.ok(noMax.t > 0.4 && noMax.t < 0.6, 'maxLife defaults to 0.5');
}

// boomDust：count 个粒子、字段齐全有限、alpha∈[min,max]、r 为正
{
  const dust = boomDust(base, 7, 8);
  assert.equal(dust.length, 8, 'count particles emitted');
  for (const d of dust) {
    for (const k of ['x', 'y', 'r', 'alpha', 'vx', 'vy']) {
      assert.equal(typeof d[k], 'number', `${k} is number`);
      assert.ok(Number.isFinite(d[k]), `${k} finite`);
    }
    assert.ok(d.r >= BOOM_DUST_SIZE_MIN, 'radius positive');
    assert.ok(d.alpha >= BOOM_DUST_ALPHA_MIN && d.alpha <= BOOM_DUST_ALPHA_MAX, 'alpha within dust range');
  }
}

// boomDust 边界：count<=0、缺 p → 空数组
{
  assert.deepEqual(boomDust(base, 7, 0), [], 'count=0 -> empty');
  assert.deepEqual(boomDust(base, 7, -3), [], 'count<0 -> empty');
  assert.deepEqual(boomDust(null, 7, 8), [], 'no p -> empty');
}

// seed / 位置敏感性：不同 seed 或不同位置 → 粒子分布不同
{
  const s1 = boomDust(base, 7, 8);
  const s2 = boomDust(base, 8, 8);
  const s3 = boomDust({ ...base, x: 480 }, 7, 8);
  assert.ok(JSON.stringify(s1) !== JSON.stringify(s2), 'seed changes dust');
  assert.ok(JSON.stringify(s1) !== JSON.stringify(s3), 'position changes dust');
}

// spec.groundDust = boomDust 结果按 (1-t) 淡出（同 seed 同粒子，仅 alpha 缩放）
{
  const spec = enhancedBoomSpec({ ...base, seed: 7, life: 0.25 });
  const raw = boomDust({ ...base, seed: 7 }, 7, spec.groundDust.length);
  assert.equal(spec.groundDust.length, raw.length, 'same particle count');
  for (let i = 0; i < raw.length; i++) {
    assert.equal(spec.groundDust[i].x, raw[i].x, 'dust x matches boomDust');
    assert.equal(spec.groundDust[i].y, raw[i].y, 'dust y matches boomDust');
    assert.ok(Math.abs(spec.groundDust[i].alpha - raw[i].alpha * (1 - spec.t)) < 1e-9, 'dust alpha scaled by (1-t)');
  }
  const late = enhancedBoomSpec({ ...base, seed: 7, life: 0 });
  assert.ok(late.groundDust.every((d) => d.alpha === 0), 'late dust fully faded');
}

// 烟尘数量范围：size 中等 → 介于 [MIN, MAX]
{
  for (const size of [60, 160, 400]) {
    const s = enhancedBoomSpec({ ...base, size });
    assert.ok(s.groundDust.length >= BOOM_DUST_COUNT_MIN && s.groundDust.length <= BOOM_DUST_COUNT_MAX,
      `dust count ${s.groundDust.length} within [${BOOM_DUST_COUNT_MIN},${BOOM_DUST_COUNT_MAX}] for size=${size}`);
  }
}

// 震动纹理环：切段数固定、字段齐全、确定性；振幅随 t 衰减（初期碎裂强、扩散中渐平滑）
{
  const spec0 = enhancedBoomSpec({ ...base, seed: 7 });
  assert.equal(spec0.texture.count, BOOM_TEXTURE_SEGMENTS, 'segment count constant');
  assert.equal(spec0.texture.segs.length, BOOM_TEXTURE_SEGMENTS, 'one seg per count');
  for (const seg of spec0.texture.segs) {
    for (const k of ['a0', 'a1', 'wob', 'w', 'ga']) {
      assert.equal(typeof seg[k], 'number', `${k} is number`);
      assert.ok(Number.isFinite(seg[k]), `${k} finite`);
    }
    assert.ok(seg.a1 > seg.a0, 'segment spans positive arc');
    assert.ok(seg.ga >= 0.4 && seg.ga <= 1, 'seg alpha multiplier in range');
  }
  const spec9 = enhancedBoomSpec({ ...base, seed: 7, life: 0.05 });
  const amp0 = spec0.texture.amp;
  const amp9 = spec9.texture.amp;
  assert.ok(amp9 < amp0, 'texture amplitude damps as t advances');
  const maxWob = (s) => Math.max(...s.texture.segs.map((g) => Math.abs(g.wob)));
  assert.ok(maxWob(spec9) <= maxWob(spec0), 'segment wobble damps with t');
}

// drawEnhancedBoom：空 spec 安全；晚期（alpha=0, flash=0）不画；正常输入逐层绘制
{
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    lineCap: null,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: null,
    beginPath: () => calls.push(['beginPath']),
    arc: (...a) => calls.push(['arc', ...a]),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke'])
  };

  drawEnhancedBoom(ctx, null);
  assert.equal(calls.length, 0, 'null spec -> no canvas calls');
  calls.length = 0;

  const late = enhancedBoomSpec({ ...base, life: 0 });
  drawEnhancedBoom(ctx, late);
  assert.equal(calls.length, 0, 'fully-faded spec -> no canvas calls');
  calls.length = 0;

  const spec = enhancedBoomSpec({ ...base, seed: 7 });
  drawEnhancedBoom(ctx, spec);
  const fills = calls.filter((c) => c[0] === 'fill');
  const strokes = calls.filter((c) => c[0] === 'stroke');
  const arcs = calls.filter((c) => c[0] === 'arc');
  assert.ok(calls.some((c) => c[0] === 'save') && calls.some((c) => c[0] === 'restore'), 'save/restore wrap draw');
  assert.equal(fills.length, 3 + spec.groundDust.length, '3 flash fills + one fill per dust particle');
  assert.equal(strokes.length, 2 + BOOM_TEXTURE_SEGMENTS, 'outer+inner rings + one texture stroke per segment');
  assert.equal(arcs.length, 3 + spec.groundDust.length + 2 + BOOM_TEXTURE_SEGMENTS, 'arc count matches fills+strokes');
  const dustStart = 3 + 2 + BOOM_TEXTURE_SEGMENTS;
  const dustArcs = arcs.slice(dustStart, dustStart + spec.groundDust.length);
  for (let i = 0; i < spec.groundDust.length; i++) {
    const d = spec.groundDust[i];
    assert.ok(Math.abs(dustArcs[i][1] - d.x) < 1e-9 && Math.abs(dustArcs[i][2] - d.y) < 1e-9, `dust arc at particle ${i} center`);
    assert.ok(dustArcs[i][3] > 0, `dust arc radius positive for particle ${i}`);
  }
}

console.log('fx-boom: all PASS');
