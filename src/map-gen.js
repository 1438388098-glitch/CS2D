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

export function buildDust2() {
  const b = createBuilder(60, 42);
  border(b);
  b.corridor(1, 1, 29, 3);          // 顶排 T 走廊
  b.spawn('t', 3, 1, 6, 2);
  b.corridor(29, 2, 4, 39);         // 中路纵贯
  b.corridor(1, 14, 58, 14);        // 中央大厅
  b.corridor(36, 4, 23, 11);        // A 区（含大厅入口）
  b.site('A', 44, 5, 15, 6);
  for (let x = 49; x <= 52; x++) { b.tile(x, 5, '^'); b.tile(x, 6, '^'); }  // A 高台
  for (let y = 5; y <= 11; y++) b.tile(38, y, '=');                          // A 入口薄墙
  b.boxes(41, 7, 2, 2); b.boxes(55, 8, 2, 2);
  b.corridor(2, 28, 20, 14);        // B 区
  b.site('B', 3, 33, 17, 8);
  for (let x = 2; x <= 21; x++) if (x < 6 || x > 16) b.tile(x, 28, '#');     // B 入口收窄（门 x6-16）
  for (let y = 31; y <= 37; y++) b.tile(8, y, '=');                          // B 内薄墙
  b.boxes(15, 35, 2, 2); b.boxes(11, 38, 2, 2);
  for (let y = 18; y <= 24; y++) b.tile(45, y, '=');                         // 大厅薄墙
  b.tile(26, 20, '^'); b.tile(27, 20, '^'); b.tile(26, 21, '^'); b.tile(27, 21, '^');  // 中台
  b.corridor(33, 35, 26, 6);        // CT 区
  for (let y = 28; y <= 34; y++) { b.tile(53, y, '.'); b.tile(54, y, '.'); } // CT 竖通道
  b.spawn('c', 52, 36, 4, 3);
  b.boxes(50, 39, 2, 1);
  return b;
}

export function buildCanal() {
  const b = createBuilder(64, 46);
  border(b);
  for (let x = 2; x < 62; x++) for (let y = 22; y <= 27; y++) b.tile(x, y, '~');
  for (let x = 16; x <= 21; x++) for (let y = 22; y <= 27; y++) b.tile(x, y, '≈');
  for (let x = 42; x <= 47; x++) for (let y = 22; y <= 27; y++) b.tile(x, y, '≈');
  for (let y = 19; y <= 21; y++) { b.tile(44, y, '~'); b.tile(45, y, '~'); }  // 深水北端暗道出口
  for (const bx of [10, 30, 50]) {
    for (let y = 19; y <= 30; y++) { b.tile(bx, y, '.'); b.tile(bx + 1, y, '.'); }
  }
  b.corridor(1, 1, 62, 18);         // 北岸
  b.site('A', 40, 4, 14, 6);
  for (let x = 36; x <= 58; x++) for (let y = 14; y <= 17; y++) b.tile(x, y, '~');  // A 临水滩
  for (let y = 6; y <= 14; y++) b.tile(34, y, '=');                               // A 观水薄墙
  b.boxes(44, 6, 2, 2); b.boxes(52, 7, 2, 2); b.boxes(38, 8, 1, 3);
  b.tile(31, 16, '^'); b.tile(32, 16, '^');                                       // 桥北守桥台
  b.corridor(1, 30, 62, 16);        // 南岸
  b.site('B', 10, 34, 14, 8);
  b.tile(18, 33, '^'); b.tile(19, 33, '^'); b.tile(18, 34, '^'); b.tile(19, 34, '^');  // B 高台
  for (let y = 34; y <= 41; y++) b.tile(28, y, '=');                               // B 薄墙
  for (let x = 24; x <= 47; x++) for (let y = 28; y <= 29; y++) b.tile(x, y, '≈'); // B 水岸（水下暗道入水）
  b.boxes(8, 37, 2, 2); b.boxes(21, 36, 2, 2); b.boxes(13, 40, 2, 2);
  b.boxes(8, 24, 2, 2); b.boxes(28, 24, 2, 2); b.boxes(48, 23, 2, 2);             // 桥下阴影箱
  b.spawn('t', 2, 41, 5, 3);
  b.spawn('c', 57, 3, 5, 4);
  return b;
}

export function buildMetro() {
  const b = createBuilder(58, 42);
  border(b);
  b.corridor(1, 6, 56, 5);          // 上走廊
  b.corridor(1, 18, 56, 5);         // 中走廊
  b.corridor(1, 30, 56, 5);         // 下走廊
  b.corridor(8, 6, 4, 29);          // 左竖
  b.corridor(27, 6, 4, 29);         // 中竖
  b.corridor(46, 6, 4, 29);         // 右竖
  b.spawn('t', 2, 7, 4, 2);
  b.spawn('c', 52, 7, 4, 2);
  b.corridor(24, 11, 11, 6);        // B 站台
  b.site('B', 25, 12, 9, 4);
  b.tile(24, 13, '^'); b.tile(25, 13, '^'); b.tile(24, 14, '^'); b.tile(25, 14, '^');
  b.tile(32, 13, '^'); b.tile(33, 13, '^'); b.tile(32, 14, '^'); b.tile(33, 14, '^');
  for (let x = 24; x <= 34; x++) b.tile(x, 17, '.');
  b.boxes(26, 14, 2, 2);
  b.corridor(24, 24, 11, 6);        // A 站台
  b.site('A', 25, 25, 9, 4);
  for (let x = 24; x <= 34; x++) b.tile(x, 23, '.');
  b.boxes(27, 25, 2, 2); b.boxes(31, 27, 2, 2);
  for (let y = 18; y <= 22; y++) { b.tile(20, y, '='); b.tile(37, y, '='); }  // 隧道薄墙
  b.tile(24, 20, 'o'); b.tile(33, 20, 'o'); b.tile(27, 24, 'o');             // 枢纽油桶
  b.boxes(6, 19, 1, 3); b.boxes(50, 19, 1, 3);
  b.boxes(6, 31, 1, 3); b.boxes(50, 31, 1, 3);
  return b;
}
