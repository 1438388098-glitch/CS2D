import {WEAPONS, ECONOMY, diffOf, MAX_DECALS, TILE} from './config.js';
import {killRewardFor, addMoney, clearEquipment} from './economy.js';
import {passableTolerant, los, tileAt, getGrid, getMap, invalidatePathCache} from './map.js';
import {weaponDef, wkey, ammoFor, reserveFor} from './entities.js';
import {ctx} from './ctx.js';
import {clamp, rand, angDiff, viewCap} from './utils.js';
import {report, MSG} from './info.js';

import {endRound, spawnParticle} from './game.js';
import {spawnGoldBurst, spawnEmbers} from './burst-fx.js';
import {DEATH_MARKER_LIFE, TRACER_LIFE} from './render.js';
import {KILL_LABEL_DUR} from './killcam-fx.js';
import {HIT_ARC_DURATION} from './damage-fx.js';
import {dropBomb} from './bomb.js';
import {throwGrenade} from './grenades.js';
import {effectiveSpread, registerShot, headshotChance, distanceFalloff} from './ballistic.js';
import {addRipple} from './water-fx.js';
import {recordNemesisDeath, recordRevenge} from './nemesis.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);
const mapTile = () => getMap()?.tile || TILE;

export const RECOIL_RECOVER = 2.2;

export function startReload(e, game) {
  if (e.dead) return;
  const w = weaponDef(e);
  if (e.reloading || !w || w.kind === 'knife') return;
  if (w.mag <= 0) return;
  let r = reserveFor(e);
  if (ammoFor(e) >= w.mag || r <= 0) return;
  e.reloading = true;
  e.reloadT = w.reload / 1000 * (e.reloadMult || 1);
  emit('sfx', { name: 'reload', vol: 0.5, x: e.x, y: e.y, game });
}

export function finishReload(e, game) {
  const w = weaponDef(e);
  if (!w || w.mag <= 0) { e.reloading = false; return; }
  if (game) emit('sfx', { name: 'reloadEnd', vol: 0.4, x: e.x, y: e.y, game });
  const k = wkey(e);
  const need = w.mag - (e.ammoMap[k] || 0);
  const r = e.reserveMap[k] === undefined ? w.reserve : e.reserveMap[k];
  const take = Math.min(need, r);
  e.ammoMap[k] = (e.ammoMap[k] || 0) + take;
  e.reserveMap[k] = r - take;
  e.reloading = false;
}

