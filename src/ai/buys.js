// 购买决策：经济纪律（eco 存钱 / 全甲步枪 / 道具补齐）
import { WEAPONS, PRICES } from '../config.js';
import { rand } from '../utils.js';

export function botBuyAll(game) {
  for (const e of game.entities) {
    if (!e.bot) continue;
    const pistolRound = game.round === 1 || game.round === 13;
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
    const fullArmor = PRICES.ARMOR + PRICES.HELM;
    // 经济纪律：钱不足以起全甲步枪时存钱（只买 P250），避免无甲冲锋枪送死
    const rifleCost = WEAPONS[rifle].price + PRICES.ARMOR;
    if (e.money < rifleCost - 200) {
      if (e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
        e.weapons.primary = 'p250';
        e.slot = 'primary';
        e.money -= WEAPONS.p250.price;
      }
      continue;
    }
    if (e.weapons.primary !== rifle) {
      const tries = [
        { w: rifle, cost: WEAPONS[rifle].price + fullArmor, equip: () => { e.armor = 100; e.helmet = true; } },
        { w: rifle, cost: WEAPONS[rifle].price + PRICES.ARMOR, equip: () => { e.armor = 100; } },
        { w: rifle, cost: WEAPONS[rifle].price, equip: () => {} },
        { w: smg, cost: WEAPONS[smg].price + PRICES.ARMOR, equip: () => { e.armor = 100; } },
        { w: smg, cost: WEAPONS[smg].price, equip: () => {} },
        { w: 'deagle', cost: WEAPONS.deagle.price, equip: () => {} },
        { w: 'p250', cost: WEAPONS.p250.price, equip: () => {} }
      ];
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
    if (e.money >= PRICES.KIT && e.team === 'ct' && rand() < 0.5) { e.weapons.kit = true; e.money -= PRICES.KIT; }
    if (e.money >= PRICES.FLASH && rand() < 0.7) { e.weapons.nades.flash++; e.money -= PRICES.FLASH; }
    if (e.money >= PRICES.SMOKE && rand() < 0.5) { e.weapons.nades.smoke++; e.money -= PRICES.SMOKE; }
    if (e.money >= PRICES.HE && rand() < 0.6) { e.weapons.nades.he++; e.money -= PRICES.HE; }
    if (e.money < 0) e.money = 0;
  }
}
