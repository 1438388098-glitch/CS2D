// 审计 3b：内嵌 H8-H10 权重到底匹配哪个 checkpoint？（跨全部 net_*.json 交叉比对）
import { readFileSync, readdirSync } from 'fs';
import { installStubs } from './stubdom.js';
installStubs();
const { DIFF } = await import('../src/config.js');
const { decodeGenome } = await import('../src/ai-genome.js');

const CK = 'D:/Claudeworkspace/CS2D/train/checkpoints/';
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const lv of [8, 9, 10]) {
  const emb = DIFF.hell.ladder[lv].netWeights.__default;
  const matches = [];
  for (const f of readdirSync(CK).filter((f) => f.startsWith('net_'))) {
    try {
      const ck = JSON.parse(readFileSync(CK + f, 'utf8'));
      if (ck.iw && eq(emb.iw, ck.iw) && eq(emb.ow, ck.ow)) matches.push(f);
    } catch {}
  }
  const total = emb.iw.reduce((s, r) => s + r.length, 0);
  console.log(`H${lv} 内嵌 iw(${total} 权重) 精确匹配: ${matches.length ? matches.join(', ') : '无任何 checkpoint 匹配！'}`);
}

// H11 基因溯源
console.log('\n=== H11 溯源 ===');
const h11 = DIFF.hell.ladder[11];
for (const f of ['fresh_genome_best.json']) {
  const ck = JSON.parse(readFileSync(CK + f, 'utf8'));
  const p = decodeGenome(ck.genome);
  console.log(`checkpoint ${f} 解码:`);
  for (const k of ['react', 'spreadMult', 'view', 'strafe', 'aimSpeed', 'idealMin', 'idealMax', 'peekChance', 'nadeUse', 'riskT', 'rushChance', 'rotateChance', 'saveChance']) {
    const v = h11[k];
    const mark = Math.abs(v - p[k]) < 1e-3 ? '✓' : `✗ (ck=${p[k].toFixed(4)})`;
    console.log(`  ${k}: 部署=${v} ${mark}`);
  }
  console.log(`  S3 扩展字段(peekSkill/counterStrafe/prefire/eco/trade/spreadCtrl): 部署有值，但 decodeGenome(${ck.genome.length}维基因) 不含 → 手工附加，无训练 checkpoint 支撑`);
}
console.log(`H11 部署 note: "GA 军备竞赛(网络+intel 试验后回滚, fitness 0.80 gen67)" — 回滚产物保留 intel/oppModel 标记但 netWeights=null`);
process.exit(0);
