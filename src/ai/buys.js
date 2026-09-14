// 购买决策：团队经济协调（eco/force/full 投票、AWP 配额、武器 drop、前瞻预算 save）
import { WEAPONS, PRICES, ROUND } from '../config.js';
import { rand } from '../utils.js';
import { hasGoodGun } from './shared.js';
import { nextRoundBudget } from '../economy.js';
import { getMap } from '../map.js';

function rifleFor(team) { return team === 't' ? 'ak' : 'm4'; }
function smgFor(team) { return team === 't' ? 'mac10' : 'mp9'; }
function fullRifleCost(team) { return WEAPONS[rifleFor(team)].price + PRICES.ARMOR; }

// 前瞻预算：无论胜负，下回合都能全「步枪+甲」→ 本回合纯存（0 消费或只 p250）
function canFullBuyNextRound(e, game) {
  const b = nextRoundBudget(e, game);
  return Math.min(b.win, b.loss) >= fullRifleCost(e.team);
}

// —— 第一遍：团队经济规划（eco/force/full 投票，每队独立）——
// 统计全队经济（能全起步枪+甲 / 能强起 smg+甲 / 只能 eco），结合连败/比分/回合数，
// 写回 game.teamBuyType 供 botBuyAll（第二遍）与 roles.js 的 roundPlan 读取。
export function planTeamEconomy(game) {
  game.teamBuyType = game.teamBuyType || {};
  game.teamBuyPlan = game.teamBuyPlan || {};
  for (const team of ['t', 'ct']) {
    const bots = game.entities.filter((e) => e.bot && !e.dead && e.team === team);
    const plan = { total: bots.length, fullN: 0, forceN: 0, ecoN: 0, lossStreak: 0, nextFull: false };
    game.teamBuyPlan[team] = plan;
    if (!bots.length) { game.teamBuyType[team] = 'full'; continue; }
    const fullCost = WEAPONS[rifleFor(team)].price + PRICES.ARMOR + PRICES.HELM;
    const smgCost = WEAPONS[smgFor(team)].price + PRICES.ARMOR;
    for (const e of bots) {
      if (hasGoodGun(e)) { plan.fullN++; continue; }
      if (e.money >= fullCost) plan.fullN++;
      else if (e.money >= smgCost) plan.forceN++;
      else plan.ecoN++;
    }
    const lossStreak = team === 't' ? (game.lossStreakT || 0) : (game.lossStreakCT || 0);
    plan.lossStreak = lossStreak;
    // 前瞻预算硬条件：全队无论胜负下回合都能全买 → 本回合必存
    plan.nextFull = bots.every((e) => canFullBuyNextRound(e, game));
    const round = game.round || 0;
    const pistolRound = round === 1 || round === ROUND.SIDE_SWAP_AFTER + 1;
    const majority = Math.max(1, Math.ceil(plan.total * 0.8));
    const minority = Math.max(1, Math.ceil(plan.total * 0.6));
    // full 底限：≥2 名（或小队的多数）能全起步枪+甲 → 全买协议（富的买、穷的按个体阈值存钱）
    const fullFloor = Math.min(2, plan.total);
    let type;
    if (pistolRound) type = 'eco';
    else if (plan.fullN >= fullFloor || plan.fullN >= majority) type = 'full';
    else if (lossStreak >= 3 && plan.forceN + plan.fullN >= 1) type = 'force'; // 3 连败强起局：有人能强起就全队拼
    else if (lossStreak >= 2 && plan.forceN + plan.fullN >= minority) type = 'force';
    else if (plan.nextFull) type = 'eco'; // 下回合必能全买 → 本回合纯存
    else type = 'eco';
    game.teamBuyType[team] = type;
  }
  return game.teamBuyType;
}

