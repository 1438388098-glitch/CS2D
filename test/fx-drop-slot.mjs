// 核心战斗回归：死亡掉落副武器 + 拆弹钳（candidate-146），与拾取分配。
// 契约：
//   killEntity 掉落主武器时，一并掉落副武器（kind:'secondary', wid, ammo, reserve 上限封顶）
//   与拆弹钳（kind:'kit'）；不持有则不掉落；投掷物不随死亡掉落。
//   pickupWeapon：副武器补位进 weapons.secondary，拆弹钳仅 CT 且未持有者可拾取。
//   fpsInteractAction / fpsAimInteractAction：kit 掉落提示为"拾取 拆弹钳"，不可拾取方不提示。
import assert from 'node:assert/strict';
import { createGame, startMatch } from '../src/game.js';
import { killEntity, pickupWeapon } from '../src/combat.js';
import { WEAPONS } from '../src/config.js';
import { loadMap } from '../src/map.js';
import { MAPS } from '../src/config.js';
import { fpsInteractAction, fpsAimInteractAction, dropPickupLabel } from '../src/hud.js';

loadMap(MAPS.find((m) => m.id === 'dust2'));

function fresh() {
  const g = createGame({ mapId: 'dust2', bots: 2 });
  startMatch(g);
  g.state = 'LIVE';
  g.freezeT = 0;
  g.noRoundEnd = true;
  for (const e of g.entities) if (e.bot) e.dead = true;
  return g;
}

// pickupWeapon 每次调用只拾取一个掉落（主武器分支 break），真实对局逐帧调用；
// 测试用循环模拟逐帧拾取，验证同位置多掉落都能被捡完。
function pickupAll(e, g, maxIters = 8) {
  for (let i = 0; i < maxIters && g.drops.length; i++) pickupWeapon(e, g);
}

const dropsOfKind = (g, kind) => g.drops.filter((d) => d.kind === kind);

// 1) 满装死亡：主武器 + 副武器 + 拆弹钳一并掉落，弹药按弹匣/备弹上限封顶
{
  const g = fresh();
  const p = g.player;
  p.team = 'ct';
  p.weapons.primary = 'ak';
  p.weapons.secondary = 'usp';
  p.weapons.kit = true;
  p.ammoMap.ak = 30; p.reserveMap.ak = 90;
  p.ammoMap.usp = 12; p.reserveMap.usp = 24;
  p.x = 500; p.y = 500;

  killEntity(p, null, 'ak', false, g);

  const pri = dropsOfKind(g, 'primary');
  const sec = dropsOfKind(g, 'secondary');
  const kit = dropsOfKind(g, 'kit');
  assert.equal(pri.length, 1, 'primary drop exists');
  assert.equal(pri[0].wid, 'ak', 'primary drop wid');
  assert.equal(sec.length, 1, 'secondary drop exists');
  assert.equal(sec[0].wid, 'usp', 'secondary drop wid');
  assert.equal(sec[0].ammo, 12, 'secondary drop ammo');
  assert.equal(sec[0].reserve, 24, 'secondary drop reserve');
  assert.equal(kit.length, 1, 'kit drop exists');
  assert.equal(kit[0].kind, 'kit', 'kit drop kind');
  assert.equal(kit[0].wid, undefined, 'kit drop has no wid');
  // 投掷物不随死亡掉落
  assert.equal(dropsOfKind(g, 'nade').length, 0, 'no nade drop');
  // 死亡清空装备
  assert.equal(p.weapons.primary, null, 'clear primary');
  assert.equal(p.weapons.secondary, null, 'clear secondary');
  assert.equal(p.weapons.kit, false, 'clear kit');
}

// 2) 弹药封顶：超出弹匣/备弹时掉落封顶到武器容量
{
  const g = fresh();
  const p = g.player;
  p.weapons.primary = null;
  p.weapons.secondary = 'glock';
  p.ammoMap.glock = 999; p.reserveMap.glock = 999;
  p.x = 500; p.y = 500;

  killEntity(p, null, 'knife', false, g);

  const sec = dropsOfKind(g, 'secondary');
  assert.equal(sec.length, 1, 'secondary drop exists');
  assert.equal(sec[0].ammo, WEAPONS.glock.mag, 'drop ammo capped at mag');
  assert.equal(sec[0].reserve, WEAPONS.glock.reserve, 'drop reserve capped');
}

// 3) 无副武器 → 不掉落副武器；无拆弹钳 → 不掉落 kit
{
  const g = fresh();
  const p = g.player;
  p.weapons.primary = null;
  p.weapons.secondary = null;
  p.weapons.kit = false;
  p.x = 500; p.y = 500;

  killEntity(p, null, 'knife', false, g);

  assert.equal(dropsOfKind(g, 'secondary').length, 0, 'no secondary drop');
  assert.equal(dropsOfKind(g, 'kit').length, 0, 'no kit drop');
}

// 4) 拾取副武器：wid + 弹药/备弹 正确分配，掉落移除
{
  const g = fresh();
  const p = g.player;
  p.weapons.secondary = null;
  p.x = 500; p.y = 500;
  g.drops.push({ x: 500, y: 500, kind: 'secondary', wid: 'deagle', ammo: 7, reserve: 35, life: 45 });

  pickupWeapon(p, g);

  assert.equal(p.weapons.secondary, 'deagle', 'secondary assigned');
  assert.equal(p.ammoMap.deagle, 7, 'secondary ammo assigned');
  assert.equal(p.reserveMap.deagle, 35, 'secondary reserve assigned');
  assert.equal(g.drops.length, 0, 'secondary drop consumed');
}

