// 击杀屏幕边缘白色闪光特效纯逻辑测试（candidate-304，不依赖真实渲染）：
// 契约：killFlash(t) 确定性返回 { alpha, edge }，t 为击杀后流逝秒数，
//       0.35s 内 alpha 从 1 线性衰减到 0，edge 固定为 ['left','right','bottom']；
//       drawKillFlash(ctx, w, h, fx) 仅在 alpha>0 时对左右下三边绘制白色渐变闪光。
import { killFlash, drawKillFlash } from '../src/screen-fx.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-kill-flash: ' + name + ' FAIL');
  console.log('fx-kill-flash: ' + name + ' PASS');
}

// alpha 衰减：t=0 时最强，0.35s 时归零，超出后保持 0；负 t 视为刚击杀（alpha=1）
{
  ok('start full alpha', killFlash(0).alpha === 1);
  ok('half-time mid alpha', killFlash(0.175).alpha === 0.5);
  ok('end zero alpha', killFlash(0.35).alpha === 0);
  ok('past end stays zero', killFlash(0.5).alpha === 0 && killFlash(10).alpha === 0);
  ok('negative clamps to 1', killFlash(-0.1).alpha === 1);
  ok('monotonic decay', killFlash(0.1).alpha > killFlash(0.2).alpha && killFlash(0.2).alpha > killFlash(0.3).alpha);
}

// edge 固定为左/右/下三边
{
  const fx = killFlash(0.1);
  ok('edge is array', Array.isArray(fx.edge));
  ok('edge has three sides', fx.edge.length === 3);
  ok('edges are left/right/bottom', fx.edge.includes('left') && fx.edge.includes('right') && fx.edge.includes('bottom'));
  ok('no top edge', !fx.edge.includes('top'));
}

// 确定性：同输入同输出，非有限 t 回退为 0
{
  const a = killFlash(0.2);
  const b = killFlash(0.2);
  ok('deterministic', a.alpha === b.alpha && JSON.stringify(a.edge) === JSON.stringify(b.edge));
  ok('NaN falls back to t=0', killFlash(NaN).alpha === killFlash(0).alpha);
  ok('Infinity falls back to t=0', killFlash(Infinity).alpha === killFlash(0).alpha);
}

// drawKillFlash：alpha>0 时对三边各画一个渐变 + 全深度矩形；save/restore 平衡
{
  let calls = [];
  const mkCtx = () => ({
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    fillRect(x, y, w, h) { calls.push('rect:' + x + ',' + y + ',' + w + ',' + h); },
    createLinearGradient(x0, y0, x1, y1) {
      calls.push('grad:' + x0 + ',' + y0 + ',' + x1 + ',' + y1);
      return { addColorStop() {} };
    }
  });
  const c1 = mkCtx();
  calls = [];
  drawKillFlash(c1, 1280, 720, killFlash(0));
  const grads = calls.filter((c) => c.startsWith('grad:'));
  const rects = calls.filter((c) => c.startsWith('rect:'));
  ok('draws 3 edge gradients', grads.length === 3);
  ok('draws 3 edge rects', rects.length === 3);
  ok('left/right/bottom bands', rects[0] === 'rect:0,0,158.4,720' && rects[1] === 'rect:1121.6,0,158.4,720' && rects[2] === 'rect:0,561.6,1280,158.4');
  ok('save/restore balanced', calls.filter((c) => c === 'save').length === 1 && calls.filter((c) => c === 'restore').length === 1);
  const c2 = mkCtx();
  calls = [];
  drawKillFlash(c2, 1280, 720, killFlash(0.35));
  ok('alpha=0 is no-op', calls.length === 0);
  calls = [];
  drawKillFlash(c2, 0, 720, killFlash(0));
  ok('non-positive w is no-op', calls.length === 0);
  calls = [];
  drawKillFlash(c2, 1280, 720, null);
  ok('null fx is no-op', calls.length === 0);
}

console.log('fx-kill-flash: all PASS');
