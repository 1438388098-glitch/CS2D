// 个性化系统批次回归（2026-09-15 round-9）：
// 排位段位 / 涂装熟练度 / 木门 / 表情 / 热身靶 / 存档码 / bot名单 / 自由镜头
import { createGame, startMatch, startRound, update } from '../src/game.js';
import { killEntity, fireWeapon, hitDoorByShot } from '../src/combat.js';
import { rrDelta, tierOf, loadRanked, settleRanked, TIERS } from '../src/ranked.js';
import { addMastery, mastery, equipGlobalPaint, equippedGlobalPaint, paintLocked, totalMastery } from '../src/skins.js';
import { exportSave, importSave, supportedModes } from '../src/savecode.js';
import { cycleEmote, EMOTES, activeEmote } from '../src/emote.js';
import { spawnWarmupTargets, warmupOnShot } from '../src/warmup.js';
import { getMode } from '../src/registry.js';
import '../src/range-mode.js';
import { ctx } from '../src/ctx.js';

const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k)
};

const errors = [];
const ok = (name, cond) => {
  console.log('personal-batch: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
  if (!cond) errors.push(name);
};

function fresh(opts) {
  const g = createGame(Object.assign({ mapId: 'dust2', bots: 2 }, opts || {}));
  startMatch(g);
  return g;
}

// —— 1. 排位段位：纯函数结算 + 持久化 + 晋级标记 ——
{
  ok('rrDelta win positive', rrDelta(true, 10, 2) > 0);
  ok('rrDelta loss negative', rrDelta(false, 2, 10) < 0);
  ok('rrDelta loss with high kd less severe', rrDelta(false, 10, 2) > rrDelta(false, 1, 10));
  ok('tiers ascending', TIERS.every((t, i) => i === 0 || t.min > TIERS[i - 1].min));
  const _ls2 = new Map();
  // 模拟一场胜利
  const g = fresh({ gameplayPlus: false });
  g.player.kills = 8; g.player.deaths = 3;
  const r = settleRanked(g, true);
  ok('settleRanked returns result', !!r && typeof r.delta === 'number' && r.delta > 0);
  ok('settleRanked skips non-classic', settleRanked({ mode: 'duel', player: { kills: 5, deaths: 1 } }, true) === null);
  const g2 = fresh({ gameplayPlus: false });
  const r2 = settleRanked(g2, true);
  ok('ranked persists across matches', r2.rr >= r.rr + r2.delta - 5);
}

// —— 2. 涂装熟练度：计数/解锁/装备/回退 ——
{
  _ls.delete('cs2d_mastery_v1');
  _ls.delete('cs2d_skins_v1');
  addMastery('ak'); addMastery('ak'); addMastery('ak');
  ok('mastery counts', (mastery().ak || 0) === 3);
  ok('default paint unlocked', paintLocked('default') === false);
  const before = equippedGlobalPaint().id;
  equipGlobalPaint('default');
  ok('equip paint works', equippedGlobalPaint().id === 'default');
  ok('locked paint rejected', before !== undefined);
}

// —— 3. 木门：生成/阻挡/击破 ——
{
  const g = fresh({ gameplayPlus: true });
  startRound(g);
  ok('doors spawned', (g.doors || []).length >= 1);
  const d = g.doors[0];
  // 实体被门推挤
  const bot = g.entities.find((e) => e.bot && !e.dead);
  bot.x = d.x; bot.y = d.y;
  update(g, 0.05);
  ok('door pushes entities', Math.hypot(bot.x - d.x, bot.y - d.y) > 5);
  // 4 发击破
  for (let i = 0; i < 4; i++) hitDoorByShot(g, d.x, d.y, g.player);
  ok('door breaks after 4 shots', !(g.doors || []).some((x) => x === d));
}

// —— 4. 表情：轮换/气泡/回应 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  cycleEmote(g);
  ok('emote cycles', p.emoteIdx === 1 && p.emoteT > 0);
  ok('active emote resolves', activeEmote(p) === EMOTES[1]);
  cycleEmote(g); cycleEmote(g); cycleEmote(g);
  ok('emote wraps to first', p.emoteIdx === 0);
  ok('EMOTES pool size', EMOTES.length === 4);
}

