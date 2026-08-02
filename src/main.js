import { createGame, startMatch, update } from './game.js';
import { initTextures } from './textures.js';
import { initRenderer, render } from './render.js';
import { initHud, renderHud, renderCrosshair, renderMinimap, toggleMiniZoom, isMiniZoomed, setMiniZoom } from './hud.js';
import { initUi, setMutedFnExposed, setMenuBackgroundFromLayer, refreshMapPreviews } from './ui.js';
import { initUiDom, updateHudDom } from './ui-dom.js';
import { initInput, resizeCanvas, setKey, setMouse, setMouseDown } from './input.js';
import { killEntity } from './combat.js';
import { getMap } from './map.js';
import { MAPS } from './config.js';
import { setMuted, isMuted, setAudioContext } from './audio.js';

const canvas = document.getElementById('game');
const game = createGame();

setMutedFnExposed(() => isMuted());
setAudioContext(() => game);

function reloadMapLayers() {
  game.layers = initTextures(getMap());
  initRenderer(canvas, game.layers);
  initHud(canvas, game.layers);
  if (game.layers) setMenuBackgroundFromLayer(game.opts.mapId, game.layers.staticLayer, game.layers.W, game.layers.H);
}
game.onMapChanged = reloadMapLayers;

// 主菜单三图背景与卡片缩略图：启动时对全部地图预生成（initTextures 为纯函数，不污染当前地图）
function initMenuBackgrounds() {
  for (const m of MAPS) {
    try {
      const layers = initTextures(m);
      if (layers) setMenuBackgroundFromLayer(m.id, layers.staticLayer, layers.W, layers.H);
    } catch (err) { /* 单图失败不阻塞 */ }
  }
  refreshMapPreviews();
}

reloadMapLayers();
initMenuBackgrounds();
initUi(document, canvas, game);
initUiDom(game);
initInput(game, canvas);
resizeCanvas(game, canvas);
game.ui.showMenu();

canvas.addEventListener('mousedown', (e) => {
  const cw = game.canvasW || window.innerWidth;
  const mmW = (isMiniZoomed() ? 480 : 240);
  const mmH = (isMiniZoomed() ? 360 : 180);
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (x > cw - mmW - 12 && y < mmH + 10) toggleMiniZoom();
}, false);

document.getElementById('mmIn').addEventListener('click', (e) => { setMiniZoom(2); e.stopPropagation(); });
document.getElementById('mmOut').addEventListener('click', (e) => { setMiniZoom(1); e.stopPropagation(); });

let lastT = performance.now();
function loop(t) {
  const now = t || performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  try {
    update(game, dt);
    render(game);
    renderMinimap(game);
    updateHudDom(now);
    renderHud(game);
    renderCrosshair(game);
  } catch (err) {
    console.error('frame error:', err);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.GAME = {
  startMatch: () => startMatch(game),
  setSeed: (s) => { game.seed = s >>> 0; },
  debug: {
    tick: (dt) => update(game, dt),
    game: () => game,
    state: () => game.state,
    aiLog: () => game.aiLog,
    commLog: () => game.commLog,
    setOpts: (o) => {
      if (o.team) game.opts.team = o.team;
      if (o.diff) game.opts.diff = o.diff;
      if (o.bots) game.opts.bots = o.bots;
      if (o.mapId) game.opts.mapId = o.mapId;
    },
    setKey: (code, down) => setKey(game, code, down),
    setMouse: (x, y) => setMouse(game, x, y),
    setMouseDown: (v) => setMouseDown(game, v),
    killAll: (team) => {
      for (const e of game.entities) {
        if (e.team === team && !e.dead) killEntity(e, null, 'knife', false, game);
      }
    }
  }
};

window.__game = game;
window.__cs2d = {
  get game() { return game; },
  get state() { return { state: game.state, diff: game.opts.diff, mapId: game.opts.mapId, round: game.round, score: game.score }; }
};
