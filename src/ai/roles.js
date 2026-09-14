// 队伍编成：角色分配（突破/狙击/辅助/绕后/步枪）+ 队长 IGL + 玩家战术指令
import {diffOf} from '../config.js';
;
import {ctx} from '../ctx.js';
import {addPing} from '../ping-fx.js';
import {assignArchetypes, rollPersonality, ARCHETYPES} from '../persona.js';
import {emit, redistributeTLanes} from './shared.js';

function initAdaptive(game) {
  if (game.adaptive) return game.adaptive;
  game.adaptive = {
    T: { siteWins: { A: 0, B: 0 }, siteAttempts: { A: 0, B: 0 }, rushWins: 0, rushAttempts: 0, execWins: {}, execAttempts: {} },
    CT: { pushWins: 0, pushAttempts: 0, siteWins: { A: 0, B: 0 }, siteDefends: { A: 0, B: 0 }, rotateWins: 0, rotateAttempts: 0, defuseWins: 0, defuseAttempts: 0 }
  };
  return game.adaptive;
}

export function recordRoundResult(game, winner, winType) {
  // 回合日志（轻量）：HLTV KAST 需要逐回合胜负方与本回合阵亡名单。
  // 此刻 e.dead 恰好表示"本回合内死亡"（每回合出生时重置），无需快照。
  if (!game.roundLog) game.roundLog = [];
  game.roundLog.push({
    winner: winner || null,
    casualties: (game.entities || []).filter((e) => e && e.dead).map((e) => e.name)
  });
  if (!game.adaptive) initAdaptive(game);
  const ad = game.adaptive;
  const site = game.tAttackSite;
  if (site === 'A' || site === 'B') {
    ad.T.siteAttempts[site]++;
    if (winner === 't') ad.T.siteWins[site]++;
    ad.CT.siteDefends[site]++;
    if (winner === 'ct') ad.CT.siteWins[site]++;
  }
  const plan = game.roundPlan;
  if (plan) {
    const k = plan.execution || 'default';
    ad.T.execAttempts[k] = (ad.T.execAttempts[k] || 0) + 1;
    if (winner === 't') ad.T.execWins[k] = (ad.T.execWins[k] || 0) + 1;
    if (plan.rush) {
      ad.T.rushAttempts++;
      if (winner === 't') ad.T.rushWins++;
    }
  }
  if (game.ctPushRound) {
    ad.CT.pushAttempts++;
    if (winner === 'ct') ad.CT.pushWins++;
    game.ctPushRound = false;
  }
  if (winType === 'defuse') {
    ad.CT.defuseAttempts++;
    ad.CT.defuseWins++;
  } else if (game.bomb && game.bomb.planted) {
    ad.CT.defuseAttempts++;
    if (winner === 'ct') ad.CT.defuseWins++;
  }
  if (game.tSwitchedAt > 0) {
    ad.CT.rotateAttempts++;
    if (winner === 'ct') ad.CT.rotateWins++;
  }
}

function adaptiveSite(ad) {
  const t = ad.T;
  const na = t.siteAttempts.A || 0, nb = t.siteAttempts.B || 0;
  const winA = na ? t.siteWins.A / na : 0.5;
  const winB = nb ? t.siteWins.B / nb : 0.5;
  const rateA = 0.5 + (winA - winB) * 0.35;
  return ctx.rand() < Math.max(0.2, Math.min(0.8, rateA)) ? 'A' : 'B';
}

