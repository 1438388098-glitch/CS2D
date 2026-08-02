// 人格系统：每个 bot 出生时从种子派生 4 维画像，作为决策乘子（个体差异层）
// 难度参数 = 全局乘数（训练基因），人格 = 个体偏移，两层独立叠加
import { mulberry32 } from './ctx.js';

export const ARCHETYPES = {
  breacher: { label: '突', aggression: 1.35, risk: 1.2, idealMul: 0.7, nade: 0.8, teamwork: 0.9, lurk: false },
  sniper:   { label: '狙', aggression: 0.7,  risk: 0.9, idealMul: 1.6, nade: 0.5, teamwork: 1.0, lurk: false },
  support:  { label: '辅', aggression: 0.85, risk: 0.9, idealMul: 1.0, nade: 1.6, teamwork: 1.25, lurk: false },
  lurk:     { label: '绕', aggression: 0.95, risk: 0.8, idealMul: 1.1, nade: 0.7, teamwork: 0.75, lurk: true },
  rifler:   { label: '步', aggression: 1.0,  risk: 1.0, idealMul: 1.0, nade: 1.0, teamwork: 1.0, lurk: false }
};

// 从种子派生人格（同 seed → 同人格，可复现）
export function rollPersonality(seed) {
  const rng = mulberry32(((seed >>> 0) ^ 0x51ab3) >>> 0);
  return {
    aggression: 0.3 + rng() * 0.7,
    riskT: 0.3 + rng() * 0.7,
    teamwork: 0.3 + rng() * 0.7,
    steadiness: 0.3 + rng() * 0.7
  };
}

// 队伍角色分配（按人数自适应阵容：≥2 人必有突破手，≥3 人必有辅助，≥5 人配狙击手）
export function assignArchetypes(teamBots, seedOffset) {
  const n = teamBots.length;
  if (n === 0) return;
  const rng = mulberry32(((seedOffset >>> 0) ^ 0xfeed) >>> 0);
  const pool = ['breacher', 'sniper', 'support', 'lurk', 'rifler'];
  const fixed = [];
  if (n >= 2) fixed.push('breacher');
  if (n >= 3) fixed.push('support');
  if (n >= 5) fixed.push('sniper');
  for (let i = 0; i < n; i++) {
    const t = fixed.shift();
    teamBots[i].archetype = t || pool[Math.floor(rng() * pool.length)];
  }
}
