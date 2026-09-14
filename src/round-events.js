// 动态回合事件：经典模式每回合 25% 概率抽一条临时规则，回合结束失效。
// 单人 vs bot 最大流失点是每局流程雷同——回合级随机规则让同一张图打出不同节奏。
// 只挂在回合状态机上，不碰 AI 决策核心；事件均为纯数据修饰器，消费方读 game.roundEvent。
import { ctx } from './ctx.js';
import { rand } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export const ROUND_EVENTS = [
  { id: 'fog', name: '浓雾弥漫', desc: '全场大雾，视野受限', weather: 'fog', density: 0.9 },
  { id: 'shortfuse', name: '短引信', desc: 'C4 引信缩短至 20 秒', fuse: 20 },
  { id: 'noawp', name: '禁狙令', desc: '本回合无法购买 AWP', noAwp: true },
  { id: 'bounty2x', name: '双倍赏金', desc: '本回合击杀奖励翻倍', killMult: 2 },
  { id: 'swift', name: '疾速节奏', desc: '全员移速 +15%', speedMult: 1.15 }
];

// 回合开始时掷事件（game.js startRound 调用）：仅经典模式、第 3 回合起。
// gameplayPlus 总开关：真实对局默认开启；测试/训练传 false 保证确定性。
export function maybeRollRoundEvent(game) {
  clearRoundEvent(game);
  if (!game || game.mode || game.over) return;
  if (!game.opts || !game.opts.gameplayPlus) return;
  if (!game.round || game.round < 3) return;
  if (rand() >= 0.25) return;
  const ev = ROUND_EVENTS[Math.floor(rand() * ROUND_EVENTS.length)];
  game.roundEvent = ev;
  if (ev.speedMult) {
    for (const e of game.entities) {
      e._prevSpeedMult = e.speedMult || 1;
      e.speedMult = e._prevSpeedMult * ev.speedMult;
    }
  }
  emit('toast', { text: '⚡ 回合事件「' + ev.name + '」：' + ev.desc });
}

// 回合结束/新回合开始时清理修饰器，恢复被改写的实体字段
export function clearRoundEvent(game) {
  if (!game) return;
  const ev = game.roundEvent;
  if (ev && ev.speedMult) {
    for (const e of game.entities) {
      if (e._prevSpeedMult !== undefined) {
        e.speedMult = e._prevSpeedMult;
        delete e._prevSpeedMult;
      }
    }
  }
  game.roundEvent = null;
}
