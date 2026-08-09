import {ROUND, ECONOMY, MAX_PARTICLES, resolveDiff, MAP_CT_REACT} from './config.js';
import {addMoney, clearEquipment} from './economy.js';
import {getMap, loadMap, findMapById, collideCircle, los, pathTo, tileAt, passableTolerant, fallbackSpawn} from './map.js';
import {createEntity, spawnEntity, weaponDef, ammoFor} from './entities.js';
import {fireWeapon, startReload, finishReload, pickupWeapon, redrawDecals, RECOIL_RECOVER} from './combat.js';
import {updateShotStreak} from './ballistic.js';
import {updateGrenades} from './grenades.js';
import {updateBots, assignRoles, botBuyAll, recordRoundResult} from './ai.js';
import {explodeBomb, plantBomb, defuseBomb, pickupBomb} from './bomb.js';
import {ctx, seedWorld} from './ctx.js';
import {getMode} from './registry.js';
import {clamp, lerp, rand, angDiff, rotateInputVector} from './utils.js';
import {pressed, getBindLabel} from './keymap.js';
import {initInfo, prune} from './info.js';
import {initOppModel} from './ai/oppmodel.js';
import {hasLineOfSight} from './fog.js';
import { shouldRerouteStuck } from './ai/rules.js';
import { stuckObjective } from './ai/stability.js';
import { castAimRay as castAimRayFps } from './fps-laser.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export const FPS_PITCH_LIMIT = 1.35;

// FPS 移动缩放：速度按地图瓦片尺寸归一（官方图 tile=16，235px/s 等效 14.7 格/s 过快），
// 并附加 0.9 的第一人称手感系数；俯视模式不变
function fpsMoveScale(game) {
  const tile = (getMap() && getMap().tile) || 40;
  return 0.9 * tile / 40;
}


export function createGame(opts = {}) {
  const game = {
    state: 'MENU',
    entities: [], grenades: [], particles: [], tracers: [], smokes: [], decals: [], drops: [], barrels: [], crates: [], _particlePool: [],
    lastSplash: null,
    player: null,
    camX: 1200, camY: 900,
    round: 0, roundTime: 0, roundDur: ROUND.DURATION, buyTime: 0,
    freezeT: 0, endedT: 0,
    score: { T: 0, CT: 0 },
    bomb: null, flashT: 0, dmgT: 0, shake: 0, dmgSpreadT: 0, killRingT: 0,
    over: false, spectateIdx: 0, lastPlantSite: null, dt: 0.016,
    lossStreakT: 0, lossStreakCT: 0,
    hitMarkT: 0, hitFlashT: 0, headshotT: 0, zoom: 0.75, hitPauseT: 0, dmgPops: [], hitOutlines: [], scopeT: 0, lastKiller: null,
    viewMode: 'top', fpsSens: 0.002, fpsSensY: 0.002, invertY: false, renderQuality: 1, dprLimit: 2, _mlookDx: 0, _mlookDy: 0, _specAngle: null, _specPitch: null, _specManual: null,
    stats: { hits: 0, shots: 0, headshots: 0 },
    time: 0,
    tAttackSite: 'A',
    tSwitchedAt: 0, tRush: false,
    mode: null,
    ot: false,
    seed: null,
    playerKills: [],
    mapW: 2400, mapH: 1800, canvasW: 1280, canvasH: 720,
    opts: { team: 'ct', diff: 'normal', bots: 4, sound: true, mapId: 'dust2' },
    noRoundEnd: false,
    input: { keys: {}, mouse: { x: 0, y: 0, down: false, rdown: false, wasDown: false }, lastMouse: { x: 0, y: 0 } },
    ui: null,
    layers: null,
    onMapChanged: null
  };
  Object.assign(game.opts, opts);
  return game;
}

export function setLayers(game, layers) {
  game.layers = layers;
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.camX = clamp(game.camX, 0, Math.max(0, game.mapW));
  game.camY = clamp(game.camY, 0, Math.max(0, game.mapH));
}

export function spawnParticle(game, props) {
  if (!game._particlePool) game._particlePool = [];
  const p = game._particlePool.pop() || {};
  Object.assign(p, props);
  game.particles.push(p);
  return p;
}

export function startMatch(game) {
  const ui = game.ui;
  const viewSettings = {
    viewMode: game.viewMode,
    fpsSens: game.fpsSens,
    fpsSensY: game.fpsSensY,
    invertY: game.invertY,
    fov: game.fov,
    renderQuality: game.renderQuality,
    dpr: game.dpr,
    dprLimit: game.dprLimit
  };
  if (ui) {
    emit('hideMenu');
    emit('hideEnd');
    emit('closeBuy');
    emit('scoreboard', { open: false });
    emit('unpause');
  }
  const fresh = createGame();
  // 保留调用者传入的世界种子（训练/回放确定性）：Object.assign 会用 fresh.seed=null 覆盖
  const callerSeed = game.seed;
  fresh.opts = game.opts;
  fresh.opts.diffParams = resolveDiff(game.opts.diff, game.opts.hellLevel);
  fresh.mode = game.opts.mode || null;
  fresh.noRoundEnd = false;
  fresh.ui = game.ui;
  fresh.layers = game.layers;
  fresh.canvasW = game.canvasW;
  fresh.input = game.input;
  fresh.onMapChanged = game.onMapChanged;
  fresh.lan = game.lan;
  Object.assign(game, fresh);
  Object.assign(game, viewSettings);
  // 世界种子：整局随机流可复现（回放/调试/训练一致性）；可传 game.seed 固定复现
  game.ctReactionMult = MAP_CT_REACT[game.opts.mapId] || 0.45;
  game.mapId = game.opts.mapId;
  if (callerSeed !== undefined && callerSeed !== null) game.seed = callerSeed;
  else if (game.seed === null) game.seed = Math.floor(Math.random() * 0x7fffffff);
  seedWorld(game.seed);
  initInfo(game);
  initOppModel(game);
  game.over = false;
  // 清理模式残留（cyber/major 等按模式注入的 game 字段，避免跨模式泄漏）
  for (const k of ['major', 'cyber']) delete game[k];
  const modeDef = game.mode ? getMode(game.mode) : null;
  if (modeDef && modeDef.start) {
    modeDef.start(game);
  } else {
    setupMatchEntities(game);
    startRound(game);
  }
  if (ui) {
    emit('objtextShow');
    emit('flash', { opacity: 0 });
  }
}

