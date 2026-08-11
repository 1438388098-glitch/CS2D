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
const bots = g.entities.filter((e) => e.bot && !e.dead);
const lastMode = new Map();
const lastSpeed = new Map();
const lastStopAt = new Map();
const openStop = new Map();
const events = [];
const reasons = {};
const modeSeq = new Map();

function spd(vx, vy) {
  return Math.hypot(vx || 0, vy || 0);
}

function stopReason(e, diag) {
  const at = e.aimTarget || diag.aimTarget;
  const objD = Number.isFinite(diag.objX) ? Math.hypot(diag.x - diag.objX, diag.y - diag.objY) : null;
  const nearHold = objD !== null && objD < 48;
  const corner = diag.cornerAimT !== undefined && diag.cornerAimT > 0;
  const peek = e.peekT > 0 || (e.peekAt !== undefined && g.time - e.peekAt < 1.6);
  if (corner) return 'corner';
  if (peek) return 'peek';
  if (e.defuseT > 0) return 'defuse';
  if (e.plantT > 0) return 'plant';
  if (nearHold) return 'hold';
  if (at) return 'combat';
  if (diag.pathLen > 0) return 'path';
  if (e.lastKnown) return 'lastKnown';
  return 'other';
}

function runs(seq) {
  const out = { moveRuns: 0, stopRuns: 0, maxMoveRun: 0, maxStopRun: 0, slowRun: 0 };
  let cur = 0;
  let last = null;
  for (const s of seq) {
    if (s === last) cur++;
    else {
      if (last === 'move') { out.moveRuns++; out.maxMoveRun = Math.max(out.maxMoveRun, cur); }
      if (last === 'stop') { out.stopRuns++; out.maxStopRun = Math.max(out.maxStopRun, cur); }
      cur = 1;
      last = s;
    }
  }
  if (last === 'move') { out.moveRuns++; out.maxMoveRun = Math.max(out.maxMoveRun, cur); }
  if (last === 'stop') { out.stopRuns++; out.maxStopRun = Math.max(out.maxStopRun, cur); }
  return out;
}

for (let i = 0; i < 900; i++) {
  update(g, dt);
  const t = i * dt;
  for (const e of bots) {
    if (e.dead) continue;
    const diag = e._motionDiag && e._motionDiag[e._motionDiag.length - 1];
    if (!diag) continue;
    const speed = spd(e.vx, e.vy);
    const mode = speed < 12 ? 'stop' : speed < 80 ? 'slow' : 'move';
    const prev = lastMode.get(e);
    if (!prev) {
      lastMode.set(e, mode);
      lastSpeed.set(e, speed);
      modeSeq.set(e, [mode]);
      continue;
    }
    const seq = modeSeq.get(e);
    seq.push(mode);
    if (mode === 'stop' && prev !== 'stop') {
      const lastAt = lastStopAt.get(e) || -999;
      const gap = lastAt < 0 ? null : t - lastAt;
      const event = {
        bot: e.name || e.id || 'bot',
        at: Math.round(t * 100) / 100,
        gapMs: gap === null ? null : Math.round(gap * 1000),
        duration: null,
        reason: stopReason(e, diag),
        lastSpeed: Math.round((lastSpeed.get(e) || 0) * 10) / 10,
        speed: Math.round(speed * 10) / 10,
        aim: !!(e.aimTarget || diag.aimTarget),
        corner: diag.cornerAimT !== undefined && diag.cornerAimT > 0,
        peek: e.peekT > 0 || (e.peekAt !== undefined && g.time - e.peekAt < 1.6),
        hold: Number.isFinite(diag.objX) && Math.hypot(diag.x - diag.objX, diag.y - diag.objY) < 48,
        objD: Number.isFinite(diag.objX) ? Math.round(Math.hypot(diag.x - diag.objX, diag.y - diag.objY) * 10) / 10 : null,
        pathLen: diag.pathLen || 0,
        objKey: diag.objKey || null,
        nearObjKey: diag.nearObjKey || null,
        walking: !!diag.walking,
        crouched: !!e.crouched
      };
      events.push(event);
      reasons[event.reason] = (reasons[event.reason] || 0) + 1;
      lastStopAt.set(e, t);
      openStop.set(e, event);
    } else if (mode !== 'stop' && openStop.has(e)) {
      const ev = openStop.get(e);
      ev.duration = Math.round((t - ev.at) * 1000);
      openStop.delete(e);
    }
    lastMode.set(e, mode);
    lastSpeed.set(e, speed);
  }
}

