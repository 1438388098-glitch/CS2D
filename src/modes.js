import { registerMode, registerMap, getMode, getMapDef } from './registry.js';
import { loadMap, getMap, nearestWalkable, tileAt, los, pathTo, followPath } from './map.js';
import { createEntity, weaponDef, wkey, ammoFor, reserveFor, defaultPistol } from './entities.js';
import { fireWeapon, startReload, finishReload, killEntity, applyDamage } from './combat.js';
import { setupMatchEntities, startRound, spawnParticle, setCustomBotsUpdater } from './game.js';
import { TILE, WEAPONS } from './config.js';
import { createBuilder } from './map-gen.js';
import { ctx, seedWorld } from './ctx.js';
import { clamp, rand, angNorm } from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
const mapTile = () => getMap()?.tile || TILE;

const WEAPON_POOL = ['ak', 'm4', 'awp', 'p90', 'mac10', 'mp9', 'xm', 'deagle'];
const ROGUE_POOL = ['glock', 'usp', 'p250', 'deagle', 'mac10', 'mp9', 'p90', 'xm', 'ak', 'm4', 'awp'];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setModeHud(game, title, lines) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('modeHud');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = '<div class="mh-title">' + esc(title) + '</div>' +
    (lines || []).map((l) => '<div class="mh-line">' + esc(l) + '</div>').join('');
}

function hideModeHud() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('modeHud');
  if (el) el.style.display = 'none';
}

function endModeGame(game, win, title, sub) {
  game.over = true;
  game.state = 'END';
  game.noRoundEnd = true;
  const p = game.player;
  const all = (game.entities || []).slice().sort((a, b) => b.kills - a.kills);
  const mvp = all[0];
  emit('banner', { t1: title, t2: sub, col: win ? '#ffd27a' : '#ff4d4d' });
  if (win) emit('sfx', { name: 'win', vol: 0.9, game });
  else emit('sfx', { name: 'lose', vol: 0.8, game });
  hideModeHud();
  if (game.ui && game.ui.showMatchEnd) {
    game.ui.showMatchEnd(win, sub, (p ? p.kills : 0) + ' 杀 / ' + (p ? p.deaths : 0) + ' 死',
      mvp ? mvp.name + ' · ' + mvp.kills + ' 击杀' : '—',
      { hits: game.stats.hits, shots: game.stats.shots, headshots: game.stats.headshots });
  }
}

function randomOpenPoint(game, minDistFrom = null) {
  if (!getMap()) return { x: mapTile() * 4, y: mapTile() * 4 };
  for (let i = 0; i < 80; i++) {
    const x = rand(mapTile() * 2, getMap().W - mapTile() * 2);
    const y = rand(mapTile() * 2, getMap().H - mapTile() * 2);
    const t = nearestWalkable(x, y);
    if (!t) continue;
    const px = t.x * mapTile() + mapTile() / 2, py = t.y * mapTile() + mapTile() / 2;
    if (minDistFrom && Math.hypot(px - minDistFrom.x, py - minDistFrom.y) < 240) continue;
    if (tileAt(px, py) === '#' || tileAt(px, py) === 'C' || tileAt(px, py) === '=') continue;
    return { x: px, y: py };
  }
  const t = nearestWalkable(getMap().W / 2, getMap().H / 2) || { x: 4, y: 4 };
  return { x: t.x * mapTile() + mapTile() / 2, y: t.y * mapTile() + mapTile() / 2 };
}

function repairGeneratedMap(game, id) {
  for (let pass = 0; pass < 6; pass++) {
    const d = getMap().diagnostics;
    if (!d.unreachable.length) return;
    const grid = getMap().grid;
    let changed = false;
    for (const u of d.unreachable) {
      const c = grid[u.y][u.x];
      if (c === 't' || c === 'c' || c === 'a' || c === 'b') continue;
      grid[u.y][u.x] = '#';
      changed = true;
    }
    if (!changed) return;
    const def = getMapDefSafe(id);
    def.rows = grid.map((r) => r.join(''));
    loadMap(def);
  }
}

function giveLoadout(e, primary, opts = {}) {
  e.weapons.primary = primary;
  const w = WEAPONS[primary];
  e.ammoMap[primary] = w.mag;
  e.reserveMap[primary] = opts.reserve || w.reserve;
  e.slot = 'primary';
  e.armor = opts.armor === undefined ? 0 : opts.armor;
  e.helmet = !!opts.helmet;
  if (opts.nades) {
    e.weapons.nades.he = opts.nades.he || 0;
    e.weapons.nades.flash = opts.nades.flash || 0;
    e.weapons.nades.smoke = opts.nades.smoke || 0;
  }
}

function customBotAI(e, game, dt, cfg = {}) {
  if (e.dead) return;
  e.trigger = false;
  if (e.fireCd > 0) e.fireCd -= dt;
  if (e.reloading) {
    e.reloadT -= dt;
    if (e.reloadT <= 0) finishReload(e, game);
  }
  const w = weaponDef(e);
  const speed = (w ? w.speed : 0.9) * 235 * (e.speedMult || 1);
  let target = null, td = 1e9;
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d < td) { td = d; target = o; }
  }
  if (target && td < 1400 && los(game, e.x, e.y, target.x, target.y, e.height)) {
    const leadX = target.x + target.vx * (td > 500 ? 0.05 : 0);
    const leadY = target.y + target.vy * (td > 500 ? 0.05 : 0);
    const want = Math.atan2(leadY - e.y, leadX - e.x);
    const aimSpeed = cfg.aimSpeed || e.aimSpeed || 140;
    const diff = want - e.angle;
    e.angle = angNorm(e.angle + clamp(diff, -aimSpeed * dt, aimSpeed * dt));
    const hitAng = td > 0 ? Math.atan2((target.rad || 13) + 2, td) : 0.4;
    if (Math.abs(diff) < hitAng * 0.9 && e.fireCd <= 0) {
      e.trigger = true;
    }
    const spd = speed * (td < 220 ? 0.3 : 0.65);
    const side = Math.sin(game.time * 2.1 + (e.anchorIdx || 0) * 2) > 0 ? 1 : -1;
    e.vx = Math.cos(e.angle + Math.PI / 2 * side) * spd * 0.6 + Math.cos(e.angle) * (td > 500 ? spd * 0.5 : 0);
    e.vy = Math.sin(e.angle + Math.PI / 2 * side) * spd * 0.6 + Math.sin(e.angle) * (td > 500 ? spd * 0.5 : 0);
  } else if (target) {
    if (e.path === null || e.repathT <= 0) {
      pathTo(e, target.x, target.y);
      e.repathT = 0.7;
    }
    if (e.repathT > 0) e.repathT -= dt;
    followPath(e, dt, speed);
    if (target) e.angle = angNorm(Math.atan2(target.y - e.y, target.x - e.x));
  } else {
    e.path = null;
    if (!e._wanderT || e._wanderT <= 0) {
      e._wanderT = 1.5 + rand() * 2;
      const pt = randomOpenPoint(game, e);
      pathTo(e, pt.x, pt.y);
    } else {
      e._wanderT -= dt;
      followPath(e, dt, speed * 0.45);
    }
  }
  if (e.trigger && e.fireCd <= 0) {
    e.trigger = false;
    fireWeapon(e, game);
  }
}

function customBotsUpdate(game, dt) {
  for (const e of game.entities) {
    if (!e.bot || e.dead || e.netControlled) continue;
    if (e.customAI) e.customAI(e, game, dt);
    else customBotAI(e, game, dt);
  }
}
setCustomBotsUpdater(customBotsUpdate);

/* ---------- Major ---------- */