export function fireWeapon(e, game) {
  if (e.dead) return;
  if (e.stunT > 0) return;
  if (e.fireCd > 0) return;
  if (e.reloading) { e.reloading = false; e.reloadT = 0; }
  if (e.slot && e.slot.indexOf('nade:') === 0) {
    throwGrenade(e, game);
    e.fireCd = 0.5;
    return;
  }
  const w = weaponDef(e);
  if (!w) return;
  if (w.kind === 'knife') {
    meleeAttack(e, game);
    e.fireCd = 60 / WEAPONS.knife.rpm;
    return;
  }
  const k = wkey(e);
  if (w.mag > 0) {
    if (e.ammoMap[k] === undefined) e.ammoMap[k] = w.mag;
    if (e.ammoMap[k] <= 0) {
      emit('sfx', { name: 'empty', vol: 0.5, x: e.x, y: e.y, game });
      startReload(e, game);
      return;
    }
  }
  // bot AWP 开镜态：站定且有交战目标才开镜（此前 bot 永不开镜，全程 14° 散布形同虚设）
  if (e.bot && w.kind === 'sniper') {
    const botSpeed = Math.hypot(e.vx || 0, e.vy || 0);
    e.scoped = botSpeed < 30 && !!e.aimTarget;
  }
  let spread = effectiveSpread(w, e);
  registerShot(e);
  if (e.bot) spread *= (e.aiParams || diffOf(game)).spreadMult;
  // S3 微观增强：探身对枪精度（探身状态 peekT>0 时散布减免，H11 专用）
  if (e.bot && e.peekT > 0 && e.aiParams && e.aiParams.peekSkill !== undefined) {
    spread *= e.aiParams.peekSkill;
  }
  let moveSpread = 0;
  const recoilSpread = e.recoil * 0.6;
  if (w.kind === 'sniper') {
    // bot 开镜散布按 spreadMult 放宽（冠军 1.5° → easy 4.6°），避免 0.15° 激光成必中挂
    if (e.scoped) spread = e.bot ? 0.3 + 2.4 * ((e.aiParams || diffOf(game)).spreadMult || 1) : 0.15;
    moveSpread = e.scoped ? 0 : moveSpread;
  }
  const pellets = w.pellets || 1;
  for (let pi = 0; pi < pellets; pi++) {
    const spreadAngle = (spread + moveSpread + recoilSpread) * (rand() * 2 - 1) * (Math.PI / 180);
    fireRay(e, game, e.angle + spreadAngle, w, w.dmg, pellets > 1);
  }
  if (w.mag > 0 && !e.infiniteAmmo) e.ammoMap[k] -= 1;
  if (e === game.player) game.stats.shots++;
  e.recoil = clamp(e.recoil + (w.kind === 'sniper' ? 0.09 : (w.kind === 'pistol' ? 0.14 : 0.11)), 0, 2.4);
  e.fireCd = 60 / w.rpm;
  e.lastShot = game.time * 1000;
  e.muzzleT = 0.06;
  if (!e.bot) {
    spawnParticle(game, { kind: 'shell', x: e.x + Math.cos(e.angle + 1.4) * 10, y: e.y + Math.sin(e.angle + 1.4) * 10, vx: Math.cos(e.angle + rand(1, 2.2)) * rand(60, 140), vy: Math.sin(e.angle + rand(1, 2.2)) * rand(60, 140), life: 0.5, size: 2, spin: rand(0, Math.PI * 2) });
  }
  if (w.kind === 'sniper') {
    if (!e.bot) {
      e.scoped = !!(e === game.player && game.input && game.input.mouse && game.input.mouse.rdown);
      if (e.scoped && game.zoom !== undefined) game.zoom = 0.75;
    }
    emit('sfx', { name: 'awp', vol: 0.9, x: e.x, y: e.y, game, wid: e.weapons.primary || e.weapons.secondary });
    game.shake = Math.max(game.shake, 5);
  } else if (w.kind === 'shotgun') {
    emit('sfx', { name: 'shotgun', vol: 0.9, x: e.x, y: e.y, game, wid: e.weapons.primary || e.weapons.secondary });
  } else if (w.kind === 'smg') {
    emit('sfx', { name: 'smg', vol: 0.8, x: e.x, y: e.y, game, wid: e.weapons.primary || e.weapons.secondary });
  } else if (w.kind === 'pistol') {
    emit('sfx', { name: 'pistol', vol: 0.8, x: e.x, y: e.y, game, wid: e.weapons.primary || e.weapons.secondary });
  } else {
    emit('sfx', { name: 'shot', vol: 0.85, x: e.x, y: e.y, game, wid: e.weapons.primary || e.weapons.secondary });
  }
  const expRad = Math.min(
    w.kind === 'rifle' ? 950 : (w.kind === 'sniper' ? 1300 : (w.kind === 'smg' ? 700 : (w.kind === 'pistol' ? 450 : (w.kind === 'shotgun' ? 500 : 0)))),
    viewCap(game)
  );
  if (expRad > 0) {
    for (const o of game.entities) {
      if (o.bot && !o.dead && o.team !== e.team && Math.hypot(o.x - e.x, o.y - e.y) < expRad) {
        if (!los(game, e.x, e.y, o.x, o.y)) continue;
        o.lastKnown = { x: e.x, y: e.y };
        o.lastKnownT = 0;
        if (o.aimTarget === null && o.path !== null) o.path = null;
      }
    }
  }
}

function meleeAttack(e, game) {
  const wk = WEAPONS.knife;
  const heavy = e.bot ? rand() < 0.25 : game.input.rdown;
  const range = heavy ? 95 : 75;
  const dmg = heavy ? wk.dmg2 : wk.dmg;
  let hitAny = false;
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    if (Math.hypot(o.x - e.x, o.y - e.y) < range + o.rad) {
      const a = Math.atan2(o.y - e.y, o.x - e.x);
      if (Math.abs(angDiff(a, e.angle)) < 0.75) {
        hitAny = true;
        applyDamage(o, dmg, { killer: e, weapon: 'knife', head: false }, game);
      }
    }
  }
  if (hitAny) emit('sfx', { name: 'hit', vol: 0.8, x: e.x, y: e.y, game });
  else emit('sfx', { name: 'knife', vol: 0.5, x: e.x, y: e.y, game });
  for (let i = 0; i < 5; i++) {
    const a = e.angle + rand(-0.5, 0.5);
    spawnParticle(game, { kind: 'swing', x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 0.15, size: 2 });
  }
}

