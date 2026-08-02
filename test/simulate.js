import { installStubs, registerUiIds } from './stubdom.js';
installStubs();
registerUiIds();

import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

const mapId = process.argv[2] || 'dust2';
const diff = process.argv[3] || 'normal';

const game = createGame({ team: 'ct', diff, bots: 5, mapId });
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);
startMatch(game);

// 观战模式：玩家不参战，纯 5v5 bot 公平对局（平衡测试）
game.player.dead = true;

let lastRound = 1;
let prevT = 0, prevC = 0;
let plantedRounds = 0, defusedRounds = 0, explodedRounds = 0;
let lastRoundStart = 0;
let roundResult = null;
const maxTicks = 36000;

for (let i = 0; i < maxTicks; i++) {
  update(game, 1 / 30);
  if (game.state === 'BUY' && game.buyTime > 1) { game.buyTime = 0.8; game.freezeT = 0.3; }
  if (game.bomb && game.bomb.planted && roundResult === null) {
    plantedRounds++;
    roundResult = 'planted';
  }
  if (game.round !== lastRound) {
    const dt = (i - lastRoundStart) * 33.3 / 1000;
    const w = game.score.T > prevT ? 'T胜' : (game.score.CT > prevC ? 'CT胜' : '平局');
    const bombInfo = roundResult === 'planted'
      ? (game.lastPlantSite ? '炸弹 ' + game.lastPlantSite + ' 区已安装' : '炸弹已安装')
      : '未安装';
    console.log(`回合 ${lastRound}: ${w} 用时 ${dt.toFixed(1)}s ${bombInfo} | 比分 ${prevT}:${prevC} -> ${game.score.T}:${game.score.CT}`);
    prevT = game.score.T;
    prevC = game.score.CT;
    lastRoundStart = i;
    lastRound = game.round;
    roundResult = null;
    if (lastRound >= 7) break;
  }
}

const played = Math.min(lastRound - 1, 6);
const tRate = played > 0 ? Math.round(game.score.T / played * 100) : 0;
console.log(`模拟完成 [${mapId} ${diff}] ${played} 回合 ${game.score.T}:${game.score.CT} T胜率 ${tRate}% 安弹回合 ${plantedRounds}`);
if (played < 6 || game.score.T + game.score.CT < 1) {
  console.log('模拟失败: 完成 ' + played + '/6 回合, 比分 ' + game.score.T + ':' + game.score.CT + ' —— 需至少 1 回合分出胜负');
  process.exit(1);
}
// 平衡提示（信息性，不失败）：T 胜率长期偏离 30%-70% 说明攻守失衡
if (tRate < 30 || tRate > 70) {
  console.log(`平衡提示: T 胜率 ${tRate}% 偏离均衡区间 (30%-70%)，建议检查 AI 攻守行为`);
}
console.log('模拟通过');
process.exit(0);
