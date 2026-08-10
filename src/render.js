import {WEAPONS, DROP_COL, TILE} from './config.js';
import {weaponDef} from './entities.js';
import {getMap, getGrid} from './map.js';
import {gunLen} from './render-utils.js';
import {clamp, rand} from './utils.js';
const mapTile = () => getMap()?.tile || TILE;
import {ARCHETYPES} from './persona.js';
import {fogEnabled, castVisionPolygon} from './fog.js';

let ctx = null;
let layers = null;

export function initRenderer(canvas, layersRef) {
  ctx = canvas.getContext('2d');
  layers = layersRef;
}

export function render(game) {
  const dpr = game.dpr || 1;
  const w2 = ctx.canvas.width / dpr;
  const h2 = ctx.canvas.height / dpr;
  const p = game.player;
  if (!p || p.dead) {
    if (!(game.cyber && game.state === 'LIVE' && !game.cyber.ended)) game.zoom = 0.75;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#14161a';
  ctx.fillRect(0, 0, w2, h2);
  const scale = game.zoom;
  let shx = 0, shy = 0;
  if (game.shake > 0) {
    shx = rand(-game.shake, game.shake);
    shy = rand(-game.shake, game.shake);
  }
  game._shx = shx;
  game._shy = shy;
  ctx.save();
  ctx.translate(w2 / 2, h2 / 2);
  // 地图固定：所有视角都不旋转世界（人物朝向由实体 sprite 的 angle 表现）
  ctx.scale(scale, scale);
  ctx.translate(-game.camX + shx, -game.camY + shy);
  ctx.drawImage(layers.staticLayer, 0, 0);
  ctx.drawImage(layers.decalLayer, 0, 0);
  drawWaterOverlay(game);
  drawBombSiteMarks(game);
  drawCrates(game);
  drawBomb(game);
  drawDrops(game);
  drawGrenades(game);
  drawEntities(game);
  drawHitOutlines(game);
  drawLaser(game);
  drawSmokes(game);
  drawParticles(game);
  drawTracers(game);
  drawFog(game);
  drawDmgPops2D(game);
  ctx.restore();
}

// 2D 伤害数字：命中处上浮淡出（描黑边可读），与 3D 的 B3 反馈一致
function drawHitOutlines(game) {
  const marks = game.hitOutlines || [];
  if (!marks.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const ho of marks) {
    const e = ho.target;
    if (!e || e.dead || ho.t <= 0) continue;
    const alpha = clamp(ho.t / (ho.head ? 0.45 : 0.3), 0, 1);
    const col = e.team === 'ct' ? '77,180,255' : '255,170,80';
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.18 * alpha) + ')';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, 18, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.92 * alpha) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, 18, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDmgPops2D(game) {
  const pops = game.dmgPops;
  if (!pops || !pops.length) return;
  const t = ctx;
  t.font = '12px Arial';
  t.textAlign = 'center';
  t.lineJoin = 'round';
  t.lineWidth = 3;
  const n = Math.min(pops.length, 12);
  for (let i = 0; i < n; i++) {
    const pop = pops[i];
    if (!pop || pop.t === undefined || pop.t > 0.8) continue;
    let sy = pop.y - (1 - pop.t / 0.8) * 30;
    t.globalAlpha = clamp(pop.t / 0.3, 0, 1);
    t.strokeStyle = '#000';
    t.fillStyle = pop.head ? '#ffd34d' : '#ffffff';
    const txt = String(Math.round(pop.dmg));
    t.strokeText(txt, pop.x, sy);
    t.fillText(txt, pop.x, sy);
  }
  t.globalAlpha = 1;
  t.textAlign = 'start';
}

// 动态水面：可见浅水瓦片叠加移动亮线（时间相位差），裁剪到相机视口
function drawWaterOverlay(game) {
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const grid = getGrid();
  if (!grid || !grid.length) return;
  const now = performance.now() / 1000;
  const x0 = Math.max(0, Math.floor((game.camX - game.canvasW / game.zoom / 2) / mapTile()) - 1);
  const y0 = Math.max(0, Math.floor((game.camY - game.canvasH / game.zoom / 2) / mapTile()) - 1);
  const x1 = Math.min(grid[0].length, Math.ceil((game.camX + game.canvasW / game.zoom / 2) / mapTile()) + 1);
  const y1 = Math.min(grid.length, Math.ceil((game.camY + game.canvasH / game.zoom / 2) / mapTile()) + 1);
  ctx.save();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (grid[y][x] !== '~') continue;
      const px = x * mapTile(), py = y * mapTile();
      const seed = (x * 7 + y * 13) % 17;
      const off = (now * 14 + seed * 5) % 30;
      ctx.fillStyle = 'rgba(220,240,255,0.20)';
      ctx.fillRect(px + off - 10, py + 8 + (seed % 5) * 5, 8, 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + ((off + 16) % 30) - 12, py + 4 + ((seed + 3) % 6) * 4, 6, 1);
    }
  }
  ctx.restore();
}

