// 设置面板搜索匹配逻辑：空查询显示全部，关键字按中文/英文大小写不敏感过滤。
import { settingsRowMatches } from '../src/ui.js';

function ok(name, cond) {
  if (!cond) throw new Error('settings-search: ' + name + ' FAIL');
  console.log('settings-search: ' + name + ' PASS');
}

ok('empty query matches all', settingsRowMatches('音量', '') === true);
ok('Chinese keyword matches', settingsRowMatches('鼠标灵敏度', '灵敏度') === true);
ok('English keyword matches case-insensitively', settingsRowMatches('渲染 DPR', 'dpr') === true);
ok('section keyword matches row', settingsRowMatches('视角 FOV', '视角') === true);
ok('non-match returns false', settingsRowMatches('音量', '画质') === false);
ok('null text is safe', settingsRowMatches(null, 'x') === false);

console.log('settings-search: all PASS');
