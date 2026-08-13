import { getMap } from '../map.js';

export function shouldRerouteStuck(e, sd, threshold = 8) {
  return sd < threshold && !!e.path && e.pathI < e.path.length;
}

export function shouldPushLatePlant(e, roundTime, roundDur = 115, lateAt = 55) {
  if (!e || !e.hasBomb) return false;
  if (e.bomb && e.bomb.planted) return false;
  return roundTime > lateAt && roundTime < roundDur;
}

export function shouldRushPlant(e, dist, roundTime, roundDur = 115, endWindow = 12, farDist = 650, speed = 235) {
  if (!e || !e.hasBomb) return false;
  if (e.bomb && e.bomb.planted) return false;
  if (roundTime <= roundDur - endWindow || dist <= farDist) return false;
  const timeLeft = Math.max(0, roundDur - roundTime);
  const eta = dist / Math.max(1, speed);
  // ETA 校验（残局持包时间管理）：dist/移动速度 < 剩余时间 才冲点，否则 12s 走 650px 白送。
  // 留 1.5s 机动/安弹前置余量；时间不够时由调用方改选最近安弹点（clutchPlantSite）或保枪。
  return eta < timeLeft - 1.5;
}

// 保枪判定（残局无包）：安弹后 vs 掉落炸弹分两种口径
// - planted：回合仍在进行，不保枪
// - dropped：可回收（bombDist<=recoverDist）→ 不弃包保枪，回去捡；已丢远（>recoverDist）→ 视为失去安弹机会，允许保枪
export function shouldRetreatWithoutBomb(e, roundTime, enAlive, myAlive, roundDur = 115, lateAt = 18, recoverDist = 420, bombDist = null) {
  if (!e || e.hasBomb) return false;
  if (e.bomb && e.bomb.planted) return false;
  if (e.bomb && e.bomb.dropped) {
    if (bombDist === null && Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.bomb.x) && Number.isFinite(e.bomb.y)) {
      bombDist = Math.hypot(e.x - e.bomb.x, e.y - e.bomb.y);
    }
    // 无位置信息（默认视为可回收）或仍在可回收范围内 → 不保枪，去捡包
    if (bombDist === null || bombDist <= recoverDist) return false;
  }
  return roundTime > roundDur - lateAt && enAlive >= myAlive;
}

// 回防/拆弹判定：timeLeft 必须为「炸弹剩余秒数」（game.bomb.timer，BOMB_FUSE=40），
// 而不是冻结的回合时钟（roundDur-roundTime）—— 安弹后真正倒计时是 bomb.timer。
// 口径与 shouldAttemptDefuse（同样吃 bomb.timer）一致。
export function shouldRetakeBomb(e, planted, dist, timeLeft, myAlive = 1, enAlive = 1, minTime = 8, nearDist = 420) {
  if (!e || e.team !== 'ct' || !planted) return false;
  if (e.dead || e.defusing) return false;
  if (timeLeft < minTime && dist > nearDist && enAlive > myAlive + 1) return false;
  return true;
}

// T 冲拆弹手：timeLeft 为炸弹剩余秒数（bomb.timer）。
// 冲刺条件 = bomb.timer - 抵达ETA <= defuseTime + 2（ETA = dist/移动速度）：
// 若 T 抵达时炸弹剩余已接近 CT 完成拆弹所需时间，则必须立即冲刺打断，否则保枪/架枪。
// defuseTime 默认取 2.5（kit 拆弹时长，最保守触发）；调用方可按预估 CT 拆弹时长覆盖。
export function shouldRushDefuser(e, defusing, dist, timeLeft, defuseTime = 2.5, stopDist = 700, speed = 235) {
  if (!e || e.team !== 't' || !defusing) return false;
  if (e.dead) return false;
  if (dist <= stopDist) return true;
  const eta = dist / Math.max(1, speed);
  return timeLeft - eta <= defuseTime + 2;
}

export function shouldRotateToHot(e, hotSite, dist, timeLeft, planted = false, minTime = 12, far = 500) {
  if (!e || e.team !== 'ct' || !hotSite || planted) return false;
  if (e.dead || e.defusing) return false;
  return timeLeft > minTime && dist > far;
}

