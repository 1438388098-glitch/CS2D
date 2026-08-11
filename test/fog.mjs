import { registerMap } from '../src/registry.js';
import { loadMap, getMap } from '../src/map.js';
import { fogEnabled, canSeeInFog, castRayEndpoint, castVisionPolygon, fogVisionRadius } from '../src/fog.js';

const rows = [
  '##########',
  '#........#',
  '#...######',
  '#........#',
  '#........#',
  '##########'
];
registerMap({ id: 'fog-test', name: 'fog-test', accent: '#888', rows });
loadMap({ id: 'fog-test', name: 'fog-test', rows, tile: 32 });
const game = { smokes: [], opts: { fog: true } };

function ok(name, cond) {
  if (!cond) throw new Error('fog: ' + name + ' FAIL');
  console.log('fog: ' + name + ' PASS');
}

ok('fog range helper', canSeeInFog(game, { x: 0, y: 0 }, { x: 100, y: 0 }, 200) === true && canSeeInFog(game, { x: 0, y: 0 }, { x: 300, y: 0 }, 200) === false && canSeeInFog({ opts: {} }, { x: 0, y: 0 }, { x: 300, y: 0 }, 200) === true);

ok('enabled flag', fogEnabled(game) === true && fogEnabled({ opts: {} }) === false);

ok('map-level vision radius', Math.abs(fogVisionRadius(game) - (Math.hypot(320, 192) + 32)) < 0.001);
ok('far open lane remains visible', canSeeInFog(game, { x: 80, y: 128 }, { x: 280, y: 128 }) === true);

const east = castRayEndpoint(game, 80, 80, 0, 64, 8);
const south = castRayEndpoint(game, 80, 80, Math.PI / 2, 64, 8);
const farEast = castRayEndpoint(game, 80, 128, 0, undefined, 8);
ok('wall blocks ray', Math.hypot(east.x - 80, east.y - 80) < 60);
ok('open lane reaches radius', Math.hypot(south.x - 80, south.y - 80) >= 63);
ok('open lane reaches map edge', farEast.x > 270);

const poly = castVisionPolygon(game, 80, 80, 64, 36);
ok('polygon shape', poly.length === 36 && poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

console.log('fog: all PASS');
