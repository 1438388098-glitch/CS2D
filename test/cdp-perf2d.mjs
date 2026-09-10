import { getFreePort, launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const APP_PORT = await getFreePort();
const DBG_PORT = await getFreePort();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-PERF2D: FAIL (server failed to start)');
  process.exit(1);
}

const { proc, port } = launchBrowser({ port: DBG_PORT, profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-perf2d' });
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await cdp.eval(`(()=>{try{localStorage.setItem('cs2d_viewmode','top');localStorage.setItem('cs2d_fog','1');window.__cs2dProf=true}catch(e){}return true})()`);
  const bodyLen = await cdp.eval(`document.body ? document.body.innerHTML.length : -1`);
  pass('body html length: ' + bodyLen);
  let booted = false;
  for (let i = 0; i < 20; i++) {
    booted = await cdp.eval(`!!(window.__cs2d && window.__game && document.getElementById('startBtn'))`);
    if (booted) break;
    await sleep(250);
  }
  if (!booted) fail('page boot timeout');
  else pass('page booted');
  const started = await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(!b)return false;b.click();return true})()`);
  if (!started) fail('start button missing');
  else pass('start clicked');
  let ready = false;
  for (let i = 0; i < 24; i++) {
    ready = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return !!(g&&g.player)})()`);
    if (ready) break;
    await sleep(250);
  }
  if (!ready) fail('game ready timeout');
  const info = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;if(!g||!g.player)return null;g.viewMode='top';g.opts.fog=true;return {state:g.state,view:g.viewMode,fog:g.opts.fog,map:g.opts&&g.opts.mapId}})()`);
  if (!info) fail('game not ready');
  else pass('game ready: ' + JSON.stringify(info));
  await sleep(1600);
  let perf = null;
  for (let i = 0; i < 5; i++) {
    await sleep(400);
    const sample = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const s=window.__cs2d&&window.__cs2d.stats;const st=g&&g._renderStageMs;const cv=document.createElement('canvas');const gl=cv.getContext('webgl');const ext=gl&&gl.getExtension('WEBGL_debug_renderer_info');const r=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||''):String(gl.getParameter(gl.RENDERER)||'');return {stats:s,stage:st,entities:g&&g.entities.length,particles:g&&g.particles.length,smokes:g&&g.smokes.length,crates:g&&g.crates.length,drops:g&&g.drops.length,width:g&&g.canvasW,height:g&&g.canvasH,gpuBase:g&&g._render2dGpuBase,renderer:r}})()`);
    if (!perf || (sample && sample.stats && sample.stats.renderNow < perf.stats.renderNow)) perf = sample;
  }
  console.log('CDP-PERF2D sample: ' + JSON.stringify(perf));
  if (!perf || !perf.stage || !perf.stats) fail('2d stage metrics missing');
  else pass('2d stage metrics present');
  if (!perf || !perf.stats || !Number.isFinite(perf.stats.workNow) || !Number.isFinite(perf.stats.fpsWindow) || !Number.isFinite(perf.stats.simFps)) fail('real frame metrics missing');
  else pass('real frame metrics present');
  const monitor = await cdp.eval(`(()=>{
    const s = window.__cs2d && window.__cs2d.stats;
    if (!s) return null;
    s.frameNow = 50;
    s.fpsWindow = 60;
    window.__cs2d.debug.refreshPerf();
    const el = document.getElementById('perfMonitor');
    return el && el.textContent;
  })()`);
  if (!monitor || !/^20 FPS/.test(monitor)) fail('perf monitor ignores real frame time: ' + JSON.stringify(monitor));
  else pass('perf monitor reflects injected 50ms frame: ' + JSON.stringify(monitor));
  const gpu = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;return !!(g&&g._render2dGpu)})()`);
  if (!gpu) fail('2d renderer is not GPU');
  else pass('2d renderer is GPU');
  if (perf.stage.fog > 12) fail('fog rebuild too expensive: ' + perf.stage.fog.toFixed(1) + 'ms');
  else pass('fog rebuild cost: ' + perf.stage.fog.toFixed(1) + 'ms');
  if (perf.stats.renderNow > 15) fail('2d render still CPU heavy: ' + perf.stats.renderNow.toFixed(1) + 'ms');
  else pass('2d render cost: ' + perf.stats.renderNow.toFixed(1) + 'ms');
  const pixel = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const cv=document.getElementById('game');if(!g||!g.player||!cv)return null;const dpr=g.dpr||1;const w2=cv.width/dpr,h2=cv.height/dpr;const p=g.player;const sx=Math.round((p.x-(g.camX||0)+(g._shx||0))*g.zoom+w2/2);const sy=Math.round((p.y-(g.camY||0)+(g._shy||0))*g.zoom+h2/2);const c=cv.getContext('2d');const d=c.getImageData(Math.max(0,Math.min(cv.width-1,sx)),Math.max(0,Math.min(cv.height-1,sy)),1,1).data;return {sx,sy,rgb:[d[0],d[1],d[2],d[3]],px:p.x,py:p.y,camX:g.camX,camY:g.camY,zoom:g.zoom,width:cv.width,height:cv.height}})()`);
  console.log('CDP-PERF2D player pixel: ' + JSON.stringify(pixel));
  if (!pixel || !pixel.rgb || pixel.rgb[3] === 0) fail('player pixel missing');
  else pass('player pixel present');
  const align = await cdp.eval(`(()=>{const g=window.__cs2d&&window.__cs2d.game;const cv=document.getElementById('game');if(!g||!cv||!g.layers||!g.layers.staticLayer)return null;const dpr=g.dpr||1;const w2=cv.width/dpr,h2=cv.height/dpr;const p=g.player;const wx=p.x+90,wy=p.y+20;const sx=Math.round((wx-(g.camX||0)+(g._shx||0))*g.zoom+w2/2);const sy=Math.round((wy-(g.camY||0)+(g._shy||0))*g.zoom+h2/2);const hc=cv.getContext('2d');const sc=g.layers.staticLayer.getContext('2d');const hp=hc.getImageData(Math.max(0,Math.min(cv.width-1,sx)),Math.max(0,Math.min(cv.height-1,sy)),1,1).data;const sp=sc.getImageData(wx,wy,1,1).data;return {sx,sy,host:[hp[0],hp[1],hp[2],hp[3]],static:[sp[0],sp[1],sp[2],sp[3]],camX:g.camX,camY:g.camY,zoom:g.zoom}})()`);
  console.log('CDP-PERF2D texture alignment: ' + JSON.stringify(align));
  if (!align || !align.static || Math.abs(align.host[0] - align.static[0]) > 18 || Math.abs(align.host[1] - align.static[1]) > 18 || Math.abs(align.host[2] - align.static[2]) > 18) fail('webgl map texture not aligned with collision grid');
  else pass('webgl map texture aligned');
  const gpuOrient = await cdp.eval(`(async()=>{
    const mapMod = await import('/src/map.js');
    mapMod.loadMap({ id: 'tiny-align', name: 'tiny', rows: ['....','....','....','....'], tile: 4, allowDisconnected: true });
    const staticCv = document.createElement('canvas'); staticCv.width = 4; staticCv.height = 4;
    const sc = staticCv.getContext('2d');
    sc.fillStyle = '#ff0000'; sc.fillRect(0, 0, 4, 2);
    sc.fillStyle = '#0000ff'; sc.fillRect(0, 2, 4, 2);
    const decalCv = document.createElement('canvas'); decalCv.width = 4; decalCv.height = 4;
    const layers = { staticLayer: staticCv, decalLayer: decalCv, W: 4, H: 4 };
    const mod = await import('/src/render2d-gpu.js?align=' + Date.now());
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    mod.initRenderer2dGpu(cv, layers);
    const fake = { camX: 8, camY: 8, zoom: 1, dpr: 1, _shx: 0, _shy: 0, layers, _decalRev: 0, entities: [], smokes: [], player: null };
    mod.render2dGpuFrame(fake, 'base');
    const ctx = cv.getContext('2d');
    const top = ctx.getImageData(24, 24, 1, 1).data;
    const bottom = ctx.getImageData(39, 39, 1, 1).data;
    return { top: [top[0], top[1], top[2], top[3]], bottom: [bottom[0], bottom[1], bottom[2], bottom[3]], ready: mod.render2dGpuReady() };
  })()`);
  console.log('CDP-PERF2D gpu orientation: ' + JSON.stringify(gpuOrient));
  if (!gpuOrient || !gpuOrient.ready || gpuOrient.top[0] < 200 || gpuOrient.bottom[2] < 200) fail('webgl base texture is vertically flipped');
  else pass('webgl base texture orientation correct');
  await cdp.close();
} catch (e) {
  fail(e.message);
} finally {
  try { proc.kill(); } catch {}
  try { srv.kill(); } catch {}
}

console.log(ok ? 'CDP-PERF2D: PASS' : 'CDP-PERF2D: FAIL');
process.exit(ok ? 0 : 1);
