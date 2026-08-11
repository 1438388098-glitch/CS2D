import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

const g = createGame({ team: 'ct', diff: 'normal', bots: 8, mapId: 'dust2', mode: 'classic', seed: 7 });
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, g);
startMatch(g);
g.state = 'LIVE';
g.roundTime = 0;
g.freezeT = 0;
g.buyTime = 0;
g.time = 1;
g.player.dead = true;
g.diagMotion = true;

const dt = 1 / 60;
const prev = new Map();
const post = new Map();
const agg = new Map();

function spd(x, y) {
  return Math.hypot(x || 0, y || 0);
}

function runStats(seq) {
  let runs = 0;
  let maxRun = 0;
  let cur = 0;
  let last = false;
  for (const low of seq) {
    if (low) {
      if (!last) runs++;
      cur++;
      if (cur > maxRun) maxRun = cur;
      last = true;
    } else {
      cur = 0;
      last = false;
    }
  }
  return { runs, maxRun };
}

for (let i = 0; i < 900; i++) {
  update(g, dt);
  for (const e of g.entities) {
    if (!e.bot || e.dead) continue;
    if (!post.has(e)) post.set(e, { x: e.x, y: e.y, vx: e.vx, vy: e.vy });
    const p = post.get(e);
    const move = Math.hypot(e.x - p.x, e.y - p.y);
    const damped = spd(e.vx, e.vy);
    let a = agg.get(e);
    if (!a) {
      a = { samples: 0, actionStops: 0, brakeSlide: 0, slowStart: 0, actionSlowRuns: 0, dampedStops: 0, dampedStarts: 0, highRun: 0, lowRun: 0, wall: 0, maxBrake: 0, maxSlowStart: 0, lastDamped: 0, actSeq: [], moveSeq: [], stopRuns: 0, moveRuns: 0, maxStopRun: 0, maxMoveRun: 0 };
      agg.set(e, a);
    }
    const diag = e._motionDiag && e._motionDiag[e._motionDiag.length - 1];
    if (diag) {
      const think = spd(diag.thinkVx, diag.thinkVy);
      const act = spd(diag.actVx, diag.actVy);
      const smooth = spd(diag.smoothVx, diag.smoothVy);
      const prevSpd = spd(diag.prevVx, diag.prevVy);
      a.samples++;
      if (think >= 100 && act < 12) {
        a.actionStops++;
        a.actionSlowRuns += think / Math.max(1, act);
      }
      if (act < 12 && smooth > 70) {
        a.brakeSlide++;
        a.maxBrake = Math.max(a.maxBrake, smooth);
      }
      if (act >= 100 && prevSpd < 30 && smooth < 80) {
        a.slowStart++;
        a.maxSlowStart = Math.max(a.maxSlowStart, smooth);
      }
      if (act >= 100) a.highRun++;
      if (act < 12) a.lowRun++;
      a.actSeq.push(act < 12);
    }
    if (i > 0) {
      if (a.lastDamped >= 100 && damped < 12) a.dampedStops++;
      if (a.lastDamped < 12 && damped >= 95) a.dampedStarts++;
    }
    const movedNow = move / dt;
    const diagPrev = diag || null;
    if (diagPrev && spd(diagPrev.smoothVx, diagPrev.smoothVy) > 40 && movedNow < 14) {
      a.wall++;
    }
    a.moveSeq.push(movedNow < 14);
    a.lastDamped = damped;
    post.set(e, { x: e.x, y: e.y, vx: e.vx, vy: e.vy });
  }
}

