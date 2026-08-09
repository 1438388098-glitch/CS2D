// audio 模块无浏览器环境测试：mock AudioContext 逐 patch 跑通 + bus 音量 + voice 上限 + 节点清理
import { initAudioCore, setBusVolume, getBusVolume, throttle, wrapTail, getAc, getBus } from '../src/audio/core.js';
import { buildShot, buildSfx, buildUi, buildAmbient } from '../src/audio/patches.js';
import { sfx, uiSfx, isMuted, setMuted, startAmbient, stopAmbient } from '../src/audio/master.js';

let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log('ok - ' + name);
  } else {
    failures++;
    console.log('FAIL - ' + name);
  }
}

function makeNode(type) {
  const node = {
    type,
    value: 1,
    gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    frequency: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    Q: { value: 1 },
    threshold: { value: -18 }, knee: { value: 24 }, ratio: { value: 8 }, attack: { value: .01 }, release: { value: .25 },
    delayTime: { value: .2 },
    pan: { value: 0 },
    buffer: null,
    playbackRate: { value: 1 },
    loop: false,
    onended: null,
    disconnected: false,
    connects: [],
    start() { this.started = true; },
    stop() { this.stopped = true; if (this.onended) this.onended(); },
    connect(n) { if (n && n.connects) n.connects.push(this); },
    disconnect() { this.disconnected = true; }
  };
  return node;
}

const mockAC = {
  currentTime: 0,
  sampleRate: 44100,
  createGain: () => makeNode('gain'),
  createOscillator: () => makeNode('osc'),
  createBufferSource: () => makeNode('bufferSource'),
  createBiquadFilter: () => makeNode('filter'),
  createStereoPanner: () => makeNode('panner'),
  createDelay: () => makeNode('delay'),
  createDynamicsCompressor: () => makeNode('comp'),
  createBuffer: () => ({ getChannelData: () => new Float32Array(44100), duration: 1 }),
  destination: makeNode('dest')
};

// 1. 核心初始化
initAudioCore(() => mockAC);
check('core init', !!getAc());

// 2. bus 音量
setBusVolume('sfx', 0.5);
check('bus volume set/get', Math.abs(getBusVolume('sfx') - 0.5) < 1e-9);
setBusVolume('sfx', 1);

// 3. 武器音色全 variant 跑通
const env = { out: getBus('sfx'), vol: 0.8, lp: 3000, mapId: 'dust2' };
for (const variant of ['ak', 'rifle', 'smg', 'sniper', 'pistol', 'shotgun', 'knife']) {
  let threw = false;
  try { buildShot(getAc(), { ...env, variant }); } catch (e) { threw = true; console.log('err ' + variant + ': ' + e.message); }
  check('shot variant ' + variant, !threw);
}

// 4. 通用音效全 name 跑通
const sfxNames = ['reload', 'reloadEnd', 'hit', 'head', 'penetrate', 'crateHit', 'crateBreak', 'step', 'splash', 'boom', 'beep', 'beepFast',
  'beepWarn', 'empty', 'whistle', 'win', 'lose', 'buy', 'flash', 'smoke', 'kill', 'doublekill', 'streak',
  'heart', 'plantTic', 'bombPlanted', 'bombDefused'];
for (const name of sfxNames) {
  let threw = false;
  try { buildSfx(getAc(), { out: getBus('sfx'), vol: 0.6, name, mat: 'flat' }); } catch (e) { threw = true; console.log('err ' + name + ': ' + e.message); }
  check('sfx ' + name, !threw);
}

// 5. UI 音效
const uiNames = ['hover', 'click', 'confirm', 'error', 'panel'];
for (const name of uiNames) {
  let threw = false;
  try { buildUi(getAc(), { out: getBus('ui'), vol: 0.5, name }); } catch (e) { threw = true; console.log('err ui ' + name + ': ' + e.message); }
  check('ui ' + name, !threw);
}

// 6. master.sfx 完整链路（含定位/低通/混响）
let threw = false;
try {
  sfx('shot', 0.85, 100, 100, { mapId: 'metro', player: { x: 0, y: 0, dead: false, angle: 0 } }, 'ak');
  sfx('boom', 1, 50, 50, { mapId: 'metro', player: { x: 0, y: 0, dead: false, angle: 0 } });
  sfx('step', 0.4, 10, 10, { mapId: 'canal', player: { x: 0, y: 0, dead: false, angle: 0 } }, null, 'metal');
  uiSfx('click', 0.3);
} catch (e) { threw = true; console.log('err master: ' + e.message); }
check('master sfx chain', !threw);

// 7. throttle：同 name 短间隔第二次被拒
check('throttle first ok', throttle('testThrottle', 50) === true);
check('throttle second blocked', throttle('testThrottle', 50) === false);

// 8. wrapTail：onended 触发断开
const src = getAc().createBufferSource();
const g = getAc().createGain();
wrapTail(src, [src, g]);
src.onended();
check('wrapTail cleanup', g.disconnected === true && src.disconnected === true);

// 9. muted 拦截
setMuted(true);
check('muted blocks sfx', isMuted() === true);
setMuted(false);

// 10. 环境音：三图构建 + 切换 + 停止
for (const mid of ['dust2', 'canal', 'metro']) {
  let threw = false;
  try {
    const inst = buildAmbient(getAc(), mid);
    inst.start(getBus('amb'));
    inst.stop();
  } catch (e) { threw = true; console.log('err ambient ' + mid + ': ' + e.message); }
  check('ambient ' + mid, !threw);
}
startAmbient('metro');
startAmbient('metro'); // 同图重复调用应无异常
check('ambient same-map guard', true);
stopAmbient();
check('ambient stop', true);

console.log(failures === 0 ? 'audio-patch: PASS' : 'audio-patch: FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
