import { evolve } from './evolve.js';
const best = await evolve({ gens: 8, mapId: 'dust2' });
console.log('best genome:', JSON.stringify(best.g));
console.log('best params:', JSON.stringify(best.r));
