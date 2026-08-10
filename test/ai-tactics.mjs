// AI tactics regression: balanced 5v5 role shells on official maps.
import '../src/modes.js';
import { assignRoles, recordRoundResult, enemyIsEco, teamIsArmed, teamIsEco, refreshLeadership, fillPlayerRole } from '../src/ai/roles.js';
import { hellMix } from '../src/ai/tactics.js';
import { hasPrefireIntel, idealRange, shouldTradePush, hasGoodGun, redistributeTLanes } from '../src/ai/shared.js';
import { shouldReactToIntel } from '../src/ai/decisions.js';
import { initInfo, report, query, MSG } from '../src/info.js';
import { createGame, startMatch, update } from '../src/game.js';
import { botActions } from '../src/ai/actions.js';

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
  const exec = g.roundPlan && g.roundPlan.execution;
  const tOk = tMain === g.roundPlan.mainN && tOther === g.roundPlan.otherN && tMid === g.roundPlan.midN;
  ok('T split ' + n, tOk, tRoles.join(',') + ' exec=' + exec);
  ok('CT split ' + n, cA >= 1 && cB >= 1 && cMid === 1 && cA + cB + cMid === 5, cRoles.join(','));
  ok('CT roamer ' + n, entities.filter((e) => e.team === 'ct' && e.ctRoamer).length === 1);
  const aIdx = entities.filter((e) => e.team === 'ct' && e.role === 'a').map((e) => e.anchorIdx).sort((x, y) => x - y);
  ok('CT anchors ' + n, aIdx[0] === 0 && aIdx[1] === 1, aIdx.join(','));
}


let fakeSeen = false;
let fakeDecoyOk = true;
for (let n = 0; n < 60; n++) {
  const gFake = { entities: [], seed: n + 3000, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: n + 1, ctPushRound: false };
  for (let i = 0; i < 5; i++) gFake.entities.push(bot('t', i), bot('ct', i));
  assignRoles(gFake);
  if (gFake.roundPlan.fake) {
    fakeSeen = true;
    const decoys = gFake.entities.filter((e) => e.team === 't' && e.decoy);
    if (decoys.length !== 1) fakeDecoyOk = false;
  }
}
ok('fake decoy assigned', !fakeSeen || fakeDecoyOk, 'fakeSeen=' + fakeSeen);

ok('good gun helper', hasGoodGun({ weapons: { primary: 'ak' } }) === true && hasGoodGun({ weapons: { primary: 'p250' } }) === false);
{
  const gRot = { entities: [], tAttackSite: 'A' };
  for (let i = 0; i < 3; i++) gRot.entities.push({ bot: true, team: 't', role: 'B', laneIdx: 0, objCache: null, objAt: 0, guardPoint: null });
  redistributeTLanes(gRot);
  ok('rotate lanes redistributed', gRot.entities.every((e) => e.role === 'A') && new Set(gRot.entities.map((e) => e.laneIdx)).size === 3, gRot.entities.map((e) => e.laneIdx).join(','));
}

{
  const gRush = { entities: [], seed: 909, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 4, ctPushRound: false, roundPlan: { execution: 'rush' } };
  for (let i = 0; i < 5; i++) gRush.entities.push(bot('t', i), bot('ct', i));
  assignRoles(gRush);
  ok('CT anti rush plan', gRush.ctPlan.antiRush === true, 'antiRush=' + gRush.ctPlan.antiRush);
  const ctAnchors = gRush.entities.filter((e) => e.team === 'ct' && e.role !== 'mid');
  ok('CT anti rush front hold', ctAnchors.every((e) => e.anchorIdx === 0), ctAnchors.map((e) => e.anchorIdx).join(','));
}

