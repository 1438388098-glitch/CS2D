import {
  loadRanked, resetRanked, setStorage, setRng, getState, tierOf, simulateRankedMatch,
  applyRankedResult, rankedEndMatch, save, __clearStateForTest
} from '../src/ranked.js';
import { createGame, startMatch } from '../src/game.js';
import { ROUND } from '../src/config.js';
import { installStubs, registerDomIds } from './stubdom.js';
import { initRankedUi, openRanked } from '../src/ranked-ui.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('ranked: ' + name + ' FAIL');
  console.log('ranked: ' + name + ' PASS');
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
setRng(() => 0.5);

let s = resetRanked();
ok('ranked save persisted', store.map.has('cs2d_ranked'));
ok('placement starts at 5', s.player.placement.left === 5 && s.player.mmr === 0);
ok('tier ladder', tierOf(1500).label === '铂金');

for (let i = 0; i < 5; i++) {
  const r = simulateRankedMatch();
  ok('placement match', r.ok);
}
ok('placement complete', s.player.mmr > 0 && s.player.placement.left === 0 && s.player.stats.played === 5);

const mmrBefore = s.player.mmr;
const res = applyRankedResult(s, { win: true, kills: 10, deaths: 4, mvp: true, oppMmr: mmrBefore + 50, oppName: 'NAVI', mapId: 'dust2', score: [9, 4] });
ok('regular mmr changed', res.delta !== 0 && s.player.mmr !== mmrBefore);
ok('history cap', s.player.history.length <= 20);

s = resetRanked();
s.player.mmr = 1500;
s.player.placement.left = 0;
s.player.stats.lossStreak = 0;
const loss1 = applyRankedResult(s, { win: false, kills: 1, deaths: 5, mvp: false, oppMmr: 1500, oppName: 'NAVI', mapId: 'dust2', score: [4, 9] });
const loss2 = applyRankedResult(s, { win: false, kills: 1, deaths: 5, mvp: false, oppMmr: 1500, oppName: 'NAVI', mapId: 'dust2', score: [4, 9] });
const loss3 = applyRankedResult(s, { win: false, kills: 1, deaths: 5, mvp: false, oppMmr: 1500, oppName: 'NAVI', mapId: 'dust2', score: [4, 9] });
ok('loss streak tracked', s.player.stats.lossStreak === 3);
ok('loss protection reduces third loss', loss3.lossProtect && loss3.delta > loss1.delta);

s = resetRanked();
s.player.mmr = 1300;
s.player.placement.left = 0;
save();
__clearStateForTest();
const loaded = loadRanked();
ok('save load roundtrip', loaded.player.mmr === 1300);
store.map.set('cs2d_ranked', '{bad');
__clearStateForTest();
const rebuilt = loadRanked();
ok('corrupt rebuild', rebuilt.player.mmr === 0 && store.map.has('cs2d_ranked_backup'));

s = resetRanked();
const live = createGame({ mode: 'ranked' });
live.ui = null;
live.seed = 20260803;
live.opts.mode = 'ranked';
startMatch(live);
ok('ranked live start', !!live.rankedMatch && live.entities.length === 9 && live.state === 'BUY');
live.player.team = 't';
live.score.T = ROUND.MATCH_WIN;
const endRes = rankedEndMatch(live);
ok('ranked live end', endRes.ok && live.rankedMatch.settled && s.player.stats.played === 1);

installStubs();
registerDomIds('rankedPanel');
const fakeGame = { opts: { mode: 'ranked' }, ui: { showToast: () => {}, showMenu: () => {}, hideEnd: () => {} } };
initRankedUi(document, fakeGame);
openRanked();
const panelHtml = document.getElementById('rankedPanel').innerHTML;
ok('ranked ui renders', panelHtml.includes('排位赛') && panelHtml.includes('下一场排位'));

console.log('ranked: all PASS');
