export function shouldRerouteStuck(e, sd, threshold = 8) {
  return sd < threshold && !!e.path && e.pathI < e.path.length;
}

export function shouldPushLatePlant(e, roundTime, roundDur = 115, lateAt = 55) {
  if (!e || !e.hasBomb) return false;
  if (e.bomb && e.bomb.planted) return false;
  return roundTime > lateAt && roundTime < roundDur;
}
