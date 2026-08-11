// 浏览器回归：油桶爆炸后 2D 阴影层必须随 game._shadowRev 重建。
import { spawn } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getFreePort, launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_PORT = await getFreePort();
const DBG_PORT = await getFreePort();
const OUT_DIR = path.join(process.env.TEMP || '.', 'cs2d-shadow-rev');
fs.mkdirSync(OUT_DIR, { recursive: true });

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-SHADOW-REV: FAIL server exited ' + srv.exitCode);
  process.exit(1);
}

const { proc, port } = launchBrowser({
  port: DBG_PORT,
  profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-shadow-rev'
});
let ok = true;

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await cdp.eval(`(()=>{try{localStorage.setItem('cs2d_viewmode','top');localStorage.setItem('cs2d_fog','0');localStorage.setItem('cs2d_map','dust2');localStorage.removeItem('cs2d_mode')}catch(e){}return true})()`);

  let booted = false;
  for (let i = 0; i < 60; i++) {
    booted = await cdp.eval(`!!(window.__cs2d && window.__game && document.getElementById('startBtn') && document.querySelectorAll('#mapSel .map-card').length > 0)`);
    if (booted) break;
    await sleep(250);
  }
  if (!booted) throw new Error('page boot timeout');

  const setOpts = await cdp.eval(`(()=>{const g=window.__game;if(!g)return false;g.opts.mode='classic';g.opts.mapId='dust2';g.opts.bots=0;g.viewMode='top';g.opts.fog=false;return true})()`);
  if (!setOpts) throw new Error('cannot set options');
  const started = await cdp.eval(`(()=>{try{window.GAME.startMatch();return {ok:true}}catch(e){return {ok:false,err:String(e&&e.stack||e)}}})()`);
  if (!started || !started.ok) throw new Error('start failed: ' + JSON.stringify(started));
  await cdp.eval(`(()=>{const g=window.__game;if(!g)return false;g.state='LIVE';g.buyTime=0;g.freezeT=0;return true})()`);

  let ready = false;
  let lastState = '';
  for (let i = 0; i < 40; i++) {
    lastState = await cdp.eval(`(()=>{const g=window.__game;return JSON.stringify({state:g&&g.state,player:!!(g&&g.player),mode:g&&g.opts&&g.opts.mode,map:g&&g.opts&&g.opts.mapId,shadowLayer:!!(g&&g.layers&&g.layers.shadowLayer)})})()`);
    const parsed = JSON.parse(lastState);
    ready = parsed.state === 'LIVE' && parsed.player && parsed.shadowLayer;
    if (ready) break;
    await sleep(250);
  }
  if (!ready) throw new Error('live timeout: ' + lastState);

  const res = await cdp.eval(`(async()=>{
    const g = window.__game;
    if (!g || !g.layers || !g.layers.shadowLayer) return {ok:false, reason:'no-shadow-layer'};
    const b = g.barrels && g.barrels[0];
    if (!b) return {ok:false, reason:'no-barrel'};
    const cv = g.layers.shadowLayer;
    const t = cv.getContext('2d');
    const T = 40;
    const beforeRev = g._shadowRev || 0;
    const hashFull = (canvas) => {
      const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let h = 2166136261 >>> 0;
      for (let i = 0; i < img.data.length; i += 64) h = Math.imul(h ^ img.data[i], 16777619) >>> 0;
      return h;
    };
    const beforeHash = hashFull(cv);
    const combat = await import('./src/combat.js');
    combat.explodeBarrel(g, b, { team: 'ct' });
    await new Promise((r) => setTimeout(r, 300));
    const renderMod = await import('./src/render.js');
    renderMod.render(g);
    const afterCv = g.layers.shadowLayer;
    const afterHash = hashFull(afterCv);
    return {
      ok: true,
      beforeRev,
      afterRev: g._shadowRev || 0,
      beforeHash,
      afterHash,
      changed: beforeHash !== afterHash,
      size: [afterCv.width, afterCv.height],
      refSame: afterCv === cv,
      gpuBase: !!g._render2dGpuBase,
      gpu: !!g._render2dGpu
    };
  })()`);

  console.log('CDP-SHADOW-REV result: ' + JSON.stringify(res));
  if (!res || !res.ok) {
    ok = false;
    console.log('CDP-SHADOW-REV: FAIL ' + (res && res.reason || 'empty result'));
  } else if (res.afterRev <= res.beforeRev) {
    ok = false;
    console.log('CDP-SHADOW-REV: FAIL rev not bumped');
  } else if (!res.changed) {
    ok = false;
    console.log('CDP-SHADOW-REV: FAIL shadow pixels unchanged');
  } else {
    console.log('CDP-SHADOW-REV: PASS');
  }

  await cdp.close();
} catch (e) {
  ok = false;
  console.log('CDP-SHADOW-REV: FAIL ' + e.message);
}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
process.exit(ok ? 0 : 1);