const MAJOR_TEAMS = [
  { id: 'navi', name: 'Natus Vincere', tag: 'NAVI', region: '欧洲', style: '控图慢攻', rating: 97, players: [
    { name: 'b1t', role: '突破', aim: 96, movement: 92, clutch: 87, nade: 84, seed: 7 },
    { name: 'jL', role: '补枪', aim: 90, movement: 88, clutch: 90, nade: 82, seed: 11 },
    { name: 'Aleksib', role: '指挥', aim: 78, movement: 80, clutch: 85, nade: 97, seed: 3 },
    { name: 'iM', role: '步枪', aim: 89, movement: 86, clutch: 81, nade: 80, seed: 19 },
    { name: 'w0nderful', role: '狙击', aim: 94, movement: 90, clutch: 91, nade: 76, seed: 23 } ] },
  { id: 'faze', name: 'FaZe Clan', tag: 'FaZe', region: '国际', style: '高速协同', rating: 94, players: [
    { name: 'karrigan', role: '指挥', aim: 74, movement: 78, clutch: 84, nade: 96, seed: 5 },
    { name: 'rain', role: '突破', aim: 91, movement: 90, clutch: 88, nade: 82, seed: 9 },
    { name: 'broky', role: '狙击', aim: 95, movement: 91, clutch: 93, nade: 80, seed: 13 },
    { name: 'frozen', role: '步枪', aim: 92, movement: 89, clutch: 86, nade: 84, seed: 17 },
    { name: 'ropz', role: '自由人', aim: 93, movement: 92, clutch: 94, nade: 85, seed: 29 } ] },
  { id: 'g2', name: 'G2 Esports', tag: 'G2', region: '欧洲', style: '明星枪法', rating: 92, players: [
    { name: 'm0NESY', role: '狙击', aim: 98, movement: 95, clutch: 96, nade: 81, seed: 4 },
    { name: 'huNter-', role: '步枪', aim: 88, movement: 87, clutch: 92, nade: 83, seed: 8 },
    { name: 'Snax', role: '指挥', aim: 76, movement: 77, clutch: 86, nade: 95, seed: 12 },
    { name: 'malbsMd', role: '突破', aim: 90, movement: 93, clutch: 82, nade: 79, seed: 20 },
    { name: 'heavyGod', role: '补枪', aim: 87, movement: 85, clutch: 84, nade: 80, seed: 24 } ] },
  { id: 'spirit', name: 'Team Spirit', tag: 'Spirit', region: '欧洲', style: '狂野进攻', rating: 93, players: [
    { name: 'donk', role: '突破', aim: 97, movement: 96, clutch: 91, nade: 83, seed: 2 },
    { name: 'sh1ro', role: '狙击', aim: 96, movement: 91, clutch: 95, nade: 82, seed: 6 },
    { name: 'chopper', role: '指挥', aim: 77, movement: 79, clutch: 85, nade: 97, seed: 10 },
    { name: 'zont1x', role: '步枪', aim: 89, movement: 87, clutch: 84, nade: 81, seed: 14 },
    { name: 'magixx', role: '补枪', aim: 86, movement: 85, clutch: 82, nade: 79, seed: 18 } ] },
  { id: 'vitality', name: 'Team Vitality', tag: 'VIT', region: '欧洲', style: '狙击核心', rating: 91, players: [
    { name: 'ZywOo', role: '狙击', aim: 99, movement: 96, clutch: 98, nade: 88, seed: 1 },
    { name: 'flameZ', role: '步枪', aim: 91, movement: 90, clutch: 85, nade: 80, seed: 15 },
    { name: 'apEX', role: '指挥', aim: 78, movement: 82, clutch: 86, nade: 95, seed: 16 },
    { name: 'mezii', role: '补枪', aim: 87, movement: 85, clutch: 83, nade: 81, seed: 21 },
    { name: 'Spinx', role: '自由人', aim: 92, movement: 93, clutch: 89, nade: 84, seed: 25 } ] },
  { id: 'mouz', name: 'MOUZ', tag: 'MOUZ', region: '欧洲', style: '纪律经济', rating: 89, players: [
    { name: 'torzsi', role: '狙击', aim: 94, movement: 89, clutch: 90, nade: 82, seed: 26 },
    { name: 'Brollan', role: '步枪', aim: 90, movement: 91, clutch: 85, nade: 83, seed: 28 },
    { name: 'Jimpphat', role: '步枪', aim: 89, movement: 86, clutch: 87, nade: 84, seed: 30 },
    { name: 'xertioN', role: '突破', aim: 88, movement: 93, clutch: 81, nade: 78, seed: 32 },
    { name: 'siuhy', role: '指挥', aim: 76, movement: 78, clutch: 83, nade: 94, seed: 34 } ] },
  { id: 'liquid', name: 'Team Liquid', tag: 'Liquid', region: '北美', style: '双狙体系', rating: 86, players: [
    { name: 'NAF', role: '步枪', aim: 91, movement: 88, clutch: 92, nade: 86, seed: 22 },
    { name: 'Twistzz', role: '自由人', aim: 92, movement: 90, clutch: 88, nade: 84, seed: 27 },
    { name: 'ultimate', role: '狙击', aim: 90, movement: 87, clutch: 86, nade: 78, seed: 31 },
    { name: 'jks', role: '补枪', aim: 86, movement: 84, clutch: 87, nade: 80, seed: 33 },
    { name: 'YEKINDAR', role: '突破', aim: 89, movement: 92, clutch: 84, nade: 79, seed: 35 } ] },
  { id: 'furia', name: 'FURIA', tag: 'FURIA', region: '巴西', style: '激进压迫', rating: 84, players: [
    { name: 'FalleN', role: '指挥/狙击', aim: 88, movement: 82, clutch: 91, nade: 93, seed: 36 },
    { name: 'KSCERATO', role: '步枪', aim: 92, movement: 89, clutch: 86, nade: 82, seed: 37 },
    { name: 'yuurih', role: '步枪', aim: 90, movement: 88, clutch: 85, nade: 83, seed: 38 },
    { name: 'skullz', role: '补枪', aim: 86, movement: 86, clutch: 80, nade: 78, seed: 39 },
    { name: 'drop', role: '突破', aim: 85, movement: 90, clutch: 79, nade: 77, seed: 40 } ] },
  { id: 'mongolz', name: 'The MongolZ', tag: 'MongolZ', region: '亚洲', style: '团战提速', rating: 85, players: [
    { name: '910', role: '狙击', aim: 92, movement: 89, clutch: 88, nade: 81, seed: 41 },
    { name: 'bLitz', role: '步枪', aim: 89, movement: 88, clutch: 84, nade: 80, seed: 42 },
    { name: 'mzinho', role: '突破', aim: 87, movement: 91, clutch: 81, nade: 79, seed: 43 },
    { name: 'Senzu', role: '补枪', aim: 86, movement: 87, clutch: 82, nade: 78, seed: 44 },
    { name: 'Techno', role: '指挥', aim: 78, movement: 80, clutch: 84, nade: 92, seed: 45 } ] },
  { id: 'efire', name: 'Eternal Fire', tag: 'EF', region: '土耳其', style: '高爆个人', rating: 83, players: [
    { name: 'XANTARES', role: '突破', aim: 95, movement: 93, clutch: 89, nade: 82, seed: 46 },
    { name: 'woxic', role: '狙击', aim: 93, movement: 90, clutch: 88, nade: 80, seed: 47 },
    { name: 'MAJ3R', role: '指挥', aim: 76, movement: 78, clutch: 85, nade: 94, seed: 48 },
    { name: 'calyx', role: '步枪', aim: 87, movement: 85, clutch: 82, nade: 79, seed: 49 },
    { name: 'Wicadia', role: '补枪', aim: 85, movement: 86, clutch: 81, nade: 77, seed: 50 } ] },
  { id: 'heroic', name: 'HEROIC', tag: 'Heroic', region: '欧洲', style: '团队纪律', rating: 82, players: [
    { name: 'TeSeS', role: '步枪', aim: 88, movement: 86, clutch: 84, nade: 82, seed: 51 },
    { name: 'sjuush', role: '补枪', aim: 86, movement: 84, clutch: 85, nade: 83, seed: 52 },
    { name: 'kyxsan', role: '指挥', aim: 77, movement: 79, clutch: 84, nade: 95, seed: 53 },
    { name: 'NertZ', role: '步枪', aim: 89, movement: 87, clutch: 86, nade: 81, seed: 54 },
    { name: 'degster', role: '狙击', aim: 91, movement: 88, clutch: 87, nade: 79, seed: 55 } ] },
  { id: 'complexity', name: 'Complexity', tag: 'COL', region: '北美', style: '残局韧性', rating: 80, players: [
    { name: 'EliGE', role: '步枪', aim: 92, movement: 89, clutch: 90, nade: 84, seed: 56 },
    { name: 'JT', role: '指挥', aim: 77, movement: 78, clutch: 84, nade: 92, seed: 57 },
    { name: 'floppy', role: '自由人', aim: 87, movement: 89, clutch: 85, nade: 80, seed: 58 },
    { name: 'hallzerk', role: '狙击', aim: 89, movement: 86, clutch: 85, nade: 78, seed: 59 },
    { name: 'Grim', role: '补枪', aim: 84, movement: 82, clutch: 81, nade: 78, seed: 60 } ] },
  { id: 'pain', name: 'paiN Gaming', tag: 'paiN', region: '巴西', style: '进攻浪', rating: 79, players: [
    { name: 'biguzera', role: '指挥', aim: 80, movement: 82, clutch: 86, nade: 91, seed: 61 },
    { name: 'kauez', role: '步枪', aim: 86, movement: 85, clutch: 81, nade: 79, seed: 62 },
    { name: 'nqz', role: '狙击', aim: 88, movement: 87, clutch: 83, nade: 77, seed: 63 },
    { name: 'snow', role: '突破', aim: 85, movement: 90, clutch: 79, nade: 76, seed: 64 },
    { name: 'lux', role: '补枪', aim: 84, movement: 83, clutch: 80, nade: 78, seed: 65 } ] },
  { id: 'mibr', name: 'MIBR', tag: 'MIBR', region: '巴西', style: '地图控制', rating: 78, players: [
    { name: 'insani', role: '步枪', aim: 87, movement: 89, clutch: 82, nade: 78, seed: 66 },
    { name: 'exit', role: '突破', aim: 86, movement: 91, clutch: 80, nade: 77, seed: 67 },
    { name: 'brnz4n', role: '指挥', aim: 76, movement: 78, clutch: 83, nade: 90, seed: 68 },
    { name: 'saffee', role: '狙击', aim: 88, movement: 85, clutch: 85, nade: 79, seed: 69 },
    { name: 'drop2', role: '补枪', aim: 83, movement: 82, clutch: 79, nade: 77, seed: 70 } ] },
  { id: 'fnatic', name: 'Fnatic', tag: 'Fnatic', region: '欧洲', style: '传统步枪', rating: 77, players: [
    { name: 'blameF', role: '步枪', aim: 91, movement: 88, clutch: 90, nade: 85, seed: 71 },
    { name: 'KRIMZ', role: '补枪', aim: 86, movement: 84, clutch: 87, nade: 82, seed: 72 },
    { name: 'fear', role: '狙击', aim: 87, movement: 85, clutch: 82, nade: 76, seed: 73 },
    { name: 'bodyy', role: '指挥', aim: 78, movement: 80, clutch: 83, nade: 90, seed: 74 },
    { name: 'matys', role: '突破', aim: 84, movement: 89, clutch: 78, nade: 75, seed: 75 } ] },
  { id: 'astralis', name: 'Astralis', tag: 'Astralis', region: '丹麦', style: '老牌纪律', rating: 81, players: [
    { name: 'dev1ce', role: '狙击', aim: 95, movement: 90, clutch: 94, nade: 83, seed: 76 },
    { name: 'stavn', role: '步枪', aim: 89, movement: 86, clutch: 84, nade: 80, seed: 77 },
    { name: 'jabbi', role: '步枪', aim: 87, movement: 85, clutch: 82, nade: 79, seed: 78 },
    { name: 'cadian', role: '指挥/狙击', aim: 84, movement: 83, clutch: 88, nade: 93, seed: 79 },
    { name: 'Staehr', role: '补枪', aim: 85, movement: 84, clutch: 80, nade: 78, seed: 80 } ] },
  { id: 'vp', name: 'Virtus.pro', tag: 'VP', region: '欧洲', style: '稳扎稳打', rating: 88, players: [
    { name: 'Jame', role: '狙击/指挥', aim: 92, movement: 85, clutch: 96, nade: 94, seed: 81 },
    { name: 'electroNic', role: '步枪', aim: 90, movement: 87, clutch: 89, nade: 84, seed: 82 },
    { name: 'fame', role: '步枪', aim: 87, movement: 85, clutch: 84, nade: 80, seed: 83 },
    { name: 'n0rb3r7', role: '突破', aim: 86, movement: 90, clutch: 81, nade: 78, seed: 84 },
    { name: 'FL1T', role: '补枪', aim: 85, movement: 83, clutch: 82, nade: 79, seed: 85 } ] },
  { id: 'monte', name: 'Monte', tag: 'Monte', region: '欧洲', style: '新锐提速', rating: 75, players: [
    { name: 'Woro2k', role: '狙击', aim: 90, movement: 88, clutch: 84, nade: 77, seed: 86 },
    { name: 'DemQQ', role: '步枪', aim: 86, movement: 84, clutch: 81, nade: 78, seed: 87 },
    { name: 'sdy', role: '指挥', aim: 78, movement: 80, clutch: 83, nade: 91, seed: 88 },
    { name: 'kRaSnaL', role: '补枪', aim: 84, movement: 82, clutch: 79, nade: 76, seed: 89 },
    { name: 'br0', role: '突破', aim: 83, movement: 87, clutch: 78, nade: 75, seed: 90 } ] }
];

