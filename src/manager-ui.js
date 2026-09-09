import {
  getState, isStorageAvailable,
  nextFixture, seasonReport, teamHealth, seasonGoalProgress,
  settlePlayerMatch, simulateManagerMatch, nextSeason,
  transferWindowOpen, candidates, scoutedView, scoutingNoise,
  filterCandidates, buyPlayer, sellPlayer, renewPlayer,
  trainPlayer, restPlayer, trainingPreview, facilityStatus, upgradeFacility,
  sponsorIncome, cashflowForecast, seasonBudget, financialRisk,
  ledgerRecent, transferProfit, computeChemistry, pendingEvents, respondEvent,
  TRAIN_TIERS, ATTRS, PERSONALITY_CN, NEED_ROLES, ROLES
} from './manager.js';
import { startManagerMatch } from './manager-match.js';

let doc = null;
let game = null;
let tab = 'dash';
let transferRole = '';
let transferSort = 'rating';
let trainAttr = {};

function el(id) { return doc ? doc.getElementById(id) : null; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(t) { if (game && game.ui) game.ui.showToast(t); }
function money(n) { return Number(n || 0).toLocaleString('zh-CN'); }
function healthColor(c) { return c === 'green' ? '#4ade80' : c === 'yellow' ? '#facc15' : '#f87171'; }
const ATTR_CN = { aim: '枪法', react: '反应', movement: '身法', clutch: '残局', nade: '道具', gameIQ: '战术', leadership: '指挥', composure: '冷静', aggression: '冲击', discipline: '纪律' };
const ROLE_CN = { 突破: '突', 狙击: '狙', 指挥: '指', 步枪: '步', 自由人: '自', 补枪: '补' };

export function initManagerUi(documentRef, gameRef) {
  doc = documentRef;
  game = gameRef;
  const panel = el('managerPanel');
  if (!panel) return;
  panel.addEventListener('click', onClick, false);
  panel.addEventListener('change', onChange, false);
  window.__openManager = openManager;
  window.__managerEndMatch = (g) => { openManager(); };
}

export function openManager() {
  const s = getState();
  computeChemistry(s);
  if (!isStorageAvailable()) toast('经理进度不会保存');
  const panel = el('managerPanel');
  if (!panel) return;
  panel.style.display = 'block';
  if (el('menu')) el('menu').classList.remove('show');
  if (el('end')) el('end').classList.remove('show');
  tab = 'dash';
  render();
}

const TABS = [
  ['dash', '总览'], ['roster', '阵容/转会'], ['schedule', '赛程/积分'],
  ['train', '训练/设施'], ['finance', '经营/数据']
];

function render() {
  const s = getState();
  const panel = el('managerPanel');
  if (!panel) return;
  const h = teamHealth(s);
  const fr = financialRisk(s);
  let html = '<div class="career-top">' +
    '<span class="ct-mode">电竞经理</span>' +
    '<span class="ct-season">S' + s.season.id + ' · R' + s.season.round + '/' + s.season.totalRounds + ' · ' + esc(s.team.league) + (s.season.cup.phase !== 'idle' ? ' · 杯赛' : '') + '</span>' +
    '<span class="ct-bank">¥' + money(s.team.bank) + '</span>' +
    '<span class="ct-bank" style="color:' + healthColor(h.morale) + '">士气' + s.team.morale + '</span>' +
    '<span class="ct-bank" style="color:' + healthColor(fr.level === '高风险' ? 'red' : fr.level === '紧张' ? 'yellow' : 'green') + '">' + esc(fr.level) + '</span>' +
    '<span class="ct-bank">信任' + s.board.trust + '</span>' +
    '<button data-act="menu">←主菜单</button></div>';
  html += '<div class="career-tabs">';
  for (const [id, label] of TABS) html += '<button class="career-tab' + (tab === id ? ' sel' : '') + '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
  html += '</div><div class="career-body">';
  const rr = { dash: renderDash, roster: renderRoster, schedule: renderSchedule, train: renderTrain, finance: renderFinance }[tab] || renderDash;
  html += rr(s);
  html += '</div>';
  panel.innerHTML = html;
}

function healthDot(c, label, val) {
  return '<span class="mng-dot" style="color:' + healthColor(c) + '">●</span><span class="mng-k">' + label + '</span><b>' + val + '</b>';
}

function renderDash(s) {
  const h = teamHealth(s);
  const f = nextFixture(s);
  const goal = seasonGoalProgress(s);
  const fr = financialRisk(s);
  let html = '<div class="career-card"><h4>战队体检</h4><div class="mng-health">' +
    healthDot(h.money, '资金', money(s.team.bank)) +
    healthDot(h.morale, '士气', s.team.morale) +
    healthDot(h.fatigue, '疲劳', '') +
    healthDot(h.roster, '阵容', h.gaps.length ? '缺' + h.gaps.join('') : '齐') +
    healthDot(h.stress, '更衣室', s.team.stressSum) +
    healthDot(fr.score >= 35 ? (fr.score >= 60 ? 'red' : 'yellow') : 'green', '风险', esc(fr.level)) +
    '</div>' + (h.advice.length ? '<div class="mng-advice">' + h.advice.map(esc).join(' · ') + '</div>' : '') + '</div>';
  if (f) {
    const opp = s.season.teams.find((t) => t.id === (f.home === 'player' ? f.away : f.home));
    const isHome = f.home === 'player';
    html += '<div class="career-card"><div class="mng-next"><div><b>下一场 R' + f.round + '</b> vs ' + esc(opp.name) + ' <small>(' + opp.rating + ' 评 · ' + esc(opp.style || '') + ' · ' + (isHome ? '主' : '客') + ' · ' + esc(f.mapId) + ')</small></div>' +
      '<div class="career-actions"><button data-act="play">实机观战</button><button data-act="sim">模拟</button></div></div></div>';
  } else if (s.season.cup.phase === 'active') {
    html += '<div class="career-card"><div class="mng-next"><div><b>杯赛进行中</b></div><div class="career-actions"><button data-act="play-cup">打杯赛</button></div></div></div>';
  } else if (s.season.cup.phase === 'finished') {
    const rep = seasonReport(s);
    html += '<div class="career-card"><div class="mng-next"><div><b>赛季结束 · 第 ' + rep.rank + ' 名</b> · 排名奖 ¥' + money(rep.rankPrize) + ' · 杯赛奖 ¥' + money(rep.cupPrize) + ' · 下季 ' + esc(rep.nextLeague) + (rep.promoted ? '（升）' : rep.relegated ? '（降）' : '') + '</div>' +
      '<div class="career-actions"><button data-act="next-season">结算并进入下赛季</button></div></div></div>';
  }
  const table = [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  const myRow = table.findIndex((x) => x.teamId === 'player');
  html += '<div class="career-grid2"><div class="career-card"><h4>积分榜</h4><div class="career-table"><table class="mng-table"><tr><th>#</th><th>队</th><th>赛</th><th>胜</th><th>负</th><th>分</th></tr>';
  table.forEach((row, i) => {
    const t = s.season.teams.find((x) => x.id === row.teamId);
    html += '<tr' + (row.teamId === 'player' ? ' class="mine"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(t ? t.tag : row.teamId) + '</td><td>' + row.played + '</td><td>' + row.w + '</td><td>' + row.l + '</td><td>' + row.pts + '</td></tr>';
  });
  html += '</table></div></div>';
  html += '<div><div class="career-card"><h4>赛季目标 · 奖励 ¥' + money(goal.reward) + '</h4>' +
    '<div class="mng-goal"><span>排名前 ' + goal.rank + '</span><span>杯赛' + (goal.cup >= 1 ? '进淘汰赛' : '参赛') + '</span><span>信任 ' + s.board.trust + '</span></div></div>';
  const pe = pendingEvents(s);
  if (pe.length) {
    html += '<div class="career-card"><h4>待处理事件</h4>';
    for (const ev of pe) {
      html += '<div class="mng-ev"><span>' + esc(ev.text) + '</span>';
      if (ev.playerId) {
        if (ev.type === 'conflict') {
          html += '<span><button data-act="evt" data-evt="conflict" data-pid="' + ev.playerId + '" data-choice="mediate">调解</button><button data-act="evt" data-evt="conflict" data-pid="' + ev.playerId + '" data-choice="bench">下放</button></span>';
        } else {
          html += '<span><button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="soothe">安抚</button><button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="promise">承诺</button><button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="ignore">放任</button></span>';
        }
      }
      html += '</div>';
    }
    html += '</div>';
  }
  html += '<div class="career-card"><h4>事件流</h4>' + (s.news || []).slice(0, 6).map((n) => '<div class="career-news ' + (n.type === 'win' ? 'win' : n.type === 'lose' ? 'lose' : '') + '">' + esc(n.text) + '</div>').join('') + '</div>';
  html += '</div></div>';
  return html;
}

function playerRow(p, s, actions) {
  const stars = Math.max(1, Math.round(p.potential / 18));
  return '<div class="mng-prow"><span class="mng-pname">' + esc(p.name) + '</span>' +
    '<span class="mng-prole">' + (ROLE_CN[p.role] || p.role) + '</span>' +
    '<span class="mng-prating">' + p.rating + '</span>' +
    '<span class="mng-ppot">' + '★'.repeat(stars) + '</span>' +
    '<span class="mng-pstate" style="color:' + healthColor(p.morale >= 65 ? 'green' : p.morale >= 45 ? 'yellow' : 'red') + '">气' + p.morale + '</span>' +
    '<span class="mng-pstate" style="color:' + healthColor(p.fatigue < 35 ? 'green' : p.fatigue < 60 ? 'yellow' : 'red') + '">疲' + p.fatigue + '</span>' +
    '<span class="mng-pprice">¥' + money(p.price) + '</span>' +
    '<span class="mng-pcon">' + p.contractYears + 'y</span>' +
    '<span class="mng-pact">' + actions(p) + '</span></div>';
}

function renderRoster(s) {
  let html = '<div class="career-card"><h4>阵容（' + s.team.roster.length + '/6）· 化学 ' + s.team.chemistry + '</h4><div class="mng-roster">';
  for (const p of s.team.roster) {
    html += playerRow(p, s, (pp) =>
      '<button data-act="rest" data-pid="' + pp.id + '">休</button>' +
      (pp.contractYears <= 1 ? '<button data-act="renew" data-pid="' + pp.id + '">续</button>' : '') +
      (transferWindowOpen(s) ? '<button data-act="sell" data-pid="' + pp.id + '">卖</button>' : ''));
  }
  html += '</div></div>';
  // HLTV 评价: 每个选手的滚动 HLO + 最近一场
  const hltvRows = s.team.roster.filter((p) => p && p.name).map((p) => {
    const rating = (typeof p.hltvRating === 'number') ? p.hltvRating.toFixed(2) : '1.00';
    const last = (p.hltvHistory && p.hltvHistory.length) ? p.hltvHistory[p.hltvHistory.length - 1].rating.toFixed(2) : '-';
    const matches = (p.hltvHistory && p.hltvHistory.length) || 0;
    const color = (p.hltvRating || 0) >= 1.10 ? '#4ade80' : ((p.hltvRating || 0) >= 0.95 ? '#facc15' : '#f87171');
    return '<div class="mng-prow"><span class="mng-pname">' + esc(p.name) + '</span>' +
      '<span class="mng-prole">' + esc(p.role) + '</span>' +
      '<span style="color:' + color + ';font-weight:bold">' + rating + '</span>' +
      '<span class="mng-pstate">最近 ' + last + '</span>' +
      '<span class="mng-pstate">' + matches + ' 场</span></div>';
  }).join('');
  html += '<div class="career-card"><h4>HLTV 社区评价 · 选手滚动 HLO</h4><div class="mng-roster">' + hltvRows + '</div>' +
    '<div class="career-news">HLTV 风格评分: 1.00 = 联赛平均, 越高表现越好</div></div>';
  const windowOpen = transferWindowOpen(s);
  html += '<div class="career-card"><h4>转会窗' + (windowOpen ? ' · 剩余 ' + s.team.transfersLeft + ' 次 · 噪声±' + scoutingNoise(s) : ' · 第5-8轮开放') + '</h4>';
  if (windowOpen) {
    const pool = candidates(s);
    const filtered = filterCandidates(pool, { role: transferRole, sort: transferSort });
    html += '<div class="mng-filter"><select data-filter="role"><option value="">全位置</option>' + ROLES.map((r) => '<option value="' + r + '"' + (transferRole === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<select data-filter="sort"><option value="rating" ' + (transferSort === 'rating' ? 'selected' : '') + '>评</option><option value="price" ' + (transferSort === 'price' ? 'selected' : '') + '>价</option><option value="potential" ' + (transferSort === 'potential' ? 'selected' : '') + '>潜</option></select></div><div class="mng-roster">';
    for (const c of filtered) {
      const v = scoutedView(c, scoutingNoise(s));
      html += '<div class="mng-prow"><span class="mng-pname">' + esc(c.name) + '</span>' +
        '<span class="mng-prole">' + (ROLE_CN[c.role] || c.role) + '</span>' +
        '<span class="mng-prating">' + v.rating + '±' + scoutingNoise(s) + '</span>' +
        '<span class="mng-ppot">' + '★'.repeat(v.potentialStars) + '</span>' +
        '<span class="mng-pstate">' + c.age + '岁</span>' +
        '<span class="mng-pprice">¥' + money(c.price) + '</span>' +
        '<span class="mng-pcon">' + esc(c.teamOfOrigin || '自由') + '</span>' +
        '<span class="mng-pact"><button data-act="buy" data-cid="' + c.id + '">买入</button></span></div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderSchedule(s) {
  let html = '<div class="career-card"><h4>赛程 · ' + esc(s.team.league) + ' · 8队双循环14轮</h4>';
  if (s.season.cup.phase !== 'idle') {
    const b = s.season.cup.bracket;
    html += '<div class="mng-cup">';
    for (const m of b) {
      const ha = m.a ? s.season.teams.find((t) => t.id === m.a) : null;
      const hb = m.b ? s.season.teams.find((t) => t.id === m.b) : null;
      const mine = m.a === 'player' || m.b === 'player';
      const label = m.played ? (ha ? ha.tag : '') + ' ' + (m.score ? m.score.join(':') : '') + ' ' + (hb ? hb.tag : '') : (ha ? ha.tag : '?') + 'vs' + (hb ? hb.tag : '?');
      html += '<span class="mng-cupm' + (mine ? ' mine' : '') + '">' + m.round + ' ' + esc(label) + (mine && !m.played ? ' <button data-act="play-cup">打</button>' : '') + '</span>';
    }
    if (s.season.cup.champion) {
      const champ = s.season.teams.find((t) => t.id === s.season.cup.champion);
      html += '<b>冠军 ' + esc(champ ? champ.tag : s.season.cup.champion) + '</b>';
    }
    html += '</div>';
  }
  html += '</div><div class="career-grid2">';
  const byRound = {};
  for (const f of s.season.fixtures) (byRound[f.round] = byRound[f.round] || []).push(f);
  for (let r = 1; r <= s.season.totalRounds; r++) {
    const fs = byRound[r] || [];
    html += '<div class="career-card"><div class="career-round' + (r === s.season.round ? ' cur' : '') + '">R' + r + '</div>';
    for (const f of fs) {
      const h = s.season.teams.find((t) => t.id === f.home);
      const a = s.season.teams.find((t) => t.id === f.away);
      const mine = f.home === 'player' || f.away === 'player';
      let label;
      if (f.played) label = (h ? h.tag : '') + ' ' + (f.score ? f.score.join(':') : '') + ' ' + (a ? a.tag : '');
      else if (mine) label = '我 vs ' + (a ? a.tag : '');
      else label = (h ? h.tag : '') + ' vs ' + (a ? a.tag : '');
      html += '<div class="career-fixture' + (mine ? ' mine' : '') + '"><span>' + esc(label) + '</span>' + (mine && !f.played ? '<button data-act="play">打</button>' : '') + (mine && f.played ? '<span>·' + (f.winner === 'player' ? '胜' : '负') + '</span>' : '') + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderTrain(s) {
  let html = '<div class="career-card"><h4>训练 · 剩余 ' + s.team.trainingLeft + ' 次</h4><div class="mng-roster">';
  for (const p of s.team.roster) {
    const attr = trainAttr[p.id] || 'aim';
    html += '<div class="mng-trow"><span class="mng-pname">' + esc(p.name) + '</span>' +
      '<span class="mng-ptrain">' + ATTRS.map((a) => '<span style="color:' + (a === attr ? '#ffd27a' : '') + '">' + (ATTR_CN[a] || a) + p.attrs[a] + '</span>').join('') + '</span>' +
      '<span><select data-train-attr="' + p.id + '">' + ATTRS.map((a) => '<option value="' + a + '"' + (a === attr ? ' selected' : '') + '>' + (ATTR_CN[a] || a) + '</option>').join('') + '</select></span>';
    for (const tier of TRAIN_TIERS) {
      const prev = trainingPreview(s, p, tier.key);
      html += '<button data-act="train" data-pid="' + p.id + '" data-attr-select="' + p.id + '" data-tier="' + tier.key + '">' + tier.label + '¥' + money(prev.cost) + '(+' + prev.gained + ')</button>';
    }
    html += '<button data-act="rest" data-pid="' + p.id + '">休</button></div>';
  }
  html += '</div></div>';
  html += '<div class="career-card"><h4>设施</h4><div class="mng-fac">';
  for (const f of facilityStatus(s)) {
    html += '<span>' + f.label + ' L' + f.level + '/' + f.max + ' ' + esc(f.desc) + (f.cost ? ' <button data-act="upgrade" data-fac="' + f.key + '">升¥' + money(f.cost) + '</button>' : '') + '</span>';
  }
  html += '</div></div>';
  return html;
}

function renderFinance(s) {
  const cf = cashflowForecast(s);
  const sb = seasonBudget(s);
  const fr = financialRisk(s);
  const tp = transferProfit(s);
  let html = '<div class="career-card"><h4>财务 · ' + fr.level + '</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>¥' + money(s.team.bank) + '</b><span>现金</span></div>' +
    '<div class="career-kpi"><b>¥' + money(cf.projected) + '</b><span>季末预测</span></div>' +
    '<div class="career-kpi"><b>¥' + money(sb.budget) + '</b><span>预算</span></div>' +
    '<div class="career-kpi"><b>¥' + money(sponsorIncome(s)) + '</b><span>赞助</span></div>' +
    '<div class="career-kpi"><b>' + s.manager.seasonStats.w + '胜</b><span>' + s.manager.seasonStats.l + '负</span></div>' +
    '<div class="career-kpi"><b>¥' + money(tp.sellTotal - tp.buyTotal) + '</b><span>转会盈亏</span></div>' +
    '</div>' + (fr.reasons.length ? '<div class="mng-advice">' + fr.reasons.map(esc).join(' · ') + '</div>' : '') + '</div>';
  html += '<div class="career-grid2"><div class="career-card"><h4>资金流水</h4>' + ledgerRecent(s, 20).map((l) => '<div class="career-news">' + esc(l.label) + ' ' + (l.type === 'income' ? '+' : '-') + money(l.amount) + '</div>').join('') + '</div>';
  html += '<div class="career-card"><h4>生涯</h4>' +
    '<div class="career-kpis"><div class="career-kpi"><b>¥' + money(s.records.totalPrize) + '</b><span>生涯奖金</span></div><div class="career-kpi"><b>' + s.records.cupChampions + '</b><span>杯赛冠军</span></div></div>' +
    s.history.map((hh) => '<div class="career-news">S' + hh.seasonId + ' ' + esc(hh.league) + ' 第' + hh.rank + '名 ¥' + money(hh.prize) + '</div>').join('') + '</div></div>';
  return html;
}

function onClick(e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const act = t.getAttribute('data-act');
  const s = getState();
  if (act === 'tab') { tab = t.getAttribute('data-tab') || 'dash'; render(); }
  else if (act === 'menu') { el('managerPanel').style.display = 'none'; if (game.ui) game.ui.showMenu(); }
  else if (act === 'play') {
    el('managerPanel').style.display = 'none';
    startManagerMatch(game, null, null, false);
  } else if (act === 'sim') {
    const f = nextFixture(s);
    const opp = s.season.teams.find((x) => x.id === (f.home === 'player' ? f.away : f.home));
    const me = s.season.teams.find((x) => x.id === 'player');
    const r = simulateManagerMatch(s, me, opp, { mapId: f.mapId, league: s.team.league });
    const res = settlePlayerMatch(s, r.winner === 'player', 0, 0, { mvp: null });
    toast(res && res.ok ? (r.winner === 'player' ? '模拟：获胜' : '模拟：落败') : '模拟完成');
    render();
  } else if (act === 'play-cup') {
    el('managerPanel').style.display = 'none';
    startManagerMatch(game, null, null, true);
  } else if (act === 'next-season') {
    nextSeason();
    toast('新赛季开始');
    render();
  } else if (act === 'buy') {
    const r = buyPlayer(s, t.getAttribute('data-cid'));
    toast(r.ok ? '买入成功' : (r.msg || '买入失败'));
    render();
  } else if (act === 'sell') {
    const r = sellPlayer(s, t.getAttribute('data-pid'));
    toast(r.ok ? '已卖出，回款 ' + r.refund : (r.msg || '卖出失败'));
    render();
  } else if (act === 'renew') {
    const r = renewPlayer(s, t.getAttribute('data-pid'));
    toast(r.ok ? '续约成功' : (r.msg || '续约失败'));
    render();
  } else if (act === 'rest') {
    const r = restPlayer(s, t.getAttribute('data-pid'));
    toast(r.ok ? '已休息' : (r.msg || '失败'));
    render();
  } else if (act === 'train') {
    const selId = t.getAttribute('data-attr-select');
    const sel = selId && doc.querySelector ? doc.querySelector('[data-train-attr="' + selId + '"]') : null;
    const attr = (sel && sel.value) || 'aim';
    trainAttr[selId] = attr;
    const r = trainPlayer(s, t.getAttribute('data-pid'), attr, t.getAttribute('data-tier'));
    toast(r.ok ? '训练完成 ' + (ATTR_CN[attr] || attr) + ' +' + r.gained : (r.msg || '训练失败'));
    render();
  } else if (act === 'upgrade') {
    const r = upgradeFacility(s, t.getAttribute('data-fac'));
    toast(r.ok ? '升级成功' : (r.msg || '升级失败'));
    render();
  } else if (act === 'evt') {
    respondEvent(s, t.getAttribute('data-evt'), t.getAttribute('data-pid'), t.getAttribute('data-choice'));
    render();
  }
}

function onChange(e) {
  const target = e && e.target;
  const filter = target && target.getAttribute ? target.getAttribute('data-filter') : null;
  const trainSel = target && target.getAttribute ? target.getAttribute('data-train-attr') : null;
  if (trainSel) { trainAttr[trainSel] = target.value; return; }
  if (!filter) return;
  if (filter === 'role') transferRole = target.value || '';
  else if (filter === 'sort') transferSort = target.value || 'rating';
  render();
}

export function __renderManagerTabForTest(name, stateRef) { tab = name; render(); }
