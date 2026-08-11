// Top-down 2D WebGL backend: static map, decals, shadows and fog are uploaded
// as textures and composited by the GPU instead of redrawn with Canvas 2D calls.
import { getGrid, getMap } from './map.js';
import { visibleShadows, drawShadows } from './shadow-fx.js';
import { TILE } from './config.js';
import { fogEnabled } from './fog.js';
import { renderFogLayer } from './fog-layer.js';

const SHADOW_LIGHT_DIR = Math.PI * 0.25;

let gl = null;
let hostCanvas = null;
let gpuCanvas = null;
let renderLayers = null;
let program = null;
let quadBuffer = null;
let texStatic = null;
let texDecal = null;
let texShadow = null;
let texEntity = null;
let texFog = null;
let mapW = 0;
let mapH = 0;
let decalRev = -1;
let shadowRev = -1;
let fogKey = '';
let fogUpdatedAt = 0;
let softwareRenderer = null;

const VS = `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uRes;
uniform vec2 uCam;
uniform vec2 uShake;
uniform float uScale;
uniform float uDpr;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec2 screen = (aPos - uCam + uShake) * uScale * uDpr + uRes * 0.5;
  vec2 ndc = vec2(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}`;

function compile(glc, type, src) {
  const sh = glc.createShader(type);
  glc.shaderSource(sh, src);
  glc.compileShader(sh);
  if (!glc.getShaderParameter(sh, glc.COMPILE_STATUS)) {
    throw new Error(glc.getShaderInfoLog(sh));
  }
  return sh;
}

function makeProgram(glc, vsSrc = VS, fsSrc = FS) {
  const vs = compile(glc, glc.VERTEX_SHADER, vsSrc);
  const fs = compile(glc, glc.FRAGMENT_SHADER, fsSrc);
  const p = glc.createProgram();
  glc.attachShader(p, vs);
  glc.attachShader(p, fs);
  glc.linkProgram(p);
  if (!glc.getProgramParameter(p, glc.LINK_STATUS)) {
    throw new Error(glc.getProgramInfoLog(p));
  }
  return p;
}

function makeTexture(glc) {
  const t = glc.createTexture();
  glc.bindTexture(glc.TEXTURE_2D, t);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MIN_FILTER, glc.LINEAR);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAG_FILTER, glc.LINEAR);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_S, glc.CLAMP_TO_EDGE);
  glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_T, glc.CLAMP_TO_EDGE);
  return t;
}

function uploadTexture(glc, tex, src) {
  if (!src || !src.width || !src.height) return false;
  glc.bindTexture(glc.TEXTURE_2D, tex);
  glc.pixelStorei(glc.UNPACK_FLIP_Y_WEBGL, false);
  glc.texImage2D(glc.TEXTURE_2D, 0, glc.RGBA, glc.RGBA, glc.UNSIGNED_BYTE, src);
  glc.pixelStorei(glc.UNPACK_FLIP_Y_WEBGL, false);
  return true;
}

function buildShadowTexture(layers) {
  if (typeof document === 'undefined') return null;
  const map = getMap();
  const W = (map && map.W) || layers.staticLayer.width;
  const H = (map && map.H) || layers.staticLayer.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const t = c.getContext('2d');
  if (!t) return null;
  const tile = (map && map.tile) || TILE;
  const shadows = visibleShadows(
    { grid: getGrid(), tile },
    { x: 0, y: 0, w: W, h: H },
    SHADOW_LIGHT_DIR
  );
  drawShadows(t, shadows);
  return c;
}

export function rebuildShadowLayer(game) {
  const ref = (game && game.layers) || renderLayers;
  if (!ref || !ref.staticLayer) return null;
  const shadowCv = buildShadowTexture(ref);
  if (!shadowCv) return null;
  if (renderLayers) renderLayers.shadowLayer = shadowCv;
  if (game && game.layers) game.layers.shadowLayer = shadowCv;
  return shadowCv;
}

function refreshShadowTexture(game) {
  const shadowCv = rebuildShadowLayer(game);
  if (!shadowCv) return false;
  if (!texShadow) texShadow = makeTexture(gl);
  return uploadTexture(gl, texShadow, shadowCv);
}

function drawQuad(tex) {
  if (!tex) return;
  gl.useProgram(program);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  const aPos = gl.getAttribLocation(program, 'aPos');
  const aUv = gl.getAttribLocation(program, 'aUv');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function updateFogGpu(game) {
  if (!render2dGpuReady() || !game) return false;
  if (!fogEnabled(game)) {
    fogKey = '';
    fogUpdatedAt = 0;
    return false;
  }
  const fogCv = renderFogLayer(game);
  if (!fogCv) return false;
  if (game._fogKey === fogKey && game._fogUpdatedAt === fogUpdatedAt) return true;
  if (texFog) gl.deleteTexture(texFog);
  texFog = makeTexture(gl);
  uploadTexture(gl, texFog, fogCv);
  fogKey = game._fogKey || '';
  fogUpdatedAt = game._fogUpdatedAt || 0;
  return true;
}

function setCamera(game) {
  gl.uniform2f(gl.getUniformLocation(program, 'uRes'), gpuCanvas.width, gpuCanvas.height);
  gl.uniform2f(gl.getUniformLocation(program, 'uCam'), game.camX || 0, game.camY || 0);
  gl.uniform2f(gl.getUniformLocation(program, 'uShake'), game._shx || 0, game._shy || 0);
  gl.uniform1f(gl.getUniformLocation(program, 'uScale'), game.zoom || 1);
  gl.uniform1f(gl.getUniformLocation(program, 'uDpr'), game.dpr || 1);
}

function blitToHost() {
  gl.flush();
  const ctx = hostCanvas && hostCanvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(gpuCanvas, 0, 0, hostCanvas.width, hostCanvas.height);
  ctx.restore();
}

export function render2dGpuReady() {
  return !!gl && !!program && !!gpuCanvas;
}

export function render2dGpuIsSoftware() {
  if (!gl) return true;
  if (softwareRenderer !== null) return softwareRenderer;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');
    softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
    return softwareRenderer;
  } catch (err) {
    softwareRenderer = true;
    return true;
  }
}