function makeMajorState(teamId) {
  const teams = MAJOR_TEAMS.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p })) }))
    .sort((a, b) => b.rating - a.rating)
    .map((t, i) => ({ ...t, seed: i + 1 }));
  const round1 = [
    [teams[0], teams[15]], [teams[7], teams[8]], [teams[4], teams[11]], [teams[3], teams[12]],
    [teams[5], teams[10]], [teams[2], teams[13]], [teams[6], teams[9]], [teams[1], teams[14]]
  ].map((pair) => ({ a: pair[0], b: pair[1], winner: null, score: null, played: false }));
  const user = teams.find((t) => t.id === teamId) || teams[0];
  return { stage: 'bracket', round: 1, rounds: [round1], user, wins: 0, losses: 0, champion: null, lastResult: null };
}

function simScore(a, b) {
  const diff = a.rating - b.rating;
  const p = clamp(0.5 + diff * 0.004, 0.22, 0.86);
  const aw = ctx.rand() < p;
  const wa = aw ? a : b;
  const loser = aw ? b : a;
  const x = Math.round(13 - Math.floor(ctx.rand() * (wa.rating - loser.rating > 3 ? 7 : 3)));
  const score = [x, Math.max(4, 13 - x)];
  if (ctx.rand() < 0.3) score[0] -= 1;
  return { winner: wa, score };
}

function currentMatches(state) {
  return state.rounds[state.round - 1];
}

function advanceMajorRound(game) {
  const st = game.major;
  const matches = currentMatches(st);
  for (const m of matches) {
    if (!m.played) {
      const r = simScore(m.a, m.b);
      m.played = true;
      m.winner = r.winner;
      m.score = r.score;
      if (r.winner.id === st.user.id) st.wins++;
      else if (m.a.id === st.user.id || m.b.id === st.user.id) st.losses++;
    }
  }
  if (st.round >= 4) {
    st.champion = matches[0].winner;
    st.stage = 'bracket';
    emit('toast', { text: (st.champion.id === st.user.id ? '你 ' : '') + st.champion.tag + ' 夺得 Major 冠军！' });
    return;
  }
  const winners = matches.map((m) => m.winner);
  const next = [];
  for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i], b: winners[i + 1], winner: null, score: null, played: false });
  st.rounds.push(next);
  st.round++;
}

function teamDiffParams(team) {
  const r = team.rating;
  return {
    react: clamp(0.2 - r * 0.0011, 0.055, 0.18),
    spreadMult: clamp(1.18 - r * 0.0055, 0.55, 1.05),
    view: 980 + r * 2.4,
    strafe: clamp(0.68 - r * 0.0025, 0.36, 0.62),
    aimSpeed: 34 + r * 0.55,
    idealMin: 190 + r * 0.4,
    idealMax: 520 + r * 1.2,
    rushChance: 0.2 + (r - 75) * 0.012,
    rotateChance: 0.35 + (r - 75) * 0.012,
    saveChance: clamp(0.3 + (r - 75) * 0.01, 0.3, 0.8)
  };
}