function fireRay(e, game, ang, w, dmg, isPellet) {
  const ox = e.x, oy = e.y;
  const range = w.range;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const pitch = Number.isFinite(e.pitch) ? e.pitch : 0;
  const pitchTan = Math.tan(pitch);
  const tile = (getMap() && getMap().tile) || TILE;
  const eyeH = (0.5 + (e.height || 0)) * tile;
  let best = null;
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    const dx = o.x - ox, dy = o.y - oy;
    const along = dx * cos + dy * sin;
    // 低打高：高台目标有效半径缩小 25%（精度惩罚下沉到命中几何，与 aimTarget 无关，玩家/AI 统一生效）
    const effRad = (o.height >= 0.75 && e.height < 0.5) ? (o.rad + 2) * 0.75 : o.rad + 2;
    if (along < 0 || along > range + o.rad) continue;
    const perp = Math.abs(dx * sin - dy * cos);
    if (Math.abs(pitch) > 0.02) {
      const targetBase = (o.height || 0) * tile;
      const rayZ = eyeH + along * pitchTan;
      const targetCenter = targetBase + tile * 1.35;
      if (Math.abs(rayZ - targetCenter) > tile) continue;
    }
    if (perp < effRad && (best === null || along < best.t)) best = { t: along, ent: o, perp };
  }
  let wallT = range;
  let penMult = 1;
  let inWall = false;
  let inWater = false;
  const steps = Math.ceil(range / 6);
  for (let s = 1; s <= steps; s++) {
    const px = ox + cos * s * 6, py = oy + sin * s * 6;
    const c = tileAt(px, py);
    // 子弹入水：射线跨入浅/深水瓦片时在入水点产生涟漪环（浅水穿透、深水被挡）
    const water = c === '~' || c === '≈';
    if (water && !inWater) {
      addRipple(game, px, py, 2);
      inWater = true;
    } else if (!water) {
      inWater = false;
    }
    if (c === '=') {
      if (!inWall) {
        inWall = true;
        penMult *= 0.7;
        if (penMult < 0.49) { wallT = s * 6; break; }
        addDecal(game, px, py, 'bullet', ang);
        emit('sfx', { name: 'penetrate', vol: 0.5, x: px, y: py, game });
      }
      continue;
    }
    inWall = false;
    if (c === 'C' && e.height >= 0.75) continue;
    if (c === 'D') { hitCrateByShot(game, px, py, e); wallT = s * 6; break; }
    // 深水挡弹（spec 4.3：水下隐蔽 + 弹丸被水阻挡）；浅水 ~ 可穿透
    if (c === '≈') { addRipple(game, px, py, 5); wallT = s * 6; break; }
    if (!passableTolerant(px, py)) {
      if (c === 'o') hitBarrelByShot(game, px, py, e);
      wallT = s * 6;
      break;
    }
  }
  for (const smoke of game.smokes) {
    const st = Math.ceil(range / 12);
    for (let s2 = 1; s2 <= st; s2++) {
      if (Math.hypot(ox + cos * s2 * 12 - smoke.x, oy + sin * s2 * 12 - smoke.y) < smoke.r + 8) {
        wallT = Math.min(wallT, s2 * 12);
        break;
      }
    }
  }
  const tx = ox + cos * wallT, ty = oy + sin * wallT;
  const hit = best && best.t <= wallT ? best.ent : null;
  if (hit) {
    if (e === game.player) game.stats.hits++;
    // 爆头由瞄准精度驱动（中心命中/近距离/精密武器 → 概率更高），不再纯随机
    const head = !isPellet && rand() < headshotChance(w, hit, best.perp, best.t);
    let finalDmg = dmg * (e.dmgMult || 1);
    finalDmg *= penMult;
    const dd = best.t;
    finalDmg *= distanceFalloff(w, dd);
    applyDamage(hit, Math.max(1, finalDmg), { killer: e, weapon: wkey(e), head }, game);
    // 联机：命中远端玩家实体时把伤害事件发给对方，由对方对"自己"权威结算，
    // 避免只在本端扣血随后被对方快照覆盖（双方同 seed 确定性模拟，结算结果一致）。
    if (hit.netRole === 'remote' && e === game.player && game.lan && typeof game.lan.send === 'function') {
      game.lan.send({ type: 'hit', dmg: Math.max(1, finalDmg), head: !!head, weapon: wkey(e) });
    }
    const hitLen = Math.max(4, best.t - Math.sqrt(Math.max(0, hit.rad * hit.rad - best.perp * best.perp)));
    const hx = ox + cos * hitLen, hy = oy + sin * hitLen;
    spawnBlood(hx, hy, ang, head, game);
    if (head) spawnGoldBurst(game, spawnParticle, hx, hy, ang);
    game.tracers.push({ x1: ox, y1: oy, x2: hx, y2: hy, life: TRACER_LIFE, kind: w.kind, team: e.team });
    addDecal(game, hx, hy, 'hole', ang);
    recordImpact(game, hx, hy);
  } else {
    game.tracers.push({ x1: ox, y1: oy, x2: tx, y2: ty, life: TRACER_LIFE, kind: w.kind, team: e.team });
    addDecal(game, tx, ty, 'spark', ang);
    recordImpact(game, tx, ty);
    for (let sp = 0; sp < 6; sp++) {
      spawnParticle(game, { kind: 'spark', x: tx, y: ty, vx: Math.cos(ang + rand(-1, 1)) * rand(60, 260), vy: Math.sin(ang + rand(-1, 1)) * rand(60, 260), life: rand(0.1, 0.3), size: 1.5 });
    }
  }
  if (e.bot && game.player && !game.player.dead && game.player.team !== e.team) {
    const pDist = Math.hypot(ox - game.player.x, oy - game.player.y);
    if (pDist < 1500) {
      const pAlong = (game.player.x - ox) * cos + (game.player.y - oy) * sin;
      if (pAlong > 0 && pAlong < range) {
        const pPerp = Math.abs((game.player.x - ox) * sin - (game.player.y - oy) * cos);
        if (pPerp < game.player.rad + 30) {
          game.player.lastDmgFrom = e;
          game.player.lastDmgT = game.time * 1000;
        }
      }
    }
  }
}

