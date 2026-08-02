import { runEval } from './fitness.js';
import { randomGenome } from '../src/ai-genome.js';

const g = randomGenome();
const t0 = Date.now();
const r = runEval(g, 'dust2', 2);
const ok = r && r.roundsDone >= 1 && Number.isFinite(r.fitness);
console.log(`eval ok: fitness=${r.fitness} rounds=${r.roundsDone} tWins=${r.tScore}/${r.ctScore} tkills=${r.tkills} plants=${r.plants} alive=${r.alive}  (${Date.now() - t0}ms)`);
if (!ok) {
  console.error('smoke-test: FAIL (invalid eval result)');
  process.exit(1);
}
console.log('smoke-test: PASS');
