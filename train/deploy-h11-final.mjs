import { readFileSync, writeFileSync } from 'fs';
import { decodeGenome } from '../src/ai-genome.js';
// H11 最终部署：GA 军备竞赛 19 维基因 + intel + oppModel（不挂网络——网络 vs 地狱挡 Q 值崩坏已证）
const ck = JSON.parse(readFileSync('D:/Claudeworkspace/CS2D/train/checkpoints/fresh_genome_best.json', 'utf8'));
const p = decodeGenome(ck.genome);
const seg = `  ladder[11] = { react: ${p.react}, spreadMult: ${p.spreadMult}, view: ${p.view}, strafe: ${p.strafe}, aimSpeed: ${p.aimSpeed}, idealMin: ${p.idealMin}, idealMax: ${p.idealMax}, peekChance: ${p.peekChance}, nadeUse: ${p.nadeUse}, riskT: ${p.riskT}, rushChance: ${p.rushChance}, rotateChance: ${p.rotateChance}, saveChance: ${p.saveChance}, peekSkill: ${p.peekSkill}, counterStrafe: ${p.counterStrafe}, prefireChance: ${p.prefireChance}, ecoDiscipline: ${p.ecoDiscipline}, tradeSpeed: ${p.tradeSpeed}, spreadCtrl: ${p.spreadCtrl}, trained: true, style: "H11 军备竞赛", note: "GA 军备竞赛(网络+intel 试验后回滚, fitness ${ck.fitness.toFixed(2)} gen${ck.gen})", intel: true, oppModel: true, netWeights: null };\n`;
const cfg = readFileSync('D:/Claudeworkspace/CS2D/src/config.js', 'utf8');
const i1 = cfg.indexOf('ladder[11]');
const i2 = cfg.indexOf('return ladder;');
const cfg2 = cfg.replace(cfg.substring(i1, i2), seg);
writeFileSync('D:/Claudeworkspace/CS2D/src/config.js', cfg2);
console.log('H11 部署完成（GA 基因 + intel + oppModel，fitness=' + ck.fitness.toFixed(2) + '）');