function drawBombSiteMarks(game) {
  const map = getMap();
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  if (!map.sites || !map.sites.A || !map.sites.B) return;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
  ctx.strokeStyle = 'rgba(255,150,90,' + (0.25 + 0.2 * pulse) + ')';
  ctx.lineWidth = 3;
  ctx.strokeRect(map.sites.A.x0, map.sites.A.y0, map.sites.A.x1 - map.sites.A.x0, map.sites.A.y1 - map.sites.A.y0);
  ctx.strokeStyle = 'rgba(90,160,255,' + (0.25 + 0.2 * pulse) + ')';
  ctx.strokeRect(map.sites.B.x0, map.sites.B.y0, map.sites.B.x1 - map.sites.B.x0, map.sites.B.y1 - map.sites.B.y0);
}

export function crateRenderSpec(x, y, hp, tile = mapTile()) {
  const px = x - tile / 2;
  const py = y - tile / 2;
  const hash = (n) => {
    let h = (Math.floor(x) * 374761393 ^ Math.floor(y) * 668265263 ^ n * 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) / 4294967296;
  };
  const planks = [];
  const bolts = [];
  const cracks = [];
  for (let i = 0; i < 3; i++) {
    const yPos = py + tile * (0.22 + i * 0.28);
    const offset = (hash(i) - 0.5) * tile * 0.12;
    planks.push({ y: yPos, x1: px + 3, x2: px + tile - 3, offset });
  }
  const boltPos = [[4, 4], [tile - 4, 4], [4, tile - 4], [tile - 4, tile - 4]];
  for (let i = 0; i < boltPos.length; i++) {
    bolts.push({ x: px + boltPos[i][0], y: py + boltPos[i][1], r: 2 + hash(i + 10) * 0.5 });
  }
  if (hp <= 1) {
    cracks.push({ x1: px + tile * 0.18, y1: py + tile * 0.2, x2: px + tile * 0.52, y2: py + tile * 0.58, x3: px + tile * 0.34, y3: py + tile * 0.82 });
    cracks.push({ x1: px + tile * 0.62, y1: py + tile * 0.18, x2: px + tile * 0.84, y2: py + tile * 0.48 });
  }
  return {
    px,
    py,
    tile,
    base: hp > 1 ? 'rgba(118,88,54,0.96)' : 'rgba(104,76,48,0.96)',
    planks,
    bolts,
    cracks
  };
}

