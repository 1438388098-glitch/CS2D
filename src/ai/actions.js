// 动作执行层：IGL 拍板（转点/前压）、装弹/拆弹/道具/开火
import {BOT_AI, diffOf} from '../config.js';
import {getMap, pathTo, followPath, nearestSite, inSite} from '../map.js';
import {weaponDef} from '../entities.js';
import {fireWeapon, finishReload, pickupWeapon} from '../combat.js';
import {throwGrenade} from '../grenades.js';
import {plantBomb, pickupBomb, defuseBomb} from '../bomb.js';
import {angNorm, rand} from '../utils.js';
import {hearStep, hearWorldSound} from './senses.js';
import {report, MSG} from '../info.js';
import {emit, logAct, styleOf, hasPrefireIntel, canFinishDefuse, aliveCount, redistributeTLanes} from './shared.js';
import {shouldAttemptDefuse} from './rules.js';
import {chooseDefuser} from './decisions.js';
import {hasLineOfSight} from '../fog.js';

// 假拆弹决策（纯函数，可测试）：拆弹手在炸弹旁、拆弹时间尚足、存在 T 威胁且
// 队友能架枪配合时，佯装拆弹诱导 T 探身。拆弹时间不足或敌人已贴脸时不做。
export function shouldFakeDefuse(opts) {
  const {
    defuseT = 0, aimTarget = null, bombT = 0, defuseSpeed = 5,
    hasAliveT = false, allyCover = 0, riskT = 0.65, teamwork = 0.65
  } = opts;
  if (defuseT !== 0 || aimTarget || bombT <= defuseSpeed + 2.5 || !hasAliveT) return false;
  const fakeChance = 0.4 * (0.6 + riskT) * (allyCover > 0 ? 1.6 : 0.8);
  return fakeChance > 0.3;
}

function throwAt(e, game, kind, x, y) {
  if (!e.weapons.nades[kind]) return false;
  e.angle = angNorm(Math.atan2(y - e.y, x - e.x));
  e.slot = 'nade:' + kind;
  throwGrenade(e, game);
  e.slot = e.lastSlot || 'primary';
  e.lastNadeT = game.roundTime;
  return true;
}

function hearSplash(e, game) {
  const s = game.lastSplash;
  if (!s || s.team === e.team) return;
  if (game.time - s.t > 0.5) return;
  if (Math.hypot(e.x - s.x, e.y - s.y) < 700) {
    // 溅水声穿墙可听（声学真实），但位置必须模糊化（防"穿墙精确定位"信息作弊）
    const ang = Math.atan2(s.y - e.y, s.x - e.x);
    const err = Math.max(50, Math.hypot(s.x - e.x, s.y - e.y) * 0.15);
    e.lastKnown = {
      x: s.x + Math.cos(ang + Math.PI / 2) * rand(-1, 1) * err,
      y: s.y + Math.sin(ang + Math.PI / 2) * rand(-1, 1) * err
    };
    e.lastKnownT = 0;
  }
}

export function nadeTarget(e, game, kind, siteLabel) {
  if (kind === 'he') {
    const last = e.lastKnown && e.lastKnownT !== undefined && e.lastKnownT < 1.2 ? e.lastKnown : null;
    const cands = [];
    if (last) cands.push(last);
    if (e.aimTarget && !e.aimTarget.dead) cands.push(e.aimTarget);
    for (const c of cands) {
      const d = Math.hypot(c.x - e.x, c.y - e.y);
      if (d > 160 && d < 560) return { x: c.x, y: c.y };
    }
    return null;
  }
  return laneNadePoint(e, game, kind, siteLabel);
}

function laneNadePoint(e, game, kind, siteLabel) {
  const m = getMap();
  const key = siteLabel === 'A' || siteLabel === 'B' ? siteLabel : (game.tAttackSite || 'A');
  const cs = m.sites && m.sites[key];
  if (!cs) return null;
  const lanes = (m.lanes && m.lanes[key]) || [];
  const mainEntry = m.entries && m.entries[key];
  const cands = lanes.length ? lanes : (mainEntry ? [mainEntry] : []);
  if (!cands.length) return null;
  let idx = e && e.laneIdx !== undefined ? e.laneIdx % cands.length : 0;
  if (cands.length > 1) {
    const occ = cands.map((p) => game.entities.filter((o) => o.bot && o.team === e.team && o !== e && Math.hypot(o.x - p.x, o.y - p.y) < 130).length);
    if (occ[idx] > 0) idx = (idx + 1) % cands.length;
  }
  const pt = cands[idx];
  if (kind === 'smoke' && (game.smokes || []).some((s) => Math.hypot(s.x - pt.x, s.y - pt.y) < 190)) return null;
  const jitter = kind === 'smoke' ? 26 : 18;
  return { x: pt.x + rand(-jitter, jitter), y: pt.y + rand(-jitter, jitter) };
}

