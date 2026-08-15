import { registerMode } from './registry.js';
import { setupMatchEntities, startRound, endRound } from './game.js';
import { teamDiffParams } from './modes.js';
import { ROLE_ARCHE, sameTeamBonus, getState, settlePlayerMatch, nextFixture, MATCH_WIN_LIMIT, MATCH_MAX_ROUNDS } from './manager.js';
import { clamp } from './utils.js';
import { ctx } from './ctx.js';

function emit(evt, p) { ctx.bus.emit(evt, p); }

export function mapManagerRosterToBots(roster, bots, state, side) {
  const base = teamDiffParams({ rating: Math.round(roster.reduce((a, p) => a + p.rating, 0) / Math.max(1, roster.length)) });
  const bonus = state && state.team ? sameTeamBonus(state) : null;
  for (let i = 0; i < bots.length; i++) {
    const p = roster[i % roster.length];
    const a = p.attrs || {};
    const morale = (p.morale != null ? p.morale : 50) - 50;
    const fatigue = (p.fatigue != null ? p.fatigue : 0) - 50;
    const formScore = (p.form || []).reduce((sum, f) => sum + (f === 'W' ? 1 : -1), 0);
    const e = bots[i];
    e.name = p.name;
    e.persona = ROLE_ARCHE[p.role] || 'rifler';
    const params = {
      ...base,
      react: clamp(0.22 - (a.react || 70) / 625, 0.06, 0.22),
      aimSpeed: 40 + (a.react || 70) * 0.9,
      spreadMult: clamp(1.1 - (a.aim || 70) / 200, 0.5, 1.05),
      prefireChance: clamp((a.aim || 70) / 800, 0, 0.12),
      strafe: clamp(0.6 - (a.movement || 70) / 400, 0.36, 0.6),
      counterStrafe: clamp(1.1 - (a.movement || 70) / 500, 0.8, 1.1),
      saveChance: clamp(0.75 - (a.clutch || 70) / 400, 0.3, 0.75),
      riskT: clamp(0.6 + (a.clutch || 70) / 250 + (a.aggression || 50) / 800 + (a.gameIQ || 50) / 1500, 0.3, 1.5),
      nadeUse: clamp(0.6 + (a.nade || 70) / 250, 0.25, 1.2),
      ecoDiscipline: clamp(0.8 + (a.discipline || 50) / 400, 0.5, 1.2),
      rotateChance: clamp(0.5 + (a.gameIQ || 50) / 250, 0.2, 0.9),
      rushChance: clamp(0.3 + (a.aggression || 50) / 300, 0.05, 0.9),
      spreadCtrl: clamp(0.9 + (a.discipline || 50) / 800, 0.8, 1.15),
      tradeSpeed: p.role === '补枪' ? 1.5 : 1.1
    };
    if (a.composure != null && a.composure < 50) params.riskT *= 0.85;
    const moraleMul = 1 + morale / 1000;
    const fatigueMul = 1 - clamp(fatigue, -50, 40) / 400;
    const formMul = 1 + formScore * 0.015;
    const m = clamp(moraleMul * fatigueMul * formMul, 0.85, 1.15);
    params.spreadMult = clamp(params.spreadMult * (1 + (1 - m) * 0.3), 0.5, 1.1);
    params.strafe = clamp(params.strafe * (1 + (1 - m) * 0.25), 0.36, 0.65);
    params.react = clamp(params.react * (1 + (1 - m) * 0.15), 0.05, 0.24);
    if (bonus) { params.react *= (1 + bonus.react); params.spreadMult *= (1 + bonus.spreadMult); }
    e.aiParams = params;
  }
}

export function startManagerMatch(game, oppId, venue, isCup) {
  game.seed = Math.floor(Math.random() * 0x7fffffff);
  game.opts.mode = 'manager';
  game.opts.team = 'ct';
  game.opts.bots = 5;
  game.opts.mapId = 'dust2';
  game.opts.diff = 'hard';
  game.opts.diffParams = null;
  return startMatch(game);
}

