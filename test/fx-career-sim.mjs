import {
  resetCareer, setStorage, setRng, teamProfile, simulateCareerMatch, simulatePlayerMatch, matchDetail, getState, nextMatch, careerDifficultyFor
} from '../src/career.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('fx-career-sim: ' + name + ' FAIL');
  console.log('fx-career-sim: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map
  };
}

setStorage(fakeStorage());
setRng(() => 0.42);

const s = resetCareer();
const home = teamProfile(s, 'player');
const away = teamProfile(s, 't1');
const result = simulateCareerMatch(home, away, { mapId: away.homeMap });
const totalDeaths = result.players.reduce((a, p) => a + p.deaths, 0);
ok('match winner decided', result.winner === home.id || result.winner === away.id);
ok('match score reaches five', (result.score[0] === 5 || result.score[1] === 5) && result.score[0] >= 0 && result.score[1] >= 0);
ok('rounds match score sum', result.rounds.length === result.score[0] + result.score[1]);
ok('round timeline structured', result.rounds.every((r) => r.events.length >= 4 && r.site && r.tactic) && result.timeline.length >= result.rounds.length * 4);
ok('sim halves structured', result.rounds.every((r) => r.half === 1 || r.half === 2) && result.rounds.filter((r) => r.half === 1).length <= 5);
ok('sim side swap after half', result.rounds.length <= 5 || result.rounds[5].attacker === away.id);
ok('sim event types', result.timeline.some((e) => e.t === 'opening') && result.timeline.some((e) => e.t === 'duel') && result.timeline.some((e) => e.t === 'site_control') && result.timeline.some((e) => e.t === 'round_end'));
ok('mvp and player stats', result.mvp && result.mvp.name && result.players.length > 0);
ok('kill death balance', result.totalKills === totalDeaths);
ok('league baked into result', result.league === '乙级' && result.mapId);
ok('career difficulty by league', careerDifficultyFor('丙级', 65) === 'easy' && careerDifficultyFor('乙级', 75) === 'normal' && careerDifficultyFor('甲级', 85) === 'hard');
ok('career difficulty by opponent', careerDifficultyFor('丙级', 86) === 'hard' && careerDifficultyFor('乙级', 88) === 'hard');

setRng(() => 0.42);
const s2 = resetCareer();
const playerSim = simulatePlayerMatch();
ok('player sim uses engine', playerSim.ok && Array.isArray(playerSim.rounds) && playerSim.rounds.length >= 5 && Array.isArray(playerSim.timeline));
ok('player sim derives stats', typeof playerSim.kills === 'number' && typeof playerSim.deaths === 'number' && typeof playerSim.dmg === 'number' && typeof playerSim.mvp === 'boolean');
const lastHistory = getState().matchHistory[getState().matchHistory.length - 1];
ok('player history from engine', lastHistory && lastHistory.kills === playerSim.kills && lastHistory.deaths === playerSim.deaths && lastHistory.dmg === playerSim.dmg);
ok('player history persists replay', lastHistory && Array.isArray(lastHistory.rounds) && Array.isArray(lastHistory.timeline) && Array.isArray(lastHistory.players) && lastHistory.rounds.length >= 5);
const detail = matchDetail(lastHistory);
ok('match detail exposes replay', detail && detail.rounds.length === lastHistory.rounds.length && detail.timeline.length === lastHistory.timeline.length);

setRng(() => 0.5);
const fresh = resetCareer();
fresh.player.fatigue = 0;
fresh.team.morale = 100;
fresh.player.form = Array.from({ length: 5 }, (_, i) => ({ win: true, kills: 12 + i, deaths: 5 }));
const goodStateSim = simulatePlayerMatch();
const tired = resetCareer();
tired.player.fatigue = 90;
tired.team.morale = 20;
tired.player.form = Array.from({ length: 5 }, (_, i) => ({ win: false, kills: 4, deaths: 14 - i }));
const badStateSim = simulatePlayerMatch();
ok('player state affects simulation', goodStateSim.win !== badStateSim.win || goodStateSim.kills !== badStateSim.kills);

const dyn = resetCareer();
const dynOppId = (() => {
  const nm = nextMatch(dyn);
  return nm && nm.home === 'player' ? nm.away : (nm ? nm.home : null);
})();
const dynOppBefore = dyn.season.teams.find((t) => t.id === dynOppId);
const dynFormBefore = dynOppBefore.form.length;
const dynMoraleBefore = dynOppBefore.morale;
const dynRatingBefore = dynOppBefore.rating;
simulatePlayerMatch();
const dynOppAfter = getState().season.teams.find((t) => t.id === dynOppId);
ok('opponent dynamic state updates', dynOppAfter.form.length === dynFormBefore + 1 && dynOppAfter.morale !== dynMoraleBefore && dynOppAfter.rating !== dynRatingBefore && !!dynOppAfter.recentForm);
const otherFormAfter = getState().season.teams.filter((t) => t.id !== 'player' && t.id !== dynOppId).some((t) => t.form.length === dynFormBefore + 1);
ok('non-player league state updates', otherFormAfter);

console.log('fx-career-sim: all PASS');