function drawCrates(game) {
  if (!game.crates || !game.crates.length) return;
  for (const c of game.crates) {
    const s = crateRenderSpec(c.x, c.y, c.hp);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(s.px + 3, s.py + s.tile - 4, s.tile, 4);
    ctx.fillStyle = s.base;
    ctx.fillRect(s.px, s.py, s.tile, s.tile);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(s.px, s.py, s.tile, 3);
    ctx.strokeStyle = 'rgba(56,40,24,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.px + 1, s.py + 1, s.tile - 2, s.tile - 2);
    ctx.strokeStyle = 'rgba(44,31,18,0.48)';
    ctx.lineWidth = 1.25;
    for (const pl of s.planks) {
      ctx.beginPath();
      ctx.moveTo(pl.x1, pl.y);
      ctx.lineTo(pl.x2, pl.y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.px + s.tile * 0.5, s.py + 2);
    ctx.lineTo(s.px + s.tile * 0.5, s.py + s.tile - 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(26,18,10,0.82)';
    for (const bolt of s.bolts) {
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (c.hp <= 1) {
      ctx.strokeStyle = 'rgba(34,24,14,0.9)';
      ctx.lineWidth = 1.5;
      for (const crack of s.cracks) {
        ctx.beginPath();
        ctx.moveTo(crack.x1, crack.y1);
        ctx.lineTo(crack.x2, crack.y2);
        if (crack.x3 !== undefined) ctx.lineTo(crack.x3, crack.y3);
        ctx.stroke();
      }
    }
  }
}

function drawBomb(game) {
  if (!game.bomb) return;
  const b = game.bomb;
  if (!b.dropped && !b.planted) return;
  const blink = Math.sin(performance.now() / 180) > 0;
  ctx.save();
  if (b.planted) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 300);
    ctx.fillStyle = 'rgba(255,60,40,' + pulse * 0.3 + ')';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#222';
  ctx.fillRect(b.x - 7, b.y - 4, 14, 8);
  ctx.fillStyle = blink ? '#ff3b30' : '#5a0f0a';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#999';
  ctx.fillRect(b.x - 2, b.y - 10, 4, 6);
  ctx.restore();
}

function drawDrops(game) {
  ctx.save();
  ctx.font = "12px 'Segoe UI','Microsoft YaHei',sans-serif";
  ctx.textAlign = 'center';
  for (const d of game.drops) {
    const info = dropRenderInfo(d);
    if (!info) continue;
    const blink = 0.65 + 0.35 * Math.sin(performance.now() / 280);
    const near = game.player && !game.player.dead && Math.hypot(game.player.x - d.x, game.player.y - d.y) < 48;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (info.kind === 'kit') {
      ctx.fillStyle = 'rgba(24,26,32,' + blink + ')';
      ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = info.color;
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.strokeStyle = 'rgba(255,255,255,' + blink + ')';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -5, 14, 10);
    } else {
      const w = WEAPONS[d.wid];
      ctx.rotate(-Math.PI / 2);
      const len = w.kind === 'sniper' ? 30 : (w.kind === 'rifle' ? 26 : 22);
      ctx.fillStyle = 'rgba(24,26,32,' + blink + ')';
      ctx.fillRect(-len / 2, -3.5, len, 7);
      ctx.fillStyle = info.color;
      ctx.fillRect(-len / 2, -1.2, len, 2.4);
      ctx.fillStyle = 'rgba(255,255,255,' + blink + ')';
      ctx.fillRect(-len / 2, -4, 4, 8);
    }
    ctx.restore();
    ctx.fillStyle = near ? 'rgba(255,240,180,' + blink + ')' : 'rgba(255,220,150,' + blink * 0.8 + ')';
    ctx.font = near ? "bold 11px 'Segoe UI','Microsoft YaHei',sans-serif" : "9px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.fillText(info.label, d.x, d.y - 16);
    if (near) {
      ctx.fillStyle = 'rgba(140,255,170,0.9)';
      ctx.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.fillText('拾取', d.x, d.y + 20);
    }
  }
  ctx.restore();
}

export function dropRenderInfo(d) {
  if (!d) return null;
  if (d.kind === 'kit') return { label: '拆弹钳', kind: 'kit', color: '#ffd34d' };
  const w = d.wid && WEAPONS[d.wid];
  if (!w) return null;
  return { label: w.name, kind: w.kind, color: DROP_COL[w.kind] || '#ccc' };
}

function drawLaser(game) {
  const p = game.player;
  if (!p || p.dead || !p.laserEnd) return;
  const end = p.laserEnd;
  const sx = p.x + Math.cos(p.angle) * 20;
  const sy = p.y + Math.sin(p.angle) * 20;
  const dx = end.x - sx, dy = end.y - sy;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const strong = p.scoped ? 0.9 : 0.38;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,70,70,' + (strong * 0.14) + ')';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,70,70,' + strong + ')';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,120,0.95)';
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrenades(game) {
  for (const g of game.grenades) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = g.kind === 'he' ? '#2f6b2f' : (g.kind === 'flash' ? '#c9c9c9' : '#5a5f66');
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(-1.5, -3, 3, 6);
    ctx.restore();
  }
}


