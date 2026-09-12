import {registerMode, registerMap, getMapDef, MODE_MAPS} from './registry.js';
import {loadMap, getMap, nearestWalkable, tileAt, los, pathTo, followPath} from './map.js';
import {createEntity, weaponDef, defaultPistol} from './entities.js';
import {fireWeapon, finishReload, applyDamage} from './combat.js';
import {setupMatchEntities, startRound, spawnParticle, setCustomBotsUpdater, endRound} from './game.js';
import {TILE, WEAPONS, ROUND} from './config.js';
import { createBuilder, buildForge, buildAtrium, buildHarbor } from './map-gen.js';
import {hellMix} from './ai/tactics.js';
import {ctx, seedWorld} from './ctx.js';
import {clamp, rand, angNorm} from './utils.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
const mapTile = () => getMap()?.tile || TILE;


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

/* ---------- Major (2026.8 真实数据 + IEM Cologne 2026 赛制) ---------- */

// 48 队：VRS 排名（按 rating 降序）；阵容/评分同步 HLTV 2026-08 世界排名
const MAJOR_TEAMS = [
  { id: 'spirit', name: 'Team Spirit', tag: 'Spirit', region: '欧洲/独联体', style: '高速协同+超级明星枪法', rating: 97, players: [
    { name: 'donk', role: '突破', aim: 99, movement: 93, clutch: 92, nade: 83 },
    { name: 'sh1ro', role: '狙击', aim: 93, movement: 87, clutch: 90, nade: 75 },
    { name: 'magixx', role: '指挥', aim: 79, movement: 80, clutch: 78, nade: 89 },
    { name: 'zont1x', role: '步枪', aim: 87, movement: 85, clutch: 83, nade: 80 },
    { name: 'tN1R', role: '步枪', aim: 84, movement: 82, clutch: 79, nade: 83 } ] },
  { id: 'falcons', name: 'Team Falcons', tag: 'FLC', region: '欧洲', style: '体系指挥+双核顶级火力', rating: 96, players: [
    { name: 'NiKo', role: '突破', aim: 95, movement: 90, clutch: 88, nade: 82 },
    { name: 'm0NESY', role: '狙击', aim: 96, movement: 86, clutch: 92, nade: 74 },
    { name: 'karrigan', role: '指挥', aim: 78, movement: 70, clutch: 82, nade: 90 },
    { name: 'TeSeS', role: '步枪', aim: 84, movement: 78, clutch: 80, nade: 84 },
    { name: 'kyousuke', role: '步枪', aim: 86, movement: 85, clutch: 78, nade: 75 } ] },
  { id: 'vitality', name: 'Team Vitality', tag: 'VIT', region: '欧洲（法国）', style: '快节奏主动控图+ZywOo 兜底', rating: 94, players: [
    { name: 'ZywOo', role: '狙击', aim: 99, movement: 96, clutch: 97, nade: 86 },
    { name: 'ropz', role: '自由人', aim: 92, movement: 91, clutch: 91, nade: 87 },
    { name: 'flameZ', role: '突破', aim: 92, movement: 88, clutch: 88, nade: 81 },
    { name: 'apEX', role: '指挥', aim: 79, movement: 81, clutch: 83, nade: 90 },
    { name: 'mezii', role: '步枪', aim: 82, movement: 82, clutch: 80, nade: 89 } ] },
  { id: 'furia', name: 'FURIA Esports', tag: 'FURIA', region: '巴西', style: '巴西式高速侵略+激进前压', rating: 94, players: [
    { name: 'KSCERATO', role: '步枪', aim: 94, movement: 90, clutch: 88, nade: 83 },
    { name: 'yuurih', role: '步枪', aim: 93, movement: 89, clutch: 90, nade: 84 },
    { name: 'YEKINDAR', role: '自由人', aim: 90, movement: 91, clutch: 82, nade: 80 },
    { name: 'FalleN', role: '指挥/狙击', aim: 82, movement: 78, clutch: 84, nade: 88 },
    { name: 'molodoy', role: '补枪', aim: 85, movement: 82, clutch: 78, nade: 76 } ] },
  { id: 'mouz', name: 'MOUZ', tag: 'MOUZ', region: '欧洲（德国）', style: '青训体系高速协同', rating: 93, players: [
    { name: 'Spinx', role: '突破', aim: 90, movement: 86, clutch: 85, nade: 78 },
    { name: 'xertioN', role: '指挥', aim: 86, movement: 85, clutch: 81, nade: 84 },
    { name: 'torzsi', role: '狙击', aim: 88, movement: 85, clutch: 83, nade: 74 },
    { name: 'xelex', role: '步枪', aim: 84, movement: 82, clutch: 79, nade: 76 },
    { name: 'PR', role: '补枪', aim: 83, movement: 80, clutch: 78, nade: 77 } ] },
  { id: 'navi', name: 'Natus Vincere', tag: 'NAVI', region: '欧洲（乌克兰）', style: '慢控图+体系化纪律执行', rating: 92, players: [
    { name: 'b1t', role: '补枪', aim: 96, movement: 90, clutch: 88, nade: 85 },
    { name: 'w0nderful', role: '狙击', aim: 88, movement: 85, clutch: 81, nade: 73 },
    { name: 'iM', role: '突破', aim: 86, movement: 84, clutch: 83, nade: 80 },
    { name: 'Aleksib', role: '指挥', aim: 77, movement: 79, clutch: 76, nade: 93 },
    { name: 'makazze', role: '步枪', aim: 85, movement: 83, clutch: 79, nade: 78 } ] },
  { id: 'aurora', name: 'Aurora', tag: 'AUR', region: '欧洲（土耳其核心）', style: '土耳其火力流+激进主狙', rating: 91, players: [
    { name: 'XANTARES', role: '突破', aim: 92, movement: 87, clutch: 84, nade: 76 },
    { name: 'woxic', role: '狙击', aim: 88, movement: 82, clutch: 80, nade: 72 },
    { name: 'kyxsan', role: '指挥', aim: 78, movement: 68, clutch: 80, nade: 90 },
    { name: 'Jimpphat', role: '步枪', aim: 85, movement: 78, clutch: 82, nade: 80 },
    { name: 'Wicadia', role: '补枪', aim: 83, movement: 80, clutch: 78, nade: 76 } ] },
  { id: 'g2', name: 'G2 Esports', tag: 'G2', region: '欧洲（德国）', style: '明星枪法+快节奏对枪', rating: 90, players: [
    { name: 'HeavyGod', role: '突破', aim: 91, movement: 87, clutch: 85, nade: 77 },
    { name: 'NertZ', role: '步枪', aim: 88, movement: 85, clutch: 83, nade: 78 },
    { name: 'r1nkle', role: '狙击', aim: 85, movement: 83, clutch: 80, nade: 73 },
    { name: 'matys', role: '步枪', aim: 84, movement: 82, clutch: 80, nade: 76 },
    { name: 'huNter-', role: '指挥', aim: 79, movement: 81, clutch: 81, nade: 89 } ] },
  { id: 'faze', name: 'FaZe Clan', tag: 'FaZe', region: '欧洲（国际）', style: '重建期强个人能力', rating: 89, players: [
    { name: 'Twistzz', role: '指挥', aim: 90, movement: 87, clutch: 88, nade: 85 },
    { name: 'frozen', role: '步枪', aim: 89, movement: 86, clutch: 85, nade: 82 },
    { name: 'jcobbb', role: '突破', aim: 84, movement: 82, clutch: 80, nade: 77 },
    { name: 'JBOEN', role: '狙击', aim: 82, movement: 78, clutch: 76, nade: 71 },
    { name: 'Neityu', role: '步枪', aim: 83, movement: 81, clutch: 79, nade: 76 } ] },
  { id: 'mongolz', name: 'The MongolZ', tag: 'MongolZ', region: '蒙古', style: '亚洲高速协同+转点极快', rating: 88, players: [
    { name: '910', role: '狙击', aim: 90, movement: 85, clutch: 86, nade: 76 },
    { name: 'Techno4K', role: '步枪', aim: 91, movement: 87, clutch: 84, nade: 80 },
    { name: 'bLitz', role: '指挥', aim: 80, movement: 77, clutch: 79, nade: 84 },
    { name: 'Tikuak', role: '步枪', aim: 84, movement: 80, clutch: 77, nade: 75 },
    { name: 'DarkMeister', role: '步枪', aim: 82, movement: 79, clutch: 75, nade: 74 } ] },
  { id: 'astralis', name: 'Astralis', tag: 'Astralis', region: '丹麦', style: '体系化地图控制', rating: 88, players: [
    { name: 'jabbi', role: '步枪', aim: 90, movement: 86, clutch: 87, nade: 82 },
    { name: 'Staehr', role: '步枪', aim: 86, movement: 84, clutch: 82, nade: 80 },
    { name: 'phzy', role: '狙击', aim: 84, movement: 80, clutch: 78, nade: 75 },
    { name: 'ryu', role: '步枪', aim: 83, movement: 82, clutch: 80, nade: 78 },
    { name: 'HooXi', role: '指挥', aim: 76, movement: 78, clutch: 80, nade: 90 } ] },
  { id: 'pain', name: 'paiN Gaming', tag: 'paiN', region: '巴西', style: '稳扎稳打+道具严谨', rating: 87, players: [
    { name: 'biguzera', role: '指挥', aim: 83, movement: 80, clutch: 88, nade: 90 },
    { name: 'saffee', role: '狙击', aim: 87, movement: 80, clutch: 80, nade: 76 },
    { name: 'snow', role: '步枪', aim: 85, movement: 83, clutch: 80, nade: 80 },
    { name: 'v$m', role: '步枪', aim: 83, movement: 82, clutch: 78, nade: 78 },
    { name: 'piriajr', role: '步枪', aim: 82, movement: 80, clutch: 76, nade: 76 } ] },
  { id: '9z', name: '9z Team', tag: '9z', region: '南美（乌拉圭）', style: '南美快节奏进攻流', rating: 86, players: [
    { name: 'dgt', role: '狙击', aim: 85, movement: 81, clutch: 82, nade: 77 },
    { name: 'luchov', role: '步枪', aim: 82, movement: 80, clutch: 81, nade: 76 },
    { name: 'HUASOPEEK', role: '突破', aim: 81, movement: 83, clutch: 80, nade: 74 },
    { name: 'max', role: '指挥', aim: 80, movement: 78, clutch: 79, nade: 84 },
    { name: 'meyern', role: '步枪', aim: 79, movement: 78, clutch: 77, nade: 75 } ] },
  { id: 'betboom', name: 'BetBoom Team', tag: 'BetBoom', region: '俄罗斯', style: '俄式火力体系', rating: 86, players: [
    { name: 'zorte', role: '狙击', aim: 87, movement: 78, clutch: 80, nade: 75 },
    { name: 'Magnojez', role: '步枪', aim: 83, movement: 79, clutch: 77, nade: 74 },
    { name: 'Boombl4', role: '指挥', aim: 82, movement: 74, clutch: 81, nade: 89 },
    { name: 'd1Ledez', role: '步枪', aim: 81, movement: 76, clutch: 75, nade: 76 },
    { name: 's1ren', role: '补枪', aim: 80, movement: 74, clutch: 76, nade: 78 } ] },
  { id: 'b8', name: 'B8', tag: 'B8', region: '乌克兰', style: '全乌班年轻火力流', rating: 84, players: [
    { name: 's1zzi', role: '狙击', aim: 88, movement: 76, clutch: 84, nade: 73 },
    { name: 'npl', role: '步枪', aim: 82, movement: 78, clutch: 79, nade: 77 },
    { name: 'alex666', role: '指挥', aim: 80, movement: 73, clutch: 80, nade: 88 },
    { name: 'kensizor', role: '步枪', aim: 81, movement: 76, clutch: 74, nade: 75 },
    { name: 'esenthial', role: '补枪', aim: 80, movement: 75, clutch: 75, nade: 76 } ] },
  { id: 'legacy', name: 'Legacy', tag: 'LG', region: '巴西', style: 'arT 激进指挥+高首杀率', rating: 84, players: [
    { name: 'dumau', role: '步枪', aim: 82, movement: 80, clutch: 80, nade: 78 },
    { name: 'latto', role: '步枪', aim: 82, movement: 79, clutch: 79, nade: 77 },
    { name: 'arT', role: '指挥', aim: 81, movement: 82, clutch: 80, nade: 84 },
    { name: 'try', role: '突破', aim: 80, movement: 81, clutch: 78, nade: 74 },
    { name: 'n1ssim', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 76 } ] },
  { id: 'parivision', name: 'PARIVISION', tag: 'PV', region: '独联体', style: 'Jame 体系慢节奏控图', rating: 83, players: [
    { name: 'Jame', role: '指挥/狙击', aim: 85, movement: 78, clutch: 90, nade: 92 },
    { name: 'FL1T', role: '突破', aim: 85, movement: 84, clutch: 82, nade: 75 },
    { name: 'xiELO', role: '步枪', aim: 80, movement: 79, clutch: 78, nade: 76 },
    { name: 'zweih', role: '步枪', aim: 79, movement: 78, clutch: 75, nade: 78 },
    { name: 'slaxejezzz', role: '步枪', aim: 78, movement: 77, clutch: 76, nade: 75 } ] },
  { id: 'liquid', name: 'Team Liquid', tag: 'Liquid', region: '北美', style: '老将经验型中速控图', rating: 83, players: [
    { name: 'EliGE', role: '步枪', aim: 92, movement: 88, clutch: 88, nade: 86 },
    { name: 'NAF', role: '步枪', aim: 90, movement: 86, clutch: 91, nade: 87 },
    { name: 'malbsMd', role: '突破', aim: 90, movement: 89, clutch: 84, nade: 80 },
    { name: 'Jorko', role: '狙击', aim: 84, movement: 82, clutch: 78, nade: 74 },
    { name: 'JT', role: '指挥', aim: 78, movement: 76, clutch: 79, nade: 85 } ] },
  { id: 'gl', name: 'GamerLegion', tag: 'GL', region: '欧洲', style: '老将指挥+年轻火力', rating: 81, players: [
    { name: 'hypex', role: '狙击', aim: 86, movement: 79, clutch: 88, nade: 74 },
    { name: 'FL4MUS', role: '突破', aim: 84, movement: 86, clutch: 72, nade: 72 },
    { name: 'REZ', role: '自由人', aim: 83, movement: 84, clutch: 78, nade: 79 },
    { name: 'Snax', role: '指挥', aim: 80, movement: 74, clutch: 82, nade: 90 },
    { name: 'Tauson', role: '补枪', aim: 80, movement: 76, clutch: 82, nade: 74 } ] },
  { id: 'mibr', name: 'MIBR', tag: 'MIBR', region: '巴西', style: '激进突破+乱战节奏', rating: 81, players: [
    { name: 'nqz', role: '狙击', aim: 87, movement: 84, clutch: 84, nade: 76 },
    { name: 'insani', role: '突破', aim: 86, movement: 84, clutch: 82, nade: 78 },
    { name: 'LNZ', role: '指挥', aim: 84, movement: 80, clutch: 82, nade: 85 },
    { name: 'brnz4n', role: '步枪', aim: 82, movement: 80, clutch: 82, nade: 80 },
    { name: 'venomzera', role: '步枪', aim: 81, movement: 80, clutch: 76, nade: 76 } ] },
  { id: '3dmax', name: '3DMAX', tag: '3DMAX', region: '法国', style: '结构化纪律型+道具严谨', rating: 80, players: [
    { name: 'Lucky', role: '狙击', aim: 86, movement: 73, clutch: 76, nade: 75 },
    { name: 'misutaaa', role: '自由人', aim: 82, movement: 79, clutch: 81, nade: 80 },
    { name: 'Kursy', role: '突破', aim: 80, movement: 84, clutch: 75, nade: 72 },
    { name: 'Maka', role: '指挥', aim: 78, movement: 75, clutch: 79, nade: 87 },
    { name: 'Graviti', role: '补枪', aim: 78, movement: 72, clutch: 74, nade: 82 } ] },
  { id: 'heroic', name: 'HEROIC', tag: 'Heroic', region: '欧洲（北欧）', style: '北欧纪律型控图', rating: 79, players: [
    { name: 'nilo', role: '步枪', aim: 90, movement: 86, clutch: 84, nade: 80 },
    { name: 'Brollan', role: '步枪', aim: 90, movement: 87, clutch: 82, nade: 80 },
    { name: 'susp', role: '步枪', aim: 86, movement: 82, clutch: 80, nade: 78 },
    { name: 'Martinez', role: '步枪', aim: 86, movement: 84, clutch: 76, nade: 76 },
    { name: 'Chr1zN', role: '指挥', aim: 80, movement: 76, clutch: 80, nade: 84 } ] },
  { id: 'nip', name: 'Ninjas in Pyjamas', tag: 'NIP', region: '欧洲（瑞典）', style: '北欧纪律体系', rating: 79, players: [
    { name: 'stavn', role: '步枪', aim: 88, movement: 84, clutch: 85, nade: 78 },
    { name: 'xKacpersky', role: '狙击', aim: 85, movement: 80, clutch: 80, nade: 70 },
    { name: 'sjuush', role: '步枪', aim: 82, movement: 76, clutch: 80, nade: 85 },
    { name: 'n0te', role: '步枪', aim: 82, movement: 78, clutch: 76, nade: 76 },
    { name: 'Snappi', role: '指挥', aim: 76, movement: 65, clutch: 78, nade: 90 } ] },
  { id: 'big', name: 'BIG', tag: 'BIG', region: '德国', style: '学院派纪律体系', rating: 78, players: [
    { name: 'blameF', role: '步枪', aim: 89, movement: 82, clutch: 88, nade: 84 },
    { name: 'gr1ks', role: '狙击', aim: 85, movement: 78, clutch: 80, nade: 70 },
    { name: 'faveN', role: '步枪', aim: 82, movement: 78, clutch: 80, nade: 76 },
    { name: 'JDC', role: '步枪', aim: 81, movement: 76, clutch: 78, nade: 78 },
    { name: 'tabseN', role: '指挥', aim: 78, movement: 70, clutch: 82, nade: 88 } ] },
  { id: 'tyloo', name: 'TYLOO', tag: 'TYLOO', region: '中国', style: '中国枪男队+快速默认', rating: 77, players: [
    { name: 'Jee', role: '狙击', aim: 85, movement: 80, clutch: 79, nade: 78 },
    { name: 'Mercury', role: '步枪', aim: 84, movement: 82, clutch: 83, nade: 77 },
    { name: 'Moseyuh', role: '突破', aim: 82, movement: 84, clutch: 79, nade: 76 },
    { name: 'JamYoung', role: '指挥', aim: 82, movement: 76, clutch: 80, nade: 86 },
    { name: 'Zero', role: '步枪', aim: 80, movement: 79, clutch: 76, nade: 75 } ] },
  { id: 'eyeballers', name: 'EYEBALLERS', tag: 'EYE', region: '瑞典', style: '老将经验流', rating: 77, players: [
    { name: 'KRIMZ', role: '步枪', aim: 84, movement: 80, clutch: 85, nade: 80 },
    { name: 'maxster', role: '步枪', aim: 83, movement: 76, clutch: 77, nade: 80 },
    { name: 'JW', role: '指挥', aim: 78, movement: 76, clutch: 80, nade: 86 },
    { name: 'Ro1f', role: '步枪', aim: 79, movement: 74, clutch: 74, nade: 74 },
    { name: 'dex', role: '步枪', aim: 79, movement: 73, clutch: 73, nade: 75 } ] },
  { id: 'efire', name: 'Eternal Fire', tag: 'EF', region: '土耳其', style: '重建期个人枪法驱动', rating: 76, players: [
    { name: 'jottAAA', role: '突破', aim: 86, movement: 83, clutch: 78, nade: 76 },
    { name: 'regali', role: '狙击', aim: 84, movement: 80, clutch: 79, nade: 72 },
    { name: 'Kvem', role: '步枪', aim: 84, movement: 81, clutch: 77, nade: 74 },
    { name: 'br0', role: '补枪', aim: 82, movement: 78, clutch: 80, nade: 82 },
    { name: 'MisteM', role: '指挥', aim: 78, movement: 74, clutch: 78, nade: 84 } ] },
  { id: '100t', name: '100 Thieves', tag: '100T', region: '北美', style: '国际纵队+顶级主狙', rating: 75, players: [
    { name: 'device', role: '狙击', aim: 93, movement: 82, clutch: 92, nade: 78 },
    { name: 'rain', role: '突破', aim: 85, movement: 86, clutch: 82, nade: 80 },
    { name: 'Gizmy', role: '步枪', aim: 80, movement: 76, clutch: 74, nade: 75 },
    { name: 'poiii', role: '步枪', aim: 78, movement: 76, clutch: 74, nade: 74 },
    { name: 'sirah', role: '指挥', aim: 76, movement: 68, clutch: 78, nade: 88 } ] },
  { id: 'vp', name: 'Virtus.pro', tag: 'VP', region: '独联体', style: '重建期纪律性传统', rating: 75, players: [
    { name: 'b1st', role: '狙击', aim: 84, movement: 82, clutch: 78, nade: 74 },
    { name: 'tO0RO', role: '步枪', aim: 82, movement: 80, clutch: 78, nade: 76 },
    { name: 'mir', role: '指挥', aim: 81, movement: 78, clutch: 80, nade: 87 },
    { name: 'AquaRS', role: '步枪', aim: 80, movement: 78, clutch: 76, nade: 75 },
    { name: 'F0R3VER', role: '步枪', aim: 80, movement: 78, clutch: 76, nade: 75 } ] },
  { id: 'lynnvision', name: 'Lynn Vision', tag: 'LVG', region: '中国', style: '体系化战术纪律', rating: 73, players: [
    { name: 'z4KR', role: '自由人', aim: 84, movement: 80, clutch: 82, nade: 78 },
    { name: 'Starry', role: '步枪', aim: 82, movement: 81, clutch: 79, nade: 76 },
    { name: 'EmiliaQAQ', role: '突破', aim: 80, movement: 84, clutch: 77, nade: 74 },
    { name: 'Westmelon', role: '指挥', aim: 79, movement: 74, clutch: 80, nade: 85 },
    { name: 'C4LLM3SU3', role: '步枪', aim: 80, movement: 78, clutch: 78, nade: 77 } ] },
  { id: 'fnatic', name: 'Fnatic', tag: 'Fnatic', region: '欧洲（乌克兰）', style: '重建期年轻化', rating: 73, players: [
    { name: 'jambo', role: '步枪', aim: 84, movement: 82, clutch: 80, nade: 78 },
    { name: 'jackasmo', role: '步枪', aim: 82, movement: 80, clutch: 78, nade: 76 },
    { name: 'fEAR', role: '指挥', aim: 78, movement: 76, clutch: 80, nade: 84 },
    { name: 'cairne', role: '步枪', aim: 80, movement: 78, clutch: 76, nade: 75 },
    { name: 'mazay', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 75 } ] },
  { id: 'm80', name: 'M80', tag: 'M80', region: '北美（美国）', style: '纪律型团队+稳守反击', rating: 72, players: [
    { name: 'slaxz-', role: '狙击', aim: 84, movement: 80, clutch: 82, nade: 77 },
    { name: 'Swisher', role: '突破', aim: 81, movement: 84, clutch: 80, nade: 75 },
    { name: 's1n', role: '指挥', aim: 80, movement: 78, clutch: 79, nade: 85 },
    { name: 'Lake', role: '步枪', aim: 80, movement: 79, clutch: 78, nade: 76 },
    { name: 'JBa', role: '步枪', aim: 79, movement: 77, clutch: 77, nade: 77 } ] },
  { id: 'sashi', name: 'Sashi', tag: 'Sashi', region: '丹麦', style: '全丹班战术型', rating: 71, players: [
    { name: 'acoR', role: '狙击', aim: 87, movement: 78, clutch: 80, nade: 74 },
    { name: 'Zyphon', role: '步枪', aim: 81, movement: 79, clutch: 78, nade: 75 },
    { name: 'Cabbi', role: '指挥', aim: 79, movement: 77, clutch: 79, nade: 85 },
    { name: 'Anlelele', role: '步枪', aim: 80, movement: 75, clutch: 76, nade: 76 },
    { name: 'MistR', role: '步枪', aim: 80, movement: 76, clutch: 78, nade: 75 } ] },
  { id: 'nine', name: '9INE', tag: '9INE', region: '欧洲', style: '步枪推进体系', rating: 71, players: [
    { name: 'rim3', role: '突破', aim: 85, movement: 87, clutch: 70, nade: 76 },
    { name: 'b1elany', role: '补枪', aim: 81, movement: 74, clutch: 80, nade: 74 },
    { name: 'raalz', role: '指挥', aim: 79, movement: 73, clutch: 79, nade: 87 },
    { name: 'kraghen', role: '步枪', aim: 80, movement: 75, clutch: 76, nade: 75 },
    { name: 'Flayy', role: '步枪', aim: 80, movement: 75, clutch: 74, nade: 75 } ] },
  { id: 'bcg', name: 'BC.Game', tag: 'BCG', region: '欧洲/国际', style: '银河战舰磨合期', rating: 70, players: [
    { name: 's1mple', role: '狙击', aim: 97, movement: 90, clutch: 96, nade: 78 },
    { name: 'electroNic', role: '指挥', aim: 84, movement: 76, clutch: 85, nade: 89 },
    { name: 'Magisk', role: '自由人', aim: 84, movement: 74, clutch: 82, nade: 86 },
    { name: 'Senzu', role: '突破', aim: 84, movement: 83, clutch: 78, nade: 76 },
    { name: 'mzinho', role: '步枪', aim: 82, movement: 79, clutch: 78, nade: 78 } ] },
  { id: 'metizport', name: 'Metizport', tag: 'Metizport', region: '欧洲', style: '国际纵队重建', rating: 69, players: [
    { name: 'forsyy', role: '狙击', aim: 86, movement: 76, clutch: 74, nade: 73 },
    { name: 'F1KU', role: '步枪', aim: 82, movement: 75, clutch: 75, nade: 76 },
    { name: 'Plopski', role: '步枪', aim: 81, movement: 78, clutch: 76, nade: 74 },
    { name: 'MaiL09', role: '补枪', aim: 80, movement: 76, clutch: 77, nade: 73 },
    { name: 'stanislaw', role: '指挥', aim: 76, movement: 71, clutch: 78, nade: 86 } ] },
  { id: 'wildcard', name: 'Wildcard', tag: 'WC', region: '北美（美国）', style: '枪法型打乱战', rating: 69, players: [
    { name: 'Cxzi', role: '狙击', aim: 85, movement: 81, clutch: 82, nade: 76 },
    { name: 'HexT', role: '突破', aim: 80, movement: 84, clutch: 78, nade: 74 },
    { name: 'nEMANHA', role: '指挥', aim: 78, movement: 76, clutch: 78, nade: 84 },
    { name: 'reck', role: '步枪', aim: 79, movement: 78, clutch: 77, nade: 75 },
    { name: 'mhL', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 75 } ] },
  { id: 'sangal', name: 'Sangal Esports', tag: 'Sangal', region: '欧洲', style: '重建期青训+新援', rating: 68, players: [
    { name: 'R4DYX', role: '狙击', aim: 87, movement: 80, clutch: 76, nade: 73 },
    { name: 'bnox', role: '步枪', aim: 81, movement: 77, clutch: 74, nade: 78 },
    { name: 'puuha', role: '指挥', aim: 76, movement: 72, clutch: 78, nade: 87 },
    { name: 'Joey', role: '步枪', aim: 78, movement: 74, clutch: 72, nade: 74 },
    { name: 'adamS', role: '步枪', aim: 77, movement: 73, clutch: 73, nade: 75 } ] },
  { id: 'nrg', name: 'NRG Esports', tag: 'NRG', region: '北美', style: '结构化慢节奏默认', rating: 68, players: [
    { name: 'hallzerk', role: '狙击', aim: 86, movement: 78, clutch: 81, nade: 74 },
    { name: 'Jeorge', role: '步枪', aim: 82, movement: 80, clutch: 76, nade: 73 },
    { name: 'Sonic', role: '突破', aim: 80, movement: 81, clutch: 71, nade: 76 },
    { name: 'Grim', role: '步枪', aim: 79, movement: 77, clutch: 70, nade: 75 },
    { name: 'nitr0', role: '指挥', aim: 76, movement: 79, clutch: 73, nade: 86 } ] },
  { id: 'nemiga', name: 'Nemiga', tag: 'NM', region: '独联体', style: '年轻化快节奏对枪', rating: 66, players: [
    { name: 'syph0', role: '狙击', aim: 86, movement: 82, clutch: 84, nade: 78 },
    { name: 'KaiR0N-', role: '突破', aim: 81, movement: 82, clutch: 79, nade: 74 },
    { name: 'khaN', role: '指挥', aim: 78, movement: 76, clutch: 80, nade: 85 },
    { name: 'sowalio', role: '步枪', aim: 79, movement: 78, clutch: 77, nade: 76 },
    { name: 'robo', role: '步枪', aim: 76, movement: 77, clutch: 74, nade: 73 } ] },
  { id: 'imperial', name: 'Imperial', tag: 'IMP', region: '巴西', style: '老将带新秀阵地战', rating: 66, players: [
    { name: 'chelo', role: '狙击', aim: 84, movement: 80, clutch: 80, nade: 76 },
    { name: 'decenty', role: '步枪', aim: 81, movement: 79, clutch: 79, nade: 76 },
    { name: 'noway', role: '步枪', aim: 80, movement: 80, clutch: 78, nade: 75 },
    { name: 'saadzin', role: '步枪', aim: 80, movement: 79, clutch: 78, nade: 76 },
    { name: 'VINI', role: '指挥', aim: 78, movement: 77, clutch: 77, nade: 84 } ] },
  { id: 'bestia', name: 'BESTIA', tag: 'BESTIA', region: '南美（阿根廷）', style: '南美年轻枪男', rating: 66, players: [
    { name: 'tomaszin', role: '突破', aim: 84, movement: 83, clutch: 81, nade: 77 },
    { name: 'cass1n', role: '步枪', aim: 81, movement: 79, clutch: 78, nade: 75 },
    { name: 'buda', role: '步枪', aim: 81, movement: 80, clutch: 78, nade: 76 },
    { name: 'timo', role: '步枪', aim: 80, movement: 79, clutch: 76, nade: 74 },
    { name: 'nacho', role: '步枪', aim: 79, movement: 77, clutch: 76, nade: 77 } ] },
  { id: 'fluxo', name: 'Fluxo', tag: 'FX', region: '巴西', style: '巴西快节奏+前期信息战', rating: 65, players: [
    { name: 'exit', role: '狙击', aim: 85, movement: 80, clutch: 83, nade: 77 },
    { name: 'kye', role: '突破', aim: 80, movement: 83, clutch: 78, nade: 75 },
    { name: 'zevy', role: '指挥', aim: 80, movement: 79, clutch: 78, nade: 84 },
    { name: 'dav1deuS', role: '步枪', aim: 80, movement: 79, clutch: 79, nade: 74 },
    { name: 'Ltz', role: '步枪', aim: 78, movement: 78, clutch: 75, nade: 74 } ] },
  { id: 'rareatom', name: 'Rare Atom', tag: 'RA', region: '中国', style: '体系化慢攻', rating: 65, players: [
    { name: 'L1haNg', role: '步枪', aim: 82, movement: 80, clutch: 79, nade: 76 },
    { name: 'chengking', role: '步枪', aim: 81, movement: 79, clutch: 78, nade: 75 },
    { name: 'Summer', role: '指挥', aim: 81, movement: 75, clutch: 79, nade: 85 },
    { name: '3gl', role: '步枪', aim: 81, movement: 78, clutch: 76, nade: 75 },
    { name: 'Trash', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 74 } ] },
  { id: 'onewin', name: '1WIN', tag: '1WIN', region: '俄罗斯', style: '俄式结构 CS 重组', rating: 63, players: [
    { name: 'Ax1Le', role: '狙击', aim: 87, movement: 76, clutch: 80, nade: 74 },
    { name: 'ArtFr0st', role: '突破', aim: 83, movement: 84, clutch: 79, nade: 74 },
    { name: 'BELCHONOKK', role: '步枪', aim: 81, movement: 77, clutch: 76, nade: 78 },
    { name: 'fame', role: '补枪', aim: 79, movement: 74, clutch: 78, nade: 82 },
    { name: 'nafany', role: '指挥', aim: 76, movement: 72, clutch: 77, nade: 86 } ] },
  { id: 'marsborne', name: 'Marsborne', tag: 'Marsborne', region: '北美', style: '年轻火力+快节奏前压', rating: 62, players: [
    { name: 'nicx', role: '狙击', aim: 85, movement: 77, clutch: 79, nade: 75 },
    { name: 'WUMBO', role: '步枪', aim: 81, movement: 79, clutch: 73, nade: 75 },
    { name: 'ogwizard', role: '步枪', aim: 80, movement: 80, clutch: 74, nade: 76 },
    { name: 'Grizz', role: '步枪', aim: 79, movement: 78, clutch: 72, nade: 74 },
    { name: 'freshie', role: '指挥', aim: 77, movement: 79, clutch: 75, nade: 85 } ] },
  { id: 'saw', name: 'SAW', tag: 'SAW', region: '葡萄牙', style: '葡式战术纪律流', rating: 56, players: [
    { name: 'NOPEEj', role: '狙击', aim: 85, movement: 74, clutch: 73, nade: 72 },
    { name: 'ewjerkz', role: '步枪', aim: 82, movement: 77, clutch: 77, nade: 78 },
    { name: 'story', role: '步枪', aim: 81, movement: 77, clutch: 79, nade: 80 },
    { name: 'krazy', role: '补枪', aim: 79, movement: 75, clutch: 76, nade: 81 },
    { name: 'MUTiRiS', role: '指挥', aim: 76, movement: 73, clutch: 78, nade: 87 } ] },
  { id: 'ence', name: 'ENCE', tag: 'ENCE', region: '芬兰', style: '芬兰青训新军', rating: 55, players: [
    { name: 'Cliqq', role: '狙击', aim: 83, movement: 78, clutch: 78, nade: 70 },
    { name: 'millert', role: '步枪', aim: 80, movement: 78, clutch: 74, nade: 74 },
    { name: 'teme', role: '步枪', aim: 80, movement: 77, clutch: 75, nade: 74 },
    { name: 'Schwarz', role: '步枪', aim: 80, movement: 76, clutch: 74, nade: 74 },
    { name: 'HENU', role: '指挥', aim: 76, movement: 66, clutch: 76, nade: 86 } ] }
];

