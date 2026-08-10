import { ambientDust, hash01 } from '../src/ambient-fx.js';

function ok(name, cond) {
  if (!cond) throw new Error('fx-ambient: ' + name + ' FAIL');
  console.log('fx-ambient: ' + name + ' PASS');
}

const count = 40;
const w = 512;
const h = 384;

const ps = ambientDust(7, 1.23, count, w, h);
ok('count & fields', ps.length === count && ps.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.r) && Number.isFinite(p.alpha)));

ok('bounds', ps.every((p) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h));

ok('r & alpha ranges', ps.every((p) => p.r >= 0.3 && p.r <= 3 && p.alpha >= 0.01 && p.alpha <= 0.4));

const ps2 = ambientDust(7, 1.23, count, w, h);
ok('deterministic', JSON.stringify(ps) === JSON.stringify(ps2));

const ps3 = ambientDust(8, 1.23, count, w, h);
ok('seed varies', JSON.stringify(ps) !== JSON.stringify(ps3));

const ps4 = ambientDust(7, 9.87, count, w, h);
ok('time drift', ps4.some((p, i) => p.x !== ps[i].x || p.y !== ps[i].y));
ok('time bounds', ps4.every((p) => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h));

ok('hash01 deterministic & ranged', hash01(1, 2, 3) >= 0 && hash01(1, 2, 3) < 1 && hash01(1, 2, 3) === hash01(1, 2, 3));
ok('hash01 input varies', hash01(1, 2, 3) !== hash01(2, 2, 3));

ok('zero count', ambientDust(7, 1, 0, w, h).length === 0);

console.log('fx-ambient: all PASS');
