// 贝尔萨贝阿。2026-11-21 改用 canvas-spy（tests/canvas-spy/），检查条目跟原来手搭的版本（04dc097）一一对应，条数一样（正常 27、减少动效 25），8 个变异抓到的情况也一样。
// 跑法：node tests/beersheba_test.js        减少动效：REDUCE=1 node tests/beersheba_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/beersheba_test.js
// 东西在哪儿，从画出来的东西里读：每样东西 translate 到位置再用它的颜色画，objects() 按变换分组，组的原点就是位置。
const path = require('path');
const { loadPage, where, objects, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, SKY_B = 300, UNDER_T = 640;
const OFFER = '#f2cf5b', PART = '#c79a3a', JUNK = '#a7b0a8', TAIL = '#6a5341', DREAM_GOLD = '#f6dc8a', DREAM_MUCK = '#7b6a48';
const KIND = [[OFFER, 'coin'], [PART, 'part'], [JUNK, 'junk'], [TAIL, 'tail']];

const page = loadPage(path.join(__dirname, '..', 'cities', 'beersheba.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { 'const redraw = () => { if (st) st.redraw(); };': '{ redraw }' },
  mutations: [
    ['y: top + (t.y - top) * k };', 'y: top - (top - 60) * Math.sin(e * 3.1416) + (t.y - top) * k * k * k };'],
    ['720 + row * 90', '720 + row * 190'],
    ['(j % 6) * 14', '(j % 6) * 44'],
    ['tosses.forEach(o => { if (prog(o, now) >= 1){', 'tosses.forEach(o => { if (prog(o, now) >= 1 && o.j < 8){'],
    ['truth = !truth;', 'truth = !truth; if (truth) eased = Math.max(0, eased - 1);'],
    ['if (!truth) dreams(ctx);', 'dreams(ctx);'],
    ['const prog = (o, now) => still ? 1 :', 'const prog = (o, now) => false ? 1 :'],
    ['980 * (1 - Math.pow(.965, i + 1))', '1400 * (1 - Math.pow(.965, i + 1))'],
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const press = id => page.click(id);
const text = id => page.text(id);

// 一帧：往前走 ms 毫秒画一帧（减少动效时没有循环，直接重画一次）
function frame(ms = 0){
  const ops = REDUCE ? page.capture(() => page.exposed.redraw()) : page.frame(ms);
  const f = { coin: [], part: [], junk: [], tail: [], alpha: {} };
  // 认东西看「画的时候生效的颜色」：杂物先把 fillStyle/strokeStyle 设成 JUNK，大多数再换成自己的颜色去填，
  // 描边色一直是 JUNK。只看实际画出的颜色，只认得出破伞和指甲两样（第一次改写时 10 样只数出 2 样）。
  const kindOf = op => (KIND.find(([c]) => sameColor(c, op.style)) || KIND.find(([c]) => sameColor(c, op.fillStyle) || sameColor(c, op.strokeStyle)) || [])[1];
  for (const obj of objects(ops)){
    const first = obj.ops.find(kindOf);
    if (!first) continue;
    const kind = kindOf(first);
    f[kind].push(obj.origin);
    if (!(kind in f.alpha)) f.alpha[kind] = first.alpha;
  }
  const pts = c => where(ops, { op: 'stroke', style: c }).flatMap(op => op.points);
  f.gold = pts(DREAM_GOLD); f.muck = pts(DREAM_MUCK);
  return f;
}
const meter = () => (/供了 (\d+) 样 · 扔了 (\d+) 样 · 尾巴 (\d+) 截/.exec(text('meter')) || []).slice(1).map(Number);
const settle = () => frame(3000);
const inSky = p => p.y < SKY_B && p.y > 0 && p.x > 0 && p.x < W;
const below = p => p.y > UNDER_T && p.y < H && p.x > 0 && p.x < W;

// ④ 开头是「他们信的」
let f = frame();
check(f.gold.length > 20 && f.gold.every(p => p.y < SKY_B), '④ 开头：虚线金城画了，全在天上（' + f.gold.length + ' 个点）');
check(f.muck.length > 10 && f.muck.every(p => p.y > UNDER_T), '④ 开头：虚线粪堆画了，全在地下（' + f.muck.length + ' 个点）');
check(/他们信的/.test(text('caption')), '⑤ 开头 caption: ' + text('caption'));

// ① 供三样，每 0.1 秒看一次
press('offer'); press('offer'); press('offer');
let highest = Infinity, coinsSeen = 0, startY = null;
for (let s = 0; s < 25; s++){
  frame(100).coin.forEach(p => { highest = Math.min(highest, p.y); coinsSeen++; if (startY === null) startY = p.y; });
}
f = settle();
if (!REDUCE){
  check(coinsSeen > 0 && highest > SKY_B, '① 金子飞的时候最高到 y=' + highest.toFixed(0) + '，没进天上那一层（界线 ' + SKY_B + '）');
  check(highest < startY - 30, '① 先往上举了一下（从 ' + (startY || 0).toFixed(0) + ' 升到 ' + highest.toFixed(0) + '）');
}
check(f.coin.length === 0 && f.part.length === 3 && f.part.every(below), '① 落定：地下 ' + f.part.length + ' 个零件，都在地下；没有飞着的金子');
check(JSON.stringify(meter()) === '[3,0,0]', '⑤ 页面：' + text('meter'));
check(f.alpha.part < .5, '④ 没掀开时实情是淡的（零件 alpha ' + f.alpha.part + '）');

// ② 扔的东西，照书的次序
const said = [];
for (let i = 0; i < 10; i++){ press('toss'); said.push(text('caption').split('刚才')[1]); }
for (let s = 0; s < 25; s++) frame(100);
f = settle();
check(f.junk.length === 10 && f.junk.every(inSky), '② 落定：天上 ' + f.junk.length + ' 样杂物，都在天上那一层');
const ORDER = ['马铃薯皮', '破伞', '旧袜子', '玻璃碎渣', '衣扣', '糖果纸', '废车票', '指甲和老茧皮', '鸡蛋壳', '马铃薯皮'];
check(said.every((s, i) => s === '扔了' + ORDER[i]), '② 扔的次序照书：' + said.join('、'));
check(f.part.length === 3, '① 扔东西没让地下多出零件（' + f.part.length + '）');

// ③ 尾巴
for (let i = 0; i < 5; i++) press('ease');
f = frame();
check(f.tail.length === 5 && f.tail.every(inSky), '③ 松快 5 回，尾巴 ' + f.tail.length + ' 截，都在天上');
check(JSON.stringify(meter()) === '[3,10,5]', '⑤ 页面：' + text('meter'));

// ④ 掀开盖上，只改看法不改东西
const before = [f.part.length, f.junk.length, f.tail.length].join(',');
press('look'); f = frame();
check(f.gold.length === 0 && f.muck.length === 0, '④ 掀开：虚线没了');
check(f.alpha.part === 1 && f.alpha.junk === 1, '④ 掀开：实情是实的');
check([f.part.length, f.junk.length, f.tail.length].join(',') === before, '④ 掀开不改东西（' + before + '）');
check(/实情/.test(text('caption')) && text('look') === '照他们信的看', '⑤ 掀开后 caption 和按钮字对了');
press('look'); press('look'); f = frame();
check([f.part.length, f.junk.length, f.tail.length].join(',') === before && f.gold.length === 0, '④ 再盖上、再掀开，东西还是 ' + before);
press('look'); f = frame();
check(f.gold.length > 20 && [f.part.length, f.junk.length, f.tail.length].join(',') === before, '④ 盖回去，虚线回来，东西还是 ' + before);

press('where'); check(/没到天上/.test(text('moral')), '⑤ 供的去哪: ' + text('moral').slice(0, 24));
press('star'); check(/马铃薯皮/.test(text('moral')), '⑤ 天上那颗: ' + text('moral').slice(0, 24));
press('tail'); check(/彗星尾巴/.test(text('moral')), '⑤ 尾巴: ' + text('moral').slice(0, 24));

// ⑥ 多了以后
for (let i = 0; i < 37; i++) press('offer');
for (let i = 0; i < 30; i++) press('toss');
for (let i = 0; i < 55; i++) press('ease');
f = settle();
check(f.part.length === 40 && f.part.every(below), '⑥ 供了 40 样：' + f.part.length + ' 个零件，都在地下、在画面里');
check(f.junk.length === 40 && f.junk.every(inSky), '⑥ 扔了 40 样：' + f.junk.length + ' 样，都在天上、在画面里');
check(f.tail.length === 60 && f.tail.every(inSky), '③ 尾巴 60 截，都在天上、没出画面（最西 x=' + Math.min(...f.tail.map(p => p.x)).toFixed(0) + '）');
check(JSON.stringify(meter()) === '[40,40,60]', '⑤ 页面：' + text('meter'));

// ⑦
press('offer'); f = frame();
if (REDUCE) check(f.coin.length === 0 && f.part.length === 41, '⑦ 减少动效：按一下就落定（' + f.part.length + ' 个零件，飞着的 ' + f.coin.length + '）');
else check(f.coin.length === 1 && f.part.length === 40, '⑦ 正常动效：刚按下时它还在飞（飞着的 ' + f.coin.length + '）');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