// 比赛模拟函数钩子：默认概率模型（simSeries）；真实引擎测试/模拟可通过 setMajorSim 替换
let majorSimFn = null;
export function setMajorSim(fn) { majorSimFn = fn; }
function runSeries(a, b, bo) {
  if (majorSimFn) return majorSimFn(a, b, bo);
  return simSeries(a, b, bo);
}

// Major 自定义分组：纯函数、确定性、不依赖随机。返回分组结果，不修改入参。
// rule:
//   'seed'   （默认）按种子蛇形分组，等价于原固定分组（按 VRS rating 排序后的种子）
//   'region' 按地区分组（地区名稳定排序，组内按 rating 降序）
//   'custom' 用传入 customGroups 名单分组（每组为队伍 id 或队伍对象数组）
// opts.groupCount：seed 规则下的组数（默认 4），snake 蛇形填充保证组间均衡。
// 返回 { rule, groupCount, groups, placed, missing }
export function buildBracketGroups(players, rule, customGroups, opts = {}) {
  const count = Number.isInteger(opts.groupCount) && opts.groupCount > 0 ? opts.groupCount : 4;
  const byId = new Map();
  for (const t of players) byId.set(t.id, t);
  const normRule = rule === 'custom' ? 'custom' : (rule === 'region' ? 'region' : 'seed');
  const result = { rule: normRule, groupCount: count, groups: [], placed: [], missing: [] };
  const pushGroup = (group) => {
    result.groups.push(group);
    for (const t of group) result.placed.push(t.id);
  };
  if (normRule === 'custom') {
    const src = Array.isArray(customGroups) ? customGroups : [];
    const seen = new Set();
    for (const raw of src) {
      const items = Array.isArray(raw) ? raw : [raw];
      const group = [];
      for (const item of items) {
        const id = typeof item === 'string' ? item : (item && item.id);
        if (id == null || seen.has(id)) continue;
        const team = byId.get(id) || (item && typeof item === 'object' ? item : null);
        if (!team) continue;
        seen.add(id);
        group.push(team);
      }
      pushGroup(group);
    }
    for (const t of players) if (!seen.has(t.id)) result.missing.push(t.id);
  } else if (normRule === 'region') {
    const key = (t) => String(t.region || '未分配');
    const regions = [...new Set(players.map(key))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    for (const r of regions) {
      const group = players.filter((t) => key(t) === r)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      pushGroup(group);
    }
  } else {
    const sorted = players.slice().sort((a, b) => {
      const sa = a.seed != null && a.seed !== '' ? a.seed : Infinity;
      const sb = b.seed != null && b.seed !== '' ? b.seed : Infinity;
      if (sa !== sb) return sa - sb;
      if (a.rating != null && b.rating != null && a.rating !== b.rating) return b.rating - a.rating;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const groups = [];
    for (let i = 0; i < count; i++) groups.push([]);
    for (let i = 0; i < sorted.length; i++) {
      const row = Math.floor(i / count);
      const col = row % 2 === 0 ? i % count : count - 1 - (i % count);
      groups[col].push(sorted[i]);
    }
    for (const g of groups) pushGroup(g);
  }
  return result;
}

// 解析自定义分组名单文本（每行一组，组内用逗号/分号/空白分隔队伍 id），确定性纯函数
export function parseCustomGroupList(text) {
  if (typeof text !== 'string') return [];
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => line.split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean));
}

function makeMajorState(teamId, groupCfg) {
  const teams = MAJOR_TEAMS.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p })) }))
    .sort((a, b) => b.rating - a.rating)
    .map((t, i) => ({ ...t, seed: i + 1 }));
  const user = teams.find((t) => t.id === teamId) || teams[0];
  const grouping = buildBracketGroups(teams, groupCfg && groupCfg.rule, groupCfg && groupCfg.customGroups, { groupCount: groupCfg && groupCfg.groupCount });
  const groupOf = {};
  grouping.groups.forEach((g, gi) => { for (const t of g) groupOf[t.id] = gi; });
  return {
    stage: 'qualifier', // qualifier -> s1 -> s2 -> s3 -> playoff（双败制）
    qual: makeSwiss(teams.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), '积分赛'),
    s1: null, s2: null, s3: null, playoff: null,
    grouping, groupOf,
    user, wins: 0, losses: 0, champion: null, lastResult: null, currentMatch: null, series: null
  };
}

