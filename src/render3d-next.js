// 3D 重构入口：Three.js 低多边形比赛环境渲染器。
// 保留旧 render3d.js 作为降级路径；本模块在 Three.js 可用前不阻塞游戏启动。
import { getMap, groundElevationAt } from './map.js';
import { themeOf } from './textures.js';

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
let mapKey = '';
let canvasRef = null;
let layersRef = null;
let cameraLight = null;
let cameraFill = null;
let entityMeshes = new Map();
let dropMeshes = new Map();
let grenadeMeshes = new Map();
let smokeMeshes = [];
let particleMeshes = [];
let viewmodelKey = '';
let initGen = 0;
const normalMapCache = new Map();

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
  cameraLight = null;
  cameraFill = null;
  mapKey = '';
  entityMeshes = new Map();
  dropMeshes = new Map();
  grenadeMeshes = new Map();
  smokeMeshes = [];
  particleMeshes = [];
  viewmodelKey = '';
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
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(0x1c2530, 1);
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
    const hemi = new T.HemisphereLight(0xcfe8ff, 0x59615a, 1.05);
    scene.add(hemi);
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
    return true;
  } catch (err) {
    console.error('[render3d-next] init failed:', err);
    disposeRenderer();
    return false;
  }
}

export function render3dNext(game) {
  if (!render3dNextReady() || !game || !canvasRef) return;
  game._render3dBackend = 'next';
  try {
    const map = getMap();
    if (map && map.id !== mapKey) rebuildMap(game, map);
    const ent = fpsCameraEntity(game);
    if (!ent) return;
    updateCamera(game, ent, map);
    updateLighting(map);
    updateDynamicNext(game);
    updateViewmodelNext(game);
    const dpr = game.dpr || 1;
    const cssW = canvasRef.width / dpr;
    const cssH = canvasRef.height / dpr;
    const scale = game._renderScale >= 0.5 && game._renderScale <= 1 ? game._renderScale : 1;
    const w = Math.max(320, Math.min(1920, Math.floor(cssW * scale)));
    const h = Math.max(180, Math.min(1080, Math.floor(cssH * scale)));
    renderer.setPixelRatio(Math.min(dpr, 2));
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
    game._renderStats = {
      total: renderMs,
      render3dBackend: 'next',
      mapObjects: mapGroup ? mapGroup.children.length : 0,
      dynamicObjects: dynamicGroup ? dynamicGroup.children.length : 0,
      viewmodelObjects: viewmodelGroup ? viewmodelGroup.children.length : 0,
      drawCalls: renderer && renderer.info && renderer.info.render ? renderer.info.render.calls : 0
    };
  } catch (err) {
    console.error('[render3d-next] frame error:', err);
    if (game) game._render3dBackend = 'legacy';
  }
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
  entityMeshes = new Map();
  dropMeshes = new Map();
  grenadeMeshes = new Map();
  smokeMeshes = [];
  particleMeshes = [];
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
  if (mat.map) mat.map.dispose();
  mat.dispose();
}

function updateCamera(game, ent, map) {
  if (!camera || !ent) return;
  const eye = 0.5 * ((map && map.tile) || 16);
  const elev = groundElevationAt(ent.x || 0, ent.y || 0);
  camera.position.set(ent.x || 0, eye + elev, ent.y || 0);
  camera.rotation.set(0, -(ent.angle || 0) - Math.PI / 2, 0);
  camera.rotation.x = 0;
}

function updateLighting(map) {
  if (!cameraLight || !map) return;
  const cx = map.W / 2;
  const cz = map.H / 2;
  cameraLight.position.set(cx + 420, 520, cz + 260);
  cameraLight.target.position.set(cx, 0, cz);
  cameraLight.shadow.camera.left = -Math.max(map.W, 900);
  cameraLight.shadow.camera.right = Math.max(map.W, 900);
  cameraLight.shadow.camera.top = Math.max(map.H, 900);
  cameraLight.shadow.camera.bottom = -Math.max(map.H, 900);
  cameraLight.shadow.camera.updateProjectionMatrix();
}

