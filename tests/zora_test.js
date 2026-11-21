// 左拉。2026-11-21 第一份测试（这座城 11-04 做的，一直没有测试），用 canvas-spy 从画出来的东西里读：
// ① 九处地方是九个音符：橙色实心的（左拉本身）和白色空心的（你记住的那份）开头叠在同一处；从左到右的顺序、
//    音符下面的名字、表格里的顺序三者一致；「把喷泉挪一格」按不动
// ② 每过十年：实心音符往下沉、变淡（沉 140×年数/60、透明度 1−年数/60），空心的一个像素都不动；
//    五线谱一段段断掉，开头 200 段、60 年后 0 段；20 年起实心音符上有裂缝；60 年后实心的没了，只剩空心的
// ③ 在脑子里走一遍：空心音符从左往右一个个亮起来（走到一半亮的是左边那几个），走完九个全亮、遍数加一；
//    减少动效下一按就全亮；左拉没了以后还能走
// ④ 页面上的年数、遍数、caption、moral 跟画出来的对得上；60 年后按钮变成「回到左拉还在的时候」，按了回到开头
// 跑法：node tests/zora_test.js        减少动效：REDUCE=1 node tests/zora_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/zora_test.js
const path = require('path');
const { loadPage, where, origin } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000;

const page = loadPage(path.join(__dirname, '..', 'cities', 'zora.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['head(ctx, n.x, y, false, C.chalk);', 'head(ctx, n.x, y + d * 140, false, C.chalk);'],                              // 1 记住的那份也跟着沉
    ['x: 170 + i * (W - 340)', 'x: 170 + ((i * 4) % 9) * (W - 340)'],                                                  // 2 顺序被挪了
    ['ctx.globalAlpha = i < lit ? .95 : .35;', 'ctx.globalAlpha = notes.length - 1 - i < lit ? .95 : .35;'],           // 3 从右往左亮
    ['Math.min(1, years / 60)', 'Math.min(1, years / 70)'],                                                            // 4 衰得比说的慢
    ['const sink = d * 140', 'const sink = 0'],                                                                        // 5 不往下沉
    ['if (r() < d * 1.1) continue;', 'if (r() < d * .5) continue;'],                                                  // 6 五线谱断不完
    ['years = 0; walks = 0; lit = 0;', 'years = 0; lit = 0;'],                                                         // 7 回到开头不清遍数
    ['if (k >= 1){ walkStart = -1; walks++; ui(); }', 'if (k >= 1){ walkStart = -1; ui(); }'],                        // 8 走完不记一遍
    ['if (d > .25){', 'if (d > 2){'],                                                                                  // 9 永远不裂
    ['lit = notes.length; walks++;', 'walks++;'],                                                                      // 10 减少动效下走了不亮
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const LAMP = css('--lamp'), CHALK = css('--chalk'), DIM = css('--dim'), SKY = css('--sky'), INK = css('--ink');
const rotated = op => Math.abs(op.transform[1]) > 1e-9;
const eq = (a, b) => Math.abs(a - b) < 1e-6;

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const city = where(ops, { op: 'fill', style: LAMP, test: rotated }).map(op => ({ ...origin(op), alpha: op.alpha }));
  const memory = where(ops, { op: 'stroke', style: CHALK, test: rotated }).map(op => ({ ...origin(op), alpha: op.alpha }));
  const staff = where(ops, { op: 'stroke', style: DIM }).length;
  const cracks = where(ops, { op: 'stroke', style: SKY }).length;
  const walker = where(ops, { op: 'fill', style: LAMP, test: op => !rotated(op) });
  // 名字：按 x 归到音符下面，同一个 x 的两行拼起来
  const names = new Map();
  for (const op of where(ops, { op: 'fillText', style: INK })){ const x = Math.round(op.points[0].x); names.set(x, (names.get(x) || '') + op.text); }
  return { city, memory, staff, cracks, walker, names };
}
const meter = () => { const m = /^过去 (\d+) 年 · 在脑子里走过 (\d+) 遍$/.exec(page.text('meter')); return m ? [+m[1], +m[2]] : null; };
const litCount = v => v.memory.filter(m => eq(m.alpha, .95)).length;
const litPrefix = v => { const n = litCount(v); return v.memory.every((m, i) => eq(m.alpha, i < n ? .95 : .35)); };

// ① 开头
let v = look();
const M0 = v.memory.map(m => ({ x: m.x, y: m.y }));
check(v.city.length === 9 && v.memory.length === 9, '① 九个实心音符、九个空心音符（画出来 ' + v.city.length + '／' + v.memory.length + '）');
check(v.city.every((c, i) => eq(c.x, M0[i].x) && eq(c.y, M0[i].y)), '① 开头实心和空心叠在同一处');
check(M0.every((m, i) => i === 0 || m.x > M0[i - 1].x), '① 九个音符从左到右排');
const cells = page.$$('#rows td').map(td => td.textContent);
const table = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => cells[i * 3 + 1]);
const drawnNames = M0.slice().sort((a, b) => a.x - b.x).map(m => v.names.get(Math.round(m.x)));   // 从左往右念
check(cells.length === 27 && cells.filter((c, i) => i % 3 === 0).join() === '1,2,3,4,5,6,7,8,9' && JSON.stringify(drawnNames) === JSON.stringify(table),
  '① 音符下的名字、从左到右的顺序跟表格一致：' + drawnNames.join(' / '));
