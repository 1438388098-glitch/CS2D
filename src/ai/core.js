// AI 主循环 + 感知→决策调度（botThink）
import {diffOf, BOT_AI} from '../config.js';
import {los, pathTo, followPath, getMap} from '../map.js';
import {weaponDef, ammoFor} from '../entities.js';
import {startReload} from '../combat.js';
import {updateShotStreak} from '../ballistic.js';
import {throwGrenade} from '../grenades.js';
import {report, query, MSG} from '../info.js';
import {clamp, rand, angDiff, angNorm, viewCap} from '../utils.js';
import {styleOf, hasPrefireIntel, aliveCount, shouldSwitchPistol, idealRange, shouldTradePush} from './shared.js';
import {findVisibleEnemy} from './perception.js';
import {canSeeInFog} from '../fog.js';
import {hearGunshot} from './senses.js';
import {botObjective, shouldReactToIntel} from './decisions.js';
import {botActions} from './actions.js';
import {refreshLeadership, fillPlayerRole} from './roles.js';
import {shouldSaveForEco, shouldPushLatePlant, shouldThrowUtility} from './rules.js';

function pathScan(e, game) {
  return Math.sin(game.time * 2.1 + (e.anchorIdx || 0) * 1.7) * 0.3;
}

export function applyTeammateSeparation(e, game) {
  for (const o of game.entities) {
    if (o === e || o.dead || o.team !== e.team) continue;
    const dx = e.x - o.x, dy = e.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) {
      const ang = (e.anchorIdx || 0) * 1.7 + 0.7;
      e.x += Math.cos(ang) * 3;
      e.y += Math.sin(ang) * 3;
      continue;
    }
    if (d > 0 && d < 72) {
      const f = (72 - d) / 72 * 0.85;
      const nx = dx / d, ny = dy / d;
      const side = (e.anchorIdx || 0) % 2 ? 1 : -1;
      e.x += nx * f + (-ny) * f * 0.4 * side;
      e.y += ny * f + nx * f * 0.4 * side;
    }
  }
}

export function updateBots(game, dt) {
  game.aliveCounts = { t: 0, ct: 0 };
  for (const o of game.entities) { if (!o.dead && (o.team === 't' || o.team === 'ct')) game.aliveCounts[o.team]++; }
  if (game.player && game.player.dead && game.playerRoleFilled !== game.round) {
    fillPlayerRole(game);
    game.playerRoleFilled = game.round;
  } else if (!game.player || !game.player.dead) {
    game.playerRoleFilled = 0;
  }
  if (game.leadershipAt === undefined || game.time - game.leadershipAt > 0.5) {
    refreshLeadership(game);
    game.leadershipAt = game.time;
  }
  for (const e of game.entities) {
    if (!e.bot || e.dead) continue;
    if (e.repathT > 0) e.repathT -= dt;
    updateShotStreak(e, dt);
    botThink(e, game, dt);
    botActions(e, game, dt);
    applyTeammateSeparation(e, game);
  }
  for (const e of game.entities) {
    if (!e.bot || e.dead) continue;
    const w = weaponDef(e);
    const lowAmmo = w.mag > 0 && ammoFor(e) <= Math.max(2, Math.floor(w.mag * 0.15)) && !e.aimTarget;
    const closeEnemy = e.aimTarget && !e.aimTarget.dead && Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) < 250;
    if (shouldSwitchPistol(ammoFor(e), closeEnemy) && e.weapons.secondary) {
      e.slot = 'secondary';
    } else if (lowAmmo && !e.reloading) {
      startReload(e, game);
    }
  }
}

