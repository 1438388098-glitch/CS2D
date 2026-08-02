export function createBuilder(w, h) {
  const grid = Array.from({ length: h }, () => Array(w).fill('#'));
  const api = {
    w, h,
    grid,
    room(x, y, w2, h2) {
      for (let j = y; j < y + h2; j++) {
        for (let i = x; i < x + w2; i++) {
          if (j >= 0 && j < h && i >= 0 && i < w) grid[j][i] = '.';
        }
      }
    },
    box(x, y) {
      if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = 'C';
    },
    boxes(x, y, w2, h2) {
      for (let j = y; j < y + h2; j++) {
        for (let i = x; i < x + w2; i++) {
          if (j >= 0 && j < h && i >= 0 && i < w) grid[j][i] = 'C';
        }
      }
    },
    wall(x, y) {
      if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = '#';
    },
    door(x, y) {
      if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = '.';
    },
    corridor(x, y, w2, h2) {
      this.room(x, y, w2, h2);
    },
    site(name, x, y, w2, h2) {
      for (let j = y; j < y + h2; j++) {
        for (let i = x; i < x + w2; i++) {
          if (j >= 0 && j < h && i >= 0 && i < w) grid[j][i] = name === 'A' ? 'a' : 'b';
        }
      }
    },
    spawn(team, x, y, w2, h2) {
      const ch = team === 't' ? 't' : 'c';
      for (let j = y; j < y + h2; j++) {
        for (let i = x; i < x + w2; i++) {
          if (j >= 0 && j < h && i >= 0 && i < w) grid[j][i] = ch;
        }
      }
    },
    tile(x, y, ch) {
      if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = ch;
    },
    rows() {
      return grid.map((r) => r.join(''));
    }
  };
  return api;
}

function border(api) {
  for (let x = 0; x < api.w; x++) { api.wall(x, 0); api.wall(x, api.h - 1); }
  for (let y = 0; y < api.h; y++) { api.wall(0, y); api.wall(api.w - 1, y); }
}

export function buildSnow() {
  const b = createBuilder(60, 45);
  border(b);
  // 中庭
  b.room(18, 16, 24, 13);
  // 上下走廊
  b.corridor(1, 12, 58, 4);
  b.corridor(1, 29, 58, 4);
  // 垂直通道（左/中/右连接走廊与中庭）
  b.corridor(8, 16, 4, 13);
  b.corridor(28, 16, 4, 13);
  b.corridor(48, 16, 4, 13);
  // T 出生（左）与 CT 出生（右）
  b.spawn('t', 3, 17, 5, 11);
  b.spawn('c', 52, 17, 5, 11);
  // 站点 A（左上）与 B（左下）
  b.site('A', 20, 3, 14, 6);
  b.site('B', 20, 36, 14, 6);
  // 站点垂直通道（打通墙带到走廊）
  for (let y = 9; y <= 11; y++) { b.door(26, y); b.door(27, y); b.door(28, y); b.door(29, y); }
  for (let y = 33; y <= 35; y++) { b.door(26, y); b.door(27, y); b.door(28, y); b.door(29, y); }
  // 中庭箱子（对称）
  b.boxes(22, 18, 2, 2); b.boxes(36, 18, 2, 2);
  b.boxes(28, 20, 2, 2); b.boxes(32, 24, 2, 2); b.boxes(26, 24, 2, 2);
  b.boxes(22, 23, 2, 2); b.boxes(36, 23, 2, 2);
  // 走廊掩体
  b.boxes(12, 13, 1, 2); b.boxes(47, 13, 1, 2);
  b.boxes(12, 30, 1, 2); b.boxes(47, 30, 1, 2);
  return b;
}

export function buildDepot() {
  const b = createBuilder(56, 44);
  border(b);
  // 外圈走廊
  b.corridor(3, 3, 50, 38);
  // 中央仓库（大房间）
  b.room(16, 12, 24, 20);
  // 仓库入口
  b.door(16, 20); b.door(16, 21); b.door(16, 22); b.door(16, 23);
  b.door(39, 20); b.door(39, 21); b.door(39, 22); b.door(39, 23);
  b.door(26, 12); b.door(27, 12); b.door(28, 12); b.door(29, 12);
  b.door(26, 31); b.door(27, 31); b.door(28, 31); b.door(29, 31);
  // 内部箱阵（仓库核心）
  b.boxes(20, 15, 3, 3); b.boxes(33, 15, 3, 3);
  b.boxes(24, 18, 2, 2); b.boxes(30, 18, 2, 2);
  b.boxes(26, 22, 4, 4);
  b.boxes(20, 27, 3, 3); b.boxes(33, 27, 3, 3);
  // 外圈隔断（制造通道）
  b.boxes(10, 6, 2, 2); b.boxes(10, 35, 2, 2);
  b.boxes(44, 6, 2, 2); b.boxes(44, 35, 2, 2);
  b.boxes(6, 16, 2, 4); b.boxes(6, 24, 2, 4);
  b.boxes(48, 16, 2, 4); b.boxes(48, 24, 2, 4);
  // 出生区
  b.spawn('t', 8, 19, 3, 6);
  b.spawn('c', 45, 19, 3, 6);
  // 站点 A（上）B（下）
  b.site('A', 22, 5, 12, 5);
  b.site('B', 22, 34, 12, 5);
  b.door(24, 10); b.door(25, 10); b.door(26, 10); b.door(27, 10); b.door(28, 10); b.door(29, 10); b.door(30, 10); b.door(31, 10);
  b.door(24, 33); b.door(25, 33); b.door(26, 33); b.door(27, 33); b.door(28, 33); b.door(29, 33); b.door(30, 33); b.door(31, 33);
  return b;
}

