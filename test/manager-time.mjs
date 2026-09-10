import { resetManager, setStorage, setRng, getState, __clearManagerStateForTest, save, VERSION, advanceDate, formatDate, isChristmasBreak, settlePlayerMatch, nextSeason, nextFixture, migrateManagerState } from '../src/manager.js';

const ok = (name, cond) => {
  if (!cond) throw new Error('time: ' + name + ' FAIL');
  console.log('time: ' + name + ' PASS');
};

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const store = fakeStorage();
setStorage(store);
setRng(() => 0.5);

// 1. 基础 time 字段
let s = resetManager();
ok('time field exists', s.time && typeof s.time === 'object');
ok('startISO 锚定 2026-01-05', s.time.startISO === '2026-01-05');
ok('currentISO 初始 = startISO', s.time.currentISO === s.time.startISO);
ok('lastPayrollISO 初始空', s.time.lastPayrollISO === '');
ok('seasonStartRound 初始 1', s.time.seasonStartRound === 1);

// 2. formatDate
ok('formatDate 1月5日 周一', formatDate(s) === '2026-01-05 周一');

// 3. advanceDate 加天
advanceDate(s, 3);
ok('advanceDate +3 → 2026-01-08', s.time.currentISO === '2026-01-08');
ok('formatDate 1月8日 周四', formatDate(s) === '2026-01-08 周四');

// 4. advanceDate 跨月触发 payroll
const bankBefore = s.team.bank;
advanceDate(s, 24); // 1/8 + 24 = 2/1
ok('跨月到 2026-02-01', s.time.currentISO === '2026-02-01');
ok('payroll 触发扣款 (bank 减少)', s.team.bank < bankBefore);
ok('lastPayrollISO 更新到 2026-02', s.time.lastPayrollISO === '2026-02');
ok('ledger 有月度发薪条目', s.team.ledger.some((l) => l.label && l.label.indexOf('月度发薪') === 0));

// 5. payroll 不重复触发
const bankMid = s.team.bank;
advanceDate(s, 1); // 2/2, 不应再扣
ok('payroll 同月不再触发', s.team.bank === bankMid);

// 6. 欠薪路径: 把银行清空, 下个月发薪应 trust -5
s.team.bank = 100;
const trustBefore = s.board.trust;
advanceDate(s, 28); // 2/2 + 28 = 3/2 (中间经过 3/1)
ok('到达 2026-03-02', s.time.currentISO === '2026-03-02');
ok('欠薪导致 trust 下降', s.board.trust < trustBefore || s.board.fired === true);
ok('bank 被清零', s.team.bank === 0);

// 7. 圣诞休赛期
s.time.currentISO = '2026-12-05';
ok('isChristmasBreak 12月返回 true', isChristmasBreak(s) === true);
s.time.currentISO = '2026-11-30';
ok('isChristmasBreak 11月返回 false', isChristmasBreak(s) === false);

// 8. nextSeason 跨年到下一年 1 月 5 号
__clearManagerStateForTest();
s = resetManager();
s.time.currentISO = '2026-12-15';
const next = nextSeason();
ok('nextSeason 后 currentISO = 2027-01-05', s.time.currentISO === '2027-01-05');
ok('nextSeason 后 seasonStartRound = 1', s.time.seasonStartRound === 1);

// 9. 圣诞休赛期 advanceSeason 不推 round (通过 settlePlayerMatch 间接验证)
__clearManagerStateForTest();
s = resetManager();
s.time.currentISO = '2026-12-10';
const roundBefore = s.season.round;
settlePlayerMatch(s, true, 20, 10); // 应该 +1 天到 12/11, 但 advanceSeason 被 isChristmasBreak 守卫
ok('圣诞期 settlePlayerMatch 仍推进日期', s.time.currentISO === '2026-12-11');
ok('圣诞期 round 不变', s.season.round === roundBefore);

// 10. settlePlayerMatch 在非圣诞期推日期
__clearManagerStateForTest();
s = resetManager();
const dateBefore = s.time.currentISO;
settlePlayerMatch(s, true, 20, 10);
ok('非圣诞期 settlePlayerMatch 推进 1 天', s.time.currentISO !== dateBefore);

// 11. 迁移兼容: 旧档没 time 字段
const oldParsed = { version: 1, team: { bank: 5000, roster: [], league: '乙级' }, season: { id: 1, round: 1 }, board: { trust: 70 }, history: [], news: [], achievements: [] };
const migrated = migrateManagerState(oldParsed);
ok('旧档迁移补 time 字段', migrated.time && migrated.time.currentISO === '2026-01-05');

console.log('time: all PASS');
