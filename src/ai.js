import { WEAPONS, DIFF, PRICES, BOT_AI } from './config.js';
import { los, pathTo, followPath, nearestSite, getMap } from './map.js';
import { weaponDef, ammoFor } from './entities.js';
import { fireWeapon, startReload, finishReload, pickupWeapon } from './combat.js';
import { updateShotStreak } from './ballistic.js';
import { throwGrenade } from './grenades.js';
import { plantBomb, pickupBomb, defuseBomb } from './bomb.js';
import { ctx } from './ctx.js';
import { clamp, rand, angDiff, angNorm } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export function assignRoles(game) {
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  game.tAttackSite = Math.random() < 0.5 ? 'A' : 'B';
  game.tSwitchedAt = 0;
  game.tRush = Math.random() < (DIFF[game.opts.diff] || DIFF.normal).rushChance;
  for (let i = 0; i < tBots.length; i++) {
    const e = tBots[i];
    e.role = game.tAttackSite;
    e.rushMode = game.tRush;
    e.vanguard = i < 2;
    e.objCache = null;
    e.objAt = 0;
    e.guardPoint = null;
  }
  for (const e of cBots) {
    const r = Math.random();
    e.role = r < 0.4 ? 'a' : (r < 0.8 ? 'b' : 'mid');
    e.anchorIdx = Math.floor(Math.random() * 4);
    e.objCache = null;
    e.objAt = 0;
  }
}

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
    if (e.money >= PRICES.KIT && e.team === 'ct' && Math.random() < 0.5) { e.weapons.kit = true; e.money -= PRICES.KIT; }
    if (e.money >= PRICES.FLASH && Math.random() < 0.7) { e.weapons.nades.flash++; e.money -= PRICES.FLASH; }
    if (e.money >= PRICES.SMOKE && Math.random() < 0.5) { e.weapons.nades.smoke++; e.money -= PRICES.SMOKE; }
    if (e.money >= PRICES.HE && Math.random() < 0.6) { e.weapons.nades.he++; e.money -= PRICES.HE; }
    if (e.money < 0) e.money = 0;
  }
}

export function updateBots(game, dt) {
  for (const e of game.entities) {
    if (!e.bot || e.dead) continue;
    if (e.repathT > 0) e.repathT -= dt;
    updateShotStreak(e, dt);
    botThink(e, game, dt);
    botActions(e, game, dt);
  }
  for (const e of game.entities) {
    if (!e.bot || e.dead) continue;
    const w = weaponDef(e);
    if (w.mag > 0 && ammoFor(e) <= 0 && !e.reloading) startReload(e, game);
  }
}

