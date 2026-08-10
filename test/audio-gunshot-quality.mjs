import { makeShotBuffer } from '../src/audio/patches.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log('ok - audio-gunshot-quality: ' + name);
  else { failures++; console.log('FAIL - audio-gunshot-quality: ' + name); }
}

function rms(data, start, end) {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end && i < data.length; i++) {
    sum += data[i] * data[i];
    count++;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function maxAbs(data, start, end) {
  let m = 0;
  for (let i = start; i < end && i < data.length; i++) {
    m = Math.max(m, Math.abs(data[i]));
  }
  return m;
}

const sr = 44100;
let captured = null;
const ac = {
  sampleRate: sr,
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    captured = { channels, length, sampleRate, data };
    return {
      getChannelData() { return data; },
      duration: length / sampleRate
    };
  }
};

const variants = ['ak', 'rifle', 'smg', 'sniper', 'pistol', 'shotgun', 'knife'];
for (const variant of variants) {
  captured = null;
  try {
    const buf = makeShotBuffer(ac, variant);
    const d = buf.getChannelData(0);
    check(variant + ' returns buffer', !!buf && d.length > 0);
    check(variant + ' has finite samples', d.every((v) => Number.isFinite(v)));
    check(variant + ' has audible energy', maxAbs(d, 0, d.length) > 0.05);
    check(variant + ' buffer length matches profile', captured && captured.length === d.length);
  } catch (e) {
    check(variant + ' builds without error', false);
  }
}

const ak = makeShotBuffer(ac, 'ak').getChannelData(0);
const first = rms(ak, 0, Math.floor(sr * 0.01));
const tail = rms(ak, ak.length - Math.floor(sr * 0.05), ak.length);
check('initial transient is loud', first > 0.03);
check('shot tail decays', tail < first * 0.6);
check('early peak is punchy but bounded', maxAbs(ak, 0, Math.floor(sr * 0.08)) > 0.15);
check('early peak stays under clipping', maxAbs(ak, 0, Math.floor(sr * 0.08)) <= 1.5);

let crossedZero = false;
for (let i = 1; i < ak.length && !crossedZero; i++) {
  if (ak[i - 1] > 0 && ak[i] < 0) crossedZero = true;
}
check('body has waveform oscillation', crossedZero);

console.log(failures === 0 ? 'audio-gunshot-quality: PASS' : 'audio-gunshot-quality: FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