export function setupMatchEntities(game) {
  loadMap(findMapById(game.opts.mapId || 'dust2'));
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.barrels = (getMap().barrels || []).map((b) => ({ ...b }));
  game.crates = (getMap().crates || []).map((c) => ({ ...c }));
  if (game.onMapChanged) game.onMapChanged(getMap());
  const human = createEntity(game.opts.team, false);
  game.player = human;
  game.entities.push(human);
  for (let i = 0; i < game.opts.bots; i++) {
    game.entities.push(createEntity('t', true));
    game.entities.push(createEntity('ct', true));
  }
  // 快速对局注入实体级 AI 参数（对齐模式对局行为）：展开 diffParams 全字段，
  // 使 S3 特性（intel/oppModel/peekSkill/counterStrafe/tradeSpeed/spreadCtrl/ecoDiscipline）
  // 与回合变异性（applyRoundParams）在默认对局同样生效，消除"部署态≠评估态"
  const diffParams = game.opts.diffParams || resolveDiff(game.opts.diff, game.opts.hellLevel);
  for (const e of game.entities) {
    if (e.bot && !e.aiParams) e.aiParams = { ...diffParams };
  }
}

function spawnRound(game) {
  game.input.mouse.wasDown = game.input.mouse.down;
  game.lastKiller = null;
  game.dmgPops.length = 0;
  game.tOrder = null;
  const spawnTick = { t: 0, ct: 0 };
  for (const e of game.entities) {
    e.lastNadeT = 0;
    let list = e.team === 'ct' ? getMap().spawns.ct : getMap().spawns.t;
    if (!list || !list.length) {
      const fb = fallbackSpawn(e.team);
      list = fb ? [fb] : null;
    }
    const teamKey = e.team === 'ct' ? 'ct' : 't';
    spawnEntity(e, list, spawnTick[teamKey]++);
    // 出生拥挤偏移：官方图每队仅 4 个出生点，5v5 第 5 人会与队友重叠；
    // 从出生点沿可通行方向偏移到最近不重叠的位置，避免叠罗汉出生
    if (spawnTick[teamKey] > list.length) {
      const occ = new Set();
      for (const o of game.entities) if (o !== e && !o.dead) occ.add(Math.round(o.x / 16) + ',' + Math.round(o.y / 16));
      outer:
      for (let r = 16; r <= 96; r += 16) {
        for (let dy = -r; dy <= r; dy += 16) {
          for (let dx = -r; dx <= r; dx += 16) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = e.x + dx, ny = e.y + dy;
            if (occ.has(Math.round(nx / 16) + ',' + Math.round(ny / 16))) continue;
            if (passableTolerant(nx, ny)) { e.x = nx; e.y = ny; break outer; }
          }
        }
      }
    }
    if (e.bot) {
      const target = e.team === 't' ? getMap().spawns.ct[0] : getMap().spawns.t[0];
      if (target) e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    } else if (game.viewMode === 'fps') {
      // FPS 下玩家出生朝向敌方出生点（俯视模式一帧内被鼠标瞄准覆盖，无需处理）
      const target = e.team === 't' ? getMap().spawns.ct[0] : getMap().spawns.t[0];
      if (target) e.angle = Math.atan2(target.y - e.y, target.x - e.x);
    }
  }
  assignRoles(game);
  botBuyAll(game);
  // H11 信息优势（intel 模式）：回合初获知 CT 防守分布（角色+锚点），供弱侧选择与预瞄
  game.h11Intel = null;
  game.h11T = null;
  const h11T = game.entities.find((e) => e.bot && e.team === 't' && e.aiParams && e.aiParams.intel);
  if (h11T) {
    game.h11T = h11T;
    const intel = { roles: [], anchors: [] };
    for (const e of game.entities) {
      if (e.bot && e.team === 'ct' && !e.dead) {
        const hold = e.role === 'a' ? getMap().holds.A : (e.role === 'b' ? getMap().holds.B : null);
        const ap = hold && hold.anchors && hold.anchors.length ? hold.anchors[(e.anchorIdx || 0) % hold.anchors.length] : null;
        intel.roles.push({ role: e.role, x: ap ? ap.x : e.x, y: ap ? ap.y : e.y });
      }
    }
    game.h11Intel = intel;
  }
  const tBots = game.entities.filter((e) => e.team === 't');
  for (const e of tBots) e.hasBomb = false;
  if (tBots.length) {
    const carrier = tBots[Math.floor(rand() * tBots.length)];
    carrier.hasBomb = true;
    carrier.role = game.tAttackSite;
    carrier.rushMode = game.tRush;
    if (carrier.escort) {
      const alt = tBots.find((e) => e !== carrier && e.role === game.tAttackSite);
      if (alt) { carrier.escort = false; alt.escort = true; }
    }
  }
  game.bomb = null;
  game.smokes.length = 0;
  game.grenades.length = 0;
  game._particlePool = game._particlePool || [];
  game._particlePool.push(...game.particles);
  game.particles.length = 0;
  game.tracers.length = 0;
  game.drops.length = 0;
  game.lastPlantSite = null;
  game.decals.length = 0;
  game.flashT = 0;
  game.tSwitchedAt = 0;
  game.tRush = false;
  if (game.player) { game.player.dmgGiven = 0; game.player.dmgHeads = 0; }
  prune(game);
  if (game.layers) game.layers.decal.getContext('2d').clearRect(0, 0, getMap().W, getMap().H);
  if (game.ui) {
    emit('flash', { opacity: 0 });
    emit('holdbar', { show: false, pct: 0 });
  }
}

