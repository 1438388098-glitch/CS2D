import {
  loadDuel, resetDuel, setStorage, getState, recordResult, save, __clearStateForTest,
  getOpponents, getStats, pickDuelMap, unlockedDuelMaps
} from '../src/duel.js';
import { createGame, startMatch, finishMatch } from '../src/game.js';
import { ROUND } from '../src/config.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('duel: ' + name + ' FAIL');
  console.log('duel: ' + name + ' PASS');
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

const store = fakeStorage();
setStorage(store);

let s = resetDuel();
ok('duel save persisted', store.map.has('cs2d_duel'));
ok('duel opponents', getOpponents().length >= 8);
ok('duel map auto rotates within unlocked pool', pickDuelMap('auto', 0, 0) === 'duel-pit' && pickDuelMap('auto', 1, 0) === 'duel-alley');
ok('duel maps unlock every 3 wins', unlockedDuelMaps(0).length === 2 && unlockedDuelMaps(3).length === 3 && pickDuelMap('auto', 2, 3) === 'duel-forge');
ok('duel manual locked map falls back to latest unlocked', pickDuelMap('duel-forge', 0, 0) === 'duel-alley' && pickDuelMap('duel-forge', 0, 3) === 'duel-forge');
{
  const all = unlockedDuelMaps(999);
  ok('duel map auto fallback unknown id', pickDuelMap('missing', 5, 999) === all[5 % all.length].id);
}
recordResult(s, true, 10, 5);
recordResult(s, false, 4, 9);
ok('duel stats', s.stats.played === 2 && s.stats.w === 1 && s.stats.l === 1 && s.stats.streak === 0 && s.stats.bestStreak === 1);

s = resetDuel();
s.stats.played = 7;
save();
__clearStateForTest();
const loaded = loadDuel();
ok('duel save load', loaded.stats.played === 7);
store.map.set('cs2d_duel', '{bad');
__clearStateForTest();
const rebuilt = loadDuel();
ok('duel corrupt rebuild', rebuilt.stats.played === 0 && store.map.has('cs2d_duel_backup'));

s = resetDuel();
const live = createGame({ mode: 'duel' });
live.ui = null;
live.seed = 20260803;
live.opts.mode = 'duel';
live.opts.duelOpponent = 'ZywOo';
startMatch(live);
ok('duel live start', !!live.duelMatch && live.entities.length === 2 && live.state === 'BUY');
ok('duel live auto map', live.duelMatch.mapId === 'duel-pit' && live.opts.mapId === 'duel-pit');
live.player.team = 't';
live.score.T = ROUND.MATCH_WIN;
finishMatch(live);
ok('duel live settled', live.duelMatch.settled && s.stats.played === 1 && s.stats.w === 1);

console.log('duel: all PASS');