function botThink(e, game, dt) {
  const d = e.aiParams || DIFF[game.opts.diff];
  if (e.dead) return;
  if (game.freezeT > 0) {
    e.vx = 0; e.vy = 0;
    return;
  }
  if (e.blind > 0) {
    e.blind -= dt;
    e.vx = Math.cos(e.angle) * 60;
    e.vy = Math.sin(e.angle) * 60;
    if (Math.random() < 0.08) e.trigger = Math.random() < 0.5;
    e.angle = angNorm(e.angle + rand(-0.3, 0.3));
    e.reaction = 0.1;
    return;
  }
  // 受击反击（人类本能）：被打后立即转身看向攻击者，1.2s 内保持警惕
  if (e.lastDmgFrom && e.lastDmgFrom !== e && e.team !== e.lastDmgFrom.team && !e.lastDmgFrom.dead) {
    const dmgAge = game.time * 1000 - e.lastDmgT;
    if (dmgAge < 1200) {
      e.angle = angNorm(Math.atan2(e.lastDmgFrom.y - e.y, e.lastDmgFrom.x - e.x));
      if (!e.aimTarget) {
        e.aimTarget = e.lastDmgFrom;
        e.reaction = Math.min(e.reaction, d.react * 0.4);
      }
    }
  }
  const vis = findVisibleEnemy(e, game);
  const weapon = weaponDef(e);
  if (vis && !e.aimTarget) {
    e.aimTarget = vis;
    e.reaction = d.react * (0.7 + Math.random() * 0.6);
  }
  if (e.aimTarget && (e.aimTarget.dead || !los(game, e.x, e.y, e.aimTarget.x, e.aimTarget.y) || Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) > d.view * 1.2)) {
    if (e.aimLostT > 1.4) {
      if (e.aimLastPos) {
        e.lastKnown = { x: e.aimLastPos.x, y: e.aimLastPos.y };
        e.lastKnownT = 0;
      }
      e.aimTarget = null;
      e.aimLostT = 0;
    } else {
      e.aimLostT += dt;
      if (!e.aimLastPos) e.aimLastPos = { x: e.aimTarget.x, y: e.aimTarget.y };
    }
  } else if (e.aimTarget) {
    e.aimLostT = 0;
    e.aimLastPos = null;
  }
  if (e.reaction > 0) {
    e.reaction -= dt;
    if (e.aimTarget && Math.random() < 0.4) {
      e.angle = Math.atan2(e.aimTarget.y - e.y, e.aimTarget.x - e.x) + rand(-0.3, 0.3);
    }
  }
  if (e.team === 't' && game.bomb && game.bomb.dropped && !e.hasBomb && !vis) {
    const bd = Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y);
    if (bd < 320) {
      pathTo(e, game.bomb.x, game.bomb.y);
      e.angle = angNorm(Math.atan2(game.bomb.y - e.y, game.bomb.x - e.x));
      followPath(e, dt, weapon.speed * 235);
      return;
    }
  }
  // LOS 有效才能进入战斗（拟合人类：看不到目标就停止对空 strafe，架枪/换位）
  const canSeeTarget = e.aimTarget && !e.aimTarget.dead && los(game, e.x, e.y, e.aimTarget.x, e.aimTarget.y);
  const combat = canSeeTarget && e.reaction <= 0;
  if (combat && e.hasBomb) {
    const t = e.aimTarget;
    const td = Math.hypot(t.x - e.x, t.y - e.y);
    const cs2 = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    if (Math.hypot(e.x - cs2.cx, e.y - cs2.cy) < 500 && td > 400) {
      pathTo(e, cs2.cx, cs2.cy);
      e.angle = angNorm(Math.atan2(cs2.cy - e.y, cs2.cx - e.x));
      followPath(e, dt, weapon.speed * 235);
      return;
    }
  }
  e.trigger = false;
  if (combat) {
    const t = e.aimTarget;
    const td = Math.hypot(t.x - e.x, t.y - e.y);
    const lead = td > 500 ? 0.05 : 0;
    const leadX = t.x + t.vx * lead, leadY = t.y + t.vy * lead;
    const wantAng = Math.atan2(leadY - e.y, leadX - e.x);
    const err = (d.spreadMult * (0.5 + td / 900) + weapon.spread * 0.3) * (Math.PI / 180);
    const diff = angDiff(wantAng, e.angle);
    // 甩枪 + 微调（拟合人类瞄准）：大角度快速转向，小角度精细逼近
    const flick = Math.abs(diff) > 0.4 ? 6 : 1;
    e.angle = angNorm(e.angle + clamp(diff, -d.aimSpeed * flick * dt, d.aimSpeed * flick * dt));
    // 攻坚判定：T 接近攻击点且未安弹时进入突击模式（移动中开火 + zigzag）
    const atkCs = e.team === 't' ? (game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B) : null;
    const assaulting = !!(atkCs && !(game.bomb && game.bomb.planted) && !e.hasBomb &&
      Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy) < 620 && Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy) > 90);
    // 命中角度驱动开火（物理真实）：瞄准误差须进入命中窗口（敌人体型半径），
    // 而非固定容差——旧 err*2.5 在 600px 处允许 54px 偏差，命中仅需 15px，导致大量空枪
    const hitAng = td > 0 ? Math.atan2(t.rad + 2, td) : 0.5;
    if (Math.abs(angDiff(e.angle, wantAng)) < hitAng * 0.85 && e.recoil < 0.7) {
      const spd = Math.hypot(e.vx, e.vy);
      // 突击模式下周期性急停射击（冲-停-打节奏），其余移动中急停
      const stopBurst = assaulting && Math.sin(game.time * 1000 / 300 + e.anchorIdx * 2.1) > 0.4;
      if (spd > 130 && (!assaulting || stopBurst)) {
        // 急停（Counter-strafe）：停稳瞬间射击，消除移动散布
        e.vx = 0; e.vy = 0;
      }
      const w2 = weaponDef(e);
      if (w2.mag > 0 && ammoFor(e) <= 0) {
        if (td > 260 || (d.riskT !== undefined ? d.riskT : 0.3) > 0.5) startReload(e, game);
      } else {
        e.trigger = true;
      }
    }
    const spd = weapon.speed * 235;
    if (assaulting) {
      if (td < 300) {
        // 近距攻坚：停止移动直接对枪（静止散布最小）
        e.vx *= 0.2; e.vy *= 0.2;
        return;
      }
      // 突击模式：zigzag 冲刺进点，边跑边打（移动散布作为代价换取突破）
      const aimAng = Math.atan2(atkCs.cy - e.y, atkCs.cx - e.x);
      const sway = Math.sin(game.time * 1000 / 260 + e.anchorIdx * 1.7) * 0.28;
      e.vx = Math.cos(aimAng + Math.PI / 2 * sway) * spd * 0.9;
      e.vy = Math.sin(aimAng + Math.PI / 2 * sway) * spd * 0.9;
      return;
    }
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafeT = d.strafe * (0.5 + Math.random());
      e.strafeDir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.25) e.strafeDir = 0;
    }
    const ideal = td > (d.idealMax || 550) ? 1 : (td < (d.idealMin || 220) ? -1 : 0);
    const sway = Math.sin(game.time * 1000 / 450) * 0.5;
    if (e.strafeDir === 0) {
      const strafeAng = e.angle + Math.PI / 2 * sway;
      e.vx = Math.cos(strafeAng) * spd * 0.3 + Math.cos(e.angle) * ideal * spd * 0.3;
      e.vy = Math.sin(strafeAng) * spd * 0.3 + Math.sin(e.angle) * ideal * spd * 0.3;
    } else {
      e.vx = Math.cos(e.angle + Math.PI / 2 * e.strafeDir) * spd * 0.4 + Math.cos(e.angle) * ideal * spd * 0.3;
      e.vy = Math.sin(e.angle + Math.PI / 2 * e.strafeDir) * spd * 0.4 + Math.sin(e.angle) * ideal * spd * 0.3;
    }
    if (Math.random() < 0.015 * (d.nadeUse || 1) && e.weapons.nades.flash > 0 && td < 700) {
      e.slot = 'nade:flash';
      throwGrenade(e, game);
      e.slot = 'primary';
    }
    return;
  }
  const obj = botObjective(e, game);
  if (obj) {
    if (Math.hypot(obj.x - e.x, obj.y - e.y) < 24) {
      e.vx = 0; e.vy = 0;
      e.path = null; e.repathT = 0;
      if (obj.face !== undefined) e.angle = angNorm(obj.face);
      } else {
        if (e.path === null) {
          if (e.repathT <= 0) {
            pathTo(e, obj.x, obj.y);
            e.repathT = 0.8;
          }
        } else {
          const done = followPath(e, dt, weapon.speed * 235);
          if (!done) { e.path = null; e.repathT = 0; }
        }
        // 移动扫视（拟合人类）：朝目标方向 ±0.95rad 摆动视角，扩大 FOV 覆盖
        e.angle = angNorm(Math.atan2(obj.y - e.y, obj.x - e.x) + Math.sin(game.time * 3.2 + e.anchorIdx * 1.3) * 0.95);
      }
  }
  if (e.lastKnown && !e.aimTarget && !e.hasBomb) {
    const lk = e.lastKnown;
    const lkd = Math.hypot(e.x - lk.x, e.y - lk.y);
    if (e.lastKnownT < 3 && lkd > 70 && lkd < 700) {
      if (e.path === null && e.repathT <= 0) {
        pathTo(e, lk.x, lk.y);
        e.repathT = 1.2;
      }
      e.angle = angNorm(Math.atan2(lk.y - e.y, lk.x - e.x));
      followPath(e, dt, weapon.speed * 235);
    }
  }
  if (e.lastKnown) e.lastKnownT += dt;
}

