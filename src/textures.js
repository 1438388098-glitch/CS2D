import { TILE } from './config.js';
import { getMap } from './map.js';

// 地图主题色板（floor/wall/crate/water 基础色 + 噪点色 + 小地图色）
const THEMES = {
  dust2: { floor: [36, 39, 44], floorSpots: [90, 85, 75], wall: [90, 96, 104], wallSpots: [80, 86, 96], crate: [122, 90, 52], crateSpots: [110, 82, 44], water: [29, 74, 94], waterSpots: [50, 110, 160], mmWall: '#4d545e', mmCrate: '#6d5534' },
  canal: { floor: [44, 54, 52], floorSpots: [88, 102, 96], wall: [88, 102, 98], wallSpots: [74, 88, 84], crate: [106, 88, 64], crateSpots: [94, 78, 56], water: [23, 66, 88], waterSpots: [50, 110, 160], mmWall: '#4d645f', mmCrate: '#6d5c42' },
  metro: { floor: [38, 40, 52], floorSpots: [82, 82, 102], wall: [70, 76, 96], wallSpots: [58, 64, 82], crate: [92, 84, 78], crateSpots: [76, 68, 62], water: [29, 74, 94], waterSpots: [50, 110, 160], mmWall: '#464c63', mmCrate: '#5f564f' }
};