export function postPlantSmokePoint(game) {
  const ctSpawn = getMap().spawns && getMap().spawns.ct[0];
  if (!ctSpawn || !game.bomb || !game.bomb.planted) return null;
  const x = game.bomb.x + (ctSpawn.x - game.bomb.x) * 0.42;
  const y = game.bomb.y + (ctSpawn.y - game.bomb.y) * 0.42;
  if ((game.smokes || []).some((s) => Math.hypot(s.x - x, s.y - y) < 190)) return null;
  return { x, y };
}

function weaponScore(wid) {
  if (wid === 'ak' || wid === 'm4' || wid === 'famas' || wid === 'awp') return 3;
  if (wid === 'mac10' || wid === 'mp9' || wid === 'p90' || wid === 'xm') return 2;
  if (wid === 'deagle') return 1.6;
  if (wid === 'p250') return 1;
  return 0;
}

export function maybePickupWeapon(e, game) {
  if (!e.weapons.primary) {
    pickupWeapon(e, game);
    return;
  }
  const cur = weaponScore(e.weapons.primary);
  const drop = game.drops.find((d) =>
    d.noPickT <= 0 &&
    Math.hypot(e.x - d.x, e.y - d.y) <= 46 &&
    weaponScore(d.wid) > cur + 0.3);
  if (drop) pickupWeapon(e, game);
}

export function midSmokePoint(game) {
  const m = getMap();
  const ctSpawn = m.spawns && m.spawns.ct[0];
  const tSpawn = m.spawns && m.spawns.t[0];
  if (!ctSpawn || !tSpawn || !m.mid) return null;
  const x = m.mid.x + (tSpawn.x - m.mid.x) * 0.4;
  const y = m.mid.y + (tSpawn.y - m.mid.y) * 0.4;
  if ((game.smokes || []).some((s) => Math.hypot(s.x - x, s.y - y) < 190)) return null;
  return { x, y };
}

