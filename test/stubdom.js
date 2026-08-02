const noop = () => {};

function makeCtx() {
  const t = {
    canvas: { width: 0, height: 0 },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    measureText: () => ({ width: 8 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop
  };
  return new Proxy(t, {
    get(o, p) {
      if (p in o) return o[p];
      return noop;
    },
    set(o, p, v) { o[p] = v; return true; }
  });
}

const ctx = makeCtx();
const elements = {};

function el(id) {
  if (elements[id]) return elements[id];
  const e = {
    style: {},
    children: [],
    innerHTML: '',
    textContent: '',
    value: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: (c) => { e.children.push(c); },
    removeChild: (c) => {
      const i = e.children.indexOf(c);
      if (i >= 0) e.children.splice(i, 1);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    getContext: () => ctx,
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    contains: () => true,
    setAttribute: noop,
    getAttribute: () => null,
    focus: noop,
    blur: noop,
    remove: noop
  };
  Object.defineProperty(e, 'className', {
    get() { return e._cn || ''; },
    set(v) { e._cn = v; }
  });
  Object.defineProperty(e, 'firstChild', {
    get() { return e.children.length ? e.children[0] : null; }
  });
  elements[id] = e;
  return e;
}

class StubAudioContext {
  constructor() {
    this.destination = {};
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
  }
  createGain() { return stubNode(); }
  createOscillator() { return Object.assign(stubNode(), { type: '', start: noop, stop: noop }); }
  createBufferSource() { return Object.assign(stubNode(), { buffer: null, start: noop, stop: noop, playbackRate: stubParam() }); }
  createBiquadFilter() { return Object.assign(stubNode(), { type: '' }); }
  createStereoPanner() { return stubNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() { return Promise.resolve(); }
}

function stubParam() {
  return {
    value: 0,
    setValueAtTime: noop,
    setTargetAtTime: noop,
    linearRampToValueAtTime: noop,
    exponentialRampToValueAtTime: noop,
    cancelScheduledValues: noop
  };
}

function stubNode() {
  return { connect: noop, disconnect: noop, gain: stubParam(), pan: stubParam(), frequency: stubParam(), Q: stubParam() };
}

export function installStubs() {
  globalThis.window = {
    addEventListener: noop,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    AudioContext: StubAudioContext,
    webkitAudioContext: StubAudioContext
  };
  globalThis.document = {
    readyState: 'complete',
    getElementById: (id) => (id in elements ? elements[id] : null),
    createElement: (tag) => el('dyn_' + tag + '_' + Math.random()),
    addEventListener: noop,
    body: { style: {}, appendChild: noop }
  };
  globalThis.requestAnimationFrame = (cb) => cb;
  globalThis.AudioContext = StubAudioContext;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
}

export function registerDomIds(...ids) {
  for (const id of ids) el(id);
}

export function registerUiIds() {
  registerDomIds(
    'ban1', 'ban2', 'banner', 'toast', 'flash', 'dmgv', 'lowhp', 'obj1', 'obj2', 'objtext',
    'holdbar', 'holdbarfill', 'menu', 'end', 'pause', 'buy', 'buyCash', 'buyTime', 'buyGrid',
    'scoreboard', 'sbBody', 'sbScoreT', 'sbScoreC', 'sbRound', 'endFinal', 'endScore', 'endKd',
    'endMvp', 'endStats', 'killfeed', 'deathinfo', 'streak', 'muteBtn', 'teamCt', 'teamT',
    'diffN', 'diffE', 'diffH', 'diffHell', 'botSel', 'startBtn', 'mapSel',
    'resumeBtn', 'restartBtn', 'quitBtn', 'againBtn', 'endMenuBtn'
  );
}
