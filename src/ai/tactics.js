// H1-H10 fusion: sample all ten hell-ladder styles with per-bot random weights.
import { DIFF } from '../config.js';
import { mulberry32 } from '../ctx.js';
import { clamp } from '../utils.js';

const HELL_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const HELL_LABELS = {
  1: 'H1 \u70ed\u624b',
  2: 'H2 \u6e10\u5165',
  3: 'H3 \u51a0\u519b',
  4: 'H4 \u4fdd\u67aa\u7eaa\u5f8b',
  5: 'H5 \u7ecf\u6d4e\u7eaa\u5f8b',
  6: 'H6 \u95ea\u5149\u914d\u5408',
  7: 'H7 \u8f6c\u70b9\u53cd\u5236',
  8: 'H8 \u4fdd\u5b88\u67b6\u70b9',
  9: 'H9 \u4e3b\u52a8\u63a7\u56fe',
  10: 'H10 \u538b\u8feb\u524d\u538b'
};

export const HELL_PARAM_KEYS = ['react', 'spreadMult', 'view', 'strafe', 'aimSpeed', 'idealMin', 'idealMax', 'peekChance', 'nadeUse', 'riskT', 'rushChance', 'rotateChance', 'saveChance'];

function styleWeight(i, teamStyle = '') {
  const s = String(teamStyle || '');
  let w = 1;
  if (/(\u72c2\u91ce|\u9ad8\u901f|\u63d0\u901f|\u6fc0\u8fdb|\u8fdb\u653b\u6d6a|\u538b\u8feb|\u524d\u538b|\u706b\u529b)/.test(s)) {
    if (i === 10 || i === 7 || i === 2 || i === 3) w *= 1.9;
  }
  if (/(\u6162\u653b|\u7eaa\u5f8b|\u7a33\u624e|\u8001\u724c|\u4fdd\u5b88|\u9632\u53cd|\u63a7\u5236)/.test(s)) {
    if (i === 4 || i === 5 || i === 8 || i === 9) w *= 1.8;
  }
  if (/(\u72d9\u51fb|\u53cc\u72d9|\u67b6\u70b9)/.test(s)) {
    if (i === 8 || i === 3) w *= 2.1;
  }
  if (/(\u95ea\u5149|\u56e2\u6218|\u914d\u5408|\u63a7\u56fe)/.test(s)) {
    if (i === 6 || i === 9 || i === 2) w *= 1.8;
  }
  return w;
}

const LIMITS = {
  react: [0.05, 0.3],
  spreadMult: [0.5, 1.5],
  view: [800, 1400],
  strafe: [0.3, 0.85],
  aimSpeed: [30, 180],
  idealMin: [160, 320],
  idealMax: [480, 900],
  peekChance: [0.03, 0.25],
  nadeUse: [0.5, 1.2],
  riskT: [0.5, 1.5],
  rushChance: [0.1, 0.7],
  rotateChance: [0.2, 0.9],
  saveChance: [0.3, 0.95]
};

export function hellMix(seed, teamStyle = '') {
  const rng = mulberry32(((seed >>> 0) ^ 0x51ab3) >>> 0);
  const weights = HELL_KEYS.map((i) => (0.25 + rng() * 1.25) * styleWeight(i, teamStyle));
  const total = weights.reduce((a, b) => a + b, 0);
  const params = {};
  let dom = 0;
  for (let i = 0; i < HELL_KEYS.length; i++) {
    const d = DIFF.hell.ladder[HELL_KEYS[i]] || {};
    if (weights[i] > weights[dom]) dom = i;
    for (const k of HELL_PARAM_KEYS) {
      if (d[k] === undefined) continue;
      params[k] = (params[k] || 0) + d[k] * weights[i] / total;
    }
  }
  for (const k of HELL_PARAM_KEYS) {
    if (params[k] === undefined) continue;
    const lim = LIMITS[k];
    params[k] = clamp(params[k], lim[0], lim[1]);
  }
  return {
    params,
    style: HELL_LABELS[HELL_KEYS[dom]],
    source: 'H' + HELL_KEYS[dom],
    variant: Math.floor(rng() * 1000000)
  };
}
