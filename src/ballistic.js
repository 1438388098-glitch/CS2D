const DEFAULTS = {
  first: 0.5,
  perShot: 0.18,
  max: 3.0,
  recover: 1.8,
  move: { stand: 1.0, walk: 0.55, run: 2.2, crouch: 0.75 }
};

export function ballisticOf(w) {
  return w.ballistic || DEFAULTS;
}

export function moveFactor(w, ent) {
  const b = ballisticOf(w);
  const spd = Math.hypot(ent.vx, ent.vy);
  let key = 'stand';
  if (ent.crouched) {
    key = 'crouch';
  } else if (spd > 60) {
    key = ent.walking ? 'walk' : 'run';
  } else if (spd > 10) {
    key = 'walk';
  }
  const v = b.move[key];
  return v !== undefined ? v : DEFAULTS.move[key];
}

export function effectiveSpread(w, ent) {
  const b = ballisticOf(w);
  let mult = 1;
  if (ent.shotStreak <= 0) {
    mult *= b.first;
  } else {
    mult *= Math.min(1 + b.perShot * ent.shotStreak, b.max);
  }
  mult *= moveFactor(w, ent);
  return w.spread * mult;
}

export function updateShotStreak(ent, dt) {
  if (ent.shotStreak > 0) {
    ent.shotStreakT -= dt;
    if (ent.shotStreakT <= 0) ent.shotStreak = 0;
  }
}

export function registerShot(ent) {
  ent.shotStreak = (ent.shotStreak || 0) + 1;
  ent.shotStreakT = 0.5;
}
