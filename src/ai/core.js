// AI 主循环 + 感知→决策调度（botThink）
import { DIFF, diffOf } from '../config.js';
import { pathTo, followPath, getMap, los } from '../map.js';
import { weaponDef, ammoFor } from '../entities.js';
import { startReload } from '../combat.js';
import { updateShotStreak } from '../ballistic.js';
import { throwGrenade } from '../grenades.js';
import { report, query, MSG } from '../info.js';
import { clamp, rand, angDiff, angNorm, viewCap } from '../utils.js';
import { styleOf, shouldTradePush } from './shared.js';
import { findVisibleEnemy } from './perception.js';
import { shouldSaveForEco } from './rules.js';
import { botObjective, ctReactsTo } from './decisions.js';
import { botActions } from './actions.js';
import { peekPlan, peekPhase, peekStance, peekSkillOf } from './peek.js';
import { hearGunshot } from './senses.js';
import { hasLineOfSight } from '../fog.js';

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
  for (const e of game.entities) {
    if (!e.bot || e.dead || e.netControlled) continue;
    if (e.repathT > 0) e.repathT -= dt;
    updateShotStreak(e, dt);
    botThink(e, game, dt);
    botActions(e, game, dt);
    applyTeammateSeparation(e, game);
  }
  for (const e of game.entities) {
    if (!e.bot || e.dead || e.netControlled) continue;
    const w = weaponDef(e);
    if (w.mag > 0 && ammoFor(e) <= 0 && !e.reloading) startReload(e, game);
  }
}

// 掩体后对枪适用性判定：持包/攻坚/过远过近不缩头，保持原有推进/站桩逻辑
function shouldPeekFight(e, game, enemy) {
  if (e.hasBomb) return false;
  const td = Math.hypot(enemy.x - e.x, enemy.y - e.y);
  if (td < 150 || td > 900) return false;
  if (e.team === 't') {
    const atkCs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    if (atkCs && !(game.bomb && game.bomb.planted)) {
      const dSite = Math.hypot(e.x - atkCs.cx, e.y - atkCs.cy);
      if (dSite < 620 && dSite > 90) return false; // 突击模式不缩头
    }
  }
  return true;
}

