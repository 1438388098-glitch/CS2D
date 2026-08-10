import {createGame, startMatch, update, skipSpectatedRound} from './game.js';
import {initTextures, preloadTextures} from './textures.js';
import {initRenderer, render} from './render.js';
import {initRenderer3d, render3d, fpsCameraEntity} from './render3d.js';
import {initRenderer3dNext, render3dNext, render3dNextReady, disposeRenderer3dNext} from './render3d-next.js';
import {updateFpsUi, getAudioPrefs} from './ui.js';
import {initHud, renderHud, renderCrosshair, renderMinimap, renderLens, toggleMiniZoom, isMiniZoomed, setMiniZoom} from './hud.js';
import {initUi, setMutedFnExposed, setMenuBackgroundFromLayer, refreshMapPreviews, syncMapCards} from './ui.js';
import {initUiDom, updateHudDom} from './ui-dom.js';
import {initInput, resizeCanvas, setKey, setMouse, setMouseDown, syncFpsCursor} from './input.js';
import {killEntity} from './combat.js';
import {getMap, loadMap, findMapById} from './map.js';
import { installChosenFourthMap } from './4th-map-candidates.js';
import {MAPS} from './config.js';
import {isMuted, setAudioContext, startAmbient, initAudio, getBusVolume, setBusVolume, syncSpatialAudio} from './audio.js';
import './modes.js';
import {nextRenderScale} from './render-scale.js';
import {initCareerUi} from './career-ui.js';
import {initRankedUi} from './ranked-ui.js';
import {majorAction} from './modes.js';
import {initLan, hostStartMatchNow, smoothRemote} from './lan.js';
import {openMapEditor, closeMapEditor, saveEditorMap, playEditorMapNow, installSavedEditorMap} from './map-editor.js';

const canvas = document.getElementById('game');
const game = createGame();

setMutedFnExposed(() => isMuted());
setAudioContext(() => game);

function reloadMapLayers() {
  game.layers = initTextures(getMap());
  initRenderer(canvas, game.layers);
  initRenderer3d(canvas, game.layers);
  disposeRenderer3dNext();
  initRenderer3dNext(canvas, game.layers);
  initHud(canvas, game.layers);
  if (game.layers) setMenuBackgroundFromLayer(game.opts.mapId, game.layers.staticLayer, game.layers.W, game.layers.H);
  startAmbient(game.opts.mapId);
}
game.onMapChanged = reloadMapLayers;

// 主菜单三图背景与卡片缩略图：启动时对全部地图预生成（initTextures 为纯函数，不污染当前地图）
function initMenuBackgrounds() {
  for (const m of MAPS) {
    try {
      loadMap(m);
      const map = getMap();
      const layers = initTextures(map);
      if (layers) setMenuBackgroundFromLayer(m.id, layers.staticLayer, layers.W, layers.H);
    } catch (err) { /* 单图失败不阻塞 */ }
  }
  syncMapCards();
  refreshMapPreviews();
  loadMap(findMapById(game.opts.mapId || 'dust2'));
}

function ensureMenuMapBackground(mapId) {
  const def = findMapById(mapId);
  if (!def || def.id !== mapId) return;
  try {
    loadMap(def);
    const map = getMap();
    const layers = initTextures(map);
    if (layers) setMenuBackgroundFromLayer(mapId, layers.staticLayer, layers.W, layers.H);
  } catch (err) { /* 单图失败不阻塞 */ }
  loadMap(findMapById(game.opts.mapId || 'dust2'));
  syncMapCards();
  refreshMapPreviews();
}

// 启动：先预加载真实纹理（失败自动降级程序化），再初始化所有图层与界面
async function boot() {
  await preloadTextures();
  installChosenFourthMap();
  installSavedEditorMap();
  initUi(document, canvas, game);
  initCareerUi(document, game);
  initRankedUi(document, game);
  initUiDom(game);
  initInput(game, canvas);
  initLan(game);
  resizeCanvas(game, canvas);
  reloadMapLayers();
  initMenuBackgrounds();
  window.__refreshMapPreviews = refreshMapPreviews;
  window.__syncMapCards = syncMapCards;
  window.__addMenuMapPreview = ensureMenuMapBackground;

  canvas.addEventListener('mousedown', (e) => {
    const cw = game.canvasW || window.innerWidth;
    const mmW = (isMiniZoomed() ? 480 : 240);
    const mmH = (isMiniZoomed() ? 360 : 180);
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x > cw - mmW - 12 && y < mmH + 10) toggleMiniZoom();
  }, false);

  const mmIn = document.getElementById('mmIn');
  const mmOut = document.getElementById('mmOut');
  if (mmIn) mmIn.addEventListener('click', (e) => { setMiniZoom(2); e.stopPropagation(); });
  if (mmOut) mmOut.addEventListener('click', (e) => { setMiniZoom(1); e.stopPropagation(); });

  const spdMap = [['spd1', 1], ['spd2', 2], ['spd4', 4], ['spd8', 8]];
  for (const [id, spd] of spdMap) {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => { game.spectate.speed = spd; });
  }
  const skipRound = document.getElementById('skipRound');
  if (skipRound) skipRound.addEventListener('click', () => skipSpectatedRound(game));

  game.ui.showMenu();
  startLoop();
}

