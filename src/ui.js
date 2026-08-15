import { WEAPONS, PRICES, MAPS, ECONOMY, ROUND } from './config.js';
import { ctx } from './ctx.js';
import { ACTIONS, matches, getBindLabel, getBindCodes, bind, resetBinds } from './keymap.js';
import { setViewMode, requestFpsPointerLock, resizeCanvas } from './input.js';
import { readAudioPrefs, writeAudioPrefs } from './audio/prefs.js';
import { nextRoundBudget } from './economy.js';
import { formatPerfMonitor } from './perf-monitor.js';

let doc = null;
let canvas = null;
let game = null;
const els = {};
let buyOpen = false;
let sbOpen = false;
let paused = false;
let cyberConfirmArmed = false;

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
  syncMapCards();
  bindModeMenu();
  bindOverlays();
  bindSettings();
  setBusVolumeHook(setBusVolume);
  bindUiSfx();
  window.__openDuelPanel = openDuelPanel;
  return game.ui;
}

// UI 音效事件委托：按钮 hover/click
function bindUiSfx() {
  if (!doc) return;
  doc.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.btn, .map-card, .buy-cat, .bi, .mm-btn, .help-btn, .kb-btn')) uiHover();
  }, false);
  doc.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.btn, .map-card, .buy-cat, .help-btn, .mm-btn')) uiSfx('click', 0.3);
  }, false);
  const startBtn = el('startBtn');
  if (startBtn) startBtn.addEventListener('click', () => uiSfx('confirm', 0.6));
  const closeS = el('settingsClose');
  if (closeS) closeS.addEventListener('click', () => uiSfx('confirm', 0.6));
  const helpC = el('helpClose');
  if (helpC) helpC.addEventListener('click', () => uiSfx('confirm', 0.6));
  const resetB = el('resetBinds');
  if (resetB) resetB.addEventListener('click', () => uiSfx('confirm', 0.5));
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
    showMenu: () => {
      el('menu') && el('menu').classList.add('show');
      stopAmbient();
      game.state = 'MENU'; game.over = false; const ot = el('objtext'); if (ot) ot.style.display = 'none'; uiHideBanner();
      hideModePanels();
      renderModeSettings();
    },
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
      const majorNext = el('majorNextBtn');
      if (majorNext) {
        const isMajor = game.opts && game.opts.mode === 'major';
        const isCareer = game.opts && game.opts.mode === 'career';
        majorNext.style.display = (isMajor || isCareer) ? 'inline-flex' : 'none';
        majorNext.textContent = isCareer ? '返回生涯总部' : '返回 Major 战报';
        const againBtn = el('againBtn');
        if (againBtn) againBtn.style.display = isCareer ? 'none' : 'inline-flex';
      }
      const f = el('endFinal');
      if (!f) return;
      f.textContent = win ? '胜利' : '败北';
      f.className = 'final ' + (win ? 'win' : 'lose');
      el('endScore').textContent = score;
      el('endKd').textContent = kd;
      const mv = el('endMvp');
      mv.textContent = mvp;
      mv.className = 'mvp-line';
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
        // 数据小结四格
        const grid = el('endGrid');
        if (grid) {
          grid.innerHTML = '';
          const hsRate = stats && stats.headshots > 0 && stats.hits > 0 ? Math.round(stats.headshots / stats.hits * 100) : 0;
          const accPct = stats && stats.accuracy !== undefined
            ? Math.round((stats.accuracy > 1 ? stats.accuracy / 100 : stats.accuracy) * 100)
            : 0;
          const cells = [
            { ic: 'ic-skull', v: game.player.kills, l: '击杀' },
            { ic: 'ic-headshot', v: hsRate + '%', l: '爆头率' },
            { ic: 'ic-scope', v: accPct + '%', l: '命中率' },
            { ic: 'ic-step', v: game.player.assists, l: '助攻' }
          ];
          for (const c of cells) {
            const cell = doc.createElement('div');
            cell.className = 'eg-cell';
            cell.innerHTML = '<svg class="eg-ic"><use href="assets/icons.svg#' + c.ic + '"/></svg><b>' + c.v + '</b><small>' + c.l + '</small>';
            grid.appendChild(cell);
          }
        }
        // 比分柱状图
        const bars = el('endBars');
        if (bars) {
          bars.innerHTML = '';
          const tScore = game.score.T, cScore = game.score.CT;
          const maxV = Math.max(ROUND.MATCH_WIN, tScore, cScore);
          const rowT = doc.createElement('div');
          rowT.className = 'eb-row t';
          rowT.innerHTML = '<span class="eb-lab">T</span><div class="eb-track"><i style="width:' + (tScore / maxV * 100) + '%"></i></div><b>' + tScore + '</b>';
          const rowC = doc.createElement('div');
          rowC.className = 'eb-row c';
          rowC.innerHTML = '<span class="eb-lab">CT</span><div class="eb-track"><i style="width:' + (cScore / maxV * 100) + '%"></i></div><b>' + cScore + '</b>';
          bars.appendChild(rowT);
          bars.appendChild(rowC);
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
  // 死亡红闪
  const df = el('deathflash');
  if (df) {
    df.classList.remove('go');
    void df.offsetWidth;
    df.classList.add('go');
  }
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
  { label: '步枪', items: [['ak', 'AK-47', 'T 专用 · 全自动'], ['m4', 'M4A4', 'CT 专用 · 全自动'], ['famas', 'FAMAS', 'CT 专用 · 中间步枪']] },
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
  const ecoEl = el('buyEco');
  if (ecoEl) {
    const streakKey = p.team === 't' ? 'lossStreakT' : 'lossStreakCT';
    const streak = gameRef[streakKey] || 0;
    const budget = nextRoundBudget(p, gameRef);
    ecoEl.textContent = '连败补偿 ' + String.fromCharCode(36) + ECONOMY.LOSS_BONUS[Math.min(streak, ECONOMY.LOSS_BONUS.length - 1)] + ' · 当前 ' + streak + ' 连败 · 下局预算 胜 ' + String.fromCharCode(36) + budget.win + ' / 败 ' + String.fromCharCode(36) + budget.loss;
  }
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
    div.onclick = () => {
      const ok = buyItem(game, id);
      if (ok) {
        uiSfx('confirm', 0.5);
        div.classList.add('flash');
        setTimeout(() => div.classList.remove('flash'), 260);
      } else {
        uiSfx('error', 0.4);
        div.classList.add('deny');
        setTimeout(() => div.classList.remove('deny'), 180);
      }
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
    players.sort((a, b) => (b.dmgTotal || 0) - (a.dmgTotal || 0) || b.kills - a.kills);
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
      const tdDmg = doc.createElement('td');
      tdDmg.className = 'num dmg';
      tdDmg.textContent = Math.round(e.dmgTotal || 0);
      tr.appendChild(tdDmg);
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
    const totalDmg = players.reduce((a, e) => a + (e.dmgTotal || 0), 0);
    const totalD = players.reduce((a, e) => a + e.deaths, 0);
    for (const v of [totalK, Math.round(totalDmg), totalD, '', '', '']) {
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
    const total = ROUND.MATCH_WIN;
    const perRow = 13;
    const rows = Math.max(1, Math.ceil(total / perRow));
    for (let row = 0; row < rows; row++) {
      const seg = doc.createElement('div');
      seg.className = 'sb-seg';
      const cells = Math.min(perRow, total - row * perRow);
      for (let i = 0; i < cells; i++) {
        const idx = row * perRow + i;
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

import { setMuted, initAudio, uiSfx, setBusVolume, stopAmbient } from './audio.js';
import { startMatch } from './game.js';
import { buyItem } from './economy.js';
import { MAJOR_TEAMS, majorAction, CYBER_ROSTER, CYBER_START_COINS, CYBER_BAILOUT_COINS, CYBER_BAILOUT_AT, cyberCoins, cyberStats, cyberHistory, cyberChance, cyberPayout, parseCustomGroupList } from './modes.js';
import { OPPONENTS, getStats, resetDuel, pickDuelMap } from './duel.js';
import { DUEL_MAPS } from './duel-maps.js';

let lastHoverT = 0;

function uiHover() {
  const now = performance.now();
  if (now - lastHoverT < 40) return;
  lastHoverT = now;
  uiSfx('hover', 0.12);
}

function hideModePanels() {
  for (const id of ['majorPanel', 'lanPanel', 'editorOverlay', 'cyberPanel', 'careerPanel', 'duelPanel', 'managerPanel', 'managerMatchPanel']) {
    const p = el(id);
    if (p) p.style.display = 'none';
  }
  const mh = el('modeHud');
  if (mh) mh.style.display = 'none';
}

function renderModeSettings() {
  const box = el('modeSettings');
  if (!box) return;
  cyberConfirmArmed = false;
  const startBtn = el('startBtn');
  if (startBtn && startBtn.textContent !== '开 始 比 赛') startBtn.textContent = '开 始 比 赛';
  const mode = game.opts.mode || 'classic';
  if (mode === 'major') {
    if (!Array.isArray(MAJOR_TEAMS) || !MAJOR_TEAMS.length) {
      box.innerHTML = '<div class="mode-hint">战队数据未就绪，请刷新页面（Major 模式需要 48 队数据）。</div>';
      return;
    }
    let html = '<div class="mode-hint">选择你的 Major 战队：</div><select id="majorTeamSel">';
    for (const t of MAJOR_TEAMS) {
      html += '<option value="' + t.id + '"' + (game.opts.teamMajor === t.id ? ' selected' : '') + '>' + t.tag + ' · ' + t.name + ' · 强度 ' + t.rating + '</option>';
    }
    html += '</select>';
    const mg = game.opts.majorGroup = game.opts.majorGroup || { rule: 'seed', groupCount: 4, customGroups: [] };
    html += '<div class="mode-hint">预选赛自定义分组：</div><select id="majorGroupSel">'
      + '<option value="seed"' + (mg.rule === 'seed' ? ' selected' : '') + '>按种子蛇形（默认）</option>'
      + '<option value="region"' + (mg.rule === 'region' ? ' selected' : '') + '>按地区</option>'
      + '<option value="custom"' + (mg.rule === 'custom' ? ' selected' : '') + '>自定义名单</option>'
      + '</select>';
    html += '<textarea id="majorGroupsCustom" rows="4" placeholder="自定义分组名单：每行一组，组内用逗号/空格分隔队伍 id，如：&#10;spirit,g2,navi&#10;vitality,faze,mouz" style="display:' + (mg.rule === 'custom' ? 'block' : 'none') + '"></textarea>';
    box.innerHTML = html;
    const sel = el('majorTeamSel');
    if (sel) {
      if (!game.opts.teamMajor) game.opts.teamMajor = MAJOR_TEAMS[0].id;
      sel.value = game.opts.teamMajor;
      sel.onchange = () => { game.opts.teamMajor = sel.value; };
    }
    const gsel = el('majorGroupSel');
    const garea = el('majorGroupsCustom');
    const syncGroup = () => {
      const rule = gsel ? gsel.value : 'seed';
      mg.rule = rule;
      if (garea) garea.style.display = rule === 'custom' ? 'block' : 'none';
      mg.customGroups = rule === 'custom' ? parseCustomGroupList(garea ? garea.value : '') : [];
    };
    if (gsel) {
      gsel.value = mg.rule;
      gsel.onchange = syncGroup;
    }
    if (garea) {
      garea.value = Array.isArray(mg.customGroups) ? mg.customGroups.map((g) => g.join(',')).join('\n') : '';
      garea.oninput = () => { mg.customGroups = parseCustomGroupList(garea.value); };
      garea.style.display = mg.rule === 'custom' ? 'block' : 'none';
    }
  } else if (mode === 'lan') {
box.innerHTML = '<div class="mode-hint">房主创建房间，另一台设备输入房间码加入；连接后由房主开赛。</div>';
  } else if (mode === 'editor') {
box.innerHTML = '<div class="mode-hint">点击“开始”进入地图编辑器：左侧选择图块，画布绘制，右侧可保存/导出/试玩。</div>';
  } else if (mode === 'cyber') {
    const opts = game.opts.cyber = game.opts.cyber || {};
    const coins = cyberCoins();
    const history = cyberHistory().slice(0, 5);
    const stats = cyberStats();
    if (!opts.leftId) opts.leftId = CYBER_ROSTER[0].id;
    if (!opts.rightId) opts.rightId = CYBER_ROSTER[1].id;
    if (!opts.mapId) opts.mapId = 'dust2';
    if (!opts.bet) opts.bet = Math.min(100, Math.max(1, Math.floor(coins * 0.25)));
    if (opts.bet > Math.floor(coins * 0.25)) opts.bet = Math.max(1, Math.floor(coins * 0.25));
    if (!opts.side) opts.side = 'left';
    const teamHtml = (selId) => CYBER_ROSTER.map((c) => '<option value="' + c.id + '"' + (c.id === selId ? ' selected' : '') + '>' + c.tag + ' \u00b7 ' + c.name + ' \u00b7 ' + c.rating + '</option>').join('');
    const bombMapIds = MAPS.filter((m) => m.category === 'bomb5v5' && m.rows && m.id !== 'custom-map').map((m) => m.id);
    const mapHtml = (bombMapIds.length ? bombMapIds : ['dust2', 'metro']).map((id) => '<option value="' + id + '"' + (opts.mapId === id ? ' selected' : '') + '>' + id + '</option>').join('');
    const histHtml = history.length ? history.map((h) => '<div class="mode-hint">' + (h.draw ? '\u5e73\u5c40\u9000\u6b3e ' : (h.won ? '\u8d62 ' : '\u8f93 ')) + h.left + ' vs ' + h.right + ' \u00b7 ' + (h.payout || 0) + ' \u86d0\u86d0\u5e01</div>').join('') : '<div class="mode-hint">\u6682\u65e0\u5bf9\u5c40\u8bb0\u5f55</div>';
    const winRate = stats.played > 0 ? Math.round(stats.won / stats.played * 100) : 0;
    box.innerHTML = '<div class="mode-hint">\u4f59\u989d ' + coins + ' \u86d0\u86d0\u5e01 \u00b7 \u521d\u59cb ' + CYBER_START_COINS + ' \u00b7 \u7834\u4ea7\u4fdd\u62a4 \u4f4e\u4e8e ' + CYBER_BAILOUT_AT + ' \u81ea\u52a8\u8865 ' + CYBER_BAILOUT_COINS + ' \u00b7 \u603b\u573a\u6b21 ' + stats.played + ' \u00b7 \u80dc\u7387 ' + winRate + '% \u00b7 \u8fde\u80dc ' + (stats.streak || 0) + ' \u00b7 \u51c0\u6536\u76ca ' + (stats.net >= 0 ? '+' + stats.net : stats.net) + ' \u00b7 \u4e24\u4e2a\u804c\u4e1a\u6218\u961f AI \u5bf9\u6218\uff0c\u4e0b\u6ce8\u89c2\u6218\u3002</div>' +
      '<div class="cyber-pick"><label>\u5de6\u65b9\u6218\u961f</label><select id="cyberLeft">' + teamHtml(opts.leftId) + '</select></div>' +
      '<div class="cyber-pick"><label>\u53f3\u65b9\u6218\u961f</label><select id="cyberRight">' + teamHtml(opts.rightId) + '</select></div>' +
      '<div class="cyber-pick"><label>\u5730\u56fe</label><select id="cyberMap">' + mapHtml + '</select></div>' +
      '<div class="cyber-pick"><label>\u4e0b\u6ce8\u91d1\u989d</label><input id="cyberBet" type="number" min="1" max="' + Math.max(1, Math.floor(coins * 0.25)) + '" value="' + opts.bet + '"></div>' +
      '<div class="cyber-pick"><label>\u62bc\u6ce8\u65b9</label><select id="cyberSide"><option value="left"' + (opts.side === 'left' ? ' selected' : '') + '>\u5de6\u65b9</option><option value="right"' + (opts.side === 'right' ? ' selected' : '') + '>\u53f3\u65b9</option></select></div>' +
      '<div id="cyberOdds" class="mode-hint"></div><div id="cyberConfirmHint" class="mode-hint">\u70b9\u51fb\u201c\u5f00\u59cb\u6bd4\u8d5b\u201d\u540e\uff0c\u518d\u6b21\u70b9\u51fb\u786e\u8ba4\u4e0b\u6ce8\u3002</div><div class="mode-hint">\u6700\u8fd1\u8bb0\u5f55</div>' + histHtml;
    const leftSel = el('cyberLeft'), rightSel = el('cyberRight'), mapSel = el('cyberMap'), betIn = el('cyberBet'), sideSel = el('cyberSide');
    const oddsEl = el('cyberOdds');
    const resetCyberConfirm = () => {
      cyberConfirmArmed = false;
      const sb = el('startBtn');
      if (sb) sb.textContent = '开 始 比 赛';
      const hintEl = el('cyberConfirmHint');
      if (hintEl) hintEl.textContent = '点击“开始比赛”后，再次点击确认下注。';
    };
    const renderOdds = () => {
      if (!oddsEl) return;
      const l = CYBER_ROSTER.find((c) => c.id === opts.leftId) || CYBER_ROSTER[0];
      const r = CYBER_ROSTER.find((c) => c.id === opts.rightId) || CYBER_ROSTER[1];
      const bet = Math.max(1, Math.floor(Number(opts.bet) || 100));
      if (l.id === r.id) { oddsEl.textContent = '\u8bf7\u9009\u62e9\u4e24\u652f\u4e0d\u540c\u6218\u961f'; return; }
      const ch = opts.side === 'left' ? cyberChance(l, r) : 1 - cyberChance(l, r);
      const payout = cyberPayout(bet, ch);
      oddsEl.textContent = '\u80dc\u7387 ' + Math.round(ch * 100) + '% \u00b7 \u8d54\u7387 ' + (0.88 / Math.max(ch, 0.2)).toFixed(2) + 'x \u00b7 \u9884\u671f\u8fd4\u8fd8 ' + payout + ' \u86d0\u86d0\u5e01';
    };
    if (leftSel) leftSel.onchange = () => { opts.leftId = leftSel.value; resetCyberConfirm(); renderOdds(); };
    if (rightSel) rightSel.onchange = () => { opts.rightId = rightSel.value; resetCyberConfirm(); renderOdds(); };
    if (mapSel) mapSel.onchange = () => { opts.mapId = mapSel.value; resetCyberConfirm(); };
    if (betIn) betIn.onchange = () => { const cap = Math.max(1, Math.floor(coins * 0.25)); opts.bet = Math.min(cap, Math.max(1, Math.floor(Number(betIn.value) || 100))); resetCyberConfirm(); renderOdds(); };
    if (sideSel) sideSel.onchange = () => { opts.side = sideSel.value; resetCyberConfirm(); renderOdds(); };
    renderOdds();
  } else if (mode === 'duel') {
    box.innerHTML = '<div class="mode-hint">单挑模式：1v1 ' + ROUND.MATCH_WIN + ' 胜（BO' + (ROUND.MATCH_WIN * 2 - 1) + '），对手各有专属风格，可打专用小图或官方竞技图。点「开始比赛」进入配置面板。</div>';
  } else if (mode === 'career') {
box.innerHTML = '<div class="mode-hint">生涯模式：个人+战队，进入生涯总部管理赛季、训练与阵容。</div>';
  } else if (mode === 'manager') {
    box.innerHTML = '<div class="mode-hint">电竞经理：经营战队、转会训练、比赛 AI 实机观战。</div>';
  } else {
    box.innerHTML = '';
  }
}

// 单挑配置面板（全屏）：对手卡片 / 地图 / 难度 / 战绩 / 历史
function renderDuelPanel() {
  const body = el('duelBody');
  if (!body) return;
  const stats = getStats();
  const mapTitle = (id) => {
    if (id === 'auto') return '自动轮换';
    if (id === 'arena') return '官方竞技图';
    const dm = DUEL_MAPS.find((x) => x.id === id);
    if (dm) return dm.name;
    const m = MAPS.find((x) => x && x.id === id);
    return m ? (m.name || id) : (id || '');
  };
  const curOpp = game.opts.duelOpponent || OPPONENTS[0].name;
  if (!game.opts.duelOpponent) game.opts.duelOpponent = curOpp;
  if (!game.opts.duelMap) game.opts.duelMap = 'auto';
  if (!game.opts.duelDiff) game.opts.duelDiff = 'hard';
  const winRate = stats.played > 0 ? Math.round(stats.w / stats.played * 100) : 0;
  const oppCards = OPPONENTS.map((o) => {
    const v = stats.vs && stats.vs[o.name];
    const sel = curOpp === o.name ? ' sel' : '';
    const rec = v ? v.w + '胜 ' + v.l + '负' + (v.w + v.l > 0 ? ' · ' + Math.round(v.w / (v.w + v.l) * 100) + '%' : '') : '未交手';
    return '<button class="duel-opp-card' + sel + '" data-opp="' + o.name + '">' +
      '<span class="duel-opp-head"><b>' + o.name + '</b><i>' + o.tag + '</i></span>' +
      '<span class="duel-rating"><i style="width:' + o.rating + '%"></i></span>' +
      '<span class="duel-opp-foot"><em>' + o.style + '</em><small>' + rec + '</small></span></button>';
  }).join('');
  const mapChips = [['auto', '自动轮换'], ['arena', '官方竞技图']].concat(DUEL_MAPS.map((m) => [m.id, m.name])).map(([id, label]) => {
    return '<button class="duel-map-chip' + (game.opts.duelMap === id ? ' sel' : '') + '" data-map="' + id + '">' + label + '</button>';
  }).join('');
  const diffSeg = [['easy', '简单'], ['normal', '普通'], ['hard', '困难'], ['hell', '地狱']].map(([v, l]) => {
    return '<button class="duel-diff-btn' + (game.opts.duelDiff === v ? ' sel' : '') + '" data-diff="' + v + '">' + l + '</button>';
  }).join('');
  const nextId = pickDuelMap(game.opts.duelMap, stats.played);
  const mapHint = game.opts.duelMap === 'auto' ? '自动轮换：下一场 ' + mapTitle(nextId)
    : (game.opts.duelMap === 'arena' ? '官方竞技图：下一场 ' + mapTitle(nextId) : '已固定：' + mapTitle(game.opts.duelMap));
  const vsRows = Object.keys(stats.vs || {}).map((k) => {
    const v = stats.vs[k];
    const pct = v.w + v.l > 0 ? Math.round(v.w / (v.w + v.l) * 100) : 0;
    return '<div class="duel-vs-row"><span>' + k + '</span><span class="duel-winbar"><i style="width:' + pct + '%"></i></span><b>' + v.w + '胜 ' + v.l + '负 ' + pct + '%</b></div>';
  }).join('');
  const hist = stats.history.slice(0, 10).map((h) => '<div class="duel-hist-row"><span class="' + (h.win ? 'w' : 'l') + '">' + (h.win ? '胜' : '负') + '</span><span>' + h.kills + '杀 / ' + h.deaths + '死</span>' + (h.opp ? '<span>vs ' + h.opp + '</span>' : '') + '<span>' + mapTitle(h.map) + '</span></div>').join('') || '<div class="mode-hint">暂无比赛记录</div>';
  body.innerHTML =
    '<div class="duel-top"><h3>单挑模式</h3><span class="duel-sub">1v1 · ' + ROUND.MATCH_WIN + ' 胜（BO' + (ROUND.MATCH_WIN * 2 - 1) + '）· 第 ' + (Math.floor(ROUND.MATCH_WIN / 2) + 1) + ' 回合换边</span><button class="btn small" id="duelBackBtn">← 主菜单</button></div>' +
    '<div class="duel-body">' +
      '<div class="duel-section"><h5>选择对手</h5><div class="duel-opp-grid">' + oppCards + '</div></div>' +
      '<div class="duel-section"><h5>地图</h5><div class="duel-map-chips">' + mapChips + '</div><div class="mode-hint" id="duelMapHint">' + mapHint + '</div></div>' +
      '<div class="duel-section"><h5>难度</h5><div class="duel-diff-seg">' + diffSeg + '</div></div>' +
      '<div class="duel-section"><h5>战绩</h5><div class="duel-stat-panel"><div class="duel-stat-main"><b>' + stats.w + '</b><span>胜</span><em>' + stats.l + '</em><span>负</span></div><div class="duel-winbar"><i style="width:' + winRate + '%"></i></div><div class="duel-stat-sub">总场次 ' + stats.played + ' · 胜率 ' + winRate + '% · 连胜 ' + stats.streak + ' · 最佳 ' + stats.bestStreak + '</div></div></div>' +
      (vsRows ? '<div class="duel-section"><h5>对阵记录</h5>' + vsRows + '</div>' : '') +
      '<div class="duel-section"><h5>最近比赛</h5>' + hist + '</div>' +
    '</div>' +
    '<div class="duel-actions"><button class="btn small" id="duelResetBtn">重置战绩</button><button class="btn primary" id="duelStartBtn">开始比赛</button></div>';
  for (const c of body.querySelectorAll('.duel-opp-card')) c.onclick = () => { game.opts.duelOpponent = c.getAttribute('data-opp'); renderDuelPanel(); };
  for (const c of body.querySelectorAll('.duel-map-chip')) c.onclick = () => { game.opts.duelMap = c.getAttribute('data-map'); renderDuelPanel(); };
  for (const c of body.querySelectorAll('.duel-diff-btn')) c.onclick = () => { game.opts.duelDiff = c.getAttribute('data-diff'); renderDuelPanel(); };
  const back = body.querySelector('#duelBackBtn');
  if (back) back.onclick = () => closeDuelPanel();
  const reset = body.querySelector('#duelResetBtn');
  if (reset) reset.onclick = () => { if (window.confirm('确定重置单挑战绩？')) { resetDuel(); renderDuelPanel(); } };
  const start = body.querySelector('#duelStartBtn');
  if (start) start.onclick = () => {
    closeDuelPanel();
    initAudio();
    startMatch(game);
  };
}
function openDuelPanel() {
  const ov = el('duelPanel');
  const menu = el('menu');
  if (menu) menu.classList.remove('show');
  if (ov) ov.style.display = 'flex';
  renderDuelPanel();
}
function closeDuelPanel() {
  const ov = el('duelPanel');
  if (ov) ov.style.display = 'none';
  if (game.ui) game.ui.showMenu();
}

function bindModeMenu() {
  const modeSel = el('modeSel');
  if (!modeSel) return;
  const cards = modeSel.querySelectorAll('.mode-card');
  for (const c of cards) {
    c.onclick = (e) => {
      game.opts.mode = c.getAttribute('data-mode');
      for (const cc of cards) cc.classList.toggle('sel', cc === c);
      try { localStorage.setItem('cs2d_mode', game.opts.mode); } catch (err) { /* no storage */ }
      renderModeSettings();
      e.currentTarget.blur();
    };
  }
  const savedMode = (() => { try { return localStorage.getItem('cs2d_mode'); } catch (err) { return null; } })();
  if (savedMode) game.opts.mode = savedMode;
  for (const c of cards) c.classList.toggle('sel', c.getAttribute('data-mode') === game.opts.mode);
  renderModeSettings();
}

function bindMenu() {
  if (!doc) return;
  const teamCt = el('teamCt'), teamT = el('teamT');
  const diffN = el('diffN'), diffE = el('diffE'), diffH = el('diffH'), diffHell = el('diffHell');
  const muteBtn = el('muteBtn'), startBtn = el('startBtn');
  const tut = el('tutCheck');
  let tutorialShown = false;
  // 元素缺失时跳过对应绑定（防单点缺失拖垮整个菜单）
  if (!teamCt || !teamT) return;
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
  const HELL_STYLE = ['H1 热手', 'H2 渐入', 'H3 冠军', 'H4 保枪纪律', 'H5 经济纪律', 'H6 闪光配合', 'H7 转点反制', 'H8 保守架点流', 'H9 主动控图流', 'H10 压迫前压流', 'H11 从零进化', 'H12 团队配合流'];
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
  // 每队机器人：−/＋ 步进器（0-9）
  const botMinus = el('botMinus'), botPlus = el('botPlus'), botVal = el('botVal');
  const clampBots = (v) => Math.max(0, Math.min(9, Math.round(v)));
  let bots = clampBots(game.opts.bots === undefined ? 4 : game.opts.bots);
  if (botVal) {
    botVal.textContent = bots;
    const renderBots = () => { botVal.textContent = bots; };
    if (botMinus) botMinus.onclick = (e) => { bots = clampBots(bots - 1); renderBots(); game.opts.bots = bots; e.currentTarget.blur(); };
    if (botPlus) botPlus.onclick = (e) => { bots = clampBots(bots + 1); renderBots(); game.opts.bots = bots; e.currentTarget.blur(); };
  }
  if (muteBtn) muteBtn.onclick = (e) => {
    setMuted(!isMuted());
    game.ui.setMuteLabel();
    e.currentTarget.blur();
  };
  if (tut) {
    try { tut.checked = localStorage.getItem('cs2d_tutorial') !== '0'; } catch (err) { tut.checked = true; }
    tut.onchange = () => { try { localStorage.setItem('cs2d_tutorial', tut.checked ? '1' : '0'); } catch (err) { /* no storage */ } };
  }
  const fogCheck = el('fogCheck');
  if (fogCheck) {
    try {
      fogCheck.checked = localStorage.getItem('cs2d_fog') === '1';
    } catch (err) { fogCheck.checked = false; }
    game.opts.fog = fogCheck.checked;
    fogCheck.onchange = () => {
      game.opts.fog = fogCheck.checked;
      try { localStorage.setItem('cs2d_fog', fogCheck.checked ? '1' : '0'); } catch (err) { /* no storage */ }
    };
  }
  if (startBtn) startBtn.onclick = (e) => {
    initAudio();
    if (game.opts.mode === 'duel') {
      if (window.__openDuelPanel) window.__openDuelPanel();
      e.currentTarget.blur();
      return;
    }
    if (game.opts.mode === 'career') {
      if (window.__openCareer) window.__openCareer();
      e.currentTarget.blur();
      return;
    }
    if (game.opts.mode === 'manager') {
      if (window.__openManager) window.__openManager();
      e.currentTarget.blur();
      return;
    }
    if (game.opts.mode === 'editor') {
      if (window.__openMapEditor) window.__openMapEditor(game);
      e.currentTarget.blur();
      return;
    }
    if (game.opts.mode === 'lan') {
      const p = el('lanPanel');
      if (p) p.style.display = 'flex';
      el('menu') && el('menu').classList.remove('show');
      e.currentTarget.blur();
      return;
    }
    if (game.opts.mode === 'cyber') {
      const opts = game.opts.cyber = game.opts.cyber || {};
      const coins = cyberCoins();
      const cap = Math.max(1, Math.floor(coins * 0.25));
      const rawBet = el('cyberBet') ? Number(el('cyberBet').value) : Number(opts.bet);
      const bet = Math.max(1, Math.min(cap, Math.floor(rawBet) || 100));
      const left = CYBER_ROSTER.find((c) => c.id === opts.leftId);
      const right = CYBER_ROSTER.find((c) => c.id === opts.rightId);
      if (!left || !right || left.id === right.id) {
        showToast('请选择两支不同战队');
        uiSfx('error', 0.4);
        e.currentTarget.blur();
        return;
      }
      if (coins < 1) {
        showToast('蛐蛐币不足，结算后会触发破产保护');
        uiSfx('error', 0.4);
        e.currentTarget.blur();
        return;
      }
      opts.bet = bet;
      const side = opts.side === 'left' ? left.tag : right.tag;
      if (!cyberConfirmArmed) {
        cyberConfirmArmed = true;
        startBtn.textContent = '再次点击确认 · 押 ' + side + ' ' + bet + ' 蛐蛐币';
        const hintEl = el('cyberConfirmHint');
        if (hintEl) hintEl.textContent = '已预备下注，再次点击上方按钮确认开局；修改下注参数会取消确认。';
        uiSfx('confirm', 0.6);
        e.currentTarget.blur();
        return;
      }
      cyberConfirmArmed = false;
    }
    startMatch(game);
    if (tut && tut.checked && !tutorialShown) {
      const o = el('tutorialOverlay');
      if (o) o.classList.add('show');
      tutorialShown = true;
    }
    if (!(tut && tut.checked && !tutorialShown)) requestFpsPointerLock(game);
    e.currentTarget.blur();
  };
}

function bindOverlays() {
  if (!doc) return;
  el('resumeBtn').onclick = (e) => { game.ui.unpause(); requestFpsPointerLock(game); e.currentTarget.blur(); };
  const settingsPause = el('settingsBtnPause');
  if (settingsPause) settingsPause.onclick = (e) => {
    const settings = el('settings');
    if (settings) { settings.classList.add('show'); renderKeybindList(el('keybindList')); refreshViewSel(); }
    e.currentTarget.blur();
  };
  el('restartBtn').onclick = (e) => { game.ui.unpause(); startMatch(game); requestFpsPointerLock(game); e.currentTarget.blur(); };
  el('quitBtn').onclick = (e) => { game.ui.unpause(); game.ui.showMenu(); e.currentTarget.blur(); };
  el('againBtn').onclick = (e) => { game.ui.hideEnd(); startMatch(game); requestFpsPointerLock(game); e.currentTarget.blur(); };
  el('endMenuBtn').onclick = (e) => { game.ui.hideEnd(); game.ui.showMenu(); e.currentTarget.blur(); };
  const majorSim = el('majorSim');
  if (majorSim) majorSim.onclick = () => { majorAction(game, 'simRound'); };
  const majorMenu = el('majorMenu');
  if (majorMenu) majorMenu.onclick = () => { majorAction(game, 'menu'); };
  const majorNextBtn = el('majorNextBtn');
  if (majorNextBtn) majorNextBtn.onclick = () => {
    if (game.opts && game.opts.mode === 'career' && window.__careerEndMatch) window.__careerEndMatch(game);
    else majorAction(game, 'next');
  };
  const lanStartBtn = el('lanStartBtn');
  if (lanStartBtn && window.__lanStart) lanStartBtn.onclick = () => window.__lanStart();
  const editorClose = el('editorClose');
  if (editorClose && window.__closeMapEditor) editorClose.onclick = () => window.__closeMapEditor();
  const editorPlay = el('editorPlay');
  if (editorPlay && window.__playEditorMap) editorPlay.onclick = () => window.__playEditorMap();
  const editorSave = el('editorSave');
  if (editorSave && window.__saveEditorMap) editorSave.onclick = () => window.__saveEditorMap();

  const tutorialOverlay = el('tutorialOverlay');
  const tutorialClose = el('tutorialClose');
  if (tutorialOverlay) {
    const closeTutorial = () => tutorialOverlay.classList.remove('show');
    if (tutorialClose) tutorialClose.onclick = closeTutorial;
    tutorialOverlay.addEventListener('mousedown', (e) => {
      if (e.target === tutorialOverlay) closeTutorial();
    }, false);
    doc.addEventListener('mousedown', (e) => {
      if (tutorialOverlay.classList.contains('show') && !tutorialOverlay.querySelector('.panel').contains(e.target)) closeTutorial();
    }, false);
  }
  const helpBtn = el('helpBtn');
  const helpOverlay = el('helpOverlay');
  const helpClose = el('helpClose');
  if (helpBtn && helpOverlay) {
    const toggleHelp = (show) => {
      if (show) {
        if (doc && doc.pointerLockElement) doc.exitPointerLock();
        renderHelpBindings();
        helpOverlay.classList.add('show');
      } else {
        helpOverlay.classList.remove('show');
      }
    };
    helpBtn.onclick = () => toggleHelp(true);
    if (helpClose) helpClose.onclick = () => toggleHelp(false);
    helpOverlay.addEventListener('mousedown', (e) => {
      if (e.target === helpOverlay) toggleHelp(false);
    }, false);
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !matches(e.code, 'help')) return;
    const overlay = el('helpOverlay');
    if (!overlay) return;
    if (overlay.classList.contains('show')) {
      overlay.classList.remove('show');
    } else {
      if (doc && doc.pointerLockElement) doc.exitPointerLock();
      renderHelpBindings();
      overlay.classList.add('show');
    }
  }, false);
  const buyPanel = el('buy');
  buyPanel.addEventListener('mousedown', (e) => e.stopPropagation(), false);
  doc.addEventListener('mousedown', (e) => {
    if (buyOpen && !buyPanel.contains(e.target)) game.ui.closeBuy();
  }, false);
}

let bindTarget = null;
let bindBtn = null;

export function getAudioPrefs() {
  const prefs = readAudioPrefs(localStorage);
  writeAudioPrefs(prefs, localStorage);
  return prefs;
}

export function settingsRowMatches(text, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return String(text || '').toLowerCase().includes(q);
}

// 设置面板：按键重绑定（点击按钮→按任意键→保存到 localStorage）
function bindSettings() {
  if (!doc) return;
  const settingsBtn = el('settingsBtn');
  const settings = el('settings');
  const settingsClose = el('settingsClose');
  const searchEl = el('settingsSearch');
  const emptyEl = el('settingsEmpty');
  const resetBtn = el('resetBinds');
  const listEl = el('keybindList');
  const applySettingsFilter = () => {
    if (!settings) return;
    const q = searchEl ? searchEl.value : '';
    let any = false;
    for (const sec of settings.querySelectorAll('.settings-sec')) {
      const secHead = sec.querySelector('.sec-head');
      const secHit = settingsRowMatches(secHead ? secHead.textContent : '', q);
      let showSec = secHit;
      for (const row of sec.querySelectorAll('.row, .set-row')) {
        const hit = secHit || settingsRowMatches(row.textContent, q);
        row.style.display = hit ? '' : 'none';
        if (hit) showSec = true;
      }
      sec.style.display = showSec ? '' : 'none';
      if (showSec) any = true;
    }
    if (emptyEl) emptyEl.style.display = any ? 'none' : '';
  };
  if (settingsBtn && settings) {
    settingsBtn.onclick = () => {
      settings.classList.add('show');
      if (searchEl) searchEl.value = '';
      applySettingsFilter();
      renderKeybindList(listEl);
      refreshViewSel();
    };
    settingsClose.onclick = () => {
      settings.classList.remove('show');
      cancelBindTarget();
      if (searchEl) searchEl.value = '';
      applySettingsFilter();
    };
  }
  if (searchEl) searchEl.addEventListener('input', applySettingsFilter);
  if (resetBtn) resetBtn.onclick = () => {
    resetBinds();
    renderKeybindList(listEl);
    renderHelpBindings();
  };
  // 音量滑杆
  const prefs = getAudioPrefs();
  const sliders = typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('.vol-slider') : [];
  for (const s of sliders) {
    const bus = s.getAttribute('data-bus');
    s.value = prefs[bus] !== undefined ? prefs[bus] : 1;
    s.addEventListener('input', () => {
      const v = parseFloat(s.value);
      prefs[bus] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : prefs[bus];
      writeAudioPrefs(prefs, localStorage);
      applyBusVolume(bus, prefs[bus]);
    });
  }
  // 绑定模式：捕获任意按键（Esc 取消）
  window.addEventListener('keydown', (e) => {
    if (!bindTarget) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { cancelBindTarget(); return; }
    const okBind = bind(bindTarget, e.code);
    cancelBindTarget();
    renderKeybindList(listEl);
    renderHelpBindings();
    if (!okBind) { const st = el('editorStatus'); if (st) st.textContent = '该键已被其他操作使用'; }
  }, true);
  // 视角模式存档
  try {
    const fm = localStorage.getItem('cs2d_viewmode');
    if (fm === 'fps') game.viewMode = 'fps';
  } catch (err) { /* 无存储环境 */ }
  // 视角切换按钮
  const viewSel = el('viewModeSel');
  const refreshViewSel = () => {
    if (!viewSel) return;
    for (const b of viewSel.querySelectorAll('.set-btn')) {
      b.classList.toggle('sel', b.getAttribute('data-mode') === game.viewMode);
    }
  };
  if (viewSel) {
    viewSel.addEventListener('click', (e) => {
      const b = e.target.closest('.set-btn');
      if (!b) return;
      const mode = b.getAttribute('data-mode');
      if (mode !== 'fps' && mode !== 'top') return;
      setViewMode(game, mode);
      refreshViewSel();
      b.blur(); // 焦点落在按钮上：避免后续 Space/Enter 合成 click 意外切换视角
    }, false);
    refreshViewSel();
  }
  // 鼠标灵敏度滑杆（0.5-5 → 0.0005~0.005 rad/px；默认 2=0.002，360°≈3200px 接近主流 FPS 手感）
  const sensEl = el('fpsSens');
  const sensVal = el('fpsSensVal');
  if (sensEl) {
    try {
      const saved = parseFloat(localStorage.getItem('cs2d_fps_sens'));
      if (isFinite(saved)) game.fpsSens = Math.min(0.005, Math.max(0.0005, saved));
    } catch (err) { /* 无存储环境 */ }
    sensEl.value = Math.min(5, Math.max(0.5, game.fpsSens * 1000));
    if (sensVal) sensVal.textContent = (game.fpsSens * 1000).toFixed(1);
    sensEl.addEventListener('input', () => {
      game.fpsSens = parseFloat(sensEl.value) / 1000;
      if (sensVal) sensVal.textContent = (game.fpsSens * 1000).toFixed(1);
      try { localStorage.setItem('cs2d_fps_sens', String(game.fpsSens)); } catch (err) { /* 无存储环境 */ }
    });
  }
  // 垂直灵敏度滑杆（默认与水平灵敏度一致，独立存档）
  const sensYEl = el('fpsSensY');
  const sensYVal = el('fpsSensYVal');
  if (sensYEl) {
    try {
      const saved = parseFloat(localStorage.getItem('cs2d_fps_sens_y'));
      if (isFinite(saved)) game.fpsSensY = Math.min(0.005, Math.max(0.0005, saved));
    } catch (err) { /* 无存储环境 */ }
    const baseY = game.fpsSensY || game.fpsSens || 0.002;
    sensYEl.value = Math.min(5, Math.max(0.5, baseY * 1000));
    if (sensYVal) sensYVal.textContent = (baseY * 1000).toFixed(1);
    sensYEl.addEventListener('input', () => {
      game.fpsSensY = parseFloat(sensYEl.value) / 1000;
      if (sensYVal) sensYVal.textContent = (game.fpsSensY * 1000).toFixed(1);
      try { localStorage.setItem('cs2d_fps_sens_y', String(game.fpsSensY)); } catch (err) { /* 无存储 */ }
    });
  }
  // 反转 Y 轴
  const invertEl = el('invertY');
  if (invertEl) {
    try {
      if (localStorage.getItem('cs2d_invert_y') === '1') game.invertY = true;
    } catch (err) { /* 无存储 */ }
    invertEl.checked = !!game.invertY;
    invertEl.addEventListener('change', () => {
      game.invertY = invertEl.checked;
      try { localStorage.setItem('cs2d_invert_y', game.invertY ? '1' : '0'); } catch (err) { /* 无存储 */ }
    });
  }
  // 减少镜头动态（缓解眩晕）：关闭 bob/摆头/FOV 后坐踢/受击震动/镜内晃动
  const rmEl = el('reduceMotion');
  if (rmEl) {
    try {
      if (localStorage.getItem('cs2d_reduce_motion') === '1') game.opts.reduceMotion = true;
    } catch (err) { /* 无存储 */ }
    rmEl.checked = !!game.opts.reduceMotion;
    rmEl.addEventListener('change', () => {
      game.opts.reduceMotion = rmEl.checked;
      try { localStorage.setItem('cs2d_reduce_motion', rmEl.checked ? '1' : '0'); } catch (err) { /* 无存储 */ }
    });
  }
  // 视野 FOV 滑杆（70-110 → 弧度写入 game.fov）
  const fovEl = el('fovSel');
  const fovVal = el('fovSelVal');
  if (fovEl) {
    try {
      const saved = parseFloat(localStorage.getItem('cs2d_fov'));
      if (isFinite(saved) && saved >= 60 && saved <= 120) game.fov = saved * Math.PI / 180;
    } catch (err) { /* 无存储 */ }
    const deg = Math.round(((game.fov || Math.PI / 2) * 180 / Math.PI));
    fovEl.value = Math.min(110, Math.max(70, deg));
    if (fovVal) fovVal.textContent = deg + '°';
    fovEl.addEventListener('input', () => {
      const d = parseFloat(fovEl.value);
      game.fov = d * Math.PI / 180;
      if (fovVal) fovVal.textContent = d + '°';
      try { localStorage.setItem('cs2d_fov', String(d)); } catch (err) { /* 无存储 */ }
    });
  }
  // 3D 画质滑杆（55-100%，实时降低 Three.js 内部渲染分辨率）
  const qualityEl = el('renderQualitySel');
  const qualityVal = el('renderQualityVal');
  if (qualityEl) {
    try {
      const saved = parseFloat(localStorage.getItem('cs2d_render_quality'));
      if (isFinite(saved)) game.renderQuality = Math.max(0.55, Math.min(1, saved));
    } catch (err) { /* 无存储环境 */ }
    const q = (typeof game.renderQuality === 'number' && isFinite(game.renderQuality))
      ? Math.max(0.55, Math.min(1, game.renderQuality))
      : 1;
    qualityEl.value = String(Math.round(q * 100));
    if (qualityVal) qualityVal.textContent = Math.round(q * 100) + '%';
    qualityEl.addEventListener('input', () => {
      const next = Math.max(0.55, Math.min(1, parseInt(qualityEl.value, 10) / 100));
      game.renderQuality = next;
      if (qualityVal) qualityVal.textContent = Math.round(next * 100) + '%';
      try { localStorage.setItem('cs2d_render_quality', String(next)); } catch (err) { /* 无存储 */ }
    });
  }
  // DPR 上限滑杆（1x-2x，切换后立即重设画布尺寸）
  const dprEl = el('dprSel');
  const dprVal = el('dprSelVal');
  if (dprEl) {
    try {
      const saved = parseFloat(localStorage.getItem('cs2d_dpr_limit'));
      if (isFinite(saved)) game.dprLimit = Math.max(1, Math.min(2, saved));
    } catch (err) { /* 无存储环境 */ }
    const limit = (typeof game.dprLimit === 'number' && isFinite(game.dprLimit))
      ? Math.max(1, Math.min(2, game.dprLimit))
      : 2;
    game.dprLimit = limit;
    dprEl.value = String(limit * 100);
    if (dprVal) dprVal.textContent = Number(limit.toFixed(2)) + 'x';
    if (canvas) resizeCanvas(game, canvas);
    dprEl.addEventListener('input', () => {
      game.dprLimit = parseInt(dprEl.value, 10) / 100;
      if (canvas) resizeCanvas(game, canvas);
      if (dprVal) dprVal.textContent = Number(game.dprLimit.toFixed(2)) + 'x';
      try { localStorage.setItem('cs2d_dpr_limit', String(game.dprLimit)); } catch (err) { /* 无存储 */ }
    });
  }
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

export function renderHelpBindings() {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root) return;
  const box = root.getElementById('helpBinds');
  if (!box) return;
  const groups = [
    { actions: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'], label: '移动' },
    { actions: ['walk'], label: '静步' },
    { actions: ['reload'], label: '换弹' },
    { actions: ['interact'], label: '互动（装/拆/拾取）' },
    { actions: ['weaponPrimary', 'weaponSecondary', 'weaponKnife'], label: '武器切换' },
    { actions: ['nadeHe', 'nadeFlash', 'nadeSmoke'], label: '投掷（装备后左键投出，松键切回）' },
    { actions: ['orderFollow', 'orderSiteA', 'orderSiteB', 'orderHold'], label: '指挥队友' },
    { actions: ['buy'], label: '购买菜单' },
    { actions: ['scoreboard'], label: '记分板' },
    { actions: ['pause', 'mute'], label: '暂停 / 静音' },
    { actions: ['viewToggle'], label: '切换视角' },
    { actions: ['help'], label: '帮助' }
  ];
  box.innerHTML = groups.map((g) => {
    const keys = g.actions.map(getBindLabel).join(' / ');
    return '<div><b>' + esc(keys || '未绑定') + '</b> ' + esc(g.label) + '</div>';
  }).join('');
}

export function isBuyOpen() { return buyOpen; }
export function isScoreboardOpen() { return sbOpen; }
export function setMutedFnExposed(fn) { setMutedFn(fn); }

let perfUiT = 0;
export function updateFpsUi(game, force) {
  const perfEl = document.getElementById('perfMonitor');
  const el = document.getElementById('fpsHint');
  const now = performance.now();
  if (perfEl && (force || !perfEl.dataset.seen || now - perfUiT >= 250)) {
    perfEl.dataset.seen = '1';
    const stats = (window.__cs2d && window.__cs2d.stats) || null;
    const txt = formatPerfMonitor(stats, game);
    if (perfEl.textContent !== txt) {
      perfEl.textContent = txt;
    }
    perfUiT = now;
  }
  if (!el) return;
  const inMatch = game.state === 'LIVE' || game.state === 'BUY';
  if (game.viewMode === 'follow') {
    // 跟随视角提示：复用 fpsHint 位（指针未锁定，作为跟随视角操作提示）
    el.style.display = inMatch ? 'block' : 'none';
    if (!inMatch) return;
    const txt = game.player && game.player.dead
      ? '观战（俯视）：V 切换视角'
      : '个人视角：鼠标瞄准 · WASD 移动 · ←/→ 转向 · V 切换';
    if (el.textContent !== txt) el.textContent = txt;
    return;
  }
  const show = game.viewMode === 'fps' && inMatch;
  if (show) el.style.display = 'block'; else { el.style.display = 'none'; return; }
  if (game.player && game.player.dead) {
    if (el.textContent !== '观战：鼠标转视角 · 左键切换 · V 回俯视') el.textContent = '观战：鼠标转视角 · 左键切换 · V 回俯视';
    return;
  }
  const txt = '移动鼠标转向 · WASD 移动 · V 切换视角';
  if (el.textContent !== txt) el.textContent = txt;
}

// 主菜单背景：三图缓存 + 6s 轮播（CSS cover 铺满，模糊压暗由 styles.css 处理）
const menuBgCache = {};
const menuBgLayerCache = {};
let menuBgTimer = null;
let menuBgIdx = 0;

export function setMenuBackgroundFromLayer(mapId, layer, w, h) {
  const m = el('menu');
  if (!m || !layer || !mapId) return;
  menuBgLayerCache[mapId] = { layer, w, h };
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
    const nextId = ids[menuBgIdx];
    m.classList.add('switching');
    setTimeout(() => {
      m.style.backgroundImage = 'url(' + menuBgCache[nextId] + ')';
      requestAnimationFrame(() => m.classList.remove('switching'));
    }, 320);
  }, 6000);
}

function drawMapPreview(mapId) {
  const cv = doc && doc.getElementById('mapPreview');
  const src = menuBgLayerCache[mapId];
  if (!cv || !src) return;
  try {
    const c2d = cv.getContext('2d');
    c2d.clearRect(0, 0, cv.width, cv.height);
    c2d.drawImage(src.layer, 0, 0, src.w, src.h, 0, 0, cv.width, cv.height);
    const nameEl = doc.getElementById('mapPreviewName');
    if (nameEl) {
      const m = MAPS.find((x) => x && x.id === mapId);
      nameEl.textContent = (m && m.name ? m.name : mapId) + ' · ' + mapCardDescription(m);
    }
  } catch (err) { /* 忽略 */ }
}

export function refreshMapPreviews() {
  const sel = game && game.opts && game.opts.mapId;
  if (sel) drawMapPreview(sel);
}

function mapCardDescription(m) {
  if (m.tagline) return m.tagline;
  if (m.category === 'duel') return '1v1 单挑 · 专用竞技小图';
  if (m.category === 'custom') return '自定义地图 · 可在编辑器中继续修改';
  if (m.id === 'forge') return '熔炉中枢 · 三路交汇 · 快节奏';
  if (m.id === 'arctic') return '雪地主题变体 · 低能见度';
  return '经典爆破 · 5v5 战术地图';
}

export function syncMapCards() {
  if (!doc) return;
  const mapSel = doc.getElementById('mapSel');
  if (!mapSel) return;
  const savedMap = (() => { try { return localStorage.getItem('cs2d_map'); } catch (err) { return null; } })();
  let selected = game && game.opts && game.opts.mapId ? game.opts.mapId : (savedMap || 'dust2');
  const maps = MAPS.filter((m) => m && m.rows && Array.isArray(m.rows) && m.rows.length);
  const groups = [
    { key: 'bomb5v5', label: '5v5 爆破', test: (m) => m.category === 'bomb5v5' },
    { key: 'duel', label: '单挑竞技', test: (m) => m.category === 'duel' },
    { key: 'custom', label: '自定义地图', test: (m) => m.category === 'custom' || m.id === 'custom-map' }
  ];
  const available = maps.filter((m) => groups.some((g) => g.test(m)));
  if (!available.some((m) => m.id === selected)) {
    const firstBomb = available.find((m) => m.category === 'bomb5v5');
    selected = firstBomb ? firstBomb.id : (available[0] ? available[0].id : 'dust2');
  }
  mapSel.innerHTML = '';
  for (const group of groups) {
    const groupMaps = maps.filter(group.test);
    if (!groupMaps.length) continue;
    const title = doc.createElement('div');
    title.className = 'map-group-title';
    title.textContent = group.label;
    mapSel.appendChild(title);
    for (const m of groupMaps) {
      const btn = doc.createElement('button');
      btn.className = 'map-card' + (m.id === selected ? ' sel' : '');
      btn.setAttribute('data-map', m.id);
      const name = doc.createElement('span');
      name.className = 'mc-name';
      name.textContent = m.name || m.id;
      btn.appendChild(name);
      {
        const isCustom = m.category === 'custom' || m.id === 'custom-map';
        const edit = doc.createElement('span');
        edit.className = 'mc-edit';
        edit.textContent = isCustom ? '编辑' : '副本';
        edit.title = isCustom ? '在编辑器中修改此地图' : '复制到编辑器修改（另存为新图）';
        edit.setAttribute('role', 'button');
        edit.tabIndex = 0;
        edit.onclick = (e) => {
          e.stopPropagation();
          if (window.__openMapEditor) window.__openMapEditor(game, m.id);
        };
        btn.appendChild(edit);
      }
      btn.onclick = (e) => {
        if (game) game.opts.mapId = m.id;
        for (const cc of mapSel.querySelectorAll('.map-card')) cc.classList.remove('sel');
        btn.classList.add('sel');
        try { localStorage.setItem('cs2d_map', m.id); } catch (err) { /* 无存储环境 */ }
        refreshMapPreviews();
        if (btn.blur) btn.blur();
      };
      mapSel.appendChild(btn);
    }
  }
  if (game && game.opts && game.opts.mapId !== selected) game.opts.mapId = selected;
  refreshMapPreviews();
}