// —— 第二遍：AWP 配额（每队每回合 1 把）——
// 队内 sniper 中钱最多 / 近期表现最好（kills）者持 AWP，其余狙击手降级步枪
function planAwpAllocation(game) {
  const alloc = { t: null, ct: null };
  for (const team of ['t', 'ct']) {
    const snipers = game.entities
      .filter((e) => e.bot && !e.dead && e.team === team && e.archetype === 'sniper' && e.weapons.primary !== 'awp')
      .sort((a, b) => (b.money || 0) - (a.money || 0) || (b.kills || 0) - (a.kills || 0));
    if (snipers.length) alloc[team] = snipers[0];
  }
  return alloc;
}

// eco：只 p250+甲（或前瞻预算下纯存），不碰步枪
function buyEco(e, game) {
  const holdsRifle = hasGoodGun(e);
  if (!holdsRifle) {
    const pureSave = canFullBuyNextRound(e, game);
    if (e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
      e.weapons.primary = 'p250';
      e.slot = 'primary';
      e.money -= WEAPONS.p250.price;
    }
    if (!pureSave && e.money >= PRICES.ARMOR && e.armor < 100) {
      e.armor = 100;
      e.money -= PRICES.ARMOR;
    }
  } else if (e.money >= PRICES.ARMOR && e.armor < 100) {
    e.armor = 100;
    e.money -= PRICES.ARMOR;
  }
}

// force：smg/famas+甲+少量道具
function buyForce(e, game) {
  if (hasGoodGun(e)) {
    if (e.money >= PRICES.ARMOR && e.armor < 100) { e.armor = 100; e.money -= PRICES.ARMOR; }
    return;
  }
  const smg = smgFor(e.team);
  if (e.team === 'ct' && e.money >= WEAPONS.famas.price) {
    e.weapons.primary = 'famas'; e.slot = 'primary'; e.money -= WEAPONS.famas.price;
  } else if (e.money >= WEAPONS[smg].price + PRICES.ARMOR) {
    e.weapons.primary = smg; e.slot = 'primary';
    e.money -= WEAPONS[smg].price + PRICES.ARMOR; e.armor = 100;
  } else if (e.money >= WEAPONS[smg].price) {
    e.weapons.primary = smg; e.slot = 'primary'; e.money -= WEAPONS[smg].price;
  } else if (e.money >= WEAPONS.deagle.price + PRICES.ARMOR) {
    e.weapons.primary = 'deagle'; e.slot = 'primary';
    e.money -= WEAPONS.deagle.price + PRICES.ARMOR; e.armor = 100;
  } else if (e.money >= WEAPONS.deagle.price) {
    e.weapons.primary = 'deagle'; e.slot = 'primary'; e.money -= WEAPONS.deagle.price;
  } else {
    // 连 smg 都买不起：下回合必能全买则纯存，否则 p250 防身
    if (!canFullBuyNextRound(e, game) && e.money >= WEAPONS.p250.price && e.weapons.primary !== 'p250') {
      e.weapons.primary = 'p250'; e.slot = 'primary'; e.money -= WEAPONS.p250.price;
    }
  }
  // 少量道具（全队限制）
  if (e.money >= PRICES.FLASH && game.teamBuy && game.teamBuy[e.team] && game.teamBuy[e.team].flash < 2 && rand() < 0.6) {
    e.weapons.nades.flash++;
    game.teamBuy[e.team].flash++;
    e.money -= PRICES.FLASH;
  }
  if (e.money < 0) e.money = 0;
}

