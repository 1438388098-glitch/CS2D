import { registerMap, getMapDef, getMaps } from './registry.js';
import { startMatch } from './game.js';
import { loadMap, getMap, aStar, nearestWalkable } from './map.js';

let game = null;
let ed = null;
let canvas = null;
let ctx = null;
const CUSTOM_MAPS_KEY = 'cs2d_editor_maps';
const LEGACY_CUSTOM_KEY = 'cs2d_editor_map';
let customMapsCache = null;

function $(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }

const PALETTE = {
  '#': ['墙体', '#3a414d'],
  '.': ['地面', '#9aa08c'],
  'C': ['掩体箱', '#8a6a45'],
  'D': ['可破坏木箱', '#b58a52'],
  '=': ['薄墙', '#b7a06b'],
  '^': ['高台', '#7b8797'],
  'R': ['屋顶', '#8a93a3'],
  '~': ['浅水', '#4d9fd6'],
  '≈': ['深水', '#173c63'],
  'o': ['油桶', '#c2543a'],
  'a': ['A 点', '#ff8a4d'],
  'b': ['B 点', '#5aa6ff'],
  't': ['T 出生', '#ffb84d'],
  'c': ['CT 出生', '#4da6ff']
};

function defaultRows(w, h) {
  const rows = Array.from({ length: h }, () => Array(w).fill('#'));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) rows[y][x] = '.';
  return rows;
}

function storageGet(key) {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch (err) { return null; }
}

function storageSet(key, val) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, val); } catch (err) { /* no storage */ }
}

function normalizeCustomMap(obj, id) {
  return {
    id: id || obj.id || 'custom-map',
    name: obj.name || '自定义地图',
    accent: obj.accent || '#6ad1a8',
    tile: obj.tile || 16,
    rows: Array.isArray(obj.rows) ? obj.rows.map((r) => String(r)) : [],
    penPoints: Array.isArray(obj.penPoints) ? obj.penPoints : [],
    highPoints: Array.isArray(obj.highPoints) ? obj.highPoints : [],
    category: 'custom'
  };
}

function readCustomMaps() {
  if (customMapsCache) return customMapsCache;
  let list = [];
  const raw = storageGet(CUSTOM_MAPS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.filter((m) => m && Array.isArray(m.rows) && m.rows.length);
    } catch (err) { /* fallback to legacy */ }
  }
  if (!list.length) {
    const legacy = storageGet(LEGACY_CUSTOM_KEY);
    if (legacy) {
      try {
        const obj = JSON.parse(legacy);
        if (obj && Array.isArray(obj.rows) && obj.rows.length) list.push(normalizeCustomMap(obj, obj.id || 'custom-map'));
      } catch (err) { /* ignore */ }
    }
  }
  customMapsCache = list;
  return list;
}

function writeCustomMaps(list) {
  customMapsCache = list;
  storageSet(CUSTOM_MAPS_KEY, JSON.stringify(list));
}

function nextCustomId(name) {
  const slug = String(name || 'map').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'map';
  const base = 'custom-' + slug.slice(0, 20) + '-' + Date.now().toString(36);
  const taken = new Set(readCustomMaps().map((m) => m.id));
  let id = base;
  let n = 2;
  while (taken.has(id) || getMapDef(id)) id = base + '-' + n++;
  return id;
}

function rowsToArr(rows) { return rows.map((r) => (typeof r === 'string' ? r.split('') : r.slice())); }
function arrToRows(arr) { return arr.map((r) => r.join('')); }
function snapshot() { return rowsToArr(ed.rows); }
function pushHistory() {
  ed.history = ed.history.slice(0, ed.historyIdx + 1);
  ed.history.push(snapshot());
  if (ed.history.length > 60) ed.history.shift();
  ed.historyIdx = ed.history.length - 1;
}
function restore(idx) {
  if (idx < 0 || idx >= ed.history.length) return;
  ed.rows = arrToRows(ed.history[idx].map((r) => r.slice()));
  ed.historyIdx = idx;
  drawEditor();
}

function status(text, warn) {
  const st = $('editorStatus');
  if (st) { st.textContent = text; st.style.color = warn ? '#ff7d7d' : '#9ad0ff'; }
}

function toggleEditorHelp() {
  const help = $('editorHelp');
  if (!help) return;
  help.style.display = help.style.display === 'none' ? 'block' : 'none';
}

