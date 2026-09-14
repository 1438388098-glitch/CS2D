// 空投补给：回合中段在地图中立区域投放高级武器箱，小地图 ping 双方可见。
// 慢节奏回合里的"地图级诱饵"：逼 bot 偏离既定路线、给玩家一个值得冒险的抢点理由。
import { ctx } from './ctx.js';
import { rand } from './utils.js';
import { passableTolerant, getMap } from './map.js';
import { WEAPONS } from './config.js';
import { addPing } from './ping-fx.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

const AIRDROP_POOL = ['ak', 'm4', 'aug', 'sg553', 'awp'];
const AIRDROP_CHANCE = 0.3;      // 每回合 30% 出一次
const WINDOW_START = 18;         // LIVE 后 18-38s 之间落地
const WINDOW_END = 38;

// game.update LIVE 态调用（gameplayPlus 开启时）
export function updateAirdrop(game, dt) {
  if (!game || game.state !== 'LIVE' || game.over) return;
  if (!game.opts.gameplayPlus || game.round < 2) return;
  if (game._airdropRound !== game.round) {
    game._airdropRound = game.round;
    game._airdropAt = null;
    if (rand() < AIRDROP_CHANCE) {
      game._airdropAt = WINDOW_START + rand() * (WINDOW_END - WINDOW_START);
    }
  }
  if (game._airdropAt === null || game._airdropDone) return;
  if (game.roundTime >= game._airdropAt) {
    game._airdropDone = true;
    spawnAirdrop(game);
  }
}

function spawnAirdrop(game) {
  const map = getMap();
  const cx = map.W / 2, cy = map.H / 2;
  let x = null, y = null;
  for (let tries = 0; tries < 40; tries++) {
    // 落点偏向地图中部：双方到点距离相近，制造对称的争抢压力
    const nx = cx + rand(-map.W * 0.22, map.W * 0.22);
    const ny = cy + rand(-map.H * 0.22, map.H * 0.22);
    if (passableTolerant(nx, ny)) { x = nx; y = ny; break; }
  }
  if (x === null) return;
  const wid = AIRDROP_POOL[Math.floor(rand() * AIRDROP_POOL.length)];
  const w = WEAPONS[wid];
  game.drops.push({ x, y, wid, ammo: w.mag, reserve: w.reserve, life: 40, noPickT: 0, airdrop: true });
  addPing(game, 'airdrop', x, y);
  emit('sfx', { name: 'beep', vol: 0.5, x, y, game });
  emit('sysfeed', { text: '📦 空投补给已投放：' + w.name + '（小地图绿点）' });
}
