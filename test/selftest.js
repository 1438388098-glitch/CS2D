import fs from 'fs';
import { installStubs, registerUiIds } from './stubdom.js';
installStubs();
registerUiIds();

import { createGame, startMatch, startRound, update, skipSpectatedRound } from '../src/game.js';
import { initUi } from '../src/ui.js';
import { setKey, setMouse, setMouseDown, switchWeapon, switchNade } from '../src/input.js';
import { buyItem } from '../src/economy.js';
import { WEAPONS, MAPS, ROUND } from '../src/config.js';
import { killEntity, fireWeapon, applyDamage } from '../src/combat.js';
import { los, aStar, nearestWalkable, walkable, getMapDiagnostics, getGrid, getMap, findMapById, loadMap, pathable, tileAt } from '../src/map.js';
import { ctx } from '../src/ctx.js';
import { installMechTestMap, installLegacyDust2Map } from './map-fixture.js';
installMechTestMap();
installLegacyDust2Map();

const game = createGame();
game.opts.mapId = 'legacy-dust2';
const canvasStub = { getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: () => {}, getContext: () => null, style: {} };
initUi(document, canvasStub, game);

const errors = [];
function T(name, fn) {
  try {
    fn();
  } catch (e) {
    errors.push(name + ': ' + e.message);
  }
}
const tick = (n, dt) => { for (let i = 0; i < n; i++) update(game, dt); };
const player = () => game.player;
const state = () => game.state;

T('boot-match', () => {
  startMatch(game);
  if (state() !== 'BUY') throw new Error('state=' + state());
  if (game.entities.length !== 1 + game.opts.bots * 2) throw new Error('entity count=' + game.entities.length);
  if (game.mapW !== getMap().W || game.mapH !== getMap().H) throw new Error('map size wrong');
});

T('hud-spectate-clickable', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  const m = css.match(/#hud-spectate\{[^}]*\}/);
  if (!m || !m[0].includes('pointer-events:auto')) throw new Error('hud-spectate 观战按钮不可点击');
});

T('spectate-skip-round', () => {
  const g = createGame();
  g.opts.mapId = 'legacy-dust2';
  startMatch(g);
  g.player.dead = true;
  g.state = 'LIVE';
  g.buyTime = 0;
  g.freezeT = 0;
  g.roundTime = 110;
  const r = skipSpectatedRound(g);
  if (!r.ok || g.state !== 'END') throw new Error('spectate skip did not finish round: ' + r.ok + ' ' + g.state);
});

T('maps-three', () => {
  for (const id of ['dust2', 'metro', 'forge']) {
    const def = findMapById(id);
    if (!def) throw new Error('缺少地图 ' + id);
    const diag = loadMap(def);
    if (diag.unreachable.length > 0) throw new Error(id + ' 存在不可达格: ' + diag.unreachable.length);
    if (!getMap().sites.A || !getMap().sites.B) throw new Error(id + ' 缺站点');
    if (!getMap().spawns.t.length || !getMap().spawns.ct.length) throw new Error(id + ' 缺出生点');
  }
  if (MAPS.find((m) => m.id === 'snow')) throw new Error('snow 应已删除');
  if (MAPS.find((m) => m.id === 'depot')) throw new Error('depot 应已删除');
  loadMap(findMapById('legacy-dust2'));
});

T('player-tank', () => {
  const p = player();
  p.hp = 1000000;
  if (!p || p.dead || p.hp !== 1000000) throw new Error('player-tank 初始状态异常');
});

T('buy-items', () => {
  player().money = 20000;
  player().armor = 0;
  if (!buyItem(game, 'ak')) throw new Error('buy ak failed');
  if (!buyItem(game, 'armor')) throw new Error('buy armor failed');
  if (!buyItem(game, 'he')) throw new Error('buy he failed');
  if (!buyItem(game, 'flash')) throw new Error('buy flash failed');
  if (!buyItem(game, 'smoke')) throw new Error('buy smoke failed');
  if (buyItem(game, 'ak')) throw new Error('duplicate buy allowed');
});

T('tick-round', () => {
  game.buyTime = 0.05;
  game.freezeT = 0;
  for (const e of game.entities) {
    if (e.bot) {
      e.x = 200; e.y = 1700;
      e.blind = 9999;
      e.weapons.primary = null;
      e.weapons.secondary = null;
    }
  }
  tick(600, 1 / 30);
  if (state() !== 'LIVE') throw new Error('did not go live: ' + state());
});

T('switch-weapons', () => {
  const p = player();
  switchWeapon(p, 'primary');
  if (p.slot !== 'primary') throw new Error('slot wrong');
  switchWeapon(p, 'knife');
  switchWeapon(p, 'secondary');
  switchNade(p, 'he');
  if (p.slot.indexOf('nade') < 0) throw new Error('nade slot wrong');
  p.slot = 'primary';
});

