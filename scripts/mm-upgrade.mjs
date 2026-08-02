import { readFileSync, writeFileSync } from 'fs';
let s = readFileSync('D:/Claudeworkspace/CS2D/src/textures.js', 'utf8');
const start = s.indexOf('  {\n    const t = miniMap.getContext');
const end = s.indexOf('  return {\n    W, H,');
if (start < 0 || end < 0 || end < start) {
  console.error('mm-upgrade: pattern not found (already applied or source changed), aborting');
  process.exit(1);
}
const oldBlock = s.slice(start, end);
const newBlock = [
  "  {",
  "    const t = miniMap.getContext('2d');",
  "    t.fillStyle = 'rgba(16,19,23,0.92)';",
  "    t.fillRect(0, 0, 480, 360);",
  "    for (let y = 0; y < map.grid.length; y++) {",
  "      for (let x = 0; x < map.grid[y].length; x++) {",
  "        const c = map.grid[y][x];",
  "        if (c === '#') {",
  "          t.fillStyle = '#4d545e';",
  "          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);",
  "        } else if (c === 'C') {",
  "          t.fillStyle = '#6d5534';",
  "          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);",
  "        } else if (c === '~') {",
  "          t.fillStyle = '#1d4a6e';",
  "          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);",
  "        } else if (c === 'a' || c === 'b') {",
  "          t.fillStyle = c === 'a' ? 'rgba(255,120,70,0.30)' : 'rgba(70,150,255,0.30)';",
  "          t.fillRect(x * mmScale, y * mmScale, mmScale + 0.6, mmScale + 0.6);",
  "        }",
  "      }",
  "    }",
  "    for (const key of ['A', 'B']) {",
  "      const ss = map.sites[key];",
  "      if (!ss) continue;",
  "      t.strokeStyle = key === 'A' ? 'rgba(255,140,80,0.85)' : 'rgba(90,160,255,0.85)';",
  "      t.lineWidth = 1.4;",
  "      t.strokeRect(ss.x0 * mmScale, ss.y0 * mmScale, (ss.x1 - ss.x0) * mmScale, (ss.y1 - ss.y0) * mmScale);",
  "    }",
  "  }",
  "",
  ""
].join('\n');
s = s.replace(oldBlock, newBlock);
if (s.includes('const miniMap = mk(240, 180);')) {
  s = s.replace('const miniMap = mk(240, 180);', 'const miniMap = mk(480, 360);');
} else {
  console.error('mm-upgrade: mk(240,180) not found, aborting');
  process.exit(1);
}
if (s.includes('const mmScale = 240 / W;')) {
  s = s.replace('const mmScale = 240 / W;', 'const mmScale = 480 / W;');
} else {
  console.error('mm-upgrade: mmScale 240 not found, aborting');
  process.exit(1);
}
writeFileSync('D:/Claudeworkspace/CS2D/src/textures.js', s);
console.log('textures.js minimap upgraded');
