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

export function buildForge() {
  const b = createBuilder(80, 52);
  border(b);
  b.corridor(1, 2, 78, 5);          // top lane
  b.corridor(1, 23, 78, 5);         // mid lane
  b.corridor(1, 45, 78, 5);         // bottom lane
  b.corridor(8, 2, 4, 48);          // west spine
  b.corridor(36, 2, 4, 48);         // central spine
  b.corridor(66, 2, 4, 48);         // east spine
  b.corridor(57, 7, 14, 8);         // A approach
  b.site('A', 59, 9, 10, 4);
  b.boxes(60, 10, 2, 2); b.boxes(65, 12, 2, 2); b.boxes(58, 13, 2, 1);
  b.crate(63, 11); b.crate(68, 10);
  b.tile(63, 8, '^'); b.tile(64, 8, '^');
  b.tile(57, 13, '='); b.tile(70, 13, '=');
  b.corridor(8, 35, 16, 7);         // B approach
  b.corridor(8, 42, 16, 3);         // B lower gate
  b.site('B', 10, 36, 12, 5);
  b.boxes(12, 37, 2, 2); b.boxes(17, 39, 2, 2); b.boxes(11, 41, 2, 1);
  b.crate(15, 40); b.crate(20, 38);
  b.tile(14, 36, '^'); b.tile(15, 36, '^');
  b.tile(9, 38, '='); b.tile(24, 38, '=');
  b.boxes(20, 24, 2, 2); b.boxes(56, 24, 2, 2);
  b.boxes(36, 14, 2, 2); b.boxes(36, 30, 2, 2);
  b.boxes(30, 23, 2, 2); b.boxes(48, 23, 2, 2);
  b.boxes(8, 20, 2, 2); b.boxes(66, 20, 2, 2);
  b.boxes(14, 3, 2, 2); b.boxes(42, 3, 2, 2);
  b.boxes(14, 46, 2, 2); b.boxes(48, 46, 2, 2);
  b.crate(38, 16); b.crate(38, 33); b.crate(20, 25); b.crate(55, 25);
  b.tile(38, 19, 'o'); b.tile(38, 30, 'o');
  b.spawn('t', 2, 3, 5, 2);
  b.spawn('c', 73, 46, 5, 2);
  return b;
}

export function buildHarbor() {
  const b = createBuilder(72, 48);
  border(b);
  b.corridor(1, 2, 70, 5);          // top pier
  b.corridor(1, 20, 70, 6);         // mid boulevard
  b.corridor(1, 38, 70, 7);         // lower docks
  b.corridor(3, 2, 7, 44);          // west spine
  b.corridor(31, 2, 8, 44);         // central spine
  b.corridor(58, 2, 7, 44);         // east spine
  for (let x = 18; x <= 29; x++) for (let y = 14; y <= 17; y++) b.tile(x, y, '~');
  for (let x = 42; x <= 53; x++) for (let y = 29; y <= 32; y++) b.tile(x, y, '~');
  b.corridor(20, 7, 3, 19);         // water lane
  b.corridor(44, 8, 3, 37);         // water lane
  b.corridor(1, 26, 70, 2);         // dry mid catwalk
  b.site('A', 59, 4, 11, 6);
  b.site('B', 4, 39, 12, 6);
  b.tile(65, 5, '^'); b.tile(66, 5, '^'); b.tile(65, 6, '^'); b.tile(66, 6, '^');
  b.tile(5, 41, '^'); b.tile(6, 41, '^'); b.tile(5, 42, '^'); b.tile(6, 42, '^');
  b.tile(64, 9, '='); b.tile(65, 9, '='); b.tile(70, 7, '=');
  b.tile(3, 41, '='); b.tile(17, 41, '='); b.tile(9, 45, '=');
  b.boxes(61, 6, 2, 2); b.boxes(67, 8, 2, 2); b.boxes(62, 10, 2, 1);
  b.boxes(6, 40, 2, 2); b.boxes(13, 42, 2, 2); b.boxes(8, 44, 2, 1);
  b.boxes(36, 23, 2, 2); b.boxes(8, 22, 2, 2); b.boxes(60, 23, 2, 2);
  b.boxes(21, 21, 2, 2); b.boxes(48, 21, 2, 2);
  b.crate(34, 5); b.crate(35, 5); b.crate(38, 25); b.crate(12, 25);
  b.crate(64, 3); b.crate(7, 38);
  b.tile(35, 21, 'o'); b.tile(49, 20, 'o'); b.tile(15, 38, 'o'); b.tile(55, 38, 'o');
  b.spawn('t', 62, 43, 6, 2);
  b.spawn('c', 4, 3, 6, 2);
  return b;
}

