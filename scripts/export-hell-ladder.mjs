import { DIFF } from '../src/config.js';

const ladder = DIFF.hell.ladder;
const out = {};
for (const key of Object.keys(ladder)) {
  out[key] = ladder[key];
}
import { writeFileSync } from 'node:fs';
writeFileSync('D:/Claudeworkspace/GAME/001/data/hell_ladder.json', JSON.stringify(out));
console.log('exported keys:', Object.keys(out).join(','));
console.log('H8 has netWeights:', !!out['8'].netWeights);
console.log('H12 input:', out['12'].netWeights?.__default?.input, 'hidden:', out['12'].netWeights?.__default?.hidden, 'output:', out['12'].netWeights?.__default?.output);
