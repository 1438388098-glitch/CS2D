// 诊断共用库：起服 + 快速推进 + 场景操控（只读调查用，不改 src）
import { installStubs, registerUiIds } from './stubdom.js';
installStubs();
registerUiIds();

import { createGame, startMatch, update } from '../src/game.js';
import { getMap } from '../src/map.js';

export { createGame, startMatch, update, getMap };

export function mkGame(opts = {}) {
  const game = createGame({ team: 'ct', diff: opts.diff || 'normal', bots: opts.bots ?? 5, mapId: opts.mapId || 'dust2' });
  startMatch(game);
  game.player.dead = true; // 观战：纯 bot
  skipBuy(game);
  return game;
}

export function skipBuy(game) {
  game.buyTime = 0.1;
  game.freezeT = 0.1;
}

export function step(game, n, dt = 1 / 30) {
  for (let i = 0; i < n; i++) update(game, dt);
}

// 等一个 bot 阵营的 bot
export function botOf(game, team, n = 0) {
  const l = game.entities.filter((e) => e.bot && e.team === team && !e.dead);
  return l[n % l.length] || null;
}

export function alive(game, team) {
  return game.entities.filter((e) => e.bot && e.team === team && !e.dead);
}

// 用 LOS 内可见的位置摆放
export function place(e, x, y) {
  e.x = x; e.y = y;
  e.vx = 0; e.vy = 0;
  e.path = null; e.repathT = 0;
  e.lastSample = { x, y };
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 强制一个 DQN 网络：固定输出某动作（idx: 0 hold 1 push 2 rotate 3 nade 4 save 5 peek）
export function forcedNet(idx) {
  const hidden = 1, input = 13, output = 6;
  const iw = [new Array(input + 1).fill(0)];
  const ow = [];
  for (let k = 0; k < output; k++) {
    const row = new Array(hidden + 1).fill(0);
    if (k === idx) row[hidden] = 10;
    ow.push(row);
  }
  return { input, hidden, output, iw, ow };
}
