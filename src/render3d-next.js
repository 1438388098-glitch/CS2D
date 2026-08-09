// 3D 重构入口：Three.js 低多边形比赛环境渲染器。
// 保留旧 render3d.js 作为降级路径；本模块在 Three.js 可用前不阻塞游戏启动。
import { getMap, groundElevationAt } from './map.js';
import { themeOf } from './textures.js';
import { WEAPONS } from './config.js';
import { weaponDef, wkey, ammoFor, reserveFor } from './entities.js';

export function tileToChar(grid, tx, ty) {
  if (!grid || !grid.length) return '#';
  if (ty < 0 || tx < 0 || ty >= grid.length || tx >= grid[ty].length) return '#';
  return grid[ty][tx];
}

export function isSolidTile(c) {
  return c === '#' || c === '=' || c === 'C' || c === 'o';
}

export function isWaterTile(c) {
  return c === '~' || c === '\u2248' || c === '\u224b';
}

export function tileHeightFor(c, tile) {
  if (c === '=' || c === 'C') return tile * 0.55;
  if (c === 'o') return tile * 0.45;
  if (c === '^') return tile;
  if (c === 'R') return tile * 0.5;
  return tile;
}

export function cameraZFor(c, tile) {
  if (c === '^') return tile * 1.5;
  if (c === 'R') return tile;
  return tile * 0.5;
}

let THREE = null;
let loadPromise = null;
let renderer = null;
let scene = null;
let camera = null;
let mapGroup = null;
let dynamicGroup = null;
let viewmodelGroup = null;
let skyMesh = null;
let hemiLight = null;
let weatherPoints = null;
let weatherKey = '';
let atmosphere = {
  mapId: '',
  fogColor: 0x20262e,
  fogNear: 500,
  fogFar: 2400,
  sun: [255, 214, 150],
  hemiIntensity: 1.05,
  sunIntensity: 2.4
};
let mapKey = '';
let canvasRef = null;
let layersRef = null;
let cameraLight = null;
let cameraFill = null;
let bounceLight = null;
let environmentTexture = null;
let mapIdentityStats = null;
let entityMeshes = new Map();
let dropMeshes = new Map();
let grenadeMeshes = new Map();
let smokeMeshes = [];
let particleMeshes = [];
let shellMeshes = [];
let shockwaveMeshes = [];
let splashMeshes = [];
let corpseMeshes = new Map();
let decalPointMeshes = new Map();
let viewmodelKey = '';
let initGen = 0;
const normalMapCache = new Map();
const textureCache = new Map();
const geometryCache = new Map();
const MAX_TEXTURE_CACHE = 128;
const MAX_GEOMETRY_CACHE = 512;
let webglHealthy = true;
let frameHealthTick = 0;

function ensureThree() {
  if (THREE) return Promise.resolve(THREE);
  if (!loadPromise) {
    loadPromise = import('../vendor/three.module.js')
      .then((mod) => {
        THREE = mod.default || mod;
        return THREE;
      })
      .catch((err) => {
        console.error('[render3d-next] Three.js load failed:', err);
        return null;
      });
  }
  return loadPromise;
}

function disposeRenderer() {
  if (renderer) {
    try { renderer.dispose(); } catch (err) { /* ignore */ }
    renderer = null;
  }
  scene = null;
  camera = null;
  mapGroup = null;
  dynamicGroup = null;
  viewmodelGroup = null;
  skyMesh = null;
  hemiLight = null;
  weatherPoints = null;
  weatherKey = '';
  atmosphere = {
    mapId: '',
    fogColor: 0x20262e,
    fogNear: 500,
    fogFar: 2400,
    sun: [255, 214, 150],
    hemiIntensity: 1.05,
    sunIntensity: 2.4
  };
  cameraLight = null;
  cameraFill = null;
  bounceLight = null;
  mapIdentityStats = null;
  mapKey = '';
  entityMeshes = new Map();
  dropMeshes = new Map();
  grenadeMeshes = new Map();
  smokeMeshes = [];
  particleMeshes = [];
  shellMeshes = [];
  shockwaveMeshes = [];
  splashMeshes = [];
  corpseMeshes = new Map();
  decalPointMeshes = new Map();
  viewmodelKey = '';
  if (environmentTexture) {
    try { environmentTexture.dispose(); } catch (err) { /* ignore */ }
    environmentTexture = null;
  }
  environmentTexture = null;
  clearResourceCaches();
  webglHealthy = true;
}

export function render3dNextReady() {
  return !!THREE && !!renderer && !!scene && !!camera;
}

export function disposeRenderer3dNext() {
  disposeRenderer();
}

export async function initRenderer3dNext(canvas, layers) {
  const gen = ++initGen;
  canvasRef = canvas;
  layersRef = layers;
  disposeRenderer();
  const T = await ensureThree();
  if (gen !== initGen || !T || !canvas || !layers) return false;
  try {
    const dom = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!dom) return false;
    renderer = new T.WebGLRenderer({
      canvas: dom,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(0x1c2530, 1);
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      webglHealthy = false;
    }, false);
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      webglHealthy = true;
    }, false);
    scene = new T.Scene();
    scene.fog = new T.Fog(0x20262e, 500, 2400);
    camera = new T.PerspectiveCamera(75, 16 / 9, 0.05, 4000);
    camera.rotation.order = 'YXZ';
    mapGroup = new T.Group();
    dynamicGroup = new T.Group();
    viewmodelGroup = new T.Group();
    scene.add(mapGroup, dynamicGroup);
    scene.add(camera);
    camera.add(viewmodelGroup);
    hemiLight = new T.HemisphereLight(0xcfe8ff, 0x59615a, 1.05);
    scene.add(hemiLight);
    cameraLight = new T.DirectionalLight(0xfff1d6, 2.4);
    cameraLight.castShadow = true;
    cameraLight.shadow.mapSize.set(2048, 2048);
    cameraLight.shadow.camera.near = 50;
    cameraLight.shadow.camera.far = 2200;
    cameraLight.shadow.bias = -0.0008;
    scene.add(cameraLight);
    scene.add(cameraLight.target);
    cameraFill = new T.PointLight(0xffe8c8, 0.65, 1100, 1.8);
    camera.add(cameraFill);
    bounceLight = new T.DirectionalLight(0xffffff, 0.26);
    bounceLight.position.set(-600, 160, -420);
    scene.add(bounceLight);
    scene.add(bounceLight.target);
    return true;
  } catch (err) {
    console.error('[render3d-next] init failed:', err);
    disposeRenderer();
    return false;
  }
}

