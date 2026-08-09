// render3d-gl.js — 第一人称渲染的 WebGL 后端（GPU 光栅化）
// CPU 只做 DDA 几何与 zbuf（sprite 遮挡数据），墙列/地板行/地面四边形/天空全部提交 GPU 批量光栅化。
// 每帧仅 ~6 次 draw call（天空 1 + 地板 1 + 四边形 1 + 墙按纹理分组 ≤4），1080P 下 GPU 并行处理。
// WebGL 不可用（老环境/无 GPU/stubdom 测试）时由 render3d.js 回退 Canvas 2D 像素直写。
import { clamp } from './utils.js';

let gl = null;
let glcv = null;
let curW = 0, curH = 0;

let progWall = null, progFloor = null, progSky = null, progQuad = null;

// 顶点缓冲（每帧重建内容，Float32Array 复用避免分配）
const MAX_WALLS = 4096;   // 1920 列 × 1 quad
const MAX_FLOOR = 1200;   // 行条带（ih/2 × 2 面 + 余量）
const MAX_QUADS = 1024;   // 地面四边形（三角扇顶点）

let wallArr = null, wallBuf = null, wallN = 0;
let floorArr = null, floorBuf = null, floorN = 0;
let quadArr = null, quadBuf = null, quadN = 0;
let skyArr = null, skyBuf = null;

let wallTexRefs = [];
let texMap = null;        // canvas/Image → WebGLTexture
let skyTex = null, skyTexKey = null, skyTexW = 0, skyTexH = 0; // 天空纹理缓存

function compile(glc, vsSrc, fsSrc) {
  const vs = glc.createShader(glc.VERTEX_SHADER);
  glc.shaderSource(vs, vsSrc);
  glc.compileShader(vs);
  if (!glc.getShaderParameter(vs, glc.COMPILE_STATUS)) throw new Error('vs: ' + glc.getShaderInfoLog(vs));
  const fs = glc.createShader(glc.FRAGMENT_SHADER);
  glc.shaderSource(fs, fsSrc);
  glc.compileShader(fs);
  if (!glc.getShaderParameter(fs, glc.COMPILE_STATUS)) throw new Error('fs: ' + glc.getShaderInfoLog(fs));
  const p = glc.createProgram();
  glc.attachShader(p, vs);
  glc.attachShader(p, fs);
  glc.linkProgram(p);
  if (!glc.getProgramParameter(p, glc.LINK_STATUS)) throw new Error('link: ' + glc.getProgramInfoLog(p));
  return p;
}

function buildPrograms(glc) {
  // —— 墙：纹理 × shade + 站点色带（band = vec4 rgb+强度）——
  progWall = compile(glc, `
attribute vec2 aPos;
attribute vec2 aUv;
attribute float aShade;
attribute float aZ;
attribute vec4 aBand;
uniform vec2 uRes;
varying vec2 vUv;
varying float vShade;
varying vec4 vBand;
void main() {
  vUv = aUv;
  vShade = aShade;
  vBand = aBand;
  vec2 ndc = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, aZ, 1.0);
}`, `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
varying float vShade;
varying vec4 vBand;
void main() {
  vec4 c = texture2D(uTex, vUv);
  vec3 col = c.rgb * vShade;
  col = col * (1.0 - vBand.a) + vBand.rgb * vBand.a;
  gl_FragColor = vec4(col, 1.0);
}`);

  // —— 地板/天花板：透视校正 uv（w=rowDist，GPU 按 1/w 插值）——
  progFloor = compile(glc, `
attribute vec2 aPos;
attribute vec2 aUv;
attribute float aW;
attribute float aZ;
attribute float aShade;
uniform vec2 uRes;
varying vec2 vUv;
varying float vShade;
void main() {
  vUv = aUv;
  vShade = aShade;
  vec2 ndc = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(ndc * aW, aZ * aW, aW);
}`, `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
varying float vShade;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb * vShade, 1.0);
}`);

  // —— 天空：全屏贴纹理（z=1 最远）——
  progSky = compile(glc, `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec2 ndc = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 1.0, 1.0);
}`, `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}`);

  // —— 地面四边形：顶点色渐变 + alpha + 顶点深度 ——
  progQuad = compile(glc, `
attribute vec2 aPos;
attribute vec3 aCol;
attribute float aAlpha;
attribute float aZ;
uniform vec2 uRes;
varying vec3 vCol;
varying float vAlpha;
void main() {
  vCol = aCol;
  vAlpha = aAlpha;
  vec2 ndc = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, aZ, 1.0);
}`, `
precision mediump float;
varying vec3 vCol;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(vCol, vAlpha);
}`);
}

function isPow2(v) { return (v & (v - 1)) === 0 && v > 0; }

