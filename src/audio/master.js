import { ctx as gameCtx } from '../ctx.js';
import { clamp, rand } from '../utils.js';
import {
  initAudioCore, getAc, isAudioReady, getNoise, getBus, setBusVolume, getBusVolume,
  setMasterGain, throttle, wrapTail, VOL_DEFAULTS
} from './core.js';
import { buildShot, buildSfx, buildUi, buildAmbient } from './patches.js';

let muted = false;
let gameProvider = null;

// 事件总线订阅（逻辑层 emit('sfx')，音频订阅播放）
gameCtx.bus.on('sfx', (p) => sfx(p.name, p.vol, p.x, p.y, p.game, p.wid, p.mat));

export function initAudio() {
  if (isAudioReady()) return;
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    initAudioCore(() => new AC());
    setMasterGain(muted ? 0 : 1);
    // 音量偏好（设置页滑杆）
    try {
      const raw = localStorage.getItem('cs2d_audio');
      if (raw) {
        const p = JSON.parse(raw);
        for (const b of Object.keys(VOL_DEFAULTS)) {
          const v = Number(p[b]);
          if (isFinite(v)) setBusVolume(b, clamp(v, 0, 1));
        }
      }
    } catch (e) { /* 无存储 */ }
  } catch (e) { /* 无音频环境 */ }
}

export function setMuted(v) {
  muted = v;
  setMasterGain(v ? 0 : 1);
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

const REVERB_BY_MAP = {
  metro: { delay: 0.32, fb: 0.3, wet: 0.26 },
  canal: { delay: 0.24, fb: 0.25, wet: 0.22 },
  dust2: { delay: 0.16, fb: 0.22, wet: 0.18 }
};

function buildReverb(ac, mapId) {
  const p = REVERB_BY_MAP[mapId] || REVERB_BY_MAP.dust2;
  const delay = ac.createDelay(1);
  delay.delayTime.value = p.delay;
  const fb = ac.createGain();
  fb.gain.value = p.fb;
  const wet = ac.createGain();
  wet.gain.value = p.wet;
  delay.connect(fb); fb.connect(delay);
  delay.connect(wet);
  return { delay, wet, nodes: [delay, fb, wet] };
}

export function sfx(name, vol, x, y, game, wid, mat) {
  if (!isAudioReady() || muted) return;
  const ac = getAc();
  try {
    const g = game || (gameProvider && gameProvider());
    const t = ac.currentTime;
    const out = getBus('sfx');
    // 位置衰减：距离音量 + pan（基于玩家耳朵）
    let dv = 1;
    let pan = 0;
    if (x !== undefined && g && g.player && !g.player.dead) {
      dv = clamp(1 - Math.hypot(x - g.player.x, y - g.player.y) / 1600, 0.12, 1);
      const earX = g.player.x + Math.cos(g.player.angle) * 16;
      pan = clamp((x - earX) / 320, -1, 1);
    }
    const v = Math.min(1, (vol || 0.5) * dv);
    let chain = out;
    const tails = [];
    let panner = null;
    if (ac.createStereoPanner) {
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
    // 空间混响：boom/awp/shotgun
    let rev = null;
    if ((name === 'boom' || name === 'awp' || name === 'shotgun') && g) {
      rev = buildReverb(ac, g.mapId);
      chain.connect(rev.delay);
      const dry = ac.createGain();
      dry.gain.value = 1;
      chain.connect(dry);
      const wetIn = ac.createGain();
      wetIn.gain.value = 1;
      rev.wet.connect(wetIn);
      wetIn.connect(out);
      tails.push(...rev.nodes, dry, wetIn);
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
    const env = { out: chain, vol: v, lp: lp ? lp.frequency.value : 3000, mapId: g && g.mapId, wid, mat, guard: tailGuard };
    if (name === 'shot' || name === 'awp' || name === 'pistol' || name === 'shotgun') {
      const variant = GUN_BY_WID[wid] || (name === 'awp' ? 'sniper' : name === 'shotgun' ? 'shotgun' : name === 'pistol' ? 'pistol' : 'rifle');
      buildShot(ac, { ...env, variant });
    } else {
      buildSfx(ac, env);
    }
    if (tailGuard && tailGuard.pending === 0) tailGuard.cleanup();
  } catch (e) { /* 音频异常忽略 */ }
}

// UI 音效：走 UI bus、无定位
export function uiSfx(name, vol) {
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

export function startAmbient(mapId) {
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
