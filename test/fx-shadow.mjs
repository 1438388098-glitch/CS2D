// 2D 环境光照与阴影增强纯逻辑测试（candidate-309，不依赖真实渲染）。
// 契约：
//   shadowFor(tx,ty,ch,lightDirRad) 确定性返回 {dx,dy,alpha,w,len}：
//     墙(#/=) > 箱(C/D/o) > 车辆(预留类别) 有投影且 alpha/len 依次递减；普通地面全零；
//     投影方向 (dx,dy) 为光源反方向（单位向量）。
//   visibleShadows(tiles, viewport, lightDirRad) 只返回可视范围(+边距)内能投影的瓦片，
//     不含普通地面，网格/描述符两种形态等价。
//   drawShadows(ctx, shadows) 对有效阴影各画核心影+两层羽化影（渐变优先、flat 兜底），
//     alpha/len 非正或 ctx 缺失为空操作；save/restore 成对平衡。
import {
  shadowFor,
  visibleShadows,
  drawShadows,
  softenShadowLayer,
  categoryFor,
  WALL_CHARS,
  CRATE_CHARS,
  MAX_SHADOW_LEN
} from '../src/shadow-fx.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-shadow: ' + name + ' FAIL');
  console.log('fx-shadow: ' + name + ' PASS');
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }

// ---- shadowFor：类别与强度 ----
{
  const wall = shadowFor(1, 1, '#', 0);
  const thin = shadowFor(1, 1, '=', 0);
  const crate = shadowFor(1, 1, 'D', 0);
  const cover = shadowFor(1, 1, 'C', 0);
  const barrel = shadowFor(1, 1, 'o', 0);
  const veh = shadowFor(1, 1, 'vehicle', 0); // 车辆类别（显式类别名）
  const ground = shadowFor(1, 1, '.', 0);
  ok('wall casts shadow', wall.alpha > 0 && wall.len > 0 && wall.w > 0);
  ok('thin wall casts shadow', thin.alpha > 0);
  ok('crate casts shadow', crate.alpha > 0);
  ok('cover casts shadow', cover.alpha > 0);
  ok('barrel casts shadow', barrel.alpha > 0);
  ok('vehicle casts shadow', veh.alpha > 0);
  ok('wall stronger than crate', wall.alpha > crate.alpha && wall.len > crate.len);
  ok('crate stronger than vehicle', crate.alpha > veh.alpha);
  ok('ground casts none', ground.alpha === 0 && ground.len === 0 && ground.w === 0);
  ok('platform casts none', shadowFor(2, 2, '^', 0).len === 0);
  ok('water casts none', shadowFor(2, 2, '~', 0).len === 0);
  ok('unknown char is ground', shadowFor(2, 2, '?', 0).alpha === 0);
}

// ---- shadowFor：投影方向与单位长度 ----
{
  const s = shadowFor(3, 3, '#', 0); // 光自 +x 来 -> 影朝 -x
  ok('shadow opposes light (light=0)', near(s.dx, -1) && near(s.dy, 0));
  const s2 = shadowFor(3, 3, '#', Math.PI / 2); // 光自 +y 来 -> 影朝 -y
  ok('shadow opposes light (light=PI/2)', near(s2.dx, 0) && near(s2.dy, -1));
  for (const a of [0, 0.7, Math.PI, -2, 5]) {
    const u = shadowFor(4, 4, '#', a);
    ok('shadow dir unit len @' + a, near(Math.hypot(u.dx, u.dy), 1));
  }
}

// ---- shadowFor：确定性 / 边界 ----
{
  const a = shadowFor(5, 6, '#', 1.3);
  const b = shadowFor(5, 6, '#', 1.3);
  ok('deterministic', JSON.stringify(a) === JSON.stringify(b));
  ok('len stays within MAX_SHADOW_LEN', shadowFor(0, 0, '#', 0).len <= MAX_SHADOW_LEN);
  ok('alpha in (0,1)', shadowFor(0, 0, '#', 0).alpha > 0 && shadowFor(0, 0, '#', 0).alpha < 1);
  ok('NaN light falls back', shadowFor(5, 6, '#', NaN).dx === shadowFor(5, 6, '#', 0).dx + 0); // 有限回退
  ok('NaN tile falls back to 0', shadowFor(NaN, 6, '#', 0).alpha === shadowFor(0, 6, '#', 0).alpha);
}

// ---- categoryFor / 字符集合 ----
{
  ok('category wall #', categoryFor('#') === 'wall');
  ok('category wall =', categoryFor('=') === 'wall');
  ok('category crate D', categoryFor('D') === 'crate');
  ok('category crate C', categoryFor('C') === 'crate');
  ok('category crate o', categoryFor('o') === 'crate');
  ok('category vehicle V', categoryFor('vehicle') === 'vehicle');
  ok('category ground', categoryFor('.') === 'ground');
  ok('WALL_CHARS covers # and =', WALL_CHARS.has('#') && WALL_CHARS.has('='));
  ok('CRATE_CHARS covers C,D,o', CRATE_CHARS.has('C') && CRATE_CHARS.has('D') && CRATE_CHARS.has('o'));
}

