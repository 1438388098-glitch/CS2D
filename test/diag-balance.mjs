// test/diag-balance.mjs — CS2D AI 平衡诊断（只读调查，不修改任何 src/ 源码）
// 用法:
//   node test/diag-balance.mjs static                 → 地图静态分析(anchors/LOS/clearChains/交叉火力)
//   node test/diag-balance.mjs match <map> <diff>     → 单配置对战模拟 (diff 可为 hell10)
//   node test/diag-balance.mjs all                    → 默认网格 (dust2 easy/normal/hard/hell10 + canal/metro normal)
//   node test/diag-balance.mjs bench                  → 1v1 TTK 基准表
//   node test/diag-balance.mjs exp                    → 实验组 (react 乘子 / eval 设置 / clean5)
// 公共选项: --rounds N --seeds N
import { installStubs, registerUiIds } from './stubdom.js';
installStubs();
registerUiIds();

import { createGame, startMatch, update } from '../src/game.js';
import { ROUND, resolveDiff } from '../src/config.js';
import { loadMap, getMap, findMapById, los, passableTolerant, aStar, nearestWalkable, tileAt } from '../src/map.js';
import { createEntity } from '../src/entities.js';
import { seedWorld, mulberry32 } from '../src/ctx.js';

const args = process.argv.slice(2);
const getArg = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
const cmd = args[0];
const MAPS = ['dust2', 'canal', 'metro'];
const GRID = [
  ['dust2', 'easy'], ['dust2', 'normal'], ['dust2', 'hard'], ['dust2', 'hell10'],
  ['canal', 'normal'], ['metro', 'normal']
];
const ROUNDS = parseInt(getArg('--rounds', '8'), 10);
const SEEDS = parseInt(getArg('--seeds', '3'), 10);

let masterRng = mulberry32(20260804);
globalThis.Math.random = () => masterRng();

const D = { smokes: [] };
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : '--');
const avg = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

function bootMatch(mapId, diff, hellLevel, seed) {
  seedWorld(seed * 7919 + 101);
  const g = createGame({ team: 'ct', diff, bots: 5, mapId, hellLevel });
  g.seed = seed;
  startMatch(g);
  g.player.dead = true;
  return g;
}

