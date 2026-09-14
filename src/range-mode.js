// 训练场模式（candidate-574）：无压力练枪环境——无限金钱/无限备弹，木桩 bot 定期重生。
// 复用 registerMode 官方扩展点（仿 gungame-mode），不碰 modes.js。
import { registerMode } from './registry.js';
import { setupMatchEntities, startRound } from './game.js';
import { getMap } from './map.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
import { ctx } from './ctx.js';

function rangeStart(game) {
  game.noRoundEnd = false;
  game.opts.sideSwapAfter = Infinity;
  game.opts.team = 'ct';
  setupMatchEntities(game);
  startRound(game);
  const map = getMap();
  const mid = { x: map.W / 2, y: map.H / 2 };
  const bots = game.entities.filter((e) => e.bot && e.team === 't');
  bots.forEach((e, i) => {
    const ang = (i / Math.max(1, bots.length)) * Math.PI * 2;
    e.rangeHome = { x: mid.x + Math.cos(ang) * 420, y: mid.y + Math.sin(ang) * 420 };
  });
  game.rangeRound = game.round;
  emit('sysfeed', { text: '训练场：木桩会自动复活，B 键免费购买任意装备' });
}

function refreshDummies(game) {
  for (const e of game.entities) {
    if (game.player && e === game.player) { e.money = 16000; e.infiniteAmmo = true; continue; }
    if (!e.bot) continue;
    if (e.team !== 't') { e.dead = true; continue; } // 队友 bot 清场（纯打靶）
    if (!e.rangeHome) continue;
    // 木桩：致盲+无武器+站桩，死亡 3s 后原地复活
    e.blind = 9999;
    e.weapons.primary = null;
    e.weapons.secondary = null;
    if (e.dead) {
      e._rangeRespawnT = (e._rangeRespawnT === undefined ? 3 : e._rangeRespawnT) - 0.05;
      if (e._rangeRespawnT <= 0) {
        e.dead = false;
        e.hp = 100;
        e.x = e.rangeHome.x;
        e.y = e.rangeHome.y;
        e._rangeRespawnT = undefined;
      }
    } else if (Math.hypot(e.x - e.rangeHome.x, e.y - e.rangeHome.y) > 60) {
      e.x = e.rangeHome.x; e.y = e.rangeHome.y; // 木桩不乱跑
    }
  }
}

function rangeUpdate(game, dt) {
  if (!game || game.over) return;
  if (game.round !== game.rangeRound) {
    game.rangeRound = game.round;
    for (const e of game.entities) e.hasBomb = false;
    game.bomb = null;
  }
  refreshDummies(game);
  // 回合自然结束（时间到）就重开一轮，保持练枪不中断
  if (game.state === 'END' && !game.over) startRound(game);
}

registerMode({
  id: 'range',
  name: '训练场',
  desc: '打靶练枪 · 免费购买',
  customBots: false,
  start: rangeStart,
  update: rangeUpdate
});
