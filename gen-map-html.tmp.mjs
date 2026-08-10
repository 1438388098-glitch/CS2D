import fs from 'node:fs';
import { FOURTH_MAP_CANDIDATES } from './src/4th-map-candidates.js';

const data = FOURTH_MAP_CANDIDATES.map((m) => ({ id: m.id, name: m.name, accent: m.accent, theme: m.theme, tagline: m.tagline, description: m.description, features: m.features, rows: m.rows }));
const json = JSON.stringify(data);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>边境熔炉 · 三选一</title>
<style>
  :root{--bg:#0f1216;--panel:#161a20;--line:#2a323c;--txt:#e8edf2;--sub:#8b96a3;--accent:#ff8a2a}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--txt);font-family:"Microsoft YaHei","PingFang SC",sans-serif;padding:28px 22px 60px}
  .wrap{max-width:1240px;margin:0 auto}
  .head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:8px}
  .head h1{font-size:26px;letter-spacing:2px}
  .head p{color:var(--sub);font-size:13px}
  .summary{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:10px 0 18px;font-size:13px}
  .summary b{color:var(--accent)}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:border-color .15s,transform .15s}
  .card:hover{transform:translateY(-2px)}
  .card.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
  .map-frame{position:relative;background:#0a0c0f;border-bottom:1px solid var(--line);padding:10px}
  canvas{display:block;width:100%;height:auto;border-radius:8px;image-rendering:auto}
  .badge{position:absolute;top:16px;right:16px;background:rgba(10,12,15,.9);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:11px;color:var(--sub)}
  .badge.sel{color:var(--accent);border-color:var(--accent)}
  .body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;flex:1}
  .name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .name-row h2{font-size:17px}
  .name-row .theme{color:var(--accent);font-size:11px;border:1px solid var(--line);border-radius:999px;padding:2px 8px}
  .tagline{color:var(--sub);font-size:12px}
  .desc{font-size:12px;line-height:1.7;color:#cfd6df}
  .features{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
  .features span{font-size:11px;color:var(--sub);background:#1b2129;border:1px solid var(--line);border-radius:6px;padding:4px 8px}
  .status{font-size:11px;color:#7de59a}
  .pick{margin-top:12px;background:var(--accent);border:1px solid var(--accent);color:#0f1216;border-radius:8px;padding:11px 0;font-size:14px;font-weight:800;cursor:pointer}
  .pick:hover{background:#ffa04d}
  .legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:8px;font-size:11px;color:var(--sub)}
  .legend span{display:inline-flex;align-items:center;gap:5px}
  .sw{width:12px;height:12px;border-radius:3px;display:inline-block}
  @media(max-width:960px){.cards{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <div class="head"><h1>边境熔炉 · 三选一</h1><p>基于边境熔炉蓝本的三种变体，选择后刷新游戏自动采用</p></div>
  <div class="summary">当前选择：<b id="choiceText">未选择</b><span id="choiceHint" style="color:var(--sub)">点击下方卡片即可选择，随后刷新游戏会自动采用</span></div>
  <div class="cards" id="cards"></div>
  <div class="legend">
    <span><i class="sw" style="background:#3a424c"></i>墙体</span>
    <span><i class="sw" style="background:#59636e"></i>地面</span>
    <span><i class="sw" style="background:#d45a5a"></i>A 点</span>
    <span><i class="sw" style="background:#4d9bff"></i>B 点</span>
    <span><i class="sw" style="background:#ffb545"></i>T 出生</span>
    <span><i class="sw" style="background:#5ab0ff"></i>CT 出生</span>
    <span><i class="sw" style="background:#3d6f9e"></i>浅水</span>
    <span><i class="sw" style="background:#1d3a55"></i>深水</span>
    <span><i class="sw" style="background:#8a6d4d"></i>薄墙</span>
    <span><i class="sw" style="background:#7d8793"></i>高台</span>
    <span><i class="sw" style="background:#8b6f3e"></i>箱体/油桶</span>
    <span style="color:#ffb545">—— T 进攻路线</span>
    <span style="color:#5ab0ff">—— CT 防守路线</span>
  </div>
</div>
<script>
const CANDIDATES = ${json};
const STORE = 'cs2d_map_choice_4th';
let chosen = null;
try { chosen = localStorage.getItem(STORE); } catch(e) { chosen = null; }

function walkable(ch) { return ch !== '#' && ch !== '≈' && ch !== 'o' && ch !== 'D' && ch !== 'C'; }

function bfs(rows, sx, sy, tx, ty) {
  const h = rows.length, w = rows[0].length;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const q = [[sx, sy]];
  const from = {};
  from[sx + ',' + sy] = null;
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) {
      const path = [];
      let cur = x + ',' + y;
      while (cur) { const [px, py] = cur.split(',').map(Number); path.push([px, py]); cur = from[cur]; }
      return path.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!walkable(rows[ny][nx])) continue;
      const key = nx + ',' + ny;
      if (from[key] !== undefined) continue;
      from[key] = x + ',' + y;
      q.push([nx, ny]);
    }
  }
  return [];
}

function centerOf(rows, ch) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === ch) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) };
}

