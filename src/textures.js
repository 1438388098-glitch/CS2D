import { TILE } from './config.js';
import { getMap } from './map.js';
const mapTile = () => getMap()?.tile || TILE;

// ===== 真实纹理素材（ambientCG CC0）=====
const TEX_SRC = {
  dust2: { floor: 'assets/textures/Ground054.jpg', wall: 'assets/textures/Rock064.jpg' },
  canal: { floor: 'assets/textures/PavingStones151.jpg', wall: 'assets/textures/Bricks097.jpg' },
  metro: { floor: 'assets/textures/Concrete034.jpg', wall: 'assets/textures/Metal063.jpg' },
  thin: 'assets/textures/Wood095.jpg'
};

const texCache = {};

export function preloadTextures() {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !document.createElement || typeof Image === 'undefined') {
      resolve(false);
      return;
    }
    const paths = new Set();
    for (const v of Object.values(TEX_SRC)) {
      if (typeof v === 'string') paths.add(v);
      else { paths.add(v.floor); paths.add(v.wall); }
    }
    const all = [...paths];
    let done = 0;
    let failed = false;
    for (const p of all) {
      const img = new Image();
      img.onload = () => { texCache[p] = img; done++; if (done === all.length) resolve(!failed); };
      img.onerror = () => { failed = true; done++; if (done === all.length) resolve(false); };
      img.src = p;
    }
  });
}

export function hasRealTextures() { return Object.keys(texCache).length > 0; }

function texImg(p) { return texCache[p] || null; }

// ===== 主题色板（程序化兜底 + 装饰/结构用色）=====
const THEMES = {
  dust2: { floor: [36, 39, 44], floorSpots: [90, 85, 75], wall: [90, 96, 104], wallSpots: [80, 86, 96], crate: [122, 90, 52], crateSpots: [110, 82, 44], water: [29, 74, 94], waterSpots: [50, 110, 160], mmWall: '#4d545e', mmCrate: '#6d5534', tint: null, deco: ['decoGrass', 'decoStone'] },
  canal: { floor: [44, 54, 52], floorSpots: [88, 102, 96], wall: [88, 102, 98], wallSpots: [74, 88, 84], crate: [106, 88, 64], crateSpots: [94, 78, 56], water: [23, 66, 88], waterSpots: [50, 110, 160], mmWall: '#4d645f', mmCrate: '#6d5c42', tint: null, deco: ['decoBarrel', 'decoPot'] },
  metro: { floor: [38, 40, 52], floorSpots: [82, 82, 102], wall: [70, 76, 96], wallSpots: [58, 64, 82], crate: [92, 84, 78], crateSpots: [76, 68, 62], water: [29, 74, 94], waterSpots: [50, 110, 160], mmWall: '#464c63', mmCrate: '#5f564f', tint: 'rgba(40,52,92,0.12)', deco: ['decoPipe', 'decoLamp'] }
};

// ===== 确定性 LCG（装饰物位置稳定）=====
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ===== 程序化纹理生成器（图片缺失兜底）=====
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function genFloorTex(th) {
  const c = mkCanvas(128, 128);
  const t = c.getContext('2d');
  t.fillStyle = 'rgb(' + th.floor.join(',') + ')';
  t.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = Math.random() * 0.35;
    t.fillStyle = 'rgba(' + (th.floor[0] + v * 30) + ',' + (th.floor[1] + v * 30) + ',' + (th.floor[2] + v * 30) + ',0.6)';
    t.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return c;
}

function genWallTex(th) {
  const c = mkCanvas(128, 128);
  const t = c.getContext('2d');
  t.fillStyle = 'rgb(' + th.wall.join(',') + ')';
  t.fillRect(0, 0, 128, 128);
  t.fillStyle = 'rgb(' + (th.wall[0] - 13) + ',' + (th.wall[1] - 13) + ',' + (th.wall[2] - 13) + ')';
  t.fillRect(0, 0, 128, 6);
  t.fillStyle = 'rgba(255,255,255,0.07)';
  t.fillRect(0, 6, 128, 3);
  t.fillStyle = 'rgba(0,0,0,0.28)';
  t.fillRect(0, 124, 128, 4);
  for (let i = 0; i < 400; i++) {
    const v = Math.random() * 0.5;
    t.fillStyle = 'rgba(' + (th.wallSpots[0] + v * 40) + ',' + (th.wallSpots[1] + v * 40) + ',' + (th.wallSpots[2] + v * 40) + ',0.5)';
    t.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
  }
  return c;
}