const byBot = {};
const shortCycles = [];
for (const ev of events) {
  byBot[ev.bot] = (byBot[ev.bot] || 0) + 1;
  if (ev.gapMs !== null && ev.gapMs < 500) shortCycles.push(ev);
}

const perBotRuns = {};
for (const [e, seq] of modeSeq) {
  const r = runs(seq);
  perBotRuns[e.name || e.id || 'bot'] = {
    stopRuns: r.stopRuns,
    moveRuns: r.moveRuns,
    maxStopRun: r.maxStopRun,
    maxMoveRun: r.maxMoveRun
  };
}

console.log(JSON.stringify({
  totalFrames: 900,
  stopEvents: events.length,
  reasonHistogram: reasons,
  byBot,
  shortCycles: shortCycles.length,
  shortCycleReasons: shortCycles.reduce((m, e) => { m[e.reason] = (m[e.reason] || 0) + 1; return m; }, {}),
  perBotRuns,
  sample: shortCycles.slice(-12),
  detail: (() => {
    const ev = shortCycles.find((x) => x.reason === 'peek');
    if (!ev) return null;
    const e = bots.find((b) => (b.name || b.id || 'bot') === ev.bot);
    if (!e || !e._motionDiag) return null;
    const idx = Math.round(ev.at / dt);
    return {
      bot: ev.bot,
      at: ev.at,
      frames: e._motionDiag.slice(Math.max(0, idx - 8), idx + 18).map((d, j) => ({
        i: Math.max(0, idx - 8) + j,
        prev: Math.round(Math.hypot(d.prevVx || 0, d.prevVy || 0) * 10) / 10,
        think: Math.round(Math.hypot(d.thinkVx || 0, d.thinkVy || 0) * 10) / 10,
        act: Math.round(Math.hypot(d.actVx || 0, d.actVy || 0) * 10) / 10,
        smooth: Math.round(Math.hypot(d.smoothVx || 0, d.smoothVy || 0) * 10) / 10,
        vx: Math.round((e._motionDiag[Math.max(0, idx - 8) + j] || {}).smoothVx || 0),
        vy: Math.round((e._motionDiag[Math.max(0, idx - 8) + j] || {}).smoothVy || 0),
        pathLen: d.pathLen,
        pathI: d.pathI,
        objD: Number.isFinite(d.objX) ? Math.round(Math.hypot(d.x - d.objX, d.y - d.objY) * 10) / 10 : null,
        aim: !!d.aimTarget,
        corner: d.cornerAimT !== undefined && d.cornerAimT > 0,
        walking: !!d.walking,
        repathT: d.repathT && d.repathT.toFixed(2)
      }))
    };
  })(),
  detailHold: (() => {
    const ev = shortCycles.filter((x) => x.reason === 'hold' || x.hold).sort((a, b) => (a.gapMs || 1e9) - (b.gapMs || 1e9))[0];
    if (!ev) return null;
    const e = bots.find((b) => (b.name || b.id || 'bot') === ev.bot);
    if (!e || !e._motionDiag) return null;
    const idx = Math.round(ev.at / dt);
    return {
      bot: ev.bot,
      at: ev.at,
      gapMs: ev.gapMs,
      lastSpeed: ev.lastSpeed,
      objKeyAt: ev.objKey,
      frames: e._motionDiag.slice(Math.max(0, idx - 12), idx + 20).map((d, j) => ({
        i: Math.max(0, idx - 12) + j,
        prev: Math.round(Math.hypot(d.prevVx || 0, d.prevVy || 0) * 10) / 10,
        think: Math.round(Math.hypot(d.thinkVx || 0, d.thinkVy || 0) * 10) / 10,
        act: Math.round(Math.hypot(d.actVx || 0, d.actVy || 0) * 10) / 10,
        smooth: Math.round(Math.hypot(d.smoothVx || 0, d.smoothVy || 0) * 10) / 10,
        pathLen: d.pathLen,
        pathI: d.pathI,
        objKey: d.objKey,
        nearObjKey: d.nearObjKey,
        objD: Number.isFinite(d.objX) ? Math.round(Math.hypot(d.x - d.objX, d.y - d.objY) * 10) / 10 : null,
        repathT: d.repathT && d.repathT.toFixed(2),
        corner: d.cornerAimT !== undefined && d.cornerAimT > 0,
        aim: !!d.aimTarget,
        walking: !!d.walking
      }))
    };
  })()
}, null, 2));
