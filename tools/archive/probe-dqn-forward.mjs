import { DIFF } from '../src/config.js';
import { dqnFromJSON } from '../src/dqn.js';

const h8 = DIFF.hell.ladder[8];
const nw = h8.netWeights.__default;
const net = dqnFromJSON(nw);
const obs = [0.5, 0.8, 0.2, 0.4, 0.6, 0.33, 0.1, 1.0, 0.0, 0.3, 0.0, 1.0, 0.0];
const q = net.forward(obs);
console.log('JS forward q =', q.map(v => v.toFixed(10)).join(', '));
let best = 0;
for (let k = 1; k < q.length; k++) if (q[k] > q[best]) best = k;
console.log('JS argmax =', best);

// H12 团队网（33/32/18）
const h12 = DIFF.hell.ladder[12];
const nw12 = h12.netWeights.__default;
const net12 = dqnFromJSON(nw12);
const obs12 = Array.from({length: 33}, (_, i) => (i * 37) % 100 / 100);
const q12 = net12.forward(obs12);
console.log('JS H12 q =', q12.map(v => v.toFixed(6)).join(', '));
