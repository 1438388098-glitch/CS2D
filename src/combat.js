import { WEAPONS, ECONOMY, DIFF, MAX_DECALS, TILE } from './config.js';
import { passableTolerant, collideCircle, los, tileAt, getGrid } from './map.js';
import { weaponDef, wkey, ammoFor, reserveFor } from './entities.js';
import { ctx } from './ctx.js';
import { clamp, rand, angDiff, viewCap } from './utils.js';
import { report, MSG } from './info.js';

import { endRound } from './game.js';
import { dropBomb } from './bomb.js';
import { throwGrenade } from './grenades.js';
import { effectiveSpread, registerShot, updateShotStreak, headshotChance } from './ballistic.js';

const emit = (evt, p) => ctx.bus.emit(evt, p);

export const RECOIL_RECOVER = 2.2;

export function startReload(e, game) {
  if (e.dead) return;
  const w = weaponDef(e);
  if (e.reloading || !w || w.kind === 'knife') return;
  if (w.mag <= 0) return;
  let r = reserveFor(e);
  // 设计意图：bot 备弹耗尽自动补满，避免 AI 因弹药管理卡死（训练/对战均如此）
  if (e.bot && r <= 0) {
    e.reserveMap[wkey(e)] = w.reserve;
    r = w.reserve;
  }
  if (ammoFor(e) >= w.mag || r <= 0) return;
  e.reloading = true;
  e.reloadT = w.reload / 1000;
  emit('sfx', { name: 'reload', vol: 0.5, x: e.x, y: e.y, game });
}

export function finishReload(e) {
  const w = weaponDef(e);
  if (!w || w.mag <= 0) { e.reloading = false; return; }
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
  if (e.reloading || e.fireCd > 0) return;
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
      startReload(e, game);
      return;
    }
  }
  let spread = effectiveSpread(w, e);
  if (e.aimTarget && e.aimTarget.height === 1 && e.height === 0) spread *= 1.25;
  registerShot(e);
  if (e.bot) spread *= (e.aiParams || DIFF[game.opts.diff] || DIFF.normal).spreadMult;
  let moveSpread = 0;
  const recoilSpread = e.recoil * 0.6;
  if (w.kind === 'sniper') {
    spread = e.scoped ? 0.15 : spread;
    moveSpread = e.scoped ? 0 : moveSpread;
  }
  const pellets = w.pellets || 1;
  for (let pi = 0; pi < pellets; pi++) {
    const spreadAngle = (spread + moveSpread + recoilSpread) * (rand() * 2 - 1) * (Math.PI / 180);
    fireRay(e, game, e.angle + spreadAngle, w, w.dmg, pellets > 1);
  }
  if (w.mag > 0) e.ammoMap[k] -= 1;
  if (e === game.player) game.stats.shots++;
  e.recoil = clamp(e.recoil + (w.kind === 'sniper' ? 0.09 : (w.kind === 'pistol' ? 0.14 : 0.11)), 0, 2.4);
  e.fireCd = 60 / w.rpm;
  e.lastShot = game.time * 1000;
  e.muzzleT = 0.06;
  if (!e.bot) {
    game.particles.push({ kind: 'shell', x: e.x + Math.cos(e.angle + 1.4) * 10, y: e.y + Math.sin(e.angle + 1.4) * 10, vx: Math.cos(e.angle + rand(1, 2.2)) * rand(60, 140), vy: Math.sin(e.angle + rand(1, 2.2)) * rand(60, 140), life: 0.5, size: 2, spin: rand(0, Math.PI * 2) });
  }
  if (w.kind === 'sniper') {
    e.scoped = false;
    emit('sfx', { name: 'awp', vol: 0.9, x: e.x, y: e.y, game });
    game.shake = Math.max(game.shake, 5);
  } else if (w.kind === 'shotgun') {
    emit('sfx', { name: 'shotgun', vol: 0.9, x: e.x, y: e.y, game });
  } else if (w.kind === 'pistol' || w.kind === 'smg') {
    emit('sfx', { name: 'pistol', vol: 0.8, x: e.x, y: e.y, game });
  } else {
    emit('sfx', { name: 'shot', vol: 0.85, x: e.x, y: e.y, game });
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
    game.particles.push({ kind: 'swing', x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 0.15, size: 2 });
  }
}