const ORDER_TEXT = {
  follow: '全体集合！', siteA: '全体进攻 A 点！', siteB: '全体进攻 B 点！', hold: '全体守住当前位置！'
};

// 玩家→bot 战术指令（F1-F4）：下发后 15s 内覆盖 bot 默认目标
export function setPlayerOrder(game, type) {
  const p = game.player;
  if (!p || p.dead || game.over || game.state === 'MENU') return;
  if (!ORDER_TEXT[type]) return;
  game.tOrder = { type, at: game.roundTime, x: p.x, y: p.y };
  for (const e of game.entities) {
    if (e.bot) { e.objCache = null; e.objAt = 0; }
  }
  emit('toast', { text: ORDER_TEXT[type] });
}

function botObjective(e, game) {
  const now = game.time * 1000;
  const bombState = game.bomb ? (game.bomb.planted ? (game.bomb.defusing ? 'pd' + game.bomb.site : 'p' + game.bomb.site) : (game.bomb.dropped ? 'd' : 'n')) : 'n';
  if (e.objCache && e.objBombState === bombState && now - e.objAt < 3000) return e.objCache;
  const o = botObjectiveRaw(e, game);
  e.objCache = o;
  e.objAt = now;
  e.objBombState = bombState;
  return o;
}

function retreatPoint(e, game) {
  const spawns = e.team === 't' ? getMap().spawns.t : getMap().spawns.ct;
  if (spawns && spawns.length) {
    let sx = 0, sy = 0;
    for (const s of spawns) { sx += s.x; sy += s.y; }
    return { x: sx / spawns.length, y: sy / spawns.length };
  }
  return { x: getMap().W / 2, y: getMap().H / 2 };
}

