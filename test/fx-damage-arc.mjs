// 受击方向红弧特效纯逻辑测试（candidate-308，不依赖真实渲染）：
// 契约：damageArc(directionRad, t, power) 确定性返回 { alpha, angle, spread, r0, r1 }，
//       t 为受击后流逝秒数，0.3s 内 alpha 从 1 线性衰减到 0（闪现渐隐），
//       angle 为伤害来源方向角，spread 为弧半宽，r0/r1 为弧带内外半径（相对 min(w,h)/2）；
//       power 越高红弧越醒目；drawDamageArc(ctx, w, h, fx) 仅在 alpha>0 时绘制受击方向弧形扇带。
import { damageArc, drawDamageArc, HIT_ARC_DURATION } from '../src/damage-fx.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-damage-arc: ' + name + ' FAIL');
  console.log('fx-damage-arc: ' + name + ' PASS');
}

// 时长：0.3s 渐隐，t=0 时最强，超出后保持 0；负 t 视为刚受击（alpha=1）
{
  ok('duration is 0.3', HIT_ARC_DURATION === 0.3);
  ok('start full alpha', damageArc(0, 0).alpha === 1);
  ok('half-time mid alpha', damageArc(0, 0.15).alpha === 0.5);
  ok('end zero alpha', damageArc(0, 0.3).alpha === 0);
  ok('past end stays zero', damageArc(0, 0.5).alpha === 0 && damageArc(0, 10).alpha === 0);
  ok('negative clamps to 1', damageArc(0, -0.1).alpha === 1);
  ok('monotonic decay', damageArc(0, 0.1).alpha > damageArc(0, 0.2).alpha && damageArc(0, 0.2).alpha > damageArc(0, 0.29).alpha);
}

// 弧参数：angle 保留伤害来源角，spread/r0/r1 为固定正值常量，r0 < r1
{
  const fx = damageArc(1.234, 0.1);
  ok('angle preserved', fx.angle === 1.234);
  ok('angle wraps negative direction', damageArc(-2.5, 0.1).angle === -2.5);
  ok('spread positive', fx.spread > 0 && fx.spread < Math.PI);
  ok('r0/r1 in range', fx.r0 > 0 && fx.r1 > 0 && fx.r0 < 1 && fx.r1 <= 1);
  ok('r0 inside r1', fx.r0 < fx.r1);
}

// 结束态：t ≥ 0.3 时全部参数归零（不绘制）
{
  const off = damageArc(2.5, 0.3);
  ok('ended zeroed', off.alpha === 0 && off.angle === 0 && off.spread === 0 && off.r0 === 0 && off.r1 === 0);
}

// 确定性：同输入同输出，非有限 t 回退为 0，非有限 angle 回退为 0
{
  const a = damageArc(0.7, 0.2);
  const b = damageArc(0.7, 0.2);
  ok('deterministic', a.alpha === b.alpha && a.angle === b.angle && a.spread === b.spread && a.r0 === b.r0 && a.r1 === b.r1);
  ok('NaN t falls back to t=0', damageArc(0, NaN).alpha === damageArc(0, 0).alpha);
  ok('Infinity t falls back to t=0', damageArc(0, Infinity).alpha === damageArc(0, 0).alpha);
  ok('NaN angle falls back to 0', damageArc(NaN, 0.1).angle === 0);
}

// 强度分级：高伤害红弧更亮、更宽、弧带更厚；非有限/越界强度安全回退
{
  const low = damageArc(0, 0, 0.2);
  const high = damageArc(0, 0, 1);
  ok('severity raises alpha', low.alpha < high.alpha);
  ok('severity widens spread', low.spread < high.spread);
  ok('severity thickens radial band', low.r0 > high.r0 && low.r1 < high.r1);
  ok('severity clamps below 0', damageArc(0, 0, -2).alpha === damageArc(0, 0, 0).alpha);
  ok('severity clamps above 1', damageArc(0, 0, 3).alpha === damageArc(0, 0, 1).alpha);
  ok('NaN severity falls back to max', damageArc(0, 0, NaN).alpha === damageArc(0, 0, 1).alpha);
}

// drawDamageArc：alpha>0 时创建径向渐变 + 内外弧扇带填充；save/restore 平衡
{
  let calls = [];
  const mkCtx = () => ({
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); },
    closePath() { calls.push('closePath'); },
    fill() { calls.push('fill'); },
    set fillStyle(v) { calls.push('fillStyle:' + v); },
    arc(x, y, r, a0, a1, ccw) { calls.push('arc:' + x + ',' + y + ',' + r + ',' + a0 + ',' + a1 + ',' + ccw); },
    createRadialGradient(cx, cy, r0, x, y, r1) {
      calls.push('grad:' + cx + ',' + cy + ',' + r0 + ',' + x + ',' + y + ',' + r1);
      return { addColorStop() {} };
    }
  });
  const c1 = mkCtx();
  calls = [];
  // w=1280, h=720 -> edge=min(w,h)/2=360, cx=640, cy=360
  drawDamageArc(c1, 1280, 720, damageArc(0, 0.1));
  // 角度 0，spread 0.62：a0=-0.62, a1=0.62；r0=360*0.8=288, r1=360*1=360
  ok('draws radial gradient', calls.includes('grad:640,360,288,640,360,360'));
  ok('draws outer arc', calls.includes('arc:640,360,360,-0.62,0.62,false'));
  ok('draws inner arc reversed', calls.includes('arc:640,360,288,0.62,-0.62,true'));
  ok('fills after path', calls.includes('fill'));
  ok('save/restore balanced', calls.filter((c) => c === 'save').length === 1 && calls.filter((c) => c === 'restore').length === 1);
  const c2 = mkCtx();
  calls = [];
  drawDamageArc(c2, 1280, 720, damageArc(0, 0.3));
  ok('alpha=0 is no-op', calls.length === 0);
  calls = [];
  drawDamageArc(c2, 0, 720, damageArc(0, 0.1));
  ok('non-positive w is no-op', calls.length === 0);
  calls = [];
  drawDamageArc(c2, 1280, 720, null);
  ok('null fx is no-op', calls.length === 0);
}

console.log('fx-damage-arc: all PASS');
