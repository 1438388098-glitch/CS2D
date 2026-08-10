import { clamp } from './utils.js';

// 19 维基因组：0-9 战斗参数（S1 兼容）、10-12 策略参数（S2）、13-18 微观战斗增强（H11 军备竞赛 S3）
// 新维度默认值 = 中性（1.0 或 0）→ H1-H10 旧基因不填新位时行为不变
export const GENOME_SIZE = 19;

export function randomGenome() {
  const g = new Array(GENOME_SIZE);
  for (let i = 0; i < GENOME_SIZE; i++) g[i] = Math.random();
  return g;
}

export function decodeGenome(g) {
  const v = (i, d) => (Number.isFinite(g[i]) ? clamp(g[i], 0, 1) : d);
  return {
    react: 0.05 + v(0, 0.5) * 0.5,
    spreadMult: 0.5 + v(1, 0.5) * 1.5,
    view: 800 + v(2, 0.5) * 500,
    aimSpeed: 60 + v(3, 0.5) * 120,
    strafe: 0.2 + v(4, 0.5) * 0.6,
    idealMin: 200 + v(5, 0.5) * 400,
    idealMax: 550 + v(6, 0.5) * 400,
    peekChance: v(7, 0.5) * 0.5,
    nadeUse: 0.2 + v(8, 0.5) * 0.8,
    riskT: 0.3 + v(9, 0.5) * 1.2,
    rushChance: 0.1 + v(10, 0.35) * 0.6,
    rotateChance: 0.2 + v(11, 0.45) * 0.6,
    saveChance: 0.2 + v(12, 0.55) * 0.8,
    // S3 微观战斗增强（默认中性：peekSkill/counterStrafe/spreadCtrl=1.0, prefire/trade=0）
    peekSkill: 0.6 + v(13, 1.0) * 0.4,
    counterStrafe: 0.5 + v(14, 1.0) * 0.5,
    prefireChance: v(15, 0) * 0.6,
    ecoDiscipline: 0.4 + v(16, 0.75) * 0.8,
    tradeSpeed: 1.0 + v(17, 0) * 1.5,
    spreadCtrl: 0.5 + v(18, 0.5) * 1.0
  };
}

export function applyGenomeToParams(g) {
  return decodeGenome(g);
}

export function crossover(a, b) {
  const n = Math.min(GENOME_SIZE, a.length, b.length);
  const c = new Array(GENOME_SIZE);
  for (let i = 0; i < GENOME_SIZE; i++) {
    c[i] = i < n ? (Math.random() < 0.5 ? a[i] : b[i]) : Math.random();
  }
  return c;
}

export function mutate(g, rate = 0.1, sigma = 0.15) {
  const m = g.slice();
  for (let i = 0; i < GENOME_SIZE; i++) {
    if (Math.random() < rate) {
      m[i] = clamp(m[i] + gaussian() * sigma, 0, 1);
    }
  }
  return m;
}

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
