import { isSolidTile, isWaterTile, tileHeightFor, cameraZFor, tileToChar } from '../src/render3d-next.js';

let failed = false;
function ok(name, cond) {
  if (cond) {
    console.log('render3d-next: ' + name + ' PASS');
  } else {
    failed = true;
    console.error('render3d-next: ' + name + ' FAIL');
  }
}

ok('solid wall', isSolidTile('#'));
ok('solid crate', isSolidTile('C'));
ok('solid thin wall', isSolidTile('='));
ok('solid barrel', isSolidTile('o'));
ok('walkable floor is not solid', !isSolidTile('.'));
ok('walkable platform is not solid', !isSolidTile('^'));
ok('water shallow', isWaterTile('~'));
ok('water deep', isWaterTile('\u2248'));
ok('water deep alternate', isWaterTile('\u224b'));
ok('dry floor is not water', !isWaterTile('.'));
ok('half-height crate', tileHeightFor('C', 16) === 8.8);
ok('half-height thin wall', tileHeightFor('=', 16) === 8.8);
ok('barrel height', tileHeightFor('o', 16) === 7.2);
ok('platform camera height', cameraZFor('^', 16) === 24);
ok('half platform camera height', cameraZFor('R', 16) === 16);
ok('flat camera height', cameraZFor('.', 16) === 8);

// tileToChar 边界（补充此前缺失的网格取字符测试）
const g = [['#', '.', 'C'], ['.', '=', '~']];
ok('tileToChar normal', tileToChar(g, 0, 0) === '#');
ok('tileToChar walkable', tileToChar(g, 1, 0) === '.');
ok('tileToChar last cell', tileToChar(g, 2, 1) === '~');
ok('tileToChar x out of range', tileToChar(g, 3, 0) === '#');
ok('tileToChar y out of range', tileToChar(g, 0, 2) === '#');
ok('tileToChar negative', tileToChar(g, -1, 0) === '#');
ok('tileToChar empty grid', tileToChar([], 0, 0) === '#');
ok('tileToChar null grid', tileToChar(null, 0, 0) === '#');

if (failed) {
  process.exit(1);
}
