import fs from 'node:fs';
import { createBuilder } from '../src/map-gen.js';
import { loadMap, getMap, nearestWalkable, aStar } from '../src/map.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function border(b) {
  for (let x = 0; x < b.w; x++) { b.wall(x, 0); b.wall(x, b.h - 1); }
  for (let y = 0; y < b.h; y++) { b.wall(0, y); b.wall(b.w - 1, y); }
}

function noise(x, y, s) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function blob(b, cx, cy, rx, ry, s) {
  for (let j = Math.max(1, Math.floor(cy - ry - 1)); j <= Math.min(b.h - 2, Math.ceil(cy + ry + 1)); j++) {
    for (let i = Math.max(1, Math.floor(cx - rx - 1)); i <= Math.min(b.w - 2, Math.ceil(cx + rx + 1)); i++) {
      const dx = (i - cx) / rx, dy = (j - cy) / ry;
      const jitter = (noise(i, j, s) - 0.5) * 0.6;
      if (dx * dx + dy * dy <= 1 + jitter) b.tile(i, j, '.');
    }
  }
}

function lane(b, x0, y0, x1, y1, s, radius) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 3;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let t = 0; t <= steps; t++) {
    const f = t / steps;
    const jitter = (noise(t, 7, s) - 0.5) * 3.4;
    const cx = x0 + dx * f + nx * jitter;
    const cy = y0 + dy * f + ny * jitter;
    blob(b, cx, cy, radius + (noise(t, 11, s) - 0.5) * 0.5, radius + (noise(t, 13, s) - 0.5) * 0.5, s + t * 0.07);
  }
}

function cover(b, x, y) {
  if (b.grid[y] && b.grid[y][x] === '.') b.tile(x, y, 'C');
}

function repairConnectivity(b, seed) {
  const grid = b.grid;
  const h = b.h, w = b.w;
  let guard = 0;
  for (;;) {
    const visited = new Set();
    let start = null;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] !== '#') { if (!start) start = [x, y]; }
    }
    if (!start) break;
    const q = [start];
    visited.add(start[0] + ',' + start[1]);
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        if (grid[ny][nx] === '#') continue;
        const key = nx + ',' + ny;
        if (visited.has(key)) continue;
        visited.add(key);
        q.push([nx, ny]);
      }
    }
    let target = null, best = Infinity;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] === '#') continue;
      if (visited.has(x + ',' + y)) continue;
      const d = Math.hypot(x - start[0], y - start[1]);
      if (d < best) { best = d; target = [x, y]; }
    }
    if (!target) break;
    lane(b, start[0], start[1], target[0], target[1], seed + guard, 1.6);
    guard++;
    if (guard > 200) break;
  }
}

function randPoint(rng, w, h, margin = 4) {
  return { x: margin + Math.floor(rng() * (w - margin * 2)), y: margin + Math.floor(rng() * (h - margin * 2)) };
}

function parallelLane(b, p1, p2, offset, s, radius) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  lane(b, p1.x + nx * offset, p1.y + ny * offset, p2.x + nx * offset, p2.y + ny * offset, s, radius);
}

