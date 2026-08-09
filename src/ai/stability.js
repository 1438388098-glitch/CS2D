import { getMap } from '../map.js';

export function stuckObjective(e, game) {
  if (!e || !game) return { x: e ? e.x : 0, y: e ? e.y : 0 };
  const map = getMap();
  if (!map) return { x: e.x || 0, y: e.y || 0 };

  if (e.team === 't') {
    const cs = game.tAttackSite === 'A' ? map.sites.A : map.sites.B;
    if (cs && Number.isFinite(cs.cx) && Number.isFinite(cs.cy)) return { x: cs.cx, y: cs.cy };
    const tsp = map.spawns.t && map.spawns.t[0];
    if (tsp) return { x: tsp.x, y: tsp.y };
    return { x: map.W / 2, y: map.H / 2 };
  }

  if (game.bomb && game.bomb.planted) return { x: game.bomb.x, y: game.bomb.y };

  const hold = e.role === 'a' ? map.holds.A : (e.role === 'b' ? map.holds.B : null);
  if (hold && hold.anchors && hold.anchors.length) {
    const p = hold.anchors[(e.anchorIdx || 0) % hold.anchors.length] || hold.anchors[0];
    return { x: p.x, y: p.y };
  }

  const csp = map.spawns.ct && map.spawns.ct[0];
  if (csp) return { x: csp.x, y: csp.y };

  const site = map.sites[game.bomb && game.bomb.site ? game.bomb.site : 'A'];
  if (site) return { x: site.cx, y: site.cy };
  return { x: map.W / 2, y: map.H / 2 };
}