function fireRay(e, game, ang, w, dmg, isPellet) {
  const ox = e.x, oy = e.y;
  const range = w.range;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  let best = null;
  for (const o of game.entities) {
    if (o === e || o.dead || o.team === e.team) continue;
    const dx = o.x - ox, dy = o.y - oy;
    const along = dx * cos + dy * sin;
    if (along < 0 || along > range + o.rad) continue;
    const perp = Math.abs(dx * sin - dy * cos);
    if (perp < o.rad + 2 && (best === null || along < best.t)) best = { t: along, ent: o, perp };
  }
  let wallT = range;
  let penMult = 1;
  let inWall = false;
  const steps = Math.ceil(range / 6);
  for (let s = 1; s <= steps; s++) {
    const px = ox + cos * s * 6, py = oy + sin * s * 6;
    const c = tileAt(px, py);
    if (c === '=') {
      if (!inWall) {
        inWall = true;
        penMult *= 0.7;
        if (penMult < 0.49) { wallT = s * 6; break; }
        addDecal(game, px, py, 'bullet');
        emit('sfx', { name: 'penetrate', vol: 0.5, x: px, y: py, game });
      }
      continue;
    }
    inWall = false;
    if (c === 'C' && e.height === 1) continue;
    // 深水挡弹（spec 4.3：水下隐蔽 + 弹丸被水阻挡）；浅水 ~ 可穿透
    if (c === '≈') { wallT = s * 6; break; }
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
    let finalDmg = dmg;
    finalDmg *= penMult;
    const dd = best.t;
    if (w.kind === 'pistol' || w.kind === 'smg') {
      if (dd > 700) finalDmg *= 0.8;
      else if (dd > 500) finalDmg *= 0.92;
    }
    if (isPellet && dd > 500) finalDmg *= 0.55;
    applyDamage(hit, Math.max(1, finalDmg), { killer: e, weapon: wkey(e), head }, game);
    const hitLen = Math.max(4, best.t - Math.sqrt(Math.max(0, hit.rad * hit.rad - best.perp * best.perp)));
    const hx = ox + cos * hitLen, hy = oy + sin * hitLen;
    spawnBlood(hx, hy, ang, head, game);
    game.tracers.push({ x1: ox, y1: oy, x2: hx, y2: hy, life: 0.09, team: e.team });
    addDecal(game, hx, hy, 'hole');
  } else {
    game.tracers.push({ x1: ox, y1: oy, x2: tx, y2: ty, life: 0.09, team: e.team });
    addDecal(game, tx, ty, 'spark');
    for (let sp = 0; sp < 6; sp++) {
      game.particles.push({ kind: 'spark', x: tx, y: ty, vx: Math.cos(ang + rand(-1, 1)) * rand(60, 260), vy: Math.sin(ang + rand(-1, 1)) * rand(60, 260), life: rand(0.1, 0.3), size: 1.5 });
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
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  for (const b of game.barrels) if (b.tx === tx && b.ty === ty) return b;
  return null;
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
  emit('sfx', { name: 'boom', vol: 1, x: b.x, y: b.y, game });
  game.shake = Math.max(game.shake, 8);
  for (let i = 0; i < 6; i++) {
    game.particles.push({ kind: 'boom', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.5, size: 160 });
    game.particles.push({ kind: 'fire', x: b.x + rand(-40, 40), y: b.y + rand(-40, 40), vx: rand(-60, 60), vy: rand(-80, 0), life: 0.6, size: 18 });
  }
  for (const o of game.entities) {
    if (o.dead) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (d < 160) {
      const dmg = o.team === shooter.team ? 30 : 60;
      applyDamage(o, dmg, { killer: shooter, weapon: 'barrel', head: false }, game);
    }
  }
  for (const o of game.entities) {
    if (o.bot && !o.dead && o.team !== shooter.team) { o.lastKnown = { x: b.x, y: b.y }; o.lastKnownT = 0; }
  }
}

export function applyDamage(v, dmg, opt, game) {
  if (v.dead) return;
  const head = opt.head;
  const armor = v.armor > 0;
  let hpLoss, armLoss;
  if (head && (!armor || !v.helmet)) {
    hpLoss = dmg * 4;
    armLoss = 0;
  } else if (armor) {
    const absorbed = Math.min(dmg * 0.5, v.armor);
    hpLoss = dmg - absorbed;
    armLoss = absorbed;
  } else {
    hpLoss = dmg;
    armLoss = 0;
  }
  if (opt.killer && opt.killer !== v) {
    if (opt.killer === game.player) {
      game.dmgT = 0;
      if (head) emit('sfx', { name: 'head', vol: 0.9, x: v.x, y: v.y, game });
      else emit('sfx', { name: 'hit', vol: 0.7, x: v.x, y: v.y, game });
      game.hitMarkT = head ? 0.35 : 0.22;
      // 伤害报告统计（本回合造成的实际 HP 损失）
      game.player.dmgGiven = (game.player.dmgGiven || 0) + hpLoss;
      if (head) game.player.dmgHeads = (game.player.dmgHeads || 0) + 1;
    }
    if (opt.killer.bot && v === game.player) game.dmgT = 0.5;
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
}

export function killEntity(v, killer, weapon, head, game) {
  if (v.dead) return;
  v.dead = true;
  v.deaths++;
  v.vx = 0; v.vy = 0;
  if (v.team === 'ct' && game.bomb && game.bomb.planted && game.bomb.defusing) game.bomb.defusing = false;
  const wname = WEAPONS[weapon] ? WEAPONS[weapon].name : (weapon === 'bomb' ? '炸弹' : (weapon === 'grenade' ? '手雷' : '战术刀'));
  if (killer && killer !== v) {
    killer.kills++;
    killer.money = clamp(killer.money + ECONOMY.KILL_MONEY, 0, ECONOMY.MONEY_CAP);
    for (const o of game.entities) {
      if (o !== killer && o.team === killer.team && !o.dead) {
        if (v.lastDmgFrom === o && (game.time * 1000 - v.lastDmgT) < 6000) o.assists++;
      }
    }
  }
  emit('killfeed', { k: killer ? killer.name : '?', v: v.name, w: wname, head, tm: killer ? killer.team : null });
  if (v.hasBomb && (!game.bomb || !game.bomb.planted)) {
    dropBomb(v.x, v.y, game);
  }
  if (killer === game.player) {
    emit('sfx', { name: 'kill', vol: 0.6, game });
    killer.streak = (killer.streak || 0) + 1;
    killer.wKills[weapon] = (killer.wKills[weapon] || 0) + 1;
    if (head) game.stats.headshots++;
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
    emit('deathinfo', { killer: killer ? killer.name : '环境', weapon: wname, head: !!head });
    // 伤害报告：本回合造成总伤害 / 爆头数
    emit('damagereport', { dmg: Math.round(v.dmgGiven || 0), heads: v.dmgHeads || 0 });
  }
  // 队内报告：bot 阵亡 → 同队收到"击杀点"消息（队友据此调整）
  if (v.bot) report(game, v, MSG.KILL, v.x, v.y);
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
      x: v.x, y: v.y, wid: v.weapons.primary,
      ammo: Math.min(pw.mag, (v.ammoMap[v.weapons.primary] === undefined ? pw.mag : v.ammoMap[v.weapons.primary])),
      reserve: Math.min(pw.reserve, v.reserveMap[v.weapons.primary] === undefined ? pw.reserve : v.reserveMap[v.weapons.primary]),
      life: 45
    });
  }
  checkRoundEnd(game);
}

