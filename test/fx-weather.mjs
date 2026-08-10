// 雨雪天气特效测试（candidate-244）：weatherKind 地图判定 + weatherParticles 纯函数
//（确定性哈希生成、t 循环回卷、轻量封顶）+ drawWeather 纯绘制（stub ctx）。
// 契约：rain 为斜短线（倾角>0、速度快、线长 8~20），snow 为小圆点（半径 1~3.4、速度慢、angle=0）；
//       同 seed 同 t 必同输出；粒子永远落在 [0,w)×[0,h) 内；无 Math.random。
import assert from 'node:assert/strict';
import {
  MAX_PARTICLES, hash01,
  weatherKind, weatherParticles, drawWeather
} from '../src/weather-fx.js';

const W = 512, H = 384, N = 40;

// ---- weatherKind 地图判定 ----
{
  assert.equal(weatherKind('arctic'), 'snow', 'arctic -> snow');
  assert.equal(weatherKind('arctic-2'), 'snow', 'arctic variant -> snow');
  assert.equal(weatherKind('snowpeak'), 'snow', 'snowpeak -> snow');
  assert.equal(weatherKind('frostbite'), 'snow', 'frost -> snow');
  assert.equal(weatherKind('ARCTIC'), 'snow', 'case-insensitive');
  assert.equal(weatherKind('rainy-valley'), 'rain', 'rainy -> rain');
  assert.equal(weatherKind('monsoon'), 'rain', 'monsoon -> rain');
  assert.equal(weatherKind('rainstorm'), 'rain', 'storm -> rain');
  assert.equal(weatherKind('dust2'), null, 'dust2 -> null');
  assert.equal(weatherKind('canal'), null, 'canal -> null');
  assert.equal(weatherKind('metro'), null, 'metro -> null');
  assert.equal(weatherKind(''), null, 'empty -> null');
  assert.equal(weatherKind(null), null, 'null -> null');
  assert.equal(weatherKind(undefined), null, 'undefined -> null');
}

// ---- weatherParticles 结构 / 字段 / 边界 ----
{
  for (const kind of ['rain', 'snow']) {
    const ps = weatherParticles(kind, 0, N, W, H, 7);
    assert.equal(ps.length, N, kind + ' count');
    for (const p of ps) {
      for (const k of ['x', 'y', 'len', 'angle', 'speed', 'alpha']) {
        assert.ok(Number.isFinite(p[k]), kind + ' field ' + k + ' finite');
      }
      assert.ok(p.x >= 0 && p.x < W, kind + ' x bounds');
      assert.ok(p.y >= 0 && p.y < H, kind + ' y bounds');
      assert.ok(p.alpha > 0 && p.alpha <= 1, kind + ' alpha range');
    }
  }
}

// ---- 雨雪形态差异 ----
{
  const rain = weatherParticles('rain', 0, N, W, H, 7);
  const snow = weatherParticles('snow', 0, N, W, H, 7);
  assert.ok(rain.every((p) => p.angle > 0.1), 'rain all slanted');
  assert.ok(snow.every((p) => p.angle === 0), 'snow angle 0');
  assert.ok(rain.every((p) => p.len >= 8 && p.len <= 20), 'rain streak len 8~20');
  assert.ok(snow.every((p) => p.len >= 1 && p.len <= 3.4), 'snow dot radius 1~3.4');
  assert.ok(rain.every((p) => p.speed > 300), 'rain falls fast');
  assert.ok(snow.every((p) => p.speed <= 120), 'snow falls slow');
}

// ---- 确定性 ----
{
  assert.deepEqual(
    weatherParticles('rain', 0, N, W, H, 7),
    weatherParticles('rain', 0, N, W, H, 7),
    'rain deterministic'
  );
  assert.deepEqual(
    weatherParticles('snow', 0, N, W, H, 7),
    weatherParticles('snow', 0, N, W, H, 7),
    'snow deterministic'
  );
  assert.notDeepEqual(
    weatherParticles('rain', 0, N, W, H, 7),
    weatherParticles('rain', 0, N, W, H, 8),
    'seed varies'
  );
  assert.ok(
    hash01(1, 2, 3) >= 0 && hash01(1, 2, 3) < 1 && hash01(1, 2, 3) === hash01(1, 2, 3),
    'hash01 ranged & stable'
  );
}

// ---- t 循环回卷 ----
{
  for (const kind of ['rain', 'snow']) {
    const ps0 = weatherParticles(kind, 0, N, W, H, 7);
    const ps1 = weatherParticles(kind, 2.5, N, W, H, 7);
    const psBig = weatherParticles(kind, 1e9, N, W, H, 7);
    assert.ok(ps1.some((p, i) => p.y !== ps0[i].y), kind + ' falls over time');
    assert.ok(psBig.every((p) => p.y >= 0 && p.y < H), kind + ' wraps large t');
  }
}

// ---- 轻量封顶 / 非法输入 ----
{
  assert.equal(weatherParticles('rain', 0, 0, W, H, 7).length, 0, 'zero count');
  assert.equal(weatherParticles('rain', 0, 99999, W, H, 7).length, MAX_PARTICLES, 'capped at MAX_PARTICLES');
  assert.equal(weatherParticles('rain', 0, -5, W, H, 7).length, 0, 'negative count -> 0');
  assert.equal(weatherParticles('fog', 0, N, W, H, 7).length, 0, 'unknown kind -> empty');
  const df = weatherParticles('rain', 0, N, NaN, NaN, 7);
  assert.ok(df.every((p) => p.x >= 0 && p.x < 640 && p.y >= 0 && p.y < 480), 'non-finite w/h fallback dims');
}

// ---- drawWeather（stub ctx）----
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

  const rain = weatherParticles('rain', 0, 5, W, H, 7);
  calls.length = 0;
  drawWeather(stub, rain, 'rain');
  assert.equal(calls.filter((c) => c === 'moveTo').length, 5, 'rain one line per particle');
  assert.equal(calls.filter((c) => c === 'lineTo').length, 5, 'rain lineTo count');
  assert.equal(calls.filter((c) => c === 'stroke').length, 5, 'rain stroke count');
  assert.equal(calls.filter((c) => c === 'arc').length, 0, 'rain draws no circles');
  assert.ok(calls[0] === 'save' && calls[calls.length - 1] === 'restore', 'rain save/restore balanced');
  assert.equal(calls[calls.length - 2], 'alpha:1', 'rain globalAlpha reset before restore');

  const snow = weatherParticles('snow', 0, 5, W, H, 7);
  calls.length = 0;
  drawWeather(stub, snow, 'snow');
  assert.equal(calls.filter((c) => c === 'arc').length, 5, 'snow one circle per particle');
  assert.equal(calls.filter((c) => c === 'fill').length, 5, 'snow fill count');
  assert.equal(calls.filter((c) => c === 'moveTo').length, 0, 'snow draws no lines');
  assert.ok(calls[0] === 'save' && calls[calls.length - 1] === 'restore', 'snow save/restore balanced');
  assert.equal(calls[calls.length - 2], 'alpha:1', 'snow globalAlpha reset');

  calls.length = 0;
  drawWeather(stub, [], 'rain');
  assert.equal(calls.length, 0, 'empty particles skip drawing');
  calls.length = 0;
  drawWeather(stub, rain, 'fog');
  assert.equal(calls.length, 0, 'unknown kind skip drawing');
  assert.doesNotThrow(() => drawWeather(null, rain, 'rain'), 'null ctx safe');
  assert.doesNotThrow(() => drawWeather(stub, null, 'rain'), 'null particles safe');
}

console.log('fx-weather: all PASS');
