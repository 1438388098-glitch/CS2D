// 环境氛围（Round 3）测试：themeWeatherOf / 深水焦散 / 新天气 kind（mist/smoke/sand）/ 尘埃绘制。
// 契约：
//   themeWeatherOf —— 官方图返回 THEMES.weather {kind,density,color}；自定义/未知 id 返回 null（走关键词兜底）。
//   deepCausticSpec —— 漂移量 |dx|≤6、|dy|≤4，alpha ∈ (0.06,0.22)；同输入同输出。
//   weatherParticles('mist'|'smoke'|'sand') —— 字段有限、永远在区域内、确定性；
//       mist 半径 ≥24、smoke ≤26、sand 近水平（angle>1）；mist/smoke 独立降载封顶。
//   drawWeather —— mist/smoke 画双层圆（arc+fill），sand 画线；非法输入安全跳过。
//   weatherKind 行为不变（fx-weather.mjs 钉住的 canal->null 等契约保持）。
import assert from 'node:assert/strict';
import { themeWeatherOf } from '../src/textures.js';
import { deepCausticSpec } from '../src/render.js';
import {
  weatherKind,
  weatherParticles,
  drawWeather,
  MAX_PARTICLES,
  MIST_MAX_PARTICLES,
  SMOKE_MAX_PARTICLES
} from '../src/weather-fx.js';
import { drawAmbientDust } from '../src/ambient-fx.js';

const W = 512, H = 384;

// ---- themeWeatherOf：官方图数据驱动，自定义图 null ----
{
  assert.equal(themeWeatherOf('canal').kind, 'mist', 'canal -> mist');
  assert.equal(themeWeatherOf('dust2').kind, 'sand', 'dust2 -> sand');
  assert.equal(themeWeatherOf('blast').kind, 'smoke', 'blast -> smoke');
  assert.equal(themeWeatherOf('arctic').kind, 'snow', 'arctic -> snow');
  assert.equal(themeWeatherOf('metro'), null, 'metro declares no weather');
  assert.equal(themeWeatherOf('my_custom_rain'), null, 'custom id -> null (keyword fallback)');
  assert.equal(themeWeatherOf(null), null, 'null id safe');
  assert.ok(themeWeatherOf('canal').density > 0 && themeWeatherOf('canal').density <= 1, 'density normalized');
}

// ---- weatherKind 契约不变 ----
{
  assert.equal(weatherKind('canal'), null, 'canal stays null in keyword matcher');
  assert.equal(weatherKind('arctic'), 'snow', 'arctic keyword still snow');
  assert.equal(weatherKind('rainstorm'), 'rain', 'rain keyword still rain');
}

// ---- deepCausticSpec ----
{
  const c = deepCausticSpec(7, 12.3);
  assert.ok(Math.abs(c.dx) <= 6 + 1e-9 && Math.abs(c.dy) <= 4 + 1e-9, 'drift bounded');
  assert.ok(c.a > 0.06 && c.a < 0.22, 'alpha in breathing band');
  assert.deepEqual(c, deepCausticSpec(7, 12.3), 'deterministic');
  assert.notDeepEqual(c, deepCausticSpec(8, 12.3), 'seed varies');
}