function rollCtPlan(game, ad, prevExec) {
  const t = ad.T;
  const na = t.siteAttempts.A || 0, nb = t.siteAttempts.B || 0;
  const aRate = na + nb > 0 ? na / (na + nb) : 0.5;
  const winA = ad.CT.siteDefends.A ? ad.CT.siteWins.A / ad.CT.siteDefends.A : 0.5;
  const winB = ad.CT.siteDefends.B ? ad.CT.siteWins.B / ad.CT.siteDefends.B : 0.5;
  const siteBiasA = Math.max(0.2, Math.min(0.7, 0.25 + aRate * 0.35 + (winA - winB) * 0.15));
  const antiEco = teamIsEco(game, 't') && teamIsArmed(game, 'ct');
  return {
    execution: 'ct',
    antiRush: prevExec === 'rush' || prevExec === 'contact',
    antiEco,
    ctPushNow: antiEco,
    rush: false,
    utility: antiEco ? 0.3 + ctx.rand() * 0.25 : 0.55 + ctx.rand() * 0.75,
    aggression: antiEco ? 1.05 + ctx.rand() * 0.45 : 0.35 + ctx.rand() * 0.85,
    rotateChance: antiEco ? 0.1 + ctx.rand() * 0.2 : 0.2 + ctx.rand() * 0.5,
    saveChance: antiEco ? 0.35 + ctx.rand() * 0.15 : 0.3 + ctx.rand() * 0.45,
    prefire: antiEco ? 0.04 + ctx.rand() * 0.08 : 0.02 + ctx.rand() * 0.09,
    peekChance: antiEco ? 0.05 + ctx.rand() * 0.07 : 0.03 + ctx.rand() * 0.08,
    riskT: antiEco ? 0.7 + ctx.rand() * 0.5 : 0.5 + ctx.rand() * 0.7,
    siteBiasA,
    variant: Math.floor(ctx.rand() * 1000000)
  };
}

// T 侧分路路点：回合初按 role/lane 分道行进（避免全员挤中路走廊）
// A0=主攻 A 小入口南段 / A1=主攻 A 大走廊南端 / B0=B 隧道南段 / B1=B 内走廊 / mid=中路中段
const T_ROUTES = {
  A0: { x: 1288, y: 700 }, A1: { x: 1704, y: 900 },
  B0: { x: 680, y: 800 }, B1: { x: 216, y: 900 },
  mid: { x: 1010, y: 1250 }
};
export function tRouteFor(e, game) {
  const mapId = game.opts && game.opts.mapId;
  if (mapId !== 'dust2') return null;
  if (e.role === 'mid') return T_ROUTES.mid;
  const site = game.tAttackSite === 'A' ? 'A' : 'B';
  if (e.role === site) return e.laneIdx > 0 ? T_ROUTES[site + '1'] : T_ROUTES[site + '0'];
  return T_ROUTES[site === 'A' ? 'B0' : 'A0'];
}

const TACTIC_DEFS = {
  rush: { mainN: 5, otherN: 0, midN: 0, rush: true, fake: false, slow: false, contact: false, mid: false, utility: 0.35, rotate: 0.2, save: 0.35, prefire: 0.02, peek: 0.03, risk: 1.2 },
  split: { mainN: 2, otherN: 2, midN: 1, rush: false, fake: false, slow: false, contact: false, mid: false, utility: 0.9, rotate: 0.75, save: 0.5, prefire: 0.07, peek: 0.08, risk: 1.0 },
  sneak: { mainN: 3, otherN: 1, midN: 1, rush: false, fake: false, slow: false, contact: false, mid: false, utility: 0.55, rotate: 0.3, save: 0.7, prefire: 0.03, peek: 0.04, risk: 0.6 },
  fake: { mainN: 2, otherN: 2, midN: 1, rush: false, fake: true, slow: false, contact: false, mid: false, utility: 1.05, rotate: 0.9, save: 0.5, prefire: 0.08, peek: 0.08, risk: 0.95 },
  slow: { mainN: 3, otherN: 1, midN: 1, rush: false, fake: false, slow: true, contact: false, mid: false, utility: 1.1, rotate: 0.55, save: 0.65, prefire: 0.05, peek: 0.04, risk: 0.7 },
  mid: { mainN: 2, otherN: 1, midN: 2, rush: false, fake: false, slow: false, contact: false, mid: true, utility: 0.8, rotate: 0.65, save: 0.55, prefire: 0.06, peek: 0.07, risk: 0.9 },
  contact: { mainN: 4, otherN: 0, midN: 1, rush: false, fake: false, slow: false, contact: true, mid: false, utility: 0.6, rotate: 0.35, save: 0.45, prefire: 0.1, peek: 0.12, risk: 1.1 },
  antiEco: { mainN: 3, otherN: 2, midN: 0, rush: true, fake: false, slow: false, contact: false, mid: false, utility: 0.3, rotate: 0.15, save: 0.3, prefire: 0.02, peek: 0.02, risk: 1.25 }
};

