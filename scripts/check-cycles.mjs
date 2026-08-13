// 循环依赖护栏：静态扫描 src/ 的 ESM import 图，检测模块环。
// 已知环列入 KNOWN_CYCLES 白名单（含成因），新增环会以非零退出码失败，接入 CI 防止环扩张。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

// 已知环（节点集合规范化签名）。成因见 src/ 内各模块注释：多为通过 game 参数注入解耦的历史环。
const KNOWN_CYCLES = new Set([
  'ai/rules|map',                       // map.js ↔ ai/rules.js（rules 引用地图派生数据，map 引用规则判定）
  'combat|game',                        // combat.js ↔ game.js（combat 调 endRound/spawnParticle，game 调 fireWeapon）
  'combat|game|grenades',               // combat→game→grenades→combat
  'game|grenades',                      // game.js ↔ grenades.js
  'ai|ai/core|ai/index|combat|game',    // combat→game→ai→index→core→combat（长环）
  'ai|ai/actions|ai/core|ai/index|combat|game', // actions→combat→game→ai→index→core→actions
  'bomb|combat|game',                   // combat→game→bomb→combat
  'bomb|game',                          // game.js ↔ bomb.js
]);

function collectFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...collectFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 提取相对 import/export 依赖 spec（含副作用 import）
function importSpecsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const specs = [];
  const re = /from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    if (spec && spec.startsWith('.')) specs.push(spec);
  }
  return specs;
}

function resolveId(fromFile, spec) {
  let abs = path.resolve(path.dirname(fromFile), spec);
  abs = abs.replace(/\.js$/, '');
  return path.relative(srcDir, abs).split(path.sep).join('/');
}

function cycleSignature(cycle) {
  // 环内节点去重后排序，作为白名单规范化 key（不区分起点/方向）
  return [...new Set(cycle)].sort().join('|');
}

function findCycles(graph) {
  const seen = new Set();
  const cycles = new Map(); // signature -> cycle array
  const stack = [];
  const inStack = new Set();
  const visited = new Set();

  function dfs(node) {
    if (inStack.has(node)) {
      const start = stack.indexOf(node);
      const cycle = stack.slice(start).concat(node);
      const sig = cycleSignature(cycle);
      if (!cycles.has(sig)) cycles.set(sig, cycle);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    stack.push(node);
    for (const dep of graph.get(node) || []) dfs(dep);
    stack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) dfs(node);
  return cycles;
}

const files = collectFiles(srcDir);
const graph = new Map();
for (const file of files) {
  const id = path.relative(srcDir, file).replace(/\.js$/, '').split(path.sep).join('/');
  const deps = importSpecsOf(file).map((spec) => resolveId(file, spec));
  graph.set(id, new Set(deps));
}

const cycles = findCycles(graph);
const unknown = [];
for (const [sig, cycle] of cycles) {
  if (!KNOWN_CYCLES.has(sig)) unknown.push({ sig, cycle });
}

console.log(`check-cycles: 扫描 ${files.length} 个模块，检测到 ${cycles.size} 条循环依赖`);
for (const [sig, cycle] of cycles) {
  const known = KNOWN_CYCLES.has(sig) ? '（已知）' : '（新增!）';
  console.log(`  ${known} ${cycle.join(' -> ')}`);
}

if (unknown.length > 0) {
  console.error('\ncheck-cycles: 发现新增循环依赖，请解耦或登记到 KNOWN_CYCLES：');
  for (const { sig, cycle } of unknown) {
    console.error(`  [新增] ${cycle.join(' -> ')}  sig="${sig}"`);
  }
  process.exit(1);
}
console.log('check-cycles: 无新增循环依赖，通过');