function entryPoint(cs, game) {
  const sp = getMap().spawns.t[0];
  if (!sp) return { x: cs.cx - 380, y: cs.cy };
  const dx = cs.cx - sp.x, dy = cs.cy - sp.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: cs.cx - dx / len * 380, y: cs.cy - dy / len * 380 };
}

function botObjectiveRaw(e, game) {
  const planted = !!(game.bomb && game.bomb.planted);
  // 玩家战术指令（已装弹时不覆盖守/拆弹目标；TTL 15s）
  const order = !planted ? game.tOrder : null;
  if (order && game.roundTime - order.at < BOT_AI.ORDER_TTL) {
    if (order.type === 'siteA' || order.type === 'siteB') {
      const cs = order.type === 'siteA' ? getMap().sites.A : getMap().sites.B;
      if (cs) return { x: cs.cx + rand(-80, 80), y: cs.cy + rand(-60, 60) };
    }
    if (order.type === 'hold') return { x: order.x + rand(-50, 50), y: order.y + rand(-50, 50) };
    if (order.type === 'follow' && game.player && !game.player.dead) {
      return { x: game.player.x + rand(-80, 80), y: game.player.y + rand(-80, 80) };
    }
  }
  if (e.team === 'ct') {
    if (planted) return { x: game.bomb.x, y: game.bomb.y };
    const ctAlive = game.entities.filter((o) => o.team === 'ct' && !o.dead && o !== e).length;
    const tAlive = game.entities.filter((o) => o.team === 't' && !o.dead).length;
    // 残局劣势保枪（未安弹时）
    if (ctAlive === 0 && tAlive >= 2 && Math.random() < (e.aiParams || DIFF[game.opts.diff]).saveChance) {
      return retreatPoint(e, game);
    }
    if (e.role === 'a' || e.role === 'b') {
      const now = game.time * 1000;
      for (const o of game.entities) {
        if (o.team === 't' && !o.dead && now - o.lastShot < BOT_AI.HEAR_TTL) {
          if (Math.hypot(o.x - e.x, o.y - e.y) < BOT_AI.HEAR_RADIUS) return { x: o.x, y: o.y };
        }
      }
      const hold = e.role === 'a' ? getMap().holds.A : getMap().holds.B;
      const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
      return { x: p.x, y: p.y, face: Math.atan2(hold.entry.y - p.y, hold.entry.x - p.x) };
    }
    return { x: getMap().W / 2 + rand(-60, 60), y: getMap().H / 2 + rand(-60, 60) };
  }
  if (planted) {
    if (game.bomb.defusing) {
      for (const ce of game.entities) {
        if (ce.team === 'ct' && !ce.dead && Math.hypot(ce.x - game.bomb.x, ce.y - game.bomb.y) < 80) {
          return { x: ce.x, y: ce.y };
        }
      }
    }
    const site2 = game.bomb.site === 'A' ? getMap().sites.A : getMap().sites.B;
    if (e.guardPointSite !== game.bomb.site || e.guardPoint === null) {
      // 守弹目标围绕炸弹实际位置（而非站点中心），确保能打断拆弹
      e.guardPoint = { x: game.bomb.x + rand(-90, 90), y: game.bomb.y + rand(-90, 90) };
      e.guardPointSite = game.bomb.site;
    }
    return e.guardPoint;
  }
  if (game.bomb && game.bomb.dropped) return { x: game.bomb.x, y: game.bomb.y };
  if (e.hasBomb) {
    const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    // 残局时间管理：回合末期距点过远则保枪放弃安弹
    if (game.roundTime > (game.roundDur || 115) - 18 && Math.hypot(e.x - cs.cx, e.y - cs.cy) > 650) {
      return retreatPoint(e, game);
    }
    // 已在点附近则直接进点安弹；否则在入口等队友清点（不在交火中冲点送死）
    if (Math.hypot(e.x - cs.cx, e.y - cs.cy) < 300 || e.rushMode) return { x: cs.cx, y: cs.cy };
    const alliesIn = game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && o !== e && Math.hypot(o.x - cs.cx, o.y - cs.cy) < 300).length;
    if (alliesIn < 1) return entryPoint(cs, game);
    return { x: cs.cx, y: cs.cy };
  }
  let planter = null;
  for (const pe of game.entities) {
    if (pe.team === 't' && pe.plantT > 0 && pe !== e) { planter = pe; break; }
  }
  if (planter) {
    const cs = nearestSite(planter.x, planter.y);
    if (e.coverSide === undefined) e.coverSide = Math.random() < 0.5 ? 1 : -1;
    const ang = Math.atan2(cs.cy - planter.y, cs.cx - planter.x);
    return {
      x: planter.x + Math.cos(ang) * 100 + Math.cos(ang + Math.PI / 2 * e.coverSide) * 80,
      y: planter.y + Math.sin(ang) * 100 + Math.sin(ang + Math.PI / 2 * e.coverSide) * 80
    };
  }
  if (e.role === 'mid') return { x: getMap().W / 2 + rand(-80, 80), y: getMap().H / 2 + rand(-80, 80) };
  const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
  const tAlive2 = game.entities.filter((o) => o.team === 't' && !o.dead && o !== e).length;
  const ctAlive2 = game.entities.filter((o) => o.team === 'ct' && !o.dead).length;
  // 残局劣势保枪（未安弹）
  if (tAlive2 === 0 && ctAlive2 >= 2 && Math.random() < (e.aiParams || DIFF[game.opts.diff]).saveChance) {
    return retreatPoint(e, game);
  }
  if (e.rushMode) return { x: cs.cx + rand(-120, 120), y: cs.cy + rand(-60, 60) };
  // 协同集结：全队在入口集合，凑够 3 人同步进点（避免添油送死）
  const entry = entryPoint(cs, game);
  const here = game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && Math.hypot(o.x - entry.x, o.y - entry.y) < 300).length;
  if (here < 3 && game.roundTime < 12) return entry;
  if (game.roundTime > 8) return { x: cs.cx + rand(-120, 120), y: cs.cy + rand(-60, 60) };
  return entry;
}

