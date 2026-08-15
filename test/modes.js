import '../src/modes.js';
import '../src/career.js';
import '../src/duel.js';
import { CYBER_ROSTER, CYBER_START_COINS, CYBER_BAILOUT_COINS, MODE_MAPS, cyberCoins, cyberBailoutIfBroke, cyberChance, cyberPayout, MAJOR_TEAMS, majorAction } from '../src/modes.js';
import { getMapDef, getMode, getModes } from '../src/registry.js';
import { createGame, startMatch, update } from '../src/game.js';
import { getMap, loadMap } from '../src/map.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('modes: ' + name + ' FAIL');
  console.log('modes: ' + name + ' PASS');
};

const ids = [...getModes().keys()];
for (const id of ['classic', 'major', 'cyber', 'lan', 'editor', 'career', 'duel']) {
  ok('registered ' + id, ids.includes(id));
}
ok('mode maps include forge', MODE_MAPS.includes('forge'));
const forgeDef = getMapDef('forge');
ok('forge registered', !!forgeDef && forgeDef.rows.length === 52);
if (forgeDef) {
  const forgeDiag = loadMap(forgeDef);
  ok('forge connected', forgeDiag.unreachable.length === 0 && forgeDiag.walkableCount > 1000);
}

const g4 = createGame({ mode: 'major', seed: 1 });
g4.ui = null; g4.seed = 1; g4.opts.teamMajor = 'g2';
getMode('major').start(g4);
ok('major qualifier', g4.state === 'MAJOR' && g4.major.stage === 'qualifier' && g4.major.qual.teams.length === 48 && MAJOR_TEAMS.length === 48);
ok('major user team', g4.major.user.tag === 'G2');

const allReal = MAJOR_TEAMS.every((t) => t.players.length === 5 && t.players.every((p) => p.name && p.role && p.aim > 0 && p.movement > 0 && p.clutch > 0 && p.nade > 0));
ok('major 48 teams x 5 players', allReal);

// 完整跑一届：预选 5 轮 → Stage1/2/3 瑞士轮 → 8 强淘汰 → 冠军
// （用户比赛不会被自动模拟，需手动处理：模拟整轮后若有待处理比赛则模拟本场）
{
  let guard = 0;
  while (!g4.major.champion && guard++ < 120) {
    majorAction(g4, 'simRound');
    if (g4.major.champion) break;
    const st = g4.major;
    let hasPending = false;
    if (st.stage === 'qualifier') {
      const last = st.qual.rounds[st.qual.rounds.length - 1];
      hasPending = !!last && last.pairs.some((p) => p.userPending && !p.played);
    } else if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
      const sw = st[st.stage];
      const last = sw.rounds[sw.rounds.length - 1];
      hasPending = !!last && last.pairs.some((p) => p.userPending && !p.played);
    } else if (st.stage === 'playoff') {
      const cur = st.playoff && st.playoff.rounds[st.playoff.round];
      hasPending = !!cur && cur.pairs.some((p) => p.userPending && !p.played);
    }
    if (hasPending) majorAction(g4, 'simMine');
  }
  const st = g4.major;
  ok('major full run', !!st.champion && st.qual.done);
  ok('major stages', !!st.s1 && !!st.s2 && !!st.s3 && st.s1.done && st.s2.done && st.s3.done);
  const s1adv = st.s1.teams.filter((t) => t.status === 'adv').length;
  const s2adv = st.s2.teams.filter((t) => t.status === 'adv').length;
  const s3adv = st.s3.teams.filter((t) => t.status === 'adv').length;
  ok('major swiss adv 8/8/8', s1adv === 8 && s2adv === 8 && s3adv === 8);
  const qRanked = st.qual.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  ok('major qualifier top32', qRanked[0].wins >= 3 && qRanked[31].wins >= qRanked[32].wins);
}

