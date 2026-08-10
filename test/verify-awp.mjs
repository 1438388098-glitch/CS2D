import { installStubs, registerUiIds } from './stubdom.js';
installStubs();
registerUiIds();
import { createGame, startMatch, update } from '../src/game.js';
import { initUi } from '../src/ui.js';

const mapId = process.argv[2] || 'dust2';
const game = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);
startMatch(game);
game.player.dead = true;
if (game.freezeT > 0) game.freezeT = 0;

let awpCount = 0, scopedSeen = 0, crouchSeen = 0, walkSeen = 0, scopedShots = 0, totalShots = 0;
const awpBots = new Set();
const buyLog = {};
for (let i = 0; i < 36000 && !game.over; i++) {
  update(game, 1 / 30);
  if (game.state === 'BUY' && game.buyTime > 1) { game.buyTime = 0.8; game.freezeT = 0.3; }
  for (const e of game.entities) {
    if (!e.bot || e.dead) continue;
    if (e.weapons && e.weapons.primary === 'awp') {
      awpBots.add(e.name);
      if (e.scoped) scopedSeen++;
    }
    if (e.crouched) crouchSeen++;
    if (e.walking) walkSeen++;
    if (e.trigger || (e.lastShot && e.lastShot > game.time * 1000 - 40)) {
      totalShots++;
      if (e.scoped) scopedShots++;
    }
  }
}
awpCount = awpBots.size;
console.log('AWP bots 出现数:', awpCount, [...awpBots].join(','));
console.log('开镜帧数(观察窗口):', scopedSeen, '| 蹲射帧数:', crouchSeen, '| 静步帧数:', walkSeen);
console.log('狙击开镜射击/总射击:', scopedShots, '/', totalShots);
process.exit(0);