export function render3dNext(game) {
  if (!render3dNextReady() || !game || !canvasRef) return;
  if (!webglHealthy) {
    game._render3dBackend = 'legacy';
    return;
  }
  game._render3dBackend = 'next';
  try {
    const map = getMap();
    if (map && map.id !== mapKey) rebuildMap(game, map);
    const ent = fpsCameraEntity(game);
    if (!ent) return;
    updateCamera(game, ent, map);
    updateLighting(map, game);
    updateDynamicNext(game);
    updateViewmodelNext(game);
    const teamMarkers = Array.from(entityMeshes.values()).filter((g) => {
      const m = g.getObjectByName('teamMarker');
      return !!(m && m.visible);
    }).length;
    const entityWeapons = Array.from(entityMeshes.values()).filter((g) => {
      const m = g.getObjectByName('weaponMesh');
      return !!(m && m.visible);
    }).length;
    const entityMuzzles = Array.from(entityMeshes.values()).filter((g) => {
      const m = g.getObjectByName('muzzle');
      return !!(m && m.visible);
    }).length;
    const mapCullSafe = mapGroup ? mapGroup.children.filter((o) => o.isInstancedMesh && o.frustumCulled === false).length : 0;
    const mapModelStats = {
      wallSkirts: mapGroup ? mapGroup.children.filter((o) => o.name === 'wallSkirts').length : 0,
      wallPipes: mapGroup ? mapGroup.children.filter((o) => o.name === 'wallPipes').length : 0,
      wallConduits: mapGroup ? mapGroup.children.filter((o) => o.name === 'wallConduits').length : 0
    };
    const groundModelStats = {
      groundSeams: mapGroup ? mapGroup.children.filter((o) => String(o.name || '').indexOf('groundSeams') === 0).length : 0,
      groundCurbs: mapGroup ? mapGroup.children.filter((o) => String(o.name || '').indexOf('groundCurbs') === 0).length : 0,
      drainGrills: mapGroup ? mapGroup.children.filter((o) => o.name === 'drainGrills').length : 0,
      sitePlates: mapGroup ? mapGroup.children.filter((o) => o.name === 'siteCornerBolts').length : 0
    };
    const effectObjects = shellMeshes.length + shockwaveMeshes.length + splashMeshes.length + particleMeshes.length + smokeMeshes.length;
    const dpr = Math.min(2, Math.max(1, game.dpr || 1));
    const quality = renderQualityFor(game);
    const perf = performanceBudgetFor(game);
    const cssW = canvasRef.width / dpr;
    const cssH = canvasRef.height / dpr;
    const sizeValid = !!(canvasRef.width > 1 && canvasRef.height > 1 && isFinite(cssW) && isFinite(cssH) && cssW > 1 && cssH > 1);
    if (!sizeValid) {
      game._render3dBackend = 'legacy';
      game._renderStability = { webglHealthy, sizeValid: false, strikes: game._renderHealthStrikes || 0 };
      return;
    }
    const scale = game._renderScale >= 0.5 && game._renderScale <= 1 ? game._renderScale : 1;
    const w = Math.max(320, Math.min(1920, Math.floor(cssW * scale * quality)));
    const h = Math.max(180, Math.min(1080, Math.floor(cssH * scale * quality)));
    if (cameraLight && cameraLight.shadow.mapSize.x !== perf.shadowMapSize) {
      cameraLight.shadow.mapSize.set(perf.shadowMapSize, perf.shadowMapSize);
      cameraLight.shadow.map = null;
    }
    if (renderer && renderer.shadowMap && THREE) {
      const shadowType = perf.shadowType === 'PCFSoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      if (renderer.shadowMap.type !== shadowType) renderer.shadowMap.type = shadowType;
    }
    game._perfBudget = perf;
    renderer.setPixelRatio(Math.min(dpr, 2, quality * 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fovDeg = game.fov && isFinite(game.fov) ? game.fov * 180 / Math.PI : 75;
    if (Math.abs(camera.fov - fovDeg) > 0.01) camera.fov = fovDeg;
    camera.updateProjectionMatrix();
    const renderT0 = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - renderT0;
    const ctx = canvasRef.getContext('2d');
    if (ctx) ctx.drawImage(renderer.domElement, 0, 0, canvasRef.width, canvasRef.height);
    if (ctx) updateFrameHealth(game, ctx);
    if (ctx) drawFpsHud(ctx, game, THREE);
    game._renderStats = {
      total: renderMs,
      render3dBackend: 'next',
      mapId: map && map.id || '',
      mapObjects: mapGroup ? mapGroup.children.length : 0,
      dynamicObjects: dynamicGroup ? dynamicGroup.children.length : 0,
      viewmodelObjects: viewmodelGroup ? viewmodelGroup.children.length : 0,
      viewmodelParts: viewmodelGroup ? (() => {
        let n = 0;
        viewmodelGroup.traverse((o) => { if (o.isMesh) n++; });
        return n;
      })() : 0,
      teamMarkers,
      entityWeapons,
      entityMuzzles,
      bakedGround: layersRef && layersRef.staticLayer ? 1 : 0,
      corpseObjects: corpseMeshes.size,
      decalObjects: decalPointMeshes.size,
      mapCullSafe,
      mapModelStats,
      groundModelStats,
      effectObjects,
      smokeVolumes: smokeMeshes.length,
      weatherPoints: weatherPoints ? weatherPoints.geometry.attributes.position.count : 0,
      weatherKind: weatherKey || 'none',
      renderSize: { width: w, height: h, cssWidth: Math.floor(cssW), cssHeight: Math.floor(cssH) },
      renderScale: scale,
      atmosphere,
      lighting: {
        shadowMapSize: perf.shadowMapSize,
        shadowFrustum: cameraLight ? cameraLight.shadow.camera.right - cameraLight.shadow.camera.left : 0,
        shadowType: renderer && renderer.shadowMap ? renderer.shadowMap.type : 0,
        bounceLight: bounceLight ? 1 : 0,
        contactAO: 1
      },
      fpsHud: game._fpsHudStats || { teamBars: 0, siteMarkers: 0, bombMarkers: 0, damageNumbers: 0, roundTimer: 0, bombTimer: 0, ammoHud: 0, statusLines: 0 },
      performance: perf,
      mapIdentity: mapIdentityStats || { spawnMarkers: 0, flags: 0, namePlate: 0 },
      smokeRenderMode: 'cloud',
      viewmodelSway: game._viewmodelSway || { swayX: 0, swayY: 0, recoil: 0, scopeT: 0 },
      audioSpatial: game._audioSpatial || null,
      stability: { webglHealthy, sizeValid: true, strikes: game._renderHealthStrikes || 0 },
      drawCalls: renderer && renderer.info && renderer.info.render ? renderer.info.render.calls : 0,
      quality,
      pixelRatio: renderer.getPixelRatio(),
      textureCacheSize: textureCache.size,
      geometryCacheSize: geometryCache.size,
      webglHealthy
    };
  } catch (err) {
    console.error('[render3d-next] frame error:', err);
    if (game) game._render3dBackend = 'legacy';
  }
}

function drawFpsHud(ctx, game, T) {
  if (!ctx || !camera || !T || !game) return;
  const map = getMap();
  const ent = fpsCameraEntity(game);
  if (!ent) return;
  const tile = (map && map.tile) || 16;
  const cw = canvasRef.width || 1;
  const ch = canvasRef.height || 1;
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const stats = { teamBars: 0, siteMarkers: 0, bombMarkers: 0, damageNumbers: 0 };
  const project = (wx, wy, wz) => {
    const v = new T.Vector3(wx, wy, wz).project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * cw, y: (-v.y * 0.5 + 0.5) * ch, z: v.z };
  };
  const onScreen = (p) => !!(p && p.x > -24 && p.x < cw + 24 && p.y > -24 && p.y < ch + 24);
  const edgePoint = (wx, wy, wz) => {
    const cs = new T.Vector3(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
    let ax = cs.x;
    let ay = -cs.y;
    const len = Math.max(0.0001, Math.hypot(ax, ay));
    ax /= len;
    ay /= len;
    if (cs.z > 0) {
      ax = -ax;
      ay = -ay;
    }
    const margin = 42;
    const kx = ax === 0 ? cw / 2 : (cw / 2 - margin) / Math.abs(ax);
    const ky = ay === 0 ? ch / 2 : (ch / 2 - margin) / Math.abs(ay);
    const k = Math.min(kx, ky);
    return { x: cw / 2 + ax * k, y: ch / 2 + ay * k };
  };
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (map && map.sites) {
    const keys = ['A', 'B'];
    for (const key of keys) {
      const s = map.sites[key];
      if (!s) continue;
      const cx = (s.x0 + s.x1) / 2;
      const cz = (s.y0 + s.y1) / 2;
      const p = project(cx, tile * 0.3, cz);
      const target = onScreen(p) ? p : edgePoint(cx, tile * 0.3, cz);
      const color = key === 'A' ? 'rgba(255,138,74,0.9)' : 'rgba(90,168,255,0.9)';
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0b0e12';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(key, target.x, target.y + 0.5);
      stats.siteMarkers++;
    }
  }

  for (const e of game.entities || []) {
    if (e === ent || e.dead || e.team !== ent.team) continue;
    const ex = e.x || 0;
    const ey = e.y || 0;
    const p = project(ex, groundElevationAt(ex, ey) + tile * 1.72, ey);
    if (!onScreen(p)) continue;
    const bw = Math.min(110, cw * 0.1);
    const bh = 7;
    ctx.fillStyle = 'rgba(8,12,16,0.62)';
    ctx.fillRect(p.x - bw / 2 - 2, p.y - bh / 2 - 2, bw + 4, bh + 4);
    ctx.fillStyle = e.team === 't' ? '#e0a35a' : '#4f9dd8';
    ctx.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
    ctx.fillStyle = '#0c1014';
    ctx.fillRect(p.x - bw / 2 + 1, p.y - bh / 2 + 1, bw * Math.max(0, Math.min(1, (e.hp || 0) / 100)) - 2, bh - 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(String(Math.max(0, Math.round(e.hp || 0))), p.x, p.y + bh + 10);
    stats.teamBars++;
  }

  if (game.bomb) {
    const b = game.bomb;
    const bx = b.x || 0;
    const by = b.y || 0;
    const byWorld = groundElevationAt(bx, by) + tile * 0.9;
    const p = project(bx, byWorld, by);
    const target = onScreen(p) ? p : edgePoint(bx, byWorld, by);
    ctx.fillStyle = '#ff4b3a';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 14);
    ctx.lineTo(target.x + 11, target.y);
    ctx.lineTo(target.x, target.y + 14);
    ctx.lineTo(target.x - 11, target.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b0e12';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('B', target.x, target.y + 1);
    if (b.planted) {
      ctx.fillStyle = 'rgba(255,245,220,0.95)';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(Math.max(0, b.time || 0).toFixed(1), target.x, target.y + 28);
    }
    stats.bombMarkers++;
  }

  for (const pop of game.dmgPops || []) {
    const ex = pop.x || 0;
    const ey = pop.y || 0;
    const p = project(ex, groundElevationAt(ex, ey) + tile * (0.8 + Math.max(0, 0.8 - (pop.t || 0)) * 0.3), ey);
    if (!onScreen(p)) continue;
    ctx.fillStyle = pop.head ? '#ffb84d' : '#ff5f4d';
    ctx.strokeStyle = 'rgba(8,10,14,0.9)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 20px sans-serif';
    ctx.strokeText(String(pop.dmg || 0), p.x, p.y);
    ctx.fillText(String(pop.dmg || 0), p.x, p.y);
    stats.damageNumbers++;
  }

  ctx.restore();
  drawMatchOverlay(ctx, game, ent, cw, ch, stats);
  game._fpsHudStats = stats;
}

function hudClock(seconds) {
  const v = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function drawMatchOverlay(ctx, game, ent, cw, ch, stats) {
  if (!ctx || !game || !ent) return;
  const score = game.score || {};
  const round = game.round || 0;
  const planted = !!(game.bomb && game.bomb.planted);
  const timer = planted ? (game.bomb.timer || 0) : Math.max(0, (game.roundDur || 115) - (game.roundTime || 0));
  const phase = game.freezeT > 0 ? 'FREEZE' : game.buyTime > 0 ? 'BUY' : planted ? 'BOMB' : (game.state || 'LIVE');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const barW = Math.min(320, Math.max(250, cw * 0.22));
  const barH = 78;
  const barX = (cw - barW) / 2;
  ctx.fillStyle = 'rgba(8,12,16,0.68)';
  ctx.fillRect(barX, 10, barW, barH);
  ctx.strokeStyle = 'rgba(220,225,235,0.34)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, 10, barW, barH);
  ctx.fillStyle = '#f4f0e8';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText((score.T || 0) + ' : ' + (score.CT || 0) + '  R' + round, cw / 2, 31);
  ctx.fillStyle = planted ? '#ff6a58' : '#d9e3ed';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(phase, cw / 2, 53);
  ctx.fillStyle = '#f4f0e8';
  ctx.fillText('TIME ' + hudClock(timer), cw / 2, 74);
  stats.roundTimer = 1;
  if (planted) {
    ctx.fillStyle = '#ff4b3a';
    ctx.fillText('BOMB ' + Math.max(0, game.bomb.timer || 0).toFixed(1), cw / 2, 96);
    stats.bombTimer = 1;
  }

  const w = weaponDef(ent);
  const ammo = w && w.mag > 0 ? ammoFor(ent) : 0;
  const reserve = w && w.mag > 0 ? reserveFor(ent) : 0;
  const label = w && w.name ? w.name : wkey(ent);
  const bottomW = Math.min(330, Math.max(250, cw * 0.26));
  const bottomX = 18;
  const bottomY = ch - 88;
  ctx.fillStyle = 'rgba(8,12,16,0.68)';
  ctx.fillRect(bottomX, bottomY, bottomW, 70);
  ctx.strokeStyle = 'rgba(220,225,235,0.30)';
  ctx.strokeRect(bottomX, bottomY, bottomW, 70);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4f0e8';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(String(label || 'knife').toUpperCase(), bottomX + 12, bottomY + 15);
  ctx.fillStyle = '#ffd88a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(String(ammo) + (w && w.mag > 0 ? ' / ' + reserve : ''), bottomX + 12, bottomY + 40);
  ctx.fillStyle = '#f4f0e8';
  ctx.font = 'bold 12px sans-serif';
  const hpPct = Math.max(0, Math.min(1, (ent.hp || 0) / 100));
  const armPct = Math.max(0, Math.min(1, (ent.armor || 0) / 100));
  ctx.fillText('HP', bottomX + 12, bottomY + 58);
  ctx.fillStyle = ent.hp > 40 ? '#58c26a' : '#ff5f4d';
  ctx.fillRect(bottomX + 34, bottomY + 53, 92 * hpPct, 8);
  ctx.fillStyle = '#8fb9e8';
  ctx.fillText('ARMOR', bottomX + 134, bottomY + 58);
  ctx.fillRect(bottomX + 176, bottomY + 53, 70 * armPct, 8);
  stats.ammoHud = 1;

  const rightW = Math.min(190, Math.max(150, cw * 0.15));
  const rightX = cw - rightW - 16;
  const rightY = ch - 56;
  ctx.fillStyle = 'rgba(8,12,16,0.68)';
  ctx.fillRect(rightX, rightY, rightW, 42);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f4f0e8';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('$' + Math.max(0, Math.round(ent.money || 0)), rightX + rightW - 12, rightY + 21);
  ctx.fillStyle = ent.hasBomb ? '#ffb84d' : 'rgba(220,225,235,0.75)';
  ctx.font = '11px sans-serif';
  ctx.fillText(ent.hasBomb ? 'BOMB CARRIER' : (ent.helmet ? 'HELMET' : (ent.armor > 0 ? 'ARMOR' : 'NO ARMOR')), rightX + rightW - 12, rightY + 33);
  stats.statusLines = 1;
  ctx.restore();
}

function fpsCameraEntity(game) {
  if (!game || !game.player) return null;
  if (!game.player.dead) return game.player;
  if (game.cyber && !game.cyber.ended) {
    const bots = (game.entities || []).filter((e) => e.bot && !e.dead);
    if (bots.length) return bots[game.spectateIdx % bots.length];
  }
  const mates = (game.entities || []).filter((e) => e.team === game.player.team && !e.dead);
  if (mates.length) return mates[game.spectateIdx % mates.length];
  return null;
}

function rebuildMap(game, map) {
  mapKey = map.id;
  clearGroup(mapGroup);
  disposeAllDynamic();
  clearGroup(dynamicGroup);
  if (viewmodelGroup) clearGroup(viewmodelGroup);
  viewmodelKey = '';
  buildMapScene(map, layersRef);
}

function disposeAllDynamic() {
  for (const mesh of entityMeshes.values()) disposeObject(mesh);
  for (const mesh of dropMeshes.values()) disposeObject(mesh);
  for (const mesh of grenadeMeshes.values()) disposeObject(mesh);
  for (const mesh of smokeMeshes) disposeObject(mesh);
  for (const mesh of particleMeshes) disposeObject(mesh);
  for (const mesh of shellMeshes) disposeObject(mesh);
  for (const mesh of shockwaveMeshes) disposeObject(mesh);
  for (const mesh of splashMeshes) disposeObject(mesh);
  for (const mesh of corpseMeshes.values()) disposeObject(mesh);
  for (const mesh of decalPointMeshes.values()) disposeObject(mesh);
  entityMeshes = new Map();
  dropMeshes = new Map();
  grenadeMeshes = new Map();
  smokeMeshes = [];
  particleMeshes = [];
  shellMeshes = [];
  shockwaveMeshes = [];
  splashMeshes = [];
  corpseMeshes = new Map();
  decalPointMeshes = new Map();
  weatherPoints = null;
  weatherKey = '';
}

function clearGroup(group) {
  if (!group) return;
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function disposeMaterial(mat) {
  if (!mat) return;
  if (mat.map && !mat.map.userData._cached) mat.map.dispose();
  mat.dispose();
}

function clearResourceCaches() {
  for (const byRepeat of textureCache.values()) {
    for (const tex of byRepeat.values()) {
      try { tex.dispose(); } catch (err) { /* ignore */ }
    }
  }
  textureCache.clear();
  for (const geo of geometryCache.values()) {
    try { geo.dispose(); } catch (err) { /* ignore */ }
  }
  geometryCache.clear();
  for (const tex of normalMapCache.values()) {
    try { tex.dispose(); } catch (err) { /* ignore */ }
  }
  normalMapCache.clear();
}

function renderQualityFor(game) {
  let q = (typeof game.renderQuality === 'number' && isFinite(game.renderQuality)) ? game.renderQuality : 1;
  q = Math.max(0.55, Math.min(1, q));
  return q;
}

function performanceBudgetFor(game) {
  const q = renderQualityFor(game);
  return {
    shadowMapSize: q >= 0.9 ? 2048 : q >= 0.72 ? 1024 : 512,
    shadowType: q >= 0.72 ? 'PCFSoft' : 'PCF',
    particleCaps: {
      shell: Math.max(12, Math.round(40 * q)),
      boom: Math.max(8, Math.round(24 * q)),
      splash: Math.max(10, Math.round(32 * q)),
      other: Math.max(32, Math.round(80 * q))
    },
    dynamicEntityCap: Math.max(10, Math.round(24 * q)),
    smokeCap: Math.max(18, Math.round(120 * q)),
    weatherPoints: Math.max(90, Math.round(260 * q)),
    tracerPoints: Math.max(96, Math.round(240 * q))
  };
}

function updateFrameHealth(game, ctx) {
  if (!game || !ctx || !canvasRef) return;
  frameHealthTick++;
  if (frameHealthTick % 45 !== 0) return;
  try {
    const w = canvasRef.width;
    const h = canvasRef.height;
    const step = Math.max(8, Math.floor(Math.min(w, h) / 22));
    const data = ctx.getImageData(0, 0, w, h).data;
    let checked = 0;
    let lit = 0;
    let white = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const sum = data[i] + data[i + 1] + data[i + 2];
        checked++;
        if (sum > 40) lit++;
        if (sum > 720) white++;
      }
    }
    if (checked > 0 && (lit === 0 || white / checked > 0.9)) {
      game._renderHealthStrikes = (game._renderHealthStrikes || 0) + 1;
      if (game._renderHealthStrikes >= 3) {
        webglHealthy = false;
        game._render3dBackend = 'legacy';
      } else if (game._renderScale > 0.65) {
        game._renderScale = Math.max(0.6, (game._renderScale || 1) - 0.1);
      }
    } else {
      game._renderHealthStrikes = 0;
    }
  } catch (err) { /* sampling must never break rendering */ }
}

function updateCamera(game, ent, map) {
  if (!camera || !ent) return;
  const eye = 0.5 * ((map && map.tile) || 16);
  const elev = groundElevationAt(ent.x || 0, ent.y || 0);
  camera.position.set(ent.x || 0, eye + elev, ent.y || 0);
  if (skyMesh) skyMesh.position.set(camera.position.x, 0, camera.position.z);
  camera.rotation.set(0, -(ent.angle || 0) - Math.PI / 2, 0);
  camera.rotation.x = 0;
}

function updateLighting(map, game) {
  if (!cameraLight || !map) return;
  const cx = map.W / 2;
  const cz = map.H / 2;
  const theme = themeOf(map.id);
  const sky = theme.sky || {};
  const sun = sky.sun || [255, 214, 150];
  const atmo = theme.atmo || {};
  const haze = atmo.haze || 0.5;
  const cam = camera && camera.position ? camera.position : null;
  const lx = cam ? Math.max(0, Math.min(map.W, cam.x)) : cx;
  const lz = cam ? Math.max(0, Math.min(map.H, cam.z)) : cz;
  cameraLight.position.set(lx + 420 + haze * 220, 420 + haze * 260, lz + 260);
  cameraLight.target.position.set(lx, 0, lz);
  cameraLight.color.setRGB(sun[0] / 255, sun[1] / 255, sun[2] / 255);
  cameraLight.intensity = 1.7 + haze * 0.9;
  const shadowHalf = Math.min(780, Math.max(520, Math.max(map.W, map.H) * 0.32));
  cameraLight.shadow.camera.left = -shadowHalf;
  cameraLight.shadow.camera.right = shadowHalf;
  cameraLight.shadow.camera.top = shadowHalf;
  cameraLight.shadow.camera.bottom = -shadowHalf;
  cameraLight.shadow.camera.updateProjectionMatrix();
  cameraLight.shadow.normalBias = 0.018;
  cameraLight.shadow.bias = -0.0005;
  if (hemiLight) {
    const ground = atmo.fogColor || [89, 97, 90];
    hemiLight.color.setRGB(0.81 + haze * 0.16, 0.85 + haze * 0.1, 0.95);
    hemiLight.groundColor.setRGB(ground[0] / 255, ground[1] / 255, ground[2] / 255);
    hemiLight.intensity = 0.85 + haze * 0.45;
  }
  if (cameraFill) {
    cameraFill.color.setRGB(sun[0] / 255, sun[1] / 255, sun[2] / 255);
    cameraFill.intensity = 0.42 + haze * 0.34;
  }
  if (bounceLight) {
    const floor = theme.floor || [36, 39, 44];
    const br = Math.min(1, (floor[0] / 255) * 1.45);
    const bg = Math.min(1, (floor[1] / 255) * 1.45);
    const bb = Math.min(1, (floor[2] / 255) * 1.45);
    bounceLight.color.setRGB(br, bg, bb);
    bounceLight.intensity = 0.16 + (1 - haze) * 0.13;
    bounceLight.position.set(cameraLight.position.x - 720, 160, cameraLight.position.z - 480);
    bounceLight.target.position.set(lx, 0, lz);
  }
  atmosphere.mapId = map.id;
  atmosphere.sun = sun.slice();
  atmosphere.hemiIntensity = hemiLight ? hemiLight.intensity : 1.05;
  atmosphere.sunIntensity = cameraLight.intensity;
}

function buildPbrEnvironment(map) {
  if (!scene || !THREE || typeof document === 'undefined') return;
  if (scene.environment) {
    try { scene.environment.dispose(); } catch (err) { /* ignore */ }
    scene.environment = null;
  }
  if (environmentTexture) {
    try { environmentTexture.dispose(); } catch (err) { /* ignore */ }
    environmentTexture = null;
  }
  const theme = themeOf((map && map.id) || 'dust2');
  const sky = theme.sky || {};
  const atmo = theme.atmo || {};
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, sky.top || '#182838');
  grad.addColorStop(0.55, sky.horizon || '#52606b');
  grad.addColorStop(1, '#252a2d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 32);
  const sun = sky.sun || [255, 214, 150];
  ctx.fillStyle = 'rgba(' + sun[0] + ',' + sun[1] + ',' + sun[2] + ',0.95)';
  ctx.beginPath();
  ctx.arc(48, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = tex;
  environmentTexture = tex;
  if (scene.environmentIntensity !== undefined) {
    scene.environmentIntensity = 0.55 + (atmo.haze || 0.5) * 0.3;
  }
}

function applyPbrProfile(group, map) {
  if (!group) return;
  const theme = themeOf((map && map.id) || 'dust2');
  const atmo = theme.atmo || {};
  const haze = atmo.haze || 0.5;
  const roughScale = 0.88 + haze * 0.2;
  const metalBoost = map && map.id === 'metro' ? 0.08 : map && map.id === 'blast' ? 0.05 : 0.02;
  const envIntensity = 0.45 + haze * 0.25;
  group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat || !mat.isMeshStandardMaterial) continue;
      mat.envMapIntensity = envIntensity;
      mat.roughness = Math.min(1, Math.max(0.12, mat.roughness * roughScale));
      mat.metalness = Math.min(1, mat.metalness + metalBoost);
    }
  });
}