// 48 队预选（积分瑞士轮，5 轮取前 32）→ 正赛三阶段（同步 IEM Cologne Major 2026）
// 瑞士轮: 同战绩池按 rating 相邻配对; 3 胜晋级 3 负淘汰（s1/s2/s3）
function makeSwiss(entries, label) {
  return { label, teams: entries, round: 0, rounds: [], done: false };
}

function swissPairUp(pool) {
  pool.sort((a, b) => b.team.rating - a.team.rating);
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue;
    let j = i + 1;
    while (j < pool.length && (used.has(j) || pool[i].opps.includes(pool[j].team.id))) j++;
    if (j >= pool.length) {
      // 池内找不到新对手：与任意未配者强制配对（允许重赛，避免奇数残留卡死）
      j = i + 1;
      while (j < pool.length && used.has(j)) j++;
      if (j < pool.length) { used.add(i); used.add(j); pairs.push([pool[i], pool[j]]); }
      continue;
    }
    used.add(i); used.add(j);
    pairs.push([pool[i], pool[j]]);
  }
  return { pairs, leftovers: pool.filter((_, i) => !used.has(i)) };
}

// 瑞士轮配对：同战绩池内优先；配不上的顺延到相邻战绩池（保证每轮全部配完）
function buildPairings(sw) {
  let carry = [];
  const all = [];
  const maxW = Math.min(sw.round - 1, 2);
  for (let w = maxW; w >= 0; w--) {
    const rec = [w, sw.round - 1 - w];
    const pool = carry.concat(sw.teams.filter((t) => t.status === 'in' && t.wins === rec[0] && t.losses === rec[1]));
    carry = [];
    if (!pool.length) continue;
    const { pairs, leftovers } = swissPairUp(pool);
    all.push(...pairs);
    carry = leftovers;
  }
  // 兜底：剩余未配对队伍强制两两配对（允许重赛，保证每轮全部配完不卡死）
  if (carry.length) {
    const pairedIds = new Set();
    for (const [a, b] of all) { pairedIds.add(a.team.id); pairedIds.add(b.team.id); }
    const rest = sw.teams.filter((t) => t.status === 'in' && !pairedIds.has(t.team.id));
    for (let i = 0; i + 1 < rest.length; i += 2) all.push([rest[i], rest[i + 1]]);
  }
  return all;
}

