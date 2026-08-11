import { spawn } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getFreePort, launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_PORT = await getFreePort();
const DBG_PORT = await getFreePort();
const OUT_DIR = path.join(process.env.TEMP || '.', 'cs2d-live-smooth');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BOT_COUNT = Number(process.env.BOTS || 4);
const PROFILE = process.env.PROFILE === '1';
const FOG = process.env.FOG === '1';

function profileSummary(profile) {
  if (!profile || !profile.nodes || !profile.nodes.length) return [];
  const byId = new Map();
  for (const n of profile.nodes) {
    byId.set(n.id, n);
    n._parent = null;
  }
  for (const n of profile.nodes) {
    for (const c of n.children || []) {
      const child = byId.get(c);
      if (child) child._parent = n;
    }
  }
  const self = new Map();
  const total = new Map();
  const samples = profile.samples || [];
  const deltas = profile.timeDeltas || [];
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i];
    const d = i < deltas.length ? deltas[i] : 0;
    const n = byId.get(id);
    if (!n) continue;
    const key = (n.callFrame && n.callFrame.functionName) || '(anonymous)';
    self.set(key, (self.get(key) || 0) + d);
    let cur = n;
    while (cur) {
      const ckey = (cur.callFrame && cur.callFrame.functionName) || '(anonymous)';
      total.set(ckey, (total.get(ckey) || 0) + d);
      cur = cur._parent;
    }
  }
  return {
    self: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, ms]) => ({ name, ms: Math.round(ms / 1000) })),
    total: [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, ms]) => ({ name, ms: Math.round(ms / 1000) }))
  };
}

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-LIVE-SMOOTH: FAIL server exited ' + srv.exitCode);
  process.exit(1);
}

