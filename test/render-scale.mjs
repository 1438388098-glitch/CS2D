import { nextRenderScale } from '../src/render-scale.js';

function ok(name, cond) {
  if (!cond) throw new Error('render-scale: ' + name + ' FAIL');
  console.log('render-scale: ' + name + ' PASS');
}

{
  const r = nextRenderScale(1, 22, { lockT: 0 });
  ok('slow frame lowers scale', r.scale === 0.9 && r.lockT > 0 && r.changed);
}

{
  const r = nextRenderScale(0.6, 9, { lockT: 5 });
  ok('recovery waits for lock', r.scale === 0.6 && r.lockT === 4 && !r.changed);
}

{
  const r = nextRenderScale(0.6, 9, { lockT: 0 });
  ok('fast frame after lock recovers', r.scale === 0.7 && r.lockT > 0 && r.changed);
}

{
  const r = nextRenderScale(0.5, 30, { lockT: 0 });
  ok('minimum scale is clamped', r.scale === 0.5 && !r.changed);
}

{
  const r = nextRenderScale(1, 9, { lockT: 0 });
  ok('full scale stays at max', r.scale === 1 && !r.changed);
}

console.log('render-scale: all PASS');
