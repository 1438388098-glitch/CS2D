import { readFileSync, writeFileSync } from 'fs';
const base = 'D:/Claudeworkspace/CS2D/src/';
function patch(f, pairs) {
  let s = readFileSync(base + f, 'utf8');
  let changed = 0;
  for (const [from, to] of pairs) {
    if (!s.includes(from)) { console.log(f + ' MISS: ' + from.slice(0, 70)); continue; }
    s = s.split(from).join(to);
    changed++;
  }
  writeFileSync(base + f, s);
  console.log(f + ' patched (' + changed + '/' + pairs.length + ')');
}

patch('game.js', [
  ["import { WEAPONS, ECONOMY, ROUND, SITES, W, H } from './config.js';",
   "import { WEAPONS, ECONOMY, ROUND, findMapById } from './config.js';"],
  ["import { SPAWNS, collideCircle, inSite } from './map.js';",
   "import { getMap, loadMap, collideCircle, inSite } from './map.js';"],
  ["    mapW: W, mapH: H, canvasW: 1280, canvasH: 720,",
   "    mapW: 2400, mapH: 1800, canvasW: 1280, canvasH: 720,"],
  ["  game.mapW = W;\n  game.mapH = H;",
   "  game.mapW = getMap().W;\n  game.mapH = getMap().H;"],
  ["    const list = e.team === 'ct' ? SPAWNS.ct : SPAWNS.t;",
   "    const list = e.team === 'ct' ? getMap().spawns.ct : getMap().spawns.t;"],
  ["    if (game.layers) game.layers.decal.getContext('2d').clearRect(0, 0, W, H);",
   "    if (game.layers) game.layers.decal.getContext('2d').clearRect(0, 0, getMap().W, getMap().H);"],
  ["      const inA = inSite(p.x, p.y, SITES.A), inB = inSite(p.x, p.y, SITES.B);",
   "      const inA = inSite(p.x, p.y, getMap().sites.A), inB = inSite(p.x, p.y, getMap().sites.B);"],
  ["    const cs = game.tAttackSite === 'A' ? SITES.A : SITES.B;\n    return { x: 1200, y: 900 };",
   "    const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;\n    return { x: getMap().center.x, y: getMap().center.y };"]
]);

patch('ai.js', [
  ["import { WEAPONS, DIFF, PRICES, SITES, BOT_AI, CT_HOLD } from './config.js';",
   "import { WEAPONS, DIFF, PRICES, BOT_AI } from './config.js';"],
  ["import { los, pathTo, followPath, nearestSite } from './map.js';",
   "import { los, pathTo, followPath, nearestSite, getMap } from './map.js';"],
  ["    const cs2 = game.tAttackSite === 'A' ? SITES.A : SITES.B;",
   "    const cs2 = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;"],
  ["    const hold = e.role === 'a' ? CT_HOLD.A : CT_HOLD.B;",
   "    const hold = e.role === 'a' ? getMap().holds.A : getMap().holds.B;"],
  ["    const site2 = game.bomb.site === 'A' ? SITES.A : SITES.B;",
   "    const site2 = game.bomb.site === 'A' ? getMap().sites.A : getMap().sites.B;"],
  ["    const cs = game.tAttackSite === 'A' ? SITES.A : SITES.B;",
   "    const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;"],
  ["    if (e.role === 'A') return { x: SITES.A.cx + rand(-120, 120), y: SITES.A.cy + rand(-60, 60) };",
   "    if (e.role === 'A') return { x: getMap().sites.A.cx + rand(-120, 120), y: getMap().sites.A.cy + rand(-60, 60) };"],
  ["    if (e.role === 'B') return { x: SITES.B.cx + rand(-120, 120), y: SITES.B.cy + rand(-60, 60) };",
   "    if (e.role === 'B') return { x: getMap().sites.B.cx + rand(-120, 120), y: getMap().sites.B.cy + rand(-60, 60) };"],
  ["    return { x: 1200, y: 900 };",
   "    return { x: getMap().center.x, y: getMap().center.y };"],
  ["      const site = game.tAttackSite === 'A' ? SITES.A : SITES.B;",
   "      const site = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;"],
  ["      const cs = game.tAttackSite === 'A' ? SITES.A : SITES.B;",
   "      const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;"]
]);

patch('bomb.js', [
  ["import { SITES, ROUND, ECONOMY } from './config.js';",
   "import { ROUND, ECONOMY } from './config.js';"],
  ["import { inSite, nearestSite } from './map.js';",
   "import { inSite, nearestSite, getMap } from './map.js';"],
  ["  const inA = inSite(e.x, e.y, SITES.A), inB = inSite(e.x, e.y, SITES.B);",
   "  const inA = inSite(e.x, e.y, getMap().sites.A), inB = inSite(e.x, e.y, getMap().sites.B);"],
  ["  const s = inA ? SITES.A : SITES.B;",
   "  const s = inA ? getMap().sites.A : getMap().sites.B;"]
]);

patch('render.js', [
  ["import { WEAPONS, SITES, DROP_COL } from './config.js';",
   "import { WEAPONS, DROP_COL } from './config.js';"],
  ["import { weaponDef } from './entities.js';",
   "import { weaponDef } from './entities.js';\nimport { getMap } from './map.js';"],
  ["  ctx.strokeRect(SITES.A.x0, SITES.A.y0, SITES.A.x1 - SITES.A.x0, SITES.A.y1 - SITES.A.y0);",
   "  ctx.strokeRect(map.sites.A.x0, map.sites.A.y0, map.sites.A.x1 - map.sites.A.x0, map.sites.A.y1 - map.sites.A.y0);"],
  ["  ctx.strokeRect(SITES.B.x0, SITES.B.y0, SITES.B.x1 - SITES.B.x0, SITES.B.y1 - SITES.B.y0);",
   "  ctx.strokeRect(map.sites.B.x0, map.sites.B.y0, map.sites.B.x1 - map.sites.B.x0, map.sites.B.y1 - map.sites.B.y0);"]
]);
console.log('all done');