export function buildBazaar() {
  const b = createBuilder(66, 44);
  border(b);
  b.corridor(1, 2, 64, 4);          // north arcade
  b.corridor(1, 20, 64, 5);         // central market
  b.corridor(1, 38, 64, 4);         // south arcade
  b.corridor(3, 2, 6, 40);          // west spine
  b.corridor(29, 2, 6, 40);         // center spine
  b.corridor(57, 2, 6, 40);         // east spine
  b.corridor(12, 7, 4, 30);         // stall lane
  b.corridor(42, 7, 4, 30);         // spice lane
  b.corridor(18, 10, 3, 25);        // rug lane
  b.corridor(46, 10, 3, 25);        // lantern lane
  b.site('A', 57, 4, 7, 5);
  b.site('B', 3, 38, 9, 5);
  b.tile(60, 6, '^'); b.tile(61, 6, '^'); b.tile(5, 41, '^'); b.tile(6, 41, '^');
  b.boxes(12, 8, 2, 2); b.boxes(21, 12, 2, 2); b.boxes(34, 8, 2, 2);
  b.boxes(43, 12, 2, 2); b.boxes(52, 8, 2, 2); b.boxes(16, 22, 2, 2);
  b.boxes(25, 23, 2, 2); b.boxes(38, 22, 2, 2); b.boxes(49, 23, 2, 2);
  b.boxes(8, 32, 2, 2); b.boxes(24, 33, 2, 2); b.boxes(40, 32, 2, 2);
  b.boxes(54, 33, 2, 2); b.boxes(12, 39, 2, 2); b.boxes(33, 39, 2, 2);
  b.crate(15, 11); b.crate(44, 11); b.crate(22, 21); b.crate(41, 21);
  b.crate(10, 35); b.crate(52, 35);
  b.tile(14, 21, '='); b.tile(32, 21, '='); b.tile(50, 21, '=');
  b.tile(15, 21, '='); b.tile(33, 21, '='); b.tile(51, 21, '=');
  b.tile(20, 10, 'o'); b.tile(47, 10, 'o'); b.tile(7, 26, 'o'); b.tile(57, 26, 'o');
  b.spawn('t', 57, 41, 6, 2);
  b.spawn('c', 3, 3, 6, 2);
  return b;
}

