import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_PORT = 8091;
const DBG_PORT = 9231;
const srv = spawn('node', ['server.js'], { cwd: 'D:/Claudeworkspace/CS2D', env: { ...process.env, PORT: String(APP_PORT) }, stdio: 'ignore', detached: true });
await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-MAPS: FAIL (server failed, exit=' + srv.exitCode + ')');
  process.exit(1);
}

const { proc, port } = launchBrowser({ port: DBG_PORT, profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-maps' });
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await sleep(1500);
  await cdp.eval(`(()=>{const c=document.querySelector('[data-mode="classic"]'); if(c && !c.classList.contains('sel')) c.click(); return true})()`);

  for (const id of ['dust2', 'canal', 'metro', 'arctic', 'blast', 'forge', 'foundry-port']) {
    await cdp.eval(`window.__cs2d.game && window.__cs2d.game.ui && window.__cs2d.game.ui.showMenu()`);
    await sleep(150);
    const picked = await cdp.eval(`(()=>{const el=document.querySelector('.map-card[data-map="${id}"]');if(!el)return false;el.click();return true})()`);
    const started = await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(!b)return false;b.click();return true})()`);
    await sleep(1500);
    const state = await cdp.eval(`window.__cs2d.game ? JSON.stringify({state:window.__cs2d.game.state,map:window.__cs2d.game.opts.mapId,round:window.__cs2d.game.round,crates:(window.__cs2d.game.crates||[]).length}) : 'no-game'`);
    const mm = await cdp.eval(`(()=>{const c=document.querySelector('canvas');if(!c)return 'no-canvas';const d=c.getContext('2d').getImageData(c.width-250,8,20,20).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>30)n++;return n>15?'ok':'pixels='+n})()`);
    const okMap = state.includes('"map":"' + id + '"') && state.includes('"state":"BUY"');
    console.log('map ' + id + ': picked=' + picked + ' started=' + started + ' state=' + state + ' minimap=' + mm + (okMap ? ' PASS' : ' FAIL'));
    if (!picked || !started || !okMap || mm !== 'ok') fail(id + ' browser check');
  }

  await cdp.close();
} catch (e) {
  fail(e.message);
}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'CDP-MAPS: PASS' : 'CDP-MAPS: FAIL');
process.exit(ok ? 0 : 1);
