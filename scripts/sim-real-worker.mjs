// 真实引擎 Major 模拟 worker：完整赛程（48队预选→3级瑞士轮→淘汰赛）每场都是真实 5v5 AI 对局（MR5 短局）
import { parentPort, workerData } from 'node:worker_threads';
import { installStubs } from '../test/stubdom.js';
installStubs();

const { createGame, startMatch, update } = await import('../src/game.js');
const { majorAction, setMajorSim, MAJOR_TEAMS, teamDiffParams } = await import('../src/modes.js');
const { getMode } = await import('../src/registry.js');
const { seedWorld } = await import('../src/ctx.js');

const MAPS = ['dust2', 'canal', 'metro'];
const MAX_TICKS = 300000;

// 单张地图真实对局（MR 分制；T 侧按 seed 随机分配，避免强队恒定打劣势侧）
export function playRealMap(a, b, mapId, seed, mr) {
  const g = createGame({ team: 'ct', diff: 'hard', bots: 5, mapId, seed });
  g.ui = null;
  g.matchWin = mr || 5;
  g.otWin = (mr || 5) + 2;
  startMatch(g);
  g.player.dead = true;
  const aIsT = (((seed >>> 3) ^ (seed >>> 11)) & 1) === 0;
  const tTeam = aIsT ? a : b;
  const cTeam = aIsT ? b : a;
  const tP = teamDiffParams(tTeam);
  const cP = teamDiffParams(cTeam);
  for (const e of g.entities) {
    if (!e.bot) continue;
    const roster = e.team === 't' ? tTeam.players : cTeam.players;
    e.aiParams = e.team === 't' ? { ...tP } : { ...cP };
    e.name = roster[(e.anchorIdx || 0) % roster.length].name;
  }
  let lastRound = 1;
  for (let i = 0; i < MAX_TICKS; i++) {
    update(g, 1 / 30);
    if (g.over) break;
    if (g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
    if (g.round !== lastRound) {
      lastRound = g.round;
      if (g.score.T >= g.matchWin || g.score.CT >= g.matchWin) break;
      if (lastRound > 12) break;
    }
  }
  const tWon = g.score.T >= g.matchWin || (lastRound > g.matchWin && g.score.T > g.score.CT);
  const won = tWon ? tTeam : cTeam;
  const score = aIsT ? [g.score.T, g.score.CT] : [g.score.CT, g.score.T];
  return { winner: won, score };
}

// BO 系列赛（每图独立真实对局）
function playRealMatch(a, b, bo, seed, mr) {
  const need = Math.ceil(bo / 2);
  let wa = 0, wb = 0;
  const maps = [];
  let m = 0;
  while (wa < need && wb < need) {
    const r = playRealMap(a, b, MAPS[(seed + m) % MAPS.length], (seed * 7919 + m * 31) >>> 0, mr);
    maps.push(r.score);
    if (r.winner.id === a.id) wa++; else wb++;
    m++;
  }
  return { winner: wa >= need ? a : b, score: [wa, wb], maps, bo };
}

const isWorker = typeof workerData !== 'undefined' && workerData !== null;

// 模式 B：比赛执行器（主进程调度每轮比赛并行分发）
if (isWorker && workerData.mode === 'match') {
  parentPort.on('message', (job) => {
    if (!job || job.type !== 'play') return;
    const { id, a, b, bo, seed, mr } = job;
    const r = playRealMatch(a, b, bo, seed, mr || 1);
    parentPort.postMessage({ type: 'result', id, winner: r.winner.id, score: r.score, maps: r.maps, bo: r.bo });
  });
} else if (isWorker) {
  setMajorSim((a, b, bo) => playRealMatch(a, b, bo, workerData.runSeed ^ (a.seed * 131 + b.seed), workerData.mr || 1));

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

  // 跑一届完整 Major，返回完整赛果
  function runOneMajor(idx) {
    const seed = (workerData.baseSeed + idx * 0x9e3779b9) >>> 0;
    seedWorld(seed);
    const g = createGame({ mode: 'major', seed });
    g.ui = null;
    g.opts.teamMajor = 'spirit';
    getMode('major').start(g);
    let guard = 0;
    while (!g.major.champion && guard++ < 80) majorAction(g, 'simRound');
    const st = g.major;
    const qualRanked = st.qual.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
    return {
      majorIdx: idx,
      seed,
      champion: st.champion ? { id: st.champion.id, tag: st.champion.tag, name: st.champion.name } : null,
      finalScore: st.champion && st.playoff ? (st.playoff.rounds[2].pairs[0].score || null) : null,
      finalMaps: st.champion && st.playoff ? (st.playoff.rounds[2].pairs[0].maps || null) : null,
      qualRanking: qualRanked.map((e) => ({ id: e.team.id, w: e.wins, l: e.losses })),
      s1: collectSwiss(st.s1),
      s2: collectSwiss(st.s2),
      s3: collectSwiss(st.s3),
      playoff: st.playoff ? st.playoff.rounds.map((r) => ({ label: r.label, pairs: r.pairs.map(collectMatch) })) : null,
      user: { id: st.user.id, tag: st.user.tag, wins: st.wins, losses: st.losses }
    };
  }

  const { total, from } = workerData;
  const results = [];
  for (let i = 0; i < total; i++) {
    const idx = from + i;
    results.push(runOneMajor(idx));
    parentPort.postMessage({ type: 'progress', done: i + 1, total, lastChamp: results[i].champion });
  }
  parentPort.postMessage({ type: 'done', results });
}
