// 快捷表情（candidate-592）：G 键轮换 4 个表情，头顶气泡 2s；bot 有概率回一句无线电。
// 玩家的社交表达通道：ping 是落点、无线电是情报，表情补上情绪。
import { ctx } from './ctx.js';
import { pushRadio } from './combat.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export const EMOTES = [
  { id: 'gg', face: '👍', label: '打得漂亮' },
  { id: 'lol', face: '😂', label: '笑死' },
  { id: 'rush', face: '😤', label: '跟我冲' },
  { id: 'care', face: '🤫', label: '小心点' }
];
const BOT_REPLIES = ['收到', '别吵，在架枪', '你先上我掩护', '干得漂亮'];

export function cycleEmote(game) {
  const p = game.player;
  if (!p || p.dead) {
    // 阵亡按 G 不能静默失败（candidate-619）：观战期玩家会以为按键坏了
    if (p && p.dead) emit('toast', { text: '阵亡后无法发表情' });
    return;
  }
  const cur = ((p.emoteIdx || 0) + 1) % EMOTES.length;
  p.emoteIdx = cur;
  p.emoteT = 2;
  emit('toast', { text: '表情：' + EMOTES[cur].face + ' ' + EMOTES[cur].label + '（再按 G 切换）' });
  emit('sfx', { name: 'buy', vol: 0.35, game });
  if (Math.random() < 0.35) {
    const mates = game.entities.filter((e) => e.bot && e.team === p.team && !e.dead);
    if (mates.length) {
      const m = mates[Math.floor(Math.random() * mates.length)];
      pushRadio(game, m.name + '：' + BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)]);
    }
  }
}

export function activeEmote(e) {
  return e && e.emoteT > 0 ? EMOTES[e.emoteIdx % EMOTES.length] : null;
}
