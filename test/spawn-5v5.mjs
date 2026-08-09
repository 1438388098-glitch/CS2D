// 5v5 出生不重叠回归：官方图每队仅 4 个出生点，第 5 人应偏移到邻近可通行点而非重叠。
import { createGame } from '../src/game.js';
import { startMatch } from '../src/game.js';
import { loadMap, findMapById } from '../src/map.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} spawn5v5 ${name}${detail ? ' ' + detail : ''}`);
  if (!cond) failed = true;
}

for (const mapId of ['dust2', 'canal', 'metro']) {
  loadMap(findMapById(mapId));
  const g = createGame({ team: 't', diff: 'normal', bots: 5, mapId });
  startMatch(g);
  const t = g.entities.filter((e) => e.team === 't');
  const ct = g.entities.filter((e) => e.team === 'ct');
  const pairsOverlap = (list) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < 8) return true;
      }
    }
    return false;
  };
  ok(mapId + ' T alive >=5', t.length >= 5 && t.every((e) => !e.dead));
  ok(mapId + ' T no spawn overlap', !pairsOverlap(t));
  ok(mapId + ' CT no spawn overlap', !pairsOverlap(ct));
}

process.exit(failed ? 1 : 0);
