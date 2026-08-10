import { buildShot, buildSfx, buildUi } from '../src/audio/patches.js';
import { initAudioCore } from '../src/audio/core.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log('ok - audio-tail-guard: ' + name);
  else { failures++; console.log('FAIL - audio-tail-guard: ' + name); }
}

function param() {
  return {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}
  };
}

function node(type) {
  return {
    type,
    gain: param(),
    frequency: param(),
    Q: param(),
    delayTime: param(),
    pan: param(),
    buffer: null,
    playbackRate: param(),
    loop: false,
    connected: false,
    connect() { this.connected = true; },
    disconnect() { this.connected = false; },
    start() {},
    stop() {}
  };
}

const ac = {
  state: 'running',
  currentTime: 0,
  sampleRate: 44100,
  destination: node('destination'),
  createDynamicsCompressor: () => {
    const n = node('comp');
    n.threshold = param();
    n.knee = param();
    n.ratio = param();
    n.attack = param();
    n.release = param();
    return n;
  },
  createBuffer() {
    return { getChannelData: () => new Float32Array(44100), duration: 1 };
  },
  createBufferSource: () => node('source'),
  createBiquadFilter: () => node('filter'),
  createGain: () => node('gain'),
  createOscillator: () => node('osc'),
  createStereoPanner: () => node('panner'),
  createDelay: () => node('delay')
};

initAudioCore(() => ac);

function makeGuard() {
  return { pending: 0, cleaned: false, cleanup() { this.cleaned = true; } };
}

const pistol = makeGuard();
buildShot(ac, { out: node('out'), vol: 1, variant: 'pistol', lp: 3000, guard: pistol });
check('pistol registers every tail voice', pistol.pending === 1);
check('pistol keeps positional chain alive', !pistol.cleaned);

const shotgun = makeGuard();
buildShot(ac, { out: node('out'), vol: 1, variant: 'shotgun', lp: 3000, guard: shotgun });
check('shotgun registers every tail voice', shotgun.pending === 1);
check('shotgun keeps positional chain alive', !shotgun.cleaned);

const boom = makeGuard();
buildSfx(ac, { out: node('out'), vol: 1, name: 'boom', lp: 3000, guard: boom });
check('world sfx registers every tail voice', boom.pending === 2);
check('world sfx keeps positional chain alive', !boom.cleaned);

buildUi(ac, { out: node('out'), vol: 1, name: 'panel' });
check('ui sfx still works without a tail guard', true);

console.log(failures === 0 ? 'audio-tail-guard: PASS' : 'audio-tail-guard: FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