export function barrelAt(game, px, py) {
  if (!game.barrels) return null;
  const tx = Math.floor(px / mapTile()), ty = Math.floor(py / mapTile());
  for (const b of game.barrels) if (b.tx === tx && b.ty === ty) return b;
  return null;
}

export function crateAt(game, px, py) {
  if (!game.crates) return null;
  const tx = Math.floor(px / mapTile()), ty = Math.floor(py / mapTile());
  for (const c of game.crates) if (c.tx === tx && c.ty === ty) return c;
  return null;
}

export function damageCrate(game, c, dmg, shooter) {
  if (!c) return;
  c.hp -= dmg;
  emit('sfx', { name: 'crateHit', vol: 0.45, x: c.x, y: c.y, game });
  for (let i = 0; i < 3; i++) {
    spawnParticle(game, { kind: 'wood', x: c.x, y: c.y, vx: rand(-70, 70), vy: rand(-90, -10), life: 0.35, size: rand(2, 4) });
  }
  if (c.hp <= 0) destroyCrate(game, c, shooter);
}

export function hitCrateByShot(game, px, py, shooter) {
  const c = crateAt(game, px, py);
  if (!c) return;
  damageCrate(game, c, 1, shooter);
}

export function destroyCrate(game, c, shooter) {
  game.crates = game.crates.filter((x) => x !== c);
  const grid = getGrid();
  grid[c.ty][c.tx] = '.';
  invalidatePathCache();
  game._shadowRev = (game._shadowRev || 0) + 1;
  emit('sfx', { name: 'crateBreak', vol: 0.7, x: c.x, y: c.y, game });
  for (let i = 0; i < 10; i++) {
    spawnParticle(game, { kind: 'wood', x: c.x, y: c.y, vx: rand(-140, 140), vy: rand(-220, -20), life: rand(0.3, 0.6), size: rand(2, 5) });
  }
  for (const o of game.entities) {
    if (o.bot && !o.dead && o.team !== shooter.team && Math.hypot(o.x - c.x, o.y - c.y) < 1200) {
      if (!los(game, c.x, c.y, o.x, o.y)) continue;
      o.lastKnown = { x: c.x, y: c.y };
      o.lastKnownT = 0;
      if (o.aimTarget === null && o.path !== null) o.path = null;
    }
  }
}

export function hitBarrelByShot(game, px, py, shooter) {
  const b = barrelAt(game, px, py);
  if (!b) return;
  b.hp--;
  emit('sfx', { name: 'hit', vol: 0.6, x: b.x, y: b.y, game });
  if (b.hp <= 0) explodeBarrel(game, b, shooter);
}

export function explodeBarrel(game, b, shooter) {
  game.barrels = game.barrels.filter((x) => x !== b);
  const grid = getGrid();
  grid[b.ty][b.tx] = '.';
  invalidatePathCache();
  game._shadowRev = (game._shadowRev || 0) + 1;
  emit('sfx', { name: 'boom', vol: 1, x: b.x, y: b.y, game });
  game.shake = Math.max(game.shake, 8);
  for (const c of game.crates.slice()) {
    if (Math.hypot(c.x - b.x, c.y - b.y) < 160) damageCrate(game, c, 2, shooter);
  }
  for (let i = 0; i < 6; i++) {
    spawnParticle(game, { kind: 'boom', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.5, size: 160 });
    spawnParticle(game, { kind: 'fire', x: b.x + rand(-40, 40), y: b.y + rand(-40, 40), vx: rand(-60, 60), vy: rand(-80, 0), life: 0.6, size: 18 });
  }
  spawnEmbers(game, spawnParticle, b.x, b.y, 6, 30);
  addDecal(game, b.x, b.y, 'scorch', 0);
  for (const o of game.entities) {
    if (o.dead) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < 160) {
      const dmg = o.team === shooter.team ? 30 : 60;
      applyDamage(o, dmg, { killer: shooter, weapon: 'barrel', head: false }, game);
    }
  }
  for (const o of game.entities) {
    if (o.bot && !o.dead && o.team !== shooter.team && Math.hypot(o.x - b.x, o.y - b.y) < 1600) {
      if (!los(game, b.x, b.y, o.x, o.y)) continue;
      o.lastKnown = { x: b.x, y: b.y };
      o.lastKnownT = 0;
      if (o.aimTarget === null && o.path !== null) o.path = null;
    }
  }
}

