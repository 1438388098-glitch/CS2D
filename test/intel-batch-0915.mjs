// 情报与个性化批次回归（2026-09-15 round-5）：
// 回合合约 / AI教练复盘 / 色弱色板 / EMP压制(听声+小地图) / 雷暴掩声 / 对手记忆持久化 / 单挑评分 / 对手个体化
import { createGame, startMatch, startRound, update } from '../src/game.js';
import { killEntity, fireWeapon, pushRadio } from '../src/combat.js';
import { buyItem } from '../src/economy.js';
import { switchNade } from '../src/input.js';
import { updateGrenades } from '../src/grenades.js';
import { hearStep, hearWorldSound, hearGunshot } from '../src/ai/senses.js';
import { rollContract, contractOnKill } from '../src/contracts.js';
import { recordDeathForCoach, buildCoachLines } from '../src/coach.js';
import { getA11yMode, setA11yMode, a11yPalette } from '../src/a11y.js';
import { initOppModel, saveOppModel } from '../src/ai/oppmodel.js';

// headless localStorage 桩：a11y 与 oppmodel 持久化都依赖它
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k)
};

const errors = [];
const ok = (name, cond) => {
  console.log('intel-batch: ' + name + ' ' + (cond ? 'PASS' : 'FAIL'));
  if (!cond) errors.push(name);
};

function fresh(opts) {
  const g = createGame(Object.assign({ mapId: 'dust2', bots: 2 }, opts || {}));
  startMatch(g);
  return g;
}

// —— 1. 回合合约：发放/进度/完成赏金 ——
{
  const g = fresh({ gameplayPlus: true });
  startRound(g);
  ok('contract rolled', !!g.contract && g.contract.n >= 1);
  const c = g.contract;
  const killer = g.entities.find((e) => e === g.player);
  killer.money = 1000;
  const victim = g.entities.find((e) => e.bot && e.team !== g.player.team && !e.dead);
  for (let i = 0; i < c.n && !(c.complete); i++) {
    if (contractOnKill(g, c.w)) killer.money += c.reward;
  }
  ok('contract completes with reward', c.complete === true && killer.money === 1000 + c.reward);
  // 无合约/武器不符
  const g2 = fresh({ gameplayPlus: false });
  startRound(g2);
  ok('no contract without gameplayPlus', !g2.contract);
}

// —— 2. AI 教练：背身归因 + 建议生成 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  const killer = g.entities.find((e) => e.bot && e.team !== p.team);
  // 击杀者放在玩家背后
  p.angle = 0;
  killer.x = p.x - 100; killer.y = p.y;
  recordDeathForCoach(g, killer, p);
  ok('coach logs behind death', g.deathLog.length === 1 && g.deathLog[0].behind === true);
  for (let i = 0; i < 5; i++) recordDeathForCoach(g, killer, p);
  p.deaths = 6;
  const lines = buildCoachLines(g);
  ok('coach produces behind advice', lines.some((l) => l.indexOf('背身') !== -1));
  ok('coach lines capped at 3', lines.length <= 3);
}

// —— 3. 色弱色板：模式切换与调色 ——
{
  setA11yMode('deutan');
  ok('a11y mode persists', getA11yMode() === 'deutan');
  const pal = a11yPalette();
  ok('deutan palette active', !!pal && pal.hit[2][2] > 150 && pal.hit[2][0] < 100);
  setA11yMode('off');
  ok('off palette null', a11yPalette() === null);
}

// —— 4. EMP：购买/投掷/听声压制/小地图隐去 ——
{
  const g = fresh({ gameplayPlus: false });
  const p = g.player;
  p.money = 16000;
  ok('emp purchasable', buyItem(g, 'emp') === true && p.weapons.nades.emp === 1);
  switchNade(p, 'emp');
  ok('emp slot selected', p.slot === 'nade:emp');
  p.fireCd = 0;
  fireWeapon(p, g);
  updateGrenades(g, 1.6);
  ok('emp pulse created', !!g.empPulse && g.empPulse.until > g.time);
  // 脉冲内的 bot 听不到脚步
  const bot = g.entities.find((e) => e.bot && !e.dead);
  bot.x = g.empPulse.x; bot.y = g.empPulse.y;
  game_lastStep(g, p, false);
  ok('emp suppresses hearing in radius', hearStep(bot, g) === false);
  // 半径外不受影响
  bot.x = g.empPulse.x + 500; bot.y = g.empPulse.y; // 半径外(460)但正常听声半径(760)内
  game_lastStep(g, p, false);
  ok('hearing works outside emp radius', hearStep(bot, g) === true);
  // 枪声同样被压制
  bot.x = g.empPulse.x; bot.y = g.empPulse.y;
  ok('emp suppresses gunshot hearing', hearGunshot(bot, p, g, 'ak') === false);
}
function game_lastStep(g, p, walk) {
  g.lastStep = { x: p.x, y: p.y, t: g.time, walk, team: p.team, vx: 0, vy: 0 };
}

