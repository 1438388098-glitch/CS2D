// render3d 全渲染路径冒烟：stubdom 下真实执行 initRenderer3d/render3d 多帧多状态
// （纯函数测试只覆盖数学，此测试覆盖 drawSky/drawGroundQuads(近平面裁剪+高台skirt)/drawWalls/drawSprite(逐列裁剪)/粒子/曳光/激光/开镜/观战 全部代码路径）
import { installStubs, registerDomIds } from './stubdom.js';
import { registerMap } from '../src/registry.js';
import { loadMap, getMap } from '../src/map.js';
import { createGame, setupMatchEntities, startMatch, update } from '../src/game.js';
import { initTextures, themeOf } from '../src/textures.js';
import { initRenderer3d, render3d, fpsCameraEntity } from '../src/render3d.js';

installStubs();
registerDomIds('game');

function ok(name, cond) {
  if (!cond) throw new Error('render3d-smoke: ' + name + ' FAIL');
  console.log('render3d-smoke: ' + name + ' PASS');
}

// 含墙/水/高台/爆破点/出生点的紧凑地图（覆盖 ground-quads 特殊字符与相机站格内场景）
const rows = [
  '##################',
  '#................#',
  '#.~~^^^^^^^......#',
  '#.~~^^^^^^^^.....a#',
  '#..............a..#',
  '#....#..R.......a.#',
  '#..bb#..R.........#',
  '#..bb#..........t.#',
  '#................#',
  '##################'
];
registerMap({ id: 'smoke3d', name: 'smoke3d', accent: '#888', rows, tile: 40 });
loadMap({ id: 'smoke3d', name: 'smoke3d', rows, tile: 40 });

const game = createGame({ mapId: 'smoke3d', bots: 2, team: 'ct', diff: 'easy' });
setupMatchEntities(game);
game.layers = initTextures(getMap());
const canvas = document.getElementById('game');
canvas.width = 1280; canvas.height = 720;
initRenderer3d(canvas, game.layers);
startMatch(game);

// 空渲染不抛错（无玩家帧）
ok('render no player', (() => { render3d(game); return true; })());
game.player = game.entities.find((e) => !e.bot) || null;

// 正常对局帧：玩家站在普通地面
game.viewMode = 'fps';
game.state = 'LIVE';
game.freezeT = 0;
const p = game.player;
p.x = 120; p.y = 100; p.angle = 0.6;
ok('render alive frame', (() => { render3d(game); return true; })());

// 相机站在高台/水面格内（触发近平面裁剪路径）
ok('render in platform tile', (() => { p.x = 140; p.y = 140; render3d(game); return true; })());
ok('render in water tile', (() => { p.x = 80; p.y = 140; render3d(game); return true; })());
ok('render on roof tile', (() => { p.x = 260; p.y = 220; render3d(game); return true; })());

// 蹲下 + 烟雾 + 安放炸弹 + 掉落物 + 手雷 + 粒子 + 弹道 + 激光
game.smokes = [{ x: 300, y: 240, r: 90, life: 8 }];
game.bomb = { x: 420, y: 260, dropped: false, planted: true };
game.drops = [{ x: 320, y: 280, wid: 'ak47' }];
game.grenades = [{ x: 200, y: 180, kind: 'he' }, { x: 210, y: 190, kind: 'smoke' }];
game.particles = [
  { kind: 'blood', x: 350, y: 250, life: 0.8, size: 2 },
  { kind: 'spark', x: 360, y: 255, life: 0.6, size: 3 },
  { kind: 'fire', x: 370, y: 260, life: 0.5, size: 3 },
  { kind: 'boom', x: 380, y: 265, life: 0.4, size: 4 },
  { kind: 'wood', x: 390, y: 270, life: 0.3, size: 2 },
  { kind: 'splash', x: 400, y: 275, life: 0.7, size: 3 },
  { kind: 'shell', x: 410, y: 280, life: 0.5, size: 2 },
  { kind: 'swing', x: 420, y: 285, life: 0.5, size: 2 }
];
game.tracers = [
  { x1: 140, y1: 140, x2: 600, y2: 300, life: 0.09, team: 'ct' },
  { x1: 500, y1: 400, x2: 900, y2: 200, life: 0.05, team: 't' },
  { x1: 140, y1: 140, x2: 3000, y2: 2000, life: 0.07, team: 'ct' }
];
game.decals = [
  { type: 'spark', x: 340, y: 250, life: 4 },
  { type: 'hole', x: 345, y: 255, life: 14 },
  { type: 'corpse', x: 400, y: 300, angle: 1, team: 't', life: 40 },
  { type: 'corpse', x: 420, y: 305, angle: 2, team: 'ct', life: 40 }
];
p.crouched = true;
p.bobPhase = 1.5;
p.muzzleT = 0.05;
p.laserEnd = { x: 500, y: 300 };
p.scoped = false;
ok('render fx frame', (() => { render3d(game); return true; })());

// AWP 开镜（scoped 全帧 focal 放大 + 黑环遮罩）
p.scoped = true;
p.slot = 'primary';
p.weapons.primary = 'awp';
ok('render scoped frame', (() => { render3d(game); return true; })());

// 死亡观战（_specAngle 懒初始化 + 观战目标）
p.dead = true;
ok('render spectate frame', (() => { render3d(game); return true; })());
ok('specAngle initialized', typeof game._specAngle === 'number');

