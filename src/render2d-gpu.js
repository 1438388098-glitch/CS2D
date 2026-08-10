// Top-down 2D WebGL backend: static map, decals, shadows and fog are uploaded
// as textures and composited by the GPU instead of redrawn with Canvas 2D calls.
import { getGrid, getMap } from './map.js';
import { visibleShadows, drawShadows } from './shadow-fx.js';
import { TILE } from './config.js';
import { fogEnabled, castVisionPolygon } from './fog.js';

const SHADOW_LIGHT_DIR = Math.PI * 0.25;
const FOG_UPDATE_MS = 80;
const FOG_RAYS = 128;

let gl = null;
let hostCanvas = null;
let gpuCanvas = null;
let program = null;
let quadBuffer = null;
let fogProgram = null;
let fogBuffer = null;
let fogFbo = null;
let texStatic = null;
let texDecal = null;
let texShadow = null;
let texEntity = null;
let texFog = null;
let mapW = 0;
let mapH = 0;
let decalRev = -1;
let fogKey = '';
let fogUpdatedAt = 0;

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

const FOG_VS = `
attribute vec2 aPos;
uniform vec2 uFogRes;
void main() {
  vec2 ndc = vec2(aPos.x / uFogRes.x * 2.0 - 1.0, aPos.y / uFogRes.y * 2.0 - 1.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FOG_FS = `
precision mediump float;
void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
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

function allocFogTexture() {
  if (!mapW || !mapH) return null;
  if (texFog) gl.deleteTexture(texFog);
  texFog = makeTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texFog);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mapW, mapH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  if (!fogFbo) fogFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fogFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texFog, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fog FBO incomplete: ' + status);
  return texFog;
}

function drawFogFan(game, v) {
  const pts = castVisionPolygon(game, v.x, v.y, 560, FOG_RAYS);
  if (!pts.length) return;
  const verts = new Float32Array((pts.length + 1) * 2);
  verts[0] = v.x;
  verts[1] = v.y;
  for (let i = 0; i < pts.length; i++) {
    verts[(i + 1) * 2] = pts[i].x;
    verts[(i + 1) * 2 + 1] = pts[i].y;
  }
  gl.useProgram(fogProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, fogBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  const aPos = gl.getAttribLocation(fogProgram, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(fogProgram, 'uFogRes'), mapW, mapH);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, pts.length + 1);
}

function fogKeyFor(game, viewpoints) {
  const smokeKey = (game.smokes || []).map((s) => Math.round(s.x / 32) + ',' + Math.round(s.y / 32)).join(';');
  const posKey = viewpoints.map((v) => Math.round(v.x / 8) + ',' + Math.round(v.y / 8)).join('|');
  return posKey + '#' + smokeKey;
}

export function updateFogGpu(game) {
  if (!render2dGpuReady() || !game) return false;
  if (!fogEnabled(game)) {
    fogKey = '';
    fogUpdatedAt = 0;
    return false;
  }
  const map = getMap();
  if (!map || !map.W || !map.H) return false;
  const p = game.player;
  const viewpoints = [];
  if (p && !p.dead) viewpoints.push(p);
  if (p) {
    for (const e of game.entities || []) {
      if (e.bot && !e.dead && e.team === p.team) viewpoints.push(e);
    }
  }
  if (!viewpoints.length) return false;
  const now = performance.now();
  const key = fogKeyFor(game, viewpoints);
  if (key === fogKey && now - fogUpdatedAt < FOG_UPDATE_MS) return true;
  const tex = allocFogTexture();
  if (!tex) return false;
  fogKey = key;
  fogUpdatedAt = now;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fogFbo);
  gl.viewport(0, 0, mapW, mapH);
  gl.clearColor(2 / 255, 5 / 255, 9 / 255, 0.94);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  for (const v of viewpoints) drawFogFan(game, v);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gpuCanvas.width, gpuCanvas.height);
  gl.clearColor(20 / 255, 22 / 255, 26 / 255, 1);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
      : String(gl.getParameter(gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch (err) {
    return true;
  }
}

export function initRenderer2dGpu(canvas, layers) {
  disposeRenderer2dGpu();
  if (!canvas || !layers || !layers.staticLayer || typeof document === 'undefined') return false;
  try {
    hostCanvas = canvas;
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
    fogProgram = makeProgram(gl, FOG_VS, FOG_FS);
    quadBuffer = gl.createBuffer();
    fogBuffer = gl.createBuffer();
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
    fogFbo = null;
    decalRev = -1;
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
    if (fogBuffer) gl.deleteBuffer(fogBuffer);
    if (program) gl.deleteProgram(program);
    if (fogProgram) gl.deleteProgram(fogProgram);
    if (fogFbo) gl.deleteFramebuffer(fogFbo);
  }
  gl = null;
  hostCanvas = null;
  gpuCanvas = null;
  program = null;
  fogProgram = null;
  fogBuffer = null;
  fogFbo = null;
  quadBuffer = null;
  texStatic = null;
  texDecal = null;
  texShadow = null;
  texEntity = null;
  texFog = null;
  mapW = 0;
  mapH = 0;
  decalRev = -1;
  fogKey = '';
  fogUpdatedAt = 0;
}
