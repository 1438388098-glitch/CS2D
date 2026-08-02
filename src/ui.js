import { WEAPONS, PRICES, MAPS } from './config.js';
import { ctx } from './ctx.js';
import { ACTIONS, getBindLabel, getBindCodes, bind, resetBinds } from './keymap.js';

let doc = null;
let canvas = null;
let game = null;
const els = {};
let buyOpen = false;
let sbOpen = false;
let paused = false;

function el(id) {
  return doc ? doc.getElementById(id) : null;
}

export function initUi(documentRef, canvasRef, gameRef) {
  doc = documentRef;
  canvas = canvasRef;
  game = gameRef;
  game.ui = createUiApi();
  bindBus();
  bindMenu();
  bindOverlays();
  bindSettings();
  return game.ui;
}

// 事件总线订阅（② 依赖方向反转：逻辑层 emit，UI 订阅渲染）
function bindBus() {
  const bus = ctx.bus;
  const api = game.ui;
  bus.on('killfeed', (p) => addKillFeed(p.k, p.v, p.w, p.head, p.tm));
  bus.on('sysfeed', (p) => addSysFeed(p.text));
  bus.on('toast', (p) => api.showToast(p.text));
  bus.on('streak', (p) => showKillStreak(p.n));
  bus.on('deathinfo', (p) => showDeathInfo(p.killer, p.weapon, p.head));
  bus.on('damagereport', (p) => showDmgReport(p.dmg, p.heads));
  bus.on('banner', (p) => api.showBanner(p.t1, p.t2, p.col));
  bus.on('bannerHide', () => uiHideBanner());
  bus.on('objtext', (p) => api.setObjText(p.main, p.sub));
  bus.on('objtextShow', () => { const ot = el('objtext'); if (ot) ot.style.display = 'block'; });
  bus.on('holdbar', (p) => api.setHoldBar(p.show, p.pct));
  bus.on('flash', (p) => { const f = el('flash'); if (f) f.style.opacity = p.opacity; });
  bus.on('dmg', (p) => { const d = el('dmgv'); if (d) d.style.opacity = p.opacity; });
  bus.on('lowhp', (p) => { const l = el('lowhp'); if (l) l.style.opacity = p.opacity; });
  bus.on('hideMenu', () => { const m = el('menu'); if (m) m.classList.remove('show'); });
  bus.on('hideEnd', () => { const e = el('end'); if (e) e.classList.remove('show'); });
  bus.on('closeBuy', () => {
    buyOpen = false;
    const b = el('buy');
    if (b) b.classList.remove('show');
  });
  bus.on('scoreboard', (p) => {
    sbOpen = p.open;
    const sb = el('scoreboard');
    if (sb) sb.classList.toggle('show', p.open);
    if (p.open) renderScoreboard(game);
  });
  bus.on('unpause', () => {
    paused = false;
    const pa = el('pause');
    if (pa) pa.classList.remove('show');
  });
  bus.on('refreshScoreboard', () => { if (sbOpen) renderScoreboard(game); });
  bus.on('buyUpdated', () => { if (buyOpen) renderBuyMenu(game); });
}