// 通用单图模拟（career/ranked 共用；九局五胜 BO9 先 5 胜，与实际对局赛制一致）
function simScore(a, b) {
  const diff = a.rating - b.rating;
  const p = clamp(0.5 + diff * 0.004, 0.22, 0.86);
  const aw = ctx.rand() < p;
  const wa = aw ? a : b;
  const loser = aw ? b : a;
  const margin = wa.rating - loser.rating > 3 ? 3 + Math.floor(ctx.rand() * 3) : 1 + Math.floor(ctx.rand() * 2);
  const winnerScore = ROUND.MATCH_WIN;
  const loserScore = Math.max(1, winnerScore - margin);
  const score = aw ? [winnerScore, loserScore] : [loserScore, winnerScore];
  return { winner: wa, score };
}

// Major 单图模拟：九局五胜（BO9 先 5 胜，与实际对局一致）；胜率系数按 HLTV 模型放大
function majorSimScore(a, b) {
  const diff = a.rating - b.rating;
  const p = clamp(0.5 + diff * 0.012, 0.22, 0.9);
  const aw = ctx.rand() < p;
  const wa = aw ? a : b;
  const loser = aw ? b : a;
  const margin = wa.rating - loser.rating > 3 ? 2 + Math.floor(ctx.rand() * 3) : 1 + Math.floor(ctx.rand() * 2);
  const winnerScore = ROUND.MATCH_WIN;
  const loserScore = Math.max(1, winnerScore - margin);
  const score = aw ? [winnerScore, loserScore] : [loserScore, winnerScore];
  return { winner: wa, score };
}

