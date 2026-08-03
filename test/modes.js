import '../src/modes.js';
import { CYBER_ROSTER, cyberChance, cyberPayout } from '../src/modes.js';
import { getMode, getModes } from '../src/registry.js';
import { createGame, startMatch, update } from '../src/game.js';
import { getMap } from '../src/map.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('modes: ' + name + ' FAIL');
  console.log('modes: ' + name + ' PASS');
};

const ids = [...getModes().keys()];
for (const id of ['classic', 'major', 'br', 'rogue', 'boss', 'cyber', 'lan', 'editor']) {
  ok('registered ' + id, ids.includes(id));
}

const g = createGame({ mode: 'br', seed: 20260802 });
g.ui = null; g.seed = 20260802;
getMode('br').start(g);
ok('br entities', g.entities.length >= 15 && !!g.player);
ok('br map connected', getMap().diagnostics.unreachable.length === 0);
ok('br zone', !!g.br && g.br.zone.r > 0);

const g2 = createGame({ mode: 'rogue', seed: 77 });
g2.ui = null; g2.seed = 77;
getMode('rogue').start(g2);
ok('rogue map connected', getMap().diagnostics.unreachable.length === 0);
ok('rogue player', !!g2.player && g2.rogue.wave === 1);

const g3 = createGame({ mode: 'boss', seed: 9 });
g3.ui = null; g3.seed = 9;
getMode('boss').start(g3);
const boss = g3.entities.find((e) => e.boss);
ok('boss entity', !!boss && boss.hp === 1400);
ok('boss state', g3.state === 'LIVE' && g3.boss.phase === 1);

const g4 = createGame({ mode: 'major', seed: 1 });
g4.ui = null; g4.seed = 1; g4.opts.teamMajor = 'g2';
getMode('major').start(g4);
ok('major bracket', g4.state === 'MAJOR' && g4.major.rounds.length === 1 && g4.major.rounds[0].length === 8);

const cyA = CYBER_ROSTER[0];
const cyB = CYBER_ROSTER[5];
const cyCh = cyberChance(cyA, cyB);
ok('cyber odds', cyCh >= 0.2 && cyCh <= 0.8);
ok('cyber payout', cyberPayout(100, cyCh) >= 1 && cyberPayout(100, 0.5) > 100);

const g5 = createGame({ mode: 'cyber', seed: 42 });
g5.ui = null; g5.seed = 42;
g5.opts.cyber = { leftId: 'iron', rightId: 'swift', bet: 50, side: 'left' };
startMatch(g5);
ok('cyber entities', !!g5.cyber && g5.entities.filter((e) => e.cricket).length === 2 && g5.state === 'LIVE');
ok('cyber map connected', getMap().diagnostics.unreachable.length === 0);
for (let i = 0; i < 3000 && !g5.cyber.ended; i++) update(g5, 1 / 30);
ok('cyber ended', !!g5.cyber && g5.cyber.ended && g5.cyber.time > 0);
ok('cyber fight', g5.cyber.leftE.hp < g5.cyber.leftE.maxHp || g5.cyber.rightE.hp < g5.cyber.rightE.maxHp);
ok('cyber death consistent', !g5.cyber.leftE.dead || !g5.cyber.rightE.dead);
console.log('modes: all PASS');