T('mouse-aim', () => {
  const p = player();
  p.dead = false;
  p.x = 1200; p.y = 900;
  game.camX = 1200; game.camY = 900;
  game.input.mouse.x = 800; game.input.mouse.y = 450;
  tick(1, 1 / 30);
  const expect = Math.atan2(90, 160);
  if (Math.abs(p.angle - expect) > 0.002) throw new Error('aim not following mouse: ' + p.angle + ' expect ' + expect);
});

T('fire-and-kill', () => {
  loadMap(findMapById('legacy-dust2'));
  player().slot = 'primary';
  player().weapons.primary = 'ak';
  player().ammoMap.ak = 30;
  const target = game.entities.filter((e) => e.bot && e.team !== player().team && !e.dead)[0];
  if (!target) throw new Error('no target');
  target.x = 1200; target.y = 880;
  target.vx = 0; target.vy = 0;
  target.blind = 999;
  for (const e of game.entities) {
    if (e !== target && e.bot && !e.dead) e.blind = 999;
  }
  player().x = 1130; player().y = 880;
  setMouseDown(game, true);
  let guard = 0;
  while (!target.dead && guard++ < 400) {
    update(game, 1 / 60);
    target.x = 1200; target.y = 880;
    player().x = 1130; player().y = 880;
    setMouse(game, game.canvasW / 2 + (target.x - game.camX), game.canvasH / 2 + (target.y - game.camY));
  }
  setMouseDown(game, false);
  if (!target.dead) throw new Error('target survived');
  if (player().kills < 1) throw new Error('kill not credited');
});

