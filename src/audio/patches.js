import {noiseSrc, wrapTail} from './core.js';
import {rand} from '../utils.js';

// 通用构建块 -----------------------------------------------------------------
// 噪声突发：bandpass 滤波白噪，指数衰减
function noiseBurst(ac, env) {
  const { out, vol, dur, freq, q, type, at } = env;
  const src = noiseSrc();
  const f = ac.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q || 1;
  const g = ac.createGain();
  g.gain.value = vol;
  const t = ac.currentTime + (at ? 0.04 : 0) + (at || 0);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(out);
  if (at) src.start(t); else src.start();
  src.stop(t + dur + 0.05);
  wrapTail(src, [src, f, g], null, env.guard);
}

// 振荡器下落：type 波形，频率 f0→f1 指数滑落
function oscDrop(ac, env) {
  const { out, vol, dur, type, f0, f1, at } = env;
  const o = ac.createOscillator();
  o.type = type || 'sine';
  const t = ac.currentTime + (at ? 0.04 : 0) + (at || 0);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ac.createGain();
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  if (at) o.start(t); else o.start();
  o.stop(t + dur + 0.05);
  wrapTail(o, [o, g], null, env.guard);
}

// 双 tick（click）：两段极短噪声/正弦
function tick(ac, env) {
  const { out, vol, f1, f2, at } = env;
  const t = ac.currentTime + (at ? 0.04 : 0) + (at || 0);
  for (const [f, dt] of [[f1, 0], [f2, f2 ? 0.012 : 0]]) {
    if (!f) continue;
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.02);
    o.connect(g); g.connect(out);
    if (dt) o.start(t + dt); else o.start();
    o.stop(t + dt + 0.03);
    wrapTail(o, [o, g], null, env.guard);
  }
}

function seqTones(ac, env) {
  const { out, vol, notes, step } = env;
  const base = ac.currentTime;
  for (let i = 0; i < notes.length; i++) {
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = notes[i];
    const g = ac.createGain();
    const t = base + i * step;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, step * 2.2));
    o.connect(g); g.connect(out);
    if (i > 0) o.start(t); else o.start();
    o.stop(t + Math.max(0.1, step * 2.5));
    wrapTail(o, [o, g], null, env.guard);
  }
}

function pitch() { return 1 + (rand() - 0.5) * 0.08; } // ±4%

// 武器音色 ---------------------------------------------------------------
const SHOT_PROFILE = {
  ak: { dur: 0.36, f0: 165, f1: 55, high: 2100, noise: 0.9, body: 0.8, crack: 0.62, snap: 0.3, mech: 0.14, mechAt: 0.012, tail: 0.22 },
  rifle: { dur: 0.34, f0: 185, f1: 70, high: 2200, noise: 0.85, body: 0.7, crack: 0.55, snap: 0.28, mech: 0.15, mechAt: 0.011, tail: 0.2 },
  smg: { dur: 0.3, f0: 240, f1: 95, high: 3100, noise: 0.82, body: 0.55, crack: 0.68, snap: 0.36, mech: 0.18, mechAt: 0.009, tail: 0.15 },
  sniper: { dur: 0.5, f0: 92, f1: 28, high: 1400, noise: 0.9, body: 1, crack: 0.72, snap: 0.35, mech: 0.08, mechAt: 0.024, tail: 0.3 },
  pistol: { dur: 0.32, f0: 300, f1: 120, high: 3200, noise: 0.82, body: 0.5, crack: 0.58, snap: 0.3, mech: 0.18, mechAt: 0.009, tail: 0.14 },
  shotgun: { dur: 0.46, f0: 130, f1: 45, high: 1600, noise: 0.88, body: 0.62, crack: 0.76, snap: 0.42, mech: 0.24, mechAt: 0.018, tail: 0.24 },
  knife: { dur: 0.28, f0: 1400, f1: 900, high: 2800, noise: 0.7, body: 0.3, crack: 0.48, snap: 0.2, mech: 0.26, mechAt: 0.005, tail: 0.08 }
};

