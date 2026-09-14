import {ctx as gameCtx} from '../ctx.js';
import {clamp} from '../utils.js';
import {initAudioCore, getAc, isAudioReady, resumeAudio, bindAudioUnlock, getBus, setBusVolume, getBusVolume, setMasterGain, throttle, VOL_DEFAULTS} from './core.js';
import {buildShot, buildSfx, buildUi, buildAmbient} from './patches.js';
import {readAudioPrefs, writeAudioPrefs} from './prefs.js';

// 击杀音效包（candidate-588）：classic / metal / bit8，由设置写入
let _soundPack = 'classic';
export function setSoundPack(pk) { if (['classic', 'metal', 'bit8'].includes(pk)) _soundPack = pk; }
export function soundPack() { return _soundPack; }

let muted = false;
let gameProvider = null;

// 事件总线订阅（逻辑层 emit('sfx')，音频订阅播放）
gameCtx.bus.on('sfx', (p) => sfx(p.name, p.vol, p.x, p.y, p.game, p.wid, p.mat));

export function initAudio() {
  if (getAc() && isAudioReady()) return;
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    initAudioCore(() => new AC());
    resumeAudio();
    if (typeof window !== 'undefined') bindAudioUnlock(window);
    // 静音状态持久化：启动时从偏好恢复
    try {
      const prefs = readAudioPrefs(localStorage);
      muted = prefs.muted === true;
    } catch (e) { /* 无存储 */ }
    setMasterGain(muted ? 0 : 1);
    // 音量偏好（设置页滑杆）
    try {
      const prefs = readAudioPrefs(localStorage);
      for (const b of Object.keys(VOL_DEFAULTS)) setBusVolume(b, prefs[b]);
      writeAudioPrefs(prefs, localStorage);
    } catch (e) { /* 无存储 */ }
  } catch (e) { /* 无音频环境 */ }
}

export function setMuted(v) {
  muted = v;
  setMasterGain(v ? 0 : 1);
  // 持久化静音状态
  try {
    const prefs = readAudioPrefs(localStorage);
    prefs.muted = v;
    writeAudioPrefs(prefs, localStorage);
  } catch (e) { /* 无存储 */ }
  // 对局中解除静音：环境音立即恢复（muted 期间 startAmbient 会早退）
  if (!v && lastAmbientMapId != null) {
    try { startAmbient(lastAmbientMapId); } catch (e) { /* 无音频环境 */ }
  }
}

export function isMuted() { return muted; }

export function setAudioContext(gameProviderFn) {
  gameProvider = gameProviderFn;
}

export function bindToGame(g) {
  gameProvider = () => g;
}

const GUN_BY_WID = {
  ak: 'ak', m4: 'rifle', famas: 'rifle', mac10: 'smg', mp9: 'smg', p90: 'smg',
  awp: 'sniper', xm: 'shotgun', p250: 'pistol', deagle: 'pistol', glock: 'pistol', usp: 'pistol', knife: 'knife'
};

function shotVariantFor(name, wid) {
  if (GUN_BY_WID[wid]) return GUN_BY_WID[wid];
  if (name === 'awp') return 'sniper';
  if (name === 'shotgun') return 'shotgun';
  if (name === 'pistol') return 'pistol';
  if (name === 'smg') return 'smg';
  return 'rifle';
}

const REVERB_BY_MAP = {
  metro: { delay: 0.32, fb: 0.3, wet: 0.26 },
  canal: { delay: 0.24, fb: 0.25, wet: 0.22 },
  dust2: { delay: 0.16, fb: 0.22, wet: 0.18 },
  arctic: { delay: 0.42, fb: 0.26, wet: 0.32 },
  blast: { delay: 0.28, fb: 0.34, wet: 0.30 }
};

function setAudioParam(param, value, t) {
  if (!param) return;
  try {
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, t);
    else param.value = value;
  } catch (e) { /* ignore */ }
}

function buildReverb(ac, mapId) {
  const p = REVERB_BY_MAP[mapId] || REVERB_BY_MAP.dust2;
  const delay = ac.createDelay(1);
  delay.delayTime.value = p.delay;
  const fb = ac.createGain();
  fb.gain.value = p.fb;
  // 反馈环串低通：高频逐次衰减，尾音更自然（消除金属感）
  const damp = ac.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2200;
  const wet = ac.createGain();
  wet.gain.value = p.wet;
  delay.connect(damp); damp.connect(fb); fb.connect(delay);
  delay.connect(wet);
  return { delay, wet, nodes: [delay, fb, damp, wet] };
}

