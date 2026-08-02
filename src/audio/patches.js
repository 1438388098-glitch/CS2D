import { getNoise, noiseSrc, wrapTail } from './core.js';
import { rand } from '../utils.js';

// 通用构建块 -----------------------------------------------------------------
// 噪声突发：bandpass 滤波白噪，指数衰减
function noiseBurst(ac, env) {
  const { out, vol, dur, freq, q, type, at } = env;
  const t = ac.currentTime + (at || 0);
  const src = noiseSrc();
  const f = ac.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q || 1;
  const g = ac.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t); src.stop(t + dur + 0.05);
  wrapTail(src, [src, f, g]);
}

// 振荡器下落：type 波形，频率 f0→f1 指数滑落
function oscDrop(ac, env) {
  const { out, vol, dur, type, f0, f1, at } = env;
  const t = ac.currentTime + (at || 0);
  const o = ac.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
  wrapTail(o, [o, g]);
}

// 双 tick（click）：两段极短噪声/正弦
function tick(ac, env) {
  const { out, vol, f1, f2, at } = env;
  const t = ac.currentTime + (at || 0);
  for (const [f, dt] of [[f1, 0], [f2, f2 ? 0.012 : 0]]) {
    if (!f) continue;
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(vol, t + dt);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.02);
    o.connect(g); g.connect(out);
    o.start(t + dt); o.stop(t + dt + 0.03);
    wrapTail(o, [o, g]);
  }
}

function seqTones(ac, env) {
  const { out, vol, notes, step } = env;
  for (let i = 0; i < notes.length; i++) {
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = notes[i];
    const g = ac.createGain();
    const t = ac.currentTime + i * step;
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, step * 2.2));
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + Math.max(0.1, step * 2.5));
    wrapTail(o, [o, g]);
  }
}

function pitch() { return 1 + (rand() - 0.5) * 0.08; } // ±4%

// 武器音色 ---------------------------------------------------------------
export function buildShot(ac, env) {
  // env: {out, vol, variant, lp}
  const v = env.vol;
  const lp = env.lp;
  const pr = pitch();
  if (env.variant === 'ak') {
    noiseBurst(ac, { out: env.out, vol: v * 0.9, dur: 0.13 / pr, freq: Math.min(lp, 2400), q: 0.8, type: 'lowpass' });
    oscDrop(ac, { out: env.out, vol: v * 0.8, dur: 0.12 / pr, type: 'square', f0: 165 * pr, f1: 55 * pr });
    oscDrop(ac, { out: env.out, vol: v * 0.3, dur: 0.05 / pr, type: 'square', f0: 2100 * pr, f1: 900 * pr });
  } else if (env.variant === 'rifle') {
    noiseBurst(ac, { out: env.out, vol: v * 0.85, dur: 0.1 / pr, freq: Math.min(lp, 2600), q: 1, type: 'lowpass' });
    oscDrop(ac, { out: env.out, vol: v * 0.7, dur: 0.09 / pr, type: 'square', f0: 185 * pr, f1: 70 * pr });
    oscDrop(ac, { out: env.out, vol: v * 0.28, dur: 0.045 / pr, type: 'square', f0: 2200 * pr, f1: 1100 * pr });
  } else if (env.variant === 'smg') {
    noiseBurst(ac, { out: env.out, vol: v * 0.8, dur: 0.055 / pr, freq: Math.min(lp, 3200), q: 1.2, type: 'lowpass' });
    oscDrop(ac, { out: env.out, vol: v * 0.55, dur: 0.05 / pr, type: 'square', f0: 240 * pr, f1: 95 * pr });
    oscDrop(ac, { out: env.out, vol: v * 0.35, dur: 0.03 / pr, type: 'square', f0: 3100 * pr, f1: 1800 * pr });
  } else if (env.variant === 'sniper') {
    noiseBurst(ac, { out: env.out, vol: v * 0.9, dur: 0.32 / pr, freq: Math.min(lp, 900), q: 0.7, type: 'lowpass' });
    oscDrop(ac, { out: env.out, vol: v, dur: 0.3 / pr, type: 'sine', f0: 92 * pr, f1: 28 * pr });
    tick(ac, { out: env.out, vol: v * 0.5, f1: 1400, f2: 900, at: 0.22 / pr });
  } else if (env.variant === 'pistol') {
    noiseBurst(ac, { out: env.out, vol: v * 0.85, dur: 0.05 / pr, freq: Math.min(lp, 3200), q: 1.4, type: 'bandpass' });
    oscDrop(ac, { out: env.out, vol: v * 0.5, dur: 0.05 / pr, type: 'sine', f0: 300 * pr, f1: 120 * pr });
  } else if (env.variant === 'shotgun') {
    for (let i = 0; i < 3; i++) {
      noiseBurst(ac, { out: env.out, vol: v * 0.7 / (1 + i * 0.5), dur: (0.18 - i * 0.04) / pr, freq: Math.min(lp, 1800 - i * 300), q: 1, type: 'lowpass', at: i * 0.02 });
    }
    oscDrop(ac, { out: env.out, vol: v * 0.5, dur: 0.2 / pr, type: 'sine', f0: 130 * pr, f1: 45 * pr });
  } else if (env.variant === 'knife') {
    noiseBurst(ac, { out: env.out, vol: v * 0.5, dur: 0.1, freq: 1400, q: 6, type: 'bandpass' });
  }
}