function simSeries(a, b, bo) {
  const need = Math.ceil(bo / 2);
  let wa = 0, wb = 0;
  const maps = [];
  while (wa < need && wb < need) {
    const r = majorSimScore(a, b);
    maps.push(r.score);
    if (r.winner.id === a.id) wa++; else wb++;
  }
  return { winner: wa >= need ? a : b, score: [wa, wb], maps, bo };
}

function roundHasPending(round) {
  return !!round && round.pairs.some((p) => p.userPending && !p.played);
}

function playSwissRound(sw, game) {
  sw.round++;
  const round = { n: sw.round, pairs: [] };
  const done = new Set();
  const userId = game && game.major ? game.major.user.id : null;
  for (const [a, b] of buildPairings(sw)) {
    if (userId && (a.team.id === userId || b.team.id === userId)) {
      // 用户比赛不自动模拟：等待用户亲自打或点"模拟本场"
      round.pairs.push({ a: a.team, b: b.team, winner: null, score: null, maps: null, bo: 1, played: false, userPending: true });
      continue;
    }
    const r = runSeries(a.team, b.team, 1);
    if (r.winner.id === a.team.id) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    a.opps.push(b.team.id); b.opps.push(a.team.id);
    done.add(a.team.id); done.add(b.team.id);
    round.pairs.push({ a: a.team, b: b.team, winner: r.winner, score: r.score, maps: r.maps, bo: 1, played: true });
  }
  sw.rounds.push(round);
}

// 正赛瑞士轮（3 胜晋级 / 3 负淘汰；前 2 轮 BO1，后 3 轮 BO3）
function playMajorSwissRound(sw, round, game) {
  sw.round++;
  const roundDef = { n: sw.round, pairs: [] };
  const userId = game && game.major ? game.major.user.id : null;
  for (const [a, b] of buildPairings(sw)) {
    const bo = sw.allBO3 ? 3 : (round <= 2 ? 1 : 3);
    if (userId && (a.team.id === userId || b.team.id === userId)) {
      roundDef.pairs.push({ a: a.team, b: b.team, winner: null, score: null, maps: null, bo, played: false, userPending: true });
      continue;
    }
    const r = runSeries(a.team, b.team, bo);
    if (r.winner.id === a.team.id) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    a.opps.push(b.team.id); b.opps.push(a.team.id);
    roundDef.pairs.push({ a: a.team, b: b.team, winner: r.winner, score: r.score, maps: r.maps, bo, played: true });
  }
  sw.rounds.push(roundDef);
  for (const t of sw.teams) {
    if (t.status === 'in' && t.wins >= 3) t.status = 'adv';
    else if (t.status === 'in' && t.losses >= 3) t.status = 'elim';
  }
  sw.done = sw.teams.every((t) => t.status !== 'in');
}

function finalizeQualifier(st) {
  const ranked = st.qual.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  const adv = ranked.slice(0, 32).map((e) => e.team);
  const s3Invite = adv.slice(0, 8);   // 预选前 8 → 直进 Stage 3（传奇组）
  const s2Invite = adv.slice(8, 16);  // 9-16 → 直进 Stage 2（挑战组）
  const s1Invite = adv.slice(16, 32); // 17-32 → 从 Stage 1 打起（竞争组）
  st.qual.done = true;
  st.s1 = makeSwiss(s1Invite.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 1');
  st.s2 = makeSwiss(s2Invite.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 2');
  st.s3 = makeSwiss(s3Invite.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 3');
  st.s1.allBO3 = false; st.s2.allBO3 = false; st.s3.allBO3 = true; // Stage 3 全 BO3
  st.stage = 's1';
}

function mergeStages(st, from, to) {
  const adv = from.teams.filter((t) => t.status === 'adv').map((e) => e.team);
  to.teams = to.teams.concat(adv.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })));
  st.stage = to === st.s2 ? 's2' : 's3';
}

// 季后赛双败制：胜者组（WB）QF→SF→F，QF/SF 败者落入败者组（LB）；
// WB 决赛败者跌入 LB 决赛，LB 决赛胜者与 WB 冠军会师总决赛（GF，BO5，不设优势局/重置）。
// 共 14 场：WB 7 + LB 6 + GF 1，每支被淘汰队伍恰好两败
function makePlayoff(st) {
  const adv = st.s3.teams.filter((t) => t.status === 'adv')
    .sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating)
    .map((e) => e.team); // 种子 1-8
  const mk = (a, b, bo) => ({ a, b, winner: null, score: null, maps: null, bo, played: false });
  const qf = [
    [adv[0], adv[7]], [adv[3], adv[4]], [adv[2], adv[5]], [adv[1], adv[6]]
  ].map(([a, b]) => mk(a, b, 3));
  st.playoff = {
    format: 'double', // 双败制
    rounds: [{ bracket: 'WB', sub: 1, label: '胜者组 · 1/4 决赛', pairs: qf }],
    round: 0,
    lbCarry: null, wbFinalists: null, lbR3Pair: null, wbfLoser: null, gfWB: null // 轮次间待传递的晋级/落败队伍
  };
  st.stage = 'playoff';
}

// 双败制轮次推进：每打完一轮，按依赖关系追加下一轮（轮次顺序固定：
// WB QF → LB R1 → WB SF → LB R2 → WB F → LB 半决赛 → LB 决赛 → GF，每时刻至多一轮待打）
function appendNextPlayoffRound(st, done, wins, losses) {
  const pf = st.playoff;
  const mk = (a, b, bo) => ({ a, b, winner: null, score: null, maps: null, bo, played: false });
  const push = (bracket, sub, label, pairs) => pf.rounds.push({ bracket, sub, label, pairs });
  if (done.bracket === 'WB') {
    if (done.sub === 1) {
      // WB 首轮（QF）完：败者落入 LB 首轮，胜者进 WB 半决赛
      push('LB', 1, '败者组 · 首轮', [mk(losses[0], losses[1], 3), mk(losses[2], losses[3], 3)]);
      push('WB', 2, '胜者组 · 半决赛', [mk(wins[0], wins[1], 3), mk(wins[2], wins[3], 3)]);
    } else if (done.sub === 2) {
      // WB 半决赛完：败者空降 LB 第二轮，对阵 LB 首轮胜者
      pf.wbFinalists = wins;
      push('LB', 2, '败者组 · 第二轮', [mk(pf.lbCarry[0], losses[0], 3), mk(pf.lbCarry[1], losses[1], 3)]);
      pf.lbCarry = null;
    } else {
      // WB 决赛完：胜者直通总决赛，败者跌入 LB 决赛（等 LB 半决赛胜者）
      pf.gfWB = wins[0];
      pf.wbfLoser = losses[0];
      push('LB', 3, '败者组 · 半决赛', [mk(pf.lbR3Pair[0], pf.lbR3Pair[1], 3)]);
      pf.lbR3Pair = null;
    }
    return;
  }
  if (done.bracket === 'LB') {
    if (done.sub === 1) {
      pf.lbCarry = wins; // LB 首轮胜者等待 WB 半决赛败者
    } else if (done.sub === 2) {
      // LB 第二轮完：两名胜者进 LB 半决赛；此时 WB 决赛两强已定，排入赛程
      pf.lbR3Pair = wins;
      push('WB', 3, '胜者组 · 决赛', [mk(pf.wbFinalists[0], pf.wbFinalists[1], 3)]);
      pf.wbFinalists = null;
    } else if (done.sub === 3) {
      // LB 半决赛完：胜者对阵 WB 决赛败者，争夺最后一个总决赛席位
      push('LB', 4, '败者组 · 决赛', [mk(wins[0], pf.wbfLoser, 3)]);
      pf.wbfLoser = null;
    } else {
      // LB 决赛完：LB 冠军与 WB 冠军会师总决赛（BO5）
      push('GF', 1, '总决赛 · BO5', [mk(pf.gfWB, wins[0], 5)]);
      pf.gfWB = null;
    }
  }
}

function playPlayoffRound(st) {
  if (st.champion) return;
  const pf = st.playoff;
  const cur = pf.rounds[pf.round];
  if (!cur || !cur.pairs.length) return;
  // 用户比赛标记待处理（不自动模拟）
  for (const m of cur.pairs) {
    if (!m.userPending && (m.a.id === st.user.id || m.b.id === st.user.id)) m.userPending = true;
  }
  if (roundHasPending(cur)) return; // 等用户处理自己的比赛
  const wins = [], losses = [];
  for (const m of cur.pairs) {
    const r = runSeries(m.a, m.b, m.bo);
    m.played = true; m.winner = r.winner; m.score = r.score; m.maps = r.maps;
    wins.push(r.winner);
    losses.push(r.winner.id === m.a.id ? m.b : m.a);
  }
  pf.round++;
  if (cur.bracket === 'GF') {
    st.champion = wins[0];
    emit('toast', { text: (st.champion.id === st.user.id ? '你 ' : '') + st.champion.tag + ' 夺得 Major 冠军！' });
    return;
  }
  appendNextPlayoffRound(st, cur, wins, losses);
}

function currentSwiss(st) {
  if (st.stage === 's1') return st.s1;
  if (st.stage === 's2') return st.s2;
  if (st.stage === 's3') return st.s3;
  return null;
}

// 从各阶段记录同步用户队胜/负（自动模拟时也要计入）
function syncUserRecord(st) {
  let w = 0, l = 0;
  const swisses = [st.qual, st.s1, st.s2, st.s3];
  for (const sw of swisses) {
    if (!sw) continue;
    for (const r of sw.rounds) {
      for (const p of r.pairs) {
        if (!p.winner) continue;
        if (p.a.id === st.user.id || p.b.id === st.user.id) {
          if (p.winner.id === st.user.id) w++; else l++;
        }
      }
    }
  }
  if (st.playoff) {
    for (const r of st.playoff.rounds) {
      for (const p of r.pairs) {
        if (!p.winner) continue;
        if (p.a.id === st.user.id || p.b.id === st.user.id) {
          if (p.winner.id === st.user.id) w++; else l++;
        }
      }
    }
  }
  st.wins = w; st.losses = l;
}

