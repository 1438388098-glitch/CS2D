import { ROUND, ECONOMY } from './config.js';
import { addMoney } from './economy.js';
import { inSite, los, getMap } from './map.js';
import { applyDamage } from './combat.js';
import { endRound, spawnParticle } from './game.js';

import { ctx } from './ctx.js';
import { clamp, rand } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export function dropBomb(x, y, game) {
  if (game.bomb && game.bomb.planted) return;
  game.bomb = { x, y, dropped: true, planted: false, site: null, timer: 0, defusing: false, defuseT: 0 };
  for (const e of game.entities) e.hasBomb = false;
  emit('sysfeed', { text: '炸弹掉落在地上' });
}

export function pickupBomb(e, game) {
  if (!game.bomb || !game.bomb.dropped) return;
  if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 40 && e.team === 't') {
    e.hasBomb = true;
    game.bomb = null;
    if (e === game.player) {
      emit('toast', { text: '你捡起了炸弹！' });
      emit('sysfeed', { text: 'You 捡起了炸弹' });
    }
  }
}

export function plantBomb(e, game) {
  if (!e.hasBomb) return;
  if (game.bomb && game.bomb.planted) return;
  const sites = getMap().sites;
  const inA = !!(sites.A && inSite(e.x, e.y, sites.A));
  const inB = !!(sites.B && inSite(e.x, e.y, sites.B));
  if (!inA && !inB) {
    if (e.plantT > 0) e.plantT = 0;
    return;
  }
  const s = inA ? sites.A : sites.B;
  e.plantT += game.dt;
  if (e.plantT >= 3) {
    e.plantT = 0;
    e.hasBomb = false;
    game.bomb = { x: e.x, y: e.y, dropped: false, planted: true, site: s.label, timer: ROUND.BOMB_FUSE, defusing: false, defuseT: 0 };
    e.plants++;
    addMoney(e, ECONOMY.PLANT_MONEY);
    emit('sysfeed', { text: 'Bomb has been planted at ' + (s.label === 'A' ? 'A' : 'B') });
    emit('sfx', { name: 'bombPlanted', vol: 0.9, x: e.x, y: e.y, game });
  }
}

export function defuseBomb(e, game) {
  if (!game.bomb || !game.bomb.planted || e.team !== 'ct') return;
  if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) > 55) {
    if (e.defuseT > 0) {
      e.defuseT = 0;
      if (game.bomb.defusing) game.bomb.defusing = false;
      // 拆弹中断提示：被击退/脱离范围需重新拆
      emit('toast', { text: '拆弹被中断！' });
      emit('sfx', { name: 'beep', vol: 0.5, x: e.x, y: e.y, game });
    }
    return;
  }
  const speed = e.weapons.kit ? 2.5 : 5;
  e.defuseT += game.dt;
  game.bomb.defusing = true;
  if (e.defuseT >= speed) {
    e.defuseT = 0;
    game.bomb = null;
    e.defuses++;
    addMoney(e, ECONOMY.DEFUSE_MONEY);
    emit('sysfeed', { text: 'Bomb has been defused!' });
    emit('sfx', { name: 'win', vol: 0.8, x: e.x, y: e.y, game });
    endRound(game, 'ct', '拆弹成功', 'defuse');
  }
}

export function explodeBomb(game) {
  const b = game.bomb;
  if (!b) return;
  b.planted = false;
  emit('sfx', { name: 'boom', vol: 1.3, x: b.x, y: b.y, game });
  game.shake = Math.max(game.shake, 14);
  spawnParticle(game, { kind: 'boom', x: b.x, y: b.y, life: 0.5, size: 300 });
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    spawnParticle(game, { kind: 'fire', x: b.x, y: b.y, vx: Math.cos(a) * rand(100, 420), vy: Math.sin(a) * rand(100, 420), life: rand(0.2, 0.6), size: rand(3, 7) });
  }
  for (let j = 0; j < 14; j++) {
    const a2 = rand() * Math.PI * 2;
    spawnParticle(game, { kind: 'smokep', x: b.x + Math.cos(a2) * 40, y: b.y + Math.sin(a2) * 40, vx: Math.cos(a2) * rand(30, 120), vy: Math.sin(a2) * rand(30, 120), life: rand(1.2, 2.4), size: rand(6, 14) });
  }
  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.team === 't') continue;
    const d = Math.hypot(e.x - b.x, e.y - b.y);
    if (d >= 620) continue;
    if (!los(game, b.x, b.y, e.x, e.y)) continue;
    const dmg = 700 * (1 - d / 620);
    if (dmg > 0) applyDamage(e, dmg, { killer: null, weapon: 'bomb', head: false }, game);
  }
  endRound(game, 't', '炸弹爆炸', 'bomb');
}
