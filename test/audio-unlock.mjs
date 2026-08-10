// Audio autoplay unlock regression: suspended contexts must be resumed before
// playback. sfx attempts resume first, so a context created without an active
// gesture is not permanently silenced.
import { initAudioCore, isAudioReady, resumeAudio, bindAudioUnlock, getAc } from '../src/audio/core.js';
import { uiSfx } from '../src/audio/master.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log('ok - audio-unlock: ' + name);
  } else {
    failures++;
    console.log('FAIL - audio-unlock: ' + name);
  }
}

function param() {
  return {
    value: 1,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {}
  };
}

function node(type) {
  return {
    type,
    gain: param(),
    frequency: param(),
    Q: param(),
    threshold: { value: -18 },
    knee: { value: 24 },
    ratio: { value: 8 },
    attack: { value: 0.01 },
    release: { value: 0.25 },
    delayTime: param(),
    pan: param(),
    buffer: null,
    loop: false,
    onended: null,
    started: false,
    stopped: false,
    connects: [],
    connect() {},
    disconnect() {},
    start() { this.started = true; },
    stop() { this.stopped = true; }
  };
}

const ac = {
  state: 'suspended',
  currentTime: 0,
  sampleRate: 44100,
  resumeCount: 0,
  oscillatorCount: 0,
  createGain: () => node('gain'),
  createDynamicsCompressor: () => node('comp'),
  createStereoPanner: () => node('panner'),
  createBiquadFilter: () => node('filter'),
  createDelay: () => node('delay'),
  createOscillator() { this.oscillatorCount++; return node('osc'); },
  createBuffer() { return { getChannelData: () => new Float32Array(44100) }; },
  resume() {
    this.resumeCount++;
    this.state = 'running';
    return Promise.resolve();
  }
};

const events = {};
const win = {
  addEventListener(type, fn) { events[type] = fn; }
};

initAudioCore(() => ac);
check('created context is ready for scheduling', isAudioReady() === true);
check('suspended init does not resume yet', ac.resumeCount === 0);

const oscBefore = ac.oscillatorCount;
uiSfx('click', 0.3);
check('sfx attempts resume and builds while suspended', ac.resumeCount === 1 && ac.oscillatorCount > oscBefore);

bindAudioUnlock(win);
check('gesture unlock listener registered', typeof events.pointerdown === 'function');
events.pointerdown();
check('already running gesture no-ops', ac.resumeCount === 1 && ac.state === 'running');
check('running context is ready', isAudioReady() === true);

uiSfx('click', 0.3);
check('sfx builds after unlock', ac.oscillatorCount > oscBefore);
check('resume helper no-ops when running', resumeAudio() === false && ac.resumeCount === 1);
check('getAc returns context', getAc() === ac);

console.log(failures === 0 ? 'audio-unlock: PASS' : 'audio-unlock: FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