export function skipSpectatedRound(game) {
  if (!game.player || !game.player.dead || game.over) return { ok: false };
  let guard = 0;
  while (guard++ < 5000 && game.state !== 'END' && !game.over) update(game, 0.05);
  return { ok: game.state === 'END' };
}

export function startRound(game) {
  game.round++;
  // 换边：常规第 ROUND.SIDE_SWAP_AFTER+1 回合；加时每 3 回合再换
  const swapRound = game.round === ROUND.SIDE_SWAP_AFTER + 1 ||
    (game.ot && (game.round - (ROUND.SIDE_SWAP_AFTER + 1)) % ROUND.OT_SWAP_EVERY === 0 && game.round > ROUND.SIDE_SWAP_AFTER + 1);
  if (swapRound) {
    for (const e of game.entities) {
      e.team = e.team === 'ct' ? 't' : 'ct';
      clearEquipment(e);
      e.money = ECONOMY.START_MONEY;
    }
    const scoreT = game.score.T;
    game.score.T = game.score.CT;
    game.score.CT = scoreT;
    if (Array.isArray(game.winHistory)) {
      game.winHistory = game.winHistory.map((w) => w === 'T' ? 'C' : w === 'C' ? 'T' : w);
    }
    game.lossStreakT = 0;
    game.lossStreakCT = 0;
    emit('toast', { text: '阵营已交换！' });
  }
  game.state = 'BUY';
  game.roundTime = 0;
  game.buyTime = ROUND.BUY_TIME;
  game.freezeT = ROUND.FREEZE;
  game.endedT = 0;
  spawnRound(game);
  emit('sfx', { name: 'whistle', vol: 0.7, game });
  if (game.ui) {
    emit('bannerHide');
    emit('toast', { text: '第 ' + game.round + ' 回合' });
  }
  updateBombHud(game);
}

export function endRound(game, winner, reason, winType) {
  if (game.state === 'END') return;
  game.state = 'END';
  game.endedT = ROUND.END_DELAY;
  if (!game.winHistory) game.winHistory = [];
  game.winHistory.push(winner === 't' ? 'T' : winner === 'ct' ? 'C' : 'D');
  recordRoundResult(game, winner, winType);
  if (winner) {
    game.score[winner === 't' ? 'T' : 'CT']++;
    const loser = winner === 't' ? 'ct' : 't';
    const lossKey = loser === 't' ? 'lossStreakT' : 'lossStreakCT';
    const winKey = winner === 't' ? 'lossStreakT' : 'lossStreakCT';
    const lossStreak = game[lossKey] || 0;
    const reward = winType === 'bomb' || winType === 'defuse' ? ECONOMY.WIN_BOMB_MONEY : ECONOMY.WIN_MONEY;
    const bonus = ECONOMY.LOSS_BONUS[Math.min(lossStreak, ECONOMY.LOSS_BONUS.length - 1)];
    for (const e of game.entities) {
      if (e.team === winner) {
        e.lossStreak = 0;
        addMoney(e, reward);
      } else {
        e.lossStreak = lossStreak + 1;
        addMoney(e, bonus);
      }
    }
    game[winKey] = 0;
    game[lossKey] = lossStreak + 1;
  } else {
    // 平局（同归于尽）：双方获得固定补偿，不改变连胜/连败，避免"白打一回合"
    for (const e of game.entities) addMoney(e, 1500);
  }
  const text = winner === 't' ? 'TERRORISTS WIN' : (winner === 'ct' ? 'COUNTER-TERRORISTS WIN' : 'DRAW');
  const col = winner === 't' ? '#ffb545' : (winner === 'ct' ? '#5ab0ff' : '#888');
  emit('banner', { t1: text, t2: reason, col });
  const isWin = game.player && winner === game.player.team;
  if (isWin) emit('sfx', { name: 'win', vol: 0.9, game });
  else if (winner) emit('sfx', { name: 'lose', vol: 0.8, game });
}