// ---- 新天气 kind 粒子 ----
{
  const mist = weatherParticles('mist', 1.5, 200, W, H, 7);
  assert.equal(mist.length, MIST_MAX_PARTICLES, 'mist capped at ' + MIST_MAX_PARTICLES);
  assert.ok(mist.every((p) => p.len >= 24 && p.len <= 60), 'mist blob radius 24~60');
  const smoke = weatherParticles('smoke', 1.5, 500, W, H, 7);
  assert.equal(smoke.length, SMOKE_MAX_PARTICLES, 'smoke capped at ' + SMOKE_MAX_PARTICLES);
  assert.ok(smoke.every((p) => p.len >= 10 && p.len <= 26), 'smoke puff radius 10~26');
  const sand = weatherParticles('sand', 1.5, 40, W, H, 7);
  assert.equal(sand.length, 40, 'sand count passthrough');
  assert.ok(sand.every((p) => p.angle > 1 && p.angle < 1.6), 'sand near-horizontal');
  assert.ok(sand.every((p) => p.speed >= 90 && p.speed <= 220), 'sand fast');
  for (const [kind, ps] of [['mist', mist], ['smoke', smoke], ['sand', sand]]) {
    for (const p of ps) {
      for (const k of ['x', 'y', 'len', 'angle', 'speed', 'alpha']) {
        assert.ok(Number.isFinite(p[k]), kind + ' field ' + k + ' finite');
      }
      assert.ok(p.x >= 0 && p.x < W && p.y >= 0 && p.y < H, kind + ' bounds');
      assert.ok(p.alpha > 0 && (kind === 'sand' ? p.alpha < 0.3 : p.alpha < 0.2), kind + ' subtle alpha');
    }
    assert.deepEqual(ps, weatherParticles(kind, 1.5, ps.length, W, H, 7), kind + ' deterministic');
  }
  // 上浮：mist 在 t 推进后 y 变化（可向上或回卷，只需变化）
  const m0 = weatherParticles('mist', 0, 10, W, H, 7);
  const m1 = weatherParticles('mist', 3, 10, W, H, 7);
  assert.ok(m1.some((p, i) => p.y !== m0[i].y), 'mist drifts over time');
  assert.equal(weatherParticles('fog', 0, 10, W, H, 7).length, 0, 'unknown kind still empty');
  assert.equal(weatherParticles('rain', 0, 99999, W, H, 7).length, MAX_PARTICLES, 'rain cap unchanged');
}

// ---- drawWeather 新分支（stub ctx）----
{
  const calls = [];
  const stub = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('begin'); },
    moveTo() { calls.push('moveTo'); },
    lineTo() { calls.push('lineTo'); },
    stroke() { calls.push('stroke'); },
    arc() { calls.push('arc'); },
    fill() { calls.push('fill'); },
    set globalAlpha(v) { calls.push('alpha:' + v); },
    set strokeStyle(v) { calls.push('stroke:' + v); },
    set fillStyle(v) { calls.push('fill:' + v); },
    set lineCap(v) { calls.push('lineCap'); },
    set lineWidth(v) { calls.push('lineWidth:' + v); },
    get globalAlpha() { return 0.5; }
  };

  const mist = weatherParticles('mist', 0, 3, W, H, 7);
  calls.length = 0;
  drawWeather(stub, mist, 'mist');
  assert.equal(calls.filter((c) => c === 'fill').length, 6, 'mist two layers per blob');
  assert.equal(calls.filter((c) => c === 'arc').length, 6, 'mist two arcs per blob');
  assert.ok(calls.some((c) => typeof c === 'string' && c.startsWith('fill:rgba(190,205,195')), 'mist color');

  const sand = weatherParticles('sand', 0, 4, W, H, 7);
  calls.length = 0;
  drawWeather(stub, sand, 'sand');
  assert.equal(calls.filter((c) => c === 'stroke').length, 4, 'sand one line per grain');
  assert.ok(calls.some((c) => typeof c === 'string' && c.startsWith('stroke:rgba(200,175,125')), 'sand color');

  calls.length = 0;
  drawWeather(stub, mist, 'sand-kind-mismatch');
  assert.equal(calls.length, 0, 'kind mismatch still skipped');
}

// ---- drawAmbientDust 圆形绘制（stub ctx 安全 + 走 arc 路径）----
{
  const calls = [];
  const stub = {
    canvas: { width: 1280, height: 720 },
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('begin'); },
    arc() { calls.push('arc'); },
    fill() { calls.push('fill'); },
    set globalAlpha(v) { calls.push('alpha'); },
    set globalCompositeOperation(v) { calls.push('composite:' + v); },
    set fillStyle(v) { calls.push('fillStyle'); },
    get globalAlpha() { return 1; }
  };
  const game = { zoom: 1, canvasW: 640, canvasH: 480, camX: 100, camY: 100, opts: { seed: 42 } };
  drawAmbientDust(stub, game);
  assert.ok(calls.includes('composite:lighter'), 'dust uses additive composite');
  assert.ok(calls.filter((c) => c === 'arc').length >= 8, 'dust drawn as circles');
  assert.ok(calls[0] === 'save' && calls[calls.length - 1] === 'restore', 'save/restore balanced');
}

console.log('fx-ambience: all PASS');
