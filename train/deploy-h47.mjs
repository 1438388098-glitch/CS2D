import { readFileSync, writeFileSync } from 'fs';
import { decodeGenome } from '../src/ai-genome.js';

const levels = [
  [4, 'h4', '保枪纪律'],
  [5, 'h5', '经济纪律'],
  [6, 'h6', '闪光配合'],
  [7, 'h7', '转点反制']
];
let out = '';
for (const [lv, tag, name] of levels) {
  const cks = readdirSafe().filter((f) => f.endsWith('_' + tag + '.json'));
  if (!cks.length) { console.log('skip ' + tag); continue; }
  const ck = JSON.parse(readFileSync('D:/Claudeworkspace/CS2D/train/checkpoints/' + cks[cks.length - 1], 'utf8'));
  const p = decodeGenome(ck.genome);
  out += `  ladder[${lv}] = { react: ${p.react}, spreadMult: ${p.spreadMult}, view: ${p.view}, strafe: ${p.strafe}, aimSpeed: ${p.aimSpeed}, idealMin: ${p.idealMin}, idealMax: ${p.idealMax}, peekChance: ${p.peekChance}, nadeUse: ${p.nadeUse}, riskT: ${p.riskT}, rushChance: ${p.rushChance}, rotateChance: ${p.rotateChance}, saveChance: ${p.saveChance}, trained: true, note: 'H${lv} ${name}', genome: ${JSON.stringify(ck.genome)} };\n`;
  console.log(`H${lv} ← ${cks[cks.length - 1]} fitness=${ck.fitness}`);
}
writeFileSync('C:/Users/20579/AppData/Local/Temp/opencode/ladder-h47-deploy.js', out);
console.log('generated ' + out.length + ' chars');

function readdirSafe() {
  try { return readdirSyncSafe(); } catch { return []; }
}
import { readdirSync } from 'fs';
function readdirSyncSafe() { return readdirSync('D:/Claudeworkspace/CS2D/train/checkpoints'); }