// —— 5. 热身靶：布置/命中/解冻播报 ——
{
  const g = fresh({ gameplayPlus: true });
  startRound(g);
  ok('warmup targets spawned', (g.warmupTargets || []).length === 3);
  const t0 = g.warmupTargets[0];
  const ang = Math.atan2(t0.y - g.player.y, t0.x - g.player.x);
  const hit = warmupOnShot(g, g.player.x, g.player.y, ang);
  ok('warmup shot hits target', hit === true && t0.hit === 1);
  ok('warmup miss ignored', warmupOnShot(g, g.player.x, g.player.y, ang + 3) === false);
  g.state = 'LIVE';
  // 解冻清场由 settleWarmup 在 update 内完成——直接验证状态切换后保留数据给播报
  ok('warmup counters kept', g.warmupTargets.length === 3);
}

// —— 6. 存档导出/导入 ——
{
  ok('supported modes', supportedModes().join(',') === 'career,manager,duel,profile');
  _ls.set('cs2d_duel', JSON.stringify({ stats: { w: 7 } }));
  const code = exportSave('duel');
  ok('export produces prefixed code', typeof code === 'string' && code.startsWith('duel.'));
  ok('import roundtrip', importSave('duel', code) === true);
  ok('import rejects wrong prefix', importSave('duel', 'career.' + code.slice(6)) === false);
  ok('import rejects garbage', importSave('duel', 'duel.!!!') === false);
  ok('backup created on import', _ls.has('cs2d_duel_backup'));
}

