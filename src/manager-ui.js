import {
  getState, isStorageAvailable,
  nextFixture, seasonReport, teamHealth, seasonGoalProgress,
  settlePlayerMatch, simulateManagerMatch, nextSeason,
  transferWindowOpen, candidates, scoutedView, scoutingNoise,
  filterCandidates, buyPlayer, sellPlayer, renewPlayer,
  trainPlayer, restPlayer, trainingPreview, facilityStatus, upgradeFacility,
  sponsorIncome, cashflowForecast, seasonBudget, financialRisk,
  ledgerRecent, transferProfit, computeChemistry, pendingEvents, respondEvent,
  TRAIN_TIERS, ATTRS, PERSONALITY_CN, NEED_ROLES
} from './manager.js';
import { startManagerMatch } from './manager-match.js';

let doc = null;
let game = null;
let tab = 'dash';
let transferRole = '';
let transferSort = 'rating';

function el(id) { return doc ? doc.getElementById(id) : null; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(t) { if (game && game.ui) game.ui.showToast(t); }
function money(n) { return Number(n || 0).toLocaleString('zh-CN'); }
function healthColor(c) { return c === 'green' ? '#4ade80' : c === 'yellow' ? '#facc15' : '#f87171'; }
const ATTR_CN = { aim: '枪法', react: '反应', movement: '身法', clutch: '残局', nade: '道具', gameIQ: '战术', leadership: '指挥', composure: '冷静', aggression: '冲击', discipline: '纪律' };

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
  ['dash', '总览'], ['schedule', '赛程'], ['roster', '阵容'], ['transfer', '转会'],
  ['training', '训练'], ['standings', '排名'], ['cup', '杯赛'], ['finance', '财务'], ['stats', '数据']
];

function render() {
  const s = getState();
  const panel = el('managerPanel');
  if (!panel) return;
  let html = '<div class="career-top">' +
    '<span class="ct-mode">电竞经理</span>' +
    '<span class="ct-season">第 ' + s.season.id + ' 赛季 · 第 ' + s.season.round + '/' + s.season.totalRounds + ' 轮 · ' + esc(s.team.league) + '联赛' + (s.season.cup.phase !== 'idle' ? ' · 杯赛' : '') + '</span>' +
    '<span class="ct-bank">资金 ¥' + money(s.team.bank) + '</span>' +
    '<button data-act="menu">←主菜单</button></div>';
  html += '<div class="career-tabs">';
  for (const [id, label] of TABS) html += '<button class="career-tab' + (tab === id ? ' sel' : '') + '" data-act="tab" data-tab="' + id + '">' + label + '</button>';
  html += '</div><div class="career-body">';
  const rr = { dash: renderDash, schedule: renderSchedule, roster: renderRoster, transfer: renderTransfer, training: renderTraining, standings: renderStandings, cup: renderCup, finance: renderFinance, stats: renderStats }[tab] || renderDash;
  html += rr(s);
  html += '</div>';
  panel.innerHTML = html;
}

