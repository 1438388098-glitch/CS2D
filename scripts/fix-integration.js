const fs = require('fs');
const base = 'D:/Claudeworkspace/CS2D/src/';

// 1. grenades.js 补 los import
let g = fs.readFileSync(base + 'grenades.js', 'utf8');
if (!/import \{ passable, los \} from '\.\/map\.js'/.test(g)) {
  g = g.replace("import { passable } from './map.js';", "import { passable, los } from './map.js';");
  fs.writeFileSync(base + 'grenades.js', g);
  console.log('grenades.js: los import fixed');
} else {
  console.log('grenades.js: already ok');
}

// 2. combat.js 删除 triggerWas 边沿逻辑（边沿改由 game.js 处理）
let c = fs.readFileSync(base + 'combat.js', 'utf8');
if (c.includes('triggerWas')) {
  c = c.replace(/if \(!w\.auto && e\.trigger && e\.triggerWas\) return;\s*e\.triggerWas = e\.trigger;\s*/g, '');
  fs.writeFileSync(base + 'combat.js', c);
  console.log('combat.js: triggerWas logic removed');
} else {
  console.log('combat.js: no triggerWas found');
}

// 3. game.js 全自动/半自动分支
let gm = fs.readFileSync(base + 'game.js', 'utf8');
const old = `  const firePressed = mouse.down && !mouse.wasDown;
  mouse.wasDown = mouse.down;
  p.trigger = firePressed && game.freezeT <= 0 && (game.state === 'BUY' || game.state === 'LIVE');`;
const neu = `  const wantFire = mouse.down && game.freezeT <= 0 && (game.state === 'BUY' || game.state === 'LIVE');
  p.trigger = wantFire && (w.auto ? true : !mouse.wasDown);
  mouse.wasDown = mouse.down;`;
if (gm.includes('const firePressed')) {
  gm = gm.replace(old, neu);
  fs.writeFileSync(base + 'game.js', gm);
  console.log('game.js: auto/semi-auto trigger fixed');
} else {
  console.log('game.js: pattern not found, current:');
  const lines = gm.split('\n');
  lines.forEach((l, i) => { if (l.includes('wantFire') || l.includes('wasDown')) console.log((i + 1) + ': ' + l.trim()); });
}
