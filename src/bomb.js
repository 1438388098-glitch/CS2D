import {ROUND, ECONOMY} from './config.js';
import {addMoney} from './economy.js';
import {inSite, los, getMap} from './map.js';
import {applyDamage, addDecal} from './combat.js';
import {endRound, spawnParticle} from './game.js';
import {pushRadio} from './combat.js';

import {ctx} from './ctx.js';
import {rand} from './utils.js';
import {addPing} from './ping-fx.js';
import {spawnEmbers} from './burst-fx.js';

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
  if (e.plantT - (e.plantSoundAt || 0) > 0.5) {
    e.plantSoundAt = e.plantT;
    game.lastSound = { x: e.x, y: e.y, t: game.time, radius: 700, conf: 0.55 };
  }
  if (e.plantT >= 3) {
    e.plantT = 0;
    e.hasBomb = false;
    game.bomb = { x: e.x, y: e.y, dropped: false, planted: true, site: s.label, timer: (game.roundEvent && game.roundEvent.fuse) || Number(game.opts.fuse) || ROUND.BOMB_FUSE, defusing: false, defuseT: 0 };
    e.plants++;
    game._plantedRound = true;
    addMoney(e, ECONOMY.PLANT_MONEY);
    emit('sysfeed', { text: '炸弹已安放于 ' + (s.label === 'A' ? 'A' : 'B') + ' 点' });
    pushRadio(game, '炸弹已安放 ' + (s.label === 'A' ? 'A' : 'B') + ' 区');
    emit('sfx', { name: 'bombPlanted', vol: 0.9, x: e.x, y: e.y, game });
    game.lastSound = { x: e.x, y: e.y, t: game.time, radius: 900, conf: 0.6 };
    addPing(game, 'plant', e.x, e.y);
  }
}

export function defuseBomb(e, game) {
  if (!game.bomb || !game.bomb.planted || e.team !== 'ct') return;
  if (Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) > 55) {
    if (e.defuseT > 0) {
      e.defuseT = 0;
      if (game.bomb.defusing) game.bomb.defusing = false;
      // 拆弹中断提示：被击退/脱离范围需重新拆（beepWarn 专用警示音，区别于倒计时蜂鸣）
      emit('toast', { text: '拆弹被中断！' });
      emit('sfx', { name: 'beepWarn', vol: 0.6, x: e.x, y: e.y, game });
    }
    return;
  }
  const speed = e.weapons.kit ? 2.5 : 5;
  e.defuseT += game.dt;
  if (e.defuseT - (e.defuseSoundAt || 0) > 0.5) {
    e.defuseSoundAt = e.defuseT;
    game.lastSound = { x: game.bomb.x, y: game.bomb.y, t: game.time, radius: 600, conf: 0.5 };
    // 拆弹进度音效：每 0.5s 一声低频咔哒，让拆弹过程有听觉反馈
    emit('sfx', { name: 'plantTic', vol: 0.55, x: game.bomb.x, y: game.bomb.y, game });
  }
  game.bomb.defusing = true;
  if (e.defuseT >= speed) {
    e.defuseT = 0;
    game.bomb = null;
    e.defuses++;
    addMoney(e, ECONOMY.DEFUSE_MONEY);
    emit('sysfeed', { text: '炸弹已拆除！' });
    pushRadio(game, e.name + ' 完成拆弹');
    // bombDefused 专用胜利音（patches 已有音色此前从未触发）；回合结束的 win 音由 endRound 统一播
    emit('sfx', { name: 'bombDefused', vol: 0.9, x: e.x, y: e.y, game });
    game.lastSound = { x: e.x, y: e.y, t: game.time, radius: 900, conf: 0.6 };
    addPing(game, 'defuse', e.x, e.y);
    endRound(game, 'ct', '拆弹成功', 'defuse');
  }
}

export function explodeBomb(game) {
  const b = game.bomb;
  if (!b) return;
  b.planted = false;
  emit('sfx', { name: 'boom', vol: 1.3, x: b.x, y: b.y, game });
  game.lastSound = { x: b.x, y: b.y, t: game.time, radius: 1600, conf: 1 };
  addPing(game, 'boom', b.x, b.y);
  game.shake = Math.max(game.shake, 14);
  spawnParticle(game, { kind: 'boom', x: b.x, y: b.y, life: 0.5, size: 300 });
  addDecal(game, b.x, b.y, 'scorch', 0);
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    spawnParticle(game, { kind: 'fire', x: b.x, y: b.y, vx: Math.cos(a) * rand(100, 420), vy: Math.sin(a) * rand(100, 420), life: rand(0.2, 0.6), size: rand(3, 7) });
  }
  for (let j = 0; j < 14; j++) {
    const a2 = rand() * Math.PI * 2;
    spawnParticle(game, { kind: 'smokep', x: b.x + Math.cos(a2) * 40, y: b.y + Math.sin(a2) * 40, vx: Math.cos(a2) * rand(30, 120), vy: Math.sin(a2) * rand(30, 120), life: rand(1.2, 2.4), size: rand(6, 14) });
  }
  // 爆炸余烬：火星缓升 ~2s，延长高光时刻
  spawnEmbers(game, spawnParticle, b.x, b.y, 14, 46);
  game._bombExploding = true;
  for (const e of game.entities) {
    if (e.dead) continue;
    if (e.team === 't') continue;
    const d = Math.hypot(e.x - b.x, e.y - b.y);
    if (d >= 620) continue;
    if (!los(game, b.x, b.y, e.x, e.y)) continue;
    const dmg = 700 * (1 - d / 620);
    if (dmg > 0) applyDamage(e, dmg, { killer: null, weapon: 'bomb', head: false }, game);
  }
  game._bombExploding = false;
  endRound(game, 't', '炸弹爆炸', 'bomb');
}