export function applyDamage(v, dmg, opt, game) {
  if (v.dead) return;
  const head = opt.head;
  const armor = v.armor > 0;
  // 护甲穿透：狙击等穿甲武器按 armorPen 比例无视护甲（AWP 身体一枪击杀全甲目标，符合 CS 规则）
  const penW = typeof opt.weapon === 'string' ? WEAPONS[opt.weapon] : null;
  const armorPen = (penW && penW.armorPen) || 0;
  let hpLoss, armLoss;
  if (head && (!armor || !v.helmet)) {
    hpLoss = dmg * 4;
    armLoss = 0;
  } else if (head && v.helmet) {
    hpLoss = dmg * 4 * 0.75;
    armLoss = 0;
  } else if (armor) {
    const absorbed = Math.min(dmg * 0.4 * (1 - armorPen), v.armor);
    hpLoss = dmg - absorbed;
    armLoss = absorbed;
  } else {
    hpLoss = dmg;
    armLoss = 0;
  }
  if (opt.killer && opt.killer !== v) {
    opt.killer.dmgTotal = (opt.killer.dmgTotal || 0) + hpLoss;
    if (opt.killer === game.player) {
      game.dmgT = 0;
      if (head) emit('sfx', { name: 'head', vol: 0.9, x: v.x, y: v.y, game });
      else if ((v.armor || 0) > 0 || v.helmet) emit('sfx', { name: 'hitArmor', vol: 0.7, x: v.x, y: v.y, game });
      else emit('sfx', { name: 'hit', vol: 0.7, x: v.x, y: v.y, game });
      game.hitMarkT = head ? 0.35 : 0.22;
      game.hitFlashT = Math.max(game.hitFlashT || 0, head ? 0.22 : 0.14);
      if (head) game.headshotT = 0.25;
      recordHitOutline(game, v, head);
      // 伤害报告统计（本回合造成的实际 HP 损失）
      game.player.dmgGiven = (game.player.dmgGiven || 0) + hpLoss;
      if (head) game.player.dmgHeads = (game.player.dmgHeads || 0) + 1;
    }
    if (opt.killer.bot && v === game.player) {
      game.dmgT = 0.5;
      game.dmgSpreadT = Math.max(game.dmgSpreadT || 0, head ? 0.9 : 0.55);
      game.shake = Math.max(game.shake, head ? 8 : 4);
    }
    // 受击方向红弧（candidate-308）：玩家被击中时记录伤害来源方向与闪现倒计时（0.3s 渐隐）
    if (v === game.player) {
      v.lastHitAng = Math.atan2(opt.killer.y - v.y, opt.killer.x - v.x);
      v.hitFxT = HIT_ARC_DURATION;
      v.hitFxPower = head ? 1 : clamp(hpLoss / 30, 0.35, 1);
    }
  }
  v.armor = Math.max(0, v.armor - armLoss);
  v.hp -= hpLoss;
  if (v.hp <= 0) {
    v.hp = 0;
    killEntity(v, opt.killer, opt.weapon, head, game);
  } else if (opt.killer && opt.killer !== v) {
    // 致命一击不覆盖 lastDmgFrom，保留 6 秒内的前序伤害者供助攻判定
    v.lastDmgFrom = opt.killer;
    v.lastDmgT = game.time * 1000;
  }
  // 命中停顿：FPS 全量命中停顿；2D 模式仅致命/爆头轻微停顿（增强打击感，避免持续卡顿）
  if (game.player && (v === game.player || (opt.killer && opt.killer === game.player)) && game.opts.hitstop !== false) {
    const killerWeaponKind = typeof opt.weapon === 'object' ? opt.weapon.kind : (WEAPONS[opt.weapon] ? WEAPONS[opt.weapon].kind : opt.weapon);
    const amt = head ? 0.08 : (killerWeaponKind === 'sniper' ? 0.12 : (killerWeaponKind === 'grenade' ? 0.1 : 0.05));
    const is2d = game.viewMode !== 'fps';
    const scaled = is2d ? (head || v.hp <= 0 ? amt * 0.6 : 0) : amt;
    game.hitPauseT = Math.max(game.hitPauseT || 0, scaled);
  }
  // 护甲伤害用蓝色数字区分（护甲吸收的部分有独立视觉语义）
  game.dmgPops.push({ x: v.x, y: v.y, dmg: hpLoss, head: !!head, armor: armLoss > 0, t: 0.8 });
  if (game.dmgPops.length > 12) game.dmgPops.shift();
  if (v.bot && v.highPointT > 0) {
    v.highPointT -= 2;
    if (v.highPointT <= 0) { v.objCache = null; v.path = null; }
  }
}

export function recordHitOutline(game, target, head) {
  if (!game || !target || target === game.player) return;
  game.hitOutlines = game.hitOutlines || [];
  game.hitOutlines.push({ target, team: target.team, head: !!head, t: head ? 0.45 : 0.3 });
  if (game.hitOutlines.length > 8) game.hitOutlines.shift();
}