function addMapIdentity(group, T, map, tile) {
  if (!group || !T || !map) return;
  mapIdentityStats = { spawnMarkers: 0, flags: 0, namePlate: 0 };
  const spawns = map.spawns || {};
  const tSpawns = (spawns.t || []).slice(0, 8);
  const ctSpawns = (spawns.ct || []).slice(0, 8);
  const allSpawns = [...tSpawns.map((s) => ({ ...s, team: 't' })), ...ctSpawns.map((s) => ({ ...s, team: 'ct' }))];
  if (allSpawns.length) {
    const mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide });
    const mesh = new T.InstancedMesh(new T.RingGeometry(tile * 0.52, tile * 0.72, 20), mat, allSpawns.length);
    mesh.name = 'spawnMarkers';
    mesh.frustumCulled = false;
    for (let i = 0; i < allSpawns.length; i++) {
      const s = allSpawns[i];
      setInstanceTransform(T, mesh, i, s.x || 0, tile * 0.015, s.y || 0, 1, 1, 1, -Math.PI / 2, 0, 0);
      mesh.setColorAt(i, new T.Color(s.team === 't' ? 0xe0a35a : 0x4f9dd8));
    }
    group.add(mesh);
    mapIdentityStats.spawnMarkers = allSpawns.length;
  }

  const flags = new T.Group();
  flags.name = 'mapFlags';
  const specs = [
    { team: 't', pos: tSpawns[0], color: '#e0a35a' },
    { team: 'ct', pos: ctSpawns[0], color: '#4f9dd8' }
  ];
  for (const spec of specs) {
    if (!spec.pos) continue;
    const pole = new T.Mesh(
      new T.CylinderGeometry(tile * 0.025, tile * 0.035, tile * 1.4, 6),
      new T.MeshStandardMaterial({ color: 0x333b43, roughness: 0.5, metalness: 0.38 })
    );
    pole.position.set(spec.pos.x, tile * 0.7, spec.pos.y);
    pole.castShadow = true;
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.team.toUpperCase(), 64, 34);
    const tex = new T.CanvasTexture(cv);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    const flag = new T.Mesh(
      new T.PlaneGeometry(tile * 0.72, tile * 0.38),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide, transparent: true, opacity: 0.92 })
    );
    flag.position.set(spec.pos.x + tile * 0.42, tile * 0.86, spec.pos.y);
    flag.rotation.y = -0.12;
    flags.add(pole, flag);
  }
  if (flags.children.length) {
    group.add(flags);
    mapIdentityStats.flags = flags.children.length / 2;
  }

  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(16,20,24,0.88)');
  grad.addColorStop(0.5, 'rgba(28,34,40,0.86)');
  grad.addColorStop(1, 'rgba(16,20,24,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = map.accent || '#d6a95f';
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = map.accent || '#d6a95f';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String((map.id || 'CS2D').toUpperCase()), 128, 35);
  const tex = new T.CanvasTexture(cv);
  if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false }));
  sprite.name = 'mapNamePlate';
  sprite.position.set(map.W / 2, tile * 5.4, map.H / 2);
  sprite.scale.set(tile * 7, tile * 1.75, 1);
  sprite.renderOrder = 5;
  group.add(sprite);
  mapIdentityStats.namePlate = 1;
}

function buildMapScene(map, layers) {
  if (!mapGroup || !scene || !THREE || !map) return;
  const T = THREE;
  const tile = map.tile || 16;
  const grid = map.grid || [];
  const w = map.W || grid.length * tile;
  const h = map.H || (grid.length ? grid[0].length * tile : 0);

  buildPbrEnvironment(map);
  buildSky(map);

  const baked = layers && layers.staticLayer;
  const floorRX = baked ? 1 : Math.max(2, Math.round(w / 180));
  const floorRY = baked ? 1 : Math.max(2, Math.round(h / 180));
  const floorSrc = baked ? layers.staticLayer : layers && layers.floorTex;
  const floorTex = textureFrom(floorSrc, floorRX, floorRY);
  const floorNorm = normalMapFor(floorSrc, floorRX, floorRY);
  const floorMat = new T.MeshStandardMaterial({
    map: floorTex,
    normalMap: floorNorm,
    normalScale: new T.Vector2(0.38, 0.38),
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.02,
    vertexColors: true
  });
  const floorSeg = Math.min(64, Math.max(24, Math.floor(Math.max(w, h) / 110)));
  const floorGeo = planeGeometry(w, h, floorSeg, floorSeg);
  setGroundVertexColors(floorGeo, w, h, grid, tile, map);
  const ground = new T.Mesh(floorGeo, floorMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.set(w / 2, 0, h / 2);
  mapGroup.add(ground);

  const counts = scanMapCounts(grid, tile);
  const crateNorm = normalMapFor((layers && layers.crateTex) || (layers && layers.thinWallTex));
  const wallMat = new T.MeshStandardMaterial({
    map: textureFrom((layers && (layers.wallVariants && layers.wallVariants.v0)) || (layers && layers.wallTex), 1, 1),
    normalMap: normalMapFor((layers && (layers.wallVariants && layers.wallVariants.v0)) || (layers && layers.wallTex)),
    normalScale: new T.Vector2(0.55, 0.55),
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02
  });
  const crateMat = new T.MeshStandardMaterial({
    map: textureFrom((layers && layers.crateTex) || (layers && layers.thinWallTex), 1, 1),
    normalMap: crateNorm,
    normalScale: new T.Vector2(0.5, 0.5),
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.04
  });
  const platformMat = new T.MeshStandardMaterial({
    map: textureFrom((layers && layers.platformTex) || floorTex, 1, 1),
    normalMap: floorNorm,
    normalScale: new T.Vector2(0.35, 0.35),
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02
  });
  const barrelMat = new T.MeshStandardMaterial({
    map: textureFrom(layers && layers.barrelTex, 1, 1),
    normalMap: normalMapFor(layers && layers.barrelTex),
    normalScale: new T.Vector2(0.45, 0.45),
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.35
  });
  const capMat = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02
  });
  const waterMat = new T.MeshStandardMaterial({
    map: textureFrom(layers && layers.waterTex, 1, 1),
    color: 0xbfe4ff,
    transparent: true,
    opacity: 0.72,
    roughness: 0.25,
    metalness: 0.05,
    depthWrite: false
  });
  const deepWaterMat = new T.MeshStandardMaterial({
    color: 0x194a6b,
    transparent: true,
    opacity: 0.82,
    roughness: 0.3,
    metalness: 0.1,
    depthWrite: false
  });

  const wallMats = makeWallMaterials(T, layers);
  addInstancedWallVariants(mapGroup, T, countWallVariants(grid, wallMats.length), boxGeometry(tile, tile, tile), wallMats,
    (tx, ty, c, cx, cz, i, mesh) => {
      setInstanceTransform(T, mesh, i, cx, tile * 0.5, cz, 1, 1, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(wallColor(c)));
    });
  addInstancedBoxes(mapGroup, T, 'thin', counts.thin, boxGeometry(tile, tile, tile), wallMat,
    (tx, ty, c, cx, cz, i, mesh) => {
      setInstanceTransform(T, mesh, i, cx, tile * 0.275, cz, 1, 0.55, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(wallColor(c)));
    });
  addInstancedBoxes(mapGroup, T, 'crates', counts.crate, boxGeometry(tile, tile, tile), crateMat,
    (tx, ty, c, cx, cz, i, mesh) => {
      setInstanceTransform(T, mesh, i, cx, tile * 0.275, cz, 0.92, 0.55, 0.92, 0, 0, (tx * 0.7 + ty * 0.3) % 1);
      mesh.setColorAt(i, new T.Color(0xb8865a));
    });
  addInstancedBoxes(mapGroup, T, 'platforms', counts.platform, boxGeometry(tile, tile, tile), platformMat,
    (tx, ty, c, cx, cz, i, mesh) => {
      const hgt = c === '^' ? tile : tile * 0.5;
      setInstanceTransform(T, mesh, i, cx, hgt * 0.5, cz, 1, hgt / tile, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(c === '^' ? 0x9faab4 : 0x9b8f78));
    });
  addInstancedBarrels(mapGroup, T, counts.barrel, barrelMat);
  addInstancedWater(mapGroup, T, grid, tile, counts.water, waterMat, deepWaterMat);
  addInstancedWallCaps(mapGroup, T, grid, tile, counts.wall, counts.thin, capMat);
  addInstancedWallBases(mapGroup, T, grid, tile, counts.wall, counts.thin);
  addInstancedWallDetail(mapGroup, T, grid, tile, counts.wall, counts.thin);
  addGroundDetail(mapGroup, T, grid, tile, w, h);
  addInstancedSites(mapGroup, T, grid, tile);
  addSiteMarkers(mapGroup, T, map, tile);
  addInstancedDecos(mapGroup, T, layers && layers.decos, tile);
  addMapIdentity(mapGroup, T, map, tile);
  applyPbrProfile(mapGroup, map);
}

