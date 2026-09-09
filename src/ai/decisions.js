// 战术目标层：CT 守点/回防/前压/保枪、T 进点/装弹/守弹/转点/绕后、玩家指令服从
import {BOT_AI, diffOf} from '../config.js';
import {getMap, nearestSite, inSite, los, nearestWalkable, walkable} from '../map.js';
import {weaponDef, ammoFor} from '../entities.js';
import {rand, clamp} from '../utils.js';
import {logAct, styleOf, canFinishDefuse, aliveCount, hasGoodGun, redistributeTLanes, alertConf, shouldRefreshObjective} from './shared.js';
import {dqnFromJSON} from '../dqn.js';
import {oppAimPoint} from './oppmodel.js';
import {shouldRetakeBomb, shouldRushDefuser, shouldRetreatWithoutBomb, pickPlantSite, shouldEscortCarrier, shouldPushLatePlant, shouldRushPlant, shouldRotateToHot, shouldThrowUtility} from './rules.js';
import {retakeRoute} from '../retake-route.js';
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

export function shouldReactToIntel(e, game, type, x, y) {
  if (e.team === 'ct') {
    if (game.bomb && game.bomb.planted) return Math.hypot(game.bomb.x - e.x, game.bomb.y - e.y) < 380;
    return ctReactsTo(e, game, x, y);
  }
  if (e.hasBomb || (game.bomb && game.bomb.planted)) return false;
  const offside = e.role !== game.tAttackSite && e.role !== 'mid';
  if (offside && (game.roundTime || 0) < 30) return false;
  return true;
}
export function ctHotSite(game) {
  const tick = Math.floor(game.time * 20);
  if (game.hotSiteCache && game.hotSiteCache.tick === tick) return game.hotSiteCache.site;
  const m = getMap();
  let hot = null, best = 0;
  let shotOnly = false;
  for (const k of ['A', 'B']) {
    const s = m.sites[k];
    if (!s) continue;
    let score = 0;
    let hasSight = false;
    const board = game.info && game.info.ct ? game.info.ct : [];
    for (const msg of board) {
      const age = game.time - msg.t;
      if (age > 6) continue;
      const d = Math.hypot(msg.x - s.cx, msg.y - s.cy);
      if (d < 420) score += (1.6 - d / 420) * (msg.type === 'sight' ? 1.5 : 1);
      if (d < 600 && (msg.type === 'shot' || msg.type === 'dmg')) score += 0.8;
      if (d < 420 && (msg.type === 'sight' || msg.type === 'focus')) hasSight = true;
    }
    if (score > best) { best = score; hot = k; shotOnly = !hasSight; }
  }
  // 阈值 1.3（原 2.0 偏高，单次目击只值 ~1.3-2.4）：单次目击也能触发热区告警，
  // 但回防配额（每站点仅 1 名轮转者）把轮转限制住，避免误报抽空站点。
  const site = best >= 1.3 ? hot : null;
  game.hotSiteCache = { tick, site };
  game.hotSiteShotOnly = site ? shotOnly : false;
  return site;
}

// ===== 决策网络（DQN 推理层，H8-H10 地狱级）=====
// 宏观动作空间：hold 守点 / push 进攻 / rotate 转点 / nade 投掷推进 / save 保枪 / peek 探身
export const NET_ACTIONS = ['hold', 'push', 'rotate', 'nade', 'save', 'peek'];
// 路线维度（团队合作训练专用）：main 主攻点 / other 另一站点 / mid 中路走廊
export const NET_LANES = ['main', 'other', 'mid'];
// 节奏维度（进攻时机）：fast 直冲打先手 / slow 摸进等队友（静步+探身，协同集结）
export const NET_PACES = ['fast', 'slow'];
// 36 输出 = 6 行为 × 3 路线 × 2 节奏（pace 最高位）
const NET_DECISION_S = 0.3;

// 13 维观察（全部归一化 [0,1]）：血量/弹药/双方存活/最近敌距/道具/时间/炸弹/持包/目标距/交战/队长/队友持包
export function netObs(e, game) {
  const m = getMap();
  const w = e.weapons && e.weapons.primary ? weaponDef(e) : null;
  const ammo = w && w.mag > 0 ? Math.min((ammoFor(e) || 0) / w.mag, 1) : 0;
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
    if (game.bomb && game.bomb.dropped) {
      const retriever = bombRetriever(game);
      if (retriever === e) { logAct(game, e, 'pickup', 'retrieve bomb'); return { x: game.bomb.x, y: game.bomb.y }; }
      if (retriever) { logAct(game, e, 'escort', 'cover retriever'); return spreadPoint(e, retriever.x, retriever.y, 60, 150); }
      return retreatPoint(e, game);
    }
    const cs = game.tAttackSite === 'A' ? m.sites.A : m.sites.B;
    tx = cs.cx; ty = cs.cy;
  } else {
    const hold = e.role === 'a' ? m.holds.A : m.holds.B;
    if (hold && hold.anchors && hold.anchors.length) { tx = hold.anchors[0].x; ty = hold.anchors[0].y; }
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

// 26 维团队观测（训练版）：13 维基础 + 5 维队友 + 3 维自身 + 5 维团队决策因子
// 团队决策因子：经济 / 武器等级 / 甲 / 队友到齐度 / 近期敌情
// 只用于团队合作训练（决策网络感知队友分布 → 学会分路/配合），不提供任何敌人"透视"信息
export function netObsTeam(e, game) {
  const base = netObs(e, game);
  if (!Array.isArray(base)) return base;
  const m = getMap();
  const mates = game.entities.filter((o) => o.bot && o.team === e.team && !o.dead && o !== e);
  let nearestMate = 2000, spreadSum = 0, spreadN = 0;
  let carrierDist = 2000;
  const site = game.tAttackSite === 'A' ? m.sites.A : m.sites.B;
  let maxMateToSite = 0;
  for (let i = 0; i < mates.length; i++) {
    const a = mates[i];
    const da = Math.hypot(a.x - e.x, a.y - e.y);
    if (da < nearestMate) nearestMate = da;
    if (a.hasBomb) carrierDist = da;
    const daSite = Math.hypot(a.x - site.cx, a.y - site.cy);
    if (daSite > maxMateToSite) maxMateToSite = daSite;
    for (let j = i + 1; j < mates.length; j++) {
      spreadSum += Math.hypot(a.x - mates[j].x, a.y - mates[j].y);
      spreadN++;
    }
  }
  const myAtSite = site ? game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && Math.hypot(o.x - site.cx, o.y - site.cy) < 400).length : 0;
  const enAtSite = site ? game.entities.filter((o) => o.bot && o.team === 'ct' && !o.dead && Math.hypot(o.x - site.cx, o.y - site.cy) < 400).length : 0;
  // 自身角色 one-hot（个人分工信息，非法透）：主攻组 / 另一站点组（mid 两组都为 0）
  const isMain = e.team === 't' ? (e.role === game.tAttackSite ? 1 : 0) : 0;
  const isOther = e.team === 't' ? (e.role !== 'mid' && e.role !== game.tAttackSite ? 1 : 0) : 0;
  // 武器等级（合法装备信息）：狙 1.0 / 步枪 0.8 / 冲锋 0.55 / 霰弹 0.5 / 手枪 0.3 / 无 0
  const wd = e.weapons && e.weapons.primary ? (weaponDef(e) || {}) : {};
  const wtier = !e.weapons || !e.weapons.primary ? 0 : wd.kind === 'sniper' ? 1 : wd.kind === 'rifle' ? 0.8 : wd.kind === 'smg' ? 0.55 : wd.kind === 'shotgun' ? 0.5 : 0.3;
  // 近期敌情（合法听觉/视觉情报）：近 2s 内 lastKnown 或听到脚步/枪声
  const freshIntel = (e.lastKnown && game.time - (e.lastKnownT || 0) < 2) || (e.lastHear && game.time - e.lastHear.t < 2) ? 1 : 0;
  // 敌方最后已知位置（合法情报，非透视）：相对自身坐标 [-1,1]，4s 内有效，无情报 → 0
  const lkFresh = e.lastKnown && game.time - (e.lastKnownT || 0) < 4;
  const lkx = lkFresh ? clamp((e.lastKnown.x - e.x) / 1600, -1, 1) : 0;
  const lky = lkFresh ? clamp((e.lastKnown.y - e.y) / 1600, -1, 1) : 0;
  // 队友当前意图广播（团队语音/雷达：最近决策的路线分布）
  let laneHist = [0, 0, 0];
  for (const a of mates) {
    const li = a.netLane ? NET_LANES.indexOf(a.netLane) : -1;
    if (li >= 0) laneHist[li]++;
  }
  const mateN = Math.max(1, mates.length);
  return [
    ...base,
    clamp(nearestMate / 2000, 0, 1),
    clamp(spreadN ? spreadSum / spreadN / 2000 : 0, 0, 1),
    clamp(carrierDist / 2000, 0, 1),
    clamp(myAtSite / 5, 0, 1),
    clamp(enAtSite / 5, 0, 1),
    // 自身身份（协同分工令牌）：spreadIdx 回合初固定 0-4，打破 5 bot 出生观测相同 → 策略可以分工
    clamp((e.spreadIdx !== undefined ? e.spreadIdx : (e.laneIdx !== undefined ? e.laneIdx : (e.anchorIdx || 0))) / 5, 0, 1),
    isMain,
    isOther,
    // 团队决策因子
    clamp((e.money || 0) / 16000, 0, 1),   // 经济：eco 局保枪 / full buy 局集中打
    wtier,                                   // 武器等级
    clamp((e.armor || 0) / 100, 0, 1),       // 甲
    clamp(maxMateToSite / 2000, 0, 1),       // 队友到齐度：最远活队友离主攻点的距离
    freshIntel,                              // 近 2s 敌情
    lkx, lky,                                // 敌方最后已知位置（相对自身）
    laneHist[0] / mateN,                     // 队友意图：主攻路线占比
    laneHist[1] / mateN,                     // 队友意图：另一站点占比
    laneHist[2] / mateN,                     // 队友意图：中路占比
    clamp((m.W || 2400) / 3200, 0, 1),       // 地图尺度（多图泛化）
    clamp((m.H || 1800) / 2400, 0, 1)
  ];
}