let frameMsEma = 16.7; let renderMsEma = 16.7; let statsT = 0; let scaleCur = 1.0; let scaleT = 0; // E4 自适应：默认全分辨率（1080P），超预算降档
let lastT = performance.now();
function startLoop() {
  let acc = 0;
  const FIXED = 1 / 30;
  function loop(t) {
    const now = t || performance.now();
    const frameMs = Math.min(Math.max(now - lastT, 0), 100);
    let frame = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    acc += frame;
    try {
      const speed = Math.max(1, Math.min(8, Math.floor((game.cyber && game.cyber.speed) || (game.spectate && game.spectate.speed) || 1)));
      // 固定步长模拟（1/30）：可变 dt 会破坏 seedWorld 确定性重放；累积真实时间按固定步进
      let steps = 0;
      while (acc >= FIXED && steps < 8) {
        acc -= FIXED;
        update(game, FIXED);
        steps++;
        if (game.over) break;
        if (speed > 1) { for (let s = 1; s < speed; s++) { update(game, FIXED); steps++; if (game.over) break; } }
      }
      if (steps === 0 && frame > 0 && acc > 0 && !game.over) {
        // 无整步可执行时不推进模拟，但若长时间无步（如低帧率）避免冻结
      }
      const tR0 = performance.now();
      smoothRemote(game, FIXED);
      syncSpatialAudio(game);
      if (game.viewMode === 'fps' && fpsCameraEntity(game)) {
        if (render3dNextReady()) {
          render3dNext(game);
          if (game._render3dBackend === 'legacy') render3d(game);
        } else {
          render3d(game);
        }
      } else {
        render(game);
      }
      const renderMs = performance.now() - tR0;
      frameMsEma = frameMsEma * 0.9 + frameMs * 0.1;
      renderMsEma = renderMsEma * 0.9 + renderMs * 0.1;
      game._renderScale = scaleCur;
      statsT++;
      if (statsT >= 60) {
        statsT = 0;
        const next = nextRenderScale(scaleCur, renderMsEma, { lockT: scaleT });
        scaleCur = next.scale;
        scaleT = next.lockT;
      }
      if (window.__cs2d) window.__cs2d.stats = { frameMs: frameMsEma, renderMs: renderMsEma, frameDelta: frameMs, render3d: game._renderStats || null, scale: scaleCur };
      if (game.viewMode !== 'fps') renderLens(game);
      renderMinimap(game);
      updateHudDom(now);
      updateFpsUi(game);
      syncFpsCursor(game);
      // 对局结束/回主菜单时释放指针锁定（FPS 模式光标不会永久消失，也阻断 END 期间 _mlookDx 累积）
      if (game.viewMode === 'fps' && document.pointerLockElement &&
          (game.state === 'END' || game.state === 'MENU')) {
        document.exitPointerLock();
      }
      renderHud(game);
      renderCrosshair(game);
    } catch (err) {
      console.error('frame error:', err);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot();

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
window.__majorAction = (a) => majorAction(game, a);
window.__openMapEditor = (g) => openMapEditor(g);
window.__closeMapEditor = closeMapEditor;
window.__saveEditorMap = saveEditorMap;
window.__playEditorMap = playEditorMapNow;
window.__lanStart = hostStartMatchNow;

window.__cs2d = {
  get game() { return game; },
  get state() { return { state: game.state, diff: game.opts.diff, mapId: game.opts.mapId, round: game.round, score: game.score }; },
  render3d: {
    get backend() { return render3dNextReady() ? 'next' : 'legacy'; }
  },
  audio: {
    getBusVolume,
    setBusVolume,
    initAudio,
    getPrefs: () => getAudioPrefs()
  }
};
