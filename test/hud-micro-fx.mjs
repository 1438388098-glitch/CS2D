// HUD 微交互（Round 5）测试：击杀信息武器图标反查 / CSS 回归钉。
// 契约：
//   weaponIconByName —— WEAPONS 显示名（如 'AK-47'）→ 图标 id；nade 键名兜底（'he'→ic-grenade）；
//                       未知名返回 null（killfeed 无图标但不报错）。
//   styles.css —— .kf-ic 击杀图标类、.hl-moneydelta 资金浮动类与 moneyfloat 关键帧存在。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { weaponIconByName } from '../src/ui-dom.js';

{
  assert.equal(weaponIconByName('AK-47'), 'ic-ak', 'AK-47 name reverse lookup');
  assert.equal(weaponIconByName('he'), 'ic-grenade', 'nade key fallback');
  assert.equal(weaponIconByName('flash'), 'ic-flash', 'flash fallback');
  assert.equal(weaponIconByName('不存在武器'), null, 'unknown name -> null');
  assert.equal(weaponIconByName(undefined), null, 'undefined safe');
}

{
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8');
  assert.ok(/\.kf-ic\{/.test(css), 'killfeed icon class present');
  assert.ok(/\.hl-moneydelta\{/.test(css), 'money delta class present');
  assert.ok(/@keyframes moneyfloat\{/.test(css), 'moneyfloat keyframes present');
  assert.ok(/\.hl-moneydelta\.gain\{/.test(css) && /\.hl-moneydelta\.loss\{/.test(css), 'gain/loss variants present');
}

console.log('hud-micro-fx: all PASS');
