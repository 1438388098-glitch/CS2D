import assert from 'node:assert/strict';
import { boomShockwaveSpec } from '../src/render.js';

const fresh = boomShockwaveSpec({ size: 160, life: 0.5, maxLife: 0.5 });
assert.equal(fresh.t, 0, 'fresh boom starts at time zero');
assert.ok(fresh.outer < 80, 'fresh ring starts small');
assert.ok(fresh.alpha > 0.7, 'fresh ring is visible');

const mid = boomShockwaveSpec({ size: 160, life: 0.25, maxLife: 0.5 });
assert.ok(mid.t > 0.4 && mid.t < 0.6, 'mid boom advances progress');
assert.ok(mid.outer > fresh.outer && mid.outer < 160, 'shockwave expands outward');
assert.ok(mid.alpha < fresh.alpha, 'shockwave fades as it expands');

const late = boomShockwaveSpec({ size: 160, life: 0, maxLife: 0.5 });
assert.equal(late.t, 1, 'late boom reaches full progress');
assert.equal(late.alpha, 0, 'late ring is invisible');
assert.ok(late.outer > mid.outer, 'late ring is largest');

console.log('boom-shockwave: all PASS');