export function finishMatch(game) {
  game.over = true;
  game.state = 'END';
  const modeDef = game.mode ? getMode(game.mode) : null;
  if (modeDef && modeDef.onFinish) modeDef.onFinish(game);
  const winAt = game.ot ? (game.otWin || ROUND.OT_WIN) : (game.matchWin || ROUND.MATCH_WIN);
  const win = (game.score.T >= winAt && game.player.team === 't') ||
    (game.score.CT >= winAt && game.player.team === 'ct');
  const ui = game.ui;
  if (!ui) return;
  const p = game.player;
  const all = game.entities.slice();
  all.sort((a, b) => b.kills - a.kills);
  const mvp = all[0];
  let bestWeapon = null;
  let bestN = 0;
  for (const key in p.wKills) {
    if (p.wKills[key] > bestN) { bestN = p.wKills[key]; bestWeapon = key; }
  }
  ui.showMatchEnd(win, game.score.T + ' : ' + game.score.CT,
    p.kills + ' 杀 / ' + p.deaths + ' 死 / ' + p.assists + ' 助攻',
    mvp.name + ' (' + (mvp.team === 'ct' ? 'CT' : 'T') + ') — ' + mvp.kills + ' 击杀',
    {
      hits: game.stats.hits,
      shots: game.stats.shots,
      headshots: game.stats.headshots,
      bestWeapon,
      accuracy: game.stats.shots > 0 ? game.stats.hits / game.stats.shots : 0
    });
}

function objectiveText(game) {
  const p = game.player;
  if (!p) return { main: '', sub: '' };
  const ik = getBindLabel('interact');
  if (p.dead) return { main: '观战中…', sub: '等待下回合' };
  if (p.team === 'ct') {
    if (game.bomb && game.bomb.planted) return { main: '拆除炸弹！', sub: '前往 ' + (game.bomb.site === 'A' ? 'A 区' : 'B 区') + ' · 按住 ' + ik };
    return { main: '守卫目标点', sub: '阻止 T 方安装炸弹' };
  }
  if (p.hasBomb) return { main: '前往目标点安装炸弹', sub: '按住 ' + ik + ' 安装' };
  if (game.bomb && game.bomb.dropped) return { main: '炸弹掉落了', sub: '靠近拾取' };
  if (game.bomb && game.bomb.planted) return { main: '掩护炸弹', sub: '等待爆炸' };
  return { main: '进攻目标点', sub: '夺回炸弹并安装' };
}

export function updateBombHud(game) {
  const p = game.player;
  if (!p) return;
  const ot = objectiveText(game);
  emit('objtext', { main: ot.main, sub: ot.sub });
}