function scanMapCounts(grid, tile) {
  const counts = { wall: 0, thin: 0, crate: 0, barrel: 0, platform: 0, water: 0, deep: 0, site: 0 };
  for (let ty = 0; ty < grid.length; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length; tx++) {
      const c = row[tx];
      if (c === '#') counts.wall++;
      else if (c === '=') counts.thin++;
      else if (c === 'C') counts.crate++;
      else if (c === 'o') counts.barrel++;
      else if (c === '^' || c === 'R') counts.platform++;
      else if (c === '~') counts.water++;
      else if (c === '\u2248' || c === '\u224b') counts.deep++;
      else if (c === 'a' || c === 'b') counts.site++;
    }
  }
  return counts;
}

function countWallVariants(grid, variantCount) {
  const counts = new Array(Math.max(1, variantCount)).fill(0);
  for (let ty = 0; ty < grid.length; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length; tx++) {
      if (row[tx] !== '#') continue;
      counts[(tx * 7 + ty * 13) % counts.length]++;
    }
  }
  return counts;
}

function makeWallMaterials(T, layers) {
  const names = ['v0', 'v1', 'v2', 'v3'];
  const mats = [];
  for (const name of names) {
    const src = layers && layers.wallVariants && layers.wallVariants[name];
    if (!src) continue;
    mats.push(new T.MeshStandardMaterial({
      map: textureFrom(src, 1, 1),
      normalMap: normalMapFor(src, 1, 1),
      normalScale: new T.Vector2(0.55, 0.55),
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02
    }));
  }
  if (!mats.length) {
    const src = (layers && layers.wallTex) || null;
    mats.push(new T.MeshStandardMaterial({
      map: textureFrom(src, 1, 1),
      normalMap: normalMapFor(src, 1, 1),
      normalScale: new T.Vector2(0.55, 0.55),
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02
    }));
  }
  return mats;
}

function addInstancedWallVariants(group, T, counts, geometry, materials, fill) {
  for (let vi = 0; vi < materials.length; vi++) {
    const count = counts[vi] || 0;
    if (count < 1) continue;
    const mesh = new T.InstancedMesh(geometry, materials[vi], count);
    mesh.name = 'walls:' + vi;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let i = 0;
    const map = getMap();
    const grid = map && map.grid;
    const tile = (map && map.tile) || 16;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (c !== '#' || (tx * 7 + ty * 13) % materials.length !== vi) continue;
        fill(tx, ty, c, tx * tile + tile / 2, ty * tile + tile / 2, i, mesh);
        i++;
      }
    }
    group.add(mesh);
  }
}

function groundAOAt(grid, tx, ty) {
  let occ = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const c = tileToChar(grid, tx + dx, ty + dy);
      if (c !== '#' && c !== '=' && c !== 'C' && c !== 'o' && c !== '^' && c !== 'R') continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d > 2) continue;
      let w = d === 0 ? 0.2 : d === 1 ? 0.1 : 0.025;
      if (dx === 0 || dy === 0) w *= 1.35;
      occ += w;
    }
  }
  return Math.max(0.56, Math.min(1, 1 - occ));
}

function setGroundVertexColors(geo, w, h, grid, tile, map) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const hash = (x, y) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const theme = themeOf((map && map.id) || 'dust2');
  const floor = theme.floor || [36, 39, 44];
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + w / 2;
    const wy = pos.getY(i) + h / 2;
    const tx = Math.floor(wx / tile);
    const ty = Math.floor(wy / tile);
    const n = hash(Math.floor(wx / 90), Math.floor(wy / 90));
    const ao = groundAOAt(grid, tx, ty);
    const grain = 0.92 + n * 0.16 + Math.sin(wx * 0.0018 + wy * 0.0011) * 0.03;
    const c = tileToChar(grid, tx, ty);
    let tr = 1, tg = 1, tb = 1;
    if (c === 'a') { tr = 1.07; tg = 0.94; tb = 0.86; }
    if (c === 'b') { tr = 0.9; tg = 0.96; tb = 1.08; }
    if (c === '~' || c === '\u2248' || c === '\u224b') { tr = 0.82; tg = 0.94; tb = 1.12; }
    colors[i * 3] = Math.min(1.15, (floor[0] / 255) * grain * ao * tr);
    colors[i * 3 + 1] = Math.min(1.15, (floor[1] / 255) * grain * ao * tg);
    colors[i * 3 + 2] = Math.min(1.15, (floor[2] / 255) * grain * ao * tb);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function normalMapFor(source, repeatX, repeatY) {
  if (!THREE || !source || !source.width || !source.height || typeof document === 'undefined') return null;
  if (normalMapCache.has(source)) return normalMapCache.get(source);
  try {
    const size = Math.min(256, Math.max(64, source.width || 256));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = Math.max(1, Math.round(size * (source.height || size) / (source.width || size)));
    const g = canvas.getContext('2d');
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    const src = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const out = g.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const x0 = x > 0 ? i - 4 : i + 4;
        const x1 = x < canvas.width - 1 ? i + 4 : i - 4;
        const y0 = y > 0 ? i - canvas.width * 4 : i + canvas.width * 4;
        const y1 = y < canvas.height - 1 ? i + canvas.width * 4 : i - canvas.width * 4;
        const lx0 = 0.299 * src[x0] + 0.587 * src[x0 + 1] + 0.114 * src[x0 + 2];
        const lx1 = 0.299 * src[x1] + 0.587 * src[x1 + 1] + 0.114 * src[x1 + 2];
        const ly0 = 0.299 * src[y0] + 0.587 * src[y0 + 1] + 0.114 * src[y0 + 2];
        const ly1 = 0.299 * src[y1] + 0.587 * src[y1 + 1] + 0.114 * src[y1 + 2];
        out.data[i] = 128 + (lx1 - lx0) * 0.55;
        out.data[i + 1] = 128 + (ly1 - ly0) * 0.55;
        out.data[i + 2] = 255;
        out.data[i + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX || 1, repeatY || 1);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    normalMapCache.set(source, tex);
    return tex;
  } catch (err) {
    return null;
  }
}

function addInstancedBoxes(group, T, name, count, geometry, material, fill) {
  if (!count || count < 1) return;
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  let i = 0;
  const map = getMap();
  const grid = map && map.grid;
  const tile = (map && map.tile) || 16;
  for (let ty = 0; ty < grid.length && i < count; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length && i < count; tx++) {
      const c = row[tx];
      const isTarget = (name === 'walls' && c === '#') ||
        (name === 'thin' && c === '=') ||
        (name === 'crates' && c === 'C') ||
        (name === 'platforms' && (c === '^' || c === 'R'));
      if (!isTarget) continue;
      fill(tx, ty, c, tx * tile + tile / 2, ty * tile + tile / 2, i, mesh);
      i++;
    }
  }
  group.add(mesh);

  const boltMat = new T.MeshStandardMaterial({
    color: 0x2a3138,
    roughness: 0.5,
    metalness: 0.46
  });
  const boltCount = Math.min(96, count * 4);
  const boltGeo = new T.BoxGeometry(tile * 0.06, tile * 0.028, tile * 0.06);
  const boltMesh = new T.InstancedMesh(boltGeo, boltMat, boltCount);
  boltMesh.name = 'siteCornerBolts';
  boltMesh.frustumCulled = false;
  boltMesh.receiveShadow = true;
  let boltI = 0;
  for (let ty = 0; ty < grid.length && boltI < boltCount; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length && boltI < boltCount; tx++) {
      const c = row[tx];
      if (c !== 'a' && c !== 'b') continue;
      const cx = tx * tile + tile / 2;
      const cz = ty * tile + tile / 2;
      const offsets = [-tile * 0.38, tile * 0.38];
      for (const ox of offsets) {
        for (const oz of offsets) {
          if (boltI >= boltCount) break;
          setInstanceTransform(T, boltMesh, boltI, cx + ox, 0.03, cz + oz, 1, 1, 1, 0, 0, 0);
          boltI++;
        }
      }
    }
  }
  if (boltI) {
    boltMesh.count = boltI;
    group.add(boltMesh);
  }
}

function addInstancedWallCaps(group, T, grid, tile, wallCount, thinCount, material) {
  const add = (count, isThin) => {
    if (!count) return;
    const geo = new T.BoxGeometry(tile * 1.06, tile * 0.07, tile * 1.06);
    const mesh = new T.InstancedMesh(geo, material, count);
    mesh.name = isThin ? 'thinWallCaps' : 'wallCaps';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (isThin ? c !== '=' : c !== '#') continue;
        const y = (isThin ? tile * 0.55 : tile) + tile * 0.035;
        setInstanceTransform(T, mesh, i, tx * tile + tile / 2, y, ty * tile + tile / 2, 1, 1, 1, 0, 0, 0);
        mesh.setColorAt(i, new T.Color(wallColor(c)));
        i++;
      }
    }
    group.add(mesh);
  };
  add(wallCount, false);
  add(thinCount, true);
}

function addInstancedWallBases(group, T, grid, tile, wallCount, thinCount) {
  if (!wallCount && !thinCount) return;
  const baseMat = new T.MeshStandardMaterial({
    color: 0x24272c,
    roughness: 0.96,
    metalness: 0.03
  });
  const add = (count, isThin) => {
    if (!count) return;
    const geo = new T.BoxGeometry(tile * (isThin ? 1.12 : 1.18), tile * 0.09, tile * (isThin ? 1.12 : 1.18));
    const mesh = new T.InstancedMesh(geo, baseMat, count);
    mesh.name = isThin ? 'thinWallBases' : 'wallBases';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (isThin ? c !== '=' : c !== '#') continue;
        const y = tile * 0.045;
        setInstanceTransform(T, mesh, i, tx * tile + tile / 2, y, ty * tile + tile / 2, 1, 1, 1, 0, 0, 0);
        mesh.setColorAt(i, new T.Color(isThin ? 0x2f2a25 : 0x2b2e34));
        i++;
      }
    }
    group.add(mesh);
  };
  add(wallCount, false);
  add(thinCount, true);
}