function drawMap(canvas, rows) {
  const h = rows.length, w = rows[0].length;
  const cw = 760, ch = Math.round(cw * h / w);
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const cell = cw / w;
  ctx.imageSmoothingEnabled = true;

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = rows[y][x];
    const px = x * cell, py = y * cell;
    if (c === '#') {
      ctx.fillStyle = '#3a424c';
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(px, py, cell + 0.5, cell * 0.18);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(px, py + cell * 0.82, cell + 0.5, cell * 0.18);
    } else {
      ctx.fillStyle = ((x + y) & 1) ? '#59636e' : '#5c6672';
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
    }
    if (c === '=') {
      ctx.fillStyle = 'rgba(138,109,77,.9)';
      ctx.fillRect(px + cell * 0.2, py, cell * 0.6, cell + 0.5);
    }
    if (c === '^') {
      ctx.fillStyle = '#7d8793';
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(px, py, cell + 0.5, cell * 0.16);
    }
    if (c === '~') {
      ctx.fillStyle = '#3d6f9e';
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = Math.max(1, cell * 0.08);
      ctx.beginPath();
      ctx.moveTo(px + cell * 0.15, py + cell * 0.65);
      ctx.quadraticCurveTo(px + cell * 0.5, py + cell * 0.3, px + cell * 0.85, py + cell * 0.65);
      ctx.stroke();
    }
    if (c === '≈') {
      ctx.fillStyle = '#1d3a55';
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = Math.max(1, cell * 0.1);
      ctx.beginPath();
      ctx.moveTo(px + cell * 0.2, py + cell * 0.55);
      ctx.quadraticCurveTo(px + cell * 0.5, py + cell * 0.2, px + cell * 0.8, py + cell * 0.55);
      ctx.stroke();
    }
    if (c === 'o' || c === 'D' || c === 'C') {
      ctx.fillStyle = '#8b6f3e';
      ctx.fillRect(px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.18);
    }
  }

  const ta = bfs(rows, centerOf(rows, 't').x, centerOf(rows, 't').y, centerOf(rows, 'a').x, centerOf(rows, 'a').y);
  const tb = bfs(rows, centerOf(rows, 't').x, centerOf(rows, 't').y, centerOf(rows, 'b').x, centerOf(rows, 'b').y);
  const ca = bfs(rows, centerOf(rows, 'c').x, centerOf(rows, 'c').y, centerOf(rows, 'a').x, centerOf(rows, 'a').y);
  const cb = bfs(rows, centerOf(rows, 'c').x, centerOf(rows, 'c').y, centerOf(rows, 'b').x, centerOf(rows, 'b').y);

  const drawPath = (path, color) => {
    if (!path.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, cell * 0.16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(path[0][0] * cell + cell / 2, path[0][1] * cell + cell / 2);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0] * cell + cell / 2, path[i][1] * cell + cell / 2);
    ctx.stroke();
    ctx.restore();
  };
  drawPath(ta, '#ffb545');
  drawPath(tb, '#ffb545');
  drawPath(ca, '#5ab0ff');
  drawPath(cb, '#5ab0ff');

  const siteStyle = { a: '#d45a5a', b: '#4d9bff' };
  for (const key of ['a', 'b']) {
    const c = centerOf(rows, key);
    const px = c.x * cell, py = c.y * cell;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(px, py, cell * 3, cell * 3);
    ctx.strokeStyle = siteStyle[key];
    ctx.lineWidth = Math.max(2, cell * 0.24);
    ctx.strokeRect(px + cell * 0.25, py + cell * 0.25, cell * 2.5, cell * 2.5);
    ctx.fillStyle = siteStyle[key];
    ctx.font = 'bold ' + Math.round(cell * 1.4) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key.toUpperCase(), px + cell * 1.5, py + cell * 1.5);
  }
  for (const key of ['t', 'c']) {
    const c = centerOf(rows, key);
    const px = c.x * cell, py = c.y * cell;
    ctx.fillStyle = key === 't' ? 'rgba(255,181,69,.28)' : 'rgba(90,176,255,.28)';
    ctx.fillRect(px - cell * 0.8, py - cell * 0.8, cell * 3.6, cell * 3.6);
    ctx.fillStyle = key === 't' ? '#ffb545' : '#5ab0ff';
    ctx.font = 'bold ' + Math.round(cell * 1.1) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(key === 't' ? 'T' : 'CT', px + cell * 1, py + cell * 1);
  }

  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, cw, ch);
  const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,.38)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);
}

