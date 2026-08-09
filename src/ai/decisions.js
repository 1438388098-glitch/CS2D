// 战术目标层：CT 守点/回防/前压/保枪、T 进点/装弹/守弹/转点/绕后、玩家指令服从
import {BOT_AI, diffOf} from '../config.js';
import {getMap, nearestSite, inSite, los} from '../map.js';
import {weaponDef, ammoFor} from '../entities.js';
import {rand, clamp} from '../utils.js';
import {logAct, styleOf, canFinishDefuse, aliveCount, hasGoodGun, redistributeTLanes} from './shared.js';
import {dqnFromJSON} from '../dqn.js';
import {oppAimPoint} from './oppmodel.js';
import {shouldRetakeBomb, shouldRushDefuser, shouldRetreatWithoutBomb, pickPlantSite, shouldEscortCarrier, shouldPushLatePlant, shouldRushPlant} from './rules.js';
;
const CT_HOLD_RADIUS = 380;

export function spreadPoint(e, cx, cy, rMin = 70, rMax = 190) {
  const idx = e.spreadIdx !== undefined ? e.spreadIdx : (e.laneIdx !== undefined ? e.laneIdx : (e.anchorIdx || 0));
  const r = rMin + (idx % 3) * ((rMax - rMin) / 2);
  const side = idx % 2 ? 1 : -1;
  const ang = Math.atan2(cy - e.y, cx - e.x) + Math.PI / 2 * side + (idx % 3) * 0.45;
  return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
}

export function ctMySite(e, game) {
  const m = getMap();
  if (e.role === 'a') return m.sites.A;
  if (e.role === 'b') return m.sites.B;
  return null;
}

export function ctIsRoamer(e) {
  return e.ctRoamer === true || e.role === 'mid';
}

export function ctReactsTo(e, game, x, y) {
  const s = ctMySite(e, game);
  if (ctIsRoamer(e)) return true;
  if (!s) return true;
  return Math.hypot(x - s.cx, y - s.cy) < CT_HOLD_RADIUS ||
    Math.hypot(x - e.x, y - e.y) < 260;
}
function ctHotSite(game) {
  const m = getMap();
  let hot = null, best = 0;
  for (const k of ['A', 'B']) {
    const s = m.sites[k];
    if (!s) continue;
    let score = 0;
    for (const o of game.entities) {
      if (o.team !== 't' || o.dead) continue;
      const d = Math.hypot(o.x - s.cx, o.y - s.cy);
      if (d < 420) score += 1.6 - d / 420;
      if (o.lastShot > game.time * 1000 - 2200 && d < 600) score += 1.0;
    }
    if (score > best) { best = score; hot = k; }
  }
  return best >= 2.0 ? hot : null;
}

// ===== 决策网络（DQN 推理层，H8-H10 地狱级）=====
// 宏观动作空间：hold 守点 / push 进攻 / rotate 转点 / nade 投掷推进 / save 保枪 / peek 探身
export const NET_ACTIONS = ['hold', 'push', 'rotate', 'nade', 'save', 'peek'];
const NET_DECISION_S = 0.6;