// 网络宏观决策（带 0.6s 决策间隔缓存）；无网络（H1-H7）返回 null → 走原有逻辑
export function netAct(e, game) {
  // 只在实战回合决策：BUY/冻结阶段不调用网络（否则出生观测会误导 IGL rotate → 全队角色被展平）
  if (game.state !== 'LIVE') return e.netAct;
  // 外部注入的决策缓存（训练/评估环境）优先 —— 游戏内无外部注入，行为不变
  if (e.netAct !== undefined && game.time - (e.netAt || 0) < NET_DECISION_S) return e.netAct;
  const d = e.aiParams || diffOf(game);
  const w = d && d.netWeights;
  if (!w || (Array.isArray(w) && w.length === 0) || (typeof w === 'object' && !w.input && Object.keys(w).length === 0)) return null;
  // 多图权重：{ mapId: weights } 按当前地图取，缺省回退 __default
  let weights = w;
  if (w && !w.input && !Array.isArray(w)) {
    weights = w[game.opts && game.opts.mapId] || w.__default || w;
  }
  // 按图缓存推理网络：d._net 挂在 aiParams 上若只存一份，跨图切换时会静默复用上一张图的权重，
  // 因此以 mapId 为 key 分桶缓存，避免热更/跨图场景用错权重。
  const mapKey = (game.opts && game.opts.mapId) || '__default';
  const cache = (d._netMap = d._netMap || {});
  const net = cache[mapKey] || (cache[mapKey] = dqnFromJSON(weights));
  const obs = net.input >= 18 ? netObsTeam(e, game) : netObs(e, game);
  if (!obs || !Array.isArray(obs)) return e.netAct;
  const q = net.forward(obs);
  let ai = 0;
  for (let i = 1; i < q.length; i++) if (q[i] > q[ai]) ai = i;
  if (q.length >= 36) {
    // 36 输出（节奏+团队训练版）：pace = idx / 18，lane = idx % 18 / 6，行为 = idx % 6
    e.netPace = NET_PACES[Math.floor(ai / (NET_ACTIONS.length * NET_LANES.length))];
    const rest = ai % (NET_ACTIONS.length * NET_LANES.length);
    e.netLane = NET_LANES[Math.floor(rest / NET_ACTIONS.length)];
    e.netAct = NET_ACTIONS[rest % NET_ACTIONS.length];
  } else if (q.length >= 18) {
    // 18 输出（团队训练版）：行为 = idx % 6，路线 = idx / 6
    e.netLane = NET_LANES[Math.floor(ai / NET_ACTIONS.length)];
    e.netAct = NET_ACTIONS[ai % NET_ACTIONS.length];
  } else {
    e.netAct = NET_ACTIONS[ai];
  }
  e.netAt = game.time;
  return e.netAct;
}

