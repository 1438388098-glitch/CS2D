import assert from 'node:assert/strict';
import { crateRenderSpec } from '../src/render.js';

const healthy = crateRenderSpec(320, 320, 2, 40);
assert.equal(healthy.base, 'rgba(118,88,54,0.96)');
assert.equal(healthy.planks.length, 3);
assert.equal(healthy.bolts.length, 4);
assert.equal(healthy.cracks.length, 0);

const damaged = crateRenderSpec(320, 320, 1, 40);
assert.equal(damaged.base, 'rgba(104,76,48,0.96)');
assert.equal(damaged.cracks.length, 2);
assert.equal(damaged.px, 300);
assert.equal(damaged.py, 300);

const again = crateRenderSpec(320, 320, 2, 40);
assert.deepEqual(healthy.planks, again.planks, 'same crate should produce stable plank layout');

console.log('crate-render-info: all PASS');
