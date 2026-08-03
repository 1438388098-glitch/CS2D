import { createGame, startMatch, startRound, endRound } from '../src/game.js';
import { ECONOMY } from '../src/config.js';
import { killEntity } from '../src/combat.js';
import { plantBomb, defuseBomb } from '../src/bomb.js';
import { getMap } from '../src/map.js';
import { defaultPistol } from '../src/entities.js';

const errors = [];
function ok(name, cond) {
  if (!cond) errors.push(name);
  console.log('economy: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
}

function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 1 });
  startMatch(g);
  return g;
}

ok('start money', fresh().player.money === ECONOMY.START_MONEY);

{
  const g = fresh();
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  killer.money = 1000;
  killEntity(victim, killer, 'ak', false, g);
  ok('normal kill reward', killer.money === 1000 + ECONOMY.KILL_MONEY);
}

{
  const g = fresh();
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  killer.money = 1000;
  killEntity(victim, killer, 'awp', false, g);
  ok('awp kill reward', killer.money === 1000 + ECONOMY.KILL_MONEY_AWP);
}

{
  const g = fresh();
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  killer.money = 1000;
  killEntity(victim, killer, 'knife', false, g);
  ok('knife kill reward', killer.money === 1000 + ECONOMY.KILL_MONEY_KNIFE);
}

{
  const g = fresh();
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  killer.money = ECONOMY.MONEY_CAP - 1;
  killEntity(victim, killer, 'ak', false, g);
  ok('money cap on kill', killer.money === ECONOMY.MONEY_CAP);
}

{
  const g = fresh();
  const site = getMap().sites.A;
  const e = g.entities.find((e) => e.bot && e.team === 't');
  e.x = site.cx;
  e.y = site.cy;
  e.hasBomb = true;
  const before = e.money;
  g.dt = 3;
  plantBomb(e, g);
  ok('plant bonus', e.money === before + ECONOMY.PLANT_MONEY && !!g.bomb && g.bomb.planted);
}

{
  const g = fresh();
  const site = getMap().sites.A;
  const e = g.entities.find((e) => e.bot && e.team === 'ct');
  e.x = site.cx;
  e.y = site.cy;
  g.bomb = { x: e.x, y: e.y, dropped: false, planted: true, site: 'A', timer: 40, defusing: false, defuseT: 0 };
  const before = e.money;
  e.defuseT = 4.99;
  g.dt = 0.02;
  defuseBomb(e, g);
  ok('defuse bonus for bot', e.money === before + ECONOMY.DEFUSE_MONEY + ECONOMY.WIN_BOMB_MONEY);
}

for (const [winType, expected] of [
  ['elimination', ECONOMY.WIN_MONEY],
  ['timeout', ECONOMY.WIN_MONEY],
  ['bomb', ECONOMY.WIN_BOMB_MONEY],
  ['defuse', ECONOMY.WIN_BOMB_MONEY]
]) {
  const g = fresh();
  const p = g.player;
  const before = p.money;
  g.state = 'LIVE';
  endRound(g, p.team, 'test', winType);
  ok(winType + ' win reward', p.money === before + expected);
}

{
  const g = fresh();
  const t = g.entities.find((e) => e.team === 't');
  g.state = 'LIVE';
  let before = t.money;
  endRound(g, 'ct', 'loss', 'elimination');
  ok('loss bonus 1', t.money === before + ECONOMY.LOSS_BONUS[0] && g.lossStreakT === 1);
  g.state = 'LIVE';
  before = t.money;
  endRound(g, 'ct', 'loss', 'elimination');
  ok('loss bonus 2', t.money === before + ECONOMY.LOSS_BONUS[1] && g.lossStreakT === 2);
  g.state = 'LIVE';
  before = t.money;
  endRound(g, 'ct', 'loss', 'elimination');
  ok('loss bonus 3', t.money === before + ECONOMY.LOSS_BONUS[2] && g.lossStreakT === 3);
  g.state = 'LIVE';
  before = t.money;
  endRound(g, 'ct', 'loss', 'elimination');
  ok('loss bonus 4+', t.money === before + ECONOMY.LOSS_BONUS[3] && g.lossStreakT === 4);
  g.state = 'LIVE';
  before = t.money;
  endRound(g, 't', 'win', 'elimination');
  ok('loss bonus reset on win', t.money === before + ECONOMY.WIN_MONEY && g.lossStreakT === 0 && g.lossStreakCT === 1);
}

{
  const g = fresh();
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  victim.money = 2222;
  victim.weapons.primary = 'ak';
  victim.weapons.secondary = 'deagle';
  victim.weapons.kit = true;
  victim.weapons.nades = { he: 1, flash: 2, smoke: 1 };
  victim.armor = 100;
  victim.helmet = true;
  victim.ammoMap = { ak: 10, deagle: 7 };
  victim.reserveMap = { ak: 20, deagle: 10 };
  killEntity(victim, killer, 'ak', false, g);
  ok('death clears weapons and equipment',
    victim.weapons.primary === null &&
    victim.weapons.secondary === null &&
    victim.weapons.kit === false &&
    victim.weapons.nades.he === 0 &&
    victim.weapons.nades.flash === 0 &&
    victim.weapons.nades.smoke === 0 &&
    victim.armor === 0 &&
    victim.helmet === false &&
    Object.keys(victim.ammoMap || {}).length === 0 &&
    Object.keys(victim.reserveMap || {}).length === 0);
  ok('death keeps money', victim.money === 2222);
}

{
  const g = fresh();
  const p = g.player;
  p.money = 5000;
  p.weapons.primary = 'ak';
  p.weapons.secondary = 'deagle';
  p.weapons.kit = true;
  p.weapons.nades = { he: 1, flash: 2, smoke: 1 };
  p.armor = 100;
  p.helmet = true;
  g.lossStreakT = 3;
  g.lossStreakCT = 4;
  g.round = 12;
  startRound(g);
  ok('half reset money', p.money === ECONOMY.START_MONEY);
  ok('half reset equipment',
    p.weapons.primary === null &&
    p.weapons.secondary === defaultPistol(p.team) &&
    p.weapons.kit === false &&
    p.weapons.nades.he === 0 &&
    p.weapons.nades.flash === 0 &&
    p.weapons.nades.smoke === 0 &&
    p.armor === 0 &&
    p.helmet === false);
  ok('half reset loss streak', g.lossStreakT === 0 && g.lossStreakCT === 0);
}

if (errors.length) {
  console.error('economy FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('economy: all PASS');