export function buildFoundry() {
  const b = createBuilder(74, 50);
  border(b);
  b.corridor(1, 2, 72, 5);          // upper gantry
  b.corridor(1, 22, 72, 5);         // mid corridor
  b.corridor(1, 44, 72, 5);         // lower rail
  b.corridor(4, 2, 6, 46);          // west spine
  b.corridor(33, 2, 6, 46);         // center spine
  b.corridor(63, 2, 6, 46);         // east spine
  b.corridor(17, 8, 4, 35);         // scrap lane
  b.corridor(47, 8, 4, 35);         // ingot lane
  b.corridor(25, 13, 3, 25);        // pipe lane
  b.corridor(55, 13, 3, 25);        // valve lane
  b.site('A', 63, 4, 8, 5);
  b.site('B', 4, 44, 10, 5);
  b.tile(67, 7, '^'); b.tile(68, 7, '^'); b.tile(6, 47, '^'); b.tile(7, 47, '^');
  for (let x = 23; x <= 34; x++) for (let y = 17; y <= 20; y++) b.tile(x, y, '~');
  for (let x = 52; x <= 63; x++) for (let y = 28; y <= 31; y++) b.tile(x, y, '~');
  b.corridor(26, 17, 3, 4);         // sluice bridge
  b.corridor(55, 28, 3, 4);         // sluice bridge
  b.tile(33, 24, '='); b.tile(34, 24, '='); b.tile(39, 24, '=');
  b.tile(40, 24, '='); b.tile(46, 24, '='); b.tile(47, 24, '=');
  b.boxes(65, 6, 2, 2); b.boxes(71, 8, 2, 2); b.boxes(18, 10, 2, 2);
  b.boxes(49, 10, 2, 2); b.boxes(27, 14, 2, 2); b.boxes(56, 14, 2, 2);
  b.boxes(9, 23, 2, 2); b.boxes(37, 23, 2, 2); b.boxes(60, 23, 2, 2);
  b.boxes(8, 33, 2, 2); b.boxes(34, 33, 2, 2); b.boxes(62, 33, 2, 2);
  b.boxes(6, 45, 2, 2); b.boxes(30, 45, 2, 2); b.boxes(52, 45, 2, 2);
  b.crate(36, 5); b.crate(37, 5); b.crate(15, 25); b.crate(45, 25);
  b.crate(20, 40); b.crate(60, 40); b.crate(39, 43);
  b.tile(36, 22, 'o'); b.tile(50, 22, 'o'); b.tile(12, 37, 'o'); b.tile(57, 37, 'o');
  b.spawn('t', 64, 47, 6, 2);
  b.spawn('c', 4, 3, 6, 2);
  return b;
}

