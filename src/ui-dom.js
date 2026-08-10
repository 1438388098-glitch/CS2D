import { ROUND } from './config.js';
import { weaponDef, ammoFor, reserveFor, wkey } from './entities.js';
import { tileAt } from './map.js';
import { clamp } from './utils.js';

let game = null;
let D = {};
let lastTop = 0;
let lastSpecKey = '';

const ICON_BY_WEAPON = {
  ak: 'ic-ak', m4: 'ic-m4', famas: 'ic-rifle', mac10: 'ic-mac10', mp9: 'ic-mp9', p90: 'ic-p90',
  xm: 'ic-xm', awp: 'ic-awp', p250: 'ic-p250', deagle: 'ic-deagle', glock: 'ic-p250', usp: 'ic-p250',
  knife: 'ic-knife-w'
};

const STATE_ICON = {
  reload: 'ic-reload', scope: 'ic-scope', step: 'ic-step', water: 'ic-wave'
};

export function initUiDom(gameRef) {
  game = gameRef;
  const ids = [
    'hud-root', 'hudScoreT', 'hudTime', 'hudScoreC', 'hudBuyTip', 'hudHellTip',
    'hudWeaponIc', 'hudWeaponName', 'hudHp', 'hudHpBar', 'hudArmorBar', 'hudMoney',
    'hudStateRow', 'hudStateIc', 'hudStateText',
    'hudAmmoMag', 'hudAmmoRes', 'hudReloadRing', 'hudAmmoName',
    'nadeHe', 'nadeFlash', 'nadeSmoke',
    'hudBomb', 'hudBombSecs', 'hudSpectate', 'hudSpecText'
  ];
  for (const id of ids) D[id] = document.getElementById(id);
  D.hudBomb = document.getElementById('hud-bomb');
  D.hudSpectate = document.getElementById('hud-spectate');
}

export function updateHudDom(now) {
  if (!game) return;
  const p = game.player;
  const inMatch = game.state !== 'MENU';
  if (D['hud-root']) D['hud-root'].style.display = inMatch ? 'block' : 'none';
  if (!inMatch) return;
  updateLeft(p, now);
  updateRight(p, now);
  if (now - lastTop > 100) {
    lastTop = now;
    updateTop(p, now);
  }
}

function updateLeft(p, now) {
  const dead = !p || p.dead;
  if (!p) return;
  D['hud-left'] = D['hud-left'] || document.getElementById('hud-left');
  D['hud-left'].classList.toggle('dead', dead);
  if (dead) return;

  const hp = Math.max(0, Math.ceil(p.hp));
  D.hudHp.textContent = hp;
  D.hudHpBar.classList.toggle('low', hp <= 25);
  D.hudHpBar.firstElementChild.style.width = clamp(p.hp / 100, 0, 1) * 100 + '%';
  D.hudArmorBar.firstElementChild.style.width = clamp(p.armor / 100, 0, 1) * 100 + '%';
  D.hudMoney.textContent = '$' + p.money;

  const wk = wkey(p);
  const wd = weaponDef(p);
  const icon = ICON_BY_WEAPON[wk] || 'ic-p250';
  if (D.hudWeaponIc.getAttribute('href') !== 'assets/icons.svg#' + icon) {
    D.hudWeaponIc.setAttribute('href', 'assets/icons.svg#' + icon);
  }
  const nm = wd ? wd.name : (p.slot && p.slot.indexOf('nade:') === 0 ? '手雷' : '');
  if (D.hudWeaponName.textContent !== nm) D.hudWeaponName.textContent = nm;

  // 状态行：换弹 > 开镜 > 涉水 > 静步
  let st = null;
  let stTxt = '';
  if (p.reloading) {
    st = 'reload';
    const w = wd;
    const total = w && w.reloadT ? w.reloadT : 2.4;
    const pct = clamp(p.reloadT / total, 0, 1);
    stTxt = '换弹中 ' + Math.ceil(p.reloadT * 10) / 10 + 's';
    D.hudReloadRing.style.display = 'block';
    D.hudReloadRing.style.background = 'conic-gradient(var(--accent) ' + Math.round((1 - pct) * 360) + 'deg, rgba(255,255,255,.12) 0deg)';
  } else {
    D.hudReloadRing.style.display = 'none';
    if (p.scoped) { st = 'scope'; stTxt = '已开镜'; }
    else if (tileAt(p.x, p.y) === '~' || tileAt(p.x, p.y) === '≈') { st = 'water'; stTxt = '涉水中'; }
    else if (p.walking) { st = 'step'; stTxt = '静步'; }
  }
  if (st) {
    D.hudStateRow.style.display = 'inline-flex';
    D.hudStateIc.setAttribute('href', 'assets/icons.svg#' + STATE_ICON[st]);
    D.hudStateText.textContent = stTxt;
  } else {
    D.hudStateRow.style.display = 'none';
  }
}

