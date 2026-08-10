// 一次性修复脚本：重建 src/modes.js 的 Major 区块（UTF-8 安全，不用 PowerShell）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../src/modes.js', import.meta.url));
const src = readFileSync(path, 'utf8');

const startMark = '/* ---------- Major ---------- */';
const endMark = '/* ---------- LAN (browser sync lives in src/lan.js) ---------- */';
let s = src.indexOf(startMark);
if (s < 0) s = src.indexOf('/* ---------- Major (2026.8'); // 兼容新版注释
const e = src.indexOf(endMark);
if (s < 0 || e < 0 || e <= s) throw new Error('markers not found: ' + s + '/' + e);

const NEW_MAJOR = `/* ---------- Major (2026.8 真实数据 + IEM Cologne 2026 赛制) ---------- */

// 48 队：VRS 排名（按 rating 降序）；阵容/评分同步 HLTV 2026-08 世界排名
const MAJOR_TEAMS = [
  { id: 'spirit', name: 'Team Spirit', tag: 'Spirit', region: '欧洲/独联体', style: '高速协同+超级明星枪法', rating: 97, players: [
    { name: 'donk', role: '突破', aim: 99, movement: 93, clutch: 92, nade: 83 },
    { name: 'sh1ro', role: '狙击', aim: 93, movement: 87, clutch: 90, nade: 75 },
    { name: 'magixx', role: '指挥', aim: 79, movement: 80, clutch: 78, nade: 89 },
    { name: 'zont1x', role: '步枪', aim: 87, movement: 85, clutch: 83, nade: 80 },
    { name: 'tN1R', role: '步枪', aim: 84, movement: 82, clutch: 79, nade: 83 } ] },
  { id: 'falcons', name: 'Team Falcons', tag: 'FLC', region: '欧洲', style: '体系指挥+双核顶级火力', rating: 96, players: [
    { name: 'NiKo', role: '突破', aim: 95, movement: 90, clutch: 88, nade: 82 },
    { name: 'm0NESY', role: '狙击', aim: 96, movement: 86, clutch: 92, nade: 74 },
    { name: 'karrigan', role: '指挥', aim: 78, movement: 70, clutch: 82, nade: 90 },
    { name: 'TeSeS', role: '步枪', aim: 84, movement: 78, clutch: 80, nade: 84 },
    { name: 'kyousuke', role: '步枪', aim: 86, movement: 85, clutch: 78, nade: 75 } ] },
  { id: 'vitality', name: 'Team Vitality', tag: 'VIT', region: '欧洲（法国）', style: '快节奏主动控图+ZywOo 兜底', rating: 94, players: [
    { name: 'ZywOo', role: '狙击', aim: 99, movement: 96, clutch: 97, nade: 86 },
    { name: 'ropz', role: '自由人', aim: 92, movement: 91, clutch: 91, nade: 87 },
    { name: 'flameZ', role: '突破', aim: 92, movement: 88, clutch: 88, nade: 81 },
    { name: 'apEX', role: '指挥', aim: 79, movement: 81, clutch: 83, nade: 90 },
    { name: 'mezii', role: '步枪', aim: 82, movement: 82, clutch: 80, nade: 89 } ] },
  { id: 'furia', name: 'FURIA Esports', tag: 'FURIA', region: '巴西', style: '巴西式高速侵略+激进前压', rating: 94, players: [
    { name: 'KSCERATO', role: '步枪', aim: 94, movement: 90, clutch: 88, nade: 83 },
    { name: 'yuurih', role: '步枪', aim: 93, movement: 89, clutch: 90, nade: 84 },
    { name: 'YEKINDAR', role: '自由人', aim: 90, movement: 91, clutch: 82, nade: 80 },
    { name: 'FalleN', role: '指挥/狙击', aim: 82, movement: 78, clutch: 84, nade: 88 },
    { name: 'molodoy', role: '补枪', aim: 85, movement: 82, clutch: 78, nade: 76 } ] },
  { id: 'mouz', name: 'MOUZ', tag: 'MOUZ', region: '欧洲（德国）', style: '青训体系高速协同', rating: 93, players: [
    { name: 'Spinx', role: '突破', aim: 90, movement: 86, clutch: 85, nade: 78 },
    { name: 'xertioN', role: '指挥', aim: 86, movement: 85, clutch: 81, nade: 84 },
    { name: 'torzsi', role: '狙击', aim: 88, movement: 85, clutch: 83, nade: 74 },
    { name: 'xelex', role: '步枪', aim: 84, movement: 82, clutch: 79, nade: 76 },
    { name: 'PR', role: '补枪', aim: 83, movement: 80, clutch: 78, nade: 77 } ] },
  { id: 'navi', name: 'Natus Vincere', tag: 'NAVI', region: '欧洲（乌克兰）', style: '慢控图+体系化纪律执行', rating: 92, players: [
    { name: 'b1t', role: '补枪', aim: 96, movement: 90, clutch: 88, nade: 85 },
    { name: 'w0nderful', role: '狙击', aim: 88, movement: 85, clutch: 81, nade: 73 },
    { name: 'iM', role: '突破', aim: 86, movement: 84, clutch: 83, nade: 80 },
    { name: 'Aleksib', role: '指挥', aim: 77, movement: 79, clutch: 76, nade: 93 },
    { name: 'makazze', role: '步枪', aim: 85, movement: 83, clutch: 79, nade: 78 } ] },
  { id: 'aurora', name: 'Aurora', tag: 'AUR', region: '欧洲（土耳其核心）', style: '土耳其火力流+激进主狙', rating: 91, players: [
    { name: 'XANTARES', role: '突破', aim: 92, movement: 87, clutch: 84, nade: 76 },
    { name: 'woxic', role: '狙击', aim: 88, movement: 82, clutch: 80, nade: 72 },
    { name: 'kyxsan', role: '指挥', aim: 78, movement: 68, clutch: 80, nade: 90 },
    { name: 'Jimpphat', role: '步枪', aim: 85, movement: 78, clutch: 82, nade: 80 },
    { name: 'Wicadia', role: '补枪', aim: 83, movement: 80, clutch: 78, nade: 76 } ] },
  { id: 'g2', name: 'G2 Esports', tag: 'G2', region: '欧洲（德国）', style: '明星枪法+快节奏对枪', rating: 90, players: [
    { name: 'HeavyGod', role: '突破', aim: 91, movement: 87, clutch: 85, nade: 77 },
    { name: 'NertZ', role: '步枪', aim: 88, movement: 85, clutch: 83, nade: 78 },
    { name: 'r1nkle', role: '狙击', aim: 85, movement: 83, clutch: 80, nade: 73 },
    { name: 'matys', role: '步枪', aim: 84, movement: 82, clutch: 80, nade: 76 },
    { name: 'huNter-', role: '指挥', aim: 79, movement: 81, clutch: 81, nade: 89 } ] },
  { id: 'faze', name: 'FaZe Clan', tag: 'FaZe', region: '欧洲（国际）', style: '重建期强个人能力', rating: 89, players: [
    { name: 'Twistzz', role: '指挥', aim: 90, movement: 87, clutch: 88, nade: 85 },
    { name: 'frozen', role: '步枪', aim: 89, movement: 86, clutch: 85, nade: 82 },
    { name: 'jcobbb', role: '突破', aim: 84, movement: 82, clutch: 80, nade: 77 },
    { name: 'JBOEN', role: '狙击', aim: 82, movement: 78, clutch: 76, nade: 71 },
    { name: 'Neityu', role: '步枪', aim: 83, movement: 81, clutch: 79, nade: 76 } ] },
  { id: 'mongolz', name: 'The MongolZ', tag: 'MongolZ', region: '蒙古', style: '亚洲高速协同+转点极快', rating: 88, players: [
    { name: '910', role: '狙击', aim: 90, movement: 85, clutch: 86, nade: 76 },
    { name: 'Techno4K', role: '步枪', aim: 91, movement: 87, clutch: 84, nade: 80 },
    { name: 'bLitz', role: '指挥', aim: 80, movement: 77, clutch: 79, nade: 84 },
    { name: 'Tikuak', role: '步枪', aim: 84, movement: 80, clutch: 77, nade: 75 },
    { name: 'DarkMeister', role: '步枪', aim: 82, movement: 79, clutch: 75, nade: 74 } ] },
  { id: 'astralis', name: 'Astralis', tag: 'Astralis', region: '丹麦', style: '体系化地图控制', rating: 88, players: [
    { name: 'jabbi', role: '步枪', aim: 90, movement: 86, clutch: 87, nade: 82 },
    { name: 'Staehr', role: '步枪', aim: 86, movement: 84, clutch: 82, nade: 80 },
    { name: 'phzy', role: '狙击', aim: 84, movement: 80, clutch: 78, nade: 75 },
    { name: 'ryu', role: '步枪', aim: 83, movement: 82, clutch: 80, nade: 78 },
    { name: 'HooXi', role: '指挥', aim: 76, movement: 78, clutch: 80, nade: 90 } ] },
  { id: 'pain', name: 'paiN Gaming', tag: 'paiN', region: '巴西', style: '稳扎稳打+道具严谨', rating: 87, players: [
    { name: 'biguzera', role: '指挥', aim: 83, movement: 80, clutch: 88, nade: 90 },
    { name: 'saffee', role: '狙击', aim: 87, movement: 80, clutch: 80, nade: 76 },
    { name: 'snow', role: '步枪', aim: 85, movement: 83, clutch: 80, nade: 80 },
    { name: 'v$m', role: '步枪', aim: 83, movement: 82, clutch: 78, nade: 78 },
    { name: 'piriajr', role: '步枪', aim: 82, movement: 80, clutch: 76, nade: 76 } ] },
  { id: '9z', name: '9z Team', tag: '9z', region: '南美（乌拉圭）', style: '南美快节奏进攻流', rating: 86, players: [
    { name: 'dgt', role: '狙击', aim: 85, movement: 81, clutch: 82, nade: 77 },
    { name: 'luchov', role: '步枪', aim: 82, movement: 80, clutch: 81, nade: 76 },
    { name: 'HUASOPEEK', role: '突破', aim: 81, movement: 83, clutch: 80, nade: 74 },
    { name: 'max', role: '指挥', aim: 80, movement: 78, clutch: 79, nade: 84 },
    { name: 'meyern', role: '步枪', aim: 79, movement: 78, clutch: 77, nade: 75 } ] },
  { id: 'betboom', name: 'BetBoom Team', tag: 'BetBoom', region: '俄罗斯', style: '俄式火力体系', rating: 86, players: [
    { name: 'zorte', role: '狙击', aim: 87, movement: 78, clutch: 80, nade: 75 },
    { name: 'Magnojez', role: '步枪', aim: 83, movement: 79, clutch: 77, nade: 74 },
    { name: 'Boombl4', role: '指挥', aim: 82, movement: 74, clutch: 81, nade: 89 },
    { name: 'd1Ledez', role: '步枪', aim: 81, movement: 76, clutch: 75, nade: 76 },
    { name: 's1ren', role: '补枪', aim: 80, movement: 74, clutch: 76, nade: 78 } ] },
  { id: 'b8', name: 'B8', tag: 'B8', region: '乌克兰', style: '全乌班年轻火力流', rating: 84, players: [
    { name: 's1zzi', role: '狙击', aim: 88, movement: 76, clutch: 84, nade: 73 },
    { name: 'npl', role: '步枪', aim: 82, movement: 78, clutch: 79, nade: 77 },
    { name: 'alex666', role: '指挥', aim: 80, movement: 73, clutch: 80, nade: 88 },
    { name: 'kensizor', role: '步枪', aim: 81, movement: 76, clutch: 74, nade: 75 },
    { name: 'esenthial', role: '补枪', aim: 80, movement: 75, clutch: 75, nade: 76 } ] },
  { id: 'legacy', name: 'Legacy', tag: 'LG', region: '巴西', style: 'arT 激进指挥+高首杀率', rating: 84, players: [
    { name: 'dumau', role: '步枪', aim: 82, movement: 80, clutch: 80, nade: 78 },
    { name: 'latto', role: '步枪', aim: 82, movement: 79, clutch: 79, nade: 77 },
    { name: 'arT', role: '指挥', aim: 81, movement: 82, clutch: 80, nade: 84 },
    { name: 'try', role: '突破', aim: 80, movement: 81, clutch: 78, nade: 74 },
    { name: 'n1ssim', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 76 } ] },
  { id: 'parivision', name: 'PARIVISION', tag: 'PV', region: '独联体', style: 'Jame 体系慢节奏控图', rating: 83, players: [
    { name: 'Jame', role: '指挥/狙击', aim: 85, movement: 78, clutch: 90, nade: 92 },
    { name: 'FL1T', role: '突破', aim: 85, movement: 84, clutch: 82, nade: 75 },
    { name: 'xiELO', role: '步枪', aim: 80, movement: 79, clutch: 78, nade: 76 },
    { name: 'zweih', role: '步枪', aim: 79, movement: 78, clutch: 75, nade: 78 },
    { name: 'slaxejezzz', role: '步枪', aim: 78, movement: 77, clutch: 76, nade: 75 } ] },
  { id: 'liquid', name: 'Team Liquid', tag: 'Liquid', region: '北美', style: '老将经验型中速控图', rating: 83, players: [
    { name: 'EliGE', role: '步枪', aim: 92, movement: 88, clutch: 88, nade: 86 },
    { name: 'NAF', role: '步枪', aim: 90, movement: 86, clutch: 91, nade: 87 },
    { name: 'malbsMd', role: '突破', aim: 90, movement: 89, clutch: 84, nade: 80 },
    { name: 'Jorko', role: '狙击', aim: 84, movement: 82, clutch: 78, nade: 74 },
    { name: 'JT', role: '指挥', aim: 78, movement: 76, clutch: 79, nade: 85 } ] },
  { id: 'gl', name: 'GamerLegion', tag: 'GL', region: '欧洲', style: '老将指挥+年轻火力', rating: 81, players: [
    { name: 'hypex', role: '狙击', aim: 86, movement: 79, clutch: 88, nade: 74 },
    { name: 'FL4MUS', role: '突破', aim: 84, movement: 86, clutch: 72, nade: 72 },
    { name: 'REZ', role: '自由人', aim: 83, movement: 84, clutch: 78, nade: 79 },
    { name: 'Snax', role: '指挥', aim: 80, movement: 74, clutch: 82, nade: 90 },
    { name: 'Tauson', role: '补枪', aim: 80, movement: 76, clutch: 82, nade: 74 } ] },
  { id: 'mibr', name: 'MIBR', tag: 'MIBR', region: '巴西', style: '激进突破+乱战节奏', rating: 81, players: [
    { name: 'nqz', role: '狙击', aim: 87, movement: 84, clutch: 84, nade: 76 },
    { name: 'insani', role: '突破', aim: 86, movement: 84, clutch: 82, nade: 78 },
    { name: 'LNZ', role: '指挥', aim: 84, movement: 80, clutch: 82, nade: 85 },
    { name: 'brnz4n', role: '步枪', aim: 82, movement: 80, clutch: 82, nade: 80 },
    { name: 'venomzera', role: '步枪', aim: 81, movement: 80, clutch: 76, nade: 76 } ] },
  { id: '3dmax', name: '3DMAX', tag: '3DMAX', region: '法国', style: '结构化纪律型+道具严谨', rating: 80, players: [
    { name: 'Lucky', role: '狙击', aim: 86, movement: 73, clutch: 76, nade: 75 },
    { name: 'misutaaa', role: '自由人', aim: 82, movement: 79, clutch: 81, nade: 80 },
    { name: 'Kursy', role: '突破', aim: 80, movement: 84, clutch: 75, nade: 72 },
    { name: 'Maka', role: '指挥', aim: 78, movement: 75, clutch: 79, nade: 87 },
    { name: 'Graviti', role: '补枪', aim: 78, movement: 72, clutch: 74, nade: 82 } ] },
  { id: 'heroic', name: 'HEROIC', tag: 'Heroic', region: '欧洲（北欧）', style: '北欧纪律型控图', rating: 79, players: [
    { name: 'nilo', role: '步枪', aim: 90, movement: 86, clutch: 84, nade: 80 },
    { name: 'Brollan', role: '步枪', aim: 90, movement: 87, clutch: 82, nade: 80 },
    { name: 'susp', role: '步枪', aim: 86, movement: 82, clutch: 80, nade: 78 },
    { name: 'Martinez', role: '步枪', aim: 86, movement: 84, clutch: 76, nade: 76 },
    { name: 'Chr1zN', role: '指挥', aim: 80, movement: 76, clutch: 80, nade: 84 } ] },
  { id: 'nip', name: 'Ninjas in Pyjamas', tag: 'NIP', region: '欧洲（瑞典）', style: '北欧纪律体系', rating: 79, players: [
    { name: 'stavn', role: '步枪', aim: 88, movement: 84, clutch: 85, nade: 78 },
    { name: 'xKacpersky', role: '狙击', aim: 85, movement: 80, clutch: 80, nade: 70 },
    { name: 'sjuush', role: '步枪', aim: 82, movement: 76, clutch: 80, nade: 85 },
    { name: 'n0te', role: '步枪', aim: 82, movement: 78, clutch: 76, nade: 76 },
    { name: 'Snappi', role: '指挥', aim: 76, movement: 65, clutch: 78, nade: 90 } ] },
  { id: 'big', name: 'BIG', tag: 'BIG', region: '德国', style: '学院派纪律体系', rating: 78, players: [
    { name: 'blameF', role: '步枪', aim: 89, movement: 82, clutch: 88, nade: 84 },
    { name: 'gr1ks', role: '狙击', aim: 85, movement: 78, clutch: 80, nade: 70 },
    { name: 'faveN', role: '步枪', aim: 82, movement: 78, clutch: 80, nade: 76 },
    { name: 'JDC', role: '步枪', aim: 81, movement: 76, clutch: 78, nade: 78 },
    { name: 'tabseN', role: '指挥', aim: 78, movement: 70, clutch: 82, nade: 88 } ] },
  { id: 'tyloo', name: 'TYLOO', tag: 'TYLOO', region: '中国', style: '中国枪男队+快速默认', rating: 77, players: [
    { name: 'Jee', role: '狙击', aim: 85, movement: 80, clutch: 79, nade: 78 },
    { name: 'Mercury', role: '步枪', aim: 84, movement: 82, clutch: 83, nade: 77 },
    { name: 'Moseyuh', role: '突破', aim: 82, movement: 84, clutch: 79, nade: 76 },
    { name: 'JamYoung', role: '指挥', aim: 82, movement: 76, clutch: 80, nade: 86 },
    { name: 'Zero', role: '步枪', aim: 80, movement: 79, clutch: 76, nade: 75 } ] },
  { id: 'eyeballers', name: 'EYEBALLERS', tag: 'EYE', region: '瑞典', style: '老将经验流', rating: 77, players: [
    { name: 'KRIMZ', role: '步枪', aim: 84, movement: 80, clutch: 85, nade: 80 },
    { name: 'maxster', role: '步枪', aim: 83, movement: 76, clutch: 77, nade: 80 },
    { name: 'JW', role: '指挥', aim: 78, movement: 76, clutch: 80, nade: 86 },
    { name: 'Ro1f', role: '步枪', aim: 79, movement: 74, clutch: 74, nade: 74 },
    { name: 'dex', role: '步枪', aim: 79, movement: 73, clutch: 73, nade: 75 } ] },
  { id: 'efire', name: 'Eternal Fire', tag: 'EF', region: '土耳其', style: '重建期个人枪法驱动', rating: 76, players: [
    { name: 'jottAAA', role: '突破', aim: 86, movement: 83, clutch: 78, nade: 76 },
    { name: 'regali', role: '狙击', aim: 84, movement: 80, clutch: 79, nade: 72 },
    { name: 'Kvem', role: '步枪', aim: 84, movement: 81, clutch: 77, nade: 74 },
    { name: 'br0', role: '补枪', aim: 82, movement: 78, clutch: 80, nade: 82 },
    { name: 'MisteM', role: '指挥', aim: 78, movement: 74, clutch: 78, nade: 84 } ] },
  { id: '100t', name: '100 Thieves', tag: '100T', region: '北美', style: '国际纵队+顶级主狙', rating: 75, players: [
    { name: 'device', role: '狙击', aim: 93, movement: 82, clutch: 92, nade: 78 },
    { name: 'rain', role: '突破', aim: 85, movement: 86, clutch: 82, nade: 80 },
    { name: 'Gizmy', role: '步枪', aim: 80, movement: 76, clutch: 74, nade: 75 },
    { name: 'poiii', role: '步枪', aim: 78, movement: 76, clutch: 74, nade: 74 },
    { name: 'sirah', role: '指挥', aim: 76, movement: 68, clutch: 78, nade: 88 } ] },
  { id: 'vp', name: 'Virtus.pro', tag: 'VP', region: '独联体', style: '重建期纪律性传统', rating: 75, players: [
    { name: 'b1st', role: '狙击', aim: 84, movement: 82, clutch: 78, nade: 74 },
    { name: 'tO0RO', role: '步枪', aim: 82, movement: 80, clutch: 78, nade: 76 },
    { name: 'mir', role: '指挥', aim: 81, movement: 78, clutch: 80, nade: 87 },
    { name: 'AquaRS', role: '步枪', aim: 80, movement: 78, clutch: 76, nade: 75 },
    { name: 'F0R3VER', role: '步枪', aim: 80, movement: 78, clutch: 76, nade: 75 } ] },
  { id: 'lynnvision', name: 'Lynn Vision', tag: 'LVG', region: '中国', style: '体系化战术纪律', rating: 73, players: [
    { name: 'z4KR', role: '自由人', aim: 84, movement: 80, clutch: 82, nade: 78 },
    { name: 'Starry', role: '步枪', aim: 82, movement: 81, clutch: 79, nade: 76 },
    { name: 'EmiliaQAQ', role: '突破', aim: 80, movement: 84, clutch: 77, nade: 74 },
    { name: 'Westmelon', role: '指挥', aim: 79, movement: 74, clutch: 80, nade: 85 },
    { name: 'C4LLM3SU3', role: '步枪', aim: 80, movement: 78, clutch: 78, nade: 77 } ] },
  { id: 'fnatic', name: 'Fnatic', tag: 'Fnatic', region: '欧洲（乌克兰）', style: '重建期年轻化', rating: 73, players: [
    { name: 'jambo', role: '步枪', aim: 84, movement: 82, clutch: 80, nade: 78 },
    { name: 'jackasmo', role: '步枪', aim: 82, movement: 80, clutch: 78, nade: 76 },
    { name: 'fEAR', role: '指挥', aim: 78, movement: 76, clutch: 80, nade: 84 },
    { name: 'cairne', role: '步枪', aim: 80, movement: 78, clutch: 76, nade: 75 },
    { name: 'mazay', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 75 } ] },
  { id: 'm80', name: 'M80', tag: 'M80', region: '北美（美国）', style: '纪律型团队+稳守反击', rating: 72, players: [
    { name: 'slaxz-', role: '狙击', aim: 84, movement: 80, clutch: 82, nade: 77 },
    { name: 'Swisher', role: '突破', aim: 81, movement: 84, clutch: 80, nade: 75 },
    { name: 's1n', role: '指挥', aim: 80, movement: 78, clutch: 79, nade: 85 },
    { name: 'Lake', role: '步枪', aim: 80, movement: 79, clutch: 78, nade: 76 },
    { name: 'JBa', role: '步枪', aim: 79, movement: 77, clutch: 77, nade: 77 } ] },
  { id: 'sashi', name: 'Sashi', tag: 'Sashi', region: '丹麦', style: '全丹班战术型', rating: 71, players: [
    { name: 'acoR', role: '狙击', aim: 87, movement: 78, clutch: 80, nade: 74 },
    { name: 'Zyphon', role: '步枪', aim: 81, movement: 79, clutch: 78, nade: 75 },
    { name: 'Cabbi', role: '指挥', aim: 79, movement: 77, clutch: 79, nade: 85 },
    { name: 'Anlelele', role: '步枪', aim: 80, movement: 75, clutch: 76, nade: 76 },
    { name: 'MistR', role: '步枪', aim: 80, movement: 76, clutch: 78, nade: 75 } ] },
  { id: 'nine', name: '9INE', tag: '9INE', region: '欧洲', style: '步枪推进体系', rating: 71, players: [
    { name: 'rim3', role: '突破', aim: 85, movement: 87, clutch: 70, nade: 76 },
    { name: 'b1elany', role: '补枪', aim: 81, movement: 74, clutch: 80, nade: 74 },
    { name: 'raalz', role: '指挥', aim: 79, movement: 73, clutch: 79, nade: 87 },
    { name: 'kraghen', role: '步枪', aim: 80, movement: 75, clutch: 76, nade: 75 },
    { name: 'Flayy', role: '步枪', aim: 80, movement: 75, clutch: 74, nade: 75 } ] },
  { id: 'bcg', name: 'BC.Game', tag: 'BCG', region: '欧洲/国际', style: '银河战舰磨合期', rating: 70, players: [
    { name: 's1mple', role: '狙击', aim: 97, movement: 90, clutch: 96, nade: 78 },
    { name: 'electroNic', role: '指挥', aim: 84, movement: 76, clutch: 85, nade: 89 },
    { name: 'Magisk', role: '自由人', aim: 84, movement: 74, clutch: 82, nade: 86 },
    { name: 'Senzu', role: '突破', aim: 84, movement: 83, clutch: 78, nade: 76 },
    { name: 'mzinho', role: '步枪', aim: 82, movement: 79, clutch: 78, nade: 78 } ] },
  { id: 'metizport', name: 'Metizport', tag: 'Metizport', region: '欧洲', style: '国际纵队重建', rating: 69, players: [
    { name: 'forsyy', role: '狙击', aim: 86, movement: 76, clutch: 74, nade: 73 },
    { name: 'F1KU', role: '步枪', aim: 82, movement: 75, clutch: 75, nade: 76 },
    { name: 'Plopski', role: '步枪', aim: 81, movement: 78, clutch: 76, nade: 74 },
    { name: 'MaiL09', role: '补枪', aim: 80, movement: 76, clutch: 77, nade: 73 },
    { name: 'stanislaw', role: '指挥', aim: 76, movement: 71, clutch: 78, nade: 86 } ] },
  { id: 'wildcard', name: 'Wildcard', tag: 'WC', region: '北美（美国）', style: '枪法型打乱战', rating: 69, players: [
    { name: 'Cxzi', role: '狙击', aim: 85, movement: 81, clutch: 82, nade: 76 },
    { name: 'HexT', role: '突破', aim: 80, movement: 84, clutch: 78, nade: 74 },
    { name: 'nEMANHA', role: '指挥', aim: 78, movement: 76, clutch: 78, nade: 84 },
    { name: 'reck', role: '步枪', aim: 79, movement: 78, clutch: 77, nade: 75 },
    { name: 'mhL', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 75 } ] },
  { id: 'sangal', name: 'Sangal Esports', tag: 'Sangal', region: '欧洲', style: '重建期青训+新援', rating: 68, players: [
    { name: 'R4DYX', role: '狙击', aim: 87, movement: 80, clutch: 76, nade: 73 },
    { name: 'bnox', role: '步枪', aim: 81, movement: 77, clutch: 74, nade: 78 },
    { name: 'puuha', role: '指挥', aim: 76, movement: 72, clutch: 78, nade: 87 },
    { name: 'Joey', role: '步枪', aim: 78, movement: 74, clutch: 72, nade: 74 },
    { name: 'adamS', role: '步枪', aim: 77, movement: 73, clutch: 73, nade: 75 } ] },
  { id: 'nrg', name: 'NRG Esports', tag: 'NRG', region: '北美', style: '结构化慢节奏默认', rating: 68, players: [
    { name: 'hallzerk', role: '狙击', aim: 86, movement: 78, clutch: 81, nade: 74 },
    { name: 'Jeorge', role: '步枪', aim: 82, movement: 80, clutch: 76, nade: 73 },
    { name: 'Sonic', role: '突破', aim: 80, movement: 81, clutch: 71, nade: 76 },
    { name: 'Grim', role: '步枪', aim: 79, movement: 77, clutch: 70, nade: 75 },
    { name: 'nitr0', role: '指挥', aim: 76, movement: 79, clutch: 73, nade: 86 } ] },
  { id: 'nemiga', name: 'Nemiga', tag: 'NM', region: '独联体', style: '年轻化快节奏对枪', rating: 66, players: [
    { name: 'syph0', role: '狙击', aim: 86, movement: 82, clutch: 84, nade: 78 },
    { name: 'KaiR0N-', role: '突破', aim: 81, movement: 82, clutch: 79, nade: 74 },
    { name: 'khaN', role: '指挥', aim: 78, movement: 76, clutch: 80, nade: 85 },
    { name: 'sowalio', role: '步枪', aim: 79, movement: 78, clutch: 77, nade: 76 },
    { name: 'robo', role: '步枪', aim: 76, movement: 77, clutch: 74, nade: 73 } ] },
  { id: 'imperial', name: 'Imperial', tag: 'IMP', region: '巴西', style: '老将带新秀阵地战', rating: 66, players: [
    { name: 'chelo', role: '狙击', aim: 84, movement: 80, clutch: 80, nade: 76 },
    { name: 'decenty', role: '步枪', aim: 81, movement: 79, clutch: 79, nade: 76 },
    { name: 'noway', role: '步枪', aim: 80, movement: 80, clutch: 78, nade: 75 },
    { name: 'saadzin', role: '步枪', aim: 80, movement: 79, clutch: 78, nade: 76 },
    { name: 'VINI', role: '指挥', aim: 78, movement: 77, clutch: 77, nade: 84 } ] },
  { id: 'bestia', name: 'BESTIA', tag: 'BESTIA', region: '南美（阿根廷）', style: '南美年轻枪男', rating: 66, players: [
    { name: 'tomaszin', role: '突破', aim: 84, movement: 83, clutch: 81, nade: 77 },
    { name: 'cass1n', role: '步枪', aim: 81, movement: 79, clutch: 78, nade: 75 },
    { name: 'buda', role: '步枪', aim: 81, movement: 80, clutch: 78, nade: 76 },
    { name: 'timo', role: '步枪', aim: 80, movement: 79, clutch: 76, nade: 74 },
    { name: 'nacho', role: '步枪', aim: 79, movement: 77, clutch: 76, nade: 77 } ] },
  { id: 'fluxo', name: 'Fluxo', tag: 'FX', region: '巴西', style: '巴西快节奏+前期信息战', rating: 65, players: [
    { name: 'exit', role: '狙击', aim: 85, movement: 80, clutch: 83, nade: 77 },
    { name: 'kye', role: '突破', aim: 80, movement: 83, clutch: 78, nade: 75 },
    { name: 'zevy', role: '指挥', aim: 80, movement: 79, clutch: 78, nade: 84 },
    { name: 'dav1deuS', role: '步枪', aim: 80, movement: 79, clutch: 79, nade: 74 },
    { name: 'Ltz', role: '步枪', aim: 78, movement: 78, clutch: 75, nade: 74 } ] },
  { id: 'rareatom', name: 'Rare Atom', tag: 'RA', region: '中国', style: '体系化慢攻', rating: 65, players: [
    { name: 'L1haNg', role: '步枪', aim: 82, movement: 80, clutch: 79, nade: 76 },
    { name: 'chengking', role: '步枪', aim: 81, movement: 79, clutch: 78, nade: 75 },
    { name: 'Summer', role: '指挥', aim: 81, movement: 75, clutch: 79, nade: 85 },
    { name: '3gl', role: '步枪', aim: 81, movement: 78, clutch: 76, nade: 75 },
    { name: 'Trash', role: '步枪', aim: 79, movement: 78, clutch: 76, nade: 74 } ] },
  { id: 'onewin', name: '1WIN', tag: '1WIN', region: '俄罗斯', style: '俄式结构 CS 重组', rating: 63, players: [
    { name: 'Ax1Le', role: '狙击', aim: 87, movement: 76, clutch: 80, nade: 74 },
    { name: 'ArtFr0st', role: '突破', aim: 83, movement: 84, clutch: 79, nade: 74 },
    { name: 'BELCHONOKK', role: '步枪', aim: 81, movement: 77, clutch: 76, nade: 78 },
    { name: 'fame', role: '补枪', aim: 79, movement: 74, clutch: 78, nade: 82 },
    { name: 'nafany', role: '指挥', aim: 76, movement: 72, clutch: 77, nade: 86 } ] },
  { id: 'marsborne', name: 'Marsborne', tag: 'Marsborne', region: '北美', style: '年轻火力+快节奏前压', rating: 62, players: [
    { name: 'nicx', role: '狙击', aim: 85, movement: 77, clutch: 79, nade: 75 },
    { name: 'WUMBO', role: '步枪', aim: 81, movement: 79, clutch: 73, nade: 75 },
    { name: 'ogwizard', role: '步枪', aim: 80, movement: 80, clutch: 74, nade: 76 },
    { name: 'Grizz', role: '步枪', aim: 79, movement: 78, clutch: 72, nade: 74 },
    { name: 'freshie', role: '指挥', aim: 77, movement: 79, clutch: 75, nade: 85 } ] },
  { id: 'saw', name: 'SAW', tag: 'SAW', region: '葡萄牙', style: '葡式战术纪律流', rating: 56, players: [
    { name: 'NOPEEj', role: '狙击', aim: 85, movement: 74, clutch: 73, nade: 72 },
    { name: 'ewjerkz', role: '步枪', aim: 82, movement: 77, clutch: 77, nade: 78 },
    { name: 'story', role: '步枪', aim: 81, movement: 77, clutch: 79, nade: 80 },
    { name: 'krazy', role: '补枪', aim: 79, movement: 75, clutch: 76, nade: 81 },
    { name: 'MUTiRiS', role: '指挥', aim: 76, movement: 73, clutch: 78, nade: 87 } ] },
  { id: 'ence', name: 'ENCE', tag: 'ENCE', region: '芬兰', style: '芬兰青训新军', rating: 55, players: [
    { name: 'Cliqq', role: '狙击', aim: 83, movement: 78, clutch: 78, nade: 70 },
    { name: 'millert', role: '步枪', aim: 80, movement: 78, clutch: 74, nade: 74 },
    { name: 'teme', role: '步枪', aim: 80, movement: 77, clutch: 75, nade: 74 },
    { name: 'Schwarz', role: '步枪', aim: 80, movement: 76, clutch: 74, nade: 74 },
    { name: 'HENU', role: '指挥', aim: 76, movement: 66, clutch: 76, nade: 86 } ] }
];

// 比赛模拟函数钩子：默认概率模型（simSeries）；真实引擎测试/模拟可通过 setMajorSim 替换
let majorSimFn = null;
export function setMajorSim(fn) { majorSimFn = fn; }
function runSeries(a, b, bo) {
  if (majorSimFn) return majorSimFn(a, b, bo);
  return simSeries(a, b, bo);
}

function makeMajorState(teamId) {
  const teams = MAJOR_TEAMS.map((t) => ({ ...t, players: t.players.map((p) => ({ ...p })) }))
    .sort((a, b) => b.rating - a.rating)
    .map((t, i) => ({ ...t, seed: i + 1 }));
  const user = teams.find((t) => t.id === teamId) || teams[0];
  return {
    stage: 'qualifier', // qualifier -> s1 -> s2 -> s3 -> playoff
    qual: makeSwiss(teams.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), '积分赛'),
    s1: null, s2: null, s3: null, playoff: null,
    user, wins: 0, losses: 0, champion: null, lastResult: null, currentMatch: null, series: null
  };
}

// 48 队预选（积分瑞士轮，5 轮取前 32）→ 正赛三阶段（同步 IEM Cologne Major 2026）
// 瑞士轮: 同战绩池按 rating 相邻配对; 3 胜晋级 3 负淘汰（s1/s2/s3）
function makeSwiss(entries, label) {
  return { label, teams: entries, round: 0, rounds: [], done: false };
}

function swissPairUp(pool) {
  pool.sort((a, b) => b.team.rating - a.team.rating);
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue;
    let j = i + 1;
    while (j < pool.length && (used.has(j) || pool[i].opps.includes(pool[j].team.id))) j++;
    if (j >= pool.length) {
      // 池内找不到新对手：与任意未配者强制配对（允许重赛，避免奇数残留卡死）
      j = i + 1;
      while (j < pool.length && used.has(j)) j++;
      if (j < pool.length) { used.add(i); used.add(j); pairs.push([pool[i], pool[j]]); }
      continue;
    }
    used.add(i); used.add(j);
    pairs.push([pool[i], pool[j]]);
  }
  return { pairs, leftovers: pool.filter((_, i) => !used.has(i)) };
}

// 瑞士轮配对：同战绩池内优先；配不上的顺延到相邻战绩池（保证每轮全部配完）
function buildPairings(sw) {
  let carry = [];
  const all = [];
  const maxW = Math.min(sw.round - 1, 2);
  for (let w = maxW; w >= 0; w--) {
    const rec = [w, sw.round - 1 - w];
    const pool = carry.concat(sw.teams.filter((t) => t.status === 'in' && t.wins === rec[0] && t.losses === rec[1]));
    carry = [];
    if (!pool.length) continue;
    const { pairs, leftovers } = swissPairUp(pool);
    all.push(...pairs);
    carry = leftovers;
  }
  // 兜底：剩余未配对队伍强制两两配对（允许重赛，保证每轮全部配完不卡死）
  if (carry.length) {
    const pairedIds = new Set();
    for (const [a, b] of all) { pairedIds.add(a.team.id); pairedIds.add(b.team.id); }
    const rest = sw.teams.filter((t) => t.status === 'in' && !pairedIds.has(t.team.id));
    for (let i = 0; i + 1 < rest.length; i += 2) all.push([rest[i], rest[i + 1]]);
  }
  return all;
}

// 通用单图模拟（career/ranked 共用；MR12 13 分）
function simScore(a, b) {
  const diff = a.rating - b.rating;
  const p = clamp(0.5 + diff * 0.004, 0.22, 0.86);
  const aw = ctx.rand() < p;
  const wa = aw ? a : b;
  const loser = aw ? b : a;
  const x = Math.round(13 - Math.floor(ctx.rand() * (wa.rating - loser.rating > 3 ? 7 : 3)));
  const score = [x, Math.max(4, 13 - x)];
  if (ctx.rand() < 0.3) score[0] -= 1;
  return { winner: wa, score };
}

// Major 用 MR12：先到 13 分获胜（同步 IEM Cologne 2026）；胜率系数按 HLTV 模型放大
function majorSimScore(a, b) {
  const diff = a.rating - b.rating;
  const p = clamp(0.5 + diff * 0.012, 0.22, 0.9);
  const aw = ctx.rand() < p;
  const wa = aw ? a : b;
  const loser = aw ? b : a;
  const margin = wa.rating - loser.rating > 3 ? 3 + Math.floor(ctx.rand() * 4) : 1 + Math.floor(ctx.rand() * 3);
  const winnerScore = 13;
  const loserScore = Math.max(1, winnerScore - margin);
  const score = aw ? [winnerScore, loserScore] : [loserScore, winnerScore];
  return { winner: wa, score };
}

function simSeries(a, b, bo) {
  const need = Math.ceil(bo / 2);
  let wa = 0, wb = 0;
  const maps = [];
  while (wa < need && wb < need) {
    const r = majorSimScore(a, b);
    maps.push(r.score);
    if (r.winner.id === a.id) wa++; else wb++;
  }
  return { winner: wa >= need ? a : b, score: [wa, wb], maps, bo };
}

function playSwissRound(sw) {
  sw.round++;
  const round = { n: sw.round, pairs: [] };
  const done = new Set();
  for (const [a, b] of buildPairings(sw)) {
    const r = runSeries(a.team, b.team, 1);
    if (r.winner.id === a.team.id) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    a.opps.push(b.team.id); b.opps.push(a.team.id);
    done.add(a.team.id); done.add(b.team.id);
    round.pairs.push({ a: a.team, b: b.team, winner: r.winner, score: r.score, maps: r.maps, bo: 1, played: true });
  }
  sw.rounds.push(round);
}

// 正赛瑞士轮（3 胜晋级 / 3 负淘汰；前 2 轮 BO1，后 3 轮 BO3）
function playMajorSwissRound(sw, round) {
  sw.round++;
  const roundDef = { n: sw.round, pairs: [] };
  for (const [a, b] of buildPairings(sw)) {
    const bo = sw.allBO3 ? 3 : (round <= 2 ? 1 : 3);
    const r = runSeries(a.team, b.team, bo);
    if (r.winner.id === a.team.id) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    a.opps.push(b.team.id); b.opps.push(a.team.id);
    roundDef.pairs.push({ a: a.team, b: b.team, winner: r.winner, score: r.score, maps: r.maps, bo, played: true });
  }
  sw.rounds.push(roundDef);
  for (const t of sw.teams) {
    if (t.status === 'in' && t.wins >= 3) t.status = 'adv';
    else if (t.status === 'in' && t.losses >= 3) t.status = 'elim';
  }
  sw.done = sw.teams.every((t) => t.status !== 'in');
}

function finalizeQualifier(st) {
  const ranked = st.qual.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  const adv = ranked.slice(0, 32).map((e) => e.team);
  const s3Invite = adv.slice(0, 8);   // 预选前 8 → 直进 Stage 3（传奇组）
  const s2Invite = adv.slice(8, 16);  // 9-16 → 直进 Stage 2（挑战组）
  const s1Invite = adv.slice(16, 32); // 17-32 → 从 Stage 1 打起（竞争组）
  st.qual.done = true;
  st.s1 = makeSwiss(s1Invite.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 1');
  st.s2 = makeSwiss(s2Invite.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 2');
  st.s3 = makeSwiss(s3Invite.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })), 'Stage 3');
  st.s1.allBO3 = false; st.s2.allBO3 = false; st.s3.allBO3 = true; // Stage 3 全 BO3
  st.stage = 's1';
}

function mergeStages(st, from, to) {
  const adv = from.teams.filter((t) => t.status === 'adv').map((e) => e.team);
  to.teams = to.teams.concat(adv.map((t) => ({ team: t, wins: 0, losses: 0, opps: [], status: 'in' })));
  st.stage = to === st.s2 ? 's2' : 's3';
}

function makePlayoff(st) {
  const adv = st.s3.teams.filter((t) => t.status === 'adv')
    .sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating)
    .map((e) => e.team); // 种子 1-8
  const rounds = [];
  const qf = [
    [adv[0], adv[7]], [adv[3], adv[4]], [adv[2], adv[5]], [adv[1], adv[6]]
  ].map(([a, b]) => ({ a, b, winner: null, score: null, maps: null, bo: 3, played: false }));
  rounds.push({ pairs: qf, bo: 3, label: '1/4 决赛' });
  st.playoff = { rounds, round: 0 };
  st.stage = 'playoff';
}

function playPlayoffRound(st) {
  if (st.champion) return;
  const pf = st.playoff;
  const cur = pf.rounds[pf.round];
  if (!cur || !cur.pairs.length) return;
  const wins = [];
  for (const m of cur.pairs) {
    const r = runSeries(m.a, m.b, m.bo);
    m.played = true; m.winner = r.winner; m.score = r.score; m.maps = r.maps;
    wins.push(r.winner);
  }
  if (wins.length === 1) {
    st.champion = wins[0];
    emit('toast', { text: (st.champion.id === st.user.id ? '你 ' : '') + st.champion.tag + ' 夺得 Major 冠军！' });
    return;
  }
  const nextPairs = [];
  for (let i = 0; i < wins.length; i += 2) {
    nextPairs.push({ a: wins[i], b: wins[i + 1], winner: null, score: null, maps: null, bo: 3, played: false });
  }
  const label = pf.round === 0 ? '半决赛' : '决赛';
  if (pf.round === 1) nextPairs[0].bo = 5; // 决赛 BO5
  pf.rounds.push({ pairs: nextPairs, label });
  pf.round++;
}

function currentSwiss(st) {
  if (st.stage === 's1') return st.s1;
  if (st.stage === 's2') return st.s2;
  if (st.stage === 's3') return st.s3;
  return null;
}

// 从各阶段记录同步用户队胜/负（自动模拟时也要计入）
function syncUserRecord(st) {
  let w = 0, l = 0;
  const swisses = [st.qual, st.s1, st.s2, st.s3];
  for (const sw of swisses) {
    if (!sw) continue;
    for (const r of sw.rounds) {
      for (const p of r.pairs) {
        if (!p.winner) continue;
        if (p.a.id === st.user.id || p.b.id === st.user.id) {
          if (p.winner.id === st.user.id) w++; else l++;
        }
      }
    }
  }
  if (st.playoff) {
    for (const r of st.playoff.rounds) {
      for (const p of r.pairs) {
        if (!p.winner) continue;
        if (p.a.id === st.user.id || p.b.id === st.user.id) {
          if (p.winner.id === st.user.id) w++; else l++;
        }
      }
    }
  }
  st.wins = w; st.losses = l;
}

function advanceMajorRound(game) {
  const st = game.major;
  if (st.stage === 'qualifier') {
    const q = st.qual;
    if (q.round >= 5) { finalizeQualifier(st); return; }
    playSwissRound(q);
  } else if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
    const sw = currentSwiss(st);
    if (sw.done) {
      if (st.stage === 's1') { mergeStages(st, st.s1, st.s2); }
      else if (st.stage === 's2') { mergeStages(st, st.s2, st.s3); }
      else { makePlayoff(st); }
      return;
    }
    playMajorSwissRound(sw, sw.round + 1);
  } else if (st.stage === 'playoff') {
    playPlayoffRound(st);
  }
  syncUserRecord(st);
}

function teamDiffParams(team) {
  const r = team.rating;
  return {
    react: clamp(0.2 - r * 0.0011, 0.055, 0.18),
    spreadMult: clamp(1.18 - r * 0.0055, 0.55, 1.05),
    view: 980 + r * 2.4,
    strafe: clamp(0.68 - r * 0.0025, 0.36, 0.62),
    aimSpeed: 34 + r * 0.55,
    idealMin: 190 + r * 0.4,
    idealMax: 520 + r * 1.2,
    rushChance: 0.2 + (r - 75) * 0.012,
    rotateChance: 0.35 + (r - 75) * 0.012,
    saveChance: clamp(0.3 + (r - 75) * 0.01, 0.3, 0.8)
  };
}

function stageLabel(st) {
  if (st.stage === 'qualifier') return '预选赛 · 48 队瑞士轮（前 32 晋级）';
  if (st.stage === 's1') return 'Stage 1 · 竞争组瑞士轮（前 8 晋级）';
  if (st.stage === 's2') return 'Stage 2 · 挑战组瑞士轮（前 8 晋级）';
  if (st.stage === 's3') return 'Stage 3 · 传奇组瑞士轮（前 8 晋级）';
  if (st.stage === 'playoff') return '淘汰赛 · 单败 BO3 / 决赛 BO5';
  return '比赛进行中';
}

function findUserMatch(st) {
  if (st.stage === 'qualifier') {
    const q = st.qual;
    if (q.round >= 5) return null;
    for (const r of q.rounds) {
      const m = r.pairs.find((x) => x.a.id === st.user.id || x.b.id === st.user.id);
      if (m && !m.userDone) return m;
    }
    return null;
  }
  if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
    const sw = currentSwiss(st);
    if (!sw || sw.done) return null;
    for (const r of sw.rounds) {
      const m = r.pairs.find((x) => x.a.id === st.user.id || x.b.id === st.user.id);
      if (m && !m.userDone) return m;
    }
    return null;
  }
  if (st.stage === 'playoff') {
    const pf = st.playoff;
    if (!pf) return null;
    const cur = pf.rounds[pf.round];
    if (!cur) return null;
    const m = cur.pairs.find((x) => x.a.id === st.user.id || x.b.id === st.user.id);
    return m && !m.played ? m : null;
  }
  return null;
}

function swissEntry(st, id) {
  if (st.stage === 'qualifier') return st.qual.teams.find((e) => e.team.id === id) || null;
  const sw = currentSwiss(st);
  return sw ? sw.teams.find((e) => e.team.id === id) || null : null;
}

function simUserMatch(game, m) {
  const st = game.major;
  const bo = m.bo || 1;
  const r = runSeries(m.a, m.b, bo);
  m.played = true;
  m.winner = r.winner;
  m.score = r.score;
  m.maps = r.maps;
  m.userDone = true;
  if (r.winner.id === st.user.id) st.wins++;
  else st.losses++;
  const userE = swissEntry(st, st.user.id);
  const oppE = swissEntry(st, m.a.id === st.user.id ? m.b.id : m.a.id);
  if (userE && oppE && (st.stage === 'qualifier' || st.stage === 's1' || st.stage === 's2' || st.stage === 's3')) {
    if (r.winner.id === st.user.id) { userE.wins++; oppE.losses++; } else { oppE.wins++; userE.losses++; }
    userE.opps.push(oppE.team.id); oppE.opps.push(userE.team.id);
    if (st.stage !== 'qualifier') {
      if (userE.status === 'in' && userE.wins >= 3) userE.status = 'adv';
      if (oppE.status === 'in' && oppE.wins >= 3) oppE.status = 'adv';
      if (userE.status === 'in' && userE.losses >= 3) userE.status = 'elim';
      if (oppE.status === 'in' && oppE.losses >= 3) oppE.status = 'elim';
    }
  }
}

function startMajorPlay(game) {
  const st = game.major;
  const m = findUserMatch(st);
  if (!m) { advanceMajorRound(game); return; }
  const opp = m.a.id === st.user.id ? m.b : m.a;
  st.currentMatch = m;
  st.lastStage = st.stage;
  st.stage = 'match';
  const stageIdx = { qualifier: 0, s1: 1, s2: 2, s3: 3, playoff: 4 }[st.lastStage] || 0;
  game.opts.mapId = ['dust2', 'canal', 'metro'][stageIdx % 3];
  game.opts.team = st.user.id.charCodeAt(0) % 2 ? 't' : 'ct';
  game.opts.bots = 4;
  game.opts.diff = 'hard';
  game.opts.diffParams = teamDiffParams(opp);
  game.matchWin = 13; // Major 为 MR12（先到 13 分）
  game.otWin = 15;    // 12:12 进入加时 MR3
  game.noRoundEnd = false;
  setupMatchEntities(game);
  startRound(game);
  emit('toast', { text: stageLabel(st) + ' · ' + st.user.tag + ' vs ' + opp.tag + (m.bo > 1 ? '（BO' + m.bo + '）' : '') });
}

function swissTableHtml(sw, st) {
  const rows = sw.teams.slice().sort((a, b) => b.wins - a.wins || b.team.rating - a.team.rating);
  let html = '<div class="swiss-table"><div class="st-row st-head"><span>排名</span><span>队伍</span><span>战绩</span><span>状态</span></div>';
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const isUser = e.team.id === st.user.id;
    const status = e.status === 'adv' ? '晋级' : (e.status === 'elim' ? '淘汰' : '');
    html += '<div class="st-row' + (isUser ? ' user' : '') + '"><span>' + (i + 1) + '</span><span><b>' + esc(e.team.tag) + '</b> ' + esc(e.team.name) + '</span><span>' + e.wins + ':' + e.losses + '</span><span>' + status + '</span></div>';
  }
  html += '</div>';
  return html;
}

function pairsHtml(st, pairs, label, cur) {
  let html = '<div class="major-round"><div class="mr-label">' + label + (cur ? ' · 进行中' : '') + '</div>';
  for (const m of pairs) {
    const hasUser = m.a.id === st.user.id || m.b.id === st.user.id;
    const done = m.played;
    const sc = (a, b) => done ? (m.score[a] + ':' + m.score[b]) : '';
    html += '<div class="mr-card' + (hasUser ? ' user' : '') + '">';
    html += '<div class="mr-team' + (done && m.winner.id === m.a.id ? ' win' : '') + '"><span>' + esc(m.a.tag) + '</span><b>' + sc(0, 1) + '</b></div>';
    html += '<div class="mr-team' + (done && m.winner.id === m.b.id ? ' win' : '') + '"><span>' + esc(m.b.tag) + '</span><b>' + sc(1, 0) + '</b></div>';
    if (cur && !done && hasUser && m.userDone === undefined) html += '<div class="mr-act"><button class="btn small" data-ma="play">亲自打</button><button class="btn small" data-ma="simMine">模拟本场</button></div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderMajorPanel(game) {
  if (typeof document === 'undefined') return;
  const st = game.major;
  if (!st) return;
  const el = document.getElementById('majorPanel');
  if (!el) return;
  el.style.display = 'block';
  const body = document.getElementById('majorBracket');
  if (!body) return;
  let html = '<div class="major-status">你的队伍 <b class="m-user">' + esc(st.user.tag) + '</b> · ' + esc(st.user.name) + ' · VRS #' + st.user.seed + ' · 胜 ' + st.wins + ' / 负 ' + st.losses + '</div>';
  html += '<div class="major-stage">' + stageLabel(st) + '</div>';
  html += '<div class="major-scroll">';
  if (st.stage === 'qualifier') {
    const q = st.qual;
    const cur = q.rounds[q.rounds.length - 1];
    html += pairsHtml(st, cur ? cur.pairs : [], '瑞士轮 R' + q.round, true);
    html += swissTableHtml(q, st);
  } else if (st.stage === 's1' || st.stage === 's2' || st.stage === 's3') {
    const sw = currentSwiss(st);
    const cur = sw.rounds[sw.rounds.length - 1];
    html += pairsHtml(st, cur ? cur.pairs : [], '瑞士轮 R' + sw.round, !sw.done);
    html += swissTableHtml(sw, st);
  } else if (st.stage === 'playoff') {
    for (let i = 0; i < st.playoff.rounds.length; i++) {
      const r = st.playoff.rounds[i];
      if (!r.pairs.length) continue;
      html += pairsHtml(st, r.pairs, r.label, i === st.playoff.round && st.playoff.rounds.length < 4);
    }
  }
  html += '</div>';
  if (st.champion) html += '<div class="major-champ">冠军：' + esc(st.champion.name) + '</div>';
  body.innerHTML = html;
  body.querySelectorAll('[data-ma]').forEach((btn) => {
    btn.onclick = () => majorAction(game, btn.getAttribute('data-ma'));
  });
}

export function majorAction(game, action) {
  const st = game.major;
  if (!st) return;
  if (action === 'simRound') {
    advanceMajorRound(game);
    renderMajorPanel(game);
  }
  else if (action === 'play') {
    startMajorPlay(game);
    if (typeof document !== 'undefined') { const p = document.getElementById('majorPanel'); if (p) p.style.display = 'none'; }
  }
  else if (action === 'simMine') {
    const m = findUserMatch(st);
    if (m) simUserMatch(game, m);
    renderMajorPanel(game);
  }
  else if (action === 'next') {
    game.over = false;
    game.state = 'MAJOR';
    if (game.major.stage === 'match') game.major.stage = game.major.lastStage || 'qualifier';
    if (game.ui) { game.ui.hideEnd(); }
  }
  else if (action === 'menu') { game.ui.hideEnd(); game.ui.showMenu(); }
}

`;

const out = src.slice(0, s) + NEW_MAJOR + src.slice(e);
writeFileSync(path, out, 'utf8');
console.log('done. new size:', Buffer.byteLength(out, 'utf8'));