export function update(game, dt) {
  dt = Math.min(dt, 0.05);
  if (game.hitPauseT > 0) {
    game.hitPauseT -= dt;
    return;
  }
  for (let i = game.dmgPops.length - 1; i >= 0; i--) {
    game.dmgPops[i].t -= dt;
    if (game.dmgPops[i].t <= 0) game.dmgPops.splice(i, 1);
  }
  game.dt = dt;
  game.time += dt;
  if (game.over) return;
  let modeDef = null;
  if (game.mode) {
    modeDef = typeof game.mode === 'string' ? getMode(game.mode) : game.mode;
    if (modeDef && modeDef.update) modeDef.update(game, dt);
    if (game.over) return;
  }
  if (game.state === 'MENU' || game.state === 'MAJOR' || game.state === 'EDITOR') return;
  if (game.ui && game.ui.isPaused()) return;
  updateTimers(game, dt);
  if (game.state === 'END') {
    updateCam(game, dt);
    return;
  }
  updatePlayer(game, dt);
  if (modeDef && modeDef.customBots) updateCustomBots(game, dt);
  else updateBots(game, dt);

  updateGrenades(game, dt);
  for (const e of game.entities) {
    if (e.dead) continue;
    const curTile = tileAt(e.x, e.y);
    // 涉水减速：浅水/深水均为 40%（spec 4.3）
    if (curTile === '~' || curTile === '≈') { e.vx *= 0.6; e.vy *= 0.6; }
    if (e.stunT > 0) { e.vx *= 0.3; e.vy *= 0.3; }
    // FPS 下 bot 与玩家同步减速（玩家已在 updatePlayer 内缩放，此处仅 bot）
    const mvS = e.bot && game.viewMode === 'fps' ? fpsMoveScale(game) : 1;
    e.x += e.vx * dt * mvS;
    e.y += e.vy * dt * mvS;
    collideCircle(e);
    const prevH = e.height;
    e.height = curTile === '^' ? 1 : curTile === 'R' ? 0.5 : 0;
    if (prevH === 1 && e.height === 0) e.stunT = 0.4;
    if (e.height < prevH) e.airborneT = 0.35;
    else if (e.airborneT > 0) e.airborneT = Math.max(0, e.airborneT - dt);
    if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt);
    e.vx *= Math.max(0, 1 - 7 * dt);
    e.vy *= Math.max(0, 1 - 7 * dt);
    // 溅水：仅浅水发声/水花（深水静音，spec 4.3）
    if (e.splashCd > 0) e.splashCd = Math.max(0, e.splashCd - dt);
    if (e.splashCd <= 0 && curTile === '~' && Math.hypot(e.vx, e.vy) > 60) {
      e.splashCd = 0.5;
      game.lastSplash = { team: e.team, x: e.x, y: e.y, t: game.time };
      for (let i = 0; i < 4; i++) {
        spawnParticle(game, { kind: 'splash', x: e.x + rand(-8, 8), y: e.y + rand(-4, 6), vx: rand(-40, 40), vy: rand(-140, -40), life: 0.4, size: rand(2, 4) });
      }
      emit('sfx', { name: 'splash', vol: 0.5, x: e.x, y: e.y, game });
    }
    if (e.bot) {
      e.stuckT += dt;
      const navNow = e.navTime || game.time || 0;
      if (e.stuckT > 0.6 && (!e.lastRerouteAt || navNow - e.lastRerouteAt >= 1.2)) {
        const sd = Math.hypot(e.x - e.lastSample.x, e.y - e.lastSample.y);
        if (shouldRerouteStuck(e, sd)) {
          const obj = stuckObjective(e, game);
          const side = (e.stuckEscapes || 0) % 2 ? 1 : -1;
          const ang = Math.atan2(obj.y - e.y, obj.x - e.x);
          const tx = obj.x + Math.cos(ang + Math.PI / 2 * side) * 80 + rand(-25, 25);
          const ty = obj.y + Math.sin(ang + Math.PI / 2 * side) * 80 + rand(-25, 25);
          pathTo(e, tx, ty);
          if (!e.path) pathTo(e, obj.x, obj.y);
          e.lastRerouteAt = navNow;
          e.stuckEscapes = (e.stuckEscapes || 0) + 1;
        }
        e.stuckT = 0;
        e.lastSample = { x: e.x, y: e.y };
      }
    }
  }
  while (game.particles.length > MAX_PARTICLES) { game._particlePool.push(game.particles.shift()); }
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pa = game.particles[i];
    pa.life -= dt;
    if (pa.life <= 0) { game._particlePool.push(pa); game.particles[i] = game.particles[game.particles.length - 1]; game.particles.pop(); continue; }
    pa.x += pa.vx * dt;
    pa.y += pa.vy * dt;
    pa.vx *= Math.max(0, 1 - 3 * dt);
    pa.vy *= Math.max(0, 1 - 3 * dt);
  }
  for (let di = game.drops.length - 1; di >= 0; di--) {
    const d = game.drops[di];
    if (d.noPickT > 0) d.noPickT = Math.max(0, d.noPickT - dt);
    d.life -= dt;
    if (d.life <= 0) game.drops.splice(di, 1);
  }
  for (let t2 = game.tracers.length - 1; t2 >= 0; t2--) {
    game.tracers[t2].life -= dt;
    if (game.tracers[t2].life <= 0) game.tracers.splice(t2, 1);
  }
  // 弹孔/尸体渐隐：life 衰减，进入淡出窗口（<3s）或移除时重绘静态层
  let decalDirty = false;
  for (let di = game.decals.length - 1; di >= 0; di--) {
    const d = game.decals[di];
    d.life -= dt;
    if (d.life <= 0) { game.decals.splice(di, 1); decalDirty = true; }
    else if (d.life < 3) decalDirty = true;
  }
  if (decalDirty) redrawDecals(game);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 20);
  if (game.dmgT > 0) game.dmgT -= dt;
  if (game.dmgSpreadT > 0) game.dmgSpreadT -= dt;
  if (game.killRingT > 0) game.killRingT -= dt;
  if (game.hitMarkT > 0) game.hitMarkT -= dt;
  if (game.hitFlashT > 0) game.hitFlashT -= dt;
  if (game.headshotT > 0) game.headshotT -= dt;
  for (let i = game.hitOutlines.length - 1; i >= 0; i--) {
    const ho = game.hitOutlines[i];
    ho.t -= dt;
    if (ho.t <= 0 || ho.target.dead) game.hitOutlines.splice(i, 1);
  }
  if (game.flashT > 0) {
    game.flashT -= dt;
    emit('flash', { opacity: Math.min(0.9, game.flashT * 0.22) });
  } else {
    emit('flash', { opacity: 0 });
  }
  emit('dmg', { opacity: clamp(game.dmgT * 2, 0, 1) });
  const pl = game.player;
  if (pl && !pl.dead && pl.hp <= 25) {
    const hpRatio = (25 - pl.hp) / 25;
    emit('lowhp', { opacity: clamp(0.15 + hpRatio * 0.5, 0, 0.55) + 0.08 * Math.sin(performance.now() / 150) });
  } else if (pl && !pl.dead) {
    emit('lowhp', { opacity: 0 });
  }
  let camTarget = game.player;
  if (game.player && game.player.dead) {
    if (game.cyber && !game.cyber.ended) {
      const bots = game.entities.filter((e) => e.bot && !e.dead);
      if (bots.length) camTarget = bots[game.spectateIdx % bots.length];
      game.zoom = 0.75;
    } else {
      const mates = game.entities.filter((e) => e.team === game.player.team && !e.dead);
      if (mates.length) camTarget = mates[game.spectateIdx % mates.length];
    }
  }
  // 跟随视角：相机以玩家为绝对中心（不 clamp，世界随朝向旋转由 render 完成）
  if (game.viewMode === 'follow' && game.player && !game.player.dead && !game.cyber) {
    game.camX = game.player.x;
    game.camY = game.player.y;
  } else if (camTarget) {
    game.camX = lerp(game.camX, camTarget.x, Math.min(1, 18 * dt));
    game.camY = lerp(game.camY, camTarget.y, Math.min(1, 18 * dt));
    const z = game.zoom || 1;
    const hw = game.canvasW / 2 / z;
    const hh = game.canvasH / 2 / z;
    game.camX = clamp(game.camX, hw, Math.max(hw, game.mapW - hw));
    game.camY = clamp(game.camY, hh, Math.max(hh, game.mapH - hh));
  }
  updatePlayerAim(game, dt);
  updateBombHud(game);
  if (game.ui && game.ui.isScoreboardOpen && game.ui.isScoreboardOpen()) {
    emit('refreshScoreboard');
  }
}

