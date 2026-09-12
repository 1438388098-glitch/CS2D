// 观战体验 + 存档安全（Round 1）契约测试。
// 契约：
//   deathCamTarget —— killCamT>0 且击杀者存活 → 锁定击杀者；击杀者死亡/倒计时结束 → 队友观战；
//                     玩家存活 → 玩家；cyber 模式在存活 bot 中选。
//   pickSpectateTarget —— 目标存活即锁定引用（列表收缩不跳镜）；目标死亡才按 spectateIdx 换人。
//   fpsSpectateInfo —— 不再限 fps 视角：俯视死亡观战同样返回目标信息。
//   存档备份 —— 主档损坏时优先从 BACKUP_KEY 恢复并回写主档；备份不可用才把坏档留底 + 新档。
//   配额反馈 —— setItem 抛错时 toast 一次（去重），写成功后复位；manager/career/duel 同语义。
import assert from 'node:assert/strict';
import { deathCamTarget, pickSpectateTarget } from '../src/game.js';
import { fpsSpectateInfo } from '../src/hud.js';
import { ctx } from '../src/ctx.js';
import {
  resetManager, setStorage as setMgrStorage, setRng as setMgrRng,
  __clearManagerStateForTest, loadManager, save as mgrSave, SAVE_KEY, BACKUP_KEY as MGR_BACKUP
} from '../src/manager.js';
import {
  newDuelState, setStorage as setDuelStorage, __clearStateForTest as clearDuel,
  loadDuel
} from '../src/duel.js';
import {
  newCareerState, setStorage as setCareerStorage, setRng as setCareerRng,
  __clearStateForTest as clearCareer, loadCareer, SAVE_KEY as CAREER_KEY, BACKUP_KEY as CAREER_BACKUP
} from '../src/career.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map
  };
}
function throwingStorage() {
  return { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
}

// ---- deathCamTarget / pickSpectateTarget ----
{
  const killer = { name: 'killer', dead: false, x: 100, y: 100 };
  const mateA = { name: 'A', team: 'ct', dead: false };
  const mateB = { name: 'B', team: 'ct', dead: false };
  const g = {
    player: { dead: true, team: 'ct' },
    killCamT: 0.5,
    lastKiller: killer,
    entities: [mateA, mateB],
    cyber: null,
    spectateIdx: 0,
    _specTarget: null
  };
  assert.equal(deathCamTarget(g), killer, 'killcam locks live killer');
  g.lastKiller.dead = true;
  assert.equal(deathCamTarget(g), mateA, 'dead killer falls back to spectate');
  g.killCamT = 0;
  g.lastKiller.dead = false;
  assert.equal(deathCamTarget(g), mateA, 'expired killcam goes to spectate');
  g.player.dead = false;
  assert.equal(deathCamTarget(g), g.player, 'alive player is own target');

  // 目标稳定：锁定 A 后即使 spectateIdx 指向 B 也保持 A
  g.player.dead = true;
  g.killCamT = 0;
  const locked = pickSpectateTarget(g, [mateA, mateB]);
  assert.equal(locked, mateA, 'initial pick by idx');
  g.spectateIdx = 1;
  assert.equal(pickSpectateTarget(g, [mateA, mateB]), mateA, 'stable while alive');
  // 目标死亡：换人且更新锁定
  mateA.dead = true;
  const next = pickSpectateTarget(g, [mateB]);
  assert.equal(next, mateB, 'switch when target dies');
  assert.equal(g._specTarget, mateB, 'lock updated');
  // cyber 分支：bot 列表
  g.cyber = { ended: false };
  const bot = { name: 'bot', bot: true, dead: false };
  g.entities = [bot];
  assert.equal(deathCamTarget(g), bot, 'cyber spectates bots');
}

// ---- fpsSpectateInfo 不再限 fps（2D 死亡观战 HUD 数据源）----
{
  const { createGame, startMatch } = await import('../src/game.js');
  const g = createGame({ mapId: 'dust2', bots: 3, team: 'ct' });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  g.viewMode = 'top';
  g.player.dead = true;
  g.player.hp = 0;
  g.spectateIdx = 0;
  const info = fpsSpectateInfo(g);
  assert.ok(info && info.name && typeof info.weapon === 'string', 'top view gets spectate info');
}

// ---- manager：备份恢复 + 回写主档 + toast ----
{
  const toasts = [];
  const onToast = (t) => toasts.push(t);
  ctx.bus.on('toast', onToast);

  const store = fakeStorage();
  setMgrStorage(store);
  setMgrRng(() => 0.5);
  __clearManagerStateForTest();
  resetManager(); // 写入合法主档

  // 备份 = 好档（银行金额打标记），主档 = 坏 JSON
  const backupState = JSON.parse(store.getItem(SAVE_KEY));
  backupState.team.bank = 777777;
  store.setItem(MGR_BACKUP, JSON.stringify(backupState));
  store.setItem(SAVE_KEY, '{corrupt json!!');

  __clearManagerStateForTest();
  const s = loadManager();
  assert.equal(s.team.bank, 777777, 'manager restored from backup');
  assert.ok(store.getItem(SAVE_KEY).includes('777777'), 'main rewritten from backup');
  assert.ok(toasts.some((t) => /备份恢复/.test(t.text)), 'restore toast emitted');

  // 备份也不可用：坏主档留底 + 新档
  store.setItem(MGR_BACKUP, 'also bad');
  store.setItem(SAVE_KEY, '{"version":999}');
  __clearManagerStateForTest();
  const s2 = loadManager();
  assert.ok(s2 && s2.team.roster.length > 0, 'fresh manager when backup unusable');
  assert.equal(store.getItem(MGR_BACKUP), '{"version":999}', 'corrupt main kept for forensics');

  // 配额反馈：写失败 toast 一次（去重），成功后复位
  const before = toasts.length;
  setMgrStorage(throwingStorage());
  __clearManagerStateForTest();
  mgrSave(); // state 为 null 不写
  const s3 = loadManager(); // resetManager → save → 失败 → toast 1 次
  mgrSave(); // 再次失败，去重不再 toast
  assert.equal(toasts.length - before, 1, 'quota toast deduped');
  assert.ok(toasts[toasts.length - 1].text.includes('存储空间不足'), 'quota toast text');
  setMgrStorage(store);
  mgrSave(); // 成功，复位
  setMgrStorage(throwingStorage());
  mgrSave(); // 再失败 → 又 toast 一次
  assert.equal(toasts.length - before, 2, 'flag resets after success');
  setMgrStorage(store);
  ctx.bus.off ? ctx.bus.off('toast', onToast) : null;
}

// ---- duel：备份恢复 ----
{
  const store = fakeStorage();
  setDuelStorage(store);
  clearDuel();
  const good = newDuelState();
  good.stats.w = 12;
  good.stats.played = 20;
  store.setItem('cs2d_duel_backup', JSON.stringify(good));
  store.setItem('cs2d_duel', '{broken');
  clearDuel();
  const s = loadDuel();
  assert.equal(s.stats.w, 12, 'duel restored from backup');
  assert.equal(JSON.parse(store.getItem('cs2d_duel')).stats.w, 12, 'duel main rewritten');
}

// ---- career：备份恢复 ----
{
  const store = fakeStorage();
  setCareerStorage(store);
  setCareerRng(() => 0.5);
  clearCareer();
  const good = newCareerState();
  good.player.name = 'BACKUP-PROOF';
  store.setItem(CAREER_BACKUP, JSON.stringify(good));
  store.setItem(CAREER_KEY, '{{{');
  clearCareer();
  const s = loadCareer();
  assert.equal(s.player.name, 'BACKUP-PROOF', 'career restored from backup');
  assert.ok(store.getItem(CAREER_KEY).includes('BACKUP-PROOF'), 'career main rewritten');
}

console.log('spectate-save-safety: all PASS');
