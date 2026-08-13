// 从 src/official-maps.js 抽取地图数据 → JSON（Godot 侧 MapData 消费）
// 用法: node scripts/export-maps.mjs [输出路径]
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_MAPS } from '../src/official-maps.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] || 'D:/Claudeworkspace/GAME/001/data/maps.json';

const maps = {};
for (const [id, def] of Object.entries(OFFICIAL_MAPS)) {
  if (id === 'canal' || id === 'blast') continue;
  maps[id] = {
    id,
    name: def.name,
    accent: def.accent || '#ff8a2a',
    tile: def.tile,
    rows: def.rows,
    penPoints: def.penPoints || [],
    highPoints: def.highPoints || []
  };
}
writeFileSync(outPath, JSON.stringify(maps, null, 1), 'utf8');
console.log('exported ' + Object.keys(maps).length + ' maps -> ' + outPath);
