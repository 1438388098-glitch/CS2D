import assert from 'node:assert/strict';
import { shouldRerouteStuck } from '../src/ai/rules.js';

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

console.log('ai-rules: all PASS');
