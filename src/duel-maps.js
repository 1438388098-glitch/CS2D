import { createBuilder } from './map-gen.js';

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

function lane(b, x0, y0, x1, y1, s, radius = 1.8) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const mid1 = { x: x0 + dx * 0.4 + nx * ((noise(s, 7, 3) - 0.5) * 8), y: y0 + dy * 0.4 + ny * ((noise(s, 11, 3) - 0.5) * 8) };
  const mid2 = { x: x0 + dx * 0.65 + nx * ((noise(s, 13, 5) - 0.5) * 8), y: y0 + dy * 0.65 + ny * ((noise(s, 17, 5) - 0.5) * 8) };
  const segments = [[x0, y0, mid1.x, mid1.y], [mid1.x, mid1.y, mid2.x, mid2.y], [mid2.x, mid2.y, x1, y1]];
  for (const [ax, ay, bx, by] of segments) {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1) * 2;
    const sdx = bx - ax, sdy = by - ay;
    const slen = Math.hypot(sdx, sdy) || 1;
    const snx = -sdy / slen, sny = sdx / slen;
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      const baseX = ax + sdx * f, baseY = ay + sdy * f;
      const jitter = (noise(t, 7, s) - 0.5) * 2;
      const cx = baseX + snx * jitter;
      const cy = baseY + sny * jitter;
      blob(b, cx, cy, radius, radius, s + t * 0.03);
    }
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
    lane(b, start[0], start[1], target[0], target[1], seed + guard, 1.5);
    guard++;
    if (guard > 80) break;
  }
}

function scaleRows(rows, fx, fy) {
  const w = rows[0].length, h = rows.length;
  const nw = Math.max(16, Math.round(w * fx));
  const nh = Math.max(16, Math.round(h * fy));
  const out = Array.from({ length: nh }, () => Array(nw).fill('#'));
  for (let ny = 0; ny < nh; ny++) for (let nx = 0; nx < nw; nx++) {
    const ox = Math.min(w - 1, Math.floor(nx / fx));
    const oy = Math.min(h - 1, Math.floor(ny / fy));
    out[ny][nx] = rows[oy][ox];
  }
  return out.map((r) => r.join(''));
}

function buildDuelMap(opts) {
  const b = createBuilder(opts.w, opts.h);
  border(b);
  const t = opts.t, c = opts.c, a = opts.a, bb = opts.b, m = opts.m;
  const s = opts.seed;
  blob(b, t.x, t.y, 3, 3, s + 1);
  blob(b, c.x, c.y, 3, 3, s + 2);
  blob(b, a.x, a.y, 3, 3, s + 3);
  blob(b, bb.x, bb.y, 3, 3, s + 4);
  blob(b, m.x, m.y, 3, 3, s + 5);
  lane(b, t.x, t.y, m.x, m.y, s + 11, 1.8);
  lane(b, c.x, c.y, m.x, m.y, s + 12, 1.8);
  lane(b, t.x, t.y, a.x, a.y, s + 13, 1.7);
  lane(b, t.x, t.y, bb.x, bb.y, s + 14, 1.7);
  lane(b, c.x, c.y, a.x, a.y, s + 15, 1.7);
  lane(b, c.x, c.y, bb.x, bb.y, s + 16, 1.7);
  lane(b, m.x, m.y, a.x, a.y, s + 17, 1.6);
  lane(b, m.x, m.y, bb.x, bb.y, s + 18, 1.6);
  for (let i = 0; i < opts.cover; i++) {
    const px = 4 + Math.floor(noise(i, 2, s) * (opts.w - 8));
    const py = 4 + Math.floor(noise(i, 5, s) * (opts.h - 8));
    cover(b, px, py);
  }
  repairConnectivity(b, s + 21);
  b.site('A', a.x - 1, a.y - 1, 3, 3);
  b.site('B', bb.x - 1, bb.y - 1, 3, 3);
  b.spawn('t', t.x - 1, t.y - 1, 3, 3);
  b.spawn('c', c.x - 1, c.y - 1, 3, 3);
  return scaleRows(b.rows(), opts.fx || 0.7, opts.fy || 0.7);
}

export const DUEL_MAPS = [
  {
    id: 'duel-pit',
    name: '斗技坑',
    accent: '#d45a5a',
    tagline: '环形斗场 · 中央立柱 · 快节奏对枪',
    description: '小尺寸环形 1v1 图：T/CT 对角出生，中央立柱分割视线，两条蜿蜒环道可以互相绕后。适合冲锋枪/喷子近战。',
    rows: buildDuelMap({ w: 46, h: 38, seed: 901, fx: 0.8, fy: 0.8, cover: 12, t: {x:8,y:32}, c: {x:38,y:6}, a: {x:12,y:8}, b: {x:34,y:30}, m: {x:23,y:19} })
  },
  {
    id: 'duel-alley',
    name: '残巷对决',
    accent: '#b58a52',
    tagline: '双巷交错 · 残垣掩体 · 拉扯对枪',
    description: '两条蜿蜒残巷十字交错，A/B 藏在巷口，出生点带缓冲小间。路线短但转折多，适合中近距离拉扯。',
    rows: buildDuelMap({ w: 48, h: 40, seed: 902, fx: 0.8, fy: 0.8, cover: 14, t: {x:8,y:8}, c: {x:40,y:32}, a: {x:12,y:30}, b: {x:36,y:10}, m: {x:24,y:20} })
  },
  {
    id: 'duel-forge',
    name: '熔炉单挑',
    accent: '#ff9a4d',
    tagline: '熔炉中枢 · 两侧包点 · 近战压制',
    description: '小型熔炉车间：中央熔炉房连接两侧包点，通道窄、转折多，出生点各带一个缓冲拐角。主打贴脸与中距压制。',
    rows: buildDuelMap({ w: 44, h: 36, seed: 903, fx: 0.8, fy: 0.8, cover: 13, t: {x:8,y:18}, c: {x:36,y:18}, a: {x:12,y:6}, b: {x:32,y:30}, m: {x:22,y:18} })
  }
];