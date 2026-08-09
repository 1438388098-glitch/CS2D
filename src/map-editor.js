import { registerMap } from './registry.js';
import { startMatch } from './game.js';
import { loadMap, getMap, aStar, nearestWalkable } from './map.js';
import { OFFICIAL_MAPS } from './official-maps.js';

let game = null;
let ed = null;
let canvas = null;
let ctx = null;

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

function syncMetaInputs() {
  const name = $('editorName'), w = $('editorW'), h = $('editorH');
  if (name) name.value = ed.name || '自定义地图';
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
  return {
    id: 'custom-map',
    name: ed.name || '自定义地图',
    accent: ed.accent || '#6ad1a8',
    tile: 16,
    rows,
    penPoints: meta.penPoints,
    highPoints: (ed.highPoints || meta.highPoints).slice()
  };
}

function saveRows() {
  const obj = exportObject();
  registerMap({ id: 'custom-map', name: obj.name, accent: obj.accent, rows: obj.rows.slice(), tile: obj.tile || 16, penPoints: obj.penPoints || [], highPoints: obj.highPoints || [] });
  try { localStorage.setItem('cs2d_editor_map', JSON.stringify(obj)); } catch (err) { /* no storage */ }
  const ta = $('editorJson');
  if (ta) ta.value = JSON.stringify(obj);
  if (window.__syncMapCards) window.__syncMapCards();
  if (window.__addMenuMapPreview) window.__addMenuMapPreview('custom-map');
  if (window.__refreshMapPreviews) window.__refreshMapPreviews();
  status('已保存，可在主菜单选择自定义地图');
}

function loadRows() {
  try {
    const raw = localStorage.getItem('cs2d_editor_map');
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && Array.isArray(obj.rows)) {
        pushHistory();
        ed.rows = obj.rows.map((r) => String(r));
        ed.name = obj.name || '自定义地图';
        ed.accent = obj.accent || '#6ad1a8';
        ed.tile = obj.tile || 16;
        ed.penPoints = Array.isArray(obj.penPoints) ? obj.penPoints : [];
        ed.highPoints = Array.isArray(obj.highPoints) ? obj.highPoints : [];
        const ta = $('editorJson');
        if (ta) ta.value = raw;
        syncMetaInputs();
        drawEditor();
        status('已读取上次保存的地图');
        return;
      }
    }
  } catch (err) { /* fallback */ }
  status('暂无本地存档', true);
}

function editorMetrics() {
  const w = ed.rows[0].length, h = ed.rows.length;
  const zoom = Math.max(0.5, Math.min(4, ed.zoom || 1));
  const base = Math.min(canvas.width / w, canvas.height / h);
  const cell = base * zoom;
  return { w, h, cell, ox: (canvas.width - w * cell) / 2, oy: (canvas.height - h * cell) / 2, zoom };
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
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) { ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + h * cell); }
  for (let y = 0; y <= h; y++) { ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + w * cell, oy + y * cell); }
  ctx.stroke();
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

function applyBrush(tx, ty) {
  const rows = rowsToArr(ed.rows);
  const b = Math.max(1, ed.brush || 1);
  const half = Math.floor(b / 2);
  for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x >= 0 && y >= 0 && x < rows[0].length && y < rows.length) rows[y][x] = ed.sel;
  }
  ed.rows = arrToRows(rows);
}

function floodFill(tx, ty) {
  const rows = rowsToArr(ed.rows);
  const target = rows[ty][tx];
  if (target === ed.sel) return;
  const stack = [[tx, ty]];
  const w = rows[0].length, h = rows.length;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || rows[y][x] !== target) continue;
    rows[y][x] = ed.sel;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ed.rows = arrToRows(rows);
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

function applyLine(ax, ay, tx, ty) {
  const rows = rowsToArr(ed.rows);
  for (const [x, y] of lineCells(ax, ay, tx, ty)) {
    if (x >= 0 && y >= 0 && x < rows[0].length && y < rows.length) rows[y][x] = ed.sel;
  }
  ed.rows = arrToRows(rows);
}