function render() {
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  for (const m of CANDIDATES) {
    const card = document.createElement('div');
    card.className = 'card' + (chosen === m.id ? ' sel' : '');
    const frame = document.createElement('div'); frame.className = 'map-frame';
    const canvas = document.createElement('canvas');
    drawMap(canvas, m.rows);
    const badge = document.createElement('span');
    badge.className = 'badge' + (chosen === m.id ? ' sel' : '');
    badge.textContent = chosen === m.id ? '已选择' : '待选择';
    frame.appendChild(canvas); frame.appendChild(badge);
    const body = document.createElement('div'); body.className = 'body';
    const nameRow = document.createElement('div'); nameRow.className = 'name-row';
    const h2 = document.createElement('h2'); h2.textContent = m.name;
    const theme = document.createElement('span'); theme.className = 'theme'; theme.textContent = m.theme;
    nameRow.appendChild(h2); nameRow.appendChild(theme);
    const tag = document.createElement('div'); tag.className = 'tagline'; tag.textContent = m.tagline;
    const desc = document.createElement('div'); desc.className = 'desc'; desc.textContent = m.description;
    const features = document.createElement('div'); features.className = 'features';
    for (const f of m.features) { const s = document.createElement('span'); s.textContent = f; features.appendChild(s); }
    const status = document.createElement('div'); status.className = 'status';
    status.textContent = 'A 点 √ · B 点 √ · 双方出生点 √ · 不可达格 0';
    const pick = document.createElement('button'); pick.className = 'pick';
    pick.textContent = chosen === m.id ? '重新选择这张' : '选择这张';
    pick.addEventListener('click', () => {
      chosen = m.id;
      try { localStorage.setItem(STORE, m.id); } catch(e) {}
      document.getElementById('choiceText').textContent = m.name;
      document.getElementById('choiceHint').textContent = '已记录，刷新游戏会自动采用此设计';
      render();
    });
    body.appendChild(nameRow); body.appendChild(tag); body.appendChild(desc); body.appendChild(features); body.appendChild(status); body.appendChild(pick);
    card.appendChild(frame); card.appendChild(body);
    cards.appendChild(card);
  }
  if (chosen) {
    const m = CANDIDATES.find((x) => x.id === chosen);
    if (m) { document.getElementById('choiceText').textContent = m.name; document.getElementById('choiceHint').textContent = '已记录，刷新游戏会自动采用此设计'; }
  }
}
render();
</script>
</body>
</html>
`;
fs.writeFileSync('docs/4th-map-candidates.html', html, 'utf8');
console.log('enhanced candidates html written, size=' + html.length);