check(v.staff === 200 && v.cracks === 0, '① 五线谱 ' + v.staff + ' 段完整，没有裂缝');
check(page.el('move').disabled === true, '① 「把喷泉挪一格」按不动');
check(JSON.stringify(meter()) === '[0,0]' && page.text('caption') === '左拉，今天', '④ 开头页面：' + page.text('meter') + '｜' + page.text('caption'));

// ③ 在脑子里走一遍（左拉还在的时候）
function walkOnce(label){
  const before = meter()[1];
  page.click('walk');
  if (REDUCE){
    v = look();
    check(litCount(v) === 9 && meter()[1] === before + 1, '③ ' + label + '减少动效：一按九个全亮，遍数 ' + before + '→' + meter()[1]);
    return;
  }
  page.frame(16); page.run(3000);
  v = look();
  const mid = litCount(v), dot = v.walker[0];
  const leftOfDot = dot ? M0.filter(m => m.x < dot.box.cx).length : -1;
  check(mid >= 3 && mid <= 6 && litPrefix(v) && Math.abs(leftOfDot - mid) <= 1, '③ ' + label + '走到一半：左边 ' + mid + ' 个亮了，小灯左边有 ' + leftOfDot + ' 个音符');
  check(meter()[1] === before, '③ ' + label + '没走完不算一遍');
  page.run(3300);
  v = look();
  check(litCount(v) === 9 && meter()[1] === before + 1 && v.walker.length === 0, '③ ' + label + '走完：九个全亮、遍数 ' + before + '→' + meter()[1] + '、小灯收了');
}
walkOnce('');
check(page.text('moral').startsWith('最博学的人'), '④ 走过以后 moral：' + page.text('moral').slice(0, 6));

// ② 一个十年一个十年地过
let sinkOk = true, fadeOk = true, stillOk = true, crackOk = true, staffOk = true, meterOk = true, why = '';
const staffs = [];
for (let years = 10; years <= 60; years += 10){
  page.click('decade');
  v = look();
  const d = years / 60;
  if (!v.memory.every((m, i) => eq(m.x, M0[i].x) && eq(m.y, M0[i].y))){ stillOk = false; why = why || years + ' 年空心音符动了'; }
  if (d < 1){
    if (v.city.length !== 9 || !v.city.every((c, i) => eq(c.x, M0[i].x) && eq(c.y, M0[i].y + d * 140))){ sinkOk = false; why = why || years + ' 年实心音符没沉到该在的地方'; }
    if (!v.city.every(c => eq(c.alpha, 1 - d))){ fadeOk = false; why = why || years + ' 年实心音符透明度 ' + (v.city[0] && v.city[0].alpha); }
    if ((v.cracks > 0) !== (years >= 20)){ crackOk = false; why = why || years + ' 年裂缝 ' + v.cracks + ' 道'; }
  } else if (v.city.length !== 0){ sinkOk = false; why = why || '60 年后还画着 ' + v.city.length + ' 个实心音符'; }
  staffs.push(v.staff);
  const mt = meter();
  const cap = d >= 1 ? '只剩你记得的那份' : years + ' 年以后';
  if (!mt || mt[0] !== years || page.text('caption') !== cap) { meterOk = false; why = why || years + ' 年页面：' + page.text('meter') + '｜' + page.text('caption'); }
}
check(stillOk, '② 过了六十年，空心音符一个像素都没动');
check(sinkOk, '② 实心音符每十年往下沉一截，60 年后没了');
check(fadeOk, '② 实心音符每十年淡一截');
check(crackOk, '② 20 年起实心音符上有裂缝，之前没有');
staffOk = staffs[staffs.length - 1] === 0 && staffs[0] < 200;
check(staffOk, '② 五线谱一段段断掉：200 → ' + staffs.join(' → '));
check(meterOk, '④ 每十年页面上的年数和 caption 跟画面对得上');
check(/^你还能在脑子里/.test(page.text('moral')) && page.text('decade') === '回到左拉还在的时候', '④ 60 年后：moral「' + page.text('moral').slice(0, 7) + '」、按钮「' + page.text('decade') + '」');
check(page.el('move').disabled === true, '① 六十年后「把喷泉挪一格」还是按不动');
walkOnce('左拉没了以后');

// ④ 回到左拉还在的时候
page.click('decade');
v = look();
check(v.city.length === 9 && v.city.every((c, i) => eq(c.y, M0[i].y) && eq(c.alpha, 1)) && v.staff === 200 && litCount(v) === 0,
  '④ 回到开头：实心音符回到原处、五线谱 ' + v.staff + ' 段、没有亮的');
check(JSON.stringify(meter()) === '[0,0]' && page.text('caption') === '左拉，今天' && page.text('decade') === '过去十年', '④ 回到开头页面：' + page.text('meter'));

if (why) console.log('  第一处不对：' + why);
console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
