import { readFileSync, writeFileSync } from 'fs';
const base = 'D:/Claudeworkspace/CS2D/src/';
function patch(f, pairs) {
  let s = readFileSync(base + f, 'utf8');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) { console.log(f + ' MISS: ' + from.slice(0, 70)); continue; }
    s = s.split(from).join(to);
  }
  writeFileSync(base + f, s);
}
patch('game.js', [
  ["  if (game.layers) game.layers.decal.getContext('2d').clearRect(0, 0, W, H);",
   "  if (game.layers) game.layers.decal.getContext('2d').clearRect(0, 0, getMap().W, getMap().H);"],
  ["    const cs = game.tAttackSite === 'A' ? SITES.A : SITES.B;",
   "    const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;"]
]);
patch('ai.js', [
  ["  if (e.role === 'A') return { x: SITES.A.cx + rand(-120, 120), y: SITES.A.cy + rand(-60, 60) };",
   "  if (e.role === 'A') return { x: getMap().sites.A.cx + rand(-120, 120), y: getMap().sites.A.cy + rand(-60, 60) };"],
  ["  if (e.role === 'B') return { x: SITES.B.cx + rand(-120, 120), y: SITES.B.cy + rand(-60, 60) };",
   "  if (e.role === 'B') return { x: getMap().sites.B.cx + rand(-120, 120), y: getMap().sites.B.cy + rand(-60, 60) };"]
]);
patch('render.js', [
  ["function drawBombSiteMarks(game) {",
   "function drawBombSiteMarks(game) {\n  const map = getMap();"]
]);
console.log('done');
