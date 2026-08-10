import assert from 'node:assert/strict';
import { aimSensitivityCurve } from '../src/aim.js';

assert.equal(aimSensitivityCurve(0), 0, 'zero stays zero');
assert.equal(aimSensitivityCurve(1), 1, 'full deflection stays full');
assert.equal(aimSensitivityCurve(0.5, 1), 0.5, 'power 1 keeps linear mapping');
assert.ok(aimSensitivityCurve(0.5) > 0.5 && aimSensitivityCurve(0.5) < 1, 'small deflections get a gentler boost');
assert.ok(aimSensitivityCurve(0.25) < aimSensitivityCurve(0.5), 'curve is monotonic');
assert.equal(aimSensitivityCurve(-1), 0, 'negative input clamps to zero');
assert.equal(aimSensitivityCurve(2), 1, 'overflow input clamps to one');

console.log('aim-curve: all PASS');