export function teamIsEco(game, team) {
  const bots = game.entities.filter((e) => e.bot && e.team === team);
  if (!bots.length) return false;
  const poor = bots.filter((e) => (e.money || 0) < 2500).length;
  return poor >= Math.max(2, Math.ceil(bots.length * 0.8));
}

export function enemyIsEco(game) {
  return teamIsEco(game, 'ct');
}

export function teamIsArmed(game, team = 't') {
  const bots = game.entities.filter((e) => e.bot && e.team === team);
  return bots.length > 0 && bots.some((e) => (e.money || 0) >= 2500);
}

function rollRoundPlan(game, ad, base, prevExec, tBots) {
  const ctPushRate = ad.CT.pushAttempts ? ad.CT.pushWins / ad.CT.pushAttempts : 0.5;
  const baseRush = base && base.rushChance !== undefined ? base.rushChance : 0.4;
  const scoreT = (game.score && game.score.T) || 0;
  const scoreCT = (game.score && game.score.CT) || 0;
  const lowEco = tBots && tBots.length > 0 && tBots.every((e) => e.money < 3000);
  const antiEcoNow = enemyIsEco(game) && teamIsArmed(game, 't');
  const weights = {
    default: 1.2,
    rush: baseRush * 2.4 + (scoreT <= scoreCT ? 0.5 : 0) + (lowEco ? 0.9 : 0),
    split: 1.0,
    sneak: 0.8,
    fake: 1.0,
    slow: 0.9,
    mid: 0.7,
    contact: 0.3 + (prevExec === 'rush' ? 0.25 : 0),
    antiEco: antiEcoNow ? 4.5 : 0.01
  };
  if (prevExec === 'slow' || prevExec === 'sneak') {
    weights.rush += 1.4;
    weights.contact += 0.8;
  } else if (prevExec === 'rush' || prevExec === 'contact' || prevExec === 'antiEco') {
    weights.slow += 1.3;
    weights.sneak += 1.1;
  }
  if (prevExec && weights[prevExec] !== undefined) weights[prevExec] *= 0.35;
  let total = 0;
  for (const k of Object.keys(TACTIC_DEFS)) total += weights[k];
  let roll = ctx.rand() * total;
  let execution = 'default';
  for (const k of Object.keys(TACTIC_DEFS)) {
    roll -= weights[k];
    if (roll <= 0) { execution = k; break; }
  }
  if (antiEcoNow) execution = 'antiEco';
  const def = TACTIC_DEFS[execution];
  const plan = {
    site: adaptiveSite(ad),
    execution,
    antiEco: execution === 'antiEco',
    mainN: def.mainN,
    otherN: def.otherN,
    midN: def.midN,
    rush: def.rush,
    fake: def.fake,
    slow: def.slow,
    contact: def.contact,
    mid: def.mid,
    utility: def.utility * (0.8 + ctx.rand() * 0.5),
    aggression: 0.45 + ctx.rand() * 0.9,
    rotateChance: def.rotate + ctx.rand() * 0.2,
    saveChance: def.save + ctx.rand() * 0.15,
    prefire: def.prefire + ctx.rand() * 0.04,
    peekChance: def.peek + ctx.rand() * 0.03,
    riskT: def.risk + (ctx.rand() - 0.5) * 0.4,
    ctAggro: 0.35 + ctx.rand() * 0.85,
    plantPriority: lowEco,
    executeAt: def.slow ? 16 + ctx.rand() * 4 : def.fake ? 11 + ctx.rand() * 3 : def.contact ? 7 + ctx.rand() * 3 : def.sneak ? 12 + ctx.rand() * 3 : 9 + ctx.rand() * 3,
    variant: Math.floor(ctx.rand() * 1000000)
  };
  const w = ad.T.execWins[execution] || 0;
  const a = ad.T.execAttempts[execution] || 0;
  if (a >= 3 && w / a < 0.35) {
    plan.execution = 'default';
    plan.antiEco = false;
    plan.mainN = 3;
    plan.otherN = 1;
    plan.midN = 1;
    plan.rush = false;
    plan.fake = false;
    plan.slow = true;
    plan.contact = false;
    plan.mid = false;
    plan.utility += 0.25;
    plan.rotateChance += 0.12;
  }
  return plan;
}