let T = { samples: 0, actionStops: 0, brakeSlide: 0, slowStart: 0, dampedStops: 0, dampedStarts: 0, highRun: 0, lowRun: 0, wall: 0 };
for (const [name, a] of agg) {
  const st = runStats(a.actSeq);
  const mv = runStats(a.moveSeq);
  a.stopRuns = st.runs;
  a.maxStopRun = st.maxRun;
  a.moveRuns = mv.runs;
  a.maxMoveRun = mv.maxRun;
  T.samples += a.samples;
  T.actionStops += a.actionStops;
  T.brakeSlide += a.brakeSlide;
  T.slowStart += a.slowStart;
  T.dampedStops += a.dampedStops;
  T.dampedStarts += a.dampedStarts;
  T.highRun += a.highRun;
  T.lowRun += a.lowRun;
  T.wall += a.wall;
  console.log(JSON.stringify({ samples: a.samples, actionStops: a.actionStops, brakeSlide: a.brakeSlide, slowStart: a.slowStart, maxBrake: Math.round(a.maxBrake), maxSlowStart: Math.round(a.maxSlowStart), highRun: a.highRun, lowRun: a.lowRun, wall: a.wall, stopRuns: a.stopRuns, maxStopRun: a.maxStopRun, moveRuns: a.moveRuns, maxMoveRun: a.maxMoveRun, dampedStops: a.dampedStops, dampedStarts: a.dampedStarts }));
}
console.log('TOTAL ' + JSON.stringify(T));

for (const [name, a] of agg) {
  const e = [...agg.keys()].find((x) => x === name);
  if (!e) continue;
  const arr = e._motionDiag || [];
  const idx = arr.findIndex((d) => spd(d.actVx, d.actVy) < 12 && spd(d.smoothVx, d.smoothVy) > 70);
  if (idx >= 0) {
    console.log('sample near brakeSlide ' + JSON.stringify(arr.slice(Math.max(0, idx - 4), idx + 16).map((d) => ({
      prev: Math.round(spd(d.prevVx, d.prevVy)),
      think: Math.round(spd(d.thinkVx, d.thinkVy)),
      act: Math.round(spd(d.actVx, d.actVy)),
      smooth: Math.round(spd(d.smoothVx, d.smoothVy)),
      path: d.pathLen,
      pathI: d.pathI,
      obj: d.objCache,
      objD: d.objX === undefined || d.objY === undefined ? null : Math.round(Math.hypot(d.x - d.objX, d.y - d.objY)),
      objKey: d.objKey,
      nearKey: d.nearObjKey,
      aim: d.aimTarget,
      aimAfter: d.aimAfter,
      corner: d.cornerAimT,
      walking: d.walking,
      repath: d.repathT && d.repathT.toFixed(2),
      trigger: d.trigger
    }))));
    break;
  }
}

for (const [name, a] of agg) {
  if (a.stopRuns < 3 || a.maxStopRun < 4 || a.maxStopRun > 120) continue;
  const e = [...agg.keys()].find((x) => x === name);
  if (!e) continue;
  const arr = e._motionDiag || [];
  let idx = -1;
  for (let i = 1; i < arr.length - 2; i++) {
    if (spd(arr[i - 1].actVx, arr[i - 1].actVy) >= 100 &&
        spd(arr[i].actVx, arr[i].actVy) < 12 &&
        spd(arr[i + 1].actVx, arr[i + 1].actVy) >= 100) {
      idx = i;
      break;
    }
  }
  if (idx < 0) continue;
  console.log('sample stop-start ' + JSON.stringify(arr.slice(Math.max(0, idx - 4), idx + 14).map((d) => ({
    prev: Math.round(spd(d.prevVx, d.prevVy)),
    think: Math.round(spd(d.thinkVx, d.thinkVy)),
    act: Math.round(spd(d.actVx, d.actVy)),
    smooth: Math.round(spd(d.smoothVx, d.smoothVy)),
    path: d.pathLen,
    pathI: d.pathI,
    obj: d.objCache,
    objD: d.objX === undefined || d.objY === undefined ? null : Math.round(Math.hypot(d.x - d.objX, d.y - d.objY)),
    objKey: d.objKey,
    nearKey: d.nearObjKey,
    aim: d.aimTarget,
    aimAfter: d.aimAfter,
    corner: d.cornerAimT && d.cornerAimT.toFixed(2),
    walking: d.walking,
    repath: d.repathT && d.repathT.toFixed(2),
    trigger: d.trigger
  }))));
  break;
}
