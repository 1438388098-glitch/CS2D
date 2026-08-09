import { normalizeAudioPrefs, readAudioPrefs, writeAudioPrefs, AUDIO_PREFS_VERSION } from '../src/audio/prefs.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log('ok - ' + name);
  else { failures++; console.log('FAIL - ' + name); }
}

const defaults = normalizeAudioPrefs({});
check('prefs defaults keep sfx audible', defaults.sfx === 1 && defaults.v === AUDIO_PREFS_VERSION);

const legacyZero = normalizeAudioPrefs({ sfx: 0, ui: 0.8, amb: 0.6, mus: 0.5 });
check('legacy zero sfx is repaired', legacyZero.sfx === 1 && legacyZero.ui === 0.8 && legacyZero.amb === 0.6);

const currentZero = normalizeAudioPrefs({ v: AUDIO_PREFS_VERSION, sfx: 0, ui: 0.8, amb: 0.6, mus: 0.5 });
check('current explicit sfx zero is preserved', currentZero.sfx === 0 && currentZero.ui === 0.8);

check('prefs default muted false', normalizeAudioPrefs({}).muted === false);
check('prefs persists muted true', normalizeAudioPrefs({ v: AUDIO_PREFS_VERSION, muted: true }).muted === true);
check('prefs persists muted false', normalizeAudioPrefs({ v: AUDIO_PREFS_VERSION, muted: false }).muted === false);

const store = new Map();
const storage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); }
};
writeAudioPrefs({ sfx: 0.3, ui: 0.7, amb: 0.5, mus: 0.4 }, storage);
const roundTrip = readAudioPrefs(storage);
check('prefs round trip', roundTrip.sfx === 0.3 && roundTrip.ui === 0.7 && roundTrip.v === AUDIO_PREFS_VERSION);

writeAudioPrefs(legacyZero, storage);
const migrated = readAudioPrefs(storage);
check('legacy zero round trip migrates storage', migrated.sfx === 1 && migrated.ui === 0.8);

console.log(failures === 0 ? 'audio-prefs: PASS' : 'audio-prefs: FAIL (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