T('bullet-hits-mouse-line', () => {
  loadMap(findMapById('legacy-dust2'));
  const p = player();
  p.dead = false;
  p.fireCd = 0;
  p.reloading = false;
  p.ammoMap = { ak: 30 };
  p.reserveMap = { ak: 90 };
  p.slot = 'primary';
  p.weapons.primary = 'ak';
  p.recoil = 0;
  p.shotStreak = 0;
  game.state = 'LIVE';
  game.freezeT = 0;
  game.hitPauseT = 0;
  p.x = 1200; p.y = 900;
  game.camX = 1200; game.camY = 900;
  game.input.mouse.x = 960; game.input.mouse.y = 540;
  tick(1, 1 / 30);
  const expect = Math.atan2(180, 320);
  if (Math.abs(p.angle - expect) > 0.002) throw new Error('angle off: ' + p.angle);
  const before = game.tracers.length;
  fireWeapon(p, game);
  const t = game.tracers.find((tr) => Math.abs(tr.x1 - 1200) < 1 && Math.abs(tr.y1 - 900) < 1);
  if (!t) throw new Error('no tracer');
  const targ = game.entities.find((e2) => {
    if (e2 === p || e2.dead || e2.team === p.team) return false;
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    const dx = e2.x - 1200, dy = e2.y - 900;
    const along = dx * ca + dy * sa;
    return along > 0 && along < 1400 && Math.abs(dx * sa - dy * ca) < e2.rad + 4;
  });
  if (targ) {
    const dc = Math.hypot(t.x2 - targ.x, t.y2 - targ.y);
    if (Math.abs(dc - targ.rad) > 4) throw new Error('hit marker not on target surface: ' + dc);
    const td = Math.atan2(t.y2 - t.y1, t.x2 - t.x1);
    const dA = ((td - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(dA) > 0.12) throw new Error('tracer dir off: ' + td + ' vs ' + p.angle);
  } else {
    const td = Math.atan2(t.y2 - t.y1, t.x2 - t.x1);
    const dA = ((td - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(dA) > 0.03) throw new Error('tracer dir off: ' + td + ' vs ' + p.angle);
  }
});

T('awp-scope-zoom-consistency', () => {
  const p = player();
  p.dead = false;
  game.endedT = 0;
  game.roundTime = 0;
  game.state = 'LIVE';
  p.weapons.primary = 'awp';
  p.ammoMap = { awp: 5 };
  p.reserveMap = { awp: 30 };
  p.slot = 'primary';
  p.fireCd = 0;
  p.reloading = false;
  p.recoil = 0;
  game.freezeT = 0;
  game.input.mouse.rdown = true;
  tick(1, 1 / 30);
  if (!p.scoped) throw new Error('awp not scoped on rdown');
  if (game.zoom !== 0.75) throw new Error('zoom not 0.75 when scoped: ' + game.zoom);
  const before = game.tracers.length;
  game.input.mouse.down = true;
  game.input.mouse.wasDown = false;
  tick(1, 1 / 30);
  game.input.mouse.down = false;
  game.input.mouse.rdown = false;
  if (game.zoom !== 0.75) throw new Error('zoom collapsed after firing frame: ' + game.zoom);
  const t = game.tracers.find((tr) => Math.abs(tr.x1 - p.x) < 1 && Math.abs(tr.y1 - p.y) < 1);
  if (!t) throw new Error('awp no tracer');
});

T('awp-magnifier-laser-state', () => {
  const p = player();
  p.dead = false;
  game.endedT = 0;
  game.roundTime = 0;
  game.state = 'LIVE';
  p.weapons.primary = 'awp';
  p.ammoMap = { awp: 5 };
  p.reserveMap = { awp: 30 };
  p.slot = 'primary';
  p.fireCd = 0;
  p.reloading = false;
  p.recoil = 0;
  game.freezeT = 0;
  p.x = 1200; p.y = 900;
  game.camX = 1200; game.camY = 900;
  game.input.mouse.x = 800; game.input.mouse.y = 450;
  game.input.mouse.rdown = true;
  tick(1, 1 / 30);
  if (!p.scoped) throw new Error('awp not scoped on rdown');
  if (game.zoom !== 0.75) throw new Error('zoom not 0.75 when scoped: ' + game.zoom);
  if (!p.laserEnd || !Number.isFinite(p.laserEnd.x) || !Number.isFinite(p.laserEnd.y)) {
    throw new Error('awp laser end missing when scoped');
  }
  if (Math.hypot(p.laserEnd.x - p.x, p.laserEnd.y - p.y) < 20) {
    throw new Error('awp laser too short: ' + JSON.stringify(p.laserEnd));
  }
});

T('all-player-guns-laser', () => {
  const p = player();
  p.dead = false;
  game.endedT = 0;
  game.roundTime = 0;
  game.state = 'LIVE';
  p.weapons.primary = 'ak';
  p.ammoMap = { ak: 30 };
  p.reserveMap = { ak: 90 };
  p.slot = 'primary';
  p.fireCd = 0;
  p.reloading = false;
  p.recoil = 0;
  game.freezeT = 0;
  p.x = 1200; p.y = 900;
  game.camX = 1200; game.camY = 900;
  game.input.mouse.x = 800; game.input.mouse.y = 450;
  game.input.mouse.rdown = false;
  tick(1, 1 / 30);
  if (!p.laserEnd || !Number.isFinite(p.laserEnd.x) || !Number.isFinite(p.laserEnd.y)) {
    throw new Error('player ak laser missing');
  }
  for (const e of game.entities) {
    if (e.bot && e.laserEnd) throw new Error('bot should not have laser');
  }
});

T('plant-bomb', () => {
  loadMap(findMapById('legacy-dust2'));
  startRound(game);
  game.freezeT = 0;
  game.buyTime = 30;
  game.noRoundEnd = true;
  player().team = 't';
  player().hp = 1000000;
  for (const e of game.entities) {
    if (e.bot) {
      e.x = 200; e.y = 1700;
      e.blind = 9999;
      e.weapons.primary = null;
      e.weapons.secondary = null;
      e.weapons.kit = false;
      e.hasBomb = false;
    }
  }
  player().hasBomb = true;
  player().x = getMap().sites.A.cx + 40;
  player().y = getMap().sites.A.cy;
  setKey(game, 'KeyE', true);
  let guard = 0;
  while (!game.bomb && guard++ < 400) {
    update(game, 1 / 30);
    for (const e of game.entities) {
      if (e.bot) { e.x = 200; e.y = 1700; }
    }
  }
  setKey(game, 'KeyE', false);
  if (!game.bomb || !game.bomb.planted) throw new Error('bomb not planted');
  game.noRoundEnd = false;
});

T('bomb-explodes', () => {
  let guard = 0;
  while (game.bomb && game.bomb.planted && guard++ < 2000 && state() !== 'END') {
    update(game, 1 / 30);
    for (const e of game.entities) {
      if (e.bot) { e.x = 200; e.y = 1700; }
    }
  }
  if (game.score.T < 1 && state() !== 'END') throw new Error('bomb round not resolved');
});

T('next-round-auto', () => {
  let guard = 0;
  while (state() === 'END' && guard++ < 900) update(game, 1 / 30);
  if (state() !== 'BUY') throw new Error('next round not started, state=' + state());
});

T('defuse-round', () => {
  startRound(game);
  game.freezeT = 0;
  game.buyTime = 30;
  player().team = 'ct';
  player().hp = 1000000;
  player().weapons.kit = true;
  const tbot = game.entities.filter((e) => e.bot && e.team === 't')[0];
  for (const e of game.entities) {
    if (e.bot && e !== tbot) {
      e.x = 200; e.y = 1700;
      e.blind = 9999;
      e.weapons.primary = null;
      e.weapons.secondary = null;
      e.weapons.kit = false;
      e.hasBomb = false;
    }
    if (e.bot && e.team === 'ct' && e !== player()) {
      e.dead = true;
    }
  }
  tbot.hasBomb = true;
  tbot.x = getMap().sites.B.cx;
  tbot.y = getMap().sites.B.cy;
  tbot.role = 'B';
  // 固定攻击点为 B，避免随机 tAttackSite 使 bot 目标与测试位置错位
  game.tAttackSite = 'B';
  for (const e of game.entities) {
    if (e.bot && e.team === 't') { e.role = 'B'; e.objCache = null; e.objAt = 0; }
  }
  tbot.objCache = null;
  let guard2 = 0;
  while ((!game.bomb || !game.bomb.planted) && guard2++ < 900) {
    update(game, 1 / 30);
    for (const e of game.entities) {
      if (e.bot && e !== tbot) { e.x = 200; e.y = 1700; }
    }
  }
  if (!game.bomb || !game.bomb.planted) throw new Error('bot failed to plant');
  player().x = game.bomb.x;
  player().y = game.bomb.y;
  setKey(game, 'KeyE', true);
  let guard3 = 0;
  while (game.bomb && game.bomb.planted && guard3++ < 900 && state() !== 'END') update(game, 1 / 30);
  setKey(game, 'KeyE', false);
  if (state() !== 'END' || game.score.CT < 1) throw new Error('defuse failed: state=' + state() + ' score=' + game.score.T + ':' + game.score.CT);
});

T('full-match', () => {
  game.noRoundEnd = false;
  let guard = 0;
  while (!game.over && guard++ < 9000) {
    update(game, 1 / 30);
    if (state() === 'END') {
      if (game.endedT > 3) game.endedT = 0.2;
    } else if (state() === 'BUY') {
      if (game.buyTime > 3) game.buyTime = 0.05;
      if (game.freezeT > 0) game.freezeT = 0;
    } else if (state() === 'LIVE' && game.roundTime > 6) {
      for (const e of game.entities) {
        if (e.team === (game.round % 2 === 0 ? 't' : 'ct') && !e.dead) {
          killEntity(e, null, 'test', false, game);
        }
      }
    }
  }
  if (!game.over) throw new Error('match did not finish');
  if (game.score.T < ROUND.MATCH_WIN && game.score.CT < ROUND.MATCH_WIN) throw new Error('no team reached ' + ROUND.MATCH_WIN + ': ' + game.score.T + ':' + game.score.CT);
});

T('restart', () => {
  startMatch(game);
  if (state() !== 'BUY') throw new Error('restart failed');
});

T('mech-tile-semantics', () => {
  loadMap(findMapById('mech-test'));
  if (!tileAt(40, 40)) throw new Error('tileAt 未导出');
  if (!walkable(6, 1)) throw new Error('T 区应可走');
  if (walkable(12, 5)) throw new Error('薄墙不可走');
  if (!walkable(3, 13)) throw new Error('浅水可走');
  if (!walkable(9, 19)) throw new Error('高台可站');
  if (!pathable(9, 19)) throw new Error('high ground should be pathable');
  if (!pathable(3, 13)) throw new Error('浅水可寻路');
  const pathUp = aStar(8, 19, 9, 19);
  if (!pathUp || pathUp[pathUp.length - 1].x !== 9 || pathUp[pathUp.length - 1].y !== 19) throw new Error('^ 高台应可作为寻路目标');
  // high ground is pathable; mech fixture intentionally keeps right side disconnected
  if (getMap().barrels.length !== 1 || getMap().barrels[0].hp !== 2) throw new Error('油桶扫描应为 1 个 hp=2');
  if (getMap().crates.length !== 1 || getMap().crates[0].hp !== 2) throw new Error('木箱扫描应为 1 个 hp=2');
  loadMap(findMapById('legacy-dust2'));
});

T('thin-wall', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  const shooter = g.player;
  shooter.team = 't'; shooter.x = 140; shooter.y = 200; shooter.dead = false;
  shooter.weapons.primary = 'ak';
  shooter.slot = 'primary';
  shooter.ammoMap.ak = 30;
  const target = g.entities.find((e) => e.bot && e.team === 'ct');
  target.x = 580; target.y = 200; target.dead = false; target.hp = 1000;
  target.armor = 100; target.helmet = true;
  target.vx = 0; target.vy = 0;
  shooter.angle = 0;
  const savedRand = ctx.rand;
  ctx.rand = () => 0.99;
  fireWeapon(shooter, g);
  const dmgWall = 1000 - target.hp;
  target.hp = 100;
  const g2 = createGame();
  g2.opts.mapId = 'mech-test';
  startMatch(g2);
  const t2 = g2.player;
  t2.team = 't'; t2.x = 540; t2.y = 200; t2.dead = false;
  t2.weapons.primary = 'ak'; t2.slot = 'primary'; t2.ammoMap.ak = 30;
  const tgt2 = g2.entities.find((e) => e.bot && e.team === 'ct');
  tgt2.x = 700; tgt2.y = 200; tgt2.dead = false; tgt2.hp = 1000;
  tgt2.armor = 100; tgt2.helmet = true;
  t2.angle = 0;
  ctx.rand = () => 0.99;
  fireWeapon(t2, g2);
  const dmgPlain = 1000 - tgt2.hp;
  ctx.rand = savedRand;
  if (!(dmgWall > 0 && Math.abs(dmgWall - dmgPlain * 0.7) < 1.5)) {
    throw new Error('薄墙穿射伤害应为 0.7x: wall=' + dmgWall + ' plain=' + dmgPlain);
  }
  if (!g.decals.some((d) => d.type === 'bullet')) throw new Error('未生成穿射弹孔');
  loadMap(findMapById('legacy-dust2'));
});

T('armor-head', () => {
  const mk = (hp, armor, helmet) => {
    const g = createGame({ team: 'ct' });
    startMatch(g);
    const e = g.player;
    e.hp = hp; e.armor = armor; e.helmet = helmet;
    return { g, e };
  };
  const ak = mk(100, 100, true);
  applyDamage(ak.e, 40, { head: true }, ak.g);
  if (ak.e.hp !== 0 || !ak.e.dead) throw new Error('AK helmet headshot should kill: hp=' + ak.e.hp);
  const m4 = mk(100, 100, true);
  applyDamage(m4.e, 33, { head: true }, m4.g);
  if (m4.e.hp !== 1) throw new Error('M4 helmet headshot should not kill: hp=' + m4.e.hp);
  const body = mk(100, 100, true);
  applyDamage(body.e, 40, { head: false }, body.g);
  if (body.e.hp !== 76) throw new Error('armored body hit should be 0.6x: hp=' + body.e.hp);
});

T('map-unit', () => {
  loadMap(findMapById('legacy-dust2'));
  const g = getGrid();
  let wallX = -1, wallY = -1;
  outer: for (let ty = 0; ty < g.length; ty++) {
    for (let tx = 1; tx < g[ty].length; tx++) {
      const l = g[ty][tx - 1], r = g[ty][tx];
      if (r === '#' && (l === '.' || l === 'a' || l === 'b' || l === 't' || l === 'c')) {
        wallX = tx; wallY = ty;
        break outer;
      }
    }
  }
  if (wallX < 0) throw new Error('no walkable/wall boundary found in grid');
  const cx = (x) => x * 40 + 20, cy = (y) => y * 40 + 20;
  if (los({ smokes: [] }, cx(wallX - 1), cy(wallY), cx(wallX), cy(wallY))) throw new Error('los through wall returned true');
  if (!los({ smokes: [] }, cx(wallX - 2), cy(wallY), cx(wallX - 1), cy(wallY))) throw new Error('los in same room returned false');
  const st = getMap().spawns.t[0];
  const p = aStar(Math.floor(st.x / 40), Math.floor(st.y / 40), Math.floor(getMap().sites.A.cx / 40), Math.floor(getMap().sites.A.cy / 40));
  if (!p || !p.length) throw new Error('aStar T spawn -> A site returned no path');
  if (aStar(2, 17, 999, 999) !== null) throw new Error('aStar to out-of-map target did not return null');
  if (aStar(2, 17, 0, 0) !== null) throw new Error('aStar to wall tile did not return null');
  const n1 = nearestWalkable(-50, -50);
  if (!n1 || !walkable(n1.x, n1.y)) throw new Error('nearestWalkable negative coords failed: ' + JSON.stringify(n1));
  const n2 = nearestWalkable(99999, 99999);
  if (n2 !== null && !walkable(n2.x, n2.y)) throw new Error('nearestWalkable over-bound returned non-walkable tile: ' + JSON.stringify(n2));
  const diag = getMapDiagnostics();
  if (typeof diag.walkableCount !== 'number' || diag.walkableCount <= 0) throw new Error('getMapDiagnostics walkableCount wrong: ' + diag.walkableCount);
  if (!Array.isArray(diag.unreachable)) throw new Error('getMapDiagnostics unreachable not an array');
});

T('aStar-same-point', () => {
  const st = getMap().spawns.t[0];
  const tx = Math.floor(st.x / 40), ty = Math.floor(st.y / 40);
  const p = aStar(tx, ty, tx, ty);
  if (!p || p.length !== 1 || p[0].x !== tx || p[0].y !== ty) throw new Error('aStar same point did not return single-point path');
  if (aStar(0, 0, 0, 0) !== null) throw new Error('aStar same wall point did not return null');
});

T('auto-reload', () => {
  startRound(game);
  game.freezeT = 0;
  game.buyTime = 30;
  const p = player();
  p.team = 'ct';
  p.hp = 1000000;
  p.weapons.primary = 'ak';
  p.weapons.secondary = 'usp';
  p.slot = 'primary';
  p.ammoMap = { ak: 0, usp: 12 };
  p.reserveMap = { ak: 90, usp: 36 };
  p.reloading = false;
  p.reloadT = 0;
  update(game, 1 / 60);
  if (!p.reloading) throw new Error('auto reload did not start');
  for (let i = 0; i < 400; i++) update(game, 1 / 60);
  if (p.reloading) throw new Error('reload did not finish');
  if (p.ammoMap.ak !== 30) throw new Error('ammo not refilled: ' + p.ammoMap.ak);
  if (p.reserveMap.ak !== 60) throw new Error('reserve not reduced: ' + p.reserveMap.ak);
});

T('tie-round', () => {
  startRound(game);
  game.freezeT = 0;
  game.buyTime = 30;
  const scoreT = game.score.T, scoreC = game.score.CT;
  const lastC = game.entities.filter((e) => e.team === 'ct' && !e.dead)[0];
  if (!lastC) throw new Error('no ct entities left');
  for (const e of game.entities) {
    if (e.team === 't' && !e.dead) killEntity(e, null, 'test', false, game);
  }
  if (state() !== 'END') throw new Error('elimination did not end round: ' + state());
  if (game.score.T !== scoreT || game.score.CT !== scoreC + 1) throw new Error('elimination score wrong: ' + game.score.T + ':' + game.score.CT);
});

T('high-ground', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  const b = g.entities.find((e) => e.bot && e.team === 't');
  for (const e of g.entities) {
    if (e !== b) e.dead = true;
  }
  // mech-test 无站点：屏蔽 bot 的安弹/道具分支，避免 botActions 访问 sites.A 崩溃
  b.dead = false;
  b.hasBomb = false;
  b.usedNadeRound = g.round;
  b.x = 380; b.y = 800;                    // x9 高台列, y19 行（高台格 x=9*40+20=380）
  update(g, 1 / 30);
  if (b.height !== 1) throw new Error('站高台应 height=1, got ' + b.height);
  b.x = 340; b.y = 800;                    // 跳下到 x8 地面格
  update(g, 1 / 30);
  if (b.stunT <= 0) throw new Error('落台应有硬直');
  const ammoBefore = b.ammoMap.ak || 0;
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 5;
  b.angle = 0;
  fireWeapon(b, g);
  if (b.ammoMap.ak !== 5) throw new Error('硬直期间不能开火');
  loadMap(findMapById('legacy-dust2'));
});