const planSet = new Set();
let lastPlan = null;
for (let n = 0; n < 20; n++) {
  const gPlan = { entities: [], seed: n + 100, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: n + 1, ctPushRound: false };
  for (let i = 0; i < 5; i++) gPlan.entities.push(bot('t', i), bot('ct', i));
  assignRoles(gPlan);
  lastPlan = gPlan;
  planSet.add(gPlan.roundPlan.execution + ':' + gPlan.roundPlan.variant);
}
{
  const gRole = { entities: [], seed: 4242, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 3, ctPushRound: false };
  for (let i = 0; i < 5; i++) gRole.entities.push(bot('t', i), bot('ct', i));
  assignRoles(gRole);
  const tMain = gRole.entities.filter((e) => e.team === 't' && e.role === gRole.tAttackSite);
  ok('T vanguard on main', tMain.some((e) => e.vanguard), 'main=' + tMain.map((e) => e.archetype).join(','));
  ok('T main has breacher', tMain.some((e) => e.archetype === 'breacher'), 'main=' + tMain.map((e) => e.archetype).join(','));
  const tVanguard = tMain.find((e) => e.vanguard);
  const tPartner = tMain.find((e) => e.tradePartner);
  ok('T trade partner assigned', !!tVanguard && !!tPartner && tPartner !== tVanguard, 'vanguard=' + (tVanguard ? tVanguard.archetype : 'none') + ' partner=' + (tPartner ? tPartner.archetype : 'none'));
  ok('T utility role exists', gRole.entities.some((e) => e.team === 't' && e.utilityRole));
  ok('CT utility role exists', gRole.entities.some((e) => e.team === 'ct' && e.utilityRole));
  const ctRoamer = gRole.entities.find((e) => e.team === 'ct' && e.ctRoamer);
  ok('CT roamer fits utility', !!ctRoamer && (ctRoamer.utilityRole || ctRoamer.archetype === 'rifler' || ctRoamer.role === 'mid'), ctRoamer ? ctRoamer.archetype + ' ' + ctRoamer.role : 'none');
  ok('executeAt in range', gRole.roundPlan.executeAt >= 5 && gRole.roundPlan.executeAt <= 25, 'executeAt=' + gRole.roundPlan.executeAt);
}