function addInstancedWallDetail(group, T, grid, tile, wallCount, thinCount) {
  if (!wallCount && !thinCount) return;
  const skirtMat = new T.MeshStandardMaterial({
    color: 0x59616b,
    roughness: 0.9,
    metalness: 0.04
  });
  const pipeMat = new T.MeshStandardMaterial({
    color: 0x343d47,
    roughness: 0.55,
    metalness: 0.34
  });
  const addSkirts = (count, isThin) => {
    if (!count) return;
    const geo = new T.BoxGeometry(tile * (isThin ? 1.18 : 1.24), tile * 0.07, tile * (isThin ? 1.18 : 1.24));
    const mesh = new T.InstancedMesh(geo, skirtMat, count);
    mesh.name = isThin ? 'thinWallSkirts' : 'wallSkirts';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (isThin ? c !== '=' : c !== '#') continue;
        setInstanceTransform(T, mesh, i, tx * tile + tile / 2, tile * 0.23, ty * tile + tile / 2, 1, 1, 1, 0, 0, 0);
        mesh.setColorAt(i, new T.Color(isThin ? 0x5b554e : 0x5f6872));
        i++;
      }
    }
    group.add(mesh);
  };
  const addPipes = (count, isThin) => {
    if (!count) return;
    const geo = new T.CylinderGeometry(tile * 0.045, tile * 0.06, tile * (isThin ? 0.55 : 1.02), 6);
    const mesh = new T.InstancedMesh(geo, pipeMat, count);
    mesh.name = isThin ? 'thinWallPipes' : 'wallPipes';
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (isThin ? c !== '=' : c !== '#') continue;
        const edgeX = tx % 2 ? tile * 0.9 : tile * 0.1;
        const edgeZ = ty % 3 ? tile * 0.9 : tile * 0.1;
        setInstanceTransform(T, mesh, i, tx * tile + edgeX, tile * 0.53, ty * tile + edgeZ, 1, 1, 1, 0, 0, 0);
        i++;
      }
    }
    group.add(mesh);
  };
  const addConduits = (count, isThin) => {
    if (!count) return;
    const geo = new T.CylinderGeometry(tile * 0.035, tile * 0.035, tile * 0.72, 6);
    const mesh = new T.InstancedMesh(geo, pipeMat, count);
    mesh.name = isThin ? 'thinWallConduits' : 'wallConduits';
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (isThin ? c !== '=' : c !== '#') continue;
        const alongX = (tx + ty) % 2 === 0;
        const edge = alongX ? (ty % 2 ? tile * 0.92 : tile * 0.08) : (tx % 2 ? tile * 0.92 : tile * 0.08);
        const cx = tx * tile + (alongX ? tile / 2 : edge);
        const cz = ty * tile + (alongX ? edge : tile / 2);
        setInstanceTransform(T, mesh, i, cx, tile * (isThin ? 0.3 : 0.76), cz, 1, 1, 1, alongX ? Math.PI / 2 : 0, 0, alongX ? 0 : Math.PI / 2);
        i++;
      }
    }
    group.add(mesh);
  };
  addSkirts(wallCount, false);
  addSkirts(thinCount, true);
  addPipes(wallCount, false);
  addPipes(thinCount, true);
  addConduits(wallCount, false);
  addConduits(thinCount, true);
}

function addGroundDetail(group, T, grid, tile, w, h) {
  if (!grid || !grid.length || !THREE) return;
  const seamMat = new T.MeshBasicMaterial({
    color: 0x11151a,
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  });
  const rowStep = 2;
  const horizontalCount = Math.max(0, Math.floor((grid.length - 1) / rowStep));
  if (horizontalCount) {
    const geo = new T.BoxGeometry(1, tile * 0.018, tile * 0.035);
    const mesh = new T.InstancedMesh(geo, seamMat, horizontalCount);
    mesh.name = 'groundSeamsX';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = rowStep; ty < grid.length && i < horizontalCount; ty += rowStep) {
      const row = grid[ty] || [];
      const width = Math.max(1, row.length) * tile;
      setInstanceTransform(T, mesh, i, width / 2, 0.012, ty * tile, width, 1, 1, 0, 0, 0);
      i++;
    }
    group.add(mesh);
  }
  const maxRowWidth = Math.max(...grid.map((row) => (row || []).length));
  const verticalCount = Math.max(0, Math.floor((maxRowWidth - 1) / rowStep));
  if (verticalCount) {
    const geo = new T.BoxGeometry(tile * 0.035, tile * 0.018, 1);
    const mesh = new T.InstancedMesh(geo, seamMat, verticalCount);
    mesh.name = 'groundSeamsZ';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    let i = 0;
    for (let tx = rowStep; tx < maxRowWidth && i < verticalCount; tx += rowStep) {
      setInstanceTransform(T, mesh, i, tx * tile, 0.012, h / 2, 1, 1, h, 0, 0, 0);
      i++;
    }
    group.add(mesh);
  }

  const curbMat = new T.MeshStandardMaterial({
    color: 0x3a414a,
    roughness: 0.88,
    metalness: 0.12
  });
  const solidAt = (tx, ty) => {
    const c = tileToChar(grid, tx, ty);
    return c === '#' || c === '=' || c === 'C' || c === 'o' || c === '^' || c === 'R';
  };
  const addCurbs = (vertical) => {
    const perSolid = vertical ? 2 : 2;
    const total = Math.min(4800, (grid.length * maxRowWidth) * perSolid);
    const geo = vertical
      ? new T.BoxGeometry(tile * 0.085, tile * 0.032, tile * 1.04)
      : new T.BoxGeometry(tile * 1.04, tile * 0.032, tile * 0.085);
    const mesh = new T.InstancedMesh(geo, curbMat, total);
    mesh.name = vertical ? 'groundCurbsZ' : 'groundCurbsX';
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < total; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < total; tx++) {
        if (!solidAt(tx, ty)) continue;
        if (!vertical) {
          if (!solidAt(tx, ty - 1)) {
            setInstanceTransform(T, mesh, i, tx * tile + tile / 2, tile * 0.02, ty * tile, 1, 1, 1, 0, 0, 0);
            i++;
          }
          if (!solidAt(tx, ty + 1)) {
            setInstanceTransform(T, mesh, i, tx * tile + tile / 2, tile * 0.02, (ty + 1) * tile, 1, 1, 1, 0, 0, 0);
            i++;
          }
        } else {
          if (!solidAt(tx - 1, ty)) {
            setInstanceTransform(T, mesh, i, tx * tile, tile * 0.02, ty * tile + tile / 2, 1, 1, 1, 0, 0, 0);
            i++;
          }
          if (!solidAt(tx + 1, ty)) {
            setInstanceTransform(T, mesh, i, (tx + 1) * tile, tile * 0.02, ty * tile + tile / 2, 1, 1, 1, 0, 0, 0);
            i++;
          }
        }
      }
    }
    if (i) {
      mesh.count = i;
      group.add(mesh);
    }
    return i;
  };
  const curbX = addCurbs(false);
  const curbZ = addCurbs(true);
  void curbX;
  void curbZ;

  const drainCount = Math.min(24, Math.max(1, Math.ceil(grid.length * maxRowWidth / 900)));
  const drainMat = new T.MeshStandardMaterial({
    color: 0x1c2126,
    roughness: 0.92,
    metalness: 0.18
  });
  const drainGeo = new T.BoxGeometry(tile * 0.42, tile * 0.014, tile * 0.42);
  const drainMesh = new T.InstancedMesh(drainGeo, drainMat, drainCount);
  drainMesh.name = 'drainGrills';
  drainMesh.frustumCulled = false;
  drainMesh.receiveShadow = true;
  let drainI = 0;
  for (let ty = 0; ty < grid.length && drainI < drainCount; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length && drainI < drainCount; tx++) {
      const c = row[tx];
      if (c !== 'a' && c !== 'b' && c !== '~') continue;
      setInstanceTransform(T, drainMesh, drainI, tx * tile + tile / 2, 0.02, ty * tile + tile / 2, 1, 1, 1, 0, 0, 0);
      drainI++;
    }
  }
  if (drainI) {
    drainMesh.count = drainI;
    group.add(drainMesh);
  }
}

function setInstanceTransform(T, mesh, index, x, y, z, sx, sy, sz, rx, ry, rz) {
  const e = new T.Euler(rx, ry, rz, 'YXZ');
  const q = new T.Quaternion().setFromEuler(e);
  const m = new T.Matrix4().compose(
    new T.Vector3(x, y, z),
    q,
    new T.Vector3(sx, sy, sz)
  );
  mesh.setMatrixAt(index, m);
}

function wallColor(c) {
  if (c === '=') return 0xb8b2a8;
  return 0xa5adb5;
}

function addInstancedBarrels(group, T, count, material) {
  if (!count) return;
  const geo = new T.CylinderGeometry(0.34, 0.34, 1, 10);
  const mesh = new T.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  let i = 0;
  const map = getMap();
  const grid = map && map.grid;
  const tile = (map && map.tile) || 16;
  for (let ty = 0; ty < grid.length && i < count; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length && i < count; tx++) {
      if (row[tx] !== 'o') continue;
      setInstanceTransform(T, mesh, i, tx * tile + tile / 2, tile * 0.225, ty * tile + tile / 2, 1, 0.45, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(0xb85a38));
      i++;
    }
  }
  group.add(mesh);
}

function addInstancedWater(group, T, grid, tile, waterCount, shallowMat, deepMat) {
  const deepCount = scanMapCounts(grid, tile).deep;
  const plane = new T.PlaneGeometry(tile, tile);
  const add = (count, mat, isDeep) => {
    if (!count) return;
    const mesh = new T.InstancedMesh(plane, mat, count);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    let i = 0;
    for (let ty = 0; ty < grid.length && i < count; ty++) {
      const row = grid[ty] || [];
      for (let tx = 0; tx < row.length && i < count; tx++) {
        const c = row[tx];
        if (isDeep) {
          if (c !== '\u2248' && c !== '\u224b') continue;
        } else if (c !== '~') continue;
        const obj = new T.Object3D();
        obj.rotation.x = -Math.PI / 2;
        obj.position.set(tx * tile + tile / 2, isDeep ? 0.035 : 0.05, ty * tile + tile / 2);
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
        mesh.setColorAt(i, new T.Color(isDeep ? 0x17475f : 0xbfe4ff));
        i++;
      }
    }
    group.add(mesh);
  };
  add(waterCount, shallowMat, false);
  add(deepCount, deepMat, true);
}

function addInstancedSites(group, T, grid, tile) {
  const count = scanMapCounts(grid, tile).site;
  if (!count) return;
  const mat = new T.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false });
  const mesh = new T.InstancedMesh(new T.PlaneGeometry(tile, tile), mat, count);
  mesh.frustumCulled = false;
  let i = 0;
  for (let ty = 0; ty < grid.length && i < count; ty++) {
    const row = grid[ty] || [];
    for (let tx = 0; tx < row.length && i < count; tx++) {
      const c = row[tx];
      if (c !== 'a' && c !== 'b') continue;
      const obj = new T.Object3D();
      obj.rotation.x = -Math.PI / 2;
      obj.position.set(tx * tile + tile / 2, 0.025, ty * tile + tile / 2);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      mesh.setColorAt(i, new T.Color(c === 'a' ? 0xff8a4a : 0x5aa8ff));
      i++;
    }
  }
  group.add(mesh);
}

function addSiteMarkers(group, T, map, tile) {
  if (!map || !map.sites) return;
  const keys = ['A', 'B'];
  for (const key of keys) {
    const s = map.sites[key];
    if (!s) continue;
    const cx = (s.x0 + s.x1) / 2;
    const cz = (s.y0 + s.y1) / 2;
    const w = Math.max(1, s.x1 - s.x0);
    const h = Math.max(1, s.y1 - s.y0);
    const inner = Math.max(10, Math.min(w, h) * 0.34);
    const outer = Math.max(16, Math.min(w, h) * 0.42);
    const color = key === 'A' ? 0xff8a4a : 0x5aa8ff;
    const ring = new T.Mesh(
      new T.RingGeometry(inner, outer, 48),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.045, cz);
    ring.renderOrder = 3;
    group.add(ring);

    const pts = [
      new T.Vector3(s.x0 + 4, 0.05, s.y0 + 4),
      new T.Vector3(s.x1 - 4, 0.05, s.y0 + 4),
      new T.Vector3(s.x1 - 4, 0.05, s.y1 - 4),
      new T.Vector3(s.x0 + 4, 0.05, s.y1 - 4)
    ];
    const frame = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    group.add(frame);

    const label = makeSiteLabel(T, key);
    label.position.set(cx, tile * 1.15, cz);
    group.add(label);
  }
}

function makeSiteLabel(T, key) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const color = key === 'A' ? '#ff9a5a' : '#5aa8ff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(key, 64, 66);
  const tex = new T.CanvasTexture(cv);
  if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  const mat = new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false });
  const sprite = new T.Sprite(mat);
  sprite.scale.set(96, 96, 1);
  return sprite;
}

function addInstancedDecos(group, T, decos, tile) {
  if (!decos || !decos.length) return;
  const buckets = {};
  for (const d of decos) {
    if (!d) continue;
    const kind = d.kind || 'decoStone';
    if (!buckets[kind]) buckets[kind] = [];
    if (buckets[kind].length < 64) buckets[kind].push(d);
  }
  const geometryFor = (kind) => {
    switch (kind) {
      case 'decoGrass': return new T.ConeGeometry(0.10, 0.24, 5);
      case 'decoStone': return new T.DodecahedronGeometry(0.14, 0);
      case 'decoBarrel': return new T.CylinderGeometry(0.12, 0.12, 0.22, 8);
      case 'decoPot': return new T.CylinderGeometry(0.09, 0.06, 0.20, 6);
      case 'decoPipe': return new T.CylinderGeometry(0.09, 0.09, 1.0, 8);
      case 'decoTire': return new T.TorusGeometry(0.18, 0.07, 6, 10);
      case 'decoRock': return new T.DodecahedronGeometry(0.20, 0);
      case 'decoPallet': return new T.BoxGeometry(0.70, 0.08, 0.55);
      case 'decoLamp': return new T.CylinderGeometry(0.03, 0.03, 0.60, 6);
      default: return new T.BoxGeometry(0.18, 0.16, 0.18);
    }
  };
  const colorFor = (kind) => {
    if (kind === 'decoGrass') return 0x6c9a62;
    if (kind === 'decoBarrel' || kind === 'decoPot') return 0xb66a42;
    if (kind === 'decoPipe' || kind === 'decoLamp') return 0x8b98a8;
    if (kind === 'decoTire') return 0x2b3036;
    if (kind === 'decoRock') return 0x8d8a82;
    if (kind === 'decoPallet') return 0xa38a5a;
    return 0x999c9a;
  };
  for (const kind of Object.keys(buckets)) {
    const items = buckets[kind];
    if (!items.length) continue;
    const mat = new T.MeshLambertMaterial({ color: colorFor(kind) });
    const mesh = new T.InstancedMesh(geometryFor(kind), mat, items.length);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const d = items[i];
      const x = d.tx * tile + tile / 2;
      const z = d.ty * tile + tile / 2;
      const ry = (d.tx * 1.7 + d.ty * 0.9) % (Math.PI * 2);
      const rx = kind === 'decoTire' ? -Math.PI / 2 : kind === 'decoPipe' ? Math.PI / 2 : 0;
      const y = tile * (kind === 'decoLamp' ? 0.35 : 0.12);
      const sy = kind === 'decoTire' ? 0.35 : 1;
      setInstanceTransform(T, mesh, i, x, y, z, 1, sy, 1, rx, 0, ry);
    }
    group.add(mesh);
  }
}