function templateOptions() {
  const maps = Array.from(getMaps().values())
    .filter((m) => m && m.rows && Array.isArray(m.rows) && m.rows.length)
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-CN'));
  const label = (m) => {
    const kind = m.category === 'duel' ? '[单挑] ' : m.category === 'custom' ? '[自定义] ' : '[5v5] ';
    return kind + String(m.name || m.id).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  };
  return '<option value="">— 新建空白 —</option>' + maps.map((m) => '<option value="' + String(m.id).replace(/"/g, '&quot;') + '">' + label(m) + '</option>').join('');
}

function refreshTemplateOptions() {
  const tpl = $('editorTemplate');
  if (!tpl) return;
  tpl.innerHTML = templateOptions();
  tpl.value = ed && (ed.savedId || ed.sourceId || '');
}

function syncMetaInputs() {
  const name = $('editorName'), w = $('editorW'), h = $('editorH');
  if (name) name.value = ed.name || '自定义地图';
  const accent = $('editorAccent');
  if (accent) accent.value = ed.accent || '#6ad1a8';
  const tag = $('editorTagline');
  if (tag) tag.value = ed.tagline || '';
  if (w) w.value = ed.rows[0].length;
  if (h) h.value = ed.rows.length;
}

function buildMapMeta(rows) {
  const pts = { a: [], b: [] };
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const c = rows[y][x];
    if (c === 'a' || c === 'b') pts[c].push([x, y]);
  }
  const penPoints = [];
  for (const key of ['a', 'b']) {
    if (!pts[key].length) continue;
    const cx = pts[key].reduce((s, p2) => s + p2[0], 0) / pts[key].length;
    const cy = pts[key].reduce((s, p2) => s + p2[1], 0) / pts[key].length;
    penPoints.push({ x: (cx + 0.5) * 16, y: (cy + 0.5) * 16 });
  }
  // 自动推导 highPoints：从 ^/R 屋顶连通簇取中心点，标定到最近的爆破点站点
  const sites = { A: pts.a, B: pts.b };
  const siteCenter = {};
  for (const [key, arr] of Object.entries(sites)) {
    if (!arr.length) continue;
    siteCenter[key] = {
      x: (arr.reduce((s, p2) => s + p2[0], 0) / arr.length + 0.5) * 16,
      y: (arr.reduce((s, p2) => s + p2[1], 0) / arr.length + 0.5) * 16
    };
  }
  const visited = new Set();
  const highPoints = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c !== '^' && c !== 'R') continue;
      const k = y + ',' + x;
      if (visited.has(k)) continue;
      // BFS 连通簇
      const stack = [[x, y]];
      visited.add(k);
      const cells = [];
      while (stack.length) {
        const [cx2, cy2] = stack.pop();
        cells.push([cx2, cy2]);
        for (const [nx, ny] of [[cx2 + 1, cy2], [cx2 - 1, cy2], [cx2, cy2 + 1], [cx2, cy2 - 1]]) {
          if (ny < 0 || ny >= rows.length || nx < 0 || nx >= rows[ny].length) continue;
          const cc = rows[ny][nx];
          if (cc !== '^' && cc !== 'R') continue;
          const nk = ny + ',' + nx;
          if (visited.has(nk)) continue;
          visited.add(nk);
          stack.push([nx, ny]);
        }
      }
      if (cells.length < 2) continue;
      const hx = cells.reduce((s, p2) => s + p2[0], 0) / cells.length;
      const hy = cells.reduce((s, p2) => s + p2[1], 0) / cells.length;
      const wx = (hx + 0.5) * 16, wy = (hy + 0.5) * 16;
      let site = 'mid', bestD = Infinity;
      for (const [key, sc] of Object.entries(siteCenter)) {
        const d = Math.hypot(wx - sc.x, wy - sc.y);
        if (d < bestD) { bestD = d; site = key; }
      }
      const face = siteCenter[site] ? Math.atan2(siteCenter[site].y - wy, siteCenter[site].x - wx) : 0;
      highPoints.push({ x: wx, y: wy, face, site });
    }
  }
  return { penPoints, highPoints };
}
export function computeMapMeta(rows) { return buildMapMeta(rows); }
function exportObject() {
  const rows = ed.rows.slice();
  const meta = buildMapMeta(rows);
  const id = ed.savedId || nextCustomId(ed.name);
  const accentEl = $('editorAccent'), tagEl = $('editorTagline');
  const obj = {
    id,
    name: ed.name || '自定义地图',
    accent: (accentEl && accentEl.value) || ed.accent || '#6ad1a8',
    tile: 16,
    rows,
    penPoints: meta.penPoints,
    highPoints: (ed.highPoints || meta.highPoints).slice(),
    category: 'custom'
  };
  const tag = (tagEl && tagEl.value.trim()) || ed.tagline || '';
  if (tag) obj.tagline = tag;
  return obj;
}

function saveRows() {
  const obj = exportObject();
  const maps = readCustomMaps().filter((m) => m && m.id !== obj.id);
  maps.push(obj);
  writeCustomMaps(maps);
  registerMap({ id: obj.id, name: obj.name, accent: obj.accent, rows: obj.rows.slice(), tile: obj.tile || 16, penPoints: obj.penPoints || [], highPoints: obj.highPoints || [], category: 'custom' });
  ed.savedId = obj.id;
  ed.sourceId = obj.id;
  const ta = $('editorJson');
  if (ta) ta.value = JSON.stringify(obj);
  refreshTemplateOptions();
  if (window.__syncMapCards) window.__syncMapCards();
  if (window.__addMenuMapPreview) window.__addMenuMapPreview(obj.id);
  if (window.__refreshMapPreviews) window.__refreshMapPreviews();
  status('已保存自定义地图：' + obj.name);
}

function loadRows() {
  const maps = readCustomMaps();
  const target = ed && ed.savedId
    ? maps.find((m) => m.id === ed.savedId)
    : maps[maps.length - 1];
  if (target) {
    loadMapData(target, target.id, target.id);
    status('已读取地图：' + target.name);
    return;
  }
  status('暂无本地存档', true);
}

function editorMetrics() {
  const w = ed.rows[0].length, h = ed.rows.length;
  const zoom = Math.max(0.5, Math.min(4, ed.zoom || 1));
  const base = Math.min(canvas.width / w, canvas.height / h);
  const cell = base * zoom;
  return { w, h, cell, ox: (canvas.width - w * cell) / 2 + (ed.panX || 0), oy: (canvas.height - h * cell) / 2 + (ed.panY || 0), zoom };
}

