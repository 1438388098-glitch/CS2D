// AI tactics regression: balanced 5v5 role shells on official maps.
import { assignRoles } from '../src/ai/roles.js';

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

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

for (let n = 0; n < 20; n++) {
  const entities = [];
  for (let i = 0; i < 5; i++) entities.push(bot('t', i), bot('ct', i));
  const g = { entities, seed: n + 1, tAttackSite: null, tSwitchedAt: 0, tRush: false, playerKills: [] };
  assignRoles(g);
  const tRoles = entities.filter((e) => e.team === 't').map((e) => e.role);
  const cRoles = entities.filter((e) => e.team === 'ct').map((e) => e.role);
  const tMain = tRoles.filter((r) => r === g.tAttackSite).length;
  const tOther = tRoles.filter((r) => r !== g.tAttackSite && r !== 'mid').length;
  const tMid = tRoles.filter((r) => r === 'mid').length;
  const cA = cRoles.filter((r) => r === 'a').length;
  const cB = cRoles.filter((r) => r === 'b').length;
  const cMid = cRoles.filter((r) => r === 'mid').length;
  ok('T split ' + n, tMain === 3 && tOther === 1 && tMid === 1, tRoles.join(','));
  ok('CT split ' + n, cA === 2 && cB === 2 && cMid === 1, cRoles.join(','));
  ok('CT roamer ' + n, entities.filter((e) => e.team === 'ct' && e.ctRoamer).length === 1);
  const aIdx = entities.filter((e) => e.team === 'ct' && e.role === 'a').map((e) => e.anchorIdx).sort((x, y) => x - y);
  ok('CT anchors ' + n, aIdx[0] === 0 && aIdx[1] === 1, aIdx.join(','));
}
process.exit(failed ? 1 : 0);
