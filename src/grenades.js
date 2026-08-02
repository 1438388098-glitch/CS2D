import { passable, los } from './map.js';
import { applyDamage } from './combat.js';
import { ctx } from './ctx.js';
import { rand, angDiff } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
import { BOT_AI } from './config.js';
import { spawnParticle } from './game.js';

export function throwGrenade(e, game) {
  if (e.dead) return;
  const nade = e.slot.slice(5);
  if (e.weapons.nades[nade] <= 0) {
    e.slot = e.lastSlot;
    return;
  }
  e.weapons.nades[nade]--;
  const speed = nade === 'smoke' ? 480 : 560;
  game.grenades.push({
    x: e.x + Math.cos(e.angle) * 20, y: e.y + Math.sin(e.angle) * 20,
    vx: Math.cos(e.angle) * speed, vy: Math.sin(e.angle) * speed,
    kind: nade,
    fuse: nade === 'smoke' ? 1.8 : (nade === 'flash' ? 1.6 : 1.5),
    bounces: 0, owner: e
  });
  emit('sfx', { name: 'knife', vol: 0.4, x: e.x, y: e.y, game });
  if (e.slot && e.slot.indexOf('nade:') === 0) e.slot = e.lastSlot;
}

export function updateGrenades(game, dt) {
  for (let i = game.grenades.length - 1; i >= 0; i--) {
    const g = game.grenades[i];
    g.fuse -= dt;
    if (g.fuse <= 0) {
      game.grenades.splice(i, 1);
      if (g.kind === 'he') {
        emit('sfx', { name: 'boom', vol: 1.2, x: g.x, y: g.y, game });
        game.shake = Math.max(game.shake, 9);
        spawnParticle(game, { kind: 'boom', x: g.x, y: g.y, life: 0.5, size: 180 });
        for (let f = 0; f < 26; f++) {
          const a = rand() * Math.PI * 2;
          spawnParticle(game, { kind: 'fire', x: g.x, y: g.y, vx: Math.cos(a) * rand(80, 360), vy: Math.sin(a) * rand(80, 360), life: rand(0.2, 0.5), size: rand(3, 6) });
        }
        for (const e of game.entities) {
          if (e.dead) continue;
          if (g.owner && e.team === g.owner.team) continue;
          const d = Math.hypot(e.x - g.x, e.y - g.y);
          if (d >= 260) continue;
          if (!los(game, g.x, g.y, e.x, e.y)) continue;
          const dmg = 95 * (1 - d / 260);
          if (dmg > 0) applyDamage(e, dmg, { killer: g.owner || null, weapon: 'grenade', head: false }, game);
        }
      } else if (g.kind === 'flash') {
        emit('sfx', { name: 'flash', vol: 1.0, x: g.x, y: g.y, game });
        for (const e of game.entities) {
          if (e.dead) continue;
          if (g.owner && g.owner.team === e.team) continue;
          const d = Math.hypot(e.x - g.x, e.y - g.y);
          if (d > 800) continue;
          const fa = Math.atan2(g.y - e.y, g.x - e.x);
          if (Math.abs(angDiff(e.angle, fa)) > BOT_AI.FLASH_ANGLE) continue;
          if (!los(game, g.x, g.y, e.x, e.y, e.height)) continue;
          const dur = (1 - d / 800) * 4;
          if (e === game.player) {
            game.flashT = Math.max(game.flashT, dur);
            emit('flash', { opacity: Math.min(0.9, dur * 0.22) });
          } else {
            e.blind = Math.max(e.blind, dur);
          }
        }
      } else if (g.kind === 'smoke') {
        emit('sfx', { name: 'smoke', vol: 0.8, x: g.x, y: g.y, game });
        game.smokes.push({ x: g.x, y: g.y, r: 20, gr: 150, life: 12 });
        for (let s2 = 0; s2 < 10; s2++) {
          const a3 = rand() * Math.PI * 2;
          spawnParticle(game, { kind: 'smokep', x: g.x + Math.cos(a3) * 20, y: g.y + Math.sin(a3) * 20, vx: Math.cos(a3) * rand(20, 80), vy: Math.sin(a3) * rand(20, 80), life: rand(0.8, 1.6), size: rand(8, 16) });
        }
      }
      continue;
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (!passable(g.x, g.y)) {
      const nx = g.x - g.vx * dt * 2, ny = g.y - g.vy * dt * 2;
      if (passable(nx, g.y)) { g.vy *= -0.55; g.vx *= 0.7; }
      else if (passable(g.x, ny)) { g.vx *= -0.55; g.vy *= 0.7; }
      else { g.vx *= -0.55; g.vy *= -0.55; }
      g.bounces++;
      if (g.bounces > 4) { g.x = nx; g.y = ny; g.vx = 0; g.vy = 0; }
    }
    g.vx *= Math.max(0, 1 - 1.6 * dt);
    g.vy *= Math.max(0, 1 - 1.6 * dt);
  }
  for (let s = game.smokes.length - 1; s >= 0; s--) {
    const sm = game.smokes[s];
    sm.life -= dt;
    sm.r = sm.r + (sm.gr - sm.r) * (1 - Math.exp(-3 * dt));
    if (sm.life <= 0) game.smokes.splice(s, 1);
  }
}