// 通用音效 ---------------------------------------------------------------
export function buildSfx(ac, env) {
  const { out, vol, name, lp, mapId } = env;
  switch (name) {
    case 'reload': {
      noiseBurst(ac, { out, vol: vol * 0.7, dur: 0.05, freq: 1800, q: 2, type: 'highpass' });
      tick(ac, { out, vol: vol * 0.5, f1: 1400, f2: 1000 });
      break;
    }
    case 'reloadEnd': tick(ac, { out, vol: vol * 0.6, f1: 2800, f2: 1400 }); break;
    case 'hit': oscDrop(ac, { out, vol: vol * 0.9, dur: 0.09, type: 'sine', f0: 240, f1: 70 }); break;
    case 'head': {
      oscDrop(ac, { out, vol: vol * 0.8, dur: 0.06, type: 'sine', f0: 1800, f1: 700 });
      noiseBurst(ac, { out, vol: vol * 0.45, dur: 0.03, freq: 3200, q: 2, type: 'bandpass' });
      break;
    }
    case 'penetrate': oscDrop(ac, { out, vol: vol * 0.4, dur: 0.11, type: 'square', f0: 800, f1: 150 }); break;
    case 'crateHit': noiseBurst(ac, { out, vol: vol * 0.5, dur: 0.06, freq: 900, q: 2, type: 'bandpass' }); break;
    case 'crateBreak': {
      noiseBurst(ac, { out, vol: vol * 0.7, dur: 0.14, freq: 500, q: 1.5, type: 'lowpass' });
      tick(ac, { out, vol: vol * 0.4, f1: 700, f2: 500 });
      break;
    }
    case 'step': {
      const mats = [
        { f: rand(500, 800), q: 3, v: 1 },
        { f: rand(1500, 2200), q: 4, v: 0.8 },
        { f: 900, q: 3, v: 1 }
      ];
      const m = mats[env.mat === 'metal' ? 1 : (env.mat === 'thin' ? 2 : 0)];
      noiseBurst(ac, { out, vol: vol * 0.16 * m.v, dur: 0.05, freq: m.f, q: m.q, type: 'bandpass' });
      break;
    }
    case 'splash': noiseBurst(ac, { out, vol: vol * 0.5, dur: 0.2, freq: rand(1200, 1800), q: 2, type: 'bandpass' }); break;
    case 'boom': {
      oscDrop(ac, { out, vol: Math.min(1, vol * 1.4), dur: 0.9, type: 'sine', f0: 120, f1: 22 });
      noiseBurst(ac, { out, vol: vol * 0.9, dur: 0.75, freq: Math.min(lp, 500), q: 0.6, type: 'lowpass' });
      break;
    }
    case 'beep': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.05, type: 'sine', f0: 1100, f1: 1100 }); break;
    case 'beepFast': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.04, type: 'sine', f0: 1600, f1: 1600 }); break;
    case 'beepWarn': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.06, type: 'sine', f0: 240, f1: 240 }); break;
    case 'empty': {
      tick(ac, { out, vol: vol * 0.6, f1: 1100, f2: 900 });
      break;
    }
    case 'whistle': {
      const notes = [1318, 1046, 1568];
      for (let k = 0; k < 3; k++) {
        oscDrop(ac, { out, vol: vol * 0.5, dur: 0.22, type: 'sine', f0: notes[k], f1: notes[k], at: k * 0.25 });
      }
      break;
    }
    case 'win': {
      seqTones(ac, { out, vol: vol * 0.7, notes: [523, 659, 784, 1046], step: 0.14 });
      for (const f of [523, 659, 784]) oscDrop(ac, { out, vol: vol * 0.4, dur: 0.8, type: 'triangle', f0: f, f1: f, at: 0.56 });
      break;
    }
    case 'lose': {
      seqTones(ac, { out, vol: vol * 0.6, notes: [392, 330, 262], step: 0.18 });
      oscDrop(ac, { out, vol: vol * 0.4, dur: 0.9, type: 'sine', f0: 130, f1: 60, at: 0.55 });
      break;
    }
    case 'buy': seqTones(ac, { out, vol: vol * 0.6, notes: [660, 880, 1100], step: 0.06 }); break;
    case 'flash': oscDrop(ac, { out, vol: vol * 0.7, dur: 0.25, type: 'square', f0: 2800, f1: 2200 }); break;
    case 'smoke': noiseBurst(ac, { out, vol: vol * 0.4, dur: 0.4, freq: 600, q: 0.8, type: 'lowpass' }); break;
    case 'kill': {
      oscDrop(ac, { out, vol: Math.min(1, vol * 1.1), dur: 0.13, type: 'sine', f0: 150, f1: 38 });
      oscDrop(ac, { out, vol: vol * 0.28, dur: 0.1, type: 'square', f0: 2100, f1: 1800, at: 0.015 });
      break;
    }
    case 'doublekill': {
      for (const [f, at] of [[880, 0], [660, 0.1]]) oscDrop(ac, { out, vol: vol * 0.6, dur: 0.1, type: 'triangle', f0: f, f1: f, at });
      break;
    }
    case 'streak': {
      const notes = [660, 880, 1320];
      for (let i = 0; i < 3; i++) oscDrop(ac, { out, vol: vol * 0.55, dur: 0.1, type: 'triangle', f0: notes[i], f1: notes[i], at: i * 0.1 });
      break;
    }
    case 'heart': {
      oscDrop(ac, { out, vol: vol, dur: 0.09, type: 'sine', f0: 66, f1: 40 });
      oscDrop(ac, { out, vol: vol * 0.7, dur: 0.07, type: 'sine', f0: 66, f1: 40, at: 0.09 });
      break;
    }
    case 'plantTic': oscDrop(ac, { out, vol: vol, dur: 0.05, type: 'sine', f0: 240, f1: 240 }); break;
    case 'bombPlanted': seqTones(ac, { out, vol: vol * 0.7, notes: [660, 880, 1320, 1760], step: 0.09 }); break;
    case 'bombDefused': seqTones(ac, { out, vol: vol * 0.7, notes: [1320, 880, 660], step: 0.09 }); break;
    default: break;
  }
}