function genThinTex() {
  const c = mkCanvas(64, 64);
  const t = c.getContext('2d');
  t.fillStyle = 'rgba(120,116,110,0.75)';
  t.fillRect(0, 0, 64, 64);
  t.strokeStyle = 'rgba(60,58,54,0.9)';
  t.lineWidth = 2;
  for (let i = 0; i < 3; i++) { t.beginPath(); t.moveTo(0, i * 24 + 8); t.lineTo(64, i * 24 + 8); t.stroke(); }
  for (let i = 0; i < 6; i++) { t.beginPath(); t.moveTo(i * 18 + 6, 0); t.lineTo(i * 18 + 6, 14); t.stroke(); }
  t.strokeStyle = 'rgba(40,38,36,0.7)';
  t.beginPath(); t.moveTo(0, 60); t.lineTo(30, 28); t.lineTo(52, 52); t.stroke();
  return c;
}

function genWaterTex() {
  const c = mkCanvas(64, 64);
  const t = c.getContext('2d');
  t.fillStyle = 'rgb(29,74,94)';
  t.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 120; i++) {
    t.fillStyle = 'rgba(' + (50 + Math.random() * 60) + ',' + (110 + Math.random() * 50) + ',' + (160 + Math.random() * 50) + ',0.4)';
    t.fillRect(Math.random() * 64, Math.random() * 64, 4, 2);
  }
  t.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 6; i++) t.fillRect(0, Math.random() * 64, 64, 1);
  return c;
}

function genDeepWaterTex() {
  const c = mkCanvas(64, 64);
  const t = c.getContext('2d');
  t.fillStyle = '#12304a';
  t.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) {
    t.fillStyle = 'rgba(' + (40 + Math.random() * 50) + ',' + (90 + Math.random() * 60) + ',' + (150 + Math.random() * 50) + ',0.35)';
    t.fillRect(Math.random() * 64, Math.random() * 64, 3, 1);
  }
  return c;
}

function genPlatformTex() {
  const c = mkCanvas(64, 64);
  const t = c.getContext('2d');
  t.fillStyle = '#3a3f46';
  t.fillRect(0, 0, 64, 64);
  t.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 6; i++) t.fillRect(0, i * 12, 64, 2);
  t.fillStyle = 'rgba(0,0,0,0.5)';
  t.fillRect(0, 60, 64, 4);
  return c;
}

function genBarrelTex() {
  const c = mkCanvas(48, 48);
  const t = c.getContext('2d');
  t.fillStyle = '#8a2f22';
  t.beginPath(); t.arc(24, 24, 18, 0, Math.PI * 2); t.fill();
  t.fillStyle = '#b8462f';
  t.beginPath(); t.arc(24, 24, 13, 0, Math.PI * 2); t.fill();
  t.fillStyle = 'rgba(255,255,255,0.25)';
  t.fillRect(20, 8, 8, 4);
  t.strokeStyle = 'rgba(60,20,14,0.9)';
  t.lineWidth = 2;
  t.beginPath(); t.arc(24, 24, 18, 0, Math.PI * 2); t.stroke();
  return c;
}

