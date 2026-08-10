// 真实引擎 Major 模拟主脚本：N 次完整 Major，每场 5v5 真实 AI 对局（MR5）
// 用法: node scripts/sim-real-major.mjs [次数=100] [并行度=CPU核数]
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// 启动前确保 modes.js 为最新 Major 代码（外部进程可能还原旧版，这里重建一次）
const root = fileURLToPath(new URL('..', import.meta.url));
const patchPath = 'C:/Users/20579/AppData/Local/Temp/opencode/patch-modes.mjs';
const cur = readFileSync(root + 'src/modes.js', 'utf8');
if (!cur.includes('setMajorSim')) {
  console.log('modes.js 非最新版，正在重建 Major 代码...');
  const pr = spawnSync(process.execPath, [patchPath], { encoding: 'utf8' });
  if (pr.status !== 0) { console.error('patch 失败:', pr.stderr || pr.stdout); process.exit(1); }
}
const after = readFileSync(root + 'src/modes.js', 'utf8');
if (!after.includes('setMajorSim') || !after.includes("id: 'falcons'")) {
  console.error('modes.js 重建验证失败'); process.exit(1);
}

const N = parseInt(process.argv[2] || '100', 10);
const PAR = Math.min(parseInt(process.argv[3] || '0', 10) || cpus().length, 48);
const MR = parseInt(process.argv[4] || '1', 10);

const baseSeed = (Date.now() >>> 0) ^ 0x5f3759df;

const per = Math.floor(N / PAR);
const rem = N % PAR;
const chunks = [];
let cursor = 0;
for (let i = 0; i < PAR; i++) {
  const n = per + (i < rem ? 1 : 0);
  if (n > 0) chunks.push({ from: cursor, total: n });
  cursor += n;
}

const workerPath = fileURLToPath(new URL('./sim-real-worker.mjs', import.meta.url));
const results = [];
let done = 0;
const t0 = Date.now();
let lastPrint = 0;

function showProgress() {
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  const rate = done / Math.max(1, (Date.now() - t0) / 1000);
  const eta = (N - done) / Math.max(rate, 1e-9);
  const etaTxt = eta > 3600 ? (eta / 3600).toFixed(1) + 'h' : (eta / 60).toFixed(0) + 'min';
  process.stdout.write(`\r进度 ${done}/${N} (${((done / N) * 100).toFixed(1)}%) | 用时 ${el}s | 速度 ${rate.toFixed(2)} 届/秒 | 预计剩余 ${etaTxt}   `);
}

const stats = {};
const champList = [];

for (const chunk of chunks) {
  const w = new Worker(workerPath, {
    workerData: { from: chunk.from, total: chunk.total, baseSeed, runSeed: baseSeed + chunk.from, mr: MR }
  });
  w.on('message', (msg) => {
    if (msg.type === 'progress') {
      done++;
      if (Date.now() - lastPrint > 2000) { showProgress(); lastPrint = Date.now(); }
    } else if (msg.type === 'done') {
      for (const r of msg.results) {
        results.push(r);
        champList.push(r.champion ? r.champion.tag : '?');
      }
    }
  });
  w.on('error', (e) => { console.error('\nworker error:', e.message); });
  w.on('exit', () => {});
}

