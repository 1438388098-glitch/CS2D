import {
  loadCareer, getState, titleFor, startCareerMatch, careerEndMatch, abandonPendingMatch, simulatePlayerMatch, resetCareer,
  train, sellPlayer, buyPlayer, candidates, nextSeason, seasonReport, nextMatch, nextMatchInfo, matchImportance, teamRecentForm,
  transferWindowOpen, isStorageAvailable, cupMap, trainingTiers, xpNeeded,
  seasonStats, seasonSeries, seasonStreaks, careerSummary,
  sponsorIncome, formBonus, fatiguePenalty, careerMorale, restPlayer, seasonGoals, seasonPace,
  achievementDefs, achievements, careerRecords
} from './career.js';

let doc = null;
let game = null;
let tab = 'dash';
let statsSeason = null;

function el(id) { return doc ? doc.getElementById(id) : null; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(t) { if (game && game.ui) game.ui.showToast(t); }
function money(n) { return Number(n || 0).toLocaleString('zh-CN'); }
function teamName(s, id) { const t = s.season.teams.find((x) => x.id === id); return t ? t.name : id; }
const ATTR_CN = { aim: '射击', move: '移速', react: '反应', nade: '道具' };
const CUP_CN = { QF: '八强', SF: '四强', F: '决赛' };
const MAP_CN = { dust2: '沙漠遗址', canal: '运河小镇', metro: '地铁枢纽' };
function cn(v, map) { return map[v] || v; }
function mapName(id) {
  const extra = { forge: '\u7194\u7089\u5de5\u574a', 'duel-pit': '\u6597\u6280\u5751', 'duel-alley': '\u6b8b\u5df7\u5bf9\u51b3', 'duel-forge': '\u7194\u7089\u5355\u6311' };
  return MAP_CN[id] || extra[id] || id;
}
function cupRoundLabel(n) { return n === 3 ? '冠军' : n === 2 ? '亚军' : n === 1 ? '四强' : n === 0 ? '八强' : '未参加'; }

export function initCareerUi(documentRef, gameRef) {
  doc = documentRef;
  game = gameRef;
  const panel = el('careerPanel');
  if (!panel) return;
  panel.addEventListener('click', onClick, false);
  window.__openCareer = openCareer;
  window.__careerEndMatch = (g) => { const r = careerEndMatch(g); if (r && r.ok) openCareer(); };
}

export function openCareer() {
  const s = loadCareer();
  if (!isStorageAvailable()) toast('生涯进度不会保存');
  const panel = el('careerPanel');
  if (!panel) return;
  panel.style.display = 'block';
  if (el('menu')) el('menu').classList.remove('show');
  if (el('end')) el('end').classList.remove('show');
  tab = s.season.cup.phase === 'finished' ? 'settlement' : 'dash';
  statsSeason = s.season.id;
  render();
}

function onClick(e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const act = t.getAttribute('data-act');
  if (act === 'tab') {
    tab = t.getAttribute('data-tab') || 'dash';
    render();
  } else if (act === 'reset') {
    if (typeof window !== 'undefined' && window.confirm('确定重新开始生涯？当前进度会被清空。')) {
      resetCareer();
      tab = 'dash';
      render();
    }
  } else if (act === 'menu') {
    const panel = el('careerPanel');
    if (panel) panel.style.display = 'none';
    if (game.ui) game.ui.showMenu();
  } else if (act === 'play') {
    const opp = t.getAttribute('data-opp');
    const venue = t.getAttribute('data-venue') || 'home';
    const cup = t.getAttribute('data-cup') === '1';
    const res = startCareerMatch(game, opp, venue, cup);
    if (res && res.ok === false) {
      toast(res.error || '无法开始比赛');
      return;
    }
    const panel = el('careerPanel');
    if (panel) panel.style.display = 'none';
  } else if (act === 'train') {
    const res = train(t.getAttribute('data-attr'), t.getAttribute('data-tier'));
    toast(res.ok ? '训练完成' : (res.error || '训练失败'));
    if (res.ok) render();
  } else if (act === 'rest') {
    const res = restPlayer();
    toast(res.ok ? '休息完成' : (res.error || '休息失败'));
    if (res.ok) render();
  } else if (act === 'sell') {
    const res = sellPlayer(t.getAttribute('data-id'));
    toast(res.ok ? '卖出成功' : (res.error || '卖出失败'));
    render();
  } else if (act === 'buy') {
    const res = buyPlayer(t.getAttribute('data-id'));
    toast(res.ok ? '买入成功' : (res.error || '买入失败'));
    render();
  } else if (act === 'continue') {
    const s = getState();
    const pm = s.pendingMatch;
    if (!pm) return;
    const res = startCareerMatch(game, pm.oppId, pm.venue, pm.isCup);
    if (res && res.ok === false) {
      toast(res.error || '无法继续比赛');
      return;
    }
    const panel = el('careerPanel');
    if (panel) panel.style.display = 'none';
  } else if (act === 'sim') {
    const res = simulatePlayerMatch();
    toast(res.ok ? (res.win ? '模拟胜利' : '模拟失利') : (res.error || '模拟失败'));
    render();
  } else if (act === 'abandon') {
    if (typeof window !== 'undefined' && !window.confirm('确定按 0:9 放弃本场？')) return;
    const res = abandonPendingMatch();
    toast(res.ok ? '已按 0:9 放弃本场' : (res.error || '无待处理比赛'));
    render();
  } else if (act === 'next-season') {
    const report = nextSeason();
    toast('第 ' + report.rank + ' 名 · 奖金 ' + money(report.prize) + ' · 新联赛 ' + getState().team.league);
    tab = 'dash';
    render();
  } else if (act === 's-season') {
    statsSeason = Number(t.getAttribute('data-season'));
    render();
  }
}

function render() {
  const panel = el('careerPanel');
  if (!panel) return;
  const s = loadCareer();
  const settlement = s.season.cup.phase === 'finished';
  const phase = s.season.cup.phase === 'active' ? ' · 杯赛' : (s.season.cup.phase === 'finished' ? ' · 杯赛结束' : '');
  let html = '<div class="career-top"><span class="ct-mode">生涯模式</span><span class="ct-season">第 ' + s.season.id + ' 赛季 · 第 ' + s.season.round + ' / ' + s.season.totalRounds + ' 轮' + phase + ' · ' + esc(s.team.league) + '</span><span class="ct-bank">资金 ' + money(s.team.bank) + '</span><button class="btn small" data-act="reset">重开生涯</button><button class="btn small" data-act="menu">← 主菜单</button></div>';
  html += '<div class="career-tabs">';
  const tabs = [['dash', '仪表盘'], ['schedule', '赛程'], ['training', '训练'], ['roster', '阵容'], ['standings', '排名'], ['cup', '杯赛'], ['finance', '财务'], ['stats', '赛季数据']];
  for (const [id, label] of tabs) {
    html += '<button class="career-tab' + (tab === id ? ' sel' : '') + '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
  }
  if (settlement) html += '<button class="career-tab sel" data-act="tab" data-tab="settlement">赛季结算</button>';
  html += '</div><div class="career-body">' + renderTab(s) + '</div>';
  panel.innerHTML = html;
}

function attrsBars(s) {
  return Object.entries(s.player.attrs).map(([k, v]) => '<div class="career-attr"><span>' + cn(k, ATTR_CN) + '</span><div class="career-bar"><i style="width:' + v + '%"></i></div><b>' + v + '</b></div>').join('');
}

function attrsRadar(attrs) {
  const keys = Object.keys(attrs);
  const cx = 80;
  const cy = 75;
  const r = 58;
  const point = (k, scale) => {
    const i = keys.indexOf(k);
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
    const val = Math.max(0, Math.min(1, (attrs[k] || 0) / 100 * scale));
    return (cx + Math.cos(angle) * r * val) + ',' + (cy + Math.sin(angle) * r * val);
  };
  const grid = [0.25, 0.5, 0.75, 1].map((s) => '<polygon points="' + keys.map((k) => point(k, s)).join(' ') + '" class="career-radar-grid"/>').join('');
  const axes = keys.map((k) => {
    const p = point(k, 1);
    return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p.split(',')[0] + '" y2="' + p.split(',')[1] + '"/>';
  }).join('');
  const labels = keys.map((k, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length;
    const x = Math.round(cx + Math.cos(angle) * (r + 14));
    const y = Math.round(cy + Math.sin(angle) * (r + 14) + 3);
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle">' + cn(k, ATTR_CN) + '</text>';
  }).join('');
  const poly = '<polygon points="' + keys.map((k) => point(k, 1)).join(' ') + '" class="career-radar-shape"/>';
  const dots = keys.map((k) => {
    const p = point(k, 1).split(',');
    return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6"/>';
  }).join('');
  const total = Object.values(attrs).reduce((a, b) => a + Number(b || 0), 0);
  const average = Math.round(total / Math.max(1, keys.length));
  return '<div class="career-radar-wrap"><svg class="career-radar" viewBox="0 0 160 150" role="img" aria-label="属性雷达图">' + grid + axes + poly + dots + labels + '</svg><div class="career-radar-summary"><b>' + average + '</b><span>综合能力</span></div></div>';
}

function renderDash(s) {
  const stats = s.player.seasonStats;
  const nm = nextMatch(s);
  const pending = s.pendingMatch;
  const goals = seasonGoals(s);
  const form = formBonus(s);
  const mor = careerMorale(s);
  const fat = Math.round(fatiguePenalty(s) * 100);
  let matchHtml = '<div class="career-card"><h4>下一场</h4>' + (transferWindowOpen(s) ? '<p class="career-window">转会窗开放 · 剩余 ' + s.team.transfersLeft + ' 次</p>' : '');
  if (pending) {
    const opp = s.season.teams.find((x) => x.id === pending.oppId);
    matchHtml += '<p>待结算：对阵 ' + esc(opp ? opp.name : pending.oppId) + (pending.isCup ? '（杯赛）' : '') + '</p>';
    matchHtml += '<div class="career-actions"><button class="btn primary small" data-act="continue">继续本场</button><button class="btn small" data-act="sim">模拟本场</button><button class="btn small" data-act="abandon">放弃本场</button></div>';
  } else if (nm) {
    const info = nextMatchInfo(s);
    const opp = info ? s.season.teams.find((x) => x.id === info.oppId) : null;
    const oppId = info ? info.oppId : (s.season.cup.phase === 'active' ? (nm.a === 'player' ? nm.b : nm.a) : (nm.home === 'player' ? nm.away : nm.home));
    const venue = info ? info.venue : (s.season.cup.phase === 'active' ? 'home' : (nm.home === 'player' ? 'home' : 'away'));
    matchHtml += '<p>对阵 <b>' + esc(info ? info.oppName : oppId) + '</b> · 评级 ' + (info && info.rating != null ? info.rating : '-') + (info ? ' · ' + info.threat : '') + ' · ' + (venue === 'home' ? '主场' : '客场') + ' · ' + esc(mapName((info && info.mapId) || (opp || {}).homeMap || '')) + (s.season.cup.phase === 'active' ? ' · 杯赛' : '') + '</p>';
    if (info) matchHtml += '<p class="career-scout">对手排名 ' + (info.rank || '-') + ' · 近 5 场 ' + (info.form || '暂无') + ' · 重要性 ' + info.importance + ' · 胜率预估待评级差' + '</p>';
    matchHtml += '<div class="career-actions"><button class="btn primary small" data-act="play" data-opp="' + oppId + '" data-venue="' + venue + '" data-cup="' + (s.season.cup.phase === 'active' ? '1' : '0') + '">开赛</button><button class="btn small" data-act="sim">模拟本场</button></div>';
  } else {
    matchHtml += '<p>' + (s.season.cup.phase === 'finished' ? '本赛季已结束' : (s.season.cup.phase === 'active' ? '杯赛已淘汰，等待赛季结算' : '当前轮次已打完')) + '</p>';
  }
  matchHtml += '</div>';
  const goalHtml = '<div class="career-card"><h4>赛季目标</h4><p>' + esc(s.team.league) + ' 目标：前 ' + goals.rankGoal + ' · 杯赛至少' + (goals.cupGoal === 0 ? '八强' : '四强') + ' · 奖励 ' + money(goals.reward) + '</p><p>当前排名 ' + goals.currentRank + ' · 杯赛 ' + (goals.currentCupRound === 3 ? '冠军' : goals.currentCupRound === 2 ? '亚军' : goals.currentCupRound === 1 ? '四强' : goals.currentCupRound === -1 ? '未决' : '八强') + (goals.achieved ? ' · 已达成' : '') + '</p></div>';
  const news = s.news.slice(0, 8).map((n) => '<div class="career-news ' + esc(n.type) + '">' + esc(n.text) + '</div>').join('') || '<div class="career-news">暂无事件</div>';
  const top = [...s.season.standings].sort((a, b) => b.pts - a.pts).slice(0, 5).map((x, i) => '<div class="career-row"><span>' + (i + 1) + '. ' + esc(teamName(s, x.teamId)) + '</span><b>' + x.pts + ' 分</b></div>').join('');
  return '<div class="career-grid2">' +
    '<div class="career-card"><h4>玩家档案</h4><div class="career-player"><b>' + esc(s.player.name) + '</b><span>' + esc(titleFor(s.player.level)) + ' 等级 ' + s.player.level + '</span></div><div class="career-xp">经验 ' + s.player.xp + ' / ' + xpNeeded(s.player.level) + '<div class="career-bar"><i style="width:' + Math.min(100, Math.round(s.player.xp / xpNeeded(s.player.level) * 100)) + '%"></i></div></div>' + attrsBars(s) +
    '<div class="career-stats"><span>状态 ' + (form >= 0 ? '+' : '') + form + ' · 士气 ' + mor + ' · 疲劳 ' + fat + '%</span><span>本赛季 ' + stats.played + ' 场 ' + stats.w + '胜' + stats.l + '负 · ' + stats.kills + ' 杀 / ' + stats.deaths + ' 死</span></div></div>' +
    matchHtml +
    goalHtml +
    '<div class="career-card"><h4>事件流</h4>' + news + '</div>' +
    '<div class="career-card"><h4>积分榜速览</h4>' + top + '</div>' +
    '</div>';
}

function renderSchedule(s) {
  let html = '<div class="career-card"><h4>联赛赛程</h4>';
  for (let r = 1; r <= s.season.totalRounds; r++) {
    const fs = s.season.fixtures.filter((f) => f.round === r);
    html += '<div class="career-round' + (r === s.season.round ? ' cur' : '') + '"><b>第 ' + r + ' 轮</b><div class="career-fixtures">';
    for (const f of fs) {
      const mine = f.home === 'player' || f.away === 'player';
      const oppId = f.home === 'player' ? f.away : f.home;
      html += '<div class="career-fixture' + (mine ? ' mine' : '') + '">';
      if (f.played) {
        html += esc(teamName(s, f.home)) + ' ' + f.score[0] + ' : ' + f.score[1] + ' ' + esc(teamName(s, f.away));
      } else if (mine && r === s.season.round) {
        const venue = f.home === 'player' ? 'home' : 'away';
        const mapId = venue === 'home' ? (s.season.teams.find((x) => x.id === 'player') || {}).homeMap : (s.season.teams.find((x) => x.id === oppId) || {}).homeMap;
        html += esc(teamName(s, f.home)) + ' 对 ' + esc(teamName(s, f.away)) + ' <span>地图 ' + esc(mapName(mapId || '')) + ' · ' + matchImportance(s, f) + '</span> <button class="btn small" data-act="play" data-opp="' + oppId + '" data-venue="' + venue + '" data-cup="0">开赛</button> <button class="btn small" data-act="sim">模拟本场</button>';
      } else {
        html += esc(teamName(s, f.home)) + ' 对 ' + esc(teamName(s, f.away)) + ' <span>第 ' + r + ' 轮开放</span>';
      }
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  if (s.season.cup.phase === 'active') {
    const m = nextMatch(s);
    if (m) {
      const oppId = m.a === 'player' ? m.b : m.a;
      html += '<div class="career-card"><h4>杯赛</h4><p>' + cn(m.round, CUP_CN) + '：对阵 ' + esc(teamName(s, oppId)) + ' · 地图 ' + esc(mapName(cupMap(s))) + '</p><div class="career-actions"><button class="btn primary small" data-act="play" data-opp="' + oppId + '" data-venue="home" data-cup="1">杯赛开赛</button><button class="btn small" data-act="sim">模拟本场</button></div></div>';
    }
  }
  return html;
}

function renderTraining(s) {
  const fat = Math.round(fatiguePenalty(s) * 100);
  let html = '<div class="career-card"><h4>训练课</h4><p>本轮剩余 ' + s.team.trainingLeft + ' 次 · 资金 ' + money(s.team.bank) + ' · 疲劳 ' + fat + '%</p>' + attrsRadar(s.player.attrs);
  html += '<div class="career-train-row"><b>恢复</b><button class="btn small"' + (s.team.rested ? ' disabled' : '') + ' data-act="rest">休息（疲劳清零）</button><span>' + (s.team.rested ? '本轮已休息' : '每轮最多一次') + '</span></div>';
  for (const [attr, v] of Object.entries(s.player.attrs)) {
    html += '<div class="career-train-row"><b>' + cn(attr, ATTR_CN) + ' (' + v + ')</b>';
    for (const tier of trainingTiers()) {
      const label = tier.label + ' ' + tier.cost + ' / +' + tier.points;
      const disabled = s.team.bank < tier.cost || s.team.trainingLeft <= 0 || v >= 100;
      html += '<button class="btn small"' + (disabled ? ' disabled' : '') + ' data-act="train" data-attr="' + attr + '" data-tier="' + tier.key + '">' + label + '</button>';
    }
    html += '</div>';
  }
  return html + '</div>';
}

function renderRoster(s) {
  const rosterAvg = s.team.roster.reduce((a, p) => a + p.rating, 0) / Math.max(1, s.team.roster.length);
  const attrs = s.player.attrs;
  const attrsAvg = (attrs.aim + attrs.move + attrs.react + attrs.nade) / 4;
  const teamRating = Math.round(rosterAvg * 0.8 + attrsAvg * 0.2);
  let html = '<div class="career-card"><h4>阵容 · 队伍评级 ' + teamRating + '</h4><div class="career-roster">';
  html += '<div class="career-player-card"><b>' + esc(s.player.name) + '</b><span>你 · ' + esc(titleFor(s.player.level)) + '</span><i>' + esc(s.team.name) + ' · 等级 ' + s.player.level + '</i></div>';
  for (const p of s.team.roster) {
    html += '<div class="career-player-card"><b>' + esc(p.name) + '</b><span>' + esc(p.role) + '</span><i>' + esc(p.team || s.team.name) + ' · 评级 ' + p.rating + ' · ' + money(p.price) + '</i>';
    if (transferWindowOpen(s) && s.team.transfersLeft > 0) html += '<button class="btn small" data-act="sell" data-id="' + p.id + '">卖出</button>';
    html += '</div>';
  }
  while (s.team.roster.length < 4) html += '<div class="career-player-card empty">空位 · 可在转会窗补入</div>';
  html += '</div></div>';
  if (transferWindowOpen(s)) {
    html += '<div class="career-card"><h4>转会窗 · 剩余 ' + s.team.transfersLeft + ' 次</h4><div class="career-pool">';
    const pool = candidates();
    if (pool.length) {
      for (const c of pool) {
        html += '<div class="career-player-card"><b>' + esc(c.name) + '</b><span>' + esc(c.role) + '</span><i>' + esc(c.team || '') + ' · 评级 ' + c.rating + ' · ' + money(c.price) + '</i>';
        if (s.team.bank >= c.price && s.team.transfersLeft > 0) html += '<button class="btn small" data-act="buy" data-id="' + c.id + '">买入</button>';
        html += '</div>';
      }
    } else {
      html += '<div class="career-news">候选已清空</div>';
    }
    html += '</div></div>';
  } else {
    const openIn = 5 - s.season.round;
    const winText = s.season.round < 5 ? '第 5 轮开放（还有 ' + openIn + ' 轮）' : (s.season.round <= 8 ? '第 5-8 轮开放' : '本赛季转会窗已关闭');
    html += '<div class="career-card"><h4>转会窗</h4><p>' + winText + '</p></div>';
  }
  return html;
}

function renderStandings(s) {
  const list = [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  const pace = seasonPace(s);
  let html = '<div class="career-card"><h4>积分榜</h4><div class="career-table">';
  html += '<div class="career-row head"><span>球队</span><b>场</b><b>胜</b><b>平</b><b>负</b><b>近5</b><b>分</b></div>';
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    const rank = i + 1;
    const promo = (s.team.league === '丙级' || s.team.league === '乙级') && rank <= 2;
    const releg = (s.team.league === '甲级' || s.team.league === '乙级') && rank >= 7;
    const cls = 'career-row' + (x.teamId === 'player' ? ' mine' : '') + (promo ? ' promo' : '') + (releg ? ' releg' : '');
    html += '<div class="' + cls + '"><span>' + esc(teamName(s, x.teamId)) + '</span><b>' + x.played + '</b><b>' + x.w + '</b><b>' + x.d + '</b><b>' + x.l + '</b><b>' + (teamRecentForm(s, x.teamId) || '-') + '</b><b>' + x.pts + '</b></div>';
  }
  return html + '</div><p>' + (pace.projected != null ? '玩家当前第 ' + pace.currentRank + ' · 剩余 ' + pace.remaining + ' 场 · 预测最终 ' + pace.projected + ' 分（预计第 ' + pace.projectedRank + '）' : '玩家当前第 ' + pace.currentRank + ' · 暂无足够赛果预测最终积分') + '</p><p>甲级第 7-8 名降乙；乙级第 1-2 名升甲、第 7-8 名降丙；丙级第 1-2 名升乙。</p></div>';
}

function renderCup(s) {
  const b = s.season.cup.bracket || [];
  if (!b.length) return '<div class="career-card"><h4>杯赛</h4><p>第 14 轮结束后进入。</p></div>';
  const names = (m, side) => {
    const id = side === 'a' ? m.a : m.b;
    if (!id) return '待定';
    return esc(teamName(s, id)) + (m.played && m.winner === id ? ' ✓' : '');
  };
  let html = '<div class="career-card"><h4>淘汰赛</h4>';
  for (const round of ['QF', 'SF', 'F']) {
    html += '<div class="career-cup-round"><b>' + cn(round, CUP_CN) + '</b>';
    for (const m of b.filter((x) => x.round === round)) {
      const mine = !m.played && (m.a === 'player' || m.b === 'player');
      html += '<div class="career-cup-match' + (mine ? ' mine' : '') + '">' + names(m, 'a') + ' 对 ' + names(m, 'b') + (m.played ? ' · ' + m.score[0] + ':' + m.score[1] : '');
      if (mine) {
        const opp = m.a === 'player' ? m.b : m.a;
        html += ' <span>地图 ' + esc(mapName(cupMap(s))) + '</span> <button class="btn small" data-act="play" data-opp="' + opp + '" data-venue="home" data-cup="1">开赛</button> <button class="btn small" data-act="sim">模拟本场</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  }
  return html + '</div><div class="career-card"><h4>奖金</h4><p>每场晋级奖 5000 · 冠军另奖 30000</p></div>';
}

function renderSettlement(s) {
  const r = seasonReport();
  const cupRoundText = cupRoundLabel(r.cupRound);
  const history = s.history.slice().reverse().map((h) => '<div class="career-history">第 ' + h.seasonId + ' 赛季 · ' + esc(h.league) + ' · 第 ' + h.rank + ' 名 · 杯赛 ' + cupRoundLabel(h.cupRound) + ' · 奖金 ' + money(h.prize) + '</div>').join('');
  return '<div class="career-card"><h4>赛季结算</h4><div class="career-settle"><span>联赛：' + esc(r.league) + ' · 第 ' + r.rank + ' 名</span><span>排名奖金：' + money(r.rankPrize) + '</span><span>杯赛：' + cupRoundText + ' · ' + money(r.cupPrize) + '</span><span>总奖金：' + money(r.prize) + '</span></div></div><div class="career-card"><h4>历史记录</h4>' + (history || '<div class="career-history">暂无</div>') + '</div><div class="career-card"><button class="btn primary" data-act="next-season">下一赛季</button></div>';
}

function renderFinance(s) {
  const ledger = Array.isArray(s.team.ledger) ? s.team.ledger : [];
  const sponsor = sponsorIncome(s);
  const income = ledger.reduce((a, x) => a + Math.max(0, x.amount || 0), 0);
  const expense = ledger.reduce((a, x) => a + Math.min(0, x.amount || 0), 0);
  const rows = ledger.slice().reverse().slice(0, 60).map((x) => '<div class="career-row"><span>' + esc(x.label || '') + '</span><b style="color:' + (x.amount >= 0 ? '#58d68d' : '#ff5d5d') + '">' + (x.amount >= 0 ? '+' : '') + money(x.amount) + '</b></div>').join('') || '<div class="career-news">暂无资金流水</div>';
  return '<div class="career-card"><h4>财务概览</h4><div class="career-kpis"><div class="career-kpi"><b>' + money(s.team.bank) + '</b><span>当前资金</span></div><div class="career-kpi"><b>' + money(income) + '</b><span>累计收入</span></div><div class="career-kpi"><b>' + money(expense) + '</b><span>累计支出</span></div><div class="career-kpi"><b>' + money(sponsor) + '</b><span>每场赞助预估</span></div></div></div>' +
    '<div class="career-card"><h4>资金流水</h4>' + rows + '</div>';
}

function renderSeasonStats(s) {
  const mh = Array.isArray(s.matchHistory) ? s.matchHistory : [];
  const seasonSet = new Set();
  for (const m of mh) if (m && m.seasonId != null) seasonSet.add(m.seasonId);
  seasonSet.add(s.season.id);
  const seasons = [...seasonSet].sort((a, b) => a - b);
  const sel = statsSeason != null && seasonSet.has(statsSeason) ? statsSeason : s.season.id;
  const stats = seasonStats(mh, sel);
  const series = seasonSeries(mh, sel);
  const streaks = seasonStreaks(series);
  const overview = careerSummary(mh);
  const rec = careerRecords(s);
  const achList = achievements(s);
  const selBtns = seasons.map((sid) => '<button class="btn small' + (sid === sel ? ' sel' : '') + '" data-act="s-season" data-season="' + sid + '">第 ' + sid + ' 赛季</button>').join('');
  const kpis = [['场次', stats.matches], ['胜 / 负', stats.wins + ' / ' + stats.losses], ['胜率', stats.winRate + '%'], ['K/D', stats.kd], ['场均伤害', stats.avgDmg], ['总奖金', money(stats.totalMoney)], ['总击杀', stats.kills], ['最佳场次', stats.mvp]];
  const kpiHtml = kpis.map(([k, v]) => '<div class="career-kpi"><b>' + v + '</b><span>' + k + '</span></div>').join('');
  const seriesHtml = series.length ? series.map((m, i) => {
    const label = '第 ' + (i + 1) + ' 场' + (m.isCup ? '（杯赛）' : '') + ' · ' + (m.win ? '胜' : '负') + ' · ' + m.kills + ' 杀 / ' + m.deaths + ' 死 · ' + money(m.money) + ' 奖金';
    return '<i class="' + (m.win ? 'win' : '') + (m.isCup ? ' cup' : '') + '" title="' + esc(label) + '" style="height:' + (6 + Math.min(18, m.kills * 2)) + 'px"></i>';
  }).join('') : '<div class="career-news">暂无比赛数据</div>';
  const ov = [['赛季数', overview.seasons], ['总场次', overview.matches], ['胜率', overview.winRate + '%'], ['K/D', overview.kd], ['场均伤害', overview.avgDmg], ['总奖金', money(overview.totalMoney)], ['总击杀', overview.kills]];
  const ovHtml = ov.map(([k, v]) => '<div class="career-kpi"><b>' + v + '</b><span>' + k + '</span></div>').join('');
  const recordHtml = '<div class="career-card"><h4>生涯纪录</h4><div class="career-kpis"><div class="career-kpi"><b>' + (rec.bestKills || 0) + '</b><span>单场最高击杀</span></div><div class="career-kpi"><b>' + (rec.longestWinStreak || 0) + '</b><span>最长连胜</span></div><div class="career-kpi"><b>' + money(rec.totalPrize || 0) + '</b><span>累计奖金</span></div><div class="career-kpi"><b>' + (rec.cupChampions || 0) + '</b><span>杯赛冠军</span></div><div class="career-kpi"><b>' + (rec.bestSeasonRank || '-') + '</b><span>最佳赛季排名</span></div></div></div>';
  const achHtml = '<div class="career-card"><h4>成就</h4>' + (achList.length ? achList.map((a) => '<div class="career-news award" style="border-left-color:#ffd75e">' + esc(a.title) + '</div>').join('') : '<div class="career-news">暂无成就</div>') + '</div>';
  return '<div class="career-card"><h4>赛季数据统计</h4><div class="career-season">' + selBtns + '</div><div class="career-kpis">' + kpiHtml + '</div></div>' +
    '<div class="career-card"><h4>单场走势 · 第 ' + sel + ' 赛季（共 ' + stats.matches + ' 场）</h4><div class="career-series">' + seriesHtml + '</div><div class="career-stats"><span>当前连胜 ' + streaks.current + ' · 最长连胜 ' + streaks.longest + '</span><span>绿 = 胜 · 红 = 负 · 描金 = 杯赛 · 高度 = 击杀数</span></div></div>' +
    '<div class="career-card"><h4>生涯总览</h4><div class="career-kpis">' + ovHtml + '</div></div>' +
    recordHtml + achHtml;
}

export function __setCareerTabForTest(key) { tab = key; }
export function __renderTabForTest(key) { tab = key; const s = loadCareer(); return renderTab(s); }

function renderTab(s) {
  if (tab === 'settlement') {
    return s.season.cup.phase === 'finished' ? renderSettlement(s) : renderDash(s);
  }
  if (tab === 'dash') return renderDash(s);
  if (tab === 'schedule') return renderSchedule(s);
  if (tab === 'training') return renderTraining(s);
  if (tab === 'roster') return renderRoster(s);
  if (tab === 'standings') return renderStandings(s);
  if (tab === 'cup') return renderCup(s);
  if (tab === 'finance') return renderFinance(s);
  if (tab === 'stats') return renderSeasonStats(s);
  return renderDash(s);
}
