// 一次性迁移：把 src/config.js 内嵌的 DQN netWeights（~150KB 单行 JSON）抽到 src/data/ai-ladder-weights.js，
// config.js 改为 import 引用，恢复 config 可读性。运行后本脚本可删除。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'src', 'config.js');
const weightsPath = path.join(root, 'src', 'data', 'ai-ladder-weights.js');

// 动态 import config.js 获取 ladder 数据（Node 环境无 DOM 依赖，安全）
const cfg = await import(pathToFileURL(configPath).href);
const ladder = cfg.DIFF && cfg.DIFF.hell && cfg.DIFF.hell.ladder;

const levels = [8, 9, 10, 12].filter((n) => ladder && ladder[n] && ladder[n].netWeights);
if (levels.length === 0) {
  console.error('extract-weights: 未找到 netWeights（ladder[8/9/10/12]），可能结构已变，终止');
  process.exit(1);
}

// 生成 weights 文件
const data = {};
for (const n of levels) data[n] = ladder[n].netWeights;
fs.mkdirSync(path.dirname(weightsPath), { recursive: true });
fs.writeFileSync(
  weightsPath,
  '// DQN 难度阶梯网络权重（H8-H10 单 bot 宏观 + H12 团队网络）。\n' +
  '// 由 scripts/extract-weights.mjs 从 config.js 抽出，训练/部署脚本 deploy-multi.mjs 写回本文件而非 config.js。\n' +
  'export const AI_LADDER_WEIGHTS = ' + JSON.stringify(data) + ';\n',
  'utf8'
);
console.log('extract-weights: 已生成 ' + path.relative(root, weightsPath) + ' (' + levels.map(String).join(',') + ')');

// 替换 config.js 源码：netWeights: {巨大JSON} → netWeights: AI_LADDER_WEIGHTS[N]
let src = fs.readFileSync(configPath, 'utf8');

function balancedJsonEnd(str, startIdx) {
  // startIdx 指向 JSON 起始 '{'，返回匹配 '}' 之后的下标
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

let replaced = 0;
for (const n of levels) {
  const marker = `netWeights: `;
  // 定位 ladder[n] = {...} 这一整块内的 netWeights（简单全局查找，逐个替换）
  let idx = src.indexOf(marker);
  while (idx !== -1) {
    const braceIdx = src.indexOf('{', idx + marker.length);
    if (braceIdx === -1) break;
    const end = balancedJsonEnd(src, braceIdx);
    if (end === -1) { console.error('extract-weights: 括号不匹配，终止'); process.exit(1); }
    // 仅当这是 {巨大JSON}（含 "input" 键）时才替换，避免误伤 netWeights: null
    const segment = src.slice(braceIdx, end);
    if (segment.includes('"input"')) {
      src = src.slice(0, idx + marker.length) + `AI_LADDER_WEIGHTS[${n}]` + src.slice(end);
      replaced++;
      idx = src.indexOf(marker, idx + marker.length);
    } else {
      idx = src.indexOf(marker, idx + marker.length);
    }
  }
}

if (replaced !== levels.length) {
  console.error(`extract-weights: 期望替换 ${levels.length} 处，实际 ${replaced} 处，请人工核对，未写回 config.js`);
  process.exit(1);
}

// 在 config.js 顶部插入 import（首个 import 之后）
if (!src.includes('ai-ladder-weights')) {
  const firstImportEnd = src.indexOf('\n', src.indexOf('import '));
  src = src.slice(0, firstImportEnd + 1) +
    "import { AI_LADDER_WEIGHTS } from './data/ai-ladder-weights.js';\n" +
    src.slice(firstImportEnd + 1);
}
fs.writeFileSync(configPath, src, 'utf8');
console.log(`extract-weights: 已替换 config.js 中 ${replaced} 处 netWeights 为引用`);
