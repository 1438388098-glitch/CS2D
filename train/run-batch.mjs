import { evolve, loadCheckpoint, listCheckpoints, CK_DIR } from './evolve.js';
import { mkdirSync } from 'fs';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';

const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--(\w+)=(.+)$/);
  if (m) args[m[1]] = m[2];
}
const gens = parseInt(args.gens || '200', 10);
const par = parseInt(args.par || '1', 10);
const maps = (args.maps || 'dust2,snow,depot,canal,metro').split(',').filter(Boolean);
const mapId = args.map || maps[0];
let startGen = parseInt(args.start || '0', 10);
const resume = args.resume || null;

// 并行模式：fork 子进程，每进程负责一张地图（--par N 即最多 N 张图同时训练）
if (par > 1 && maps.length > 1) {
  const self = fileURLToPath(import.meta.url);
  const tasks = maps.map((m) => new Promise((res) => {
    const cpArgs = [`--gens=${gens}`, `--map=${m}`];
    if (args.start !== undefined) cpArgs.push(`--start=${args.start}`);
    if (resume) cpArgs.push(`--resume=${resume}`);
    console.log(`[par] fork: ${m} gens=${gens}`);
    const child = fork(self, cpArgs, { stdio: 'inherit' });
    child.on('exit', (code) => res(code));
  }));
  const codes = await Promise.all(tasks);
  console.log(`BATCH PAR DONE maps=${maps.join(',')} codes=${codes.join(',')}`);
  process.exit(codes.some((c) => c !== 0) ? 1 : 0);
}

let seeds = null;
if (resume) {
  const ck = loadCheckpoint(resume);
  seeds = ck.pop || [ck.genome];
  if (args.start === undefined) startGen = ck.gen;
  console.log(`resume from ${resume} (gen ${ck.gen}), seeding population size ${seeds.length}`);
}
mkdirSync(CK_DIR, { recursive: true });
const t0 = Date.now();
const best = await evolve({ gens, mapId, startGen, seeds, log: (m) => console.log(m) });
console.log(`BATCH DONE map=${mapId} gens=${gens} total=${((Date.now() - t0) / 1000 / 60).toFixed(1)}min best fitness=${best.f.toFixed(1)}`);