function advanceMajorRound(game) {
  const st = game.major;
  if (st.stage === 'qualifier') {
    const q = st.qual;
    const last = q.rounds[q.rounds.length - 1];
    if (q.round >= 5 && !roundHasPending(last)) { finalizeQualifier(st); return; }
    if (roundHasPending(last)) { syncUserRecord(st); return; } // 等用户打完自己的比赛
    if (q.round >= 5) return;
    playSwissRound(q, game);
  } else if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
    const sw = currentSwiss(st);
    if (sw.done) {
      if (st.stage === 's1') { mergeStages(st, st.s1, st.s2); }
      else if (st.stage === 's2') { mergeStages(st, st.s2, st.s3); }
      else { makePlayoff(st); }
      return;
    }
    const last = sw.rounds[sw.rounds.length - 1];
    if (roundHasPending(last)) { syncUserRecord(st); return; } // 等用户
    playMajorSwissRound(sw, sw.round + 1, game);
  } else if (st.stage === 'playoff') {
    playPlayoffRound(st);
  }
  syncUserRecord(st);
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

function stageLabel(st) {
  if (st.stage === 'qualifier') return '预选赛 · 48 队瑞士轮（前 32 晋级）';
  if (st.stage === 's1') return 'Stage 1 · 竞争组瑞士轮（前 8 晋级）';
  if (st.stage === 's2') return 'Stage 2 · 挑战组瑞士轮（前 8 晋级）';
  if (st.stage === 's3') return 'Stage 3 · 传奇组瑞士轮（前 8 晋级）';
  if (st.stage === 'playoff') return '淘汰赛 · 双败制（胜者组/败者组）BO3 · 总决赛 BO5';
  return '比赛进行中';
}

function groupingLabel(g) {
  if (!g) return '';
  if (g.rule === 'custom') return '自定义名单';
  if (g.rule === 'region') return '按地区';
  return '按种子蛇形';
}

function findUserMatch(st) {
  if (st.stage === 'qualifier') {
    const q = st.qual;
    for (const r of q.rounds) {
      const m = r.pairs.find((x) => x.a.id === st.user.id || x.b.id === st.user.id);
      if (m && !m.played) return m;
    }
    return null;
  }
  if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
    const sw = currentSwiss(st);
    if (!sw || sw.done) return null;
    for (const r of sw.rounds) {
      const m = r.pairs.find((x) => x.a.id === st.user.id || x.b.id === st.user.id);
      if (m && !m.played) return m;
    }
    return null;
  }
  if (st.stage === 'playoff') {
    const pf = st.playoff;
    if (!pf) return null;
    const cur = pf.rounds[pf.round];
    if (!cur) return null;
    const m = cur.pairs.find((x) => x.a.id === st.user.id || x.b.id === st.user.id);
    return m && !m.played ? m : null;
  }
  return null;
}

function swissEntry(st, id) {
  if (st.stage === 'qualifier') return st.qual.teams.find((e) => e.team.id === id) || null;
  const sw = currentSwiss(st);
  return sw ? sw.teams.find((e) => e.team.id === id) || null : null;
}

function simUserMatch(game, m) {
  const st = game.major;
  const bo = m.bo || 1;
  const r = runSeries(m.a, m.b, bo);
  m.played = true;
  m.winner = r.winner;
  m.score = r.score;
  m.maps = r.maps;
  m.userDone = true;
  if (r.winner.id === st.user.id) st.wins++;
  else st.losses++;
  const userE = swissEntry(st, st.user.id);
  const oppE = swissEntry(st, m.a.id === st.user.id ? m.b.id : m.a.id);
  if (userE && oppE && (st.stage === 'qualifier' || st.stage === 's1' || st.stage === 's2' || st.stage === 's3')) {
    if (r.winner.id === st.user.id) { userE.wins++; oppE.losses++; } else { oppE.wins++; userE.losses++; }
    userE.opps.push(oppE.team.id); oppE.opps.push(userE.team.id);
    if (st.stage !== 'qualifier') {
      if (userE.status === 'in' && userE.wins >= 3) userE.status = 'adv';
      if (oppE.status === 'in' && oppE.wins >= 3) oppE.status = 'adv';
      if (userE.status === 'in' && userE.losses >= 3) userE.status = 'elim';
      if (oppE.status === 'in' && oppE.losses >= 3) oppE.status = 'elim';
    }
  }
}

function startMajorPlay(game) {
  const st = game.major;
  const m = findUserMatch(st);
  if (!m) { advanceMajorRound(game); return; }
  const opp = m.a.id === st.user.id ? m.b : m.a;
  st.currentMatch = m;
  st.lastStage = st.stage;
  st.stage = 'match';
  const stageIdx = { qualifier: 0, s1: 1, s2: 2, s3: 3, playoff: 4 }[st.lastStage] || 0;
  game.opts.mapId = MODE_MAPS[stageIdx % MODE_MAPS.length];
  game.opts.team = st.user.id.charCodeAt(0) % 2 ? 't' : 'ct';
  game.opts.bots = 4;
  game.opts.diff = 'hard';
  game.opts.diffParams = teamDiffParams(opp);
  game.matchWin = ROUND.MATCH_WIN; // 全部统一九局五胜（BO9：先赢 5 局）；系列赛胜负由 simSeries 按局数判定
  game.otWin = ROUND.MATCH_WIN + 3; // BO9 无加时（4:4 打决胜局），otWin 仅长赛制备用
  game.noRoundEnd = false;
  setupMatchEntities(game);
  startRound(game);
  emit('toast', { text: stageLabel(st) + ' · ' + st.user.tag + ' vs ' + opp.tag + (m.bo > 1 ? '（BO' + m.bo + '）' : '') });
}

function swissTableHtml(sw, st) {
  const rows = sw.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  let html = '<div class="mj-table">';
  html += '<div class="mj-tr mj-head"><span>#</span><span>队伍</span><span>胜-负</span><span>状态</span></div>';
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const isUser = e.team.id === st.user.id;
    let state = '';
    let stateCls = '';
    if (e.status === 'adv') { state = '晋级'; stateCls = 'ok'; }
    else if (e.status === 'elim') { state = '淘汰'; stateCls = 'bad'; }
    html += '<div class="mj-tr' + (isUser ? ' user' : '') + '">';
    html += '<span class="mj-rank">' + (i + 1) + '</span>';
    html += '<span class="mj-tn"><b>' + esc(e.team.tag) + '</b><i>' + esc(e.team.name) + '</i></span>';
    html += '<span class="mj-rec">' + e.wins + ' - ' + e.losses + '</span>';
    html += '<span class="mj-state ' + stateCls + '">' + state + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function pairsHtml(st, pairs, label, cur) {
  let html = '<div class="mj-grid">';
  const userPending = pairs.some((m) => m.userPending && !m.played);
  for (const m of pairs) {
    const hasUser = m.a.id === st.user.id || m.b.id === st.user.id;
    const done = m.played;
    const pending = m.userPending && !done;
    const sc = (a, b) => done ? (m.score[a] + ' : ' + m.score[b]) : '·';
    html += '<div class="mj-card' + (hasUser ? ' user' : '') + (pending ? ' pending' : '') + (done ? ' done' : '') + '">';
    if (hasUser && pending) html += '<div class="mj-card-tag">你的比赛</div>';
    html += '<div class="mj-row' + (done && m.winner.id === m.a.id ? ' win' : '') + '"><span class="mj-dot"></span><span class="mj-nm">' + esc(m.a.tag) + '</span><b>' + sc(0, 1) + '</b></div>';
    html += '<div class="mj-row' + (done && m.winner.id === m.b.id ? ' win' : '') + '"><span class="mj-dot"></span><span class="mj-nm">' + esc(m.b.tag) + '</span><b>' + sc(1, 0) + '</b></div>';
    if (m.bo > 1 && done) html += '<div class="mj-bo">BO' + m.bo + (m.maps ? ' · ' + m.maps.map((s) => s.join(':')).join(' ') : '') + '</div>';
    if (pending && hasUser) html += '<div class="mj-act"><button class="btn small" data-ma="play">亲自打</button><button class="btn small" data-ma="simMine">模拟本场</button></div>';
    html += '</div>';
  }
  html += '</div>';
  if (userPending) html += '<div class="mj-hint">⏳ 你的比赛待处理：可亲自打或模拟本场，之后继续模拟</div>';
  return html;
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
  let html = '<div class="mj-head">';
  html += '<div class="mj-title">MAJOR 锦标赛</div>';
  html += '<div class="mj-my">我的队伍 <b>' + esc(st.user.tag) + '</b> <span class="mj-rec">' + st.wins + '胜 ' + st.losses + '负</span></div>';
  html += '<div class="mj-actions"><button class="btn small gold" data-ma="simRound">模拟整轮</button><button class="btn small" data-ma="menu">返回菜单</button></div>';
  html += '</div>';
  html += '<div class="mj-stage">' + stageLabel(st) + (st.stage === 'qualifier' && st.grouping ? ' · 分组：' + esc(groupingLabel(st.grouping)) + '（' + st.grouping.groups.length + ' 组）' : '') + '</div>';
  if (st.stage === 'qualifier') {
    const q = st.qual;
    const cur = q.rounds[q.rounds.length - 1];
    html += '<div class="mj-panels"><div class="mj-panel"><div class="mj-panel-title">本轮对阵 · R' + q.round + '</div>' + pairsHtml(st, cur ? cur.pairs : [], '瑞士轮 R' + q.round, true) + '</div>';
    html += '<div class="mj-panel"><div class="mj-panel-title">积分榜</div>' + swissTableHtml(q, st) + '</div></div>';
  } else if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
    const sw = currentSwiss(st);
    const cur = sw.rounds[sw.rounds.length - 1];
    html += '<div class="mj-panels"><div class="mj-panel"><div class="mj-panel-title">本轮对阵 · R' + sw.round + '</div>' + pairsHtml(st, cur ? cur.pairs : [], '瑞士轮 R' + sw.round, !sw.done) + '</div>';
    html += '<div class="mj-panel"><div class="mj-panel-title">积分榜</div>' + swissTableHtml(sw, st) + '</div></div>';
  } else if (st.stage === 'playoff') {
    const pf = st.playoff;
    const isCur = (r) => pf.rounds[pf.round] === r;
    const col = (rows) => {
      let out = '';
      for (const r of rows) {
        if (!r.pairs.length) continue;
        out += '<div class="mj-panel-title">' + r.label + '</div>';
        out += pairsHtml(st, r.pairs, r.label, isCur(r));
      }
      return out;
    };
    html += '<div class="mj-panels"><div class="mj-panel">';
    html += '<div class="mj-panel-title">【胜者组 WB】</div>';
    html += col(pf.rounds.filter((r) => r.bracket === 'WB'));
    html += '<div class="mj-panel-title">【总决赛】</div>';
    html += col(pf.rounds.filter((r) => r.bracket === 'GF'));
    html += '</div><div class="mj-panel">';
    html += '<div class="mj-panel-title">【败者组 LB】</div>';
    html += col(pf.rounds.filter((r) => r.bracket === 'LB'));
    html += '</div></div>';
  }
  if (st.champion) html += '<div class="major-champ">🏆 冠军：' + esc(st.champion.name) + '（' + esc(st.champion.tag) + '）</div>';
  body.innerHTML = html;
  body.querySelectorAll('[data-ma]').forEach((btn) => {
    btn.onclick = () => majorAction(game, btn.getAttribute('data-ma'));
  });
}

