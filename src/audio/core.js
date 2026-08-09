let ac = null;
let master = null;
let comp = null;
const buses = {};
let noiseBuf = null;
const lastVoice = {};
let unlockBound = false;
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

export const VOL_DEFAULTS = { sfx: 1, ui: 0.8, amb: 0.6, mus: 0.5 };

export function initAudioCore(factory) {
  if (ac) return;
  try {
    ac = factory();
    if (!ac) return;
    unlockBound = false;
    master = ac.createGain();
    master.gain.value = 1;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 8;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master.connect(comp);
    comp.connect(ac.destination);
    for (const b of Object.keys(VOL_DEFAULTS)) {
      const g = ac.createGain();
      g.gain.value = VOL_DEFAULTS[b];
      g.connect(master);
      buses[b] = g;
    }
    const len = ac.sampleRate || 44100;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate || 44100);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; unlockBound = false; }
}

export function getAc() { return ac; }
export function isAudioReady() { return !!ac; }
export function resumeAudio() {
  if (!ac || !ac.resume || (ac.state && ac.state === 'running')) return false;
  try {
    const p = ac.resume();
    if (p && typeof p.then === 'function') p.catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}
export function bindAudioUnlock(target) {
  if (!target || unlockBound || typeof target.addEventListener !== 'function') return;
  unlockBound = true;
  const unlock = () => { resumeAudio(); };
  for (const type of UNLOCK_EVENTS) {
    target.addEventListener(type, unlock, { capture: true, once: true, passive: true });
  }
}
export function getBus(name) { return buses[name] || buses.sfx; }
export function setBusVolume(bus, v) { if (buses[bus]) buses[bus].gain.value = v; }
export function getBusVolume(bus) { return buses[bus] ? buses[bus].gain.value : 0; }
export function setMasterGain(v) { if (master) master.gain.value = v; }

// 同 name 短间隔节流（高频事件防爆音）
export function throttle(name, ms) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (lastVoice[name] !== undefined && now - lastVoice[name] < ms) return false;
  lastVoice[name] = now;
  return true;
}

// 节点图生命周期：所有 patch 把创建节点收进 list，source 播完统一断开
export function wrapTail(src, nodes, onEnd, guard) {
  try {
    if (guard) guard.pending = (guard.pending || 0) + 1;
    src.onended = () => {
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已断开 */ } }
      src.onended = null;
      if (guard) {
        guard.pending -= 1;
        if (guard.pending <= 0 && typeof guard.cleanup === 'function') guard.cleanup();
      } else if (typeof onEnd === 'function') {
        onEnd();
      }
    };
  } catch (e) { /* 无 onended 环境 */ }
}

// 单声道随机噪声缓冲源
export function noiseSrc() {
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}
