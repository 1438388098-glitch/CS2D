import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_PORT = 8094;
const DBG_PORT = 9234;
const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-FOG: FAIL (server failed, exit=' + srv.exitCode + ')');
  process.exit(1);
}

const { proc, port } = launchBrowser({
  port: DBG_PORT,
  profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-fog'
});
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await sleep(1500);

  const fogOn = await cdp.eval(`(()=>{
    const c=document.querySelector('[data-mode="classic"]');
    if (c && !c.classList.contains('sel')) c.click();
    const cb=document.getElementById('fogCheck');
    if (cb && !cb.checked) cb.click();
    return !!(window.__cs2d && window.__cs2d.game && window.__cs2d.game.opts.fog);
  })()`);
  pass('fog enabled: ' + fogOn);

  await cdp.eval(`window.__cs2d.game && window.__cs2d.game.ui && window.__cs2d.game.ui.showMenu()`);
  await sleep(150);
  const started = await cdp.eval(`(()=>{
    const card=document.querySelector('.map-card[data-map="dust2"]');
    if (card) card.click();
    const b=document.getElementById('startBtn');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  pass('started: ' + started);
  await sleep(2500);

  const sample = await cdp.eval(`(()=>{
    const g=window.__cs2d.game;
    if (!g || !g._fogCv) return 'no-fog-canvas';
    const cv=g._fogCv;
    const c=cv.getContext('2d');
    const data=c.getImageData(0,0,cv.width,cv.height).data;
    let clear=0, soft=0;
    for (let i=0;i<data.length;i+=4) {
      const a=data[i+3];
      if (a < 28) clear++;
      if (a > 24 && a < 230) soft++;
    }
    const sx=cv.width / g.mapW;
    const sy=cv.height / g.mapH;
    const px=Math.round(g.player.x * sx);
    const py=Math.round(g.player.y * sy);
    const pa=c.getImageData(px,py,1,1).data[3];
    return JSON.stringify({
      fog:g.opts.fog,
      map:[g.mapW,g.mapH],
      cv:[cv.width,cv.height],
      clearPct:+(100*clear/data.length*4).toFixed(1),
      softPx:soft,
      playerAlpha:pa
    });
  })()`);

  const s = JSON.parse(sample);
  pass('sample: ' + sample);
  if (!s.fog) fail('fog option was not active');
  if (!s.map || !s.cv || s.cv[0] < 100) fail('fog canvas was not built');
  if (s.playerAlpha >= 60) fail('player position should be visible in fog');
  if (s.clearPct < 5) fail('fog visible area should cover a large share of the map');
  if (s.softPx < 100) fail('fog should have a soft edge transition');

  await cdp.close();
} catch (e) {
  fail(e.message);
}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'CDP-FOG: PASS' : 'CDP-FOG: FAIL');
process.exit(ok ? 0 : 1);
