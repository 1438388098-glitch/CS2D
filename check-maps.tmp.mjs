import { FOURTH_MAP_CANDIDATES } from './src/4th-map-candidates.js';
import { loadMap, getMap } from './src/map.js';
for (const m of FOURTH_MAP_CANDIDATES) {
  loadMap({ id: m.id, name: m.name, rows: m.rows, tile: 16 });
  const map = getMap();
  const un = map.diagnostics ? map.diagnostics.unreachable.length : -1;
  console.log(m.id, 'A=' + !!map.sites.A, 'B=' + !!map.sites.B, 'T=' + map.spawns.t.length, 'CT=' + map.spawns.ct.length, 'unreachable=' + un);
}
