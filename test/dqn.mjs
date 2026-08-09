import assert from 'node:assert/strict';
import { DQN, ReplayBuffer, dqnFromJSON, egreedy } from '../src/dqn.js';

const originalRandom = Math.random;

try {
  Math.random = () => 0.5;

  const net = new DQN({ input: 3, hidden: 4, output: 2 });
  assert.equal(net.forward([0, 0, 0]).length, 2, 'forward should return one Q value per action');
  assert.throws(() => net.forward([0, 0]), /obs/, 'forward should reject wrong observation size');

  const json = net.toJSON();
  const restored = dqnFromJSON(json);
  assert.equal(restored.input, 3, 'DQN JSON should preserve input size');
  assert.equal(restored.hidden, 4, 'DQN JSON should preserve hidden size');
  assert.equal(restored.output, 2, 'DQN JSON should preserve output size');
  assert.deepEqual(restored.iw, net.iw, 'DQN JSON should preserve input weights');
  assert.deepEqual(restored.ow, net.ow, 'DQN JSON should preserve output weights');

  for (const row of net.iw) row.fill(0);
  for (const row of net.ow) row.fill(0);
  assert.equal(egreedy(net, [0, 0, 0], 0), 0, 'greedy action should pick first zero-Q action');
  assert.equal(egreedy(net, [0, 0, 0], 1), 1, 'random action should use RNG when eps=1');

  const delta = net.trainStep([0, 0, 0], 0, 1, [0, 0, 0], true);
  assert.equal(typeof delta, 'number', 'trainStep should return a numeric TD delta');

  const buffer = new ReplayBuffer(3);
  buffer.push('a');
  buffer.push('b');
  buffer.push('c');
  assert.equal(buffer.size, 3, 'replay buffer should grow to capacity');
  buffer.push('d');
  assert.deepEqual(buffer.buf[0], 'd', 'replay buffer should overwrite oldest slot when full');
  assert.deepEqual(buffer.sample(1), ['c'], 'sample should honor the recent-priority window');
  assert.equal(buffer.sample(4), null, 'sample should refuse batch larger than buffer');
} finally {
  Math.random = originalRandom;
}

console.log('dqn: all PASS');