// 纹理上传（canvas/Image；NPOT 素材缩放到 128 POT 以保证 REPEAT 合法）
function texFor(src) {
  if (!src || !src.width || !src.height) return null;
  if (!texMap) texMap = new Map();
  let t = texMap.get(src);
  if (t) return t;
  try {
    let upload = src;
    let w = src.width, h = src.height;
    if (!isPow2(w) || !isPow2(h)) {
      const c = document.createElement('canvas');
      w = 128; h = 128;
      c.width = w; c.height = h;
      const tc = c.getContext('2d');
      tc.drawImage(src, 0, 0, w, h);
      upload = c;
    }
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    texMap.set(src, t);
    return t;
  } catch (e) {
    return null;
  }
}

// 天空纹理（缓存 key=canvas 对象+尺寸；内容静态，避免每帧重新上传）
function skyTextureFor(skyCanvas, key) {
  if (!skyCanvas || !skyCanvas.width) return null;
  if (skyTex && skyTexKey === key && skyTexW === skyCanvas.width && skyTexH === skyCanvas.height) return skyTex;
  if (skyTex) { gl.deleteTexture(skyTex); skyTex = null; }
  try {
    skyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skyCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    skyTexKey = key;
    skyTexW = skyCanvas.width;
    skyTexH = skyCanvas.height;
    return skyTex;
  } catch (e) {
    return null;
  }
}

// —— 公开 API ——

