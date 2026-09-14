// 存档导出/导入码（candidate-591）：career/manager/duel 单槽 localStorage 存档 → base64 JSON 码。
// 换机/换浏览器玩家旅程此前完全没被服务；导入做结构与字段校验，坏码明确报错不写入。
const MODES = ['career', 'manager', 'duel', 'profile'];
const PROFILE_KEYS = ['cs2d_ranked_v1', 'cs2d_skins_v1', 'cs2d_mastery_v1', 'cs2d_daily_v1', 'cs2d_nemesis_v1'];

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}

function keyOf(mode) {
  return { career: 'cs2d_career_v1', manager: 'cs2d_manager_v1', duel: 'cs2d_duel', profile: 'profile' }[mode] || null;
}

// 导出：返回 base64 码（带模式前缀），存档缺失返回 null
export function exportSave(mode) {
  const s = store();
  const key = keyOf(mode);
  if (!s || !key) return null;
  if (mode === 'profile') {
    // 档案模式（candidate-610）：聚合排位/涂装/熟练度/每日四个进度键
    const bag = {};
    for (const k of PROFILE_KEYS) {
      const v = s.getItem(k);
      if (v) bag[k] = v;
    }
    if (!Object.keys(bag).length) return null;
    try { return mode + '.' + btoa(encodeURIComponent(JSON.stringify(bag))); } catch (e) { return null; }
  }
  const raw = s.getItem(key);
  if (!raw) return null;
  try {
    return mode + '.' + btoa(encodeURIComponent(raw));
  } catch (e) { return null; }
}

// 导入：校验前缀 + JSON 可解析 + 顶层是 object；成功写入并返回 true
export function importSave(mode, code) {
  const s = store();
  const key = keyOf(mode);
  if (!s || !key || typeof code !== 'string') return false;
  const sep = code.indexOf('.');
  if (sep <= 0 || code.slice(0, sep) !== mode) return false;
  try {
    const json = decodeURIComponent(atob(code.slice(sep + 1)));
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (mode === 'profile') {
      // 拆分写回各进度键；写回前留 _backup 回退点（与其他模式同安全等级，candidate-625）
      let wrote = false;
      for (const k of PROFILE_KEYS) {
        if (obj[k]) {
          const cur = s.getItem(k);
          if (cur) s.setItem(k + '_backup', cur);
          s.setItem(k, String(obj[k]));
          wrote = true;
        }
      }
      return wrote;
    }
    // 防覆盖前备份当前存档（一次性回退点）
    const cur = s.getItem(key);
    if (cur) s.setItem(key + '_backup', cur);
    s.setItem(key, json);
    return true;
  } catch (e) {
    return false;
  }
}

export function supportedModes() { return MODES.slice(); }