function renderDash(s) {
  const h = teamHealth(s);
  const f = nextFixture(s);
  const goal = seasonGoalProgress(s);
  let html = '<div class="career-card"><h4>战队体检</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.money) + '">' + (h.money === 'green' ? '资金健康' : h.money === 'yellow' ? '资金吃紧' : '资金告急') + '</b><span>' + money(s.team.bank) + '</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.morale) + '">' + (h.morale === 'green' ? '士气高昂' : h.morale === 'yellow' ? '士气平平' : '士气低迷') + '</b><span>' + s.team.morale + '</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.fatigue) + '">' + (h.fatigue === 'green' ? '体力充沛' : h.fatigue === 'yellow' ? '略有疲劳' : '疲劳过高') + '</b><span>团队疲劳</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.roster) + '">' + (h.roster === 'green' ? '阵容完整' : '有位置空缺') + '</b><span>' + (h.gaps.length ? h.gaps.join('、') : '五位置齐备') + '</span></div>' +
    '<div class="career-kpi"><b style="color:' + healthColor(h.stress) + '">' + (h.stress === 'green' ? '更衣室平静' : h.stress === 'yellow' ? '有小矛盾' : '更衣室紧张') + '</b><span>压力值 ' + s.team.stressSum + '</span></div>' +
    '</div>' + (h.advice.length ? '<div class="career-stats"><span>建议：' + h.advice.map(esc).join('；') + '</span></div>' : '') + '</div>';
  if (f) {
    const opp = s.season.teams.find((t) => t.id === (f.home === 'player' ? f.away : f.home));
    const isHome = f.home === 'player';
    html += '<div class="career-card"><h4>下一场 · 第 ' + f.round + ' 轮</h4>' +
      '<div class="career-stats"><b>' + esc(opp.name) + '</b> (' + opp.rating + ' 评 · ' + esc(opp.style || '未知') + ') · ' + (isHome ? '主场' : '客场') + ' · 地图 ' + esc(f.mapId) + '</div>' +
      '<div class="career-actions"><button data-act="play">开始比赛（实机观战）</button><button data-act="sim">模拟本场</button></div></div>';
  } else if (s.season.cup.phase === 'active') {
    html += '<div class="career-card"><h4>杯赛进行中</h4><div class="career-actions"><button data-act="play-cup">打杯赛</button></div></div>';
  }
  html += '<div class="career-card"><h4>赛季目标 · 董事会信任 ' + s.board.trust + '</h4>' +
    '<div class="career-stats"><span>排名目标 前 ' + goal.rank + ' · 杯赛目标 ' + (goal.cupRound >= 1 ? '进淘汰赛' : '无') + ' · 奖励 ' + money(goal.reward) + '</span></div>' +
    '<div class="career-stats"><span>' + (s.board.fired ? '⚠ 你已被解雇' : '董事会信任 ' + s.board.trust + '/100') + '</span></div></div>';
  const pe = pendingEvents(s);
  if (pe.length) {
    html += '<div class="career-card"><h4>待处理事件</h4>';
    for (const ev of pe) {
      html += '<div class="career-stats"><span>' + esc(ev.text) + '</span></div>';
      if (ev.playerId) {
        html += '<div class="career-actions">' +
          '<button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="soothe">安抚</button>' +
          '<button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="promise">承诺上场</button>' +
          '<button data-act="evt" data-evt="unhappy" data-pid="' + ev.playerId + '" data-choice="ignore">放任</button></div>';
      }
    }
    html += '</div>';
  }
  html += '<div class="career-card"><h4>事件流</h4>' + (s.news || []).slice(0, 8).map((n) => '<div class="career-news ' + (n.type === 'win' ? 'win' : n.type === 'lose' ? 'lose' : '') + '">' + esc(n.text) + '</div>').join('') + '</div>';
  return html;
}