function createUiApi() {
  const noop = () => {};
  return {
    showBanner: (t1, t2, col) => {
      const b1 = el('ban1'), b2 = el('ban2'), b = el('banner');
      if (!b1 || !b2 || !b) return;
      b1.textContent = t1;
      b2.textContent = t2;
      b1.style.color = col;
      b.classList.add('show');
    },
    hideBanner: () => { const b = el('banner'); if (b) b.classList.remove('show'); },
    showToast: (t) => {
      const e = el('toast');
      if (!e) return;
      e.textContent = t;
      e.classList.add('show');
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => e.classList.remove('show'), 2600);
    },
    setFlashOpacity: (v) => { const f = el('flash'); if (f) f.style.opacity = v; },
    setDmgOpacity: (v) => { const d = el('dmgv'); if (d) d.style.opacity = v; },
    setLowHp: (v) => { const l = el('lowhp'); if (l) l.style.opacity = v; },
    setObjText: (main, sub) => {
      const o1 = el('obj1'), o2 = el('obj2');
      if (!o1) return;
      o1.textContent = main;
      o2.textContent = sub;
    },
    setHoldBar: (show, pct) => {
      const hb = el('holdbar'), hf = el('holdbarfill');
      if (!hb) return;
      hb.style.display = show ? 'block' : 'none';
      if (show && hf) hf.style.width = pct + '%';
    },
    showMenu: () => { el('menu') && el('menu').classList.add('show'); game.state = 'MENU'; game.over = false; const ot = el('objtext'); if (ot) ot.style.display = 'none'; uiHideBanner(); },
    hideMenu: () => el('menu') && el('menu').classList.remove('show'),
    hideEnd: () => el('end') && el('end').classList.remove('show'),
    showEnd: () => el('end') && el('end').classList.add('show'),
    pause: () => {
      paused = true; el('pause') && el('pause').classList.add('show');
    },
    unpause: () => {
      paused = false; el('pause') && el('pause').classList.remove('show');
    },
    isPaused: () => paused,
    openBuy: () => {
      if (game.state !== 'BUY') return;
      if (!game.player || game.player.dead) return;
      if (paused) return;
      buyOpen = true;
      el('buy') && el('buy').classList.add('show');
      renderBuyMenu(game);
    },
    closeBuy: () => {
      buyOpen = false; el('buy') && el('buy').classList.remove('show');
    },
    isBuyOpen: () => buyOpen,
    switchBuyCat: (n) => { if (buyOpen && BUY_CATS[n]) { buyCat = n; renderBuyMenu(game); } },
    toggleScoreboard: (open) => {
      sbOpen = open;
      el('scoreboard') && el('scoreboard').classList.toggle('show', open);
      if (open) renderScoreboard(game);
    },
    refreshBuy: () => renderBuyMenu(game),
    refreshScoreboard: () => { if (sbOpen) renderScoreboard(game); },
    isScoreboardOpen: () => sbOpen,
    showMatchEnd: (win, score, kd, mvp, stats) => {
      const f = el('endFinal');
      if (!f) return;
      f.textContent = win ? '胜利' : '败北';
      f.className = 'final ' + (win ? 'win' : 'lose');
      el('endScore').textContent = score;
      el('endKd').textContent = kd;
      el('endMvp').textContent = mvp;
      const box = el('endStats');
      if (box) {
        box.innerHTML = '';
        if (stats && (stats.hits !== undefined || stats.shots !== undefined || stats.headshots !== undefined || stats.bestWeapon !== undefined)) {
          let acc = stats.accuracy;
          if (acc === undefined && stats.shots) acc = stats.hits / stats.shots;
          if (acc !== undefined && isFinite(acc)) {
            if (acc > 0 && acc <= 1) acc = acc * 100;
            const l1 = doc.createElement('div');
            l1.className = 'stat-line';
            l1.innerHTML = '命中率 <b>' + Math.round(acc) + '%</b>';
            box.appendChild(l1);
          }
          const parts = [];
          if (stats.headshots !== undefined) parts.push('爆头 <b>' + stats.headshots + ' 个</b>');
          if (stats.bestWeapon) {
            const w = WEAPONS[stats.bestWeapon];
            parts.push('最佳武器 <b>' + (w ? w.name : stats.bestWeapon) + '</b>');
          }
          if (parts.length) {
            const l2 = doc.createElement('div');
            l2.className = 'stat-line';
            l2.innerHTML = parts.join(' · ');
            box.appendChild(l2);
          }
        }
      }
      el('end').classList.add('show');
      uiHideBanner();
    },
    showObjText: () => { const ot = el('objtext'); if (ot) ot.style.display = 'block'; },
    setMuteLabel: () => {
      const lab = el('muteLabel');
      if (lab) lab.textContent = isMuted() ? '关' : '开';
      const ic = doc && doc.querySelector('#muteBtn .ic use');
      if (ic) ic.setAttribute('href', 'assets/icons.svg#' + (isMuted() ? 'ic-volume-off' : 'ic-volume'));
    }
  };
}

let isMuted = () => false;
function setMutedFn(fn) { isMuted = fn; }

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uiHideBanner() {
  const b = el('banner');
  if (b) b.classList.remove('show');
}

