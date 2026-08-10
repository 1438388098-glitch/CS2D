import { computePerformanceScore, computeMvp } from '../src/mvp-score.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

ok('perfect game scores 100',
  computePerformanceScore({ kills: 8, deaths: 0, assists: 4, plants: 2, defuses: 1, damage: 800 }) === 100);

ok('empty stats score 0',
  computePerformanceScore({}) === 0);

ok('missing stats score 0',
  computePerformanceScore(undefined) === 0);

ok('single kill + zero deaths',
  computePerformanceScore({ kills: 1, deaths: 0 }) === 15);

ok('negative values ignored',
  computePerformanceScore({ kills: -3, deaths: -1, damage: -100 }) === 0);

ok('kills + deaths kd component',
  computePerformanceScore({ kills: 2, deaths: 4 }) === 21);

ok('damage contributes',
  computePerformanceScore({ kills: 0, deaths: 0, assists: 0, plants: 0, defuses: 0, damage: 100 }) === 1);

ok('plant/defuse contribute',
  computePerformanceScore({ kills: 0, deaths: 0, assists: 0, plants: 1, defuses: 1, damage: 0 }) === 20);

ok('absurd stats clamp to 100',
  computePerformanceScore({ kills: 99, deaths: 0, assists: 99, plants: 99, defuses: 99, damage: 99999 }) === 100);

{
  const a = { name: 'A', kills: 5, deaths: 2, assists: 0, plants: 0, defuses: 0, damage: 300 };
  const b = { name: 'B', kills: 4, deaths: 0, assists: 3, plants: 1, defuses: 1, damage: 500 };
  const mvp = computeMvp([a, b]);
  ok('mvp picks highest score', mvp && mvp.player === b && mvp.score === 91, JSON.stringify(mvp));
}

{
  const p1 = { name: 'P1', kills: 3, deaths: 0, assists: 2 };
  const p2 = { name: 'P2', kills: 4, deaths: 2, assists: 1 };
  const mvp = computeMvp([p1, p2]);
  ok('mvp tie broken by kills deterministically', mvp && mvp.player === p2 && mvp.score === 51, JSON.stringify(mvp));
}

{
  const players = [
    { name: 'X', kills: 3, deaths: 1, assists: 1, plants: 0, defuses: 0, damage: 200 },
    { name: 'Y', kills: 6, deaths: 3, assists: 2, plants: 1, defuses: 0, damage: 600 }
  ];
  const r1 = computeMvp(players);
  const r2 = computeMvp(players);
  ok('mvp is deterministic', r1.player === r2.player && r1.score === r2.score);
}

ok('empty players returns null', computeMvp([]) === null);
ok('mvp returns player reference', (() => { const p = { kills: 1, deaths: 0 }; return computeMvp([p]).player === p; })());

console.log('fx-mvp-score: all PASS');
process.exit(failed ? 1 : 0);