function renderSchedule(s) {
  let html = '<div class="career-card"><h4>联赛规则 · ' + esc(s.team.league) + '</h4>' +
    '<div class="career-stats"><span>8 队双循环 14 轮 · 胜 3 分 · 甲级前6保级 · 乙级前2升级后2降级 · 丙级前2升级</span></div></div>';
  html += '<div class="career-grid2">';
  const byRound = {};
  for (const f of s.season.fixtures) (byRound[f.round] = byRound[f.round] || []).push(f);
  for (let r = 1; r <= s.season.totalRounds; r++) {
    const fs = byRound[r] || [];
    html += '<div class="career-card"><div class="career-round' + (r === s.season.round ? ' cur' : '') + '">第 ' + r + ' 轮</div>';
    for (const f of fs) {
      const h = s.season.teams.find((t) => t.id === f.home);
      const a = s.season.teams.find((t) => t.id === f.away);
      const mine = f.home === 'player' || f.away === 'player';
      let label;
      if (f.played) label = (h ? h.tag : '') + ' ' + (f.score ? f.score.join(':') : '') + ' ' + (a ? a.tag : '');
      else if (mine) label = '我的战队 vs ' + (a ? a.tag : '');
      else label = (h ? h.tag : '') + ' vs ' + (a ? a.tag : '');
      html += '<div class="career-fixture' + (mine ? ' mine' : '') + '"><span>' + esc(label) + '</span>' + (mine && !f.played ? '<button data-act="play">打</button>' : '') + (mine && f.played ? '<span>· ' + (f.winner === 'player' ? '胜' : '负') + '</span>' : '') + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderRoster(s) {
  let html = '<div class="career-card"><h4>阵容（' + s.team.roster.length + '/6）· 化学 ' + s.team.chemistry + '</h4><div class="career-roster">';
  for (const p of s.team.roster) {
    html += '<div class="career-player-card">' +
      '<b>' + esc(p.name) + '</b><span>' + esc(p.role) + ' · ' + p.rating + ' 评 · 潜力 ' + '★'.repeat(Math.max(1, Math.round(p.potential / 18))) + '</span>' +
      '<span>身价 ¥' + money(p.price) + ' · 合同 ' + p.contractYears + ' 年 · ' + p.age + ' 岁</span>' +
      '<span>士气 ' + p.morale + ' · 疲劳 ' + p.fatigue + ' · 压力 ' + p.stress + '</span>' +
      '<span>性格：' + (PERSONALITY_CN[p.personality] || p.personality) + '</span>' +
      '<div class="career-actions"><button data-act="rest" data-pid="' + p.id + '">休息</button>' +
      (p.contractYears <= 1 ? '<button data-act="renew" data-pid="' + p.id + '">续约</button>' : '') +
      (transferWindowOpen(s) ? '<button data-act="sell" data-pid="' + p.id + '">卖出</button>' : '') + '</div></div>';
  }
  html += '</div></div>';
  return html;
}

function renderTransfer(s) {
  const windowOpen = transferWindowOpen(s);
  let html = '<div class="career-card"><h4>转会窗' + (windowOpen ? '（开放中，剩余 ' + s.team.transfersLeft + ' 次）' : '（第 5-8 轮开放）') + '</h4>';
  html += '<div class="career-stats"><span>球探噪声 ±' + scoutingNoise(s) + ' · 深度球探可看精确潜力</span></div></div>';
  if (!windowOpen) return html;
  const pool = candidates(s);
  const filtered = filterCandidates(pool, { role: transferRole, sort: transferSort });
  html += '<div class="career-card"><h4>候选池</h4><div class="career-stats">' +
    '<select data-filter="role"><option value="">全部位置</option>' + NEED_ROLES.map((r) => '<option value="' + r + '"' + (transferRole === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
    '<select data-filter="sort"><option value="rating" ' + (transferSort === 'rating' ? 'selected' : '') + '>按评级</option><option value="price" ' + (transferSort === 'price' ? 'selected' : '') + '>按身价</option><option value="potential" ' + (transferSort === 'potential' ? 'selected' : '') + '>按潜力</option></select></div><div class="career-pool">';
  for (const c of filtered) {
    const v = scoutedView(c, scoutingNoise(s));
    html += '<div class="career-player-card">' +
      '<b>' + esc(c.name) + '</b><span>' + esc(c.role) + ' · 评级 ' + v.rating + ' ±' + scoutingNoise(s) + ' · 潜力 ' + '★'.repeat(v.potentialStars) + '</span>' +
      '<span>身价 ¥' + money(c.price) + ' · 年龄 ' + c.age + ' · 出身 ' + esc(c.teamOfOrigin || '自由') + '</span>' +
      '<span>性格：' + (PERSONALITY_CN[c.personality] || c.personality) + '</span>' +
      '<div class="career-actions"><button data-act="buy" data-cid="' + c.id + '">买入 ¥' + money(c.price) + '</button></div></div>';
  }
  html += '</div></div>';
  return html;
}

function renderTraining(s) {
  let html = '<div class="career-card"><h4>训练（剩余 ' + s.team.trainingLeft + ' 次）</h4><div class="career-stats"><span>提升选手单维属性</span></div></div>';
  for (const p of s.team.roster) {
    html += '<div class="career-card"><h4>' + esc(p.name) + ' · ' + esc(p.role) + '</h4><div class="career-stats">' +
      ATTRS.map((a) => '<span>' + (ATTR_CN[a] || a) + ' ' + p.attrs[a] + '</span>').join('') + '</div><div class="career-actions">';
    for (const tier of TRAIN_TIERS) {
      const prev = trainingPreview(s, p, tier.key);
      html += '<button data-act="train" data-pid="' + p.id + '" data-attr="aim" data-tier="' + tier.key + '">' + tier.label + ' 枪法 ¥' + money(prev.cost) + '</button>';
    }
    html += '</div></div>';
  }
  html += '<div class="career-card"><h4>设施</h4>';
  for (const f of facilityStatus(s)) {
    html += '<div class="career-stats"><span>' + f.label + ' Lv.' + f.level + '/' + f.max + ' · ' + esc(f.desc) + '</span>' +
      (f.cost ? '<button data-act="upgrade" data-fac="' + f.key + '">升级 ¥' + money(f.cost) + '</button>' : '') + '</div>';
  }
  html += '</div>';
  return html;
}

function renderStandings(s) {
  const table = [...s.season.standings].sort((a, b) => b.pts - a.pts || b.w - a.w);
  let html = '<div class="career-card"><h4>积分榜</h4><div class="career-table"><table><tr><th>#</th><th>队伍</th><th>场</th><th>胜</th><th>负</th><th>分</th></tr>';
  table.forEach((row, i) => {
    const t = s.season.teams.find((x) => x.id === row.teamId);
    const cls = row.teamId === 'player' ? ' class="mine"' : '';
    html += '<tr' + cls + '><td>' + (i + 1) + '</td><td>' + esc(t ? t.name : row.teamId) + '</td><td>' + row.played + '</td><td>' + row.w + '</td><td>' + row.l + '</td><td>' + row.pts + '</td></tr>';
  });
  html += '</table></div></div>';
  return html;
}

function renderCup(s) {
  if (s.season.cup.phase === 'idle') return '<div class="career-card"><h4>杯赛</h4><div class="career-stats"><span>联赛结束后开始</span></div></div>';
  const b = s.season.cup.bracket;
  let html = '<div class="career-card"><h4>淘汰赛</h4>';
  for (const m of b) {
    const ha = m.a ? s.season.teams.find((t) => t.id === m.a) : null;
    const hb = m.b ? s.season.teams.find((t) => t.id === m.b) : null;
    const mine = m.a === 'player' || m.b === 'player';
    const label = m.played ? (ha ? ha.tag : '') + ' ' + (m.score ? m.score.join(':') : '') + ' ' + (hb ? hb.tag : '') : (ha ? ha.tag : '待定') + ' vs ' + (hb ? hb.tag : '待定');
    html += '<div class="career-cup-match' + (mine ? ' mine' : '') + '"><span>' + m.round + ' · ' + esc(label) + '</span>' + (mine && !m.played ? '<button data-act="play-cup">打</button>' : '') + '</div>';
  }
  if (s.season.cup.champion) html += '<div class="career-stats"><b>冠军：' + esc(s.season.cup.champion) + '</b></div>';
  html += '</div>';
  return html;
}

function renderFinance(s) {
  const cf = cashflowForecast(s);
  const sb = seasonBudget(s);
  const fr = financialRisk(s);
  const tp = transferProfit(s);
  let html = '<div class="career-card"><h4>财务概览 · ' + fr.level + '</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>¥' + money(s.team.bank) + '</b><span>现金</span></div>' +
    '<div class="career-kpi"><b>¥' + money(cf.projected) + '</b><span>预测赛季末</span></div>' +
    '<div class="career-kpi"><b>¥' + money(sb.budget) + '</b><span>赛季预算</span></div>' +
    '<div class="career-kpi"><b>¥' + money(sponsorIncome(s)) + '</b><span>本季赞助</span></div>' +
    '</div>' + (fr.reasons.length ? '<div class="career-stats"><span>风险：' + fr.reasons.join('；') + '</span></div>' : '') + '</div>';
  html += '<div class="career-card"><h4>资金流水</h4>' + ledgerRecent(s, 30).map((l) => '<div class="career-news">' + esc(l.label) + ' · ' + (l.type === 'income' ? '+' : '-') + money(l.amount) + '</div>').join('') + '</div>';
  html += '<div class="career-card"><h4>转会盈亏</h4><div class="career-stats"><span>卖出 ¥' + money(tp.sellTotal) + ' · 买入 ¥' + money(tp.buyTotal) + '</span></div></div>';
  return html;
}

function renderStats(s) {
  let html = '<div class="career-card"><h4>赛季数据</h4><div class="career-kpis">' +
    '<div class="career-kpi"><b>' + s.manager.seasonStats.w + '胜</b><span>' + s.manager.seasonStats.l + ' 负</span></div>' +
    '<div class="career-kpi"><b>' + s.manager.seasonStats.played + '</b><span>场次</span></div>' +
    '<div class="career-kpi"><b>¥' + money(s.records.totalPrize) + '</b><span>生涯奖金</span></div>' +
    '<div class="career-kpi"><b>' + s.records.cupChampions + '</b><span>杯赛冠军</span></div>' +
    '</div></div>';
  html += '<div class="career-card"><h4>生涯</h4>' + s.history.map((hh) => '<div class="career-news">第' + hh.seasonId + '赛季 · ' + esc(hh.league) + ' · 第' + hh.rank + '名 · 奖金 ¥' + money(hh.prize) + '</div>').join('') + '</div>';
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
    const r = trainPlayer(s, t.getAttribute('data-pid'), t.getAttribute('data-attr'), t.getAttribute('data-tier'));
    toast(r.ok ? '训练完成 +' + r.gained : (r.msg || '训练失败'));
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
  if (!filter) return;
  if (filter === 'role') transferRole = target.value || '';
  else if (filter === 'sort') transferSort = target.value || 'rating';
  render();
}

export function __renderManagerTabForTest(name, stateRef) { tab = name; render(); }
