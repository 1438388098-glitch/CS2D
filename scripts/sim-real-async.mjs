// 真实引擎 Major 模拟（并行版）：主进程调度赛程，每轮比赛并行分发到 worker 池
// 用法: node scripts/sim-real-async.mjs [次数=1] [并行=16] [MR=1]
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const patchPath = 'C:/Users/20579/AppData/Local/Temp/opencode/patch-modes.mjs';
if (!readFileSync(root + 'src/modes.js', 'utf8').includes('setMajorSim')) {
  console.log('重建 modes.js...');
  spawnSync(process.execPath, [patchPath], { encoding: 'utf8' });
}

const { MAJOR_TEAMS } = await import(new URL('../src/modes.js', import.meta.url));

const N = parseInt(process.argv[2] || '1', 10);
const PAR = Math.min(parseInt(process.argv[3] || '0', 10) || cpus().length, 32);
const MR = parseInt(process.argv[4] || '1', 10);

const workerPath = fileURLToPath(new URL('./sim-real-worker.mjs', import.meta.url));

// ---------- worker 池（比赛执行器） ----------
class Pool {
  constructor(n) {
    this.workers = [];
    this.busy = new Set();
    this.nextId = 0;
    for (let i = 0; i < n; i++) {
      const w = new Worker(workerPath, { workerData: { mode: 'match' } });
      w.pending = new Map();
      w.on('message', (msg) => {
        if (msg.type !== 'result') return;
        const { resolve, reject } = w.pending.get(msg.id) || {};
        if (!resolve) return;
        w.pending.delete(msg.id);
        this.busy.delete(w);
        resolve(msg);
      });
      w.on('error', (e) => { console.error('worker error:', e.message); });
      this.workers.push(w);
    }
  }
  async exec(job) {
    return new Promise((resolve, reject) => {
      const w = this.workers.find((x) => !this.busy.has(x)) || this.workers[0];
      this.busy.add(w);
      const id = this.nextId++;
      w.pending.set(id, { resolve, reject });
      w.postMessage({ type: 'play', id, ...job });
    });
  }
  async execAll(jobs) {
    const out = new Array(jobs.length);
    await Promise.all(jobs.map(async (job, i) => { out[i] = await this.exec(job); }));
    return out;
  }
  async close() { for (const w of this.workers) await w.terminate(); }
}

// ---------- 赛程状态机（与 modes.js 同步逻辑，比赛执行改为并行） ----------
function makeSwiss(entries, label, allBO3) {
  return { label, teams: entries, round: 0, rounds: [], done: false, allBO3: !!allBO3 };
}

function swissPairUp(pool) {
  pool.sort((a, b) => b.team.rating - a.team.rating);
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue;
    let j = i + 1;
    while (j < pool.length && (used.has(j) || pool[i].opps.includes(pool[j].team.id))) j++;
    if (j >= pool.length) {
      j = i + 1;
      while (j < pool.length && used.has(j)) j++;
      if (j < pool.length) { used.add(i); used.add(j); pairs.push([pool[i], pool[j]]); }
      continue;
    }
    used.add(i); used.add(j);
    pairs.push([pool[i], pool[j]]);
  }
  return { pairs, leftovers: pool.filter((_, i) => !used.has(i)) };
}

function buildPairings(sw) {
  let carry = [];
  const all = [];
  const maxW = Math.min(sw.round - 1, 2);
  for (let w = maxW; w >= 0; w--) {
    const rec = [w, sw.round - 1 - w];
    const pool = carry.concat(sw.teams.filter((t) => t.status === 'in' && t.wins === rec[0] && t.losses === rec[1]));
    carry = [];
    if (!pool.length) continue;
    const { pairs, leftovers } = swissPairUp(pool);
    all.push(...pairs);
    carry = leftovers;
  }
  if (carry.length) {
    const pairedIds = new Set();
    for (const [a, b] of all) { pairedIds.add(a.team.id); pairedIds.add(b.team.id); }
    const rest = sw.teams.filter((t) => t.status === 'in' && !pairedIds.has(t.team.id));
    for (let i = 0; i + 1 < rest.length; i += 2) all.push([rest[i], rest[i + 1]]);
  }
  return all;
}

async function playSwissRoundAsync(sw, pool, seedBase, isQualifier, roundIdx) {
  sw.round++;
  const round = { n: sw.round, pairs: [] };
  const pairs = buildPairings(sw);
  const bo = sw.allBO3 ? 3 : (roundIdx <= 2 ? 1 : 3);
  const jobs = pairs.map(([a, b], i) => ({ a: a.team, b: b.team, bo, seed: (seedBase + sw.round * 7919 + i * 31) >>> 0 }));
  const res = await pool.execAll(jobs);
  pairs.forEach(([a, b], i) => {
    const r = res[i];
    const winner = r.winner === a.team.id ? a.team : b.team;
    if (winner.id === a.team.id) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    a.opps.push(b.team.id); b.opps.push(a.team.id);
    round.pairs.push({ a: a.team, b: b.team, winner, score: r.score, maps: r.maps, bo, played: true });
  });
  sw.rounds.push(round);
  if (!isQualifier) {
    for (const t of sw.teams) {
      if (t.status === 'in' && t.wins >= 3) t.status = 'adv';
      else if (t.status === 'in' && t.losses >= 3) t.status = 'elim';
    }
    sw.done = sw.teams.every((t) => t.status !== 'in');
  }
}