// 5) 已持有副武器 → 不重复拾取，掉落保留
{
  const g = fresh();
  const p = g.player;
  p.weapons.secondary = 'usp';
  p.x = 500; p.y = 500;
  g.drops.push({ x: 500, y: 500, kind: 'secondary', wid: 'deagle', ammo: 7, reserve: 35, life: 45 });

  pickupWeapon(p, g);

  assert.equal(p.weapons.secondary, 'usp', 'secondary unchanged');
  assert.equal(g.drops.length, 1, 'secondary drop kept');
}

// 6) 拾取拆弹钳：仅 CT 且未持有
{
  const g = fresh();
  const p = g.player;
  p.team = 'ct';
  p.weapons.kit = false;
  p.x = 500; p.y = 500;
  g.drops.push({ x: 500, y: 500, kind: 'kit', life: 45 });

  pickupWeapon(p, g);

  assert.equal(p.weapons.kit, true, 'CT picks up kit');
  assert.equal(g.drops.length, 0, 'kit drop consumed');
}

// 7) T 方不可拾取 kit；CT 已持有 kit 不再拾取
{
  const g = fresh();
  const p = g.player;
  p.team = 't';
  p.x = 500; p.y = 500;
  g.drops.push({ x: 500, y: 500, kind: 'kit', life: 45 });

  pickupWeapon(p, g);

  assert.equal(p.weapons.kit, false, 'T cannot pick kit');
  assert.equal(g.drops.length, 1, 'kit drop kept for T');
}
{
  const g = fresh();
  const p = g.player;
  p.team = 'ct';
  p.weapons.kit = true;
  p.x = 500; p.y = 500;
  g.drops.push({ x: 500, y: 500, kind: 'kit', life: 45 });

  pickupWeapon(p, g);

  assert.equal(p.weapons.kit, true, 'CT kit kept');
  assert.equal(g.drops.length, 1, 'kit drop kept when already held');
}

// 8) 同位置多掉落逐帧拾取：副武器 + kit 都能被捡完
{
  const g = fresh();
  const p = g.player;
  p.team = 'ct';
  p.weapons.secondary = null;
  p.weapons.kit = false;
  p.x = 500; p.y = 500;
  g.drops.push(
    { x: 500, y: 500, kind: 'secondary', wid: 'usp', ammo: 12, reserve: 36, life: 45 },
    { x: 500, y: 500, kind: 'kit', life: 45 }
  );

  pickupAll(p, g);

  assert.equal(p.weapons.secondary, 'usp', 'sequential secondary pickup');
  assert.equal(p.weapons.kit, true, 'sequential kit pickup');
  assert.equal(g.drops.length, 0, 'all drops consumed');
}

// 9) 确定性：相同输入 → 相同掉落（位置/种类/wid/弹药完全一致）
{
  const run = () => {
    const g = fresh();
    const p = g.player;
    p.team = 'ct';
    p.weapons.primary = 'm4';
    p.weapons.secondary = 'p250';
    p.weapons.kit = true;
    p.ammoMap.m4 = 30; p.reserveMap.m4 = 90;
    p.ammoMap.p250 = 13; p.reserveMap.p250 = 26;
    p.x = 123; p.y = 456;
    killEntity(p, null, 'm4', false, g);
    return g.drops.map((d) => ({ kind: d.kind, wid: d.wid, ammo: d.ammo, reserve: d.reserve, x: d.x, y: d.y }));
  };
  assert.deepEqual(run(), run(), 'death drops deterministic');
}

// 10) HUD 提示：kit 掉落显示"拾取 拆弹钳"，仅 CT 未持有；不可拾取方不提示
{
  const g = fresh();
  const p = g.player;
  p.team = 'ct';
  p.weapons.kit = false;
  p.x = 500; p.y = 500;
  p.angle = 0;
  g.viewMode = 'fps';
  g.drops.push({ x: 500, y: 500, kind: 'kit', life: 45 });

  const act = fpsInteractAction(g);
  assert.ok(act, 'kit prompt appears');
  assert.equal(act.label, '拾取 拆弹钳', 'kit prompt label');
  assert.ok(fpsAimInteractAction(g), 'aimed kit prompt appears');
  assert.equal(fpsAimInteractAction(g).label, '拾取 拆弹钳', 'aimed kit prompt label');
}
{
  const p = { team: 't', weapons: { kit: false, primary: null } };
  assert.equal(dropPickupLabel(p, { kind: 'kit' }), null, 'T no kit prompt');
}
{
  const p = { team: 'ct', weapons: { kit: true, primary: null } };
  assert.equal(dropPickupLabel(p, { kind: 'kit' }), null, 'CT with kit no prompt');
}
{
  const p = { team: 'ct', weapons: { kit: false, primary: null } };
  assert.equal(dropPickupLabel(p, { kind: 'kit' }), '拾取 拆弹钳', 'CT without kit prompt');
  assert.equal(dropPickupLabel(p, { kind: 'secondary', wid: 'usp' }), '拾取 USP-S', 'secondary prompt');
  assert.equal(dropPickupLabel(p, { kind: 'primary', wid: 'ak', ammo: 30, reserve: 90 }), '拾取 AK-47', 'primary prompt');
  const withAk = { team: 'ct', weapons: { kit: false, primary: 'ak' } };
  assert.equal(dropPickupLabel(withAk, { kind: 'primary', wid: 'ak', ammo: 30, reserve: 90 }), null, 'own primary no prompt');
}

console.log('fx-drop-slot: all PASS');