export function botActions(e, game, dt) {
  if (e.dead) return;
  hearSplash(e, game);
  if (hearStep(e, game) && e.lastKnown) report(game, e, MSG.SHOT, e.lastKnown.x, e.lastKnown.y);
  if (hearWorldSound(e, game) && e.lastKnown) report(game, e, MSG.SHOT, e.lastKnown.x, e.lastKnown.y);
  if (e.team === 'ct' && !(game.bomb && game.bomb.planted) && e.weapons.nades.smoke > 0 &&
      game.roundTime > 6 && game.roundTime < 18 && (e.ctRoamer || e.role === 'mid') &&
      game.ctEntrySmokeRound !== game.round && rand() < dt * 0.3) {
    const midPt = midSmokePoint(game);
    if (midPt) {
      throwAt(e, game, 'smoke', midPt.x, midPt.y);
      game.ctEntrySmokeRound = game.round;
    }
  }
  if (e.team === 't' && !(game.bomb && game.bomb.planted) && !e.aimTarget && game.roundTime > 8 && game.roundTime < (game.roundDur || 115) - 10 && game.roundTime - (e.lastNadeT || 0) > 10) {
    const cs = getMap().sites && getMap().sites[game.tAttackSite];
    if (cs) {
      const d = Math.hypot(e.x - cs.cx, e.y - cs.cy);
      if (d < 520 && d > 180) {
        const smokePt = nadeTarget(e, game, 'smoke', game.tAttackSite);
        const flashPt = nadeTarget(e, game, 'flash', game.tAttackSite);
        const smokeW = e.utilityRole ? dt * 0.85 : dt * 0.5;
        const flashW = e.vanguard ? dt * 1.1 : dt * 0.8;
        if (smokePt && e.weapons.nades.smoke > 0 && e.entrySmokeRound !== game.round && game.roundTime - (game.entrySmokeAt || 0) > 6 && rand() < smokeW) {
          throwAt(e, game, 'smoke', smokePt.x, smokePt.y);
          e.entrySmokeRound = game.round;
          game.entrySmokeAt = game.roundTime;
        } else if (flashPt && e.weapons.nades.flash > 0 && game.roundTime - (game.entryFlashAt || 0) > 1.5 && rand() < flashW) {
          throwAt(e, game, 'flash', flashPt.x, flashPt.y);
          game.entryFlashAt = game.roundTime;
        }
      }
    }
  }
  const myAliveNade = aliveCount(game, e.team);
  const enAliveNade = aliveCount(game, e.team === 't' ? 'ct' : 't');
  if (e.lastKnown && !e.aimTarget && e.lastKnownT < 1.2 && e.weapons.nades.he > 0 && !(myAliveNade <= 1 && enAliveNade <= 1) && game.roundTime - (e.lastNadeT || 0) > 10) {
    const hePt = nadeTarget(e, game, 'he');
    if (hePt && rand() < dt * 0.7) throwAt(e, game, 'he', hePt.x, hePt.y);
  }
  if (e.highPointT > 0) e.highPointT -= dt;
  if (e.barrelT > 0) e.barrelT -= dt;
  if (e.botThreatT > 0) e.botThreatT -= dt;
  if (e.crateT > 0) e.crateT -= dt;
  maybePickupWeapon(e, game);
  if (e.plantRetryT > 0) e.plantRetryT -= dt;
  // CT 队长（IGL）决策：回合中后期 T 方无动静 → 拍板全体前压（每 5s 重评估）
  if (e.igl && e.team === 'ct' && game.state === 'LIVE' && !(game.bomb && game.bomb.planted)) {
    if (game.ctPlan && game.ctPlan.antiEco && game.roundTime > 12 && game.roundTime - (game.ctPushAt || 0) > 6) {
      game.ctPushAt = game.roundTime;
      game.ctPush = true;
      game.ctPushRound = true;
      logAct(game, e, 'igl', '\u53cdECO \u524d\u538b\u60e9\u7f5a');
    } else if (game.roundTime > 24 && game.roundTime - (game.ctPushAt || 0) > BOT_AI.IGL_INTERVAL) {
      game.ctPushAt = game.roundTime;
      const tHeard = game.entities.some((o) => o.team === 't' && !o.dead && o.lastShot > game.time * 1000 - 4000);
      const aggro = game.ctPlan ? 0.7 * game.ctPlan.aggression : (game.roundPlan ? 0.55 * game.roundPlan.ctAggro : 0.6 * styleOf(e).p.aggression);
      game.ctPush = !tHeard && rand() < aggro;
      game.ctPushRound = game.ctPush;
      if (game.ctPush) logAct(game, e, 'igl', '全体前压侦察');
    }
  }
  if (e.team === 't') {
    // 转点：只有队长（IGL）拍板，久攻不下（LIVE 20s 后未安弹且点附近无优势）切换攻击点
    if (e.igl && !(game.bomb && game.bomb.planted) && game.state === 'LIVE' && game.roundTime > 20 && game.roundTime - game.tSwitchedAt > 8) {
      const d0 = e.aiParams || diffOf(game);
      const csNow = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
      const nearSite = Math.hypot(e.x - csNow.cx, e.y - csNow.cy) < 400;
      const tAliveNow = game.entities.filter((o) => o.team === 't' && !o.dead).length;
      if (tAliveNow >= 2 && !nearSite && rand() < (d0.rotateChance !== undefined ? d0.rotateChance : 0.4)) {
        game.tAttackSite = game.tAttackSite === 'A' ? 'B' : 'A';
        game.tSwitchedAt = game.roundTime;
        redistributeTLanes(game);
        logAct(game, e, 'igl', '转点 ' + game.tAttackSite);
        emit('sysfeed', { text: 'T 方转点进攻 ' + (game.tAttackSite === 'A' ? 'A' : 'B') + ' 点' });
      }
    }
    // 安弹后封烟：朝 CT 回防路线丢烟封锁
  if (e.team === 't' && e.decoy && !e.aimTarget && !(game.bomb && game.bomb.planted) && game.roundTime < 16 && e.fireCd <= 0 && rand() < dt * 0.9) {
    const fakeSite = game.tAttackSite === 'A' ? getMap().sites.B : getMap().sites.A;
    if (fakeSite) e.angle = angNorm(Math.atan2(fakeSite.cy - e.y, fakeSite.cx - e.x));
    e.trigger = true;
  }

    if (game.bomb && game.bomb.planted && e.weapons.nades.smoke > 0 && e.plantedSmokeRound !== game.round) {
      if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 300) {
        const smokePt = postPlantSmokePoint(game);
        if (smokePt) {
          throwAt(e, game, 'smoke', smokePt.x, smokePt.y);
          e.plantedSmokeRound = game.round;
        }
      }
    }
    if (e.usedNadeRound !== game.round) {
      const site = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
      const dist = Math.hypot(e.x - site.cx, e.y - site.cy);
      // 进攻道具（拟合人类 CS）：闪光先手 → 烟封架枪 → HE 补伤害；辅助角色更爱用道具
      if (dist < 430 && rand() < 0.85 * styleOf(e).arch.nade) {
        const flashPt = e.aimTarget && !e.aimTarget.dead ? { x: e.aimTarget.x, y: e.aimTarget.y } : null;
        const smokePt = nadeTarget(e, game, 'smoke', game.tAttackSite);
        const hePt = !e.aimTarget ? nadeTarget(e, game, 'he') : null;
        if (flashPt && e.weapons.nades.flash > 0 && Math.hypot(flashPt.x - e.x, flashPt.y - e.y) > 90) {
          throwAt(e, game, 'flash', flashPt.x, flashPt.y);
          e.usedNadeRound = game.round;
        } else if (smokePt && e.weapons.nades.smoke > 0) {
          throwAt(e, game, 'smoke', smokePt.x, smokePt.y);
          e.usedNadeRound = game.round;
        } else if (hePt && e.weapons.nades.he > 0) {
          throwAt(e, game, 'he', hePt.x, hePt.y);
          e.usedNadeRound = game.round;
        }
      }
    }
    if (e.plantT > 0) {
      let src = null, sd = 1e9;
      for (const o of game.entities) {
        if (o.team === 'ct' && !o.dead && o.blind <= 0) {
          const dd = Math.hypot(o.x - e.x, o.y - e.y);
          if (dd < 700 && dd < sd && hasLineOfSight(game, e, o, 700)) {
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
      if (site && (inSite(e.x, e.y, site) || Math.hypot(e.x - site.cx, e.y - site.cy) < 150)) plantBomb(e, game);
    }
  }
  if (e.team === 'ct' && !(game.bomb && game.bomb.planted) && getMap().penPoints && getMap().penPoints.length && e.weapons.primary && !e.reloading) {
    e.prefireT -= dt;
    if (e.prefireT <= 0) {
      e.prefireT = 2 + rand() * 2;
      if (hasPrefireIntel(e, game) && rand() < 0.35) {
        const cands = getMap().penPoints.filter((pp) => Math.hypot(pp.x - e.x, pp.y - e.y) < 900);
        if (cands.length) {
          const pp = cands[Math.floor(rand() * cands.length)];
          e.prefireX = pp.x + (rand() - 0.5) * 60;
          e.prefireY = pp.y + (rand() - 0.5) * 60;
          e.prefireCount = 3;
        }
      }
    }
  }
  if (e.prefireCount > 0 && e.aimTarget === null && hasPrefireIntel(e, game)) {
    e.angle = angNorm(Math.atan2(e.prefireY - e.y, e.prefireX - e.x));
    e.shotStreak = 0;
    if (e.fireCd <= 0) {
      e.trigger = true;
      e.prefireCount--;
    }
  } else if (e.prefireCount > 0) {
    e.prefireCount = 0;
  }
  if (e.team === 't' && game.bomb && game.bomb.planted && game.bomb.defusing && e.weapons.nades && (e.weapons.nades.flash > 0 || e.weapons.nades.he > 0) && Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) > 200 && game.roundTime - (game.stopDefuseNadeAt || 0) > 4 && rand() < dt * 1.2) {
    const kind = e.weapons.nades.flash > 0 ? 'flash' : 'he';
    throwAt(e, game, kind, game.bomb.x, game.bomb.y);
    game.stopDefuseNadeAt = game.roundTime;
  }
  if (e.team === 'ct' && game.bomb && game.bomb.planted && e.defuseT > 0 && e.weapons.nades.smoke > 0 && e.defuseSmokeRound !== game.round && game.roundTime - (game.defuseSmokeAt || 0) > 6 && rand() < dt * 0.6) {
    throwAt(e, game, 'smoke', game.bomb.x, game.bomb.y);
    e.defuseSmokeRound = game.round;
    game.defuseSmokeAt = game.roundTime;
  }
  if (e.team === 'ct' && game.bomb && game.bomb.planted) {
    const ctAlive = game.entities.filter((o) => o.bot && o.team === 'ct' && !o.dead);
    const defuser = game.entities.find((o) => o.bot && o.team === 'ct' && o.defuseT > 0) || chooseDefuser(ctAlive, game);
    if (defuser === e && !canFinishDefuse(game, e) && e.defuseT > 0) {
      e.defuseT = 0;
      if (game.bomb) game.bomb.defusing = false;
    }
    if (defuser && defuser !== e) {
      if (e.defuseT > 0) {
        e.defuseT = 0;
        if (game.bomb) game.bomb.defusing = false;
      }
      // 非拆弹手：继续执行通用帧更新（reload/fireCd/recoil/开火），不得提前 return
    } else if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 55) {
      const defuseSpeedNow = e.weapons.kit ? 2.5 : 5;
      const bombT = game.bomb.timer || 0;
      // 假拆弹骗枪（fake defuse）：拆弹时间尚足 + 存在 T 威胁时，佯装拆弹诱导 T 探身/干拉，
      // 短暂后取消并转为架枪预瞄。拆弹时间不足或敌人已贴脸时不做，避免弄巧成拙。
      if (e.defuseT === 0 && !e.aimTarget && bombT > defuseSpeedNow + 2.5 && e.fakeDefuseT === undefined) {
        const tAlive = game.entities.filter((o) => o.team === 't' && !o.dead);
        // 诱导价值：有 T 存活且在可疑接近方向（或队友能架枪接敌）
        const anyThreat = tAlive.some((o) => Math.hypot(o.x - e.x, o.y - e.y) < 900);
        const allyCover = game.entities.filter((o) => o.bot && o.team === 'ct' && !o.dead && o !== e &&
          Math.hypot(o.x - e.x, o.y - e.y) < 700 && hasLineOfSight(game, o, e, 700)).length;
        // 人格乘子：谨慎型 bot 少假拆；团队型 bot 在有队友架枪时更愿意假拆
        const st = styleOf(e);
        const fakeChance = 0.4 * (0.6 + st.p.riskT) * (allyCover > 0 ? 1.6 : 0.8);
        if (anyThreat && rand() < fakeChance * dt * 1.5) {
          e.fakeDefuseT = 0;
          e.defuseT = Math.max(0.2, defuseSpeedNow - 0.8); // 制造"快拆完"的假象
          if (game.bomb) game.bomb.defusing = true;
          e.fakeDefuseAim = null;
          logAct(game, e, 'fakedefuse', '佯装拆弹骗枪');
        }
      }
      // 假拆进行中：维持 defusing 假象 + 拆弹声（听觉欺骗，诱导 T 听到拆弹声接近），
      // 短窗口后取消并预瞄最近 T 方向
      if (e.fakeDefuseT !== undefined) {
        e.fakeDefuseT += dt;
        // 每 0.5s 播一次拆弹进度声（与真实 defuseBomb 一致），让 T 无法区分真假
        if (game.bomb && e.fakeDefuseT - (e.fakeDefuseSoundAt || 0) > 0.5) {
          e.fakeDefuseSoundAt = e.fakeDefuseT;
          game.lastSound = { x: game.bomb.x, y: game.bomb.y, t: game.time, radius: 600, conf: 0.5 };
          emit('sfx', { name: 'plantTic', vol: 0.55, x: game.bomb.x, y: game.bomb.y, game });
        }
        if (e.fakeDefuseT > 0.55 + rand() * 0.4) {
          e.defuseT = 0;
          e.fakeDefuseT = undefined;
          e.fakeDefuseSoundAt = 0;
          if (game.bomb) game.bomb.defusing = false;
          const tClose = game.entities.filter((o) => o.team === 't' && !o.dead)
            .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
          if (tClose) e.angle = angNorm(Math.atan2(tClose.y - e.y, tClose.x - e.x));
          logAct(game, e, 'fakedefuse', '取消假拆，架枪');
        }
        return; // 假拆期间不执行真实拆弹/其他动作
      }
      if (e.defuseT > defuseSpeedNow - 0.35) {
        defuseBomb(e, game);
        return;
      }
      let enemiesNear = false;
      for (const o of game.entities) {
        if (o.team === 't' && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 300 && hasLineOfSight(game, e, o, 300)) {
          enemiesNear = true;
          break;
        }
      }
      if (!enemiesNear && e.aimTarget === null && canFinishDefuse(game, e) && shouldAttemptDefuse(
        e,
        true,
        Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y),
        bombT,
        !!(e.weapons && e.weapons.kit),
        game.entities.filter((o) => o.team === 't' && !o.dead).length
      )) {
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
  if (e.recoil > 0) e.recoil -= dt * 1.2 * (e.recoil > 1.1 ? 1.8 : 0.55);
  if (e.muzzleT > 0) e.muzzleT -= dt;
  if (e.switchT > 0) e.switchT -= dt;
  if (e.aimTarget && e.barrelT <= 0 && rand() < 0.4 && (e.weapons.primary || e.weapons.secondary)) {
    const near = game.barrels.find((bl) =>
      Math.hypot(bl.x - e.aimTarget.x, bl.y - e.aimTarget.y) < 180 &&
      !game.entities.some((o) => o.bot && !o.dead && o.team === e.team && Math.hypot(o.x - bl.x, o.y - bl.y) < 200));
    if (near) {
      e.barrelT = 1.5;
      const dx = near.x - e.x, dy = near.y - e.y;
      e.angle = angNorm(Math.atan2(dy, dx));
      e.shotStreak = 0;
      e.aimTarget = null;
      e.trigger = true;
    }
  }
  if (e.aimTarget && e.crateT <= 0 && rand() < 0.1 && (e.weapons.primary || e.weapons.secondary)) {
    const nearCrate = game.crates.find((cr) =>
      Math.hypot(cr.x - e.aimTarget.x, cr.y - e.aimTarget.y) < 220 &&
      hasLineOfSight(game, e, cr, 700) &&
      !game.entities.some((o) => o.bot && !o.dead && o.team === e.team && Math.hypot(o.x - cr.x, o.y - cr.y) < 200));
    if (nearCrate) {
      e.crateT = 1.8;
      const dx = nearCrate.x - e.x, dy = nearCrate.y - e.y;
      e.angle = angNorm(Math.atan2(dy, dx));
      e.shotStreak = 0;
      e.aimTarget = null;
      e.trigger = true;
    }
  }
  if (e.botThreatT <= 0) {
    const threat = game.barrels.find((bl) => bl.hp <= 1 && Math.hypot(bl.x - e.x, bl.y - e.y) < 200);
    if (threat) {
      e.botThreatT = 3;
      e.path = null;
      pathTo(e, e.x + (e.x - threat.x) * 2.5, e.y + (e.y - threat.y) * 2.5);
    }
  }
  if (e.trigger && e.fireCd <= 0) {
    e.trigger = false;
    const wB = weaponDef(e);
    const distB = e.aimTarget ? Math.hypot(e.aimTarget.x - e.x, e.aimTarget.y - e.y) : 999;
    // 智能射击模式（拟合人类 CS）：
    // - 中远距（>350px）单发 tap：连发散布 28px(600px处) 远超命中半径 15px，只有首发命中，故每发都重置散布
    // - 近距（<=350px）连发：命中角度大（>2.5°），连发散布可接受
    // S3 微观增强：连发散布控制（spreadCtrl<1 时更早进入单发 tap，H11 专用）
    const sc = e.aiParams && e.aiParams.spreadCtrl !== undefined ? e.aiParams.spreadCtrl : 1;
    const tap = wB && (wB.kind === 'rifle' || wB.kind === 'smg') && (e.shotStreak || 0) >= 1 && distB > 350 * sc;
    if (tap) {
      e.fireCd = Math.max(e.fireCd, 0.22);
      e.shotStreak = 0;
    } else {
      fireWeapon(e, game);
    }
  }
}
