import { DUEL_MAPS } from '../src/duel-maps.js';
import { loadMap, getMapDiagnostics } from '../src/map.js';

function ok(name, cond) {
  if (!cond) throw new Error('duel-maps-structure: ' + name + ' FAIL');
  console.log('duel-maps-structure: ' + name + ' PASS');
}

// 单挑图结构护栏：行等长、关键标记齐全、缩图+修复后无孤立可行走区
for (const def of DUEL_MAPS) {
  const rows = def.rows;
  ok(def.id + ' rows equal length', rows.length >= 16 && rows.every((r) => r.length === rows[0].length));
  const joined = rows.join('');
  ok(def.id + ' has t/c spawns and a/b sites', ['t', 'c', 'a', 'b'].every((ch) => joined.includes(ch)));

  loadMap(def);
  const diag = getMapDiagnostics();
  ok(def.id + ' no unreachable walkable tiles', Array.isArray(diag.unreachable) && diag.unreachable.length === 0);
}

console.log('duel-maps-structure: all PASS');
