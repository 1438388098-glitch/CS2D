// HUD 弹药低量警示纯逻辑测试（candidate-291）：ammoWarning(ammo, mag, t)
// 契约：ammo 弹匣弹量 / mag 弹容 / t 时刻(ms) → { warning, level: 'ok'|'low'|'critical', blink }
// 确定性：blink 仅由 t 推导，不读取 Date/performance
import { ammoWarning } from '../src/hud.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-ammo-warn: ' + name + ' FAIL');
  console.log('fx-ammo-warn: ' + name + ' PASS');
}

function same(a, b) {
  return a.warning === b.warning && a.level === b.level && a.blink === b.blink;
}

// 满弹匣不警示
{
  const r = ammoWarning(30, 30, 0);
  ok('full mag level ok', r.level === 'ok');
  ok('full mag warning false', r.warning === false);
  ok('full mag blink false', r.blink === false);
}

// 高于 20% 弹容不警示
{
  ok('ratio 0.266 is ok', ammoWarning(8, 30, 0).level === 'ok');
  ok('ratio 0.4 is ok', ammoWarning(4, 10, 0).level === 'ok');
}

// ≤20% 弹容 → low
{
  const r = ammoWarning(6, 30, 0);
  ok('ratio 0.2 is low', r.level === 'low');
  ok('low warning true', r.warning === true);
  ok('ratio 0.166 is low', ammoWarning(5, 30, 0).level === 'low');
  ok('ratio 0.5 not low', ammoWarning(5, 10, 0).level === 'ok');
}

// 最后几发 / ≤10% → critical
{
  ok('ratio 0.1 is critical', ammoWarning(3, 30, 0).level === 'critical');
  ok('last 2 rounds critical', ammoWarning(2, 30, 0).level === 'critical');
  ok('last 1 round critical', ammoWarning(1, 30, 0).level === 'critical');
  ok('empty mag critical', ammoWarning(0, 30, 0).level === 'critical');
  ok('critical warning true', ammoWarning(0, 30, 0).warning === true);
}

// 近战/无弹容武器（mag=0）不警示
{
  const r = ammoWarning(0, 0, 0);
  ok('melee level ok', r.level === 'ok');
  ok('melee warning false', r.warning === false);
  ok('melee blink false', r.blink === false);
}

// 非法输入（负弹量）不警示
{
  ok('negative ammo ok', ammoWarning(-1, 30, 0).warning === false);
  ok('undefined ammo ok', ammoWarning(undefined, 30, 0).warning === false);
}

// blink 确定性：同 t 同结果，且按周期翻转
{
  ok('same t same result', same(ammoWarning(5, 30, 123), ammoWarning(5, 30, 123)));
  ok('low blink on at t0', ammoWarning(5, 30, 0).blink === true);
  ok('low blink on before half period', ammoWarning(5, 30, 479).blink === true);
  ok('low blink off at half period', ammoWarning(5, 30, 480).blink === false);
  ok('low blink on again after full period', ammoWarning(5, 30, 960).blink === true);
  ok('critical blinks faster (t240 off)', ammoWarning(2, 30, 240).blink === false);
  ok('critical blinks faster (t480 on)', ammoWarning(2, 30, 480).blink === true);
}

// blink 只在 warning 时出现
{
  ok('ok level never blinks', ammoWarning(30, 30, 5000).blink === false);
  ok('ok level no blink at boundary t', ammoWarning(30, 30, 480).blink === false);
}

// 阈值可覆盖（opts）便于定制与边界测试
{
  ok('lowRatio override lifts to low', ammoWarning(6, 30, 0, { lowRatio: 0.3 }).level === 'low');
  ok('criticalMin override lifts to critical', ammoWarning(6, 30, 0, { criticalMin: 6 }).level === 'critical');
  ok('criticalRatio override lifts to critical', ammoWarning(6, 30, 0, { criticalRatio: 0.25 }).level === 'critical');
  ok('period override keeps determinism', ammoWarning(5, 30, 1000, { lowPeriod: 250 }).blink === ammoWarning(5, 30, 1000, { lowPeriod: 250 }).blink);
}

console.log('fx-ammo-warn: all PASS');