function applyRoundParams(e, plan, side = 't') {
  if (!e.aiParams) return;
  const r = () => 0.8 + ctx.rand() * 0.4;
  // 默认值来源：aiParams 缺字段时取 diffOf(game) 难度参数（而非硬编码），
  // 使"部分注入"（quick match 全展开 / 模式对局）与难度档位语义一致
  const pv = (k, def) => (e.aiParams && e.aiParams[k] !== undefined ? e.aiParams[k] : def);
  // plan 优先：teamBuyType 覆盖后的 execution/aggression/saveChance 直接驱动 aiParams（买→打闭环）
  const pw = (k, def) => (plan && plan[k] !== undefined ? plan[k] : def);
  if (e.matchVariant === undefined) e.matchVariant = e.aiParams.tacticalVariant || plan.variant;
  e.aiParams.tacticalVariant = e.matchVariant;
  e.roundPlanVariant = plan.variant;
  e.aiParams.react = Math.max(0.05, Math.min(0.25, pv('react', 0.1) * r()));
  e.aiParams.spreadMult = Math.max(0.5, Math.min(1.3, pv('spreadMult', 0.7) * r()));
  if (side === 't') e.aiParams.rushChance = Math.max(0.05, Math.min(0.9, (plan.rush ? 0.75 : 0.35) + (ctx.rand() - 0.5) * 0.5));
  e.aiParams.rotateChance = Math.max(0.15, Math.min(0.9, pw('rotateChance', pv('rotateChance', 0.4)) + (ctx.rand() - 0.5) * 0.3));
  e.aiParams.saveChance = Math.max(0.15, Math.min(0.95, pw('saveChance', pv('saveChance', 0.5)) + (ctx.rand() - 0.5) * 0.25));
  e.aiParams.nadeUse = Math.max(0.25, Math.min(1.2, plan.utility * pv('nadeUse', 0.7) + (ctx.rand() - 0.5) * 0.25));
  e.aiParams.peekChance = Math.max(0.02, Math.min(0.25, (pw('peekChance', pv('peekChance', 0.06))) + (ctx.rand() - 0.5) * 0.08));
  e.aiParams.riskT = Math.max(0.3, Math.min(1.5, (pw('riskT', pv('riskT', 0.8))) + (ctx.rand() - 0.5) * 0.5));
  e.aiParams.prefireChance = Math.max(0, Math.min(0.2, pw('prefireChance', pv('prefireChance', 0.04)) + (ctx.rand() - 0.5) * 0.04));
}

// —— 人格加权角色分配（item 9）——
// 激进→主攻/vanguard、沉稳→anchor、团队→escort/support；archetype 用固定种子（只随 seed）形成稳定分工
function tRoleAffinity(e, role, mainSite) {
  const archT = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
  const p = e.personality || { aggression: 0.5, teamwork: 0.5, steadiness: 0.5 };
  if (role === mainSite) return (archT.aggression || 1) * (0.5 + p.aggression) * 1.4 + (archT.teamwork || 1) * (0.5 + p.teamwork) * 0.4;
  if (role === 'mid') return (archT.teamwork || 1) * (0.5 + p.teamwork) * 1.2 + (0.5 + p.steadiness) * 0.3;
  return (0.5 + p.steadiness) * 1.4 + (archT.teamwork || 1) * (0.5 + p.teamwork) * 0.3;
}

function cRoleAffinity(e, role) {
  const archC = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
  const p = e.personality || { aggression: 0.5, teamwork: 0.5, steadiness: 0.5 };
  if (role === 'mid') return (archC.aggression || 1) * (0.5 + p.aggression) * 1.2 + (archC.teamwork || 1) * (0.5 + p.teamwork) * 0.8;
  return (0.5 + p.steadiness) * 1.5 + (archC.teamwork || 1) * (0.5 + p.teamwork) * 0.3;
}

