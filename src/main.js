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
import './retake-mode.js';
import {nextRenderScale} from './render-scale.js';
import {initCareerUi} from './career-ui.js';
import {majorAction} from './modes.js';
import {initLan, hostStartMatchNow, smoothRemote} from './lan.js';
import {openMapEditor, closeMapEditor, saveEditorMap, playEditorMapNow, installSavedEditorMap} from './map-editor.js';
import {smoothRenderEntities} from './render-smooth.js';

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
  try {
    if (!localStorage.getItem('cs2d_map')) game.opts.mapId = 'atrium';
  } catch (err) { /* no storage in test/headless contexts */ }
  initUi(document, canvas, game);
  initCareerUi(document, game);
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
  initPerfObservers();
  startLoop();
}

let frameMsEma = 16.7; let renderMsEma = 16.7; let statsT = 0; let scaleCur = 1.0; let scaleT = 0; // E4 自适应：默认全分辨率（1080P），超预算降档
let healthScale = 1; let healthScaleT = 0; let healthScaleStepT = 0; // 帧健康降档档位：并入 scale 状态机，采纳 render3d-next 的降档并带 3s 恢复节流
let backendLockLegacyUntil = 0; // 后端冷却：切 legacy 后在此毫秒时间戳前锁定 legacy，防逐帧 flip-flop
const BACKEND_LOCK_MS = 1000;
let lastT = performance.now();
const perfSamples = new Float64Array(60);
let perfIdx = 0;
let perfCount = 0;
let workMsEma = 16.7;
let realFpsWindowStart = performance.now();
let realFpsFrames = 0;
let realFps = 0;
let simFpsWindowStart = performance.now();
let simFpsWindowFrames = 0;
let simFps = 0;
let simTotalSteps = 0;
let lastWorkMs = 0;
let longTaskWindowStart = performance.now();
let longTaskWindowCount = 0;
let longTaskWindowMs = 0;
let longTaskLastCount = 0;
let longTaskLastMs = 0;
let longTaskTotalCount = 0;
let longTaskTotalMs = 0;

function initPerfObservers() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const d = Number.isFinite(entry.duration) ? entry.duration : 0;
        if (d <= 0) continue;
        longTaskWindowCount++;
        longTaskWindowMs += d;
        longTaskTotalCount++;
        longTaskTotalMs += d;
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch (err) { /* 部分浏览器不支持 longtask，忽略 */ }
}

