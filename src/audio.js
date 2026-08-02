import { ctx as gameCtx } from './ctx.js';
import { clamp, rand } from './utils.js';

let ctx = null;
let master = null;
let buffer = null;
let muted = false;
let gameProvider = null;

// 事件总线订阅（② 依赖方向反转：逻辑层 emit('sfx')，音频订阅播放）
gameCtx.bus.on('sfx', (p) => sfx(p.name, p.vol, p.x, p.y, p.game));

export function initAudio() {
  if (ctx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { /* 无音频环境 */ }
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}

export function isMuted() { return muted; }

export function setAudioContext(gameProviderFn) {
  gameProvider = gameProviderFn;
}

export function bindToGame(g) {
  gameProvider = () => g;
}

export function sfx(name, vol, x, y, game) {
  if (!ctx || muted) return;
  try {
    const c = ctx;
    const __tails = [];
    const t = c.currentTime;
    const g = game || (gameProvider && gameProvider());
    let pan = 0;
    let dv = 1;
    if (x !== undefined && g && g.player && !g.player.dead) {
      dv = clamp(1 - Math.hypot(x - g.player.x, y - g.player.y) / 1600, 0.12, 1);
      pan = clamp((x - g.camX) / (g.canvasW / 2), -1, 1);
    }
    const v = Math.min(1, (vol || 0.5) * dv);
    let p = null;
    if (c.createStereoPanner) {
      p = c.createStereoPanner();
      p.pan.value = pan;
      p.connect(master);
    }
    const out = p || master;
    switch (name) {
      case 'shot': {
        const src = c.createBufferSource(); src.buffer = buffer;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 1;
        const g = c.createGain(); g.gain.value = 0;
        g.gain.setValueAtTime(v, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        src.connect(f); f.connect(g); g.connect(out); __tails.push(g); src.start(t); src.stop(t + 0.12);
        const o = c.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(rand(160, 210), t); o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
        const g2 = c.createGain(); g2.gain.value = v * 0.35; g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        o.connect(g2); g2.connect(out); __tails.push(g2); o.start(t); o.stop(t + 0.08);
        break;
      }
      case 'awp': {
        const s2 = c.createBufferSource(); s2.buffer = buffer;
        const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
        const g3 = c.createGain(); g3.gain.value = 0; g3.gain.setValueAtTime(v, t); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        s2.connect(f2); f2.connect(g3); g3.connect(out); __tails.push(g3); s2.start(t); s2.stop(t + 0.4);
        const o2 = c.createOscillator(); o2.type = 'sine';
        o2.frequency.setValueAtTime(90, t); o2.frequency.exponentialRampToValueAtTime(28, t + 0.3);
        const g4 = c.createGain(); g4.gain.value = v; g4.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o2.connect(g4); g4.connect(out); __tails.push(g4); o2.start(t); o2.stop(t + 0.32);
        break;
      }
      case 'pistol': {
        const s3 = c.createBufferSource(); s3.buffer = buffer;
        const f3 = c.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 3200; f3.Q.value = 1.4;
        const g5 = c.createGain(); g5.gain.value = 0; g5.gain.setValueAtTime(v, t); g5.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s3.connect(f3); f3.connect(g5); g5.connect(out); __tails.push(g5); s3.start(t); s3.stop(t + 0.07);
        break;
      }
      case 'shotgun': {
        const s4 = c.createBufferSource(); s4.buffer = buffer;
        const f4 = c.createBiquadFilter(); f4.type = 'lowpass'; f4.frequency.value = 1800;
        const g6 = c.createGain(); g6.gain.value = 0; g6.gain.setValueAtTime(Math.min(1, v * 1.3), t); g6.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        s4.connect(f4); f4.connect(g6); g6.connect(out); __tails.push(g6); s4.start(t); s4.stop(t + 0.25);
        break;
      }
      case 'reload': {
        const src2 = c.createBufferSource(); src2.buffer = buffer;
        const f5 = c.createBiquadFilter(); f5.type = 'highpass'; f5.frequency.value = 1800;
        const g7 = c.createGain(); g7.gain.value = v * 0.8;
        g7.gain.setValueAtTime(0.001, t); g7.gain.setValueAtTime(v * 0.8, t + 0.02); g7.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src2.connect(f5); f5.connect(g7); g7.connect(out); __tails.push(g7); src2.start(t); src2.stop(t + 0.06);
        break;
      }
      case 'hit': {
        const o3 = c.createOscillator(); o3.type = 'sine';
        o3.frequency.setValueAtTime(240, t); o3.frequency.exponentialRampToValueAtTime(70, t + 0.08);
        const g8 = c.createGain(); g8.gain.value = v * 0.9; g8.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        o3.connect(g8); g8.connect(out); __tails.push(g8); o3.start(t); o3.stop(t + 0.1);
        break;
      }
      case 'head': {
        const o4 = c.createOscillator(); o4.type = 'square'; o4.frequency.value = 1200;
        const g9 = c.createGain(); g9.gain.value = v * 0.5; g9.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o4.connect(g9); g9.connect(out); __tails.push(g9); o4.start(t); o4.stop(t + 0.06);
        break;
      }
      case 'step': {
        const s5 = c.createBufferSource(); s5.buffer = buffer;
        const f6 = c.createBiquadFilter(); f6.type = 'bandpass'; f6.frequency.value = rand(500, 800); f6.Q.value = 3;
        const g10 = c.createGain(); g10.gain.value = v * 0.16; g10.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s5.connect(f6); f6.connect(g10); g10.connect(out); __tails.push(g10); s5.start(t); s5.stop(t + 0.06);
        break;
      }
      case 'boom': {
        const o5 = c.createOscillator(); o5.type = 'sine';
        o5.frequency.setValueAtTime(120, t); o5.frequency.exponentialRampToValueAtTime(22, t + 0.9);
        const g11 = c.createGain(); g11.gain.value = Math.min(1, v * 1.4); g11.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        o5.connect(g11); g11.connect(out); __tails.push(g11); o5.start(t); o5.stop(t + 1.05);
        const s6 = c.createBufferSource(); s6.buffer = buffer;
        const f7 = c.createBiquadFilter(); f7.type = 'lowpass'; f7.frequency.value = 500;
        const g12 = c.createGain(); g12.gain.value = v * 0.9; g12.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        s6.connect(f7); f7.connect(g12); g12.connect(out); __tails.push(g12); s6.start(t); s6.stop(t + 0.9);
        break;
      }
      case 'beep': {
        const o6 = c.createOscillator(); o6.type = 'sine'; o6.frequency.value = 1100;
        const g13 = c.createGain(); g13.gain.value = v * 0.5;
        g13.gain.setValueAtTime(0.001, t); g13.gain.setValueAtTime(v * 0.5, t + 0.01); g13.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o6.connect(g13); g13.connect(out); __tails.push(g13); o6.start(t); o6.stop(t + 0.06);
        break;
      }
      case 'whistle': {
        for (let k = 0; k < 2; k++) {
          const o7 = c.createOscillator(); o7.type = 'sine'; o7.frequency.value = k === 0 ? 1318 : 1046;
          const g14 = c.createGain();
          g14.gain.value = v * 0.5;
          g14.gain.setValueAtTime(0.001, t + k * 0.25);
          g14.gain.setValueAtTime(v * 0.5, t + k * 0.25 + 0.02);
          g14.gain.exponentialRampToValueAtTime(0.001, t + k * 0.25 + 0.22);
          o7.connect(g14); g14.connect(out); __tails.push(g14); o7.start(t + k * 0.25); o7.stop(t + k * 0.25 + 0.25);
        }
        break;
      }
      case 'win': seq([523, 659, 784, 1046], 0.14, v, out); break;
      case 'lose': seq([392, 330, 262], 0.18, v * 0.8, out); break;
      case 'buy': seq([660, 880, 1100], 0.06, v * 0.6, out); break;
      case 'flash': {
        const o8 = c.createOscillator(); o8.type = 'square'; o8.frequency.value = 2800;
        const g15 = c.createGain(); g15.gain.value = v * 0.7; g15.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o8.connect(g15); g15.connect(out); __tails.push(g15); o8.start(t); o8.stop(t + 0.3);
        break;
      }
      case 'smoke': {
        const s7 = c.createBufferSource(); s7.buffer = buffer;
        const f8 = c.createBiquadFilter(); f8.type = 'lowpass'; f8.frequency.value = 600;
        const g16 = c.createGain(); g16.gain.value = v * 0.4; g16.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        s7.connect(f8); f8.connect(g16); g16.connect(out); __tails.push(g16); s7.start(t); s7.stop(t + 0.45);
        break;
      }
      case 'knife': {
        const s8 = c.createBufferSource(); s8.buffer = buffer;
        const f9 = c.createBiquadFilter(); f9.type = 'bandpass'; f9.frequency.value = 1400; f9.Q.value = 6;
        const g17 = c.createGain(); g17.gain.value = v * 0.8; g17.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        s8.connect(f9); f9.connect(g17); g17.connect(out); __tails.push(g17); s8.start(t); s8.stop(t + 0.15);
        break;
      }
      case 'kill': {
        const ok = c.createOscillator(); ok.type = 'sine';
        ok.frequency.setValueAtTime(150, t); ok.frequency.exponentialRampToValueAtTime(38, t + 0.12);
        const gk = c.createGain(); gk.gain.value = Math.min(1, v * 1.1); gk.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        ok.connect(gk); gk.connect(out); __tails.push(gk); ok.start(t); ok.stop(t + 0.15);
        const ot = c.createOscillator(); ot.type = 'square'; ot.frequency.value = 2100;
        const gt = c.createGain(); gt.gain.value = v * 0.28;
        gt.gain.setValueAtTime(0.001, t + 0.015); gt.gain.setValueAtTime(v * 0.28, t + 0.03); gt.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        ot.connect(gt); gt.connect(out); __tails.push(gt); ot.start(t + 0.015); ot.stop(t + 0.11);
        break;
      }
      case 'doublekill': {
        const d1 = c.createOscillator(); d1.type = 'triangle'; d1.frequency.value = 880;
        const gd1 = c.createGain(); gd1.gain.value = 0;
        gd1.gain.setValueAtTime(v * 0.6, t); gd1.gain.setValueAtTime(v * 0.6, t + 0.02); gd1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        d1.connect(gd1); gd1.connect(out); __tails.push(gd1); d1.start(t); d1.stop(t + 0.12);
        const d2 = c.createOscillator(); d2.type = 'triangle'; d2.frequency.value = 660;
        const gd2 = c.createGain(); gd2.gain.value = 0;
        gd2.gain.setValueAtTime(v * 0.6, t + 0.1); gd2.gain.setValueAtTime(v * 0.6, t + 0.12); gd2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        d2.connect(gd2); gd2.connect(out); __tails.push(gd2); d2.start(t + 0.1); d2.stop(t + 0.22);
        break;
      }
      case 'streak': {
        for (let i = 0; i < 3; i++) {
          const so = c.createOscillator(); so.type = 'triangle'; so.frequency.value = [660, 880, 1320][i];
          const sg = c.createGain(); sg.gain.value = 0;
          const st = t + i * 0.1;
          sg.gain.setValueAtTime(v * 0.55, st); sg.gain.setValueAtTime(v * 0.55, st + 0.02); sg.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
          so.connect(sg); sg.connect(out); __tails.push(sg); so.start(st); so.stop(st + 0.12);
        }
        break;
      }
    }
  if (__tails.length) {
      setTimeout(() => { for (const n of __tails) { try { n.disconnect(); } catch (e) { } } }, 1200);
    }
  } catch (e) { /* 音频异常忽略 */ }
}

function seq(notes, step, v, p) {
  if (!ctx) return;
  for (let i = 0; i < notes.length; i++) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = notes[i];
    const g = ctx.createGain();
    const t = ctx.currentTime + i * step;
    g.gain.value = 0;
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(p || master); o.start(t); o.stop(t + 0.35);
    const __tg = g;
    setTimeout(() => { try { __tg.disconnect(); } catch (e) { } }, 1500);
  }
}