function aggressiveScore(e) {
  const arch = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
  return (arch.aggression || 0) + ((e.personality && e.personality.aggression) || 0);
}

// 加权分配：把 slots 多集按 affinity 分配给 bots（保留随机性，高分者优先落位）
function weightedAssign(bots, slots, affinity) {
  const n = bots.length;
  const result = new Array(n).fill(null);
  const remaining = slots.slice();
  const avail = bots.map((_, i) => i);
  const force = (bi, role) => {
    const si = remaining.findIndex((r) => r === role);
    if (si >= 0) { result[bi] = role; remaining.splice(si, 1); avail.splice(avail.indexOf(bi), 1); return true; }
    return false;
  };
  // 特殊兵种强制落位：破坏手→主攻、绕后→副攻（先占坑，保证测试与既有语义）
  const breacherIdx = bots.findIndex((e) => e.archetype === 'breacher');
  if (breacherIdx >= 0 && affinity.forceMain) force(breacherIdx, affinity.mainSite);
  const lurkIdx = bots.findIndex((e) => e.archetype === 'lurk');
  if (lurkIdx >= 0 && affinity.forceOther) force(lurkIdx, affinity.mainSite === 'A' ? 'B' : 'A');
  for (let s = 0; s < remaining.length; s++) {
    const weights = avail.map((bi) => Math.pow(affinity.fn(bots[bi], remaining[s]), 4) + 0.001);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = ctx.rand() * total;
    let pick = 0;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pick = i; break; }
    }
    const bi = avail.splice(pick, 1)[0];
    result[bi] = remaining[s];
  }
  return result;
}

// —— 买→打闭环（item 4）——
// 按团队经济计划覆盖 plan 的执行风格：eco→rush/sneak+save、force→contact、full→normal（回退）
function applyTeamBuyToPlan(plan, type) {
  if (!plan || !type) return;
  const isCt = plan.execution === 'ct';
  if (type === 'eco') {
    if (isCt) {
      plan.aggression = 0.2 + ctx.rand() * 0.3;
      plan.saveChance = 0.75 + ctx.rand() * 0.15;
      plan.utility = 0.25 + ctx.rand() * 0.2;
      plan.riskT = 0.45 + ctx.rand() * 0.25;
      plan.ctPushNow = false;
    } else {
      const rush = ctx.rand() < 0.45;
      plan.execution = rush ? 'rush' : 'sneak';
      const def = TACTIC_DEFS[plan.execution];
      if (def) {
        plan.mainN = def.mainN; plan.otherN = def.otherN; plan.midN = def.midN;
        plan.rush = def.rush; plan.slow = def.slow; plan.contact = false;
        plan.fake = false; plan.mid = false;
      }
      plan.antiEco = false;
      plan.plantPriority = true;
      plan.saveChance = 0.7 + ctx.rand() * 0.2;
      plan.aggression = rush ? 0.55 + ctx.rand() * 0.35 : 0.2 + ctx.rand() * 0.3;
      plan.utility = 0.2 + ctx.rand() * 0.25;
      plan.riskT = rush ? 1.1 : 0.45;
      plan.peekChance = 0.03;
      plan.prefire = 0.03;
    }
  } else if (type === 'force') {
    if (isCt) {
      plan.aggression = 0.8 + ctx.rand() * 0.4;
      plan.saveChance = 0.35 + ctx.rand() * 0.2;
      plan.utility = 0.4 + ctx.rand() * 0.3;
      plan.riskT = 1.0 + ctx.rand() * 0.3;
    } else {
      plan.execution = 'contact';
      const def = TACTIC_DEFS.contact;
      if (def) {
        plan.mainN = def.mainN; plan.otherN = def.otherN; plan.midN = def.midN;
        plan.rush = false; plan.slow = false; plan.contact = true;
        plan.fake = false; plan.mid = false;
      }
      plan.antiEco = false;
      plan.saveChance = 0.4 + ctx.rand() * 0.15;
      plan.aggression = 0.8 + ctx.rand() * 0.4;
      plan.utility = 0.45 + ctx.rand() * 0.25;
      plan.riskT = 1.0 + ctx.rand() * 0.3;
    }
  }
  // full → normal：保留原有计划（回退现有逻辑）
}

