import {
  loadCareer, getState, titleFor, startCareerMatch, careerEndMatch, abandonPendingMatch, simulatePlayerMatch, resetCareer,
  train, sellPlayer, buyPlayer, candidates, filterCandidates, nextSeason, seasonReport, nextMatch, nextMatchInfo, matchImportance, teamRecentForm,
  transferWindowOpen, transferWindowInfo, isStorageAvailable, cupMap, cupPrizeInfo, cupMapForRound, fixtureMapFor, fixtureMatchRecord, winChance, trainingTiers, trainingPreview, xpNeeded,
  seasonStats, seasonAwards, seasonPerformanceSummary, seasonSeries, seasonStreaks, careerSummary, matchDetail, seasonTimeline, headToHead, importantMatches, seasonTrends, favoriteMatches, cupHistory, trophyCase, careerTimeline,
  sponsorIncome, formBonus, fatiguePenalty, careerMorale, restPlayer, seasonGoals, seasonPace, goalProgress, relegationProjection, rosterContribution,
  achievementDefs, achievements, careerRecords
} from './career.js';

let doc = null;
let game = null;
let tab = 'dash';
let statsSeason = null;
let scheduleDetail = null;
let transferRole = '';
let transferMinRating = 0;
let transferMaxPrice = 30000;