function startMajorPlay(game) {
  const st = game.major;
  const matches = currentMatches(st);
  const mine = matches.find((m) => !m.played && (m.a.id === st.user.id || m.b.id === st.user.id));
  if (!mine) { advanceMajorRound(game); return; }
  const opp = mine.a.id === st.user.id ? mine.b : mine.a;
  st.currentMatch = mine;
  st.stage = 'match';
  game.opts.mapId = ['dust2', 'canal', 'metro'][(st.round - 1) % 3];
  game.opts.team = st.user.id.charCodeAt(0) % 2 ? 't' : 'ct';
  game.opts.bots = 4;
  game.opts.diff = 'hard';
  game.opts.diffParams = teamDiffParams(opp);
  game.noRoundEnd = false;
  setupMatchEntities(game);
  startRound(game);
  emit('toast', { text: 'Major 对阵 ' + st.user.tag + ' vs ' + opp.tag });
}

function renderMajorPanel(game) {
  if (typeof document === 'undefined') return;
  const st = game.major;
  if (!st) return;
  const el = document.getElementById('majorPanel');
  if (!el) return;
  el.style.display = 'block';
  const body = document.getElementById('majorBracket');
  if (!body) return;
  let html = '<div class="major-status">你的队伍 <b class="m-user">' + esc(st.user.tag) + '</b> · 种子 #' + st.user.seed + ' · 胜 ' + st.wins + ' / 负 ' + st.losses + '</div>';
  html += '<div class="major-rounds">';
  for (let ri = 0; ri < st.rounds.length; ri++) {
    html += '<div class="major-round"><div class="mr-label">R' + (ri + 1) + '</div>';
    for (const m of st.rounds[ri]) {
      const cur = ri === st.round - 1;
      const hasUser = m.a.id === st.user.id || m.b.id === st.user.id;
      const done = m.played;
      html += '<div class="mr-card' + (cur ? ' cur' : '') + (hasUser ? ' user' : '') + '">';
      html += '<div class="mr-team' + (done && m.winner.id === m.a.id ? ' win' : '') + '"><span>' + esc(m.a.tag) + '</span><b>' + (done ? m.score[0] : '') + '</b></div>';
      html += '<div class="mr-team' + (done && m.winner.id === m.b.id ? ' win' : '') + '"><span>' + esc(m.b.tag) + '</span><b>' + (done ? m.score[1] : '') + '</b></div>';
      if (cur && !done && hasUser) html += '<div class="mr-act"><button class="btn small" data-ma="play">亲自打</button><button class="btn small" data-ma="simMine">模拟本场</button></div>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  if (st.champion) html += '<div class="major-champ">冠军：' + esc(st.champion.name) + '</div>';
  body.innerHTML = html;
  body.querySelectorAll('[data-ma]').forEach((btn) => {
    btn.onclick = () => majorAction(game, btn.getAttribute('data-ma'));
  });
}

export function majorAction(game, action) {
  const st = game.major;
  if (!st) return;
  if (action === 'simRound') { advanceMajorRound(game); renderMajorPanel(game); }
  else if (action === 'play') { startMajorPlay(game); if (typeof document !== 'undefined') { const p = document.getElementById('majorPanel'); if (p) p.style.display = 'none'; } }
  else if (action === 'simMine') {
    const matches = currentMatches(st);
    const mine = matches.find((m) => !m.played && (m.a.id === st.user.id || m.b.id === st.user.id));
    if (mine) { const r = simScore(mine.a, mine.b); mine.played = true; mine.winner = r.winner; mine.score = r.score; if (r.winner.id === st.user.id) st.wins++; else st.losses++; }
    renderMajorPanel(game);
  }
  else if (action === 'next') {
    game.over = false;
    game.state = 'MAJOR';
    game.major.stage = 'bracket';
    if (game.ui) { game.ui.hideEnd(); }
  }
  else if (action === 'menu') { game.ui.hideEnd(); game.ui.showMenu(); }
}

/* ---------- Battle Royale ---------- */

function generateBrRows(seed) {
  const b = createBuilder(90, 64);
  b.room(1, 1, b.w - 2, b.h - 2);
  for (let i = 0; i < 220; i++) b.box(1 + Math.floor(rand() * (b.w - 2)), 1 + Math.floor(rand() * (b.h - 2)));
  for (let i = 0; i < 80; i++) b.tile(1 + Math.floor(rand() * (b.w - 2)), 1 + Math.floor(rand() * (b.h - 2)), '=');
  for (let i = 0; i < 90; i++) b.tile(1 + Math.floor(rand() * (b.w - 2)), 1 + Math.floor(rand() * (b.h - 2)), '~');
  for (let i = 0; i < 35; i++) b.tile(1 + Math.floor(rand() * (b.w - 2)), 1 + Math.floor(rand() * (b.h - 2)), '?');
  for (let i = 0; i < 36; i++) b.tile(1 + Math.floor(rand() * (b.w - 2)), 1 + Math.floor(rand() * (b.h - 2)), 'o');
  for (let i = 0; i < 42; i++) b.crate(1 + Math.floor(rand() * (b.w - 2)), 1 + Math.floor(rand() * (b.h - 2)));
  b.site('A', 3, 3, 3, 3);
  b.site('B', b.w - 7, b.h - 7, 4, 4);
  b.spawn('t', 5, 5, 1, 1);
  b.spawn('c', b.w - 6, b.h - 6, 1, 1);
  return b.rows();
}

function brModeStart(game) {
  seedWorld(game.seed);
  registerMap({ id: 'br-island', name: '荒岛大逃杀', accent: '#6ee27a', rows: generateBrRows(game.seed) });
  loadMap(getMapDefSafe('br-island'));
  repairGeneratedMap(game, 'br-island');
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.barrels = (getMap().barrels || []).map((b) => ({ ...b }));
  game.crates = (getMap().crates || []).map((c) => ({ ...c }));
  if (game.onMapChanged) game.onMapChanged(getMap());
  game.noRoundEnd = true;
  game.roundDur = 999999;
  game.state = 'LIVE';
  game.roundTime = 0;
  game.entities = [];
  game.player = createEntity('p', false);
  game.player.weapons.secondary = defaultPistol('ct');
  game.player.ammoMap[game.player.weapons.secondary] = WEAPONS[game.player.weapons.secondary].mag;
  game.player.reserveMap[game.player.weapons.secondary] = WEAPONS[game.player.weapons.secondary].reserve;
  const sp = randomOpenPoint(game);
  game.player.x = sp.x; game.player.y = sp.y;
  game.entities.push(game.player);
  const botCount = 14;
  for (let i = 0; i < botCount; i++) {
    const e = createEntity('br' + i, true);
    e.team = 'br' + i;
    e.name = BOT_NAME(i);
    giveLoadout(e, WEAPON_POOL[Math.floor(rand() * WEAPON_POOL.length)], { armor: rand() < 0.5 ? 100 : 0, helmet: rand() < 0.3, nades: { he: rand() < 0.5 ? 1 : 0, flash: 0, smoke: 0 } });
    const pt = randomOpenPoint(game, game.player);
    e.x = pt.x; e.y = pt.y;
    e.aimParams = { aimSpeed: 90 + rand() * 80, damage: 1 };
    e.customAI = customBotAI;
    game.entities.push(e);
  }
  game.br = {
    zone: { x: getMap().W / 2, y: getMap().H / 2, r: Math.max(getMap().W, getMap().H) * 0.58 },
    nextT: 24, phase: 1, lootT: 2, startedAt: game.time, total: game.entities.length
  };
  emit('toast', { text: '大逃杀开始：捡枪、缩圈、活到最后' });
}

function BOT_NAME(i) {
  return 'BOT' + (i + 1).toString().padStart(2, '0');
}

function brLootDrop(game) {
  const pt = randomOpenPoint(game);
  const wid = WEAPON_POOL[Math.floor(rand() * WEAPON_POOL.length)];
  const w = WEAPONS[wid];
  game.drops.push({ x: pt.x, y: pt.y, wid, ammo: w.mag, reserve: w.reserve, life: 60 });
  spawnParticle(game, { kind: 'boom', x: pt.x, y: pt.y, life: 0.4, size: 70 });
}

function brUpdate(game, dt) {
  const br = game.br;
  if (!br || game.state === 'END') return;
  br.nextT -= dt;
  br.lootT -= dt;
  if (br.lootT <= 0) {
    br.lootT = 5 + rand() * 4;
    brLootDrop(game);
  }
  if (br.nextT <= 0 && br.phase < 6) {
    br.phase++;
    br.nextT = 20 + br.phase * 3;
    br.zone.r = Math.max(360, br.zone.r * (br.phase === 2 ? 0.78 : 0.84));
    emit('toast', { text: '安全区缩小 · 第 ' + br.phase + ' 阶段' });
    emit('sfx', { name: 'beep', vol: 0.7, game });
  }
  for (const e of game.entities) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - br.zone.x, e.y - br.zone.y);
    if (d > br.zone.r) {
      const dps = 4 + br.phase * 2.5;
      applyDamage(e, dps * dt, { killer: null, weapon: 'zone', head: false }, game);
    }
  }
  const alive = game.entities.filter((e) => !e.dead);
  if (alive.length === 1 && alive[0] === game.player) {
    endModeGame(game, true, 'CHICKEN DINNER', '第 ' + br.phase + ' 阶段存活 · 冠军');
    return;
  }
  if (!game.player || game.player.dead) {
    const rank = alive.length + 1;
    endModeGame(game, false, '阵亡', '排名 #' + rank + ' / ' + (game.br.total || 16));
    return;
  }
  const secs = Math.max(0, Math.ceil(br.nextT));
  setModeHud(game, '大逃杀 · 第 ' + br.phase + ' 阶段', [
    '存活 ' + alive.length + ' 人',
    '缩圈 ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'),
    '圈半径 ' + Math.round(br.zone.r) + 'px'
  ]);
}

