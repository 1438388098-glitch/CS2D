import { setStorage, setRng, newManagerCareer } from '../src/manager.js';
import { seedWorld } from '../src/ctx.js';
import { createGame, update } from '../src/game.js';
import { startManagerMatch } from '../src/manager-match.js';

// 经理实机赛确定性回归：同 seed 双跑逐 tick 指纹一致（seedWorld + 注入 seed）
const ok = (name, cond) => { if (!cond) throw new Error('manager-determinism: ' + name + ' FAIL'); console.log('manager-determinism: ' + name + ' PASS'); };

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}
setStorage(fakeStorage());
setRng(() => 0.5);

function boot(seed) {
  seedWorld(987654321); // 固定建队阶段随机流（对手/roster/homeMap 生成），隔离比赛引擎确定性
  newManagerCareer();
  const g = createGame({ mode: 'manager', team: 'ct', bots: 5, mapId: 'dust2', diff: 'hard' });
  g.ui = null;
  startManagerMatch(g, null, 'home', false, seed);
  ok('injected seed applied', g.seed === seed);
  return g;
}

function fingerprint(g) {
  return g.entities
    .map((e) => e.team + ':' + Math.round(e.x) + ',' + Math.round(e.y) + ',' + e.hp + ',' + (e.kills || 0))
    .sort()
    .join('|') + '#T' + g.score.T + ':CT' + g.score.CT + ':R' + g.round + ':t' + Math.round((g.roundTime || 0) * 100);
}

const a = boot(20260910);
let fa = '';
for (let i = 0; i < 2400; i++) {
  if (a.over) break;
  update(a, 1 / 60);
}
fa = fingerprint(a);

// 注意：ctx.rand 是模块级单例流，双跑不能交错 tick（会互耗随机数），必须顺序完整跑完
const b = boot(20260910);
let fb = '';
for (let i = 0; i < 2400; i++) {
  if (b.over) break;
  update(b, 1 / 60);
}
fb = fingerprint(b);

ok('same seed twin run produces identical snapshot', fa === fb);
ok('match made progress', a.round >= 1 && a.entities.filter((e) => e.bot).length === 10);

// 不同 seed 允许不同展开（不做事后断言，避免撞车假失败）
console.log('manager-determinism: all PASS');
