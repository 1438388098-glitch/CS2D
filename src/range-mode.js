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
    // 靶型档位（candidate-630）：0 静止 / 1 横移巡航 / 2 随机变速
    e.rangeTier = i % 3;
    e.rangePatrolT = 0;
  });
  game.rangeStats = { hits: 0, headshots: 0, shotsAtStart: game.stats.shots || 0, hitsAtStart: game.stats.hits || 0, killsAtStart: 0 };
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
    } else if (e.rangeTier === 1) {
      // 横移巡航：沿锚点左右巡逻
      e.rangePatrolT += 0.05;
      e.x = e.rangeHome.x + Math.sin(e.rangePatrolT * 1.2) * 160;
      e.y = e.rangeHome.y + Math.cos(e.rangePatrolT * 0.8) * 40;
    } else if (e.rangeTier === 2) {
      // 随机变速游走
      e.rangePatrolT += 0.05;
      e.x = e.rangeHome.x + Math.sin(e.rangePatrolT * (1.6 + (i % 2))) * 130;
      e.y = e.rangeHome.y + Math.cos(e.rangePatrolT * 1.1) * 110;
    } else if (Math.hypot(e.x - e.rangeHome.x, e.y - e.rangeHome.y) > 60) {
      e.x = e.rangeHome.x; e.y = e.rangeHome.y; // 静止靶回锚
    }
  }
}

function rangeUpdate(game, dt) {
  if (!game || game.over) return;
  // 练枪成绩小结（candidate-630）：每 20s 播一次命中率
  game._rangeStatT = (game._rangeStatT === undefined ? 20 : game._rangeStatT) - (dt || 0.016);
  if (game._rangeStatT <= 0) {
    game._rangeStatT = 20;
    const shots = (game.stats.shots || 0) - (game.rangeStats.shotsAtStart || 0);
    const hits = (game.stats.hits || 0) - (game.rangeStats.hitsAtStart || 0);
    if (shots >= 10) emit('sysfeed', { text: '🎯 近 20s 命中率 ' + Math.round((hits / shots) * 100) + '%（' + hits + '/' + shots + '）' });
  }
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
