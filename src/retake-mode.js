// 回防模式（Retake）：开局即炸弹已安在随机站点，玩家固定 CT 带拆弹钳回防，T 守包，短引信 25s。
// 本模块从 modes.js 拆出独立（modes.js 为 skip-worktree 保护的本地工作文件，不进入 git 提交），
// 由 main.js 以副作用 import 完成模式注册，test/retake.mjs 亦直接 import 本模块。
import {registerMode} from './registry.js';
import {getMap, nearestWalkable} from './map.js';
import {setupMatchEntities, startRound} from './game.js';
import {TILE} from './config.js';
import {ctx} from './ctx.js';
import {rand} from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
const mapTile = () => getMap()?.tile || TILE;

function retakeStart(game) {
  game.noRoundEnd = false;
  // 玩家固定 CT（回防方），T 为守包 bot
  game.opts.team = 'ct';
  setupMatchEntities(game);
  startRound(game);
  const map = getMap();
  const sites = map && map.sites ? map.sites : {};
  const keys = Object.keys(sites).filter((k) => sites[k]);
  const siteKey = keys.length ? keys[Math.floor(rand() * keys.length)] : 'A';
  const site = sites[siteKey] || sites.A || sites.B;
  if (!site) {
    // 无包点图（自定义/竞技池外）无法布置已安放的炸弹：明确告知按经典规则运行，不再静默退化
    emit('toast', { text: '当前地图无包点，回防模式按经典规则进行' });
  }
  if (site) {
    // 炸弹已 planted 在站点中心；缩短引信，加快回防节奏（引信只从 LIVE 起算，购买期不再吃引信）
    game.bomb = { x: site.cx, y: site.cy, dropped: false, planted: true, site: siteKey, timer: 25, defusing: false, defuseT: 0 };
    game._plantedRound = true;
    // CT（玩家+bot）全员配拆弹钳；清除持包标记（炸弹已安，无人持包）
    for (const e of game.entities) {
      if (e.dead) continue;
      e.hasBomb = false;
      if (e.team === 'ct') e.weapons.kit = true;
    }
    // T 守包：移到站点中心附近，面向包点
    for (const e of game.entities) {
      if (e.team !== 't' || e.dead) continue;
      const t = nearestWalkable(site.cx + rand(-80, 80), site.cy + rand(-80, 80));
      if (t) { e.x = t.x * mapTile() + mapTile() / 2; e.y = t.y * mapTile() + mapTile() / 2; }
      e.angle = Math.atan2(site.cy - e.y, site.cx - e.x);
      e.path = null; e.objCache = null; e.aimTarget = null;
    }
    // CT 回防：从原 CT 出生点出发（与站点拉开距离，形成回防推进）
    for (const e of game.entities) {
      if (e.team !== 'ct' || e.dead) continue;
      const sp = (map.spawns && map.spawns.ct && map.spawns.ct.length) ? map.spawns.ct[0] : null;
      if (sp) { e.x = sp.x; e.y = sp.y; e.angle = Math.atan2(site.cy - e.y, site.cx - e.x); }
      e.path = null; e.objCache = null; e.aimTarget = null;
    }
    emit('sysfeed', { text: '回防模式：炸弹已安在 ' + siteKey + ' 区，拆除它！' });
  }
}

registerMode({
  id: 'retake', name: '回防模式', desc: 'T 已安弹守包，CT 回防拆弹', customBots: false,
  start: retakeStart
});
