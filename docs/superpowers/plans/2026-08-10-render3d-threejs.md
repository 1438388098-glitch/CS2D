# Three.js 3D 比赛环境 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current paper-thin 3D renderer with a real Three.js low-poly match environment while preserving the existing 2D game logic, HUD, audio, and fallback behavior.

**Architecture:** Add `src/render3d-next.js` as a new Three.js renderer. It renders into an offscreen WebGL canvas with `preserveDrawingBuffer: true`, then `main.js` composites that canvas into the existing 2D game canvas. The legacy `src/render3d.js` remains available when Three.js loading, WebGL context creation, or scene initialization fails.

**Tech Stack:** Three.js (vendored locally), existing ES modules, Node syntax checks, CDP browser smoke tests.

---

## File Structure

- Create: `vendor/three.module.js` (copy of npm `three/build/three.module.js`)
- Create: `src/render3d-next.js` (Three.js scene, map geometry, entities, viewmodel, render loop)
- Modify: `src/main.js` (select new backend, call init/reset, expose backend in stats)
- Modify: `src/game.js` (lock FPS pitch to 0)
- Create: `test/render3d-next.mjs` (pure geometry/layout tests)
- Create: `test/cdp-render3d-three.mjs` (browser render smoke test)

## Task 1: Vendor Three.js and create renderer baseline

**Files:**
- Create: `vendor/three.module.js`
- Create: `src/render3d-next.js`

- [x] **Step 1: Install and vendor Three.js**

Run:
```bash
npm install --no-save three@0.164.1
mkdir -p vendor
copy node_modules\three\build\three.module.js vendor\three.module.js
```

Expected: `vendor/three.module.js` exists and is larger than 1 MB.

- [x] **Step 2: Add renderer skeleton**

```js
import * as THREE from '../vendor/three.module.js';

let canvasRef = null;
let layersRef = null;
let renderer = null;
let scene = null;
let camera = null;
let mapGroup = null;
let dynamicGroup = null;
let viewmodelGroup = null;
let mapKey = '';

export function render3dNextReady() {
  return !!THREE && !!renderer && !!scene;
}

export function initRenderer3dNext(canvas, layers) {
  canvasRef = canvas;
  layersRef = layers;
  disposeRenderer();
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: document.createElement('canvas'),
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 3000);
    camera.rotation.order = 'YXZ';
    mapGroup = new THREE.Group();
    dynamicGroup = new THREE.Group();
    viewmodelGroup = new THREE.Group();
    scene.add(mapGroup, dynamicGroup, viewmodelGroup);
  } catch (err) {
    console.error('[render3d-next] init failed:', err);
    disposeRenderer();
  }
}

export function disposeRenderer3dNext() {
  disposeRenderer();
}

function disposeRenderer() {
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  mapGroup = null;
  dynamicGroup = null;
  viewmodelGroup = null;
  mapKey = '';
}

export function render3dNext(game) {
  if (!renderer || !scene || !camera || !game) return;
  renderer.setSize(canvasRef.width, canvasRef.height, false);
  camera.aspect = canvasRef.width / canvasRef.height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const ctx = canvasRef.getContext('2d');
  if (ctx) ctx.drawImage(renderer.domElement, 0, 0, canvasRef.width, canvasRef.height);
}
```

- [x] **Step 3: Syntax-check**

Run: `npm run check`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add vendor/three.module.js src/render3d-next.js
git commit -m "feat: vendor three and add renderer skeleton"
```

## Task 2: Generate map geometry and lighting

**Files:**
- Modify: `src/render3d-next.js`
- Create: `test/render3d-next.mjs`

- [x] **Step 1: Add exported pure helpers**

Add to `src/render3d-next.js`:

```js
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
  return (c === '^' ? tile : c === 'R' ? tile * 0.5 : 0) + tile * 0.5;
}
```

- [x] **Step 2: Build static map group**

In `rebuildMap(game)`, iterate `grid`, merge wall boxes where possible, add one floor plane under the whole map, and add sky/directional light with shadows. Use `layersRef.floorTex`, `layersRef.wallVariants`, `layersRef.crateTex`, and deterministic vertex colors for AO.

Call `rebuildMap(game)` from `render3dNext(game)` when `mapKey !== getMap().id`.

- [x] **Step 3: Write pure tests**

Create `test/render3d-next.mjs`:

```js
import { isSolidTile, isWaterTile, tileHeightFor, cameraZFor } from '../src/render3d-next.js';

