import { shouldSwitchPistol } from '../src/ai/shared.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

ok('switches with 2 rounds close', shouldSwitchPistol(2, true) === true);
ok('does not switch far target', shouldSwitchPistol(2, false) === false);
ok('keeps rifle with 3 rounds close', shouldSwitchPistol(3, true) === false);

console.log('ai-pistol: all PASS');
process.exit(failed ? 1 : 0);