export function majorAction(game, action) {
  const st = game.major;
  if (!st) return;
  if (action === 'simRound') {
    advanceMajorRound(game);
    renderMajorPanel(game);
  }
  else if (action === 'play') {
    startMajorPlay(game);
    if (typeof document !== 'undefined') { const p = document.getElementById('majorPanel'); if (p) p.style.display = 'none'; }
  }
  else if (action === 'simMine') {
    const m = findUserMatch(st);
    if (m) simUserMatch(game, m);
    renderMajorPanel(game);
  }
  else if (action === 'next') {
    game.over = false;
    game.state = 'MAJOR';
    if (game.major.stage === 'match') game.major.stage = game.major.lastStage || 'qualifier';
    if (game.ui) { game.ui.hideEnd(); }
  }
  else if (action === 'menu') { game.ui.hideEnd(); game.ui.showMenu(); }
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
  for (const k of ['major']) delete game[k];
  game.state = 'EDITOR';
  game.over = false;
  if (typeof window !== 'undefined' && window.__openMapEditor) window.__openMapEditor(game);
}

/* ---------- Cyber Battle: AI team duel + betting ---------- */

export const CYBER_ROSTER = MAJOR_TEAMS;

export const CYBER_START_COINS = 1000;
export const CYBER_BAILOUT_COINS = 500;
export const CYBER_BAILOUT_AT = 100;

export function cyberChance(a, b) {
  if (!a || !b) return 0.5;
  const pa = a.rating || 80, pb = b.rating || 80;
  return clamp(pa / (pa + pb), 0.2, 0.8);
}

export function cyberPayout(bet, chance) {
  return Math.max(1, Math.round(bet * (0.88 / Math.max(chance, 0.2))));
}

export function cyberCoins() {
  if (typeof localStorage === 'undefined') return CYBER_START_COINS;
  try {
    const legacyRaw = localStorage.getItem('cs2d_cricket_coins');
    const curRaw = localStorage.getItem('cs2d_ai_duel_coins');
    const legacy = legacyRaw !== null && legacyRaw !== '' ? Number(legacyRaw) : NaN;
    const cur = curRaw !== null && curRaw !== '' ? Number(curRaw) : NaN;
    let v = Number.isFinite(cur) && cur >= 0 ? cur : (Number.isFinite(legacy) && legacy >= 0 ? legacy : CYBER_START_COINS);
    if (curRaw === null) localStorage.setItem('cs2d_ai_duel_coins', String(Math.max(0, Math.floor(v))));
    return v;
  } catch (err) { return CYBER_START_COINS; }
}

// 破产保护：仅在对局结算后调用（防下注即读余额的套利/中途退出刷保底）
export function cyberBailoutIfBroke() {
  if (typeof localStorage === 'undefined') return;
  try {
    const v = cyberCoins();
    if (v >= CYBER_BAILOUT_AT) return;
    cyberSetCoins(CYBER_BAILOUT_COINS);
    const st = cyberStats();
    st.bailouts = (st.bailouts || 0) + 1;
    st.bailoutTotal = (st.bailoutTotal || 0) + CYBER_BAILOUT_COINS;
    localStorage.setItem('cs2d_ai_duel_stats', JSON.stringify(st));
  } catch (err) { /* no storage */ }
}

export function cyberSetCoins(v) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem('cs2d_ai_duel_coins', String(Math.max(0, Math.floor(v))));
    localStorage.removeItem('cs2d_cricket_coins');
  } catch (err) { /* no storage */ }
}

export function cyberHistory() {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('cs2d_ai_duel_history') || localStorage.getItem('cs2d_cricket_history') || '[]'); } catch (err) { return []; }
}

export function cyberPushHistory(entry) {
  if (typeof localStorage === 'undefined') return;
  try {
    const list = cyberHistory();
    list.unshift(entry);
    localStorage.setItem('cs2d_ai_duel_history', JSON.stringify(list.slice(0, 10)));
    localStorage.removeItem('cs2d_cricket_history');
  } catch (err) { /* no storage */ }
}

function cyberRating(team) { return team && team.rating ? team.rating : 80; }

function teamTactics(team) {
  const s = team.style || '';
  const t = { rushChance: 0.2, rotateChance: 0.4, saveChance: 0.55, nadeUse: 0.7, peekChance: 0.05, riskT: 0.7, spreadCtrl: 1, counterStrafe: 1, prefireChance: 0, tradeSpeed: 1 };
  if (s.includes('\u72c2\u91ce') || s.includes('\u9ad8\u901f') || s.includes('\u63d0\u901f') || s.includes('\u6fc0\u8fdb') || s.includes('\u8fdb\u653b\u6d6a')) { t.rushChance += 0.28; t.riskT += 0.2; t.saveChance -= 0.18; }
  if (s.includes('\u6162\u653b') || s.includes('\u7eaa\u5f8b') || s.includes('\u7a33\u624e') || s.includes('\u8001\u724c')) { t.rotateChance += 0.15; t.saveChance += 0.15; t.nadeUse += 0.12; }
  if (s.includes('\u72d9\u51fb') || s.includes('\u53cc\u72d9')) { t.peekChance += 0.06; t.spreadCtrl = 0.88; }
  if (s.includes('\u660e\u661f') || s.includes('\u9ad8\u7206') || s.includes('\u6b8b\u5c40')) { t.prefireChance += 0.05; t.tradeSpeed = 1.25; }
  if (s.includes('\u5730\u56fe\u63a7\u5236') || s.includes('\u56e2\u6218')) { t.nadeUse += 0.15; t.rotateChance += 0.1; }
  if (s.includes('\u4f20\u7edf')) { t.spreadCtrl = 1.08; t.counterStrafe = 1.08; }
  return t;
}

function randomizeCyberTeam(team, bots, seed = 1) {
  const base = teamDiffParams(team);
  const tac = teamTactics(team);
  for (let i = 0; i < bots.length; i++) {
    const e = bots[i];
    const mix = hellMix(seed + i * 7919 + 101, team.style);
    e.aiParams = {
      ...base,
      ...mix.params,
      react: clamp(mix.params.react * rand(0.8, 1.25), 0.05, 0.24),
      spreadMult: clamp(mix.params.spreadMult * rand(0.85, 1.15), 0.5, 1.12),
      aimSpeed: mix.params.aimSpeed * rand(0.85, 1.2),
      strafe: clamp(mix.params.strafe * rand(0.85, 1.2), 0.32, 0.7),
      idealMin: mix.params.idealMin * rand(0.9, 1.1),
      idealMax: mix.params.idealMax * rand(0.9, 1.1),
      rushChance: clamp(tac.rushChance + rand(-0.12, 0.12), 0.05, 0.75),
      rotateChance: clamp(tac.rotateChance + rand(-0.12, 0.12), 0.15, 0.8),
      saveChance: clamp(tac.saveChance + rand(-0.12, 0.12), 0.15, 0.9),
      nadeUse: clamp(tac.nadeUse + rand(-0.15, 0.15), 0.2, 1.1),
      peekChance: clamp(tac.peekChance + rand(-0.03, 0.03), 0.02, 0.2),
      riskT: clamp(tac.riskT + rand(-0.15, 0.15), 0.2, 1.4),
      spreadCtrl: clamp(tac.spreadCtrl * rand(0.9, 1.1), 0.8, 1.15),
      counterStrafe: clamp(tac.counterStrafe * rand(0.9, 1.1), 0.85, 1.1),
      prefireChance: clamp(tac.prefireChance + rand(-0.02, 0.02), 0, 0.12),
      tradeSpeed: clamp(tac.tradeSpeed + rand(-0.1, 0.1), 1, 1.6),
      ecoDiscipline: clamp(rand(0.85, 1.15), 0.8, 1.2),
      tacticalStyle: team.style,
      tacticalMix: 'H1-H10\u878d\u5408\u00b7' + mix.style,
      tacticalVariant: mix.variant,
      hellSource: mix.source
    };
  }
}

export function cyberStats() {
  if (typeof localStorage === 'undefined') return { played: 0, won: 0, lost: 0, net: 0, streak: 0, bestStreak: 0, totalBet: 0 };
  try { return Object.assign({ played: 0, won: 0, lost: 0, net: 0, streak: 0, bestStreak: 0, totalBet: 0 }, JSON.parse(localStorage.getItem('cs2d_ai_duel_stats') || '{}')); } catch (err) { return { played: 0, won: 0, lost: 0, net: 0, streak: 0, bestStreak: 0, totalBet: 0 }; }
}

export function cyberPushStats(entry) {
  if (typeof localStorage === 'undefined') return;
  try {
    const st = cyberStats();
    st.played++;
    if (entry.won) { st.won++; st.streak = (st.streak || 0) + 1; st.net += (entry.payout || 0) - (entry.bet || 0); }
    else { st.lost++; st.streak = 0; st.net -= (entry.bet || 0); }
    st.totalBet += entry.bet || 0;
    st.bestStreak = Math.max(st.bestStreak || 0, st.streak || 0);
    localStorage.setItem('cs2d_ai_duel_stats', JSON.stringify(st));
  } catch (err) { /* no storage */ }
}

function cyberPanelEl() { return typeof document !== 'undefined' ? document.getElementById('cyberPanel') : null; }

function hideCyberPanel() {
  const el = cyberPanelEl();
  if (el) el.style.display = 'none';
}