export function initGL3d(w, h) {
  try {
    glcv = document.createElement('canvas');
    glcv.width = Math.max(2, w);
    glcv.height = Math.max(2, h);
    // preserveDrawingBuffer: true 关键——离屏 GL 缓冲需在 drawImage(glcv) 读取前保留，
    // 否则默认在帧末被清空导致主画面残缺（"很多东西不见了"的根因）；
    // premultipliedAlpha: false——渲染像素未预乘，避免颜色偏差
    gl = glcv.getContext('webgl', { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
      || glcv.getContext('experimental-webgl', { alpha: false, antialias: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) { gl = null; return false; }
    curW = glcv.width; curH = glcv.height;
    wallArr = new Float32Array(MAX_WALLS * 4 * 10);  // pos2 uv2 shade1 z1 band4
    wallBuf = gl.createBuffer();
    floorArr = new Float32Array(MAX_FLOOR * 4 * 7);  // pos2 uv2 w1 z1 shade1
    floorBuf = gl.createBuffer();
    quadArr = new Float32Array(MAX_QUADS * 3 * 7);   // 三角扇：每三角形 3 顶点 × pos2 col3 alpha1 z1
    quadBuf = gl.createBuffer();
    skyArr = new Float32Array(4 * 4);                // pos2 uv2
    skyBuf = gl.createBuffer();
    wallTexRefs = [];
    texMap = new Map();
    skyTex = null; skyTexKey = null;
    buildPrograms(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    return true;
  } catch (e) {
    gl = null;
    return false;
  }
}

export function gl3dReady() { return !!gl; }
export function gl3dCanvas() { return glcv; }

export function glResize(w, h) {
  if (!gl) return false;
  if (glcv.width === w && glcv.height === h) return true;
  glcv.width = Math.max(2, w);
  glcv.height = Math.max(2, h);
  curW = glcv.width; curH = glcv.height;
  return true;
}

export function gl3dDispose() {
  gl = null;
  glcv = null;
}

export function glBegin(F) {
  if (!gl) return;
  wallN = 0; floorN = 0; quadN = 0;
  gl.viewport(0, 0, curW, curH);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.BLEND);
}

// 天空：全屏 quad（z=1 最远）
export function glSky(F, skyCanvas2d, key) {
  if (!gl) return;
  const t = skyTextureFor(skyCanvas2d, key);
  if (!t) return;
  skyArr[0] = 0; skyArr[1] = 0; skyArr[2] = 0; skyArr[3] = 0;
  skyArr[4] = F.iw; skyArr[5] = 0; skyArr[6] = 1; skyArr[7] = 0;
  skyArr[8] = 0; skyArr[9] = F.ih; skyArr[10] = 0; skyArr[11] = 1;
  skyArr[12] = F.iw; skyArr[13] = F.ih; skyArr[14] = 1; skyArr[15] = 1;
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, skyArr, gl.DYNAMIC_DRAW);
  gl.useProgram(progSky);
  const aPos = gl.getAttribLocation(progSky, 'aPos');
  const aUv = gl.getAttribLocation(progSky, 'aUv');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
  gl.uniform2f(gl.getUniformLocation(progSky, 'uRes'), F.iw, F.ih);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.uniform1i(gl.getUniformLocation(progSky, 'uTex'), 0);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// 地板/天花板行：2px 高 quad，透视校正 uv（调用方传世界纹理坐标，REPEAT 自动 wrap）
export function glFloorRow(F, y, rowDist, u0, v0, du, dv, shade) {
  if (!gl || floorN >= MAX_FLOOR) return;
  const o = floorN * 28;
  const y2 = y + 2;
  const z = clamp(rowDist / F.fogMax, 0, 1);
  const u1 = u0 + du * F.iw, v1 = v0 + dv * F.iw;
  floorArr[o] = 0; floorArr[o + 1] = y; floorArr[o + 2] = u0; floorArr[o + 3] = v0;
  floorArr[o + 4] = rowDist; floorArr[o + 5] = z; floorArr[o + 6] = shade;
  floorArr[o + 7] = F.iw; floorArr[o + 8] = y; floorArr[o + 9] = u1; floorArr[o + 10] = v1;
  floorArr[o + 11] = rowDist; floorArr[o + 12] = z; floorArr[o + 13] = shade;
  floorArr[o + 14] = 0; floorArr[o + 15] = y2; floorArr[o + 16] = u0; floorArr[o + 17] = v0;
  floorArr[o + 18] = rowDist; floorArr[o + 19] = z; floorArr[o + 20] = shade;
  floorArr[o + 21] = F.iw; floorArr[o + 22] = y2; floorArr[o + 23] = u1; floorArr[o + 24] = v1;
  floorArr[o + 25] = rowDist; floorArr[o + 26] = z; floorArr[o + 27] = shade;
  floorN++;
}

// 墙列：1px 宽 quad（uv 垂直线性、u 固定；带 shade/z/站点色带）
export function glWallColumn(F, col, d, yTop, yBottom, tex, texU, srcY, srcH, shade, bandMix, bandCol) {
  if (!gl || wallN >= MAX_WALLS || !tex || !tex.width) return;
  const o = wallN * 40;
  const z = clamp(d / F.fogMax, 0, 1);
  const u = (texU + 0.5) / tex.width;
  const v0 = (srcY + 0.5) / tex.height;
  const v1 = (srcY + srcH - 0.5) / tex.height;
  const y0 = Math.max(0, yTop);
  const y1 = Math.min(F.ih, yBottom);
  const bm = bandMix > 0.004 && bandCol ? bandMix : 0;
  const br = bm > 0 ? bandCol[0] / 255 : 0;
  const bg = bm > 0 ? bandCol[1] / 255 : 0;
  const bb = bm > 0 ? bandCol[2] / 255 : 0;
  const x0 = col, x1 = col + 1;
  wallArr[o] = x0; wallArr[o + 1] = y0; wallArr[o + 2] = u; wallArr[o + 3] = v0;
  wallArr[o + 4] = shade; wallArr[o + 5] = z; wallArr[o + 6] = br; wallArr[o + 7] = bg; wallArr[o + 8] = bb; wallArr[o + 9] = bm;
  wallArr[o + 10] = x0; wallArr[o + 11] = y1; wallArr[o + 12] = u; wallArr[o + 13] = v1;
  wallArr[o + 14] = shade; wallArr[o + 15] = z; wallArr[o + 16] = br; wallArr[o + 17] = bg; wallArr[o + 18] = bb; wallArr[o + 19] = bm;
  wallArr[o + 20] = x1; wallArr[o + 21] = y0; wallArr[o + 22] = u; wallArr[o + 23] = v0;
  wallArr[o + 24] = shade; wallArr[o + 25] = z; wallArr[o + 26] = br; wallArr[o + 27] = bg; wallArr[o + 28] = bb; wallArr[o + 29] = bm;
  wallArr[o + 30] = x1; wallArr[o + 31] = y1; wallArr[o + 32] = u; wallArr[o + 33] = v1;
  wallArr[o + 34] = shade; wallArr[o + 35] = z; wallArr[o + 36] = br; wallArr[o + 37] = bg; wallArr[o + 38] = bb; wallArr[o + 39] = bm;
  if (wallTexRefs.length <= wallN) wallTexRefs.push(tex);
  else wallTexRefs[wallN] = tex;
  wallN++;
}

// 地面四边形：三角扇（顶点带深度 z 用于遮挡）
export function glGroundQuad(F, pts, depths, cTop, cBottom, alpha) {
  if (!gl || !pts || pts.length < 3 || quadN >= MAX_QUADS) return;
  const pushTri = (ai, bi, ci) => {
    if (quadN >= MAX_QUADS) return;
    let o = quadN * 21;
    for (const idx of [ai, bi, ci]) {
      const p = pts[idx];
      const t = idx === 0 ? 0 : 1; // 顶点颜色：第一个顶点取 cTop，其余取 cBottom（视觉渐变近似）
      const r = (cTop[0] + (cBottom[0] - cTop[0]) * t);
      const g = (cTop[1] + (cBottom[1] - cTop[1]) * t);
      const b = (cTop[2] + (cBottom[2] - cTop[2]) * t);
      quadArr[o] = p[0]; quadArr[o + 1] = p[1];
      quadArr[o + 2] = r; quadArr[o + 3] = g; quadArr[o + 4] = b;
      quadArr[o + 5] = alpha;
      quadArr[o + 6] = clamp(depths[idx] / F.fogMax, 0, 1);
      o += 7;
    }
    quadN++;
  };
  for (let i = 1; i < pts.length - 1; i++) pushTri(0, i, i + 1);
}

// 每帧结束：批量提交（顺序 天空已在 glSky 画 → 地板 → 四边形 → 墙，后画近者覆盖）
export function glFlush(F) {
  if (!gl) return;
  // 地板
  if (floorN > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, floorArr.subarray(0, floorN * 28), gl.DYNAMIC_DRAW);
    gl.useProgram(progFloor);
    const stride = 28;
    gl.enableVertexAttribArray(gl.getAttribLocation(progFloor, 'aPos'));
    gl.vertexAttribPointer(gl.getAttribLocation(progFloor, 'aPos'), 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(progFloor, 'aUv'));
    gl.vertexAttribPointer(gl.getAttribLocation(progFloor, 'aUv'), 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(gl.getAttribLocation(progFloor, 'aW'));
    gl.vertexAttribPointer(gl.getAttribLocation(progFloor, 'aW'), 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(gl.getAttribLocation(progFloor, 'aZ'));
    gl.vertexAttribPointer(gl.getAttribLocation(progFloor, 'aZ'), 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(gl.getAttribLocation(progFloor, 'aShade'));
    gl.vertexAttribPointer(gl.getAttribLocation(progFloor, 'aShade'), 1, gl.FLOAT, false, stride, 24);
    gl.uniform2f(gl.getUniformLocation(progFloor, 'uRes'), F.iw, F.ih);
    const ft = F.layers && F.layers.floorTex;
    const tex = texFor(ft);
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(progFloor, 'uTex'), 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, floorN * 4);
    }
  }
  // 四边形（blend）
  if (quadN > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadArr.subarray(0, quadN * 21), gl.DYNAMIC_DRAW);
    gl.useProgram(progQuad);
    const stride = 28;
    gl.enableVertexAttribArray(gl.getAttribLocation(progQuad, 'aPos'));
    gl.vertexAttribPointer(gl.getAttribLocation(progQuad, 'aPos'), 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(progQuad, 'aCol'));
    gl.vertexAttribPointer(gl.getAttribLocation(progQuad, 'aCol'), 3, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(gl.getAttribLocation(progQuad, 'aAlpha'));
    gl.vertexAttribPointer(gl.getAttribLocation(progQuad, 'aAlpha'), 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(gl.getAttribLocation(progQuad, 'aZ'));
    gl.vertexAttribPointer(gl.getAttribLocation(progQuad, 'aZ'), 1, gl.FLOAT, false, stride, 24);
    gl.uniform2f(gl.getUniformLocation(progQuad, 'uRes'), F.iw, F.ih);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, quadN * 3);
  }
  // 墙（按纹理分组，后画近者覆盖）
  if (wallN > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, wallBuf);
    gl.bufferData(gl.ARRAY_BUFFER, wallArr.subarray(0, wallN * 40), gl.DYNAMIC_DRAW);
    gl.useProgram(progWall);
    const stride = 40;
    gl.enableVertexAttribArray(gl.getAttribLocation(progWall, 'aPos'));
    gl.vertexAttribPointer(gl.getAttribLocation(progWall, 'aPos'), 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(progWall, 'aUv'));
    gl.vertexAttribPointer(gl.getAttribLocation(progWall, 'aUv'), 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(gl.getAttribLocation(progWall, 'aShade'));
    gl.vertexAttribPointer(gl.getAttribLocation(progWall, 'aShade'), 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(gl.getAttribLocation(progWall, 'aZ'));
    gl.vertexAttribPointer(gl.getAttribLocation(progWall, 'aZ'), 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(gl.getAttribLocation(progWall, 'aBand'));
    gl.vertexAttribPointer(gl.getAttribLocation(progWall, 'aBand'), 4, gl.FLOAT, false, stride, 24);
    gl.uniform2f(gl.getUniformLocation(progWall, 'uRes'), F.iw, F.ih);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    let i = 0;
    while (i < wallN) {
      const ref = wallTexRefs[i] || (F.layers && F.layers.wallTex);
      const tex = texFor(ref);
      if (tex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(progWall, 'uTex'), 0);
      }
      let j = i;
      while (j < wallN && (wallTexRefs[j] || ref) === ref) j++;
      gl.drawArrays(gl.TRIANGLE_STRIP, i * 4, (j - i) * 4);
      i = j;
    }
  }
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
}
