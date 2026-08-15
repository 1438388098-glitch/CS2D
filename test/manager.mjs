import { resetManager, loadManager, setStorage, setRng, getState, SAVE_KEY, BACKUP_KEY, VERSION, ROLE_WEIGHTS } from '../src/manager.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('manager: ' + name + ' FAIL');
  console.log('manager: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

let s = resetManager();
ok('save persisted', store.map.has(SAVE_KEY));
ok('version', s.version === VERSION);
ok('initial bank', s.team.bank === 12000);
ok('roster empty', Array.isArray(s.team.roster) && s.team.roster.length === 0);
ok('league 乙级', s.team.league === '乙级');
ok('board trust 70', s.board.trust === 70);
ok('6 roles weighted', Object.keys(ROLE_WEIGHTS).length === 6);
const wSum = Object.values(ROLE_WEIGHTS['突破']).reduce((a, b) => a + b, 0);
ok('role weights sum to 1', Math.abs(wSum - 1) < 0.001);

store.map.set(SAVE_KEY, '{corrupt');
s = loadManager();
ok('corrupt save backed up', store.map.has(BACKUP_KEY));
ok('corrupt save rebuilt', s.version === VERSION && s.team.bank === 12000);

console.log('manager: all PASS');
