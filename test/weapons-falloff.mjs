// Weapon distance damage falloff tests.
import { distanceFalloff } from '../src/ballistic.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} falloff ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}
const near = (a, b) => Math.abs(a - b) < 1e-6;
ok('rifle close', distanceFalloff({ kind: 'rifle' }, 100) === 1);
ok('rifle start', distanceFalloff({ kind: 'rifle' }, 700) === 1);
ok('rifle mid', near(distanceFalloff({ kind: 'rifle' }, 950), 0.85));
ok('rifle end', distanceFalloff({ kind: 'rifle' }, 1200) === 0.7);
ok('rifle beyond', distanceFalloff({ kind: 'rifle' }, 1500) === 0.7);
ok('pistol close', distanceFalloff({ kind: 'pistol' }, 300) === 1);
ok('pistol mid', near(distanceFalloff({ kind: 'pistol' }, 700), 0.875));
ok('pistol end', distanceFalloff({ kind: 'pistol' }, 900) === 0.75);
ok('sniper close', distanceFalloff({ kind: 'sniper' }, 800) === 1);
ok('sniper end', distanceFalloff({ kind: 'sniper' }, 1400) === 0.95);
ok('shotgun close', distanceFalloff({ kind: 'shotgun' }, 200) === 1);
ok('shotgun end', distanceFalloff({ kind: 'shotgun' }, 700) === 0.5);
ok('custom falloff', near(distanceFalloff({ kind: 'rifle', falloff: { start: 400, end: 800, min: 0.5 } }, 600), 0.75));
ok('knife no falloff', distanceFalloff({ kind: 'knife' }, 1000) === 1);
process.exit(failed ? 1 : 0);