function el(id) { return doc ? doc.getElementById(id) : null; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(t) { if (game && game.ui) game.ui.showToast(t); }
function money(n) { return Number(n || 0).toLocaleString('zh-CN'); }
function teamName(s, id) { const t = s.season.teams.find((x) => x.id === id); return t ? t.name : id; }
const ATTR_CN = { aim: '射击', move: '移速', react: '反应', nade: '道具' };
const ROLE_CN = ['突破', '补枪', '指挥', '自由人'];
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
  panel.addEventListener('change', onChange, false);
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

function onChange(e) {
  const target = e && e.target;
  const filter = target && target.getAttribute ? target.getAttribute('data-filter') : null;
  if (!filter) return;
  if (filter === 'role') transferRole = target.value || '';
  else if (filter === 'min-rating') transferMinRating = Math.max(0, Math.min(100, Number(target.value) || 0));
  else if (filter === 'max-price') transferMaxPrice = Math.max(0, Math.min(30000, Number(target.value) || 30000));
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
  } else if (act === 'fixture-detail') {
    scheduleDetail = t.getAttribute('data-key');
    render();
  } else if (act === 'close-detail') {
    scheduleDetail = null;
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
  const goalP = goalProgress(s);
  const form = formBonus(s);
  const mor = careerMorale(s);
  const fat = Math.round(fatiguePenalty(s) * 100);
  const winInfo = transferWindowInfo(s);
  let matchHtml = '<div class="career-card"><h4>下一场</h4>' + (winInfo.open ? '<p class="career-window">转会窗开放 · 剩余 ' + winInfo.remaining + ' 次 · ' + winInfo.text + '</p>' : '<p class="career-window">转会窗：' + winInfo.text + '</p>');
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
    if (info) matchHtml += '<p class="career-scout">对手排名 ' + (info.rank || '-') + ' · 近 5 场 ' + (info.form || '暂无') + ' · 场均击杀 ' + (info.scout ? info.scout.avgKills : '-') + ' · 主场图 ' + esc(mapName((info.scout && info.scout.homeMap) || '')) + ' · 重要性 ' + info.importance + ' · 预估胜率 ' + (info.winChance != null ? info.winChance + '%' : '-') + '</p>';
    matchHtml += '<div class="career-actions"><button class="btn primary small" data-act="play" data-opp="' + oppId + '" data-venue="' + venue + '" data-cup="' + (s.season.cup.phase === 'active' ? '1' : '0') + '">开赛</button><button class="btn small" data-act="sim">模拟本场</button></div>';
  } else {
    matchHtml += '<p>' + (s.season.cup.phase === 'finished' ? '本赛季已结束' : (s.season.cup.phase === 'active' ? '杯赛已淘汰，等待赛季结算' : '当前轮次已打完')) + '</p>';
  }
  matchHtml += '</div>';
  const rankGoalText = goalP.currentRank <= goals.rankGoal
    ? '已进入目标区'
    : '距前 ' + goals.rankGoal + ' 还需 ' + goalP.rankPointsGap + ' 分';
  const cupGoalText = goals.cupGoal === 0 ? '八强' : '四强';
  const cupCurrentText = goalP.currentCupRound === 3 ? '冠军' : goalP.currentCupRound === 2 ? '亚军' : goalP.currentCupRound === 1 ? '四强' : goalP.currentCupRound === -1 ? '未决' : '八强';
  const goalHtml = '<div class="career-card"><h4>赛季目标</h4>' +
    '<div class="career-row"><span>' + esc(s.team.league) + ' 目标：前 ' + goals.rankGoal + ' · 杯赛至少' + cupGoalText + ' · 奖励 ' + money(goals.reward) + '</span><b>' + (goalP.achieved ? '已达成' : '进行中') + '</b></div>' +
    '<div class="career-row"><span>当前排名 ' + goalP.currentRank + ' · ' + rankGoalText + '</span><b>' + goalP.rankProgress + '%</b></div>' +
    '<div class="career-bar"><i style="width:' + goalP.rankProgress + '%"></i></div>' +
    '<div class="career-row"><span>杯赛 ' + cupCurrentText + ' · 目标至少' + cupGoalText + '</span><b>' + goalP.cupProgress + '%</b></div>' +
    '<div class="career-bar"><i style="width:' + goalP.cupProgress + '%"></i></div>' +
    (goalP.projectedPoints != null ? '<div class="career-stats"><span>已赛 ' + goalP.played + ' 场 · 剩 ' + goalP.remaining + ' 场 · 预测 ' + goalP.projectedPoints + ' 分 / 第 ' + goalP.projectedRank + ' 名</span></div>' : '') +
    '</div>';
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
      const venue = f.home === 'player' ? 'home' : 'away';
      const mapId = fixtureMapFor(s, f);
      const roundCls = f.played ? ' done' : (r === s.season.round ? ' cur' : (r > s.season.round ? ' future' : ' done'));
      const venueCls = mine ? (venue === 'home' ? ' home' : ' away') : '';
      const key = r + ':' + f.home + ':' + f.away;
      html += '<div class="career-fixture' + (mine ? ' mine' : '') + roundCls + venueCls + '">';
      if (f.played) {
        html += (mine ? '<span class="career-venue">' + (venue === 'home' ? '主场' : '客场') + '</span>' : '') + esc(teamName(s, f.home)) + ' ' + f.score[0] + ' : ' + f.score[1] + ' ' + esc(teamName(s, f.away)) + ' <span>地图 ' + esc(mapName(mapId || '')) + '</span>';
        if (mine) html += ' <button class="btn small" data-act="fixture-detail" data-key="' + key + '">复盘</button>';
      } else if (mine) {
        html += '<span class="career-venue">' + (venue === 'home' ? '主场' : '客场') + '</span>' + esc(teamName(s, f.home)) + ' 对 ' + esc(teamName(s, f.away)) + ' <span>地图 ' + esc(mapName(mapId || '')) + ' · ' + (r === s.season.round ? matchImportance(s, f) + ' · 胜率 ' + winChance(s, oppId, venue) + '%' : '未来轮次') + '</span>';
        if (r === s.season.round) html += ' <button class="btn small" data-act="play" data-opp="' + oppId + '" data-venue="' + venue + '" data-cup="0">开赛</button> <button class="btn small" data-act="sim">模拟本场</button>';
      } else {
        html += esc(teamName(s, f.home)) + ' 对 ' + esc(teamName(s, f.away)) + ' <span>第 ' + r + ' 轮开放 · 地图 ' + esc(mapName(mapId || '')) + '</span>';
      }
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  if (scheduleDetail) {
    const f = s.season.fixtures.find((x) => (x.round + ':' + x.home + ':' + x.away) === scheduleDetail);
    if (f && f.played) {
      const rec = fixtureMatchRecord(s, f);
      const d = rec ? matchDetail(rec) : null;
      const oppId = f.home === 'player' ? f.away : f.home;
      const oppName = (d && d.oppName) || teamName(s, oppId);
      const scoreText = d ? d.scoreText : (Array.isArray(f.score) ? f.score.join(':') : '未记录');
      const ratingText = d && d.playerRating != null && d.oppRating != null ? ('赛前评级 ' + d.playerRating + ' : ' + d.oppRating) : '';
      const detailVenue = f.home === 'player' ? 'home' : 'away';
      const detailMapId = fixtureMapFor(s, f);
      html += '<div class="career-card"><h4>已赛详情 · ' + esc(oppName) + '</h4>' +
        '<div class="career-settle"><span>' + (detailVenue === 'home' ? '主场' : '客场') + ' · ' + esc(mapName(detailMapId || '')) + '</span><span>比分 ' + esc(scoreText) + '</span><span>' + (d ? (d.win ? '胜利' : '失利') : '已结束') + '</span>' + (ratingText ? '<span>' + ratingText + '</span>' : '') + '</div>' +
        (d ? '<div class="career-stats"><span>K/D ' + d.kills + ' / ' + d.deaths + ' · 伤害 ' + d.dmg + '</span><span>奖金 ' + money(d.money) + ' · ' + esc(d.importance) + (d.mvp ? ' · MVP' : '') + '</span></div>' : '<div class="career-stats"><span>暂无完整比赛数据</span></div>') +
        '<button class="btn small" data-act="close-detail">返回赛程</button></div>';
    }
  }
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
      const pre = trainingPreview(s, attr, tier.key);
      const label = tier.label + ' ' + tier.cost + ' / +' + tier.points + ' (' + (pre ? pre.before + '→' + pre.after : '-') + ' · 疲劳+' + (pre ? pre.fatigueGain : tier.fatigue || 3) + ')';
      const disabled = !pre || pre.blocked || !pre.affordable || pre.trainingLeft <= 0;
      html += '<button class="btn small"' + (disabled ? ' disabled' : '') + ' data-act="train" data-attr="' + attr + '" data-tier="' + tier.key + '">' + label + '</button>';
    }
    html += '</div>';
  }
  return html + '</div><div class="career-card"><h4>收益预览</h4><p>训练会提升指定属性，同时累积疲劳；精英训练收益最高但疲劳代价也更大。</p></div>';
}