export function addKillFeed(k, v, w, head, tm) {
  if (!doc) return;
  const div = doc.createElement('div');
  div.className = 'kf ' + (tm === 't' ? 't' : 'ct');
  const h = doc.createElement('span');
  h.className = 'kn';
  h.textContent = k;
  div.appendChild(h);
  const m = doc.createElement('span');
  m.className = 'w';
  m.textContent = w;
  div.appendChild(m);
  const v2 = doc.createElement('span');
  v2.textContent = v;
  div.appendChild(v2);
  if (head) {
    const hh = doc.createElement('span');
    hh.className = 'hs';
    hh.textContent = ' ☠';
    div.appendChild(hh);
  }
  const kf = el('killfeed');
  if (!kf) return;
  kf.appendChild(div);
  while (kf.children.length > 6) kf.removeChild(kf.firstChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
}

export function showDeathInfo(killerName, weaponName, headshot) {
  if (!doc) return;
  const e = el('deathinfo');
  if (!e) return;
  e.innerHTML = '你被 ' + esc(killerName || '?') + ' 用 ' + esc(weaponName || '未知武器') + ' 击杀';
  if (headshot) {
    const s = doc.createElement('span');
    s.className = 'hs';
    s.textContent = ' 爆头';
    e.appendChild(s);
  }
  e.classList.remove('show');
  void e.offsetWidth;
  e.classList.add('show');
  clearTimeout(showDeathInfo._t);
  showDeathInfo._t = setTimeout(() => e.classList.remove('show'), 2500);
}

// 伤害报告：死亡时展示本回合造成的总伤害与爆头数
export function showDmgReport(dmg, heads) {
  if (!doc) return;
  const e = el('dmgreport');
  if (!e) return;
  e.textContent = '本回合造成 ' + dmg + ' 伤害' + (heads > 0 ? '（' + heads + ' 爆头）' : '');
  e.classList.remove('show');
  void e.offsetWidth;
  e.classList.add('show');
  clearTimeout(showDmgReport._t);
  showDmgReport._t = setTimeout(() => e.classList.remove('show'), 2500);
}

const STREAK_TEXTS = {
  2: ['双杀', 'DOUBLE KILL'],
  3: ['三杀', 'TRIPLE KILL'],
  4: ['四杀', 'QUAD KILL']
};

export function showKillStreak(n) {
  if (!doc) return;
  const e = el('streak');
  if (!e) return;
  const t = n >= 5 ? ['五杀+', 'RAMPAGE'] : STREAK_TEXTS[n];
  if (!t) return;
  const s1 = e.querySelector('.s1');
  const s2 = e.querySelector('.s2');
  if (!s1 || !s2) return;
  s1.textContent = t[0];
  s2.textContent = t[1];
  e.classList.remove('show');
  void e.offsetWidth;
  e.classList.add('show');
  clearTimeout(showKillStreak._t);
  showKillStreak._t = setTimeout(() => e.classList.remove('show'), 2000);
}

export function addSysFeed(txt) {
  if (!doc) return;
  const div = doc.createElement('div');
  div.className = 'kf sys';
  div.textContent = txt;
  const kf = el('killfeed');
  if (!kf) return;
  kf.appendChild(div);
  while (kf.children.length > 6) kf.removeChild(kf.firstChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
}

export function showToast(t) {
  const api = game && game.ui;
  if (api) api.showToast(t);
}

export function showHitMarker(game, dur) {
  game.hitMarkT = dur;
}

let buyCat = 0;

const BUY_ICON = {
  ak: 'ic-ak', m4: 'ic-m4', famas: 'ic-rifle', mac10: 'ic-mac10', mp9: 'ic-mp9', p90: 'ic-p90',
  xm: 'ic-xm', awp: 'ic-awp', p250: 'ic-p250', deagle: 'ic-deagle', glock: 'ic-p250', usp: 'ic-p250',
  knife: 'ic-knife-w', armor: 'ic-shield', helm: 'ic-helm', kit: 'ic-kit',
  he: 'ic-grenade', flash: 'ic-flash', smoke: 'ic-smoke'
};

const BUY_CATS = [
  { label: '手枪', items: [['p250', 'P250', '半自动'], ['deagle', '沙漠之鹰', '大口径半自动']] },
  { label: '冲锋枪', items: [['mac10', 'MAC-10', 'T 专用 · 全自动'], ['mp9', 'MP9', 'CT 专用 · 全自动'], ['p90', 'P90', '全自动 · 50 发']] },
  { label: '霰弹枪', items: [['xm', 'XM1014', '8 弹丸 · 近战']] },
  { label: '步枪', items: [['ak', 'AK-47', 'T 专用 · 全自动'], ['m4', 'M4A4', 'CT 专用 · 全自动']] },
  { label: '狙击枪', items: [['awp', 'AWP', '开镜 · 一枪致命']] },
  { label: '装备', items: [['armor', '防弹衣', '50% 减伤'], ['helm', '防弹衣+头盔', '防爆头'], ['kit', '拆弹钳', '拆弹减半']] },
  { label: '投掷物', items: [['he', '高爆手雷', '范围伤害'], ['flash', '闪光弹', '致盲敌人'], ['smoke', '烟雾弹', '遮挡视线']] }
];

function buyCatPrice() {
  return { armor: PRICES.ARMOR, helm: PRICES.HELM, kit: PRICES.KIT, he: PRICES.HE, flash: PRICES.FLASH, smoke: PRICES.SMOKE };
}

export function renderBuyMenu(gameRef) {
  if (!buyOpen) return;
  const p = gameRef.player;
  el('buyCash').textContent = '$' + p.money;
  el('buyTime').textContent = Math.max(0, gameRef.buyTime).toFixed(1) + 's';
  // 分类竖列
  const cats = el('buyCats');
  cats.innerHTML = '';
  BUY_CATS.forEach((cat, i) => {
    const b = doc.createElement('button');
    b.className = 'buy-cat' + (i === buyCat ? ' sel' : '');
    b.innerHTML = '<b>' + (i + 1) + '</b>' + cat.label;
    b.onclick = () => { buyCat = i; renderBuyMenu(gameRef); };
    cats.appendChild(b);
  });
  const grid = el('buyGrid');
  grid.innerHTML = '';
  const catPrice = buyCatPrice();
  const catFaction = { ak: 't', mac10: 't', m4: 'ct', mp9: 'ct' };
  for (const it of BUY_CATS[buyCat].items) {
    const id = it[0], nm = it[1], desc = it[2];
    const pr = catPrice[id] !== undefined ? catPrice[id] : (WEAPONS[id] ? WEAPONS[id].price : 0);
    const div = doc.createElement('div');
    div.className = 'bi';
    let owned = false;
    if (id === 'armor') owned = p.armor >= 100;
    else if (id === 'helm') owned = p.helmet || p.armor >= 100;
    else if (id === 'kit') owned = p.weapons.kit;
    else if (id === 'he' || id === 'flash' || id === 'smoke') owned = p.weapons.nades[id] >= (id === 'flash' ? 2 : 1);
    else owned = p.weapons.primary === id;
    const fac = catFaction[id];
    const locked = fac && fac !== p.team && !owned;
    if (owned) div.classList.add('owned');
    if (locked) div.classList.add('disabled');
    const ic = doc.createElement('svg');
    ic.className = 'bic';
    ic.innerHTML = '<use href="assets/icons.svg#' + (BUY_ICON[id] || 'ic-p250') + '"/>';
    const bn = doc.createElement('div');
    bn.className = 'bn';
    bn.innerHTML = '<b>' + esc(nm) + '</b><small>' + (owned ? '<span class="own">✓ 已拥有</span>' : (locked ? '仅 ' + (fac === 't' ? 'T' : 'CT') + ' 可用' : esc(desc))) + '</small>';
    const bp = doc.createElement('div');
    bp.className = 'bp' + (p.money < pr && !owned ? ' off' : '');
    bp.textContent = '$' + pr;
    if (locked) {
      const lk = doc.createElement('span');
      lk.className = 'lk';
      lk.textContent = '🔒';
      bp.appendChild(lk);
    }
    div.appendChild(ic);
    div.appendChild(bn);
    div.appendChild(bp);
    if (!locked) div.onclick = () => {
      buyItem(game, id);
      div.classList.add('flash');
      setTimeout(() => div.classList.remove('flash'), 260);
    };
    grid.appendChild(div);
  }
}

export function switchBuyCat(n) {
  if (!buyOpen || !BUY_CATS[n]) return;
  buyCat = n;
  renderBuyMenu(game);
}

let lastSbRender = 0;

const SB_ICON = {
  ak: 'ic-ak', m4: 'ic-m4', famas: 'ic-rifle', mac10: 'ic-mac10', mp9: 'ic-mp9', p90: 'ic-p90',
  xm: 'ic-xm', awp: 'ic-awp', p250: 'ic-p250', deagle: 'ic-deagle', glock: 'ic-p250', usp: 'ic-p250',
  knife: 'ic-knife-w'
};

function renderScoreboard(gameRef) {
  const now = performance.now();
  if (now - lastSbRender < 250) return;
  lastSbRender = now;
  const body = el('sbBody');
  body.innerHTML = '';
  const maxKills = gameRef.entities.reduce((a, e) => Math.max(a, e.kills), 0);
  for (const tm of ['t', 'ct']) {
    const players = gameRef.entities.filter((e) => e.team === tm);
    players.sort((a, b) => b.kills - a.kills);
    for (const e of players) {
      const tr = doc.createElement('tr');
      const self = e === gameRef.player;
      if (self) tr.className = 'self';
      const td1 = doc.createElement('td');
      const nm = doc.createElement('span');
      nm.textContent = self ? '你 (' + e.name + ')' : e.name;
      nm.className = tm === 't' ? 'tname' : 'cname';
      td1.appendChild(nm);
      if (e.kills > 0 && e.kills >= maxKills && maxKills > 0) {
        const star = doc.createElement('svg');
        star.className = 'mvp-ic';
        star.innerHTML = '<use href="assets/icons.svg#ic-star"/>';
        td1.appendChild(star);
        tr.classList.add('mvp');
      }
      tr.appendChild(td1);
      const tdK = doc.createElement('td');
      tdK.className = 'num kcol';
      if (e.kills > 0) {
        const sk = doc.createElement('svg');
        sk.className = 'skull-ic';
        sk.innerHTML = '<use href="assets/icons.svg#ic-skull"/>';
        tdK.appendChild(sk);
      }
      const kn = doc.createElement('b');
      kn.textContent = e.kills;
      tdK.appendChild(kn);
      tr.appendChild(tdK);
      const tdD = doc.createElement('td');
      tdD.className = 'num';
      tdD.textContent = e.deaths;
      tr.appendChild(tdD);
      const tdA = doc.createElement('td');
      tdA.className = 'num';
      tdA.textContent = e.assists;
      tr.appendChild(tdA);
      const tdM = doc.createElement('td');
      tdM.className = 'num money';
      tdM.textContent = '$' + e.money;
      tr.appendChild(tdM);
      const tdW = doc.createElement('td');
      tdW.className = 'sb-w';
      const wk = e.weapons && e.weapons.primary ? e.weapons.primary : null;
      if (wk && SB_ICON[wk]) {
        const wi = doc.createElement('svg');
        wi.className = 'w-ic';
        wi.innerHTML = '<use href="assets/icons.svg#' + SB_ICON[wk] + '"/>';
        tdW.appendChild(wi);
      }
      const wn = doc.createElement('span');
      wn.className = 'w-name';
      wn.textContent = wk && WEAPONS[wk] ? WEAPONS[wk].name : '手枪';
      tdW.appendChild(wn);
      tr.appendChild(tdW);
      body.appendChild(tr);
    }
    const trow = doc.createElement('tr');
    const th = doc.createElement('td');
    th.textContent = tm === 't' ? 'T 方合计' : 'CT 方合计';
    th.className = tm === 't' ? 'tname' : 'cname';
    trow.appendChild(th);
    const totalK = players.reduce((a, e) => a + e.kills, 0);
    const totalD = players.reduce((a, e) => a + e.deaths, 0);
    for (const v of [totalK, totalD, '', '', '']) {
      const td = doc.createElement('td');
      td.className = 'num';
      td.textContent = v;
      trow.appendChild(td);
    }
    body.appendChild(trow);
  }
  el('sbScoreT').textContent = gameRef.score.T;
  el('sbScoreC').textContent = gameRef.score.CT;
  el('sbRound').textContent = '第 ' + gameRef.round + ' 回合';
  const mp = el('sbMapName');
  if (mp) {
    const mdef = gameRef.opts && MAPS ? MAPS.find((m) => m.id === gameRef.opts.mapId) : null;
    mp.textContent = mdef ? mdef.name : '';
  }
  // 回合历史条
  const rb = el('sbRounds');
  if (rb) {
    rb.innerHTML = '';
    const hist = (gameRef.winHistory || []).slice(-26);
    const total = 13;
    for (let row = 0; row < 2; row++) {
      const seg = doc.createElement('div');
      seg.className = 'sb-seg';
      for (let i = 0; i < total; i++) {
        const idx = row * total + i;
        const cell = doc.createElement('span');
        cell.className = 'rnd';
        if (idx < hist.length) {
          const w = hist[idx];
          cell.classList.add(w === 'T' ? 't' : w === 'C' ? 'c' : 'd');
          if (idx === hist.length - 1) cell.classList.add('cur');
        }
        seg.appendChild(cell);
      }
      rb.appendChild(seg);
    }
  }
}

import { setMuted, initAudio } from './audio.js';
import { startMatch } from './game.js';
import { buyItem } from './economy.js';

function bindMenu() {
  if (!doc) return;
  const teamCt = el('teamCt'), teamT = el('teamT');
  const diffN = el('diffN'), diffE = el('diffE'), diffH = el('diffH'), diffHell = el('diffHell');
  const botSel = el('botSel'), muteBtn = el('muteBtn'), startBtn = el('startBtn');
  teamCt.onclick = (e) => {
    game.opts.team = 'ct';
    teamCt.classList.add('sel');
    teamT.classList.remove('sel');
    e.currentTarget.blur();
  };
  teamT.onclick = (e) => {
    game.opts.team = 't';
    teamT.classList.add('sel');
    teamCt.classList.remove('sel');
    e.currentTarget.blur();
  };
  diffN.onclick = (e) => { game.opts.diff = 'normal'; pickDiff(diffN); showHellRow(false); e.currentTarget.blur(); };
  diffE.onclick = (e) => { game.opts.diff = 'easy'; pickDiff(diffE); showHellRow(false); e.currentTarget.blur(); };
  diffH.onclick = (e) => { game.opts.diff = 'hard'; pickDiff(diffH); showHellRow(false); e.currentTarget.blur(); };
  if (diffHell) diffHell.onclick = (e) => { game.opts.diff = 'hell'; pickDiff(diffHell); showHellRow(true); e.currentTarget.blur(); };
  function pickDiff(b) {
    for (const d of [diffN, diffE, diffH, diffHell]) d.classList.remove('sel');
    b.classList.add('sel');
  }
  // 地狱等级滑块（H1-H10）
  const hellRow = el('hellRow'), hellSlider = el('hellSlider'), hellVal = el('hellVal');
  const HELL_STYLE = ['H1 热手', 'H2 渐入', 'H3 冠军', 'H4 保枪纪律', 'H5 经济纪律', 'H6 闪光配合', 'H7 转点反制', 'H8 保守架点流', 'H9 主动控图流', 'H10 压迫前压流', 'H11 从零进化'];
  const showHellRow = (show) => { if (hellRow) hellRow.style.display = show ? 'flex' : 'none'; };
  if (hellSlider) {
    if (!game.opts.hellLevel) game.opts.hellLevel = 3;
    hellSlider.value = game.opts.hellLevel;
    hellVal.textContent = 'H' + game.opts.hellLevel + ' ' + HELL_STYLE[game.opts.hellLevel - 1];
    hellSlider.oninput = () => {
      game.opts.hellLevel = parseInt(hellSlider.value, 10);
      hellVal.textContent = 'H' + game.opts.hellLevel + ' ' + HELL_STYLE[game.opts.hellLevel - 1];
    };
    if (game.opts.diff === 'hell') showHellRow(true);
  }
  for (let i = 1; i <= 5; i++) {
    const b = doc.createElement('button');
    b.className = 'btn botc' + (i === 4 ? ' sel' : '');
    b.textContent = i + 'v' + i;
    b.onclick = (e) => {
      game.opts.bots = i;
      for (const c of botSel.children) c.classList.remove('sel');
      b.classList.add('sel');
      e.currentTarget.blur();
    };
    botSel.appendChild(b);
  }
  muteBtn.onclick = (e) => {
    setMuted(!isMuted());
    game.ui.setMuteLabel();
    e.currentTarget.blur();
  };
  const mapSel = el('mapSel');
  if (mapSel) {
    for (const c of mapSel.children) {
      c.onclick = (e) => {
        game.opts.mapId = c.getAttribute('data-map');
        for (const cc of mapSel.children) cc.classList.remove('sel');
        c.classList.add('sel');
        try { localStorage.setItem('cs2d_map', game.opts.mapId); } catch (err) { /* 无存储环境 */ }
        e.currentTarget.blur();
      };
    }
    const savedMap = (() => { try { return localStorage.getItem('cs2d_map'); } catch (err) { return null; } })();
    if (savedMap) game.opts.mapId = savedMap;
    for (const c of mapSel.children) c.classList.toggle('sel', c.getAttribute('data-map') === game.opts.mapId);
  }
  startBtn.onclick = (e) => {
    initAudio();
    startMatch(game);
    e.currentTarget.blur();
  };
}

function bindOverlays() {
  if (!doc) return;
  el('resumeBtn').onclick = (e) => { game.ui.unpause(); e.currentTarget.blur(); };
  el('restartBtn').onclick = (e) => { game.ui.unpause(); startMatch(game); e.currentTarget.blur(); };
  el('quitBtn').onclick = (e) => { game.ui.unpause(); game.ui.showMenu(); e.currentTarget.blur(); };
  el('againBtn').onclick = (e) => { game.ui.hideEnd(); startMatch(game); e.currentTarget.blur(); };
  el('endMenuBtn').onclick = (e) => { game.ui.hideEnd(); game.ui.showMenu(); e.currentTarget.blur(); };
  const helpBtn = el('helpBtn');
  const helpOverlay = el('helpOverlay');
  const helpClose = el('helpClose');
  if (helpBtn && helpOverlay) {
    helpBtn.onclick = () => { helpOverlay.classList.add('show'); };
    if (helpClose) helpClose.onclick = () => helpOverlay.classList.remove('show');
    helpOverlay.addEventListener('mousedown', (e) => {
      if (e.target === helpOverlay) helpOverlay.classList.remove('show');
    }, false);
  }
  const buyPanel = el('buy');
  buyPanel.addEventListener('mousedown', (e) => e.stopPropagation(), false);
  doc.addEventListener('mousedown', (e) => {
    if (buyOpen && !buyPanel.contains(e.target)) game.ui.closeBuy();
  }, false);
}

let bindTarget = null;
let bindBtn = null;

const AUDIO_STORE = 'cs2d_audio';
const AUDIO_DEFAULTS = { sfx: 1, ui: 0.8, amb: 0.6, mus: 0.5 };

export function getAudioPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_STORE);
    if (raw) {
      const p = JSON.parse(raw);
      const out = { ...AUDIO_DEFAULTS };
      for (const k of Object.keys(AUDIO_DEFAULTS)) {
        const v = Number(p[k]);
        if (isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
      }
      return out;
    }
  } catch (err) { /* 无存储环境 */ }
  return { ...AUDIO_DEFAULTS };
}

