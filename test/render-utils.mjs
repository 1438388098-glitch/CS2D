import assert from 'node:assert/strict';
import { gunLen } from '../src/render-utils.js';

assert.equal(gunLen({ kind: 'sniper' }), 34, 'sniper should use longest gun length');
assert.equal(gunLen({ kind: 'rifle' }), 28, 'rifle should use medium gun length');
assert.equal(gunLen({ kind: 'smg' }), 22, 'smg should use default gun length');
assert.equal(gunLen({ kind: 'pistol' }), 22, 'pistol should use default gun length');

console.log('render-utils: all PASS');