export function killEntity(v, killer, weapon, head, game) {
  if (v.dead) return;
  v.dead = true;
  v.deaths++;
  v.vx = 0; v.vy = 0;
  v.deathT = DEATH_MARKER_LIFE;
  if (v.team === 'ct' && game.bomb && game.bomb.planted && game.bomb.defusing) game.bomb.defusing = false;
  const wname = WEAPONS[weapon] ? WEAPONS[weapon].name : (weapon === 'bomb' ? '炸弹' : (weapon === 'grenade' ? '手雷' : (weapon === 'barrel' ? '油桶' : '战术刀')));
  if (killer && killer !== v) {
    killer.kills++;
    // 按武器累计击杀（结算界面武器榜数据源）
    if (!killer.weapKills) killer.weapKills = {};
    const wk = WEAPONS[weapon] ? weapon : (weapon === 'grenade' ? 'grenade' : 'knife');
    killer.weapKills[wk] = (killer.weapKills[wk] || 0) + 1;
    addMoney(killer, Math.round(killRewardFor(weapon) * ((game.roundEvent && game.roundEvent.killMult) || 1)));
    for (const o of game.entities) {
      if (o !== killer && o.team === killer.team && !o.dead) {
        if (v.lastDmgFrom === o && (game.time * 1000 - v.lastDmgT) < 6000) {
          o.assists++;
          addMoney(o, ECONOMY.ASSIST_MONEY);
          // 助攻即时反馈：此前助攻静默计数，与击杀的全套反馈落差过大
          if (o === game.player) emit('sysfeed', { text: '助攻 +$' + ECONOMY.ASSIST_MONEY });
        }
      }
    }
  }
  emit('killfeed', {
    k: killer ? killer.name : '?', v: v.name, w: wname, head, tm: killer ? killer.team : null,
    me: killer === game.player ? 'k' : (v === game.player ? 'v' : null),
    n: killer === game.player ? (killer.streak || 0) + 1 : null
  });
  // 回合悬赏结算：击杀赏金目标额外入账（bot 也可争夺，观战更有戏剧性）
  if (game.bounty && v === game.bounty && killer && killer.team !== v.team) {
    addMoney(killer, ECONOMY.BOUNTY_MONEY);
    emit('sysfeed', { text: (killer === game.player ? '悬赏到手 ' : '赏金目标被 ' + killer.name + ' 击杀 · ') + '+$' + ECONOMY.BOUNTY_MONEY });
    game.bounty = null;
  }
  // 实体级击杀事件（军备竞赛等模式的钩子）：killfeed 只有名字，这里带引用
  emit('entityKill', { killer, victim: v, weapon, game });
  if (v.hasBomb && (!game.bomb || !game.bomb.planted)) {
    dropBomb(v.x, v.y, game);
  }
  if (killer === game.player) {
    emit('sfx', { name: 'kill', vol: 0.6, game });
    game.killRingT = 0.7;
    game.killFlashT = 0.35;
    killer.streak = (killer.streak || 0) + 1;
    killer.wKills[weapon] = (killer.wKills[weapon] || 0) + 1;
    game.killStreak = killer.streak;
    game.killLabelHead = !!head;
    game.player.killStreakT = KILL_LABEL_DUR;
    if (head) game.stats.headshots++;
    // 宿敌复仇：击杀跨局宿敌额外赏金并清零其宿敌值
    if (v.nemesis) {
      addMoney(killer, ECONOMY.NEMESIS_BONUS);
      emit('sysfeed', { text: '宿敌复仇！干掉 ' + v.name + ' · +$' + ECONOMY.NEMESIS_BONUS });
      recordRevenge(v.name);
      v.nemesis = false;
    }
    if (killer.streak >= 5) {
      emit('streak', { n: killer.streak });
      emit('sfx', { name: 'streak', vol: 0.8, game });
    } else if (killer.streak >= 2) {
      emit('streak', { n: killer.streak });
      emit('sfx', { name: 'doublekill', vol: 0.7, game });
    }
  }
  if (v === game.player) {
    v.streak = 0;
    game.player.killStreakT = 0;
    game.killStreak = 0;
    game.lastKiller = killer;
    // 宿敌记账：跨局记住杀你最多的 bot
    recordNemesisDeath(killer && killer.bot ? killer.name : null);
    // 击杀镜头：死亡后短暂锁定击杀者视角（0.9s），随后切入队友观战
    game.killCamT = 0.9;
    emit('deathinfo', { killer: killer ? killer.name : '环境', weapon: wname, head: !!head });
    // 伤害报告：本回合造成总伤害 / 爆头数
    emit('damagereport', { dmg: Math.round(v.dmgGiven || 0), heads: v.dmgHeads || 0 });
  }
  // 队内报告：bot 阵亡 → 同队收到"击杀点"消息（队友据此调整）
  if (v.bot) report(game, v, MSG.KILL, killer && killer.bot ? killer.x : v.x, killer && killer.bot ? killer.y : v.y);
  // 对手建模：记录玩家（敌方视角）击杀位置，供 CT 队长反制守点分配
  if (killer === game.player) {
    game.playerKills = game.playerKills || [];
    game.playerKills.push({ x: v.x, y: v.y, t: game.time });
    if (game.playerKills.length > 20) game.playerKills.shift();
  }
  spawnBlood(v.x, v.y, rand() * Math.PI * 2, head, game);
  game.decals.push({ type: 'corpse', x: v.x, y: v.y, angle: v.angle, team: v.team, life: 60 });
  redrawDecals(game);
  if (v.weapons.primary) {
    const pw = WEAPONS[v.weapons.primary];
    game.drops.push({
      x: v.x, y: v.y, kind: 'primary', wid: v.weapons.primary,
      ammo: Math.min(pw.mag, (v.ammoMap[v.weapons.primary] === undefined ? pw.mag : v.ammoMap[v.weapons.primary])),
      reserve: Math.min(pw.reserve, v.reserveMap[v.weapons.primary] === undefined ? pw.reserve : v.reserveMap[v.weapons.primary]),
      life: 45
    });
  }
  // CS 规则：死亡掉落副武器与拆弹钳（增加回合内拾取深度）
  if (v.weapons.secondary) {
    const sw = WEAPONS[v.weapons.secondary];
    game.drops.push({
      x: v.x, y: v.y, kind: 'secondary', wid: v.weapons.secondary,
      ammo: Math.min(sw.mag, (v.ammoMap[v.weapons.secondary] === undefined ? sw.mag : v.ammoMap[v.weapons.secondary])),
      reserve: Math.min(sw.reserve, v.reserveMap[v.weapons.secondary] === undefined ? sw.reserve : v.reserveMap[v.weapons.secondary]),
      life: 45
    });
  }
  if (v.weapons.kit) {
    game.drops.push({ x: v.x, y: v.y, kind: 'kit', life: 45 });
  }
  clearEquipment(v);
  if (!game.noRoundEnd) checkRoundEnd(game);
}