// UI 音效（UI bus，无定位） ------------------------------------------------
export function buildUi(ac, env) {
  const { out, vol, name } = env;
  switch (name) {
    case 'hover': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.04, type: 'sine', f0: 2200, f1: 2000 }); break;
    case 'click': tick(ac, { out, vol: vol * 0.9, f1: 1500, f2: 900 }); break;
    case 'confirm': seqTones(ac, { out, vol: vol * 0.7, notes: [660, 880, 1100], step: 0.07 }); break;
    case 'error': {
      oscDrop(ac, { out, vol: vol * 0.7, dur: 0.08, type: 'square', f0: 200, f1: 200 });
      oscDrop(ac, { out, vol: vol * 0.6, dur: 0.1, type: 'square', f0: 180, f1: 170, at: 0.08 });
      break;
    }
    case 'panel': noiseBurst(ac, { out, vol: vol * 0.4, dur: 0.08, freq: 500, q: 4, type: 'bandpass' }); break;
    default: break;
  }
}

// 环境音 loop（AMB bus）：噪声循环 + 慢 LFO 增益调制
export function buildAmbient(ac, mapId) {
  const nodes = [];
  const src = noiseSrc();
  const lp = ac.createBiquadFilter();
  const volG = ac.createGain();
  const lfo = ac.createOscillator();
  const lfoG = ac.createGain();
  let extra = null;
  if (mapId === 'canal') {
    lp.type = 'bandpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.6;
    volG.gain.value = 0.16;
    lfo.frequency.value = 0.15;
    lfoG.gain.value = 0.08;
  } else if (mapId === 'metro') {
    lp.type = 'lowpass';
    lp.frequency.value = 120;
    lp.Q.value = 0.5;
    volG.gain.value = 0.22;
    lfo.frequency.value = 0.2;
    lfoG.gain.value = 0.1;
    // 地铁低频轰鸣
    extra = ac.createOscillator();
    extra.type = 'sine';
    extra.frequency.value = 45;
    const eg = ac.createGain();
    eg.gain.value = 0.05;
    extra.connect(eg);
    eg.connect(volG);
    nodes.push(extra, eg);
  } else { // dust2 风
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 0.5;
    volG.gain.value = 0.14;
    lfo.frequency.value = 0.08;
    lfoG.gain.value = 0.07;
  }
  lfo.connect(lfoG);
  lfoG.connect(volG.gain);
  src.connect(lp);
  lp.connect(volG);
  nodes.push(src, lp, volG, lfo, lfoG);
  return {
    nodes,
    start(out) {
      volG.connect(out);
      src.start();
      lfo.start();
      if (extra) extra.start();
    },
    stop() {
      try {
        volG.disconnect();
        src.stop();
        lfo.stop();
        if (extra) extra.stop();
        for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已断 */ } }
      } catch (e) { /* 忽略 */ }
    }
  };
}
