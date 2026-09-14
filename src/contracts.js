// 回合合约挑战（candidate-569）：每回合发一个"用指定武器击杀 N 次"的小合约，达成发赏金。
// 每日挑战是跨会话粒度、悬赏是全场乘数——合约补上"单回合主动目标"这一层，
// 让 eco 局/手枪局也有事情可追。wKills 已按武器统计，判定近零成本。
import { ctx } from './ctx.js';
import { rand } from './utils.js';
import { WEAPONS } from './config.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

const CONTRACT_POOL = [
  { w: 'usp', n: 2, reward: 400, label: 'USP 拿下 2 杀' },
  { w: 'glock', n: 2, reward: 400, label: 'Glock 拿下 2 杀' },
  { w: 'deagle', n: 2, reward: 500, label: '沙鹰拿下 2 杀' },
  { w: 'knife', n: 1, reward: 600, label: '刀杀 1 人' },
  { w: 'mp9', n: 3, reward: 450, label: 'MP9 拿下 3 杀' },
  { w: 'mac10', n: 3, reward: 450, label: 'MAC-10 拿下 3 杀' },
  { w: 'awp', n: 2, reward: 550, label: 'AWP 拿下 2 杀' }
];

// startRound（gameplayPlus 开启时）：掷本回合合约
export function rollContract(game) {
  game.contract = null;
  // 与 round-events/perks 同门控：军备竞赛（禁买清钱）等模式不发经济合约
  if (!game || !game.opts.gameplayPlus || !game.player || game.mode) return;
  // 经济过滤（candidate-622）：买不起的武器合约是纯噪音（手枪局不发 AWP 合约）
  const money = game.player.money || 0;
  const affordable = CONTRACT_POOL.filter((c) => {
    const w = WEAPONS[c.w];
    return !w || w.price <= money + 1400; // 允许 eco 局攒钱达标的轻度弹性
  });
  const pool = affordable.length ? affordable : CONTRACT_POOL.filter((c) => c.w === 'usp' || c.w === 'glock' || c.w === 'knife');
  const c = pool[Math.floor(rand() * pool.length)];
  game.contract = { w: c.w, n: c.n, reward: c.reward, label: c.label, done: 0 };
  emit('sysfeed', { text: '📋 回合合约：' + c.label + '（+$' + c.reward + '）' });
}

// killEntity（killer === game.player）时结算
export function contractState(game) {
  return game && game.contract ? game.contract : null;
}

export function contractOnKill(game, weapon) {
  const c = game.contract;
  if (!c || c.complete) return false;
  if (weapon !== c.w) return false;
  c.done++;
  if (c.done >= c.n) {
    c.complete = true;
    emit('sysfeed', { text: '📋 合约完成！' + c.label + ' +$' + c.reward });
    emit('sfx', { name: 'buy', vol: 0.7, game });
    return true; // 调用方 addMoney(killer, c.reward)
  }
  emit('sysfeed', { text: '📋 合约进度 ' + c.done + '/' + c.n + '：' + c.label });
  return false;
}