function saveAudioPrefs() {
  try { localStorage.setItem(AUDIO_STORE, JSON.stringify(getAudioPrefs())); } catch (err) { /* 忽略 */ }
}

// 设置面板：按键重绑定（点击按钮→按任意键→保存到 localStorage）
function bindSettings() {
  if (!doc) return;
  const settingsBtn = el('settingsBtn');
  const settings = el('settings');
  const settingsClose = el('settingsClose');
  const resetBtn = el('resetBinds');
  const listEl = el('keybindList');
  if (settingsBtn && settings) {
    settingsBtn.onclick = () => { settings.classList.add('show'); renderKeybindList(listEl); };
    settingsClose.onclick = () => {
      settings.classList.remove('show');
      cancelBindTarget();
    };
  }
  if (resetBtn) resetBtn.onclick = () => {
    resetBinds();
    renderKeybindList(listEl);
  };
  // 音量滑杆
  const prefs = getAudioPrefs();
  for (const s of doc.querySelectorAll('.vol-slider')) {
    const bus = s.getAttribute('data-bus');
    s.value = prefs[bus] !== undefined ? prefs[bus] : 1;
    s.addEventListener('input', () => {
      prefs[bus] = parseFloat(s.value);
      saveAudioPrefs();
      applyBusVolume(bus, prefs[bus]);
    });
  }
  // 绑定模式：捕获任意按键（Esc 取消）
  window.addEventListener('keydown', (e) => {
    if (!bindTarget) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { cancelBindTarget(); return; }
    bind(bindTarget, e.code);
    cancelBindTarget();
    renderKeybindList(listEl);
  }, true);
}

