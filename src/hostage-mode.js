// 人质解救模式（candidate-517）：全新胜利条件——CT 护送两名人质到撤离点（CT 出生区），
// T 守点。打破所有模式收敛在"安放/拆除"的单一目标；bot 复用 guardPoint 守人质，不需要新大脑。
// v1：人质为静态标记物，CT（玩家或 bot）触碰后跟随，抵达 CT 出生区判定解救成功。
import { registerMode } from './registry.js';
import { setupMatchEntities, startRound, endRound } from './game.js';
import { getMap, nearestWalkable } from './map.js';
import { TILE } from './config.js';
import { ctx } from './ctx.js';
import { rand } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
const mapTile = () => getMap()?.tile || TILE;

function placeHostages(game) {
  const map = getMap();
  const tSp = map.spawns && map.spawns.t && map.spawns.t[0];
  const cx = tSp ? tSp.x : map.W / 2;
  const cy = tSp ? tSp.y : map.H / 2;
  game.hostages = [];
  for (let i = 0; i < 2; i++) {
    const spot = nearestWalkable(cx + rand(-120, 120), cy + rand(-120, 120));
    game.hostages.push({
      x: spot ? spot.x * mapTile() + mapTile() / 2 : cx,
      y: spot ? spot.y * mapTile() + mapTile() / 2 : cy,
      following: null,
      rescued: false,
      name: '人质 ' + (i === 0 ? '甲' : '乙')
    });
  }
}

function hostageRound(game) {
  game._hostageRound = game.round;
  for (const e of game.entities) e.hasBomb = false;
  game.bomb = null;
  game.drops.length = 0;
  placeHostages(game);
  // T 守人质：守包语义映射为守人质位置（bot 已有 guardPoint 大脑）
  for (const e of game.entities) {
    if (e.team === 't' && e.bot && game.hostages[0]) {
      e.guardPoint = { x: game.hostages[0].x + rand(-70, 70), y: game.hostages[0].y + rand(-70, 70) };
      e.guardPointSite = 'hostage';
    }
  }
  if (game.round === 1) emit('sysfeed', { text: '人质解救：护送 2 名人质到 CT 出生区！' });
}

function hostageStart(game) {
  game.noRoundEnd = false;
  game.opts.sideSwapAfter = Infinity; // 胜利条件不对称，禁换边
  game.opts.timeoutWinner = 't';      // 时间耗尽 = T 守住 = T 胜
  setupMatchEntities(game);
  startRound(game);
  hostageRound(game);
}

function ctSpawnZone(game) {
  const sp = getMap().spawns && getMap().spawns.ct && getMap().spawns.ct[0];
  return sp || { x: 0, y: 0 };
}

function hostageUpdate(game, dt) {
  if (!game || game.over || !game.hostages) return;
  if (game.round !== game._hostageRound && (game.state === 'BUY' || game.state === 'LIVE')) {
    hostageRound(game);
    return;
  }
  if (game.state !== 'LIVE') return;
  const zone = ctSpawnZone(game);
  let rescued = 0;
  for (const h of game.hostages) {
    if (h.rescued) { rescued++; continue; }
    // 触碰跟随：任意存活 CT 靠近即接管
    if (!h.following || h.following.dead || h.following.team !== 'ct' || Math.hypot(h.following.x - h.x, h.following.y - h.y) > 260) {
      h.following = null;
      for (const e of game.entities) {
        if (e.dead || e.team !== 'ct') continue;
        if (Math.hypot(e.x - h.x, e.y - h.y) < 42) { h.following = e; emit('sysfeed', { text: e === game.player ? '你带上了 ' + h.name : h.name + ' 被队友带上了' }); break; }
      }
    }
    if (h.following) {
      const d = Math.hypot(h.following.x - h.x, h.following.y - h.y);
      if (d > 46) {
        // 直线跟随 + 可通行校验（卡墙时原地等待，不寻路保持 v1 简单）
        const nx = h.x + ((h.following.x - h.x) / d) * 150 * dt;
        const ny = h.y + ((h.following.y - h.y) / d) * 150 * dt;
        h.x = nx; h.y = ny;
      }
      if (Math.hypot(zone.x - h.x, zone.y - h.y) < 180) {
        h.rescued = true;
        h.following = null;
        emit('sysfeed', { text: h.name + ' 已抵达撤离区！' });
        emit('sfx', { name: 'bombDefused', vol: 0.6, game });
      }
    }
  }
  rescued = game.hostages.filter((x) => x.rescued).length;
  if (rescued >= 2 && game.state === 'LIVE') {
    endRound(game, 'ct', '人质全部解救', 'hostage');
    return;
  }
  // CT 全灭 = T 守住
  const ctAlive = game.entities.filter((e) => e.team === 'ct' && !e.dead).length;
  if (ctAlive === 0 && game.state === 'LIVE') {
    endRound(game, 't', '解救失败', 'hostage-fail');
  }
}

registerMode({
  id: 'hostage',
  name: '人质解救',
  desc: '护送 2 名人质撤离',
  customBots: false,
  start: hostageStart,
  update: hostageUpdate
});
