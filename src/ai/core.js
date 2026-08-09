// AI 主循环 + 感知→决策调度（botThink）
import { DIFF, diffOf } from '../config.js';
import { los, pathTo, followPath, getMap } from '../map.js';
import { weaponDef, ammoFor } from '../entities.js';
import { startReload } from '../combat.js';
import { updateShotStreak } from '../ballistic.js';
import { throwGrenade } from '../grenades.js';
import { report, query, MSG } from '../info.js';
import { clamp, rand, angDiff, angNorm, viewCap } from '../utils.js';
import { styleOf } from './shared.js';
import { findVisibleEnemy } from './perception.js';
import { shouldSaveForEco, shouldRepositionOnIntel } from './rules.js';
import { botObjective, ctReactsTo } from './decisions.js';
import { botActions } from './actions.js';

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
  if (e.peekT > 0) e.peekT -= dt;
  if (e.tradeBoost > 0) e.tradeBoost -= dt;
  // S3 补枪加速（H11 专用）：队友 0.5s 内阵亡（KILL 消息）→ 瞄准速度提升 tradeSpeed 倍
  if (e.aiParams && e.aiParams.tradeSpeed !== undefined && e.tradeBoost <= 0) {
    const killInfo = query(game, e);
    if (killInfo && killInfo.type === 'kill' && killInfo.age < 0.5) e.tradeBoost = 1.0;
  }
  const d = e.aiParams || diffOf(game);
  if (e.dead) return;
  if (game.freezeT > 0) {
    e.vx = 0; e.vy = 0;
    return;
  }
  if (e.blind > 0) {
    e.blind -= dt;
    e.vx = Math.cos(e.angle) * 60;
    e.vy = Math.sin(e.angle) * 60;
    if (rand() < 0.08) e.trigger = rand() < 0.5;
    e.angle = angNorm(e.angle + rand(-0.3, 0.3));
    e.reaction = 0.1;
    return;
  }
  // 受击反击（人类本能）：被打后立即转身看向攻击者，1.2s 内保持警惕 + 队内报告
  if (e.lastDmgFrom && e.lastDmgFrom !== e && e.team !== e.lastDmgFrom.team && !e.lastDmgFrom.dead) {
    const dmgAge = game.time * 1000 - e.lastDmgT;
    if (dmgAge < 1200) {
      report(game, e, MSG.DMG, e.lastDmgFrom.x, e.lastDmgFrom.y);
      e.angle = angNorm(Math.atan2(e.lastDmgFrom.y - e.y, e.lastDmgFrom.x - e.x));
      if (!e.aimTarget) {
        e.aimTarget = e.lastDmgFrom;
        e.reaction = Math.min(e.reaction, d.react * 0.4);
      }
    }
  }
  // 枪声感知：敌人开火 → 队内报告枪声源（与 HEAR 逻辑一致）
  if (!e.lastHearT) e.lastHearT = {};
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    if (o.lastShot > 0 && o.lastShot > (e.lastHearT[o.name] || 0)) {
      e.lastHearT[o.name] = o.lastShot;
      report(game, e, MSG.SHOT, o.x, o.y);
    }
  }
  const vis = findVisibleEnemy(e, game);
  const weapon = weaponDef(e);
  if (vis && !e.aimTarget) {
    e.aimTarget = vis;
    e.reaction = d.react * (0.7 + rand() * 0.6);
    // 目击报告 + 记忆槽（位置记忆，供架枪预瞄）
    report(game, e, MSG.SIGHT, vis.x, vis.y);
    if (!e.memory) e.memory = [];
    e.memory.push({ x: vis.x, y: vis.y, t: game.time, conf: 1 });
    if (e.memory.length > 8) e.memory.shift();
  }
  if (e.aimTarget && (e.aimTarget.dead || !los(game, e.x, e.y, e.aimTarget.x, e.aimTarget.y, e.height) || Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) > viewCap(game) * 1.2)) {
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
    if (e.aimTarget && rand() < 0.4) {
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
  const canSeeTarget = e.aimTarget && !e.aimTarget.dead && los(game, e.x, e.y, e.aimTarget.x, e.aimTarget.y, e.height);
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
    // S3 补枪加速：tradeBoost 期间角速度 ×(1 + tradeBoost*(tradeSpeed-1))
    const tradeMul = e.tradeBoost > 0 && d.tradeSpeed !== undefined ? (1 + e.tradeBoost * (d.tradeSpeed - 1)) : 1;
    const flick = Math.abs(diff) > 0.4 ? 6 : 1;
    e.angle = angNorm(e.angle + clamp(diff, -d.aimSpeed * flick * dt * tradeMul, d.aimSpeed * flick * dt * tradeMul));
    // 攻坚判定：T 接近攻击点且未安弹时进入突击模式（移动中开火 + zigzag）
    const atkCs = e.team === 't' ? (game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B) : null;
    const assaulting = !!(atkCs && !(game.bomb && game.bomb.planted) && !e.hasBomb &&
      Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy) < 620 && Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy) > 90);
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
      // 人格：沉稳的 bot 换向频率更低（steadiness 高 → 间隔长）
      const st = styleOf(e);
      e.strafeT = d.strafe * (0.5 + rand()) * (2 - st.p.steadiness);
      e.strafeDir = rand() < 0.5 ? -1 : 1;
      if (rand() < 0.25) e.strafeDir = 0;
    }
    const arch2 = styleOf(e).arch;
    const ideal = td > (d.idealMax || 550) * arch2.idealMul ? 1 : (td < (d.idealMin || 220) * arch2.idealMul ? -1 : 0);
    const sway = Math.sin(game.time * 1000 / 450) * 0.5;
    if (e.strafeDir === 0) {
      const strafeAng = e.angle + Math.PI / 2 * sway;
      e.vx = Math.cos(strafeAng) * spd * 0.3 + Math.cos(e.angle) * ideal * spd * 0.3;
      e.vy = Math.sin(strafeAng) * spd * 0.3 + Math.sin(e.angle) * ideal * spd * 0.3;
    } else {
      e.vx = Math.cos(e.angle + Math.PI / 2 * e.strafeDir) * spd * 0.4 + Math.cos(e.angle) * ideal * spd * 0.3;
      e.vy = Math.sin(e.angle + Math.PI / 2 * e.strafeDir) * spd * 0.4 + Math.sin(e.angle) * ideal * spd * 0.3;
    }
    if (rand() < 0.015 * (d.nadeUse || 1) && e.weapons.nades.flash > 0 && td < 700) {
      e.slot = 'nade:flash';
      throwGrenade(e, game);
      e.slot = 'primary';
    }
    return;
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
  const ctHold = e.role === 'a' ? getMap().holds.A : e.role === 'b' ? getMap().holds.B : null;
  const ctHome = ctHold && ctHold.anchors && ctHold.anchors.length ? ctHold.anchors[0] : (getMap().spawns.ct && getMap().spawns.ct[0]);
  const intelAge = e.lastKnown && e.lastKnownT < 99 ? e.lastKnownT : 99;
  const distHome = ctHome ? Math.hypot(e.x - ctHome.x, e.y - ctHome.y) : 0;
  if (ctHome && shouldRepositionOnIntel(e, intelAge, distHome, !!(game.bomb && game.bomb.planted))) {
    e.trigger = false;
    e.repositionOnIntel = true;
    if (e.path === null && e.repathT <= 0) {
      pathTo(e, ctHome.x, ctHome.y);
      e.repathT = 1.2;
    }
    if (e.path) {
      e.angle = angNorm(Math.atan2(ctHome.y - e.y, ctHome.x - e.x));
      followPath(e, dt, weapon.speed * 235);
      return;
    }
  }
  const obj = botObjective(e, game);
  if (obj) {
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
    // 投掷推进（net nade 动作 / 基因 nadeUse）：进点前沿移动丢闪清点
    if (obj.nade && e.weapons && e.weapons.nades && e.weapons.nades.flash > 0 && rand() < dt * 1.5 && game.roundTime - (e.lastNadeT || 0) > 8) {
      e.slot = 'nade:flash';
      throwGrenade(e, game);
      e.slot = 'primary';
      e.lastNadeT = game.roundTime;
    }
    if (Math.hypot(obj.x - e.x, obj.y - e.y) < 24) {
      e.vx = 0; e.vy = 0;
      e.path = null; e.repathT = 0;
      if (obj.face !== undefined) e.angle = angNorm(obj.face);
    } else {
      // 小身位探点（net peek 动作 / peekChance 基因）：接近目标边缘时快速垂直摆动探视
      const pkNear = Math.hypot(obj.x - e.x, obj.y - e.y) < 260;
      const pkTrigger = obj.peek || (d.peekChance !== undefined && pkNear && rand() < d.peekChance * dt * 4);
      if (pkTrigger && pkNear) {
        e.peekT = 0.25; // S3 探身标记：combat.js 探身精度减免
        const pkDir = Math.sin(game.time * 2.4 + e.anchorIdx * 1.9) > 0 ? 1 : -1;
        e.vx = Math.cos(e.angle + Math.PI / 2 * pkDir) * weapon.speed * 235 * 0.6;
        e.vy = Math.sin(e.angle + Math.PI / 2 * pkDir) * weapon.speed * 235 * 0.6;
        e.path = null;
        if (e.repathT > 0.9) e.repathT = 0.5;
      } else {
        // S3 预瞄提前枪（H11 专用）：接近目标（转角/门口）时概率朝目标方向提前开火
        if (d.prefireChance !== undefined && pkNear && !e.reloading && rand() < d.prefireChance * dt * 3) {
          e.angle = angNorm(Math.atan2(obj.y - e.y, obj.x - e.x));
          e.trigger = true;
        }
        if (e.path === null) {
          if (e.repathT <= 0) {
            pathTo(e, obj.x, obj.y);
            e.repathT = 0.8;
          }
        } else {
          const done = followPath(e, dt, weapon.speed * 235);
          if (!done) { e.path = null; e.repathT = 0; }
        }
      }
      // 移动扫视（拟合人类）：朝目标方向 ±0.95rad 摆动视角，扩大 FOV 覆盖；
      // 有新鲜目击记忆时改为架枪记忆点（预瞄）
      const freshMem = (e.memory || []).find((m) => game.time - m.t < 2);
      e.angle = angNorm(Math.atan2(obj.y - e.y, obj.x - e.x) +
        (freshMem ? 0 : Math.sin(game.time * 3.2 + e.anchorIdx * 1.3) * 0.95));
    }
  }
  if (e.lastKnown && !e.aimTarget && !e.hasBomb && (e.team !== 'ct' || ctReactsTo(e, game, e.lastKnown.x, e.lastKnown.y))) {
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
  // 队内情报探查（共享黑板）：队友目击/枪声/受击/击杀 → 前往模糊位置侦察（信息衰减）
  if (!e.lastKnown && !e.aimTarget && !e.hasBomb && (e.team === 'ct' || game.roundTime > 12)) {
    const info = query(game, e);
    if (info && info.age < 4 && (e.team !== 'ct' || ctReactsTo(e, game, info.x, info.y))) {
      const d2 = Math.hypot(info.x - e.x, info.y - e.y);
      if (d2 > 60 && d2 < 800) {
        if (e.path === null && e.repathT <= 0) { pathTo(e, info.x, info.y); e.repathT = 1.0; }
        e.angle = angNorm(Math.atan2(info.y - e.y, info.x - e.x));
        followPath(e, dt, weapon.speed * 235);
      }
    }
  }
  if (e.lastKnown) e.lastKnownT += dt;
  // 记忆遗忘（目击记忆 3s 内有效，置信度衰减）
  if (e.memory && e.memory.length) {
    for (let i = e.memory.length - 1; i >= 0; i--) {
      e.memory[i].conf -= dt * 0.06;
      if (e.memory[i].conf <= 0 || game.time - e.memory[i].t > 3) e.memory.splice(i, 1);
    }
  }
}