function generateMap(seed) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = mulberry32(seed * 1000 + attempt * 77);
    const w = 44 + Math.floor(rng() * 20);
    const h = 36 + Math.floor(rng() * 18);
    const b = createBuilder(w, h);
    border(b);

    const t = { x: 4 + Math.floor(rng() * 8), y: 8 + Math.floor(rng() * (h - 16)) };
    const c = { x: w - 4 - Math.floor(rng() * 8), y: 8 + Math.floor(rng() * (h - 16)) };
    let a = randPoint(rng, w, h), bb = randPoint(rng, w, h);
    if (Math.abs(a.x - t.x) + Math.abs(a.y - t.y) < 12) a = { x: w - 6 - Math.floor(rng() * 8), y: 8 + Math.floor(rng() * (h - 16)) };
    if (Math.abs(bb.x - c.x) + Math.abs(bb.y - c.y) < 12) bb = { x: 6 + Math.floor(rng() * 8), y: 8 + Math.floor(rng() * (h - 16)) };

    // 出生缓冲过渡区：出生点不直接接主战场
    const tTrans = { x: t.x + Math.sign(c.x - t.x || 1) * 5, y: t.y + Math.floor((rng() - 0.5) * 6) };
    const cTrans = { x: c.x + Math.sign(t.x - c.x || 1) * 5, y: c.y + Math.floor((rng() - 0.5) * 6) };
    blob(b, t.x, t.y, 3, 3, seed * 3 + 1);
    blob(b, c.x, c.y, 3, 3, seed * 3 + 2);
    blob(b, tTrans.x, tTrans.y, 3, 2, seed * 3 + 5);
    blob(b, cTrans.x, cTrans.y, 3, 2, seed * 3 + 6);
    blob(b, a.x, a.y, 4, 4, seed * 3 + 3);
    blob(b, bb.x, bb.y, 4, 4, seed * 3 + 4);

    const pts = [t, tTrans, c, cTrans, a, bb];
    const n = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const p = randPoint(rng, w, h);
      pts.push(p);
      blob(b, p.x, p.y, 2 + rng() * 1.5, 2 + rng() * 1.5, seed * 7 + i);
    }

    // 生成树 + 核心点之间强制第二条独立路线 + 每点至少 2 度
    const edges = [];
    const used = [0];
    while (used.length < pts.length) {
      const from = used[Math.floor(rng() * used.length)];
      const to = pts.findIndex((p, i) => !used.includes(i));
      edges.push([from, to]);
      used.push(to);
    }
    const coreIdx = [0, 2, 4, 5];
    for (let i = 0; i < coreIdx.length; i++) for (let j = i + 1; j < coreIdx.length; j++) edges.push([coreIdx[i], coreIdx[j]]);
    const degree = Array(pts.length).fill(0);
    for (const [a2, b2] of edges) { degree[a2]++; degree[b2]++; }
    for (let i = 0; i < pts.length; i++) {
      const missing = Math.max(0, 2 - degree[i]);
      for (let k = 0; k < missing; k++) {
        const j = Math.floor(rng() * pts.length);
        if (j === i) continue;
        edges.push([i, j]);
        degree[i]++; degree[j]++;
      }
    }
    for (let i = 0; i < 5 + Math.floor(rng() * 4); i++) {
      const a2 = Math.floor(rng() * pts.length), b2 = Math.floor(rng() * pts.length);
      if (a2 !== b2) edges.push([a2, b2]);
    }

    for (const [i, j] of edges) {
      const radius = 1.7 + rng() * 1.0;
      lane(b, pts[i].x, pts[i].y, pts[j].x, pts[j].y, seed * 11 + i * 17 + j, radius);
      const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (dist > 14 && rng() < 0.75) {
        parallelLane(b, pts[i], pts[j], 4 + Math.floor(rng() * 4), seed * 23 + i * 31 + j, Math.max(1.6, radius - 0.3));
      }
    }

    // 高低台：架枪角度差
    const elevated = [];
    const elCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < elCount && i < pts.length; i++) {
      const idx = 1 + Math.floor(rng() * (pts.length - 1));
      if (elevated.includes(idx)) continue;
      elevated.push(idx);
      blob(b, pts[idx].x, pts[idx].y, 3, 2, seed * 31 + i);
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const x = pts[idx].x + dx, y = pts[idx].y + dy;
        if (x > 1 && y > 1 && x < w - 2 && y < h - 2) b.tile(x, y, '^');
      }
    }

    // 连续掩体链 + L 型转角掩体
    for (const [i, j] of edges) {
      const steps = Math.max(Math.abs(pts[i].x - pts[j].x), Math.abs(pts[i].y - pts[j].y), 1);
      for (let t = 0; t <= steps; t += 4) {
        const f = t / steps;
        const px = Math.round(pts[i].x + (pts[j].x - pts[i].x) * f + (rng() - 0.5) * 2);
        const py = Math.round(pts[i].y + (pts[j].y - pts[i].y) * f + (rng() - 0.5) * 2);
        cover(b, px, py);
        if (rng() < 0.6) cover(b, px + 1, py);
        if (rng() < 0.35) cover(b, px, py + 1);
      }
    }
    for (let i = 0; i < 6 + Math.floor(rng() * 6); i++) {
      const p = randPoint(rng, w, h, 3);
      if (rng() < 0.5) cover(b, p.x, p.y);
      else if (b.grid[p.y] && b.grid[p.y][p.x] === '.') b.tile(p.x, p.y, 'D');
    }

    repairConnectivity(b, seed * 19 + attempt);
    b.site('A', a.x - 2, a.y - 2, 5, 5);
    b.site('B', bb.x - 2, bb.y - 2, 5, 5);
    b.spawn('t', t.x - 1, t.y - 1, 3, 3);
    b.spawn('c', c.x - 1, c.y - 1, 3, 3);

    const rows = b.rows();
    const has = rows.some((r) => r.includes('a')) && rows.some((r) => r.includes('b')) && rows.some((r) => r.includes('t')) && rows.some((r) => r.includes('c'));
    if (!has) continue;
    loadMap({ id: 'rand', name: 'rand', rows, tile: 16 });
    const map = getMap();
    const un = map.diagnostics ? map.diagnostics.unreachable.length : -1;
    if (un !== 0) continue;
    // 公平性门控：出生间距、双点可达、出生点远离爆破点
    if (map.spawns.t.length && map.spawns.ct.length && map.sites.A && map.sites.B) {
      const t0 = nearestWalkable(map.spawns.t[0].x, map.spawns.t[0].y);
      const c0 = nearestWalkable(map.spawns.ct[0].x, map.spawns.ct[0].y);
      if (!t0 || !c0) continue;
      if (Math.hypot(t0.x - c0.x, t0.y - c0.y) < 8) continue;
      let okReach = true;
      for (const key of ['A', 'B']) {
        const st = nearestWalkable(map.sites[key].cx, map.sites[key].cy);
        if (!st || !aStar(t0.x, t0.y, st.x, st.y) || !aStar(c0.x, c0.y, st.x, st.y)) { okReach = false; break; }
      }
      if (!okReach) continue;
      if (Math.hypot(t0.x - map.sites.A.cx, t0.y - map.sites.A.cy) < 6 || Math.hypot(c0.x - map.sites.B.cx, c0.y - map.sites.B.cy) < 6) continue;
      return { id: 'random-' + seed, name: '随机图 ' + String(seed).padStart(2, '0'), rows, size: w + 'x' + h, un };
    }
    return { id: 'random-' + seed, name: '随机图 ' + String(seed).padStart(2, '0'), rows, size: w + 'x' + h, un };
  }
  return null;
}