export function pickupWeapon(e, game) {
  if (e.dead) return;
  for (let i = 0; i < game.drops.length; i++) {
    const d = game.drops[i];
    if (d.noPickT > 0) continue;
    if (Math.hypot(e.x - d.x, e.y - d.y) > 46) continue;
    if (d.kind === 'kit') {
      if (e.team === 'ct' && !e.weapons.kit) {
        e.weapons.kit = true;
        if (e === game.player) { emit('toast', { text: '拾取了拆弹钳' }); emit('sysfeed', { text: 'You 捡起了拆弹钳' }); }
        game.drops.splice(i, 1);
      }
      continue;
    }
    const w = WEAPONS[d.wid];
    if (!w) { game.drops.splice(i, 1); continue; }
    if (d.kind === 'secondary') {
      if (!e.weapons.secondary) {
        e.weapons.secondary = d.wid;
        e.ammoMap[d.wid] = d.ammo;
        e.reserveMap[d.wid] = d.reserve;
        if (e === game.player) { emit('toast', { text: '拾取了 ' + w.name }); emit('sysfeed', { text: 'You 捡起了 ' + w.name }); }
        game.drops.splice(i, 1);
      }
      continue;
    }
    if (e.weapons.primary === d.wid) {
      e.ammoMap[d.wid] = Math.min(w.mag, (e.ammoMap[d.wid] || 0) + d.ammo);
      e.reserveMap[d.wid] = Math.min(w.reserve, (e.reserveMap[d.wid] || 0) + d.reserve);
    } else {
      if (e.weapons.primary) {
        const ow = WEAPONS[e.weapons.primary];
        game.drops.push({
          x: e.x, y: e.y, kind: 'primary', wid: e.weapons.primary,
          ammo: Math.min(ow.mag, (e.ammoMap[e.weapons.primary] === undefined ? ow.mag : e.ammoMap[e.weapons.primary])),
          reserve: e.reserveMap[e.weapons.primary] === undefined ? ow.reserve : e.reserveMap[e.weapons.primary],
          life: 45, noPickT: 0.5
        });
      }
      e.weapons.primary = d.wid;
      e.ammoMap[d.wid] = d.ammo;
      e.reserveMap[d.wid] = d.reserve;
      e.slot = 'primary';
      e.reloading = false; e.reloadT = 0; e.fireCd = 0.3;
      if (e === game.player) {
        emit('toast', { text: '拾取了 ' + w.name });
        emit('sysfeed', { text: 'You 捡起了 ' + w.name });
      }
    }
    game.drops.splice(i, 1);
    break;
  }
}

// 子弹弹着点印记（impact-fx 数据流）：命中墙体/掩体/敌人表面时记录确定性弹孔输入。
// 位置/表面字符/seed/t0 全部由命中点与 game.time 派生，无 Math.random（同输入恒同复现）。
export function recordImpact(game, x, y) {
  if (!game.impacts) game.impacts = [];
  game.impacts.push({
    x,
    y,
    tileType: tileAt(x, y),
    t0: game.time || 0,
    seed: ((Math.floor(x) * 73856093 ^ Math.floor(y) * 19349663) >>> 0) || 1
  });
}

export function addDecal(game, x, y, type, angle) {
  if (!game.decals) game.decals = [];
  game.decals.push({ type, x, y, angle, life: type === 'hole' ? 20 : type === 'scorch' ? 14 : 6 });
  if (game.decals.length > MAX_DECALS) game.decals.splice(0, game.decals.length - MAX_DECALS);
  redrawDecals(game);
}

