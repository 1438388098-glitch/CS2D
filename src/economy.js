import { WEAPONS, PRICES } from './config.js';
import { ctx } from './ctx.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export function buyItem(game, what) {
  const p = game.player;
  if (!p || p.dead) return false;
  if (game.state !== 'BUY' && !(game.state === 'LIVE' && game.buyTime > 0)) return false;
  let bought = false;
  if (what === 'armor') {
    if (p.armor >= 100 || p.money < PRICES.ARMOR) return false;
    p.money -= PRICES.ARMOR;
    p.armor = 100;
    bought = true;
  } else if (what === 'helm') {
    if (p.helmet || p.money < PRICES.HELM) return false;
    p.money -= PRICES.HELM;
    p.armor = 100;
    p.helmet = true;
    bought = true;
  } else if (what === 'kit') {
    if (p.weapons.kit || p.money < PRICES.KIT) return false;
    p.money -= PRICES.KIT;
    p.weapons.kit = true;
    bought = true;
  } else if (what === 'he' || what === 'flash' || what === 'smoke') {
    const pr = what === 'he' ? PRICES.HE : (what === 'flash' ? PRICES.FLASH : PRICES.SMOKE);
    const maxn = what === 'he' ? 1 : (what === 'flash' ? 2 : 1);
    if (p.weapons.nades[what] >= maxn || p.money < pr) return false;
    p.money -= pr;
    p.weapons.nades[what]++;
    bought = true;
  } else {
    const w = WEAPONS[what];
    if (!w) return false;
    if (what === 'glock' || what === 'usp') {
      if (p.weapons.secondary === what || p.money < w.price) return false;
      p.money -= w.price;
      p.weapons.secondary = what;
      p.ammoMap[what] = w.mag;
      p.reserveMap[what] = w.reserve;
      bought = true;
    } else {
      if (p.weapons.primary === what || p.money < w.price) return false;
      p.money -= w.price;
      if (p.weapons.primary) {
        const ow = WEAPONS[p.weapons.primary];
        game.drops.push({
          x: p.x, y: p.y, wid: p.weapons.primary,
          ammo: Math.min(ow.mag, (p.ammoMap[p.weapons.primary] === undefined ? ow.mag : p.ammoMap[p.weapons.primary])),
          reserve: Math.min(ow.reserve, p.reserveMap[p.weapons.primary] === undefined ? ow.reserve : p.reserveMap[p.weapons.primary]),
          life: 45, noPickT: 0.5
        });
      }
      p.weapons.primary = what;
      p.ammoMap[what] = w.mag;
      p.reserveMap[what] = w.reserve;
      bought = true;
    }
  }
  if (bought) {
    emit('sfx', { name: 'buy', vol: 0.8, game });
    emit('buyUpdated', { game });
  }
  return bought;
}