// 13 维观察（全部归一化 [0,1]）：血量/弹药/双方存活/最近敌距/道具/时间/炸弹/持包/目标距/交战/队长/队友持包
export function netObs(e, game) {
  const m = getMap();
  const w = e.weapons && (e.weapons.primary || e.weapons.pistol);
  const ammo = w && w.mag > 0 ? Math.min((e.ammoMap && e.ammoMap[w.id] != null ? e.ammoMap[w.id] : w.mag) / w.mag, 1) : 0;
  const myAlive = game.entities.filter((o) => o.team === e.team && !o.dead).length;
  const enAlive = game.entities.filter((o) => o.team !== e.team && !o.dead).length;
  let nd = 2000;
  for (const o of game.entities) {
    if (o.team !== e.team && !o.dead) {
      const dd = Math.hypot(o.x - e.x, o.y - e.y);
      if (dd < nd) nd = dd;
    }
  }
  const nades = e.weapons && e.weapons.nades
    ? (e.weapons.nades.flash > 0 ? 1 : 0) + (e.weapons.nades.smoke > 0 ? 1 : 0) + (e.weapons.nades.he > 0 ? 1 : 0)
    : 0;
  let tx = m.W / 2, ty = m.H / 2;
  if (e.team === 't') {
    const cs = game.tAttackSite === 'A' ? m.sites.A : m.sites.B;
    tx = cs.cx; ty = cs.cy;
  } else {
    const hold = e.role === 'a' ? m.holds.A : m.holds.B;
    tx = hold.anchors[0].x; ty = hold.anchors[0].y;
  }
  // 队友持包信号（配合进点关键特征）
  let mateHasBomb = 0;
  for (const o of game.entities) {
    if (o.bot && o.team === e.team && o !== e && o.hasBomb) { mateHasBomb = 1; break; }
  }
  return [
    clamp((e.hp || 100) / 100, 0, 1),
    ammo,
    myAlive / 5,
    enAlive / 5,
    clamp(nd / 2000, 0, 1),
    nades / 3,
    clamp((game.roundTime || 0) / (game.roundDur || 115), 0, 1),
    game.bomb && game.bomb.planted ? 1 : 0,
    e.hasBomb ? 1 : 0,
    clamp(Math.hypot(e.x - tx, e.y - ty) / 2000, 0, 1),
    e.aimTarget && !e.aimTarget.dead ? 1 : 0,
    e.igl ? 1 : 0,
    mateHasBomb
  ];
}

// 网络宏观决策（带 0.6s 决策间隔缓存）；无网络（H1-H7）返回 null → 走原有逻辑
export function netAct(e, game) {
  const d = e.aiParams || diffOf(game);
  const w = d && d.netWeights;
  if (!w || (Array.isArray(w) && w.length === 0) || (typeof w === 'object' && !w.input && Object.keys(w).length === 0)) return null;
  if (e.netAct !== undefined && game.time - (e.netAt || 0) < NET_DECISION_S) return e.netAct;
  // 多图权重：{ mapId: weights } 按当前地图取，缺省回退 __default
  let weights = w;
  if (w && !w.input && !Array.isArray(w)) {
    weights = w[game.opts && game.opts.mapId] || w.__default || w;
  }
  const net = (d._net = d._net || dqnFromJSON(weights));
  const q = net.forward(netObs(e, game));
  let ai = 0;
  for (let i = 1; i < q.length; i++) if (q[i] > q[ai]) ai = i;
  e.netAct = NET_ACTIONS[ai];
  e.netAt = game.time;
  return e.netAct;
}