// full：步枪+甲+完整道具（狙击手按 AWP 配额决定是否起 AWP；穷队友按前瞻预算 save）
function buyFull(e, game, opts) {
  const { allowAwp, eco, tb, rifle, smg } = opts;
  const fullArmor = PRICES.ARMOR + PRICES.HELM;
  // 狙击手 AWP：配额内且钱够 → 起 AWP；否则回退步枪 / 存钱
  if (e.archetype === 'sniper' && e.weapons.primary !== 'awp') {
    if (allowAwp && e.money >= WEAPONS.awp.price) {
      e.weapons.primary = 'awp';
      e.slot = 'primary';
      e.money -= WEAPONS.awp.price;
      if (e.money >= PRICES.ARMOR && e.armor < 100) { e.armor = 100; e.money -= PRICES.ARMOR; }
      if (e.money >= PRICES.HELM && !e.helmet) { e.helmet = true; e.money -= PRICES.HELM; }
      if (e.money >= PRICES.FLASH && rand() < 0.5) { e.weapons.nades.flash++; e.money -= PRICES.FLASH; }
      return;
    }
    const canRifle = e.money >= WEAPONS[rifle].price + PRICES.ARMOR;
    const lateEnough = game.round >= 3;
    if (!canRifle || !lateEnough) {
      // 存钱：已有好枪则保留（hasGoodGun 守卫，不再把 AK 覆盖成 p250），否则 p250+甲
      if (!hasGoodGun(e)) {
        if (e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
          e.weapons.primary = 'p250';
          e.slot = 'primary';
          e.money -= WEAPONS.p250.price;
        }
        if (e.money >= PRICES.ARMOR && e.armor < 100) { e.armor = 100; e.money -= PRICES.ARMOR; }
      }
      return;
    }
  }
  const lossStreak = e.team === 't' ? (game.lossStreakT || 0) : (game.lossStreakCT || 0);
  const forceWeapon = e.archetype === 'sniper' ? 'deagle' : smg;
  if (lossStreak >= 3 && game.round >= 4 && e.money < WEAPONS[rifle].price + PRICES.ARMOR) {
    // 连败个人补强（full 计划内个别穷人的兜底）
    if (e.team === 'ct' && e.money >= WEAPONS.famas.price) {
      e.weapons.primary = 'famas'; e.slot = 'primary'; e.money -= WEAPONS.famas.price;
    } else if (e.money >= WEAPONS[forceWeapon].price + PRICES.ARMOR) {
      e.weapons.primary = forceWeapon; e.slot = 'primary';
      e.money -= WEAPONS[forceWeapon].price + PRICES.ARMOR; e.armor = 100;
    } else if (e.money >= WEAPONS[forceWeapon].price) {
      e.weapons.primary = forceWeapon; e.slot = 'primary'; e.money -= WEAPONS[forceWeapon].price;
    } else if (e.money >= WEAPONS.deagle.price + PRICES.ARMOR) {
      e.weapons.primary = 'deagle'; e.slot = 'primary';
      e.money -= WEAPONS.deagle.price + PRICES.ARMOR; e.armor = 100;
    } else if (e.money >= WEAPONS.deagle.price) {
      e.weapons.primary = 'deagle'; e.slot = 'primary'; e.money -= WEAPONS.deagle.price;
    }
    if (e.weapons.primary) return;
  }
  const rifleCost = WEAPONS[rifle].price + PRICES.ARMOR;
  if (e.money < (rifleCost - 200) * eco) {
    const holdsRifle = hasGoodGun(e);
    if (!holdsRifle) {
      const pureSave = canFullBuyNextRound(e, game);
      if (e.weapons.primary !== 'p250' && e.money >= WEAPONS.p250.price) {
        e.weapons.primary = 'p250';
        e.slot = 'primary';
        e.money -= WEAPONS.p250.price;
      }
      if (!pureSave && e.money >= PRICES.ARMOR && e.armor < 100) {
        e.armor = 100;
        e.money -= PRICES.ARMOR;
      }
    } else if (e.money >= PRICES.ARMOR && e.armor < 100) {
      e.armor = 100;
      e.money -= PRICES.ARMOR;
    }
    return;
  }
  if (e.weapons.primary !== rifle && e.weapons.primary !== 'awp') {
    const tries = [];
    if (e.archetype === 'sniper' && allowAwp) {
      tries.push({ w: 'awp', cost: WEAPONS.awp.price + fullArmor, equip: () => { e.armor = 100; e.helmet = true; } });
    }
    // 富余升级变体步枪（CT: AUG / T: SG553）：需够「价+全套甲」，避免挤掉护甲预算
    const variant = e.team === 'ct' ? 'aug' : 'sg553';
    if (WEAPONS[variant]) {
      tries.push({ w: variant, cost: WEAPONS[variant].price + fullArmor, equip: () => { e.armor = 100; e.helmet = true; } });
    }
    tries.push(
      { w: rifle, cost: WEAPONS[rifle].price + fullArmor, equip: () => { e.armor = 100; e.helmet = true; } },
      { w: rifle, cost: WEAPONS[rifle].price + PRICES.ARMOR, equip: () => { e.armor = 100; } }
    );
    if (e.team === 'ct') {
      tries.push(
        { w: 'famas', cost: WEAPONS.famas.price + PRICES.ARMOR, equip: () => { e.armor = 100; } },
        { w: 'famas', cost: WEAPONS.famas.price, equip: () => {} }
      );
    }
    tries.push(
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

// —— 第三遍：武器 drop（富→穷）——
// full-buy 回合：余额富余（≥步枪价）的 bot 额外买一把步枪丢在 spawn 区
// （noPickT 防自拾，forTeam 标记接收方），穷队友由现有 maybePickupWeapon / pickupWeapon
// （combat.js）扫描附近 drop 拾取——只读调用，不修改 combat.js。
function planWeaponDrops(game) {
  const map = getMap();
  for (const team of ['t', 'ct']) {
    const rifle = rifleFor(team);
    const bots = game.entities.filter((e) => e.bot && !e.dead && e.team === team);
    if (bots.length < 2) continue;
    const poor = bots.filter((e) => !hasGoodGun(e) && e.money < WEAPONS[rifle].price);
    const donors = bots.filter((e) => hasGoodGun(e) && e.money >= WEAPONS[rifle].price);
    if (!poor.length || !donors.length) continue;
    const spawns = map && map.spawns && map.spawns[team];
    if (!spawns || !spawns.length) continue;
    const s = spawns[0];
    const maxDrop = Math.min(poor.length, donors.length, 2);
    for (let i = 0; i < maxDrop; i++) {
      const donor = donors[i];
      const w = WEAPONS[rifle];
      if (!w) continue;
      donor.money -= w.price;
      game.drops.push({
        x: s.x + (i % 3) * 40 - 40,
        y: s.y + Math.floor(i / 3) * 40 - 40,
        kind: 'primary', wid: rifle,
        ammo: w.mag, reserve: w.reserve,
        life: 45, noPickT: 0.5, forTeam: team, donor: donor.name
      });
    }
  }
}

export function botBuyAll(game) {
  // 第一遍：团队经济规划（eco/force/full 投票），供本函数与 roles.js 使用
  planTeamEconomy(game);
  // AWP 配额（每队 1 把）
  const awpAlloc = planAwpAllocation(game);
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
    const teamType = game.teamBuyType && game.teamBuyType[e.team];
    const rifle = rifleFor(e.team);
    const smg = smgFor(e.team);
    const allowAwp = awpAlloc[e.team] === e;
    // 反 eco（敌方穷局）：保持/换 SMG 抢节奏
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
    // 团队 eco：全队只 p250+甲（或前瞻预算下纯存）；富余个体（够 FAMAS/步枪+甲）仍 half-buy
    if (teamType === 'eco') {
      const halfCost = e.team === 'ct' ? Math.min(WEAPONS.famas.price + PRICES.ARMOR, WEAPONS[rifle].price + PRICES.ARMOR) : WEAPONS[rifle].price + PRICES.ARMOR;
      if (e.money >= halfCost) buyFull(e, game, { allowAwp, eco, tb, rifle, smg });
      else buyEco(e, game);
      continue;
    }
    // 团队 force：SMG/FAMAS+甲+少量道具；富余个体同样 half-buy
    if (teamType === 'force') {
      const halfCost = e.team === 'ct' ? Math.min(WEAPONS.famas.price + PRICES.ARMOR, WEAPONS[rifle].price + PRICES.ARMOR) : WEAPONS[rifle].price + PRICES.ARMOR;
      if (e.money >= halfCost) buyFull(e, game, { allowAwp, eco, tb, rifle, smg });
      else buyForce(e, game);
      continue;
    }
    // 团队 full：全甲步枪 + 完整道具
    buyFull(e, game, { allowAwp, eco, tb, rifle, smg });
  }
  // 第三遍：富→穷武器 drop
  planWeaponDrops(game);
}
