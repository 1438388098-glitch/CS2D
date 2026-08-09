import assert from 'node:assert/strict';
import { registerMap } from '../src/registry.js';
import { loadMap, findMapById, getMap } from '../src/map.js';
import { canSeeInFog } from '../src/fog.js';
import { stuckObjective } from '../src/ai/stability.js';

const rows = [
  '########################################',
  '#...#...........#......................#',
  '#...#...........#......................#',
  '#...#...........#......................#',
  '########################################'
];
registerMap({ id: 'fog-stability', name: 'fog-stability', accent: '#888', rows });
loadMap({ id: 'fog-stability', name: 'fog-stability', rows, tile: 32 });

const viewer = { x: 80, y: 80, height: 0 };
const open = { x: 80, y: 96, height: 0 };
const wallBlocked = { x: 700, y: 80, height: 0 };

assert.equal(canSeeInFog({ smokes: [], opts: { fog: true } }, viewer, open), true, 'fog should keep open-lane visibility');
assert.equal(canSeeInFog({ smokes: [], opts: { fog: true } }, viewer, wallBlocked), false, 'fog should agree with wall LOS');
assert.equal(canSeeInFog({ smokes: [{ x: 200, y: 80, r: 50 }], opts: { fog: true } }, viewer, { x: 400, y: 80, height: 0 }), false, 'fog should agree with smoke LOS');
assert.equal(canSeeInFog({ smokes: [], opts: { fog: true } }, viewer, { x: 80, y: 1200, height: 0 }), false, 'fog should enforce vision radius');
assert.equal(canSeeInFog({ smokes: [], opts: {} }, viewer, wallBlocked), true, 'fog disabled should not restrict vision');

loadMap(findMapById('dust2'));
const map = getMap();
const siteA = map.sites.A;
assert.equal(stuckObjective({ team: 't', x: 0, y: 0 }, { tAttackSite: 'A', bomb: { planted: false } }).x, siteA.cx, 'stuck T should reroute to attack site');

const ctBot = { team: 'ct', role: 'b', anchorIdx: 1, x: 0, y: 0 };
const ctObj = stuckObjective(ctBot, { bomb: { planted: false } });
const holdB = map.holds.B;
if (holdB && holdB.anchors && holdB.anchors.length) {
  const p = holdB.anchors[ctBot.anchorIdx % holdB.anchors.length];
  assert.equal(ctObj.x, p.x, 'stuck CT should reroute to hold anchor');
  assert.equal(ctObj.y, p.y, 'stuck CT should reroute to hold anchor');
} else {
  const spawn = map.spawns.ct[0];
  assert.equal(ctObj.x, spawn.x, 'stuck CT should fall back to CT spawn');
  assert.equal(ctObj.y, spawn.y, 'stuck CT should fall back to CT spawn');
}

const bomb = { planted: true, x: 432, y: 300 };
assert.deepEqual(stuckObjective({ team: 'ct', role: 'b', x: 0, y: 0 }, { bomb }), { x: bomb.x, y: bomb.y }, 'stuck CT should reroute to planted bomb');

console.log('ai-fog-stuck: all PASS');
