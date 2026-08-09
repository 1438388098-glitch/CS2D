import assert from 'node:assert/strict';
import { wrapTail } from '../src/audio/core.js';

function source() {
  return { onended: null };
}

function node() {
  return { disconnected: 0, disconnect() { this.disconnected += 1; } };
}

{
  const src = source();
  const nodes = [node(), node()];
  wrapTail(src, nodes);
  src.onended();
  assert.equal(nodes[0].disconnected, 1, 'first tail node should disconnect');
  assert.equal(nodes[1].disconnected, 1, 'second tail node should disconnect');
  assert.equal(src.onended, null, 'onended should be cleared');
}

{
  let ended = 0;
  const src = source();
  wrapTail(src, [node()], () => { ended += 1; });
  src.onended();
  assert.equal(ended, 1, 'onEnd callback should run');
}

{
  const guard = { pending: 0, cleaned: 0, cleanup() { this.cleaned += 1; } };
  const a = source();
  const b = source();
  wrapTail(a, [node()], null, guard);
  wrapTail(b, [node()], null, guard);
  a.onended();
  assert.equal(guard.cleaned, 0, 'guard should wait for all sources');
  b.onended();
  assert.equal(guard.cleaned, 1, 'guard should clean after last source');
}

console.log('audio-tail: all PASS');
