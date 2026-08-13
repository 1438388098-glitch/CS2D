import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIFF } from '../src/config.js';

// H8-H10 多图部署：__default = 现有 dust2 权重（已训练验证），其余图用迁移训练 best。
// 生成片段写回 src/data/ai-ladder-weights.js 的 AI_LADDER_WEIGHTS（netWeights 已从 config.js 抽出）。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = { 8: 'push', 9: 'hold', 10: 'control' };
const NAMES = { 8: '保守架点', 9: '主动控图', 10: '压迫前压' };
const MAPS = ['canal', 'metro'];
let out = '';
for (const [lv, style] of Object.entries(STYLES)) {
  const dust2 = DIFF.hell.ladder[lv].netWeights; // 现有 dust2 权重
  const byMap = { __default: dust2 };
  for (const m of MAPS) {
    const file = path.join(root, 'train', 'checkpoints', `net_${style}_best_${m}.json`);
    if (!existsSync(file)) { console.log(`[deploy] 跳过 ${style}@${m}（无 checkpoint）`); continue; }
    const ck = JSON.parse(readFileSync(file, 'utf8'));
    byMap[m] = { input: ck.input, hidden: ck.hidden, output: ck.output, iw: ck.iw, ow: ck.ow };
  }
  out += `AI_LADDER_WEIGHTS[${lv}] = ${JSON.stringify(byMap)};\n`;
  console.log(`H${lv} ← ${style} × 3 图（__default=dust2 现有权重）`);
}
const outFile = path.join(root, 'train', 'checkpoints', 'ladder-deploy.js');
writeFileSync(outFile, out);
console.log('generated ' + out.length + ' chars -> ' + outFile);