ok('round plans varied', planSet.size >= 12, 'plans=' + planSet.size);
const tacticPool = new Set();
for (let n = 0; n < 60; n++) {
  const gp = { entities: [], seed: n + 500, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: n + 1, ctPushRound: false, score: { T: n % 3, CT: 2 } };
  for (let i = 0; i < 5; i++) gp.entities.push(bot('t', i), bot('ct', i));
  assignRoles(gp);
  tacticPool.add(gp.roundPlan.execution);
}
ok('tactic pool varied', tacticPool.size >= 6, 'tactics=' + [...tacticPool].join(','));
ok('tactic flags', ['rush','fake','slow','contact','mid'].every((k) => lastPlan.roundPlan[k] === true || lastPlan.roundPlan[k] === false));
ok('ct plan independent', !!lastPlan.ctPlan && lastPlan.ctPlan.execution === 'ct' && lastPlan.ctPlan.variant !== lastPlan.roundPlan.variant);
{
  const gEco = { entities: [], seed: 999, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 5, ctPushRound: false };
  for (let i = 0; i < 5; i++) {
    const tb = bot('t', i); tb.money = 6000;
    const cb = bot('ct', i); cb.money = 400;
    gEco.entities.push(tb, cb);
  }
  assignRoles(gEco);
  ok('anti eco on enemy eco', gEco.roundPlan.antiEco === true && gEco.roundPlan.execution === 'antiEco', gEco.roundPlan.execution);
}
{
  const gOwn = { entities: [], seed: 998, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 5, ctPushRound: false };
  for (let i = 0; i < 5; i++) {
    const tb = bot('t', i); tb.money = 400;
    const cb = bot('ct', i); cb.money = 6000;
    gOwn.entities.push(tb, cb);
  }
  assignRoles(gOwn);
  ok('no anti eco on own eco', gOwn.roundPlan.antiEco === false, gOwn.roundPlan.execution);
  ok('eco plant priority', gOwn.roundPlan.plantPriority === true, 'plantPriority=' + gOwn.roundPlan.plantPriority);
}
ok('enemy eco helper', enemyIsEco({ entities: [{ bot: true, team: 'ct', money: 300 }, { bot: true, team: 'ct', money: 500 }] }) === true);
ok('armed helper', teamIsArmed({ entities: [{ bot: true, team: 't', money: 0 }, { bot: true, team: 't', money: 3000 }] }) === true);
ok('sniper keeps range', idealRange({ archetype: 'sniper' }, { idealMin: 200, idealMax: 550 }).min > 300 && idealRange({ archetype: 'sniper' }, { idealMin: 200, idealMax: 550 }).max > 800);
ok('breacher closes range', idealRange({ archetype: 'breacher' }, { idealMin: 200, idealMax: 550 }).max < 500);
{
  const g = { entities: [], seed: 777, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 5, ctPushRound: false };
  for (let i = 0; i < 5; i++) {
    const tb = bot('t', i); tb.money = 400;
    const cb = bot('ct', i); cb.money = 6000;
    g.entities.push(tb, cb);
  }
  assignRoles(g);
  ok('ct anti eco on t eco', g.ctPlan.antiEco === true && g.ctPush === false, 'anti=' + g.ctPlan.antiEco + ' push=' + g.ctPush);
}
{
  const g = { entities: [], seed: 776, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 5, ctPushRound: false };
  for (let i = 0; i < 5; i++) {
    const tb = bot('t', i); tb.money = 6000;
    const cb = bot('ct', i); cb.money = 400;
    g.entities.push(tb, cb);
  }
  assignRoles(g);
  ok('no ct anti eco on ct eco', g.ctPlan.antiEco === false && g.ctPush === false, 'anti=' + g.ctPlan.antiEco + ' push=' + g.ctPush);
}
ok('team eco helper', teamIsEco({ entities: [{ bot: true, team: 't', money: 300 }, { bot: true, team: 't', money: 500 }] }, 't') === true);
const killAt = { type: 'kill', x: 300, y: 0, age: 0.5 };
ok('aggressive bot trades', shouldTradePush({ x: 0, y: 0, archetype: 'breacher', personality: { aggression: 0.6 }, hasBomb: false, aimTarget: null, defuseT: 0 }, killAt) === true);
ok('conservative bot holds', shouldTradePush({ x: 0, y: 0, archetype: 'support', personality: { aggression: 0.4 }, hasBomb: false, aimTarget: null, defuseT: 0 }, killAt) === false);
ok('bomb carrier no trade', shouldTradePush({ x: 0, y: 0, archetype: 'breacher', personality: { aggression: 0.6 }, hasBomb: true, aimTarget: null, defuseT: 0 }, killAt) === false);
{
  const g = { entities: [], seed: 111, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 2, ctPushRound: false, time: 0 };
  for (let i = 0; i < 5; i++) g.entities.push(bot('t', i), bot('ct', i));
  assignRoles(g);
  const tIgl = g.entities.find((e) => e.team === 't' && e.igl);
  tIgl.dead = true;
  refreshLeadership(g);
  const aliveIgl = g.entities.filter((e) => e.team === 't' && !e.dead && e.igl);
  const deadIgl = g.entities.filter((e) => e.team === 't' && e.dead && e.igl);
  ok('igl succession', aliveIgl.length === 1 && deadIgl.length === 0, 'alive=' + aliveIgl.length + ' dead=' + deadIgl.length);
}
{
  const g = { entities: [], seed: 222, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 2, ctPushRound: false, time: 0 };
  for (let i = 0; i < 5; i++) g.entities.push(bot('t', i), bot('ct', i));
  assignRoles(g);
  const roamer = g.entities.find((e) => e.team === 'ct' && e.ctRoamer);
  roamer.dead = true;
  refreshLeadership(g);
  const aliveRoamer = g.entities.filter((e) => e.team === 'ct' && !e.dead && e.ctRoamer);
  ok('roamer succession', aliveRoamer.length === 1, 'roamers=' + aliveRoamer.length);
}
{
  const g = { entities: [], seed: 333, tAttackSite: null, tSwitchedAt: 0, tRush: false, adaptive: null, round: 2, ctPushRound: false, time: 0 };
  for (let i = 0; i < 5; i++) g.entities.push(bot('t', i), bot('ct', i));
  assignRoles(g);
  const tAlive = g.entities.filter((e) => e.team === 't');
  for (const e of tAlive) e.escort = false;
  tAlive[0].hasBomb = true;
  refreshLeadership(g);
  const carrier = tAlive.find((e) => e.hasBomb);
  const escorts = tAlive.filter((e) => e.escort && e !== carrier);
  ok('escort succession', escorts.length >= 1, 'escorts=' + escorts.length);
}
{
  const carrier = bot('t', 9); carrier.hasBomb = true; carrier.x = 50; carrier.y = 60;
  const player = { name: 'p', dead: true, team: 't', x: 10, y: 10 };
  const g = { player, entities: [carrier], tOrder: { type: 'follow', at: 0, x: 10, y: 10 }, roundTime: 5, round: 3, time: 0 };
  fillPlayerRole(g);
  ok('player death follow retarget', !!g.tOrder && g.tOrder.type === 'follow' && Math.abs(g.tOrder.x - carrier.x) < 5 && Math.abs(g.tOrder.y - carrier.y) < 5, JSON.stringify(g.tOrder));
}