// ---- visibleShadows：网格形态只扫可视范围 ----
{
  const grid = {
    tile: 40,
    grid: ['..........', '.#........', '.D........', '..........']
  };
  const vp = { x: 0, y: 0, w: 40, h: 40 };
  const list = visibleShadows(grid, vp, 0);
  ok('grid form finds visible shadow tiles', list.length === 2);
  ok('grid form has wall tile', list.some((s) => s.ch === '#' && s.tx === 1 && s.ty === 1));
  ok('grid form has crate tile', list.some((s) => s.ch === 'D' && s.tx === 1 && s.ty === 2));
  ok('grid form excludes ground', list.every((s) => s.alpha > 0));
  const all = visibleShadows(grid, { x: -9999, y: -9999, w: 99999, h: 99999 }, 0);
  ok('big viewport same set', all.length === 2);
  const none = visibleShadows(grid, { x: 4000, y: 4000, w: 40, h: 40 }, 0);
  ok('far viewport yields none', none.length === 0);
}

// ---- visibleShadows：描述符形态 ----
{
  const tiles = [
    { tx: 5, ty: 5, ch: '#' },
    { tx: 50, ty: 50, ch: 'D' },
    { tx: 1, ty: 1, ch: '.' },
    { tx: 2, ty: 2 }
  ];
  const list = visibleShadows(tiles, { x: 0, y: 0, w: 400, h: 400 }, 0);
  ok('array form filters to viewport', list.length === 1);
  ok('array form keeps wall at (5,5)', list[0].tx === 5 && list[0].ty === 5 && list[0].ch === '#');
  ok('array form includes pixel info', list[0].tile === 40);
  const same = visibleShadows(tiles, { x: 0, y: 0, w: 400, h: 400 }, 0);
  ok('array form deterministic', JSON.stringify(list) === JSON.stringify(same));
  ok('null tiles no-op', visibleShadows(null, { x: 0, y: 0, w: 40, h: 40 }, 0).length === 0);
}

// ---- drawShadows：多层羽化 + 渐变 + save/restore 平衡 ----
{
  const mkCtx = (withGrad) => {
    const calls = [];
    return {
      calls,
      save() { calls.push('save'); },
      restore() { calls.push('restore'); },
      beginPath() { calls.push('beginPath'); },
      moveTo() { calls.push('move'); },
      lineTo() { calls.push('line'); },
      closePath() { calls.push('close'); },
      fill() { calls.push('fill'); },
      createLinearGradient: withGrad
        ? () => { calls.push('grad'); return { addColorStop() {} }; }
        : undefined
    };
  };
  const shadows = [
    { tx: 2, ty: 3, tile: 40, ch: '#', dx: -1, dy: 0, alpha: 0.3, w: 0.9, len: 1.1 },
    { tx: 8, ty: 3, tile: 40, ch: 'D', dx: -1, dy: 0, alpha: 0.2, w: 0.8, len: 0.7 }
  ];
  const c1 = mkCtx(true);
  drawShadows(c1, shadows);
  ok('draws three soft passes per shadow', c1.calls.filter((c) => c === 'fill').length === 6);
  ok('uses gradient when available', c1.calls.filter((c) => c === 'grad').length === 6);
  ok('one save/restore pair', c1.calls.filter((c) => c === 'save').length === 1 && c1.calls.filter((c) => c === 'restore').length === 1);
  const c2 = mkCtx(false);
  drawShadows(c2, shadows);
  ok('flat fallback still fills', c2.calls.includes('fill'));
  ok('flat fallback no gradient', !c2.calls.includes('grad'));
  const c3 = mkCtx(true);
  drawShadows(c3, [{ ...shadows[0], alpha: 0 }]);
  ok('alpha=0 is no-op', c3.calls.length === 0);
  drawShadows(c3, [{ ...shadows[0], len: 0 }]);
  ok('len=0 is no-op', c3.calls.length === 0);
  drawShadows(c3, []);
  ok('empty array no-op', c3.calls.length === 0);
  drawShadows(null, shadows);
  ok('null ctx no-op', c3.calls.length === 0);
  const c4 = mkCtx(true);
  drawShadows(c4, shadows.concat([{ ...shadows[0], alpha: 0 }]));
  ok('mixed valid/invalid draws only valid', c4.calls.filter((c) => c === 'fill').length === 6);
  const domless = { width: 4, height: 4 };
  ok('soften returns source without DOM', softenShadowLayer(domless) === domless);
}

console.log('fx-shadow: all PASS');
