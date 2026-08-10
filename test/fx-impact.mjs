// 2D 子弹落地印记（candidate-241）测试：impactMark / impactMarksAt / impactAlpha / drawImpact。
// 契约：impactMark(x,y,tileType,seed) 返回确定性弹孔描述 {x,y,shape,rot,size,alpha}，
//       shape∈{crack,spot,star} 随表面样式权重表挑选、rot∈[0,2π)、size 落入表面尺寸带、
//       alpha∈(0,1]；无 Math.random；impactMarksAt 按 t0+生命窗口过滤并淡出，同输入同输出；
//       drawImpact 对 stub ctx 安全且按 shape 调用对应 canvas 原语。
import assert from 'node:assert/strict';
import {
  impactMark,
  impactMarksAt,
  impactAlpha,
  drawImpact,
  normalizeImpactTile,
  IMPACT_LIFE,
  IMPACT_FADE_START
} from '../src/impact-fx.js';

const SHAPES = new Set(['crack', 'spot', 'star']);

// 结构：返回 {x,y,shape,rot,size,alpha} 且坐标/角度/尺寸/透明度均有限、shape 合法
{
  const m = impactMark(120, 88, 'wall', 7);
  for (const k of ['x', 'y', 'rot', 'size', 'alpha']) {
    assert.equal(typeof m[k], 'number', `${k} is number`);
    assert.ok(Number.isFinite(m[k]), `${k} finite`);
  }
  assert.equal(m.x, 120, 'x passthrough');
  assert.equal(m.y, 88, 'y passthrough');
  assert.ok(SHAPES.has(m.shape), `shape in {crack,spot,star}, got ${m.shape}`);
  assert.ok(m.rot >= 0 && m.rot < Math.PI * 2, 'rot within [0,2π)');
  assert.ok(m.alpha > 0 && m.alpha <= 1, 'alpha within (0,1]');
}

// 确定性：同入参多次调用完全一致（无 Math.random）
{
  const a = impactMark(240, 160, 'ground', 3);
  const b = impactMark(240, 160, 'ground', 3);
  assert.deepEqual(a, b, 'same input yields identical mark');
}

// seed / 位置 / 表面影响弹孔形态（不同输入产生不同描述）
{
  const a = impactMark(240, 160, 'ground', 3);
  const b = impactMark(240, 160, 'ground', 4);
  const c = impactMark(241, 160, 'ground', 3);
  const d = impactMark(240, 160, 'crate', 3);
  assert.ok(JSON.stringify(a) !== JSON.stringify(b), 'seed changes mark');
  assert.ok(JSON.stringify(a) !== JSON.stringify(c), 'position changes mark');
  assert.ok(JSON.stringify(a) !== JSON.stringify(d), 'surface changes mark');
}

// 表面样式权重：墙面多数为裂纹、地面多数为黑点、木箱多数为星形（固定种子集确定性统计）
{
  const tally = (tileType) => {
    const count = { crack: 0, spot: 0, star: 0 };
    for (let s = 1; s <= 400; s++) {
      count[impactMark(s * 7 % 1000, 500 + s * 3 % 400, tileType, s).shape]++;
    }
    return count;
  };
  const wall = tally('wall');
  const ground = tally('ground');
  const crate = tally('crate');
  assert.ok(wall.crack > wall.spot, `wall favors crack (${JSON.stringify(wall)})`);
  assert.ok(ground.spot > ground.crack, `ground favors spot (${JSON.stringify(ground)})`);
  assert.ok(crate.star > crate.crack, `crate favors star (${JSON.stringify(crate)})`);
}

// 尺寸带：墙最小、地面中等、木箱最大（各表面独立区间）
{
  const sizes = { wall: [], ground: [], crate: [] };
  for (let s = 1; s <= 200; s++) {
    for (const t of ['wall', 'ground', 'crate']) sizes[t].push(impactMark(100, 100, t, s).size);
  }
  const maxOf = (arr) => Math.max(...arr);
  const minOf = (arr) => Math.min(...arr);
  assert.ok(maxOf(sizes.wall) < minOf(sizes.crate), 'crate marks larger than wall marks');
  assert.ok(minOf(sizes.ground) >= 4.5 && maxOf(sizes.ground) <= 6.5, 'ground size band [4.5,6.5]');
  assert.ok(minOf(sizes.wall) >= 3.5 && maxOf(sizes.wall) <= 5, 'wall size band [3.5,5]');
}

