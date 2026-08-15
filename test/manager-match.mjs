import { setStorage, setRng, newManagerCareer, getState } from '../src/manager.js';
import { getMode } from '../src/registry.js';
import { createGame, startMatch } from '../src/game.js';
import { mapManagerRosterToBots } from '../src/manager-match.js';
import '../src/manager-match.js';

const ok = (name, cond) => { if (!cond) throw new Error('manager-match: ' + name + ' FAIL'); console.log('manager-match: ' + name + ' PASS'); };

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}
setStorage(fakeStorage());
setRng(() => 0.5);

ok('mode registered', getMode('manager') && getMode('manager').id === 'manager');

let s = newManagerCareer();
const testBots = [{ aiParams: {} }, { aiParams: {} }, { aiParams: {} }, { aiParams: {} }, { aiParams: {} }];
const strong = s.team.roster.map((p) => ({ ...p, attrs: { ...p.attrs, aim: 99, react: 99 } }));
mapManagerRosterToBots(strong, testBots, s, 't');
ok('bots get aiParams', testBots.every((b) => b.aiParams && b.aiParams.react));
ok('strong aim -> tight spread', testBots[0].aiParams.spreadMult < 0.7);
ok('persona mapped', ['breacher', 'sniper', 'support', 'rifler', 'lurk'].includes(testBots[0].persona));
ok('names applied', testBots.every((b) => typeof b.name === 'string'));

const game = createGame({ mode: 'manager', team: 'ct', bots: 5, mapId: 'dust2', diff: 'hard' });
game.ui = null;
startMatch(game);
ok('manager match started', game.manager && game.entities.filter((e) => e.bot).length === 10);
ok('player is spectator', game.player && game.player.dead === true);
ok('state BUY', game.state === 'BUY');
