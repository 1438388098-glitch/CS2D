// 生成世界杯风格 Major 赛程播报页 v2（极简高级风）
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'D:/Claudeworkspace/CS2D/';
const r = JSON.parse(readFileSync(root + 'major-real-results.json', 'utf8'))[0];

const TAGS = {
  spirit: 'Spirit', falcons: 'FLC', vitality: 'VIT', furia: 'FURIA', mouz: 'MOUZ', navi: 'NAVI',
  aurora: 'AUR', g2: 'G2', faze: 'FaZe', mongolz: 'MongolZ', astralis: 'Astralis', pain: 'paiN',
  '9z': '9z', betboom: 'BetBoom', b8: 'B8', legacy: 'LG', parivision: 'PV', liquid: 'Liquid',
  gl: 'GL', mibr: 'MIBR', '3dmax': '3DMAX', heroic: 'Heroic', nip: 'NIP', big: 'BIG',
  tyloo: 'TYLOO', eyeballers: 'EYE', efire: 'EF', '100t': '100T', vp: 'VP', lynnvision: 'LVG',
  fnatic: 'Fnatic', m80: 'M80', sashi: 'Sashi', nine: '9INE', bcg: 'BCG', metizport: 'Metizport',
  wildcard: 'WC', sangal: 'Sangal', nrg: 'NRG', nemiga: 'NM', imperial: 'IMP', bestia: 'BESTIA',
  fluxo: 'FX', rareatom: 'RA', onewin: '1WIN', marsborne: 'Marsborne', saw: 'SAW', ence: 'ENCE'
};
const T = (id) => TAGS[id] || id;
const hue = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function matchCard(m, bo, cls) {
  const aWin = m.winner === m.a;
  const maps = m.maps ? m.maps.map((s) => s.join(':')).join(' · ') : '';
  const w = aWin ? m.a : m.b, l = aWin ? m.b : m.a;
  const ws = aWin ? m.score[0] : m.score[1], ls = aWin ? m.score[1] : m.score[0];
  return `<div class="mc${cls ? ' ' + cls : ''}">
    <div class="mrow win"><span class="dot" style="--h:${hue(w)}"></span><span class="mn">${T(w)}</span><span class="ms">${ws}</span></div>
    <div class="mrow"><span class="dot" style="--h:${hue(l)}"></span><span class="mn">${T(l)}</span><span class="ms">${ls}</span></div>
    <div class="mm">BO${bo}${maps ? ' · ' + maps : ''}</div>
  </div>`;
}

const qfCol = r.playoff[0].pairs.map((m) => matchCard(m, 3)).join('');
const sfCol = r.playoff[1].pairs.map((m) => matchCard(m, 3)).join('');
const finalM = r.playoff[2].pairs[0];
const finCol = matchCard(finalM, 5, 'fin');
const champTag = T(r.champion.id);
const runnerTag = T(finalM.winner === finalM.a ? finalM.b : finalM.a);
const champScore = finalM.winner === finalM.a ? `${finalM.score[0]} : ${finalM.score[1]}` : `${finalM.score[1]} : ${finalM.score[0]}`;

const stageHtml = [
  { name: 'Stage 1 · 竞争组', sw: r.s1 },
  { name: 'Stage 2 · 挑战组', sw: r.s2 },
  { name: 'Stage 3 · 传奇组', sw: r.s3 }
].map((s) => {
  const sw = s.sw;
  const rounds = sw.rounds.map((rd) => {
    const line = rd.pairs.map((p) => `<span class="pv">${T(p.a)} <b>${p.score.join(':')}</b> ${T(p.b)}${p.bo > 1 ? `<i>B${p.bo}</i>` : ''}</span>`).join('');
    return `<div class="rd"><span class="rn">R${rd.n}</span><span class="rm">${line}</span></div>`;
  }).join('');
  const adv = sw.teams.filter((t) => t.status === 'adv').map((t) => `<span class="av"><span class="dot" style="--h:${hue(t.id)}"></span>${T(t.id)}</span>`).join('');
  return `<div class="stage">
    <div class="sh"><h3>${s.name}</h3><span class="st">瑞士轮 · 3 胜晋级 / 3 负淘汰</span></div>
    <div class="rounds">${rounds}</div>
    <div class="ad">晋级 <b>${adv}</b></div>
  </div>`;
}).join('');