function textureFrom(source, repeatX, repeatY) {
  if (!THREE || !source) return null;
  const repeatKey = (repeatX || 1) + ',' + (repeatY || 1);
  let byRepeat = textureCache.get(source);
  if (byRepeat) {
    const hit = byRepeat.get(repeatKey);
    if (hit) return hit;
  } else if (textureCache.size < MAX_TEXTURE_CACHE) {
    byRepeat = new Map();
    textureCache.set(source, byRepeat);
  }
  const tex = new THREE.CanvasTexture(source);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX || 1, repeatY || 1);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.userData._cached = true;
  if (byRepeat && byRepeat.size < 4) byRepeat.set(repeatKey, tex);
  return tex;
}

function cachedGeometry(key, create) {
  const hit = geometryCache.get(key);
  if (hit) return hit;
  if (geometryCache.size >= MAX_GEOMETRY_CACHE) return create();
  const geo = create();
  if (geo) {
    geo.userData._cached = true;
    geometryCache.set(key, geo);
  }
  return geo;
}

function boxGeometry(w, h, d) {
  const key = 'box:' + [w, h, d].map((n) => Number(n || 0).toFixed(3)).join(',');
  return cachedGeometry(key, () => new THREE.BoxGeometry(w, h, d));
}

function planeGeometry(w, h, sw, sh) {
  const key = 'plane:' + [w, h, sw, sh].map((n) => Number(n || 0).toFixed(3)).join(',');
  return cachedGeometry(key, () => new THREE.PlaneGeometry(w, h, sw, sh));
}

function sphereGeometry(r, ws, hs) {
  const key = 'sphere:' + [r, ws, hs].map((n) => Number(n || 0).toFixed(3)).join(',');
  return cachedGeometry(key, () => new THREE.SphereGeometry(r, ws, hs));
}

function coneGeometry(r, h, seg) {
  const key = 'cone:' + [r, h, seg].map((n) => Number(n || 0).toFixed(3)).join(',');
  return cachedGeometry(key, () => new THREE.ConeGeometry(r, h, seg));
}

function ringGeometry(inner, outer, seg) {
  const key = 'ring:' + [inner, outer, seg].map((n) => Number(n || 0).toFixed(3)).join(',');
  return cachedGeometry(key, () => new THREE.RingGeometry(inner, outer, seg));
}

function buildSky(map) {
  if (!scene || !THREE || typeof document === 'undefined') return;
  if (skyMesh) {
    scene.remove(skyMesh);
    if (skyMesh.geometry) skyMesh.geometry.dispose();
    if (skyMesh.material) disposeMaterial(skyMesh.material);
    skyMesh = null;
  }
  const theme = themeOf((map && map.id) || 'dust2');
  const sky = theme.sky || {};
  const top = sky.top || '#182838';
  const horizon = sky.horizon || '#52606b';
  const sun = sky.sun || [255, 214, 150];
  const atmo = theme.atmo || {};
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, horizon);
  grad.addColorStop(0.78, '#9a8b70');
  grad.addColorStop(1, '#c4b18c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(' + sun[0] + ',' + sun[1] + ',' + sun[2] + ',0.95)';
  ctx.beginPath();
  ctx.arc(392, 72, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(210,220,230,0.32)';
  ctx.beginPath();
  ctx.ellipse(110, 92, 90, 24, 0, 0, Math.PI * 2);
  ctx.ellipse(238, 64, 120, 30, 0, 0, Math.PI * 2);
  ctx.ellipse(390, 132, 150, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(2200, 24, 16);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  skyMesh = new THREE.Mesh(geo, mat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -20;
  scene.add(skyMesh);
  const fog = theme.atmo && theme.atmo.fogColor;
  if (fog) {
    const fogNear = 260 + (atmo.haze || 0.5) * 300;
    const fogFar = Math.max(900, map.W * 0.9);
    scene.fog = new THREE.Fog(new THREE.Color(fog[0] / 255, fog[1] / 255, fog[2] / 255), fogNear, fogFar);
    atmosphere.mapId = map.id;
    atmosphere.fogColor = [fog[0], fog[1], fog[2]];
    atmosphere.fogNear = fogNear;
    atmosphere.fogFar = fogFar;
    atmosphere.sun = sun.slice();
  }
  buildWeather(map, theme);
}

function buildWeather(map, theme) {
  if (!dynamicGroup || !THREE) return;
  const weather = theme.weather || {};
  const kind = weather.kind || 'none';
  const key = (map && map.id) + ':' + kind;
  if (weatherKey === key) return;
  if (weatherPoints) {
    dynamicGroup.remove(weatherPoints);
    weatherPoints.geometry.dispose();
    weatherPoints.material.dispose();
    weatherPoints = null;
  }
  weatherKey = key;
  if (!kind) return;
  const count = performanceBudgetFor({ renderQuality: 1 }).weatherPoints;
  weatherPoints = makeWeatherPoints(map, theme, count);
  dynamicGroup.add(weatherPoints);
}

function makeWeatherPoints(map, theme, count) {
  const T = THREE;
  const weather = theme.weather || {};
  const positions = new Float32Array(count * 3);
  const rangeW = Math.max(900, map.W * 0.65);
  const rangeH = Math.max(700, map.H * 0.55);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = ((i * 173 + Math.sin(i * 17) * 991) % rangeW + rangeW) % rangeW - rangeW / 2;
    positions[i * 3 + 1] = 0.8 + ((i * 91) % 70) / 70 * (map.tile || 16) * 2.2;
    positions[i * 3 + 2] = ((i * 257 + Math.cos(i * 11) * 577) % rangeH + rangeH) % rangeH - rangeH / 2;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(positions, 3));
  const color = weather.color || [180, 180, 180];
  const mat = new T.PointsMaterial({
    color: new T.Color(color[0] / 255, color[1] / 255, color[2] / 255),
    size: 3,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new T.Points(geo, mat);
  points.name = 'weather:' + (theme.weather && theme.weather.kind || 'none');
  points.frustumCulled = false;
  return points;
}

function updateDynamicNext(game) {
  updateEntities(game);
  updateDrops(game);
  updateGrenades(game);
  updateBomb(game);
  updateSmokes(game);
  updateParticles(game);
  updateWeather(game);
  updateTracers(game);
  updateDecalsNext(game);
}

function updateWeather(game) {
  if (!weatherPoints || !THREE) return;
  const map = getMap();
  if (!map) return;
  const tile = map.tile || 16;
  const theme = themeOf(map.id);
  const budget = performanceBudgetFor(game);
  if (weatherPoints.geometry.attributes.position.count !== budget.weatherPoints) {
    const next = makeWeatherPoints(map, theme, budget.weatherPoints);
    dynamicGroup.remove(weatherPoints);
    weatherPoints.geometry.dispose();
    weatherPoints.material.dispose();
    weatherPoints = next;
    dynamicGroup.add(weatherPoints);
  }
  const weather = theme.weather || {};
  const kind = weather.kind || 'dust';
  const speed = (weather.wind && weather.wind[0]) || 0.3;
  const dirY = (weather.wind && weather.wind[1]) || 0.1;
  const cam = camera;
  const pos = weatherPoints.geometry.attributes.position;
  const arr = pos.array;
  const count = pos.count;
  const rangeW = Math.max(900, map.W * 0.65);
  const rangeH = Math.max(700, map.H * 0.55);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    arr[i3] = cam.position.x + (((i * 173 + arr[i3] + (game.time || 0) * speed * 45) % rangeW + rangeW) % rangeW) - rangeW / 2;
    arr[i3 + 1] = 0.8 + ((i * 91 + arr[i3 + 1] * 31 + (game.time || 0) * dirY * 20) % 70) / 70 * tile * 2.2;
    arr[i3 + 2] = cam.position.z + (((i * 257 + arr[i3 + 2] + (game.time || 0) * speed * 36) % rangeH + rangeH) % rangeH) - rangeH / 2;
  }
  pos.needsUpdate = true;
  weatherPoints.material.size = tile * (kind === 'snow' ? 0.16 : kind === 'sand' ? 0.13 : 0.2);
  weatherPoints.material.opacity = Math.max(0.18, Math.min(0.55, (weather.density || 0.5) * 0.85));
}

function updateViewmodelNext(game) {
  const p = game && game.player;
  if (!p || !camera || !viewmodelGroup) return;
  const key = p.slot + ':' + (p.weapons && (p.weapons.primary || p.weapons.secondary || 'knife'));
  if (key !== viewmodelKey) {
    viewmodelKey = key;
    clearGroup(viewmodelGroup);
    buildViewmodel(p);
  }
  const tile = (getMap() && getMap().tile) || 16;
  const recoil = Math.min(p.recoil || 0, 1);
  const reloadT = p.reloadT || 0;
  const reloading = !!p.reloading;
  const switching = !!p.lastSlot && p.lastSlot !== p.slot && (p.fireCd || 0) > 0.12;
  const scopeT = Math.max(0, Math.min(1, (game.scopeT || 0) * (p.scoped ? 1 : 0)));
  const switchY = switching ? 0.26 * tile + Math.sin((p.fireCd || 0) * 12) * 0.05 * tile : 0;
  const switchRot = switching ? Math.cos((p.fireCd || 0) * 10) * 0.45 : 0;
  const bob = p.bobPhase || 0;
  const idleX = Math.sin((game.time || 0) * 1.35) * tile * 0.007;
  const idleY = Math.sin((game.time || 0) * 1.7 + 1.2) * tile * 0.006;
  const moveX = p.walking ? Math.sin(bob * 2) * tile * 0.016 : 0;
  const moveY = p.walking ? -Math.abs(Math.cos(bob * 2)) * tile * 0.014 : 0;
  const swayX = (moveX + idleX) * (1 - scopeT);
  const swayY = (moveY + idleY) * (1 - scopeT) + (p.crouched ? tile * 0.035 : 0);
  const swayRotZ = ((p.walking ? Math.sin(bob * 2) * 0.025 : Math.sin((game.time || 0) * 0.7) * 0.008)) * (1 - scopeT);
  viewmodelGroup.position.set(
    0.26 * tile + scopeT * 0.38 * tile + swayX,
    -0.18 * tile + recoil * 0.018 * tile + (reloading ? Math.sin(reloadT * 22) * 0.02 * tile : 0) - switchY + scopeT * 0.12 * tile + swayY,
    -0.48 * tile - scopeT * 0.12 * tile
  );
  viewmodelGroup.rotation.set(reloading ? Math.sin(reloadT * 10) * 0.12 : recoil * 0.14, scopeT * 0.38 + switchRot, recoil * 0.08 + scopeT * 0.16 + swayRotZ);
  game._viewmodelSway = { swayX, swayY, recoil, scopeT, bob };
  const muzzle = viewmodelGroup.getObjectByName('muzzle');
  if (muzzle) {
    muzzle.visible = (p.muzzleT || 0) > 0;
    if (muzzle.visible) muzzle.scale.setScalar(0.85 + Math.random() * 0.35);
  }
  const mag = viewmodelGroup.getObjectByName('mag');
  if (mag) {
    const drop = reloading ? 0.9 + Math.sin(reloadT * 9) * 0.2 : 0;
    mag.rotation.x = drop * (p.slot === 'primary' ? 1 : 0.8);
    mag.position.y = reloading ? -0.18 * tile / 16 - drop * 0.12 * tile / 16 : -0.18 * tile / 16;
  }
  const sight = viewmodelGroup.getObjectByName('frontSight');
  if (sight) sight.visible = !p.scoped;
}

function updateEntities(game) {
  if (!dynamicGroup || !THREE) return;
  const cam = fpsCameraEntity(game);
  const budget = performanceBudgetFor(game);
  const seen = new Set();
  let visibleCount = 0;
  for (const e of game.entities || []) {
    if (e === cam || e.dead) continue;
    if (visibleCount >= budget.dynamicEntityCap) break;
    visibleCount++;
    seen.add(e);
    let group = entityMeshes.get(e);
    if (!group) {
      group = makeCharacter(THREE, e, (getMap() && getMap().tile) || 16);
      entityMeshes.set(e, group);
      dynamicGroup.add(group);
    }
    const tile = (getMap() && getMap().tile) || 16;
    group.position.set(e.x || 0, 0, e.y || 0);
    group.rotation.set(0, -(e.angle || 0) - Math.PI / 2, 0);
    group.position.y = groundElevationAt(e.x || 0, e.y || 0) + (e.crouched ? tile * 0.16 : tile * 0.0);
    group.scale.y = e.crouched ? 0.72 : 1;
    const bob = (e.walking ? Math.sin((e.bobPhase || 0) * 2) * tile * 0.025 : 0);
    group.position.y += bob;
    const marker = group.getObjectByName('teamMarker');
    if (marker) marker.visible = !!(game.player && e.team === game.player.team);
    const walk = (e.bobPhase || 0);
    const legA = group.getObjectByName('legA');
    const legB = group.getObjectByName('legB');
    if (legA && legB) {
      const sw = e.walking ? Math.sin(walk * 2) * 0.45 : 0;
      legA.rotation.x = sw;
      legB.rotation.x = -sw;
    }
    const muzzle = group.getObjectByName('muzzle');
    if (muzzle) {
      muzzle.visible = (e.muzzleT || 0) > 0;
      if (muzzle.visible) muzzle.scale.setScalar(tile * (0.42 + Math.random() * 0.2));
    }
    const bodyMat = group.userData && group.userData.bodyMat;
    if (bodyMat && group.userData.baseColor) {
      const hurt = (e.lastDmgT && game.time && (game.time * 1000 - e.lastDmgT) < 150) || e.hp <= 24;
      bodyMat.color.setHex(hurt ? 0xfff2d8 : group.userData.baseColor);
    }
    group.visible = true;
  }
  for (const [e, mesh] of entityMeshes) {
    if (seen.has(e) || !dynamicGroup.children.includes(mesh)) continue;
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
    entityMeshes.delete(e);
  }
}

function makeCharacter(T, e, tile) {
  const group = new T.Group();
  const team = e.team === 't' ? 0xe0a35a : 0x4f9dd8;
  const dark = e.team === 't' ? 0x7d5230 : 0x2b5d82;
  const gear = e.team === 't' ? 0x8a5a32 : 0x3f6f95;
  const mat = new T.MeshLambertMaterial({ color: team });
  const darkMat = new T.MeshLambertMaterial({ color: dark });
  const gearMat = new T.MeshLambertMaterial({ color: gear });
  const body = new T.Mesh(new T.BoxGeometry(tile * 0.60, tile * 0.68, tile * 0.30), mat);
  body.name = 'body';
  body.position.y = tile * 0.80;
  body.castShadow = true;
  const chest = new T.Mesh(new T.BoxGeometry(tile * 0.46, tile * 0.44, tile * 0.34), gearMat);
  chest.name = 'chest';
  chest.position.y = tile * 0.88;
  chest.castShadow = true;
  const head = new T.Mesh(new T.BoxGeometry(tile * 0.34, tile * 0.30, tile * 0.30), new T.MeshLambertMaterial({ color: e.team === 't' ? 0xd29a6a : 0xd2b08a }));
  head.name = 'head';
  head.position.y = tile * 1.28;
  head.castShadow = true;
  const helmet = new T.Mesh(new T.BoxGeometry(tile * 0.38, tile * 0.13, tile * 0.34), gearMat);
  helmet.name = 'helmet';
  helmet.position.y = tile * 1.43;
  helmet.castShadow = true;
  const legA = new T.Mesh(new T.BoxGeometry(tile * 0.17, tile * 0.50, tile * 0.20), darkMat);
  legA.name = 'legA';
  legA.position.set(-tile * 0.14, tile * 0.25, 0);
  legA.castShadow = true;
  const legB = legA.clone();
  legB.name = 'legB';
  legB.position.x = tile * 0.14;
  const armA = new T.Mesh(new T.BoxGeometry(tile * 0.15, tile * 0.58, tile * 0.18), darkMat);
  armA.name = 'armA';
  armA.position.set(-tile * 0.43, tile * 0.82, 0);
  armA.castShadow = true;
  const armB = armA.clone();
  armB.name = 'armB';
  armB.position.x = tile * 0.43;
  const backpack = new T.Mesh(new T.BoxGeometry(tile * 0.34, tile * 0.42, tile * 0.18), gearMat);
  backpack.name = 'backpack';
  backpack.position.set(0, tile * 0.88, -tile * 0.24);
  backpack.castShadow = true;
  const weapon = new T.Mesh(new T.BoxGeometry(tile * 0.16, tile * 0.12, tile * 0.76), new T.MeshLambertMaterial({ color: 0x2c3035 }));
  weapon.name = 'weaponMesh';
  weapon.position.set(tile * 0.58, tile * 0.88, 0);
  weapon.rotation.y = Math.PI / 2;
  weapon.castShadow = true;
  const muzzle = new T.Sprite(new T.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffd166,
    transparent: true,
    opacity: 0.95,
    blending: T.AdditiveBlending,
    depthWrite: false
  }));
  muzzle.name = 'muzzle';
  muzzle.position.set(tile * 0.88, tile * 0.90, 0);
  muzzle.scale.setScalar(tile * 0.42);
  muzzle.visible = false;
  muzzle.renderOrder = 9;
  const marker = new T.Mesh(new T.ConeGeometry(tile * 0.24, tile * 0.62, 6), new T.MeshBasicMaterial({
    color: team,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  }));
  marker.name = 'teamMarker';
  marker.position.y = tile * 1.92;
  marker.renderOrder = 8;
  group.add(body, chest, head, helmet, legA, legB, armA, armB, backpack, weapon, muzzle, marker);
  group.userData = { bodyMat: mat, baseColor: team };
  return group;
}

function updateDrops(game) {
  if (!dynamicGroup || !THREE) return;
  const seen = new Set();
  for (const drop of game.drops || []) {
    seen.add(drop);
    let mesh = dropMeshes.get(drop);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.14), new THREE.MeshLambertMaterial({ color: 0x35414a }));
      mesh.castShadow = true;
      dropMeshes.set(drop, mesh);
      dynamicGroup.add(mesh);
    }
    const tile = (getMap() && getMap().tile) || 16;
    mesh.position.set(drop.x || 0, groundElevationAt(drop.x || 0, drop.y || 0) + tile * 0.08, drop.y || 0);
    mesh.rotation.y = 0;
  }
  for (const [drop, mesh] of dropMeshes) {
    if (seen.has(drop) || !dynamicGroup.children.includes(mesh)) continue;
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
    dropMeshes.delete(drop);
  }
}