export function pickupWeapon(e, game) {
  if (e.dead) return;
  for (let i = 0; i < game.drops.length; i++) {
    const d = game.drops[i];
    if (d.noPickT > 0) continue;
    if (Math.hypot(e.x - d.x, e.y - d.y) > 46) continue;
    const w = WEAPONS[d.wid];
    if (e.weapons.primary === d.wid) {
      e.ammoMap[d.wid] = Math.min(w.mag, (e.ammoMap[d.wid] || 0) + d.ammo);
      e.reserveMap[d.wid] = Math.min(w.reserve, (e.reserveMap[d.wid] || 0) + d.reserve);
    } else {
      if (e.weapons.primary) {
        const ow = WEAPONS[e.weapons.primary];
        game.drops.push({
          x: e.x, y: e.y, wid: e.weapons.primary,
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

export function addDecal(game, x, y, type) {
  game.decals.push({ type, x, y, life: type === 'hole' ? 20 : 6 });
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
    }
  }
}

function spawnBlood(x, y, ang, head, game) {
  const n = head ? 18 : 10;
  for (let i = 0; i < n; i++) {
    game.particles.push({ kind: 'blood', x, y, vx: Math.cos(ang + rand(-0.8, 0.8)) * rand(40, 220), vy: Math.sin(ang + rand(-0.8, 0.8)) * rand(40, 220), life: rand(0.3, 0.7), size: rand(1.5, 3.5) });
  }
}

function checkRoundEnd(game) {
  if (game.state === 'END') return;
  const tAlive = game.entities.filter((e) => e.team === 't' && !e.dead).length;
  const cAlive = game.entities.filter((e) => e.team === 'ct' && !e.dead).length;
  if (tAlive === 0 && cAlive === 0) { endRound(game, null, '同归于尽'); return; }
  if (tAlive === 0) { endRound(game, 'ct', '恐怖分子全灭'); return; }
  if (cAlive === 0) { endRound(game, 't', '反恐精英全灭'); return; }
}

export function tickDrops(game, dt) {
  for (let i = game.drops.length - 1; i >= 0; i--) {
    const d = game.drops[i];
    if (d.noPickT > 0) d.noPickT = Math.max(0, d.noPickT - dt);
    if (d.life !== undefined) {
      d.life -= dt;
      if (d.life <= 0) game.drops.splice(i, 1);
    }
  }
}

export { checkRoundEnd };