// ===== 装饰物（确定性散布，烘焙进 staticLayer）=====
function drawDeco(t, kind, px, py, rnd) {
  t.save();
  switch (kind) {
    case 'decoGrass': { // 枯草簇
      t.strokeStyle = 'rgba(140,120,70,0.55)';
      t.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const gx = px + 4 + rnd() * 20;
        const gy = py + 26 - rnd() * 4;
        t.beginPath();
        t.moveTo(gx, gy);
        t.quadraticCurveTo(gx + rnd() * 6 - 3, gy - 8, gx + rnd() * 8 - 4, gy - 12 - rnd() * 6);
        t.stroke();
      }
      break;
    }
    case 'decoStone': { // 碎石
      t.fillStyle = 'rgba(110,105,98,0.5)';
      for (let i = 0; i < 3; i++) {
        t.beginPath();
        t.ellipse(px + 5 + rnd() * 20, py + 8 + rnd() * 16, 2.5 + rnd() * 2, 1.8 + rnd() * 1.5, rnd() * 3, 0, Math.PI * 2);
        t.fill();
      }
      break;
    }
    case 'decoBarrel': { // 小木桶
      t.fillStyle = 'rgba(122,90,52,0.75)';
      t.beginPath(); t.ellipse(px + 15, py + 20, 7, 6, 0, 0, Math.PI * 2); t.fill();
      t.strokeStyle = 'rgba(70,50,28,0.7)';
      t.lineWidth = 1.5;
      t.stroke();
      t.strokeStyle = 'rgba(60,44,26,0.8)';
      t.beginPath(); t.moveTo(px + 8, py + 20); t.lineTo(px + 22, py + 20); t.stroke();
      break;
    }
    case 'decoPot': { // 花盆
      t.fillStyle = 'rgba(150,90,55,0.8)';
      t.beginPath();
      t.moveTo(px + 11, py + 26); t.lineTo(px + 19, py + 26); t.lineTo(px + 17, py + 15); t.lineTo(px + 13, py + 15);
      t.closePath(); t.fill();
      t.strokeStyle = 'rgba(40,90,40,0.7)';
      t.lineWidth = 1.5;
      t.beginPath(); t.moveTo(px + 15, py + 15); t.quadraticCurveTo(px + 15, py + 6, px + 12, py + 5); t.stroke();
      break;
    }
    case 'decoPipe': { // 管道段
      t.strokeStyle = 'rgba(150,155,165,0.7)';
      t.lineWidth = 4;
      t.beginPath(); t.moveTo(px + 2, py + 26); t.lineTo(px + 28, py + 26); t.stroke();
      t.strokeStyle = 'rgba(60,64,74,0.8)';
      t.lineWidth = 1;
      t.beginPath(); t.moveTo(px + 9, py + 26); t.lineTo(px + 9, py + 30); t.stroke();
      break;
    }
    case 'decoLamp': { // 灯柱
      t.strokeStyle = 'rgba(70,75,85,0.85)';
      t.lineWidth = 2.5;
      t.beginPath(); t.moveTo(px + 15, py + 30); t.lineTo(px + 15, py + 8); t.stroke();
      t.fillStyle = 'rgba(255,220,140,0.55)';
      t.beginPath(); t.arc(px + 15, py + 6, 2.6, 0, Math.PI * 2); t.fill();
      break;
    }
  }
  t.restore();
}

