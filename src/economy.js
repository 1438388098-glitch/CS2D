import { WEAPONS, PRICES, ECONOMY } from './config.js';
import { ctx } from './ctx.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
export function killRewardFor(weapon) {
  if (weapon === 'knife') return ECONOMY.KILL_MONEY_KNIFE;
  if (weapon === 'awp') return ECONOMY.KILL_MONEY_AWP;
  const w = WEAPONS[weapon];
  if (w && w.kind === 'smg') return ECONOMY.KILL_MONEY_SMG;
  if (w && w.kind === 'shotgun') return ECONOMY.KILL_MONEY_SHOTGUN;
  return ECONOMY.KILL_MONEY;
}

export function addMoney(e, amount) {
  e.money = Math.max(0, Math.min(ECONOMY.MONEY_CAP, e.money + amount));
}

export function nextRoundBudget(p, game) {
  const streakKey = p && p.team === 'ct' ? 'lossStreakCT' : 'lossStreakT';
  const streak = game ? (game[streakKey] || 0) : 0;
  const lossBonus = ECONOMY.LOSS_BONUS[Math.min(streak, ECONOMY.LOSS_BONUS.length - 1)] || 0;
  const win = Math.min(ECONOMY.MONEY_CAP, (p ? p.money : 0) + ECONOMY.WIN_MONEY);
  const loss = Math.min(ECONOMY.MONEY_CAP, (p ? p.money : 0) + lossBonus);
  return { win, loss, lossBonus, streak };
}

export function clearEquipment(e) {
  e.weapons.primary = null;
  e.weapons.secondary = null;
  e.weapons.nades = { he: 0, flash: 0, smoke: 0, decoy: 0, moly: 0, emp: 0 };
  e.weapons.kit = false;
  e.armor = 0;
  e.helmet = false;
  e.hasBomb = false;
  e.ammoMap = {};
  e.reserveMap = {};
  e.slot = 'secondary';
}

export function buyItem(game, what) {
  const p = game.player;
  if (!p || p.dead) return false;
  // 军备竞赛：武器由梯阶决定，购买可绕梯（BUY 期买 AWP 直接跳梯）
  if (game.opts && game.opts.mode === 'gungame') return false;
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
    if (p.team !== 'ct') return false;
    if (p.weapons.kit || p.money < PRICES.KIT) return false;
    p.money -= PRICES.KIT;
    p.weapons.kit = true;
    bought = true;
  } else if (what === 'he' || what === 'flash' || what === 'smoke' || what === 'decoy' || what === 'moly' || what === 'emp') {
    const pr = what === 'he' ? PRICES.HE : (what === 'flash' ? PRICES.FLASH : (what === 'decoy' ? PRICES.DECOY : (what === 'moly' ? PRICES.MOLLY : (what === 'emp' ? PRICES.EMP : PRICES.SMOKE))));
    const maxn = what === 'flash' ? 2 : 1;
    if (p.weapons.nades[what] >= maxn || p.money < pr) return false;
    p.money -= pr;
    p.weapons.nades[what]++;
    bought = true;
  } else {
    const w = WEAPONS[what];
    if (!w) return false;
    // 回合事件「禁狙令」：本回合 AWP 不可购买（bot 购买同步受 buys.js allowAwp 门控）
    if (what === 'awp' && game.roundEvent && game.roundEvent.noAwp) return false;
    if (what === 'glock' || what === 'usp') {
      if (p.weapons.secondary === what || p.money < w.price) return false;
      p.money -= w.price;
      // 旧副武器落地（与主武器替换一致）
      if (p.weapons.secondary) {
        const os = WEAPONS[p.weapons.secondary];
        game.drops.push({
          x: p.x, y: p.y, wid: p.weapons.secondary,
          ammo: Math.min(os.mag, (p.ammoMap[p.weapons.secondary] === undefined ? os.mag : p.ammoMap[p.weapons.secondary])),
          reserve: Math.min(os.reserve, p.reserveMap[p.weapons.secondary] === undefined ? os.reserve : p.reserveMap[p.weapons.secondary]),
          life: 45, noPickT: 0.5
        });
      }
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
