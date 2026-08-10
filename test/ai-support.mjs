import { supportPoint, shouldLateSave } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

const e = { team: 'ct', x: 500, y: 500, spreadIdx: 0 };
const ally = { team: 'ct', x: 800, y: 500, dead: false };
const enemy = { team: 't', x: 1200, y: 500, dead: false };
const game = { entities: [e, ally, enemy] };
const sp = supportPoint(e, game);
ok('low hp bot regroups near ally', !!sp && Math.hypot(sp.x - ally.x, sp.y - ally.y) < 200,
  sp ? 'd=' + Math.round(Math.hypot(sp.x - ally.x, sp.y - ally.y)) : 'null');

ok('late no bomb saves', shouldLateSave({ hasBomb: false }, { roundDur: 115, roundTime: 100, bomb: null }, 2, 1) === true);
ok('early no save', shouldLateSave({ hasBomb: false }, { roundDur: 115, roundTime: 30, bomb: null }, 2, 1) === false);
ok('carrier never saves', shouldLateSave({ hasBomb: true }, { roundDur: 115, roundTime: 100, bomb: null }, 2, 1) === false);
ok('planted never saves', shouldLateSave({ hasBomb: false }, { roundDur: 115, roundTime: 100, bomb: { planted: true } }, 2, 1) === false);
ok('dropped bomb never saves', shouldLateSave({ hasBomb: false }, { roundDur: 115, roundTime: 100, bomb: { dropped: true } }, 2, 1) === false);

console.log('ai-support: all PASS');
process.exit(failed ? 1 : 0);