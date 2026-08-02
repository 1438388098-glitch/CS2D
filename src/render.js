import { WEAPONS, DROP_COL } from './config.js';
import { weaponDef } from './entities.js';
import { getMap } from './map.js';
import { gunLen, FONT } from './render-utils.js';
import { clamp, rand } from './utils.js';

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
  if (!p || p.dead) game.zoom = 1;
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
  ctx.scale(scale, scale);
  ctx.translate(-game.camX + shx, -game.camY + shy);
  ctx.drawImage(layers.staticLayer, 0, 0);
  ctx.drawImage(layers.decalLayer, 0, 0);
  drawBombSiteMarks(game);
  drawBomb(game);
  drawDrops(game);
  drawGrenades(game);
  drawEntities(game);
  drawSmokes(game);
  drawParticles(game);
  drawTracers(game);
  ctx.restore();
}

function drawBombSiteMarks(game) {
  const map = getMap();
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 400);
  ctx.strokeStyle = 'rgba(255,150,90,' + (0.25 + 0.2 * pulse) + ')';
  ctx.lineWidth = 3;
  ctx.strokeRect(map.sites.A.x0, map.sites.A.y0, map.sites.A.x1 - map.sites.A.x0, map.sites.A.y1 - map.sites.A.y0);
  ctx.strokeStyle = 'rgba(90,160,255,' + (0.25 + 0.2 * pulse) + ')';
  ctx.strokeRect(map.sites.B.x0, map.sites.B.y0, map.sites.B.x1 - map.sites.B.x0, map.sites.B.y1 - map.sites.B.y0);
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
    const w = WEAPONS[d.wid];
    const blink = 0.65 + 0.35 * Math.sin(performance.now() / 280);
    const near = game.player && !game.player.dead && Math.hypot(game.player.x - d.x, game.player.y - d.y) < 48;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-Math.PI / 2);
    const len = w.kind === 'sniper' ? 30 : (w.kind === 'rifle' ? 26 : 22);
    ctx.fillStyle = 'rgba(24,26,32,' + blink + ')';
    ctx.fillRect(-len / 2, -3.5, len, 7);
    ctx.fillStyle = DROP_COL[w.kind] || '#ccc';
    ctx.fillRect(-len / 2, -1.2, len, 2.4);
    ctx.fillStyle = 'rgba(255,255,255,' + blink + ')';
    ctx.fillRect(-len / 2, -4, 4, 8);
    ctx.restore();
    ctx.fillStyle = near ? 'rgba(255,240,180,' + blink + ')' : 'rgba(255,220,150,' + blink * 0.8 + ')';
    ctx.font = near ? "bold 11px 'Segoe UI','Microsoft YaHei',sans-serif" : "9px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.fillText(w.name, d.x, d.y - 16);
    if (near) {
      ctx.fillStyle = 'rgba(140,255,170,0.9)';
      ctx.font = "10px 'Segoe UI','Microsoft YaHei',sans-serif";
      ctx.fillText('拾取', d.x, d.y + 20);
    }
  }
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
      const gl = gunLen(w);
      ctx.fillStyle = '#1a1d22';
      ctx.fillRect(4, -3, gl, 6);
      ctx.fillStyle = '#0c0e11';
      ctx.fillRect(4, -2, gl, 2);
      if (w.kind === 'sniper') {
        ctx.strokeStyle = '#33383f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(14, -5);
        ctx.lineTo(14, 5);
        ctx.stroke();
      }
    }
    if (e.muzzleT > 0 && w) {
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.moveTo(gunLen(w), -5);
      ctx.lineTo(gunLen(w) + 16, -1);
      ctx.lineTo(gunLen(w), 3);
      ctx.fill();
      ctx.fillStyle = '#fff3c0';
      ctx.beginPath();
      ctx.arc(gunLen(w), 0, 4, 0, Math.PI * 2);
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
      ctx.fillText(e.name, e.x, e.y - 22);
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
    const a = clamp(s.life / 2, 0, 1) * 0.75;
    const g = ctx.createRadialGradient(s.x, s.y, s.r * 0.2, s.x, s.y, s.r);
    g.addColorStop(0, 'rgba(210,212,215,' + a + ')');
    g.addColorStop(0.7, 'rgba(160,164,170,' + a * 0.7 + ')');
    g.addColorStop(1, 'rgba(120,124,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(game) {
  for (const p of game.particles) {
    const a = clamp(p.life, 0, 1);
    if (p.kind === 'blood') {
      ctx.fillStyle = 'rgba(150,20,15,' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.fillStyle = 'rgba(255,200,110,' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'shell') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin || 0);
      ctx.fillStyle = 'rgba(200,150,60,' + a + ')';
      ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    } else if (p.kind === 'swing') {
      ctx.strokeStyle = 'rgba(255,255,255,' + a * 0.5 + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    } else if (p.kind === 'smokep') {
      ctx.fillStyle = 'rgba(190,193,198,' + a * 0.4 + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = p.life > 0.4 ? '#ff8a2a' : '#ffd75e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - p.life * 0.3), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'boom') {
      const pr = p.life / 0.5;
      ctx.fillStyle = 'rgba(255,150,50,' + pr * 0.22 + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * pr * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,160,60,' + pr * 0.8 + ')';
      ctx.lineWidth = 6 * pr + 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * pr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,140,' + pr * 0.5 + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * pr * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