function pushFramePerf(frameMs) {
  perfSamples[perfIdx++] = frameMs;
  if (perfIdx >= perfSamples.length) perfIdx = 0;
  if (perfCount < perfSamples.length) perfCount++;
  let sum = 0;
  let max = 0;
  let drops = 0;
  for (let i = 0; i < perfCount; i++) {
    const v = perfSamples[i];
    sum += v;
    if (v > max) max = v;
    if (v > 28) drops++;
  }
  return { avg: sum / perfCount, max, drops, count: perfCount };
}
function startLoop() {
  let acc = 0;
  const FIXED = 1 / 60;
  function loop(t) {
    const now = t || performance.now();
    const rawFrameMs = Math.max(now - lastT, 0);
    const frameMs = Math.min(rawFrameMs, 1000);
    let frame = Math.min(rawFrameMs / 1000, 0.1);
    lastT = now;
    acc += frame;
    try {
      const tWork0 = performance.now();
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
      simFpsWindowFrames += steps;
      simTotalSteps += steps;
      if (steps === 0 && frame > 0 && acc > 0 && !game.over) {
        // 无整步可执行时不推进模拟，但若长时间无步（如低帧率）避免冻结
      }
      const tR0 = performance.now();
      smoothRemote(game, FIXED);
      smoothRenderEntities(game, frame);
      syncSpatialAudio(game);
      if (game.viewMode === 'fps' && fpsCameraEntity(game)) {
        const now3d = performance.now();
        if (render3dNextReady() && now3d >= backendLockLegacyUntil) {
          render3dNext(game);
          if (game._render3dBackend === 'legacy') {
            // next 本轮回退 legacy：进入冷却（防逐帧 flip-flop），并清屏后再补跑 legacy（防双写/闪烁）
            backendLockLegacyUntil = now3d + BACKEND_LOCK_MS;
            const g2d = canvas.getContext('2d');
            if (g2d) {
              g2d.setTransform(1, 0, 0, 1, 0, 0);
              g2d.clearRect(0, 0, canvas.width, canvas.height);
            }
            render3d(game);
          }
        } else {
          game._render3dBackend = 'legacy';
          render3d(game);
        }
      } else if (game.viewMode === 'fps') {
        // 无观战目标（如全队阵亡）：保持暗色 3D 环境底，而非切回 2D 俯视造成视角突变
        game._render3dBackend = 'legacy';
        const g2d = canvas.getContext('2d');
        if (g2d) {
          g2d.setTransform(1, 0, 0, 1, 0, 0);
          g2d.clearRect(0, 0, canvas.width, canvas.height);
          g2d.fillStyle = '#14161a';
          g2d.fillRect(0, 0, canvas.width, canvas.height);
          // 恢复 dpr 变换：后续 HUD/准星层按 CSS 像素绘制（对齐 render3d 尾部恢复，防 dpr>1 错位）
          g2d.setTransform(game.dpr || 1, 0, 0, game.dpr || 1, 0, 0);
        }
      } else {
        game._render3dBackend = 'legacy';
        render(game);
      }
      const renderMs = performance.now() - tR0;
      const perf = pushFramePerf(frameMs);
      frameMsEma = frameMsEma * 0.9 + frameMs * 0.1;
      renderMsEma = renderMsEma * 0.9 + renderMs * 0.1;
      realFpsFrames++;
      const nowMs = performance.now();
      if (nowMs - realFpsWindowStart >= 1000) {
        realFps = realFpsFrames;
        realFpsFrames = 0;
        realFpsWindowStart = nowMs;
      }
      if (nowMs - simFpsWindowStart >= 1000) {
        simFps = simFpsWindowFrames;
        simFpsWindowFrames = 0;
        simFpsWindowStart = nowMs;
      }
      if (nowMs - longTaskWindowStart >= 1000) {
        longTaskLastCount = longTaskWindowCount;
        longTaskLastMs = longTaskWindowMs;
        longTaskWindowCount = 0;
        longTaskWindowMs = 0;
        longTaskWindowStart = nowMs;
      }
      // 帧健康降档并入自适应档位状态机：采纳 render3d-next 的 updateFrameHealth 降档
      // （避免每帧 scaleCur 覆盖其降档），健康稳定 ≥3s 后逐步回档，防止无限降低
      {
        const hsRaw = game._renderScale;
        const hsNow = (typeof hsRaw === 'number' && isFinite(hsRaw) && hsRaw >= 0.5 && hsRaw <= 1) ? hsRaw : 1;
        if (hsNow < Math.min(scaleCur, healthScale)) {
          healthScale = Math.max(0.6, hsNow);
          healthScaleT = nowMs;
        } else if (nowMs - healthScaleT >= 3000 && nowMs - healthScaleStepT >= 1000) {
          healthScale = Math.round(Math.min(scaleCur, healthScale + 0.1) * 100) / 100;
          healthScaleStepT = nowMs;
        }
        game._renderScale = Math.min(scaleCur, healthScale);
      }
      statsT++;
      if (statsT >= 30) {
        statsT = 0;
        const next = nextRenderScale(scaleCur, renderMsEma, { lockT: scaleT });
        scaleCur = next.scale;
        scaleT = next.lockT;
      }
      if (game.viewMode !== 'fps') renderLens(game);
      renderMinimap(game);
      updateHudDom(now);
      syncFpsCursor(game);
      // 对局结束/回主菜单时释放指针锁定（FPS 模式光标不会永久消失，也阻断 END 期间 _mlookDx 累积）
      if (game.viewMode === 'fps' && document.pointerLockElement &&
          (game.state === 'END' || game.state === 'MENU')) {
        document.exitPointerLock();
      }
      renderHud(game);
      renderCrosshair(game);
      updateFpsUi(game);
      const workMs = performance.now() - tWork0;
      const frameLoadPct = lastWorkMs > 0 ? Math.min(999, lastWorkMs / Math.max(frameMs, 0.1) * 100) : 0;
      workMsEma = workMsEma * 0.9 + workMs * 0.1;
      if (window.__cs2d) window.__cs2d.stats = {
        frameMs: frameMsEma,
        renderMs: renderMsEma,
        frameDelta: frameMs,
        frameNow: frameMs,
        frameAvgMs: perf.avg,
        frameMaxMs: perf.max,
        frameDrops: perf.drops,
        frameWindow: perf.count,
        renderNow: renderMs,
        workNow: workMs,
        workMs: workMsEma,
        frameLoadPct,
        fpsWindow: realFps,
        simFps,
        simTotalSteps,
        longTaskCount: longTaskLastCount,
        longTaskMs: longTaskLastMs,
        longTaskTotalCount,
        longTaskTotalMs,
        render3d: game._renderStats || null,
        scale: scaleCur
      };
      lastWorkMs = workMs;
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
    refreshPerf: () => updateFpsUi(game, true),
    killAll: (team) => {
      for (const e of game.entities) {
        if (e.team === team && !e.dead) killEntity(e, null, 'knife', false, game);
      }
    }
  }
};

window.__game = game;
window.__majorAction = (a) => majorAction(game, a);
window.__openMapEditor = (g, mapId) => openMapEditor(g, mapId);
window.__closeMapEditor = closeMapEditor;
window.__saveEditorMap = saveEditorMap;
window.__playEditorMap = playEditorMapNow;
window.__lanStart = hostStartMatchNow;

window.__cs2d = {
  get game() { return game; },
  get state() { return { state: game.state, diff: game.opts.diff, mapId: game.opts.mapId, round: game.round, score: game.score }; },
  debug: window.GAME && window.GAME.debug || null,
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