// 动作 → 具体目标（持包 bot 的 save 降级为守入口，不允许弃包）
function netObjective(e, game, act) {
  const m = getMap();
  const cs = e.team === 't' ? (game.tAttackSite === 'A' ? m.sites.A : m.sites.B) : null;
  const csOther = e.team === 't' ? (game.tAttackSite === 'A' ? m.sites.B : m.sites.A) : null;
  const laneSite = e.netLane === 'other' ? csOther : cs;
  const ctHold = () => {
    const hold = e.role === 'a' ? m.holds.A : m.holds.B;
    const anchors = hold.anchors;
    // 守点换位随机性：驻守期间低概率轮换锚点（交火中不换），避免 CT 站位每回合完全固定
    if (anchors.length > 1 && !e.aimTarget && rand() < 0.01) {
      const cur = (e._holdIdx === undefined ? e.anchorIdx : e._holdIdx) % anchors.length;
      e._holdIdx = (cur + 1 + Math.floor(rand() * (anchors.length - 1))) % anchors.length;
    }
    const p = anchors[(e._holdIdx === undefined ? e.anchorIdx : e._holdIdx) % anchors.length] || anchors[0];
    return { x: p.x, y: p.y, face: p.face !== undefined ? p.face : Math.atan2(hold.entry.y - p.y, hold.entry.x - p.x) };
  };
  const tEntry = (s) => {
    const entry = entryPoint(s, game, e);
    return { x: entry.x + rand(-60, 60), y: entry.y + rand(-60, 60), face: Math.atan2(s.cy - entry.y, s.cx - entry.x) };
  };
  const tOtherEntry = () => {
    const entry = entryPoint(csOther, game, e);
    return { x: entry.x + rand(-60, 60), y: entry.y + rand(-60, 60) };
  };
  // 路线目标（T 侧）：mid → 中路走廊；other → 另一站点入口；main → 主攻点入口/中心
  // 节奏执行：slow = 静步+探身摸进（配合等待集结）；fast = 直冲
  const paceExtra = (extra) => ({ ...(extra || {}), ...(e.netPace === 'slow' ? { sneak: true, peek: true } : {}) });
  const tLanePoint = (pushStyle, extra) => {
    if (e.team !== 't' || !cs) return null;
    if (e.netLane === 'mid') {
      const midPt = m.mid;
      if (!midPt) return null;
      return { ...spreadPoint(e, midPt.x, midPt.y, 70, 180), ...paceExtra(extra) };
    }
    if (!laneSite) return null;
    if (pushStyle) return { ...spreadPoint(e, laneSite.cx, laneSite.cy, 90, 200), ...paceExtra(extra) };
    return { ...tEntry(laneSite), ...paceExtra(extra) };
  };
  switch (act) {
    case 'hold':
      if (e.team === 't') {
        if (e.hasBomb) return tEntry(cs);
        return tLanePoint(false) || tEntry(cs);
      }
      return ctHold();
    case 'push':
      if (e.team === 't') {
        if (e.hasBomb) return tEntry(cs);
        return tLanePoint(true) || retreatPoint(e, game);
      }
      {
        const sp = m.spawns.t && m.spawns.t[0];
        if (!sp) return retreatPoint(e, game);
        return { x: sp.x + rand(-120, 120), y: sp.y + rand(-80, 80) };
      }
    case 'rotate':
      // IGL 拍板才翻转全队攻击点（协同转点）；其余成员前往另一站点入口待命
      // 冷却 8s（与 actions.js IGL 转点一致）+ 翻转后清全队目标缓存，防周期横跳
      if (e.igl && e.team === 't' && !(game.bomb && game.bomb.planted) && game.roundTime > 8 && game.roundTime - (game.tSwitchedAt || 0) > 8) {
        game.tAttackSite = game.tAttackSite === 'A' ? 'B' : 'A';
        game.tSwitchedAt = game.roundTime;
        redistributeTLanes(game);
        logAct(game, e, 'rotate', '\u8f6c\u70b9 ' + game.tAttackSite);
      }
      return e.team === 't' ? tOtherEntry() : { x: (e.role === 'a' ? m.holds.B : m.holds.A).anchors[0].x, y: (e.role === 'a' ? m.holds.B : m.holds.A).anchors[0].y };
    case 'nade': {
      const lp = tLanePoint(true);
      if (lp) return { ...lp, nade: true };
      if (e.team === 't') return { ...spreadPoint(e, cs.cx, cs.cy, 90, 210), nade: true };
      {
        const sp = m.spawns.t && m.spawns.t[0];
        if (!sp) return retreatPoint(e, game);
        return { x: sp.x + rand(-80, 80), y: sp.y + rand(-60, 60), nade: true };
      }
    }
    case 'save':
      if (e.hasBomb) return tEntry(cs);
      return retreatPoint(e, game);
    case 'peek': {
      if (e.team === 't') {
        if (e.hasBomb) return tEntry(cs);
        return tLanePoint(false, { peek: true }) || tEntry(cs);
      }
      const hold = e.role === 'a' ? m.holds.A : m.holds.B;
      const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
      return { x: p.x, y: p.y, peek: true };
    }
  }
  return null;
}

// 当前 bot 最新个人警报（lastKnown/lastHear 中取置信度更高者）；无新鲜情报返回 null
// 用于目标缓存失效判定：新警报比缓存目标"更强/更新"时，跳过 TTL 立即重算
function alertFrom(e, game) {
  const now = game.time;
  let best = null;
  if (e.lastKnown && e.lastKnownT !== undefined && e.lastKnownT < 2) {
    best = { x: e.lastKnown.x, y: e.lastKnown.y, t: now - e.lastKnownT, conf: alertConf(e.lastKnown) };
  }
  if (e.lastHear && e.lastHear.t !== undefined && now - e.lastHear.t < 1.2) {
    const cand = {
      x: e.lastHear.x !== undefined ? e.lastHear.x : e.x + Math.cos(e.lastHear.angle) * e.lastHear.dist,
      y: e.lastHear.y !== undefined ? e.lastHear.y : e.y + Math.sin(e.lastHear.angle) * e.lastHear.dist,
      t: e.lastHear.t,
      conf: alertConf(e.lastHear)
    };
    if (!best || cand.conf > best.conf || (cand.conf === best.conf && cand.t > best.t)) best = cand;
  }
  return best;
}

