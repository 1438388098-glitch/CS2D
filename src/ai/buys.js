// 购买决策：经济纪律（eco 存钱 / 全甲步枪 / 道具补齐）
import { WEAPONS, PRICES, ROUND } from '../config.js';
import { rand } from '../utils.js';
import { hasGoodGun } from './shared.js';

export function botBuyAll(game) {
  if (game.teamBuyRound !== game.round) {
    game.teamBuyRound = game.round;
    game.teamBuy = { t: { smoke: 0, flash: 0, he: 0 }, ct: { smoke: 0, flash: 0, he: 0 } };
  }
  for (const e of game.entities) {
    if (!e.bot) continue;
    const tb = game.teamBuy[e.team];
    // S3 经济纪律（H11 专用）：ecoDiscipline>1 更严苛存钱（更早放弃起枪），<1 更激进
    const eco = e.aiParams && e.aiParams.ecoDiscipline !== undefined ? e.aiParams.ecoDiscipline : 1;
    const pistolRound = game.round === 1 || game.round === ROUND.SIDE_SWAP_AFTER + 1;
    if (pistolRound) {
      if (e.money >= WEAPONS.p250.price) {
        e.weapons.primary = 'p250';
        e.slot = 'primary';
        e.money -= WEAPONS.p250.price;
      }
      if (e.money >= PRICES.ARMOR) {
        e.armor = 100;
        e.money -= PRICES.ARMOR;
      }
      continue;
    }
    const rifle = e.team === 't' ? 'ak' : 'm4';
    const smg = e.team === 't' ? 'mac10' : 'mp9';
    const teamAnti = (e.team === 't' && game.roundPlan && game.roundPlan.antiEco) || (e.team === 'ct' && game.ctPlan && game.ctPlan.antiEco);
    if (teamAnti) {
      const keepRifle = hasGoodGun(e);
      if (!keepRifle && e.money >= WEAPONS[smg].price) {
        e.weapons.primary = smg;
        e.slot = 'primary';
        e.money -= WEAPONS[smg].price;
        if (e.money >= PRICES.ARMOR) { e.armor = 100; e.money -= PRICES.ARMOR; }
      } else if (!keepRifle && e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
        e.weapons.primary = 'p250';
        e.slot = 'primary';
        e.money -= WEAPONS.p250.price;
      }
      continue;
    }
    const fullArmor = PRICES.ARMOR + PRICES.HELM;
    // 狙击手 AWP 经济：钱够起 AWP（裸枪 4750）→ 直接起（余钱补甲）；不足但已过第 3 回合 → 正常步枪；
    // 早期（<3 回合）→ 存钱只买 p250，不把钱浪费在步枪上
    if (e.archetype === 'sniper' && e.weapons.primary !== 'awp' && !pistolRound) {
      if (e.money >= WEAPONS.awp.price) {
        e.weapons.primary = 'awp';
        e.slot = 'primary';
        e.money -= WEAPONS.awp.price;
        if (e.money >= PRICES.ARMOR && e.armor < 100) { e.armor = 100; e.money -= PRICES.ARMOR; }
        if (e.money >= PRICES.HELM && !e.helmet) { e.helmet = true; e.money -= PRICES.HELM; }
        if (e.money >= PRICES.FLASH && rand() < 0.5) { e.weapons.nades.flash++; e.money -= PRICES.FLASH; }
        continue;
      }
      const canRifle = e.money >= WEAPONS[rifle].price + PRICES.ARMOR;
      const lateEnough = game.round >= 3;
      if (!canRifle || !lateEnough) {
        // 存钱：只买 p250（防身）+ 甲，不碰步枪
        if (e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
          e.weapons.primary = 'p250';
          e.slot = 'primary';
          e.money -= WEAPONS.p250.price;
        }
        if (e.money >= PRICES.ARMOR && e.armor < 100) { e.armor = 100; e.money -= PRICES.ARMOR; }
        continue;
      }
    }
    // 经济纪律：钱不足以起全甲步枪时存钱（只买 P250），避免无甲冲锋枪送死
    const lossStreak = e.team === 't' ? (game.lossStreakT || 0) : (game.lossStreakCT || 0);
    const forceWeapon = e.archetype === 'sniper' ? 'deagle' : smg;
    if (lossStreak >= 3 && game.round >= 4 && e.money < WEAPONS[rifle].price + PRICES.ARMOR) {
      if (e.money >= WEAPONS[forceWeapon].price + PRICES.ARMOR) {
        e.weapons.primary = forceWeapon;
        e.slot = 'primary';
        e.money -= WEAPONS[forceWeapon].price + PRICES.ARMOR;
        e.armor = 100;
      } else if (e.money >= WEAPONS[forceWeapon].price) {
        e.weapons.primary = forceWeapon;
        e.slot = 'primary';
        e.money -= WEAPONS[forceWeapon].price;
      } else if (e.money >= WEAPONS.deagle.price + PRICES.ARMOR) {
        e.weapons.primary = 'deagle';
        e.slot = 'primary';
        e.money -= WEAPONS.deagle.price + PRICES.ARMOR;
        e.armor = 100;
      } else if (e.money >= WEAPONS.deagle.price) {
        e.weapons.primary = 'deagle';
        e.slot = 'primary';
        e.money -= WEAPONS.deagle.price;
      }
      if (e.weapons.primary) continue;
    }
    const rifleCost = WEAPONS[rifle].price + PRICES.ARMOR;
    if (e.money < (rifleCost - 200) * eco) {
      const holdsRifle = hasGoodGun(e);
      if (!holdsRifle) {
        if (e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
          e.weapons.primary = 'p250';
          e.slot = 'primary';
          e.money -= WEAPONS.p250.price;
        }
      } else if (e.money >= PRICES.ARMOR && e.armor < 100) {
        e.armor = 100;
        e.money -= PRICES.ARMOR;
      }
      continue;
    }
    if (e.weapons.primary !== rifle && e.weapons.primary !== 'awp') {
      // 狙击手优先起 AWP（全甲+头盔），钱不足回退常规步枪
      const tries = [];
      if (e.archetype === 'sniper') {
        tries.push({ w: 'awp', cost: WEAPONS.awp.price + fullArmor, equip: () => { e.armor = 100; e.helmet = true; } });
      }
      tries.push(
        { w: rifle, cost: WEAPONS[rifle].price + fullArmor, equip: () => { e.armor = 100; e.helmet = true; } },
        { w: rifle, cost: WEAPONS[rifle].price + PRICES.ARMOR, equip: () => { e.armor = 100; } },
        { w: rifle, cost: WEAPONS[rifle].price, equip: () => {} },
        { w: smg, cost: WEAPONS[smg].price + PRICES.ARMOR, equip: () => { e.armor = 100; } },
        { w: smg, cost: WEAPONS[smg].price, equip: () => {} },
        { w: 'deagle', cost: WEAPONS.deagle.price, equip: () => {} },
        { w: 'p250', cost: WEAPONS.p250.price, equip: () => {} }
      );
      for (const t of tries) {
        if (e.money >= t.cost) {
          e.weapons.primary = t.w;
          e.slot = 'primary';
          e.money -= t.cost;
          t.equip();
          break;
        }
      }
    } else {
      if (e.money >= fullArmor) {
        e.armor = 100; e.helmet = true;
        e.money -= fullArmor;
      } else if (e.money >= PRICES.ARMOR && e.armor < 100) {
        e.armor = 100;
        e.money -= PRICES.ARMOR;
      }
    }
    if (game.ctKitRound !== game.round) { game.ctKitRound = game.round; game.ctKitBought = false; }
    if (e.team === 'ct' && e.money >= PRICES.KIT && !game.ctKitBought) {
      const primaryKit = e.ctRoamer || e.role === 'mid' || e.igl;
      if (rand() < (primaryKit ? 0.95 : 0.35)) {
        e.weapons.kit = true;
        e.money -= PRICES.KIT;
        game.ctKitBought = true;
      }
    }
    const rushPlan = e.team === 't' && !!(game.roundPlan && game.roundPlan.rush);
    const slowPlan = e.team === 't' && !!(game.roundPlan && (game.roundPlan.slow || game.roundPlan.fake));
    const utilityBot = e.utilityRole === true;
    if (e.money >= PRICES.FLASH && tb.flash < (e.team === 't' ? 3 : 2) && (rushPlan ? rand() < 0.9 : (utilityBot ? rand() < 0.85 : rand() < 0.7))) { e.weapons.nades.flash++; tb.flash++; e.money -= PRICES.FLASH; }
    const ctSmokeRole = e.team === 'ct' && (e.ctRoamer || e.role === 'mid');
    const smokeChance = slowPlan ? 0.9 : (ctSmokeRole ? 0.85 : (utilityBot ? 0.8 : 0.5));
    if (e.money >= PRICES.SMOKE && tb.smoke < 3 && rand() < smokeChance) { e.weapons.nades.smoke++; tb.smoke++; e.money -= PRICES.SMOKE; }
    if (e.money >= PRICES.HE && tb.he < 2 && rand() < 0.6) { e.weapons.nades.he++; tb.he++; e.money -= PRICES.HE; }
    if (e.money < 0) e.money = 0;
  }
}
