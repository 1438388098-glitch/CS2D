import { readFileSync, writeFileSync } from 'fs';
import { decodeGenome } from '../src/ai-genome.js';
const ck = JSON.parse(readFileSync('D:/Claudeworkspace/CS2D/train/checkpoints/fresh_genome_best.json', 'utf8'));
const p = decodeGenome(ck.genome);
const seg = `  ladder[11] = { react: ${p.react}, spreadMult: ${p.spreadMult}, view: ${p.view}, strafe: ${p.strafe}, aimSpeed: ${p.aimSpeed}, idealMin: ${p.idealMin}, idealMax: ${p.idealMax}, peekChance: ${p.peekChance}, nadeUse: ${p.nadeUse}, riskT: ${p.riskT}, rushChance: ${p.rushChance}, rotateChance: ${p.rotateChance}, saveChance: ${p.saveChance}, trained: true, style: "H11 从零进化", note: "从零GA 24代 71%胜率(seed分散评估)", genome: ${JSON.stringify(ck.genome)} };\n`;
writeFileSync('C:/Users/20579/AppData/Local/Temp/opencode/h11-deploy.js', seg);
console.log('generated ' + seg.length + ' chars');