function updateCustomBots(game, dt) {
  if (modeBotsUpdate) modeBotsUpdate(game, dt);
}

let modeBotsUpdate = null;
export function setCustomBotsUpdater(fn) { modeBotsUpdate = fn; }
function updateCam(game, dt) {
  let camTarget = game.player;
  if (game.player && game.player.dead) {
    // 击杀镜头：死亡后 0.9s 锁定击杀者视角，随后切入队友观战
    if (game.killCamT > 0) {
      game.killCamT -= dt;
      if (game.lastKiller && !game.lastKiller.dead) camTarget = game.lastKiller;
    } else {
      const mates = game.entities.filter((e) => e.team === game.player.team && !e.dead);
      if (mates.length) camTarget = mates[game.spectateIdx % mates.length];
    }
  }
  if (game.viewMode === 'follow' && camTarget && !camTarget.dead && !game.cyber) {
    // follow 相机 look-ahead：沿瞄准方向前置一小段，提升前方视野感知；空闲时平滑回落
    const laDist = camTarget === game.player ? 90 : 40;
    const lookX = Math.cos(camTarget.angle || 0) * laDist;
    const lookY = Math.sin(camTarget.angle || 0) * laDist;
    game.camX = lerp(game.camX, camTarget.x + lookX, Math.min(1, 5 * dt));
    game.camY = lerp(game.camY, camTarget.y + lookY, Math.min(1, 5 * dt));
    const z2 = game.zoom || 1;
    const hw2 = game.canvasW / 2 / z2;
    const hh2 = game.canvasH / 2 / z2;
    game.camX = clamp(game.camX, hw2, Math.max(hw2, game.mapW - hw2));
    game.camY = clamp(game.camY, hh2, Math.max(hh2, game.mapH - hh2));
    return;
  }
  if (camTarget) {
    game.camX = lerp(game.camX, camTarget.x, Math.min(1, 18 * dt));
    game.camY = lerp(game.camY, camTarget.y, Math.min(1, 18 * dt));
  }
  const z = game.zoom || 1;
  const hw = game.canvasW / 2 / z;
  const hh = game.canvasH / 2 / z;
  game.camX = clamp(game.camX, hw, Math.max(hw, game.mapW - hw));
  game.camY = clamp(game.camY, hh, Math.max(hh, game.mapH - hh));
}

function updateTimers(game, dt) {
  if (game.state === 'BUY') {
    game.buyTime -= dt;
    game.freezeT -= dt;
    if (game.buyTime <= 0 && game.freezeT <= 0) {
      game.state = 'LIVE';
      game.roundTime = 0;
      emit('closeBuy');
    }
  } else if (game.state === 'LIVE') {
    const bombPlanted = !!(game.bomb && game.bomb.planted);
    if (!bombPlanted) game.roundTime += dt;
    if (!bombPlanted && game.roundTime >= game.roundDur) {
      endRound(game, 'ct', '时间耗尽', 'timeout');
    }
  } else if (game.state === 'END') {
    game.endedT -= dt;
    if (game.endedT <= 0 && !game.over) {
      const winAt = game.ot ? (game.otWin || ROUND.OT_WIN) : (game.matchWin || ROUND.MATCH_WIN);
      if (game.score.T >= winAt || game.score.CT >= winAt) {
        finishMatch(game);
      } else if (!game.ot && winAt >= 9 && game.score.T >= winAt - 1 && game.score.CT >= winAt - 1) {
        // 平分进入加时（仅长赛制 MR9+ 保留；BO9 先 5 胜，4:4 直接打第 9 局决胜，无加时）
        game.ot = true;
        emit('toast', { text: '进入加时赛！先赢 3 回合获胜（' + (winAt + 2) + ' 分）' });
        startRound(game);
      } else {
        startRound(game);
      }
    }
  }
  if ((game.state === 'BUY' || game.state === 'LIVE') && game.bomb && game.bomb.planted) {
    game.bomb.timer -= dt;
    if (game.bomb.timer <= 0) explodeBomb(game);
    // 倒计时 beep 加速：>10s 每秒、<10s 半秒、<5s 1/4 秒升频
    const bt = game.bomb.timer;
    const bInt = bt < 5 ? 0.25 : bt < 10 ? 0.5 : 1;
    game._bombBeepT = (game._bombBeepT || 0) - dt;
    if (game._bombBeepT <= 0) {
      game._bombBeepT = bInt;
      emit('sfx', { name: bt < 5 ? 'beepFast' : 'beep', vol: bt < 10 ? 0.6 : 0.4, x: game.bomb.x, y: game.bomb.y, game });
    }
  }
  // 低血心跳（≤25hp，音量随血量线性）
  const hp = game.player && !game.player.dead ? game.player.hp : 0;
  if (hp > 0 && hp <= 25 && (game.state === 'BUY' || game.state === 'LIVE')) {
    game._heartT = (game._heartT || 0.8) - dt;
    if (game._heartT <= 0) {
      game._heartT = 0.8;
      emit('sfx', { name: 'heart', vol: 0.2 + (25 - hp) / 25 * 0.2, game });
    }
  }
}

