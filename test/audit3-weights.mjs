// 只读审计脚本 3：训练产物与运行时部署一致性（权重/基因比对）
import { readFileSync } from 'fs';
import { installStubs } from './stubdom.js';
installStubs();
const { DIFF } = await import('../src/config.js');

console.log('=== H8-H10 部署权重 vs 训练 checkpoints ===');
const CK = 'D:/Claudeworkspace/CS2D/train/checkpoints/';
const files = {
  8: { net: 'net_push_best.json', style: 'push', note: 'H8 保守架点流 ← DQN push' },
  9: { net: 'net_hold_best.json', style: 'hold', note: 'H9 主动控图流 ← DQN hold' },
  10: { net: 'net_control_best.json', style: 'control', note: 'H10 压迫前压流 ← DQN control' }
};
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

for (const [lv, info] of Object.entries(files)) {
  const emb = DIFF.hell.ladder[lv].netWeights;
  const defW = emb.__default;
  console.log(`\nH${lv} (${info.note})`);
  console.log(`  内嵌结构 keys: ${Object.keys(emb).join(',')}  __default: {input:${defW.input}, hidden:${defW.hidden}, output:${defW.output}, iw rows:${defW.iw.length}, ow rows:${defW.ow ? defW.ow.length : 'MISSING!'}}`);
  if (!defW.ow) console.log(`  ⚠ P0 候选: __default 缺 ow —— dqn.js forward() 会 throw TypeError → 决策崩溃`);
  const ck = JSON.parse(readFileSync(CK + info.net, 'utf8'));
  console.log(`  checkpoint ${info.net}: {input:${ck.input}, hidden:${ck.hidden}, output:${ck.output}, iw rows:${ck.iw.length}, ow rows:${ck.ow ? ck.ow.length : 'MISSING'}} ep=${ck.ep} score=${ck.score} style=${ck.style}`);
  const iwEq = defW.iw && deepEq(defW.iw, ck.iw);
  const owEq = defW.ow && deepEq(defW.ow, ck.ow);
  console.log(`  内嵌 vs checkpoint: iw ${iwEq ? '✓一致' : '✗不一致!'}  ow ${owEq ? '✓一致' : '✗不一致!'}`);
  if (!iwEq) {
    // 统计差异幅度
    let maxDiff = 0, nDiff = 0;
    for (let r = 0; r < defW.iw.length && r < ck.iw.length; r++) {
      for (let c = 0; c < defW.iw[r].length && c < ck.iw[r].length; c++) {
        const dd = Math.abs(defW.iw[r][c] - ck.iw[r][c]);
        if (dd > 1e-9) nDiff++;
        if (dd > maxDiff) maxDiff = dd;
      }
    }
    console.log(`  iw 差异: ${nDiff} 个元素, max|Δ|=${maxDiff.toFixed(6)}`);
  }
}

console.log('\n=== H4-H7 基因 vs checkpoints（deploy-h47 取每个 tag 最后一个文件）===');
const tags = { 4: 'h4', 5: 'h5', 6: 'h6', 7: 'h7' };
const { readdirSync } = await import('fs');
const all = readdirSync(CK).filter((f) => f.endsWith('.json'));
for (const [lv, tag] of Object.entries(tags)) {
  const cks = all.filter((f) => f.endsWith('_' + tag + '.json')).sort();
  const last = cks[cks.length - 1];
  const emb = DIFF.hell.ladder[lv];
  if (!last) { console.log(`H${lv}: 无 checkpoint`); continue; }
  const ck = JSON.parse(readFileSync(CK + last, 'utf8'));
  const embG = JSON.stringify(emb.genome);
  const ckG = JSON.stringify(Array.from(ck.genome));
  console.log(`H${lv} ← ${last} fitness=${ck.fitness}: genome ${embG === ckG ? '✓一致' : '✗不一致!'}`);
  if (embG !== ckG) console.log(`   内嵌: ${embG}\n   ck  : ${ckG}`);
  // 参数级比对
  const embP = Object.fromEntries(Object.entries(emb).filter(([k]) => ['react', 'spreadMult', 'view', 'strafe', 'aimSpeed', 'idealMin', 'idealMax', 'peekChance', 'nadeUse', 'riskT', 'rushChance', 'rotateChance', 'saveChance'].includes(k)));
  const ckP = ck.params || {};
  const keys = Object.keys(embP);
  const diffP = keys.filter((k) => Math.abs(embP[k] - (ckP[k] ?? -1)) > 1e-6);
  console.log(`   参数差异字段: ${diffP.length ? diffP.join(',') : '无（一致）'}`);
}

console.log('\n=== H11 部署状态 ===');
const h11 = DIFF.hell.ladder[11];
console.log(`H11: intel=${h11.intel} oppModel=${h11.oppModel} netWeights=${JSON.stringify(h11.netWeights)}`);
console.log(`H11 是训练产物 fresh_genome_best.json(2026/8/3 01:34) 吗？`);

console.log('\n=== 训练 vs 运行时观测一致性 ===');
console.log(`netObs 13 维（decisions.js:69-113）与部署权重 input:13 一致（同一函数，训练/运行时共用）`);
console.log(`训练: g.opts.diffParams=DIFF.normal + aiParams={...normal, netWeights}，T 队 5 bot 共享；CT 队 aiParams=课程对手(easy/normal/hard)`);
console.log(`运行时 quick match: aiParams=null，走 diffOf→opts.diffParams=ladder[lvl]；T/CT 双方同参数（hell 模式）`);
console.log(`→ 训练时 CT 对手=normal，部署时 CT 也是 H 级 → 训练/部署对手强度错配（难度曲线从未在“双方同挡位”下验证）`);
console.log(`训练回合 ROUND.DURATION=40s、buyTime=0.3、freeze=0.2（fitness.js:16,41）→ 无经济局/无长盘；部署 115s 回合 + 20s 购买（经济局占比大）`);
console.log(`训练 5v5（player.bot=true 计入 CT），部署 quick match bots=4 → 4v5 观测 myAlive/5、enAlive/5 分布漂移`);
process.exit(0);
