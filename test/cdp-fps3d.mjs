import { getFreePort, launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const APP_PORT = await getFreePort();
const DBG_PORT = await getFreePort();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForApp(cdp, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ready = await cdp.eval(`(()=>{
      const b = document.getElementById('startBtn');
      return !!(b && window.__cs2d && window.__cs2d.game);
    })()`);
    if (ready) return;
    await sleep(300);
  }
  const diag = await cdp.eval(`(()=>({
    href: location.href,
    readyState: document.readyState,
    bodyLen: document.body ? document.body.innerHTML.length : -1,
    hasStart: !!document.getElementById('startBtn'),
    hasGame: !!(window.__cs2d && window.__cs2d.game)
  }))()`);
  throw new Error('app not ready: ' + JSON.stringify(diag));
}

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-FPS3D: FAIL (server failed to start, exit=' + srv.exitCode + ')');
  process.exit(1);
}

const { proc, port } = launchBrowser({ port: DBG_PORT, profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-fps3d' });
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await waitForApp(cdp);

  const bodyLen = await cdp.eval(`document.body ? document.body.innerHTML.length : -1`);
  pass('body html length: ' + bodyLen);

  await cdp.eval(`(()=>{try{localStorage.clear()}catch(e){}const g=window.__cs2d&&window.__cs2d.game;if(g)g.opts.mode='classic';return true})()`);
  const started = await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(!b)return false;b.click();return true})()`);
  if (!started) fail('start button missing');
  else pass('start clicked');
  await sleep(2200);

  const gameInfo = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g||!g.player)return null;return {state:g.state,hp:g.player.hp,dead:g.player.dead,map:g.opts&&g.opts.mapId}})()`);
  if (!gameInfo || gameInfo.dead) fail('player not available: ' + JSON.stringify(gameInfo));
  else pass('game ready: ' + JSON.stringify(gameInfo));

  const mode = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g)return 'no-game';g.viewMode='fps';return g.viewMode})()`);
  if (mode !== 'fps') fail('could not enter fps mode: ' + mode);
  else pass('fps mode: ' + mode);
  await sleep(1400);

  const stats = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g)return null;const s=g._renderStats;return {total:typeof s==='object'&&s? s.total:null,scale:g._renderScale||1}})()`);
  if (!stats || typeof stats.total !== 'number' || !Number.isFinite(stats.total)) fail('render stats missing: ' + JSON.stringify(stats));
  else pass('render3d stats: total=' + stats.total.toFixed(2) + 'ms scale=' + stats.scale);

  const pixels = await cdp.eval(`(()=>{const c=document.querySelector('canvas');if(!c)return null;const d=c.getContext('2d').getImageData(Math.floor(c.width/2)-8,Math.floor(c.height/2)-8,16,16).data;let lit=0;for(let i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]>40)lit++;}return {lit,total:d.length/4}})()`);
  if (!pixels || pixels.lit < 1) fail('3D canvas appears blank: ' + JSON.stringify(pixels));
  else pass('3D canvas pixels: ' + pixels.lit + '/' + pixels.total);

  const bright = await cdp.eval(`(()=>{const c=document.querySelector('canvas');if(!c)return null;const w=Math.min(c.width,1600),h=Math.min(c.height,900);const d=c.getContext('2d').getImageData(0,0,w,h).data;let white=0,bright=0,checked=0;for(let y=0;y<h;y+=4){for(let x=0;x<w;x+=4){const i=(y*w+x)*4;const sum=d[i]+d[i+1]+d[i+2];checked++;if(sum>720)white++;else if(sum>540)bright++;}}return {white,bright,checked}})()`);
  pass('3D bright histogram: ' + JSON.stringify(bright));
  if (bright && bright.white > bright.checked * 0.30) fail('3D frame has too many near-white pixels: ' + JSON.stringify(bright));

  await cdp.close();
} catch (e) {
  fail(e.message);
} finally {
  try { proc.kill(); } catch {}
  try { srv.kill(); } catch {}
}

console.log(ok ? 'CDP-FPS3D: PASS' : 'CDP-FPS3D: FAIL');
process.exit(ok ? 0 : 1);
