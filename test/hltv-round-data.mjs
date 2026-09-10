// HLTV Round1 审查修复测试：KAST 阵亡名单 / 动态锚点 / 队伍表 / 旧公式统一 / 回合日志。
// 契约：
//   deriveRoundParticipation —— 败方回合按 r.casualties 名单判定存活；无名单回退旧口径；
//                               胜方回合恒 roundsWon++。
//   legacyMvpScore —— kills*2 + dmg/100 + plants + defuses + clutches*2（降级路径统一口径，
//                     修复 a 项误引 b.defuses/b.clutches 的复制粘贴笔误）。
//   collectPlayerTeams —— 姓名 -> teamId（玩家 roster → 'player'，AI roster → 队 id）。
//   anchorsForRating/leagueAnchors —— 锚随联赛中位 rating 线性缩放，KAST 锚恒 0.6；
//                                     computePlayerHltv 标量 baseline 与 anchors(60) 完全一致。
//   recordRoundResult —— 写 game.roundLog：{winner, casualties(本回合阵亡实体名)}；懒初始化。
//   simulateManagerMatch —— 集成：deaths 总数 === casualties 总数；参与度 ≤ 回合数。
import assert from 'node:assert/strict';
import {
  deriveRoundParticipation,
  legacyMvpScore,
  collectPlayerTeams,
  computePlayerHltv
} from '../src/hltv-rating.js';
import { anchorsForRating, BASE_ANCHORS, leagueAnchors } from '../src/hltv-baseline.js';
import { recordRoundResult } from '../src/ai/roles.js';
import { simulateManagerMatch, setRng } from '../src/manager.js';

// ---- deriveRoundParticipation：casualties 判存活 + 回退 ----
{
  const ps = { name: 'alice', team: 'player' };
  const rounds = [
    { round: 1, winner: 'player', casualties: ['bob'] },
    { round: 2, winner: 'opp', casualties: ['alice'] },
    { round: 3, winner: 'opp', casualties: ['bob'] },
    { round: 4, winner: 'opp' }
  ];
  const r = deriveRoundParticipation(ps, rounds);
  assert.equal(r.roundsWon, 1, 'won round counted');
  assert.equal(r.roundsSurvived, 2, 'died in round2 (excluded), survived round3+round4(fallback)');

  const legacy = deriveRoundParticipation(ps, [{ winner: 'opp' }, { winner: 'opp' }]);
  assert.equal(legacy.roundsSurvived, 2, 'no casualties -> legacy all-survived');
  assert.deepEqual(deriveRoundParticipation(ps, null), { roundsWon: 0, roundsSurvived: 0 }, 'null rounds safe');
}

// ---- legacyMvpScore：权重口径与 a/b 独立（E1 回归钉）----
{
  assert.equal(legacyMvpScore({ kills: 10, dmg: 200, plants: 1, defuses: 2, clutches: 3 }), 20 + 2 + 1 + 2 + 6, 'exact weights');
  // 只差 defuses 的两名选手：a 项必须用自己的 defuses（旧笔误会让 a 项引用 b 的）
  const a = { kills: 5, dmg: 100, plants: 0, defuses: 0, clutches: 0 };
  const b = { kills: 5, dmg: 100, plants: 0, defuses: 3, clutches: 0 };
  assert.ok(legacyMvpScore(b) > legacyMvpScore(a), 'defuses count toward score');
  const sorted = [a, b].slice().sort((x, y) => legacyMvpScore(y) - legacyMvpScore(x));
  assert.equal(sorted[0], b, 'higher defuses ranks first');
  assert.equal(legacyMvpScore(null), 0, 'null safe');
}

// ---- collectPlayerTeams ----
{
  const state = {
    team: { roster: [{ name: 'P1' }, { name: 'P2' }] },
    season: { teams: [{ id: 't1', roster: [{ name: 'A1' }] }, { id: 't2', roster: [{ name: 'A2' }, {}] }] }
  };
  const map = collectPlayerTeams(state);
  assert.equal(map.P1, 'player', 'player roster -> player');
  assert.equal(map.A1, 't1', 'ai roster -> team id');
  assert.equal(map.A2, 't2', 'ai roster -> team id');
  assert.equal(map['missing'], undefined, 'unknown name absent');
  assert.deepEqual(collectPlayerTeams(null), {}, 'null state safe');
}

