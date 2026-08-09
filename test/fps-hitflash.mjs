import { createGame, startMatch, update } from '../src/game.js';
import { applyDamage } from '../src/combat.js';

function ok(name, cond) {
  if (!cond) throw new Error('fps-hitflash: ' + name + ' FAIL');
  console.log('fps-hitflash: ' + name + ' PASS');
}

function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 2 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  return g;
}

{
  const g = fresh();
  const bot = g.entities.find((e) => e.bot);
  bot.dead = false;
  bot.hp = 100;
  bot.armor = 0;
  bot.helmet = false;
  const p = g.player;
  p.dead = false;
  g.hitFlashT = 0;
  g.hitMarkT = 0;
  applyDamage(bot, 12, { killer: p, weapon: { kind: 'rifle' }, head: false }, g);
  ok('player hit sets hitFlashT', g.hitFlashT > 0.1);
  ok('player hit keeps hitMarkT', g.hitMarkT > 0.1);
  const flash0 = g.hitFlashT;
  g.hitPauseT = 0;
  for (const e of g.entities) {
    if (e.bot) e.dead = true;
  }
  g.input.keys = {};
  update(g, 1 / 60);
  ok('hitFlashT decays in update', g.hitFlashT < flash0 && g.hitFlashT > 0);
}

console.log('fps-hitflash: all PASS');