// 执行掩体后对枪相位：探出（移向探出点+开火）/ 缩回 / 隐蔽
function runPeek(e, game, dt, enemy, pk, weapon) {
  // 身位档调制：wide 大身位快速拉出（主动），jiggle 小身位慢速谨慎（低 peekSkill 更安全）
  const stTier = peekStance(peekSkillOf(e), Math.hypot(enemy.x - e.x, enemy.y - e.y)).tier;
  const spd = weapon.speed * 235 * (stTier === 'wide' ? 1.08 : (stTier === 'jiggle' ? 0.6 : 1));
  // 朝向敌人（轻微扫动模拟人类架枪）
  e.angle = angNorm(Math.atan2(enemy.y - e.y, enemy.x - e.x) + Math.sin(game.time * 3 + (e.anchorIdx || 0)) * 0.05);
  if (pk.action === 'peek') {
    // 探出：移向掩体外能看清敌人的探出点，命中窗口内开火
    e.peekT = 0.25; // 探身标记：combat.js 按 peekSkill 减免散布
    const dx = pk.peekX - e.x, dy = pk.peekY - e.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 4) {
      e.vx = dx / dd * spd * 0.6;
      e.vy = dy / dd * spd * 0.6;
    } else {
      e.vx = 0; e.vy = 0;
    }
    const td = Math.hypot(enemy.x - e.x, enemy.y - e.y);
    const lead = td > 500 ? 0.05 : 0;
    const wantAng = Math.atan2(enemy.y + (enemy.vy || 0) * lead - e.y, enemy.x + (enemy.vx || 0) * lead - e.x);
    const hitAng = td > 0 ? Math.atan2(enemy.rad + 2, td) : 0.5;
    if (Math.abs(angDiff(e.angle, wantAng)) < hitAng * 0.85 && e.recoil < 0.7) {
      const w = weaponDef(e);
      if (w.mag > 0 && ammoFor(e) <= 0) startReload(e, game);
      else e.trigger = true;
    }
  } else {
    // recover/缩回 与 hold/隐蔽：回掩体锚点（recover 快速回缩，hold 慢速贴墙静止）
    e.peekT = 0;
    const dx = pk.anchorX - e.x, dy = pk.anchorY - e.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 6) {
      const nx = dx / dd, ny = dy / dd;
      const speedF = pk.action === 'recover' ? 0.7 : 0.45;
      e.vx = nx * spd * speedF;
      e.vy = ny * spd * speedF;
    } else if (dd > 1) {
      // 贴入掩体：减速滑到锚点本体（锚点是通视死角的隐蔽格），
      // 避免停在与锚点相距数 px 的"看着已回掩体、实际仍露头"的可见点
      const nx = dx / dd, ny = dy / dd;
      e.vx = nx * spd * 0.3;
      e.vy = ny * spd * 0.3;
    } else {
      e.vx = 0; e.vy = 0;
    }
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
  // 静步标记每帧复位：仅当本帧目标执行（obj.sneak）/ 近情报探查显式置 true（sneak 接线）
  e.walking = false;
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
        // 受击反应延迟：空闲 bot（reaction=0）被打后也需转身时间，避免 0 延迟背袭反击
        if (!(e.reaction > 0)) e.reaction = d.react * 0.4;
        else e.reaction = Math.min(e.reaction, d.react * 0.4);
      }
    }
  }
  // 枪声感知：敌人开火 → 带距离/角度/遮挡门控的听觉判定（hearGunshot），命中才队内报告枪声源
  // （原实现无门控：出生点 bot 能精确听到全图枪声；现在按武器半径/墙后 ×0.55/方向误差模型衰减）
  if (!e.lastHearT) e.lastHearT = {};
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    if (o.lastShot > 0 && o.lastShot > (e.lastHearT[o.name] || 0)) {
      // 无论听没听到都记录 lastShot 去重，避免每帧对同一枪声重复射线检测
      e.lastHearT[o.name] = o.lastShot;
      if (hearGunshot(e, o, game, weaponDef(o))) {
        report(game, e, MSG.SHOT, o.x, o.y);
      }
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
  if (e.aimTarget && (e.aimTarget.dead || !hasLineOfSight(game, e, e.aimTarget, viewCap(game) * 1.2))) {
    if (e.aimLostT > 1.4) {
      if (e.aimLastPos) {
        e.lastKnown = { x: e.aimLastPos.x, y: e.aimLastPos.y, conf: 1 };
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
  const canSeeTarget = e.aimTarget && !e.aimTarget.dead && hasLineOfSight(game, e, e.aimTarget, viewCap(game));
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
  // 掩体后对枪（candidate-221）：近掩体交战时不站桩，按 peek 周期 探头→开火→缩回。
  // 交战用 aimTarget（即使缩回掩体期间 LOS 短暂被挡，aimTarget 在 aimLostT<1.4s 内仍保留）。
  // 掩体锚点/探出点在交战期间缓存（e.peekCache），避免每帧从移动位置重算而沿墙漂移；
  // 仅当敌人大幅移动或探出点失视野时才重规划。
  const pkTarget = (!e.aimTarget || e.aimTarget.dead) ? null : e.aimTarget;
  const inPeekWindow = e.peekAt !== undefined && game.time - e.peekAt < 1.6;
  if (pkTarget && (combat || inPeekWindow) && shouldPeekFight(e, game, pkTarget)) {
    const replan = !e.peekCache ||
      Math.hypot(pkTarget.x - e.peekCache.enemyX, pkTarget.y - e.peekCache.enemyY) > 140 ||
      !los(game, e.peekCache.peekX, e.peekCache.peekY, pkTarget.x, pkTarget.y);
    if (replan) {
      // 按身位档（peekSkill/距离）规划探出幅度：低技能小身位更安全，高技能大身位快速拉出
      const pkSt = peekStance(peekSkillOf(e), Math.hypot(pkTarget.x - e.x, pkTarget.y - e.y));
      const cover = peekPlan(e, pkTarget, game.time, getMap(), pkSt.offset);
      e.peekCache = cover ? {
        anchorX: cover.anchorX, anchorY: cover.anchorY,
        peekX: cover.peekX, peekY: cover.peekY,
        dir: cover.dir, at: game.time,
        enemyX: pkTarget.x, enemyY: pkTarget.y
      } : null;
    }
    if (e.peekCache) {
      e.peekAt = game.time;
      const ph = peekPhase(e, game.time);
      runPeek(e, game, dt, pkTarget, {
        action: ph.action, dir: e.peekCache.dir, duration: ph.duration,
        anchorX: e.peekCache.anchorX, anchorY: e.peekCache.anchorY,
        peekX: e.peekCache.peekX, peekY: e.peekCache.peekY
      }, weapon);
      return;
    }
  }
  if (combat) {
    const t = e.aimTarget;
    const td = Math.hypot(t.x - e.x, t.y - e.y);
    const lead = td > 500 ? 0.05 : 0;
    const leadX = t.x + t.vx * lead, leadY = t.y + t.vy * lead;
    const wantAng = Math.atan2(leadY - e.y, leadX - e.x);
    // 瞄准误差 = 基础散布 + 距离衰减 + 目标横向移动预测误差（移动目标更难打，近距离不再必中）
    const tvx = t.vx || 0, tvy = t.vy || 0;
    const latErr = td > 20 ? (Math.abs(tvx * Math.cos(e.angle + Math.PI / 2) + tvy * Math.sin(e.angle + Math.PI / 2)) / (120 + td * 0.35)) : 0;
    const err = (d.spreadMult * (0.5 + td / 900) + weapon.spread * 0.3 + latErr * 0.9) * (Math.PI / 180);
    const diff = angDiff(wantAng, e.angle);
    // 甩枪 + 微调（拟合人类瞄准）：大角度快速转向，小角度精细逼近
    // S3 补枪加速：tradeBoost 期间角速度 ×(1 + tradeBoost*(tradeSpeed-1))
    const tradeMul = e.tradeBoost > 0 && d.tradeSpeed !== undefined ? (1 + e.tradeBoost * (d.tradeSpeed - 1)) : 1;
    const flick = Math.abs(diff) > 0.4 ? 6 : 1;
    // 狙击开镜精细瞄准：开镜后降低甩枪速度与瞄准角速度（拟合人类开镜瞄准，避免瞬瞄秒杀）
    const scopeAim = e.scoped ? 0.7 : 1;
    const flickEff = (weapon && weapon.kind === 'sniper' && e.scoped) ? Math.min(flick, 3) : flick;
    e.angle = angNorm(e.angle + clamp(diff, -d.aimSpeed * flickEff * dt * tradeMul * scopeAim, d.aimSpeed * flickEff * dt * tradeMul * scopeAim));
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
    // 下蹲与假动作（candidate-229）：长距离对枪概率下蹲（crouch 因子降低散布、降低暴露），
    // 近距离立即起身恢复 strafe；下蹲频率用人格调制（谨慎型 riskT 低 → 更爱蹲压）
    const stC = styleOf(e);
    if (td > 420 && rand() < dt * 2.5 * (1.4 - stC.p.riskT * 0.8)) {
      e.crouched = true;
    } else if (td < 240 || (e.crouched && rand() < dt * 1.6)) {
      e.crouched = false;
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
    // 下蹲时大幅减速（贴近蹲压 spray：静止散布最优），换取 crouch 精度因子（ballistic moveFactor）
    if (e.crouched) { e.vx *= 0.25; e.vy *= 0.25; }
    if (rand() < 0.015 * (d.nadeUse || 1) && e.weapons.nades.flash > 0 && td < 700) {
      e.slot = 'nade:flash';
      throwGrenade(e, game);
      e.slot = 'primary';
    }
    return;
  }
  // 离开战斗：起身恢复正常姿态（下蹲只在交战 strafe 段内维持）
  e.crouched = false;
  // 补枪推进接线（shouldTradePush）：队友 2.5s 内阵亡且有击杀点情报时，
  // 激进 bot 优先冲向击杀点补枪（复仇压迫敌方残局）；非激进/持包/拆弹中不触发
  if (!e.aimTarget && (e.tradeBoost || 0) <= 0) {
    const kInfo = query(game, e);
    if (shouldTradePush(e, kInfo)) {
      if (e.path === null || e.tradePushAt === undefined || game.time - e.tradePushAt > 0.9) {
        pathTo(e, kInfo.x, kInfo.y);
        e.tradePushAt = game.time;
      }
      e.angle = angNorm(Math.atan2(kInfo.y - e.y, kInfo.x - e.x));
      followPath(e, dt, weapon.speed * 235 * 1.08);
      return;
    }
  }
  if (e.team === 't' && shouldSaveForEco(e, e.money || 0, (e.weapons && (e.weapons.primary === 'ak' || e.weapons.primary === 'm4' || e.weapons.primary === 'famas' || e.weapons.primary === 'awp')) ? 2 : 0, game.roundTime || 0, game.roundDur || 115)) {
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
    // sneak 静步接线（最高价值修复）：保枪/绕后/静步摸点目标（obj.sneak）→ 0.55 速 + 脚步半径减半；
    // 接近目标（<200）或进入交战（aimTarget）时恢复满速，避免永远满速跑暴露脚步
    e.walking = !!obj.sneak;
    const objD = Math.hypot(obj.x - e.x, obj.y - e.y);
    if (objD < 200 || (e.aimTarget && !e.aimTarget.dead)) e.walking = false;
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
    e.walking = lkd < 400;
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
  if (e.lastKnown) {
    e.lastKnownT += dt;
    if (e.lastKnownT > 4) {
      e.lastKnown = null;
      e.lastKnownT = 99;
    }
  }
  // 记忆遗忘（目击记忆 3s 内有效，置信度衰减）
  if (e.memory && e.memory.length) {
    for (let i = e.memory.length - 1; i >= 0; i--) {
      e.memory[i].conf -= dt * 0.06;
      if (e.memory[i].conf <= 0 || game.time - e.memory[i].t > 3) e.memory.splice(i, 1);
    }
  }
}