function updatePlayer(game, dt) {
  const p = game.player;
  if (!p || p.dead) return;
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const input = game.input;
  const keys = input.keys;
  const mouse = input.mouse;
  const w = weaponDef(p);
  const spd = 235 * (w ? w.speed : 1) * (game.viewMode === 'fps' ? fpsMoveScale(game) : 1);
  let ax = 0, ay = 0;
  if (game.freezeT > 0) {
    ax = 0; ay = 0;
  } else {
    if (pressed(keys, 'moveUp')) ay -= 1;
    if (pressed(keys, 'moveDown')) ay += 1;
    if (pressed(keys, 'moveLeft')) ax -= 1;
    if (pressed(keys, 'moveRight')) ax += 1;
    if (game.viewMode === 'fps' || game.viewMode === 'follow') {
      // FPS/跟随：W=朝角前进、D=右平移（复用 utils 纯函数，与单测同源）
      const rv = rotateInputVector(ax, ay, p.angle);
      ax = rv.x; ay = rv.y;
    }
  }
  // FPS/跟随转向键：freeze 期间也允许原地转身（与鼠标视角行为一致）
  if (game.viewMode === 'fps' || game.viewMode === 'follow') {
    const turn = (pressed(keys, 'turnRight') ? 1 : 0) - (pressed(keys, 'turnLeft') ? 1 : 0);
    if (turn) p.angle += turn * 2.8 * dt;
  }
  pickupWeapon(p, game);
  const len = Math.hypot(ax, ay);
  if (len > 0) { ax /= len; ay /= len; }
  const walk = pressed(keys, 'walk') && len > 0;
  p.walking = walk && len > 0;
  p.crouched = pressed(keys, 'crouch');
  p.scoped = mouse.rdown && p.slot === 'primary' && p.weapons.primary === 'awp';
  const wantScope = p.scoped ? 1 : 0;
  game.scopeT = (game.scopeT || 0) + (wantScope - (game.scopeT || 0)) * Math.min(1, 10 * dt);
  // 跟随视角：拉近到 1.0 突出"个人中心"（俯视 0.75 / FPS 由 render3d 接管）
  game.zoom = game.viewMode === 'follow' ? 1.0 : 0.75;
  const curSpd = spd * (walk ? 0.55 : 1) * (p.scoped ? 0.5 : 1) * (p.crouched ? 0.5 : 1) * (p.speedMult || 1);
  const moving = len > 0 && game.freezeT <= 0;
  const wantVx = ax * curSpd, wantVy = ay * curSpd;
  if (game.viewMode === 'fps' || game.viewMode === 'follow') {
    // FPS/跟随移动手感：速度指数趋近目标（起步/急停有重量感，不瞬移）
    const k = 1 - Math.exp(-9 * dt);
    p.vx = p.vx + (wantVx - p.vx) * k;
    p.vy = p.vy + (wantVy - p.vy) * k;
    // 步态相位：驱动渲染的头/身体 bob（仅移动时推进）
    if (moving) p.bobPhase = (p.bobPhase || 0) + dt * (walk ? 9 : 12);
  } else {
    p.vx = wantVx;
    p.vy = wantVy;
  }
  p.stepT -= dt;
  if (moving && p.stepT <= 0) {
    p.stepT = walk ? 0.45 : 0.3;
    const stTile = tileAt(p.x, p.y);
    let stMat = 'flat';
    if (stTile === '≈' || stTile === '~') stMat = 'water';
    else if (stTile === '=') stMat = 'thin';
    else if (stTile === 'M' || stTile === 'm') stMat = 'metal';
    emit('sfx', { name: 'step', vol: walk ? 0.14 : 0.4, x: p.x, y: p.y, game, mat: stMat });
    game.lastStep = { x: p.x, y: p.y, t: game.time, walk, team: p.team };
  }
  updatePlayerAim(game, dt);
  p._aimHit = castAimRayFps(p, game);
  const held = weaponDef(p);
  if (held && held.kind !== 'knife') {
    p.laserEnd = p._aimHit;
  } else {
    p.laserEnd = null;
  }
  input.lastMouse.x = mouse.x;
  input.lastMouse.y = mouse.y;
  const wantFire = mouse.down && game.freezeT <= 0 && (game.state === 'BUY' || game.state === 'LIVE');
  p.trigger = wantFire && (w.auto ? true : !mouse.wasDown);
  mouse.wasDown = mouse.down;
  p.recoil = Math.max(0, p.recoil - RECOIL_RECOVER * dt * (p.recoil > 1.1 ? 1.8 : 0.55) * (p.recoverMult || 1));
  updateShotStreak(p, dt);
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.muzzleT > 0) p.muzzleT -= dt;
  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) finishReload(p, game);
  }
  if (p.trigger && p.fireCd <= 0) fireWeapon(p, game);
  if (p.blind > 0) p.blind -= dt;
  const wd = weaponDef(p);
  if (wd && wd.mag > 0 && ammoFor(p) <= 0 && !p.reloading) startReload(p, game);
  p.aimTarget = null;
  for (const o of game.entities) {
    if (o === p || o.dead || o.team === p.team) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) < 600) {
      const a = Math.atan2(o.y - p.y, o.x - p.x);
      let verticalOk = true;
      const pitch = p.pitch || 0;
      if (Math.abs(pitch) > 0.02) {
        const tile = (getMap() && getMap().tile) || 40;
        const eyeH = (0.5 + (p.height || 0)) * tile;
        const targetBase = (o.height || 0) * tile;
        const dist = Math.hypot(o.x - p.x, o.y - p.y);
        const rayZ = eyeH + dist * Math.tan(pitch);
        verticalOk = Math.abs(rayZ - (targetBase + tile * 1.35)) <= tile;
      }
      if (Math.abs(angDiff(a, p.angle)) < 0.09 && verticalOk && hasLineOfSight(game, p, o, 560)) {
        p.aimTarget = o;
        break;
      }
    }
  }
  let holdActive = false;
  if (pressed(keys, 'interact') && (game.state === 'BUY' || game.state === 'LIVE')) {
    // ③ 逻辑双轨合并：玩家与 bot 共用 bomb.js 的同一套安弹/拆弹/捡弹实现
    if (p.team === 't' && p.hasBomb) {
      plantBomb(p, game);
      if (p.plantT > 0) {
        emit('holdbar', { show: true, pct: clamp(p.plantT / 3 * 100, 0, 100) });
        holdActive = true;
        game._plantTicT = (game._plantTicT || 0) - dt;
        if (game._plantTicT <= 0) {
          game._plantTicT = 0.15;
          emit('sfx', { name: 'plantTic', vol: 0.35, x: p.x, y: p.y, game });
        }
      }
    }
    if (game.bomb && game.bomb.dropped && p.team === 't') pickupBomb(p, game);
    if (p.team === 'ct' && game.bomb && game.bomb.planted) {
      defuseBomb(p, game);
      if (p.defuseT > 0) {
        const kitSpeed = p.weapons.kit ? 2.5 : 5;
        emit('holdbar', { show: true, pct: clamp(p.defuseT / kitSpeed * 100, 0, 100) });
        holdActive = true;
        game._defuseTicT = (game._defuseTicT || 0) - dt;
        if (game._defuseTicT <= 0) {
          game._defuseTicT = 0.15;
          emit('sfx', { name: 'plantTic', vol: 0.35, x: p.x, y: p.y, game });
        }
      }
    }
  }
  if (!holdActive) {
    emit('holdbar', { show: false, pct: 0 });
    if (p.plantT > 0) p.plantT = 0;
    if (p.defuseT > 0) {
      p.defuseT = 0;
      if (game.bomb) game.bomb.defusing = false;
    }
  }
}

