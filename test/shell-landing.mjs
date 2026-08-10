import assert from 'node:assert/strict';
import { shellLandingStep } from '../src/game.js';

const shell = shellLandingStep({ kind: 'shell', vx: 90, vy: 20, spin: 0, _airT: 0 }, 0.02, () => {});
assert.ok(!shell.landed, 'fresh shell stays airborne');
assert.ok(shell.spin > 0, 'airborne shell spins');

let dustCalls = 0;
const landed = shellLandingStep(shell, 0.08, () => dustCalls++);
assert.equal(landed.landed, true, 'shell lands after short flight');
assert.ok(landed.vx < 90, 'landing slows horizontal speed');
assert.ok(landed.vy < 20, 'landing slows vertical speed');
assert.equal(dustCalls, 1, 'landing emits one dust puff');

const settled = shellLandingStep(landed, 0.1, () => dustCalls++);
assert.equal(settled.landed, true, 'landed shell stays landed');
assert.equal(dustCalls, 1, 'settled shell does not emit another puff');

console.log('shell-landing: all PASS');