// —— 转点后的角色重排（item 6）——
// 只读调用 shared 的 redistributeTLanes，并按人格重推 vanguard / escort
export function rebalanceTLanes(game) {
  redistributeTLanes(game);
  const tBots = game.entities.filter((e) => e.bot && e.team === 't' && !e.dead);
  const mainAlive = tBots.filter((e) => e.role === game.tAttackSite);
  if (mainAlive.length && !mainAlive.some((e) => e.vanguard)) {
    const lead = mainAlive.slice().sort((a, b) => aggressiveScore(b) - aggressiveScore(a))[0];
    if (lead) lead.vanguard = true;
  }
  for (const e of tBots) {
    e.rushMode = !!(game.tRush) && e.role === game.tAttackSite;
    e.escort = e.role === game.tAttackSite && (e.archetype === 'support' || e.archetype === 'rifler');
    e.objCache = null;
    e.objAt = 0;
    e.guardPoint = null;
  }
  return game;
}

export function assignRoles(game) {
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  const ad = initAdaptive(game);
  const t0 = tBots[0];
  const base = t0 && t0.aiParams ? t0.aiParams : diffOf(game);
  const prevExec = game.roundPlan ? game.roundPlan.execution : null;
  const plan = rollRoundPlan(game, ad, base, prevExec, tBots);
  const ctPlan = rollCtPlan(game, ad, prevExec);
  game.roundPlan = plan;
  game.ctPlan = ctPlan;
  game.ctPush = false;
  game.ctPushRound = false;
  game.tAttackSite = plan.site;
  game.tSwitchedAt = 0;
  // 买→打闭环：按团队经济计划覆盖执行风格（未设置 teamBuyType 时回退现有逻辑）
  applyTeamBuyToPlan(plan, game.teamBuyType && game.teamBuyType.t);
  applyTeamBuyToPlan(ctPlan, game.teamBuyType && game.teamBuyType.ct);
  game.tRush = plan.rush;
  // archetype 用固定种子（只随 seed 不随 round），形成整局稳定分工
  assignArchetypes(tBots, (game.seed || 1));
  assignArchetypes(cBots, (game.seed || 1) + 7);
  // 人格由世界种子派生（与全局 botNameIdx 解耦）：同 seed → 同人格，
  // 修复"同进程连续开两局人格漂移"导致的确定性破坏（跨进程/跨会话一致）
  const ps = (game.seed || 1);
  for (let i = 0; i < tBots.length; i++) tBots[i].personality = rollPersonality(ps * 31 + i * 7);
  for (let i = 0; i < cBots.length; i++) cBots[i].personality = rollPersonality(ps * 37 + i * 7 + 3);
  // T 侧分路：人格加权分配（激进→主攻/vanguard、团队→mid、稳重→副攻 lane）
  const tn = tBots.length;
  const tMainN = Math.min(tn, plan.mainN ?? 3);
  const tOtherN = Math.max(0, Math.min(tn - tMainN, plan.otherN ?? 1));
  const tSlots = [];
  for (let i = 0; i < tn; i++) {
    tSlots.push(i < tMainN ? game.tAttackSite : i < tMainN + tOtherN ? (game.tAttackSite === 'A' ? 'B' : 'A') : 'mid');
  }
  const tRoles = weightedAssign(tBots, tSlots, {
    mainSite: game.tAttackSite,
    forceMain: true,
    forceOther: true,
    fn: (e, role) => tRoleAffinity(e, role, game.tAttackSite)
  });

  const laneCount = {};
  for (let i = 0; i < tBots.length; i++) {
    const e = tBots[i];
    e.role = tRoles[i];
    if (e.role === game.tAttackSite) {
      laneCount[e.role] = (laneCount[e.role] || 0) + 1;
      e.laneIdx = laneCount[e.role] - 1;
    } else {
      e.laneIdx = e.role === 'mid' ? 0 : 1;
    }
    e.spreadIdx = i;
    e.rushMode = game.tRush && e.role === game.tAttackSite;
    const archT = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
    e.vanguard = e.role === game.tAttackSite && (e.archetype === 'breacher' || archT.aggression >= 1.15 || (e.personality && e.personality.aggression >= 0.75));
    e.utilityRole = e.archetype === 'support' || archT.nade >= 1.2;
    e.objCache = null;
    e.objAt = 0;
    e.guardPoint = null;
    e.igl = i === 0;
    e.escort = e.role === game.tAttackSite && (e.archetype === 'support' || e.archetype === 'rifler');
    e.routePoint = tRouteFor(e, game);
    applyRoundParams(e, plan, 't');
  }
  const tMainArch = tBots.filter((e) => e.role === game.tAttackSite);
  if (tMainArch.length && !tMainArch.some((e) => e.vanguard)) {
    const lead = tMainArch.slice().sort((a, b) => aggressiveScore(b) - aggressiveScore(a))[0];
    if (lead) lead.vanguard = true;
  }
  const tVanguard = tMainArch.find((e) => e.vanguard);
  if (tVanguard) {
    const partner = tMainArch.find((e) => e !== tVanguard && (e.archetype === 'rifler' || e.archetype === 'support')) || tMainArch.find((e) => e !== tVanguard);
    if (partner) partner.tradePartner = true;
  }

  if (tMainArch.length && !tMainArch.some((e) => e.escort)) {
    const guard = tMainArch.find((e) => e.archetype === 'support' || e.archetype === 'rifler') || tMainArch[0];
    guard.escort = true;
  }
  if (plan.fake) {
    const fakeOther = tBots.filter((e) => e.role !== game.tAttackSite && e.role !== 'mid');
    if (fakeOther.length) fakeOther[0].decoy = true;
  }

  // CT 侧分路：人格加权分配（沉稳→anchor 站点、激进/团队→mid roamer）
  const cN = cBots.length;
  const cA = Math.max(1, Math.round(cN * ctPlan.siteBiasA));
  const cB = Math.max(1, cN - cA - 1);
  const cM = Math.max(0, cN - cA - cB);
  const cSlots = [];
  for (let i = 0; i < cN; i++) {
    cSlots.push(i < cA ? 'a' : i < cA + cB ? 'b' : 'mid');
  }
  const cRoles = weightedAssign(cBots, cSlots, {
    mainSite: null,
    forceMain: false,
    forceOther: false,
    fn: cRoleAffinity
  });
  const siteCount = { a: 0, b: 0, mid: 0 };
  for (let i = 0; i < cBots.length; i++) {
    const e = cBots[i];
    e.role = cRoles[i];
    e.spreadIdx = i;
    e.anchorIdx = e.role === 'mid' ? 0 : siteCount[e.role]++;
    if (ctPlan.antiRush && e.role !== 'mid') {
      e.anchorIdx = 0;
      e.holdShiftT = 24 + ctx.rand() * 6;
    }
    e.objCache = null;
    e.objAt = 0;
    e.igl = i === 0;
    e.ctRoamer = false;
    const archC = ARCHETYPES[e.archetype] || ARCHETYPES.rifler;
    e.utilityRole = e.archetype === 'support' || archC.nade >= 1.2;
    applyRoundParams(e, ctPlan, 'ct');
  }
  const prefRoamer = cBots
    .filter((e) => e.utilityRole || e.archetype === 'rifler')
    .sort((a, b) => ((ARCHETYPES[b.archetype] || ARCHETYPES.rifler).aggression || 0) - ((ARCHETYPES[a.archetype] || ARCHETYPES.rifler).aggression || 0))[0] ||
    cBots.find((e) => e.role === 'mid') || cBots[0];
  if (prefRoamer) prefRoamer.ctRoamer = true;
}