T('water', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  g.freezeT = 0;
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.bot = false;
  b.weapons.primary = null; b.weapons.secondary = null;
  b.dead = false; b.usedNadeRound = g.round; b.hasBomb = false;
  b.role = 'mid'; b.blind = 0; b.aimTarget = null;
  for (const o of g.entities) if (o !== b && o.bot) o.dead = true;
  // AI 挂起：objCache 命中 + repathT 冷却 → botThink 不覆写 vx，速度逐帧持续
  const aiHold = (x, y) => { b.objCache = { x, y }; b.objAt = 0; b.objBombState = 'n'; b.path = null; b.repathT = 5; b.peekCount = 3; b.peekT = 10; };
  aiHold(300, 540);
  // 浅水减速：涉水 0.5s 位移 vs 干燥地
  b.x = 100; b.y = 540; b.vx = 235; b.vy = 0;
  for (let i = 0; i < 15; i++) update(g, 1 / 30);
  const waterDist = b.x - 100;
  aiHold(300, 60);
  b.x = 100; b.y = 60; b.vx = 235; b.vy = 0;
  for (let i = 0; i < 15; i++) update(g, 1 / 30);
  const dryDist = b.x - 100;
  if (!(waterDist < dryDist * 0.8)) throw new Error('涉水应减速: water=' + waterDist + ' dry=' + dryDist);
  // 溅水声广播（仅浅水）
  aiHold(300, 540);
  b.x = 100; b.y = 540; b.vx = 235; b.vy = 0;
  update(g, 1 / 30);
  if (!g.lastSplash || g.lastSplash.team !== 't') throw new Error('涉水应产生溅水声广播');
  // 深水静音：不产生溅水广播
  b.x = 640; b.y = 570; b.vx = 235; b.vy = 0;
  g.lastSplash = null;
  update(g, 1 / 30);
  if (g.lastSplash) throw new Error('深水应静音（无溅水声）');
  // 深水隐蔽：岸上 CT 看不见深水里的 T
  const ct = g.entities.find((e) => e.bot && e.team === 'ct');
  ct.x = 60; ct.y = 60; ct.dead = false; ct.role = 'mid';
  const tb = b;
  tb.x = 640; tb.y = 560; tb.vx = 0; tb.vy = 0;
  if (los(g, ct.x, ct.y, tb.x, tb.y)) throw new Error('岸上看深水目标应不可见');
  // 深水中开火：弹丸被水阻挡（靶无伤）
  const tgt = g.entities.find((e) => e.bot && e.team === 'ct' && e !== ct);
  tgt.x = 1160; tgt.y = 570; tgt.dead = false; tgt.hp = 100; tgt.role = 'mid';
  tb.x = 640; tb.y = 570;
  tb.weapons.primary = 'ak'; tb.slot = 'primary'; tb.ammoMap.ak = 5; tb.angle = 0;
  fireWeapon(tb, g);
  if (tgt.hp < 100) throw new Error('深水中开火弹丸应被水阻挡');
  loadMap(findMapById('legacy-dust2'));
});