// ===== 主入口 =====
export function initTextures(map) {
  const W = map.W, H = map.H;
  const th = THEMES[map.id] || THEMES.dust2;
  const grid = map.grid;
  const rnd = lcg(map.seed);

  // 纹理选择：真实素材优先，缺失降级程序化
  const real = {
    floor: texImg(TEX_SRC[map.id] ? TEX_SRC[map.id].floor : null),
    wall: texImg(TEX_SRC[map.id] ? TEX_SRC[map.id].wall : null),
    thin: texImg(TEX_SRC.thin)
  };

  const floorTex = real.floor || genFloorTex(th);
  const wallTex = real.wall || genWallTex(th);
  const thinWallTex = real.thin || genThinTex();
  const waterTex = genWaterTex();
  const deepWaterTex = genDeepWaterTex();
  const platformTex = genPlatformTex();
  const crateTex = real.thin || genThinTex(); // 木箱用木纹
  const barrelTex = genBarrelTex();

  const staticLayer = mkCanvas(W, H);
  const decalLayer = mkCanvas(W, H);
  const miniMap = mkCanvas(480, 360);
  const mmScale = 480 / W;

  {
    const t = staticLayer.getContext('2d');
    // 1. 地板平铺
    const pat = t.createPattern(floorTex, 'repeat');
    t.fillStyle = pat;
    t.fillRect(0, 0, W, H);
    // 2. 瓦片遍历：结构物件 + 伪立体微调
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const c = grid[y][x];
        const px = x * mapTile(), py = y * mapTile();
        if (c === 'a' || c === 'b') {
          t.fillStyle = c === 'a' ? 'rgba(255,120,70,0.16)' : 'rgba(70,150,255,0.16)';
          t.fillRect(px, py, mapTile(), mapTile());
        }
        if (c === '#') {
          t.drawImage(wallTex, px, py, mapTile(), mapTile());
          // 伪立体：顶部亮 顶部高光、底部阴影
          t.fillStyle = 'rgba(255,255,255,0.10)';
          t.fillRect(px, py, mapTile(), 2);
          t.fillStyle = 'rgba(0,0,0,0.30)';
          t.fillRect(px, py + mapTile() - 4, mapTile(), 4);
        }
        if (c === 'C') {
          t.drawImage(crateTex, px, py, mapTile(), mapTile());
          t.fillStyle = 'rgba(0,0,0,0.35)';
          t.fillRect(px, py + mapTile() - 3, mapTile(), 3);
        }
        if (c === '~') t.drawImage(waterTex, px, py, mapTile(), mapTile());
        if (c === '=') t.drawImage(thinWallTex, px, py, mapTile(), mapTile());
        if (c === '≈') t.drawImage(deepWaterTex, px, py, mapTile(), mapTile());
        if (c === '^') {
          t.drawImage(platformTex, px, py, mapTile(), mapTile());
          // 升台立体：顶面亮条 + 侧面渐变 + 底部投影
          t.fillStyle = 'rgba(255,255,255,0.16)';
          t.fillRect(px + 2, py + 2, mapTile() - 4, 3);
          const g = t.createLinearGradient(0, py + mapTile() - 8, 0, py + mapTile());
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(0,0,0,0.5)');
          t.fillStyle = g;
          t.fillRect(px, py + mapTile() - 8, mapTile(), 8);
        }
        if (c === 'o') {
          // 油桶：瓦片 3/4 大小 + 高光 + 警示条 + 投影
          const ox = px + 3, oy = py + 3, os = mapTile() * 0.8;
          t.fillStyle = 'rgba(0,0,0,0.4)';
          t.beginPath();
          t.ellipse(ox + os / 2, oy + os - 3, os * 0.42, os * 0.14, 0, 0, Math.PI * 2);
          t.fill();
          t.drawImage(barrelTex, ox, oy, os, os);
          t.fillStyle = 'rgba(255,255,255,0.22)';
          t.beginPath(); t.ellipse(ox + os * 0.35, oy + os * 0.32, os * 0.16, os * 0.10, -0.5, 0, Math.PI * 2); t.fill();
          t.strokeStyle = 'rgba(220,180,40,0.8)';
          t.lineWidth = 2;
          t.strokeRect(ox + os * 0.18, oy + os * 0.55, os * 0.64, os * 0.12);
        }
      }
    }
    // 3. 材质边缘系统：不同材质交界画轮廓（墙基、水岸、高台侧、薄墙框）
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const c = grid[y][x];
        const px = x * mapTile(), py = y * mapTile();
        const nb = {
          u: y > 0 ? grid[y - 1][x] : '#',
          d: y < grid.length - 1 ? grid[y + 1][x] : '#',
          l: x > 0 ? grid[y][x - 1] : '#',
          r: x < grid[y].length - 1 ? grid[y][x + 1] : '#'
        };
        const isSolid = (ch) => ch === '#' || ch === '=' || ch === '^' || ch === 'o' || ch === 'C';
        const isWater = (ch) => ch === '~' || ch === '≈';
        // 墙基阴影：实体瓦片与地板交界
        if ((c === '#' || c === 'C') && !isSolid(nb.d)) {
          t.fillStyle = 'rgba(0,0,0,0.45)';
          t.fillRect(px, py + mapTile() - 2, mapTile(), 2);
        }
        // 水岸线：水与陆地交界（画在水侧）
        if (isWater(c) && !isWater(nb.d)) {
          t.fillStyle = 'rgba(200,230,255,0.35)';
          t.fillRect(px, py + mapTile() - 3, mapTile(), 3);
        }
        if (isWater(c) && !isWater(nb.u)) {
          t.fillStyle = 'rgba(255,255,255,0.18)';
          t.fillRect(px, py, mapTile(), 1);
        }
        // 薄墙框架：外框深色线（辨识木板墙）
        if (c === '=') {
          t.strokeStyle = 'rgba(45,42,38,0.75)';
          t.lineWidth = 1.5;
          t.strokeRect(px + 0.5, py + 0.5, mapTile() - 1, mapTile() - 1);
        }
        // 高台与地板交界
        if (c === '^' && !isSolid(nb.d)) {
          t.fillStyle = 'rgba(0,0,0,0.5)';
          t.fillRect(px, py + mapTile() - 3, mapTile(), 3);
        }
      }
    }
    // 4. 光照烘焙
    // 4a. 墙影投射增强（墙下方 8px 渐变投影）
    for (let y = 1; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === '#') {
          const g = t.createLinearGradient(0, y * mapTile() + mapTile() - 4, 0, y * mapTile() + mapTile() + 6);
          g.addColorStop(0, 'rgba(0,0,0,0.28)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          t.fillStyle = g;
          t.fillRect(x * mapTile(), y * mapTile() + mapTile() - 4, mapTile(), 10);
        }
      }
    }
    // 4b. 地图边缘暗角
    const vg = 60;
    const gradT = t.createLinearGradient(0, 0, 0, vg);
    gradT.addColorStop(0, 'rgba(0,0,0,0.42)');
    gradT.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = gradT;
    t.fillRect(0, 0, W, vg);
    const gradB = t.createLinearGradient(0, H - vg, 0, H);
    gradB.addColorStop(0, 'rgba(0,0,0,0)');
    gradB.addColorStop(1, 'rgba(0,0,0,0.42)');
    t.fillStyle = gradB;
    t.fillRect(0, H - vg, W, vg);
    const gradL = t.createLinearGradient(0, 0, vg, 0);
    gradL.addColorStop(0, 'rgba(0,0,0,0.38)');
    gradL.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = gradL;
    t.fillRect(0, 0, vg, H);
    const gradR = t.createLinearGradient(W - vg, 0, W, 0);
    gradR.addColorStop(0, 'rgba(0,0,0,0)');
    gradR.addColorStop(1, 'rgba(0,0,0,0.38)');
    t.fillStyle = gradR;
    t.fillRect(W - vg, 0, vg, H);
    // 4c. 主题色染（metro 冷调）
    if (th.tint) {
      t.fillStyle = th.tint;
      t.fillRect(0, 0, W, H);
    }
    // 5. 装饰物（确定性，仅空地，限 16 个）
    let placed = 0;
    let guard = 0;
    while (placed < 16 && guard < 800) {
      guard++;
      const dx = Math.floor(rnd() * (grid[0].length - 4)) + 2;
      const dy = Math.floor(rnd() * (grid.length - 4)) + 2;
      const dc = grid[dy][dx];
      if (dc !== '.') continue;
      if (rnd() > 0.5) continue;
      const kind = th.deco[Math.floor(rnd() * th.deco.length)];
      drawDeco(t, kind, dx * mapTile(), dy * mapTile(), rnd);
      placed++;
    }
    // 6. 站点标记（色带 + 大字 + 边框增强辨识）
    const sites = map.sites;
    t.font = '900 150px Arial';
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    if (sites.A) {
      t.fillStyle = 'rgba(255,120,70,0.18)';
      t.fillText('A', sites.A.cx, sites.A.cy);
      t.strokeStyle = 'rgba(255,140,80,0.5)';
      t.lineWidth = 5;
      t.strokeRect(sites.A.x0 + 20, sites.A.y0 + 20, sites.A.x1 - sites.A.x0 - 40, sites.A.y1 - sites.A.y0 - 40);
    }
    if (sites.B) {
      t.fillStyle = 'rgba(70,150,255,0.18)';
      t.fillText('B', sites.B.cx, sites.B.cy);
      t.strokeStyle = 'rgba(90,160,255,0.5)';
      t.lineWidth = 5;
      t.strokeRect(sites.B.x0 + 20, sites.B.y0 + 20, sites.B.x1 - sites.B.x0 - 40, sites.B.y1 - sites.B.y0 - 40);
    }
  }

  {
    const t = miniMap.getContext('2d');
    t.fillStyle = 'rgba(16,19,23,0.92)';
    t.fillRect(0, 0, 480, 360);
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const c = grid[y][x];
        if (c === '#') {
          t.fillStyle = th.mmWall;
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === 'C') {
          t.fillStyle = th.mmCrate;
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === '~') {
          t.fillStyle = '#1d4a6e';
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === '=') {
          t.fillStyle = 'rgba(168,162,154,0.9)';
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === '≈') {
          t.fillStyle = '#0d2740';
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === '^') {
          t.fillStyle = '#6a7280';
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === 'o') {
          t.fillStyle = '#c05030';
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === 'a' || c === 'b') {
          t.fillStyle = c === 'a' ? 'rgba(255,120,70,0.30)' : 'rgba(70,150,255,0.30)';
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        }
      }
    }
    for (const key of ['A', 'B']) {
      const ss = map.sites[key];
      if (!ss) continue;
      t.strokeStyle = key === 'A' ? 'rgba(255,140,80,0.85)' : 'rgba(90,160,255,0.85)';
      t.lineWidth = 1.4;
      t.strokeRect(ss.x0 * mmScale, ss.y0 * mmScale, (ss.x1 - ss.x0) * mmScale, (ss.y1 - ss.y0) * mmScale);
    }
  }

  return {
    W, H,
    floorTex, wallTex, crateTex, waterTex,
    thinWallTex, deepWaterTex, platformTex, barrelTex,
    staticLayer, decalLayer, miniMap, mmScale,
    decal: decalLayer
  };
}