// ---- 动态锚点（A）----
{
  const a60 = anchorsForRating(60);
  assert.deepEqual(a60, BASE_ANCHORS, 'median 60 anchors == base');
  const a84 = anchorsForRating(84);
  assert.ok(Math.abs(a84.kpr - 0.65 * 1.4) < 1e-9, 'kpr scales linearly');
  assert.ok(Math.abs(a84.adr - 80 * 1.4) < 1e-9, 'adr scales linearly');
  assert.equal(a84.kast, 0.6, 'kast anchor constant');
  assert.ok(a84.impact > BASE_ANCHORS.impact, 'impact scales');

  // 标量 baseline 与 anchors 等价（向后兼容路径）
  const stats = { name: 'x', team: 't', kills: 8, deaths: 5, dmg: 90, clutches: 1, roundsWon: 6, roundsSurvived: 4 };
  const attrs = {};
  const viaScalar = computePlayerHltv(stats, attrs, { rounds: [{}, {}, {}, {}, {}], baseline: 60 });
  const viaAnchors = computePlayerHltv(stats, attrs, { rounds: [{}, {}, {}, {}, {}], anchors: anchorsForRating(60) });
  assert.deepEqual(viaScalar, viaAnchors, 'scalar baseline == anchors(60)');

  // 联赛锚语义：恰好是甲级(中位 84)平均水平的单场表现 → 在甲级 rating ≈ 1.00，
  // 同一表现放到乙级(锚 60)会被判为远超平均（多项封顶 1.5）
  const anchorStats = {
    name: 'med', team: 't',
    kills: +(0.91 * 5).toFixed(4), deaths: +(0.91 * 5).toFixed(4), dmg: +(112 * 5).toFixed(4),
    clutches: 0.3675, roundsWon: 2, roundsSurvived: 1
  };
  const inLeague = computePlayerHltv(anchorStats, {}, { rounds: [{}, {}, {}, {}, {}], anchors: anchorsForRating(84) });
  const inWeak = computePlayerHltv(anchorStats, {}, { rounds: [{}, {}, {}, {}, {}], anchors: anchorsForRating(60) });
  assert.ok(Math.abs(inLeague.total - 1) <= 0.01, 'league-median stats rate ~1.00 in own league, got ' + inLeague.total);
  assert.ok(inWeak.total > 1.2, 'same stats rate far above 1.00 in weaker league, got ' + inWeak.total);

  // leagueAnchors 取联赛中位：[70,74,74,74,74,74] 中位 = 74
  const st = { team: { league: '乙级', roster: [{ rating: 70 }] }, season: { teams: [{ id: 't1', rating: 74, roster: [] }] } };
  const la = leagueAnchors(st, '乙级');
  assert.deepEqual(la, anchorsForRating(74), 'league anchors from median rating');
}

// ---- recordRoundResult 回合日志 ----
{
  const game = {
    entities: [
      { name: 'alive1', dead: false },
      { name: 'dead1', dead: true },
      { name: 'dead2', dead: true }
    ],
    tAttackSite: 'A',
    adaptive: { T: { siteWins: { A: 0, B: 0 }, siteAttempts: { A: 0, B: 0 }, rushWins: 0, rushAttempts: 0, execWins: {}, execAttempts: {} }, CT: { pushWins: 0, pushAttempts: 0, siteWins: { A: 0, B: 0 }, siteDefends: { A: 0, B: 0 }, rotateWins: 0, rotateAttempts: 0, defuseWins: 0, defuseAttempts: 0 } }
  };
  recordRoundResult(game, 't', 'bomb');
  assert.equal(game.roundLog.length, 1, 'log entry written');
  assert.equal(game.roundLog[0].winner, 't', 'winner recorded');
  assert.deepEqual(game.roundLog[0].casualties, ['dead1', 'dead2'], 'casualties = dead entities this round');

  const bare = { entities: [] };
  recordRoundResult(bare, 'ct', 'timeout');
  assert.equal(bare.roundLog.length, 1, 'lazy init roundLog');
  assert.deepEqual(bare.roundLog[0].casualties, [], 'no entities -> empty casualties');
}

// ---- simulateManagerMatch 集成：阵亡名单贯通 + 参与度上限 ----
{
  setRng(() => 0.5);
  const mkRoster = (prefix, rating) => ['突破', '狙击', '指挥', '步枪', '自由人'].map((role, i) => ({ name: prefix + '-' + role + i, role, rating, attrs: {} }));
  const mkTeam = (id, name, rating) => ({ id, name, rating, league: '乙级', form: [], morale: 50, homeMap: 'dust2', roster: mkRoster(id, rating) });
  const home = mkTeam('t1', 'Home', 75);
  const away = mkTeam('t2', 'Away', 75);
  const s = { team: { league: '乙级', roster: home.roster }, season: { teams: [home, away], cup: { phase: 'idle' } } };
  const m = simulateManagerMatch(s, home, away, { state: s, mapId: 'dust2' });

  assert.ok(m.rounds.length >= 5, 'match played to win limit');
  assert.ok(m.rounds.every((r) => Array.isArray(r.casualties)), 'every round carries casualties');

  const casualtyTotal = m.rounds.reduce((sum, r) => sum + r.casualties.length, 0);
  const deathTotal = m.players.reduce((sum, p) => sum + (p.deaths || 0), 0);
  assert.equal(deathTotal, casualtyTotal, 'sim deaths == logged casualties');

  const maxRounds = m.rounds.length;
  assert.ok(m.players.every((p) => (p.roundsWon || 0) + (p.roundsSurvived || 0) <= maxRounds), 'participation <= rounds');
  const diedSomewhere = m.players.some((p) => (p.deaths || 0) > 0);
  assert.ok(diedSomewhere, 'rng=0.5 deterministic match has duels');

  const withHltv = m.players.every((p) => p.hltv && typeof p.hltv.total === 'number');
  assert.ok(withHltv, 'all players carry hltv');
  assert.ok(m.mvp && m.mvp.hltv, 'mvp picked by hltv');
}

console.log('hltv-round-data: all PASS');
