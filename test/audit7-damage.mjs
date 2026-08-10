// 审计 7：精确定位 t#1 首次掉血帧的完整状态（全精度），对比两次运行的伤害输入
import { installStubs } from './stubdom.js';
installStubs();
const { createGame, startMatch, update } = await import('../src/game.js');
const { ROUND } = await import('../src/config.js');
const { seedWorld } = await import('../src/ctx.js');

ROUND.DURATION = 40;

function runTrace(seed) {
  seedWorld(seed);
  const g = createGame({ team: 'ct', diff: 'hell', hellLevel: 10, bots: 5, mapId: 'dust2' });
  g.seed = seed;
  g.ui = null;
  startMatch(g);
  g.player.bot = true;
  g.buyTime = 0.3;
  g.freezeT = 0.2;
  const events = [];
  let prevRound = g.round;
  for (let t = 0; t < 60000; t++) {
    const before = g.entities.map((e) => e.hp);
    update(g, 1 / 60);
    g.entities.forEach((e, i) => {
      if (before[i] !== e.hp) {
        events.push({
          f: t, i, before: before[i], after: e.hp,
          shooter: e.lastDmgFrom ? `${e.lastDmgFrom.team}@${e.lastDmgFrom.x.toFixed(6)},${e.lastDmgFrom.y.toFixed(6)} ang=${e.lastDmgFrom.angle.toFixed(6)}` : '-',
          victim: `${e.team}@${e.x.toFixed(6)},${e.y.toFixed(6)}`,
          all: g.entities.map((o, j) => `${j}:${o.team}@${o.x.toFixed(9)},${o.y.toFixed(9)} hp=${o.hp.toFixed(4)} w=${o.weapons ? o.weapons.primary : '-'}`).join(' | ')
        });
      }
    });
    if (g.round !== prevRound) { prevRound = g.round; if (g.round - 1 >= 0) break; }
    if (g.over) break;
  }
  return events;
}

const a = runTrace(4242);
const b = runTrace(4242);
const n = Math.min(a.length, b.length);
for (let i = 0; i < n; i++) {
  const A = a[i], B = b[i];
  if (A.after !== B.after) {
    console.log(`伤害事件 #${i}: A 帧${A.f} B 帧${B.f}`);
    console.log('  A: victim', A.victim, '| before', A.before, '-> after', A.after, '| shooter', A.shooter);
    console.log('  B: victim', B.victim, '| before', B.before, '-> after', B.after, '| shooter', B.shooter);
    const dA = A.all.split(' | ').map((s) => s.split('@'));
    const dB = B.all.split(' | ').map((s) => s.split('@'));
    for (let k = 0; k < dA.length; k++) {
      if (dA[k][0] !== dB[k][0] || dA[k][1] !== dB[k][1] || dA[k][2] !== dB[k][2]) {
        console.log(`  field ${k}: A=[${dA[k].join('@')}] B=[${dB[k].join('@')}]`);
      }
    }
    break;
  }
}
if (n === 0 || !a.some((e, i) => i < n && b[i] && e.after !== b[i].after)) console.log('前', n, '个伤害事件完全一致');
process.exit(0);
