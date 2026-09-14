// 冻结期热身靶（candidate-593）：BUY/冻结期在玩家出生方向生成 3 个虚拟木靶，
// 开火射线与靶圆相交计命中，解冻时清场并播报命中率。纯数据+渲染层，不影响对局判定。
import { ctx } from './ctx.js';
import { rand } from './utils.js';
import { getMap } from './map.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

// startRound（gameplayPlus 开启）调用：布置本轮热身靶
export function spawnWarmupTargets(game) {
  game.warmupTargets = null;
  if (!game || !game.opts.gameplayPlus || !game.player) return;
  const map = getMap();
  if (!map || !map.spawns || !map.spawns.ct) return;
  const sp = game.player.team === 'ct' ? map.spawns.ct[0] : map.spawns.t[0];
  if (!sp) return;
  game.warmupTargets = [];
  for (let i = 0; i < 3; i++) {
    const ang = (game.player.team === 'ct' ? 0 : Math.PI) + rand(-0.7, 0.7);
    game.warmupTargets.push({ x: sp.x + Math.cos(ang) * (300 + i * 120), y: sp.y + Math.sin(ang) * (300 + i * 120), r: 16, hit: 0, flashT: 0 });
  }
  game.warmupShots = 0;
}

// fireWeapon（玩家、冻结/购买期）调用：射线命中判定（视线方向 ± 弥散由调用方传角）
export function warmupOnShot(game, originX, originY, angle) {
  const ts = game && game.warmupTargets;
  if (!ts || !ts.length) return false;
  let hit = false;
  for (const t of ts) {
    const dx = t.x - originX, dy = t.y - originY;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along <= 0) continue;
    const perp = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
    if (perp <= t.r) {
      t.hit++;
      t.flashT = 0.25;
      hit = true;
    }
  }
  game.warmupShots = (game.warmupShots || 0) + 1;
  if (hit) emit('sfx', { name: 'hit', vol: 0.4, game });
  return hit;
}

// update：解冻后清场并播报
export function settleWarmup(game) {
  const ts = game && game.warmupTargets;
  if (!ts) return;
  if (game.state === 'LIVE') {
    const total = game.warmupShots || 0;
    if (total >= 5) {
      const hits = ts.reduce((a, t) => a + t.hit, 0);
      emit('toast', { text: '热身命中率 ' + Math.round((hits / total) * 100) + '%（' + hits + '/' + total + '）' });
    }
    game.warmupTargets = null;
    return;
  }
  for (const t of ts) if (t.flashT > 0) t.flashT -= 0.016;
}