function updateGrenades(game) {
  if (!dynamicGroup || !THREE) return;
  const seen = new Set();
  for (const g of game.grenades || []) {
    seen.add(g);
    let mesh = grenadeMeshes.get(g);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial({ color: g.kind === 'smoke' ? 0x53625c : g.kind === 'flash' ? 0xc9c6a0 : 0x3e4a32 }));
      mesh.castShadow = true;
      grenadeMeshes.set(g, mesh);
      dynamicGroup.add(mesh);
    }
    const tile = (getMap() && getMap().tile) || 16;
    mesh.position.set(g.x || 0, groundElevationAt(g.x || 0, g.y || 0) + tile * 0.12, g.y || 0);
  }
  for (const [g, mesh] of grenadeMeshes) {
    if (seen.has(g) || !dynamicGroup.children.includes(mesh)) continue;
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
    grenadeMeshes.delete(g);
  }
}

function updateBomb(game) {
  if (!dynamicGroup || !THREE) return;
  let bombMesh = dynamicGroup.getObjectByName('bombMesh');
  if (!game.bomb) {
    if (bombMesh) {
      dynamicGroup.remove(bombMesh);
      disposeObject(bombMesh);
    }
    return;
  }
  if (!bombMesh) {
    const group = new THREE.Group();
    group.name = 'bombMesh';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.30), new THREE.MeshLambertMaterial({ color: 0x3a4148 }));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    led.position.set(0.2, 0.12, 0);
    group.add(body, led);
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bombMesh = group;
    dynamicGroup.add(bombMesh);
  }
  const b = game.bomb;
  const tile = (getMap() && getMap().tile) || 16;
  bombMesh.position.set(b.x || 0, groundElevationAt(b.x || 0, b.y || 0) + tile * 0.08, b.y || 0);
  const led = bombMesh.children[1];
  if (led) led.scale.setScalar(1 + (game.time || 0) * 4 % 1);
}

function updateSmokes(game) {
  if (!dynamicGroup || !THREE) return;
  const source = game.smokes || [];
  const wanted = Math.min(source.length * 3, performanceBudgetFor(game).smokeCap);
  while (smokeMeshes.length < wanted) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeCloudTexture(),
      color: 0x8b9894,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    }));
    sprite.name = 'smokeVolume';
    smokeMeshes.push(sprite);
    dynamicGroup.add(sprite);
  }
  for (let i = smokeMeshes.length - 1; i >= wanted; i--) {
    const s = smokeMeshes.pop();
    dynamicGroup.remove(s);
    if (s.material) s.material.dispose();
  }
  const tile = (getMap() && getMap().tile) || 16;
  for (let i = 0; i < wanted; i++) {
    const smoke = source[Math.floor(i / 3)];
    const s = smokeMeshes[i];
    if (!smoke) continue;
    const layer = i % 3;
    const pulse = 0.7 + Math.sin((game.time || 0) * 2.1 + i * 1.3) * 0.08;
    const ox = layer === 1 ? Math.sin((game.time || 0) * 1.7 + i * 0.7) * tile * 0.26 : layer === 2 ? Math.cos(i * 1.1) * tile * 0.34 : 0;
    const oz = layer === 1 ? Math.cos((game.time || 0) * 1.4 + i * 0.5) * tile * 0.24 : layer === 2 ? Math.sin(i * 0.8) * tile * 0.31 : 0;
    s.position.set((smoke.x || 0) + ox, groundElevationAt(smoke.x || 0, smoke.y || 0) + tile * (0.45 + layer * 0.42 + pulse * 0.22), (smoke.y || 0) + oz);
    const scale = ((smoke.r || tile * 3) * 0.012 + 0.6) * tile * (1 + layer * 0.34);
    s.scale.set(scale, scale * 0.82, 1);
    s.material.rotation = (game.time || 0) * 0.05 + i * 0.37;
    s.material.opacity = Math.min(0.56, 0.16 + layer * 0.12 + (smoke.life || 1) * 0.02);
  }
}

function updateParticles(game) {
  if (!dynamicGroup || !THREE) return;
  const all = game.particles || [];
  const caps = performanceBudgetFor(game).particleCaps;
  const shells = all.filter((p) => p && p.kind === 'shell').slice(0, caps.shell);
  const booms = all.filter((p) => p && p.kind === 'boom').slice(0, caps.boom);
  const splashes = all.filter((p) => p && (p.kind === 'splash' || p.kind === 'water')).slice(0, caps.splash);
  const others = all.filter((p) => !p || (p.kind !== 'shell' && p.kind !== 'boom' && p.kind !== 'splash' && p.kind !== 'water')).slice(0, caps.other);
  const tile = (getMap() && getMap().tile) || 16;

  while (shellMeshes.length < shells.length) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(tile * 0.11, tile * 0.035, tile * 0.11),
      new THREE.MeshLambertMaterial({ color: 0xc99a3f })
    );
    mesh.name = 'shell';
    mesh.castShadow = true;
    shellMeshes.push(mesh);
    dynamicGroup.add(mesh);
  }
  for (let i = shellMeshes.length - 1; i >= shells.length; i--) {
    const mesh = shellMeshes.pop();
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
  }
  for (let i = 0; i < shells.length; i++) {
    const p = shells[i];
    const mesh = shellMeshes[i];
    mesh.visible = true;
    mesh.position.set(p.x || 0, groundElevationAt(p.x || 0, p.y || 0) + tile * 0.05, p.y || 0);
    mesh.rotation.set((p.spin || 0) + i, 0, 0);
  }

  while (shockwaveMeshes.length < booms.length) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.58, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffb45a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.name = 'shockwave';
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 7;
    shockwaveMeshes.push(ring);
    dynamicGroup.add(ring);
  }
  for (let i = shockwaveMeshes.length - 1; i >= booms.length; i--) {
    const mesh = shockwaveMeshes.pop();
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
  }
  for (let i = 0; i < booms.length; i++) {
    const p = booms[i];
    const ring = shockwaveMeshes[i];
    ring.visible = true;
    ring.position.set(p.x || 0, groundElevationAt(p.x || 0, p.y || 0) + tile * 0.04, p.y || 0);
    const life = Math.max(0.01, p.life || 0.3);
    const grow = 1 + (0.8 - life) * 8;
    const size = ((p.size || 160) / 12) * tile * 0.08 * grow;
    ring.scale.set(size, size, 1);
    ring.material.opacity = Math.max(0, Math.min(0.9, life * 1.8));
  }

  while (splashMeshes.length < splashes.length) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(tile * 0.18, tile * 0.44, 8),
      new THREE.MeshBasicMaterial({
        color: 0x65c8ff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
      })
    );
    cone.name = 'splash';
    splashMeshes.push(cone);
    dynamicGroup.add(cone);
  }
  for (let i = splashMeshes.length - 1; i >= splashes.length; i--) {
    const mesh = splashMeshes.pop();
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
  }
  for (let i = 0; i < splashes.length; i++) {
    const p = splashes[i];
    const cone = splashMeshes[i];
    cone.visible = true;
    cone.position.set(p.x || 0, groundElevationAt(p.x || 0, p.y || 0) + tile * 0.14, p.y || 0);
    cone.rotation.set(0, 0, (p.spin || 0) + i * 0.4);
    cone.scale.setScalar(Math.max(0.2, (p.life || 0.3) * 1.8));
    cone.material.opacity = Math.max(0, Math.min(0.8, (p.life || 0.3) * 1.6));
  }

  const wanted = others.length;
  while (particleMeshes.length < wanted) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xffcf6a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    }));
    sprite.name = 'particle';
    particleMeshes.push(sprite);
    dynamicGroup.add(sprite);
  }
  for (let i = particleMeshes.length - 1; i >= wanted; i--) {
    const s = particleMeshes.pop();
    dynamicGroup.remove(s);
    if (s.material) s.material.dispose();
  }
  for (let i = 0; i < wanted; i++) {
    const p = others[i];
    const s = particleMeshes[i];
    const col = p.kind === 'blood' ? 0x9a2d2d : p.kind === 'spark' ? 0xffd25a : p.kind === 'fire' ? 0xff7a35 : p.kind === 'water' || p.kind === 'splash' ? 0x65c8ff : 0xc9b28a;
    s.material.color.setHex(col);
    s.position.set(p.x || 0, groundElevationAt(p.x || 0, p.y || 0) + tile * (0.05 + Math.min(0.8, Math.max(0, (p.life || 0.3) * 0.35))), p.y || 0);
    const size = ((p.size || 2) / 2) * tile * 0.25;
    s.scale.set(size, size, 1);
    s.material.opacity = Math.max(0, Math.min(1, (p.life || 0.3) * 1.6));
  }
}

