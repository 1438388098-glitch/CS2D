// UI 动效（Round 4）测试：hpBarColor 分档 / 击杀信息退场时序常量 / #flash 白屏回归钉。
// 契约：
//   hpBarColor(hp) —— >60 绿 / 31~60 琥珀 / ≤30 红（含边界，含 0 与超满夹取语义按原始 hp）。
//   ui.js —— KF_LIFE_MS=5200 存活期、KF_OUT_MS=260 退场动画期，OUT < LIFE；node 导入无 DOM 依赖。
//   styles.css —— #flash 必须是 position:fixed 全屏层（曾因缺 fixed 导致 0 高度、闪光弹白屏不可见）
//                 且带径向渐变（中心纯白过曝）；.kf.out 退场动画类与 kfout 关键帧存在。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hpBarColor } from '../src/render.js';
import { KF_LIFE_MS, KF_OUT_MS } from '../src/ui.js';

// ---- hpBarColor ----
{
  assert.equal(hpBarColor(100), '#5ade7c', 'full hp green');
  assert.equal(hpBarColor(61), '#5ade7c', '61 green');
  assert.equal(hpBarColor(60), '#ffc44d', '60 amber');
  assert.equal(hpBarColor(31), '#ffc44d', '31 amber');
  assert.equal(hpBarColor(30), '#ff5a4d', '30 red');
  assert.equal(hpBarColor(1), '#ff5a4d', '1 red');
  assert.equal(hpBarColor(0), '#ff5a4d', '0 red (bar hidden by caller)');
}

// ---- 击杀信息时序 ----
{
  assert.equal(KF_LIFE_MS, 5200, 'life matches legacy 5.2s');
  assert.equal(KF_OUT_MS, 260, 'out anim 260ms');
  assert.ok(KF_OUT_MS < KF_LIFE_MS, 'out shorter than life');
}

// ---- styles.css 回归钉 ----
{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8');
  const flashRule = css.match(/#flash\{[^}]*\}/);
  assert.ok(flashRule, '#flash rule exists');
  assert.ok(/position:fixed/.test(flashRule[0]), '#flash is position:fixed (0-height regression guard)');
  assert.ok(/inset:0/.test(flashRule[0]), '#flash covers viewport');
  assert.ok(/radial-gradient/.test(flashRule[0]), '#flash uses overexposure gradient');
  assert.ok(/\.kf\.out\{animation:kfout/.test(css), 'killfeed out animation class wired');
  assert.ok(/@keyframes kfout\{from\{opacity:1/.test(css), 'kfout keyframes defined');
}

console.log('fx-ui-motion: all PASS');