function buildMapScene(map, layers) {
  if (!mapGroup || !scene || !THREE || !map) return;
  const T = THREE;
  const tile = map.tile || 16;
  const grid = map.grid || [];
  const w = map.W || grid.length * tile;
  const h = map.H || (grid.length ? grid[0].length * tile : 0);

  buildSky(map);

  const floorTex = textureFrom(layers && layers.floorTex, Math.max(1, w / 8), Math.max(1, h / 8));
  const floorNorm = normalMapFor(layers && layers.floorTex, Math.max(1, w / 8), Math.max(1, h / 8));
  const floorMat = new T.MeshStandardMaterial({
    map: floorTex,
    normalMap: floorNorm,
    normalScale: new T.Vector2(0.38, 0.38),
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.02,
    vertexColors: true
  });
  const floorGeo = new T.PlaneGeometry(w, h, Math.min(56, Math.max(8, Math.floor(Math.max(w, h) / 220))), Math.min(56, Math.max(8, Math.floor(Math.max(w, h) / 220))));
  setGroundVertexColors(floorGeo, w, h);
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
  addInstancedWallVariants(mapGroup, T, countWallVariants(grid, wallMats.length), new T.BoxGeometry(tile, tile, tile), wallMats,
    (tx, ty, c, cx, cz, i, mesh) => {
      setInstanceTransform(T, mesh, i, cx, tile * 0.5, cz, 1, 1, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(wallColor(c)));
    });
  addInstancedBoxes(mapGroup, T, 'thin', counts.thin, new T.BoxGeometry(tile, tile, tile), wallMat,
    (tx, ty, c, cx, cz, i, mesh) => {
      setInstanceTransform(T, mesh, i, cx, tile * 0.275, cz, 1, 0.55, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(wallColor(c)));
    });
  addInstancedBoxes(mapGroup, T, 'crates', counts.crate, new T.BoxGeometry(tile, tile, tile), crateMat,
    (tx, ty, c, cx, cz, i, mesh) => {
      setInstanceTransform(T, mesh, i, cx, tile * 0.275, cz, 0.92, 0.55, 0.92, 0, 0, (tx * 0.7 + ty * 0.3) % 1);
      mesh.setColorAt(i, new T.Color(0xb8865a));
    });
  addInstancedBoxes(mapGroup, T, 'platforms', counts.platform, new T.BoxGeometry(tile, tile, tile), platformMat,
    (tx, ty, c, cx, cz, i, mesh) => {
      const hgt = c === '^' ? tile : tile * 0.5;
      setInstanceTransform(T, mesh, i, cx, hgt * 0.5, cz, 1, hgt / tile, 1, 0, 0, 0);
      mesh.setColorAt(i, new T.Color(c === '^' ? 0x9faab4 : 0x9b8f78));
    });
  addInstancedBarrels(mapGroup, T, counts.barrel, barrelMat);
  addInstancedWater(mapGroup, T, grid, tile, counts.water, waterMat, deepWaterMat);
  addInstancedWallCaps(mapGroup, T, grid, tile, counts.wall, counts.thin, capMat);
  addInstancedSites(mapGroup, T, grid, tile);
  addSiteMarkers(mapGroup, T, map, tile);
  addInstancedDecos(mapGroup, T, layers && layers.decos, tile);
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

function setGroundVertexColors(geo, w, h) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const hash = (x, y) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + w / 2;
    const wy = pos.getY(i) + h / 2;
    const n = hash(Math.floor(wx / 80), Math.floor(wy / 80));
    const grain = 0.92 + n * 0.16 + Math.sin(wx * 0.0018 + wy * 0.0011) * 0.03;
    colors[i * 3] = 0.88 * grain;
    colors[i * 3 + 1] = 0.84 * grain;
    colors[i * 3 + 2] = 0.76 * grain;
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
    tex.anisotropy = 4;
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
}

function addInstancedWallCaps(group, T, grid, tile, wallCount, thinCount, material) {
  const add = (count, isThin) => {
    if (!count) return;
    const geo = new T.BoxGeometry(tile * 1.06, tile * 0.07, tile * 1.06);
    const mesh = new T.InstancedMesh(geo, material, count);
    mesh.name = isThin ? 'thinWallCaps' : 'wallCaps';
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
  const tex = new THREE.CanvasTexture(source);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX || 1, repeatY || 1);
  tex.anisotropy = 4;
  return tex;
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
  skyMesh.renderOrder = -20;
  scene.add(skyMesh);
  const fog = theme.atmo && theme.atmo.fogColor;
  if (fog) {
    scene.fog = new THREE.Fog(new THREE.Color(fog[0] / 255, fog[1] / 255, fog[2] / 255), 420, Math.max(900, map.W * 0.8));
  }
}

function updateDynamicNext(game) {
  updateEntities(game);
  updateDrops(game);
  updateGrenades(game);
  updateBomb(game);
  updateSmokes(game);
  updateParticles(game);
  updateTracers(game);
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
  viewmodelGroup.position.set(0.26 * tile, -0.18 * tile + recoil * 0.018 * tile + (reloading ? Math.sin(reloadT * 22) * 0.02 * tile : 0), -0.48 * tile);
  viewmodelGroup.rotation.set(reloading ? Math.sin(reloadT * 10) * 0.12 : recoil * 0.14, 0, recoil * 0.08);
  const muzzle = viewmodelGroup.getObjectByName('muzzle');
  if (muzzle) {
    muzzle.visible = (p.muzzleT || 0) > 0;
    if (muzzle.visible) muzzle.scale.setScalar(0.85 + Math.random() * 0.35);
  }
}