const names = ['锈蚀管道', '废弃车间', '地下通道', '旧船坞', '集装箱迷宫', '废墟仓库', '矿井夹层', '断桥泵站', '封存实验室', '暗巷枢纽'];
const maps = [];
for (let i = 0; i < 10; i++) {
  const m = generateMap(i + 1);
  if (m) { m.title = names[i] || m.name; maps.push(m); }
  else console.error('generate failed seed ' + (i + 1));
}

const data = maps.map((m) => ({ title: m.title, name: m.name, size: m.size, rows: m.rows }));
const json = JSON.stringify(data);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>随机地图 · 10 张</title>
<style>
  :root{--bg:#0f1216;--panel:#161a20;--line:#2a323c;--txt:#e8edf2;--sub:#8b96a3}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--txt);font-family:"Microsoft YaHei","PingFang SC",sans-serif;padding:26px 20px 50px}
  .wrap{max-width:1320px;margin:0 auto}
  .head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:16px}
  .head h1{font-size:24px;letter-spacing:2px}
  .head p{color:var(--sub);font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .map-frame{padding:10px;background:#0a0c0f;border-bottom:1px solid var(--line)}
  canvas{display:block;width:100%;height:auto;border-radius:8px}
  .meta{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;font-size:12px;color:var(--sub)}
  .meta b{color:var(--txt)}
</style>
</head>
<body>
<div class="wrap">
  <div class="head"><h1>随机地图 · 10 张</h1><p>随机生成 · 禁止对称 · 禁止大马路 · 禁止广场 · 全部为蜿蜒窄通道对枪结构</p></div>
  <div class="grid" id="grid"></div>
</div>
<script>
const MAPS = ${json};
const COLOR = {'#':'#3a424c','.':'#59636e','a':'#d45a5a','b':'#4d9bff','t':'#ffb545','c':'#5ab0ff','~':'#3d6f9e','≈':'#1d3a55','=':'#8a6d4d','^':'#7d8793','o':'#8b6f3e','D':'#8b6f3e','C':'#8b6f3e'};
function draw(canvas, rows){
  const h=rows.length,w=rows[0].length,cw=640,ch=Math.round(cw*h/w);
  canvas.width=cw;canvas.height=ch;
  const ctx=canvas.getContext('2d'),cell=cw/w;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    ctx.fillStyle=COLOR[rows[y][x]]||'#59636e';
    ctx.fillRect(x*cell,y*cell,cell+0.5,cell+0.5);
    if(rows[y][x]==='a'||rows[y][x]==='b'){ctx.fillStyle='rgba(255,255,255,.4)';ctx.font='bold '+Math.max(8,cell*.5)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(rows[y][x].toUpperCase(),x*cell+cell/2,y*cell+cell/2);}
  }
}
const grid=document.getElementById('grid');
for(const m of MAPS){
  const card=document.createElement('div');card.className='card';
  const frame=document.createElement('div');frame.className='map-frame';
  const cv=document.createElement('canvas');draw(cv,m.rows);frame.appendChild(cv);
  const meta=document.createElement('div');meta.className='meta';
  const name=document.createElement('b');name.textContent=m.title;
  const size=document.createElement('span');size.textContent=m.size;
  meta.appendChild(name);meta.appendChild(size);
  card.appendChild(frame);card.appendChild(meta);grid.appendChild(card);
}
</script>
</body>
</html>
`;
fs.writeFileSync('docs/random-maps.html', html, 'utf8');
console.log('generated maps=' + maps.length + ' html bytes=' + html.length);