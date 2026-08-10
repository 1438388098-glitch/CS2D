import { MAJOR_TEAMS, buildBracketGroups, parseCustomGroupList } from '../src/modes.js';
import { getMode } from '../src/registry.js';
import { createGame } from '../src/game.js';

let failed = false;
function ok(name, cond, detail = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' ' + detail : ''));
  if (!cond) failed = true;
}

// ---- seed 蛇形分组（确定性） ----
{
  const r1 = buildBracketGroups(MAJOR_TEAMS, 'seed');
  const r2 = buildBracketGroups(MAJOR_TEAMS, 'seed');
  ok('seed rule default', r1.rule === 'seed' && r1.groupCount === 4);
  ok('seed all 48 placed', r1.groups.length === 4 && r1.groups.reduce((n, g) => n + g.length, 0) === 48 && r1.missing.length === 0 && r1.placed.length === 48);
  ok('seed groups balanced', Math.max(...r1.groups.map((g) => g.length)) - Math.min(...r1.groups.map((g) => g.length)) <= 1);
  ok('seed deterministic', JSON.stringify(r1) === JSON.stringify(r2));
  ok('seed unique teams', new Set(r1.groups.flat().map((t) => t.id)).size === 48);
  const syn = Array.from({ length: 8 }, (_, i) => ({ id: 't' + (i + 1), rating: 100 - i, seed: i + 1 }));
  const sr = buildBracketGroups(syn, 'seed', null, { groupCount: 4 });
  ok('seed snake 4x2',
    JSON.stringify(sr.groups.map((g) => g.map((t) => t.id))) === JSON.stringify([['t1', 't8'], ['t2', 't7'], ['t3', 't6'], ['t4', 't5']]),
    JSON.stringify(sr.groups.map((g) => g.map((t) => t.id))));
  const sr2 = buildBracketGroups(syn, 'seed', null, { groupCount: 2 });
  ok('seed snake 2 groups', sr2.groups.length === 2 && sr2.groups[0].map((t) => t.id).join(',') === 't1,t4,t5,t8', JSON.stringify(sr2.groups));
}

// ---- custom 名单分组（确定性） ----
{
  const custom = [['g2', 'navi', 'spirit'], ['vitality', 'faze']];
  const r = buildBracketGroups(MAJOR_TEAMS, 'custom', custom);
  ok('custom rule', r.rule === 'custom');
  ok('custom groups resolved', r.groups.length === 2
    && r.groups[0].map((t) => t.id).join(',') === 'g2,navi,spirit'
    && r.groups[1].map((t) => t.id).join(',') === 'vitality,faze',
    JSON.stringify(r.groups));
  ok('custom placed/missing', r.placed.length === 5 && r.missing.length === 43);
  ok('custom teams from roster', r.groups[0][0].id === 'g2' && r.groups[0][0].rating === MAJOR_TEAMS.find((t) => t.id === 'g2').rating);
  ok('custom deterministic', JSON.stringify(r) === JSON.stringify(buildBracketGroups(MAJOR_TEAMS, 'custom', custom)));
}

// ---- custom 支持队对象 / 去重 / 未知 id ----
{
  const a = MAJOR_TEAMS.find((t) => t.id === 'g2');
  const b = MAJOR_TEAMS.find((t) => t.id === 'navi');
  const r = buildBracketGroups(MAJOR_TEAMS, 'custom', [[a, b]]);
  ok('custom object ids', r.groups[0].map((t) => t.id).join(',') === 'g2,navi');
  const r2 = buildBracketGroups(MAJOR_TEAMS, 'custom', [['g2', 'g2', 'not-a-team']]);
  ok('custom dedupe + skip unknown', r2.groups[0].map((t) => t.id).join(',') === 'g2' && r2.missing.length === 47);
  ok('custom empty groups', buildBracketGroups(MAJOR_TEAMS, 'custom').groups.length === 0 && buildBracketGroups(MAJOR_TEAMS, 'custom').missing.length === 48);
}

// ---- region 分组 ----
{
  const r1 = buildBracketGroups(MAJOR_TEAMS, 'region');
  ok('region groups non-empty', r1.groups.length >= 4 && r1.groups.every((g) => g.length > 0));
  ok('region homogeneous', r1.groups.every((g) => new Set(g.map((t) => t.region)).size === 1));
  ok('region placed all', r1.placed.length === 48 && r1.missing.length === 0);
  ok('region deterministic', JSON.stringify(r1) === JSON.stringify(buildBracketGroups(MAJOR_TEAMS, 'region')));
}

// ---- parseCustomGroupList ----
{
  ok('parse empty', JSON.stringify(parseCustomGroupList('')) === '[]' && JSON.stringify(parseCustomGroupList(null)) === '[]' && JSON.stringify(parseCustomGroupList(undefined)) === '[]');
  const parsed = parseCustomGroupList('g2, navi, spirit\nvitality；faze');
  ok('parse groups', parsed.length === 2 && parsed[0].join(',') === 'g2,navi,spirit' && parsed[1].join(',') === 'vitality,faze', JSON.stringify(parsed));
  ok('parse deterministic', JSON.stringify(parsed) === JSON.stringify(parseCustomGroupList('g2, navi, spirit\nvitality；faze')));
}

// ---- 集成：Major 初始化接入 ----
{
  const g = createGame({ mode: 'major', seed: 1 });
  g.ui = null; g.seed = 1; g.opts.teamMajor = 'g2';
  getMode('major').start(g);
  ok('major default grouping', !!g.major.grouping && g.major.grouping.rule === 'seed' && g.major.grouping.groups.length === 4);
  ok('major default qualifier intact', g.major.qual.teams.length === 48 && g.major.stage === 'qualifier');
  ok('major groupOf consistent', g.major.grouping.groups.every((grp, gi) => grp.every((t) => g.major.groupOf[t.id] === gi)));
}

{
  const g = createGame({ mode: 'major', seed: 2 });
  g.ui = null; g.seed = 2; g.opts.teamMajor = 'g2';
  g.opts.majorGroup = { rule: 'custom', groupCount: 4, customGroups: [['g2', 'navi'], ['spirit', 'vitality']] };
  getMode('major').start(g);
  ok('major custom grouping', g.major.grouping.rule === 'custom');
  ok('major custom groups', g.major.grouping.groups[0].map((t) => t.id).join(',') === 'g2,navi'
    && g.major.grouping.groups[1].map((t) => t.id).join(',') === 'spirit,vitality');
  ok('major custom groupOf', g.major.groupOf['g2'] === 0 && g.major.groupOf['spirit'] === 1);
  ok('major custom missing', g.major.grouping.missing.length === 44);
}

{
  const g = createGame({ mode: 'major', seed: 3 });
  g.ui = null; g.seed = 3; g.opts.teamMajor = 'g2';
  g.opts.majorGroup = { rule: 'region' };
  getMode('major').start(g);
  ok('major region grouping', g.major.grouping.rule === 'region'
    && g.major.grouping.groups.some((grp) => grp.length > 0 && grp[0].region === '中国'));
}

console.log('fx-major-groups: all PASS');
process.exit(failed ? 1 : 0);
