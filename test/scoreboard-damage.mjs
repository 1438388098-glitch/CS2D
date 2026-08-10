import { installStubs, registerUiIds } from './stubdom.js';
installStubs(); registerUiIds();
import { createGame, startMatch } from '../src/game.js';
import { applyDamage } from '../src/combat.js';
import { initUi } from '../src/ui.js';

function ok(name, cond) {
  if (!cond) throw new Error('scoreboard-damage: ' + name + ' FAIL');
  console.log('scoreboard-damage: ' + name + ' PASS');
}

function rowText(row) {
  let out = row.textContent || '';
  for (const child of row.children || []) out += rowText(child);
  return out;
}

const realNow = performance.now;
performance.now = () => 1000000;

const game = createGame({ team: 'ct', diff: 'normal', bots: 2, mapId: 'dust2' });
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);
startMatch(game);
game.state = 'LIVE';
game.freezeT = 0;

const ctBots = game.entities.filter((e) => e.bot && e.team === 'ct');
if (ctBots.length < 2) throw new Error('scoreboard-damage: expected two CT bots');
const high = ctBots[0];
const low = ctBots[1];
high.name = 'HighBot';
low.name = 'LowBot';
high.kills = 5;
high.deaths = 1;
high.dmgTotal = 320;
low.kills = 9;
low.deaths = 2;
low.dmgTotal = 120;

game.ui.toggleScoreboard(true);
const body = document.getElementById('sbBody');
const rows = body.children.filter((row) => rowText(row).includes('HighBot') || rowText(row).includes('LowBot'));
ok('scoreboard renders both damage rows', rows.length === 2);
ok('scoreboard sorts by damage', rowText(rows[0]).includes('HighBot') && rowText(rows[1]).includes('LowBot'));
ok('scoreboard displays damage values', rowText(rows[0]).includes('320') && rowText(rows[1]).includes('120'));

const target = game.entities.find((e) => e.bot && e.team === 't');
target.dead = false;
target.hp = 100;
target.armor = 0;
target.helmet = false;
const player = game.player;
player.dmgGiven = 0;
player.dmgTotal = 0;
applyDamage(target, 25, { killer: player, weapon: { kind: 'rifle' }, head: false }, game);
ok('player damage accumulates', player.dmgGiven === 25 && player.dmgTotal === 25);

target.dead = false;
target.hp = 100;
target.armor = 0;
target.helmet = false;
const before = high.dmgTotal || 0;
applyDamage(target, 37, { killer: high, weapon: { kind: 'rifle' }, head: false }, game);
ok('bot damage accumulates', (high.dmgTotal || 0) === before + 37);

performance.now = realNow;
console.log('scoreboard-damage: all PASS');
