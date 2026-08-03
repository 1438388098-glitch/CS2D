// 定位实验：H11 形态对比（网络/对手建模 对实力的影响）
import { installStubs } from '../test/stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { DIFF, ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');
const { decodeGenome } = await import('../src/ai-genome.js');
const fs = await import('fs');

const ck = JSON.parse(fs.readFileSync('D:/Claudeworkspace/CS2D/train/checkpoints/fresh_genome_best.json', 'utf8'));
const base = Array.from(ck.genome);
while (base.length < 19) base.push([1.0, 1.0, 0, 0.75, 0, 1.0][base.length - 13]);
const params = decodeGenome(base);
const H11_NET = DIFF.hell.ladder[11].netWeights;
const OPP = DIFF.hell.ladder;

const BASE_ROUND = ROUND.DURATION;
ROUND.DURATION = 40;

async function bench(tag, tParams) {
  let tWins = 0, rounds = 0;
  for (let rep = 0; rep < 4; rep++) {
    for (let lv = 1; lv <= 10; lv++) {
      const seed = (77 + lv * 1009 + rep * 77777) % 2147483647;
      seedWorld(seed);
      const g = createGame({ team: 'ct', diff: 'normal', bots: 5 });
      g.ui = null;
      startMatch(g);
      g.player.bot = true;
      for (const e of g.entities) {
        if (e.bot && e.team === 't') e.aiParams = tParams;
        if (e.bot && e.team === 'ct') e.aiParams = OPP[lv];
      }
      g.buyTime = 0.3; g.freezeT = 0.2;
      let prevR = 0, prevS = 0;
      for (let t = 0; t < 8 * 6000 + 12000; t++) {
        update(g, 1 / 60);
        if (g.round !== prevR) { prevR = g.round; rounds++; if (rounds % 8 === 0) break; }
        if (g.score.T > prevS) { tWins++; prevS = g.score.T; }
        if (g.state === 'END' && g.endedT > 1.2) g.endedT = 0.01;
        if (g.over) break;
      }
    }
  }
  console.log(tag + ': ' + (tWins / rounds * 100).toFixed(0) + '% (' + tWins + '/' + rounds + ')');
  ROUND.DURATION = BASE_ROUND;
}

console.log('起点形态对比（10 挡 × 4 seed × 8 回合）:');
await bench('A 纯参数(19维)          ', params);
await bench('B 参数+网络(H10)        ', { ...params, netWeights: H11_NET });
await bench('C 参数+对手建模         ', { ...params, oppModel: true });
await bench('D 参数+网络+建模        ', { ...params, netWeights: H11_NET, oppModel: true });
