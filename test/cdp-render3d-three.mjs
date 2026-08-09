import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const APP_PORT = 8098;
const DBG_PORT = 9238;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-RENDER3D-THREE: FAIL (server failed to start)');
  process.exit(1);
}

const { proc, port } = launchBrowser({ port: DBG_PORT, profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-three' });
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await sleep(2500);

  await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(b)b.click();return true})()`);
  await sleep(2200);

  const gameReady = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return !!(g&&g.player&&!g.player.dead)})()`);
  if (!gameReady) fail('game not ready');
  else pass('game ready');

  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(g)g.viewMode='fps';return true})()`);
  await sleep(1800);

  const backend = await cdp.eval(`(()=>{const c=window.__cs2d;return {backend:c&&c.render3d&&c.render3d.backend,gameBackend:c&&c.game&&c.game._render3dBackend,stats:c&&c.game&&c.game._renderStats}})()`);
  if (!backend || backend.backend !== 'next' || backend.gameBackend !== 'next') {
    fail('three.js backend not active: ' + JSON.stringify(backend));
  } else {
    pass('three.js backend active: ' + JSON.stringify(backend));
  }

  if (!backend || !backend.stats || backend.stats.dynamicObjects < 1 || backend.stats.viewmodelObjects < 1 || backend.stats.drawCalls < 1) {
    fail('three.js scene stats missing: ' + JSON.stringify(backend && backend.stats));
  } else {
    pass('scene stats: ' + JSON.stringify(backend.stats));
  }

  const pixels = await cdp.eval(`(()=>{const c=document.querySelector('canvas');if(!c)return null;const w=Math.min(c.width,1600),h=Math.min(c.height,900);const d=c.getContext('2d').getImageData(0,0,w,h).data;let lit=0,bright=0,white=0,colors=new Set(),checked=0;for(let y=0;y<h;y+=3){for(let x=0;x<w;x+=3){const i=(y*w+x)*4;const r=d[i],g=d[i+1],b=d[i+2];const sum=r+g+b;checked++;if(sum>40)lit++;if(sum>540)bright++;if(sum>720)white++;colors.add((r>>4)+','+(g>>4)+','+(b>>4));}}return {lit,bright,white,checked,colors:colors.size}})()`);
  if (!pixels || pixels.lit < 1 || pixels.colors < 8) {
    fail('three.js frame blank or low variance: ' + JSON.stringify(pixels));
  } else {
    pass('three.js frame variance: ' + JSON.stringify(pixels));
  }
  if (pixels && pixels.white > pixels.checked * 0.35) {
    fail('three.js frame too white: ' + JSON.stringify(pixels));
  }

  const pitchLock = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g||!g.player)return null;g.state='LIVE';g.player.pitch=0.5;g._mlookDx=0;g._mlookDy=140;window.GAME.debug.tick(0.016);return {pitch:g.player.pitch,dy:g._mlookDy}})()`);
  if (!pitchLock || pitchLock.pitch !== 0 || pitchLock.dy !== 0) {
    fail('vertical aim not locked: ' + JSON.stringify(pitchLock));
  } else {
    pass('vertical aim locked: ' + JSON.stringify(pitchLock));
  }

  await cdp.eval(`(()=>{window.GAME.debug.setOpts({mapId:'canal'});window.GAME.startMatch();return true})()`);
  await sleep(1800);
  const switched = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const c=window.__cs2d;return {map:g&&g.opts&&g.opts.mapId,backend:c&&c.render3d&&c.render3d.backend,stats:g&&g._renderStats}})()`);
  if (!switched || switched.map !== 'canal' || switched.backend !== 'next' || !switched.stats || switched.stats.dynamicObjects < 1 || switched.stats.viewmodelObjects < 1) {
    fail('map switch with three.js failed: ' + JSON.stringify(switched));
  } else {
    pass('map switch with three.js: ' + JSON.stringify(switched));
  }

  await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g)return false;g.tracers=Array.from({length:80},(_,i)=>({x1:100+i*2,y1:100+i,x2:100+i,y2:120+i}));return true})()`);
  await sleep(400);
  const stress = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const c=window.__cs2d;return {backend:c&&c.render3d&&c.render3d.backend,gameBackend:g&&g._render3dBackend,stats:g&&g._renderStats}})()`);
  if (!stress || stress.backend !== 'next' || stress.gameBackend !== 'next' || !stress.stats || stress.stats.drawCalls < 1) {
    fail('tracer buffer stress fell back: ' + JSON.stringify(stress));
  } else {
    pass('tracer buffer stress keeps next backend: ' + JSON.stringify(stress));
  }

  await cdp.close();
} catch (e) {
  fail(e.message);
} finally {
  try { proc.kill(); } catch {}
  try { srv.kill(); } catch {}
}

console.log(ok ? 'CDP-RENDER3D-THREE: PASS' : 'CDP-RENDER3D-THREE: FAIL');
process.exit(ok ? 0 : 1);