function applyRect(ax, ay, tx, ty) {
  const rows = rowsToArr(ed.rows);
  const x0 = Math.min(ax, tx), x1 = Math.max(ax, tx), y0 = Math.min(ay, ty), y1 = Math.max(ay, ty);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x >= 0 && y >= 0 && x < rows[0].length && y < rows.length) rows[y][x] = ed.sel;
  }
  ed.rows = arrToRows(rows);
}

function syncPaletteSelection() {
  const el = $('editorPalette');
  if (!el || !ed) return;
  for (const b of el.children) b.classList.toggle('sel', b.textContent === String(ed.sel).toUpperCase());
}
function setTool(tool) {
  if (!ed) return;
  ed.tool = tool;
  const ids = { paint: "editorToolPaint", fill: "editorToolFill", rect: "editorToolRect", line: "editorToolLine", pick: "editorToolPick" };
  for (const [key, id] of Object.entries(ids)) {
    const b = $(id);
    if (b) b.classList.toggle("sel", ed.tool === key);
  }
  drawEditor();
}

function paintAt(ev, commit) {
  if (!ed || !ed.rows) return;
  const { tx, ty } = cellAt(ev);
  if (tx < 0 || ty < 0 || tx >= ed.rows[0].length || ty >= ed.rows.length) return;
  if (ed.tool === 'pick') {
    const c = ed.rows[ty][tx] || '#';
    ed.sel = c;
    syncPaletteSelection();
    drawEditor();
    status('取色 ' + (PALETTE[c] ? PALETTE[c][0] : c) + ' (' + c + ')');
    return;
  }
  if (ed.tool === 'fill') {
    pushHistory();
    floodFill(tx, ty);
    drawEditor();
    return;
  }
  if (ed.tool === 'rect' || ed.tool === 'line') {
    if (!ed.anchor) {
      ed.anchor = { tx, ty };
      return;
    }
    pushHistory();
    if (ed.tool === 'rect') applyRect(ed.anchor.tx, ed.anchor.ty, tx, ty);
    else applyLine(ed.anchor.tx, ed.anchor.ty, tx, ty);
    ed.anchor = null;
    drawEditor();
    return;
  }
  if (commit) pushHistory();
  applyBrush(tx, ty);
  drawEditor();
}