T('barrel', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  if (!g.barrels || g.barrels.length !== 1) throw new Error('油桶应初始化为 1 个');
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 5;
  b.x = 500; b.y = 780; b.dead = false; b.usedNadeRound = g.round; b.hasBomb = false;
  b.fireCd = 0;
  for (const o of g.entities) if (o !== b && o.bot) o.dead = true;
  const tgt = g.entities.find((e) => e.bot && e.team === 'ct');
  tgt.x = 580; tgt.y = 935; tgt.dead = false; tgt.hp = 100;
  b.angle = 0;
  fireWeapon(b, g);      // 第一发：桶 hp 2 -> 1
  if (g.barrels[0].hp !== 1) throw new Error('第一发应使桶 hp=1, got ' + g.barrels[0].hp);
  if (tgt.hp !== 100) throw new Error('第一发不应命中弹道线外靶, hp=' + tgt.hp);
  b.fireCd = 0;
  fireWeapon(b, g);      // 第二发：引爆
  if (g.barrels.length !== 0) throw new Error('油桶应被引爆移除');
  if (tgt.hp === 100) throw new Error('油桶爆炸应造成 AOE 伤害');
  if (tgt.hp !== 40) throw new Error('AOE 应为 60 纯伤害(无护甲), hp=' + tgt.hp);
  loadMap(findMapById('legacy-dust2'));
});