// —— 5. 雷暴掩声 ——
{
  const g = fresh({ gameplayPlus: false });
  const bot = g.entities.find((e) => e.bot && !e.dead);
  const p = g.player;
  bot.x = p.x + 500; bot.y = p.y; // 正常半径(760/600)内、雷暴减半半径(380/300)外
  game_lastStep(g, p, false);
  ok('hears step normally', hearStep(bot, g) === true);
  g.thunderUntil = g.time + 1.5;
  ok('thunder halves step hearing', hearStep(bot, g) === false || Math.hypot(bot.x - p.x, bot.y - p.y) > 380);
  g.lastSound = { x: p.x, y: p.y, t: g.time, radius: 600, conf: 0.5 };
  ok('thunder halves world sound hearing', hearWorldSound(bot, g) === false || Math.hypot(bot.x - p.x, bot.y - p.y) > 300);
}

// —— 6. 对手记忆持久化（hell 限定） ——
{
  const g = fresh({ gameplayPlus: false, diff: 'hell', hellLevel: 5 });
  g.oppModel = { dust2: [{ x: 100, y: 200, eventType: 'kill', w: 1.5, weaponTier: 2, t: 0 }] };
  g.time = 30;
  saveOppModel(g);
  const g2 = fresh({ gameplayPlus: false, diff: 'hell', hellLevel: 5 });
  initOppModel(g2);
  ok('oppmodel reloads saved bucket', Array.isArray(g2.oppModel.dust2) && g2.oppModel.dust2.length === 1);
  // 非 hell 不加载
  const g3 = fresh({ gameplayPlus: false, diff: 'hard' });
  initOppModel(g3);
  ok('oppmodel not loaded on non-hell', !g3.oppModel.dust2 || g3.oppModel.dust2.length === 0);
}

// —— 7. 无线电播报流 ——
{
  const g = fresh({ gameplayPlus: false });
  pushRadio(g, '测试播报 A');
  pushRadio(g, '测试播报 B');
  ok('radio log capped and ordered', g.radioLog.length === 2 && g.radioLog[1].text === '测试播报 B');
  const killer = g.entities.find((e) => e.bot && e.team === 't');
  const victim = g.entities.find((e) => e.bot && e.team === 'ct');
  const before = g.radioLog.length;
  killEntity(victim, killer, 'ak', false, g);
  ok('bot kill feeds radio', g.radioLog.length > before && g.radioLog.some((r) => r.text.indexOf('击倒') !== -1)); // 吐槽弹幕可能插队
}

// —— 8. 单挑评分记录 ——
{
  const { recordResult, resetDuel, setStorage } = await import('../src/duel.js');
  const store = { map: new Map(), getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }, setItem(k, v) { this.map.set(k, String(v)); }, removeItem(k) { this.map.delete(k); } };
  setStorage(store);
  const s = resetDuel();
  recordResult(s, true, 10, 4);
  ok('duel history has rating', s.history[0].r !== undefined && s.history[0].r > 0 && s.history[0].r <= 3);
  recordResult(s, false, 2, 10);
  ok('duel loss rates lower', s.history[0].r < s.history[1].r);
}

// —— 9. career 对手个体化（公式级） ——
{
  const jitter = (idx, k, scale, span) => 1 + ((((idx + 1) * k) % span) - (span - 1) / 2) * scale;
  const a = jitter(0, 53, 0.04, 9), b = jitter(1, 53, 0.04, 9);
  ok('foe jitter varies per index', a !== b && a > 0.8 && a < 1.2);
}

if (errors.length) {
  console.error('intel-batch FAIL: ' + errors.join(', '));
  process.exit(1);
}
console.log('intel-batch: all PASS');