function ok(name, cond) {
  if (!cond) throw new Error('render3d-next: ' + name + ' FAIL');
  console.log('render3d-next: ' + name + ' PASS');
}

ok('solid wall', isSolidTile('#'));
ok('solid crate', isSolidTile('C'));
ok('water shallow', isWaterTile('~'));
ok('water deep', isWaterTile('\u2248'));
ok('half-height crate', tileHeightFor('C', 16) === 8.8);
ok('camera platform height', cameraZFor('^', 16) === 24);
ok('camera half platform height', cameraZFor('R', 16) === 16);
```

Run: `node test/render3d-next.mjs`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/render3d-next.js test/render3d-next.mjs
git commit -m "feat: build Three.js map geometry and lighting"
```

## Task 3: Add dynamic entities and viewmodel

**Files:**
- Modify: `src/render3d-next.js`

- [x] **Step 1: Add pooled entity models**

For each entity, maintain `entity.mesh` (a `THREE.Group`) with body/head/legs; CT is blue, T is sand/red, dead entities fall to the floor. For drops, create a small weapon box. For bombs, create a C4-like box with red pulse light.

For smoke and particles, create `THREE.Sprite` objects with a generated radial texture, opacity based on `life`, and a hard pool cap of 120.

- [x] **Step 2: Add first-person viewmodel**

Create `viewmodelGroup` children based on `weaponDef(p)`:

- pistol: thin box + slide
- rifle: receiver, stock, magazine, barrel
- knife: short handle + blade

Use `p.recoil`, `p.reloadT`, `p.muzzleT`, and `p.bobPhase` for stable low-poly animation.

- [x] **Step 3: Commit**

```bash
git add src/render3d-next.js
git commit -m "feat: add Three.js entities and viewmodel"
```

## Task 4: Integrate new renderer and lock vertical aim

**Files:**
- Modify: `src/main.js`
- Modify: `src/game.js`

- [x] **Step 1: Modify main.js**

Import `render3dNext`, `initRenderer3dNext`, `render3dNextReady` from `./render3d-next.js`. In `reloadMapLayers()`:

```js
initRenderer3dNext(canvas, game.layers);
```

In `startLoop()`:

```js
if (game.viewMode === 'fps' && fpsCameraEntity(game)) {
  if (render3dNextReady()) render3dNext(game);
  else render3d(game);
}
```

On `render3dNext` exceptions, set `game._render3dBackend = 'legacy'` once and continue.

- [x] **Step 2: Modify game.js**

In `updatePlayerAim()`:

```js
if (game.viewMode === 'fps') {
  const dx = game._mlookDx || 0;
  game._mlookDx = 0;
  game._mlookDy = 0;
  if (game.state !== 'BUY' && game.state !== 'LIVE') return;
  const sens = game.fpsSens || 0.002;
  const p2 = game.player;
  if (p2 && !p2.dead) {
    const scopeMul = p2.scoped ? 0.35 : 1;
    p2.angle += dx * sens * scopeMul;
    p2.pitch = 0;
  } else {
    if (game._specAngle == null) game._specAngle = game.player ? game.player.angle : 0;
    if (game._specPitch == null) game._specPitch = 0;
    if (dx) game._specManual = game.time;
    game._specAngle += dx * sens;
    game._specPitch = 0;
  }
  return;
}
```

- [x] **Step 3: Commit**

```bash
git add src/main.js src/game.js
git commit -m "feat: wire Three.js renderer and lock FPS vertical aim"
```

## Task 5: Browser verification

**Files:**
- Create: `test/cdp-render3d-three.mjs`

- [x] **Step 1: Add CDP test**

Copy the structure from `test/cdp-fps3d.mjs`, then assert:

- `window.__cs2d.game._render3dBackend` is `'next'` (or no fallback).
- center pixels are not blank.
- wall/ground texture variety exists (RGB variance across a large sample).
- mouse `movementY` does not change `pitch`.
- `FPSHint` or backend stats show the new renderer.

- [x] **Step 2: Run all verification**

Run:
```bash
npm run check
npm test
node test/render3d-smoke.mjs
node test/cdp-fps3d.mjs
node test/cdp-render3d-three.mjs
```

Expected: all PASS. Debug any WebGL/fallback issue before committing.

- [x] **Step 3: Commit**

```bash
git add test/cdp-render3d-three.mjs src/render3d-next.js
git commit -m "test: add Three.js browser smoke test"
```
