export function shouldRerouteStuck(e, sd, threshold = 8) {
  return sd < threshold && !!e.path && e.pathI < e.path.length;
}

export function shouldPushLatePlant(e, roundTime, roundDur = 115, lateAt = 55) {
  if (!e || !e.hasBomb) return false;
  if (e.bomb && e.bomb.planted) return false;
  return roundTime > lateAt && roundTime < roundDur;
}

export function shouldRushPlant(e, dist, roundTime, roundDur = 115, endWindow = 12, farDist = 650) {
  if (!e || !e.hasBomb) return false;
  if (e.bomb && e.bomb.planted) return false;
  return roundTime > roundDur - endWindow && dist > farDist;
}

export function shouldRetreatWithoutBomb(e, roundTime, enAlive, myAlive, roundDur = 115, lateAt = 18) {
  if (!e || e.hasBomb) return false;
  if (e.bomb && (e.bomb.planted || e.bomb.dropped)) return false;
  return roundTime > roundDur - lateAt && enAlive >= myAlive;
}

export function shouldRetakeBomb(e, planted, dist, timeLeft, myAlive = 1, enAlive = 1, minTime = 8, nearDist = 420) {
  if (!e || e.team !== 'ct' || !planted) return false;
  if (e.dead || e.defusing) return false;
  if (timeLeft < minTime && dist > nearDist && enAlive > myAlive + 1) return false;
  return true;
}

export function shouldRushDefuser(e, defusing, dist, timeLeft, minTime = 4, stopDist = 700) {
  if (!e || e.team !== 't' || !defusing) return false;
  if (e.dead) return false;
  if (dist <= stopDist) return true;
  return timeLeft <= minTime;
}

export function shouldRotateToHot(e, hotSite, dist, timeLeft, planted = false, minTime = 12, far = 500) {
  if (!e || e.team !== 'ct' || !hotSite || planted) return false;
  if (e.dead || e.defusing) return false;
  return timeLeft > minTime && dist > far;
}

export function shouldKeepPath(e, startX, startY, x, y, minProgress = 30) {
  if (!e || !e.path || e.pathI >= e.path.length) return false;
  return Math.hypot(x - startX, y - startY) >= minProgress;
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

export function shouldThrowUtility(e, kind, count, distToSite, roundTime, enAlive = 0) {
  if (!e || e.dead || count <= 0) return false;
  if (!['smoke', 'flash', 'he'].includes(kind)) return false;
  if (roundTime <= 0 || roundTime >= 115) return false;
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