export function buildCanal() {
  const b = createBuilder(64, 46);
  border(b);
  // 中央水渠（不可走，渲染为水）
  for (let x = 2; x < 62; x++) {
    b.grid[23][x] = '~';
    b.grid[24][x] = '~';
  }
  // 水渠上的桥（3 座，竖列打通 y19-26）
  for (const bx of [12, 31, 50]) {
    for (let y = 19; y <= 26; y++) b.door(bx, y);
    b.door(bx - 1, 23); b.door(bx + 1, 23);
    b.door(bx - 1, 24); b.door(bx + 1, 24);
  }
  // 上下长走廊
  b.corridor(1, 14, 62, 6);
  b.corridor(1, 26, 62, 6);
  // 外围区域（可走）
  b.corridor(1, 2, 62, 9);
  b.corridor(1, 35, 62, 9);
  // 垂直连接（左/中/右）
  b.corridor(6, 2, 4, 42);
  b.corridor(30, 2, 4, 42);
  b.corridor(54, 2, 4, 42);
  // 出生区：T 左下，CT 右上
  b.spawn('t', 3, 38, 4, 5);
  b.spawn('c', 57, 3, 4, 5);
  // 站点 A（左上）B（右下）
  b.site('A', 22, 4, 14, 5);
  b.site('B', 28, 37, 14, 5);
  b.door(26, 9); b.door(27, 9); b.door(28, 9); b.door(29, 9); b.door(30, 9); b.door(31, 9);
  b.door(26, 36); b.door(27, 36); b.door(28, 36); b.door(29, 36); b.door(30, 36); b.door(31, 36);
  // 长枪线掩体
  b.boxes(10, 15, 2, 1); b.boxes(40, 15, 2, 1);
  b.boxes(20, 30, 1, 2); b.boxes(44, 30, 1, 2);
  b.boxes(16, 3, 2, 2); b.boxes(48, 40, 2, 2);
  b.boxes(8, 6, 1, 3); b.boxes(55, 37, 1, 3);
  return b;
}

export function buildMetro() {
  const b = createBuilder(58, 42);
  border(b);
  // 三条横向隧道
  b.corridor(1, 6, 56, 5);
  b.corridor(1, 18, 56, 5);
  b.corridor(1, 30, 56, 5);
  // 竖井（左/中/右）
  b.corridor(8, 6, 4, 29);
  b.corridor(27, 6, 4, 29);
  b.corridor(46, 6, 4, 29);
  // 出生区：T 左上，CT 右上
  b.spawn('t', 3, 7, 4, 3);
  b.spawn('c', 51, 7, 4, 3);
  // 站点：A 左下隧道，B 中隧道
  b.site('A', 24, 31, 10, 4);
  b.site('B', 24, 19, 10, 4);
  // 站点开口
  b.door(27, 30); b.door(28, 30); b.door(29, 30); b.door(30, 30); b.door(31, 30); b.door(32, 30); b.door(33, 30); b.door(34, 30);
  b.door(24, 24); b.door(25, 24); b.door(26, 24); b.door(27, 24); b.door(28, 24); b.door(29, 24); b.door(30, 24); b.door(31, 24); b.door(32, 24); b.door(33, 24);
  // 隧道内掩体
  b.boxes(12, 7, 1, 3); b.boxes(44, 7, 1, 3);
  b.boxes(14, 19, 2, 1); b.boxes(40, 19, 2, 1);
  b.boxes(12, 32, 1, 2); b.boxes(44, 32, 1, 2);
  b.boxes(20, 8, 2, 2); b.boxes(36, 8, 2, 2);
  b.boxes(20, 33, 2, 2); b.boxes(36, 33, 2, 2);
  b.boxes(10, 21, 2, 1); b.boxes(46, 21, 2, 1);
  return b;
}
