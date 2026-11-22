// 吉尔玛。2026-11-22 第一份测试（这座城 11-04 做的，一直没有测试），用 canvas-spy 从画出来的东西里读：
// ① 第一次看见：飞艇、飞檐上的疯子、文身铺、地铁车厢、月台上扇扇子的女人各 1；第一次的楼群轮廓（白线）是满的
// ② 每回忆一次：五样东西画出来的数量只增不减、到上限为止，跟表格「你记得」那一列对得上；「旅伴发誓见过」一直是 1
// ③ 第一次看见的那批楼一栋都不动；后面冒出来的楼每次多 5 栋
// ④ 白线轮廓每次淡到上一次的 0.72，形状不变，页面上的百分比跟它对得上
// ⑤ reset 回到第一次看见
// 跑法：node tests/zirma_test.js        减少动效：REDUCE=1 node tests/zirma_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/zirma_test.js
const path = require('path');
const { loadPage, where, origin } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, STREET = 700, TUNNEL_TOP = 790;
const NAMES = ['飞过塔尖的飞艇', '飞檐上摇晃的疯子', '文身铺', '地铁车厢', '月台上扇扇子的女人'];
const CAPS = [28, 14, 22, 16, 14];

const page = loadPage(path.join(__dirname, '..', 'cities', 'zirma.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['counts[m.k] = Math.min(m.cap, n + Math.max(1,', 'counts[m.k] = Math.min(m.cap, 0 + Math.max(1,'],          // 1 记忆会缩
    ['counts[m.k] = Math.min(m.cap,', 'counts[m.k] = Math.min(m.cap * 2,'],                                      // 2 不封顶
    ['ctx.globalAlpha = .9 * Math.pow(.72, recalls);', 'ctx.globalAlpha = .9 * Math.pow(.6, recalls);'],          // 3 轮廓淡得跟说的不一样
    ['r0 = SC.rng(7);', 'r0 = SC.rng(7 + recalls);'],                                                             // 4 第一次的楼也跟着变
    ['for (let i = 0; i < counts.ship; i++)', 'for (let i = 0; i <= counts.ship; i++)'],                          // 5 画的飞艇比记得的多一艘
    ["[m.name, ''], ['1 ' + m.unit, 'num']", "[m.name, ''], [counts[m.k] + ' ' + m.unit, 'num']"],               // 6 旅伴也跟着夸张
    ['for (let i = 0; i < counts.fan; i++)', 'for (let i = 0; i < counts.mad; i++)'],                             // 7 扇扇子的女人数错
    ['function reset(){ recalls = 0; for (const m of MOTIFS) counts[m.k] = 1; build();', 'function reset(){ recalls = 0; build();'], // 8 reset 不清记忆
    ['i < recalls * 5;', 'i < 5;'],                                                                               // 9 楼不再多
    ['const carW = 130, n = counts.train,', 'const carW = 130, n = Math.min(counts.train, 6),'],                   // 10 车厢画不全
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const DIM = css('--dim'), INK = css('--ink'), CHALK = css('--chalk'), SKY = css('--sky'), RULE = css('--rule');
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const distinct = ops => new Set(ops.map(o => o.transform.join(','))).size;

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const ships = distinct(where(ops, { op: 'fill', style: DIM, test: o => Math.abs(o.transform[0] - 1) > 1e-9 || Math.abs(o.transform[1]) > 1e-9 }));
  const figures = where(ops, { op: 'stroke', style: INK });
  const mads = distinct(figures.filter(o => origin(o).y <= STREET + .5));
  const fans = distinct(figures.filter(o => near(origin(o).y, TUNNEL_TOP + 70)));
  const tattoo = where(ops, { op: 'fillText', text: '文身' }).length;
  const cars = where(ops, { op: 'fillRect', style: DIM, test: o => near(o.box.h, 52) && near(o.box.y, TUNNEL_TOP + 84) }).length;
  const outline = where(ops, { op: 'strokeRect', style: CHALK });
  const base = where(ops, { op: 'fillRect', style: SKY, test: o => o.alpha === 1 && near(o.box.y + o.box.h, STREET) });
  const extra = where(ops, { op: 'fillRect', style: RULE, test: o => o.alpha < 1 && near(o.box.y + o.box.h, STREET) });
  return { counts: [ships, mads, tattoo, cars, fans], outline, base, extra };
}
const table = () => {
  const td = page.$$('#rows td').map(t => t.textContent);
  return NAMES.map((n, i) => ({ name: td[i * 3], swore: parseInt(td[i * 3 + 1], 10), mine: parseInt(td[i * 3 + 2], 10) }));
};
const rects = ops => JSON.stringify(ops.map(o => [o.box.x, o.box.y, o.box.w, o.box.h].map(v => Math.round(v * 100))));
const pct = () => { const m = /第一次的轮廓还剩 (\d+)%/.exec(page.text('meter')); return m ? +m[1] : -1; };

// ① 第一次看见
let v = look();
const OUT0 = rects(v.outline), BASE0 = rects(v.base), A0 = v.outline[0] && v.outline[0].alpha;
check(JSON.stringify(v.counts) === '[1,1,1,1,1]', '① 第一次：飞艇、疯子、文身铺、车厢、扇扇子的女人各画了 ' + v.counts.join('/'));
check(v.outline.length === v.base.length && v.outline.length > 5 && near(A0, .9) && v.extra.length === 0, '① 第一次的轮廓 ' + v.outline.length + ' 栋是满的，没有后来冒出的楼');
check(table().every((r, i) => r.name === NAMES[i] && r.swore === 1 && r.mine === 1) && pct() === 100, '① 表格五行都是 1／1，轮廓 100%');

// ②③④ 回忆十次
let prev = v.counts, growOk = true, capOk = true, matchOk = true, swearOk = true, baseOk = true, extraOk = true, fadeOk = true, why = '';
for (let k = 1; k <= 10; k++){
  page.click('recall'); page.frame(16);
  v = look();
  const t = table();
  v.counts.forEach((n, i) => {
    if (!(n > prev[i] || n === CAPS[i]) || n < prev[i]){ growOk = false; why = why || '第 ' + k + ' 次 ' + NAMES[i] + ' ' + prev[i] + '→' + n; }
    if (n > CAPS[i]){ capOk = false; why = why || '第 ' + k + ' 次 ' + NAMES[i] + ' 画了 ' + n + '，上限 ' + CAPS[i]; }
    if (t[i].mine !== n){ matchOk = false; why = why || '第 ' + k + ' 次 ' + NAMES[i] + ' 画了 ' + n + '、表格写 ' + t[i].mine; }
    if (t[i].swore !== 1){ swearOk = false; why = why || '第 ' + k + ' 次旅伴那列变成 ' + t[i].swore; }
  });
  if (rects(v.base) !== BASE0){ baseOk = false; why = why || '第 ' + k + ' 次第一次的楼动了'; }
  if (v.extra.length !== 5 * k){ extraOk = false; why = why || '第 ' + k + ' 次后来的楼 ' + v.extra.length + ' 栋'; }
  const a = v.outline[0] && v.outline[0].alpha;
  if (rects(v.outline) !== OUT0 || !v.outline.every(o => near(o.alpha, a)) || !near(a, .9 * Math.pow(.72, k)) || pct() !== Math.round(100 * a / .9)){
    fadeOk = false; why = why || '第 ' + k + ' 次轮廓透明度 ' + (a && a.toFixed(4)) + '、页面 ' + pct() + '%';
  }
  prev = v.counts;
}
check(growOk, '② 每回忆一次，五样东西都只多不少，到上限才停（第十次：' + v.counts.join('/') + '）');
check(capOk, '② 没有一样超过上限 ' + CAPS.join('/'));
check(matchOk, '② 画出来的数量跟表格「你记得」那一列一样');
check(swearOk, '② 「旅伴发誓见过」一直是 1');
check(baseOk, '③ 第一次看见的那批楼一栋都没动');
check(extraOk, '③ 后来冒出的楼每回忆一次多 5 栋（第十次 ' + v.extra.length + ' 栋）');
check(fadeOk, '④ 白线轮廓形状不变，每次淡到上一次的 0.72，页面百分比对得上（第十次 ' + pct() + '%）');
if (why) console.log('  第一处不对：' + why);
check(/记忆也在夸张/.test(page.text('moral')) && page.text('caption') === '第 10 次讲起', '② 第十次 moral：' + page.text('moral').slice(0, 12));

// ⑤ reset
page.click('reset');
v = look();
check(JSON.stringify(v.counts) === '[1,1,1,1,1]' && rects(v.outline) === OUT0 && near(v.outline[0].alpha, .9) && v.extra.length === 0 && pct() === 100 && table().every(r => r.mine === 1),
  '⑤ reset：各回到 1，轮廓满了，后来的楼没了');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
