import { canFinishDefuse } from '../src/ai/shared.js';
import { chooseDefuser } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

ok('no kit enough time', canFinishDefuse({ bomb: { planted: true, timer: 6 } }, { weapons: { kit: false }, defuseT: 0 }) === true);
ok('no kit not enough time', canFinishDefuse({ bomb: { planted: true, timer: 4 } }, { weapons: { kit: false }, defuseT: 0 }) === false);
ok('kit enough time', canFinishDefuse({ bomb: { planted: true, timer: 3 } }, { weapons: { kit: true }, defuseT: 0 }) === true);
ok('partial defuse can finish', canFinishDefuse({ bomb: { planted: true, timer: 3 } }, { weapons: { kit: true }, defuseT: 2.5 }) === true);
ok('no planted bomb cannot defuse', canFinishDefuse({ bomb: { planted: false, timer: 6 } }, { weapons: { kit: false }, defuseT: 0 }) === false);

{
  const bomb = { planted: true, x: 0, y: 0 };
  const nearNoKit = { x: 10, y: 0, weapons: { kit: false }, hp: 100, dead: false };
  const kitFar = { x: 100, y: 0, weapons: { kit: true }, hp: 100, dead: false };
  ok('kit defuser preferred', chooseDefuser([nearNoKit, kitFar], { bomb }) === kitFar);
}
{
  const bomb = { planted: true, x: 0, y: 0 };
  const hurt = { x: 0, y: 0, weapons: { kit: false }, hp: 20, dead: false };
  const healthy = { x: 70, y: 0, weapons: { kit: false }, hp: 100, dead: false };
  ok('healthy defuser preferred', chooseDefuser([hurt, healthy], { bomb }) === healthy);
}
ok('no planted defuser null', chooseDefuser([{ x: 0, y: 0, weapons: { kit: false }, hp: 100, dead: false }], { bomb: { planted: false, x: 0, y: 0 } }) === null);

console.log('ai-defuse: all PASS');
process.exit(failed ? 1 : 0);