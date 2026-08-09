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
