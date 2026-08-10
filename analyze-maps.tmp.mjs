import { OFFICIAL_MAPS } from './src/official-maps.js';
import { loadMap, getMap } from './src/map.js';
for (const id of ['dust2', 'canal', 'metro']) {
  const def = { id, name: OFFICIAL_MAPS[id].name, rows: OFFICIAL_MAPS[id].rows, tile: OFFICIAL_MAPS[id].tile || 16 };
  loadMap(def);
  const m = getMap();
  const chars = {};
  for (const row of def.rows) for (const ch of row) chars[ch] = (chars[ch] || 0) + 1;
  console.log('=== ' + id + ' ' + def.name + ' ===');
  console.log('size=' + def.rows[0].length + 'x' + def.rows.length + ' tile=' + def.tile + ' W=' + m.W + ' H=' + m.H);
  console.log('A=' + (m.sites.A ? Math.round(m.sites.A.cx) + ',' + Math.round(m.sites.A.cy) : 'none') + ' B=' + (m.sites.B ? Math.round(m.sites.B.cx) + ',' + Math.round(m.sites.B.cy) : 'none'));
  console.log('T spawns=' + m.spawns.t.length + ' first=' + (m.spawns.t[0] ? Math.round(m.spawns.t[0].x) + ',' + Math.round(m.spawns.t[0].y) : ''));
  console.log('CT spawns=' + m.spawns.ct.length + ' first=' + (m.spawns.ct[0] ? Math.round(m.spawns.ct[0].x) + ',' + Math.round(m.spawns.ct[0].y) : ''));
  console.log('chars=' + JSON.stringify(chars));
}
