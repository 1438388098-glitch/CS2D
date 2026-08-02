import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { randomGenome, crossover, mutate, decodeGenome } from '../src/ai-genome.js';
import { runEval, EVAL_ROUNDS } from './fitness.js';

export const POP = 16;
export const KEEP = 4;
export const ELITE = 1;
export const MUT_RATE = 0.12;

export const CK_DIR = 'D:/Claudeworkspace/CS2D/train/checkpoints';

export async function evolve({ gens = 8, mapId = 'dust2', startGen = 0, seeds = null, log = console.log } = {}) {
  let pop = seeds || Array.from({ length: POP }, randomGenome);
  let best = null;
  const t0 = Date.now();
  for (let gen = startGen; gen < startGen + gens; gen++) {
    const results = [];
    for (let i = 0; i < pop.length; i++) {
      // 确定性评估：每代每个体固定 seed（同 genome 结果可复现）
      const seed = gen * 100000 + i;
      const r = runEval(pop[i], mapId, EVAL_ROUNDS, seed);
      results.push({ g: pop[i], f: r.fitness, r });
    }
    results.sort((a, b) => b.f - a.f);
    const avg = results.reduce((s, x) => s + x.f, 0) / results.length;
    if (!best || results[0].f > best.f) {
      best = results[0];
      log(`GEN ${gen + 1}  best=${best.f.toFixed(1)} (tWins=${best.r.tScore}/${best.r.roundsDone} plants=${best.r.plants} tkills=${best.r.tkills})  avg=${avg.toFixed(1)}`);
      writeCheckpoint(gen + 1, best);
    } else {
      log(`GEN ${gen + 1}  best=${results[0].f.toFixed(1)} (no improvement)  avg=${avg.toFixed(1)}`);
    }
    const next = [];
    for (let i = 0; i < ELITE; i++) next.push(results[i].g);
    const nKeep = Math.min(KEEP, results.length);
    while (next.length < POP) {
      const a = results[Math.floor(Math.random() * nKeep)].g;
      const b = results[Math.floor(Math.random() * nKeep)].g;
      next.push(mutate(crossover(a, b), MUT_RATE));
    }
    pop = next;
  }
  log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, best fitness=${best.f.toFixed(1)}`);
  return best;
}

function writeCheckpoint(gen, best) {
  mkdirSync(CK_DIR, { recursive: true });
  writeFileSync(`${CK_DIR}/best_gen_${gen}.json`, JSON.stringify({
    gen,
    fitness: best.f,
    genome: Array.from(best.g),
    params: decodeGenome(best.g),
    t: Date.now()
  }, null, 1));
}

export function loadCheckpoint(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const genome = Array.isArray(j.genome) ? j.genome : null;
  const pop = [];
  if (genome) {
    pop.push(genome.slice());
    while (pop.length < POP) pop.push(mutate(genome, MUT_RATE * 2));
  }
  return { gen: j.gen || 0, fitness: j.fitness, genome, params: j.params, pop };
}

export function listCheckpoints() {
  if (!existsSync(CK_DIR)) return [];
  return readdirSync(CK_DIR).filter((f) => f.endsWith('.json')).sort((a, b) => {
    const na = parseInt((a.match(/best_gen_(\d+)/) || [])[1] || '0', 10);
    const nb = parseInt((b.match(/best_gen_(\d+)/) || [])[1] || '0', 10);
    return na - nb;
  });
}
