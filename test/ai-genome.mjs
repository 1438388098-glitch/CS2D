import assert from 'node:assert/strict';
import {
  GENOME_SIZE,
  randomGenome,
  decodeGenome,
  applyGenomeToParams,
  crossover,
  mutate
} from '../src/ai-genome.js';

const originalRandom = Math.random;

try {
  Math.random = () => 0.1;
  const g = randomGenome();
  assert.equal(g.length, GENOME_SIZE, 'random genome should use configured size');
  assert.ok(g.every((v) => v === 0.1), 'random genome should mirror stubbed RNG');

  const d = decodeGenome(new Array(GENOME_SIZE).fill(0.5));
  assert.equal(d.react, 0.3, 'react should decode from clamped gene');
  assert.equal(d.spreadMult, 1.25, 'spreadMult should decode from clamped gene');
  assert.equal(d.peekSkill, 0.8, 'peekSkill should decode from clamped gene');
  assert.equal(d.ecoDiscipline, 0.8, 'ecoDiscipline should decode from clamped gene');
  assert.equal(d.tradeSpeed, 1.75, 'tradeSpeed should decode from clamped gene');

  assert.deepEqual(applyGenomeToParams(new Array(GENOME_SIZE).fill(0.5)), d, 'applyGenomeToParams should reuse decode');

  const a = new Array(GENOME_SIZE).fill(0.2);
  const b = new Array(GENOME_SIZE).fill(0.8);
  const child = crossover(a, b);
  assert.deepEqual(child, a, 'crossover should pick first parent when RNG is low');

  const stable = mutate(a, 1, 0);
  assert.deepEqual(stable, a, 'zero-sigma mutation should preserve gene values');
} finally {
  Math.random = originalRandom;
}

console.log('ai-genome: all PASS');