function showCyberPanel(game) {
  const el = cyberPanelEl();
  const c = game.cyber;
  if (!el || !c) return;
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  const tKills = tBots.reduce((sum, e) => sum + (e.kills || 0), 0);
  const cKills = cBots.reduce((sum, e) => sum + (e.kills || 0), 0);
  const leader = game.entities.filter((e) => e.bot && !e.dead).sort((a, b) => b.kills - a.kills)[0];
  const coins = cyberCoins();
  const stats = cyberStats();
  const betSide = c.side === 'left' ? c.left.tag : c.right.tag;
  const odds = (c.side === 'left' ? 0.88 / c.chance : 0.88 / (1 - c.chance)).toFixed(2);
  const bombInfo = game.bomb && game.bomb.planted ? 'C4 ' + game.bomb.site : (game.bomb && game.bomb.dropped ? 'C4 \u4e22\u5931' : '');
  el.innerHTML = '<div class="cyber-panel">' +
    '<div class="cyber-card c-left"><b>' + esc(c.left.tag) + '</b><span>' + esc(c.left.name) + '</span><i>' + c.left.rating + '</i><em>' + game.score.T + ' \u00b7 ' + tKills + ' \u51fb\u6740</em></div>' +
    '<div class="cyber-mid"><b>' + game.score.T + ' : ' + game.score.CT + '</b><span>R' + game.round + ' \u00b7 ' + esc(game.opts.mapId || 'dust2') + '</span><i>' + betSide + ' \u00b7 ' + c.bet + ' \u86d0\u86d0\u5e01 \u00b7 ' + odds + 'x</i><em>\u94b1\u5305 ' + coins + ' \u00b7 \u7834\u4ea7\u4fdd\u62a4 ' + CYBER_BAILOUT_COINS + ' \u00b7 \u8fde\u80dc ' + (stats.streak || 0) + '</em>' + (bombInfo ? '<small>' + bombInfo + '</small>' : '') + '</div>' +
    '<div class="cyber-card c-right"><b>' + esc(c.right.tag) + '</b><span>' + esc(c.right.name) + '</span><i>' + c.right.rating + '</i><em>' + game.score.CT + ' · ' + cKills + ' 击杀</em></div>' +
    '<div class="cyber-controls"><button data-speed="1" class="cyber-speed' + (c.speed === 1 ? ' on' : '') + '">1x</button><button data-speed="2" class="cyber-speed' + (c.speed === 2 ? ' on' : '') + '">2x</button><button data-speed="4" class="cyber-speed' + (c.speed === 4 ? ' on' : '') + '">4x</button><button data-speed="8" class="cyber-speed' + (c.speed === 8 ? ' on' : '') + '">8x</button><button data-skip="1" class="cyber-skip">跳过本局</button></div>' +
    (leader ? '<div class="cyber-mvp">MVP ' + esc(leader.name) + ' \u00b7 ' + leader.kills + ' \u51fb\u6740</div>' : '') +
    '</div>';
  if (el && !el._cyberBound) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target && e.target.closest ? e.target.closest('[data-speed],[data-skip]') : null;
      if (!btn || !game.cyber) return;
      if (btn.hasAttribute('data-speed')) {
        game.cyber.speed = Number(btn.getAttribute('data-speed')) || 1;
      } else if (btn.hasAttribute('data-skip')) {
        game.cyber.skip = true;
      }
      showCyberPanel(game);
    });
    el._cyberBound = true;
  }
  el.style.display = 'block';
  hideModeHud();
}

export function cyberStart(game) {
  for (const k of ['major']) delete game[k];
  const opts = game.opts.cyber = game.opts.cyber || {};
  let left = CYBER_ROSTER.find((c) => c.id === opts.leftId) || CYBER_ROSTER[0];
  let right = CYBER_ROSTER.find((c) => c.id === opts.rightId) || CYBER_ROSTER[1];
  if (left.id === right.id) right = CYBER_ROSTER[(CYBER_ROSTER.indexOf(left) + 1) % CYBER_ROSTER.length];
  const mapId = MODE_MAPS.includes(opts.mapId) ? opts.mapId : 'dust2';
  game.opts.mapId = mapId;
  game.opts.team = 'ct';
  game.opts.bots = 5;
  game.opts.diff = 'hard';
  game.opts.diffParams = null;
  game.noRoundEnd = false;
  game.roundDur = 115;
  game.entities = [];
  setupMatchEntities(game);
  game.entities = game.entities.filter((e) => e.bot);
  game.player = { dead: true, kills: 0, deaths: 0, assists: 0, team: 'ct', name: '\u89c2\u4f17', x: 0, y: 0, vx: 0, vy: 0, angle: 0, height: 0, weapons: {}, ammoMap: {}, reserveMap: {}, wKills: {}, stats: { hits: 0, shots: 0, headshots: 0 } };
  const tBots = game.entities.filter((e) => e.bot && e.team === 't');
  const cBots = game.entities.filter((e) => e.bot && e.team === 'ct');
  for (let i = 0; i < tBots.length; i++) tBots[i].name = left.players[i % left.players.length].name;
  for (let i = 0; i < cBots.length; i++) cBots[i].name = right.players[i % right.players.length].name;
  randomizeCyberTeam(left, tBots, (game.seed || 1));
  randomizeCyberTeam(right, cBots, (game.seed || 1) + 17);
  const chance = cyberChance(left, right);
  const coins = cyberCoins();
  const bet = clamp(Math.floor(Number(opts.bet) || 100), 1, coins);
  const side = opts.side === 'right' ? 'right' : 'left';
  cyberSetCoins(coins - bet);
  game.cyber = { left, right, leftE: tBots[0] || null, rightE: cBots[0] || null, chance, bet, side, coinsStart: coins, match: true, scoreLimit: 5, time: 0, ended: false, events: [], speed: 1, skip: false };
  startRound(game);
  showCyberPanel(game);
  emit('toast', { text: left.tag + ' vs ' + right.tag + ' \u5f00\u8d5b' });
}

export function cyberUpdate(game, dt) {
  const c = game.cyber;
  if (!c || c.ended || game.over) return;
  if (c.skip) {
    c.skip = false;
    if (game.state !== 'END') endRound(game, null, '本局跳过', 'skip');
    game.endedT = 0.05;
    return;
  }
  c.time += dt;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (c._panelT || 0) > 150) {
    c._panelT = now;
    showCyberPanel(game);
  }
  const limit = c.scoreLimit || 5;
  const afterLimit = game.round > 9;
  const tWon = game.score.T >= limit || (afterLimit && game.score.T > game.score.CT);
  const cWon = game.score.CT >= limit || (afterLimit && game.score.CT > game.score.T);
  if (afterLimit && game.round >= 12 && game.score.T === game.score.CT) {
    cyberSetCoins(cyberCoins() + c.bet);
    cyberPushHistory({ won: false, draw: true, left: c.left.tag, right: c.right.tag, bet: c.bet, payout: c.bet, t: Date.now() });
    hideCyberPanel();
    c.ended = true;
    endModeGame(game, true, '\u5e73\u5c40\u9000\u6b3e', '\u6bd4\u5206 ' + game.score.T + ':' + game.score.CT + ' \u00b7 \u8fd4\u8fd8\u4e0b\u6ce8 ' + c.bet + ' \u86d0\u86d0\u5e01');
    return;
  }
  if (tWon || cWon) {
    const userWon = c.side === 'left' ? tWon : cWon;
    const payout = userWon ? cyberPayout(c.bet, c.side === 'left' ? c.chance : 1 - c.chance) : 0;
    cyberSetCoins(cyberCoins() + payout);
    // 破产保护仅在此结算路径生效（且需实际下注，避免 0 注输局白嫖保底）
    if (c.bet > 0) cyberBailoutIfBroke();
    cyberPushHistory({ won: userWon, left: c.left.tag, right: c.right.tag, bet: c.bet, payout, t: Date.now() });
    cyberPushStats({ won: userWon, bet: c.bet, payout });
    hideCyberPanel();
    c.ended = true;
    const winner = tWon ? c.left.tag : c.right.tag;
    const title = userWon ? '\u62bc\u6ce8\u547d\u4e2d' : '\u62bc\u6ce8\u843d\u7a7a';
    const sub = winner + ' \u83b7\u80dc ' + game.score.T + ':' + game.score.CT + ' \u00b7 ' + (payout > 0 ? '+' + payout : '-' + c.bet) + ' \u86d0\u86d0\u5e01';
    endModeGame(game, userWon, title, sub);
    return;
  }
}


/* ---------- Mode registration ---------- */

function getMapDefSafe(id) {
  return getMapDef(id) || { id, name: id, accent: '#aaa', rows: [] };
}

registerMap({ id: 'forge', name: '熔炉工坊', accent: '#ff8a2a', tile: 16, rows: buildForge().rows(), category: 'bomb5v5' });
registerMap({
  id: 'atrium',
  name: '星轨中庭',
  accent: '#67d5c2',
  tile: 16,
  tagline: 'A 观景长廊 · B 地下档案室 · 中路穹顶转点',
  rows: buildAtrium().rows(),
  category: 'bomb5v5'
});
registerMap({
  id: 'harbor',
  name: '废弃港湾',
  accent: '#4da6ff',
  tile: 16,
  tagline: 'A 上层栈桥 · B 下层船坞 · 三横三纵货港通道',
  rows: buildHarbor().rows(),
  category: 'bomb5v5'
});

registerMode({
  id: 'classic', name: '经典爆破', desc: '标准 5v5 拆包', customBots: false
});
registerMode({
  id: 'major', name: 'Major 锦标赛', desc: '选队、打 Major、冲击冠军', customBots: false,
  start(game) {
    game.major = makeMajorState(game.opts.teamMajor || 'g2', game.opts.majorGroup);
    game.state = 'MAJOR';
    game.over = false;
    hideModeHud();
    if (game.ui) game.ui.hideMenu();
  },
  // 手动打完的比赛在此落盘（finishMatch 在 game.over 置位前调用 onFinish）
  onFinish(game) {
    const st = game.major;
    if (!st || st.stage !== 'match' || !st.currentMatch || st.currentMatch.played) return;
    const m = st.currentMatch;
    const userIsA = m.a.id === st.user.id;
    const userT = userIsA ? m.a : m.b;
    const winAt = game.ot ? ROUND.OT_WIN : ROUND.MATCH_WIN;
    const won = (game.score.T >= winAt && game.player.team === 't') || (game.score.CT >= winAt && game.player.team === 'ct');
    const userSc = game.player.team === 't' ? game.score.T : game.score.CT;
    const oppSc = game.player.team === 't' ? game.score.CT : game.score.T;
    m.played = true;
    m.winner = won ? userT : (userIsA ? m.b : m.a);
    m.score = userIsA ? [userSc, oppSc] : [oppSc, userSc];
    if (won) st.wins++; else st.losses++;
  },
  update(game) {
    if (game.major && game.state === 'MAJOR') renderMajorPanel(game);
  }
});



registerMode({
  id: 'cyber', name: '\u8d5b\u535a\u6597\u86d0\u86d0', desc: '\u4e0b\u6ce8\u89c2\u6218\u804c\u4e1a AI \u5bf9\u51b3', customBots: false,
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

export { MAJOR_TEAMS, teamDiffParams, simScore, MODE_MAPS };