function botThink(e, game, dt) {
  if (e.peekT > 0) e.peekT -= dt;
  if (e.tradeBoost > 0) e.tradeBoost -= dt;
  // Generic trade: aggressive bots push toward a fresh nearby teammate kill, conservative bots hold position.
  if ((e.tradeAt === undefined || game.roundTime - e.tradeAt > 8) && game.roundTime - (e.tradeQueryAt || -9) > 0.5) {
    e.tradeQueryAt = game.roundTime;
    const killInfo = query(game, e);
    if (shouldTradePush(e, killInfo) && (e.tradeUsed || 0) < 2) {
      const tradeDist = Math.hypot(killInfo.x - e.x, killInfo.y - e.y);
      e.tradeUsed = (e.tradeUsed || 0) + 1;
      e.tradeAt = game.roundTime;
      e.lastKnown = { x: killInfo.x, y: killInfo.y };
      e.lastKnownT = 0;
      e.lastHear = {
        angle: Math.atan2(killInfo.y - e.y, killInfo.x - e.x),
        dist: tradeDist,
        t: game.time
      };
      if (e.aiParams && e.aiParams.tradeSpeed !== undefined && killInfo.age < 0.5) e.tradeBoost = 1.0;
    }
  }
  const d = e.aiParams || diffOf(game);
  if (e.dead) return;
  if (game.freezeT > 0) {
    e.vx = 0; e.vy = 0;
    return;
  }
  if (e.team === 'ct' && e.defuseT > 0) {
    e.vx = 0; e.vy = 0;
    e.trigger = false;
    return;
  }
  if (e.blindShotT > 0) e.blindShotT -= dt;
  if (e.blind > 0) {
    e.blind -= dt;
    const blindDir = Math.sin(game.time * 3 + (e.anchorIdx || 0) * 2) > 0 ? 1 : -1;
    e.vx = Math.cos(e.angle + Math.PI / 2 * blindDir) * 60;
    e.vy = Math.sin(e.angle + Math.PI / 2 * blindDir) * 60;
    const panicTarget = e.aimTarget || (e.lastKnown && e.lastKnownT < 2.5 ? e.lastKnown : null);
    if (panicTarget) {
      e.angle = angNorm(Math.atan2(panicTarget.y - e.y, panicTarget.x - e.x) + rand(-0.35, 0.35));
      if (e.blindShotT <= 0 && rand() < dt * 1.2) {
        e.trigger = true;
        e.blindShotT = 0.5;
      }
    } else {
      e.trigger = false;
      e.angle = angNorm(e.angle + rand(-0.15, 0.15));
    }
    e.reaction = 0.1;
    return;
  }
  // 受击反击（人类本能）：被打后转身看大致方向（震惊偏移），1.2s 内保持警惕 + 队内报告
  // 公平约束：被背后偷袭时不能瞬间精确转身——转身由反应期瞄准按速度完成（背后 ×0.25），
  // 反应时间不缩短（×1.2 正常，原 0.4× 加速移除），给偷袭者补枪窗口
  if (e.lastDmgFrom && e.lastDmgFrom !== e && e.team !== e.lastDmgFrom.team && !e.lastDmgFrom.dead) {
    const dmgAge = game.time * 1000 - e.lastDmgT;
    if (dmgAge < 1200) {
      report(game, e, MSG.DMG, e.lastDmgFrom.x, e.lastDmgFrom.y);
      if (!e.aimTarget) {
        e.aimTarget = e.lastDmgFrom;
        e.reaction = Math.min(e.reaction, d.react * 1.2);
      }
    }
  }
  // 枪声感知：敌人开火 → 队内报告枪声源（与 HEAR 逻辑一致）
  if (!e.lastHearT) e.lastHearT = {};
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    if (o.lastShot > 0 && o.lastShot > (e.lastHearT[o.name] || 0)) {
      e.lastHearT[o.name] = o.lastShot;
      if (hearGunshot(e, o, game, weaponDef(o))) report(game, e, MSG.SHOT, o.x, o.y);
    }
  }
  if (e.lastHear && game.time - e.lastHear.t < 1.2 && !e.aimTarget && e.path === null) {
    e.crouched = e.lastHear.dist < 260;
    e.angle = angNorm(e.lastHear.angle + Math.sin(game.time * 2 + (e.anchorIdx || 0)) * 0.08);
  } else {
    e.crouched = false;
  }
  const vis = findVisibleEnemy(e, game);
  const weapon = weaponDef(e);
  // 目标锁定：无目标 或 当前目标已失效（阵亡/出LOS/出视野）而 FOV 内出现新威胁 → 直接切换
  // （修复原 1.4s 僵持期忽略新敌人的白给窗口）
  const aimGone = e.aimTarget && (e.aimTarget.dead || !los(game, e.x, e.y, e.aimTarget.x, e.aimTarget.y, e.height) || !canSeeInFog(game, e, e.aimTarget, 560) || Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) > viewCap(game) * 1.2);
  if (vis && (!e.aimTarget || aimGone)) {
    e.aimTarget = vis;
    e.aimLostT = 0;
    e.aimLastPos = null;
    e.reaction = d.react * (0.7 + rand() * 0.6);
    if (e.team === 'ct' && game.roundTime < 45) e.reaction *= (game.ctReactionMult || 0.45);
    // 目击报告 + 记忆槽（位置记忆，供架枪预瞄）
    report(game, e, MSG.SIGHT, vis.x, vis.y);
    if (e.igl) {
      report(game, e, MSG.FOCUS, vis.x, vis.y);
      if (e.team === 't') game.tFocus = { x: vis.x, y: vis.y, at: game.time };
    }
    if (!e.memory) e.memory = [];
    e.memory.push({ x: vis.x, y: vis.y, t: game.time, conf: 1 });
    if (e.memory.length > 8) e.memory.shift();
  }
  if (e.aimTarget && (e.aimTarget.dead || !los(game, e.x, e.y, e.aimTarget.x, e.aimTarget.y, e.height) || !canSeeInFog(game, e, e.aimTarget, 560) || Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) > viewCap(game) * 1.2)) {
    if (e.aimLostT > 0.8) {
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
    if (e.aimTarget) {
      // 反应期瞄准：按 aimSpeed 受限转身（拟合人类举枪瞄准耗时），背后目标慢转（×0.25）
      // 修复"背后偷袭被瞬秒"：反应期不再瞬转到目标，转身需要时间，给偷袭者补枪窗口
      const wantA = Math.atan2(e.aimTarget.y - e.y, e.aimTarget.x - e.x);
      const diffR = angDiff(wantA, e.angle);
      const behindR = Math.abs(diffR) > BOT_AI.FOV;
      const flickR = Math.abs(diffR) > 0.4 && !behindR ? 6 : 1;
      const turnR = behindR ? 0.25 : 1;
      e.angle = angNorm(e.angle + clamp(diffR, -d.aimSpeed * flickR * dt * turnR, d.aimSpeed * flickR * dt * turnR));
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
  // aimGone 已在目标锁定阶段计算（dead/LOS/fog/距离），复用避免同帧二次 LOS 射线
  const canSeeTarget = e.aimTarget && !e.aimTarget.dead && !aimGone;
  const combat = canSeeTarget && e.reaction <= 0;
  if (combat && e.team === 'ct' && game.bomb && game.bomb.planted) {
    const b = game.bomb;
    const myD = Math.hypot(e.x - b.x, e.y - b.y);
    const tD = Math.hypot(e.aimTarget.x - b.x, e.aimTarget.y - b.y);
    if (myD > 420 && tD > 260) {
      pathTo(e, b.x, b.y);
      e.angle = angNorm(Math.atan2(b.y - e.y, b.x - e.x));
      followPath(e, dt, weapon.speed * 235);
      return;
    }
  }
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
    // 狙击手开镜：战斗全程 scoped（combat.js 开镜精度 0.15），移动减速作代价
    const wS = weaponDef(e);
    if (wS && wS.kind === 'sniper') e.scoped = true;
    else if (e.scoped) e.scoped = false;
    const t = e.aimTarget;
    const td = Math.hypot(t.x - e.x, t.y - e.y);
    if ((t.reloading || t.blind > 0) && td < 300) {
      const pushSpd = weapon.speed * 235 * 0.8;
      e.vx = Math.cos(e.angle) * pushSpd;
      e.vy = Math.sin(e.angle) * pushSpd;
      return;
    }
    const backAng = Math.atan2(e.y - t.y, e.x - t.x);
    if (Math.abs(angDiff(t.angle, backAng)) > 2.4 && td < 420 && wS.kind !== 'sniper') {
      e.angle = angNorm(Math.atan2(t.y - e.y, t.x - e.x));
      const backSpd = weapon.speed * 235 * 0.9;
      e.vx = Math.cos(e.angle) * backSpd;
      e.vy = Math.sin(e.angle) * backSpd;
      return;
    }
    if (e.hp < 60 && td < 180 && (t.hp || 100) >= e.hp) {
      const backSpd = weapon.speed * 235 * 0.7;
      e.vx = -Math.cos(e.angle) * backSpd;
      e.vy = -Math.sin(e.angle) * backSpd;
      return;
    }
    const lead = td > 500 ? 0.05 : 0;
    const leadX = t.x + t.vx * lead, leadY = t.y + t.vy * lead;
    const wantAng = Math.atan2(leadY - e.y, leadX - e.x);
    // 瞄准误差 = 基础散布 + 距离衰减 + 目标横向移动预测误差（移动目标更难打，近距离不再必中）
    const tvx = t.vx || 0, tvy = t.vy || 0;
    const tSpeed = Math.hypot(tvx, tvy);
    const latErr = td > 20 ? (Math.abs(tvx * Math.cos(e.angle + Math.PI / 2) + tvy * Math.sin(e.angle + Math.PI / 2)) / (120 + td * 0.35)) : 0;
    const err = (d.spreadMult * (0.5 + td / 900) + weapon.spread * 0.3 + latErr * 0.9) * (Math.PI / 180);
    const diff = angDiff(wantAng, e.angle);
    // 甩枪 + 微调（拟合人类瞄准）：大角度快速转向，小角度精细逼近
    // S3 补枪加速：tradeBoost 期间角速度 ×(1 + tradeBoost*(tradeSpeed-1))
    const tradeMul = e.tradeBoost > 0 && d.tradeSpeed !== undefined ? (1 + e.tradeBoost * (d.tradeSpeed - 1)) : 1;
    // 背对惩罚（视觉限制）：目标在视野外（背后）时无预瞄，转身速度 ×0.25 且不触发甩枪
    // —— 修复"背后偷袭被瞬秒"：给偷袭者留出转身窗口
    const behind = Math.abs(diff) > BOT_AI.FOV;
    const flick = Math.abs(diff) > 0.4 && !behind ? 6 : 1;
    const turnPenalty = behind ? 0.25 : 1;
    e.angle = angNorm(e.angle + clamp(diff, -d.aimSpeed * flick * dt * tradeMul * turnPenalty, d.aimSpeed * flick * dt * tradeMul * turnPenalty));
    // 攻坚判定：T 接近攻击点且未安弹时进入突击模式（移动中开火 + zigzag）
    const atkCs = e.team === 't' ? (game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B) : null;
    const assaulting = !!(atkCs && !(game.bomb && game.bomb.planted) && !e.hasBomb &&
      Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy) < 620 && Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy) > 90);
    const arch2 = styleOf(e).arch;
    const irEarly = idealRange(e, d);
    if (wS.kind === 'sniper' && !assaulting && td < irEarly.min * 0.65) {
      const away = Math.atan2(e.y - t.y, e.x - t.x);
      e.angle = angNorm(away);
      e.vx = Math.cos(away) * weapon.speed * 235 * 0.9;
      e.vy = Math.sin(away) * weapon.speed * 235 * 0.9;
      e.crouched = false;
      return;
    }
    if (!assaulting && arch2.idealMul < 0.85 && td > irEarly.max * 1.15 && !e.hasBomb) {
      const toward = Math.atan2(t.y - e.y, t.x - e.x);
      e.angle = angNorm(toward);
      e.vx = Math.cos(toward) * weapon.speed * 235 * 0.75;
      e.vy = Math.sin(toward) * weapon.speed * 235 * 0.75;
      return;
    }
    // 命中角度驱动开火（物理真实）：瞄准误差须进入命中窗口（敌人体型半径）
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
    const spd = weapon.speed * 235 * (e.scoped ? 0.45 : 1);
    if (assaulting) {
      if (td < 300) {
        // 近距攻坚：停止移动直接对枪（静止散布最小）
        e.vx *= 0.2; e.vy *= 0.2;
        return;
      }
      // 突击模式：zigzag 冲刺进点，边跑边打（移动散布作为代价换取突破）
      e.crouched = false;
      const aimAng = Math.atan2(atkCs.cy - e.y, atkCs.cx - e.x);
      const sway = Math.sin(game.time * 1000 / 260 + e.anchorIdx * 1.7) * 0.28;
      e.vx = Math.cos(aimAng + Math.PI / 2 * sway) * spd * 0.9;
      e.vy = Math.sin(aimAng + Math.PI / 2 * sway) * spd * 0.9;
      return;
    }
    // 近距蹲射：150px 内压枪蹲扫（crouch 散布 0.75 + 身位降低 + 几乎静止）
    const crouchFight = td < 150 && (wS.kind !== 'sniper');
    e.crouched = crouchFight;
    if (crouchFight) {
      e.vx *= 0.15; e.vy *= 0.15;
    }
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      // 人格：沉稳的 bot 换向频率更低（steadiness 高 → 间隔长）
      const st = styleOf(e);
      e.strafeT = d.strafe * (0.5 + rand()) * (2 - st.p.steadiness);
      e.strafeDir = rand() < 0.5 ? -1 : 1;
      if (rand() < 0.25) e.strafeDir = 0;
    }
    const ir = idealRange(e, d);
    const ideal = td > ir.max ? 1 : (td < ir.min ? -1 : 0);
    const sway = Math.sin(game.time * 1000 / 450) * 0.5;
    if (e.strafeDir === 0) {
      const strafeAng = e.angle + Math.PI / 2 * sway;
      e.vx = Math.cos(strafeAng) * spd * 0.3 + Math.cos(e.angle) * ideal * spd * 0.3;
      e.vy = Math.sin(strafeAng) * spd * 0.3 + Math.sin(e.angle) * ideal * spd * 0.3;
    } else {
      e.vx = Math.cos(e.angle + Math.PI / 2 * e.strafeDir) * spd * 0.4 + Math.cos(e.angle) * ideal * spd * 0.3;
      e.vy = Math.sin(e.angle + Math.PI / 2 * e.strafeDir) * spd * 0.4 + Math.sin(e.angle) * ideal * spd * 0.3;
    }
    if (rand() < 0.015 * (d.nadeUse || 1) && e.weapons.nades.flash > 0 && td < 700 && game.roundTime - (game.combatFlashAt || 0) > 4) {
      game.combatFlashAt = game.roundTime;
      e.slot = 'nade:flash';
      throwGrenade(e, game);
      e.slot = 'primary';
    }
    return;
  }
  if (e.team === 't' && shouldPushLatePlant(e, game.roundTime || 0, game.roundDur || 115)) {
    const plantSite = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    if (plantSite) {
      e.trigger = false;
      e.latePlantPush = true;
      if (e.path === null && e.repathT <= 0) {
        pathTo(e, plantSite.cx, plantSite.cy);
        e.repathT = 1.2;
      }
      if (e.path) {
        e.angle = angNorm(Math.atan2(plantSite.cy - e.y, plantSite.cx - e.x));
        followPath(e, dt, weapon.speed * 235);
        return;
      }
    }
  }
  if (e.team === 't' && shouldSaveForEco(e, e.money || 0, (e.weapons && (e.weapons.primary === 'ak' || e.weapons.primary === 'm4' || e.weapons.primary === 'awp')) ? 2 : 0, game.roundTime || 0, game.roundDur || 115)) {
    e.trigger = false;
    e.ecoRetreat = true;
    const tSpawn = getMap().spawns.t && getMap().spawns.t[0];
    if (tSpawn) {
      const anchor = e.anchorIdx || 0;
      const sx = tSpawn.x + (anchor % 3) * 90 - 90;
      const sy = tSpawn.y + (anchor % 2 ? 55 : -55);
      if (e.path === null && e.repathT <= 0) {
        pathTo(e, sx, sy);
        e.repathT = 1.2;
      }
      if (e.path) {
        e.angle = angNorm(Math.atan2(sy - e.y, sx - e.x));
        followPath(e, dt, weapon.speed * 235);
        return;
      }
    }
  }
  const obj = botObjective(e, game);
  if (obj) {
    // 非战斗推进：收镜 + 起立 + 静步状态按目标标记管理（lurk 绕后静步摸点）
    if (e.scoped) e.scoped = false;
    if (e.crouched) e.crouched = false;
    const wantWalk = !!(obj.sneak && e.path);
    if (wantWalk !== !!e.walking) e.walking = wantWalk;
    // H11 战术协同（intel 模式）：进点末段（<420px）全员同步封烟+闪光强打
    if (e.aiParams && e.aiParams.intel && e.weapons && e.weapons.nades && obj.nade) {
      const smokeNow = e.weapons.nades.smoke > 0 && rand() < dt * 3;
      const flashNow = e.weapons.nades.flash > 0 && rand() < dt * 2.5;
      if (smokeNow || flashNow) {
        e.slot = smokeNow ? 'nade:smoke' : 'nade:flash';
        throwGrenade(e, game);
        e.slot = 'primary';
        e.lastNadeT = game.roundTime;
      }
    }
    const tUtilitySite = e.team === 't' && !(game.bomb && game.bomb.planted)
      ? (game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B)
      : null;
    if (tUtilitySite && e.weapons && e.weapons.nades) {
      const distToSite = Math.hypot(e.x - tUtilitySite.cx, e.y - tUtilitySite.cy);
      const enNear = aliveCount(game, 'ct');
      const nades = e.weapons.nades;
      const roundTime = game.roundTime || 0;
      const smokeNow = shouldThrowUtility(e, 'smoke', nades.smoke || 0, distToSite, roundTime, enNear) &&
        rand() < dt * 0.8 && game.roundTime - (e.lastNadeT || 0) > 6;
      const flashNow = shouldThrowUtility(e, 'flash', nades.flash || 0, distToSite, roundTime, enNear) &&
        rand() < dt * 1.5 && game.roundTime - (e.lastNadeT || 0) > 5;
      const heNow = shouldThrowUtility(e, 'he', nades.he || 0, distToSite, roundTime, enNear) &&
        rand() < dt * 1.2 && game.roundTime - (e.lastNadeT || 0) > 5;
      if (smokeNow || flashNow || heNow) {
        e.slot = smokeNow ? 'nade:smoke' : (flashNow ? 'nade:flash' : 'nade:he');
        throwGrenade(e, game);
        e.slot = 'primary';
        e.lastNadeT = game.roundTime;
      }
    }
    // 投掷推进（net nade 动作 / 基因 nadeUse）：进点前沿移动丢闪清点
    if (obj.nade && e.weapons && e.weapons.nades && e.weapons.nades.flash > 0 && rand() < dt * 1.5 && game.roundTime - (e.lastNadeT || 0) > 8) {
      e.slot = 'nade:flash';
      throwGrenade(e, game);
      e.slot = 'primary';
      e.lastNadeT = game.roundTime;
    } else if (obj.nade && e.weapons && e.weapons.nades && e.weapons.nades.he > 0 && e.weapons.nades.flash <= 0 && rand() < dt * 0.8 && game.roundTime - (e.lastNadeT || 0) > 8) {
      e.angle = angNorm(Math.atan2(obj.y - e.y, obj.x - e.x));
      e.slot = 'nade:he';
      throwGrenade(e, game);
      e.slot = 'primary';
      e.lastNadeT = game.roundTime;
    }
    if (Math.hypot(obj.x - e.x, obj.y - e.y) < 24) {
      e.vx = 0; e.vy = 0;
      e.path = null; e.repathT = 0; e.stuckEscapes = 0;
      // 站定架枪：狙击手开镜待机（等目标入镜即准镜命中）
      const wHold = weaponDef(e);
      if (wHold && wHold.kind === 'sniper' && !e.aimTarget) e.scoped = true;
      if (obj.face !== undefined) e.angle = angNorm(obj.face);
    } else {
      // 小身位探点（net peek 动作 / peekChance 基因）：接近目标边缘时快速垂直摆动探视
      const pkNear = Math.hypot(obj.x - e.x, obj.y - e.y) < 260;
      const activePeek = obj.peek && rand() < dt * 0.9;
      const randomPeek = !obj.peek && d.peekChance !== undefined && pkNear && rand() < d.peekChance * dt * 3;
      const pkTrigger = (activePeek || randomPeek) && e.peekT <= 0 && (e.peekCount || 0) < 3;
      if (pkTrigger && pkNear) {
        e.peekCount = (e.peekCount || 0) + 1;
        e.peekT = 0.25; // S3 探身标记：combat.js 探身精度减免
        const pkDir = Math.sin(game.time * 2.4 + e.anchorIdx * 1.9) > 0 ? 1 : -1;
        e.vx = Math.cos(e.angle + Math.PI / 2 * pkDir) * weapon.speed * 235 * 0.6;
        e.vy = Math.sin(e.angle + Math.PI / 2 * pkDir) * weapon.speed * 235 * 0.6;
        e.path = null;
        if (e.repathT > 0.9) e.repathT = 0.5;
      } else {
        // S3 预瞄提前枪（H11 专用）：接近目标（转角/门口）时概率朝目标方向提前开火
        if (d.prefireChance !== undefined && pkNear && !e.reloading && (hasPrefireIntel(e, game) || obj.peek || obj.nade || obj.preaimX !== undefined) && rand() < d.prefireChance * dt * 3) {
          const aimX = obj.preaimX !== undefined ? obj.preaimX : obj.x;
          const aimY = obj.preaimY !== undefined ? obj.preaimY : obj.y;
          e.angle = angNorm(Math.atan2(aimY - e.y, aimX - e.x));
          e.trigger = true;
        }
        if (e.path === null) {
          if (e.repathT <= 0) {
            e.stuckEscapes = (e.stuckEscapes || 0) + 1;
            const sideDir = (e.anchorIdx || 0) % 2 ? 1 : -1;
            const sideAng = e.stuckEscapes > 2 ? Math.atan2(obj.y - e.y, obj.x - e.x) + Math.PI / 2 * sideDir : 0;
            const tx = e.stuckEscapes > 2 ? obj.x + Math.cos(sideAng) * 150 : obj.x;
            const ty = e.stuckEscapes > 2 ? obj.y + Math.sin(sideAng) * 150 : obj.y;
            pathTo(e, tx, ty);
            if (!e.path) {
              const fallbackAng = Math.atan2(ty - e.y, tx - e.x);
              e.angle = angNorm(fallbackAng);
              e.vx = Math.cos(fallbackAng) * weapon.speed * 235;
              e.vy = Math.sin(fallbackAng) * weapon.speed * 235;
            }
            e.repathT = e.stuckEscapes > 2 ? 0.6 : 0.8;
          }
        } else {
          const done = followPath(e, dt, weapon.speed * 235, 0, pathScan(e, game));
          if (!done) {
            // followPath 返回 false 有两种含义：合法到达终点 / 真卡死。
            // 到达目标附近时不得计入 stuck（防 stuckEscapes 虚增导致目标点绕圈）
            const arrived = obj && Math.hypot(e.x - obj.x, e.y - obj.y) < 48;
            e.path = null;
            if (arrived) {
              e.stuckT = 0;
              e.repathT = 0;
              e.stuckEscapes = 0;
            } else {
              e.stuckT = 0;
              e.repathT = 1.1;
              e.stuckEscapes = (e.stuckEscapes || 0) + 1;
            }
          }
        }
      }
      // 移动扫视（拟合人类）：朝目标方向 ±0.95rad 摆动视角，扩大 FOV 覆盖；
      // 有新鲜目击记忆时改为架枪记忆点（预瞄）
      const freshMem = (e.memory || []).find((m) => game.time - m.t < 2);
      if (!e.path) {
        e.angle = angNorm(Math.atan2(obj.y - e.y, obj.x - e.x) +
          (freshMem ? 0 : Math.sin(game.time * 3.2 + e.anchorIdx * 1.3) * 0.95));
      }
    }
  }
  const myAliveCount = aliveCount(game, e.team);
  const lowSolo = e.hp < 30 && myAliveCount <= 1;
  if (e.lastKnown && !lowSolo && !e.aimTarget && !e.hasBomb && shouldReactToIntel(e, game, 'lastKnown', e.lastKnown.x, e.lastKnown.y)) {
    const lk = e.lastKnown;
    const lkd = Math.hypot(e.x - lk.x, e.y - lk.y);
    if (e.lastKnownT < 3 && lkd > 70 && lkd < 700) {
      if (e.path === null && e.repathT <= 0) {
        pathTo(e, lk.x, lk.y);
        e.repathT = 1.2;
      }
      e.angle = angNorm(Math.atan2(lk.y - e.y, lk.x - e.x));
      const quiet = lkd < 420;
      if (!!e.walking !== quiet) e.walking = quiet;
      if (!followPath(e, dt, weapon.speed * 235, 0, pathScan(e, game))) {
        // 已到达记忆点附近：视为追踪完成，不做 stuck 重寻路
        if (Math.hypot(e.x - lk.x, e.y - lk.y) < 48) { e.repathT = 0; e.stuckEscapes = 0; }
        else e.repathT = 1.0;
      }
    }
  }
  // 队内情报探查（共享黑板）：队友目击/枪声/受击/击杀 → 前往模糊位置侦察（信息衰减）
  if (!e.lastKnown && !e.aimTarget && !e.hasBomb && (e.team === 'ct' || game.roundTime > 12)) {
    const info = query(game, e);
    if (info && info.age < 4 && shouldReactToIntel(e, game, info.type, info.x, info.y)) {
      const d2 = Math.hypot(info.x - e.x, info.y - e.y);
      if (d2 > 60 && d2 < 800) {
        if (e.path === null && e.repathT <= 0) { pathTo(e, info.x, info.y); e.repathT = 1.0; }
        e.angle = angNorm(Math.atan2(info.y - e.y, info.x - e.x));
        const quietInfo = d2 < 420;
        if (!!e.walking !== quietInfo) e.walking = quietInfo;
        if (!followPath(e, dt, weapon.speed * 235, 0, pathScan(e, game))) {
          if (Math.hypot(e.x - info.x, e.y - info.y) < 48) { e.repathT = 0; e.stuckEscapes = 0; }
          else e.repathT = 1.0;
        }
      }
    }
  }
  if (e.lastKnown) e.lastKnownT += dt;
  if (e.lastKnown && e.lastKnownT > 4) {
    e.lastKnown = null;
    e.lastKnownT = 99;
  }
  // 记忆遗忘（目击记忆 3s 内有效，置信度衰减）
  if (e.memory && e.memory.length) {
    for (let i = e.memory.length - 1; i >= 0; i--) {
      e.memory[i].conf -= dt * 0.06;
      if (e.memory[i].conf <= 0 || game.time - e.memory[i].t > 3) e.memory.splice(i, 1);
    }
  }
}
