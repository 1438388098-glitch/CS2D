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
    crate(x, y) {
      if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = 'D';
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
  // 大厅左段掩体（掩体真空区补强，不堵走廊）
  b.boxes(9, 18, 2, 2); b.boxes(15, 20, 2, 2); b.boxes(11, 24, 2, 2);
  b.corridor(33, 35, 26, 6);        // CT 区
  for (let y = 28; y <= 34; y++) { b.tile(53, y, '.'); b.tile(54, y, '.'); } // CT 竖通道
  for (let y = 28; y <= 34; y++) { b.tile(46, y, '.'); b.tile(47, y, '.'); } // CT 第二竖通道
  b.spawn('c', 44, 36, 4, 3);
  b.boxes(50, 39, 2, 1);
  // 中路错位掩体：防止 T 出门沿中路直线对穿（中门过弯）
  b.boxes(30, 9, 2, 2); b.boxes(32, 11, 2, 2); b.boxes(31, 13, 2, 2);
  // CT 侧中路入口缓冲（错位拐角）
  b.box(28, 33); b.box(29, 33); b.box(31, 35);
  // dust2 signature: destructible crates beside the A thin wall form an L-shaped wallbang pocket
  b.crate(39, 10); b.crate(40, 10);
  b.boxes(17, 29, 2, 2); b.boxes(17, 32, 2, 2);
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
  b.site('A', 36, 4, 14, 6);        // A 左移（缩短 T 进攻线）
  for (let x = 32; x <= 58; x++) for (let y = 14; y <= 17; y++) b.tile(x, y, '~');  // A 临水滩
  for (let y = 6; y <= 14; y++) b.tile(30, y, '=');                               // A 观水薄墙
  b.boxes(44, 6, 2, 2); b.boxes(52, 7, 2, 2); b.boxes(38, 8, 1, 3);
  b.tile(31, 16, '^'); b.tile(32, 16, '^');
  b.crate(28, 16); b.crate(29, 16); // bridge cover stack                                       // 桥北守桥台
  b.corridor(1, 30, 62, 16);        // 南岸
  b.site('B', 24, 34, 14, 8);       // B 区右移（远离 T 出生，治速攻）
  b.tile(32, 33, '^'); b.tile(33, 33, '^'); b.tile(32, 34, '^'); b.tile(33, 34, '^');  // B 高台
  for (let y = 34; y <= 41; y++) b.tile(42, y, '=');                               // B 薄墙（右侧）
  for (let x = 24; x <= 47; x++) for (let y = 28; y <= 29; y++) b.tile(x, y, '≈'); // B 水岸（水下暗道入水）
  b.boxes(22, 37, 2, 2); b.boxes(35, 36, 2, 2); b.boxes(27, 40, 2, 2);
  b.boxes(8, 24, 2, 2); b.boxes(28, 24, 2, 2); b.boxes(48, 23, 2, 2);             // 桥下阴影箱
  // 掩体真空区补强（北岸左段 / 南岸左段 / CT 右侧）
  b.boxes(8, 8, 2, 2); b.boxes(20, 10, 2, 2); b.boxes(26, 6, 2, 2);
  b.boxes(6, 38, 2, 2); b.boxes(14, 42, 2, 2);
  b.boxes(56, 33, 2, 2); b.boxes(58, 16, 2, 2);
  b.spawn('t', 2, 43, 5, 2);
  b.spawn('c', 56, 30, 4, 2);       // CT 出生右下（远离 A 门口，拉长首接）
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
  b.spawn('c', 50, 30, 4, 2);       // CT 出生右下下走廊深处（出生隔离）
  b.corridor(24, 11, 11, 6);        // B 站台
  b.site('B', 25, 12, 9, 4);
  for (let x = 24; x <= 26; x++) b.wall(x, 11);   // B 左入口封闭（从右侧进，防出门直冲）
  b.tile(24, 13, '^'); b.tile(25, 13, '^'); b.tile(24, 14, '^'); b.tile(25, 14, '^');
  b.tile(32, 13, '^'); b.tile(33, 13, '^'); b.tile(32, 14, '^'); b.tile(33, 14, '^');
  for (let x = 24; x <= 34; x++) b.tile(x, 17, '.');
  b.boxes(26, 14, 2, 2);
  b.corridor(36, 22, 9, 6);         // A 站台（中走廊右段下方，两出生点等距）
  b.site('A', 37, 23, 7, 4);
  for (let x = 36; x <= 44; x++) b.tile(x, 22, '.');
  b.boxes(38, 24, 2, 2); b.boxes(42, 26, 2, 2);
  for (let y = 18; y <= 22; y++) { b.tile(20, y, '='); b.tile(45, y, '='); }  // 隧道薄墙
  b.tile(24, 20, 'o'); b.tile(33, 20, 'o'); b.tile(27, 24, 'o');
  b.crate(22, 19); b.crate(23, 19); // narrow nade window             // 枢纽油桶
  b.boxes(6, 19, 1, 3); b.boxes(50, 19, 1, 3);
  b.boxes(6, 31, 1, 3); b.boxes(50, 31, 1, 3);
  // 中竖错位箱：双方必经之路的过弯掩体（防直线对穿）
  b.box(28, 12); b.box(29, 13); b.box(28, 14); b.box(27, 15);
  b.box(29, 26); b.box(28, 27); b.box(29, 28);
  // 上走廊右端封闭一段，防 CT 从上走廊直切 T 半场（出生隔离）
  for (let x = 50; x <= 53; x++) b.wall(x, 6);
  return b;
}
