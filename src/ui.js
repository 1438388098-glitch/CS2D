import { WEAPONS, PRICES, DROP_COL } from './config.js';
import { ctx } from './ctx.js';
import { ACTIONS, getBindLabel, bind, resetBinds, getSensitivity, setSensitivity } from './keymap.js';

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
    setMuteLabel: () => { const b = el('muteBtn'); if (b) b.textContent = isMuted() ? '关' : '开'; }
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

export function drawWeaponIcon(c, wid) {
  const w = WEAPONS[wid];
  if (!w) return;
  const cw = c.canvas.width, ch = c.canvas.height;
  c.clearRect(0, 0, cw, ch);
  c.save();
  c.translate(cw / 2, ch / 2 + 2);
  c.scale(cw / 56, ch / 34);
  const col = DROP_COL[w.kind] || '#ccc';
  const len = w.kind === 'sniper' ? 30 : (w.kind === 'rifle' ? 26 : (w.kind === 'smg' ? 24 : 22));
  c.fillStyle = '#20232a';
  c.fillRect(-len / 2, -3.5, len, 7);
  c.fillStyle = col;
  c.fillRect(-len / 2, -1.2, len, 2.4);
  c.fillStyle = '#dfe6ee';
  c.fillRect(-len / 2, -4.5, 4, 9);
  if (w.kind === 'sniper') {
    c.fillStyle = '#3a4150';
    c.fillRect(2, -5.5, 10, 4);
  }
  if (w.kind === 'shotgun') {
    c.fillStyle = '#3a4150';
    c.fillRect(-len / 2, 2.6, len - 6, 2.2);
  }
  c.restore();
}

export function renderBuyMenu(gameRef) {
  if (!buyOpen) return;
  const p = gameRef.player;
  el('buyCash').textContent = '$' + p.money;
  el('buyTime').textContent = Math.max(0, gameRef.buyTime).toFixed(1) + 's';
  const grid = el('buyGrid');
  grid.innerHTML = '';
  const catPrice = { armor: PRICES.ARMOR, helm: PRICES.HELM, kit: PRICES.KIT, he: PRICES.HE, flash: PRICES.FLASH, smoke: PRICES.SMOKE };
  const catFaction = { ak: 't', mac10: 't', m4: 'ct', mp9: 'ct' };
  const cats = [
    { label: '手枪', items: [['p250', 'P250', '半自动'], ['deagle', '沙漠之鹰', '大口径半自动']] },
    { label: '冲锋枪', items: [['mac10', 'MAC-10', 'T 专用 · 全自动'], ['mp9', 'MP9', 'CT 专用 · 全自动'], ['p90', 'P90', '全自动 · 50 发']] },
    { label: '霰弹枪', items: [['xm', 'XM1014', '8 弹丸 · 近战']] },
    { label: '步枪', items: [['ak', 'AK-47', 'T 专用 · 全自动'], ['m4', 'M4A4', 'CT 专用 · 全自动']] },
    { label: '狙击枪', items: [['awp', 'AWP', '开镜 · 一枪致命']] },
    { label: '装备', items: [['armor', '防弹衣', '50% 减伤'], ['helm', '防弹衣+头盔', '防爆头'], ['kit', '拆弹钳', '拆弹减半']] },
    { label: '投掷物', items: [['he', '高爆手雷', '范围伤害'], ['flash', '闪光弹', '致盲敌人'], ['smoke', '烟雾弹', '遮挡视线']] }
  ];
  for (const cat of cats) {
    const c = doc.createElement('div');
    c.className = 'cat';
    c.textContent = cat.label;
    grid.appendChild(c);
    for (const it of cat.items) {
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
      const ic = doc.createElement('canvas');
      ic.className = 'ic';
      ic.width = 56;
      ic.height = 34;
      if (WEAPONS[id]) drawWeaponIcon(ic.getContext('2d'), id);
      const bn = doc.createElement('div');
      bn.className = 'bn';
      bn.innerHTML = '<b>' + esc(nm) + '</b><small>' + (owned ? '<span class="own">✓ 已拥有</span>' : (locked ? '仅 ' + (fac === 't' ? 'T' : 'CT') + ' 可用' : esc(desc))) + '</small>';
      const bp = doc.createElement('div');
      bp.className = 'bp' + (p.money < pr && !owned ? ' off' : '');
      bp.textContent = '$' + pr;
      div.appendChild(ic);
      div.appendChild(bn);
      div.appendChild(bp);
      if (!locked) div.onclick = () => buyItemClick(id);
      grid.appendChild(div);
    }
  }
}

let lastSbRender = 0;

