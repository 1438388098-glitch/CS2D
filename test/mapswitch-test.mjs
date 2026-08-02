import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const srv = spawn('node', ['server.js'], { cwd: 'D:/Claudeworkspace/CS2D', stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1500));
const { proc, port } = launchBrowser();
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);
try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, 'http://127.0.0.1:8080/');
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.navigate('http://127.0.0.1:8080/');
  await new Promise((r) => setTimeout(r, 2500));

  const maps = await cdp.eval(`JSON.stringify([...document.querySelectorAll('[data-map]')].map(b=>({m:b.getAttribute('data-map'),t:b.textContent.trim()})))`);
  pass('map buttons: ' + maps);

  const clickCanal = await cdp.eval(`(()=>{const b=document.querySelector('[data-map="canal"]');if(!b)return 'no-canal-btn';b.click();return document.querySelector('[data-map="canal"]').classList.contains('sel')})()`);
  pass('click canal selected: ' + clickCanal);

  const stored = await cdp.eval(`localStorage.getItem('cs2d_map')`);
  pass('localStorage cs2d_map: ' + stored);

  const optsMap = await cdp.eval(`window.__cs2d.game.opts.mapId`);
  pass('opts.mapId after click: ' + optsMap);

  const startClick = await cdp.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/\\u5f00\\u59cb|start/i.test(b.textContent));if(!b)return false;b.click();return true})()`);
  pass('click start: ' + startClick);
  await new Promise((r) => setTimeout(r, 1800));

  const state = await cdp.eval(`window.__cs2d.game ? JSON.stringify({state:window.__cs2d.game.state, mapId:window.__cs2d.game.opts.mapId}) : 'no game'`);
  pass('game state: ' + state);

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