/* ---------- Roguelike ---------- */

function generateRogueRows(seed, level) {
  const w = 70, h = 50;
  const grid = Array.from({ length: h }, () => Array(w).fill('#'));
  const rooms = [];
  const carve = (x0, y0, w2, h2) => {
    for (let y = y0; y < y0 + h2 && y < h - 1; y++) {
      for (let x = x0; x < x0 + w2 && x < w - 1; x++) {
        if (y >= 1 && x >= 1) grid[y][x] = '.';
      }
    }
  };
  for (let i = 0; i < 22; i++) {
    const rw = 4 + Math.floor(rand() * 7), rh = 3 + Math.floor(rand() * 5);
    const rx = 2 + Math.floor(rand() * (w - rw - 3)), ry = 2 + Math.floor(rand() * (h - rh - 3));
    carve(rx, ry, rw, rh);
    rooms.push({ x: rx + Math.floor(rw / 2), y: ry + Math.floor(rh / 2) });
    if (rooms.length > 1) {
      const p = rooms[rooms.length - 2], c = rooms[rooms.length - 1];
      let cx = p.x;
      while (cx !== c.x) { grid[p.y][cx] = '.'; cx += Math.sign(c.x - cx); }
      let cy = p.y;
      while (cy !== c.y) { grid[cy][c.x] = '.'; cy += Math.sign(c.y - cy); }
    }
  }
  for (let i = 0; i < 26 + level * 4; i++) {
    const r = rooms[Math.floor(rand() * rooms.length)];
    const x = r.x + Math.floor(rand() * 3) - 1, y = r.y + Math.floor(rand() * 3) - 1;
    if (x > 1 && y > 1 && x < w - 2 && y < h - 2) grid[y][x] = 'C';
  }
  for (let i = 0; i < 10; i++) {
    const r = rooms[Math.floor(rand() * rooms.length)];
    grid[r.y][r.x] = '?';
  }
  const a = rooms[0], b = rooms[1], c = rooms[2], d = rooms[3] || rooms[0];
  grid[a.y][a.x] = 't'; grid[b.y][b.x] = 'c';
  grid[c.y][c.x] = 'a'; grid[d.y][d.x] = 'b';
  for (let i = 0; i < w; i++) { grid[0][i] = '#'; grid[h - 1][i] = '#'; }
  for (let i = 0; i < h; i++) { grid[i][0] = '#'; grid[i][w - 1] = '#'; }
  return grid.map((r) => r.join(''));
}