const { proc, port } = launchBrowser({
  port: DBG_PORT,
  profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-live-smooth'
});
let ok = true;

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await cdp.eval(`(()=>{try{localStorage.setItem('cs2d_viewmode','top');localStorage.setItem('cs2d_fog','${FOG ? '1' : '0'}');localStorage.setItem('cs2d_map','dust2');localStorage.removeItem('cs2d_mode')}catch(e){}return true})()`);

  let booted = false;
  for (let i = 0; i < 60; i++) {
    booted = await cdp.eval(`!!(window.__cs2d && window.__game && document.getElementById('startBtn') && document.querySelectorAll('#mapSel .map-card').length > 0)`);
    if (booted) break;
    await sleep(250);
  }
  if (!booted) throw new Error('page boot timeout');

  const setOpts = await cdp.eval(`(()=>{const g=window.__game;if(!g)return false;g.opts.mode='classic';g.opts.mapId='dust2';g.opts.bots=${BOT_COUNT};g.viewMode='top';g.opts.fog=${FOG};return true})()`);
  if (!setOpts) throw new Error('cannot set options');
  const started = await cdp.eval(`(()=>{try{window.GAME.startMatch();return {ok:true}}catch(e){return {ok:false,err:String(e&&e.stack||e)}}})()`);
  if (!started || !started.ok) throw new Error('start failed: ' + JSON.stringify(started));
  await cdp.eval(`(()=>{const g=window.__game;if(!g)return false;g.buyTime=0;g.freezeT=0;return true})()`);

  let ready = false;
  let lastState = '';
  for (let i = 0; i < 40; i++) {
    lastState = await cdp.eval(`(()=>{const g=window.__game;return JSON.stringify({state:g&&g.state,player:!!(g&&g.player),entities:g&&g.entities.length,alive:g&&g.entities.filter(e=>e.bot&&!e.dead).length,mode:g&&g.opts&&g.opts.mode,map:g&&g.opts&&g.opts.mapId})})()`);
    const parsed = JSON.parse(lastState);
    ready = parsed.state === 'LIVE' && parsed.alive >= BOT_COUNT * 2;
    if (ready) break;
    await sleep(250);
  }
  if (!ready) throw new Error('live timeout: ' + lastState);

  await cdp.eval(`(()=>{
    window.__smoothPrev = new Map();
    window.__smoothData = {
      samples: 0,
      intervalMin: 1e9,
      intervalMax: 0,
      gap30: 0,
      gap50: 0,
      gap100: 0,
      slowFrames: [],
      maxLogicAng: 0,
      maxDispAng: 0,
      maxLogicPos: 0,
      maxDispPos: 0,
      maxDispSpeed: 0,
      maxRawSpeed: 0,
      countDispAngGt0p05: 0,
      countDispAngGt0_1: 0,
      countDispAngGt0_2: 0,
      countLogicAngGt0_1: 0,
      countLogicAngGt0_5: 0,
      countLogicAngGt1_0: 0,
      countDispPosGt16: 0,
      countDispPosGt32: 0,
      stops: 0,
      restarts: 0,
      slideFrames: 0,
      maxSlideSpeed: 0,
      slideDetails: [],
      slideByBot: {},
      sampleErr: 0,
      lastSampleErr: '',
      perSec: []
    };
    const D = window.__smoothData;
    const prev = window.__smoothPrev;
    let lastT = performance.now();
    let bucketT = lastT;
    let bucket = { samples: 0, maxInt: 0, maxDispAng: 0, maxLogicAng: 0, maxDispSpeed: 0, gap30: 0, gap50: 0 };
    function sample() {
      const g = window.__game;
      if (!g || !g.entities) return;
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastT) / 1000);
      lastT = now;
      D.samples++;
      const intMs = dt * 1000;
      if (intMs < D.intervalMin) D.intervalMin = intMs;
      if (intMs > D.intervalMax) D.intervalMax = intMs;
      if (intMs > 30) D.gap30++;
      if (intMs > 50) D.gap50++;
      if (intMs > 100) D.gap100++;
      if (intMs > 30 && D.slowFrames.length < 30) {
        D.slowFrames.push({
          at: Math.round(now - window.__smoothStart),
          intMs: Math.round(intMs * 10) / 10,
          work: window.__cs2d && window.__cs2d.stats ? Math.round(window.__cs2d.stats.workNow * 10) / 10 : null,
          render: window.__cs2d && window.__cs2d.stats ? Math.round(window.__cs2d.stats.renderNow * 10) / 10 : null,
          stage: window.__game && window.__game._renderStageMs ? window.__game._renderStageMs : null
        });
      }
      bucket.samples++;
      if (intMs > bucket.maxInt) bucket.maxInt = intMs;
      if (intMs > 30) bucket.gap30++;
      if (intMs > 50) bucket.gap50++;

      let frameMaxLogicAng = 0;
      let frameMaxDispAng = 0;
      let frameMaxLogicPos = 0;
      let frameMaxDispPos = 0;
      let frameMaxDispSpeed = 0;
      let frameMaxRawSpeed = 0;
      const bots = g.entities.filter((e) => e.bot && !e.dead);
      for (const e of bots) {
        const p = prev.get(e);
        if (p) {
          const da = Math.abs((((e.angle - p.angle) % 6.283185307179586) + 9.42477796076938) % 6.283185307179586 - 3.141592653589793);
          const dra = Math.abs((((e._ra - p._ra) % 6.283185307179586) + 9.42477796076938) % 6.283185307179586 - 3.141592653589793);
          const lp = Math.hypot(e.x - p.x, e.y - p.y);
          const dp = Math.hypot(e._rx - p._rx, e._ry - p._ry);
          const ds = dp / dt;
          const logicSpeed = Math.hypot(e.vx || 0, e.vy || 0);
          if (p.logicSpeed !== undefined) {
            if (logicSpeed < 20 && p.logicSpeed >= 100) D.stops++;
            if (logicSpeed >= 100 && p.logicSpeed < 20) D.restarts++;
          }
          if (logicSpeed < 20 && dp > 0.3) {
            D.slideFrames++;
            if (ds > D.maxSlideSpeed) D.maxSlideSpeed = ds;
            const dist = Math.hypot(e.x - e._rx, e.y - e._ry);
            const distPrev = Math.hypot(p.x - p._rx, p.y - p._ry);
            D.slideByBot[e.name || e.id || 'bot'] = (D.slideByBot[e.name || e.id || 'bot'] || 0) + 1;
            if (D.slideDetails.length < 30) {
              D.slideDetails.push({
                at: Math.round(now - window.__smoothStart),
                intMs: Math.round(intMs * 10) / 10,
                bot: e.name || e.id || 'bot',
                logicSpeed: Math.round(logicSpeed * 10) / 10,
                dxLogic: Math.round(Math.hypot(e.x - p.x, e.y - p.y) * 100) / 100,
                dxDisp: Math.round(dp * 100) / 100,
                distPrev: Math.round(distPrev * 10) / 10,
                distNow: Math.round(dist * 10) / 10,
                snap: distPrev > 140,
                maxCatchUp: Math.round((logicSpeed > 0 ? logicSpeed * dt * 1.25 : 0) * 100) / 100
              });
            }
          }
          if (da > frameMaxLogicAng) frameMaxLogicAng = da;
          if (dra > frameMaxDispAng) frameMaxDispAng = dra;
          if (lp > frameMaxLogicPos) frameMaxLogicPos = lp;
          if (dp > frameMaxDispPos) frameMaxDispPos = dp;
          if (ds > frameMaxDispSpeed) frameMaxDispSpeed = ds;
          if (da > 0.1) D.countLogicAngGt0_1++;
          if (da > 0.5) D.countLogicAngGt0_5++;
          if (da > 1.0) D.countLogicAngGt1_0++;
          if (dra > 0.05) D.countDispAngGt0p05++;
          if (dra > 0.1) D.countDispAngGt0_1++;
          if (dra > 0.2) D.countDispAngGt0_2++;
          if (dp > 16) D.countDispPosGt16++;
          if (dp > 32) D.countDispPosGt32++;
        }
        const rawSpeed = Math.hypot(e.vx || 0, e.vy || 0);
        if (rawSpeed > frameMaxRawSpeed) frameMaxRawSpeed = rawSpeed;
        prev.set(e, { x: e.x, y: e.y, angle: e.angle, vx: e.vx, vy: e.vy, _rx: e._rx, _ry: e._ry, _ra: e._ra, logicSpeed: rawSpeed });
      }
      if (frameMaxLogicAng > D.maxLogicAng) D.maxLogicAng = frameMaxLogicAng;
      if (frameMaxDispAng > D.maxDispAng) D.maxDispAng = frameMaxDispAng;
      if (frameMaxLogicPos > D.maxLogicPos) D.maxLogicPos = frameMaxLogicPos;
      if (frameMaxDispPos > D.maxDispPos) D.maxDispPos = frameMaxDispPos;
      if (frameMaxDispSpeed > D.maxDispSpeed) D.maxDispSpeed = frameMaxDispSpeed;
      if (frameMaxRawSpeed > D.maxRawSpeed) D.maxRawSpeed = frameMaxRawSpeed;
      if (frameMaxDispAng > bucket.maxDispAng) bucket.maxDispAng = frameMaxDispAng;
      if (frameMaxLogicAng > bucket.maxLogicAng) bucket.maxLogicAng = frameMaxLogicAng;
      if (frameMaxDispSpeed > bucket.maxDispSpeed) bucket.maxDispSpeed = frameMaxDispSpeed;
      if (now - bucketT >= 1000) {
        D.perSec.push(bucket);
        bucket = { samples: 0, maxInt: 0, maxDispAng: 0, maxLogicAng: 0, maxDispSpeed: 0, gap30: 0, gap50: 0 };
        bucketT = now;
      }
    }
    let running = true;
    window.__smoothStart = performance.now();
    function tick() {
      if (!running) return;
      try {
        sample();
      } catch (err) {
        D.sampleErr++;
        D.lastSampleErr = String((err && err.stack) || err);
      }
      requestAnimationFrame(tick);
    }
    window.__smoothStop = () => { running = false; };
    requestAnimationFrame(tick);
    return true;
  })()`);

  if (PROFILE) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }
  await sleep(6000);

  const data = await cdp.eval(`(()=>{
    window.__smoothStop && window.__smoothStop();
    const D = window.__smoothData;
    const long = performance.getEntriesByType('longtask').slice(-20).map((x) => ({ s: Math.round(x.startTime), d: Math.round(x.duration) }));
    const g = window.__game;
    return { D, long, stats: window.__cs2d && window.__cs2d.stats, stage: g && g._renderStageMs, entities: g && g.entities.length, botsAlive: g && g.entities.filter(e=>e.bot&&!e.dead).length, particles: g && g.particles.length, smokes: g && g.smokes.length, drops: g && g.drops.length };
  })()`);
  if (PROFILE) {
    const prof = await cdp.send('Profiler.stop');
    console.log('CDP-LIVE-SMOOTH profile: ' + JSON.stringify(profileSummary(prof && prof.profile)));
  }

  console.log('CDP-LIVE-SMOOTH bots=' + BOT_COUNT + ' data: ' + JSON.stringify(data));
  const d = data.D;
  if (!d || !d.samples || !d.intervalMin || !d.intervalMax) {
    ok = false;
    console.log('CDP-LIVE-SMOOTH: FAIL no samples');
  } else {
  console.log('CDP-LIVE-SMOOTH summary: samples=' + d.samples +
      ' interval=' + d.intervalMin.toFixed(1) + '-' + d.intervalMax.toFixed(1) + 'ms' +
      ' gaps30=' + d.gap30 + ' gaps50=' + d.gap50 + ' gaps100=' + d.gap100 +
      ' logicAng=' + d.maxLogicAng.toFixed(3) + ' dispAng=' + d.maxDispAng.toFixed(3) +
      ' logicPos=' + d.maxLogicPos.toFixed(1) + ' dispPos=' + d.maxDispPos.toFixed(1) +
      ' dispSpeed=' + d.maxDispSpeed.toFixed(1) + ' rawSpeed=' + d.maxRawSpeed.toFixed(1));
  console.log('CDP-LIVE-SMOOTH motion: stops=' + d.stops + ' restarts=' + d.restarts +
      ' slideFrames=' + d.slideFrames + ' maxSlideSpeed=' + d.maxSlideSpeed.toFixed(1));
  console.log('CDP-LIVE-SMOOTH slideByBot: ' + JSON.stringify(d.slideByBot));
  console.log('CDP-LIVE-SMOOTH slideDetails: ' + JSON.stringify(d.slideDetails));
  console.log('CDP-LIVE-SMOOTH buckets: ' + JSON.stringify(d.perSec));
  console.log('CDP-LIVE-SMOOTH slowframes: ' + JSON.stringify(d.slowFrames));
    console.log('CDP-LIVE-SMOOTH longtasks: ' + JSON.stringify(data.long));
  }

  await cdp.close();
} catch (e) {
  ok = false;
  console.log('CDP-LIVE-SMOOTH: FAIL ' + e.message);
}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'CDP-LIVE-SMOOTH: PASS' : 'CDP-LIVE-SMOOTH: FAIL');
process.exit(ok ? 0 : 1);