function drawEditor() {
  if (!canvas || !ctx || !ed || !ed.rows || !ed.rows.length) return;
  const { w, h, cell, ox, oy } = editorMetrics();
  ctx.fillStyle = '#101318';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1f26';
  ctx.fillRect(ox, oy, w * cell, h * cell);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (ed.rows[y] || '')[x] || '#';
      const px = ox + x * cell, py = oy + y * cell;
      ctx.fillStyle = (PALETTE[c] || PALETTE['#'])[1];
      ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      if (c === 'a' || c === 'b' || c === 't' || c === 'c' || c === 'o' || c === 'D') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = 'bold ' + Math.max(8, cell * 0.5) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.toUpperCase(), px + cell / 2, py + cell / 2);
      }
    }
  }
  if (ed.grid !== false) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) { ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + h * cell); }
    for (let y = 0; y <= h; y++) { ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + w * cell, oy + y * cell); }
    ctx.stroke();
  }
  // 选区叠加层（框选预览 / 拖拽移动预览）
  if (ed.selBox) {
    let bx = ed.selBox;
    if (ed.selMove) {
      bx = { x0: ed.selBox.x0 + ed.selMove.dx, y0: ed.selBox.y0 + ed.selMove.dy, x1: ed.selBox.x1 + ed.selMove.dx, y1: ed.selBox.y1 + ed.selMove.dy };
    }
    const px0 = ox + bx.x0 * cell, py0 = oy + bx.y0 * cell;
    const pwid = (bx.x1 - bx.x0 + 1) * cell, phei = (bx.y1 - bx.y0 + 1) * cell;
    ctx.fillStyle = 'rgba(255,138,42,.10)';
    ctx.fillRect(px0, py0, pwid, phei);
    ctx.strokeStyle = '#ff8a2a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(px0, py0, pwid, phei);
    ctx.setLineDash([]);
  }
  const st = $('editorStatus');
  if (st && !st.dataset.keep) status(ed.name + ' · ' + w + 'x' + h + ' · ' + PALETTE[ed.sel][0] + ' · ' + ed.tool);
}

function cellAt(ev) {
  const r = canvas.getBoundingClientRect();
  const { w, h, cell, ox, oy } = editorMetrics();
  const scaleX = r.width / canvas.width, scaleY = r.height / canvas.height;
  const px = (ev.clientX - r.left) / scaleX - ox;
  const py = (ev.clientY - r.top) / scaleY - oy;
  return { tx: Math.floor(px / cell), ty: Math.floor(py / cell) };
}

function brushCells(tx, ty, b, circle) {
  const out = [];
  const half = Math.floor(b / 2);
  for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
    if (circle && Math.hypot(dx, dy) > b / 2) continue;
    out.push([tx + dx, ty + dy]);
  }
  return out;
}

function mirrorCells(w, h, cells, mirror) {
  if (!mirror || mirror === 'none') return cells;
  const out = cells.slice();
  const add = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) out.push([x, y]); };
  for (const [x, y] of cells) {
    const mx = w - 1 - x, my = h - 1 - y;
    if (mirror === 'h') add(mx, y);
    else if (mirror === 'v') add(x, my);
    else if (mirror === 'quad') { add(mx, y); add(x, my); add(mx, my); }
  }
  return out;
}

function applyCellsToRows(rows, cells, ch) {
  for (const [x, y] of cells) { if (x >= 0 && y >= 0 && x < rows[0].length && y < rows.length) rows[y][x] = ch; }
}

function applyBrush(state, tx, ty) {
  const rows = rowsToArr(state.rows);
  let cells = brushCells(tx, ty, Math.max(1, state.brush || 1), state.brushCircle);
  cells = mirrorCells(rows[0].length, rows.length, cells, state.mirror);
  applyCellsToRows(rows, cells, state.sel);
  state.rows = arrToRows(rows);
}

function floodFill(state, tx, ty) {
  const rows = rowsToArr(state.rows);
  const target = rows[ty][tx];
  if (target === state.sel) return;
  const stack = [[tx, ty]];
  const w = rows[0].length, h = rows.length;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || rows[y][x] !== target) continue;
    rows[y][x] = state.sel;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  state.rows = arrToRows(rows);
}

function lineCells(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return out;
}

function applyLine(state, ax, ay, tx, ty) {
  const rows = rowsToArr(state.rows);
  let cells = lineCells(ax, ay, tx, ty);
  cells = mirrorCells(rows[0].length, rows.length, cells, state.mirror);
  applyCellsToRows(rows, cells, state.sel);
  state.rows = arrToRows(rows);
}

function applyRect(state, ax, ay, tx, ty) {
  const rows = rowsToArr(state.rows);
  const x0 = Math.min(ax, tx), x1 = Math.max(ax, tx), y0 = Math.min(ay, ty), y1 = Math.max(ay, ty);
  let cells = [];
  if (state.hollow) {
    for (let x = x0; x <= x1; x++) { cells.push([x, y0], [x, y1]); }
    for (let y = y0; y <= y1; y++) { cells.push([x0, y], [x1, y]); }
  } else {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y]);
  }
  cells = mirrorCells(rows[0].length, rows.length, cells, state.mirror);
  applyCellsToRows(rows, cells, state.sel);
  state.rows = arrToRows(rows);
}

// 矩形/直线两段式交互：第一次点击只设 anchor，第二次点击才落笔并清空。
export function shapeStep(state, tx, ty) {
  if (!state.anchor) {
    state.anchor = { tx, ty };
    return;
  }
  if (state.tool === 'rect') applyRect(state, state.anchor.tx, state.anchor.ty, tx, ty);
  else applyLine(state, state.anchor.tx, state.anchor.ty, tx, ty);
  state.anchor = null;
}

