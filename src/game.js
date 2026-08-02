import { ROUND, ECONOMY, MAX_PARTICLES } from './config.js';
import { getMap, loadMap, findMapById, collideCircle, los, pathTo, tileAt } from './map.js';
import { createEntity, spawnEntity, weaponDef, ammoFor } from './entities.js';
import { fireWeapon, startReload, finishReload, pickupWeapon, RECOIL_RECOVER } from './combat.js';
import { updateShotStreak } from './ballistic.js';
import { updateGrenades } from './grenades.js';
import { updateBots, assignRoles, botBuyAll } from './ai.js';
import { explodeBomb, plantBomb, defuseBomb, pickupBomb } from './bomb.js';
import { ctx, seedWorld } from './ctx.js';
import { getMode } from './registry.js';
import { clamp, lerp, rand, angDiff } from './utils.js';
import { pressed, getBindLabel } from './keymap.js';
import { initInfo, prune } from './info.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);


export function createGame(opts = {}) {
  const game = {
    state: 'MENU',
    entities: [], grenades: [], particles: [], tracers: [], smokes: [], decals: [], drops: [],
    lastSplash: null,
    player: null,
    camX: 1200, camY: 900,
    round: 0, roundTime: 0, roundDur: ROUND.DURATION, buyTime: 0,
    freezeT: 0, endedT: 0,
    score: { T: 0, CT: 0 },
    bomb: null, flashT: 0, dmgT: 0, shake: 0,
    over: false, spectateIdx: 0, lastPlantSite: null, dt: 0.016,
    lossStreakT: 0, lossStreakCT: 0,
    hitMarkT: 0, zoom: 1,
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

export function startMatch(game) {
  const ui = game.ui;
  if (ui) {
    emit('hideMenu');
    emit('hideEnd');
    emit('closeBuy');
    emit('scoreboard', { open: false });
    emit('unpause');
  }
  const fresh = createGame();
  fresh.opts = game.opts;
  fresh.ui = game.ui;
  fresh.layers = game.layers;
  fresh.canvasW = game.canvasW;
  fresh.input = game.input;
  fresh.onMapChanged = game.onMapChanged;
  Object.assign(game, fresh);
  // 世界种子：整局随机流可复现（回放/调试/训练一致性）；可传 game.seed 固定复现
  if (game.seed === null) game.seed = Math.floor(Math.random() * 0x7fffffff);
  seedWorld(game.seed);
  initInfo(game);
  game.over = false;
  loadMap(findMapById(game.opts.mapId || 'dust2'));
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.barrels = (getMap().barrels || []).map((b) => ({ ...b }));
  if (game.onMapChanged) game.onMapChanged(getMap());
  const human = createEntity(game.opts.team, false);
  game.player = human;
  game.entities.push(human);
  for (let i = 0; i < game.opts.bots; i++) {
    game.entities.push(createEntity('t', true));
    game.entities.push(createEntity('ct', true));
  }
  startRound(game);
  if (ui) {
    emit('objtextShow');
    emit('flash', { opacity: 0 });
  }
}

function spawnRound(game) {
  game.input.mouse.wasDown = game.input.mouse.down;
  for (const e of game.entities) {
    const list = e.team === 'ct' ? getMap().spawns.ct : getMap().spawns.t;
    spawnEntity(e, list);
  }
  assignRoles(game);
  botBuyAll(game);
  const tBots = game.entities.filter((e) => e.team === 't');
  for (const e of tBots) e.hasBomb = false;
  if (tBots.length) {
    const carrier = tBots[Math.floor(rand() * tBots.length)];
    carrier.hasBomb = true;
  }
  game.bomb = null;
  game.smokes.length = 0;
  game.grenades.length = 0;
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

export function startRound(game) {
  game.round++;
  // 换边：常规第 13 回合；加时每 3 回合（16/19/22/25）再换
  const swapRound = game.round === ROUND.SIDE_SWAP_AFTER + 1 ||
    (game.ot && (game.round - (ROUND.SIDE_SWAP_AFTER + 1)) % ROUND.OT_SWAP_EVERY === 0 && game.round > ROUND.SIDE_SWAP_AFTER + 1);
  if (swapRound) {
    for (const e of game.entities) {
      e.team = e.team === 'ct' ? 't' : 'ct';
      e.weapons.primary = null;
      e.weapons.nades = { he: 0, flash: 0, smoke: 0 };
      e.weapons.kit = false;
      e.armor = 0;
      e.helmet = false;
      e.hasBomb = false;
      e.ammoMap = {};
      e.reserveMap = {};
    }
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

export function endRound(game, winner, reason) {
  if (game.state === 'END') return;
  game.state = 'END';
  game.endedT = 6.5;
  if (winner) {
    game.score[winner === 't' ? 'T' : 'CT']++;
    for (const e of game.entities) {
      if (e.team === winner) {
        e.lossStreak = 0;
        e.money = clamp(e.money + ECONOMY.WIN_MONEY, 0, ECONOMY.MONEY_CAP);
      } else {
        e.money = clamp(e.money + ECONOMY.LOSS_BONUS[Math.min(e.lossStreak || 0, 3)], 0, ECONOMY.MONEY_CAP);
        e.lossStreak = (e.lossStreak || 0) + 1;
      }
    }
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
  const winAt = game.ot ? ROUND.OT_WIN : ROUND.MATCH_WIN;
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
  game.dt = dt;
  game.time += dt;
  if (game.over) return;
  // ④ 模式钩子（registerMode 注册的模式在此驱动，如 deathmatch/感染模式等）
  if (game.mode) {
    const mode = typeof game.mode === 'string' ? getMode(game.mode) : game.mode;
    if (mode && mode.update) mode.update(game, dt);
    if (game.over) return;
  }
  if (game.state === 'MENU') return;
  if (game.ui && game.ui.isPaused()) return;
  updateTimers(game, dt);
  if (game.state === 'END') {
    updateCam(game, dt);
    return;
  }
  updatePlayer(game, dt);
  updateBots(game, dt);
  updateGrenades(game, dt);
  for (const e of game.entities) {
    if (e.dead) continue;
    const curTile = tileAt(e.x, e.y);
    // 涉水减速：浅水/深水均为 40%（spec 4.3）
    if (curTile === '~' || curTile === '≈') { e.vx *= 0.6; e.vy *= 0.6; }
    if (e.stunT > 0) { e.vx *= 0.3; e.vy *= 0.3; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    collideCircle(e);
    const prevH = e.height;
    e.height = curTile === '^' ? 1 : 0;
    if (prevH === 1 && e.height === 0) e.stunT = 0.4;
    if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt);
    e.vx *= Math.max(0, 1 - 7 * dt);
    e.vy *= Math.max(0, 1 - 7 * dt);
    // 溅水：仅浅水发声/水花（深水静音，spec 4.3）
    if (e.splashCd > 0) e.splashCd = Math.max(0, e.splashCd - dt);
    if (e.splashCd <= 0 && curTile === '~' && Math.hypot(e.vx, e.vy) > 60) {
      e.splashCd = 0.5;
      game.lastSplash = { team: e.team, x: e.x, y: e.y, t: game.time };
      for (let i = 0; i < 4; i++) {
        game.particles.push({ kind: 'splash', x: e.x + rand(-8, 8), y: e.y + rand(-4, 6), vx: rand(-40, 40), vy: rand(-140, -40), life: 0.4, size: rand(2, 4) });
      }
      emit('sfx', { name: 'splash', vol: 0.5, x: e.x, y: e.y, game });
    }
    if (e.bot) {
      e.stuckT += dt;
      if (e.stuckT > 0.6) {
        const sd = Math.hypot(e.x - e.lastSample.x, e.y - e.lastSample.y);
        if (sd < 6 && e.path && e.pathI < e.path.length) {
          const obj = botObjectiveForStuck(e, game);
          pathTo(e, obj.x + rand(-80, 80), obj.y + rand(-80, 80));
        }
        e.stuckT = 0;
        e.lastSample = { x: e.x, y: e.y };
      }
    }
  }
  if (game.particles.length > MAX_PARTICLES) game.particles.splice(0, game.particles.length - MAX_PARTICLES);
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const pa = game.particles[i];
    pa.life -= dt;
    if (pa.life <= 0) { game.particles.splice(i, 1); continue; }
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
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 20);
  if (game.dmgT > 0) game.dmgT -= dt;
  if (game.hitMarkT > 0) game.hitMarkT -= dt;
  if (game.flashT > 0) {
    game.flashT -= dt;
    emit('flash', { opacity: Math.min(0.9, game.flashT * 0.22) });
  } else {
    emit('flash', { opacity: 0 });
  }
  emit('dmg', { opacity: clamp(game.dmgT * 2, 0, 1) });
  const pl = game.player;
  if (pl && !pl.dead && pl.hp <= 25) {
    emit('lowhp', { opacity: 0.35 + 0.2 * Math.sin(performance.now() / 150) });
  } else if (pl && !pl.dead) {
    emit('lowhp', { opacity: 0 });
  }
  let camTarget = game.player;
  if (game.player && game.player.dead) {
    const mates = game.entities.filter((e) => e.team === game.player.team && !e.dead);
    if (mates.length) camTarget = mates[game.spectateIdx % mates.length];
  }
  if (camTarget) {
    game.camX = lerp(game.camX, camTarget.x, Math.min(1, 8 * dt));
    game.camY = lerp(game.camY, camTarget.y, Math.min(1, 8 * dt));
  }
  const z = game.zoom || 1;
  const hw = game.canvasW / 2 / z;
  const hh = game.canvasH / 2 / z;
  game.camX = clamp(game.camX, hw, Math.max(hw, game.mapW - hw));
  game.camY = clamp(game.camY, hh, Math.max(hh, game.mapH - hh));
  updatePlayerAim(game);
  updateBombHud(game);
  if (game.ui && game.ui.isScoreboardOpen && game.ui.isScoreboardOpen()) {
    emit('refreshScoreboard');
  }
}

function updateCam(game, dt) {
  let camTarget = game.player;
  if (game.player && game.player.dead) {
    const mates = game.entities.filter((e) => e.team === game.player.team && !e.dead);
    if (mates.length) camTarget = mates[game.spectateIdx % mates.length];
  }
  if (camTarget) {
    game.camX = lerp(game.camX, camTarget.x, Math.min(1, 8 * dt));
    game.camY = lerp(game.camY, camTarget.y, Math.min(1, 8 * dt));
  }
  const z = game.zoom || 1;
  const hw = game.canvasW / 2 / z;
  const hh = game.canvasH / 2 / z;
  game.camX = clamp(game.camX, hw, game.mapW - hw);
  game.camY = clamp(game.camY, hh, game.mapH - hh);
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
    game.roundTime += dt;
    if (game.roundTime >= game.roundDur) {
      if (game.bomb && game.bomb.planted) {
        explodeBomb(game);
      } else {
        endRound(game, 'ct', '时间耗尽');
      }
    }
  } else if (game.state === 'END') {
    game.endedT -= dt;
    if (game.endedT <= 0 && !game.over) {
      if (game.score.T >= (game.ot ? ROUND.OT_WIN : ROUND.MATCH_WIN) || game.score.CT >= (game.ot ? ROUND.OT_WIN : ROUND.MATCH_WIN)) {
        finishMatch(game);
      } else if (!game.ot && game.score.T >= ROUND.MATCH_WIN - 1 && game.score.CT >= ROUND.MATCH_WIN - 1) {
        // 12:12 进入加时（MR3，先到 16 分）
        game.ot = true;
        emit('toast', { text: '进入加时赛！先赢 3 回合获胜（16 分）' });
        startRound(game);
      } else {
        startRound(game);
      }
    }
  }
  if ((game.state === 'BUY' || game.state === 'LIVE') && game.bomb && game.bomb.planted) {
    game.bomb.timer -= dt;
    if (game.bomb.timer <= 0) explodeBomb(game);
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
  const spd = 235 * (w ? w.speed : 1);
  let ax = 0, ay = 0;
  if (game.freezeT > 0) {
    ax = 0; ay = 0;
  } else {
    if (pressed(keys, 'moveUp')) ay -= 1;
    if (pressed(keys, 'moveDown')) ay += 1;
    if (pressed(keys, 'moveLeft')) ax -= 1;
    if (pressed(keys, 'moveRight')) ax += 1;
  }
  pickupWeapon(p, game);
  const len = Math.hypot(ax, ay);
  if (len > 0) { ax /= len; ay /= len; }
  const walk = pressed(keys, 'walk') && len > 0;
  p.walking = walk && len > 0;
  p.crouched = pressed(keys, 'crouch');
  p.scoped = mouse.rdown && p.slot === 'primary' && p.weapons.primary === 'awp';
  game.zoom = p.scoped ? 1.7 : 1;
  const curSpd = spd * (walk ? 0.55 : 1) * (p.scoped ? 0.5 : 1) * (p.crouched ? 0.5 : 1);
  const moving = len > 0 && game.freezeT <= 0;
  p.vx = ax * curSpd;
  p.vy = ay * curSpd;
  p.stepT -= dt;
  if (moving && p.stepT <= 0) {
    p.stepT = walk ? 0.45 : 0.3;
    emit('sfx', { name: 'step', vol: 0.4, x: p.x, y: p.y, game });
  }
  updatePlayerAim(game);
  input.lastMouse.x = mouse.x;
  input.lastMouse.y = mouse.y;
  const wantFire = mouse.down && game.freezeT <= 0 && (game.state === 'BUY' || game.state === 'LIVE');
  p.trigger = wantFire && (w.auto ? true : !mouse.wasDown);
  mouse.wasDown = mouse.down;
  p.recoil = Math.max(0, p.recoil - RECOIL_RECOVER * dt);
  updateShotStreak(p, dt);
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.muzzleT > 0) p.muzzleT -= dt;
  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) finishReload(p);
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
      if (Math.abs(angDiff(a, p.angle)) < 0.09 && los(game, p.x, p.y, o.x, o.y, p.height)) {
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
      }
    }
    if (game.bomb && game.bomb.dropped && p.team === 't') pickupBomb(p, game);
    if (p.team === 'ct' && game.bomb && game.bomb.planted) {
      defuseBomb(p, game);
      if (p.defuseT > 0) {
        const kitSpeed = p.weapons.kit ? 2.5 : 5;
        emit('holdbar', { show: true, pct: clamp(p.defuseT / kitSpeed * 100, 0, 100) });
        holdActive = true;
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

function updatePlayerAim(game) {
  const p = game.player;
  if (!p || p.dead) return;
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const mw = mouseToWorld(game);
  // 绝对瞄准：人物朝向死死跟随鼠标指向
  p.angle = Math.atan2(mw.y - p.y, mw.x - p.x);
}

function mouseToWorld(game) {
  const scale = game.zoom || 1;
  const sx = game.canvasW / 2, sy = game.canvasH / 2;
  return { x: game.camX + (game.input.mouse.x - sx) / scale, y: game.camY + (game.input.mouse.y - sy) / scale };
}

function botObjectiveForStuck(e, game) {
  if (e.team === 't') {
    const cs = game.tAttackSite === 'A' ? getMap().sites.A : getMap().sites.B;
    return { x: cs.cx, y: cs.cy };
  }
  if (game.bomb && game.bomb.planted) return { x: game.bomb.x, y: game.bomb.y };
  return { x: 1200, y: 900 };
}


