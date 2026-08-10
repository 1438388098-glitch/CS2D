import { DUEL_MAPS } from './src/duel-maps.js';
import { loadMap, getMap } from './src/map.js';
for (const m of DUEL_MAPS) {
  loadMap({ id: m.id, name: m.name, rows: m.rows, tile: 16 });
  const map = getMap();
  const un = map.diagnostics ? map.diagnostics.unreachable.length : -1;
  console.log(m.id, m.rows[0].length + 'x' + m.rows.length, 'A=' + !!map.sites.A, 'B=' + !!map.sites.B, 'T=' + map.spawns.t.length, 'CT=' + map.spawns.ct.length, 'un=' + un);
}