// 射线/棘刺数：n 在 [3,8] 内、整数
{
  for (let s = 1; s <= 50; s++) {
    const m = impactMark(30 * s, 20 * s, s % 2 ? 'crate' : 'wall', s);
    assert.ok(Number.isInteger(m.n) && m.n >= 3 && m.n <= 8, `n integer in [3,8], got ${m.n}`);
  }
}

// normalizeImpactTile：风格词 / 瓦片字符归一
{
  assert.equal(normalizeImpactTile('wall'), 'wall');
  assert.equal(normalizeImpactTile('#'), 'wall');
  assert.equal(normalizeImpactTile('='), 'wall');
  assert.equal(normalizeImpactTile('unknown'), 'wall');
  assert.equal(normalizeImpactTile(''), 'wall');
  assert.equal(normalizeImpactTile(null), 'wall');
  assert.equal(normalizeImpactTile('ground'), 'ground');
  assert.equal(normalizeImpactTile('floor'), 'ground');
  assert.equal(normalizeImpactTile('.'), 'ground');
  assert.equal(normalizeImpactTile('~'), 'ground');
  assert.equal(normalizeImpactTile('crate'), 'crate');
  assert.equal(normalizeImpactTile('box'), 'crate');
  assert.equal(normalizeImpactTile('wood'), 'crate');
  assert.equal(normalizeImpactTile('D'), 'crate');
}

// impactAlpha：出生满值、FADE_START 前保持 1、FADE_START 后线性衰减、过期归 0
{
  assert.equal(impactAlpha(0), 1, 'born full alpha');
  assert.equal(impactAlpha(IMPACT_FADE_START / 2), 1, 'pre-fade keeps alpha 1');
  assert.equal(impactAlpha(IMPACT_FADE_START), 1, 'at fade start alpha 1');
  assert.ok(impactAlpha(IMPACT_FADE_START + 1) > 0 && impactAlpha(IMPACT_FADE_START + 1) < 1, 'mid-fade 0<alpha<1');
  assert.equal(impactAlpha(IMPACT_LIFE), 0, 'life end alpha 0');
  assert.equal(impactAlpha(IMPACT_LIFE + 5), 0, 'past life alpha 0');
  assert.equal(impactAlpha(-1), 0, 'negative age alpha 0');
  assert.equal(impactAlpha(NaN), 0, 'NaN age alpha 0');
  // 单调递减的淡出窗口
  const p = (IMPACT_LIFE - IMPACT_FADE_START) / 3;
  const a1 = impactAlpha(IMPACT_FADE_START + p);
  const a2 = impactAlpha(IMPACT_FADE_START + p * 2);
  assert.ok(a1 > a2, 'alpha monotonically decreasing during fade');
}

// impactMarksAt：空输入 / 缺 hit / 非法坐标安全
{
  assert.deepEqual(impactMarksAt([], 5), [], 'empty hits -> empty');
  assert.deepEqual(impactMarksAt(null, 5), [], 'null hits -> empty');
  assert.deepEqual(impactMarksAt([null, { x: NaN, y: 1 }], 5), [], 'invalid hits skipped');
}

// impactMarksAt：按 t0+生命周期过滤；出生点全量存活、过期淡出/剔除
{
  const hits = [
    { x: 10, y: 10, tileType: 'wall', seed: 1, t0: 0 },
    { x: 20, y: 20, tileType: 'ground', seed: 2, t0: 2 },
    { x: 30, y: 30, tileType: 'crate', seed: 3, t0: 3 }
  ];
  const early = impactMarksAt(hits, 3.5);
  assert.equal(early.length, 3, 'all three alive at t=3.5');
  for (const m of early) {
    assert.ok(m.alpha > 0, 'alive mark has alpha > 0');
    assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y), 'mark coords finite');
  }
  const late = impactMarksAt(hits, IMPACT_LIFE + 10);
  assert.deepEqual(late, [], 'all expired past life');
  const one = impactMarksAt(hits, 2.5);
  assert.equal(one.length, 2, 'hit with t0=3 not yet spawned at t=2.5');
  assert.ok(one.every((m) => m.t0 <= 2.5), 'only spawned marks present');
}

