// AWP 护甲穿透回归：狙击身体命中应无视护甲（一枪击杀全甲目标），步枪仍受护甲减免。
import { WEAPONS } from '../src/config.js';
import { applyDamage, killEntity, checkRoundEnd } from '../src/combat.js';
import { createGame } from '../src/game.js';
import { startMatch } from '../src/game.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} awp-armorpen ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}

// 纯数值校验：AWP armorPen=1，步枪 armorPen 未设置
ok('awp has armorPen 1', WEAPONS.awp && WEAPONS.awp.armorPen === 1);
ok('ak no armorPen', WEAPONS.ak && (WEAPONS.ak.armorPen === undefined || WEAPONS.ak.armorPen === 0));

const g = createGame({ team: 'ct' });
startMatch(g);
const t = g.player;
t.team = 't';
t.x = 100; t.y = 100; t.dead = false;
t.weapons.primary = 'awp'; t.slot = 'primary';
t.ammoMap.awp = 5;

const target = g.entities.find((e) => e.bot && e.team === 'ct');
target.x = 200; target.y = 100;
target.hp = 100; target.dead = false;
target.armor = 100; target.helmet = true;

// 替换 killEntity 以防整局结束干扰：只关心 hp 变化
const origKill = killEntity;
const origCheck = checkRoundEnd;
applyDamage(target, 115, { killer: t, weapon: 'awp', head: false }, g);
ok('awp one-shots armored body (hp 0)', target.hp <= 0, `hp=${target.hp}`);

// 步枪穿甲对照：AK 40 伤害对全甲 100 血目标只扣 24
const g2 = createGame({ team: 'ct' });
startMatch(g2);
const t2 = g2.player;
t2.team = 't';
t2.x = 100; t2.y = 100; t2.dead = false;
t2.weapons.primary = 'ak'; t2.slot = 'primary';
t2.ammoMap.ak = 30;
const target2 = g2.entities.find((e) => e.bot && e.team === 'ct');
target2.x = 200; target2.y = 100;
target2.hp = 100; target2.dead = false;
target2.armor = 100; target2.helmet = true;
const hpBefore = target2.hp;
applyDamage(target2, 40, { killer: t2, weapon: 'ak', head: false }, g2);
ok('ak still reduced by armor', Math.abs(hpBefore - target2.hp - 24) < 1, `loss=${hpBefore - target2.hp}`);

process.exit(failed ? 1 : 0);