T('crate', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  if (!g.crates || g.crates.length !== 1) throw new Error('木箱应初始化为 1 个');
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 10;
  b.x = 300; b.y = 820; b.dead = false; b.usedNadeRound = g.round; b.hasBomb = false;
  b.fireCd = 0;
  for (const o of g.entities) if (o !== b && o.bot) o.dead = true;
  b.angle = 0;
  fireWeapon(b, g);
  if (g.crates[0].hp !== 1) throw new Error('第一发应使木箱 hp=1, got ' + g.crates[0].hp);
  b.fireCd = 0;
  fireWeapon(b, g);
  if (g.crates.length !== 0) throw new Error('第二发应摧毁木箱');
  if (tileAt(540, 820) !== '.') throw new Error('摧毁后应为可走地面: ' + tileAt(540, 820));
  loadMap(findMapById('legacy-dust2'));
});

T('ai-crate', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  g.buyTime = 0;
  g.freezeT = 0;
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 30;
  b.x = 300; b.y = 820; b.dead = false; b.usedNadeRound = g.round; b.hasBomb = false;
  b.role = 'mid'; b.shotStreak = 1; b.fireCd = 0;
  for (const o of g.entities) if (o !== b && o.bot) o.dead = true;
  const ct = g.entities.find((e) => e.bot && e.team === 'ct');
  ct.x = 700; ct.y = 820; ct.dead = false; ct.hp = 100; ct.role = 'mid';
  b.aimTarget = ct;
  let guard = 0;
  while (g.crates.length > 0 && guard++ < 900) {
    update(g, 1 / 30);
    if (b.aimTarget === null && g.crates.length > 0 && b.crateT <= 0) b.aimTarget = ct;
    b.x = 300; b.y = 820; b.vx = 0; b.vy = 0;
    ct.x = 700; ct.y = 820; ct.vx = 0; ct.vy = 0;
  }
  if (g.crates.length !== 0) throw new Error('AI 应能打掉木箱');
  loadMap(findMapById('legacy-dust2'));
});
T('ai-mechanics', () => {
  const g = createGame();
  startMatch(g);
  const b = g.entities.find((e) => e.bot && e.team === 'ct');
  if (!('prefireCount' in b && 'highPointT' in b && 'splashCd' in b && 'crateT' in b)) {
    throw new Error('AI 机制字段缺失');
  }
  loadMap(findMapById('mech-test'));
  const g2 = createGame();
  g2.opts.mapId = 'mech-test';
  startMatch(g2);
  g2.freezeT = 0;
  const tBot = g2.entities.find((e) => e.bot && e.team === 't');
  tBot.x = 100; tBot.y = 540; tBot.vx = 235; tBot.vy = 0; tBot.dead = false;
  tBot.usedNadeRound = g2.round; tBot.hasBomb = false;
  tBot.role = 'mid';
  for (const o of g2.entities) if (o !== tBot && o.bot) o.dead = true;
  update(g2, 1 / 30);
  const ctBot = g2.entities.find((e) => e.bot && e.team === 'ct');
  ctBot.x = 100; ctBot.y = 100; ctBot.dead = false;
  ctBot.role = 'mid';
  ctBot.lastKnown = null; ctBot.lastKnownT = 99;
  update(g2, 1 / 30);
  if (ctBot.lastKnown === null) throw new Error('AI 应听到溅水声并更新 lastKnown');
  loadMap(findMapById('legacy-dust2'));
});

