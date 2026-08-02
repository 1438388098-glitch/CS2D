// mech-test：分区隔离的机制测试图。各行由全墙行分隔成互不连通的独立分区，
// 大量格（如 x>=13 的 T 区上部、高台列右侧走廊等）属预期不可达；无 a/b 站点，
// 仅用于验证瓦片语义/寻路/扫描机制，勿用于完整对局。
import { registerMap } from '../src/registry.js';

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
  for (let i = 0; i < 8; i++) rows.push('#........^.........#..........#');
  rows.push('#'.repeat(31));
  return rows;
})();

export function installMechTestMap() {
  registerMap({ id: 'mech-test', name: 'mech', accent: '#aaa', rows: MECH_TEST_ROWS });
}
