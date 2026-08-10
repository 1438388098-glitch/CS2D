// mech-test：分区隔离的机制测试图。各行由全墙行分隔成互不连通的独立分区，
// 大量格（如 x>=13 的 T 区上部、高台列右侧走廊等）属预期不可达；无 a/b 站点，
// 仅用于验证瓦片语义/寻路/扫描机制，勿用于完整对局。
import { registerMap } from '../src/registry.js';
import { buildDust2 } from '../src/map-gen.js';

export const MECH_TEST_ROWS = (() => {
  const rows = [];
  rows.push('#'.repeat(31));
  const upper = '#ttttttt....=..........#......#';
  for (let i = 0; i < 10; i++) rows.push(upper);
  rows.push('#'.repeat(31));
  const water = '#~~~~~~~~~....≈≈≈≈≈≈≈.........#';
  for (let i = 0; i < 6; i++) rows.push(water);
  rows.push('#'.repeat(31));
  rows.push('#........^....o....#..........#');
  rows.push('#........^...D.....#..........#');
  for (let i = 0; i < 7; i++) rows.push('#........^.........#..........#');
  rows.push('#'.repeat(31));
  return rows;
})();

export function installMechTestMap() {
  registerMap({ id: 'mech-test', name: 'mech', accent: '#aaa', rows: MECH_TEST_ROWS, allowDisconnected: true });
}

export function installLegacyDust2Map() {
  registerMap({
    id: 'legacy-dust2',
    name: 'legacy dust2',
    accent: '#ff8a2a',
    rows: buildDust2().rows(),
    penPoints: [{ x: 1500, y: 300 }, { x: 300, y: 1340 }, { x: 1800, y: 880 }],
    highPoints: [{ x: 2020, y: 230, face: Math.PI }, { x: 1070, y: 820, face: 0 }]
  });
}
