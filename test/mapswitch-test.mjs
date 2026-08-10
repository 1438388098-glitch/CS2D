import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const APP_PORT = 8092;
const DBG_PORT = 9232;
const srv = spawn('node', ['server.js'], { cwd: 'D:/Claudeworkspace/CS2D', env: { ...process.env, PORT: String(APP_PORT) }, stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1500));
const { proc, port } = launchBrowser({ port: DBG_PORT, profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-switch' });
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);
try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await new Promise((r) => setTimeout(r, 2500));
  await cdp.eval(`(()=>{const c=document.querySelector('[data-mode="classic"]'); if(c && !c.classList.contains('sel')) c.click(); return true})()`);

  const maps = await cdp.eval(`JSON.stringify([...document.querySelectorAll('[data-map]')].map(b=>({m:b.getAttribute('data-map'),t:b.textContent.trim()})))`);
  const mapsArr = JSON.parse(maps);
  if (!mapsArr.some((b) => b.m === 'canal')) { fail('canal map button missing: ' + maps); }
  else pass('map buttons: ' + maps);

  const clickCanal = await cdp.eval(`(()=>{const b=document.querySelector('[data-map="canal"]');if(!b)return 'no-canal-btn';b.click();return document.querySelector('[data-map="canal"]').classList.contains('sel')})()`);
  if (clickCanal !== true) { fail('canal button not selected: ' + clickCanal); }
  else pass('click canal selected: ' + clickCanal);

  const stored = await cdp.eval(`localStorage.getItem('cs2d_map')`);
  if (stored !== 'canal') { fail('localStorage cs2d_map expected canal got ' + stored); }
  else pass('localStorage cs2d_map: ' + stored);

  const optsMap = await cdp.eval(`window.__cs2d.game.opts.mapId`);
  if (optsMap !== 'canal') { fail('opts.mapId expected canal got ' + optsMap); }
  else pass('opts.mapId after click: ' + optsMap);

  const startClick = await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(!b)return false;b.click();return true})()`);
  if (!startClick) { fail('start button not found'); }
  else pass('click start: ' + startClick);
  await new Promise((r) => setTimeout(r, 1800));

  const state = await cdp.eval(`window.__cs2d.game ? JSON.stringify({state:window.__cs2d.game.state, mapId:window.__cs2d.game.opts.mapId}) : 'no game'`);
  const stObj = state === 'no game' ? null : JSON.parse(state);
  if (!stObj || (stObj.state !== 'BUY' && stObj.state !== 'LIVE')) { fail('game not running: ' + state); }
  else if (stObj.mapId !== 'canal') { fail('game mapId expected canal got ' + stObj.mapId); }
  else pass('game state: ' + state);

  const mmTex = await cdp.eval(`(()=>{const g=window.__cs2d.game;const l=g.layers;return l&&l.miniMap?l.miniMap.width+'x'+l.miniMap.height:'no-layers'})()`);
  pass('minimap layer: ' + mmTex);

  const layerSize = await cdp.eval(`(()=>{const g=window.__cs2d.game;const l=g.layers;return l&&l.staticLayer?(l.staticLayer.width+'x'+l.staticLayer.height):'no'})()`);
  pass('static layer size: ' + layerSize + ' (game mapW/H: ' + (await cdp.eval(`window.__cs2d.game.mapW + 'x' + window.__cs2d.game.mapH`)) + ')');

  const canalPix = await cdp.eval(`(()=>{const c=document.querySelector('canvas');const d=c.getContext('2d').getImageData(c.width-250,8,20,20).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=d[i]+d[i+1]+d[i+2];return Math.round(sum/100)})()`);
  pass('canal map brightness: ' + canalPix);

  await cdp.close();
} catch (e) {
  fail(e.message);
}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'MAPSWITCH-TEST: PASS' : 'MAPSWITCH-TEST: FAIL');
process.exit(ok ? 0 : 1);
