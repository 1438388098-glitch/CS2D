import assert from 'node:assert/strict';
import { crosshairSpreadPx, shouldDrawFpsSpreadCrosshair } from '../src/crosshair.js';

const wide = crosshairSpreadPx(1280, 110 * Math.PI / 180, 1);
const normal = crosshairSpreadPx(1280, 90 * Math.PI / 180, 1);
const narrow = crosshairSpreadPx(1280, 70 * Math.PI / 180, 1);
assert.ok(narrow > normal && normal > wide, 'wider FOV should make the same angular spread smaller in pixels');
assert.ok(Number.isFinite(wide) && wide > 0, 'crosshair spread should be finite and positive');
assert.equal(crosshairSpreadPx(1280, 90 * Math.PI / 180, 1, 1), crosshairSpreadPx(1280, 90 * Math.PI / 180, 2), 'recoil degrees should add to spread degrees');

const awp = { kind: 'sniper' };
assert.equal(shouldDrawFpsSpreadCrosshair(awp, { dead: false, scoped: true }), false, 'scoped AWP should use render3d scope only');
assert.equal(shouldDrawFpsSpreadCrosshair(awp, { dead: false, scoped: false }), true, 'hipfire AWP keeps the normal crosshair');
assert.equal(shouldDrawFpsSpreadCrosshair({ kind: 'rifle' }, { dead: false, scoped: true }), true, 'non-sniper scoped state still keeps the spread crosshair');

console.log('crosshair: all PASS');
