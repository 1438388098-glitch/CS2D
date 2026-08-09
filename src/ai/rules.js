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