function botActions(e, game, dt) {
  if (e.dead) return;
  if (!e.weapons.primary) pickupWeapon(e, game);
  if (e.plantRetryT > 0) e.plantRetryT -= dt;
  if (e.team === 't') {
    // 转点：久攻不下（LIVE 20s 后未安弹且点附近无优势）切换攻击点
    if (!(game.bomb && game.bomb.planted) && game.state === 'LIVE' && game.roundTime > 20 && game.roundTime - game.tSwitchedAt > 8) {
      const d0 = e.aiParams || DIFF[game.opts.diff];
      const csNow = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
      const nearSite = Math.hypot(e.x - csNow.cx, e.y - csNow.cy) < 400;
      const tAliveNow = game.entities.filter((o) => o.team === 't' && !o.dead).length;
      if (tAliveNow >= 2 && !nearSite && Math.random() < (d0.rotateChance !== undefined ? d0.rotateChance : 0.4)) {
        game.tAttackSite = game.tAttackSite === 'A' ? 'B' : 'A';
        game.tSwitchedAt = game.roundTime;
        for (const o of game.entities) {
          if (o.bot && o.team === 't') {
            o.role = game.tAttackSite;
            o.objCache = null;
            o.objAt = 0;
            o.guardPoint = null;
          }
        }
        emit('sysfeed', { text: 'T 方转点进攻 ' + (game.tAttackSite === 'A' ? 'A' : 'B') + ' 点' });
      }
    }
    // 安弹后封烟：朝 CT 回防路线丢烟封锁
    if (game.bomb && game.bomb.planted && e.weapons.nades.smoke > 0 && e.plantedSmokeRound !== game.round) {
      if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 300) {
        const ctSpawn = getMap().spawns.ct[0];
        if (ctSpawn) {
          e.angle = angNorm(Math.atan2(ctSpawn.y - e.y, ctSpawn.x - e.x));
          e.slot = 'nade:smoke';
          throwGrenade(e, game);
          e.slot = 'primary';
          e.plantedSmokeRound = game.round;
        }
      }
    }
    if (e.usedNadeRound !== game.round) {
      const site = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
      const dist = Math.hypot(e.x - site.cx, e.y - site.cy);
      // 进攻道具（拟合人类 CS）：闪光先手 → 烟封架枪 → HE 补伤害
      if (dist < 430) {
        if (e.weapons.nades.flash > 0 && e.aimTarget) {
          e.slot = 'nade:flash';
          throwGrenade(e, game);
          e.slot = 'primary';
          e.usedNadeRound = game.round;
        } else if (e.weapons.nades.smoke > 0) {
          e.slot = 'nade:smoke';
          throwGrenade(e, game);
          e.slot = 'primary';
          e.usedNadeRound = game.round;
        } else if (e.weapons.nades.he > 0) {
          e.slot = 'nade:he';
          throwGrenade(e, game);
          e.slot = 'primary';
          e.usedNadeRound = game.round;
        }
      }
    }
    if (e.plantT > 0) {
      let src = null, sd = 1e9;
      for (const o of game.entities) {
        if (o.team === 'ct' && !o.dead && o.blind <= 0) {
          const dd = Math.hypot(o.x - e.x, o.y - e.y);
          if (dd < 700 && dd < sd && los(game, e.x, e.y, o.x, o.y)) {
            sd = dd;
            src = o;
          }
        }
      }
      if (src) {
        const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
        e.plantT = 0;
        e.plantRetryT = 2.5;
        if (Math.hypot(e.x - cs.cx, e.y - cs.cy) >= 120) {
          pathTo(e, cs.cx, cs.cy);
          const w2 = weaponDef(e);
          followPath(e, dt, w2.speed * 235);
        }
      }
    }
    if (game.bomb && game.bomb.dropped) pickupBomb(e, game);
    if (e.hasBomb && !(game.bomb && game.bomb.planted) && e.plantRetryT <= 0) {
      const site = nearestSite(e.x, e.y);
      if (Math.hypot(e.x - site.cx, e.y - site.cy) < 150) plantBomb(e, game);
    }
  }
  if (e.team === 'ct' && game.bomb && game.bomb.planted) {
    if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 55) {
      let enemiesNear = false;
      for (const o of game.entities) {
        if (o.team === 't' && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 420 && los(game, e.x, e.y, o.x, o.y)) {
          enemiesNear = true;
          break;
        }
      }
      if (!enemiesNear && e.aimTarget === null) {
        defuseBomb(e, game);
      } else if (e.defuseT > 0) {
        e.defuseT = 0;
        if (game.bomb) game.bomb.defusing = false;
      }
    }
  }
  if (e.reloading) {
    e.reloadT -= dt;
    if (e.reloadT <= 0) finishReload(e);
  }
  if (e.fireCd > 0) e.fireCd -= dt;
  // 设计意图：bot 后坐力恢复比玩家慢（1.2 vs 玩家 RECOIL_RECOVER 2.2），克制 AI 火力
  if (e.recoil > 0) e.recoil -= dt * 1.2;
  if (e.muzzleT > 0) e.muzzleT -= dt;
  if (e.trigger && e.fireCd <= 0) {
    e.trigger = false;
    const wB = weaponDef(e);
    const distB = e.aimTarget ? Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) : 999;
    // 智能射击模式（拟合人类 CS）：
    // - 中远距（>350px）单发 tap：连发散布 28px(600px处) 远超命中半径 15px，只有首发命中，故每发都重置散布
    // - 近距（<=350px）连发：命中角度大（>2.5°），连发散布可接受
    const tap = wB && (wB.kind === 'rifle' || wB.kind === 'smg') && (e.shotStreak || 0) >= 1 && distB > 350;
    if (tap) {
      e.fireCd = Math.max(e.fireCd, 0.22);
      e.shotStreak = 0;
    } else {
      fireWeapon(e, game);
    }
  }
}

function findVisibleEnemy(e, game) {
  let best = null;
  let bestD = (e.aiParams || DIFF[game.opts.diff]).view;
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > bestD) continue;
    const a = Math.atan2(o.y - e.y, o.x - e.x);
    if (Math.abs(angDiff(a, e.angle)) > BOT_AI.FOV) continue;
    if (!los(game, e.x, e.y, o.x, o.y)) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