T('ai-barrel', () => {
  loadMap(findMapById('mech-test'));
  const g = createGame();
  g.opts.mapId = 'mech-test';
  startMatch(g);
  g.buyTime = 0;
  g.freezeT = 0;
  const b = g.entities.find((e) => e.bot && e.team === 't');
  b.weapons.primary = 'ak'; b.slot = 'primary'; b.ammoMap.ak = 30;
  b.x = 300; b.y = 780; b.dead = false; b.usedNadeRound = g.round; b.hasBomb = false;
  b.role = 'mid'; b.shotStreak = 1; b.fireCd = 0;
  for (const o of g.entities) if (o !== b && o.bot) o.dead = true;
  const ct = g.entities.find((e) => e.bot && e.team === 'ct');
  ct.x = 620; ct.y = 780; ct.dead = false;
  ct.hp = 100;
  b.aimTarget = ct;
  let guard = 0;
  while (g.barrels.length > 0 && guard++ < 600) {
    update(g, 1 / 30);
    if (b.aimTarget === null && g.barrels.length > 0 && b.barrelT <= 0) b.aimTarget = ct;
    b.x = 300; b.y = 780; b.vx = 0; b.vy = 0;
    ct.x = 620; ct.y = 780; ct.vx = 0; ct.vy = 0;
  }
  if (g.barrels.length !== 0) throw new Error('AI 应能引爆油桶');
  if (ct.hp !== 40) throw new Error('油桶爆炸应造成 60 点 AOE 伤害, hp=' + ct.hp);
  loadMap(findMapById('legacy-dust2'));
});

