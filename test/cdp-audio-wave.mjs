import { spawn } from 'child_process';
import fs from 'node:fs';
import { waitForDebug, newTab, CDP } from './cdp.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APP_PORT = 8097;
const DBG_PORT = 9237;

const srv = spawn('node', ['server.js'], {
  cwd: 'D:/Claudeworkspace/CS2D',
  env: { ...process.env, PORT: String(APP_PORT) },
  stdio: 'ignore',
  detached: true
});

await sleep(1200);
if (srv.exitCode !== null) {
  console.log('CDP-AUDIO-WAVE: FAIL (server failed, exit=' + srv.exitCode + ')');
  process.exit(1);
}

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].find((p) => fs.existsSync(p));

const proc = spawn(exe, [
  `--remote-debugging-port=${DBG_PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
  '--window-size=1600,900',
  '--user-data-dir=C:/Users/20579/AppData/Local/Temp/opencode/cdp-profile-audio-wave',
  'about:blank'
], { stdio: 'ignore', detached: true });

let ok = true;
const fail = (m) => { ok = false; console.log('  FAIL: ' + m); };
const pass = (m) => console.log('  PASS: ' + m);

try {
  const wsUrl = await waitForDebug(DBG_PORT);
  const pageUrl = await newTab(DBG_PORT, `http://127.0.0.1:${APP_PORT}/`);
  const cdp = new CDP(pageUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
      try {
        localStorage.clear();
        localStorage.setItem('cs2d_audio', JSON.stringify({ sfx: 1, ui: 0.8, amb: 0.6, mus: 0.5 }));
      } catch (e) {}
      const RealAC = window.AudioContext || window.webkitAudioContext;
      const probe = {
        master: null,
        comp: null,
        busCount: 0,
        state: '',
        resumeCalls: 0,
        captureFrames: 0,
        captureSamples: 0,
        sumSq: 0,
        peak: 0,
        errors: [],
        connects: [],
        disconnects: [],
        starts: []
      };
      window.__audioProbe = probe;
      window.__audioDebug = [];
      if (!RealAC) return;
      const proto = RealAC.prototype;
      if (window.AudioNode) {
        const origConnect = window.AudioNode.prototype.connect;
        const origDisconnect = window.AudioNode.prototype.disconnect;
        window.AudioNode.prototype.connect = function(...args) {
          probe.connects.push({
            kind: this.constructor.name,
            dest: args[0] && args[0].constructor ? args[0].constructor.name : '?',
            t: this.context && this.context.currentTime
          });
          return origConnect.apply(this, args);
        };
        window.AudioNode.prototype.disconnect = function(...args) {
          probe.disconnects.push({
            kind: this.constructor.name,
            t: this.context && this.context.currentTime,
            now: performance.now()
          });
          return origDisconnect.apply(this, args);
        };
      }
      for (const C of [window.AudioBufferSourceNode, window.OscillatorNode]) {
        if (!C || !C.prototype || !C.prototype.start) continue;
        const origStart = C.prototype.start;
        C.prototype.start = function(...args) {
          probe.starts.push({
            kind: C.name,
            args: Array.from(args),
            t: this.context && this.context.currentTime
          });
          return origStart.apply(this, args);
        };
      }
      const createGain = proto.createGain;
      const createComp = proto.createDynamicsCompressor;
      const resume = proto.resume;
      proto.createGain = function() {
        const n = createGain.apply(this, arguments);
        if (!probe.master) probe.master = n;
        else probe.busCount++;
        return n;
      };
      proto.createDynamicsCompressor = function() {
        probe.comp = createComp.apply(this, arguments);
        return probe.comp;
      };
      proto.resume = function() {
        probe.resumeCalls++;
        probe.state = this.state;
        const p = resume.apply(this, arguments);
        if (p && typeof p.then === 'function') p.then(() => { probe.state = this.state; }).catch(() => {});
        return p;
      };
      window.__startAudioCapture = function() {
        if (probe.captureNode) return true;
        if (!probe.master) throw new Error('master missing');
        const ctx = probe.master.context;
        const node = ctx.createScriptProcessor(4096, 2, 2);
        probe.captureNode = node;
        node.onaudioprocess = (e) => {
          const chans = e.inputBuffer.numberOfChannels;
          for (let c = 0; c < chans; c++) {
            const d = e.inputBuffer.getChannelData(c);
            for (let i = 0; i < d.length; i++) {
              const a = Math.abs(d[i]);
              if (a > probe.peak) probe.peak = a;
              probe.sumSq += d[i] * d[i];
            }
          }
          probe.captureSamples += e.inputBuffer.length * chans;
          probe.captureFrames++;
          for (let c = 0; c < e.outputBuffer.numberOfChannels; c++) {
            e.outputBuffer.getChannelData(c).fill(0);
          }
        };
        probe.master.connect(node);
        node.connect(ctx.destination);
        return true;
      };
      window.__resetAudioCapture = function() {
        probe.captureFrames = 0;
        probe.captureSamples = 0;
        probe.sumSq = 0;
        probe.peak = 0;
        probe.connects = [];
        probe.disconnects = [];
        probe.starts = [];
        window.__audioDebug = [];
      };
      window.__audioCaptureStats = function() {
        return {
          frames: probe.captureFrames,
          samples: probe.captureSamples,
          rms: probe.captureSamples ? Math.sqrt(probe.sumSq / probe.captureSamples) : 0,
          peak: probe.peak,
          state: probe.state || (probe.master && probe.master.context.state) || 'no-ctx',
          resumeCalls: probe.resumeCalls,
          master: !!probe.master,
          busCount: probe.busCount,
          connects: probe.connects,
          disconnects: probe.disconnects,
          starts: probe.starts,
          debug: window.__audioDebug || [],
          errors: probe.errors
        };
      };
    })();
  `});
  await cdp.navigate(`http://127.0.0.1:${APP_PORT}/`);
  await sleep(1800);

  await cdp.eval(`document.getElementById('startBtn').click()`);
  await sleep(1500);
  await cdp.eval(`(()=>{const g=window.__cs2d.game;g.freezeT=0;g.buyTime=0;g.state='BUY';g.viewMode='fps';g.player.fireCd=0;return true})()`);
  await sleep(300);

  const audioReady = JSON.parse(await cdp.eval(`JSON.stringify({
    master: window.__audioProbe.master ? true : false,
    busCount: window.__audioProbe.busCount,
    state: window.__audioProbe.master ? window.__audioProbe.master.context.state : 'none',
    resumeCalls: window.__audioProbe.resumeCalls,
    sfxBus: window.__cs2d.audio.getBusVolume('sfx'),
    prefs: window.__cs2d.audio.getPrefs()
  })`));
  pass('audio context after start: ' + JSON.stringify(audioReady));
  if (!audioReady.master) fail('audio master node was never created');
  if (audioReady.sfxBus < 0.99) fail('sfx bus is too quiet: ' + audioReady.sfxBus);

  await cdp.eval(`window.__startAudioCapture()`);

  await cdp.eval(`window.__resetAudioCapture()`);
  await sleep(700);
  const ambient = JSON.parse(await cdp.eval(`JSON.stringify(window.__audioCaptureStats())`));
  pass('ambient capture: ' + JSON.stringify(ambient));

  await cdp.eval(`(()=>{
    const a = window.__cs2d.audio;
    a.setBusVolume('amb', 0);
    a.setBusVolume('ui', 0);
    a.setBusVolume('sfx', 1);
    return true;
  })()`);
  await cdp.eval(`window.__resetAudioCapture()`);
  await sleep(300);
  const baseline = JSON.parse(await cdp.eval(`JSON.stringify(window.__audioCaptureStats())`));
  pass('silent baseline: ' + JSON.stringify(baseline));

  await cdp.eval(`window.__resetAudioCapture()`);
  await cdp.eval(`(()=>{const g=window.__cs2d.game;g.input.mouse.down=true;g.input.mouse.wasDown=false;return true})()`);
  await sleep(250);
  await cdp.eval(`(()=>{const g=window.__cs2d.game;g.input.mouse.down=false;g.input.mouse.wasDown=false;return true})()`);
  await sleep(700);
  const shot = JSON.parse(await cdp.eval(`JSON.stringify({
    ...window.__audioCaptureStats(),
    shots: window.__cs2d.game.stats.shots
  })`));
  pass('shot capture: ' + JSON.stringify(shot));
  if (shot.rms <= 0 || shot.peak <= 0) fail('gun shot produced no audio at master output');
  if (shot.rms < 0.001) fail('gun shot RMS is too quiet: ' + shot.rms);
  if (shot.peak < 0.04) fail('gun shot peak is too quiet: ' + shot.peak);
  const shotStart = shot.connects.find((c) => c.kind === 'StereoPannerNode');
  const shotDisconnect = shot.disconnects.find((d) => d.kind === 'StereoPannerNode');
  if (shotStart && shotDisconnect && shotDisconnect.t <= shotStart.t) {
    fail('gun shot positional chain was disconnected before playback');
  }

  await cdp.eval(`(()=>{
    const a = window.__cs2d.audio;
    a.setBusVolume('amb', 0);
    a.setBusVolume('ui', 0.8);
    a.setBusVolume('sfx', 0);
    return true;
  })()`);
  await cdp.eval(`window.__resetAudioCapture()`);
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', bubbles: true }))`);
  await sleep(150);
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB', bubbles: true }))`);
  await sleep(500);
  const ui = JSON.parse(await cdp.eval(`JSON.stringify(window.__audioCaptureStats())`));
  pass('ui capture: ' + JSON.stringify(ui));

  await cdp.close();
} catch (e) {
  fail(e.stack || e.message);
}

try { proc.kill(); } catch {}
try { srv.kill(); } catch {}
console.log(ok ? 'CDP-AUDIO-WAVE: PASS' : 'CDP-AUDIO-WAVE: FAIL');
process.exit(ok ? 0 : 1);