const ORDER_TEXT = {
  follow: '全体集合！', siteA: '全体进攻 A 点！', siteB: '全体进攻 B 点！', hold: '全体守住当前位置！'
};

// 玩家→bot 战术指令（F1-F4）：下发后 15s 内覆盖 bot 默认目标（低团队性 bot 可能无视）
export function setPlayerOrder(game, type) {
  const p = game.player;
  if (!p || p.dead || game.over || game.state === 'MENU') return;
  if (!ORDER_TEXT[type]) return;
  game.tOrder = { type, at: game.roundTime, x: p.x, y: p.y };
  // 指令落点 ping（candidate-566）：F1-F4 下令除 toast 外给小地图一个紫色方位标记
  addPing(game, 'order', p.x, p.y);
  // 玩家直接下"攻 A/B"令 → 同步 IGL 转点并重排 lane（复用 shared 的 redistributeTLanes）
  if ((type === 'siteA' || type === 'siteB') && game.state === 'LIVE' && !(game.bomb && game.bomb.planted)) {
    const target = type === 'siteA' ? 'A' : 'B';
    if (game.tAttackSite !== target) {
      game.tAttackSite = target;
      game.tSwitchedAt = game.roundTime;
      rebalanceTLanes(game);
    }
  }
  for (const e of game.entities) {
    if (e.bot) { e.objCache = null; e.objAt = 0; }
  }
  emit('toast', { text: ORDER_TEXT[type] });
}