function renderScoreboard(gameRef) {
  const now = performance.now();
  if (now - lastSbRender < 250) return;
  lastSbRender = now;
  const body = el('sbBody');
  body.innerHTML = '';
  for (const tm of ['t', 'ct']) {
    const players = gameRef.entities.filter((e) => e.team === tm);
    players.sort((a, b) => b.kills - a.kills);
    for (const e of players) {
      const tr = doc.createElement('tr');
      const td1 = doc.createElement('td');
      td1.textContent = e === gameRef.player ? '你 (' + e.name + ')' : e.name;
      td1.className = tm === 't' ? 'tname' : 'cname';
      if (e === gameRef.player) td1.style.fontWeight = '700';
      tr.appendChild(td1);
      const vals = [e.kills, e.deaths, e.assists, e.money, e.weapons.primary ? WEAPONS[e.weapons.primary].name : '手枪'];
      for (const v of vals) {
        const td = doc.createElement('td');
        td.className = 'num';
        td.textContent = v;
        tr.appendChild(td);
      }
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
}

import { setMuted, initAudio } from './audio.js';
import { startMatch } from './game.js';
import { buyItem } from './economy.js';

function buyItemClick(id) {
  buyItem(game, id);
}

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
  diffN.onclick = (e) => { game.opts.diff = 'normal'; pickDiff(diffN); e.currentTarget.blur(); };
  diffE.onclick = (e) => { game.opts.diff = 'easy'; pickDiff(diffE); e.currentTarget.blur(); };
  diffH.onclick = (e) => { game.opts.diff = 'hard'; pickDiff(diffH); e.currentTarget.blur(); };
  if (diffHell) diffHell.onclick = (e) => { game.opts.diff = 'hell'; pickDiff(diffHell); e.currentTarget.blur(); };
  function pickDiff(b) {
    for (const d of [diffN, diffE, diffH, diffHell]) d.classList.remove('sel');
    b.classList.add('sel');
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
    muteBtn.textContent = isMuted() ? '关' : '开';
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
  const buyPanel = el('buy');
  buyPanel.addEventListener('mousedown', (e) => e.stopPropagation(), false);
  doc.addEventListener('mousedown', (e) => {
    if (buyOpen && !buyPanel.contains(e.target)) game.ui.closeBuy();
  }, false);
}

let bindTarget = null;
let bindBtn = null;

// 设置面板：灵敏度滑杆 + 按键重绑定（点击按钮→按任意键→保存到 localStorage）
function bindSettings() {
  if (!doc) return;
  const settingsBtn = el('settingsBtn');
  const settings = el('settings');
  const settingsClose = el('settingsClose');
  const sensRange = el('sensRange');
  const sensVal = el('sensVal');
  const resetBtn = el('resetBinds');
  const listEl = el('keybindList');
  if (settingsBtn && settings) {
    settingsBtn.onclick = () => { settings.classList.add('show'); renderKeybindList(listEl); };
    settingsClose.onclick = () => {
      settings.classList.remove('show');
      cancelBindTarget();
    };
  }
  if (sensRange && sensVal) {
    const sync = () => {
      const v = parseFloat(sensRange.value);
      game.opts.sensitivity = v;
      setSensitivity(v);
      sensVal.textContent = v.toFixed(2);
    };
    sensRange.value = String(getSensitivity());
    sync();
    sensRange.oninput = sync;
  }
  if (resetBtn) resetBtn.onclick = () => {
    resetBinds();
    game.opts.sensitivity = 1;
    if (sensRange) sensRange.value = '1';
    if (sensVal) sensVal.textContent = '1.00';
    renderKeybindList(listEl);
  };
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
  for (const action of Object.keys(ACTIONS)) {
    const row = doc.createElement('div');
    row.className = 'row';
    row.style.margin = '5px 0';
    const label = doc.createElement('label');
    label.textContent = ACTIONS[action];
    label.style.minWidth = '110px';
    const b = doc.createElement('button');
    b.className = 'btn small';
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

// 主菜单背景：当前地图静态层缩略图（CSS cover 铺满，模糊压暗由 styles.css 处理）
export function setMenuBackgroundFromLayer(layer, w, h) {
  const m = el('menu');
  if (!m || !layer) return;
  try {
    if (typeof doc === 'undefined' || !doc.createElement) return;
    const c = doc.createElement('canvas');
    const tw = 480;
    const th = Math.max(1, Math.round(480 * h / w));
    c.width = tw; c.height = th;
    c.getContext('2d').drawImage(layer, 0, 0, w, h, 0, 0, tw, th);
    if (typeof c.toDataURL !== 'function') return;
    m.style.backgroundImage = 'url(' + c.toDataURL('image/jpeg', 0.72) + ')';
  } catch (err) { /* 无 canvas 环境忽略 */ }
}