export function initTextures(map) {
  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const W = map.W, H = map.H;
  const th = THEMES[map.id] || THEMES.dust2;
  const rgb = (a) => a[0] + ',' + a[1] + ',' + a[2];
  const bright = (a, v) => [a[0] + v, a[1] + v, a[2] + v];

  const floorTex = mk(128, 128);
  {
    const t = floorTex.getContext('2d');
    t.fillStyle = 'rgb(' + rgb(th.floor) + ')';
    t.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = Math.random() * 0.35;
      t.fillStyle = 'rgba(' + rgb(bright(th.floor, v * 30)) + ',0.6)';
      t.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    for (let i = 0; i < 60; i++) {
      const v = Math.random() * 0.3;
      t.fillStyle = 'rgba(' + rgb(bright(th.floorSpots, v * 40)) + ',0.25)';
      t.fillRect(Math.random() * 128, Math.random() * 128, 5, 3);
    }
    t.fillStyle = 'rgba(255,255,255,0.012)';
    for (let g = 0; g < 128; g += 32) { t.fillRect(0, g, 128, 1); t.fillRect(g, 0, 1, 128); }
  }

  const wallTex = mk(128, 128);
  {
    const t = wallTex.getContext('2d');
    t.fillStyle = 'rgb(' + rgb(th.wall) + ')';
    t.fillRect(0, 0, 128, 128);
    t.fillStyle = 'rgb(' + rgb(bright(th.wall, -13)) + ')';
    t.fillRect(0, 0, 128, 6);
    t.fillStyle = 'rgba(255,255,255,0.07)';
    t.fillRect(0, 6, 128, 3);
    t.fillStyle = 'rgba(0,0,0,0.28)';
    t.fillRect(0, 124, 128, 4);
    for (let i = 0; i < 400; i++) {
      const v = Math.random() * 0.5;
      t.fillStyle = 'rgba(' + rgb(bright(th.wallSpots, v * 40)) + ',0.5)';
      t.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
    }
    t.strokeStyle = 'rgba(0,0,0,0.18)';
    t.lineWidth = 1;
    for (let g = 16; g < 128; g += 16) { t.beginPath(); t.moveTo(g, 0); t.lineTo(g, 128); t.stroke(); }
  }

  const crateTex = mk(64, 64);
  {
    const t = crateTex.getContext('2d');
    t.fillStyle = 'rgb(' + rgb(th.crate) + ')';
    t.fillRect(0, 0, 64, 64);
    t.fillStyle = 'rgba(255,255,255,0.09)';
    t.fillRect(0, 0, 64, 6);
    t.fillStyle = 'rgba(0,0,0,0.25)';
    t.fillRect(0, 58, 64, 6);
    t.strokeStyle = 'rgb(' + rgb(bright(th.crate, -45)) + ')';
    t.lineWidth = 2;
    t.strokeRect(1, 1, 62, 62);
    t.beginPath();
    t.moveTo(32, 1);
    t.lineTo(32, 63);
    t.stroke();
    t.strokeStyle = 'rgba(255,255,255,0.10)';
    t.strokeRect(4, 4, 56, 56);
    for (let i = 0; i < 120; i++) {
      t.fillStyle = 'rgba(' + rgb(bright(th.crateSpots, Math.random() * 40)) + ',0.5)';
      t.fillRect(Math.random() * 64, Math.random() * 64, 3, 2);
    }
  }

  const waterTex = mk(64, 64);
  {
    const t = waterTex.getContext('2d');
    t.fillStyle = 'rgb(' + rgb(th.water) + ')';
    t.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 120; i++) {
      const v = Math.random() * 0.3;
      t.fillStyle = 'rgba(' + rgb(bright(th.waterSpots, v * 60)) + ',0.4)';
      t.fillRect(Math.random() * 64, Math.random() * 64, 4, 2);
    }
    t.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 6; i++) {
      const y = Math.random() * 64;
      t.fillRect(0, y, 64, 1);
    }
  }

  const staticLayer = mk(W, H);
  const decalLayer = mk(W, H);
  const miniMap = mk(480, 360);
  const mmScale = 480 / W;

  {
    const t = staticLayer.getContext('2d');
    const pat = t.createPattern(floorTex, 'repeat');
    t.fillStyle = pat;
    t.fillRect(0, 0, W, H);
    for (let y = 0; y < map.grid.length; y++) {
      for (let x = 0; x < map.grid[y].length; x++) {
        const c = map.grid[y][x];
        const px = x * TILE, py = y * TILE;
        if (c === 'a' || c === 'b') {
          t.fillStyle = c === 'a' ? 'rgba(255,120,70,0.10)' : 'rgba(70,150,255,0.10)';
          t.fillRect(px, py, TILE, TILE);
        }
        if (c === '#') t.drawImage(wallTex, px, py, TILE, TILE);
        if (c === 'C') t.drawImage(crateTex, px, py, TILE, TILE);
        if (c === '~') t.drawImage(waterTex, px, py, TILE, TILE);
      }
    }
    // 光照烘焙：墙边缘软阴影（顶部光照，朝 y+ 方向投影）
    t.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 1; y < map.grid.length; y++) {
      for (let x = 0; x < map.grid[y].length; x++) {
        if (map.grid[y][x] === '#') {
          t.fillRect(x * TILE, y * TILE + TILE - 5, TILE, 5);
          t.fillStyle = 'rgba(0,0,0,0.10)';
          t.fillRect(x * TILE, y * TILE + TILE - 9, TILE, 4);
          t.fillStyle = 'rgba(0,0,0,0.22)';
        }
      }
    }
    t.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < map.grid.length; y++) {
      for (let x = 0; x < map.grid[y].length; x++) {
        if (map.grid[y][x] === '#') {
          t.fillRect(x * TILE, y * TILE, TILE, 3);
        }
      }
    }
    // 站点标记
    const sites = map.sites;
    t.font = '900 150px Arial';
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    if (sites.A) {
      t.fillStyle = 'rgba(255,120,70,0.14)';
      t.fillText('A', sites.A.cx, sites.A.cy);
      t.strokeStyle = 'rgba(255,120,70,0.35)';
      t.lineWidth = 4;
      t.strokeRect(sites.A.x0 + 20, sites.A.y0 + 20, sites.A.x1 - sites.A.x0 - 40, sites.A.y1 - sites.A.y0 - 40);
    }
    if (sites.B) {
      t.fillStyle = 'rgba(70,150,255,0.14)';
      t.fillText('B', sites.B.cx, sites.B.cy);
      t.strokeStyle = 'rgba(70,150,255,0.35)';
      t.lineWidth = 4;
      t.strokeRect(sites.B.x0 + 20, sites.B.y0 + 20, sites.B.x1 - sites.B.x0 - 40, sites.B.y1 - sites.B.y0 - 40);
    }
  }

  {
    const t = miniMap.getContext('2d');
    t.fillStyle = 'rgba(16,19,23,0.92)';
    t.fillRect(0, 0, 480, 360);
    for (let y = 0; y < map.grid.length; y++) {
      for (let x = 0; x < map.grid[y].length; x++) {
        const c = map.grid[y][x];
        if (c === '#') {
          t.fillStyle = th.mmWall;
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === 'C') {
          t.fillStyle = th.mmCrate;
          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);
        } else if (c === '~') {
          t.fillStyle = '#1d4a6e';
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
    staticLayer, decalLayer, miniMap, mmScale,
    decal: decalLayer
  };
}