function leadershipScore(e) {
  return (e.kills || 0) * 10 + (e.personality ? e.personality.aggression : 0.5) + ((e.aiParams && e.aiParams.riskT !== undefined) ? e.aiParams.riskT * 0.5 : 0.25);
}

export function refreshLeadership(game) {
  try {
    for (const team of ['t', 'ct']) {
      for (const e of game.entities) {
        if (e.bot && e.team === team && e.dead) {
          e.igl = false;
          if (team === 'ct') e.ctRoamer = false;
          if (team === 't') e.escort = false;
        }
      }
      const alive = game.entities.filter((e) => e.bot && e.team === team && !e.dead);
      if (!alive.length) continue;
      if (!alive.some((e) => e.igl)) {
        const igl = alive.slice().sort((a, b) => leadershipScore(b) - leadershipScore(a))[0];
        igl.igl = true;
        igl.objCache = null;
        igl.objAt = 0;
      }
      if (team === 'ct' && !alive.some((e) => e.ctRoamer)) {
        const roamer = alive.slice().sort((a, b) => leadershipScore(b) - leadershipScore(a))[0];
        roamer.ctRoamer = true;
        roamer.objCache = null;
        roamer.objAt = 0;
      }
      if (team === 't') {
        // T vanguard 阵亡 → 最激进幸存者接管主攻 lane
        const mainAlive = alive.filter((e) => e.role === game.tAttackSite);
        if (mainAlive.length && !mainAlive.some((e) => e.vanguard)) {
          const lead = mainAlive.slice().sort((a, b) => aggressiveScore(b) - aggressiveScore(a))[0];
          if (lead) lead.vanguard = true;
        }
        const carrier = alive.find((e) => e.hasBomb);
        if (carrier && !alive.some((e) => e.escort && e !== carrier)) {
          const guard = alive.filter((e) => e !== carrier).sort((a, b) => leadershipScore(b) - leadershipScore(a))[0];
          if (guard) {
            guard.escort = true;
            guard.objCache = null;
            guard.objAt = 0;
          }
        }
      }
    }
  } catch (err) {
    // 幂等安全：任何角色刷新异常不中断游戏帧（测试里已保证幂等）
  }
}

export function fillPlayerRole(game) {
  if (!game.player || !game.player.dead) return;
  refreshLeadership(game);
  if (game.tOrder && game.tOrder.type === 'follow') {
    const carrier = game.entities.find((o) => o.bot && o.team === 't' && !o.dead && o.hasBomb);
    if (carrier) game.tOrder = { type: 'follow', at: game.roundTime, x: carrier.x, y: carrier.y };
    else game.tOrder = null;
    for (const e of game.entities) {
      if (e.bot && e.team === 't') {
        e.objCache = null;
        e.objAt = 0;
      }
    }
  }
}
