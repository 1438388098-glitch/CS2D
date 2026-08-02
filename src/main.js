import { createGame, startMatch, update } from './game.js';
import { initTextures } from './textures.js';
import { initRenderer, render } from './render.js';
import { initHud, renderHud, renderCrosshair, renderMinimap, toggleMiniZoom, isMiniZoomed } from './hud.js';
import { initUi, setMutedFnExposed, setMenuBackgroundFromLayer } from './ui.js';
import { initInput, resizeCanvas, setKey, setMouse, setMouseDown } from './input.js';
import { killEntity } from './combat.js';
import { getMap } from './map.js';
import { setMuted, isMuted, setAudioContext } from './audio.js';
import { getSensitivity } from './keymap.js';

const canvas = document.getElementById('game');
const game = createGame();

setMutedFnExposed(() => isMuted());
setAudioContext(() => game);
game.opts.sensitivity = getSensitivity();

function reloadMapLayers() {
  game.layers = initTextures(getMap());
  initRenderer(canvas, game.layers);
  initHud(canvas, game.layers);
  if (game.layers) setMenuBackgroundFromLayer(game.layers.staticLayer, game.layers.W, game.layers.H);
}
game.onMapChanged = reloadMapLayers;

reloadMapLayers();
initUi(document, canvas, game);
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

let lastT = performance.now();
function loop(t) {
  const now = t || performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  try {
    update(game, dt);
    render(game);
    renderMinimap(game);
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
  debug: {
    tick: (dt) => update(game, dt),
    game: () => game,
    state: () => game.state,
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
