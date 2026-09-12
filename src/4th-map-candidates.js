import { createBuilder } from './map-gen.js';
import { registerMap, MODE_MAPS } from './registry.js';

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
      const jitter = (noise(i, j, s) - 0.5) * 0.5;
      if (dx * dx + dy * dy <= 1 + jitter) b.tile(i, j, '.');
    }
  }
}

function lane(b, x0, y0, x1, y1, s, radius = 2.8) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const mid1 = { x: x0 + dx * 0.4 + nx * ((noise(s, 7, 3) - 0.5) * 12), y: y0 + dy * 0.4 + ny * ((noise(s, 11, 3) - 0.5) * 12) };
  const mid2 = { x: x0 + dx * 0.65 + nx * ((noise(s, 13, 5) - 0.5) * 12), y: y0 + dy * 0.65 + ny * ((noise(s, 17, 5) - 0.5) * 12) };
  const segments = [[x0, y0, mid1.x, mid1.y], [mid1.x, mid1.y, mid2.x, mid2.y], [mid2.x, mid2.y, x1, y1]];
  for (const [ax, ay, bx, by] of segments) {
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1) * 2;
    const sdx = bx - ax, sdy = by - ay;
    const slen = Math.hypot(sdx, sdy) || 1;
    const snx = -sdy / slen, sny = sdx / slen;
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      const baseX = ax + sdx * f, baseY = ay + sdy * f;
      const jitter = (noise(t, 7, s) - 0.5) * 3;
      const cx = baseX + snx * jitter;
      const cy = baseY + sny * jitter;
      blob(b, cx, cy, radius, radius, s + t * 0.03);
    }
  }
}

function cover(b, x, y) {
  if (b.grid[y] && b.grid[y][x] === '.') b.tile(x, y, 'C');
}

function coverLine(b, x0, y0, x1, y1, s, step = 6) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let t = 0; t <= steps; t += step) {
    const f = t / steps;
    const px = Math.round(x0 + (x1 - x0) * f + (noise(t, 3, s) - 0.5) * 2);
    const py = Math.round(y0 + (y1 - y0) * f + (noise(t, 5, s) - 0.5) * 2);
    cover(b, px, py);
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
    lane(b, start[0], start[1], target[0], target[1], seed + guard, 2);
    guard++;
    if (guard > 200) break;
  }
}

/* 边境熔炉：150x140，T 南 / CT 北 / A 西室外 / B 东室内 */
function lerpPt(a, b, f) {
  return { x: Math.round(a.x + (b.x - a.x) * f), y: Math.round(a.y + (b.y - a.y) * f) };
}