// ===== 选区工具 =====
function normBox(x0, y0, x1, y1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}
function selW() { return ed.selBox.x1 - ed.selBox.x0 + 1; }
function selH() { return ed.selBox.y1 - ed.selBox.y0 + 1; }
function inSel(tx, ty) {
  return ed.selBox && tx >= ed.selBox.x0 && tx <= ed.selBox.x1 && ty >= ed.selBox.y0 && ty <= ed.selBox.y1;
}
function selRegion() {
  const out = [];
  for (let y = ed.selBox.y0; y <= ed.selBox.y1; y++) {
    out.push((ed.rows[y] || '').slice(ed.selBox.x0, ed.selBox.x1 + 1));
  }
  return out;
}
function clearSelRegion(rows, ch) {
  for (let y = ed.selBox.y0; y <= ed.selBox.y1; y++) {
    for (let x = ed.selBox.x0; x <= ed.selBox.x1; x++) {
      if (y >= 0 && x >= 0 && y < rows.length && x < rows[y].length) rows[y][x] = ch;
    }
  }
}
function writeRegion(rows, content, ox, oy) {
  for (let y = 0; y < content.length; y++) {
    const r = content[y];
    for (let x = 0; x < r.length; x++) {
      const gx = ox + x, gy = oy + y;
      if (gx >= 0 && gy >= 0 && gy < rows.length && gx < rows[gy].length) rows[gy][gx] = r[x];
    }
  }
}
function commitSelectionEdit() {
  pushHistory();
  ed.selCells = selRegion().map((r) => r.slice());
  drawEditor();
}
function selectionOps() {
  if (!ed || !ed.selBox) return;
  const rows = rowsToArr(ed.rows);
  const content = selRegion();
  clearSelRegion(rows, '.');
  return { rows, content };
}
function selectCopy() {
  if (!ed || !ed.selBox) { status('请先框选区域', true); return; }
  ed.clipboard = selRegion().map((r) => r.slice());
  status('已复制 ' + selW() + 'x' + selH() + ' 区域');
}
function selectCut() {
  if (!ed || !ed.selBox) { status('请先框选区域', true); return; }
  ed.clipboard = selRegion().map((r) => r.slice());
  const r = selectionOps();
  ed.rows = arrToRows(r.rows);
  commitSelectionEdit();
  status('已剪切选区');
}
function selectDelete() {
  if (!ed || !ed.selBox) { status('请先框选区域', true); return; }
  const r = selectionOps();
  ed.rows = arrToRows(r.rows);
  commitSelectionEdit();
  status('已删除选区');
}
function selectPaste() {
  if (!ed || !ed.clipboard || !ed.clipboard.length) { status('剪贴板为空', true); return; }
  const rows = rowsToArr(ed.rows);
  const ox = ed.selBox ? ed.selBox.x0 : 1, oy = ed.selBox ? ed.selBox.y0 : 1;
  writeRegion(rows, ed.clipboard, ox, oy);
  ed.rows = arrToRows(rows);
  ed.selBox = normBox(ox, oy, ox + ed.clipboard[0].length - 1, oy + ed.clipboard.length - 1);
  commitSelectionEdit();
  status('已粘贴选区');
}
function selectRotate() {
  if (!ed || !ed.selBox) { status('请先框选区域', true); return; }
  const rows = rowsToArr(ed.rows);
  const content = selRegion();
  clearSelRegion(rows, '.');
  const h = content.length, w = content[0].length;
  const rot = Array.from({ length: w }, () => '');
  for (let x = 0; x < w; x++) { let s = ''; for (let y = h - 1; y >= 0; y--) s += content[y][x]; rot[x] = s; }
  writeRegion(rows, rot, ed.selBox.x0, ed.selBox.y0);
  ed.rows = arrToRows(rows);
  ed.selBox = normBox(ed.selBox.x0, ed.selBox.y0, ed.selBox.x0 + rot[0].length - 1, ed.selBox.y0 + rot.length - 1);
  commitSelectionEdit();
  status('已旋转 90°');
}
function flipRegion(content, horiz) {
  return horiz ? content.map((r) => r.split('').reverse().join('')) : content.slice().reverse();
}
function selectFlipH() {
  if (!ed || !ed.selBox) { status('请先框选区域', true); return; }
  const r = selectionOps();
  writeRegion(r.rows, flipRegion(r.content, true), ed.selBox.x0, ed.selBox.y0);
  ed.rows = arrToRows(r.rows);
  commitSelectionEdit();
  status('已水平翻转');
}
function selectFlipV() {
  if (!ed || !ed.selBox) { status('请先框选区域', true); return; }
  const r = selectionOps();
  writeRegion(r.rows, flipRegion(r.content, false), ed.selBox.x0, ed.selBox.y0);
  ed.rows = arrToRows(r.rows);
  commitSelectionEdit();
  status('已垂直翻转');
}
function selectClear() {
  if (!ed) return;
  ed.selBox = null; ed.selCells = null; ed.selMove = null; ed.selAnchor = null;
  drawEditor();
  status('已取消选区');
}
function moveSelBy(dx, dy) {
  const rows = rowsToArr(ed.rows);
  const content = selRegion();
  clearSelRegion(rows, '.');
  const nx = ed.selBox.x0 + dx, ny = ed.selBox.y0 + dy;
  writeRegion(rows, content, nx, ny);
  ed.rows = arrToRows(rows);
  ed.selBox.x0 = nx; ed.selBox.y0 = ny;
  ed.selBox.x1 = nx + selW() - 1; ed.selBox.y1 = ny + selH() - 1;
  ed.selCells = selRegion().map((r) => r.slice());
}

function syncPaletteSelection() {
  const el = $('editorPalette');
  if (!el || !ed) return;
  for (const b of el.children) b.classList.toggle('sel', b.textContent === String(ed.sel).toUpperCase());
}
function setTool(tool) {
  if (!ed) return;
  ed.tool = tool;
  const ids = { paint: "editorToolPaint", fill: "editorToolFill", rect: "editorToolRect", line: "editorToolLine", pick: "editorToolPick", select: "editorToolSelect" };
  for (const [key, id] of Object.entries(ids)) {
    const b = $(id);
    if (b) b.classList.toggle("sel", ed.tool === key);
  }
  drawEditor();
}