// ============================================================
// 1. 地图静态分析
// ============================================================
function mapStatic(mapId) {
  loadMap(findMapById(mapId));
  const m = getMap();
  const out = {
    mapId, W: m.W, H: m.H, tile: m.tile,
    spawns: { t0: m.spawns.t[0], ct0: m.spawns.ct[0], tN: m.spawns.t.length, ctN: m.spawns.ct.length },
    sites: {}, entries: {}, lanes: {}, holds: {}, clearChains: {}, los: {}
  };
  const tsp = nearestWalkable(m.spawns.t[0].x, m.spawns.t[0].y);
  for (const key of ['A', 'B']) {
    const s = m.sites[key];
    if (!s) continue;
    out.sites[key] = { cx: Math.round(s.cx), cy: Math.round(s.cy), w: Math.round(s.x1 - s.x0), h: Math.round(s.y1 - s.y0) };
    const st = nearestWalkable(s.cx, s.cy);
    const path = tsp && st ? aStar(tsp.x, tsp.y, st.x, st.y) : null;
    let pathLenPx = 0;
    if (path) for (let i = 1; i < path.length; i++) pathLenPx += Math.hypot((path[i].x - path[i - 1].x) * m.tile, (path[i].y - path[i - 1].y) * m.tile);
    out.sites[key].pathLenPx = Math.round(pathLenPx);
    const e = m.entries && m.entries[key];
    out.entries[key] = e ? { x: Math.round(e.x), y: Math.round(e.y), dToSite: Math.round(Math.hypot(e.x - s.cx, e.y - s.cy)) } : null;
    const lanes = (m.lanes && m.lanes[key]) || [];
    out.lanes[key] = lanes.map((l) => ({ x: Math.round(l.x), y: Math.round(l.y), dToSite: Math.round(Math.hypot(l.x - s.cx, l.y - s.cy)) }));
    const anchors = (m.holds && m.holds[key] && m.holds[key].anchors) || [];
    out.holds[key] = anchors.map((a) => {
      const faceDeg = Math.round(a.face * 180 / Math.PI);
      const faceToEntryDeg = e ? Math.round(Math.atan2(e.y - a.y, e.x - a.x) * 180 / Math.PI) : null;
      return {
        x: Math.round(a.x), y: Math.round(a.y),
        dToSite: Math.round(Math.hypot(a.x - s.cx, a.y - s.cy)),
        dToEntry: e ? Math.round(Math.hypot(a.x - e.x, a.y - e.y)) : 0,
        faceDeg, faceToEntryDeg, h: tileAt(a.x, a.y) === '^' ? 1 : 0
      };
    });
    const cc = (m.clearChains && m.clearChains[key]) || [];
    out.clearChains[key] = {
      n: cc.length,
      first: cc[0] ? { x: Math.round(cc[0].x), y: Math.round(cc[0].y), dToSite: Math.round(cc[0].dist) } : null,
      last: cc.length ? { x: Math.round(cc[cc.length - 1].x), y: Math.round(cc[cc.length - 1].y), dToSite: Math.round(cc[cc.length - 1].dist) } : null
    };
  }
  // —— LOS 覆盖：T 行进走廊（出生点→入口）与进点末段（距点120-460px）——
  for (const key of ['A', 'B']) {
    const s = m.sites[key];
    const anchors = (m.holds && m.holds[key] && m.holds[key].anchors) || [];
    const st = nearestWalkable(s.cx, s.cy);
    const tsp2 = nearestWalkable(m.spawns.t[0].x, m.spawns.t[0].y);
    const path = tsp2 && st ? aStar(tsp2.x, tsp2.y, st.x, st.y) : [];
    const corridor = [], siteSeg = [];
    for (const p of path) {
      const px = p.x * m.tile + m.tile / 2, py = p.y * m.tile + m.tile / 2;
      const d = Math.hypot(px - s.cx, py - s.cy);
      if (d >= 460) corridor.push({ x: px, y: py });
      else if (d > 120) siteSeg.push({ x: px, y: py });
    }
    out.los[key] = {
      corridorN: corridor.length, siteN: siteSeg.length,
      anchors: anchors.map((a) => {
        const vis = (list) => list.filter((p) => los(D, a.x, a.y, p.x, p.y, a.h)).length;
        const lanes = (m.lanes && m.lanes[key]) || [];
        const flankVis = lanes.map((l) => (los(D, a.x, a.y, l.x, l.y, a.h) ? 1 : 0));
        return {
          dToSite: Math.round(Math.hypot(a.x - s.cx, a.y - s.cy)),
          corridorPct: corridor.length ? Math.round(vis(corridor) / corridor.length * 100) : 100,
          sitePct: siteSeg.length ? Math.round(vis(siteSeg) / siteSeg.length * 100) : 100,
          flanks: flankVis.join('')
        };
      })
    };
    const e = m.entries && m.entries[key];
    if (e) {
      const visible = anchors.filter((a) => los(D, e.x, e.y, a.x, a.y, a.h));
      const angs = visible.map((a) => Math.atan2(a.y - e.y, a.x - e.x));
      let spread = 0;
      for (let i = 0; i < angs.length; i++) for (let j = i + 1; j < angs.length; j++) {
        let d = Math.abs(angs[i] - angs[j]); d = Math.min(d, Math.PI * 2 - d);
        spread = Math.max(spread, d);
      }
      out.los[key].fromEntry = { visible: visible.length, total: anchors.length, spreadDeg: Math.round(spread * 180 / Math.PI) };
    }
  }
  return out;
}

