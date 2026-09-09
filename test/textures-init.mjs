import { installStubs } from './stubdom.js';
installStubs();

import { initTextures } from '../src/textures.js';

function ok(name, cond) {
  if (!cond) throw new Error('textures-init: ' + name + ' FAIL');
  console.log('textures-init: ' + name + ' PASS');
}

// 小地图留边推导：mmScale = min(480/W, 360/H)，内容居中（mmOx/mmOy ≥ 0 且恰为剩余空间一半）
function expected(W, H) {
  const s = Math.min(480 / W, 360 / H);
  return { s, ox: (480 - W * s) / 2, oy: (360 - H * s) / 2 };
}

const cases = [
  { name: 'dust2 (4:3)', W: 1920, H: 1440 },
  { name: '竖长单挑图 (portrait)', W: 1520, H: 1280 },
  { name: '横长图 (wide)', W: 2400, H: 1200 }
];

for (const c of cases) {
  const map = {
    id: 'test-' + c.name, name: 'T', W: c.W, H: c.H, tile: 40,
    grid: Array.from({ length: Math.ceil(c.H / 40) }, () => Array(Math.ceil(c.W / 40)).fill('.')),
    sites: { A: { x0: 0, y0: 0, x1: 80, y1: 80, cx: 40, cy: 40 }, B: { x0: c.W - 80, y0: c.H - 80, x1: c.W, y1: c.H, cx: c.W - 40, cy: c.H - 40 } },
    spawns: { t: [{ x: 40, y: 40 }], ct: [{ x: c.W - 40, y: c.H - 40 }] }
  };
  const layers = initTextures(map);
  const exp = expected(c.W, c.H);
  ok(c.name + ' mmScale = min(480/W, 360/H)', Math.abs(layers.mmScale - exp.s) < 1e-9);
  ok(c.name + ' mmOx centered', Math.abs((layers.mmOx || 0) - exp.ox) < 1e-9);
  ok(c.name + ' mmOy centered', Math.abs((layers.mmOy || 0) - exp.oy) < 1e-9);
}

// 竖长图必须真的产生纵向留边（回归：旧 mmScale=480/W 会裁掉底部）
{
  const map = {
    id: 'tall', name: 'T', W: 1520, H: 2000, tile: 40,
    grid: Array.from({ length: 50 }, () => Array(38).fill('.')),
    sites: { A: { x0: 0, y0: 0, x1: 80, y1: 80, cx: 40, cy: 40 }, B: { x0: 1440, y0: 1920, x1: 1520, y1: 2000, cx: 1480, cy: 1960 } },
    spawns: { t: [{ x: 40, y: 40 }], ct: [{ x: 1480, y: 1960 }] }
  };
  const layers = initTextures(map);
  ok('portrait map gets horizontal letterbox (fit by height)', layers.mmOx > 0 && Math.abs(layers.mmScale - 360 / map.H) < 1e-9);
}

console.log('textures-init: all PASS');