export function redrawDecals(game) {
  if (!game.layers) return;
  const t = game.layers.decal.getContext('2d');
  t.clearRect(0, 0, game.layers.W, game.layers.H);
  for (const d of game.decals) {
    const a = clamp(d.life / 3, 0, 1);
    if (d.type === 'hole') {
      t.fillStyle = 'rgba(10,8,8,' + a * 0.9 + ')';
      t.beginPath(); t.arc(d.x, d.y, 3, 0, Math.PI * 2); t.fill();
    } else if (d.type === 'corpse') {
      t.save(); t.translate(d.x, d.y); t.rotate(d.angle);
      t.fillStyle = 'rgba(30,32,38,' + a * 0.95 + ')';
      t.beginPath(); t.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2); t.fill();
      t.fillStyle = d.team === 'ct' ? 'rgba(60,120,200,' + a * 0.9 + ')' : 'rgba(190,140,60,' + a * 0.9 + ')';
      t.beginPath(); t.ellipse(-4, -5, 4, 6, 0, 0, Math.PI * 2); t.fill();
      t.fillStyle = 'rgba(220,180,150,' + a + ')';
      t.beginPath(); t.arc(3, -8, 4.5, 0, Math.PI * 2); t.fill();
      t.fillStyle = 'rgba(0,0,0,0.8)'; t.fillRect(-2, -14, 8, 3);
      t.restore();
      t.fillStyle = 'rgba(120,10,10,' + a * 0.6 + ')';
      t.beginPath(); t.ellipse(d.x, d.y, 20, 14, 0, 0, Math.PI * 2); t.fill();
    } else if (d.type === 'spark') {
      t.fillStyle = 'rgba(255,190,90,' + a * 0.8 + ')';
      t.beginPath(); t.arc(d.x, d.y, 2.5, 0, Math.PI * 2); t.fill();
    } else if (d.type === 'bullet') {
      t.fillStyle = 'rgba(40,38,36,' + a * 0.85 + ')';
      t.beginPath(); t.arc(d.x, d.y, 3, 0, Math.PI * 2); t.fill();
      t.fillStyle = 'rgba(255,255,255,' + a * 0.18 + ')';
      t.beginPath(); t.arc(d.x - 1, d.y - 1, 1.2, 0, Math.PI * 2); t.fill();
    } else if (d.type === 'scorch') {
      // 爆炸焦痕：中心深黑 + 位置哈希不规则外缘（确定性，同点同形，回放可复现）
      const h = (n) => {
        let h2 = (Math.floor(d.x) * 73856093 ^ Math.floor(d.y) * 19349663 ^ n * 83492791) >>> 0;
        h2 = Math.imul(h2 ^ (h2 >>> 13), 2246822519) >>> 0;
        return (h2 >>> 0) / 4294967296;
      };
      const R = 22 + h(1) * 8;
      t.fillStyle = 'rgba(12,10,9,' + a * 0.55 + ')';
      t.beginPath();
      for (let i = 0; i <= 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        const rr2 = R * (0.75 + h(i + 2) * 0.5);
        const px2 = d.x + Math.cos(ang) * rr2, py2 = d.y + Math.sin(ang) * rr2;
        if (i === 0) t.moveTo(px2, py2); else t.lineTo(px2, py2);
      }
      t.closePath();
      t.fill();
      t.fillStyle = 'rgba(30,26,22,' + a * 0.5 + ')';
      t.beginPath(); t.arc(d.x, d.y, R * 0.55, 0, Math.PI * 2); t.fill();
    }
  }
  game._decalRev = (game._decalRev || 0) + 1;
}

function spawnBlood(x, y, ang, head, game) {
  const n = head ? 18 : 10;
  for (let i = 0; i < n; i++) {
    spawnParticle(game, { kind: 'blood', x, y, vx: Math.cos(ang + rand(-0.8, 0.8)) * rand(40, 220), vy: Math.sin(ang + rand(-0.8, 0.8)) * rand(40, 220), life: rand(0.3, 0.7), size: rand(1.5, 3.5) });
  }
}

function checkRoundEnd(game) {
  if (game.state === 'END') return;
  // 炸弹爆炸结算中：爆炸造成的团灭统一由 explodeBomb 按 'bomb' 结算（奖励 3500 + 正确文案）
  if (game._bombExploding) return;
  const tAlive = game.entities.filter((e) => e.team === 't' && !e.dead).length;
  const cAlive = game.entities.filter((e) => e.team === 'ct' && !e.dead).length;
  if (tAlive === 0 && cAlive === 0) { endRound(game, null, '同归于尽'); return; }
  if (tAlive === 0) { endRound(game, 'ct', '恐怖分子全灭', 'elimination'); return; }
  if (cAlive === 0) { endRound(game, 't', '反恐精英全灭', 'elimination'); return; }
}

export { checkRoundEnd };
