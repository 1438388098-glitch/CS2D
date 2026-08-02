// 战术目标层：CT 守点/回防/前压/保枪、T 进点/装弹/守弹/转点/绕后、玩家指令服从
import { BOT_AI, DIFF } from '../config.js';
import { getMap, nearestSite } from '../map.js';
import { rand } from '../utils.js';
import { logAct, styleOf } from './shared.js';

export function botObjective(e, game) {
  const now = game.time * 1000;
  const bombState = game.bomb ? (game.bomb.planted ? (game.bomb.defusing ? 'pd' + game.bomb.site : 'p' + game.bomb.site) : (game.bomb.dropped ? 'd' : 'n')) : 'n';
  if (e.objCache && e.objBombState === bombState && now - e.objAt < 3000) return e.objCache;
  const o = botObjectiveRaw(e, game);
  e.objCache = o;
  e.objAt = now;
  e.objBombState = bombState;
  return o;
}

function retreatPoint(e, game) {
  const spawns = e.team === 't' ? getMap().spawns.t : getMap().spawns.ct;
  if (spawns && spawns.length) {
    let sx = 0, sy = 0;
    for (const s of spawns) { sx += s.x; sy += s.y; }
    return { x: sx / spawns.length, y: sy / spawns.length };
  }
  return { x: getMap().W / 2, y: getMap().H / 2 };
}

function entryPoint(cs, game) {
  const sp = getMap().spawns.t[0];
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
  if (e.team === 'ct') {
    if (planted) return { x: game.bomb.x, y: game.bomb.y };
    const ctAlive = game.entities.filter((o) => o.team === 'ct' && !o.dead && o !== e).length;
    const tAlive = game.entities.filter((o) => o.team === 't' && !o.dead).length;
    // 残局劣势保枪（风险偏好：莽的 bot 不保）
    if (ctAlive === 0 && tAlive >= 3 && rand() < (e.aiParams || DIFF[game.opts.diff]).saveChance * (1 - st.p.riskT * 0.5)) {
      logAct(game, e, 'retreat', '1v' + tAlive + ' 保枪');
      return retreatPoint(e, game);
    }
    // 听枪回防（全角色生效，不再只限 a/b 守点）
    const now = game.time * 1000;
    for (const o of game.entities) {
      if (o.team === 't' && !o.dead && now - o.lastShot < BOT_AI.HEAR_TTL) {
        if (Math.hypot(o.x - e.x, o.y - e.y) < BOT_AI.HEAR_RADIUS) return { x: o.x, y: o.y };
      }
    }
    // 前压侦察：IGL 拍板（game.ctPush），攻击性 bot 更积极，其余随队
    if (game.ctPush && rand() < 0.8 * st.p.aggression) {
      const sp = getMap().spawns.t[0];
      if (sp) {
        const dx = sp.x - e.x, dy = sp.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        logAct(game, e, 'push', '前压侦察');
        return { x: e.x + dx / len * 380 + rand(-90, 90), y: e.y + dy / len * 380 + rand(-90, 90) };
      }
    }
    if (e.role === 'a' || e.role === 'b') {
      const hold = e.role === 'a' ? getMap().holds.A : getMap().holds.B;
      const p = hold.anchors[e.anchorIdx % hold.anchors.length] || hold.anchors[0];
      return { x: p.x, y: p.y, face: Math.atan2(hold.entry.y - p.y, hold.entry.x - p.x) };
    }
    // mid：中央支援位（转点必经），同样享受听枪回防
    return { x: getMap().W / 2 + rand(-100, 100), y: getMap().H / 2 + rand(-100, 100) };
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
      // 守弹目标围绕炸弹实际位置（而非站点中心），确保能打断拆弹
      e.guardPoint = { x: game.bomb.x + rand(-90, 90), y: game.bomb.y + rand(-90, 90) };
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
  if (e.role === 'mid') return { x: getMap().W / 2 + rand(-80, 80), y: getMap().H / 2 + rand(-80, 80) };
  const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
  const tAlive2 = game.entities.filter((o) => o.team === 't' && !o.dead && o !== e).length;
  const ctAlive2 = game.entities.filter((o) => o.team === 'ct' && !o.dead).length;
  // 残局劣势保枪（风险偏好：莽的 bot 不保）
  if (tAlive2 === 0 && ctAlive2 >= 2 && rand() < (e.aiParams || DIFF[game.opts.diff]).saveChance * (1 - st.p.riskT * 0.5)) {
    logAct(game, e, 'retreat', '1v' + ctAlive2 + ' 保枪');
    return retreatPoint(e, game);
  }
  // 绕后角色（lurk）：回合前期绕到 CT 半场侧翼（出生点周边蹲点），中期回归攻击点
  if (st.arch.lurk && game.roundTime < 40 && !(game.bomb && game.bomb.planted)) {
    const ctSpawn = getMap().spawns.ct[0];
    if (ctSpawn) {
      logAct(game, e, 'lurk', '绕后至 CT 半场');
      return { x: ctSpawn.x + rand(-150, 150), y: ctSpawn.y + rand(-150, 150) };
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
