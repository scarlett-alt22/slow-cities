// 莫里里亚。2026-11-23 第一份测试（这座城 11-05 做的，一直没有测试），用 canvas-spy 从画出来的东西里读：
// ① 刚到：今天的广场（公交站、拱桥、火药厂）在下面，旧明信片在上面；一处也没对上，页面写 0 / 3
// ② 把明信片从最左拖到最右，一步一步看：明信片上三样东西各垂下一根虚线，虚线落在哪就是那样东西；
//    虚线跟今天那样东西离得够近，那样东西和那根虚线才亮起来；任何位置最多亮一处（read-on 说的「最多也只能对上一处」），
//    三处每一处都有对上的时候；页面上的「对上了 N / 3」就是画面上亮着的个数；明信片拖不出画面
// ③ 惋惜：一句不夸、正合适、痛心疾首三段，广场上的人只在「正合适」时亮，往两边歪的方向相反；moral 跟着换
// ④ 说破它：明信片上的字换成「另一座莫里里亚」，moral 说两座城毫无关系；再按收回
// 跑法：node tests/maurilia_test.js        减少动效：REDUCE=1 node tests/maurilia_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/maurilia_test.js
const path = require('path');
const { loadPage, where, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, CARD_Y = 70, CARD_W = 620, CARD_H = 380, NEAR = 26;
const PAPER = '#e7d9bb';
const TODAY = ['公交站', '拱桥', '火药厂'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'maurilia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { 'st = SC.stage(canvas, W, H, draw);': '{ redraw: () => st.redraw() }' },
  mutations: [
    ["{ name: '奏乐的凉台',           lx: 310 }", "{ name: '奏乐的凉台',           lx: 600 }"],          // 1 明信片上的间距凑成能对上两处
    ['Math.abs(drop(i) - TODAY[i].x) < 26', 'Math.abs(drop(i) - TODAY[i].x) < 260'],                     // 2 「对上」放得太宽
    ["ctx.strokeStyle = al[i] ? C.lamp : C.dim; ctx.globalAlpha", "ctx.strokeStyle = C.dim; ctx.globalAlpha"], // 3 对上了也不亮
    ["'对上了 ' + n + ' / 3'", "'对上了 ' + Math.min(1, n + 1) + ' / 3'"],                                   // 4 页面上的数是编的
    ['function clampCard(){ cardX = Math.max(-CARD_W + 160,', 'function clampCard(){ cardX = Math.max(-CARD_W - 400,'], // 5 明信片能拖出画面
    ["const col = mood === 'right' ? C.lamp : C.dim;", "const col = mood === 'much' ? C.lamp : C.dim;"],     // 6 惋惜过了头反倒亮
    ["const lean = mood === 'little' ? .25 : mood === 'much' ? -.25 : 0;", "const lean = mood === 'little' ? .25 : mood === 'much' ? .25 : 0;"], // 7 两头歪向同一边
    ["ctx.fillText(told ? '另一座莫里里亚' : '莫里里亚 · 旧省城'", "ctx.fillText('莫里里亚 · 旧省城'"],        // 8 说破了明信片也不变
    ['const x = drop(i);', 'const x = drop(i) + 30;'],                                                       // 9 虚线没从那样东西底下垂下来
    ["if (regret > 44) return 'much';", "if (regret > 64) return 'much';"],                                  // 10 「正合适」那段跟页面上的说法对不上
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const LAMP = css('--lamp');

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const paper = ops.find(o => o.op === 'fillRect' && sameColor(o.style, PAPER));
  const labels = Object.fromEntries(ops.filter(o => o.op === 'fillText' && TODAY.includes(o.text)).map(o => [o.text, o.points[0].x]));
  const dashes = ops.filter(o => o.op === 'stroke' && o.lineDash.length && o.points.length === 2).map(o => ({ x: o.points[0].x, lit: sameColor(o.style, LAMP) }));
  // today's three structures: thick strokes below the card; which one by nearest label
  const lit = new Set(ops.filter(o => o.lineWidth === 4 && !o.lineDash.length && (o.op === 'stroke' || o.op === 'strokeRect') && o.box.y > CARD_Y + CARD_H && sameColor(o.style, LAMP))
    .map(o => TODAY.reduce((a, b) => Math.abs(labels[a] - o.box.cx) < Math.abs(labels[b] - o.box.cx) ? a : b)));
  const cardText = ops.filter(o => o.op === 'fillText' && o.points[0].y < CARD_Y + CARD_H).map(o => o.text);
  const people = ops.filter(o => o.op === 'stroke' && o.lineWidth === 3 && o.box.y > CARD_Y + CARD_H + 100 && o.points.length > 3);
  return { ops, paper, labels, dashes, lit, cardText, people };
}
const meter = () => { const m = /^对上了 (\d) \/ 3$/.exec(page.text('meter')); return m ? +m[1] : -1; };

// ── ① 刚到 ──
let v = look();
check(v.paper && v.paper.box.y === CARD_Y && TODAY.every(t => t in v.labels) && v.dashes.length === 3, '① 明信片在上（x=' + (v.paper && v.paper.box.x) + '），今天的三样在下，三根虚线');
check(v.lit.size === 0 && meter() === 0 && v.cardText.includes('莫里里亚 · 旧省城'), '① 一处也没对上：' + page.text('meter'));

// ── ② 从最左拖到最右 ──
// grab the card 300 px in from its left edge, push it far left, then walk it right in 5 px steps
const GRAB = 300, startX = v.paper.box.x + GRAB;
page.pointer('c', 'pointerdown', startX, CARD_Y + 100);
let maxLit = 0, litOk = true, meterOk = true, dashOk = true, inside = true, why = '', steps = 0, minX = Infinity, maxX = -Infinity;
const everLit = new Set();
for (let px = -800; px <= W + 800; px += 5){
  page.pointer('c', 'pointermove', px, CARD_Y + 100);
  v = look(); steps++;
  const cx = v.paper.box.x; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
  if (cx + CARD_W < 150 || cx > W - 150){ inside = false; why = why || '明信片拖到 x=' + cx + '，几乎看不见了'; }
  // each dashed line is lit exactly when it stands within NEAR of its counterpart's label
  v.dashes.forEach((d, i) => {
    const near = Math.abs(d.x - v.labels[TODAY[i]]) < NEAR;
    if (near !== d.lit || near !== v.lit.has(TODAY[i])){ dashOk = false; why = why || '明信片在 ' + cx + '：第 ' + (i + 1) + ' 根虚线离' + TODAY[i] + ' ' + (d.x - v.labels[TODAY[i]]).toFixed(0) + '，亮没亮对不上'; }
  });
  v.lit.forEach(t => everLit.add(t));
  maxLit = Math.max(maxLit, v.lit.size);
  if (v.lit.size > 1){ litOk = false; why = why || '明信片在 ' + cx + ' 时亮了 ' + [...v.lit].join('、'); }
  if (meter() !== v.lit.size){ meterOk = false; why = why || '明信片在 ' + cx + '：页面 ' + meter() + '，画面亮 ' + v.lit.size; }
}
page.pointer('c', 'pointerup', W + 800, CARD_Y + 100);
check(litOk && maxLit === 1, '② 拖了 ' + steps + ' 步，任何位置最多对上一处');
check(everLit.size === 3, '② 三处每一处都对上过：' + [...everLit].join('、'));
check(dashOk, '② 虚线离今天那样东西不到 ' + NEAR + ' 才亮，亮的虚线和亮的建筑是同一处');
check(meterOk, '② 页面上「对上了 N / 3」就是画面上亮着的个数');
check(inside, '② 明信片拖不出画面（x 在 ' + minX + '…' + maxX + '）');
if (why) console.log('  第一处不对：' + why);

// the dashed lines hang from the things drawn on the card: each sits under one of the three sepia figures
v = look();
const cardFills = v.ops.filter(o => o.op === 'fill' && o.box.y >= CARD_Y && o.box.y + o.box.h <= CARD_Y + CARD_H && !sameColor(o.style, PAPER));
// (the two ladies stand either side of their line, so measure from the middle of each figure's whole span)
const offs = v.dashes.map(d => {
  const g = cardFills.filter(f => Math.abs(f.box.cx - d.x) < 90);
  if (!g.length) return Infinity;
  const lo = Math.min(...g.map(f => f.box.x)), hi = Math.max(...g.map(f => f.box.x + f.box.w));
  return Math.abs((lo + hi) / 2 - d.x);
});
check(offs.every(o => o < 15), '② 每根虚线都从明信片上一样东西的正中垂下来（偏 ' + offs.map(o => o.toFixed(0)).join('/') + '）');

// ── ③ 惋惜 ──
const zone = n => { page.input('regret', String(n)); return look(); };
const tilt = ps => ps.reduce((s, o) => s + Math.atan2(o.transform[1], o.transform[0]), 0) / (ps.length || 1);
const z0 = zone(0), z40 = zone(40), z100 = zone(100), z34 = zone(34), z44 = zone(44), z45 = zone(45), z33 = zone(33);
const litPeople = z => z.people.length > 0 && z.people.every(o => sameColor(o.style, LAMP));
const dimPeople = z => z.people.length > 0 && z.people.every(o => !sameColor(o.style, LAMP));
check(dimPeople(z0) && litPeople(z40) && dimPeople(z100), '③ 广场上的人只在「正合适」时亮（' + z40.people.length + ' 笔）');
check(litPeople(z34) && litPeople(z44) && dimPeople(z33) && dimPeople(z45), '③ 「正合适」是 34 到 44');
const t0 = tilt(z0.people), t40 = tilt(z40.people), t100 = tilt(z100.people);
check(t0 > .1 && t100 < -.1 && Math.abs(t40) < .05, '③ 一句不夸往一边歪、痛心疾首往另一边、正合适站直（' + [t0, t40, t100].map(x => x.toFixed(2)).join(' / ') + '）');
zone(0); const m0 = page.text('moral'); zone(40); const m40 = page.text('moral'); zone(100); const m100 = page.text('moral');
check(/一句都没夸/.test(m0) && /正合适/.test(m40) && /惋惜得太过/.test(m100), '③ moral 跟着三段换');

// ── ④ 说破它 ──
page.click('tell'); v = look();
check(v.cardText.includes('另一座莫里里亚') && /毫无关系/.test(page.text('moral')) && page.text('tell') === '收回这句话', '④ 说破：明信片写「另一座莫里里亚」，moral 说毫无关系');
page.click('tell'); v = look();
check(v.cardText.includes('莫里里亚 · 旧省城') && !/毫无关系/.test(page.text('moral')) && page.text('tell') === '说破它', '④ 再按收回');

// table pairs
const rows = Array.from(page.$$('#rows tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join('→'));
check(JSON.stringify(rows) === JSON.stringify(['一只母鸡→公交站', '奏乐的凉台→拱桥', '撑白阳伞的两位小姐→火药厂']), '表格：' + rows.join('，'));

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