export function initRenderer2dGpu(canvas, layers) {
  disposeRenderer2dGpu();
  if (!canvas || !layers || !layers.staticLayer || typeof document === 'undefined') return false;
  try {
    hostCanvas = canvas;
    renderLayers = layers;
    gpuCanvas = document.createElement('canvas');
    gpuCanvas.width = canvas.width || 1;
    gpuCanvas.height = canvas.height || 1;
    gl = gpuCanvas.getContext('webgl', { antialias: false, alpha: true, preserveDrawingBuffer: true }) ||
         gpuCanvas.getContext('experimental-webgl', { antialias: false, alpha: true, preserveDrawingBuffer: true });
    if (!gl) return false;
    gl.viewport(0, 0, gpuCanvas.width, gpuCanvas.height);
    gl.clearColor(20 / 255, 22 / 255, 26 / 255, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    program = makeProgram(gl);
    quadBuffer = gl.createBuffer();
    const map = getMap();
    mapW = (map && map.W) || layers.staticLayer.width;
    mapH = (map && map.H) || layers.staticLayer.height;
    const verts = new Float32Array([
      0, 0, 0, 0,
      mapW, 0, 1, 0,
      0, mapH, 0, 1,
      mapW, mapH, 1, 1
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    texStatic = makeTexture(gl);
    uploadTexture(gl, texStatic, layers.staticLayer);
    texDecal = makeTexture(gl);
    uploadTexture(gl, texDecal, layers.decalLayer);
    const shadowCv = buildShadowTexture(layers);
    if (layers) layers.shadowLayer = shadowCv;
    texShadow = makeTexture(gl);
    uploadTexture(gl, texShadow, shadowCv);
    texFog = null;
    decalRev = -1;
    shadowRev = -1;
    fogKey = '';
    fogUpdatedAt = 0;
    return true;
  } catch (err) {
    console.error('[render2d-gpu] init failed:', err);
    disposeRenderer2dGpu();
    return false;
  }
}

export function render2dGpuFrame(game, phase, entityCv) {
  if (!render2dGpuReady() || !game) return false;
  if (gpuCanvas.width !== hostCanvas.width || gpuCanvas.height !== hostCanvas.height) {
    gpuCanvas.width = hostCanvas.width;
    gpuCanvas.height = hostCanvas.height;
    gl.viewport(0, 0, gpuCanvas.width, gpuCanvas.height);
  }
  gl.viewport(0, 0, gpuCanvas.width, gpuCanvas.height);
  gl.useProgram(program);
  setCamera(game);
  if (phase === 'base') {
    const rev = game._decalRev || 0;
    if (rev !== decalRev) {
      uploadTexture(gl, texDecal, game.layers && game.layers.decalLayer);
      decalRev = rev;
    }
    const srev = game._shadowRev || 0;
    if (srev !== shadowRev) {
      refreshShadowTexture(game);
      shadowRev = srev;
    }
    gl.clearColor(20 / 255, 22 / 255, 26 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawQuad(texStatic);
    drawQuad(texDecal);
    drawQuad(texShadow);
  } else if (phase === 'composite') {
    const rev = game._decalRev || 0;
    if (rev !== decalRev) {
      uploadTexture(gl, texDecal, game.layers && game.layers.decalLayer);
      decalRev = rev;
    }
    const srev = game._shadowRev || 0;
    if (srev !== shadowRev) {
      refreshShadowTexture(game);
      shadowRev = srev;
    }
    gl.clearColor(20 / 255, 22 / 255, 26 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawQuad(texStatic);
    drawQuad(texDecal);
    drawQuad(texShadow);
    if (entityCv && entityCv.width && entityCv.height) {
      if (!texEntity) texEntity = makeTexture(gl);
      uploadTexture(gl, texEntity, entityCv);
      drawQuad(texEntity);
    }
    if (fogEnabled(game)) {
      updateFogGpu(game);
      drawQuad(texFog);
    }
  } else if (phase === 'fog') {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (fogEnabled(game)) drawQuad(texFog);
  }
  blitToHost();
  return true;
}

export function disposeRenderer2dGpu() {
  if (gl) {
    for (const tex of [texStatic, texDecal, texShadow, texEntity, texFog]) {
      if (tex) gl.deleteTexture(tex);
    }
    if (quadBuffer) gl.deleteBuffer(quadBuffer);
    if (program) gl.deleteProgram(program);
  }
  gl = null;
  hostCanvas = null;
  renderLayers = null;
  gpuCanvas = null;
  program = null;
  quadBuffer = null;
  texStatic = null;
  texDecal = null;
  texShadow = null;
  texEntity = null;
  texFog = null;
  mapW = 0;
  mapH = 0;
  decalRev = -1;
  shadowRev = -1;
  fogKey = '';
  fogUpdatedAt = 0;
  softwareRenderer = null;
}