// ============================================================
// 2. 单场对局（N 回合）统计
// ============================================================
function runMatch(mapId, diff, hellLevel, seed, opts = {}) {
  const rounds = opts.rounds || ROUNDS;
  let g;
  if (opts.evalStyle) {
    // fitness.js 评估语义：diff=normal 基线 + T 队注入 H10 aiParams（applyRoundParams 生效）
    // + 加速回合(40s/buy0.3/freeze0.2) + 玩家转 bot 但不出售(第6个CT)
    seedWorld(seed * 7919 + 101);
    g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId });
    g.seed = seed;
    startMatch(g);
    const params = resolveDiff('hell', 10);
    for (const e of g.entities) {
      if (e.bot && e.team === 't') e.aiParams = params;
      if (e.bot && e.team === 'ct') e.aiParams = null;
    }
    g.player.bot = true;
    g.player.dead = false;
    g.roundDur = 40;
    g.buyTime = 0.3;
    g.freezeT = 0.2;
  } else {
    g = bootMatch(mapId, diff, hellLevel, seed);
    if (opts.ctReactOverride !== undefined) g.ctReactionMult = opts.ctReactOverride;
    if (g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
  }

  const R = [];
  let lastRound = g.round, cur = null;
  let prevDead = new Map(), prevReac = new Map(), prevHigh = new Map(), prevNet = new Map();
  let prevTScore = 0, prevCTScore = 0, endCaptured = false;
  let lastShotSeen = new Map();
  const maxTicks = Math.ceil(rounds * (opts.evalStyle ? 50 : 135) * 30) + 9000;

  for (let i = 0; i < maxTicks; i++) {
    if (opts.clean5 && g.state === 'BUY' && !g.player.dead) g.player.dead = true;
    if (!opts.evalStyle && g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
    update(g, 1 / 30);
    const rt = g.roundTime || 0;

    if (g.state === 'LIVE') {
      if (!cur) {
        cur = {
          liveAt: g.time, plan: g.roundPlan ? g.roundPlan.execution : '?',
          site: g.tAttackSite, rush: !!(g.roundPlan && g.roundPlan.rush),
          buys: {}, nades0: { t: 0, ct: 0 }, end: null,
          firstKill: null, firstKillTeam: null, firstContact: null, firstShooter: null,
          tDeaths: [], ctDeaths: [], reactions: { t: [], ct: [] },
          highMoves: 0, net: { t: {}, ct: {} },
          tMinSite: Infinity, carrierSiteT: null, plantedAt: null,
          lostNades: { t: 0, ct: 0 }, carrierId: null
        };
        const carry = g.entities.find((e) => e.bot && e.team === 't' && e.hasBomb);
        cur.carrierId = carry ? carry.name : null;
        const cs = g.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
        cur.siteC = { cx: cs.cx, cy: cs.cy };
        for (const e of g.entities) {
          if (!e.bot) continue;
          lastShotSeen.set(e.name, e.lastShot);
          const k = e.team;
          cur.buys[k] = cur.buys[k] || { n: 0, rifle: 0, smg: 0, armor: 0, helmet: 0, kit: 0, nades: 0, money: 0 };
          const b = cur.buys[k]; b.n++;
          const w = e.weapons && e.weapons.primary;
          if (w === 'ak' || w === 'm4' || w === 'awp') b.rifle++;
          else if (w === 'mac10' || w === 'mp9' || w === 'p90' || w === 'xm') b.smg++;
          if (e.armor > 0) b.armor++;
          if (e.helmet) b.helmet++;
          if (e.weapons && e.weapons.kit) b.kit++;
          if (e.weapons && e.weapons.nades) {
            const n = e.weapons.nades.he + e.weapons.nades.flash + e.weapons.nades.smoke;
            b.nades += n; cur.nades0[k] += n;
          }
          b.money += e.money;
        }
      }
      const cs = cur.siteC;
      // 持包者
      if (cur.carrierId) {
        const carry = g.entities.find((e) => e.name === cur.carrierId);
        if (carry && !carry.dead && carry.hasBomb) {
          const d = Math.hypot(carry.x - cs.cx, carry.y - cs.cy);
          if (d < cur.tMinSite) cur.tMinSite = d;
          if (d < 150 && cur.carrierSiteT === null) cur.carrierSiteT = rt;
        } else if (cur.carrierSiteT === null && cur.tMinSite < 200 && cur.plantedAt === null) {
          // 持包者死于近点（<200px 视为进点后死亡）
          cur.carrierSiteT = rt;
        }
      }
      if (g.bomb && g.bomb.planted && cur.plantedAt === null) cur.plantedAt = rt;
      // 反应/高台换位/netAct/死亡 采样
      for (const e of g.entities) {
        if (!e.bot) continue;
        const key = e.name;
        // 死亡翻转
        if (e.dead && !prevDead.get(key)) {
          prevDead.set(key, true);
          const d = { t: rt, name: key };
          if (e.team === 't') cur.tDeaths.push(d); else cur.ctDeaths.push(d);
          if (!cur.firstKill) { cur.firstKill = rt; cur.firstKillTeam = e.team; }
          if (e.weapons && e.weapons.nades) {
            cur.lostNades[e.team] += e.weapons.nades.he + e.weapons.nades.flash + e.weapons.nades.smoke;
          }
        } else if (!e.dead) {
          prevDead.set(key, false);
        }
        // 首次开火
        if (e.lastShot > (lastShotSeen.get(key) || 0) && !cur.firstShooter && !e.dead) {
          cur.firstShooter = { t: rt, team: e.team };
        }
        // 反应采样（acquire 时刻, +dt 还原 set 值）
        if (e.aimTarget && !e.aimTarget.dead && e.aimTarget.team !== e.team) {
          if (!prevReac.get(key)) {
            prevReac.set(key, true);
            cur.reactions[e.team].push(e.reaction + 1 / 30);
          }
        } else {
          prevReac.set(key, false);
        }
        // 高台换位
        if (e.team === 'ct' && e.highPointT > 0 && prevHigh.get(key) === 0) cur.highMoves++;
        prevHigh.set(key, e.highPointT > 0 ? 1 : 0);
        // netAct 分布
        if (e.netAct && e.netAct !== prevNet.get(key)) {
          cur.net[e.team][e.netAct] = (cur.net[e.team][e.netAct] || 0) + 1;
          prevNet.set(key, e.netAct);
        }
      }
      // 首接触
      if (!cur.firstContact) {
        const fc = g.entities.find((e) => e.bot && !e.dead && e.aimTarget && !e.aimTarget.dead && e.aimTarget.team !== e.team);
        if (fc) cur.firstContact = { t: rt, dist: Math.hypot(fc.x - fc.aimTarget.x, fc.y - fc.aimTarget.y), team: fc.team };
      }
    } else {
      if (cur && g.state === 'END' && !endCaptured) {
        endCaptured = true;
        const tWin = g.score.T > prevTScore;
        const ctWin = g.score.CT > prevCTScore;
        let reason = 'elimination';
        if (rt >= g.roundDur - 0.01 && !(g.bomb && g.bomb.planted)) reason = 'timeout';
        else if (g.bomb && g.bomb.planted && tWin) reason = 'bomb';
        else if (!g.bomb && ctWin) reason = 'defuse';
        let nadeEnd = { t: 0, ct: 0 };
        for (const e of g.entities) {
          if (!e.bot) continue;
          if (e.weapons && e.weapons.nades) nadeEnd[e.team] += e.weapons.nades.he + e.weapons.nades.flash + e.weapons.nades.smoke;
        }
        cur.end = {
          winner: tWin ? 't' : 'ct', reason, dur: rt, planted: !!(g.bomb && g.bomb.planted),
          nadeUsedT: Math.max(0, cur.nades0.t - nadeEnd.t - cur.lostNades.t),
          nadeUsedCT: Math.max(0, cur.nades0.ct - nadeEnd.ct - cur.lostNades.ct),
          ctPush: !!g.ctPush
        };
        R.push(cur);
      } else if (!cur) {
        // LIVE 未进入即结束（异常），忽略
      }
    }
    if (g.round !== lastRound) {
      prevTScore = g.score.T; prevCTScore = g.score.CT;
      lastRound = g.round;
      endCaptured = false;
      cur = null;
      prevDead.clear(); prevReac.clear(); prevHigh.clear(); prevNet.clear();
      lastShotSeen.clear();
      if (lastRound - 1 >= rounds) break;
      if (!opts.evalStyle && g.state === 'BUY' && g.buyTime > 1) { g.buyTime = 0.8; g.freezeT = 0.3; }
    }
  }
  return { mapId, diff, hellLevel, seed, rounds: R.length, roundsStats: R };
}

// ============================================================
// 3. 聚合输出
// ============================================================
function summarize(label, results) {
  const R = results.flatMap((r) => r.roundsStats);
  const n = R.length;
  if (n === 0) return { label, n: 0 };
  const tWins = R.filter((r) => r.end && r.end.winner === 't').length;
  const reasons = {};
  for (const r of R) if (r.end) reasons[r.end.reason] = (reasons[r.end.reason] || 0) + 1;
  const planted = R.filter((r) => r.plantedAt !== null).length;
  const carrierReach = R.filter((r) => r.carrierSiteT !== null).length;
  const durs = R.filter((r) => r.end).map((r) => r.end.dur);
  const fk = R.filter((r) => r.firstKill !== null);
  const fkT = R.filter((r) => r.firstKillTeam === 't').length;
  const fcDist = R.map((r) => r.firstContact && r.firstContact.dist).filter((x) => x);
  const fcT = R.filter((r) => r.firstContact && r.firstContact.team === 't').length;
  const fsT = R.filter((r) => r.firstShooter && r.firstShooter.team === 't').length;
  const reactions = { t: [], ct: [] };
  const tSurv = [], ctSurv = [];
  for (const r of R) {
    reactions.t.push(...r.reactions.t);
    reactions.ct.push(...r.reactions.ct);
    const endDur = r.end ? r.end.dur : 115;
    for (const d of r.tDeaths) tSurv.push(d.t);
    for (const d of r.ctDeaths) ctSurv.push(d.t);
  }
  const nadeT = R.filter((r) => r.end).map((r) => r.end.nadeUsedT);
  const nadeCT = R.filter((r) => r.end).map((r) => r.end.nadeUsedCT);
  const highMoves = R.map((r) => r.highMoves);
  const net = { t: {}, ct: {} };
  for (const r of R) for (const k of ['t', 'ct']) for (const [a, c] of Object.entries(r.net[k])) net[k][a] = (net[k][a] || 0) + c;
  const buys = { t: { rifle: 0, smg: 0, armor: 0, nades: 0, n: 0, money: 0 }, ct: { rifle: 0, smg: 0, armor: 0, nades: 0, n: 0, money: 0 } };
  for (const r of R) for (const k of ['t', 'ct']) if (r.buys && r.buys[k]) {
    buys[k].rifle += r.buys[k].rifle; buys[k].smg += r.buys[k].smg; buys[k].armor += r.buys[k].armor;
    buys[k].nades += r.buys[k].nades; buys[k].n += r.buys[k].n; buys[k].money += r.buys[k].money;
  }
  const plans = {};
  for (const r of R) plans[r.plan] = (plans[r.plan] || 0) + 1;
  const tWinDurs = R.filter((r) => r.end && r.end.winner === 't').map((r) => r.end.dur);
  const ctWinDurs = R.filter((r) => r.end && r.end.winner === 'ct').map((r) => r.end.dur);
  return {
    label, n,
    tWinPct: Math.round(tWins / n * 100),
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    plantedPct: Math.round(planted / n * 100),
    carrierReachPct: Math.round(carrierReach / n * 100),
    avgDur: fmt(avg(durs)),
    tWinDur: tWinDurs.length ? fmt(avg(tWinDurs)) : '--',
    ctWinDur: ctWinDurs.length ? fmt(avg(ctWinDurs)) : '--',
    avgFirstKill: fk.length ? fmt(avg(fk.map((r) => r.firstKill))) : '--',
    fkT: fk.length ? Math.round(fkT / fk.length * 100) : 0,
    fcT: R.length ? Math.round(fcT / R.length * 100) : 0,
    fcDist: fcDist.length ? fmt(avg(fcDist)) : '--',
    fsT: R.length ? Math.round(fsT / R.length * 100) : 0,
    reactT: reactions.t.length ? fmt(avg(reactions.t)) : '--',
    reactCT: reactions.ct.length ? fmt(avg(reactions.ct)) : '--',
    reactTN: reactions.t.length, reactCTN: reactions.ct.length,
    tSurv: tSurv.length ? fmt(avg(tSurv)) : '--',
    ctSurv: ctSurv.length ? fmt(avg(ctSurv)) : '--',
    nadeT: fmt(avg(nadeT)), nadeCT: fmt(avg(nadeCT)),
    highPerRound: fmt(avg(highMoves)),
    net,
    riflePerTeam: { t: fmt(buys.t.rifle / (buys.t.n || 1)), ct: fmt(buys.ct.rifle / (buys.ct.n || 1)) },
    armorPct: { t: Math.round(buys.t.armor / (buys.t.n || 1) * 100), ct: Math.round(buys.ct.armor / (buys.ct.n || 1) * 100) },
    nadePerTeam: { t: fmt(buys.t.nades / (buys.t.n || 1)), ct: fmt(buys.ct.nades / (buys.ct.n || 1)) },
    moneyPerBot: { t: Math.round(buys.t.money / (buys.t.n || 1)), ct: Math.round(buys.ct.money / (buys.ct.n || 1)) },
    plans
  };
}

function printSummary(s) {
  if (!s.n) { console.log(`  [${s.label}] 无数据`); return; }
  console.log(`== ${s.label} ==`);
  console.log(`  T胜率 ${s.tWinPct}% (${s.n}回合) | 结束原因: ${s.reasons.map(([r, c]) => r + ':' + c).join(' ')}`);
  console.log(`  安弹 ${s.plantedPct}% | 持包进点 ${s.carrierReachPct}% | 均回合 ${s.avgDur}s (T胜${s.tWinDur}s/CT胜${s.ctWinDur}s) | 首杀 ${s.avgFirstKill}s (T先死${s.fkT}%)`);
  console.log(`  首接触T方 ${s.fcT}% (距离${s.fcDist}px) | 首发T方 ${s.fsT}%`);
  console.log(`  反应实测(估) T ${s.reactT}s(n=${s.reactTN}) / CT ${s.reactCT}s(n=${s.reactCTN}) | T存活 ${s.tSurv}s / CT存活 ${s.ctSurv}s`);
  console.log(`  道具消耗/回合 T ${s.nadeT} / CT ${s.nadeCT} | 高台换位/回合 ${s.highPerRound}`);
  console.log(`  起枪/队 T ${s.riflePerTeam.t} / CT ${s.riflePerTeam.ct} | 甲率 T ${s.armorPct.t}% / CT ${s.armorPct.ct}% | 道具/队 T ${s.nadePerTeam.t} / CT ${s.nadePerTeam.ct} | 余钱/人 T${s.moneyPerBot.t} CT${s.moneyPerBot.ct}`);
  if (Object.keys(s.net.t).length || Object.keys(s.net.ct).length) {
    const fmtN = (o) => Object.entries(o).map(([a, c]) => a + ':' + c).join(' ');
    console.log(`  netAct动作分布 T[${fmtN(s.net.t)}] CT[${fmtN(s.net.ct)}]`);
  }
  console.log(`  T战术: ${Object.entries(s.plans).sort((a, b) => b[1] - a[1]).map(([p, c]) => p + ':' + c).join(' ')}`);
}

// ============================================================
// 4. 1v1 TTK 基准
// ============================================================
function findDuelSpot(mapId) {
  loadMap(findMapById(mapId));
  const m = getMap();
  for (let y = 80; y < m.H - 80; y += 100) {
    for (let x = 80; x < m.W - 480; x += 100) {
      if (!passableTolerant(x, y) || !passableTolerant(x + 400, y)) continue;
      if (!los(D, x, y, x + 400, y, 0)) continue;
      let ok = true;
      for (const k of ['A', 'B']) {
        const s = m.sites[k];
        if (!s) continue;
        for (const [px, py] of [[x, y], [x + 400, y]]) {
          if (Math.hypot(px - s.cx, py - s.cy) < 750) { ok = false; break; }
        }
      }
      if (ok) return [{ x, y }, { x: x + 400, y }];
    }
  }
  return null;
}

function duelBench(diff, hellLevel, opts = {}) {
  const spot = findDuelSpot('dust2');
  if (!spot) { console.log('  找不到决斗场地'); return null; }
  const params = resolveDiff(diff, hellLevel || 10);
  const wins = { t: 0, ct: 0 };
  const ttks = [], fT = [], fC = [], shT = [], shC = [];
  const N = opts.n || 24;
  for (let s = 0; s < N; s++) {
    seedWorld(s * 104729 + 3);
    const g = createGame({ team: 'ct', diff: 'normal', bots: 5, mapId: 'dust2' });
    g.seed = s;
    startMatch(g);
    if (opts.ctReact !== undefined) g.ctReactionMult = opts.ctReact;
    g.entities.length = 0;
    g.player.dead = true;
    const t = createEntity('t', true), c = createEntity('ct', true);
    t.aiParams = params; c.aiParams = params;
    t.role = 'mid'; c.role = 'mid';
    for (const e of [t, c]) {
      e.x = e.team === 't' ? spot[0].x : spot[1].x;
      e.y = e.team === 't' ? spot[0].y : spot[1].y;
      e.weapons.primary = e.team === 't' ? (opts.weaponT || 'ak') : (opts.weaponC || 'ak');
      e.slot = 'primary';
      e.ammoMap[e.weapons.primary] = 90;
      e.reserveMap[e.weapons.primary] = 90;
      e.armor = 100; e.helmet = true;
      e.dead = false; e.hp = 100; e.reaction = 0;
      e.crouched = false; e.vx = 0; e.vy = 0; e.walking = false;
      e.highPointT = 0; e.prefireCount = 0; e.shotStreak = 0; e.strafeT = 0;
    }
    t.angle = Math.atan2(c.y - t.y, c.x - t.x);
    c.angle = Math.atan2(t.y - c.y, t.x - c.x);
    g.entities.push(t, c, g.player);
    g.state = 'LIVE'; g.buyTime = 0; g.freezeT = 0; g.roundTime = 0; g.roundDur = 300;
    const shotT = { t: null, c: null }, startT = g.time;
    let winner = null, ttk = null;
    for (let i = 0; i < 9000; i++) {
      update(g, 1 / 30);
      if (shotT.t === null && t.lastShot > 0) shotT.t = g.time - startT;
      if (shotT.c === null && c.lastShot > 0) shotT.c = g.time - startT;
      if (t.dead || c.dead) { winner = t.dead ? 'ct' : 't'; ttk = g.time - startT; break; }
      if (g.time - startT > 120) break;
    }
    if (winner) wins[winner]++;
    if (ttk !== null) ttks.push(ttk);
    if (shotT.t !== null) fT.push(shotT.t);
    if (shotT.c !== null) fC.push(shotT.c);
    shT.push(t.shots || 0); shC.push(c.shots || 0);
  }
  return {
    label: opts.label || (diff + (hellLevel ? '@' + hellLevel : '')),
    tWinPct: Math.round(wins.t / N * 100),
    avgTTK: fmt(avg(ttks)), n: ttks.length,
    firstShotT: fT.length ? fmt(avg(fT)) : '--', firstShotC: fC.length ? fmt(avg(fC)) : '--',
    shotsT: fmt(avg(shT)), shotsC: fmt(avg(shC))
  };
}

function printBench(b) {
  if (!b) return;
  console.log(`  1v1[${b.label}] T胜 ${b.tWinPct}% | TTK ${b.avgTTK}s(n=${b.n}) | T首发 ${b.firstShotT}s / CT首发 ${b.firstShotC}s | 弹量 T ${b.shotsT} / CT ${b.shotsC}`);
}

// ============================================================
// 主流程
// ============================================================
function main() {
  if (cmd === 'static') {
    for (const m of MAPS) {
      const s = mapStatic(m);
      console.log(`\n===== 地图 ${s.mapId} (${s.W}x${s.H}) T出生${JSON.stringify([s.spawns.t0.x, s.spawns.t0.y])} CT出生${JSON.stringify([s.spawns.ct0.x, s.spawns.ct0.y])} =====`);
      for (const k of ['A', 'B']) {
        const site = s.sites[k];
        console.log(`  [${k}区] 中心(${site.cx},${site.cy}) ${site.w}x${site.h} | T出生→点内 ${site.pathLenPx}px | 入口 ${JSON.stringify(s.entries[k])}`);
        console.log(`    lanes: ${JSON.stringify(s.lanes[k])}`);
        console.log(`    anchors: ${JSON.stringify(s.holds[k])}`);
        console.log(`    clearChains: n=${s.clearChains[k].n} first=${JSON.stringify(s.clearChains[k].first)} last=${JSON.stringify(s.clearChains[k].last)}`);
        console.log(`    LOS覆盖[走廊%/进点%/侧翼lanes]: ${JSON.stringify(s.los[k].anchors)}`);
        console.log(`    交叉火力(入口可见/total, 角度散布): ${JSON.stringify(s.los[k].fromEntry)}`);
      }
    }
    return;
  }
  if (cmd === 'bench') {
    console.log('\n===== 1v1 TTK 基准 (dust2 400px, 全甲+盔, CT反应乘子0.6) =====');
    printBench(duelBench('easy', null, { n: 24 }));
    printBench(duelBench('normal', null, { n: 24 }));
    printBench(duelBench('hard', null, { n: 24 }));
    printBench(duelBench('hell', 10, { n: 24 }));
    printBench(duelBench('hell', 10, { n: 24, ctReact: 1.0, label: 'H10 无CT乘子' }));
    printBench(duelBench('normal', null, { n: 24, ctReact: 1.0, label: 'normal 无CT乘子' }));
    printBench(duelBench('normal', null, { n: 24, weaponC: 'm4', label: 'normal AK vs M4' }));
    return;
  }
  if (cmd === 'exp') {
    const runs = (mapId, diff, hl, extra) => {
      const list = [];
      for (let s = 1; s <= SEEDS; s++) list.push(runMatch(mapId, diff, hl, s, extra));
      return list;
    };
    console.log('\n===== 实验组 =====');
    console.log('-- A. canal: CT反应乘子 0.04 → 1.0（运行时覆写，不改源码）--');
    printSummary(summarize('canal normal 基线', runs('canal', 'normal', null, {})));
    printSummary(summarize('canal normal react=1.0', runs('canal', 'normal', null, { ctReactOverride: 1.0 })));
    console.log('-- B. dust2: 全难度 CT反应乘子 0.6 → 1.0 --');
    for (const d of ['easy', 'normal', 'hard']) {
      printSummary(summarize(`dust2 ${d} 基线`, runs('dust2', d, null, {})));
      printSummary(summarize(`dust2 ${d} react=1.0`, runs('dust2', d, null, { ctReactOverride: 1.0 })));
    }
    printSummary(summarize('dust2 hell10 基线', runs('dust2', 'hell', 10, {})));
    printSummary(summarize('dust2 hell10 react=1.0', runs('dust2', 'hell', 10, { ctReactOverride: 1.0 })));
    console.log('-- C. H10: fitness.js 评估设置 vs 部署态 --');
    printSummary(summarize('dust2 hell10 部署态', runs('dust2', 'hell', 10, {})));
    printSummary(summarize('dust2 hell10 评估态(eval-style)', runs('dust2', 'hell', 10, { evalStyle: true })));
    console.log('-- D. 干净 5v5 vs 观战语义(第2回合起玩家复活站桩) --');
    printSummary(summarize('dust2 normal 观战语义', runs('dust2', 'normal', null, {})));
    printSummary(summarize('dust2 normal 干净5v5', runs('dust2', 'normal', null, { clean5: true })));
    return;
  }
  if (cmd === 'match') {
    const mapId = args[1] || 'dust2', diff = args[2] || 'normal';
    const d2 = diff === 'hell10' ? 'hell' : diff;
    const hl = diff === 'hell10' ? 10 : null;
    const runs = [];
    for (let s = 1; s <= SEEDS; s++) runs.push(runMatch(mapId, d2, hl, s, {}));
    printSummary(summarize(`${mapId} ${diff} (${SEEDS}seed x ${ROUNDS}回合)`, runs));
    return;
  }
  console.log(`\n===== 主网格: ${SEEDS} seeds x ${ROUNDS} 回合/配置 =====`);
  for (const [mapId, diff] of GRID) {
    const d2 = diff === 'hell10' ? 'hell' : diff;
    const hl = diff === 'hell10' ? 10 : null;
    const runs = [];
    for (let s = 1; s <= SEEDS; s++) runs.push(runMatch(mapId, d2, hl, s, {}));
    printSummary(summarize(`${mapId} ${diff}`, runs));
  }
}

main();
