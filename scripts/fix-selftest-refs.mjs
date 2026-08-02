import { readFileSync, writeFileSync } from 'fs';
let s = readFileSync('D:/Claudeworkspace/CS2D/test/selftest.js', 'utf8');
const pairs = [
  ["import { WEAPONS, SITES } from '../src/config.js';", "import { WEAPONS } from '../src/config.js';"],
  ["import { los, aStar, nearestWalkable, walkable, getMapDiagnostics, getGrid, SPAWNS } from '../src/map.js';",
   "import { los, aStar, nearestWalkable, walkable, getMapDiagnostics, getGrid, getMap, findMapById } from '../src/map.js';"],
  ['SITES.A.cx', 'getMap().sites.A.cx'],
  ['SITES.A.cy', 'getMap().sites.A.cy'],
  ['SITES.B.cx', 'getMap().sites.B.cx'],
  ['SITES.B.cy', 'getMap().sites.B.cy'],
  ['SPAWNS.t[0]', 'getMap().spawns.t[0]']
];
for (const [from, to] of pairs) {
  if (!s.includes(from)) { console.log('MISS: ' + from.slice(0, 50)); continue; }
  s = s.split(from).join(to);
}
writeFileSync('D:/Claudeworkspace/CS2D/test/selftest.js', s);
console.log('done');