const cyA = CYBER_ROSTER[0];
const cyB = CYBER_ROSTER[5];
const cyCh = cyberChance(cyA, cyB);
ok('cyber odds', cyCh >= 0.2 && cyCh <= 0.8);
ok('cyber payout', cyberPayout(100, cyCh) >= 1 && cyberPayout(100, 0.5) > 100);
ok('cyber initial coins', cyberCoins() === CYBER_START_COINS && CYBER_START_COINS === 1000 && CYBER_BAILOUT_COINS >= 100);
{
  const savedLS = globalThis.localStorage;
  const fake = new Map();
  globalThis.localStorage = { getItem: (k) => fake.has(k) ? fake.get(k) : null, setItem: (k, v) => fake.set(k, String(v)), removeItem: (k) => fake.delete(k) };
  fake.set('cs2d_ai_duel_coins', '0');
  ok('cyber no bailout on read', cyberCoins() === 0);
  cyberBailoutIfBroke();
  ok('cyber bailout at settlement', cyberCoins() === CYBER_BAILOUT_COINS && JSON.parse(fake.get('cs2d_ai_duel_stats') || '{}').bailouts === 1);
  globalThis.localStorage = savedLS;
}

const g5 = createGame({ mode: 'cyber', seed: 42 });
g5.ui = null; g5.seed = 42;
g5.opts.cyber = { leftId: 'navi', rightId: 'g2', mapId: 'dust2', bet: 50, side: 'left' };
startMatch(g5);
ok('cyber entities', !!g5.cyber && g5.cyber.match && g5.entities.filter((e) => e.bot).length === 10 && (g5.state === 'BUY' || g5.state === 'LIVE') && g5.player.dead && g5.entities.every((e) => e.bot));
ok('cyber map connected', getMap().diagnostics.unreachable.length === 0);
ok('cyber tactics', g5.entities.filter((e) => e.bot).every((e) => e.aiParams && e.aiParams.tacticalStyle));
for (let i = 0; i < 10; i++) update(g5, 1 / 30);
ok('cyber camera', Number.isFinite(g5.camX) && Number.isFinite(g5.camY) && g5.zoom === 0.75);
ok('cyber spectator', g5.player.dead && !g5.entities.includes(g5.player));
{
  const roundBefore = g5.round;
  g5.cyber.skip = true;
  for (let i = 0; i < 10; i++) update(g5, 1 / 30);
  ok('cyber skip advances', g5.round > roundBefore && (g5.state === 'BUY' || g5.state === 'LIVE') && !g5.cyber.skip);
  g5.cyber.speed = 8;
  ok('cyber speed stored', g5.cyber.speed === 8);
}
g5.cyber.scoreLimit = 1;
for (let i = 0; i < 6000 && !g5.cyber.ended; i++) update(g5, 1 / 30);
ok('cyber ended', !!g5.cyber && g5.cyber.ended && g5.cyber.time > 0);
ok('cyber battle', !!g5.cyber.left.tag && !!g5.cyber.right.tag && !g5.entities.some((e) => e.cricket));
{
  const g6 = createGame({ mode: 'cyber', seed: 99 });
  g6.ui = null; g6.seed = 99;
  g6.opts.mode = 'cyber';
  g6.opts.cyber = { leftId: 'navi', rightId: 'g2', mapId: 'dust2', bet: 50, side: 'left' };
  startMatch(g6);
  g6.score.T = 0; g6.score.CT = 0; g6.round = 10;
  g6.cyber.skip = false;
  update(g6, 1 / 30);
  ok('cyber tie no fake win', !g6.cyber.ended);
  g6.score.T = 1;
  update(g6, 1 / 30);
  ok('cyber lead ends', !!g6.cyber.ended);
}

{
  const savedLS = globalThis.localStorage;
  const fake = new Map();
  globalThis.localStorage = {
    getItem: (k) => fake.has(k) ? fake.get(k) : null,
    setItem: (k, v) => fake.set(k, String(v)),
    removeItem: (k) => fake.delete(k)
  };
  fake.set('cs2d_ai_duel_coins', '1000');
  const g7 = createGame({ mode: 'cyber', seed: 7 });
  g7.ui = null; g7.seed = 7;
  g7.opts.mode = 'cyber';
  g7.opts.cyber = { leftId: 'navi', rightId: 'g2', mapId: 'dust2', bet: 50, side: 'left' };
  startMatch(g7);
  g7.score.T = 0; g7.score.CT = 0; g7.round = 13;
  g7.cyber.skip = false;
  update(g7, 1 / 30);
  ok('cyber draw refunds', !!g7.cyber.ended && fake.get('cs2d_ai_duel_coins') === '1000');
  globalThis.localStorage = savedLS;
}

console.log('modes: all PASS');
