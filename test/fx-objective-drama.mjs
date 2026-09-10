// 爆炸物与警报（Round 2）测试：bombAlarmSpec / grenadeRenderSpec / siteMarkSpec / ping-fx。
// 契约：
//   bombAlarmSpec(ts, interval) —— 扩散时长 = min(0.5s, 蜂鸣间隔)；r 12→46 线性；alpha (1-t)*0.55 单调衰减到 0。
//   grenadeRenderSpec(kind) —— 三种投掷物体色/中带互不相同；未知 kind 回退 smoke。
//   siteMarkSpec(x0,y0,x1,y1,pulse) —— 角标长 ≤18 且随矩形短边缩放；三个 alpha 随 pulse 单调增。
//   ping-fx —— addPing 上限 PING_MAX 淘汰最旧；activePings 只留 [t0, t0+LIFE) 窗口；
//             pingSpec 半径线性、alpha 前 15% 淡入随后淡出；drawMinimapPings 对 stub ctx 安全。
import assert from 'node:assert/strict';
import { bombAlarmSpec, grenadeRenderSpec, siteMarkSpec } from '../src/render.js';
import {
  PING_LIFE,
  PING_MAX,
  PING_COLORS,
  addPing,
  activePings,
  pingSpec,
  drawMinimapPings
} from '../src/ping-fx.js';

// ---- bombAlarmSpec ----
{
  const fresh = bombAlarmSpec(0, 1);
  assert.ok(Math.abs(fresh.alpha - 0.55) < 1e-9, 'fresh ring alpha 0.55');
  assert.equal(fresh.r, 12, 'ring starts at bomb edge');
  const done = bombAlarmSpec(0.5, 1);
  assert.equal(done.alpha, 0, 'ring fully faded at 0.5s');
  assert.equal(done.r, 46, 'ring reaches 46px');
  // 高频期（interval 0.25）扩散更快：同样 0.3s 已走完
  assert.equal(bombAlarmSpec(0.3, 0.25).alpha, 0, 'fast interval completes sooner');
  // 单调性
  const a1 = bombAlarmSpec(0.1, 1).alpha, a2 = bombAlarmSpec(0.2, 1).alpha;
  assert.ok(a1 > a2, 'alpha monotonic decay');
}

// ---- grenadeRenderSpec ----
{
  const he = grenadeRenderSpec('he');
  const flash = grenadeRenderSpec('flash');
  const smoke = grenadeRenderSpec('smoke');
  for (const s of [he, flash, smoke]) {
    assert.ok(s.body && s.band && s.hi && s.led, 'spec fields present');
  }
  assert.notEqual(he.body, flash.body, 'he/flash body distinct');
  assert.notEqual(he.body, smoke.body, 'he/smoke body distinct');
  assert.notEqual(flash.body, smoke.body, 'flash/smoke body distinct');
  assert.deepEqual(grenadeRenderSpec('unknown'), smoke, 'unknown falls back to smoke');
}

// ---- siteMarkSpec ----
{
  const a = siteMarkSpec(0, 0, 200, 200, 0);
  const b = siteMarkSpec(0, 0, 200, 200, 1);
  assert.equal(a.L, 18, 'L capped at 18 for large sites');
  const small = siteMarkSpec(0, 0, 60, 60, 0.5);
  assert.ok(Math.abs(small.L - 13.2) < 1e-9, 'small site L = 0.22 * 60');
  for (const k of ['fillAlpha', 'lineAlpha', 'bracketAlpha']) {
    assert.ok(a[k] < b[k], `${k} grows with pulse`);
  }
  assert.ok(a.bracketAlpha > 0 && b.bracketAlpha <= 1, 'bracket alpha in range');
}

// ---- ping-fx ----
{
  const game = { time: 100 };
  addPing(game, 'plant', 10, 20);
  addPing(game, 'boom', 30, 40);
  assert.equal(game.pings.length, 2, 'pings recorded');
  for (let i = 0; i < PING_MAX; i++) addPing(game, 'defuse', i, i);
  assert.equal(game.pings.length, PING_MAX, 'cap at PING_MAX');
  assert.equal(game.pings[0].kind, 'defuse', 'oldest two (plant+boom) evicted');
  assert.equal(game.pings[0].x, 0, 'remaining start at first defuse');

  const act = activePings(game.pings, 100.8);
  assert.equal(act.length, PING_MAX, 'all inside window at age 0.8');
  assert.ok(Math.abs(act[0].t - 0.5) < 1e-9, 'progress normalized');
  assert.equal(activePings(game.pings, 100 + PING_LIFE + 0.01).length, 0, 'expired beyond LIFE');
  assert.equal(activePings(game.pings, 99).length, 0, 'future pings excluded');

  const ps = pingSpec(0);
  assert.equal(ps.alpha, 0, 'fade-in starts at 0');
  const peak = pingSpec(0.15);
  assert.ok(Math.abs(peak.alpha - 0.85) < 1e-9, 'peak alpha 0.85 at 15%');
  assert.equal(pingSpec(1).alpha, 0, 'faded at end');
  assert.ok(pingSpec(0.5).r > pingSpec(0.2).r, 'radius grows');

  // 绘制对 stub 安全且返回数量
  const calls = [];
  const stub = new Proxy({}, {
    get(t, k) {
      if (k === 'save' || k === 'restore') return () => calls.push(k);
      if (typeof k === 'string') return (...args) => calls.push(k);
      return undefined;
    },
    set() { return true; }
  });
  const drawn = drawMinimapPings(stub, act, (x) => x * 2, (y) => y * 3);
  assert.equal(drawn, PING_MAX, 'draws all active pings');
  assert.ok(calls.includes('arc') && calls.includes('stroke'), 'arc+stroke issued');
  assert.equal(drawMinimapPings(stub, [], (x) => x, (y) => y), 0, 'empty pings no-op');
  assert.ok(PING_COLORS.plant && PING_COLORS.defuse && PING_COLORS.boom, 'color table present');
}

console.log('fx-objective-drama: all PASS');