// Atrium: a dense 96x64 mixed-range bomb map.
// A is a CT-side gallery, B is a T-side archive, and the central atrium
// ties both teams through short segmented rotations.
export function buildAtrium() {
  const b = createBuilder(96, 64);
  border(b);

  // Main districts. The overlapping rectangles form the playable shell,
  // which is then narrowed by walls and cover.
  b.corridor(8, 2, 48, 20);          // A gallery + west approach
  b.corridor(66, 2, 28, 18);         // CT security lobby
  b.corridor(30, 22, 38, 18);        // central atrium
  b.corridor(2, 43, 26, 20);         // T service yard
  b.corridor(36, 43, 35, 20);        // B archive
  b.corridor(8, 20, 8, 26);          // west lift
  b.corridor(82, 18, 8, 28);         // east lift
  b.corridor(30, 20, 8, 8);          // A-mid gate
  b.corridor(60, 18, 10, 10);        // CT-mid gate
  b.corridor(52, 39, 12, 8);         // B-mid gate
  b.corridor(22, 38, 12, 8);         // T-mid gate
  b.corridor(52, 6, 18, 10);         // upper gallery
  b.corridor(24, 48, 40, 14);        // lower gallery
  b.corridor(70, 40, 20, 8);         // CT-to-B archive gate

  b.site('A', 30, 7, 13, 9);
  b.site('B', 50, 46, 15, 10);
  b.spawn('t', 8, 56, 9, 7);
  b.spawn('c', 78, 4, 9, 7);

  // Gate walls: each district keeps a deliberate entry gap.
  for (let y = 2; y <= 21; y++) if (y < 12 || y > 16) b.wall(24, y);
  for (let y = 2; y <= 19; y++) if (y < 4 || y > 10) b.wall(74, y);
  for (let y = 43; y <= 62; y++) if (y < 48 || y > 56) b.wall(66, y);

  // A gallery: platforms on the approach, staggered crates inside the site.
  for (let x = 32; x <= 35; x++) b.tile(x, 5, '^');
  b.tile(22, 10, '='); b.tile(22, 11, '='); b.tile(22, 12, '=');
  b.boxes(32, 9, 2, 2); b.boxes(39, 11, 2, 2); b.boxes(35, 13, 2, 2);
  b.crate(36, 10); b.crate(38, 14);
  b.crate(34, 14); b.crate(40, 8);
  b.boxes(12, 15, 2, 2); b.boxes(18, 17, 2, 2); b.boxes(8, 6, 2, 2);
  b.boxes(15, 4, 2, 2);
  b.crate(13, 12);

  // B archive: shelf clusters create short-range lanes.
  for (let x = 56; x <= 59; x++) b.tile(x, 44, '^');
  b.boxes(52, 48, 2, 2); b.boxes(59, 51, 2, 2); b.boxes(55, 54, 2, 2);
  b.crate(54, 49); b.crate(61, 48); b.crate(57, 53);
  b.crate(52, 55); b.crate(62, 55);
  b.boxes(67, 52, 2, 2); b.boxes(69, 57, 2, 2); b.boxes(85, 49, 2, 2);
  b.boxes(88, 54, 2, 2);

  // CT lobby and T yard: local cover without pinning spawns.
  b.boxes(68, 12, 2, 2); b.boxes(77, 13, 2, 2); b.boxes(89, 15, 2, 2);
  b.boxes(86, 12, 2, 2); b.boxes(18, 46, 2, 2); b.boxes(6, 50, 2, 2);
  b.boxes(12, 48, 2, 2); b.boxes(21, 54, 2, 2); b.boxes(3, 57, 2, 2);
  b.boxes(24, 60, 2, 2);

  // Central atrium: high ground, thin-wall pockets, and barrel hazards.
  for (let x = 46; x <= 49; x++) for (let y = 29; y <= 32; y++) b.tile(x, y, '^');
  b.tile(38, 25, '='); b.tile(38, 27, '='); b.tile(58, 30, '=');
  b.tile(58, 32, '='); b.tile(41, 24, '='); b.tile(61, 26, '=');
  b.boxes(34, 27, 2, 2); b.boxes(58, 24, 2, 2); b.boxes(42, 36, 2, 2);
  b.boxes(62, 35, 2, 2); b.boxes(44, 33, 2, 2); b.boxes(52, 27, 2, 2);
  b.boxes(54, 37, 2, 2);
  b.tile(43, 30, 'o'); b.tile(55, 32, 'o'); b.tile(60, 36, 'o');
  b.crate(40, 28); b.crate(56, 34);

  // Upper and lower galleries: segmented by cover, never a long straight lane.
  b.tile(56, 7, '='); b.tile(56, 8, '='); b.tile(56, 10, '=');
  b.tile(62, 10, '='); b.tile(62, 12, '='); b.tile(53, 14, '=');
  b.boxes(57, 8, 2, 2); b.boxes(61, 11, 2, 2); b.boxes(65, 6, 2, 2);
  b.boxes(54, 12, 2, 2);
  b.tile(30, 51, '='); b.tile(30, 53, '='); b.tile(30, 55, '=');
  b.tile(42, 50, '='); b.tile(42, 52, '='); b.tile(42, 54, '=');
  b.boxes(28, 50, 2, 2); b.boxes(36, 53, 2, 2); b.boxes(44, 49, 2, 2);
  b.boxes(52, 52, 2, 2); b.boxes(58, 55, 2, 2); b.boxes(34, 57, 2, 2);
  b.boxes(47, 57, 2, 2); b.boxes(56, 48, 2, 2);

  // West/east lifts: alternating cover keeps rotations tight.
  b.boxes(9, 26, 2, 2); b.boxes(13, 34, 2, 2); b.boxes(10, 40, 2, 2);
  b.tile(12, 23, '^'); b.tile(13, 23, '^');
  b.boxes(83, 24, 2, 2); b.boxes(87, 32, 2, 2); b.boxes(84, 38, 2, 2);
  b.tile(86, 20, '^'); b.tile(87, 20, '^');

  return b;
}
