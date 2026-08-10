import { launchBrowser, waitForDebug, newTab, CDP } from './cdp.js';
import { spawn } from 'child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_PORT = 8095;
const DBG_PORT = 9235;
const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});

await sleep(1500);
if (srv.exitCode !== null) {
  console.log('CDP-AUDIO: FAIL (server failed, exit=' + srv.exitCode + ')');
  process.exit(1);
}

const { proc, port } = launchBrowser({
  port: DBG_PORT,
  profile: 'C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-audio'
});
let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(port);
  const pageUrl = await newTab(port, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      try {
        localStorage.clear();
        localStorage.setItem('cs2d_audio', JSON.stringify({ sfx: 0, ui: 0.8, amb: 0.6, mus: 0.5 }));
      } catch (e) {}
      window.__audioProbe = { osc: 0, src: 0, started: 0 };
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const p = AC.prototype;
      const oc = p.createOscillator;
      const bs = p.createBufferSource;
      p.createOscillator = function() {
        const n = oc.apply(this, arguments);
        window.__audioProbe.osc++;
        const s = n.start.bind(n);
        n.start = function() { window.__audioProbe.started++; return s.apply(this, arguments); };
        return n;
      };
      p.createBufferSource = function() {
        const n = bs.apply(this, arguments);
        window.__audioProbe.src++;
        const s = n.start.bind(n);
        n.start = function() { window.__audioProbe.started++; return s.apply(this, arguments); };
        return n;
      };
    })();
  `});
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await sleep(1800);

  const started = await cdp.eval(`(()=>{const b=document.getElementById('startBtn');if(!b)return false;b.click();return true})()`);
  if (!started) fail('start button missing');
  await sleep(1500);
  await cdp.eval(`(()=>{const g=window.__cs2d.game;if(!g)return false;g.freezeT=0;g.buyTime=0;g.state='BUY';return true})()`);
  await sleep(100);

  const audioState = JSON.parse(await cdp.eval(`JSON.stringify({
    storage: localStorage.getItem('cs2d_audio'),
    slider: document.querySelector('.vol-slider[data-bus="sfx"]').value,
    bus: window.__cs2d.audio.getBusVolume('sfx'),
    prefs: window.__cs2d.audio.getPrefs()
  })`));
  pass('sfx recovery: ' + JSON.stringify(audioState));
  const storedPrefs = JSON.parse(audioState.storage);
  if (storedPrefs.sfx !== 1) fail('legacy sfx:0 should migrate to 1, got ' + storedPrefs.sfx);
  if (audioState.slider !== '1') fail('sfx slider should recover to 1, got ' + audioState.slider);
  if (audioState.bus < 0.99) fail('sfx bus should be audible after migration, got ' + audioState.bus);

  const overlay = await cdp.eval(`(()=>{
    const o = document.getElementById('tutorialOverlay');
    const hit = document.elementFromPoint(1350, 450);
    return JSON.stringify({
      show: !!(o && o.classList.contains('show')),
      pointerEvents: o ? getComputedStyle(o).pointerEvents : 'missing',
      hit: hit ? hit.id : 'none'
    });
  })()`);
  pass('overlay state: ' + overlay);
  const parsedOverlay = JSON.parse(overlay);
  if (!parsedOverlay.show) fail('tutorial overlay should be shown by default');
  if (parsedOverlay.pointerEvents !== 'none') fail('tutorial overlay must not swallow canvas clicks');
  if (parsedOverlay.hit !== 'game') fail('canvas click point should resolve to game canvas');

  await cdp.eval(`(()=>{const g=window.__cs2d.game;if(!g)return false;g.viewMode='fps';g.freezeT=0;g.buyTime=0;g.state='BUY';g.player.fireCd=0;return true})()`);
  await sleep(500);

  const before = JSON.parse(await cdp.eval(`JSON.stringify({
    ...window.__audioProbe,
    shots: window.__cs2d.game ? window.__cs2d.game.stats.shots : -1,
    state: window.__cs2d.game ? window.__cs2d.game.state : -1,
    freezeT: window.__cs2d.game ? window.__cs2d.game.freezeT : -1,
    viewMode: window.__cs2d.game ? window.__cs2d.game.viewMode : -1
  })`));

  const fired = await cdp.eval(`new Promise((res)=>{
    const c = document.querySelector('canvas');
    if (!c) return res('no-canvas');
    c.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 1350, clientY: 450, bubbles: true }));
    setTimeout(() => {
      const g = window.__cs2d.game;
      const out = JSON.stringify({
        shots: g ? g.stats.shots : -1,
        state: g ? g.state : -1,
        freezeT: g ? g.freezeT : -1,
        viewMode: g ? g.viewMode : -1,
        down: g ? g.input.mouse.down : -1,
        trigger: g && g.player ? g.player.trigger : -1
      });
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 1350, clientY: 450, bubbles: true }));
      res(out);
    }, 500);
  })`);
  if (!fired) fail('canvas missing');
  pass('fire result: ' + fired);
  await sleep(1000);

  const after = JSON.parse(await cdp.eval(`JSON.stringify({
    ...window.__audioProbe,
    shots: window.__cs2d.game ? window.__cs2d.game.stats.shots : -1,
    state: window.__cs2d.game ? window.__cs2d.game.state : -1,
    freezeT: window.__cs2d.game ? window.__cs2d.game.freezeT : -1,
    viewMode: window.__cs2d.game ? window.__cs2d.game.viewMode : -1
  })`));
  const nodeDelta = (after.osc - before.osc) + (after.src - before.src);
  const startedDelta = after.started - before.started;
  const shotDelta = after.shots - before.shots;
  pass('audio nodes before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));
  if (shotDelta !== 1) fail('shot should be registered, delta=' + shotDelta);
  if (nodeDelta <= 0) fail('firing should create audio nodes, delta=' + nodeDelta);
  if (startedDelta <= 0) fail('firing should start audio nodes, delta=' + startedDelta);
  if (before.viewMode !== 'fps' || after.viewMode !== 'fps') fail('FPS viewmode should stay active during shot test');

  const overlayGone = await cdp.eval(`!document.getElementById('tutorialOverlay').classList.contains('show')`);
  pass('overlay auto-closes on first canvas click: ' + overlayGone);
  if (!overlayGone) fail('overlay should auto-close after first canvas click');

  await cdp.close();
} catch (e) {
  fail(e.message);
}

try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'CDP-AUDIO: PASS' : 'CDP-AUDIO: FAIL');
process.exit(ok ? 0 : 1);
