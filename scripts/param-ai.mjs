import { readFileSync, writeFileSync } from 'fs';
let s = readFileSync('D:/Claudeworkspace/CS2D/src/ai.js', 'utf8');
const pairs = [
  ['const d = DIFF[game.opts.diff];', 'const d = e.aiParams || DIFF[game.opts.diff];'],
  ['let bestD = DIFF[game.opts.diff].view;', 'let bestD = (e.aiParams || DIFF[game.opts.diff]).view;'],
  ['const ideal = td > 550 ? 1 : (td < 220 ? -1 : 0);',
   'const ideal = td > (d.idealMax || 550) ? 1 : (td < (d.idealMin || 220) ? -1 : 0);']
];
for (const [from, to] of pairs) {
  if (!s.includes(from)) { console.log('MISS: ' + from.slice(0, 60)); continue; }
  s = s.split(from).join(to);
}
writeFileSync('D:/Claudeworkspace/CS2D/src/ai.js', s);
console.log('ai.js parametrized');
