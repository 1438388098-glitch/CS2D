import assert from 'node:assert/strict';
import { reconnectDelayMs } from '../src/lan.js';

assert.equal(reconnectDelayMs(0), 0, 'first retry should start immediately');
assert.equal(reconnectDelayMs(1), 3000, 'first failed retry waits 3s');
assert.equal(reconnectDelayMs(3), 9000, 'third retry waits 9s');

console.log('lan-reconnect: all PASS');