export function managerStart(game) {
  for (const k of ['cyber', 'major']) delete game[k];
  const s = getState();
  const f = nextFixture(s);
  if (!f && s.season.cup.phase !== 'active') { emit('toast', { text: '没有待进行的比赛' }); return; }
  const isCup = s.season.cup.phase === 'active';
  let opp;
  if (isCup) {
    const m = s.season.cup.bracket.find((x) => !x.played && (x.a === 'player' || x.b === 'player'));
    if (!m) { emit('toast', { text: '杯赛已结束' }); return; }
    opp = s.season.teams.find((t) => t.id === (m.a === 'player' ? m.b : m.a));
    game.opts.mapId = f ? (f.mapId || 'dust2') : 'dust2';
  } else {
    opp = s.season.teams.find((t) => t.id === (f.home === 'player' ? f.away : f.home));
    game.opts.mapId = f.mapId || 'dust2';
  }
  if (!opp) { emit('toast', { text: '找不到对手' }); return; }
  game.entities = [];
  setupMatchEntities(game);
  game.entities = game.entities.filter((e) => e.bot);
  game.player = { dead: true, kills: 0, deaths: 0, assists: 0, team: 'ct', name: '经理', x: 0, y: 0, vx: 0, vy: 0, angle: 0, height: 0, weapons: {}, ammoMap: {}, reserveMap: {}, wKills: {}, stats: { hits: 0, shots: 0, headshots: 0 } };
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  const myRoster = s.team.roster.slice().sort((a, b) => (a.role === '指挥' ? -1 : b.role === '指挥' ? 1 : 0));
  const myRating = Math.round(myRoster.reduce((a, p) => a + p.rating, 0) / Math.max(1, myRoster.length));
  const isHome = !isCup && f.home === 'player';
  mapManagerRosterToBots(isHome ? myRoster : opp.roster, tBots, s, 't');
  mapManagerRosterToBots(isHome ? opp.roster : myRoster, cBots, s, 'ct');
  game.manager = {
    oppId: opp.id, oppName: opp.name, oppTag: opp.tag, oppRating: opp.rating,
    myRating, isHome, isCup, scoreLimit: MATCH_WIN_LIMIT, speed: 1, skip: false, ended: false,
    settled: false
  };
  startRound(game);
  emit('toast', { text: '我的战队 vs ' + opp.name + ' 开赛' });
}

function managerPanelHtml(game) {
  const g = game.manager;
  const myTeam = g.isHome ? 't' : 'ct';
  const oppTeam = g.isHome ? 'ct' : 't';
  const myBots = game.entities.filter((e) => e.bot && e.team === myTeam);
  const oppBots = game.entities.filter((e) => e.bot && e.team === oppTeam);
  const myKills = myBots.reduce((sum, e) => sum + (e.kills || 0), 0);
  const oppKills = oppBots.reduce((sum, e) => sum + (e.kills || 0), 0);
  const myScore = game.score[myTeam === 't' ? 'T' : 'CT'];
  const oppScore = game.score[oppTeam === 't' ? 'T' : 'CT'];
  const leader = game.entities.filter((e) => e.bot && !e.dead).sort((a, b) => b.kills - a.kills)[0];
  const mapId = game.opts.mapId || 'dust2';
  return '<div class="cyber-panel">' +
    '<div class="cyber-card c-left"><b>我方</b><span>我的战队</span><i>' + g.myRating + '</i><em>' + myScore + ' · ' + myKills + ' 击杀</em></div>' +
    '<div class="cyber-mid"><b>' + myScore + ' : ' + oppScore + '</b><span>R' + game.round + ' · ' + mapId + '</span>' +
    '<em>' + (game.manager.isHome ? '主场' : '客场') + ' · 比分</em></div>' +
    '<div class="cyber-card c-right"><b>' + g.oppName + '</b><span>对手</span><i>' + g.oppRating + '</i><em>' + oppScore + ' · ' + oppKills + ' 击杀</em></div>' +
    '<div class="cyber-controls"><button data-m-speed="1" class="cyber-speed' + (g.speed === 1 ? ' on' : '') + '">1x</button><button data-m-speed="2" class="cyber-speed' + (g.speed === 2 ? ' on' : '') + '">2x</button><button data-m-speed="4" class="cyber-speed' + (g.speed === 4 ? ' on' : '') + '">4x</button><button data-m-speed="8" class="cyber-speed' + (g.speed === 8 ? ' on' : '') + '">8x</button><button data-m-skip="1" class="cyber-skip">跳过本回合</button></div>' +
    (leader ? '<div class="cyber-mvp">MVP ' + leader.name + ' · ' + leader.kills + ' 击杀</div>' : '') +
    '</div>';
}