let applyBusVolume = (bus, v) => { /* Phase 4 注入 */ };
export function setBusVolumeHook(fn) { applyBusVolume = fn; }

function cancelBindTarget() {
  if (bindBtn) {
    bindBtn.textContent = getBindLabel(bindTarget);
    bindBtn.classList.remove('sel');
  }
  bindTarget = null;
  bindBtn = null;
}

function renderKeybindList(listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  const codes = {};
  for (const action of Object.keys(ACTIONS)) {
    for (const c of getBindCodes(action)) {
      if (!codes[c]) codes[c] = [];
      codes[c].push(action);
    }
  }
  const conflicts = Object.values(codes).filter((a) => a.length > 1);
  const conflictEl = el('bindConflict');
  if (conflictEl) {
    if (conflicts.length) {
      conflictEl.style.display = 'block';
      conflictEl.textContent = '按键冲突：' + conflicts
        .map((a) => a.map((x) => ACTIONS[x]).join(' 与 '))
        .join('；') + '（同键仅一项生效）';
    } else {
      conflictEl.style.display = 'none';
    }
  }
  for (const action of Object.keys(ACTIONS)) {
    const row = doc.createElement('div');
    row.className = 'row kb-row';
    const isConflict = (getBindCodes(action) || []).some((c) => (codes[c] || []).length > 1);
    if (isConflict) row.classList.add('conflict');
    const label = doc.createElement('label');
    label.textContent = ACTIONS[action];
    label.style.minWidth = '150px';
    const b = doc.createElement('button');
    b.className = 'btn small kb-btn';
    b.textContent = getBindLabel(action);
    b.onclick = () => {
      cancelBindTarget();
      bindTarget = action;
      bindBtn = b;
      b.textContent = '按任意键…（Esc 取消）';
      b.classList.add('sel');
    };
    row.appendChild(label);
    row.appendChild(b);
    listEl.appendChild(row);
  }
}

