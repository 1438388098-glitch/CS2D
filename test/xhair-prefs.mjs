// 准星自定义偏好（Round 4）契约测试：crosshair-prefs 纯偏好模块。
// 契约：
//   默认值 = { color:'#ffffff', len:7, gap:6, thickness:1.5, dot:true }；
//   setCrosshairPrefs 合并写入（未提供键保持原值），数值夹取（len 2-16 / gap 0-14 / thickness 1-3.5）；
//   非法颜色（非 #rrggbb）忽略；crosshairColorCss 输出 rgba 字符串；reset 回默认。
//   hud.js / index.html 源码钉：三处绘制消费偏好、设置面板存在准星节。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CROSSHAIR_DEFAULTS, CROSSHAIR_COLORS,
  crosshairStyle, crosshairColorCss,
  setCrosshairPrefs, resetCrosshairPrefs, __resetCrosshairPrefsForTest
} from '../src/crosshair-prefs.js';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');

__resetCrosshairPrefsForTest();
{
  assert.deepEqual(crosshairStyle(), CROSSHAIR_DEFAULTS, 'defaults');
  assert.deepEqual(crosshairStyle(), crosshairStyle(), 'stable snapshot');

  const s = setCrosshairPrefs({ color: '#00FFEA', len: 99, gap: -3, thickness: 9, dot: false, junk: 1 });
  assert.equal(s.color, '#00ffea', 'color lowercased & accepted');
  assert.equal(s.len, 16, 'len clamped to max');
  assert.equal(s.gap, 0, 'gap clamped to min');
  assert.equal(s.thickness, 3.5, 'thickness clamped to max');
  assert.equal(s.dot, false, 'dot toggled');
  assert.equal(s.junk, undefined, 'unknown keys ignored');

  assert.equal(setCrosshairPrefs({ color: 'red' }).color, '#00ffea', 'invalid color ignored');
  assert.equal(crosshairColorCss(0.85), 'rgba(0,255,234,0.85)', 'css builder');

  const r = resetCrosshairPrefs();
  assert.deepEqual(r, CROSSHAIR_DEFAULTS, 'reset restores defaults');
}

// 源码钉：绘制消费偏好 + 面板控件存在
{
  const hud = readFileSync(join(here, 'src', 'hud.js'), 'utf8');
  assert.ok(hud.includes('crosshairStyle()'), 'render consumes crosshairStyle');
  assert.ok((hud.match(/xh\.thickness/g) || []).length >= 2, 'both draw sites use thickness');
  assert.ok(hud.includes('if (xh.dot)'), 'center dot gated by pref');
  const html = readFileSync(join(here, 'index.html'), 'utf8');
  for (const id of ['xhairColors', 'xhairLen', 'xhairGap', 'xhairThickness', 'xhairDot', 'xhairReset']) {
    assert.ok(html.includes('id="' + id + '"'), 'settings control ' + id);
  }
  assert.ok(readFileSync(join(here, 'src', 'ui.js'), 'utf8').includes('CROSSHAIR_COLORS'), 'ui builds swatches');
  assert.ok(CROSSHAIR_COLORS.length >= 6, 'palette has options');
}

__resetCrosshairPrefsForTest();
console.log('xhair-prefs: all PASS');