async function playPlayoffRoundAsync(st, pool, seedBase) {
  if (st.champion) return;
  const pf = st.playoff;
  const cur = pf.rounds[pf.round];
  if (!cur || !cur.pairs.length) return;
  const jobs = cur.pairs.map((m, i) => ({ a: m.a, b: m.b, bo: m.bo, seed: (seedBase + 99991 + pf.round * 313 + i * 17) >>> 0 }));
  const res = await pool.execAll(jobs);
  const wins = [];
  cur.pairs.forEach((m, i) => {
    const r = res[i];
    const winner = r.winner === m.a.id ? m.a : m.b;
    m.played = true; m.winner = winner; m.score = r.score; m.maps = r.maps;
    wins.push(winner);
  });
  if (wins.length === 1) { st.champion = wins[0]; return; }
  const nextPairs = [];
  for (let i = 0; i < wins.length; i += 2) {
    nextPairs.push({ a: wins[i], b: wins[i + 1], winner: null, score: null, maps: null, bo: 3, played: false });
  }
  const label = pf.round === 0 ? '半决赛' : '决赛';
  if (pf.round === 1) nextPairs[0].bo = 5;
  pf.rounds.push({ pairs: nextPairs, label });
  pf.round++;
}

function finalizeQualifier(st) {
  const ranked = st.qual.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  const adv = ranked.slice(0, 32).map((e) => e.team);
  st.qual.done = true;
  st.s1 = makeSwiss(adv.slice(16, 32).map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 1');
  st.s2 = makeSwiss(adv.slice(8, 16).map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 2');
  st.s3 = makeSwiss(adv.slice(0, 8).map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 3', true);
  st.stage = 's1';
}

function mergeStages(st, from, to) {
  const adv = from.teams.filter((t) => t.status === 'adv').map((e) => e.team);
  to.teams = to.teams.concat(adv.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })));
  st.stage = to === st.s2 ? 's2' : 's3';
}

function makePlayoff(st) {
  const adv = st.s3.teams.filter((t) => t.status === 'adv')
    .sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating)
    .map((e) => e.team);
  const qf = [[adv[0], adv[7]], [adv[3], adv[4]], [adv[2], adv[5]], [adv[1], adv[6]]]
    .map(([a, b]) => ({ a, b, winner: null, score: null, maps: null, bo: 3, played: false }));
  st.playoff = { rounds: [{ pairs: qf, label: '1/4 决赛' }], round: 0 };
  st.stage = 'playoff';
}

function collectMatch(m) {
  return {
    a: m.a.id, b: m.b.id, winner: m.winner ? m.winner.id : null,
    score: m.score, bo: m.bo, maps: m.maps, played: !!m.played
  };
}
function collectSwiss(sw) {
  if (!sw) return null;
  return {
    label: sw.label,
    rounds: sw.rounds.map((r) => ({ n: r.n, pairs: r.pairs.map(collectMatch) })),
    teams: sw.teams.map((t) => ({ id: t.team.id, w: t.wins, l: t.losses, status: t.status, opps: t.opps }))
  };
}

// ---------- 跑一届（每轮比赛并行） ----------
async function runOneMajor(idx, pool, baseSeed) {
  const seed = (baseSeed + idx * 0x9e3779b9) >>> 0;
  const teams = MAJOR_TEAMS.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p })) }))
    .sort((a, b) => b.rating - a.rating)
    .map((t, i) => ({ ...t, seed: i + 1 }));
  const st = {
    stage: 'qualifier',
    qual: makeSwiss(teams.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), '积分赛'),
    s1: null, s2: null, s3: null, playoff: null,
    user: teams[0], champion: null
  };
  let guard = 0;
  while (!st.champion && guard++ < 80) {
    if (st.stage === 'qualifier') {
      if (st.qual.round >= 5) { finalizeQualifier(st); continue; }
      await playSwissRoundAsync(st.qual, pool, seed, true, st.qual.round + 1);
    } else if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
      const sw = st[st.stage];
      if (sw.done) {
        if (st.stage === 's1') mergeStages(st, st.s1, st.s2);
        else if (st.stage === 's2') mergeStages(st, st.s2, st.s3);
        else makePlayoff(st);
        continue;
      }
      await playSwissRoundAsync(sw, pool, seed, false, sw.round + 1);
    } else if (st.stage === 'playoff') {
      await playPlayoffRoundAsync(st, pool, seed);
    }
  }
  const qualRanked = st.qual.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  return {
    majorIdx: idx, seed,
    champion: st.champion ? { id: st.champion.id, tag: st.champion.tag, name: st.champion.name } : null,
    finalScore: st.champion && st.playoff ? st.playoff.rounds[2].pairs[0].score || null : null,
    finalMaps: st.champion && st.playoff ? st.playoff.rounds[2].pairs[0].maps || null : null,
    qualRanking: qualRanked.map((e) => ({ id: e.team.id, w: e.wins, l: e.losses })),
    s1: collectSwiss(st.s1), s2: collectSwiss(st.s2), s3: collectSwiss(st.s3),
    playoff: st.playoff ? st.playoff.rounds.map((r) => ({ label: r.label, pairs: r.pairs.map(collectMatch) })) : null,
    user: { id: st.user.id, tag: st.user.tag }
  };
}

// ---------- 主流程 ----------
const pool = new Pool(PAR);
const baseSeed = (Date.now() >>> 0) ^ 0x5f3759df;
const results = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  results.push(await runOneMajor(i, pool, baseSeed));
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`完成 ${i + 1}/${N} | 用时 ${el}s | 冠军: ${results[i].champion ? results[i].champion.tag : '?'}`);
}
await pool.close();

writeFileSync(root + 'docs/artifacts/major-real-results.json', JSON.stringify(results, null, 1));
console.log(`\n完成！${N} 届真实引擎 Major（MR${MR}，${PAR} 并行轮内分发）总用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const champCount = {};
for (const r of results) if (r.champion) champCount[r.champion.tag] = (champCount[r.champion.tag] || 0) + 1;
console.log('冠军分布:', Object.entries(champCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('完整赛果: docs/artifacts/major-real-results.json');
