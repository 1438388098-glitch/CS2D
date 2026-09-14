// 中文语音播报（candidate-579）：浏览器自带 speechSynthesis 零依赖播报关键事件。
// 默认关闭（避免打扰），设置面板可开；仅白名单事件触发，防刷屏。
import { ctx } from '../ctx.js';

const KEY = 'cs2d_voice_v1';
let enabled = null;

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

export function initVoice() {
  if (enabled !== null) return;
  const s = store();
  enabled = s ? s.getItem(KEY) === 'on' : false;
  let last = 0;
  ctx.bus.on('banner', (p) => {
    if (!enabled || !p || !p.t1) return;
    // 手枪局/赛点局/胜负横幅进白名单；REPLAY 等演出不播
    const text = String(p.t1) + (p.t2 ? '，' + p.t2 : '');
    speak(text);
  });
  ctx.bus.on('sysfeed', (p) => {
    if (!enabled || !p || !p.text) return;
    const t = String(p.text);
    const hot = ['炸弹已安放', '炸弹已拆除', '回合 MVP', '残局翻盘', '人质'];
    if (hot.some((k) => t.includes(k)) && Date.now() - last > 2500) {
      last = Date.now();
      speak(t);
    }
  });
}

function speak(text) {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.15;
    u.volume = 0.85;
    speechSynthesis.speak(u);
  } catch (e) { /* 无语音引擎时静默 */ }
}

export function voiceEnabled() { initVoice(); return !!enabled; }

export function setVoiceEnabled(on) {
  enabled = !!on;
  const s = store();
  if (s) { try { s.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 忽略 */ } }
}