const qualRows = r.qualRanking.map((e, i) => {
  const rank = i + 1;
  let cls = 'qd';
  if (rank <= 8) cls = 'q1';
  else if (rank <= 16) cls = 'q2';
  else if (rank <= 32) cls = 'q3';
  return `<div class="qrow ${cls}"><span class="qk">${String(rank).padStart(2, '0')}</span><span class="qn">${T(e.id)}</span><span class="qr">${e.w}·${e.l}</span><span class="qs">${rank <= 32 ? '晋级' : '—'}</span></div>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2026 Major · 赛程</title>
<style>
  :root{
    --bg:#0a0b0d; --panel:rgba(255,255,255,.028); --panel2:rgba(255,255,255,.05);
    --line:rgba(255,255,255,.08); --line2:rgba(255,255,255,.14);
    --txt:#e8ebf0; --dim:#8f98a8; --faint:#5b6472;
    --acc:#e0b56a; --acc2:rgba(224,181,106,.14);
    --ok:#86d9a8;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{-webkit-font-smoothing:antialiased}
  body{
    background:var(--bg);
    background-image:radial-gradient(900px 380px at 50% -140px, rgba(224,181,106,.05), transparent 65%);
    color:var(--txt);
    font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",-apple-system,sans-serif;
    font-size:14px; line-height:1.6;
  }
  .wrap{max-width:980px;margin:0 auto;padding:64px 32px 90px}
  /* header */
  header{text-align:center;padding-bottom:56px}
  .eyebrow{font-size:11px;letter-spacing:.42em;color:var(--faint);margin-bottom:18px}
  h1{font-size:30px;font-weight:700;letter-spacing:.06em;color:var(--txt)}
  .champ-line{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:34px}
  .champ-line .cup{width:34px;height:34px;border-radius:50%;border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;color:var(--acc);font-size:15px;background:var(--acc2)}
  .champ-line .cw{font-size:26px;font-weight:700;letter-spacing:.05em}
  .champ-line .cs{font-size:26px;font-weight:700;color:var(--acc);font-variant-numeric:tabular-nums}
  .champ-line .ru{font-size:15px;color:var(--dim)}
  .champ-line .bd{font-size:10px;color:var(--faint);letter-spacing:.2em;border:1px solid var(--line);border-radius:4px;padding:2px 7px}
  .champ-line .sep{width:1px;height:26px;background:var(--line)}
  /* section */
  .sec{display:flex;align-items:baseline;justify-content:space-between;margin:54px 0 22px}
  .sec h2{font-size:15px;font-weight:600;letter-spacing:.22em;color:var(--txt)}
  .sec .sub{font-size:11px;color:var(--faint);letter-spacing:.14em}
  /* tree */
  .tree{position:relative;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 44px;padding:26px 0 14px}
  #links{position:absolute;inset:0;pointer-events:none;width:100%;height:100%}
  .col{display:flex;flex-direction:column;gap:26px}
  .col .cl{font-size:10px;letter-spacing:.34em;color:var(--faint);text-align:center;margin-bottom:2px}
  .col.right{justify-content:center;gap:34px}
  .mc{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px 10px;transition:border-color .15s,background .15s}
  .mc:hover{border-color:var(--line2);background:var(--panel2)}
  .mc.fin{border-color:rgba(224,181,106,.35);background:linear-gradient(180deg,rgba(224,181,106,.06),rgba(255,255,255,.02))}
  .mrow{display:flex;align-items:center;gap:10px;padding:3px 0}
  .mrow .dot{width:7px;height:7px;border-radius:50%;background:hsl(var(--h) 60% 62%);flex:none;opacity:.85}
  .mrow .mn{flex:1;font-size:14px;font-weight:500;letter-spacing:.03em}
  .mrow .ms{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dim)}
  .mrow.win .mn{color:var(--txt);font-weight:600}
  .mrow.win .ms{color:var(--acc)}
  .mrow.win{position:relative}
  .mrow.win::before{content:"";position:absolute;left:-16px;top:4px;bottom:4px;width:2px;border-radius:2px;background:var(--acc);opacity:.75}
  .mm{margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.05);font-size:10px;color:var(--faint);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .champ-box{margin-top:2px;text-align:center}
  .champ-box .t1{font-size:10px;letter-spacing:.5em;color:var(--faint)}
  .champ-box .t2{font-size:40px;font-weight:800;letter-spacing:.06em;color:var(--acc);line-height:1.25;text-shadow:0 0 40px rgba(224,181,106,.18)}
  .champ-box .t3{font-size:12px;color:var(--dim);margin-top:4px}
  /* stages */
  .stages{display:grid;gap:16px}
  .stage{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px}
  .sh{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px}
  .sh h3{font-size:13.5px;font-weight:600;letter-spacing:.12em}
  .sh .st{font-size:10px;color:var(--faint);letter-spacing:.12em}
  .rounds{display:grid;gap:3px}
  .rd{display:flex;gap:14px;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)}
  .rd:last-child{border-bottom:none}
  .rn{flex:none;width:26px;font-size:10px;color:var(--faint);font-variant-numeric:tabular-nums}
  .rm{display:flex;flex-wrap:wrap;gap:3px 18px;font-size:12px;color:var(--dim)}
  .pv b{color:var(--txt);font-weight:600;font-variant-numeric:tabular-nums}
  .pv i{color:var(--faint);font-style:normal;font-size:9px;margin-left:3px}
  .ad{margin-top:12px;font-size:12px;color:var(--faint);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .ad .av{display:inline-flex;align-items:center;gap:7px;color:var(--ok);font-weight:500;font-size:12.5px;padding:2px 0}
  .ad .av .dot{width:6px;height:6px;opacity:.9}
  /* qualifier */
  .qual{display:grid;grid-template-columns:repeat(4,1fr);gap:0 26px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 6px}
  .qrow{display:flex;align-items:center;gap:9px;padding:5px 12px;border-radius:7px;font-size:12.5px}
  .qk{width:22px;color:var(--faint);font-size:10.5px;font-variant-numeric:tabular-nums}
  .qn{flex:1;font-weight:500;letter-spacing:.02em}
  .qr{color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums}
  .qs{width:26px;text-align:right;font-size:10px}
  .q1 .qn{color:var(--acc)} .q1 .qs{color:var(--ok)}
  .q2 .qn{color:#c7d5e8} .q2 .qs{color:var(--ok)}
  .q3 .qn{color:var(--txt)} .q3 .qs{color:var(--ok)}
  .qd .qn{color:var(--faint)} .qd .qs{color:var(--faint)}
  .legend{display:flex;gap:22px;margin-top:14px;font-size:10.5px;color:var(--faint);letter-spacing:.06em}
  .legend span{display:inline-flex;align-items:center;gap:7px}
  .legend i{width:8px;height:8px;border-radius:2px;display:inline-block}
  footer{margin-top:64px;text-align:center;font-size:10px;color:var(--faint);letter-spacing:.18em}
  @media(max-width:820px){
    .tree{grid-template-columns:1fr;gap:34px}
    .qual{grid-template-columns:repeat(2,1fr)}
    h1{font-size:24px}
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">2026 MAJOR · 科隆 · 世界锦标赛</div>
    <h1>赛事赛程总览</h1>
    <div class="champ-line">
      <span class="cup">🏆</span>
      <span class="cw">${champTag}</span>
      <span class="cs">${champScore}</span>
      <span class="sep"></span>
      <span class="ru">决赛 ${runnerTag} · BO5</span>
      <span class="bd">CHAMPION</span>
    </div>
  </header>

  <div class="sec"><h2>淘汰赛</h2><span class="sub">八强 → 半决赛 → 决赛</span></div>
  <div class="tree" id="tree">
    <svg id="links"></svg>
    <div class="col"><div class="cl">QUARTERFINAL</div>${qfCol}</div>
    <div class="col"><div class="cl">SEMIFINAL</div>${sfCol}</div>
    <div class="col right"><div class="cl">FINAL · BO5</div>${finCol}
      <div class="champ-box"><div class="t1">CHAMPION</div><div class="t2">${champTag}</div><div class="t3">${T(finalM.a)} ${finalM.score[0]} : ${finalM.score[1]} ${T(finalM.b)}</div></div>
    </div>
  </div>

  <div class="sec"><h2>瑞士轮</h2><span class="sub">每级 16 队 · 8 队晋级</span></div>
  <div class="stages">${stageHtml}</div>

  <div class="sec"><h2>预选赛</h2><span class="sub">48 队 · 前 32 晋级</span></div>
  <div class="qual">${qualRows}</div>
  <div class="legend">
    <span><i style="background:var(--acc)"></i>前 8 · 直进传奇组</span>
    <span><i style="background:#c7d5e8"></i>9-16 · 直进挑战组</span>
    <span><i style="background:var(--txt)"></i>17-32 · 竞争组开打</span>
    <span><i style="background:var(--faint)"></i>淘汰</span>
  </div>

  <footer>全部比赛均为真实 5v5 AI 引擎对局 · CS2D</footer>
</div>
<script>
  function drawLinks(){
    const tree = document.getElementById('tree');
    const svg = document.getElementById('links');
    const cols = [...tree.querySelectorAll('.col')];
    const qf = [...cols[0].querySelectorAll('.mc')];
    const sf = [...cols[1].querySelectorAll('.mc')];
    const fin = cols[2].querySelector('.mc');
    if(!fin) return;
    const tr = tree.getBoundingClientRect();
    const W = tr.width;
    svg.setAttribute('width', W); svg.setAttribute('height', tr.height);
    svg.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    const P = (el) => { const b = el.getBoundingClientRect(); return { x: b.left - tr.left + b.width / 2, y: (b.top + b.bottom) / 2 - tr.top }; };
    const mk = (p1, p2, back) => {
      const p = document.createElementNS(NS, 'path');
      const dx = Math.max(24, Math.abs(p2.x - p1.x) * 0.35);
      const c1x = back ? p1.x - dx : p1.x + dx;
      const c2x = back ? p2.x + dx : p2.x - dx;
      p.setAttribute('d', \`M \${p1.x} \${p1.y} C \${c1x} \${p1.y}, \${c2x} \${p2.y}, \${p2.x} \${p2.y}\`);
      p.setAttribute('stroke', 'rgba(255,255,255,.13)'); p.setAttribute('fill', 'none');
      p.setAttribute('stroke-width', '1.5');
      svg.appendChild(p);
    };
    const qp = qf.map(P), sp = sf.map(P), fp = P(fin);
    [[0,0],[1,0],[2,1],[3,1]].forEach(([i,j]) => mk(qp[i], sp[j]));
    mk(sp[0], fp); mk(sp[1], fp);
  }
  drawLinks();
  window.addEventListener('resize', drawLinks);
</script>
</body>
</html>`;

writeFileSync(root + 'major-bracket.html', html, 'utf8');
console.log('HTML saved v2 (' + (html.length / 1024).toFixed(0) + ' KB)');