// 共享混响 send：按 mapId 建一次复用（挂在 sfx bus 上），不再每声 boom/awp/shotgun 现建 5 节点即弃
const reverbSends = new Map();
function getReverbSend(ac, mapId, out) {
  const key = String(mapId || 'dust2');
  let send = reverbSends.get(key);
  if (send && send.ac === ac) return send;
  const rev = buildReverb(ac, key);
  const wetIn = ac.createGain();
  wetIn.gain.value = 1;
  rev.wet.connect(wetIn);
  wetIn.connect(out);
  send = { ac, delay: rev.delay, wetIn };
  reverbSends.set(key, send);
  return send;
}

// 高频音效节流表：同 name 短间隔只发一次（脚步/水花/命中常态密集，防节点风暴）
const SFX_THROTTLE_MS = { step: 80, splash: 200, hit: 30, hitArmor: 30, head: 40 };

export function sfx(name, vol, x, y, game, wid, mat) {
  resumeAudio();
  if (!isAudioReady() || muted) return;
  const thMs = SFX_THROTTLE_MS[name];
  if (thMs && !throttle(name, thMs)) return;
  const ac = getAc();
  try {
    const g = game || (gameProvider && gameProvider());
    const t = ac.currentTime;
    const out = getBus('sfx');
    // 位置衰减：距离音量 + pan（基于玩家耳朵）
    let dv = 1;
    let pan = 0;
    if (x !== undefined && g && g.player && !g.player.dead) {
      const lis = g.player;
      const dx = x - lis.x, dy = y - lis.y;
      const dist = Math.hypot(dx, dy);
    if (g.viewMode === 'fps') {
      // FPS 3D 声场：以视野朝向为基准——横向偏移→左右声像，背后声音更闷更轻（简化 HRTF）
      const cosA = Math.cos(lis.angle), sinA = Math.sin(lis.angle);
      const depth = dx * cosA + dy * sinA;
      const perp = -dx * sinA + dy * cosA;
        dv = clamp(1 - dist / 1400, 0.1, 1);
        pan = clamp(perp / 300, -1, 1);
        if (depth < 0) dv *= 0.55; // 背后：音量衰减（低通随 dv 同步收窄，见下方 lp）
      } else {
        dv = clamp(1 - dist / 1600, 0.12, 1);
        const earX = lis.x + Math.cos(lis.angle) * 16;
        pan = clamp((x - earX) / 320, -1, 1);
      }
    }
    const v = Math.min(1, (vol === undefined ? 0.5 : vol) * dv);
    let chain = out;
    const tails = [];
    let panner = null;
    const hasPos = x !== undefined && y !== undefined;
    const listener = g && g.player && !g.player.dead;
    const distToListener = listener && hasPos ? Math.hypot(x - g.player.x, y - g.player.y) : 0;
    const useSpatialPanner = hasPos && distToListener > 24;
    if (useSpatialPanner && ac.createPanner) {
      panner = ac.createPanner();
      // 远距用 equalpower（HRTF 卷积昂贵且此处 rolloffFactor=0 无距离衰减收益），近距保留 HRTF 定位感
      panner.panningModel = distToListener > 600 ? 'equalpower' : 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 4000;
      panner.rolloffFactor = 0;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.coneOuterGain = 1;
      const eyeY = g && g.viewMode === 'fps' ? 24 : 14;
      setAudioParam(panner.positionX, x, t);
      setAudioParam(panner.positionY, eyeY, t);
      setAudioParam(panner.positionZ, y, t);
      panner.connect(out);
      chain = panner;
      tails.push(panner);
    } else if (ac.createStereoPanner) {
      panner = ac.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(out);
      chain = panner;
      tails.push(panner);
    }
    // 距离-频率低通：远枪变闷
    let lp = null;
    if (g && x !== undefined) {
      lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000 * (0.3 + 0.7 * dv);
      lp.connect(chain);
      chain = lp;
      tails.push(lp);
    }
    // 空间混响：boom/awp/shotgun（共享 send，节点常驻）
    if ((name === 'boom' || name === 'awp' || name === 'shotgun') && g) {
      const send = getReverbSend(ac, g.mapId, out);
      chain.connect(send.delay);
      const dry = ac.createGain();
      dry.gain.value = 1;
      chain.connect(dry);
      tails.push(dry);
    }
    if (name === 'boom' && g) {
      // 爆炸低频余音：0.35s 后触发 90→28Hz 下坠音
      const tailT = ac.currentTime + 0.35;
      const o2 = ac.createOscillator();
      const g2 = ac.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(90, tailT);
      o2.frequency.exponentialRampToValueAtTime(28, tailT + 1.1);
      g2.gain.setValueAtTime(0.0001, tailT);
      g2.gain.exponentialRampToValueAtTime(0.5 * (vol || 1) * 0.35, tailT + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.0001, tailT + 1.1);
      o2.connect(g2);
      g2.connect(out);
      o2.start(tailT);
      o2.stop(tailT + 1.2);
      tails.push(o2, g2);
    }
    let tailGuard = null;
    if (tails.length) {
      tailGuard = {
        pending: 0,
        cleanup() {
          for (const n of tails) { try { n.disconnect(); } catch (e) { /* 宸叉柇 */ } }
        }
      };
    }
    const env = { out: chain, vol: v, lp: lp ? lp.frequency.value : 3000, mapId: g && g.mapId, wid, mat, guard: tailGuard, pack: _soundPack };
    if (name === 'shot' || name === 'awp' || name === 'pistol' || name === 'smg' || name === 'shotgun') {
      buildShot(ac, { ...env, variant: shotVariantFor(name, wid) });
    } else {
      buildSfx(ac, env);
    }
    if (tailGuard && tailGuard.pending === 0) tailGuard.cleanup();
  } catch (e) { /* 音频异常忽略 */ }
}