// 目标点吸附：生成的目标若落在不可走格（墙内），就近吸附到最近可行走格中心。
// 只修正明显落在实心墙内的点（距离偏移通常 <1 格），不影响可达目标的确定性。
export function snapObjective(o, e, game) {
  if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return o;
  const m = getMap();
  if (!m) return o;
  const T = m.tile || 16;
  const tx = Math.floor(o.x / T), ty = Math.floor(o.y / T);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return o;
  if (walkable(tx, ty)) return o;
  const near = nearestWalkable(o.x, o.y);
  if (near) return { ...o, x: near.x * T + T / 2, y: near.y * T + T / 2 };
  return o;
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
  // 警报覆盖缓存：新强警报（枪声/目击/呼叫）更新 lastKnown/lastHear 后立即失效旧目标缓存，
  // 而非等 3s TTL 到期 —— 让 CT 转点/T 执行即时响应（旧实现 now-lastKnownT 单位混用导致恒不触发）
  const alert = alertFrom(e, game);
  const oldKnown = e.objCache
    ? { ...e.objCache, t: e.objAt ? e.objAt / 1000 : 0, conf: Number.isFinite(e.objConf) ? e.objConf : alertConf(e.objCache) }
    : null;
  const alertHot = alert ? shouldRefreshObjective(oldKnown, alert, game.time) : false;
  if (e.objCache && keyHit && !alertHot && now - e.objAt < cacheTtl) return e.objCache;
  const o = botObjectiveRaw(e, game);
  if (o && (!Number.isFinite(o.x) || !Number.isFinite(o.y))) return null;
  const snapped = snapObjective(o, e, game);
  if (snapped) {
    e.objCache = snapped;
    e.objAt = now;
    e.objKey = cacheKey;
    e.objConf = alert ? alertConf(alert) : undefined;
  }
  return snapped;
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

export function shouldLateSave(e, game, enAlive, myAlive) {
  const timeLeft = (game.roundDur || 115) - (game.roundTime || 0);
  if (e.hasBomb || (game.bomb && game.bomb.planted) || (game.bomb && game.bomb.dropped)) return false;
  return timeLeft < 18 && enAlive >= myAlive;
}

export function bombRetriever(game) {
  const bomb = game.bomb;
  if (!bomb || !bomb.dropped) return null;
  const cands = game.entities.filter((o) => o.team === 't' && !o.dead && !o.hasBomb);
  if (!cands.length) return null;
  cands.sort((a, b) => {
    const da = Math.hypot(a.x - bomb.x, a.y - bomb.y) + (a.aimTarget && !a.aimTarget.dead ? 260 : 0) + Math.max(0, 100 - (a.hp || 100)) * 1.1;
    const db = Math.hypot(b.x - bomb.x, b.y - bomb.y) + (b.aimTarget && !b.aimTarget.dead ? 260 : 0) + Math.max(0, 100 - (b.hp || 100)) * 1.1;
    return da - db;
  });
  return cands[0];
}

export function chooseDefuser(ctBots, game) {
  const bomb = game.bomb;
  if (!bomb || !bomb.planted) return null;
  const alive = ctBots.filter((o) => !o.dead);
  if (!alive.length) return null;
  alive.sort((a, b) => {
    const da = Math.hypot(a.x - bomb.x, a.y - bomb.y) - ((a.weapons && a.weapons.kit) ? 350 : 0) - ((a.hp || 100) > 40 ? 80 : 0);
    const db = Math.hypot(b.x - bomb.x, b.y - bomb.y) - ((b.weapons && b.weapons.kit) ? 350 : 0) - ((b.hp || 100) > 40 ? 80 : 0);
    return da - db;
  });
  return alive[0];
}

export function clutchPlantSite(e, game, cs) {
  const timeLeft = (game.roundDur || 115) - (game.roundTime || 0);
  const curD = Math.hypot(e.x - cs.cx, e.y - cs.cy);
  if (timeLeft > 18 || curD < 420) return cs;
  const alt = nearestSite(e.x, e.y);
  if (!alt || alt === cs) return cs;
  const altD = Math.hypot(e.x - alt.cx, e.y - alt.cy);
  return altD < curD - 160 ? alt : cs;
}

function plantSiteEval(e, game, label) {
  const s = getMap().sites[label];
  if (!s) return null;
  const coverPts = ((getMap().clearPoints || []).filter((p) => p.site === label).length +
    (getMap().highPoints || []).filter((hp) => hp.site === label).length);
  const enemyNear = game.entities.filter((o) => o.team === 'ct' && !o.dead && Math.hypot(o.x - s.cx, o.y - s.cy) < 420).length;
  return {
    dist: Math.hypot(e.x - s.cx, e.y - s.cy),
    cover: Math.min(2, coverPts * 0.45),
    enemyNear
  };
}

export function supportPoint(e, game) {
  const allies = game.entities.filter((o) => o.team === e.team && !o.dead && o !== e);
  if (!allies.length) return null;
  let best = null, bd = Infinity;
  for (const a of allies) {
    const d = Math.hypot(a.x - e.x, a.y - e.y);
    if (d < bd) { bd = d; best = a; }
  }
  return best ? spreadPoint(e, best.x, best.y, 60, 130) : null;
}

export function highPointFor(e, game, siteLabel, faceTo) {
  const highs = (getMap().highPoints || []).filter((hp) => hp.site === siteLabel);
  if (!highs.length) return null;
  if (!game.highClaim || game.highClaimRound !== game.round) {
    game.highClaim = new Set();
    game.highClaimRound = game.round;
  }
  let hi = (e.laneIdx !== undefined ? e.laneIdx : (e.anchorIdx || 0)) % highs.length;
  let attempts = 0;
  while (game.highClaim.has(hi % highs.length) && attempts < highs.length) {
    hi++;
    attempts++;
  }
  const hp = highs[hi % highs.length];
  game.highClaim.add(hi % highs.length);
  return {
    x: hp.x,
    y: hp.y,
    face: hp.face !== undefined ? hp.face : (faceTo ? Math.atan2(faceTo.y - hp.y, faceTo.x - hp.x) : 0),
    index: hi % highs.length
  };
}

export function botObjectiveRaw(e, game) {
  const planted = !!(game.bomb && game.bomb.planted);
  const st = styleOf(e);
  const enAlive0 = aliveCount(game, e.team === 't' ? 'ct' : 't');
  const myAlive0 = aliveCount(game, e.team);
  if (e.hp < 25 && myAlive0 >= 2 && !e.aimTarget && !e.lastKnown && !planted && game.roundTime > 20 && rand() < 0.2) {
    const sp = supportPoint(e, game);
    if (sp) {
      logAct(game, e, 'regroup', 'low hp ally');
      return sp;
    }
  }
  if (e.hp < 40 && enAlive0 >= myAlive0 + 1 && !e.hasBomb && !planted && game.roundTime > 15 && rand() < (e.aiParams || diffOf(game)).saveChance * 0.9) {
    logAct(game, e, 'retreat', 'lowhp save');
    return retreatPoint(e, game);
  }
  // 玩家战术指令（已装弹时不覆盖守/拆弹目标；TTL 15s；低团队性 bot 可能无视指令——有性格）
  const order = !planted ? game.tOrder : null;
  if (order && game.roundTime - order.at < BOT_AI.ORDER_TTL && rand() < st.p.teamwork) {
    if (order.type === 'siteA' || order.type === 'siteB') {
      const cs = order.type === 'siteA' ? getMap().sites.A : getMap().sites.B;
      if (cs) return spreadPoint(e, cs.cx, cs.cy, 80, 180);
    }
    if (order.type === 'hold') return { x: order.x + rand(-50, 50), y: order.y + rand(-50, 50) };
    if (order.type === 'follow' && game.player && !game.player.dead) {
      return spreadPoint(e, game.player.x, game.player.y, 60, 140);
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
      return { ...spreadPoint(e, cs.cx, cs.cy, 100, 240), nade: true };
    }
  }
  if (e.team === 'ct') {
    if (planted) {
      if (game.bomb && game.bomb.timer < 4) {
        logAct(game, e, 'urgent', 'rush bomb');
        return { x: game.bomb.x, y: game.bomb.y };
      }
      // 残局时钟：安弹后真正倒计时是 game.bomb.timer（BOMB_FUSE=40），不用冻结的回合时钟。
      // 否则 T 107s 才安弹 → roundDur-roundTime 只剩 8s → 误判 retakeTime 不足 → 白保枪。
      const retakeTime = game.bomb && Number.isFinite(game.bomb.timer) ? game.bomb.timer : (game.roundDur || 115) - (game.roundTime || 0);
      const retakeDist = Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y);
      if (!shouldRetakeBomb(e, true, retakeDist, retakeTime, myAlive0, enAlive0)) {
        logAct(game, e, 'retreat', 'skip retake');
        return retreatPoint(e, game);
      }
      const ctAlive = game.entities.filter((o) => o.bot && o.team === 'ct' && !o.dead);
      const defuser = game.entities.find((o) => o.bot && o.team === 'ct' && o.defuseT > 0) || chooseDefuser(ctAlive, game);
      if (defuser === e) {
        if (!canFinishDefuse(game, e)) {
          logAct(game, e, 'retake', 'hunt no defuse time');
          const huntSpawn = getMap().spawns.t[0];
          if (huntSpawn) return spreadPoint(e, huntSpawn.x, huntSpawn.y, 80, 190);
          return spreadPoint(e, game.bomb.x, game.bomb.y, 120, 220);
        }
        return { x: game.bomb.x, y: game.bomb.y };
      }
      if (game.bomb.defusing && Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) < 700) {
        logAct(game, e, 'retake', 'guard defuser');
        return spreadPoint(e, game.bomb.x, game.bomb.y, 90, 180);
      }
      const retakeSite = getMap().sites[game.bomb.site];
      // metro 特化：CT 回防 A 点推荐路线（candidate-156）——按寻路路径选进点（近+安全侧夹击），
      // 避免旧逻辑按欧氏距离排序把"看着近、绕远路"的进点排到前面；侧翼由 anchorIdx 分配，
      // 强制侧绕行超过上限时 retakeRoute 自动退回最短侧。
      if (getMap().id === 'metro' && game.bomb.site === 'A' && retakeSite) {
        const metroSide = ((e.anchorIdx || 0) % 2) ? 'lane' : 'east';
        const rr = retakeRoute(getMap(), e.x, e.y, retakeSite, { side: metroSide });
        if (rr && rr.route && rr.route.length) {
          if (e.path === null && rr.tiles && rr.tiles.length > 1) {
            e.path = rr.tiles;
            e.pathI = 0;
            e.stuckT = 0;
            e.lastSample = { x: e.x, y: e.y };
            e.repathT = 0;
          }
          logAct(game, e, 'retake', 'metro A ' + rr.side + ' ' + rr.entryName + ' entryLen ' + rr.entryLen);
          return { x: rr.target.x, y: rr.target.y, face: rr.face !== undefined ? rr.face : Math.atan2(retakeSite.cy - rr.entry.y, retakeSite.cx - rr.entry.x), peek: true, nade: true };
        }
      }
      const retakePts = retakeSite ? (((getMap().clearChains && getMap().clearChains[retakeSite.label]) || (getMap().clearPoints || []).filter((pp) => pp.site === retakeSite.label)) || []).slice().sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)) : [];
      if (retakePts.length) {
        const rr = retakePts[(e.anchorIdx || 0) % Math.min(3, retakePts.length)];
        logAct(game, e, 'retake', 'lane ' + (e.anchorIdx || 0) + ' ' + retakeSite.label);
        return { x: rr.x, y: rr.y, face: rr.face !== undefined ? rr.face : Math.atan2(retakeSite.cy - rr.y, retakeSite.cx - rr.x), peek: true, nade: true };
      }
      const tsp = getMap().spawns.t[0];
      const bAng = tsp ? Math.atan2(tsp.y - game.bomb.y, tsp.x - game.bomb.x) : 0;
      const side = ((e.anchorIdx || 0) % 2) ? 1 : -1;
      const r = 150 + ((e.anchorIdx || 0) % 2) * 60;
      const gx = game.bomb.x + Math.cos(bAng) * r + Math.cos(bAng + Math.PI / 2 * side) * 90;
      const gy = game.bomb.y + Math.sin(bAng) * r + Math.sin(bAng + Math.PI / 2 * side) * 90;
      if (e.guardPointSite !== game.bomb.site || e.guardPoint === null) {
        e.guardPoint = { x: gx, y: gy };
        e.guardPointSite = game.bomb.site;
      }
      return e.guardPoint;
    }
    const ctAlive = game.entities.filter((o) => o.team === 'ct' && !o.dead && o !== e).length;
    const tAlive = aliveCount(game, 't');
    // 残局劣势保枪（风险偏好：莽的 bot 不保；经济维度：有好枪更值得保，手枪局拼枪）
    const dSv = e.aiParams || diffOf(game);
    const goodGun = hasGoodGun(e);
    // 残局劣势保枪改为确定性规则（同一 bot 同一回合结果一致，不再依赖 rand()）：
    // saveScore 由难度/人格/装备决定，经 (spreadIdx, round) 哈希采样，避免随机横跳
    const saveScore = dSv.saveChance * (goodGun ? 1.2 : 0.55) * (1 - st.p.riskT * 0.5);
    const detSeed = ((((e.spreadIdx !== undefined ? e.spreadIdx : (e.anchorIdx || 0)) * 2654435761) ^ ((game.round || 0) * 40503)) >>> 0) % 1000 / 1000;
    if (ctAlive === 0 && tAlive >= 3 && detSeed < saveScore) {
      logAct(game, e, 'retreat', '1v' + tAlive + ' 保枪');
      return retreatPoint(e, game);
    }
    // 听枪回防（全角色生效，不再只限 a/b 守点）
    const hotSite = ctHotSite(game);
    const mySiteKey = ctMySite(e, game);
    const myKey = mySiteKey ? mySiteKey.label : null;
    const shotOnlyHot = game.hotSiteShotOnly === true;
    if (hotSite && hotSite !== myKey && (!shotOnlyHot || ctIsRoamer(e))) {
      const hot = getMap().sites[hotSite];
      const hotDist = hot ? Math.hypot(e.x - hot.cx, e.y - hot.cy) : 1e9;
      const rotTimeLeft = (game.roundDur || 115) - (game.roundTime || 0);
      // shouldRotateToHot 接线（原死代码）：热区情报 + 剩余时间充足 + 未已在点附近才轮转
      if (shouldRotateToHot(e, hotSite, hotDist, rotTimeLeft, planted, 8, 260)) {
        const defendersHere = game.entities.filter((o) => o.team === 'ct' && !o.dead && o !== e && o.role === (myKey ? myKey.toLowerCase() : 'x')).length;
        // 回防配额（防站点被抽空）：每站点每轮热区只放行 1 名轮转者（anchorIdx===0），其余强制架点
        const designatedRotator = ctIsRoamer(e) || ((e.anchorIdx || 0) === 0);
        const rotKey = game.round + ':' + hotSite;
        if (game.ctRotateClaim !== rotKey && designatedRotator && (ctIsRoamer(e) || defendersHere >= 1)) {
          game.ctRotateClaim = rotKey;
          logAct(game, e, 'rotate', 'hot ' + hotSite);
          // shouldThrowUtility 接线：热区告警回防进点前向 m.entries[site] 丢 flash/HE
          // （返回 nade 标记，core.js:357 翻译成丢闪）
          const hotEntry = getMap().entries && getMap().entries[hotSite];
          const entryDist = hotEntry ? Math.hypot(e.x - hotEntry.x, e.y - hotEntry.y) : hotDist;
          const nades = e.weapons && e.weapons.nades ? e.weapons.nades : null;
          const nadeKind = nades && nades.flash > 0 ? 'flash' : (nades && nades.he > 0 ? 'he' : '');
          const tAliveHot = aliveCount(game, 't');
          const useNade = nadeKind && shouldThrowUtility(e, nadeKind, 1, entryDist, game.roundTime || 0, tAliveHot, game.roundDur || 115);
          return { ...spreadPoint(e, hot.cx, hot.cy, 70, 160), nade: !!useNade };
        }
      }
      // 非配额轮转者：强制架点（继续守点/探点逻辑，不抽空本站点）
    }
    if (!e.lastKnown && !e.aimTarget && !planted && game.roundTime > 40 && rand() < 0.25) {
      const tsp = getMap().spawns.t[0];
      if (tsp) { logAct(game, e, 'push', 'late scout'); return spreadPoint(e, tsp.x, tsp.y, 80, 200); }
    }
    const now = game.time * 1000;
    let heard = null;
    for (const o of game.entities) {
      if (o.team === 't' && !o.dead && now - o.lastShot < BOT_AI.HEAR_TTL) {
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        const clear = los(game, e.x, e.y, o.x, o.y, e.height);
        const radius = clear ? BOT_AI.HEAR_RADIUS : BOT_AI.HEAR_RADIUS * 0.6;
        if (d < radius && (!heard || d < heard.d)) {
          heard = { x: o.x, y: o.y, d, clear };
        }
      }
    }
    const hearTarget = (e.lastHear && game.time - e.lastHear.t < 1.2 && e.lastKnown) ? e.lastKnown : heard;
    if (hearTarget && ctReactsTo(e, game, hearTarget.x, hearTarget.y)) {
      // 听枪位置模糊化（与 senses.js 方向误差模型一致，防"穿墙精确定位"信息作弊）：
      // 距离越远越模糊，沿垂直方向加摆动误差
      const hd = Math.hypot(hearTarget.x - e.x, hearTarget.y - e.y);
      const hearClear = !heard || heard.clear;
      const err = Math.max(hearClear ? 60 : 90, hd * (hearClear ? 0.22 : 0.34));
      const hang = Math.atan2(hearTarget.y - e.y, hearTarget.x - e.x);
      return { x: hearTarget.x + Math.cos(hang + Math.PI / 2) * rand(-1, 1) * err, y: hearTarget.y + Math.sin(hang + Math.PI / 2) * rand(-1, 1) * err };
    }
    // 决策网络（H8-H10）：常规守点/前压由网络拍板，反应层（保枪/听枪）保持优先
    const nAct = netAct(e, game);
    if (nAct) {
      const no = netObjective(e, game, nAct);
      if (no) { logAct(game, e, nAct, 'net'); return no; }
    }
    // 前压侦察：IGL 拍板（game.ctPush），攻击性 bot 更积极，其余随队
    if (ctAlive >= tAlive + 2 && !planted && !e.lastKnown && game.roundTime > 15 && rand() < 0.5) {
      const tsp = getMap().spawns.t[0];
      if (tsp) {
        logAct(game, e, 'push', 'advantage scout');
        return { ...spreadPoint(e, tsp.x, tsp.y, 80, 190), peek: true };
      }
    }
    if (game.ctPush && ctIsRoamer(e) && rand() < 0.8 * st.p.aggression) {
      const sp = getMap().spawns.t[0];
      if (sp) {
        const dx = sp.x - e.x, dy = sp.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        logAct(game, e, 'push', '前压侦察');
        return spreadPoint(e, e.x + dx / len * 380, e.y + dy / len * 380, 70, 170);
      }
    }
    if (ctIsRoamer(e) && !planted && !e.lastKnown && !e.aimTarget && game.roundTime > 28) {
      const ctSpawnNow = getMap().spawns.ct[0];
      if (ctSpawnNow && Math.hypot(e.x - ctSpawnNow.x, e.y - ctSpawnNow.y) > 900) {
        const holdNow = e.role === 'a' ? getMap().holds.A : (e.role === 'b' ? getMap().holds.B : null);
        const p = holdNow && holdNow.anchors && holdNow.anchors.length ? holdNow.anchors[0] : null;
        logAct(game, e, 'rotate', 'roamer fallback');
        if (p) return { x: p.x, y: p.y, face: p.face !== undefined ? p.face : Math.atan2(holdNow.entry.y - p.y, holdNow.entry.x - p.x) };
        return retreatPoint(e, game);
      }
    }
    if (!e.lastKnown && !e.aimTarget && !planted && game.roundTime > 45) {
      const holdNow = e.role === 'a' ? getMap().holds.A : (e.role === 'b' ? getMap().holds.B : null);
      const anchorNow = holdNow && holdNow.anchors && holdNow.anchors.length ? holdNow.anchors[0] : null;
      const ctSpawnNow2 = getMap().spawns.ct[0];
      const homeX = anchorNow ? anchorNow.x : (ctSpawnNow2 ? ctSpawnNow2.x : 0);
      const homeY = anchorNow ? anchorNow.y : (ctSpawnNow2 ? ctSpawnNow2.y : 0);
      if (Math.hypot(e.x - homeX, e.y - homeY) > 700) {
        logAct(game, e, 'rotate', 'hold fallback');
        if (anchorNow) return { x: anchorNow.x, y: anchorNow.y, face: anchorNow.face !== undefined ? anchorNow.face : Math.atan2(holdNow.entry.y - anchorNow.y, holdNow.entry.x - anchorNow.x) };
        return { x: homeX, y: homeY };
      }
    }
    const siteHighs = (getMap().highPoints || []).filter((hp) => hp.site === (e.role === 'a' ? 'A' : e.role === 'b' ? 'B' : 'mid'));
    const sniperHere = weaponDef(e) && weaponDef(e).kind === 'sniper';
    if (siteHighs.length && (e.role === 'a' || e.role === 'b') && !planted && e.highPointT <= 0 && rand() < (sniperHere ? 0.35 : 0.06)) {
      const hpObj = highPointFor(e, game, e.role === 'a' ? 'A' : 'B');
      if (hpObj) {
        e.highIdx = hpObj.index;
        e.highPointT = sniperHere ? 14 : 8;
        return { x: hpObj.x, y: hpObj.y, face: hpObj.face };
      }
    }
    const searchSite = e.role === 'a' ? 'A' : (e.role === 'b' ? 'B' : null);
    const searchPts = searchSite ? ((getMap().clearChains && getMap().clearChains[searchSite]) || []) : (getMap().clearPoints || []);
    if (!e.lastKnown && !e.aimTarget && !planted && game.roundTime > 18 && searchPts.length) {
      if (!game.searchClaim || game.searchClaimRound !== game.round) {
        game.searchClaim = new Set();
        game.searchClaimRound = game.round;
      }
      let searchIdx = (e.searchIdx || 0) + 1;
      let attempts = 0;
      while (game.searchClaim.has(searchIdx % searchPts.length) && attempts < searchPts.length) {
        searchIdx++;
        attempts++;
      }
      e.searchIdx = searchIdx;
      game.searchClaim.add(searchIdx % searchPts.length);
      const sp = searchPts[searchIdx % searchPts.length];
      logAct(game, e, 'search', '搜点 ' + (sp.site || 'mid'));
      return { x: sp.x, y: sp.y, peek: true, search: true };
    }
    if (e.role === 'a' || e.role === 'b') {
      const hold = e.role === 'a' ? getMap().holds.A : getMap().holds.B;
      // 防御：无该站点（单站点/机制图）时退化为守出生点，防 holds.B undefined 崩溃
      if (hold && hold.anchors && hold.anchors.length) {
        const now = game.roundTime || 0;
        if (e.holdShiftT === undefined) e.holdShiftT = now + 10 + rand() * 8;
        if (now >= e.holdShiftT) {
          e.anchorIdx = (e.anchorIdx + 1) % hold.anchors.length;
          const mateAnchor = game.entities.find((o) => o.bot && o.team === 'ct' && !o.dead && o !== e && o.role === e.role);
          if (mateAnchor && mateAnchor.anchorIdx === e.anchorIdx && hold.anchors.length > 1) e.anchorIdx = (e.anchorIdx + 1) % hold.anchors.length;
          e.holdShiftT = now + 14 + rand() * 10;
          e.objCache = null;
          e.objAt = 0;
          logAct(game, e, 'rotate', 'hold shift');
        }
        const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
        return { x: p.x, y: p.y, face: p.face !== undefined ? p.face : Math.atan2(hold.entry.y - p.y, hold.entry.x - p.x) };
      }
      const fallbackSpawn = getMap().spawns.ct[0];
      if (fallbackSpawn) return { x: fallbackSpawn.x + rand(-70, 70), y: fallbackSpawn.y + rand(-70, 70) };
    }
    // mid：守 T 主攻方向的对侧点（5 人全守，避免中心游走送死）
    const ctMidSpawn = getMap().spawns.ct[0];
    if (ctMidSpawn) return { x: ctMidSpawn.x + rand(-90, 90), y: ctMidSpawn.y + rand(-90, 90) };
    const m2 = game.tAttackSite === 'A' ? getMap().holds.B : getMap().holds.A;
    if (m2 && m2.anchors && m2.anchors.length) return { x: m2.anchors[0].x, y: m2.anchors[0].y };
    return retreatPoint(e, game);
  }
  if (planted) {
    if (game.bomb && game.bomb.defusing) {
      const distToBomb = Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y);
      // 残局时钟：拆弹倒计时用 bomb.timer（不再用冻结的回合时钟）。
      // 冲刺条件 = bomb.timer - 抵达ETA <= defuseTime + 2（ETA = dist/移动速度）。
      const bombT = game.bomb.timer || 40;
      const wRush = weaponDef(e);
      const spdRush = (wRush && wRush.speed ? wRush.speed : 1) * 235;
      if (shouldRushDefuser(e, true, distToBomb, bombT, 5, 700, spdRush)) {
        const defuser = game.entities.find((o) => o.team === 'ct' && !o.dead && o.defuseT > 0);
        const target = defuser || { x: game.bomb.x, y: game.bomb.y };
        logAct(game, e, 'defuse-stop', 'rush defuser');
        return { x: target.x, y: target.y };
      }
      const guardCs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
      return tSitePoint(e, guardCs);
    }
  if (e.role === 'mid' && e.netLane === undefined) {
      const csp = getMap().spawns.ct[0];
      if (csp) {
        logAct(game, e, 'postplant', 'watch ct');
        return { x: csp.x + rand(-80, 80), y: csp.y + rand(-80, 80), peek: true };
      }
    }
    if (e.role !== 'mid' && e.highPointT <= 0 && rand() < 0.3) {
      const hpObj = highPointFor(e, game, game.bomb.site, { x: game.bomb.x, y: game.bomb.y });
      if (hpObj) {
        e.highPointT = 12;
        e.highIdx = hpObj.index;
        logAct(game, e, 'postplant', 'high ' + game.bomb.site);
        return { x: hpObj.x, y: hpObj.y, face: hpObj.face };
      }
    }
    const ctAlivePost = aliveCount(game, 'ct');
    const tAlivePost = aliveCount(game, 't');
    if (ctAlivePost >= 2 && tAlivePost >= 1 && (e.anchorIdx || 0) % 3 === 0 && !e.defuseT) {
      const tspCut = getMap().spawns.t[0];
      const bCut = game.bomb;
      if (tspCut && bCut) {
        const cutX = bCut.x + (tspCut.x - bCut.x) * 0.45;
        const cutY = bCut.y + (tspCut.y - bCut.y) * 0.45;
        logAct(game, e, 'retake', 'cut rotate');
        return { x: cutX, y: cutY, peek: true };
      }
    }
    if (ctAlivePost >= 1 && tAlivePost >= 2 && e.role !== 'mid' && (e.laneIdx || 0) % 2 === 0 && rand() < 0.35) {
      const cspHunt = getMap().spawns.ct[0];
      if (cspHunt) { logAct(game, e, 'postplant', 'clock hunt'); return spreadPoint(e, cspHunt.x, cspHunt.y, 80, 200); }
    }
    const csp = getMap().spawns.ct[0];
    const bAng = csp ? Math.atan2(csp.y - game.bomb.y, csp.x - game.bomb.x) : 0;
    const side = (((e.laneIdx || e.anchorIdx || 0) % 2) ? 1 : -1);
    const r = 130 + (((e.laneIdx || e.anchorIdx || 0) % 2)) * 60;
    const gx = game.bomb.x + Math.cos(bAng) * r + Math.cos(bAng + Math.PI / 2 * side) * 90;
    const gy = game.bomb.y + Math.sin(bAng) * r + Math.sin(bAng + Math.PI / 2 * side) * 90;
    if (e.guardPointSite !== game.bomb.site || e.guardPoint === null) {
      e.guardPoint = { x: gx, y: gy };
      e.guardPointSite = game.bomb.site;
    }
    return e.guardPoint;
  }
  if (game.tFocus && !(game.bomb && game.bomb.planted) && game.time - game.tFocus.at < 4 && !e.hasBomb && e.netLane === undefined) {
    const offside = e.role !== game.tAttackSite && e.role !== 'mid';
    const fd = Math.hypot(game.tFocus.x - e.x, game.tFocus.y - e.y);
    if ((!offside || (game.roundTime || 0) > 30) && fd > 60 && fd < 900) {
      logAct(game, e, 'focus', 'IGL \u96c6\u706b');
      return { x: game.tFocus.x + rand(-40, 40), y: game.tFocus.y + rand(-40, 40), peek: true };
    }
  }
  if (shouldRetreatWithoutBomb(e, game.roundTime || 0, enAlive0, myAlive0, game.roundDur || 115, 18, 420,
    (game.bomb && game.bomb.dropped && Number.isFinite(game.bomb.x)) ? Math.hypot(e.x - game.bomb.x, e.y - game.bomb.y) : null) && e.netLane === undefined) {
    logAct(game, e, 'save', 'late no bomb');
    return retreatPoint(e, game);
  }
  if (e.hasBomb) {
    let cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    // 网络路线接管：other 路线 → 持包者改走另一站点（转点协同）
    if (e.netLane === 'other') cs = cs === getMap().sites.A ? getMap().sites.B : getMap().sites.A;
    const siteA = plantSiteEval(e, game, 'A');
    const siteB = plantSiteEval(e, game, 'B');
    const pickedSite = pickPlantSite(e, siteA, siteB, (game.roundDur || 115) - (game.roundTime || 0));
    if (pickedSite) {
      cs = getMap().sites[pickedSite];
      logAct(game, e, 'plant', 'pick ' + pickedSite);
    }
    if (game.roundPlan && game.roundPlan.plantPriority) {
      logAct(game, e, 'plant', 'eco plant priority');
      return { x: cs.cx, y: cs.cy };
    }
    // 晚安弹（独立于 eco 优先级）：回合后期持包者无条件进点，修复死代码分支
    if (shouldPushLatePlant(e, game.roundTime, game.roundDur || 115)) {
      logAct(game, e, 'push', 'late plant');
      return { x: cs.cx, y: cs.cy };
    }
    const wSpd = weaponDef(e);
    const spdPlant = (wSpd && wSpd.speed ? wSpd.speed : 1) * 235;
    if (shouldRushPlant(e, Math.hypot(e.x - cs.cx, e.y - cs.cy), game.roundTime, game.roundDur || 115, 12, 650, spdPlant)) {
      logAct(game, e, 'clutch', 'rush plant');
      return { x: cs.cx, y: cs.cy };
    }
    const clutchCs = clutchPlantSite(e, game, cs);
    if (clutchCs !== cs) {
      logAct(game, e, 'clutch', 'nearest plant ' + clutchCs.label);
      cs = clutchCs;
    }
    // 残局持包时间管理：回合末期距点过远 → ETA 校验（dist/移动速度 < 剩余时间）。
    // 时间不够则改选最近安弹点（clutchPlantSite 已换）或保枪，避免 12s 走 650px 白送。
    const distToPlant = Math.hypot(e.x - cs.cx, e.y - cs.cy);
    const timeLeftPlant = (game.roundDur || 115) - (game.roundTime || 0);
    if (game.roundTime > (game.roundDur || 115) - 12 && distToPlant > 650) {
      if (distToPlant / Math.max(1, spdPlant) < timeLeftPlant - 1.5) {
        logAct(game, e, 'clutch', 'rush plant');
        return { x: cs.cx, y: cs.cy };
      }
      logAct(game, e, 'save', 'no plant time, save');
      return retreatPoint(e, game);
    }
    // 已在点附近则直接进点安弹；否则在入口等队友清点（不在交火中冲点送死）
    if (inSite(e.x, e.y, cs) || Math.hypot(e.x - cs.cx, e.y - cs.cy) < 300 || e.rushMode) return e.hasBomb ? { x: cs.cx, y: cs.cy } : tSitePoint(e, cs);
    const clearNow = nextClearPoint(e, cs);
    if (clearNow) { logAct(game, e, 'clear', '\u641c\u70b9 ' + cs.label); return clearNow; }
    // 等待超时：队友迟迟不来（阵亡/被牵制）则不再干等，直接进点
    if (game.roundTime > 15) return e.hasBomb ? { x: cs.cx, y: cs.cy } : tSitePoint(e, cs);
    const alliesIn = game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && o !== e && Math.hypot(o.x - cs.cx, o.y - cs.cy) < 300).length;
    if (alliesIn < 1) return entryPoint(cs, game, e);
    return e.hasBomb ? { x: cs.cx, y: cs.cy } : tSitePoint(e, cs);
  }
  if (!e.hasBomb && !planted && game.roundTime < 20) {
    // 护航（网络接管时也保留）：持包者进入安弹范围（距点 <300）→ 附近队友收缩护包防拆弹
    // 前期/行进中不吸队友（保持分路），避免全队跟包拖垮进攻节奏
    const carrier = game.entities.find((o) => o.bot && o.team === 't' && !o.dead && o.hasBomb);
    const csCarry = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    if (carrier && csCarry && shouldEscortCarrier(e, Math.hypot(e.x - carrier.x, e.y - carrier.y), Math.hypot(carrier.x - csCarry.cx, carrier.y - csCarry.cy), game.roundTime || 0)) {
      logAct(game, e, 'escort', 'guard carrier');
      return spreadPoint(e, carrier.x, carrier.y, 60, 130);
    }
  }
  let planter = null;
  for (const pe of game.entities) {
    if (pe.team === 't' && pe.plantT > 0 && pe !== e) { planter = pe; break; }
  }
  if (planter && e.netLane === undefined) {
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
    // 假打确认闭环（原开环）：每 2s 查 ctHotSite，若热区指向假点且持续 >3s → CT 已被吸走，
    // 主攻执行提前/触发 contact；否则假攻组从丢道具升级为 peek 探身开枪施压。
    if (game.time - (game.tFakeCheckAt || 0) >= 2) {
      game.tFakeCheckAt = game.time;
      if (ctHotSite(game) === e.role) {
        if (game.tFakeHotSince === undefined) game.tFakeHotSince = game.time;
      } else {
        game.tFakeHotSince = undefined;
      }
    }
    const ctDrawn = game.tFakeHotSince !== undefined && (game.time - game.tFakeHotSince) > 3;
    if (ctDrawn) {
      // CT 被吸走 → 主攻执行提前（压低 executeAt）并转主攻点发起 contact 级施压
      if (tPlanNow.executeAt !== undefined && tPlanNow.executeAt > game.roundTime + 1) tPlanNow.executeAt = game.roundTime + 1;
      game.tFakeCommitAt = game.time;
      logAct(game, e, 'contact', 'fake drew CT -> commit ' + game.tAttackSite);
      return { ...spreadPoint(e, cs.cx, cs.cy, 90, 200), peek: true };
    }
    if (game.roundTime < 16) {
      const otherSite = getMap().sites[e.role];
      const otherEntry = getMap().entries && getMap().entries[e.role];
      logAct(game, e, 'fake', 'fake ' + e.role);
      const fakeTarget = otherEntry ? otherEntry : otherSite;
      // 未确认诱导 → 假攻组升级：丢道具 + peek 探身开枪施压（roundTime>6 后开火探身）
      return { ...spreadPoint(e, fakeTarget.x, fakeTarget.y, 80, 180), nade: true, peek: game.roundTime > 6 };
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
  if (e.tradePartner && !e.hasBomb && !planted) {
    const vanguard = game.entities.find((o) => o.bot && o.team === 't' && !o.dead && o.vanguard);
    if (vanguard && vanguard !== e && Math.hypot(e.x - vanguard.x, e.y - vanguard.y) > 140) {
      logAct(game, e, 'trade', 'follow vanguard');
      return spreadPoint(e, vanguard.x, vanguard.y, 60, 130);
    }
  }

    const roundPlan = game.roundPlan;
  if (roundPlan && roundPlan.contact && e.role === game.tAttackSite && !e.hasBomb && !e.rushMode) {
    logAct(game, e, 'contact', 'contact ' + cs.label);
    return { ...spreadPoint(e, cs.cx, cs.cy, 90, 200), peek: true };
  }
  if ((e.role === game.tAttackSite || (e.role === 'mid' && game.roundTime > 22)) && !e.rushMode && (!tPlanNow || !tPlanNow.slow || game.roundTime >= 15)) {
    const clearNow = nextClearPoint(e, cs);
    if (clearNow) { logAct(game, e, 'clear', '\u641c\u70b9 ' + cs.label); return clearNow; }
  }
  const tAliveHunt = game.entities.filter((o) => o.team === 't' && !o.dead && o !== e).length;
  const ctAliveHunt = game.entities.filter((o) => o.team === 'ct' && !o.dead).length;
  if (tAliveHunt === 0 && ctAliveHunt === 1 && !e.hasBomb && !planted && game.roundTime > 30) {
    const ctSpawnHunt = getMap().spawns.ct[0];
    if (ctSpawnHunt) {
      logAct(game, e, 'hunt', '1v1 ct half');
      return spreadPoint(e, ctSpawnHunt.x, ctSpawnHunt.y, 90, 200);
    }
  }
if (e.rushMode && !e.hasBomb) return entryPoint(cs, game, e);
  if (st.arch.aggression > 1.2 && !e.hasBomb) return entryPoint(cs, game, e);
  if (e.rushMode || st.arch.aggression > 1.2) return spreadPoint(e, cs.cx, cs.cy, 90, 220);
  // 协同集结：存活人数不足时全员到齐即进点（修复 1v1/2v2 死等 3 人的发呆）；人多时凑 3 人同步
  const tAlive3 = aliveCount(game, 't');
  const needAll = Math.min(3, tAlive3);
  const entry = entryPoint(cs, game, e);
  const here = game.entities.filter((o) => o.bot && o.team === 't' && !o.dead && Math.hypot(o.x - entry.x, o.y - entry.y) < 300).length;
  if (here >= needAll) return spreadPoint(e, cs.cx, cs.cy, 90, 220);
  const waitUntil = tPlanNow && tPlanNow.executeAt !== undefined ? tPlanNow.executeAt : 12;
  if (game.roundTime < waitUntil) {
    if (game.roundTime > 8 && rand() < 0.35) return { ...entry, peek: true, nade: !!e.utilityRole };
    return { ...entry, peek: true };
  }
  return spreadPoint(e, cs.cx, cs.cy, 90, 220);
}