function bindPanel(game) {
  const el = typeof document !== 'undefined' ? document.getElementById('managerMatchPanel') : null;
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = managerPanelHtml(game);
  if (!el._mBound) {
    el.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-m-speed],[data-m-skip]') : null;
      if (!b || !game.manager) return;
      if (b.hasAttribute('data-m-speed')) game.manager.speed = Number(b.getAttribute('data-m-speed')) || 1;
      else if (b.hasAttribute('data-m-skip')) game.manager.skip = true;
    }, false);
    el._mBound = true;
  }
}

function finishManagerMatch(game, tWon) {
  const g = game.manager;
  if (!g || g.settled) return;
  g.settled = true;
  const s = getState();
  const myWon = g.isHome ? tWon : !tWon;
  const result = settlePlayerMatch(s, myWon, 0, 0, { mvp: null });
  const el = typeof document !== 'undefined' ? document.getElementById('managerMatchPanel') : null;
  if (el) el.style.display = 'none';
  game.over = true;
  game.state = 'END';
  game.noRoundEnd = true;
  emit('banner', { t1: myWon ? '获胜' : '落败', t2: '比分 ' + game.score.T + ':' + game.score.CT, col: myWon ? '#ffd27a' : '#ff4d4d' });
  if (myWon) emit('sfx', { name: 'win', vol: 0.9, game });
  else emit('sfx', { name: 'lose', vol: 0.8, game });
  if (result && result.ok && typeof window !== 'undefined' && window.__managerEndMatch) window.__managerEndMatch(game);
}

export function managerUpdate(game, dt) {
  const g = game.manager;
  if (!g || g.ended || game.over) return;
  if (g.skip) {
    g.skip = false;
    if (game.state !== 'END') endRound(game, null, '本回合跳过', 'skip');
    game.endedT = 0.05;
    return;
  }
  if (game.spectate) game.spectate.speed = g.speed || 1;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (g._panelT || 0) > 150) {
    g._panelT = now;
    bindPanel(game);
  }
  const limit = g.scoreLimit || MATCH_WIN_LIMIT;
  const afterLimit = game.round > MATCH_MAX_ROUNDS;
  const tWon = game.score.T >= limit || (afterLimit && game.score.T > game.score.CT);
  const cWon = game.score.CT >= limit || (afterLimit && game.score.CT > game.score.T);
  if (tWon || cWon) {
    g.ended = true;
    finishManagerMatch(game, tWon);
  }
}

export function managerOnFinish(game) {
  const g = game.manager;
  if (!g || g.settled) return;
  const s = getState();
  const winAt = game.ot ? (game.otWin || 8) : MATCH_WIN_LIMIT;
  const tWon = game.score.T >= winAt;
  const cWon = game.score.CT >= winAt;
  const myWon = g.isHome ? tWon : cWon;
  g.settled = true;
  const result = settlePlayerMatch(s, myWon, 0, 0, { mvp: null });
  const el = typeof document !== 'undefined' ? document.getElementById('managerMatchPanel') : null;
  if (el) el.style.display = 'none';
  if (result && result.ok && typeof window !== 'undefined' && window.__managerEndMatch) window.__managerEndMatch(game);
}

registerMode({
  id: 'manager', name: '电竞经理', desc: '管理战队·实机观战', customBots: false,
  start: managerStart, update: managerUpdate, onFinish: managerOnFinish
});
