import { assignRoles } from '../src/ai/roles.js';
import { applyTeammateSeparation } from '../src/ai/core.js';
import { createGame, startMatch } from '../src/game.js';
import { getMap } from '../src/map.js';
import { angDiff } from '../src/utils.js';
import { spreadPoint } from '../src/ai/decisions.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

function bot(team, i) {
  return {
    bot: true, team, name: 'b' + i,
    role: null, rushMode: false, vanguard: false,
    objCache: null, objAt: 0, guardPoint: null,
    igl: false, ctRoamer: false, anchorIdx: 0,
    archetype: 'rifler',
    personality: { aggression: 0.6, riskT: 0.6, teamwork: 0.6, steadiness: 0.6 }
  };
}

const entities = [];
for (let i = 0; i < 5; i++) entities.push(bot('t', i), bot('ct', i));
const g = { entities, seed: 42, tAttackSite: null, tSwitchedAt: 0, tRush: false, playerKills: [] };
assignRoles(g);
for (const team of ['t', 'ct']) {
  const bots = entities.filter((e) => e.team === team);
  const idx = bots.map((e) => e.spreadIdx);
  ok(team + ' spreadIdx unique', new Set(idx).size === idx.length, idx.join(','));
}

const p0 = spreadPoint({ spreadIdx: 0, x: 0, y: 0 }, 100, 100, 70, 190);
const p1 = spreadPoint({ spreadIdx: 1, x: 0, y: 0 }, 100, 100, 70, 190);
const p2 = spreadPoint({ spreadIdx: 2, x: 0, y: 0 }, 100, 100, 70, 190);
ok('spread points separated', Math.hypot(p0.x - p1.x, p0.y - p1.y) > 80 && Math.hypot(p1.x - p2.x, p1.y - p2.y) > 80,
  'd01=' + Math.round(Math.hypot(p0.x - p1.x, p0.y - p1.y)) + ' d12=' + Math.round(Math.hypot(p1.x - p2.x, p1.y - p2.y)));

{
  const g = createGame({ mapId: 'dust2', bots: 5 });
  startMatch(g);
  const ts = new Set(g.entities.filter((e) => e.bot && e.team === 't').map((e) => e.x + ',' + e.y));
  const cs = new Set(g.entities.filter((e) => e.bot && e.team === 'ct').map((e) => e.x + ',' + e.y));
  const wantT = Math.min(5, getMap().spawns.t.length);
  const wantC = Math.min(5, getMap().spawns.ct.length);
  const tTarget = getMap().spawns.ct[0];
  const facing = g.entities.filter((e) => e.bot && e.team === 't').every((e) => Math.abs(angDiff(e.angle, Math.atan2(tTarget.y - e.y, tTarget.x - e.x))) < 0.8);
  ok('bots face enemy half on spawn', facing);
  ok('team spawns distributed', ts.size >= wantT && cs.size >= wantC,
    't=' + ts.size + ' ct=' + cs.size);
}

{
  const a = { x: 300, y: 300, dead: false, team: 't', anchorIdx: 0 };
  const b = { x: 300, y: 300, dead: false, team: 't', anchorIdx: 1 };
  const g = { entities: [a, b] };
  applyTeammateSeparation(a, g);
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  ok('same spot teammates separated', d > 0 && d < 80, 'd=' + d.toFixed(1));
}

console.log('ai-spacing: all PASS');
process.exit(failed ? 1 : 0);