function updateEntities(game) {
  if (!dynamicGroup || !THREE) return;
  const cam = fpsCameraEntity(game);
  const seen = new Set();
  for (const e of game.entities || []) {
    if (e === cam || e.dead) continue;
    seen.add(e);
    let group = entityMeshes.get(e);
    if (!group) {
      group = makeCharacter(THREE, e, (getMap() && getMap().tile) || 16);
      entityMeshes.set(e, group);
      dynamicGroup.add(group);
    }
    const tile = (getMap() && getMap().tile) || 16;
    group.position.set(e.x || 0, groundElevationAt(e.x || 0, e.y || 0) + (e.crouched ? tile * 0.28 : tile * 0.0), e.y || 0);
    group.rotation.set(0, -(e.angle || 0) - Math.PI / 2, 0);
    const walk = (e.bobPhase || 0);
    const legA = group.getObjectByName('legA');
    const legB = group.getObjectByName('legB');
    if (legA && legB) {
      const sw = e.walking ? Math.sin(walk * 2) * 0.45 : 0;
      legA.rotation.x = sw;
      legB.rotation.x = -sw;
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
  const mat = new T.MeshLambertMaterial({ color: team });
  const darkMat = new T.MeshLambertMaterial({ color: dark });
  const body = new T.Mesh(new T.BoxGeometry(tile * 0.62, tile * 0.72, tile * 0.30), mat);
  body.position.y = tile * 0.78;
  body.castShadow = true;
  const head = new T.Mesh(new T.BoxGeometry(tile * 0.34, tile * 0.30, tile * 0.30), new T.MeshLambertMaterial({ color: e.team === 't' ? 0xd29a6a : 0xd2b08a }));
  head.position.y = tile * 1.28;
  head.castShadow = true;
  const legA = new T.Mesh(new T.BoxGeometry(tile * 0.17, tile * 0.50, tile * 0.20), darkMat);
  legA.name = 'legA';
  legA.position.set(-tile * 0.14, tile * 0.24, 0);
  legA.castShadow = true;
  const legB = legA.clone();
  legB.name = 'legB';
  legB.position.x = tile * 0.14;
  const armA = new T.Mesh(new T.BoxGeometry(tile * 0.15, tile * 0.58, tile * 0.18), darkMat);
  armA.position.set(-tile * 0.43, tile * 0.78, 0);
  const armB = armA.clone();
  armB.position.x = tile * 0.43;
  group.add(body, head, legA, legB, armA, armB);
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
  const wanted = Math.min(game.smokes ? game.smokes.length : 0, 40);
  while (smokeMeshes.length < wanted) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0x8b9894,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    }));
    sprite.name = 'smoke';
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
    const smoke = game.smokes[i];
    const s = smokeMeshes[i];
    const pulse = 0.7 + Math.sin((game.time || 0) * 2.1 + i * 1.3) * 0.08;
    s.position.set(smoke.x || 0, groundElevationAt(smoke.x || 0, smoke.y || 0) + tile * (0.7 + pulse * 0.25), smoke.y || 0);
    const scale = ((smoke.r || tile * 3) * 0.012 + 0.6) * tile;
    s.scale.set(scale, scale, 1);
    s.material.opacity = Math.min(0.62, 0.35 + (smoke.life || 1) * 0.02);
  }
}

function updateParticles(game) {
  if (!dynamicGroup || !THREE) return;
  const wanted = Math.min(game.particles ? game.particles.length : 0, 80);
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
  const tile = (getMap() && getMap().tile) || 16;
  for (let i = 0; i < wanted; i++) {
    const p = game.particles[i];
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
  const needed = Math.max(64, tracers.length * 6);
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

function buildViewmodel(p) {
  if (!viewmodelGroup || !THREE) return;
  const T = THREE;
  const tile = (getMap() && getMap().tile) || 16;
  const s = tile / 16;
  const isKnife = p.slot === 'knife' || (p.weapons && p.weapons.knife && p.slot === 'knife');
  const isNade = p.slot && String(p.slot).indexOf('nade:') === 0;
  const group = new T.Group();
  const metal = new T.MeshLambertMaterial({ color: 0x38434b });
  const dark = new T.MeshLambertMaterial({ color: 0x22282c });
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
    const rifle = !p.weapons || p.slot === 'primary';
    const receiver = new T.Mesh(new T.BoxGeometry(0.16 * s, 0.18 * s, rifle ? 0.72 * s : 0.48 * s), metal);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.045 * s, 0.045 * s, rifle ? 0.55 * s : 0.25 * s, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02 * s, -0.52 * s);
    const mag = new T.Mesh(new T.BoxGeometry(0.12 * s, 0.28 * s, 0.20 * s), dark);
    mag.position.set(0, -0.18 * s, 0.05 * s);
    const stock = new T.Mesh(new T.BoxGeometry(0.14 * s, 0.14 * s, rifle ? 0.34 * s : 0.22 * s), dark);
    stock.position.z = 0.45 * s;
    group.add(receiver, barrel, mag, stock);
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
  muzzle.position.set(0, 0.02 * s, -0.82 * s);
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

const glowCache = new Map();

function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
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