export function makeShotBuffer(ac, variant) {
  const p = SHOT_PROFILE[variant] || SHOT_PROFILE.rifle;
  const sr = ac.sampleRate || 44100;
  const len = Math.ceil(sr * p.dur);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const bodyRate = variant === 'sniper' ? 4 : 5.8;
  const tailRate = variant === 'sniper' ? 4 : 8;
  const crackRate = variant === 'sniper' ? 48 : 70;
  const snapRate = variant === 'sniper' ? 110 : 150;
  const mechAt = p.mechAt || 0.012;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const noise = Math.random() * 2 - 1;
    lp += 0.18 * (noise - lp);
    const hp = noise - lp;
    const freq = p.f0 + (p.f1 - p.f0) * Math.min(1, t * 2.6);
    const attack = Math.min(1, t * 1400);
    const crack = hp * Math.exp(-t * crackRate) * p.noise * p.crack;
    const snap = noise * Math.exp(-t * snapRate) * p.snap;
    const body = Math.sin(Math.PI * 2 * freq * t) * Math.exp(-t * bodyRate) * p.body;
    const bodyLow = Math.sin(Math.PI * 2 * freq * 0.5 * t) * Math.exp(-t * bodyRate * 0.72) * p.body * 0.34;
    const bodyHarmonic = Math.sin(Math.PI * 2 * freq * 1.9 * t) * Math.exp(-t * bodyRate * 1.7) * p.body * 0.18;
    const ring = Math.sin(Math.PI * 2 * (p.high + (p.f1 - p.high) * Math.min(1, t * 8)) * t) * Math.exp(-t * 26) * (variant === 'sniper' ? 0.06 : 0.12);
    const tm = Math.max(0, t - mechAt);
    const mech = (Math.random() * 2 - 1) * Math.exp(-tm * (variant === 'shotgun' ? 60 : 105)) * p.mech;
    const tail = Math.sin(Math.PI * 2 * Math.max(26, p.f1) * t) * Math.exp(-t * tailRate) * p.body * p.tail;
    const tailNoise = lp * Math.exp(-t * tailRate * 0.8) * p.noise * 0.28;
    d[i] = Math.tanh((crack + snap + body + bodyLow + bodyHarmonic + ring + mech + tail + tailNoise) * attack * 0.78);
  }
  return buf;
}

export function buildShot(ac, env) {
  // env: {out, vol, variant, lp}
  const buf = makeShotBuffer(ac, env.variant || 'rifle');
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch();
  const g = ac.createGain();
  g.gain.value = Math.min(1.5, Math.max(0.12, env.vol * 1.6));
  src.connect(g);
  g.connect(env.out);
  src.start();
  src.stop(ac.currentTime + buf.duration / src.playbackRate.value + 0.08);
  wrapTail(src, [src, g], null, env.guard);
}

