import { maybePickupWeapon } from '../src/ai/actions.js';
import { bombRetriever } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

function makeBot(primary) {
  return {
    weapons: { primary, secondary: 'glock' },
    ammoMap: {}, reserveMap: {}, slot: 'primary', reloading: false, reloadT: 0, fireCd: 0,
    x: 100, y: 100, dead: false
  };
}

{
  const e = makeBot('p250');
  const g = { drops: [{ x: e.x, y: e.y, wid: 'ak', noPickT: 0, ammo: 30, reserve: 90 }] };
  maybePickupWeapon(e, g);
  ok('eco bot picks up rifle', e.weapons.primary === 'ak' && g.drops.every((d) => d.wid !== 'ak'), e.weapons.primary);
}

{
  const e = makeBot('ak');
  const g = { drops: [{ x: e.x, y: e.y, wid: 'p90', noPickT: 0, ammo: 50, reserve: 100 }] };
  maybePickupWeapon(e, g);
  ok('rifle bot ignores downgrade', e.weapons.primary === 'ak' && g.drops.length === 1, e.weapons.primary);
}

{
  const e = makeBot(null);
  const g = { drops: [{ x: e.x, y: e.y, wid: 'deagle', noPickT: 0, ammo: 7, reserve: 35 }] };
  maybePickupWeapon(e, g);
  ok('empty bot picks any weapon', e.weapons.primary === 'deagle' && g.drops.length === 0, e.weapons.primary);
}

{
  const bomb = { dropped: true, x: 0, y: 0 };
  const fighter = { team: 't', dead: false, hasBomb: false, x: 10, y: 0, hp: 100, aimTarget: { dead: false } };
  const healthy = { team: 't', dead: false, hasBomb: false, x: 40, y: 0, hp: 100, aimTarget: null };
  ok('safe retriever preferred', bombRetriever({ bomb, entities: [fighter, healthy] }) === healthy);
}
{
  const bomb = { dropped: true, x: 0, y: 0 };
  const near = { team: 't', dead: false, hasBomb: false, x: 5, y: 0, hp: 20, aimTarget: null };
  const healthy = { team: 't', dead: false, hasBomb: false, x: 90, y: 0, hp: 100, aimTarget: null };
  ok('healthy retriever preferred', bombRetriever({ bomb, entities: [near, healthy] }) === healthy);
}
ok('no bomb returns null', bombRetriever({ bomb: null, entities: [] }) === null);
ok('dropped flag required', bombRetriever({ bomb: { dropped: false, x: 0, y: 0 }, entities: [] }) === null);

console.log('ai-pickup: all PASS');
process.exit(failed ? 1 : 0);