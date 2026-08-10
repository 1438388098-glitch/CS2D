import { readFileSync, writeFileSync, existsSync } from 'fs';
import { DIFF } from '../src/config.js';

// H8-H10 多图部署：__default = config 现有 dust2 权重（已训练验证），其余图用迁移训练 best
const STYLES = { 8: 'push', 9: 'hold', 10: 'control' };
const NAMES = { 8: '保守架点', 9: '主动控图', 10: '压迫前压' };
const MAPS = ['canal', 'metro'];
let out = '';
for (const [lv, style] of Object.entries(STYLES)) {
  const dust2 = DIFF.hell.ladder[lv].netWeights; // 现有内嵌（dust2 训练）
  const byMap = { __default: dust2 };
  for (const m of MAPS) {
    const file = `D:/Claudeworkspace/CS2D/train/checkpoints/net_${style}_best_${m}.json`;
    if (!existsSync(file)) { console.log(`[deploy] 跳过 ${style}@${m}（无 checkpoint）`); continue; }
    const ck = JSON.parse(readFileSync(file, 'utf8'));
    byMap[m] = { input: ck.input, hidden: ck.hidden, output: ck.output, iw: ck.iw, ow: ck.ow };
  }
  out += `  ladder[${lv}] = { ...degParams(1.0), trained: true, style: "H${lv} ${NAMES[lv]}流", note: "DQN ${style}@best(课程学习, 3图)", netWeights: ${JSON.stringify(byMap)} };\n`;
  console.log(`H${lv} ← ${style} × 3 图（__default=dust2 现有权重）`);
}
writeFileSync('C:/Users/20579/AppData/Local/Temp/opencode/ladder-deploy.js', out);
console.log('generated ' + out.length + ' chars');
