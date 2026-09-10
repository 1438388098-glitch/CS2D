// career 仿真 team 字段归一回归测试（Round 1 E 修复钉）：simulateCareerMatch 输出的
// players 必须带 team（teamId 归一而来）、roundsWon/roundsSurvived 与 casualties 一致、
// mvp 携带 hltv；回合数据携带本回合阵亡名单。
import assert from 'node:assert/strict';
import { simulateCareerMatch } from '../src/career.js';

const mkTeam = (id, name, rating) => ({
  id, name, rating,
  lineup: ['突破', '狙击', '指挥', '步枪', '自由人'].map((role, i) => ({ name: id + '-' + role + i, role, rating }))
});

{
  const home = mkTeam('player', 'MyTeam', 75);
  const away = mkTeam('t3', 'Rival', 75);
  const m = simulateCareerMatch(home, away, { state: { team: { league: '乙级', roster: home.lineup }, season: { teams: [home, away] } } });

  assert.ok(m.rounds.length >= 5, 'match to win limit');
  assert.ok(m.rounds.every((r) => Array.isArray(r.casualties)), 'every round carries casualties');

  const casualtyTotal = m.rounds.reduce((sum, r) => sum + r.casualties.length, 0);
  const deathTotal = m.players.reduce((sum, p) => sum + (p.deaths || 0), 0);
  assert.equal(deathTotal, casualtyTotal, 'sim deaths == logged casualties');

  assert.ok(
    m.players.every((p) => typeof p.team === 'string' && p.team.length > 0),
    'every player has team (teamId normalized)'
  );
  assert.ok(
    m.players.every((p) => (p.roundsWon || 0) + (p.roundsSurvived || 0) <= m.rounds.length),
    'participation <= rounds'
  );
  assert.ok(m.players.every((p) => p.hltv && typeof p.hltv.total === 'number'), 'players carry hltv');
  assert.ok(m.mvp && m.mvp.hltv, 'mvp picked by hltv');
  const sides = new Set(m.players.map((p) => p.team));
  assert.ok(sides.has('player') && sides.size === 2, 'both sides present with correct domain');
}

console.log('career-sim-team: all PASS');