function castLaserEnd(p, game) {
  const map = getMap();
  if (!map || !map.W || !map.H) return { x: p.x, y: p.y };
  const w = weaponDef(p);
  const range = w && w.range ? w.range : 1500;
  const cos = Math.cos(p.angle), sin = Math.sin(p.angle);
  const step = 6;
  let px = p.x, py = p.y;
  for (let d = 0; d <= range; d += step) {
    px = p.x + cos * d;
    py = p.y + sin * d;
    if (px < 0 || py < 0 || px > map.W || py > map.H) break;
    if (!passableTolerant(px, py)) break;
  }
  return { x: px, y: py };
}

function updatePlayerAim(game, dt) {
  if (game.viewMode === 'fps') {
    // 标准 FPS 增量瞄准：指针锁定后仅消费 movementX/Y，鼠标停→朝向停，
    // 鼠标动→转动 yaw/pitch；观战同样作用于 _specAngle
    const dx = game._mlookDx || 0;
    const dy = 0;
    game._mlookDx = 0;
    game._mlookDy = 0;
    if (game.state !== 'BUY' && game.state !== 'LIVE') return;
    const sens = game.fpsSens || 0.002;
    const sensY = game.fpsSensY || sens;
    const yDir = game.invertY ? -1 : 1;
    const p2 = game.player;
    if (p2 && !p2.dead) {
      const scopeMul = p2.scoped ? 0.35 : 1;
      p2.angle += dx * sens * scopeMul;
      p2.pitch = 0;
    } else {
      if (game._specAngle == null) game._specAngle = game.player ? game.player.angle : 0;
      if (game._specPitch == null) game._specPitch = game.player ? (game.player.pitch || 0) : 0;
      if (dx || dy) game._specManual = game.time;
      game._specAngle += dx * sens;
      game._specPitch = 0;
    }
    return;
  }
  const p = game.player;
  if (!p || p.dead) return;
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const z = game.zoom || 1;
  const sx = game.canvasW / 2, sy = game.canvasH / 2;
  const shx = game._shx || 0, shy = game._shy || 0;
  // 跟随视角：玩家恒居屏幕中心，相机朝向（=世界旋转）平滑跟随准星方向；
  // 鼠标贴近角色（死区内）保持原朝向，避免短向量角度抖动导致世界狂转；死区与平滑可调
  if (game.viewMode === 'follow') {
    const dead = game.opts.followDeadzone || 70;
    const smooth = game.opts.followAimSmooth || 12;
    const mx = game.input.mouse.x - sx, my = game.input.mouse.y - sy;
    if (mx * mx + my * my > dead * dead) {
      const target = Math.atan2(my, mx);
      p.angle += angDiff(target, p.angle) * Math.min(1, smooth * dt);
    }
    return;
  }
  // 屏幕几何：角色朝向 = 鼠标相对"玩家屏幕投影位置"的方向（与渲染同构）。
  // 枪口射线从玩家屏幕位置出发严格经过准星（鼠标）像素——任意相机/震动/缩放状态一致；
  // 鼠标靠近角色时短向量=大角度变化（灵敏），远离时亦然，方向始终=玩家→准星。
  const px = (p.x - (game.camX || 0) + shx) * z + sx;
  const py = (p.y - (game.camY || 0) + shy) * z + sy;
  p.angle = Math.atan2(game.input.mouse.y - py, game.input.mouse.x - px);
}

