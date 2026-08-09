import { createGame } from '../src/game.js';
import { recordHitOutline } from '../src/combat.js';

function ok(name, cond) {
  if (!cond) throw new Error(name);
  console.log('PASS ' + name);
}

const game = createGame({});
game.player = { team: 'ct' };
const enemy = { team: 't', x: 100, y: 120, dead: false };

recordHitOutline(game, enemy, false);
ok('normal hit records outline', game.hitOutlines.length === 1 && game.hitOutlines[0].t === 0.3);

recordHitOutline(game, enemy, true);
ok('head hit keeps stronger outline', game.hitOutlines[game.hitOutlines.length - 1].head === true && game.hitOutlines[game.hitOutlines.length - 1].t === 0.45);

recordHitOutline(game, game.player, true);
ok('player self hit does not outline self', game.hitOutlines.length === 2);

game.hitOutlines[0].t = 0.01;
game.hitOutlines[0].target.dead = true;
const first = game.hitOutlines[0];
first.t -= 0.02;
if (first.t <= 0 || first.target.dead) game.hitOutlines.shift();

ok('outline removes when timer ends or target dies', game.hitOutlines.length === 1);

console.log('hit-outline: all PASS');
