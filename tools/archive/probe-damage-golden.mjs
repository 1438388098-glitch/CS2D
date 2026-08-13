// 生成伤害公式黄金值（确定性，无随机）
import { installStubs } from './stubdom.js';
installStubs();
const { applyDamage } = await import('../src/combat.js');
const { REGISTRY_READY, getWeapons } = await import('../src/registry.js');

// weaponDef 用 wkey 或直接传 weapon id 字符串
function entity(over) {
  return {
    team: 't', hp: 100, armor: 0, helmet: false, dead: false,
    weapons: { primary: null, secondary: 'glock' }, ammoMap: {}, reserveMap: {},
    ...over
  };
}

const game = { entities: [], smokes: [], tracers: [], decals: [], drops: [], particles: [], barrels: [], crates: [], player: null, time: 0, dmgPops: [] };

// 场景: victim 无甲, AK 身体 (dmg=40), 无穿透
const v1 = entity({ armor: 0, helmet: false });
applyDamage(v1, 40, { killer: entity(), weapon: 'ak', head: false }, game);
console.log('AK body no-armor: hp=', v1.hp.toFixed(6), 'armor=', v1.armor.toFixed(6));

// 场景: victim 全甲 (100), AK 身体 (40) → absorbed = min(40*0.4, 100) = 16, hpLoss = 24
const v2 = entity({ armor: 100, helmet: true });
applyDamage(v2, 40, { killer: entity(), weapon: 'ak', head: false }, game);
console.log('AK body full-armor: hp=', v2.hp.toFixed(6), 'armor=', v2.armor.toFixed(6));

// 场景: victim 全甲, AK 爆头 (40*4=160)
const v3 = entity({ armor: 100, helmet: true });
applyDamage(v3, 40, { killer: entity(), weapon: 'ak', head: true }, game);
console.log('AK head helmet: hp=', v3.hp.toFixed(6), 'armor=', v3.armor.toFixed(6));

// 场景: victim 无甲, AK 爆头 (40*4=160)
const v4 = entity({ armor: 0, helmet: false });
applyDamage(v4, 40, { killer: entity(), weapon: 'ak', head: true }, game);
console.log('AK head no-helmet: hp=', v4.hp.toFixed(6), 'armor=', v4.armor.toFixed(6));

// 场景: AWP (dmg=115) 全甲身体, armorPen=1 → absorbed = min(115*0.4*(1-1), 100)=0, hpLoss=115
const v5 = entity({ armor: 100, helmet: true });
applyDamage(v5, 115, { killer: entity(), weapon: 'awp', head: false }, game);
console.log('AWP body full-armor: hp=', v5.hp.toFixed(6), 'armor=', v5.armor.toFixed(6));

// 场景: 部分护甲 50, AK 身体 (40) → absorbed = min(16, 50)=16, hpLoss=24, armor=34
const v6 = entity({ armor: 50, helmet: false });
applyDamage(v6, 40, { killer: entity(), weapon: 'ak', head: false }, game);
console.log('AK body partial-armor(50): hp=', v6.hp.toFixed(6), 'armor=', v6.armor.toFixed(6));

process.exit(0);