function updateRight(p, now) {
  if (!p || p.dead) return;
  const wd = weaponDef(p);
  const wk = wkey(p);
  let mag = '∞', res = '';
  if (wd && wd.mag > 0) {
    mag = String(ammoFor(p));
    res = String(reserveFor(p));
  } else if (!wd) {
    mag = '—';
  }
  if (D.hudAmmoMag.textContent !== mag) {
    D.hudAmmoMag.textContent = mag;
    D.hudAmmoMag.classList.toggle('empty', mag === '0');
  }
  if (D.hudAmmoRes.textContent !== res) D.hudAmmoRes.textContent = res;
  const nm = wd ? wd.name : (p.slot && p.slot.indexOf('nade:') === 0 ? '投掷物' : '');
  if (D.hudAmmoName.textContent !== nm) D.hudAmmoName.textContent = nm;

  const nades = p.weapons.nades;
  const nk = p.slot && p.slot.indexOf('nade:') === 0 ? p.slot.split(':')[1] : null;
  const defs = [['he', 'nadeHe'], ['flash', 'nadeFlash'], ['smoke', 'nadeSmoke']];
  for (const [k, id] of defs) {
    const e = D[id];
    if (!e) continue;
    const n = nades[k] || 0;
    e.classList.toggle('empty', n <= 0);
    e.classList.toggle('active', nk === k);
    const b = e.querySelector('b');
    if (b && b.textContent !== (k === 'flash' ? '5' : k === 'smoke' ? '6' : '4')) {
      b.textContent = k === 'flash' ? '5' : k === 'smoke' ? '6' : '4';
    }
  }
}

function updateTop(p, now) {
  const tT = Math.max(0, Math.ceil((game.roundDur || ROUND.DURATION) - game.roundTime));
  const tMin = Math.floor(tT / 60);
  const tSec = tT % 60;
  const timeStr = (tMin < 10 ? '0' : '') + tMin + ':' + (tSec < 10 ? '0' : '') + tSec;
  if (D.hudTime.textContent !== timeStr) D.hudTime.textContent = timeStr;
  const st = 'T ' + game.score.T;
  const sc = game.score.CT + ' CT';
  if (D.hudScoreT.textContent !== st) D.hudScoreT.textContent = st;
  if (D.hudScoreC.textContent !== sc) D.hudScoreC.textContent = sc;

  if (game.state === 'BUY' && game.buyTime > 0) {
    D.hudBuyTip.style.display = 'block';
    D.hudBuyTip.innerHTML = '购买阶段 剩余 <b>' + Math.max(0, game.buyTime).toFixed(1) + 's</b> · B 打开购买菜单';
  } else {
    D.hudBuyTip.style.display = 'none';
  }

  const hell = game.opts && game.opts.diff === 'hell';
  if (hell) {
    D.hudHellTip.style.display = 'block';
    D.hudHellTip.innerHTML = '<svg class="ht-ic"><use href="assets/icons.svg#ic-fire"/></svg>HELL H' + (game.opts.hellLevel || 10);
  } else {
    D.hudHellTip.style.display = 'none';
  }

  // 炸弹卡
  const bomb = game.bomb && game.bomb.planted;
  if (bomb) {
    const t = game.bomb.timer;
    D.hudBomb.style.display = 'flex';
    D.hudBombSecs.textContent = Math.max(0, t).toFixed(1);
    D.hudBomb.classList.toggle('urgent', t < 10);
  } else {
    D.hudBomb.style.display = 'none';
  }

  // 观战条
  const pDead = !p || p.dead;
  if (pDead) {
    let txt = '\u672c\u56de\u5408\u5df2\u7ed3\u675f';
    if (game.cyber && !game.cyber.ended) {
      const bots = game.entities.filter((e) => e.bot && !e.dead);
      if (bots.length) {
        const target = bots[game.spectateIdx % bots.length];
        txt = '\u89c2\u6218: ' + target.name + ' (' + (target.team === 't' ? 'T' : 'CT') + ') \u00b7 \u5de6\u952e\u5207\u6362';
      }
    } else {
      const mates = game.entities.filter((e) => e.team === p.team && !e.dead);
      if (mates.length) {
        const idx = game.spectateIdx % mates.length;
        txt = '\u89c2\u6218: ' + mates[idx].name + ' \u00b7 \u5de6\u952e\u5207\u6362';
      }
    }
    if (txt !== lastSpecKey) {
      lastSpecKey = txt;
      D.hudSpecText.textContent = txt;
    }
    D.hudSpectate.style.display = 'block';
  } else {
    D.hudSpectate.style.display = 'none';
  }
}
