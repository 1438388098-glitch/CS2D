import {
  loadRanked, getState, resetRanked, tierOf, divisionOf, tierLadder, startRankedMatch,
  rankedEndMatch, simulateRankedMatch, makePending, isStorageAvailable
} from './ranked.js';

let doc = null;
let game = null;

function el(id) { return doc ? doc.getElementById(id) : null; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(t) { if (game && game.ui) game.ui.showToast(t); }
const MAP_CN = { dust2: '沙漠遗址', canal: '运河小镇', metro: '地铁枢纽' };
function mapName(id) { return MAP_CN[id] || id; }

export function initRankedUi(documentRef, gameRef) {
  doc = documentRef;
  game = gameRef;
  const panel = el('rankedPanel');
  if (!panel) return;
  panel.addEventListener('click', onClick, false);
  window.__openRanked = openRanked;
  window.__rankedEndMatch = (g) => { const r = rankedEndMatch(g); if (r && r.ok) openRanked(); };
}

export function openRanked() {
  const s = loadRanked();
  if (!isStorageAvailable()) toast('排位进度不会保存');
  const panel = el('rankedPanel');
  if (!panel) return;
  panel.style.display = 'block';
  if (el('menu')) el('menu').classList.remove('show');
  if (el('end')) el('end').classList.remove('show');
  render();
}

function onClick(e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const act = t.getAttribute('data-act');
  if (act === 'menu') {
    const panel = el('rankedPanel');
    if (panel) panel.style.display = 'none';
    if (game.ui) game.ui.showMenu();
  } else if (act === 'reset') {
    if (typeof window !== 'undefined' && window.confirm('确定重置排位数据？')) {
      resetRanked();
      render();
    }
  } else if (act === 'play') {
    const panel = el('rankedPanel');
    if (panel) panel.style.display = 'none';
    startRankedMatch(game);
  } else if (act === 'sim') {
    const res = simulateRankedMatch();
    toast(res.ok ? (res.win ? '模拟胜利' : '模拟失利') + (res.placementDone ? '，定级完成' : '') : '模拟失败');
    render();
  }
}

function render() {
  const panel = el('rankedPanel');
  if (!panel) return;
  const s = loadRanked();
  const pending = makePending(s);
  const tier = s.player.mmr > 0 ? tierOf(s.player.mmr) : null;
  const division = s.player.mmr > 0 ? divisionOf(s.player.mmr, tier) : 0;
  const rankText = s.player.mmr > 0 ? tier.label + ' ' + division + ' 段' : '未定级';
  const winRate = s.player.stats.played ? Math.round(s.player.stats.w / s.player.stats.played * 100) : 0;

  let html = '<div class="ranked-top"><span class="rk-title">排位赛</span><span class="rk-sub">MMR ' + (s.player.mmr > 0 ? s.player.mmr : '定级中') + ' · ' + rankText + '</span><span class="rk-spacer"></span><button class="btn small" data-act="reset">重置</button><button class="btn small" data-act="menu">← 主菜单</button></div>';
  html += '<div class="ranked-body">';
  html += '<section class="rk-card rk-profile"><div class="rk-profile-main"><b>' + rankText + '</b><span>MMR ' + (s.player.mmr > 0 ? s.player.mmr : '—') + '</span></div><div class="rk-profile-stats">';
  if (s.player.placement.left > 0) {
    html += '<span>定级赛剩余 ' + s.player.placement.left + ' 场</span><span>定级胜场 ' + s.player.placement.wins + '</span>';
  } else {
    html += '<span>胜率 ' + winRate + '%</span><span>连胜 ' + s.player.stats.streak + ' · 最佳 ' + s.player.stats.bestStreak + '</span>';
  }
  html += '<span>场次 ' + s.player.stats.played + ' · ' + s.player.stats.w + '胜 ' + s.player.stats.l + '负</span>';
  html += '</div>' + tierLadderHtml(s) + '</section>';
  html += '<section class="rk-card rk-next"><h4>下一场排位</h4><p>对手 <b>' + esc(pending.oppName) + '</b> · 评级 ' + pending.oppMmr + '</p><p>地图 ' + esc(mapName(pending.mapId)) + '</p><div class="rk-actions"><button class="btn primary" data-act="play">开始排位</button><button class="btn" data-act="sim">模拟本场</button></div></section>';
  html += historyHtml(s);
  html += '</div>';
  panel.innerHTML = html;
}

function tierLadderHtml(s) {
  const tiers = tierLadder();
  const current = s.player.mmr > 0 ? tierOf(s.player.mmr).index : -1;
  let html = '<div class="rk-ladder">';
  tiers.forEach((t, i) => {
    const active = i === current;
    html += '<div class="rk-tier' + (active ? ' active' : '') + '"><span>' + t.label + '</span><i></i><b>' + t.min + (t.width ? ' - ' + (t.min + t.width) : '+') + '</b></div>';
  });
  return html + '</div>';
}

function historyHtml(s) {
  const h = s.player.history;
  let html = '<section class="rk-card rk-history"><h4>最近对局</h4>';
  if (!h.length) html += '<div class="rk-empty">暂无排位记录</div>';
  for (const m of h.slice(0, 12)) {
    const sign = m.delta >= 0 ? '+' : '';
    html += '<div class="rk-match ' + (m.win ? 'win' : 'lose') + '"><span>' + (m.win ? '胜' : '负') + '</span><b>' + esc(m.oppName) + '</b><i>' + esc(mapName(m.mapId)) + ' · ' + m.score[0] + ':' + m.score[1] + '</i><em>' + (m.placement ? '定级' : 'MMR ' + sign + m.delta) + (m.perf !== undefined && m.perf !== null ? ' · 评分 ' + m.perf : '') + '</em></div>';
  }
  return html + '</section>';
}