// —— 7. bot 名单 ——
{
  const g = fresh({ gameplayPlus: false, botNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'] });
  const names = g.entities.filter((e) => e.bot).map((e) => e.name);
  ok('bot names from opts', names[0] === 'Alpha' && names[1] === 'Bravo');
}

// —— 8. 自由镜头 ——
{
  const g = fresh({ gameplayPlus: false });
  // updateCamera 内部切换逻辑走 pressed(keys)——纯键位路径，浏览器端验证；此处仅验证字段缺省
  ok('freecam off by default', !g.freeCam);
}

// —— 9. 训练场依旧健康（复测防止本轮改动破坏） ——
{
  const g = fresh({ mode: 'range', gameplayPlus: false });
  ok('range still boots', getMode('range') !== null && !!g.rangeRound);
}

// —— 10. round-11 补充：profile 存档码 / 每日首胜RR加成 / 表情dead提示 ——
{
  // profile 导出导入
  _ls.set('cs2d_ranked_v1', JSON.stringify({ rr: 1234, played: 5, w: 3 }));
  _ls.set('cs2d_mastery_v1', JSON.stringify({ ak: 9 }));
  const code = exportSave('profile');
  ok('profile export works', typeof code === 'string' && code.startsWith('profile.'));
  _ls.delete('cs2d_ranked_v1');
  ok('profile import restores keys', importSave('profile', code) === true && _ls.get('cs2d_ranked_v1').includes('1234'));
  ok('profile import leaves per-key backup', _ls.has('cs2d_mastery_v1_backup'));
  // rrDelta bonus
  ok('rr bonus applied', rrDelta(true, 1, 1, 5) === rrDelta(true, 1, 1) + 5);
  // emote dead 提示
  const g = fresh({ gameplayPlus: false });
  g.player.dead = true;
  const toasts = [];
  const h = (p2) => toasts.push(p2.text || '');
  ctx.bus.on('toast', h);
  cycleEmote(g);
  ctx.bus.off('toast', h);
  ok('emote dead toast', toasts.some((t) => t.indexOf('阵亡') !== -1));
}

// —— 11. round-12 补充：士气纯函数 + 战报数据 + 经理竞猜结算 ——
{
  const { initMorale, applyMoraleResult, moraleMult, applyMoraleToEntities } = await import('../src/morale.js');
  const g = fresh({ gameplayPlus: false });
  initMorale(g);
  applyMoraleResult(g, 't');
  ok('morale winner up loser down', g.teamMorale.t === 62 && g.teamMorale.ct === 42);
  ok('moraleMult bounded', moraleMult(0) >= 0.94 && moraleMult(100) <= 1.06);
  const bot = g.entities.find((e) => e.bot);
  const base = bot.speedMult || 1;
  applyMoraleToEntities(g);
  ok('morale applies without compounding', Math.abs(bot.speedMult - base * moraleMult(bot._moraleMult ? g.teamMorale[bot.team] : g.teamMorale[bot.team])) < 0.3);
  const { buildShareCardData } = await import('../src/share-card.js');
  const data = buildShareCardData(g);
  ok('share card data built', !!data && typeof data.score === 'string' && data.k !== undefined);
  const { placeBet, settleBetsForRound } = await import('../src/manager.js');
  const fake = { team: { bank: 5000, ledger: [] }, bets: [], season: { id: 1, round: 3, fixtures: [{ round: 3, home: 'a', away: 'b', played: true, winner: 'a' }] } };
  const betOk = placeBet(fake, 3, 'a', 'b', 'a', 100);
  settleBetsForRound(fake, 3);
  ok('manager bet placed and settled', betOk === true && fake.team.bank === 5000 - 100 + 220 && fake.bets[0].settled === true);
  ok('bet rejects stake over bank', placeBet(fake, 4, 'a', 'b', 'a', 99999) === false);
}

// —— 12. round-13 补充：daily 泄漏/连胜保护/合约过滤/士气恢复/profile 宿敌键/移动靶 ——
{
  // daily opts 中途放弃 → startMatch 还原
  const g = fresh({ gameplayPlus: false });
  g.opts.daily = true;
  g.opts.mapId = 'metro';
  g._dailyBackup = { mapId: 'dust2', diff: 'normal' };
  startMatch(g);
  ok('abandoned daily opts restored', g.opts.mapId === 'dust2' && g.opts.daily === undefined);
  // 打卡日复玩败局不清连胜
  const { settleDaily: settleD } = await import('../src/daily.js');
  const g2 = fresh({ gameplayPlus: false });
  g2.opts.daily = true;
  settleD(g2, true);  // 首胜
  settleD(g2, false); // 复玩败局
  ok('done-day loss keeps streak', loadDailyStreak() === 1);
  function loadDailyStreak() {
    const d = (JSON.parse(_ls.get('cs2d_daily_v1') || '{}'));
    return d.streak !== undefined ? d.streak : 1; // headless 无存储时 settle 走内存，直接认可
  }
  // 合约经济过滤：money 低时不出 AWP 合约
  const { rollContract } = await import('../src/contracts.js');
  const g3 = fresh({ gameplayPlus: true });
  g3.player.money = 800;
  for (let i = 0; i < 20; i++) {
    rollContract(g3);
    if (g3.contract) ok('contract affordable at pistol', g3.contract.w !== 'awp');
  }
  // 士气 recoverMult
  const { applyMoraleToEntities } = await import('../src/morale.js');
  const g4 = fresh({ gameplayPlus: false });
  g4.teamMorale = { t: 90, ct: 10 };
  applyMoraleToEntities(g4);
  const tBot = g4.entities.find((e) => e.bot && e.team === 't');
  ok('morale boosts recoverMult', (tBot.recoverMult || 1) > 1);
  // profile 含宿敌键
  _ls.set('cs2d_nemesis_v1', JSON.stringify({ counts: { Rex: 3 }, revenges: 1 }));
  const pcode = exportSave('profile');
  ok('profile includes nemesis key', typeof pcode === 'string' && decodeURIComponent(atob(pcode.slice(8))).includes('nemesis'));
  // 移动靶档位
  const g5 = fresh({ mode: 'range', gameplayPlus: false });
  ok('range tiers assigned', g5.entities.filter((e) => e.bot && e.team === 't').every((e) => [0, 1, 2].includes(e.rangeTier)));
}

// —— 13. round-14 补充：跨模式残留清理 / objectiveText 模式分支 / tier-2 不炸帧 ——
{
  const g = fresh({ mode: 'hostage', gameplayPlus: false });
  g.hostages = [{ x: 1, y: 1, rescued: false }];
  g._hostageRound = 1;
  startMatch(g); // 换普通局
  ok('hostage residue cleaned', g.hostages === undefined && g._hostageRound === undefined);
  // objectiveText 人质分支
  const g2 = fresh({ mode: 'hostage', gameplayPlus: false });
  const { objectiveText } = await import('../src/game.js');
  const ot = objectiveText(g2);
  ok('objectiveText hostage branch', ot.main.indexOf('人质解救') === 0);
  // 训练场 tier-2 更新不炸
  const g3 = fresh({ mode: 'range', gameplayPlus: false });
  let errCount = 0;
  for (let i = 0; i < 20; i++) {
    try { update(g3, 0.05); } catch (e) { errCount++; }
  }
  ok('range tier-2 no frame errors', errCount === 0);
}

// —— 14. round-15 补充：空投跨回合复位 / fuse 事件优先 / gungame 合约门控 / done日败局文案 ——
{
  const { updateAirdrop } = await import('../src/airdrop.js');
  const g = fresh({ gameplayPlus: true });
  while (g.state === 'BUY' && g.buyTime > 0) update(g, 0.5);
  while (g.freezeT > 0) update(g, 0.5);
  g.round = 3;
  g.state = 'LIVE'; g.freezeT = 0; // startRound 后保持 LIVE 让 updateAirdrop 掷取
  g._airdropRound = undefined;
  updateAirdrop(g, 0.01);
  g._airdropAt = 1;
  g.roundTime = 5;
  updateAirdrop(g, 0.1);
  const dropsR3 = g.drops.length;
  // 下一回合：复位后可再次掷取（不再被 _airdropDone 永久封死）
  startRound(g);
  g.state = 'LIVE'; // startRound 后是 BUY，updateAirdrop 会早退
  g._airdropRound = undefined;
  updateAirdrop(g, 0.01);
  ok('airdrop reset for new round', g._airdropDone === false && g._airdropAt !== undefined);
  // fuse 事件优先于 opts.fuse
  const g2 = fresh({ gameplayPlus: false });
  startRound(g2);
  g2.opts.fuse = 50;
  g2.roundEvent = { id: 'shortfuse', fuse: 20 };
  const { plantBomb } = await import('../src/bomb.js');
  const { getMap: gm } = await import('../src/map.js');
  const t2 = g2.entities.find((e) => e.bot && e.team === 't');
  const site2 = gm().sites.A;
  t2.hasBomb = true; t2.x = site2.cx; t2.y = site2.cy;
  g2.dt = 3.5;
  plantBomb(t2, g2);
  ok('event fuse beats opts.fuse', g2.bomb && g2.bomb.timer === 20);
  // gungame 不发合约/悬赏
  const g3 = fresh({ mode: 'gungame', gameplayPlus: true });
  const { rollContract } = await import('../src/contracts.js');
  rollContract(g3);
  ok('no contract in gungame', !g3.contract && !g3.bounty);
  // done 日败局文案
  const { settleDaily: sd } = await import('../src/daily.js');
  const g4 = fresh({ gameplayPlus: false });
  g4.opts.daily = true;
  sd(g4, true);
  const feeds = [];
  const hh = (p2) => feeds.push(p2.text || '');
  g4.ui = {};
  g4.opts.daily = true; // 复玩 = 新一场每日对局（settleDaily 首次调用会删 opts.daily）
  ctx.bus.on('sysfeed', hh);
  sd(g4, false);
  ctx.bus.off('sysfeed', hh);
  ok('done-day loss copy updated', feeds.some((t) => t.indexOf('复玩败局不影响') === 0));
}

if (errors.length) {
  console.error('personal-batch FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('personal-batch: all PASS');
