import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const srv = spawn('node', ['server.js'], { cwd: 'D:/Claudeworkspace/CS2D', stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1500));
if (srv.exitCode !== null) {
  console.log('CDP-TEST: FAIL (server failed to start, exit=' + srv.exitCode + ')');
  process.exit(1);
}

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

  const html = await cdp.eval(`document.body ? document.body.innerHTML.length : -1`);
  pass('body html length: ' + html);

  const menu = await cdp.eval(`document.querySelector('.menu') ? 'yes' : 'no'`);
  pass('menu: ' + menu);

  const btns = await cdp.eval(`JSON.stringify([...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,6)))`);
  pass('buttons: ' + btns);

  const diffBtns = await cdp.eval(`JSON.stringify([...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^\u7b80\u5355|\u666e\u901a|\u56f0\u96be|\u5730\u72f1$/.test(e.textContent.trim())).map(e=>e.className).slice(0,8))`);
  pass('diff elements: ' + diffBtns);

  const clickHell = await cdp.eval(`(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='\u5730\u72f1');if(!el)return false;el.click();return true})()`);
  pass('click hell: ' + clickHell);

  const mapSel = await cdp.eval(`JSON.stringify([...document.querySelectorAll('select option')].map(o=>o.textContent.trim().slice(0,8)).slice(0,8))`);
  pass('map options: ' + mapSel);

      const startClick = await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(!b)return false;b.click();return true})()`);
  pass('click start: ' + startClick);
  await new Promise((r) => setTimeout(r, 1800));

  const inGame = await cdp.eval(`window.__cs2d.game ? JSON.stringify({state:window.__cs2d.game.state, diff:window.__cs2d.game.opts&&window.__cs2d.game.opts.diff, map:window.__cs2d.game.opts&&window.__cs2d.game.opts.mapId, round:window.__cs2d.game.round}) : 'no game'`);
  pass('game state: ' + inGame);

  const canvas = await cdp.eval(`(()=>{const c=document.querySelector('canvas');return c?c.width+'x'+c.height:'none'})()`);
  pass('canvas: ' + canvas);

  const move = await cdp.eval(`(()=>{const d=document;function fire(k){d.dispatchEvent(new KeyboardEvent('keydown',{key:k}));setTimeout(()=>d.dispatchEvent(new KeyboardEvent('keyup',{key:k})),250)}fire('KeyD');fire('KeyW');return true})()`);
  pass('keyboard sim: ' + move);
  await new Promise((r) => setTimeout(r, 1200));
  const moved = await cdp.eval(`window.__cs2d.game ? (Math.abs(window.__cs2d.game.player.vx)+Math.abs(window.__cs2d.game.player.vy)) : -1`);
  pass('player speed: ' + moved);

  const hp = await cdp.eval(`window.__cs2d.game ? window.__cs2d.game.player.hp : -1`);
  pass('player hp: ' + hp);

  const shot = await cdp.eval(`(()=>{const c=document.querySelector('canvas');if(!c)return false;c.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:800,clientY:450}));setTimeout(()=>document.dispatchEvent(new MouseEvent('mouseup',{button:0,clientX:800,clientY:450})),400);return true})()`);
  pass('click fire: ' + shot);
  await new Promise((r) => setTimeout(r, 900));
  const ammo = await cdp.eval(`window.__cs2d.game && window.__cs2d.game.player ? (window.__cs2d.game.player.ammoMap && Object.values(window.__cs2d.game.player.ammoMap)[0]) : -1`);
  pass('ammo after fire: ' + ammo);

  const mmPix = await cdp.eval("(()=>{const c=document.querySelector('canvas');if(!c)return 'no-canvas';const d=c.getContext('2d').getImageData(c.width-250,8,20,20).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>30)n++;return n>15?'minimap-ok':('pixels='+n)})()");
  pass('minimap render: ' + mmPix);

  const aim = await cdp.eval(`new Promise((res)=>{const g=window.__cs2d.game;const p=g.player;const w=g.canvasW,h=g.canvasH;g.input.locked=false;g.input.mouse.x=w-80;g.input.mouse.y=h/2;setTimeout(()=>{const c=Math.cos(p.angle);res(c>0.9?'right-ok':p.angle.toFixed(3))},250)})`);
  pass('absolute aim: ' + aim);

  await cdp.close();
} catch (e) {
  fail(e.message);
}
try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'CDP-TEST: PASS' : 'CDP-TEST: FAIL');
process.exit(ok ? 0 : 1);