// 动作 → 具体目标（持包 bot 的 save 降级为守入口，不允许弃包）
function netObjective(e, game, act) {
  const m = getMap();
  const cs = e.team === 't' ? (game.tAttackSite === 'A' ? m.sites.A : m.sites.B) : null;
  const csOther = e.team === 't' ? (game.tAttackSite === 'A' ? m.sites.B : m.sites.A) : null;
  const ctHold = () => {
    const hold = e.role === 'a' ? m.holds.A : m.holds.B;
    const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
    return { x: p.x, y: p.y, face: Math.atan2(hold.entry.y - p.y, hold.entry.x - p.x) };
  };
  const tEntry = (s) => {
    const entry = entryPoint(s, game);
    return { x: entry.x + rand(-60, 60), y: entry.y + rand(-60, 60), face: Math.atan2(s.cy - entry.y, s.cx - entry.x) };
  };
  const tOtherEntry = () => {
    const entry = entryPoint(csOther, game);
    return { x: entry.x + rand(-60, 60), y: entry.y + rand(-60, 60) };
  };
  switch (act) {
    case 'hold':
      return e.team === 't' ? (e.hasBomb ? tEntry(cs) : { x: e.x + rand(-40, 40), y: e.y + rand(-40, 40) }) : ctHold();
    case 'push':
      return e.team === 't'
        ? { x: cs.cx + rand(-100, 100), y: cs.cy + rand(-60, 60) }
        : { x: m.spawns.t[0].x + rand(-120, 120), y: m.spawns.t[0].y + rand(-80, 80) };
    case 'rotate':
      // IGL 拍板才翻转全队攻击点（协同转点）；其余成员前往另一站点入口待命
      if (e.igl && e.team === 't' && !(game.bomb && game.bomb.planted)) {
        game.tAttackSite = game.tAttackSite === 'A' ? 'B' : 'A';
        game.tSwitchedAt = game.roundTime;
      }
      return e.team === 't' ? tOtherEntry() : { x: (e.role === 'a' ? m.holds.B : m.holds.A).anchors[0].x, y: (e.role === 'a' ? m.holds.B : m.holds.A).anchors[0].y };
    case 'nade':
      return e.team === 't'
        ? { x: cs.cx + rand(-120, 120), y: cs.cy + rand(-60, 60), nade: true }
        : { x: m.spawns.t[0].x + rand(-80, 80), y: m.spawns.t[0].y + rand(-60, 60), nade: true };
    case 'save':
      if (e.hasBomb) return tEntry(cs);
      return retreatPoint(e, game);
    case 'peek': {
      if (e.team === 't') {
        if (e.hasBomb) return tEntry(cs);
        const entry = entryPoint(cs, game);
        return { x: entry.x, y: entry.y, peek: true };
      }
      const hold = e.role === 'a' ? m.holds.A : m.holds.B;
      const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
      return { x: p.x, y: p.y, peek: true };
    }
  }
  return null;
}

export function botObjective(e, game) {
  const now = game.time * 1000;
  const bombState = game.bomb ? (game.bomb.planted ? (game.bomb.defusing ? 'pd' + game.bomb.site : 'p' + game.bomb.site) : (game.bomb.dropped ? 'd' : 'n')) : 'n';
  // 缓存 key 必须含攻击点/热区/持包状态：IGL 转点或 hotSite 变化后立即失效，防走过时目标
  // objBombState 为旧字段名（测试/外部调用兼容），新代码统一写 objKey
  const hot = game.hotSiteCache ? (game.hotSiteCache.site || '-') : '-';
  const cacheKey = bombState + '|' + (game.tAttackSite || '') + '|' + hot + '|' + (e.hasBomb ? 1 : 0) + '|' + (e.netLane || '-');
  const cacheTtl = e.objCache && e.objCache.search ? 600 : 3000;
  const keyHit = e.objKey === cacheKey || e.objBombState === bombState;
  // 新鲜个人情报强制失效：有近期目击记忆/枪声感知时跳过 3 秒缓存，让 CT 转点/T 执行即时响应
  const freshIntel = e.lastKnown && e.lastKnownT !== undefined && now - e.lastKnownT < 1000;
  if (e.objCache && keyHit && !freshIntel && now - e.objAt < cacheTtl) return e.objCache;
  const o = botObjectiveRaw(e, game);
  if (o && (!Number.isFinite(o.x) || !Number.isFinite(o.y))) return null;
  e.objCache = o;
  e.objAt = now;
  e.objKey = cacheKey;
  return o;
}

