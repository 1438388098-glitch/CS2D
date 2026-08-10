import { loadMap, findMapById, getMap, collideCircle, walkable, passable } from '../src/map.js';

loadMap(findMapById('dust2'));
const map = getMap();
if (!map || !map.grid) throw new Error('dust2 map failed to load');

let wall = null;
for (let ty = 1; ty < map.h - 1 && !wall; ty++) {
  for (let tx = 1; tx < map.w - 1; tx++) {
    if (walkable(tx, ty)) continue;
    if (walkable(tx - 1, ty) || walkable(tx + 1, ty) || walkable(tx, ty - 1) || walkable(tx, ty + 1)) {
      wall = { tx, ty };
      break;
    }
  }
}

if (!wall) throw new Error('no wall with walkable neighbor found');

const T = map.tile;
const ent = {
  x: wall.tx * T + T / 2,
  y: wall.ty * T + T / 2,
  moveRad: 10
};
collideCircle(ent);

if (!passable(ent.x, ent.y)) {
  throw new Error('collideCircle failed to push entity out of wall: ' + JSON.stringify({ wall, ent }));
}

console.log('collision-wall: PASS');