const AFFIXES = [
  { id: 'dmg', label: '火力 +25%', apply: (p) => { p.dmgMult = (p.dmgMult || 1) + 0.25; } },
  { id: 'speed', label: '移速 +18%', apply: (p) => { p.speedMult = (p.speedMult || 1) + 0.18; } },
  { id: 'hp', label: '生命上限 +30', apply: (p) => { p.maxHp = (p.maxHp || 100) + 30; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { id: 'regen', label: '每秒回血 +1.2', apply: (p) => { p.regen = (p.regen || 0) + 1.2; } },
  { id: 'ammo', label: '无限弹匣', apply: (p) => { p.infiniteAmmo = true; } },
  { id: 'crit', label: '暴击率 +12%', apply: (p) => { p.critChance = (p.critChance || 0) + 0.12; } }
];

function rogueStart(game) {
  seedWorld(game.seed);
  registerMap({ id: 'rogue-run', name: '随机地下城', accent: '#d06ad6', rows: generateRogueRows(game.seed, 1) });
  loadMap(getMapDefSafe('rogue-run'));
  repairGeneratedMap(game, 'rogue-run');
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.barrels = (getMap().barrels || []).map((b) => ({ ...b }));
  game.crates = (getMap().crates || []).map((c) => ({ ...c }));
  if (game.onMapChanged) game.onMapChanged(getMap());
  game.noRoundEnd = true;
  game.roundDur = 999999;
  game.state = 'LIVE';
  game.roundTime = 0;
  game.entities = [];
  game.player = createEntity('p', false);
  game.player.weapons.secondary = defaultPistol('ct');
  game.player.ammoMap[game.player.weapons.secondary] = WEAPONS[game.player.weapons.secondary].mag;
  game.player.reserveMap[game.player.weapons.secondary] = WEAPONS[game.player.weapons.secondary].reserve;
  const sp = randomOpenPoint(game);
  game.player.x = sp.x; game.player.y = sp.y;
  game.player.speedMult = 1;
  game.entities.push(game.player);
  game.rogue = { wave: 1, affixes: [], kills: 0, spawnT: 0.6, nextWaveT: 3, level: 1 };
  emit('toast', { text: '肉鸽模式：清完一波获得随机枪械与词条' });
}

function rogueSpawnWave(game) {
  const r = game.rogue;
  const count = 3 + Math.floor(r.wave * 0.8);
  for (let i = 0; i < count; i++) {
    const e = createEntity('enemy', true);
    e.team = 'enemy';
    e.name = '怪物' + (i + 1);
    e.hp = 45 + r.wave * 8;
    e.dmgMult = 0.65 + r.wave * 0.04;
    e.aimSpeed = 46 + r.wave * 6;
    giveLoadout(e, ROGUE_POOL[Math.floor(rand() * ROGUE_POOL.length)], {});
    e.customAI = customBotAI;
    const pt = randomOpenPoint(game, game.player);
    e.x = pt.x; e.y = pt.y;
    game.entities.push(e);
  }
  emit('toast', { text: '第 ' + r.wave + ' 波来袭' });
  emit('sfx', { name: 'beep', vol: 0.6, game });
}

function rogueReward(game) {
  const r = game.rogue;
  const af = AFFIXES[Math.floor(rand() * AFFIXES.length)];
  af.apply(game.player);
  r.affixes.push(af.label);
  const wid = ROGUE_POOL[Math.floor(rand() * ROGUE_POOL.length)];
  if (game.player.weapons.primary !== wid) {
    giveLoadout(game.player, wid, { armor: game.player.armor, helmet: game.player.helmet });
    emit('toast', { text: '词条：' + af.label + ' · 新枪：' + WEAPONS[wid].name });
  } else {
    emit('toast', { text: '词条：' + af.label });
  }
  r.nextWaveT = 4;
}

function rogueUpdate(game, dt) {
  const r = game.rogue;
  if (!r || game.state === 'END') return;
  const p = game.player;
  if (p && !p.dead && p.regen) p.hp = Math.min(p.maxHp || 100, p.hp + p.regen * dt);
  const enemies = game.entities.filter((e) => e.bot && !e.dead);
  if (enemies.length === 0) {
    r.nextWaveT -= dt;
    if (r.nextWaveT <= 0) {
      rogueReward(game);
      r.wave++;
      rogueSpawnWave(game);
    }
  }
  setModeHud(game, '肉鸽地下城 · 第 ' + r.wave + ' 波', [
    '敌人 ' + enemies.length,
    '击杀 ' + r.kills,
    '词条 ' + (r.affixes.length ? r.affixes.join(' · ') : '无')
  ]);
  if (p && p.dead) {
    endModeGame(game, false, '阵亡', '推进到第 ' + r.wave + ' 波');
  }
}

/* ---------- Boss ---------- */

function bossArenaRows() {
  const b = createBuilder(52, 40);
  b.room(1, 1, b.w - 2, b.h - 2);
  b.boxes(20, 15, 3, 3); b.boxes(29, 15, 3, 3); b.boxes(14, 24, 2, 2); b.boxes(36, 24, 2, 2);
  b.boxes(24, 22, 4, 2); b.crate(10, 10); b.crate(41, 10); b.crate(10, 29); b.crate(41, 29);
  b.tile(20, 20, 'o'); b.tile(31, 20, 'o');
  b.site('A', 2, 2, 3, 3); b.site('B', b.w - 5, b.h - 5, 3, 3);
  b.spawn('t', 25, 3, 2, 2); b.spawn('c', 25, b.h - 5, 2, 2);
  return b.rows();
}

function bossStart(game) {
  seedWorld(game.seed);
  registerMap({ id: 'boss-arena', name: '虚空巢穴', accent: '#c04ad6', rows: bossArenaRows() });
  loadMap(getMapDefSafe('boss-arena'));
  repairGeneratedMap(game, 'boss-arena');
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.barrels = (getMap().barrels || []).map((b) => ({ ...b }));
  game.crates = (getMap().crates || []).map((c) => ({ ...c }));
  if (game.onMapChanged) game.onMapChanged(getMap());
  game.noRoundEnd = true;
  game.roundDur = 999999;
  game.state = 'LIVE';
  game.roundTime = 0;
  game.entities = [];
  game.player = createEntity('p', false);
  game.player.weapons.secondary = defaultPistol('ct');
  game.player.ammoMap[game.player.weapons.secondary] = WEAPONS[game.player.weapons.secondary].mag;
  game.player.reserveMap[game.player.weapons.secondary] = WEAPONS[game.player.weapons.secondary].reserve;
  const sp = randomOpenPoint(game);
  game.player.x = sp.x; game.player.y = sp.y;
  game.entities.push(game.player);
  const boss = createEntity('boss', true);
  boss.team = 'boss';
  boss.name = '虚空收割者';
  boss.hp = 1400;
  boss.maxHp = 1400;
  boss.rad = 34;
  boss.boss = true;
  boss.customAI = bossAI;
  boss.weapons.primary = 'awp';
  boss.ammoMap.awp = 5;
  boss.reserveMap.awp = 5;
  const bp = randomOpenPoint(game, game.player);
  boss.x = bp.x; boss.y = bp.y;
  boss.x = getMap().W / 2; boss.y = getMap().H / 2;
  game.entities.push(boss);
  game.bossShots = [];
  game.boss = { phase: 1, attackT: 2, summonT: 9, enraged: false, hits: 0 };
  emit('toast', { text: 'Boss 战开始：击破虚空收割者' });
}

function bossAI(e, game, dt) {
  if (e.dead) return;
  const b = game.boss;
  const p = game.player;
  e.trigger = false;
  if (!b || !p || p.dead) return;
  if (e.fireCd > 0) e.fireCd -= dt;
  if (b.attackT > 0) b.attackT -= dt;
  if (b.summonT > 0) b.summonT -= dt;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  e.angle = angNorm(Math.atan2(p.y - e.y, p.x - e.x));
  if (d > 280) {
    e.vx = Math.cos(e.angle) * 105;
    e.vy = Math.sin(e.angle) * 105;
  } else {
    e.vx *= 0.85; e.vy *= 0.85;
  }
  if (b.attackT <= 0) {
    b.attackT = b.phase === 2 ? 1.5 : 2.4;
    const count = b.phase === 2 ? 10 : 7;
    for (let i = 0; i < count; i++) {
      const a = e.angle + (i / count) * Math.PI * 2;
      game.bossShots.push({ x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, life: 5, dmg: b.phase === 2 ? 16 : 12, size: 9 });
    }
    emit('sfx', { name: 'awp', vol: 0.7, x: e.x, y: e.y, game });
  }
  if (b.summonT <= 0 && b.phase === 2) {
    b.summonT = 12;
    for (let i = 0; i < 3; i++) {
      const m = createEntity('minion', true);
      m.team = 'boss';
      m.name = '虚空仆从';
      m.hp = 90;
      m.dmgMult = 1.1;
      giveLoadout(m, i % 2 ? 'p90' : 'mac10', {});
      m.customAI = customBotAI;
      const pt = randomOpenPoint(game, e);
      m.x = pt.x; m.y = pt.y;
      game.entities.push(m);
    }
    emit('toast', { text: 'Boss 召唤了虚空仆从' });
  }
  if (e.hp < e.maxHp * 0.5 && !b.enraged) {
    b.enraged = true;
    b.phase = 2;
    emit('banner', { t1: '虚空收割者 进入二阶段', t2: '攻击频率提升', col: '#ff4d6d' });
  }
}

function bossUpdate(game, dt) {
  if (!game.boss || game.state === 'END') return;
  if (!game.bossShots) game.bossShots = [];
  for (let i = game.bossShots.length - 1; i >= 0; i--) {
    const s = game.bossShots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0 || tileAt(s.x, s.y) === '#') {
      game.bossShots.splice(i, 1);
      continue;
    }
    const p = game.player;
    if (p && !p.dead && Math.hypot(p.x - s.x, p.y - s.y) < p.rad + s.size) {
      applyDamage(p, s.dmg, { killer: null, weapon: 'boss', head: false }, game);
      game.bossShots.splice(i, 1);
    }
  }
  const boss = game.entities.find((e) => e.boss);
  if (boss && boss.dead) {
    giveLoadout(game.player, ['ak', 'm4', 'awp', 'xm'][Math.floor(rand() * 4)], { armor: 100, helmet: true });
    endModeGame(game, true, 'BOSS CLEAR', '虚空收割者已被击败');
    return;
  }
  const bossHp = boss ? Math.max(0, Math.ceil(boss.hp)) : 0;
  setModeHud(game, 'Boss 战', ['Boss ' + bossHp + ' / ' + (boss ? boss.maxHp : 1400), '阶段 ' + (game.boss.phase || 1), '开火并躲避弹幕']);
  if (game.player && game.player.dead) {
    endModeGame(game, false, '阵亡', 'Boss 战失败');
  }
}

/* ---------- LAN (browser sync lives in src/lan.js) ---------- */

function lanStart(game) {
  game.noRoundEnd = false;
  setupMatchEntities(game);
  startRound(game);
  const remoteTeam = game.lan && game.lan.remoteTeam ? game.lan.remoteTeam : game.opts.remoteTeam;
  if (remoteTeam) {
    const candidate = game.entities.find((e) => e.bot && e.team === remoteTeam);
    if (candidate) {
      candidate.netControlled = true;
      candidate.netRole = 'remote';
      candidate.name = game.lan.remoteName || 'LAN Player';
    }
  }
}

/* ---------- Editor ---------- */

function editorStart(game) {
  for (const k of ['br', 'rogue', 'boss', 'major', 'bossShots']) delete game[k];
  game.state = 'EDITOR';
  game.over = false;
  if (typeof window !== 'undefined' && window.__openMapEditor) window.__openMapEditor(game);
}

/* ---------- Cyber Cricket ---------- */

export const CYBER_ROSTER = [
  { id: 'iron', name: '\u94c1\u58f3\u87bf\u87bf', color: '#4d9bff', hp: 150, atk: 9, spd: 0.72, crit: 0.06, armor: 14, skill: { type: 'shield', name: '\u62a4\u76fe', desc: '\u5468\u671f\u6027\u52a0\u901f\u7532\u58f3' } },
  { id: 'neon', name: '\u9713\u8679\u87bf\u87bf', color: '#ff4d8d', hp: 110, atk: 12, spd: 0.98, crit: 0.16, armor: 5, skill: { type: 'burst', name: '\u8fc7\u8f7d', desc: '\u4e0b\u4e00\u51fb\u7206\u53d1\u8f93\u51fa' } },
  { id: 'sonic', name: '\u97f3\u6ce2\u87bf\u87bf', color: '#3dd6a0', hp: 118, atk: 10, spd: 1.08, crit: 0.10, armor: 4, skill: { type: 'stun', name: '\u9707\u8361', desc: '\u97f3\u6ce2\u6682\u505c\u5bf9\u624b' } },
  { id: 'volt', name: '\u78c1\u66b4\u87bf\u87bf', color: '#9b7bff', hp: 124, atk: 13, spd: 0.88, crit: 0.08, armor: 8, skill: { type: 'bleed', name: '\u8680\u7532', desc: '\u7535\u6d41\u8680\u4f24\u8fde\u7eed\u4f24\u5bb3' } },
  { id: 'venom', name: '\u6bd2\u96fe\u87bf\u87bf', color: '#7be36a', hp: 126, atk: 11, spd: 0.84, crit: 0.09, armor: 7, skill: { type: 'venom', name: '\u6bd2\u7259', desc: '\u76f4\u63a5\u7206\u53d1\u4f24\u5bb3\u5e76\u4e2d\u6bd2' } },
  { id: 'swift', name: '\u8fc5\u5f71\u87bf\u87bf', color: '#ffd75e', hp: 96, atk: 9, spd: 1.22, crit: 0.20, armor: 3, skill: { type: 'charge', name: '\u51b2\u649e', desc: '\u77ed\u65f6\u95f4\u5927\u5e45\u52a0\u901f' } },
  { id: 'armor', name: '\u91cd\u7532\u87bf\u87bf', color: '#c9a86b', hp: 158, atk: 8, spd: 0.66, crit: 0.05, armor: 18, skill: { type: 'shield', name: '\u94c1\u58c1', desc: '\u91cd\u53e0\u9632\u5fa1\u58f3' } },
  { id: 'ghost', name: '\u5e7d\u7075\u87bf\u87bf', color: '#a9b6c6', hp: 104, atk: 11, spd: 1.12, crit: 0.14, armor: 4, skill: { type: 'heal', name: '\u4fee\u590d', desc: '\u673a\u4f53\u81ea\u4fee\u56de\u590d\u8840\u91cf' } }
];

export function cyberChance(a, b) {
  const power = (s) => s.hp * 0.42 + s.atk * 0.32 + s.spd * 0.18 + s.crit * 1.5 + s.armor * 0.05;
  const pa = power(a), pb = power(b);
  return clamp(pa / (pa + pb), 0.2, 0.8);
}

export function cyberPayout(bet, chance) {
  return Math.max(1, Math.round(bet * (0.88 / Math.max(chance, 0.2))));
}

export function cyberCoins() {
  if (typeof localStorage === 'undefined') return 1000;
  try { return Math.max(0, Number(localStorage.getItem('cs2d_cricket_coins')) || 1000); } catch (err) { return 1000; }
}

export function cyberSetCoins(v) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem('cs2d_cricket_coins', String(Math.max(0, Math.floor(v)))); } catch (err) { /* no storage */ }
}