{
  const gAd = { adaptive: null, tAttackSite: 'A', roundPlan: { execution: 'rush', rush: true } };
  recordRoundResult(gAd, 't');
  recordRoundResult(gAd, 't');
  recordRoundResult(gAd, 'ct');
  ok('adaptive site tracking', gAd.adaptive.T.siteAttempts.A === 3 && gAd.adaptive.T.siteWins.A === 2 && gAd.adaptive.T.execWins.rush === 2 && gAd.adaptive.CT.siteDefends.A === 3 && gAd.adaptive.CT.siteWins.A === 1);
}
const hellA = hellMix(20260803);
const hellB = hellMix(20260804);
ok('hell mix params', ['react', 'spreadMult', 'view', 'strafe', 'aimSpeed', 'idealMin', 'idealMax', 'peekChance', 'nadeUse', 'riskT', 'rushChance', 'rotateChance', 'saveChance'].every((k) => Number.isFinite(hellA.params[k])));
ok('hell mix style', hellA.style.includes('H') && hellB.style.includes('H'));
ok('hell mix distinct', hellA.variant !== hellB.variant || hellA.params.rushChance !== hellB.params.rushChance);

{
  const g = createGame({ mode: 'cyber', seed: 90210 });
  g.seed = 90210;
  g.opts.cyber = { leftId: 'navi', rightId: 'vitality', mapId: 'canal', bet: 50, side: 'left' };
  startMatch(g);
  const bots = g.entities.filter((e) => e.bot);
  ok('cyber hell mix', bots.length === 10 && bots.every((e) => e.aiParams && e.aiParams.tacticalMix && e.aiParams.tacticalMix.includes('H')));
  const variants = new Set(bots.map((e) => e.aiParams.tacticalVariant));
  ok('cyber hell variants', variants.size >= 5, 'variants=' + variants.size);
}

{
  const g = createGame({ mode: 'cyber', seed: 11 });
  g.seed = 11;
  g.opts.cyber = { leftId: 'g2', rightId: 'navi', mapId: 'dust2', bet: 50, side: 'right' };
  startMatch(g);
  const ct = g.entities.find((e) => e.bot && e.team === 'ct' && e.weapons.primary);
  ct.aimTarget = null;
  ct.lastKnown = null;
  ct.lastKnownT = 99;
  ct.memory = [];
  ct.prefireCount = 3;
  ct.prefireX = ct.x + 120;
  ct.prefireY = ct.y;
  const ammoBefore = ct.ammoMap[ct.weapons.primary] || 0;
  botActions(ct, g, 1 / 30);
  ok('prefire needs intel', ct.prefireCount === 0 && ct.trigger !== true && (ct.ammoMap[ct.weapons.primary] || 0) === ammoBefore);
}

ok('prefire intel helper', !hasPrefireIntel({ lastKnown: null, lastKnownT: 99, memory: [] }, { time: 10 }));
ok('prefire intel with lastKnown', hasPrefireIntel({ lastKnown: { x: 1, y: 1 }, lastKnownT: 0.5, memory: [] }, { time: 10 }));

{
  const g = { time: 10, info: null };
  initInfo(g);
  const bot = { bot: true, team: 't', lastReport: {}, aiParams: { intel: true } };
  report(g, bot, MSG.FOCUS, 500, 400);
  const q = query(g, bot);
  ok('focus comms', !!q && q.type === MSG.FOCUS && Math.abs(q.x - 500) < 5 && Math.abs(q.y - 400) < 5);
}

ok('focus role offside', shouldReactToIntel({ team: 't', role: 'B', hasBomb: false }, { tAttackSite: 'A', roundTime: 10, bomb: null }, MSG.FOCUS, 0, 0) === false);
ok('focus role main', shouldReactToIntel({ team: 't', role: 'A', hasBomb: false }, { tAttackSite: 'A', roundTime: 10, bomb: null }, MSG.FOCUS, 0, 0) === true);
ok('focus role bomb carrier', shouldReactToIntel({ team: 't', role: 'A', hasBomb: true }, { tAttackSite: 'A', roundTime: 10, bomb: null }, MSG.FOCUS, 0, 0) === false);

for (let i = 0; i < 5; i++) update(createGame({ mode: 'cyber', seed: i + 100 }), 1 / 30);
process.exit(failed ? 1 : 0);