// UI 音效：走 UI bus、无定位
export function syncSpatialAudio(game) {
  resumeAudio();
  if (!isAudioReady()) return false;
  const ac = getAc();
  const g = game || (gameProvider && gameProvider());
  const stats = { listener: 0, panner: 0, synced: 0 };
  if (!ac || !g || !g.player || !ac.listener) return false;
  stats.listener = 1;
  stats.panner = typeof ac.createPanner === 'function' ? 1 : 0;
  const p = g.player;
  const t = ac.currentTime || 0;
  const eye = (g.viewMode === 'fps' ? 24 : 14);
  try {
    const L = ac.listener;
    if (L.positionX && L.positionY && L.positionZ) {
      setAudioParam(L.positionX, p.x || 0, t);
      setAudioParam(L.positionY, eye, t);
      setAudioParam(L.positionZ, p.y || 0, t);
      setAudioParam(L.forwardX, Math.cos(p.angle || 0), t);
      setAudioParam(L.forwardY, 0, t);
      setAudioParam(L.forwardZ, Math.sin(p.angle || 0), t);
      setAudioParam(L.upX, 0, t);
      setAudioParam(L.upY, 1, t);
      setAudioParam(L.upZ, 0, t);
    } else if (typeof L.setPosition === 'function') {
      L.setPosition(p.x || 0, eye, p.y || 0);
      L.setOrientation(Math.cos(p.angle || 0), 0, Math.sin(p.angle || 0), 0, 1, 0);
    }
    stats.synced = 1;
    if (game) game._audioSpatial = stats;
    return true;
  } catch (e) {
    return false;
  }
}

export function uiSfx(name, vol) {
  resumeAudio();
  if (!isAudioReady() || muted) return;
  const ac = getAc();
  try {
    const out = getBus('ui');
    buildUi(ac, { out, vol: vol || 0.6, name });
  } catch (e) { /* 忽略 */ }
}

export { setBusVolume, getBusVolume };

// 环境音：地图专属 loop，切换地图时自动切换
let ambient = null;
let lastAmbientMapId = null;

export function startAmbient(mapId) {
  lastAmbientMapId = mapId;
  resumeAudio();
  if (!isAudioReady() || muted) return;
  const ac = getAc();
  try {
    if (ambient) {
      if (ambient.mapId === mapId) return;
      ambient.inst.stop();
      ambient = null;
    }
    if (!mapId) return;
    const inst = buildAmbient(ac, mapId);
    inst.start(getBus('amb'));
    ambient = { mapId, inst };
  } catch (e) { /* 忽略 */ }
}

export function stopAmbient() {
  if (ambient) {
    try { ambient.inst.stop(); } catch (e) { /* 忽略 */ }
    ambient = null;
  }
}
