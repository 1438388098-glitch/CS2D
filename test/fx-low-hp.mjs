// 低血量屏幕红边脉冲特效纯逻辑测试（不依赖真实渲染）：
// 契约：lowHpVignette(hp, maxHp, t, dpr) 确定性返回 { alpha, pulse, radius, intensity }，
//       hp/maxHp < 30% 时出现，越低越明显，死亡(0 血)后消失；
//       drawLowHpVignette(ctx, w, h, fx) 仅在 alpha>0 时绘制径向红边。
import { lowHpIntensity, lowHpVignette, drawLowHpVignette } from '../src/screen-fx.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-low-hp: ' + name + ' FAIL');
  console.log('fx-low-hp: ' + name + ' PASS');
}

function same(a, b) {
  return a.alpha === b.alpha && a.pulse === b.pulse && a.radius === b.radius && a.intensity === b.intensity;
}

// 强度：≥30% 无特效，0 血/死亡消失，濒死最强，单调递增
{
  ok('hp>=30% no effect', lowHpIntensity(100, 100) === 0 && lowHpIntensity(30, 100) === 0);
  ok('dead/0hp no effect', lowHpIntensity(0, 100) === 0 && lowHpIntensity(-5, 100) === 0);
  ok('near-death max', lowHpIntensity(1, 100) > 0.95 && lowHpIntensity(0, 100) === 0);
  ok('monotonic lower hp', lowHpIntensity(10, 100) > lowHpIntensity(20, 100) && lowHpIntensity(20, 100) > lowHpIntensity(29, 100));
  ok('maxHp=0 fallback', lowHpIntensity(10, 0) > 0);
}

// vignette 确定性：同输入同输出（含 dpr），跨调用一致
{
  const a = lowHpVignette(20, 100, 1.234, 2);
  const b = lowHpVignette(20, 100, 1.234, 2);
  ok('deterministic same call', same(a, b));
  ok('dpr ignored', same(lowHpVignette(20, 100, 1.234, 1), lowHpVignette(20, 100, 1.234, 4)));
  ok('time drives pulse', lowHpVignette(20, 100, 0, 1).pulse !== lowHpVignette(20, 100, 0.4, 1).pulse);
}

// vignette 行为：血量越低 alpha 越大、radius 越小（红边内缘更靠中心），pulse 恒在 [0,1]
{
  const f20 = lowHpVignette(20, 100, 0, 1);
  const f5 = lowHpVignette(5, 100, 0, 1);
  ok('lower hp stronger alpha', f5.alpha > f20.alpha);
  ok('lower hp tighter radius', f5.radius < f20.radius);
  ok('pulse within [0,1]', f20.pulse >= 0 && f20.pulse <= 1 && f5.pulse >= 0 && f5.pulse <= 1);
  ok('alpha within (0,1]', f5.alpha > 0 && f5.alpha <= 1);
}

// 边界：≥30% 与死亡时为全零（无绘制）
{
  const off = lowHpVignette(50, 100, 3, 1);
  ok('hp>=30% zeroed', off.alpha === 0 && off.pulse === 0 && off.radius === 1 && off.intensity === 0);
  const dead = lowHpVignette(0, 100, 3, 1);
  ok('dead zeroed', dead.alpha === 0 && dead.pulse === 0 && dead.radius === 1 && dead.intensity === 0);
}

// drawLowHpVignette：alpha>0 时创建径向渐变并填充全屏；alpha=0 / 非法输入为 no-op
{
  let calls = [];
  const mkCtx = () => ({
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    fillRect(x, y, w, h) { calls.push('rect:' + x + ',' + y + ',' + w + ',' + h); },
    createRadialGradient(cx, cy, r0, x, y, r1) {
      calls.push('grad:' + cx + ',' + cy + ',' + r0 + ',' + x + ',' + y + ',' + r1);
      return { addColorStop() {} };
    }
  });
  calls = [];
  const c1 = mkCtx();
  drawLowHpVignette(c1, 1280, 720, lowHpVignette(10, 100, 0, 1));
  ok('draws gradient + fullscreen rect', calls.some((c) => c.startsWith('grad:')) && calls.includes('rect:0,0,1280,720'));
  ok('save/restore balanced', calls.filter((c) => c === 'save').length === 1 && calls.filter((c) => c === 'restore').length === 1);
  const c2 = mkCtx();
  calls = [];
  drawLowHpVignette(c2, 1280, 720, { alpha: 0, pulse: 0, radius: 1 });
  ok('alpha=0 is no-op', calls.length === 0);
  calls = [];
  drawLowHpVignette(c2, 0, 720, { alpha: 0.5, pulse: 0.5, radius: 0.6 });
  ok('non-positive w is no-op', calls.length === 0);
}

console.log('fx-low-hp: all PASS');