export function retreatPoint(e, game) {
  const spawns = e.team === 't' ? getMap().spawns.t : getMap().spawns.ct;
  const cands = spawns && spawns.length ? spawns : [{ x: getMap().W / 2, y: getMap().H / 2 }];
  const enemies = game.entities.filter((o) => o.team !== e.team && !o.dead);
  let best = cands[0], bestScore = -Infinity;
  for (const s of cands) {
    let minD = 1e9;
    for (const o of enemies) minD = Math.min(minD, Math.hypot(o.x - s.x, o.y - s.y));
    const fromMe = Math.hypot(s.x - e.x, s.y - e.y);
    const fromIntel = e.lastKnown ? Math.hypot(s.x - e.lastKnown.x, s.y - e.lastKnown.y) : 0;
    const score = minD * 1.2 - fromMe * 0.15 + fromIntel * 0.6;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return { x: best.x, y: best.y, sneak: true };
}

function nearestPreaim(cs, from) {
  const pts = (getMap().preaimPoints || []).filter((pp) => pp.site === cs.label);
  let best = null, bd = Infinity;
  for (const pp of pts) {
    const d = Math.hypot(pp.x - from.x, pp.y - from.y);
    if (d < bd) { bd = d; best = pp; }
  }
  return best;
}

function nextClearPoint(e, cs) {
  const pts = (getMap().clearChains && getMap().clearChains[cs.label]) || (getMap().clearPoints || []).filter((pp) => pp.site === cs.label);
  if (!pts.length) return null;
  const toCenter = Math.hypot(e.x - cs.cx, e.y - cs.cy);
  let best = null, bestScore = Infinity;
  for (const pp of pts) {
    const pd = Math.hypot(pp.x - cs.cx, pp.y - cs.cy);
    if (pd > toCenter - 20 || pd > toCenter + 240) continue;
    const d = Math.hypot(pp.x - e.x, pp.y - e.y);
    if (d < 100 || d > 460) continue;
    const score = d + pd * 0.15;
    if (score < bestScore) { bestScore = score; best = pp; }
  }
  if (!best) return null;
  const pre = nearestPreaim(cs, best);
  return {
    x: best.x, y: best.y, face: best.face, peek: true, search: true,
    preaimX: pre ? pre.x : best.x,
    preaimY: pre ? pre.y : best.y
  };
}

function tSitePoint(e, cs) {
  const idx = e && e.laneIdx !== undefined ? e.laneIdx : 0;
  const side = idx % 2 ? 1 : -1;
  const r = 80 + (idx % 3) * 50;
  const ang = Math.atan2(cs.cy - e.y, cs.cx - e.x) + Math.PI / 2 * side;
  return { x: cs.cx + Math.cos(ang) * r, y: cs.cy + Math.sin(ang) * r, peek: true };
}

function entryPoint(cs, game, e) {
  const m = getMap();
  const key = cs && (cs.label === 'A' || cs.label === 'B') ? cs.label : (cs === m.sites.A ? 'A' : 'B');
  const realEntry = m.entries && m.entries[key];
  const lanes = m.lanes && m.lanes[key];
  if (lanes && lanes.length) {
    let idx = e && e.laneIdx !== undefined ? e.laneIdx % lanes.length : 0;
    const occ = lanes.map((p) => game.entities.filter((o) => o.bot && o.team === e.team && o !== e && Math.hypot(o.x - p.x, o.y - p.y) < 120).length);
    if (occ[idx] > 0 && lanes.length > 1) idx = (idx + 1) % lanes.length;
    const lane = lanes[idx];
    const mid = Math.floor(lanes.length / 2);
    const spreadIdx = e && (e.spreadIdx !== undefined ? e.spreadIdx : (e.laneIdx !== undefined ? e.laneIdx : 0));
    const spread = (spreadIdx - mid) * 112;
    const ang = Math.atan2(cs.cy - lane.y, cs.cx - lane.x) + Math.PI / 2;
    return {
      x: lane.x + Math.cos(ang) * spread,
      y: lane.y + Math.sin(ang) * spread,
      face: Math.atan2(cs.cy - lane.y, cs.cx - lane.x)
    };
  }
  if (realEntry) return { x: realEntry.x, y: realEntry.y };
  const sp = m.spawns.t[0];
  if (!sp) return { x: cs.cx - 380, y: cs.cy };
  const dx = cs.cx - sp.x, dy = cs.cy - sp.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: cs.cx - dx / len * 380, y: cs.cy - dy / len * 380 };
}