export function shouldKeepPath(e, startX, startY, x, y, minProgress = 30, loopWindow = 4, minShrink = 0.25) {
  if (!e || !e.path || e.pathI >= e.path.length) return false;
  const moved = Math.hypot(x - startX, y - startY);
  if (moved < minProgress) return false;
  // 长窗净进展看门狗（防绕圈路径）：3-5s 窗口内到目标点的净缩小于 25% → 判卡死。
  // 只读判断 + 清空 e.path 触发既有重寻路流程（core.js 见 path 为 null 会重新 pathTo），
  // 与 game.js/map.js 的解卡逻辑不冲突（只改路径状态，不改 game.js）。
  const navNow = e.navTime;
  if (Number.isFinite(navNow)) {
    const m = getMap();
    const T = (m && m.tile) || 16;
    const last = e.path[e.path.length - 1];
    const gx = last.x * T + T / 2, gy = last.y * T + T / 2;
    const goalDist = Math.hypot(gx - x, gy - y);
    const w = e._loopWatch;
    if (!w || navNow - w.t >= loopWindow) {
      e._loopWatch = { t: navNow, goal: Math.max(goalDist, 1) };
      return true;
    }
    if (goalDist > 40) {
      const shrink = (w.goal - goalDist) / w.goal;
      if (shrink < minShrink) {
        e._loopWatch = null;
        e.path = null;
        e.pathI = 0;
        e.repathT = 0;
        return false;
      }
    }
  }
  return true;
}

export function canRerouteAgain(e, lastRerouteAt, now, cooldown = 0.8) {
  if (!e) return false;
  return !lastRerouteAt || now - lastRerouteAt >= cooldown;
}

export function shouldUnstuck(e, stuckTime, movedDist, minTime = 1.5, minDist = 24) {
  if (!e || !e.path || e.pathI >= e.path.length) return false;
  if (e.dead) return false;
  return stuckTime >= minTime && movedDist < minDist;
}

export function pickPlantSite(e, siteA, siteB, timeLeft, lateAt = 30, minAdvantage = 0.2) {
  if (!e || !e.hasBomb) return null;
  if (e.dead || (e.bomb && e.bomb.planted)) return null;
  if (!siteA || !siteB) return null;
  const distMult = timeLeft <= lateAt ? 2 : 1;
  const maxDist = Math.max(siteA.dist, siteB.dist, 1);
  const score = (site) => {
    const distScore = (maxDist - site.dist) / maxDist * distMult;
    const coverScore = (site.cover || 0) * 0.25;
    const enemyScore = (site.enemyNear || 0) * -0.35;
    return distScore + coverScore + enemyScore;
  };
  const a = score(siteA), b = score(siteB);
  if (Math.abs(a - b) < minAdvantage) return null;
  return a > b ? 'A' : 'B';
}

export function shouldEscortCarrier(e, distToCarrier, carrierToSite, roundTime, earlyUntil = 20, closeSite = 300, closeCarrier = 420) {
  if (!e || e.hasBomb || e.dead) return false;
  if (e.team !== 't' || distToCarrier <= 0 || !Number.isFinite(carrierToSite)) return false;
  if (e.bomb && e.bomb.planted) return false;
  return roundTime < earlyUntil && carrierToSite <= closeSite && distToCarrier > 120 && distToCarrier < closeCarrier;
}

export function shouldThrowUtility(e, kind, count, distToSite, roundTime, enAlive = 0, roundDur = 115) {
  if (!e || e.dead || count <= 0) return false;
  if (!['smoke', 'flash', 'he'].includes(kind)) return false;
  if (roundTime <= 0 || roundTime >= roundDur) return false;
  if (e.bomb && e.bomb.planted) return false;
  if (kind === 'smoke') return roundTime > 8 && distToSite >= 220 && distToSite <= 850;
  if (kind === 'flash') return enAlive > 0 && distToSite >= 80 && distToSite <= 650;
  return enAlive > 0 && distToSite >= 60 && distToSite <= 520;
}

export function shouldAttemptDefuse(e, planted, dist, timeLeft, kit, enAlive = 1, safeRadius = 420, kitTime = 5, normalTime = 10) {
  if (!e || e.team !== 'ct' || !planted) return false;
  if (e.dead || e.defusing) return false;
  const need = kit ? kitTime : normalTime;
  if (timeLeft < need + 1) return false;
  if (dist <= safeRadius) return true;
  return enAlive <= 2 && timeLeft >= need + 8;
}

export function shouldSaveForEco(e, money, weaponTier, roundTime, roundDur = 115, lateAt = 20, minMoney = 3200) {
  if (!e || e.dead) return false;
  if (e.hasBomb || (e.bomb && (e.bomb.planted || e.bomb.dropped))) return false;
  if (e.defusing) return false;
  if (roundTime < roundDur - lateAt) return false;
  return weaponTier >= 2 && money < minMoney;
}

export function shouldRepositionOnIntel(e, intelAge, distToHome, planted = false, maxAge = 6, farHome = 700) {
  if (!e || e.team !== 'ct' || e.dead) return false;
  if (planted) return false;
  if (distToHome < farHome) return false;
  return intelAge > maxAge;
}