export function openMapEditor(gameRef) {
  game = gameRef;
  game.state = 'EDITOR';
  game.over = false;
  const ov = $('editorOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  const menu = $('menu');
  if (menu) menu.classList.remove('show');
  ed = game.editor = game.editor || { rows: null, sel: '#', name: '自定义地图', accent: '#6ad1a8', tool: 'paint', brush: 1, history: [], historyIdx: -1, drawing: false, anchor: null };
  if (!ed.rows) {
    ed.rows = defaultRows(40, 30);
    pushHistory();
    loadRows();
  }
  canvas = $('editorCanvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  if (canvas) { canvas.style.aspectRatio = String(ed.rows[0].length) + ' / ' + String(ed.rows.length); drawEditor(); }
  bindCanvas();
  bindButtons();
  syncMetaInputs();
}

function bindCanvas() {
  if (!canvas) return;
  // 画布缩放：滚轮缩放编辑器视图（0.5x–4x），以地图中心为锚点
  canvas.onwheel = (ev) => {
    ev.preventDefault();
    const cur = ed.zoom || 1;
    const next = Math.max(0.5, Math.min(4, cur + (ev.deltaY < 0 ? 0.2 : -0.2)));
    ed.zoom = Math.round(next * 10) / 10;
    drawEditor();
  };
  canvas.onmousedown = (ev) => {
    ed.drawing = true;
    ed.anchor = null;
    paintAt(ev, true);
  };
  window.onmouseup = () => { if (ed) { ed.drawing = false; ed.anchor = null; } };
  canvas.oncontextmenu = (ev) => ev.preventDefault();
  canvas.onmousemove = (ev) => {
    if (ed.drawing) {
      if (ed.tool === 'paint') paintAt(ev, false);
      return;
    }
    const { tx, ty } = cellAt(ev);
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
    if (k === 'b') setTool('paint');
    else if (k === 'f') setTool('fill');
    else if (k === 'r') setTool('rect');
    else if (k === 'l') setTool('line');
    else if (k === 'e') setTool('pick');
    else if (k === 'x') { ed.sel = '.'; syncPaletteSelection(); drawEditor(); }
    else if (k === 'z') restore(ed.historyIdx - 1);
    else if (k === 'y') restore(ed.historyIdx + 1);
    else if (k === '[') { ed.brush = Math.max(1, (ed.brush || 1) - 1); const bs = $('editorBrush'); if (bs) bs.value = String(ed.brush); }
    else if (k === ']') { ed.brush = Math.min(4, (ed.brush || 1) + 1); const bs = $('editorBrush'); if (bs) bs.value = String(ed.brush); }
    else if (k === '?' || k === 'f1') toggleEditorHelp();
    else return;
    ev.preventDefault();
  };
}

function bindButtons() {
  const paletteEl = $('editorPalette');
  if (paletteEl && !paletteEl.dataset.bound) {
    paletteEl.dataset.bound = '1';
    for (const key of Object.keys(PALETTE)) {
      const b = document.createElement('button');
      b.className = 'ed-pal-btn' + (key === ed.sel ? ' sel' : '');
      b.style.background = PALETTE[key][1];
      b.textContent = key.toUpperCase();
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
  const brushSel = $('editorBrush'); if (brushSel) { brushSel.value = String(ed.brush || 1); brushSel.onchange = () => { ed.brush = Math.max(1, Math.min(4, parseInt(brushSel.value, 10) || 1)); }; }
  const tpl = $('editorTemplate'); if (tpl) { tpl.value = ''; tpl.onchange = () => loadTemplate(tpl.value); }
  const tools = {
    paint: 'editorToolPaint', fill: 'editorToolFill', rect: 'editorToolRect', line: 'editorToolLine', pick: 'editorToolPick'
  };
  for (const [tool, id] of Object.entries(tools)) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('sel', ed.tool === tool);
    b.onclick = () => setTool(tool);
  }
  const play = $('editorPlay'); if (play) play.onclick = () => playEditorMap();
  const close = $('editorClose'); if (close) close.onclick = () => closeEditor();
}

// 载入官方图作为编辑模板（网格/出生点/爆破点/高台全部带入）
function loadTemplate(id) {
  if (!id) return;
  const def = OFFICIAL_MAPS[id];
  if (!def || !def.rows) { status('模板不存在'); return; }
  pushHistory();
  ed.rows = def.rows.slice();
  if (canvas) canvas.style.aspectRatio = def.rows[0].length + ' / ' + def.rows.length;
  const w = $('editorW'), h = $('editorH');
  if (w) w.value = def.rows[0].length;
  if (h) h.value = def.rows.length;
  drawEditor();
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
  game.opts.mapId = 'custom-map';
  game.opts.mode = 'classic';
  const ov = $('editorOverlay');
  if (ov) ov.style.display = 'none';
  startMatch(game);
}

function closeEditor() {
  const ov = $('editorOverlay');
  if (ov) ov.style.display = 'none';
  if (game.ui) game.ui.showMenu();
}

export function closeMapEditor() { closeEditor(); }
export function saveEditorMap() { saveRows(); }
export function playEditorMapNow() { playEditorMap(); }

export function installSavedEditorMap() {
  try {
    const raw = localStorage.getItem('cs2d_editor_map');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.rows)) return null;
    // 与 saveRows/exportObject 保持一致：编辑器保存 tile=16，重启后按同尺寸加载
    registerMap({ id: 'custom-map', name: obj.name || '自定义地图', accent: obj.accent || '#6ad1a8', tile: obj.tile || 16, rows: obj.rows.slice() });
    return obj;
  } catch (err) { return null; }
}
