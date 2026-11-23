// 欧菲米亚。2026-11-23 第一份测试（这座城 11-05 做的，一直没有测试），用 canvas-spy 从画出来的东西里读：
// ① 刚到：书里那六个词（狼、妹妹、藏起来的宝、打仗、疥疮、情人）都挨着「你」，橙色，照次序排，不叠在一起
// ② 每过一夜：恰好两三个词换到别人身边；换走的再也回不到你身边；挨着你的是橙色、挨着别人的不是；
//    每个人身边的词照次序排、不叠；表格「回程时你记得的」那一列跟画面上词挨着谁对得上；页面上的「还是你自己的 N / 6」
//    就是画面上橙色词的个数；节气照冬至、春分、夏至、秋分轮
// ③ 六个都换走以后按钮按不动，再按也不变；moral 说你的狼成了另一只狼
// ④ 从头再来：六个词都回到你身边
// 跑法：node tests/euphemia_test.js        减少动效：REDUCE=1 node tests/euphemia_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/euphemia_test.js
const path = require('path');
const { loadPage, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000;
const BOOK = ['狼', '妹妹', '藏起来的宝', '打仗', '疥疮', '情人'];           // 原章那六样，lede 也是这么写的
const PEOPLE = [['你', 800, 900], ['盐商', 300, 660], ['织工', 560, 450], ['赶驼人', 1040, 450], ['船夫', 1300, 660]];
const SEASONS = ['冬至', '春分', '夏至', '秋分'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'euphemia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['let j = 1 + Math.floor(r() * 4);', 'let j = Math.floor(r() * 5);'],                                         // 1 换走的会回到你身边
    ['const n = 2 + Math.floor(r() * 2);', 'const n = 1 + Math.floor(r() * 2);'],                                 // 2 一夜只换一两个
    ['ctx.fillStyle = from[i] === 0 ? C.lamp : C.ink;', 'ctx.fillStyle = C.lamp;'],                               // 3 换走的还是橙色
    ["wd.lines[from[i]] + '（' + PEOPLE[from[i]].name", "wd.lines[from[i]] + '（' + PEOPLE[(from[i] % 4) + 1].name"], // 4 表格说是别人讲的
    ["' · 还是你自己的：' + kept", "' · 还是你自己的：' + Math.max(0, 6 - nights * 2)"],                          // 5 页面上的数是估的
    ['p.y - 150 + k * 36', 'p.y - 150 + k * 6'],                                                                 // 6 同一个人身边的词叠在一起
    ["document.getElementById('night').disabled = kept === 0;", "document.getElementById('night').disabled = false;"], // 7 换完了还能按
    ['nights = 0; from = WORDS.map(() => 0);', 'nights = 0;'],                                                    // 8 从头再来没回来
    ['SEASONS[(nights - 1) % 4]', 'SEASONS[nights % 4]'],                                                        // 9 节气错一格
    ['if (j === from[i]) j = 1 + (j % 4);', ''],                                                                  // 10 「换」给了原来那个人，等于没换
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const LAMP = css('--lamp');

// where each word is now: which person's slot it sits in, its slot row, its colour
function look(){
  if (!REDUCE) page.run(3000);           // the words glide; let them arrive
  const ops = page.capture(() => page.exposed.redraw());
  const words = ops.filter(o => o.op === 'fillText' && BOOK.includes(o.text));
  return words.map(o => {
    const p = o.points[0];
    const who = PEOPLE.findIndex(([, x]) => Math.abs((x > 800 || x === 800 ? x + 70 : x - 70) - p.x) < .5);
    const row = who < 0 ? NaN : (p.y - (PEOPLE[who][2] - 150)) / 36;
    return { text: o.text, who, row, y: p.y, lamp: sameColor(o.style, LAMP), align: o.textAlign };
  });
}
const table = () => Array.from(page.$$('#rows tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent));
const kept = () => { const m = /还是你自己的：(\d+) \/ 6$/.exec(page.text('meter')); return m ? +m[1] : -1; };

// every person's words: in book order, one row apart from the top, none on top of another
function layoutOk(ws){
  for (let k = 0; k < PEOPLE.length; k++){
    const mine = ws.filter(w => w.who === k);
    const order = mine.slice().sort((a, b) => a.y - b.y).map(w => BOOK.indexOf(w.text));
    if (order.some((v, i) => i && v <= order[i - 1])) return PEOPLE[k][0] + ' 身边次序乱了';
    const rows = mine.map(w => w.row).sort((a, b) => a - b);
    if (rows.some((r, i) => Math.abs(r - i) > 1e-6)) return PEOPLE[k][0] + ' 身边的词没一行一行排（' + rows.join('/') + '）';
  }
  return '';
}

// ── ① 刚到 ──
let v = look();
check(v.length === 6 && BOOK.every(w => v.filter(x => x.text === w).length === 1), '① 书里六个词各画一次：' + v.map(w => w.text).join('、'));
check(v.every(w => w.who === 0 && w.lamp), '① 六个都挨着「你」，都是橙色');
check(!layoutOk(v), '① 照书里的次序一行一行排，不叠' + (layoutOk(v) ? '：' + layoutOk(v) : ''));
check(kept() === 6 && table().every(r => r[2] === '（还是你自己的）'), '① 页面：' + page.text('meter') + '；表格都写「还是你自己的」');

// ── ② 一夜一夜过 ──
let prev = v.map(w => w.who), nights = 0, why = '';
let countOk = true, neverBack = true, colourOk = true, layout = true, tableOk = true, meterOk = true, seasonOk = true, eachOnce = true;
const changedPerNight = [];
while (!page.el('night').disabled && nights < 40){
  page.click('night'); nights++;
  v = look();
  if (v.length !== 6 || BOOK.some(w => v.filter(x => x.text === w).length !== 1) || v.some(w => w.who < 0)){ eachOnce = false; why = why || '第 ' + nights + ' 夜有词没画、画了两次或不挨着任何人'; break; }
  const who = BOOK.map(w => v.find(x => x.text === w).who);
  const changed = who.filter((o, i) => o !== prev[i]).length;
  changedPerNight.push(changed);
  if (changed < 2 || changed > 3){ countOk = false; why = why || '第 ' + nights + ' 夜换了 ' + changed + ' 个'; }
  if (who.some((o, i) => o === 0 && prev[i] !== 0)){ neverBack = false; why = why || '第 ' + nights + ' 夜有换走的词回到你身边'; }
  if (v.some(w => w.lamp !== (w.who === 0))){ colourOk = false; why = why || '第 ' + nights + ' 夜颜色跟挨着谁对不上'; }
  const lo = layoutOk(v); if (lo){ layout = false; why = why || '第 ' + nights + ' 夜' + lo; }
  const rows = table();
  BOOK.forEach((w, i) => {
    const said = rows[i][2], o = who[i];
    const want = o === 0 ? '（还是你自己的）' : '（' + PEOPLE[o][0] + '讲的）';
    if (!said.endsWith(want)){ tableOk = false; why = why || '第 ' + nights + ' 夜表格「' + w + '」写的是「' + said + '」，画面上它挨着' + PEOPLE[o][0]; }
  });
  const nLamp = v.filter(w => w.lamp).length;
  if (kept() !== nLamp){ meterOk = false; why = why || '第 ' + nights + ' 夜页面说 ' + kept() + '，画面上橙色 ' + nLamp; }
  if (page.text('caption') !== SEASONS[(nights - 1) % 4] + '的夜里，火边换过一轮'){ seasonOk = false; why = why || '第 ' + nights + ' 夜 caption：' + page.text('caption'); }
  prev = who;
}
check(eachOnce, '② 每一夜六个词都在，各挨着一个人');
check(countOk, '② 每夜恰好换两三个（' + changedPerNight.join(' ') + '）');
check(neverBack, '② 换走的再也没回到你身边');
check(colourOk, '② 挨着你的是橙色，挨着别人的不是');
check(layout, '② 每个人身边的词照次序一行一行排、不叠');
check(tableOk, '② 表格「回程时你记得的」跟画面上词挨着谁对得上');
check(meterOk, '② 页面上「还是你自己的」就是画面上橙色词的个数');
check(seasonOk, '② 节气照冬至、春分、夏至、秋分轮');
if (why) console.log('  第一处不对：' + why);

// ── ③ 换完了 ──
const before = JSON.stringify(look().map(w => [w.text, w.who]));
page.click('night'); const after = JSON.stringify(look().map(w => [w.text, w.who]));
check(page.el('night').disabled && kept() === 0 && before === after && nights < 40, '③ 过了 ' + nights + ' 个节气六个都换走：按钮按不动、再按也不变');
check(/另一只狼/.test(page.text('moral')), '③ moral：「' + page.text('moral').slice(-24) + '」');

// ── ④ 从头再来 ──
page.click('again'); v = look();
check(v.every(w => w.who === 0 && w.lamp) && kept() === 6 && !page.el('night').disabled && page.text('caption') === '你带来了六个词', '④ 从头再来：六个词都回到你身边');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