// 实体在墙后被遮挡（sprite 逐列裁剪路径）：玩家朝墙，敌人藏在墙后
p.dead = false;
p.x = 120; p.y = 100; p.angle = 0;
game.smokes = [];
game.bomb = null;
game.drops = [];
game.grenades = [];
game.particles = [];
game.tracers = [];
game.decals = [];
p.muzzleT = 0;
p.laserEnd = null;
p.bobPhase = undefined;
p.walking = true;
const wallTop = game.entities.find((e) => e.bot && !e.dead);
if (wallTop) { wallTop.x = 260; wallTop.y = 110; }
ok('render occlusion frame', (() => { render3d(game); return true; })());

// ===== 新 3D 视觉功能覆盖（并行 agent 实现中，防御式断言：字段不存在则 SKIP，绝不 FAIL）=====

// 1. 武器 viewmodel 帧：玩家活着，槽位/后坐/换弹/手雷/刀 依次渲染不抛错
ok('render viewmodel primary frame', (() => {
  p.scoped = false;
  p.slot = 'primary';
  p.weapons.primary = 'ak47';
  p.recoil = 0.8;
  render3d(game);
  return true;
})());
ok('render viewmodel reloading frame', (() => {
  p.reloading = true;
  p.reloadT = 0.5;
  render3d(game);
  return true;
})());
ok('render viewmodel nade frame', (() => {
  p.slot = 'nade:he';
  p.weapons.nades.he = 1;
  render3d(game);
  return true;
})());
ok('render viewmodel knife frame', (() => {
  p.slot = 'knife';
  render3d(game);
  return true;
})());
p.slot = 'primary';
p.weapons.primary = 'ak47';

// 2. 换弹进度 UI 无回归：reloading 状态连渲 3 帧
ok('render reload progress 3 frames', (() => {
  p.reloading = true;
  p.reloadT = 0.5;
  for (let i = 0; i < 3; i++) render3d(game);
  return true;
})());
p.reloading = false;
p.reloadT = 0;
p.recoil = 0;

// 3. 天气粒子帧（防御式：T1 未完成则 SKIP，绝不 FAIL）
if (game.layers && game.layers.wallVariants) {
  const wv = game.layers.wallVariants;
  ok('wallVariants v0..v3 objects + v1!==v0',
    wv && wv.v0 && wv.v1 && wv.v2 && wv.v3 &&
    typeof wv.v0 === 'object' && typeof wv.v1 === 'object' &&
    typeof wv.v2 === 'object' && typeof wv.v3 === 'object' &&
    wv.v1 !== wv.v0);
} else {
  console.log('render3d-smoke: wallVariants SKIP (T1 未完成)');
}
if (typeof themeOf === 'function') {
  const th = themeOf('dust2');
  if (th && th.weather !== undefined) {
    ok('themeOf dust2 weather kind=sand', th.weather.kind === 'sand');
  } else {
    console.log('render3d-smoke: theme weather SKIP (weather 字段未实现)');
  }
} else {
  console.log('render3d-smoke: themeOf SKIP (textures.js 未导出)');
}
ok('render weather theme frame', (() => { render3d(game); return true; })());

// ===== 反馈/相机参数帧（并行 agent 实现中，防御式：只渲染不 FAIL）=====

// 1. 动态渲染分辨率（main.js 写 game._renderScale 0.25-0.5）
game._renderScale = 0.33;
ok('render low-res scale frame', (() => { render3d(game); return true; })());
game._renderScale = 0.5;

// 2. FOV 帧（弧度，缺省回退 Math.PI/2）
game.fov = 100 * Math.PI / 180;
ok('render wide fov frame', (() => { render3d(game); return true; })());
delete game.fov;

// 3. 伤害数字帧（game.dmgPops：上浮淡出）
p.dead = false;
game.dmgPops = [{ x: 300, y: 260, dmg: 40, head: true, t: 0.8 }];
ok('render dmgpops frame', (() => { render3d(game); return true; })());
game.dmgPops = [];

// 4. 死亡观战 + 击杀者高亮（lastKiller 指向存活 bot；渲染后复原）
const killerBot = game.entities.find((e) => e.bot) || game.entities.find((e) => e !== p);
p.dead = true;
game.lastKiller = killerBot || null;
ok('render killcam lastKiller frame', (() => { render3d(game); return true; })());
p.dead = false;
game.lastKiller = null;

// 5. AWP 开镜过渡帧（scopeT 0..1 中间值，焦段插值路径）
game.scopeT = 0.5;
p.scoped = true;
ok('render scopeT transition frame', (() => { render3d(game); return true; })());

// 3D pitch 回归：上下视角会改变地平线/投影，但不能破坏整条渲染链
p.pitch = 0.45;
ok('render pitch up frame', (() => { render3d(game); return true; })());
p.pitch = -0.4;
ok('render pitch down frame', (() => { render3d(game); return true; })());
p.pitch = 0;

// 状态复原：与插入前一致（60 帧混合循环依赖的原状态）
p.weapons.nades.he = 0;
p.slot = 'primary';
p.weapons.primary = 'awp';
p.reloading = false;
p.reloadT = 0;
p.recoil = 0;
p.scoped = true;

// 多帧稳定性（update + render 交替，模拟真实循环）
ok('render 60 mixed frames', (() => {
  for (let i = 0; i < 60; i++) {
    update(game, 1 / 60);
    render3d(game);
  }
  return true;
})());
ok('fps entity markers generated', Array.isArray(game._fpsEntityMarkers) && game._fpsEntityMarkers.length > 0);
ok('fps teammate marker present', game._fpsEntityMarkers.some((m) => m.team === p.team));
ok('fps enemy marker present', game._fpsEntityMarkers.some((m) => m.team !== p.team));

console.log('render3d-smoke: all PASS');