// 通用音效 ---------------------------------------------------------------
export function buildSfx(ac, env) {
  const { out, vol, name, lp, mapId } = env;
  const guard = env.guard;
  switch (name) {
    case 'reload': {
      noiseBurst(ac, { out, vol: vol * 0.7, dur: 0.05, freq: 1800, q: 2, type: 'highpass', guard });
      tick(ac, { out, vol: vol * 0.5, f1: 1400, f2: 1000, guard });
      break;
    }
    case 'reloadEnd': tick(ac, { out, vol: vol * 0.6, f1: 2800, f2: 1400, guard }); break;
    case 'hit': oscDrop(ac, { out, vol: vol * 0.9, dur: 0.09, type: 'sine', f0: 240, f1: 70, guard }); break;
    case 'head': {
      oscDrop(ac, { out, vol: vol * 0.8, dur: 0.06, type: 'sine', f0: 1800, f1: 700, guard });
      noiseBurst(ac, { out, vol: vol * 0.45, dur: 0.03, freq: 3200, q: 2, type: 'bandpass', guard });
      break;
    }
    case 'penetrate': oscDrop(ac, { out, vol: vol * 0.4, dur: 0.11, type: 'square', f0: 800, f1: 150, guard }); break;
    case 'crateHit': noiseBurst(ac, { out, vol: vol * 0.5, dur: 0.06, freq: 900, q: 2, type: 'bandpass', guard }); break;
    case 'crateBreak': {
      noiseBurst(ac, { out, vol: vol * 0.7, dur: 0.14, freq: 500, q: 1.5, type: 'lowpass', guard });
      tick(ac, { out, vol: vol * 0.4, f1: 700, f2: 500, guard });
      break;
    }
    case 'step': {
      const mats = [
        { f: rand(500, 800), q: 3, v: 1 },
        { f: rand(1500, 2200), q: 4, v: 0.8 },
        { f: 900, q: 3, v: 1 }
      ];
      const m = mats[env.mat === 'metal' ? 1 : (env.mat === 'thin' ? 2 : 0)];
      noiseBurst(ac, { out, vol: vol * 0.16 * m.v, dur: 0.05, freq: m.f, q: m.q, type: 'bandpass', guard });
      break;
    }
    case 'splash': noiseBurst(ac, { out, vol: vol * 0.5, dur: 0.2, freq: rand(1200, 1800), q: 2, type: 'bandpass', guard }); break;
    case 'boom': {
      oscDrop(ac, { out, vol: Math.min(1, vol * 1.4), dur: 0.9, type: 'sine', f0: 120, f1: 22, guard });
      noiseBurst(ac, { out, vol: vol * 0.9, dur: 0.75, freq: Math.min(lp, 500), q: 0.6, type: 'lowpass', guard });
      break;
    }
    case 'beep': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.05, type: 'sine', f0: 1100, f1: 1100, guard }); break;
    case 'beepFast': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.04, type: 'sine', f0: 1600, f1: 1600, guard }); break;
    case 'beepWarn': oscDrop(ac, { out, vol: vol * 0.5, dur: 0.06, type: 'sine', f0: 240, f1: 240, guard }); break;
    case 'empty': {
      tick(ac, { out, vol: vol * 0.6, f1: 1100, f2: 900, guard });
      break;
    }
    case 'whistle': {
      const notes = [1318, 1046, 1568];
      for (let k = 0; k < 3; k++) {
        oscDrop(ac, { out, vol: vol * 0.5, dur: 0.22, type: 'sine', f0: notes[k], f1: notes[k], at: k * 0.25, guard });
      }
      break;
    }
    case 'win': {
      seqTones(ac, { out, vol: vol * 0.7, notes: [523, 659, 784, 1046], step: 0.14, guard });
      for (const f of [523, 659, 784]) oscDrop(ac, { out, vol: vol * 0.4, dur: 0.8, type: 'triangle', f0: f, f1: f, at: 0.56, guard });
      break;
    }
    case 'lose': {
      seqTones(ac, { out, vol: vol * 0.6, notes: [392, 330, 262], step: 0.18, guard });
      oscDrop(ac, { out, vol: vol * 0.4, dur: 0.9, type: 'sine', f0: 130, f1: 60, at: 0.55, guard });
      break;
    }
    case 'buy': seqTones(ac, { out, vol: vol * 0.6, notes: [660, 880, 1100], step: 0.06, guard }); break;
    case 'flash': oscDrop(ac, { out, vol: vol * 0.7, dur: 0.25, type: 'square', f0: 2800, f1: 2200, guard }); break;
    case 'smoke': noiseBurst(ac, { out, vol: vol * 0.4, dur: 0.4, freq: 600, q: 0.8, type: 'lowpass', guard }); break;
    case 'kill': {
      oscDrop(ac, { out, vol: Math.min(1, vol * 1.1), dur: 0.13, type: 'sine', f0: 150, f1: 38, guard });
      oscDrop(ac, { out, vol: vol * 0.28, dur: 0.1, type: 'square', f0: 2100, f1: 1800, at: 0.015, guard });
      break;
    }
    case 'doublekill': {
      for (const [f, at] of [[880, 0], [660, 0.1]]) oscDrop(ac, { out, vol: vol * 0.6, dur: 0.1, type: 'triangle', f0: f, f1: f, at, guard });
      break;
    }
    case 'streak': {
      const notes = [660, 880, 1320];
      for (let i = 0; i < 3; i++) oscDrop(ac, { out, vol: vol * 0.55, dur: 0.1, type: 'triangle', f0: notes[i], f1: notes[i], at: i * 0.1, guard });
      break;
    }
    case 'heart': {
      oscDrop(ac, { out, vol: vol, dur: 0.09, type: 'sine', f0: 66, f1: 40, guard });
      oscDrop(ac, { out, vol: vol * 0.7, dur: 0.07, type: 'sine', f0: 66, f1: 40, at: 0.09, guard });
      break;
    }
    case 'plantTic': oscDrop(ac, { out, vol: vol, dur: 0.05, type: 'sine', f0: 240, f1: 240, guard }); break;
    case 'bombPlanted': seqTones(ac, { out, vol: vol * 0.7, notes: [660, 880, 1320, 1760], step: 0.09, guard }); break;
    case 'bombDefused': seqTones(ac, { out, vol: vol * 0.7, notes: [1320, 880, 660], step: 0.09, guard }); break;
    case 'knife': {
      noiseBurst(ac, { out, vol: vol * 0.5, dur: 0.07, freq: 2200, q: 3, type: 'bandpass', guard });
      tick(ac, { out, vol: vol * 0.35, f1: 900, f2: 400, guard });
      break;
    }
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
  } else if (mapId === 'arctic') {
    // 开阔冰原：高频风噪 + 7s 周期 LFO 呼吸
    lp.type = 'bandpass';
    lp.frequency.value = 2200;
    lp.Q.value = 0.9;
    volG.gain.value = 0.07;
    lfo.frequency.value = 1 / 7;
    lfoG.gain.value = 0.035;
  } else if (mapId === 'blast') {
    // 金属仓库：低频工业嗡鸣 + 稀疏金属敲击
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 0.5;
    volG.gain.value = 0.12;
    lfo.frequency.value = 0.1;
    lfoG.gain.value = 0.05;
    extra = ac.createOscillator();
    extra.type = 'sine';
    extra.frequency.value = 55;
    const eg = ac.createGain();
    eg.gain.value = 0.08;
    extra.connect(eg);
    eg.connect(volG);
    const h = ac.createOscillator();
    h.type = 'sine';
    h.frequency.value = 110;
    const hg = ac.createGain();
    hg.gain.value = 0.02;
    h.connect(hg);
    hg.connect(volG);
    nodes.push(extra, eg, h, hg);
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
  let bus = null;
  let timer = null;
  // 冰裂（arctic）：简化实现——8s 低频噪声包络 + 两个固定间隔咔嗒
  function iceCrack() {
    const now = ac.currentTime;
    noiseBurst(ac, { out: bus, vol: 0.1, dur: 8, freq: 420, q: 0.8, type: 'lowpass', at: now });
    tick(ac, { out: bus, vol: 0.07, f1: 2600, f2: 1900, at: now + 2.5 });
    tick(ac, { out: bus, vol: 0.07, f1: 2200, f2: 1500, at: now + 4.5 });
  }
  // 金属敲击（blast）：噪声 burst 变体，bandpass 400→120Hz 短衰
  function metalKnock() {
    const now = ac.currentTime;
    const src = noiseSrc();
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, now);
    f.frequency.exponentialRampToValueAtTime(120, now + 0.12);
    f.Q.value = 2;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(now); src.stop(now + 0.25);
    wrapTail(src, [src, f, g]);
  }
  function schedule() {
    if (!bus) return;
    timer = setTimeout(() => {
      if (mapId === 'arctic') iceCrack();
      else metalKnock();
      schedule();
    }, mapId === 'arctic' ? rand(11000, 17000) : rand(9000, 13000));
  }
  return {
    nodes,
    start(out) {
      bus = out;
      volG.connect(out);
      src.start();
      lfo.start();
      if (extra) extra.start();
      if (mapId === 'arctic' || mapId === 'blast') schedule();
    },
    stop() {
      try {
        if (timer) { clearTimeout(timer); timer = null; }
        bus = null;
        volG.disconnect();
        src.stop();
        lfo.stop();
        if (extra) extra.stop();
        for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已断 */ } }
      } catch (e) { /* 忽略 */ }
    }
  };
}
