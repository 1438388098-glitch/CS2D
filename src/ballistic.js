const DEFAULTS = {
  first: 0.5,
  perShot: 0.18,
  max: 3.0,
  recover: 1.8,
  move: { stand: 1.0, walk: 0.55, run: 2.2, crouch: 0.75, airborne: 2.4 }
};

export function ballisticOf(w) {
  return w.ballistic || DEFAULTS;
}

export function moveFactor(w, ent) {
  const b = ballisticOf(w);
  const spd = Math.hypot(ent.vx, ent.vy);
  let key = 'stand';
  if (ent.airborneT > 0) {
    key = 'airborne';
  } else if (ent.crouched && spd > 60) {
    key = ent.walking ? 'walk' : 'run';
  } else if (ent.crouched) {
    key = 'crouch';
  } else if (spd > 60) {
    key = ent.walking ? 'walk' : 'run';
  } else if (spd > 10) {
    key = 'walk';
  }
  let v = b.move[key];
  if (v === undefined) v = DEFAULTS.move[key];
  if (ent.crouched && spd > 60) {
    v = Math.max(v, b.move.crouch !== undefined ? b.move.crouch : DEFAULTS.move.crouch);
  }
  // S3 微观增强：急停质量（bot 急停时移动散布惩罚减免，H11 专用）
  if (ent.bot && spd <= 10 && ent.aiParams && ent.aiParams.counterStrafe !== undefined) {
    v *= ent.aiParams.counterStrafe;
  }
  return v;
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
  return w.spread * mult * (ent.spreadMult || 1);
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

// 爆头判定（拟合人类 CS）：命中越靠近目标中心（瞄准精度）、距离越近、武器越精密 → 爆头概率越高
export function headshotChance(w, ent, perp, dist) {
  const base = w.kind === 'sniper' ? 0.55 : (w.kind === 'pistol' ? 0.28 : (w.kind === 'rifle' ? 0.2 : (w.kind === 'smg' ? 0.18 : 0.08)));
  const aim = clamp(1 - perp / (ent.rad * 0.75), 0.15, 1);
  const far = clamp(1.2 - dist / w.range, 0.25, 1);
  return clamp(base * aim * far, 0.03, 0.85);
}


export function distanceFalloff(w, dist) {
  if (w && w.falloff) {
    const f = w.falloff;
    if (dist <= f.start) return 1;
    if (dist >= f.end) return f.min;
    const t = (dist - f.start) / (f.end - f.start);
    return 1 - (1 - f.min) * t;
  }
  const defs = {
    pistol: { start: 500, end: 900, min: 0.75 },
    smg: { start: 450, end: 850, min: 0.7 },
    rifle: { start: 700, end: 1200, min: 0.7 },
    sniper: { start: 900, end: 1400, min: 0.95 },
    shotgun: { start: 300, end: 700, min: 0.5 }
  };
  const d = defs[w && w.kind] || { start: Infinity, end: Infinity, min: 1 };
  if (dist <= d.start) return 1;
  if (dist >= d.end) return d.min;
  const t = (dist - d.start) / (d.end - d.start);
  return 1 - (1 - d.min) * t;
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
