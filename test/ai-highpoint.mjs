import { findMapById, loadMap } from '../src/map.js';
import { highPointFor } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

loadMap(findMapById('dust2'));
const game = { round: 1, highClaim: null };
const e1 = { laneIdx: 0, anchorIdx: 0 };
const e2 = { laneIdx: 1, anchorIdx: 1 };
const h1 = highPointFor(e1, game, 'A');
const h2 = highPointFor(e2, game, 'A');
ok('high point returns point', !!h1 && Number.isFinite(h1.x) && Number.isFinite(h1.y), JSON.stringify(h1));
ok('high point claims distinct', !!h1 && !!h2 && h1.index !== h2.index, 'i1=' + (h1 && h1.index) + ' i2=' + (h2 && h2.index));
const h1b = highPointFor(e1, game, 'A');
ok('high point avoids repeat', !!h1b && h1b.index !== h1.index, 'i1=' + h1.index + ' i1b=' + h1b.index);
ok('unknown site returns null', highPointFor(e1, game, 'ZZZ') === null);

console.log('ai-highpoint: all PASS');
process.exit(failed ? 1 : 0);
