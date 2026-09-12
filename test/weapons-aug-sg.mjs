// 新武器批次（Round 8）契约测试：AUG / SG 553 步枪对。
// 契约：
//   WEAPONS.aug / WEAPONS.sg553 已注册：kind=rifle、auto、30 发弹匣、价格区间合理；
//   定位差异：SG 553 伤害更高且带 armorPen，AUG 更精准（spread 更小、recoil 恢复更快）；
//   购买菜单（ui.js 源码钉）步枪栏包含两者且图标走 ic-rifle；
//   口径分档：kind=rifle 命中 tracerStyle 的 rifle 档。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WEAPONS } from '../src/config.js';
import { tracerStyle } from '../src/render.js';

{
  const aug = WEAPONS.aug;
  const sg = WEAPONS.sg553;
  assert.ok(aug && sg, 'both weapons registered');
  for (const w of [aug, sg]) {
    assert.equal(w.kind, 'rifle', 'kind rifle');
    assert.equal(w.auto, true, 'full auto');
    assert.equal(w.mag, 30, '30 round mag');
    assert.ok(w.price >= 2900 && w.price <= 3400, 'mid-tier price');
    assert.ok(w.range >= 1200, 'rifle range');
  }
  // 定位差异
  assert.ok(sg.dmg > aug.dmg, 'SG 553 hits harder');
  assert.ok(aug.spread < sg.spread, 'AUG is more precise');
  assert.ok(aug.ballistic.recover > sg.ballistic.recover, 'AUG recoil recovers faster');
  assert.equal(sg.armorPen, 0.35, 'SG 553 armor pen');
  assert.ok(!(aug.armorPen > 0), 'AUG uses default armor model');

  // 通用购买链路可用（WEAPONS 价格驱动）
  assert.equal(aug.price, 3300, 'AUG price');
  assert.equal(sg.price, 3000, 'SG 553 price');

  // 口径分档：rifle 档存在（t=0 为最亮时刻，见 fx-tracer 契约）
  const t = tracerStyle(0, 'rifle');
  assert.ok(t.alpha > 0 && t.width > 0, 'rifle tracer tier');
}

{
  const ui = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui.js'), 'utf8');
  assert.ok(/\['aug', 'AUG'/.test(ui), 'buy menu lists AUG');
  assert.ok(/\['sg553', 'SG 553'/.test(ui), 'buy menu lists SG 553');
  assert.ok(/aug: 'ic-rifle'/.test(ui), 'AUG icon alias');
}

console.log('weapons-aug-sg: all PASS');