function buildFoundry(opts) {
  const b = createBuilder(opts.w, opts.h);
  border(b);
  const t = opts.t, c = opts.c, a = opts.a, bb = opts.b, m = opts.m;
  const s = opts.seed;
  blob(b, t.x, t.y, 7, 6, s + 1);
  blob(b, c.x, c.y, 7, 6, s + 2);
  blob(b, a.x, a.y, 8, 8, s + 3);
  blob(b, bb.x, bb.y, 8, 8, s + 4);
  blob(b, m.x, m.y, 7, 7, s + 5);

  // A 三条路
  lane(b, t.x, t.y, lerpPt(t, a, 0.4).x, lerpPt(t, a, 0.4).y, s + 11, 3.0);
  lane(b, lerpPt(t, a, 0.4).x, lerpPt(t, a, 0.4).y, a.x, a.y, s + 12, 2.8);
  lane(b, t.x, t.y, lerpPt(t, m, 0.6).x, lerpPt(t, m, 0.6).y, s + 13, 2.6);
  lane(b, lerpPt(t, m, 0.6).x, lerpPt(t, m, 0.6).y, lerpPt(a, m, 0.5).x, lerpPt(a, m, 0.5).y, s + 14, 2.4);
  lane(b, lerpPt(a, m, 0.5).x, lerpPt(a, m, 0.5).y, a.x, a.y, s + 15, 2.4);
  lane(b, t.x, t.y, a.x + 8, Math.max(t.y, a.y) - 4, s + 16, 2.4);
  lane(b, a.x + 8, Math.max(t.y, a.y) - 4, a.x, a.y, s + 17, 2.2);

  // B 三条路
  lane(b, t.x, t.y, lerpPt(t, bb, 0.4).x, lerpPt(t, bb, 0.4).y, s + 21, 3.0);
  lane(b, lerpPt(t, bb, 0.4).x, lerpPt(t, bb, 0.4).y, bb.x, bb.y, s + 22, 2.8);
  lane(b, t.x, t.y, lerpPt(t, m, 0.6).x, lerpPt(t, m, 0.6).y, s + 23, 2.6);
  lane(b, lerpPt(t, m, 0.6).x, lerpPt(t, m, 0.6).y, lerpPt(bb, m, 0.5).x, lerpPt(bb, m, 0.5).y, s + 24, 2.4);
  lane(b, lerpPt(bb, m, 0.5).x, lerpPt(bb, m, 0.5).y, bb.x, bb.y, s + 25, 2.4);
  lane(b, t.x, t.y, bb.x - 8, Math.max(t.y, bb.y) - 4, s + 26, 2.4);
  lane(b, bb.x - 8, Math.max(t.y, bb.y) - 4, bb.x, bb.y, s + 27, 2.2);

  // 中路：断桥与地下交错
  const jit = opts.midJit || 6;
  lane(b, c.x, c.y, c.x + jit, c.y + 12, s + 31, 2.6);
  lane(b, c.x + jit, c.y + 12, m.x - jit, m.y - 10, s + 32, 2.4);
  lane(b, m.x - jit, m.y - 10, m.x, m.y, s + 33, 2.4);
  lane(b, t.x, t.y, t.x - jit, t.y - 12, s + 34, 2.6);
  lane(b, t.x - jit, t.y - 12, m.x + jit, m.y + 10, s + 35, 2.4);
  lane(b, m.x + jit, m.y + 10, m.x, m.y, s + 36, 2.4);

  // CT 回防
  lane(b, c.x, c.y, lerpPt(c, a, 0.55).x, lerpPt(c, a, 0.55).y, s + 41, 2.6);
  lane(b, lerpPt(c, a, 0.55).x, lerpPt(c, a, 0.55).y, a.x, a.y, s + 42, 2.4);
  lane(b, c.x, c.y, lerpPt(c, bb, 0.55).x, lerpPt(c, bb, 0.55).y, s + 43, 2.6);
  lane(b, lerpPt(c, bb, 0.55).x, lerpPt(c, bb, 0.55).y, bb.x, bb.y, s + 44, 2.4);

  // 西侧室外掩体与高台
  for (let i = 0; i < opts.westCover; i++) {
    const px = Math.min(a.x + 6 + i * 7, m.x - 8);
    const py = a.y + ((i * 5) % 22) - 8;
    cover(b, px, py); if (i % 2 === 0) cover(b, px + 1, py);
  }
  for (let x = a.x + 6; x < m.x - 8; x += 10) b.tile(x, a.y - 10, '^');
  // 东侧室内货架与薄墙
  for (let i = 0; i < opts.eastCover; i++) {
    const px = Math.min(bb.x - 6 - i * 6, m.x + 8);
    const py = bb.y + ((i * 7) % 20) - 8;
    cover(b, px, py); if (i % 3 === 0) cover(b, px, py + 1);
  }
  for (let y = bb.y - 12; y <= bb.y + 12; y += 8) { b.tile(m.x + 8, y, '='); b.tile(bb.x - 8, y, '='); }
  cover(b, m.x, m.y - 4); cover(b, m.x, m.y + 4);

  repairConnectivity(b, s + 51);
  b.site('A', a.x - 5, a.y - 5, 10, 10);
  b.site('B', bb.x - 5, bb.y - 5, 10, 10);
  b.spawn('t', t.x - 5, t.y - 4, 10, 8);
  b.spawn('c', c.x - 5, c.y - 4, 10, 8);
  return scaleRows(b.rows(), opts.fx || 0.6, opts.fy || 0.6);
}

