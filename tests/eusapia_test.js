// 埃乌萨皮娅。2026-11-25 做城时一起写，用 canvas-spy 从画出来的东西里读：
// ① 刚造好：地上六间房跟地下六间房，层数、屋顶、窗户一处不差
// ② 兄弟会下去一趟（正常动效逐段查）：他在井里往下走时，地下画的还是上一趟的样子，地上也没动；
//    按钮按不动；他上来那一刻地下变了、地上还没变；再过一会儿地上照着改成跟地下一样。
//    减少动效：一按就是改完的样子，上下一样
// ③ 一年十二趟：每趟只改一两处；一处只改一次，不改回去；十二趟后地上没有一处还跟刚造好时一样；
//    页面上「还剩 N 处」就是画出来的地上跟刚造好时相同的处数；满一年按钮按不动
// ④ 换一种说法：三种说法下，除了字，画面一笔不变；三种说法的名字各不相同，第三种是「？」
// ⑤ 地下的广场比地上挤，书里点名的七种人写在旁边；地上的人是墨色，地下的是骨头色
// ⑥ 兄弟会一直在竖井里，往下到过地下城，没出过地面也没下过地下城的地面
// ⑦ 回到刚造好的时候：画面跟一开始一笔不差
// 跑法：node tests/eusapia_test.js        减少动效：REDUCE=1 node tests/eusapia_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/eusapia_test.js
const path = require('path');
const { loadPage, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, GY = 440, CAVE = 520, LB = 880, FH = 64, BW = 118, SHAFT = 1500;
const BLD = '#4c4a6c', WIN = '#e8c77a', ROOF = '#6e5a7e', BONE = '#d9c48f', HOOD = '#9a3b45';
const slotX = i => 150 + i * 196, SQUARE = slotX(6);
// 书里点名的、地下比地上多的那些人（译林张密百年纪念版「城市与死者 之三」）
const ROLES = ['猎狮', '次女高音', '银行家', '小提琴师', '公爵夫人', '被情夫供养的女人', '将军'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'eusapia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['city(ctx, LB, report, BONE, 14);', 'city(ctx, LB, truth, BONE, 14);'],                         // 1 不用兄弟会，直接看见下面
    ['if (t >= TRIP + COPY){', 'if (t >= TRIP){'],                                                     // 2 地上不用等，跟地下同时变
    ['[[3, \'windows\', 3]],', '[[3, \'roof\', \'dome\']],'],                                           // 3 改回去了
    ['PLAN[month].forEach(([b, a, v]) =>', 'PLAN.slice(month, month + 2).flat().forEach(([b, a, v]) =>'], // 4 一趟改太多
    ['city(ctx, LB, report, BONE, 14);', 'city(ctx, LB, report, saying === 2 ? C.ink : BONE, 14);'],  // 5 换说法，画面也跟着变
    ['sameAsBuilt(above)', 'sameAsBuilt(BUILT)'],                                                      // 6 页面上的数是编的
    ['BONE, 14);', 'BONE, 3);'],                                                                       // 7 地下不比地上挤
    ['y = GY + (LB - GY) * (t / DOWN);', 'y = GY - (LB - GY) * (t / DOWN);'],                          // 8 兄弟会往天上走
    ['btn.disabled = busy || done;', 'btn.disabled = done;'],                                          // 9 他还在下面就能再派一趟
    ['above = clone(BUILT); month = 0;', 'above = above ? clone(above) : clone(BUILT); month = 0;'],     // 10 回不到刚造好
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const INK = page.cssVars['--ink'];

const grab = () => page.capture(() => page.exposed.redraw());
const inSlot = (o, i) => Math.abs(o.box.cx - slotX(i)) <= BW / 2 + 10;
// read one city's six houses back out of the drawing: [floors, roof, windows per floor]
function houses(ops, upper){
  const band = o => upper ? o.box.y + o.box.h <= GY + 1 : o.box.y >= CAVE;
  return [0, 1, 2, 3, 4, 5].map(i => {
    const mine = ops.filter(o => band(o) && inSlot(o, i));
    const body = mine.find(o => o.op === 'fillRect' && sameColor(o.style, BLD));
    const roof = mine.find(o => o.op === 'fill' && sameColor(o.style, ROOF));
    const wins = mine.filter(o => o.op === 'fillRect' && sameColor(o.style, WIN)).length;
    if (!body || !roof) return null;
    const floors = Math.round(body.box.h / FH);
    const rh = roof.box.h, kind = rh <= 14 ? 'flat' : rh <= 45 ? 'peak' : 'dome';
    return [floors, kind, wins / floors];
  });
}
const key = c => JSON.stringify(c);
const heads = (ops, col, x0, x1, y0, y1) => ops.filter(o => o.op === 'stroke' && sameColor(o.style, col) && o.box.w <= 12.5 && o.box.h <= 12.5 &&
  o.box.cx >= x0 && o.box.cx <= x1 && o.box.cy >= y0 && o.box.cy <= y1).length;
const hood = ops => ops.find(o => o.op === 'fill' && sameColor(o.style, HOOD));
const meterLeft = () => { const m = /^第 (\d+) 个月 · 地上跟刚造好时一样的还剩 (\d+) \/ 18 处$/.exec(page.text('meter')); return m ? { month: +m[1], same: +m[2] } : null; };
const shape = ops => JSON.stringify(ops.filter(o => o.op !== 'fillText').map(o => [o.op, String(o.style), Math.round(o.box.x), Math.round(o.box.y), Math.round(o.box.w), Math.round(o.box.h)]));
const texts = ops => ops.filter(o => o.op === 'fillText').map(o => o.text);

// ── ① 刚造好 ──
let ops = grab();
const BUILT_UP = houses(ops, true), BUILT_DOWN = houses(ops, false);
const firstShape = shape(ops);
check(BUILT_UP.every(Boolean) && key(BUILT_UP) === key(BUILT_DOWN), '① 刚造好：地上六间跟地下六间一模一样 ' + key(BUILT_UP));
const sameCount = c => c.reduce((n, h, i) => n + h.filter((v, k) => v === BUILT_UP[i][k]).length, 0);
check(meterLeft() && meterLeft().month === 0 && meterLeft().same === 18, '① 页面：' + page.text('meter'));

// ── ② 一趟 ──
function oneTrip(){
  const before = houses(grab(), true);
  page.click('trip');
  const r = { before };
  if (REDUCE){
    ops = grab(); r.up = houses(ops, true); r.down = houses(ops, false); r.ok = key(r.up) === key(r.down) && key(r.up) !== key(before);
    return r;
  }
  r.disabled = page.el('trip').disabled === true && page.click('trip') === false;
  // going down: sample the hood every 0.2 s until he is back
  r.path = [];
  let midDown = null, midUp = null;
  for (let k = 1; k <= 25; k++){     // 0.2 s steps up to 5.0 s (counted in integers: 0.2 added 25 times is not 5.0)
    page.run(200); ops = grab();
    const h = hood(ops); r.path.push(h ? [h.box.cx, h.box.y + h.box.h] : null);
    if (k === 5) midDown = { up: houses(ops, true), down: houses(ops, false) };
  }
  page.run(400); ops = grab();     // 5.4 s: just back up
  midUp = { up: houses(ops, true), down: houses(ops, false), meter: meterLeft() };
  page.run(1400); ops = grab();    // 6.8 s: the living have copied
  r.after = { up: houses(ops, true), down: houses(ops, false) };
  r.midDown = midDown; r.midUp = midUp;
  r.enabled = page.el('trip').disabled === false || page.text('trip') === '已经一年了';
  return r;
}

const trips = [];
const t1 = oneTrip(); trips.push(t1);
if (REDUCE){
  check(t1.ok, '② 减少动效：一按就是改完的样子，地上地下一样');
} else {
  check(t1.disabled, '② 他还在下面时，「兄弟会下去一趟」按不动');
  check(key(t1.midDown.down) === key(t1.before) && key(t1.midDown.up) === key(t1.before), '② 他往下走的时候，地下画的还是上一趟的样子，地上也没动');
  check(key(t1.midUp.down) !== key(t1.before) && key(t1.midUp.up) === key(t1.before), '② 他上来那一刻：地下变了，地上还没变');
  check(t1.midUp.meter && t1.midUp.meter.same === sameCount(t1.midUp.up), '② 那一刻页面上的数是地上画着的：' + JSON.stringify(t1.midUp.meter));
  check(key(t1.after.up) === key(t1.after.down), '② 再过一会儿，地上照着改成跟地下一样');
  check(t1.enabled, '② 改完了按钮又能按');
  const inShaft = t1.path.every(p => p && Math.abs(p[0] - SHAFT) < 4 && p[1] >= GY - 0.5 && p[1] <= LB + 0.5);
  const deepest = Math.max(...t1.path.filter(Boolean).map(p => p[1]));
  check(inShaft && deepest >= LB - 1, '⑥ 兄弟会一直在竖井里，最深到了地下城（' + deepest.toFixed(0) + '），没出过地面');
}

// ── ③ 一年 ──
const seen = [REDUCE ? t1.up : t1.after.up];
for (let m = 2; m <= 12; m++){ const r = oneTrip(); trips.push(r); seen.push(REDUCE ? r.up : r.after.up); }
let perMonthOk = true, onceOk = true, twinOk = true, meterOk = true, why = '';
const changedAt = {};
let prev = BUILT_UP;
seen.forEach((c, mi) => {
  let n = 0;
  c.forEach((h, i) => h.forEach((v, k) => {
    if (v !== prev[i][k]){
      n += 1;
      const f = i + ':' + k;
      if (changedAt[f] != null || v === BUILT_UP[i][k]){ onceOk = false; why = why || '第 ' + (mi + 1) + ' 个月 ' + f + ' 又改了或改回去了'; }
      changedAt[f] = mi + 1;
    }
  }));
  if (n < 1 || n > 2){ perMonthOk = false; why = why || '第 ' + (mi + 1) + ' 个月改了 ' + n + ' 处'; }
  const tr = trips[mi], down = REDUCE ? tr.down : tr.after.down;
  if (key(c) !== key(down)) twinOk = false;
  prev = c;
});
ops = grab();
const end = houses(ops, true), m12 = meterLeft();
check(perMonthOk, '③ 每趟只改一两处');
check(onceOk, '③ 一处只改一次，不改回刚造好的样子');
check(twinOk, '③ 每趟改完，地上都跟兄弟会带回来的地下一样');
check(sameCount(end) === 0 && Object.keys(changedAt).length === 18, '③ 十二趟以后，十八处没有一处还跟刚造好时一样');
check(m12 && m12.month === 12 && m12.same === sameCount(end), '③ 页面：' + page.text('meter'));
check(page.el('trip').disabled === true && page.click('trip') === false, '③ 满一年，按钮按不动（' + page.text('trip') + '）');
if (why) console.log('  第一处不对：' + why);

// ── ④ 换一种说法 ──
const s = [];
for (let k = 0; k < 3; k++){ ops = grab(); s.push({ shape: shape(ops), texts: texts(ops), moral: page.text('moral') }); page.click('saying'); }
check(s[0].shape === s[1].shape && s[1].shape === s[2].shape, '④ 三种说法下，除了字，画面一笔不变');
const names = s.map(x => x.texts.slice(0, 2).join(' / '));
check(new Set(names).size === 3 && /活人/.test(names[0]) && /死人/.test(names[0]) && (names[2].match(/？/g) || []).length === 2, '④ 三种说法的名字：' + names.join(' ｜ '));
check(new Set(s.map(x => x.moral)).size === 3 && /没办法知道谁是死者，谁是生者/.test(s[2].moral), '④ 第三种说法：' + s[2].moral);

// ── ⑤ 广场和颜色 ──
ops = grab();
const upSq = heads(ops, INK, SQUARE - 80, SQUARE + 90, 0, GY), downSq = heads(ops, BONE, SQUARE - 80, SQUARE + 90, CAVE, H);
const crowdText = texts(ops).join('');
check(downSq > upSq && ROLES.every(r => crowdText.includes(r)), '⑤ 地下的广场 ' + downSq + ' 人，地上 ' + upSq + ' 人；书里点名的七种人都写了');
const wrongUp = heads(ops, BONE, 0, W, 0, GY), wrongDown = heads(ops, INK, 0, W, CAVE, H);
check(heads(ops, INK, 0, W, 0, GY) > 0 && wrongUp === 0 && wrongDown === 0, '⑤ 地上的人是墨色，地下的是骨头色');

// ── ⑦ 回到刚造好 ──
page.click('reset');
check(shape(grab()) === firstShape && meterLeft().month === 0 && !page.el('trip').disabled, '⑦ 回到刚造好的时候：画面跟一开始一笔不差');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