function paintAt(state, ev, commit) {
  if (!state || !state.rows) return;
  const { tx, ty } = cellAt(ev);
  if (tx < 0 || ty < 0 || tx >= state.rows[0].length || ty >= state.rows.length) return;
  if (state.tool === 'select') {
    if (inSel(tx, ty)) {
      state.selMove = { sx: tx, sy: ty, dx: 0, dy: 0, bx0: state.selBox.x0, by0: state.selBox.y0 };
      state.selAnchor = null;
    } else {
      state.selBox = normBox(tx, ty, tx, ty);
      state.selCells = null;
      state.selAnchor = { tx, ty };
      state.selMove = null;
    }
    drawEditor();
    return;
  }
  if (state.tool === 'pick') {
    const c = state.rows[ty][tx] || '#';
    state.sel = c;
    syncPaletteSelection();
    drawEditor();
    status('取色 ' + (PALETTE[c] ? PALETTE[c][0] : c) + ' (' + c + ')');
    return;
  }
  if (state.tool === 'fill') {
    pushHistory();
    floodFill(state, tx, ty);
    drawEditor();
    return;
  }
  if (state.tool === 'rect' || state.tool === 'line') {
    pushHistory();
    shapeStep(state, tx, ty);
    drawEditor();
    return;
  }
  if (commit) pushHistory();
  applyBrush(state, tx, ty);
  drawEditor();
}

