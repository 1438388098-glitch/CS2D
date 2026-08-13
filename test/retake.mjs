// 回防模式回归：开局即炸弹已安在站点，玩家固定 CT 且带拆弹钳，T 守包在站点附近。
import '../src/retake-mode.js';
import { createGame } from '../src/game.js';
import { getMode } from '../src/registry.js';
import { getMap } from '../src/map.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} retake ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}

const retake = getMode('retake');
ok('retake registered', !!retake && typeof retake.start === 'function');

for (const mapId of ['dust2', 'metro', 'forge']) {
  const g = createGame({ mode: 'retake', team: 't', diff: 'normal', bots: 5, mapId });
  g.ui = null;
  retake.start(g);
  const bomb = g.bomb;
  ok(mapId + ' bomb planted', !!bomb && bomb.planted === true && !!bomb.site);
  ok(mapId + ' player is CT', g.player && g.player.team === 'ct');
  ok(mapId + ' player has kit', !!(g.player && g.player.weapons && g.player.weapons.kit));
  ok(mapId + ' CT all have kit', g.entities.filter((e) => e.team === 'ct' && !e.dead).every((e) => e.weapons.kit));
  ok(mapId + ' no carrier', g.entities.every((e) => !e.hasBomb));
  const site = getMap().sites[bomb ? bomb.site : 'A'];
  if (site) {
    const tNear = g.entities.filter((e) => e.team === 't' && !e.dead).every((e) => Math.hypot(e.x - site.cx, e.y - site.cy) < 500);
    ok(mapId + ' T near site', tNear);
  }
}

process.exit(failed ? 1 : 0);