function drawEntities(game) {
  for (const e of game.entities) {
    if (e.dead) continue;
    const isP = e === game.player;
    const darkCol = e.team === 'ct' ? '#4d9bff' : '#ffa03d';
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = e.team === 'ct' ? 'rgba(77,155,255,0.35)' : 'rgba(255,160,61,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    const bob = isP && e.walking ? Math.sin(performance.now() / 160) * 2.5 : 0;
    ctx.translate(0, bob);
    ctx.rotate(e.angle);
    ctx.fillStyle = darkCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c3038';
    ctx.beginPath();
    ctx.arc(0, -4, 9, 0, Math.PI * 2);
    ctx.fill();
    const w = weaponDef(e);
    if (w && w.kind === 'knife') {
      ctx.strokeStyle = '#cfd4da';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, -6);
      ctx.lineTo(20, -8);
      ctx.stroke();
    } else if (w) {
      // 后坐偏移：开火时枪身沿后向退，与准星扩散视觉一致
      const recoilOff = (e.recoil || 0) * 4;
      const gl = gunLen(w);
      ctx.fillStyle = '#1a1d22';
      ctx.fillRect(4 - recoilOff, -3, gl, 6);
      ctx.fillStyle = '#0c0e11';
      ctx.fillRect(4 - recoilOff, -2, gl, 2);
      if (w.kind === 'sniper') {
        ctx.strokeStyle = '#33383f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(14 - recoilOff, -5);
        ctx.lineTo(14 - recoilOff, 5);
        ctx.stroke();
      }
    }
    if (e.muzzleT > 0 && w) {
      const recoilOff = (e.recoil || 0) * 4;
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.moveTo(gunLen(w) - recoilOff, -5);
      ctx.lineTo(gunLen(w) - recoilOff + 16, -1);
      ctx.lineTo(gunLen(w) - recoilOff, 3);
      ctx.fill();
      ctx.fillStyle = '#fff3c0';
      ctx.beginPath();
      ctx.arc(gunLen(w) - recoilOff, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(e.x, bob - 4);
    ctx.fillStyle = isP ? '#ffcf9e' : '#e8b98c';
    ctx.beginPath();
    ctx.arc(0, 0, isP ? 5.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isP ? '#1c2b3a' : (e.team === 'ct' ? '#1d3557' : '#3a2413');
    ctx.fillRect(-4, -6, 8, 4);
    ctx.restore();
    if (e.bot) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = e.team === 'ct' ? '#7fb8ff' : '#ffcf8a';
      const arch = ARCHETYPES[e.archetype];
      ctx.fillText(e.name + (arch ? ' ·' + arch.label : ''), e.x, e.y - 22);
      ctx.restore();
    }
    if (e.defuseT > 0) {
      const pct = clamp(e.defuseT / (e.weapons.kit ? 2.5 : 5), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - 16, e.y - 32, 32, 5);
      ctx.fillStyle = '#4dc3ff';
      ctx.fillRect(e.x - 16, e.y - 32, 32 * pct, 5);
    }
    if (e.plantT > 0) {
      const pct2 = clamp(e.plantT / 3, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - 16, e.y - 32, 32, 5);
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(e.x - 16, e.y - 32, 32 * pct2, 5);
    }
    if (e.hasBomb && e.team === 't') {
      const blink = Math.sin(performance.now() / 200) > 0;
      ctx.fillStyle = blink ? '#ff3b30' : '#8a1a12';
      ctx.beginPath();
      ctx.arc(e.x + 14, e.y - 12, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSmokes(game) {
  for (const s of game.smokes) {
    // 淡入（半径增长期）+ 淡出（生命末期 2s），其余时段完全遮挡
    const fade = clamp(s.life / 2, 0, 1) * clamp((s.r - 20) / 40, 0.3, 1);
    // 外圈柔边
    const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.3, s.x, s.y, s.r);
    g.addColorStop(0, 'rgba(206,208,211,' + (0.96 * fade) + ')');
    g.addColorStop(0.75, 'rgba(190,193,197,' + (0.94 * fade) + ')');
    g.addColorStop(0.95, 'rgba(150,155,161,' + (0.55 * fade) + ')');
    g.addColorStop(1, 'rgba(120,124,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    // 实心核（完全遮挡，与 LOS/子弹截断判定一致）
    ctx.fillStyle = 'rgba(198,200,204,' + (0.97 * fade) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    // 边缘噪点（增强体积感）；用位置+索引确定性伪随机，保证同 seed 画面可复现
    ctx.fillStyle = 'rgba(212,214,217,' + (0.5 * fade) + ')';
    const sHash = (n) => {
      let h = (Math.floor(s.x) * 73856093 ^ Math.floor(s.y) * 19349663 ^ n * 83492791) >>> 0;
      h = (h ^ (h >>> 15)) * 2246822519 >>> 0;
      return (h >>> 0) / 4294967296;
    };
    for (let i = 0; i < 6; i++) {
      const na = sHash(i) * Math.PI * 2;
      const nr = s.r * (0.55 + sHash(i + 6) * 0.35);
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(na) * nr, s.y + Math.sin(na) * nr, 6 + sHash(i + 12) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawParticles(game) {
  const styles = {
    blood: 'rgba(150,20,15,',
    spark: 'rgba(255,200,110,',
    smokep: 'rgba(190,193,198,',
    splash: 'rgba(120,190,235,',
    wood: 'rgba(150,110,60,'
  };
  for (const kind of Object.keys(styles)) {
    ctx.fillStyle = styles[kind];
    for (const p of game.particles) {
      if (p.kind !== kind) continue;
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const p of game.particles) {
    const a = clamp(p.life, 0, 1);
    if (p.kind === 'shell') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = 'rgba(200,150,60,' + a + ')';
      ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    } else if (p.kind === 'swing') {
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = p.life > 0.4 ? '#ff8a2a' : '#ffd75e';
      ctx.globalAlpha = clamp(1 - p.life * 0.3, 0.15, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - p.life * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'boom') {
      const pr = p.life / 0.5;
      ctx.fillStyle = 'rgba(255,150,50,' + (pr * 0.22) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * pr * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,160,60,' + (pr * 0.8) + ')';
      ctx.lineWidth = 6 * pr + 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * pr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,140,' + (pr * 0.5) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * pr * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function drawFog(game) {
  if (!fogEnabled(game)) return;
  if (typeof document === 'undefined') return;
  const map = getMap();
  if (!map || !map.W || !map.H) return;
  const SCALE = 0.5;
  const fw = Math.max(1, Math.ceil(map.W * SCALE));
  const fh = Math.max(1, Math.ceil(map.H * SCALE));
  let cv = game._fogCv;
  if (!cv || cv.width !== fw || cv.height !== fh) {
    cv = document.createElement('canvas');
    cv.width = fw;
    cv.height = fh;
    game._fogCv = cv;
  }
  const p = game.player;
  const viewpoints = [];
  if (p && !p.dead) viewpoints.push(p);
  for (const e of game.entities) {
    if (e.bot && !e.dead && p && e.team === p.team) viewpoints.push(e);
  }
  if (!viewpoints.length) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, 0, 0, map.W, map.H);
    ctx.restore();
    return;
  }
  const now = performance.now();
  const smokeKey = (game.smokes || []).map((s) => Math.round(s.x / 32) + ',' + Math.round(s.y / 32)).join(';');
  const posKey = viewpoints.map((v) => Math.round(v.x / 16) + ',' + Math.round(v.y / 16)).join('|');
  const key = posKey + '#' + smokeKey;
  if (game._fogKey === key && now - (game._fogUpdatedAt || 0) < 120) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, 0, 0, map.W, map.H);
    ctx.restore();
    return;
  }
  game._fogKey = key;
  game._fogUpdatedAt = now;
  const fctx = cv.getContext('2d');
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, fw, fh);
  fctx.fillStyle = 'rgba(2,5,9,0.94)';
  fctx.fillRect(0, 0, fw, fh);
  fctx.globalCompositeOperation = 'destination-out';
  for (const v of viewpoints) {
    const pts = castVisionPolygon(game, v.x, v.y, 560, 96);
    fctx.save();
    fctx.shadowColor = 'rgba(0,0,0,1)';
    fctx.shadowBlur = 10;
    fctx.fillStyle = 'rgba(0,0,0,1)';
    fctx.beginPath();
    fctx.moveTo(pts[0].x * SCALE, pts[0].y * SCALE);
    for (let i = 1; i < pts.length; i++) fctx.lineTo(pts[i].x * SCALE, pts[i].y * SCALE);
    fctx.closePath();
    fctx.fill();
    fctx.restore();
  }
  fctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cv, 0, 0, map.W, map.H);
  ctx.restore();
}

function drawTracers(game) {
  for (const t of game.tracers) {
    const a = clamp(t.life / 0.09, 0, 1);
    ctx.strokeStyle = t.team === 'ct' ? 'rgba(110,180,255,' + a + ')' : 'rgba(255,190,90,' + a + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
}