export function openMapEditor(gameRef, mapId) {
  game = gameRef;
  game.state = 'EDITOR';
  game.over = false;
  const ov = $('editorOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  const menu = $('menu');
  if (menu) menu.classList.remove('show');
  ed = game.editor = game.editor || { rows: null, sel: '#', name: '自定义地图', accent: '#6ad1a8', tagline: '', tool: 'paint', brush: 1, brushCircle: false, hollow: false, mirror: 'none', grid: true, panX: 0, panY: 0, history: [], historyIdx: -1, drawing: false, anchor: null, selBox: null, selCells: null, selMove: null, selAnchor: null, clipboard: null, spaceDown: false };
  if (!ed.rows || !ed.rows.length) {
    ed.rows = defaultRows(40, 30);
    pushHistory();
  }
  const customDef = mapId ? readCustomMaps().find((m) => m.id === mapId) : null;
  const target = customDef || (mapId ? getMapDef(mapId) : null);
  if (target) {
    if (customDef) registerMap({ ...customDef, rows: customDef.rows.slice() });
    loadMapData(target, target.category === 'custom' ? target.id : null, mapId);
  }
  canvas = $('editorCanvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  if (canvas) { canvas.style.aspectRatio = String(ed.rows[0].length) + ' / ' + String(ed.rows.length); drawEditor(); }
  bindCanvas();
  bindButtons();
  syncMetaInputs();
  refreshTemplateOptions();
}

function bindCanvas() {
  if (!canvas) return;
  let panStart = null;
  // 画布缩放：滚轮缩放编辑器视图（0.5x–4x），以地图中心为锚点
  canvas.onwheel = (ev) => {
    ev.preventDefault();
    const cur = ed.zoom || 1;
    const next = Math.max(0.5, Math.min(4, cur + (ev.deltaY < 0 ? 0.2 : -0.2)));
    ed.zoom = Math.round(next * 10) / 10;
    drawEditor();
  };
  canvas.onmousedown = (ev) => {
    if ((ev.button === 1) || ed.spaceDown) {
      // 中键 / 空格+左键：平移视图
      panStart = { x: ev.clientX, y: ev.clientY, px: ed.panX || 0, py: ed.panY || 0 };
      ev.preventDefault();
      return;
    }
    if (ev.button === 2 && ed.tool !== 'select') {
      // 右键擦除为地面
      const prev = ed.sel;
      ed.sel = '.';
      ed.drawing = true;
      paintAt(ed, ev, true);
      ed.sel = prev;
      ed.drawing = false;
      return;
    }
    if (ev.button !== 0) return;
    ed.drawing = true;
    paintAt(ed, ev, true);
  };
  window.onmouseup = () => {
    if (!ed) return;
    if (panStart) panStart = null;
    ed.drawing = false;
    if (ed.selMove) {
      const { dx, dy } = ed.selMove;
      if (dx || dy) { pushHistory(); moveSelBy(dx, dy); drawEditor(); status('已移动选区'); }
      ed.selMove = null;
    } else if (ed.selBox && !ed.selCells) {
      ed.selCells = selRegion().map((r) => r.slice());
      status('已框选 ' + selW() + 'x' + selH() + ' · 可复制/剪切/删除/旋转/翻转');
    }
    ed.selAnchor = null;
  };
  canvas.oncontextmenu = (ev) => ev.preventDefault();
  canvas.onmousemove = (ev) => {
    if (panStart) {
      ed.panX = panStart.px + (ev.clientX - panStart.x);
      ed.panY = panStart.py + (ev.clientY - panStart.y);
      drawEditor();
      return;
    }
    const { tx, ty } = cellAt(ev);
    if (ed.drawing) {
      if (ed.tool === 'paint') paintAt(ed, ev, false);
      else if (ed.tool === 'select') {
        if (ed.selMove) {
          ed.selMove.dx = tx - ed.selMove.sx;
          ed.selMove.dy = ty - ed.selMove.sy;
          drawEditor();
        } else if (ed.selAnchor) {
          ed.selBox = normBox(ed.selAnchor.tx, ed.selAnchor.ty, tx, ty);
          drawEditor();
        }
      }
      return;
    }
    if (tx < 0 || ty < 0 || tx >= ed.rows[0].length || ty >= ed.rows.length) return;
    const c = ed.rows[ty][tx] || '#';
    const st = $('editorStatus');
    if (st && !st.dataset.keep) st.textContent = tx + ',' + ty + ' · ' + (PALETTE[c] ? PALETTE[c][0] : c) + ' · ' + ed.tool;
  };
  window.onkeydown = (ev) => {
    if (!ed || !canvas) return;
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = ev.key.toLowerCase();
    if (ev.code === 'Space') { ed.spaceDown = true; ev.preventDefault(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'c') { selectCopy(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'x') { selectCut(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k === 'v') { selectPaste(); return; }
    if (k === 'delete' || k === 'backspace') { selectDelete(); return; }
    if (k === 'b') setTool('paint');
    else if (k === 'f') setTool('fill');
    else if (k === 'r') setTool('rect');
    else if (k === 'l') setTool('line');
    else if (k === 'e') setTool('pick');
    else if (k === 's') setTool('select');
    else if (k === 'o') selectRotate();
    else if (k === 'escape') selectClear();
    else if (k === 'x') { ed.sel = '.'; syncPaletteSelection(); drawEditor(); }
    else if (k === 'z') restore(ed.historyIdx - 1);
    else if (k === 'y') restore(ed.historyIdx + 1);
    else if (k === '[') { ed.brush = Math.max(1, (ed.brush || 1) - 1); const bs = $('editorBrush'); if (bs) bs.value = String(ed.brush); }
    else if (k === ']') { ed.brush = Math.min(5, (ed.brush || 1) + 1); const bs = $('editorBrush'); if (bs) bs.value = String(ed.brush); }
    else if (k === '?' || k === 'f1') toggleEditorHelp();
    else return;
    ev.preventDefault();
  };
  window.onkeyup = (ev) => { if (ev.code === 'Space' && ed) ed.spaceDown = false; };
}

function bindButtons() {
  const nameEl = $('editorName');
  if (nameEl) nameEl.oninput = () => { ed.name = nameEl.value.trim() || '自定义地图'; };
  const accentEl = $('editorAccent');
  if (accentEl) accentEl.oninput = () => { ed.accent = accentEl.value || '#6ad1a8'; };
  const tagEl = $('editorTagline');
  if (tagEl) tagEl.oninput = () => { ed.tagline = tagEl.value.trim(); };
  const paletteEl = $('editorPalette');
  if (paletteEl && !paletteEl.dataset.bound) {
    paletteEl.dataset.bound = '1';
    for (const key of Object.keys(PALETTE)) {
      const b = document.createElement('button');
      b.className = 'ed-pal-btn' + (key === ed.sel ? ' sel' : '');
      b.style.setProperty('--sw', PALETTE[key][1]);
      b.setAttribute('data-char', key.toUpperCase());
      b.innerHTML = '<i></i><span>' + PALETTE[key][0] + '</span>';
      b.title = PALETTE[key][0];
      b.onclick = () => {
        ed.sel = key;
        [...paletteEl.children].forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        drawEditor();
      };
      paletteEl.appendChild(b);
    }
  }
  const save = $('editorSave'); if (save) save.onclick = () => saveRows();
  const saveAs = $('editorSaveAs'); if (saveAs) saveAs.onclick = () => { ed.savedId = null; ed.sourceId = null; status('将另存为新图'); saveRows(); };
  const load = $('editorLoad'); if (load) load.onclick = () => { loadRows(); };
  const exportBtn = $('editorExport'); if (exportBtn) exportBtn.onclick = () => { saveRows(); const ta = $('editorJson'); if (ta) { ta.select(); try { document.execCommand('copy'); } catch (err) { /* ignore */ } status('JSON 已复制'); } };
  const download = $('editorDownload'); if (download) download.onclick = () => downloadMap();
  const importBtn = $('editorImportBtn'), importFile = $('editorImportFile');
  if (importBtn && importFile) importBtn.onclick = () => importFile.click();
  if (importFile) importFile.onchange = (ev) => { const f = ev.target.files && ev.target.files[0]; if (f) { const r = new FileReader(); r.onload = () => importMapText(String(r.result || '')); r.readAsText(f); } };
  const helpBtn = $('editorHelpBtn'); if (helpBtn) helpBtn.onclick = toggleEditorHelp;
  const undo = $('editorUndo'); if (undo) undo.onclick = () => restore(ed.historyIdx - 1);
  const redo = $('editorRedo'); if (redo) redo.onclick = () => restore(ed.historyIdx + 1);
  const validate = $('editorValidate'); if (validate) validate.onclick = () => validateMap();
  const resize = $('editorResize'); if (resize) resize.onclick = () => resizeMap();
  const brushSel = $('editorBrush'); if (brushSel) { brushSel.value = String(ed.brush || 1); brushSel.onchange = () => { ed.brush = Math.max(1, Math.min(5, parseInt(brushSel.value, 10) || 1)); }; }
  const brushCircle = $('editorBrushCircle');
  if (brushCircle) { brushCircle.classList.toggle('sel', !!ed.brushCircle); brushCircle.onclick = () => { ed.brushCircle = !ed.brushCircle; brushCircle.classList.toggle('sel', ed.brushCircle); status(ed.brushCircle ? '刷子：圆形' : '刷子：方形'); }; }
  const hollow = $('editorHollow');
  if (hollow) { hollow.classList.toggle('sel', !!ed.hollow); hollow.onclick = () => { ed.hollow = !ed.hollow; hollow.classList.toggle('sel', ed.hollow); status(ed.hollow ? '矩形：描边' : '矩形：实心'); }; }
  const mirrorSel = $('editorMirror');
  if (mirrorSel) { mirrorSel.value = ed.mirror || 'none'; mirrorSel.onchange = () => { ed.mirror = mirrorSel.value; status('镜像：' + (mirrorSel.options[mirrorSel.selectedIndex] || {}).text); }; }
  const gridBtn = $('editorGrid');
  if (gridBtn) { gridBtn.classList.toggle('sel', ed.grid !== false); gridBtn.onclick = () => { ed.grid = ed.grid === false; gridBtn.classList.toggle('sel', ed.grid); drawEditor(); }; }
  const tpl = $('editorTemplate');
  if (tpl) {
    refreshTemplateOptions();
    tpl.onchange = () => loadTemplate(tpl.value);
  }
  const tools = {
    paint: 'editorToolPaint', fill: 'editorToolFill', rect: 'editorToolRect', line: 'editorToolLine', pick: 'editorToolPick', select: 'editorToolSelect'
  };
  for (const [tool, id] of Object.entries(tools)) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('sel', ed.tool === tool);
    b.onclick = () => setTool(tool);
  }
  const selOps = {
    editorSelCopy: selectCopy, editorSelCut: selectCut, editorSelPaste: selectPaste,
    editorSelDelete: selectDelete, editorSelRot: selectRotate, editorSelFlipH: selectFlipH,
    editorSelFlipV: selectFlipV, editorSelClear: selectClear
  };
  for (const [id, fn] of Object.entries(selOps)) {
    const b = $(id);
    if (b) b.onclick = () => fn();
  }
  const play = $('editorPlay'); if (play) play.onclick = () => playEditorMap();
  const close = $('editorClose'); if (close) close.onclick = () => closeEditor();
  renderMapList();
}

// 自定义地图管理：打开 / 重命名 / 复制 / 删除
function renderMapList() {
  const listEl = $('editorMapList');
  if (!listEl) return;
  const maps = readCustomMaps();
  listEl.innerHTML = '';
  if (!maps.length) { listEl.textContent = '暂无自定义地图，保存后出现在这里'; listEl.style.color = 'rgba(242,245,248,.4)'; return; }
  listEl.style.color = '';
  for (const m of maps) {
    const row = document.createElement('div');
    row.className = 'ed-map-row' + (ed && ed.savedId === m.id ? ' cur' : '');
    const name = document.createElement('span');
    name.className = 'ed-map-name';
    name.textContent = m.name || m.id;
    name.title = m.id;
    row.appendChild(name);
    const ops = document.createElement('span');
    ops.className = 'ed-map-ops';
    const mk = (label, fn, title) => {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = label;
      b.title = title || label;
      b.onclick = fn;
      ops.appendChild(b);
    };
    mk('打开', () => { loadMapData(m, m.id, m.id); status('已打开：' + (m.name || m.id)); }, '打开此地图');
    mk('改名', () => {
      const nn = window.prompt('地图名称：', m.name || '');
      if (nn && nn.trim()) {
        m.name = nn.trim();
        writeCustomMaps(maps);
        registerMap({ ...m, rows: m.rows.slice() });
        renderMapList();
        refreshTemplateOptions();
        status('已重命名');
      }
    }, '重命名');
    mk('复制', () => {
      const copy = normalizeCustomMap({ ...m, name: (m.name || '地图') + ' 副本', id: nextCustomId(m.name + '-copy'), rows: m.rows.slice() }, null);
      maps.push(copy);
      writeCustomMaps(maps);
      registerMap({ ...copy, rows: copy.rows.slice() });
      renderMapList();
      refreshTemplateOptions();
      if (window.__syncMapCards) window.__syncMapCards();
      status('已复制为 ' + copy.name);
    }, '复制一份');
    mk('删除', () => {
      if (!window.confirm('删除地图「' + (m.name || m.id) + '」？')) return;
      writeCustomMaps(maps.filter((x) => x.id !== m.id));
      if (ed && ed.savedId === m.id) { ed.savedId = null; ed.sourceId = null; }
      renderMapList();
      refreshTemplateOptions();
      if (window.__syncMapCards) window.__syncMapCards();
      status('已删除 ' + (m.name || m.id));
    }, '删除');
    row.appendChild(ops);
    listEl.appendChild(row);
  }
}

function loadMapData(def, savedId, sourceId) {
  if (!def || !def.rows || !Array.isArray(def.rows) || !def.rows.length) return false;
  pushHistory();
  ed.rows = def.rows.slice();
  ed.name = def.name || def.id || sourceId || '自定义地图';
  ed.accent = def.accent || '#6ad1a8';
  ed.tagline = def.tagline || '';
  ed.tile = def.tile || 16;
  ed.penPoints = Array.isArray(def.penPoints) ? def.penPoints.slice() : [];
  ed.highPoints = Array.isArray(def.highPoints) ? def.highPoints.slice() : [];
  ed.savedId = savedId || null;
  ed.sourceId = sourceId || savedId || null;
  if (canvas) canvas.style.aspectRatio = String(def.rows[0].length) + ' / ' + String(def.rows.length);
  syncMetaInputs();
  drawEditor();
  return true;
}

// 载入现有地图作为编辑模板（网格/出生点/爆破点/高台全部带入）
function loadTemplate(id) {
  if (!id) return;
  const customDef = readCustomMaps().find((m) => m.id === id);
  const def = customDef || getMapDef(id);
  if (!def || !def.rows || !Array.isArray(def.rows) || !def.rows.length) { status('模板不存在'); return; }
  const savedId = def.category === 'custom' ? def.id : null;
  loadMapData(def, savedId, id);
  refreshTemplateOptions();
  status('已载入模板：' + (def.name || id));
}

function resizeMap() {
  const w = Math.max(16, Math.min(160, parseInt(($('editorW') || {}).value, 10) || 40));
  const h = Math.max(16, Math.min(160, parseInt(($('editorH') || {}).value, 10) || 30));
  pushHistory();
  const next = defaultRows(w, h);
  const old = rowsToArr(ed.rows);
  for (let y = 0; y < Math.min(old.length, h); y++) for (let x = 0; x < Math.min(old[y].length, w); x++) next[y][x] = old[y][x];
  ed.rows = arrToRows(next);
  if (canvas) canvas.style.aspectRatio = w + ' / ' + h;
  drawEditor();
  status('尺寸已调整为 ' + w + 'x' + h);
}

function downloadMap() {
  saveRows();
  const obj = exportObject();
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (obj.name || 'custom-map').replace(/[\\/:*?"<>|]/g, '_') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status('已下载地图 JSON');
}

function importMapText(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || !Array.isArray(obj.rows) || !obj.rows.length || !obj.rows[0].length) throw new Error('bad rows');
    pushHistory();
    ed.rows = obj.rows.map((r) => String(r));
    ed.name = obj.name || '自定义地图';
    ed.accent = obj.accent || '#6ad1a8';
    const ta = $('editorJson');
    if (ta) ta.value = text;
    syncMetaInputs();
    drawEditor();
    saveRows();
    status('已导入 ' + ed.name);
  } catch (err) {
    status('导入失败：JSON 格式或地图数据无效', true);
  }
}

export function validateRows(rows) {
  const errors = [];
  if (!Array.isArray(rows) || !rows.length || !rows[0] || !rows[0].length) return { ok: false, errors: ['地图为空'] };
  const w = rows[0].length;
  for (const r of rows) {
    if (typeof r !== 'string' || r.length !== w) { errors.push('行长度不一致'); break; }
  }
  const has = (ch) => rows.some((r) => r.includes(ch));
  if (!has('t')) errors.push('缺少 T 出生点');
  if (!has('c')) errors.push('缺少 CT 出生点');
  if (!has('a')) errors.push('缺少 A 点');
  if (!has('b')) errors.push('缺少 B 点');
  if (errors.length) return { ok: false, errors };
  let unreachable = -1;
  try {
    const def = { id: 'custom-map', name: '自定义地图', accent: '#6ad1a8', rows: rows.slice(), tile: 16 };
    registerMap(def);
    loadMap(def);
    const map = getMap();
    unreachable = map.diagnostics ? map.diagnostics.unreachable.length : -1;
    if (unreachable > 0) errors.push('存在 ' + unreachable + ' 个不可达格');
    if (map.spawns.t.length && map.spawns.ct.length) {
      const t0 = nearestWalkable(map.spawns.t[0].x, map.spawns.t[0].y);
      const c0 = nearestWalkable(map.spawns.ct[0].x, map.spawns.ct[0].y);
      if (t0 && c0) {
        if (Math.hypot(t0.x - c0.x, t0.y - c0.y) < 4) errors.push('出生点太近，建议分开至少 4 格');
        for (const key of ['A', 'B']) {
          const s = map.sites[key];
          if (!s) continue;
          const st = nearestWalkable(s.cx, s.cy);
          if (!st || !aStar(t0.x, t0.y, st.x, st.y)) errors.push('T 无法到达 ' + key);
          if (!st || !aStar(c0.x, c0.y, st.x, st.y)) errors.push('CT 无法到达 ' + key);
        }
      }
    }
  } catch (err) {
    errors.push('验证异常：' + String((err && err.message) || err));
  }
  return { ok: errors.length === 0, errors, unreachable };
}
function validateMap() {
  const res = validateRows(ed.rows);
  if (res.ok) status('校验通过：A/B/T/CT 齐全，连通且出生点分离正常');
  else status('校验失败：' + res.errors.join('; '), true);
}

function playEditorMap() {
  unbindGlobalHandlers();
  const rows = ed.rows;
  const hasT = rows.some((r) => r.includes('t'));
  const hasC = rows.some((r) => r.includes('c'));
  const hasA = rows.some((r) => r.includes('a'));
  const hasB = rows.some((r) => r.includes('b'));
  if (!hasT || !hasC || !hasA || !hasB) {
    status('还需要 T/CT 出生点和 A/B 炸弹点', true);
    return;
  }
  saveRows();
  game.opts.mapId = ed.savedId || 'custom-map';
  game.opts.mode = 'classic';
  const ov = $('editorOverlay');
  if (ov) ov.style.display = 'none';
  startMatch(game);
}

// 解绑 window 级快捷键/鼠标处理器：关闭或试玩后不再劫持正式对局的按键
function unbindGlobalHandlers() {
  window.onkeydown = null;
  window.onkeyup = null;
  window.onmouseup = null;
}

function closeEditor() {
  unbindGlobalHandlers();
  const ov = $('editorOverlay');
  if (ov) ov.style.display = 'none';
  if (game.ui) game.ui.showMenu();
}

export function closeMapEditor() { closeEditor(); }
export function saveEditorMap() { saveRows(); }
export function playEditorMapNow() { playEditorMap(); }

export function installSavedEditorMap() {
  const list = readCustomMaps();
  for (const m of list) {
    registerMap({ id: m.id, name: m.name, accent: m.accent, tile: m.tile || 16, rows: m.rows.slice(), penPoints: m.penPoints || [], highPoints: m.highPoints || [], category: 'custom' });
  }
  return list.length ? list : null;
}
