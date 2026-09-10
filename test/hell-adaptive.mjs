import assert from 'node:assert/strict';
import { recordDifficultyResult } from '../src/game.js';
import { hellParamsAt } from '../src/config.js';

// HELL 难度自适应（localStorage 胜率升降档）回归：升降档/计数重置/夹取/非 hell no-op。
// Node 下无 localStorage：注入最小 mock 模拟存档持久化。
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

function game(level) {
  return { opts: { diff: 'hell', hellLevel: level } };
}

// 非 hell 模式 no-op
{
  const g = { opts: { diff: 'normal' } };
  recordDifficultyResult(g, true);
  assert.equal(g.opts.diff, 'normal');
  assert.equal(store.size, 0, 'non-hell should not touch storage');
}

// 3 连胜 → 升 0.5 档并重置计数
{
  store.clear();
  const g = game(10);
  recordDifficultyResult(g, true);
  recordDifficultyResult(g, true);
  assert.deepEqual(JSON.parse(store.get('cs2d_hell_adj')), { t: 10, w: 2, l: 0 }, 'counter accumulates before threshold');
  recordDifficultyResult(g, true);
  const adj = JSON.parse(store.get('cs2d_hell_adj'));
  assert.equal(adj.t, 10.5, '3 wins should raise difficulty by 0.5');
  assert.equal(adj.w, 0, 'counters reset after adjustment');
  assert.equal(adj.l, 0);
}

// 3 连败 → 降 0.5 档
{
  store.clear();
  const g = game(10);
  recordDifficultyResult(g, false);
  recordDifficultyResult(g, false);
  recordDifficultyResult(g, false);
  const adj = JSON.parse(store.get('cs2d_hell_adj'));
  assert.equal(adj.t, 9.5, '3 losses should lower difficulty by 0.5');
}

// 混合战绩（2胜1负=66.7%>65%）→ 升档；1胜2负（33%<40%）→ 降档
{
  store.clear();
  const g = game(6);
  recordDifficultyResult(g, true);
  recordDifficultyResult(g, true);
  recordDifficultyResult(g, false);
  assert.equal(JSON.parse(store.get('cs2d_hell_adj')).t, 6.5, '66.7% winrate should raise');
}
{
  store.clear();
  const g = game(6);
  recordDifficultyResult(g, true);
  recordDifficultyResult(g, false);
  recordDifficultyResult(g, false);
  assert.equal(JSON.parse(store.get('cs2d_hell_adj')).t, 5.5, '33% winrate should lower');
}

// 边界夹取：t=12 连胜不越上界；t=1 连败不越下界
{
  store.clear();
  const g = game(12);
  for (let i = 0; i < 6; i++) recordDifficultyResult(g, true);
  assert.equal(JSON.parse(store.get('cs2d_hell_adj')).t, 12, 'clamped at max 12');
}
{
  store.clear();
  const g = game(1);
  for (let i = 0; i < 6; i++) recordDifficultyResult(g, false);
  assert.equal(JSON.parse(store.get('cs2d_hell_adj')).t, 1, 'clamped at min 1');
}

// adaptiveHellParams 的插值入口：夹取 [1,12] 并线性插值数值参数（react 为 AI 反应档）
for (const t of [0.5, 6.5, 13]) {
  const p = hellParamsAt(t);
  assert.ok(p && Number.isFinite(p.react), 'hellParamsAt finite react for t=' + t);
}
// 小数档线性插值契约：H10.5 的数值参数应恰为 H10 与 H11 的中点
{
  const lo = hellParamsAt(10), mid = hellParamsAt(10.5), hi = hellParamsAt(11);
  assert.equal(mid.react, (lo.react + hi.react) / 2, 'fractional level should interpolate linearly');
  assert.equal(mid.spreadMult, (lo.spreadMult + hi.spreadMult) / 2, 'spreadMult should interpolate linearly');
}

console.log('hell-adaptive: all PASS');
