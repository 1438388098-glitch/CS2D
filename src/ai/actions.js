// 动作执行层：IGL 拍板（转点/前压）、装弹/拆弹/道具/开火
import { BOT_AI, DIFF, diffOf } from '../config.js';
import { los, getMap, pathTo, followPath, nearestSite } from '../map.js';
import { weaponDef, ammoFor } from '../entities.js';
import { fireWeapon, startReload, finishReload, pickupWeapon } from '../combat.js';
import { throwGrenade } from '../grenades.js';
import { plantBomb, pickupBomb, defuseBomb } from '../bomb.js';
import { angNorm, rand } from '../utils.js';
import { emit, logAct, styleOf } from './shared.js';

function hearSplash(e, game) {
  const s = game.lastSplash;
  if (!s || s.team === e.team) return;
  if (game.time - s.t > 0.5) return;
  if (Math.hypot(e.x - s.x, e.y - s.y) < 700) {
    e.lastKnown = { x: s.x, y: s.y };
    e.lastKnownT = 0;
  }
}

export function botActions(e, game, dt) {
  if (e.dead) return;
  hearSplash(e, game);
  if (e.highPointT > 0) e.highPointT -= dt;
  if (e.barrelT > 0) e.barrelT -= dt;
  if (e.botThreatT > 0) e.botThreatT -= dt;
  if (!e.weapons.primary) pickupWeapon(e, game);
  if (e.plantRetryT > 0) e.plantRetryT -= dt;
  // CT 队长（IGL）决策：回合中后期 T 方无动静 → 拍板全体前压（每 5s 重评估）
  if (e.igl && e.team === 'ct' && game.state === 'LIVE' && !(game.bomb && game.bomb.planted)) {
    if (game.roundTime > 30 && game.roundTime - (game.ctPushAt || 0) > BOT_AI.IGL_INTERVAL) {
      game.ctPushAt = game.roundTime;
      const tHeard = game.entities.some((o) => o.team === 't' && !o.dead && o.lastShot > game.time * 1000 - 4000);
      game.ctPush = !tHeard && rand() < 0.6 * styleOf(e).p.aggression;
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
        for (const o of game.entities) {
          if (o.bot && o.team === 't') {
            o.role = game.tAttackSite;
            o.objCache = null;
            o.objAt = 0;
            o.guardPoint = null;
          }
        }
        logAct(game, e, 'igl', '转点 ' + game.tAttackSite);
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
      // 进攻道具（拟合人类 CS）：闪光先手 → 烟封架枪 → HE 补伤害；辅助角色更爱用道具
      if (dist < 430 && rand() < 0.85 * styleOf(e).arch.nade) {
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
          if (dd < 700 && dd < sd && los(game, e.x, e.y, o.x, o.y, e.height)) {
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
  if (e.team === 'ct' && !(game.bomb && game.bomb.planted) && getMap().penPoints && getMap().penPoints.length && e.weapons.primary && !e.reloading) {
    e.prefireT -= dt;
    if (e.prefireT <= 0) {
      e.prefireT = 2 + rand() * 2;
      if (rand() < 0.3) {
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
  if (e.prefireCount > 0 && e.aimTarget === null) {
    e.angle = angNorm(Math.atan2(e.prefireY - e.y, e.prefireX - e.x));
    e.shotStreak = 0;
    if (e.fireCd <= 0) {
      e.trigger = true;
      e.prefireCount--;
    }
  }
  if (e.team === 'ct' && game.bomb && game.bomb.planted) {
    if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 55) {
      let enemiesNear = false;
      for (const o of game.entities) {
        if (o.team === 't' && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 420 && los(game, e.x, e.y, o.x, o.y, e.height)) {
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
    const tap = wB && (wB.kind === 'rifle' || wB.kind === 'smg') && (e.shotStreak || 0) >= 1 && distB > 350;
    if (tap) {
      e.fireCd = Math.max(e.fireCd, 0.22);
      e.shotStreak = 0;
    } else {
      fireWeapon(e, game);
    }
  }
}
