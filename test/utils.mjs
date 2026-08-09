import assert from 'node:assert/strict';
import { seedWorld } from '../src/ctx.js';
import { clamp, lerp, rand, angNorm, angDiff, rotateInputVector, viewCap } from '../src/utils.js';

seedWorld(20260804);

assert.equal(clamp(5, 0, 1), 1, 'clamp should cap upper bound');
assert.equal(clamp(-5, 0, 1), 0, 'clamp should cap lower bound');
assert.equal(clamp(0.5, 0, 1), 0.5, 'clamp should preserve in-range value');
assert.equal(lerp(10, 20, 0.25), 12.5, 'lerp should interpolate between endpoints');

assert.ok(rand(10, 20) >= 10 && rand(10, 20) < 20, 'rand should stay in requested range');
assert.ok(Math.abs(angNorm(-Math.PI / 2) - Math.PI * 1.5) < 1e-9, 'angNorm should normalize negative angle');
assert.ok(Math.abs(angDiff(0, Math.PI * 1.5) - Math.PI / 2) < 1e-9, 'angDiff should return shortest signed difference');

const forward = rotateInputVector(1, 0, 0);
assert.ok(Math.abs(forward.x) < 1e-12, 'rotateInputVector angle 0 should map X input to +Y');
assert.equal(forward.y, 1, 'rotateInputVector angle 0 should keep +Y direction');

assert.equal(viewCap({ canvasW: 800, canvasH: 600 }), 500, 'viewCap should return half diagonal');
assert.equal(viewCap({}), Math.hypot(1280, 720) / 2, 'viewCap should fall back to default canvas size');

console.log('utils: all PASS');
