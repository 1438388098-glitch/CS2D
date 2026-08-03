import { readFileSync, writeFileSync } from 'fs';
// H11 部署：H10 网络权重 + oppModel 标记（军备竞赛 v2 起点）
const cfg = readFileSync('D:/Claudeworkspace/CS2D/src/config.js', 'utf8');
const wStart = cfg.indexOf('ladder[10]');
const wEnd = cfg.indexOf('ladder[11]');
const ladder10 = cfg.substring(wStart, wEnd);
const m = ladder10.match(/netWeights: (\{.*?\}) \};/);
if (!m) { console.log('netWeights 提取失败'); process.exit(1); }
const net = m[1];
const seg = `  ladder[11] = { ...degParams(1.0), trained: true, style: "H11 军备竞赛", note: "H10 网络 + 19维增强参数 + 对手建模(训练中)", oppModel: true, netWeights: ${net} };\n`;
const i1 = cfg.indexOf('ladder[11]');
const i2 = cfg.indexOf('return ladder;');
const cfg2 = cfg.replace(cfg.substring(i1, i2), seg);
writeFileSync('D:/Claudeworkspace/CS2D/src/config.js', cfg2);
console.log('H11 部署完成，netWeights 键: ' + Object.keys(JSON.parse(net)).join(','));