T('bo9-format', () => {
  const g = createGame();
  g.opts.mapId = 'legacy-dust2';
  initUi(document, canvasStub, g);
  startMatch(g);
  if (ROUND.MATCH_WIN !== 5) throw new Error('BO9 应先赢 5 局, MATCH_WIN=' + ROUND.MATCH_WIN);
  // 4:4 平局 → 不加时，直接打第 9 局决胜
  g.state = 'END'; g.endedT = 0; g.over = false; g.ot = false;
  g.score.T = 4; g.score.CT = 4;
  update(g, 1 / 60);
  if (g.ot !== false) throw new Error('BO9 4:4 不应进入加时');
  if (g.state === 'END' || g.over) throw new Error('BO9 4:4 应继续决胜局');
  // 5:4 → 立即结束
  g.state = 'END'; g.endedT = 0; g.over = false; g.ot = false;
  g.score.T = 5; g.score.CT = 4;
  update(g, 1 / 60);
  if (!g.over || g.state !== 'END') throw new Error('BO9 5:4 应立即结束');
  // 长赛制（MR9）8:8 仍保留加时
  g.matchWin = 9;
  g.state = 'END'; g.endedT = 0; g.over = false; g.ot = false;
  g.score.T = 8; g.score.CT = 8;
  update(g, 1 / 60);
  if (g.ot !== true) throw new Error('MR9 8:8 应进入加时');
});

console.log('selftest: ' + (errors.length === 0 ? 'PASS' : 'FAIL'));
if (errors.length) {
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
process.exit(0);