export function isBuyOpen() { return buyOpen; }
export function isScoreboardOpen() { return sbOpen; }
export function setMutedFnExposed(fn) { setMutedFn(fn); }

// 主菜单背景：三图缓存 + 6s 轮播（CSS cover 铺满，模糊压暗由 styles.css 处理）
const menuBgCache = {};
let menuBgTimer = null;
let menuBgIdx = 0;

export function setMenuBackgroundFromLayer(mapId, layer, w, h) {
  const m = el('menu');
  if (!m || !layer || !mapId) return;
  try {
    if (typeof doc === 'undefined' || !doc.createElement) return;
    const c = doc.createElement('canvas');
    const tw = 480;
    const th = Math.max(1, Math.round(480 * h / w));
    c.width = tw; c.height = th;
    c.getContext('2d').drawImage(layer, 0, 0, w, h, 0, 0, tw, th);
    if (typeof c.toDataURL !== 'function') return;
    menuBgCache[mapId] = c.toDataURL('image/jpeg', 0.72);
    if (Object.keys(menuBgCache).length === 1) {
      m.style.backgroundImage = 'url(' + menuBgCache[mapId] + ')';
    }
    startMenuBgRotate();
  } catch (err) { /* 无 canvas 环境忽略 */ }
}

function startMenuBgRotate() {
  if (menuBgTimer || Object.keys(menuBgCache).length < 2) return;
  const m = el('menu');
  if (!m) return;
  menuBgTimer = setInterval(() => {
    const ids = Object.keys(menuBgCache);
    if (ids.length < 2) return;
    menuBgIdx = (menuBgIdx + 1) % ids.length;
    m.style.backgroundImage = 'url(' + menuBgCache[ids[menuBgIdx]] + ')';
  }, 6000);
}

function drawMapPreview(mapId) {
  const cv = doc && doc.querySelector('.map-card[data-map="' + mapId + '"] .map-prev');
  if (!cv || !menuBgCache[mapId]) return;
  try {
    const img = new Image();
    img.onload = () => {
      const c2d = cv.getContext('2d');
      c2d.clearRect(0, 0, cv.width, cv.height);
      c2d.drawImage(img, 0, 0, cv.width, cv.height);
    };
    img.src = menuBgCache[mapId];
  } catch (err) { /* 忽略 */ }
}

export function refreshMapPreviews() {
  for (const id of Object.keys(menuBgCache)) drawMapPreview(id);
}
