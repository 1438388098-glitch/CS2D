import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  }
};

const keymap = await import('../src/keymap.js');

assert.equal(keymap.matches('KeyW', 'moveUp'), true, 'default W should match moveUp');
assert.equal(keymap.matches('KeyD', 'moveUp'), false, 'non-mapped key should not match moveUp');
assert.equal(keymap.pressed({ KeyW: true }, 'moveUp'), true, 'pressed should read active default key');
assert.equal(keymap.pressed({ KeyD: true }, 'moveUp'), false, 'pressed should ignore unrelated active key');

keymap.bind('moveUp', 'KeyX');
assert.deepEqual(keymap.getBindCodes('moveUp'), ['KeyX'], 'bind should replace the action codes');
assert.equal(keymap.matches('KeyX', 'moveUp'), true, 'bound key should match');
assert.equal(keymap.matches('KeyW', 'moveUp'), false, 'old default should no longer match after rebind');

keymap.resetBinds();
assert.equal(keymap.matches('KeyW', 'moveUp'), true, 'reset should restore the default W binding');
assert.equal(keymap.getBindLabel('moveUp'), 'W', 'label should strip the Key prefix');
assert.match(keymap.getBindLabel('crouch'), /ControlLeft/, 'multi-key binding should keep non-key aliases');

assert.equal(keymap.bind('moveUp', 'KeyD'), false, 'bind should reject a key already used by moveRight');
assert.deepEqual(keymap.getBindCodes('moveRight'), ['KeyD'], 'conflict should not steal the existing binding');
assert.equal(keymap.bind('moveUp', 'KeyX'), true, 'bind should accept a free key');
assert.deepEqual(keymap.getBindCodes('moveUp'), ['KeyX'], 'free key should bind successfully');

console.log('keymap: all PASS');
