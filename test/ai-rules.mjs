import assert from 'node:assert/strict';
import { shouldRerouteStuck, shouldPushLatePlant } from '../src/ai/rules.js';

const bot = {
  team: 't',
  path: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
  pathI: 0
};

assert.equal(shouldRerouteStuck(bot, 4), true, 'active path with tiny movement should reroute');
assert.equal(shouldRerouteStuck(bot, 12), false, 'active path with normal movement should not reroute');

const idle = { team: 't', path: null, pathI: 0 };
assert.equal(shouldRerouteStuck(idle, 4), false, 'idle T bot without path should not be kicked');

const done = { team: 't', path: [{ x: 10, y: 10 }], pathI: 1 };
assert.equal(shouldRerouteStuck(done, 4), false, 'finished path should not reroute');

const lateCarrier = { team: 't', hasBomb: true };
assert.equal(shouldPushLatePlant(lateCarrier, 70), true, 'late bomb carrier should push to plant');
assert.equal(shouldPushLatePlant(lateCarrier, 55), false, 'late threshold should be exclusive');
assert.equal(shouldPushLatePlant(lateCarrier, 114), true, 'carrier should push until round end');
assert.equal(shouldPushLatePlant(lateCarrier, 115), false, 'carrier should not push after round end');
assert.equal(shouldPushLatePlant({ team: 't', hasBomb: false }, 70), false, 'non-carrier should not push');
assert.equal(shouldPushLatePlant({ team: 't', hasBomb: true, bomb: { planted: true } }, 70), false, 'planted bomb should not trigger late push');

console.log('ai-rules: all PASS');