function renderRoster(s) {
  const contrib = rosterContribution(s);
  let html = '<div class="career-card"><h4>阵容 · 队伍评级 ' + contrib.rating + '</h4>' +
    '<div class="career-stats"><span>队友均评 ' + contrib.rosterAvg + ' · 玩家属性 ' + contrib.attrsAvg + ' · 状态 ' + (contrib.form >= 0 ? '+' : '') + contrib.form + ' · 士气 +' + contrib.morale + '</span><span>基础 ' + contrib.base + ' · 最终 ' + contrib.rating + '</span></div>' +
    '<div class="career-roster">';
  html += '<div class="career-player-card"><b>' + esc(s.player.name) + '</b><span>你 · ' + esc(titleFor(s.player.level)) + '</span><i>' + esc(s.team.name) + ' · 等级 ' + s.player.level + ' · 属性贡献 +' + contrib.player.contribution + ' · ' + contrib.player.sharePct + '%</i></div>';
  for (const p of contrib.members) {
    html += '<div class="career-row"><span>' + esc(p.role) + ' · 评级 ' + p.rating + '</span><b>贡献 ' + (p.delta >= 0 ? '+' : '') + p.delta + ' · ' + p.sharePct + '%</b></div>';
    html += '<div class="career-player-card"><b>' + esc(p.name) + '</b><span>' + esc(p.role) + '</span><i>' + esc(p.team || s.team.name) + ' · 评级 ' + p.rating + ' · ' + money(p.price) + '</i>';
    if (transferWindowOpen(s) && s.team.transfersLeft > 0) html += '<button class="btn small" data-act="sell" data-id="' + p.id + '">卖出</button>';
    html += '</div>';
  }
  while (contrib.members.length < 4) html += '<div class="career-player-card empty">空位 · 可在转会窗补入</div>';
  html += '</div></div>';
  if (transferWindowOpen(s)) {
    const roleOptions = ROLE_CN.map((role) => '<option value="' + esc(role) + '"' + (transferRole === role ? ' selected' : '') + '>' + esc(role) + '</option>').join('');
    const filterHtml = '<div class="career-train-row"><b>筛选</b><select data-filter="role"><option value="">全部角色</option>' + roleOptions + '</select>' +
      '<span>最低评级 <input type="number" data-filter="min-rating" min="0" max="100" value="' + transferMinRating + '"></span>' +
      '<span>最高价格 <input type="number" data-filter="max-price" min="0" max="30000" step="500" value="' + transferMaxPrice + '"></span></div>';
    html += '<div class="career-card"><h4>转会窗 · 剩余 ' + s.team.transfersLeft + ' 次</h4>' + filterHtml + '<div class="career-pool">';
    const poolResult = filterCandidates(candidates(), { role: transferRole, minRating: transferMinRating, maxPrice: transferMaxPrice });
    const pool = poolResult.list;
    if (pool.length) {
      for (const c of pool) {
        html += '<div class="career-player-card"><b>' + esc(c.name) + '</b><span>' + esc(c.role) + '</span><i>' + esc(c.team || '') + ' · 评级 ' + c.rating + ' · ' + money(c.price) + '</i>';
        if (s.team.bank >= c.price && s.team.transfersLeft > 0) html += '<button class="btn small" data-act="buy" data-id="' + c.id + '">买入</button>';
        html += '</div>';
      }
    } else {
      html += '<div class="career-news">筛选结果 0 / ' + poolResult.total + '</div>';
    }
    html += '</div><div class="career-stats"><span>显示 ' + poolResult.shown + ' / ' + poolResult.total + ' 名候选</span></div></div>';
  } else {
    const win = transferWindowInfo(s);
    html += '<div class="career-card"><h4>转会窗</h4><p>第 ' + win.opensRound + '-' + win.closesRound + ' 轮开放 · ' + win.text + '</p></div>';
  }
  return html;
}