export function botObjectiveRaw(e, game) {
  const planted = !!(game.bomb && game.bomb.planted);
  const st = styleOf(e);
  // 玩家战术指令（已装弹时不覆盖守/拆弹目标；TTL 15s；低团队性 bot 可能无视指令——有性格）
  const order = !planted ? game.tOrder : null;
  if (order && game.roundTime - order.at < BOT_AI.ORDER_TTL && rand() < st.p.teamwork) {
    if (order.type === 'siteA' || order.type === 'siteB') {
      const cs = order.type === 'siteA' ? getMap().sites.A : getMap().sites.B;
      if (cs) return { x: cs.cx + rand(-80, 80), y: cs.cy + rand(-60, 60) };
    }
    if (order.type === 'hold') return { x: order.x + rand(-50, 50), y: order.y + rand(-50, 50) };
    if (order.type === 'follow' && game.player && !game.player.dead) {
      return { x: game.player.x + rand(-80, 80), y: game.player.y + rand(-80, 80) };
    }
  }
  if (e.team === 't') {
    // H11 信息优势：intel 模式回合初选择防守薄弱侧进攻（弱点透视级决策，用户授权 B 方案）
    if (e.aiParams && e.aiParams.intel && game.h11Intel && game.roundTime < 2 && !(game.bomb && game.bomb.planted)) {
      const def = game.h11Intel.roles;
      const cntA = def.filter((r) => r.role === 'a').length;
      const cntB = def.filter((r) => r.role === 'b').length;
      const weak = cntA < cntB ? 'A' : (cntB < cntA ? 'B' : game.tAttackSite);
      if (weak !== game.tAttackSite && game.roundTime < 2) {
        game.tAttackSite = weak;
        game.tSwitchedAt = game.roundTime;
        logAct(game, e, 'intel', '防守分布→选弱侧 ' + weak);
      }
    }
    // H11 战术协同（intel 模式）：回合初全员同步 rush 攻击点（打先手，避免慢推进被逐个击破）
    if (e.aiParams && e.aiParams.intel && game.roundTime < 1 && !(game.bomb && game.bomb.planted) && !e.hasBomb) {
      const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
      logAct(game, e, 'syncrush', '同步 rush ' + game.tAttackSite + ' 点');
      return { x: cs.cx + rand(-140, 140), y: cs.cy + rand(-80, 80), nade: true };
    }
  }
  if (e.team === 'ct') {
    if (planted) {
      const retakeAng = (e.anchorIdx || 0) * 1.7;
      return { x: game.bomb.x + Math.cos(retakeAng) * 45, y: game.bomb.y + Math.sin(retakeAng) * 45 };
    }
    const ctAlive = game.entities.filter((o) => o.team === 'ct' && !o.dead && o !== e).length;
    const tAlive = game.entities.filter((o) => o.team === 't' && !o.dead).length;
    // 残局劣势保枪（风险偏好：莽的 bot 不保）
    if (ctAlive === 0 && tAlive >= 3 && rand() < (e.aiParams || diffOf(game)).saveChance * (1 - st.p.riskT * 0.5)) {
      logAct(game, e, 'retreat', '1v' + tAlive + ' 保枪');
      return retreatPoint(e, game);
    }
    // 听枪回防（全角色生效，不再只限 a/b 守点）
    const hotSite = ctHotSite(game);
    const mySiteKey = ctMySite(e, game);
    const myKey = mySiteKey ? mySiteKey.label : null;
    if (hotSite && hotSite !== myKey) {
      const hot = getMap().sites[hotSite];
      const defendersHere = game.entities.filter((o) => o.team === 'ct' && !o.dead && o !== e && o.role === (myKey ? myKey.toLowerCase() : 'x')).length;
      if (ctIsRoamer(e) || defendersHere >= 1) {
        logAct(game, e, 'rotate', 'hot ' + hotSite);
        return { x: hot.cx + rand(-80, 80), y: hot.cy + rand(-60, 60) };
      }
    }
    const now = game.time * 1000;
    let heard = null;
    for (const o of game.entities) {
      if (o.team === 't' && !o.dead && now - o.lastShot < BOT_AI.HEAR_TTL) {
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d < BOT_AI.HEAR_RADIUS && (!heard || d < heard.d)) {
          heard = { x: o.x, y: o.y, d };
        }
      }
    }
    if (heard && ctReactsTo(e, game, heard.x, heard.y)) return { x: heard.x, y: heard.y };
    // 决策网络（H8-H10）：常规守点/前压由网络拍板，反应层（保枪/听枪）保持优先
    const nAct = netAct(e, game);
    if (nAct) {
      const no = netObjective(e, game, nAct);
      if (no) { logAct(game, e, nAct, 'net'); return no; }
    }
    // 前压侦察：IGL 拍板（game.ctPush），攻击性 bot 更积极，其余随队
    if (game.ctPush && ctIsRoamer(e) && rand() < 0.8 * st.p.aggression) {
      const sp = getMap().spawns.t[0];
      if (sp) {
        const dx = sp.x - e.x, dy = sp.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        logAct(game, e, 'push', '前压侦察');
        return { x: e.x + dx / len * 380 + rand(-90, 90), y: e.y + dy / len * 380 + rand(-90, 90) };
      }
    }
    const siteHighs = (getMap().highPoints || []).filter((hp) => hp.site === (e.role === 'a' ? 'A' : e.role === 'b' ? 'B' : 'mid'));
    if (siteHighs.length && (e.role === 'a' || e.role === 'b') && !planted && e.highPointT <= 0 && rand() < 0.18) {
      e.highIdx = (e.highIdx || 0) + 1;
      const hp = siteHighs[e.highIdx % siteHighs.length];
      e.highPointT = 8;
      return { x: hp.x, y: hp.y, face: hp.face };
    }
    if (e.role === 'a' || e.role === 'b') {
      const hold = e.role === 'a' ? getMap().holds.A : getMap().holds.B;
      const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
      return { x: p.x, y: p.y, face: Math.atan2(hold.entry.y - p.y, hold.entry.x - p.x) };
    }
    // mid：守 T 主攻方向的对侧点（5 人全守，避免中心游走送死）
    const ctMidSpawn = getMap().spawns.ct[0];
    if (ctMidSpawn) return { x: ctMidSpawn.x + rand(-90, 90), y: ctMidSpawn.y + rand(-90, 90) };
    const m2 = game.tAttackSite === 'A' ? getMap().holds.B : getMap().holds.A;
    return { x: m2.anchors[0].x, y: m2.anchors[0].y };
  }
  if (planted) {
    if (game.bomb.defusing) {
      for (const ce of game.entities) {
        if (ce.team === 'ct' && !ce.dead && Math.hypot(ce.x - game.bomb.x, ce.y - game.bomb.y) < 80) {
          return { x: ce.x, y: ce.y };
        }
      }
    }
    const site2 = game.bomb.site === 'A' ? getMap().sites.A : getMap().sites.B;
    if (e.guardPointSite !== game.bomb.site || e.guardPoint === null) {
      const guardIdx = e.anchorIdx || 0;
      const guardAlive = Math.max(1, game.entities.filter((o) => o.team === 't' && !o.dead).length);
      const guardAng = guardIdx / guardAlive * Math.PI * 2 + (e.igl ? 0.6 : 0);
      const guardR = 115 + (guardIdx % 2) * 55;
      e.guardPoint = { x: game.bomb.x + Math.cos(guardAng) * guardR, y: game.bomb.y + Math.sin(guardAng) * guardR };
      e.guardPointSite = game.bomb.site;
    }
    return e.guardPoint;
  }
  if (game.bomb && game.bomb.dropped) return { x: game.bomb.x, y: game.bomb.y };
  if (e.hasBomb) {
    const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    // 残局时间管理：回合末期距点过远则保枪放弃安弹
    if (game.roundTime > (game.roundDur || 115) - 18 && Math.hypot(e.x - cs.cx, e.y - cs.cy) > 650) {
      return retreatPoint(e, game);
    }
    // 已在点附近则直接进点安弹；否则在入口等队友清点（不在交火中冲点送死）
    if (Math.hypot(e.x - cs.cx, e.y - cs.cy) < 300 || e.rushMode) return { x: cs.cx, y: cs.cy };
    // 等待超时：队友迟迟不来（阵亡/被牵制）则不再干等，直接进点
    if (game.roundTime > 15) return { x: cs.cx, y: cs.cy };
    const alliesIn = game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && o !== e && Math.hypot(o.x - cs.cx, o.y - cs.cy) < 300).length;
    if (alliesIn < 1) return entryPoint(cs, game);
    return { x: cs.cx, y: cs.cy };
  }
  let planter = null;
  for (const pe of game.entities) {
    if (pe.team === 't' && pe.plantT > 0 && pe !== e) { planter = pe; break; }
  }
  if (planter) {
    const cs = nearestSite(planter.x, planter.y);
    if (e.coverSide === undefined) e.coverSide = rand() < 0.5 ? 1 : -1;
    const ang = Math.atan2(cs.cy - planter.y, cs.cx - planter.x);
    return {
      x: planter.x + Math.cos(ang) * 100 + Math.cos(ang + Math.PI / 2 * e.coverSide) * 80,
      y: planter.y + Math.sin(ang) * 100 + Math.sin(ang + Math.PI / 2 * e.coverSide) * 80
    };
  }
  if (game.roundPlan && game.roundPlan.plantPriority && !e.hasBomb && !planted && !(game.bomb && game.bomb.dropped) && e.netLane === undefined) {
    const carrier = game.entities.find((o) => o.bot && o.team === 't' && !o.dead && o.hasBomb);
    if (carrier) {
      logAct(game, e, 'eco', 'protect carrier');
      return spreadPoint(e, carrier.x, carrier.y, 70, 160);
    }
  }
  if (e.role === 'mid') {
    const midPt = getMap().mid;
    const midHoldUntil = game.roundPlan && game.roundPlan.mid ? 20 : 12;
    if (midPt && game.roundTime < midHoldUntil) return spreadPoint(e, midPt.x, midPt.y, 55, 140);
    const csMid = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    return spreadPoint(e, csMid.cx, csMid.cy, 110, 240);
  }
  const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
  // 回合初分路行进：主攻/侧翼按 role 分道（A 大 / A 小 / B 隧 / 中路），避免全员挤中路走廊
  if (e.routePoint && !e.hasBomb && !e.rushMode && e.netLane === undefined && game.roundTime < 12 && Math.hypot(e.x - e.routePoint.x, e.y - e.routePoint.y) > 220) {
    const rp = e.routePoint;
    logAct(game, e, 'route', '分路 ' + e.role + ' (' + Math.round(rp.x) + ',' + Math.round(rp.y) + ')');
    return { x: rp.x, y: rp.y };
  }
  const tPlanNow = game.roundPlan;
  if (tPlanNow && tPlanNow.fake && e.role !== game.tAttackSite && e.role !== 'mid' && !(game.bomb && game.bomb.planted) && e.netLane === undefined) {
    if (game.roundTime < 16) {
      const otherSite = getMap().sites[e.role];
      const otherEntry = getMap().entries && getMap().entries[e.role];
      logAct(game, e, 'fake', 'fake ' + e.role);
      const fakeTarget = otherEntry ? otherEntry : otherSite;
      return { ...spreadPoint(e, fakeTarget.x, fakeTarget.y, 80, 180), nade: true };
    }
    logAct(game, e, 'fake', 'rotate ' + game.tAttackSite);
    return entryPoint(cs, game, e);
  }
  if ((e.role === 'A' || e.role === 'B') && e.role !== game.tAttackSite && !(game.bomb && game.bomb.planted) && game.roundTime < 45 && e.netLane === undefined) {
    if (tPlanNow && tPlanNow.split && game.roundTime > 22) {
      logAct(game, e, 'split', 'converge ' + game.tAttackSite);
      return entryPoint(cs, game, e);
    }
    const otherSite = getMap().sites[e.role];
    const otherEntry = getMap().entries && getMap().entries[e.role];
    logAct(game, e, 'default', 'other ' + e.role);
    const defaultTarget = otherEntry ? otherEntry : otherSite;
    return spreadPoint(e, defaultTarget.x, defaultTarget.y, 80, 180);
  }
  const tAlive2 = game.entities.filter((o) => o.team === 't' && !o.dead && o !== e).length;
  const ctAlive2 = aliveCount(game, 'ct');
  // 残局劣势保枪（风险偏好：莽的 bot 不保；经济维度：有好枪更值得保，手枪局拼枪）
  const dSv2 = e.aiParams || diffOf(game);
  const goodGun2 = hasGoodGun(e);
  if (tAlive2 === 0 && ctAlive2 >= 2 && e.netLane === undefined && rand() < dSv2.saveChance * (goodGun2 ? 1.2 : 0.55) * (1 - st.p.riskT * 0.5)) {
    logAct(game, e, 'retreat', '1v' + ctAlive2 + ' 保枪');
    return retreatPoint(e, game);
  }
  // 绕后角色（lurk）：回合前期绕到 CT 半场侧翼（出生点周边蹲点），中期回归攻击点
  // sneak 标记：静步摸点（0.55 速 + 脚步半径减半 + 移动散布更低，隐蔽换取速度）
  if (st.arch.lurk && game.roundTime < 40 && !(game.bomb && game.bomb.planted) && e.netLane === undefined) {
    const ctSpawn = getMap().spawns.ct[0];
    if (ctSpawn) {
      logAct(game, e, 'lurk', '绕后至 CT 半场');
      return { x: ctSpawn.x + rand(-150, 150), y: ctSpawn.y + rand(-150, 150), sneak: true };
    }
  }
  // 决策网络（H8-H10）：进攻节奏由网络拍板（进入点/转点/投掷/保枪/探身）
  const nActT = netAct(e, game);
  if (nActT) {
    const no = netObjective(e, game, nActT);
    if (no) { logAct(game, e, nActT, 'net'); return no; }
  }
  // S3 对手建模预瞄（H11 专用）：进点前优先前往 CT 历史站位质心（合法情报）
  if (e.aiParams && e.aiParams.oppModel) {
    const aim = oppAimPoint(game, e.x, e.y, 700);
    if (aim && Math.hypot(aim.x - e.x, aim.y - e.y) > 60 && Math.hypot(aim.x - e.x, aim.y - e.y) < 500) {
      logAct(game, e, 'preaim', '对手建模预瞄');
      return { x: aim.x, y: aim.y, peek: true };
    }
  }
  if (e.rushMode || st.arch.aggression > 1.2) return { x: cs.cx + rand(-120, 120), y: cs.cy + rand(-60, 60) };
  // 协同集结：存活人数不足时全员到齐即进点（修复 1v1/2v2 死等 3 人的发呆）；人多时凑 3 人同步
  const tAlive3 = game.entities.filter((o) => o.team === 't' && !o.dead).length;
  const needAll = Math.min(3, tAlive3);
  const entry = entryPoint(cs, game);
  const here = game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && Math.hypot(o.x - entry.x, o.y - entry.y) < 300).length;
  if (here >= needAll) return { x: cs.cx + rand(-120, 120), y: cs.cy + rand(-60, 60) };
  if (game.roundTime < 12) return entry;
  return { x: cs.cx + rand(-120, 120), y: cs.cy + rand(-60, 60) };
}