function finish() {
  showProgress();
  process.stdout.write('\n');
  // 统计
  const tagOf = {};
  for (const r of results) {
    const c = r.champion;
    if (!c) continue;
    if (!stats[c.id]) stats[c.id] = { id: c.id, tag: c.tag, champ: 0, final: 0, semi: 0, qf: 0, s3: 0, qual: 0, avgRank: 0 };
    stats[c.id].champ++;
  }
  const perTeam = {};
  for (const r of results) {
    r.qualRanking.forEach((e, i) => {
      if (!perTeam[e.id]) perTeam[e.id] = { tag: e.id, champ: 0, final: 0, semi: 0, qf: 0, s3: 0, qual: 0, rankSum: 0 };
      const s = perTeam[e.id];
      s.rankSum += i + 1;
      if (i < 32) s.qual++;
      if (i < 8) s.s3++;
    });
    if (r.playoff) {
      const qf = new Set(r.playoff[0].pairs.flatMap((p) => [p.a, p.b]));
      const sf = new Set(r.playoff[1].pairs.flatMap((p) => [p.a, p.b]));
      const f = new Set(r.playoff[2].pairs.flatMap((p) => [p.a, p.b]));
      for (const id of qf) perTeam[id].qf++;
      for (const id of sf) perTeam[id].semi++;
      for (const id of f) perTeam[id].final++;
    }
    if (r.champion) perTeam[r.champion.id].champ++;
  }
  const rows = Object.values(perTeam).sort((a, b) => b.champ - a.champ || b.final - a.final || b.semi - a.semi);
  console.log('\n' + '='.repeat(100));
  console.log(`真实引擎 Major 模拟 ${N} 次完成 · 每场真实 5v5 AI 对局（MR5）· 16 并行 · 总用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log('='.repeat(100));
  console.log('队伍'.padEnd(14) + '夺冠'.padEnd(6) + '决赛'.padEnd(6) + '四强'.padEnd(6) + '八强'.padEnd(6) + '进S3'.padEnd(6) + '预选晋级'.padEnd(8) + '预选均排');
  for (const s of rows) {
    console.log(s.tag.padEnd(14) + String(s.champ).padEnd(6) + String(s.final).padEnd(6) + String(s.semi).padEnd(6) + String(s.qf).padEnd(6) + String(s.s3).padEnd(6) + String(s.qual).padEnd(8) + (s.rankSum / results.length).toFixed(1));
  }
  const unique = new Set(champList);
  console.log('='.repeat(100));
  console.log(`不同冠军: ${unique.size} | 历届冠军: ${champList.join(' ')}`);
  // 完整赛果落盘
  const out = 'major-real-results.json';
  writeFileSync(out, JSON.stringify(results, null, 1));
  console.log(`\n完整赛果已保存: ${out}（${results.length} 届 × 全场比赛比分）`);
  // 打印第一届时序
  const r0 = results[0];
  if (r0) {
    console.log('\n' + '-'.repeat(100));
    console.log(`示例赛果 [第 ${r0.majorIdx} 次, seed=${r0.seed}]`);
    console.log('预选赛前 8（直进 Stage 3）: ' + r0.qualRanking.slice(0, 8).map((e) => e.id + ' ' + e.w + '-' + e.l).join(', '));
    for (const sw of [r0.s1, r0.s2, r0.s3]) {
      if (!sw) continue;
      console.log('\n' + sw.label + ' 瑞士轮:');
      for (const rd of sw.rounds) {
        console.log('  R' + rd.n + ': ' + rd.pairs.map((p) => `${p.a} ${p.score ? p.score.join(':') : ''} ${p.b}${p.bo > 1 ? ' (BO' + p.bo + ')' : ''}`).join(' | '));
      }
      console.log('  晋级: ' + sw.teams.filter((t) => t.status === 'adv').map((t) => t.id).join(', '));
    }
    if (r0.playoff) {
      console.log('\n淘汰赛:');
      for (const rd of r0.playoff) {
        console.log('  ' + rd.label + ': ' + rd.pairs.map((p) => `${p.a} ${p.score.join(':')} ${p.b}${p.bo > 1 ? ' (BO' + p.bo + ')' : ''}`).join(' | '));
      }
    }
    console.log('冠军: ' + r0.champion.tag + '  ' + r0.finalScore.join(':') + (r0.finalMaps ? ' (' + r0.finalMaps.map((s) => s.join(':')).join(', ') + ')' : ''));
  }
  process.exit(0);
}

const waiter = setInterval(() => {
  if (done >= N) {
    clearInterval(waiter);
    finish();
  }
}, 300);