function renderStandings(s) {
  const list = [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  const pace = seasonPace(s);
  const proj = relegationProjection(s);
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
  const riskHtml = '<div class="career-card"><h4>升降级预测</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>' + proj.rank + '</b><span>当前排名</span></div>' +
    '<div class="career-kpi"><b>' + proj.points + '</b><span>当前积分</span></div>' +
    '<div class="career-kpi"><b>' + proj.remaining + '</b><span>剩余场次</span></div>' +
    '<div class="career-kpi"><b>' + proj.maxRemainingPoints + '</b><span>最多可再拿</span></div>' +
    '</div>' +
    (proj.promotionTargetRank != null ? '<div class="career-row"><span>升入前 ' + proj.promotionTargetRank + ' 还需</span><b>' + proj.pointsToPromotion + ' 分</b></div>' : '') +
    (proj.safetyTargetRank != null ? '<div class="career-row"><span>保级安全分（前 ' + proj.safetyTargetRank + '）还需</span><b>' + proj.pointsToSafety + ' 分</b></div>' : '') +
    '<div class="career-stats"><span>' + (proj.canPromote ? '仍可冲击升级' : '升级空间不足') + ' · ' + (proj.relegationRisk ? '降级风险高' : '保级压力可控') + ' · 预测最终第 ' + (proj.projectedRank || '-') + '</span></div></div>';
  return html + '</div><p>' + (pace.projected != null ? '玩家当前第 ' + pace.currentRank + ' · 剩余 ' + pace.remaining + ' 场 · 预测最终 ' + pace.projected + ' 分（预计第 ' + pace.projectedRank + '）' : '玩家当前第 ' + pace.currentRank + ' · 暂无足够赛果预测最终积分') + '</p><p>甲级第 7-8 名降乙；乙级第 1-2 名升甲、第 7-8 名降丙；丙级第 1-2 名升乙。</p></div>' + riskHtml;
}

function renderCup(s) {
  const b = s.season.cup.bracket || [];
  const prizes = cupPrizeInfo();
  const trophy = trophyCase(s.history);
  const trophyHtml = '<div class="career-card"><h4>奖杯陈列</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>' + trophy.championCount + '</b><span>冠军</span></div>' +
    '<div class="career-kpi"><b>' + trophy.runnerUpCount + '</b><span>亚军</span></div>' +
    '<div class="career-kpi"><b>' + trophy.total + '</b><span>领奖台</span></div></div>' +
    (trophy.rows.length ? trophy.rows.map((h) => '<div class="career-row' + (h.cupRound === 3 ? ' cup' : '') + '"><span>第 ' + h.seasonId + ' 赛季 · ' + esc(h.league) + ' · 联赛第 ' + h.rank + ' 名</span><b>' + (h.cupRound === 3 ? '冠军' : '亚军') + ' · ' + money(h.prize) + '</b></div>').join('') : '<div class="career-news">暂无冠军或亚军记录</div>') + '</div>';
  if (!b.length) return '<div class="career-card"><h4>杯赛</h4><p>第 14 轮结束后进入。</p></div>' + trophyHtml;
  const names = (m, side) => {
    const id = side === 'a' ? m.a : m.b;
    if (!id) return '待定';
    return esc(teamName(s, id)) + (m.played && m.winner === id ? ' ✓' : '');
  };
  let html = '<div class="career-card"><h4>淘汰赛</h4>';
  for (const round of ['QF', 'SF', 'F']) {
    const roundPrize = prizes.rounds.find((x) => x.key === round);
    html += '<div class="career-cup-round"><b>' + cn(round, CUP_CN) + ' · 晋级奖 ' + money(roundPrize ? roundPrize.prize : 0) + '</b>';
    for (const m of b.filter((x) => x.round === round)) {
      const mine = !m.played && (m.a === 'player' || m.b === 'player');
      html += '<div class="career-cup-match' + (mine ? ' mine' : '') + '">' + names(m, 'a') + ' 对 ' + names(m, 'b') + ' <span>地图 ' + esc(mapName(cupMapForRound(m.round))) + '</span>' + (m.played ? ' · ' + m.score[0] + ':' + m.score[1] : '');
      if (mine) {
        const opp = m.a === 'player' ? m.b : m.a;
        html += ' <button class="btn small" data-act="play" data-opp="' + opp + '" data-venue="home" data-cup="1">开赛</button> <button class="btn small" data-act="sim">模拟本场</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  }
  return html + '</div><div class="career-card"><h4>奖金</h4><p>每轮晋级奖 ' + money(prizes.perRound) + ' · 冠军另奖 ' + money(prizes.champion) + ' · 决赛单场最高 ' + money(35000) + '</p></div>' + trophyHtml;
}

function renderSettlement(s) {
  const r = seasonReport();
  const cupRoundText = cupRoundLabel(r.cupRound);
  const perf = seasonPerformanceSummary(s);
  const perfHtml = '<div class="career-card"><h4>赛季个人表现</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>' + perf.matches + '</b><span>场次</span></div>' +
    '<div class="career-kpi"><b>' + perf.wins + ' / ' + perf.losses + '</b><span>胜负</span></div>' +
    '<div class="career-kpi"><b>' + perf.kd + '</b><span>K/D</span></div>' +
    '<div class="career-kpi"><b>' + perf.mvpCount + '</b><span>MVP</span></div>' +
    '<div class="career-kpi"><b>' + perf.totalDmg + '</b><span>总伤害</span></div>' +
    '<div class="career-kpi"><b>' + perf.avgDmg + '</b><span>场均伤害</span></div>' +
    '<div class="career-kpi"><b>' + perf.bestKills + '</b><span>最佳击杀</span></div>' +
    '<div class="career-kpi"><b>' + money(perf.totalMoney) + '</b><span>比赛奖金</span></div></div>' +
    (perf.topPerformance ? '<div class="career-row"><span>最佳单场 · ' + esc(perf.topPerformance.oppName || perf.topPerformance.oppId || '-') + ' · ' + esc(mapName(perf.topPerformance.mapId || '')) + '</span><b>' + perf.topPerformance.kills + 'K / ' + perf.topPerformance.deaths + 'D · ' + perf.topPerformance.dmg + ' 伤 · ' + money(perf.topPerformance.money) + '</b></div>' : '') + '</div>';
  const history = s.history.slice().reverse().map((h) => '<div class="career-history">第 ' + h.seasonId + ' 赛季 · ' + esc(h.league) + ' · 第 ' + h.rank + ' 名 · 杯赛 ' + cupRoundLabel(h.cupRound) + ' · 奖金 ' + money(h.prize) + '</div>').join('');
  return '<div class="career-card"><h4>赛季结算</h4><div class="career-settle"><span>联赛：' + esc(r.league) + ' · 第 ' + r.rank + ' 名</span><span>排名奖金：' + money(r.rankPrize) + '</span><span>杯赛：' + cupRoundText + ' · ' + money(r.cupPrize) + '</span><span>总奖金：' + money(r.prize) + '</span></div></div>' + perfHtml + '<div class="career-card"><h4>历史记录</h4>' + (history || '<div class="career-history">暂无</div>') + '</div><div class="career-card"><button class="btn primary" data-act="next-season">下一赛季</button></div>';
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
  const awards = seasonAwards(mh, sel);
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
  const detailRows = mh.filter((m) => m && m.seasonId === sel).slice().reverse().slice(0, 24).map((m) => {
    const d = matchDetail(m);
    const oppName = d.oppId ? teamName(s, d.oppId) : (d.oppId || '-');
    return '<div class="career-row' + (d.win ? ' win' : ' lose') + '"><span>' +
      esc(d.impact) + ' · ' + esc(oppName) + ' · ' + esc(mapName(d.mapId || '')) +
      ' · ' + esc(d.scoreText) + ' · ' + (d.isCup ? '杯赛' : '第 ' + (d.round != null ? d.round : '-') + ' 轮') + '</span><b>' +
      d.kills + 'K / ' + d.deaths + 'D · ' + d.dmg + ' 伤 · ' + money(d.money) + ' · ' + esc(d.importance) + '</b></div>';
  }).join('') || '<div class="career-news">暂无比赛数据</div>';
  const timelineRows = seasonTimeline(mh, sel).map((d) => {
    const oppName = d.oppId ? teamName(s, d.oppId) : (d.oppId || '-');
    return '<div class="career-timeline"><span>' + esc(d.label) + ' · ' + (d.win ? '胜' : '负') + '</span><b>' +
      esc(oppName) + ' · ' + esc(mapName(d.mapId || '')) + ' · ' + esc(d.scoreText) + ' · ' +
      d.kills + 'K/' + d.deaths + 'D · ' + money(d.money) + '</b></div>';
  }).join('') || '<div class="career-news">暂无比赛数据</div>';
  const h2hIds = [...new Set(mh.filter((m) => m && m.oppId).map((m) => m.oppId))];
  const h2hRows = h2hIds.map((oppId) => {
    const h = headToHead(mh, oppId);
    const name = (h.last[h.last.length - 1] && h.last[h.last.length - 1].oppName) || teamName(s, oppId);
    return '<div class="career-row"><span>' + esc(name) + '</span><b>' +
      h.matches + ' 场 · ' + h.wins + '胜' + h.losses + '负 · ' + h.winRate + '% · K/D ' + h.kd +
      ' · 奖金 ' + money(h.totalMoney) + '</b></div>';
  }).sort((a, b) => b.match(/(\d+) 场/) - a.match(/(\d+) 场/)).join('') || '<div class="career-news">暂无对阵记录</div>';
  const impRows = importantMatches(mh, 12).map((d) => {
    const oppName = d.oppName || (d.oppId ? teamName(s, d.oppId) : '-');
    return '<div class="career-row' + (d.win ? ' win' : ' lose') + '"><span>' +
      esc(d.importance) + ' · ' + esc(oppName) + ' · ' + esc(mapName(d.mapId || '')) +
      ' · ' + esc(d.scoreText) + ' · ' + (d.win ? '胜利' : '失利') + '</span><b>' +
      d.kills + 'K / ' + d.deaths + 'D · ' + d.dmg + ' 伤 · ' + money(d.money) + '</b></div>';
  }).join('') || '<div class="career-news">暂无关键战记录</div>';
  const trendRows = seasonTrends(mh).map((t) => '<div class="career-row"><span>第 ' + t.seasonId + ' 赛季</span><div class="career-trend"><i style="width:' + Math.max(4, t.winRate) + '%"></i></div><b>' +
    t.matches + ' 场 · ' + t.winRate + '% 胜率 · K/D ' + t.kd + ' · 场均 ' + t.avgDmg + ' 伤 · ' + money(t.totalMoney) + '</b></div>').join('') || '<div class="career-news">暂无赛季趋势</div>';
  const favRows = favoriteMatches(mh, 12).map((d) => {
    const oppName = d.oppName || (d.oppId ? teamName(s, d.oppId) : '-');
    return '<div class="career-row' + (d.win ? ' win' : ' lose') + '"><span>' +
      (d.mvp ? 'MVP' : '精彩') + ' · 第 ' + d.seasonId + ' 赛季 · ' + esc(oppName) + ' · ' + esc(mapName(d.mapId || '')) +
      ' · ' + esc(d.scoreText) + '</span><b>' + d.kills + 'K / ' + d.deaths + 'D · ' + d.dmg + ' 伤 · ' + money(d.money) + '</b></div>';
  }).join('') || '<div class="career-news">暂无精彩场次</div>';
  const cupRows = cupHistory(s.history).map((h) => '<div class="career-row' + (h.cupRound >= 2 ? ' cup' : '') + '"><span>第 ' + h.seasonId + ' 赛季 · ' + esc(h.league) + '</span><b>' + esc(h.cupLabel) + (h.cupRound === 3 ? ' · 冠军 ' : h.cupRound === 2 ? ' · 亚军 ' : '') + ' · 联赛第 ' + h.rank + ' · 奖金 ' + money(h.prize) + '</b></div>').join('') || '<div class="career-news">暂无杯赛记录</div>';
  const lifeRows = careerTimeline(s, 60).map((e) => '<div class="career-timeline ' + esc(e.type) + '"><span>' + esc(e.type === 'season' ? '赛季' : e.type === 'award' ? '成就' : '事件') + (e.seasonId != null ? ' · 第 ' + e.seasonId + ' 赛季' : '') + '</span><b>' + esc(e.text) + (e.detail ? ' · ' + esc(e.detail) : '') + '</b></div>').join('') || '<div class="career-news">暂无事件</div>';
  const ov = [['赛季数', overview.seasons], ['总场次', overview.matches], ['胜率', overview.winRate + '%'], ['K/D', overview.kd], ['场均伤害', overview.avgDmg], ['总奖金', money(overview.totalMoney)], ['总击杀', overview.kills]];
  const ovHtml = ov.map(([k, v]) => '<div class="career-kpi"><b>' + v + '</b><span>' + k + '</span></div>').join('');
  const recordHtml = '<div class="career-card"><h4>生涯纪录</h4><div class="career-kpis"><div class="career-kpi"><b>' + (rec.bestKills || 0) + '</b><span>单场最高击杀</span></div><div class="career-kpi"><b>' + (rec.longestWinStreak || 0) + '</b><span>最长连胜</span></div><div class="career-kpi"><b>' + money(rec.totalPrize || 0) + '</b><span>累计奖金</span></div><div class="career-kpi"><b>' + (rec.cupChampions || 0) + '</b><span>杯赛冠军</span></div><div class="career-kpi"><b>' + (rec.bestSeasonRank || '-') + '</b><span>最佳赛季排名</span></div></div></div>';
  const achHtml = '<div class="career-card"><h4>成就</h4>' + (achList.length ? achList.map((a) => '<div class="career-news award" style="border-left-color:#ffd75e">' + esc(a.title) + '</div>').join('') : '<div class="career-news">暂无成就</div>') + '</div>';
  const awardHtml = '<div class="career-card"><h4>赛季个人奖项</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>' + awards.mvpMatches.length + '</b><span>MVP场次</span></div>' +
    '<div class="career-kpi"><b>' + (awards.bestKills ? awards.bestKills.kills : '-') + '</b><span>最佳击杀</span></div>' +
    '<div class="career-kpi"><b>' + (awards.bestDmg ? awards.bestDmg.dmg : '-') + '</b><span>最高伤害</span></div>' +
    '<div class="career-kpi"><b>' + awards.avgKills + '</b><span>场均击杀</span></div>' +
    '<div class="career-kpi"><b>' + awards.avgDmg + '</b><span>场均伤害</span></div>' +
    '</div>' + (awards.topPerformance ? '<div class="career-row"><span>最佳单场 · ' + esc(awards.topPerformance.oppName || awards.topPerformance.oppId || '-') + ' · ' + esc(mapName(awards.topPerformance.mapId || '')) + '</span><b>' + awards.topPerformance.kills + 'K / ' + awards.topPerformance.deaths + 'D · ' + awards.topPerformance.dmg + ' 伤 · ' + (awards.topPerformance.mvp ? 'MVP' : awards.topPerformance.win ? '胜利' : '失利') + '</b></div>' : '<div class="career-news">暂无比赛数据</div>') + '</div>';
  return '<div class="career-card"><h4>赛季数据统计</h4><div class="career-season">' + selBtns + '</div><div class="career-kpis">' + kpiHtml + '</div></div>' +
    awardHtml +
    '<div class="career-card"><h4>单场走势 · 第 ' + sel + ' 赛季（共 ' + stats.matches + ' 场）</h4><div class="career-series">' + seriesHtml + '</div><div class="career-stats"><span>当前连胜 ' + streaks.current + ' · 最长连胜 ' + streaks.longest + '</span><span>绿 = 胜 · 红 = 负 · 描金 = 杯赛 · 高度 = 击杀数</span></div></div>' +
    '<div class="career-card"><h4>赛季比赛时间线</h4>' + timelineRows + '</div>' +
    '<div class="career-card"><h4>赛季近场明细</h4>' + detailRows + '</div>' +
    '<div class="career-card"><h4>对阵历史 H2H</h4>' + h2hRows + '</div>' +
    '<div class="career-card"><h4>关键战复盘</h4>' + impRows + '</div>' +
    '<div class="career-card"><h4>历史赛季趋势</h4>' + trendRows + '</div>' +
    '<div class="career-card"><h4>精彩场次收藏</h4>' + favRows + '</div>' +
    '<div class="career-card"><h4>杯赛历届战绩</h4>' + cupRows + '</div>' +
    '<div class="career-card"><h4>生涯事件时间线</h4>' + lifeRows + '</div>' +
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