// impactMarksAt：淡出窗口内 alpha 随时间衰减
{
  const hit = [{ x: 5, y: 5, tileType: 'wall', seed: 9, t0: 0 }];
  const mid = impactMarksAt(hit, IMPACT_FADE_START + 1)[0];
  const nearEnd = impactMarksAt(hit, IMPACT_LIFE - 0.2)[0];
  assert.ok(mid.alpha < 1, 'alpha below 1 during fade');
  assert.ok(nearEnd.alpha < mid.alpha, 'alpha shrinks as fade progresses');
  assert.ok(nearEnd.alpha > 0, 'still visible just before life end');
}

// impactMarksAt：确定性 + 按 (t0,id) 排序 + 无 t0 时按 index 生成 seed
{
  const hits = [
    { x: 12, y: 34, tileType: 'wall', t0: 1 },
    { x: 56, y: 78, tileType: 'crate', t0: 0 },
    { x: 90, y: 12, tileType: 'ground', t0: 2 }
  ];
  const a = impactMarksAt(hits, 4);
  const b = impactMarksAt(hits, 4);
  assert.deepEqual(a, b, 'deterministic over hits+t');
  for (let i = 1; i < a.length; i++) {
    const prev = a[i - 1];
    const cur = a[i];
    assert.ok(prev.t0 < cur.t0 || (prev.t0 === cur.t0 && prev.id < cur.id), 'sorted by (t0,id)');
  }
  const same = impactMarksAt([{ x: 12, y: 34, tileType: 'wall', t0: 1 }], 4);
  assert.deepEqual(same, impactMarksAt([{ x: 12, y: 34, tileType: 'wall', t0: 1, seed: 0 }], 4), 'missing seed defaults to index');
}

// drawImpact：null / alpha<=0 / 空对象安全，不产生 canvas 调用
{
  const calls = [];
  const ctx = makeStubCtx(calls);
  drawImpact(ctx, null);
  drawImpact(ctx, undefined);
  drawImpact(ctx, { alpha: 0 });
  drawImpact(ctx, { alpha: -1 });
  assert.equal(calls.length, 0, 'inactive marks -> no canvas calls');
}

// drawImpact：每种 shape 均以 save 开头、restore 收尾、translate 到撞击点并画形状
{
  for (const shape of ['crack', 'spot', 'star']) {
    const calls = [];
    const ctx = makeStubCtx(calls);
    const mark = impactMark(300, 200, 'wall', 5);
    mark.shape = shape;
    drawImpact(ctx, mark);
    assert.equal(calls[0][0], 'save', `${shape}: opens with save`);
    assert.equal(calls[calls.length - 1][0], 'restore', `${shape}: closes with restore`);
    const tr = calls.find((c) => c[0] === 'translate');
    assert.ok(tr && tr[1] === mark.x && tr[2] === mark.y, `${shape}: translate to hit point`);
    assert.ok(calls.some((c) => c[0] === 'rotate'), `${shape}: applies rotation`);
    if (shape === 'spot') {
      assert.ok(calls.filter((c) => c[0] === 'arc').length >= 2, 'spot draws core + outer ring');
    } else {
      assert.ok(calls.filter((c) => c[0] === 'stroke').length >= 1 || calls.filter((c) => c[0] === 'fill').length >= 1, `${shape}: strokes or fills shape`);
    }
  }
}

// drawImpact：淡出 mark（alpha=0）跳过绘制，但半透明 mark 正常绘制
{
  const calls = [];
  const ctx = makeStubCtx(calls);
  const mark = impactMark(50, 60, 'crate', 2);
  drawImpact(ctx, { ...mark, alpha: 0 });
  assert.equal(calls.length, 0, 'faded-out mark not drawn');
  calls.length = 0;
  drawImpact(ctx, { ...mark, alpha: 0.35 });
  assert.ok(calls.length > 0, 'half-alpha mark drawn');
}

function makeStubCtx(calls) {
  return {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (...a) => calls.push(['translate', ...a]),
    rotate: (...a) => calls.push(['rotate', ...a]),
    beginPath: () => calls.push(['beginPath']),
    closePath: () => calls.push(['closePath']),
    moveTo: (...a) => calls.push(['moveTo', ...a]),
    lineTo: (...a) => calls.push(['lineTo', ...a]),
    arc: (...a) => calls.push(['arc', ...a]),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    fillStyle: null,
    strokeStyle: null,
    lineWidth: null,
    lineCap: null
  };
}

console.log('fx-impact: all PASS');