function cyberArenaRows() {
  const w = 84, h = 54;
  const grid = Array.from({ length: h }, () => Array(w).fill('.'));
  for (let x = 0; x < w; x++) { grid[0][x] = '#'; grid[h - 1][x] = '#'; }
  for (let y = 0; y < h; y++) { grid[y][0] = '#'; grid[y][w - 1] = '#'; }
  const boxes = [[22, 16], [60, 16], [40, 26], [20, 34], [62, 36], [34, 14], [52, 40]];
  for (const [bx, by] of boxes) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) grid[by + dy][bx + dx] = 'C';
  }
  grid[4][Math.floor(h / 2)] = 't';
  grid[h - 5][Math.floor(h / 2)] = 'c';
  grid[3][3] = 'a';
  grid[h - 4][w - 4] = 'b';
  return grid.map((r) => r.join(''));
}

function createCricket(stat, side, x, y) {
  const e = createEntity(side === 'right' ? 't' : 'ct', true);
  e.cricket = true;
  e.cricketStat = stat;
  e.color = stat.color;
  e.name = stat.name;
  e.hp = stat.hp;
  e.maxHp = stat.hp;
  e.baseArmor = stat.armor;
  e.armor = stat.armor;
  e.helmet = false;
  e.rad = 18;
  e.speed = stat.spd;
  e.atk = stat.atk;
  e.crit = stat.crit;
  e.x = x;
  e.y = y;
  e.angle = side === 'right' ? Math.PI : 0;
  e.attackCd = 0.4;
  e.skillT = 2 + rand() * 3;
  e.burstT = 0;
  e.bleedT = 0;
  e.chargeT = 0;
  e.shieldT = 0;
  e.slot = 'knife';
  e.customAI = cricketAI;
  return e;
}

function cricketAI(e, game, dt) {
  if (e.dead) return;
  e.attackCd = Math.max(0, e.attackCd - dt);
  e.skillT -= dt;
  if (e.bleedT > 0) {
    e.bleedT -= dt;
    if (rand() < dt * 0.9) {
      applyDamage(e, 1.5, { killer: null, weapon: 'knife', head: false }, game);
      spawnParticle(game, { kind: 'smokep', x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), life: 0.4, size: 5 });
    }
  }
  if (e.chargeT > 0) e.chargeT -= dt;
  if (e.shieldT > 0) {
    e.shieldT -= dt;
    if (e.shieldT <= 0) e.armor = e.baseArmor;
  }
  const t = game.entities.find((o) => o !== e && !o.dead && o.cricket);
  if (!t) return;
  const d = Math.hypot(t.x - e.x, t.y - e.y);
  const spd = 235 * e.speed * (e.chargeT > 0 ? 1.55 : 1);
  e.angle = angNorm(Math.atan2(t.y - e.y, t.x - e.x));
  if (e.stunT > 0) {
    e.vx = 0; e.vy = 0;
    return;
  }
  if (d > 60) {
    if (e.path === null || e.repathT <= 0) {
      pathTo(e, t.x, t.y);
      e.repathT = 0.7;
    }
    if (e.repathT > 0) e.repathT -= dt;
    const done = followPath(e, dt, spd);
    if (!done && e.path === null) {
      e.vx = Math.cos(e.angle) * spd;
      e.vy = Math.sin(e.angle) * spd;
    }
  } else {
    e.vx = 0; e.vy = 0;
    if (e.attackCd <= 0) {
      let dmg = e.atk + rand(0, 2);
      if (e.burstT > 0) { dmg *= 1.6; e.burstT = 0; }
      if (rand() < e.crit) dmg *= 1.8;
      applyDamage(t, dmg, { killer: e, weapon: 'knife', head: false }, game);
      spawnParticle(game, { kind: 'fire', x: t.x, y: t.y, vx: rand(-40, 40), vy: rand(-60, -20), life: 0.3, size: 4 });
      e.attackCd = clamp(1.25 - e.speed * 0.45, 0.45, 1.1);
    }
  }
  if (e.skillT <= 0) {
    e.skillT = 5 + rand() * 3;
    const skill = e.cricketStat.skill;
    if (skill.type === 'stun' && d < 150) t.stunT = Math.max(t.stunT || 0, 0.9);
    else if (skill.type === 'bleed' && d < 150) t.bleedT = 4;
    else if (skill.type === 'heal') { e.hp = Math.min(e.maxHp, e.hp + 12); spawnParticle(game, { kind: 'fire', x: e.x, y: e.y - 20, life: 0.5, size: 6 }); }
    else if (skill.type === 'burst') e.burstT = 2;
    else if (skill.type === 'charge') e.chargeT = 2;
    else if (skill.type === 'shield') { e.shieldT = 4; e.armor = e.baseArmor * 1.8; }
    else if (skill.type === 'venom' && d < 170) { applyDamage(t, 6, { killer: e, weapon: 'knife', head: false }, game); t.bleedT = 5; }
    if (game.cyber && game.cyber.events) {
      game.cyber.events.push({ t: Math.floor(game.cyber.time), name: e.name, skill: skill.name });
      if (game.cyber.events.length > 8) game.cyber.events.shift();
    }
    spawnParticle(game, { kind: 'boom', x: e.x, y: e.y, life: 0.35, size: 70 });
  }
}