export const FOURTH_MAP_CANDIDATES = [
  {
    id: 'foundry-port',
    name: '熔炉港区',
    accent: '#ff9a4d',
    theme: '港口工业区',
    tagline: '西港口长枪 · 东仓库短枪 · 中路绕行',
    description: '边境熔炉的港口变体：西侧为开阔装卸区，A 点靠近码头；东侧为密封仓库，B 点藏在货架深处。中路改为两段绕行，不再直穿。',
    features: ['西码头 / 东仓库', 'A/B 各三路', '中路两段绕行', '掩体链与高台'],
    rows: buildFoundry({ w: 150, h: 140, seed: 801, fx: 0.6, fy: 0.6, midJit: 8, westCover: 10, eastCover: 12, t: {x:70,y:118}, c: {x:70,y:22}, a: {x:18,y:78}, b: {x:132,y:62}, m: {x:70,y:70} })
  },
  {
    id: 'foundry-ridge',
    name: '熔炉高地',
    accent: '#c9a15f',
    theme: '山地工业区',
    tagline: '西高台长枪 · 东地下短枪 · 中路隧道',
    description: '边境熔炉的高地变体：西侧 A 点位于高台，长枪架枪位更多；东侧 B 点转入地下车间，近战环境更密。中路以隧道连接南北，控制权决定转点节奏。',
    features: ['西高台 / 东地下', 'A/B 各三路', '中路隧道', '高低差明显'],
    rows: buildFoundry({ w: 150, h: 140, seed: 802, fx: 0.6, fy: 0.6, midJit: 10, westCover: 12, eastCover: 14, t: {x:70,y:118}, c: {x:70,y:22}, a: {x:26,y:58}, b: {x:124,y:82}, m: {x:70,y:70} })
  },
  {
    id: 'foundry-ruin',
    name: '熔炉废墟',
    accent: '#b58a52',
    theme: '战损工业区',
    tagline: '西废墟长枪 · 东厂房短枪 · 中路残垣',
    description: '边境熔炉的战损变体：西侧废墟开放但被残垣分段，A 点位于塌陷厂房；东侧旧厂房通道更窄，B 点近战密度更高。中路布满残垣，绕后路更丰富。',
    features: ['西废墟 / 东厂房', 'A/B 各三路', '中路残垣', '近战密度更高'],
    rows: buildFoundry({ w: 150, h: 140, seed: 803, fx: 0.6, fy: 0.6, midJit: 12, westCover: 14, eastCover: 16, t: {x:70,y:118}, c: {x:70,y:22}, a: {x:18,y:62}, b: {x:128,y:78}, m: {x:70,y:70} })
  }
];

export function chosenFourthMap() {
  try {
    const id = globalThis.localStorage && globalThis.localStorage.getItem('cs2d_map_choice_4th');
    return FOURTH_MAP_CANDIDATES.find((m) => m.id === id) || FOURTH_MAP_CANDIDATES[0];
  } catch (e) { return FOURTH_MAP_CANDIDATES[0]; }
}

export function installChosenFourthMap() {
  const m = chosenFourthMap();
  if (!m) return null;
  registerMap({ id: m.id, name: m.name, accent: m.accent, rows: m.rows, category: 'bomb5v5' });
  // 进 major/career 竞技轮换：此前只注册不进 MODE_MAPS，装了也轮不到（内容白装）
  if (!MODE_MAPS.includes(m.id)) MODE_MAPS.push(m.id);
  if (typeof window !== 'undefined' && window.__syncMapCards) window.__syncMapCards();
  return m;
}
