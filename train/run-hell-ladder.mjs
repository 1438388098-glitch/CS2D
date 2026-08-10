// 地狱阶梯训练流水线：H4-H7 GA 专项逐级蒸馏 + H8-H10 DQN 权重部署
// 用法:
//   node train/run-hell-ladder.mjs --stage=h4   # 训 H4 保枪纪律（每级 ~8 代）
//   node train/run-hell-ladder.mjs --stage=h4,h5,h6,h7
//   node train/run-hell-ladder.mjs --stage=deploy  # 部署 checkpoints 到 config.js
// 产出: train/checkpoints/best_gen_{N}_{h4..h7}.json → 手动/自动合入 config.js
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { evolve, loadCheckpoint, listCheckpoints } from './evolve.js';
import { runEval } from './fitness.js';
import { decodeGenome, mutate } from '../src/ai-genome.js';

const args = process.argv.slice(2);
function arg(name, def) {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : def;
}
const STAGE = arg('stage', 'h4');
const GENS = parseInt(arg('gens', '8'), 10);
const MAP = arg('map', 'dust2');
const SEED_GENOME = JSON.parse(arg('seed', 'null')); // 上一级冠军基因（蒸馏起点）

// —— 每级专项塑形配置 ——
const SPECS = {
  h4: { save: 2.5, note: '保枪纪律：残局劣势存活奖励' },
  h5: { eco: 1.2, note: '经济纪律：买甲存活奖励' },
  h6: { flash: 1.5, note: '闪光配合：闪光使用奖励' },
  h7: { rotate: 3.0, note: '转点反制：转点行为+转点胜场重奖' }
};

// 上一级冠军种子（蒸馏）
function seedPopFor(level) {
  if (SEED_GENOME) {
    const pop = [SEED_GENOME.slice()];
    while (pop.length < 16) pop.push(mutate(SEED_GENOME, 0.24));
    return pop;
  }
  // 未指定 seed → 用 S1 冠军（config 内嵌）蒸馏
  const champ = [0.0277, 0.0019, 0.7421, 0.6751, 0.4305, 0.0947, 0.0996, 0.1883, 0.9134, 0.5657, 0.45, 0.6, 0.6];
  const pop = [champ.slice()];
  while (pop.length < 16) pop.push(mutate(champ, 0.24));
  return pop;
}

async function trainLevel(level) {
  const spec = SPECS[level];
  console.log(`[ladder] 训练 ${level} (${spec.note}) gens=${GENS} map=${MAP} 起点=冠军蒸馏`);
  const seeds = await seedPopFor(level);
  const best = await evolve({ gens: GENS, mapId: MAP, seeds, spec, tag: level });
  // 基准：同 seed 对比有无塑形
  const base = runEval(best.g, MAP, 6, 42, null);
  const specd = runEval(best.g, MAP, 6, 42, spec);
  console.log(`[ladder] ${level} 冠军 fitness=${best.f.toFixed(1)} | 无塑形基准=${base.fitness.toFixed(1)} 塑形=${specd.fitness.toFixed(1)}`);
  console.log(`[ladder] ${level} genome=${JSON.stringify(best.g)}`);
  return best;
}

// 部署：把最新 checkpoints 输出成 config 可用的 JSON（H4-H7 基因 + H8-H10 网络）
function deploy() {
  const out = {};
  for (const level of ['h4', 'h5', 'h6', 'h7']) {
    const cks = listCheckpoints().filter((f) => f.includes('_' + level + '.json'));
    if (!cks.length) { console.log(`[deploy] 跳过 ${level}（无 checkpoint）`); continue; }
    const ck = JSON.parse(readFileSync('D:/Claudeworkspace/CS2D/train/checkpoints/' + cks[cks.length - 1], 'utf8'));
    out['H' + level[1]] = { genome: ck.genome, fitness: ck.fitness };
    console.log(`[deploy] H${level[1]} ← ${cks[cks.length - 1]} fitness=${ck.fitness}`);
  }
  for (const style of ['hold', 'control', 'push']) {
    // dqn-train 产出 net_{style}_best.json（dust2）或 net_{style}_best_{map}.json（迁移图）
    const ckDir = 'D:/Claudeworkspace/CS2D/train/checkpoints/';
    const cands = readdirSync(ckDir).filter((f) => f.startsWith('net_' + style + '_best')).sort();
    if (!cands.length) { console.log(`[deploy] 跳过 net_${style}（训练未完成）`); continue; }
    const net = ckDir + cands[cands.length - 1];
    const j = JSON.parse(readFileSync(net, 'utf8'));
    out['net_' + style] = j;
    console.log(`[deploy] net_${style} ← ${net}`);
  }
  writeFileSync('D:/Claudeworkspace/CS2D/train/checkpoints/ladder-deploy.json', JSON.stringify(out, null, 1));
  console.log('[deploy] 汇总 → train/checkpoints/ladder-deploy.json（手动合入 config.js 或由脚本自动合入）');
}

// —— 主流程 ——
const stages = STAGE.split(',');
for (const s of stages) {
  if (s === 'deploy') { deploy(); continue; }
  if (SPECS[s]) await trainLevel(s);
  else console.log(`[ladder] 未知阶段: ${s}（可选 h4,h5,h6,h7,deploy）`);
}