function updateTracers(game) {
  if (!dynamicGroup || !THREE) return;
  let lines = dynamicGroup.getObjectByName('tracers');
  const tracers = game.tracers || [];
  if (!tracers.length) {
    if (lines) {
      dynamicGroup.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
    return;
  }
  const needed = Math.max(performanceBudgetFor(game).tracerPoints, tracers.length * 6);
  if (!lines || lines.geometry.attributes.position.array.length < needed) {
    if (lines) {
      dynamicGroup.remove(lines);
      lines.geometry.dispose();
      lines.material.dispose();
    }
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(needed);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.55 });
    lines = new THREE.LineSegments(geo, mat);
    lines.name = 'tracers';
    lines.frustumCulled = false;
    dynamicGroup.add(lines);
  }
  const pos = lines.geometry.attributes.position.array;
  for (let i = 0; i < tracers.length; i++) {
    const t = tracers[i];
    const baseY = groundElevationAt(t.x1, t.y1) + 0.4;
    pos[i * 6] = t.x1;
    pos[i * 6 + 1] = baseY;
    pos[i * 6 + 2] = t.y1;
    pos[i * 6 + 3] = t.x2;
    pos[i * 6 + 4] = baseY + (t.y2 - t.y1) * 0.01;
    pos[i * 6 + 5] = t.y2;
  }
  lines.geometry.attributes.position.needsUpdate = true;
  lines.geometry.setDrawRange(0, tracers.length * 2);
}

function updateDecalsNext(game) {
  if (!dynamicGroup || !THREE) return;
  const tile = (getMap() && getMap().tile) || 16;
  const seenCorpse = new Set();
  const seenPoint = new Set();
  for (const d of game.decals || []) {
    if (d.type === 'corpse') {
      seenCorpse.add(d);
      let mesh = corpseMeshes.get(d);
      if (!mesh) {
        mesh = makeCorpseMesh(THREE, d.team, tile);
        corpseMeshes.set(d, mesh);
        dynamicGroup.add(mesh);
      }
      mesh.visible = true;
      mesh.position.set(d.x || 0, groundElevationAt(d.x || 0, d.y || 0) + tile * 0.05, d.y || 0);
      mesh.rotation.set(0, -(d.angle || 0) - Math.PI / 2, 0);
    } else if (d.type === 'spark' || d.type === 'hole' || d.type === 'bullet') {
      seenPoint.add(d);
      let mesh = decalPointMeshes.get(d);
      if (!mesh) {
        mesh = makeDecalPointMesh(THREE, d.type);
        decalPointMeshes.set(d, mesh);
        dynamicGroup.add(mesh);
      }
      mesh.visible = true;
      if (d.type === 'bullet') {
        const map = getMap();
        const grid = map && map.grid;
        const c = tileToChar(grid, Math.floor((d.x || 0) / tile), Math.floor((d.y || 0) / tile));
        const wallH = c === '=' || c === 'C' ? tile * 0.28 : tile * 0.78;
        const back = tile * 0.56;
        mesh.position.set(
          (d.x || 0) - Math.cos(d.angle || 0) * back,
          groundElevationAt(d.x || 0, d.y || 0) + wallH,
          (d.y || 0) - Math.sin(d.angle || 0) * back
        );
        mesh.scale.setScalar(tile * 0.26);
        mesh.material.opacity = Math.max(0.22, Math.min(1, (d.life || 1) * 0.15));
      } else {
        mesh.position.set(d.x || 0, groundElevationAt(d.x || 0, d.y || 0) + tile * 0.06, d.y || 0);
        mesh.scale.setScalar(tile * (d.type === 'hole' ? 0.3 : 0.58));
        mesh.material.opacity = Math.max(0.18, Math.min(1, (d.life || 1) * 0.12));
      }
    }
  }
  for (const [d, mesh] of corpseMeshes) {
    if (seenCorpse.has(d) || !dynamicGroup.children.includes(mesh)) continue;
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
    corpseMeshes.delete(d);
  }
  for (const [d, mesh] of decalPointMeshes) {
    if (seenPoint.has(d) || !dynamicGroup.children.includes(mesh)) continue;
    dynamicGroup.remove(mesh);
    disposeObject(mesh);
    decalPointMeshes.delete(d);
  }
}

function makeCorpseMesh(T, team, tile) {
  const group = new T.Group();
  const bodyMat = new T.MeshLambertMaterial({ color: team === 't' ? 0x9d6b3f : 0x3c6f92 });
  const darkMat = new T.MeshLambertMaterial({ color: team === 't' ? 0x5f3d25 : 0x21455f });
  const body = new T.Mesh(new T.BoxGeometry(tile * 0.82, tile * 0.10, tile * 0.34), bodyMat);
  body.position.y = tile * 0.05;
  const head = new T.Mesh(new T.BoxGeometry(tile * 0.24, tile * 0.16, tile * 0.26), darkMat);
  head.position.set(tile * 0.42, tile * 0.05, 0);
  const legA = new T.Mesh(new T.BoxGeometry(tile * 0.18, tile * 0.08, tile * 0.22), darkMat);
  legA.position.set(-tile * 0.28, tile * 0.04, tile * 0.08);
  const legB = legA.clone();
  legB.position.z = -tile * 0.08;
  group.add(body, head, legA, legB);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

function makeDecalPointMesh(T, type) {
  const mat = new T.SpriteMaterial({
    map: makeGlowTexture(),
    color: type === 'hole' || type === 'bullet' ? 0x0b0d0f : 0xffd166,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
  const sprite = new T.Sprite(mat);
  sprite.name = 'decal:' + type;
  return sprite;
}

function buildViewmodel(p) {
  if (!viewmodelGroup || !THREE) return;
  const T = THREE;
  const tile = (getMap() && getMap().tile) || 16;
  const s = tile / 16;
  const isKnife = p.slot === 'knife' || (p.weapons && p.weapons.knife && p.slot === 'knife');
  const isNade = p.slot && String(p.slot).indexOf('nade:') === 0;
  const group = new T.Group();
  const wid = isKnife ? 'knife' : isNade ? null : (p.slot === 'primary' ? (p.weapons && p.weapons.primary) : (p.weapons && p.weapons.secondary));
  const w = wid && WEAPONS[wid] ? WEAPONS[wid] : null;
  const kind = w && w.kind ? w.kind : 'rifle';
  const longGun = kind === 'rifle' || kind === 'sniper' || kind === 'smg' || kind === 'shotgun';
  const metal = new T.MeshStandardMaterial({
    color: kind === 'sniper' ? 0x596876 : kind === 'smg' ? 0x444c55 : 0x38434b,
    roughness: 0.42,
    metalness: 0.46
  });
  const dark = new T.MeshStandardMaterial({
    color: 0x22282c,
    roughness: 0.72,
    metalness: 0.22
  });
  const guardMat = new T.MeshStandardMaterial({
    color: 0x4d565e,
    roughness: 0.68,
    metalness: 0.16
  });
  const gripMat = new T.MeshStandardMaterial({
    color: 0x342d28,
    roughness: 0.9,
    metalness: 0.04
  });
  if (isNade) {
    const nade = new T.Mesh(new T.SphereGeometry(0.30 * s, 10, 8), new T.MeshLambertMaterial({ color: 0x4f5b42 }));
    group.add(nade);
  } else if (isKnife) {
    const blade = new T.Mesh(new T.BoxGeometry(0.10 * s, 0.16 * s, 0.72 * s), new T.MeshLambertMaterial({ color: 0xb9c4c9 }));
    const handle = new T.Mesh(new T.BoxGeometry(0.13 * s, 0.16 * s, 0.30 * s), dark);
    handle.position.z = 0.45 * s;
    blade.position.z = -0.18 * s;
    group.add(blade, handle);
  } else {
    const receiver = new T.Mesh(new T.BoxGeometry(0.17 * s, 0.16 * s, longGun ? 0.62 * s : 0.48 * s), metal);
    receiver.name = 'receiver';
    const barrel = new T.Mesh(new T.CylinderGeometry(0.038 * s, 0.05 * s, longGun ? 0.64 * s : 0.28 * s, 8), dark);
    barrel.name = 'barrel';
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02 * s, longGun ? -0.62 * s : -0.34 * s);
    const handguard = new T.Mesh(new T.BoxGeometry(0.15 * s, 0.12 * s, longGun ? 0.36 * s : 0.20 * s), guardMat);
    handguard.name = 'handguard';
    handguard.position.set(0, 0.02 * s, longGun ? -0.40 * s : -0.20 * s);
    const mag = new T.Mesh(new T.BoxGeometry(0.12 * s, longGun ? 0.30 * s : 0.24 * s, 0.18 * s), dark);
    mag.name = 'mag';
    mag.position.set(0, -0.18 * s, longGun ? 0.02 * s : 0.05 * s);
    const stock = new T.Mesh(new T.BoxGeometry(0.13 * s, 0.14 * s, longGun ? 0.36 * s : 0.22 * s), dark);
    stock.name = 'stock';
    stock.position.z = longGun ? 0.42 * s : 0.30 * s;
    const grip = new T.Mesh(new T.BoxGeometry(0.11 * s, 0.22 * s, 0.12 * s), gripMat);
    grip.name = 'grip';
    grip.position.set(0, -0.18 * s, longGun ? 0.20 * s : 0.14 * s);
    const rail = new T.Mesh(new T.BoxGeometry(0.09 * s, 0.05 * s, longGun ? 0.52 * s : 0.30 * s), dark);
    rail.name = 'rail';
    rail.position.set(0, 0.10 * s, longGun ? -0.12 * s : -0.02 * s);
    const sight = new T.Mesh(new T.BoxGeometry(0.03 * s, 0.09 * s, 0.09 * s), metal);
    sight.name = 'frontSight';
    sight.position.set(0, 0.15 * s, longGun ? -0.62 * s : -0.36 * s);
    group.add(receiver, barrel, handguard, mag, stock, grip, rail, sight);
  }
  const muzzle = new T.Sprite(new T.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffd166,
    transparent: true,
    opacity: 0.95,
    blending: T.AdditiveBlending,
    depthWrite: false
  }));
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.02 * s, longGun ? -0.98 * s : -0.58 * s);
  muzzle.visible = false;
  group.add(muzzle);
  viewmodelGroup.add(group);
}

function makeGlowTexture() {
  const key = 'glow';
  if (!glowCache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    glowCache.set(key, tex);
  }
  return glowCache.get(key);
}

function makeCloudTexture() {
  const key = 'cloud';
  if (!glowCache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(220,224,222,0.82)');
    g.addColorStop(0.42, 'rgba(174,182,178,0.62)');
    g.addColorStop(0.78, 'rgba(118,128,124,0.28)');
    g.addColorStop(1, 'rgba(80,90,86,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(225,228,225,0.16)';
    for (let i = 0; i < 42; i++) {
      const x = (i * 29 + Math.sin(i * 7) * 11) % 128;
      const y = (i * 53 + Math.cos(i * 5) * 13) % 128;
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 5), 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    glowCache.set(key, tex);
  }
  return glowCache.get(key);
}

const glowCache = new Map();

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry && !child.geometry.userData._cached) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
      else disposeMaterial(child.material);
    }
  });
}

function updateDynamic(game) {
  // 后续任务填充：实体、掉落物、炸弹、烟雾、粒子。
}

function updateViewmodel(game) {
  // 后续任务填充：第一人称武器模型。
}
