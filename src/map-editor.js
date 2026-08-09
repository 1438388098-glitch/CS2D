import { registerMap } from './registry.js';
import { startMatch } from './game.js';
import { loadMap, getMap, aStar, nearestWalkable } from './map.js';

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
  '~': ['浅水', '#4d9fd6'],
  '≈': ['深水', '#173c63'],
  'o': ['油桶', '#c2543a'],
  'a': ['A 点', '#ff8a4d'],
  'b': ['B 点', '#5aa6ff'],
  't': ['T 出生', '#ffb84d'],
  'c': ['CT 出生', '#4da6ff']
};

function defaultRows() {
  const w = 40, h = 30;
  const rows = Array.from({ length: h }, () => Array(w).fill('#'));
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      rows[y][x] = '.';
      if (x > 6 && x < 14 && y > 6 && y < 14) rows[y][x] = 'C';
    }
  }
  rows[4][4] = 't'; rows[4][5] = 't'; rows[5][4] = 't';
  rows[h - 5][w - 5] = 'c'; rows[h - 5][w - 6] = 'c'; rows[h - 6][w - 5] = 'c';
  rows[10][10] = 'a'; rows[11][10] = 'a'; rows[10][11] = 'a'; rows[11][11] = 'a';
  rows[20][28] = 'b'; rows[21][28] = 'b'; rows[20][29] = 'b'; rows[21][29] = 'b';
  return rows.map((r) => r.join(''));
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
  return { penPoints, highPoints: [] };
}

export function computeMapMeta(rows) { return buildMapMeta(rows); }

function saveRows() {
  const obj = { id: 'custom-map', name: ed.name || '自定义地图', accent: '#6ad1a8', rows: ed.rows };
  try {
    localStorage.setItem('cs2d_editor_map', JSON.stringify(obj));
    const ta = $('editorJson');
    if (ta) ta.value = JSON.stringify(obj);
    const st = $('editorStatus');
    if (st) st.textContent = '已保存';
  } catch (err) { /* no storage */ }
}

function loadRows() {
  try {
    const raw = localStorage.getItem('cs2d_editor_map');
    if (raw) {
      const obj = JSON.parse(raw);
      ed.rows = obj.rows || defaultRows();
      ed.name = obj.name || '自定义地图';
      const ta = $('editorJson');
      if (ta) ta.value = raw;
    }
  } catch (err) { /* fallback */ }
}

function drawEditor() {
  if (!canvas || !ctx) return;
  const w = ed.rows[0].length, h = ed.rows.length;
  const tw = canvas.width / w, th = canvas.height / h;
  ctx.fillStyle = '#101318';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = ed.rows[y][x] || '#';
      const col = (PALETTE[c] || PALETTE['#'])[1];
      ctx.fillStyle = col;
      ctx.fillRect(x * tw, y * th, tw + 0.5, th + 0.5);
      if (c === 'a' || c === 'b' || c === 't' || c === 'c' || c === 'o' || c === 'D') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = 'bold ' + Math.max(10, tw * 0.5) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.toUpperCase(), x * tw + tw / 2, y * th + th / 2);
      }
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) { ctx.moveTo(x * tw, 0); ctx.lineTo(x * tw, canvas.height); }
  for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * th); ctx.lineTo(canvas.width, y * th); }
  ctx.stroke();
  const st = $('editorStatus');
  if (st) st.textContent = ed.name + ' · ' + w + 'x' + h + ' · 当前 ' + PALETTE[ed.sel][0];
}

function paintAt(ev) {
  const r = canvas.getBoundingClientRect();
  const x = ev.clientX - r.left, y = ev.clientY - r.top;
  const tx = Math.floor(x / canvas.width * ed.rows[0].length);
  const ty = Math.floor(y / canvas.height * ed.rows.length);
  if (tx >= 0 && ty >= 0 && tx < ed.rows[0].length && ty < ed.rows.length) {
    ed.rows[ty] = ed.rows[ty].split('');
    ed.rows[ty][tx] = ed.sel;
    ed.rows[ty] = ed.rows[ty].join('');
    drawEditor();
  }
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
  ed = game.editor = game.editor || { w: 40, h: 30, rows: null, sel: '#', name: '自定义地图' };
  if (!ed.rows) { ed.rows = defaultRows(); loadRows(); }
  canvas = $('editorCanvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  if (canvas) drawEditor();
  bindButtons();
  bindCanvas();
}

function bindCanvas() {
  if (!canvas) return;
  canvas.onmousedown = (ev) => { ed.drawing = true; paintAt(ev); };
  canvas.onmousemove = (ev) => { if (ed.drawing) paintAt(ev); };
  window.onmouseup = () => { if (ed) ed.drawing = false; };
  canvas.oncontextmenu = (ev) => ev.preventDefault();
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
  const load = $('editorLoad'); if (load) load.onclick = () => { loadRows(); drawEditor(); };
  const exportBtn = $('editorExport'); if (exportBtn) exportBtn.onclick = () => { saveRows(); const ta = $('editorJson'); if (ta) { ta.select(); try { document.execCommand('copy'); } catch (err) { /* ignore */ } } };
  const play = $('editorPlay'); if (play) play.onclick = () => playEditorMap();
  const close = $('editorClose'); if (close) close.onclick = () => closeEditor();
}

function playEditorMap() {
  const rows = ed.rows;
  const hasT = rows.some((r) => r.includes('t'));
  const hasC = rows.some((r) => r.includes('c'));
  const hasA = rows.some((r) => r.includes('a'));
  const hasB = rows.some((r) => r.includes('b'));
  const st = $('editorStatus');
  if (!hasT || !hasC || !hasA || !hasB) {
    if (st) st.textContent = '还需要 T/CT 出生点和 A/B 炸弹点';
    return;
  }
  saveRows();
  registerMap({ id: 'custom-map', name: ed.name || '自定义地图', accent: '#6ad1a8', rows: rows.slice() });
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

export function closeMapEditor() { closeEditor(); }
export function saveEditorMap() { saveRows(); }
export function playEditorMapNow() { playEditorMap(); }