export function cyberStart(game) {
  for (const k of ['br', 'rogue', 'boss', 'major', 'bossShots']) delete game[k];
  const opts = game.opts.cyber || {};
  let left = CYBER_ROSTER.find((c) => c.id === opts.leftId) || CYBER_ROSTER[0];
  let right = CYBER_ROSTER.find((c) => c.id === opts.rightId) || CYBER_ROSTER[1];
  if (left.id === right.id) right = CYBER_ROSTER[(CYBER_ROSTER.indexOf(left) + 1) % CYBER_ROSTER.length];
  registerMap({ id: 'cyber-arena', name: '\u8d5b\u535a\u6597\u87bf\u87bf\u7ade\u6280\u573a', accent: '#ffd75e', rows: cyberArenaRows() });
  loadMap(getMapDefSafe('cyber-arena'));
  repairGeneratedMap(game, 'cyber-arena');
  game.mapW = getMap().W;
  game.mapH = getMap().H;
  game.barrels = (getMap().barrels || []).map((b) => ({ ...b }));
  game.crates = (getMap().crates || []).map((c) => ({ ...c }));
  if (game.onMapChanged) game.onMapChanged(getMap());
  game.noRoundEnd = true;
  game.roundDur = 45;
  game.mapId = 'cyber-arena';
  game.opts.mapId = 'cyber-arena';
  game.state = 'LIVE';
  game.roundTime = 0;
  game.entities = [];
  game.player = { dead: true, kills: 0, deaths: 0, team: 'ct', name: '\u89c2\u4f17' };
  const chance = cyberChance(left, right);
  const coins = cyberCoins();
  const bet = clamp(Math.floor(Number(opts.bet) || 100), 1, coins);
  const side = opts.side === 'right' ? 'right' : 'left';
  cyberSetCoins(coins - bet);
  const T = mapTile();
  const lt = nearestWalkable(getMap().W * 0.16, getMap().H / 2) || { x: 4, y: 4 };
  const rt = nearestWalkable(getMap().W * 0.84, getMap().H / 2) || { x: getMap().w - 5, y: 4 };
  const a = createCricket(left, 'left', lt.x * T + T / 2, lt.y * T + T / 2);
  const b = createCricket(right, 'right', rt.x * T + T / 2, rt.y * T + T / 2);
  game.entities.push(a, b);
  game.camX = getMap().W / 2;
  game.camY = getMap().H / 2;
  game.cyber = { left, right, leftE: a, rightE: b, chance, bet, side, coinsStart: coins, time: 0, maxTime: 45, ended: false, events: [] };
  emit('toast', { text: '\u8d5b\u535a\u6597\u87bf\u87bf\u5f00\u8d5b\uff1a' + left.name + ' vs ' + right.name });
}

export function cyberUpdate(game, dt) {
  const c = game.cyber;
  if (!c || c.ended) return;
  c.time += dt;
  const a = c.leftE, b = c.rightE;
  const aPct = a.maxHp ? a.hp / a.maxHp : 0;
  const bPct = b.maxHp ? b.hp / b.maxHp : 0;
  if (a.dead || b.dead || c.time >= c.maxTime) {
    const leftWon = b.dead || (!a.dead && aPct >= bPct);
    const userWon = c.side === 'left' ? leftWon : !leftWon;
    const payout = userWon ? cyberPayout(c.bet, c.side === 'left' ? c.chance : 1 - c.chance) : 0;
    cyberSetCoins(cyberCoins() + payout);
    c.ended = true;
    const winner = leftWon ? a : b;
    const title = userWon ? '\u62bc\u6ce8\u547d\u4e2d' : '\u62bc\u6ce8\u843d\u7a7a';
    const sub = winner.name + ' \u83b7\u80dc ? ' + (payout > 0 ? '+' + payout : '\u635f\u5931 ' + c.bet) + ' \u87bf\u87bf\u5e01';
    endModeGame(game, userWon, title, sub);
    return;
  }
  const leftCoin = (c.side === 'left' ? 0.88 / c.chance : 0.88 / (1 - c.chance)).toFixed(2);
  const evLines = (c.events || []).slice(-3).map((x) => x.name + ' \u53d1\u52a8 ' + x.skill);
  setModeHud(game, '\u8d5b\u535a\u6597\u87bf\u87bf ? ' + Math.ceil(c.maxTime - c.time) + 's', [
    c.left.name + ' ' + Math.max(0, Math.ceil(a.hp)) + '/' + a.maxHp,
    c.right.name + ' ' + Math.max(0, Math.ceil(b.hp)) + '/' + b.maxHp,
    '\u62bc\u6ce8 ' + (c.side === 'left' ? c.left.name : c.right.name) + ' ? ' + c.bet + ' \u87bf\u87bf\u5e01',
    '\u8d54\u7387 ' + leftCoin + 'x',
    ...evLines
  ]);
}

/* ---------- Mode registration ---------- */

function getMapDefSafe(id) {
  return getMapDef(id) || { id, name: id, accent: '#aaa', rows: [] };
}

registerMode({
  id: 'classic', name: '经典爆破', desc: '标准 5v5 拆包', customBots: false
});
registerMode({
  id: 'major', name: 'Major 锦标赛', desc: '选队、打 Major、冲击冠军', customBots: false,
  start(game) {
    game.major = makeMajorState(game.opts.teamMajor || 'g2');
    game.state = 'MAJOR';
    game.over = false;
    hideModeHud();
    if (game.ui) game.ui.hideMenu();
  },
  update(game) {
    if (game.major && game.state === 'MAJOR') renderMajorPanel(game);
    if (game.major && game.major.stage === 'match' && game.over) {
      const st = game.major;
      if (st.currentMatch && !st.currentMatch.played) {
        const p = game.player;
        const won = p && p.team && (st.currentMatch.a.id === st.user.id || st.currentMatch.b.id === st.user.id);
        st.lastResult = won;
      }
    }
  }
});
registerMode({
  id: 'br', name: '大逃杀', desc: 'PUBG 式缩圈生存', customBots: true,
  start: brModeStart, update: brUpdate
});
registerMode({
  id: 'rogue', name: '肉鸽地下城', desc: '随机地图、枪械、词条', customBots: true,
  start: rogueStart, update: rogueUpdate
});
registerMode({
  id: 'boss', name: 'Boss 战', desc: '弹幕、召唤、二阶段', customBots: true,
  start: bossStart, update: bossUpdate
});
registerMode({
  id: 'cyber', name: '\u8d5b\u535a\u6597\u87bf\u87bf', desc: '\u4e0b\u6ce8\u89c2\u6218\u673a\u5668\u4eba', customBots: true,
  start: cyberStart, update: cyberUpdate
});

registerMode({
  id: 'lan', name: '局域网对战', desc: '双人同图局域网', customBots: false,
  start: lanStart
});
registerMode({
  id: 'editor', name: '地图编辑', desc: '绘制并试玩自定义地图', customBots: false,
  start: editorStart
});

export { MAJOR_TEAMS };

