// 阿德尔玛。2026-11-27，用 canvas-spy 从画出来的东西里读：每个人头上画的是旧面具（认出的死者）还是皱眉的陌生脸，旁边写的是谁。
// ① 刚上岸：谁的脸都没画、没有名字，远处人群没有眼睛
// ② 看一眼：按书里的次序一次只多认出一个，名字是书里那五个，面具画在他头上，别人不变
// ③ 盯着看：面具褪掉、换成陌生的脸（正常动效 1.6 秒里两者交替，减少动效直接换），之后再看、再点都不会变回去
// ④ 搬运工：脸一直被麻袋片遮着，「等他们站直」他们也不站直，画面一笔不变
// ⑤ 人群：五个人和搬运工都看过才转过脸来，早一步都不转；计数跟画面对得上
// ⑥ 直接点画面上的人也一样（点一下认出，再点一下盯成陌生人）；reset 回到刚上岸
// 跑法：node tests/adelma_test.js        减少动效：REDUCE=1 node tests/adelma_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/adelma_test.js
const path = require('path');
const { loadPage, where } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, QUAY = 780, HEAD = 18, MASK = '#d8c08a', YELLOW = '#d9b23a';
const PEOPLE = [
  { who: '一个跟我一起当过兵的人', x: 230, y: QUAY - 92 },
  { who: '我童年时的一位老渔夫', x: 470, y: QUAY - 88 },
  { who: '临死前那几天的父亲', x: 740, y: QUAY - 26 },
  { who: '故乡那位失恋发疯、后来自杀的姑娘', x: 1080, y: 400 },
  { who: '我的祖母', x: 1000, y: QUAY - 90 },
];

const page = loadPage(path.join(__dirname, '..', 'cities', 'adelma.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(cv, W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ["const next = () => state.indexOf('unseen');", "const next = () => state.lastIndexOf('unseen');"],              // 1 次序反了
    ["state[i] = 'known'; last = i;", "state[i] = 'known'; last = i; if (i > 0 && state[i - 1] === 'stranger') state[i - 1] = 'known';"], // 2 陌生人又被认回来
    ["if (s === 'known') m = 1;", "if (s === 'known' || s === 'unseen') m = 1;"],                                                  // 3 没看就戴上面具
    ["const allLooked = () => state.every(s => s !== 'unseen') && porterTries > 0;", "const allLooked = () => state.every(s => s !== 'unseen');"], // 4 不等搬运工人群就转
    ["porterTries += 1;", "porterTries += 1; PORTERS.forEach(q => { q.y -= 20; });"],                                              // 5 搬运工站起来了
    ["if (s === 'stranger'){ const k = still ? 1 : Math.min(1, (now - t0[i]) / STARE); m = 1 - k; st = k; }", "if (s === 'stranger'){ m = 0; st = 1; }"], // 6 盯着看一下子就换（正常动效下没有过程）
    ["{ id: 'grandma', who: '我的祖母',", "{ id: 'grandma', who: '我的母亲',"],                                                   // 7 名字写错
    ["const known = state.filter(s => s === 'known').length,", "const known = state.filter(s => s !== 'unseen').length,"],        // 8 计数把陌生人也算成死者
    ["if (best >= 0){ if (state[best] === 'unseen') look(best); else if (state[best] === 'known'){ last = best; stare(best); }", "if (best >= 0){ if (state[best] === 'unseen') look(best); else if (state[best] === 'known'){ stare(last); }"], // 9 点画面盯错了人
    ["state = PEOPLE.map(() => 'unseen'); t0 = PEOPLE.map(() => -1e9);\n    last = -1; porterTries = 0; turned = false;", "state = PEOPLE.map(() => 'unseen'); t0 = PEOPLE.map(() => -1e9);\n    last = -1; porterTries = 0;"], // 10 reset 不收人群的眼睛
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const CHALK = page.cssVars['--chalk'];
const near = (a, b, e) => Math.abs(a - b) <= e;
const settle = () => page.run(REDUCE ? 20 : 2000);

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  return PEOPLE.map(p => {
    const box = o => o.box && near(o.box.cx, p.x, 34) && near(o.box.cy, p.y, 36);
    const mask = where(ops, { test: o => (o.style === MASK || o.style === YELLOW) && o.alpha > .01 && box(o) });
    const strange = where(ops, { op: 'stroke', style: CHALK, test: o => o.alpha > .01 && box(o) });
    const labels = where(ops, { op: 'fillText', test: o => near(o.box.x, p.x, 1) && near(o.box.y, p.y - HEAD - 22, 1) && o.alpha > .01 });
    return { mask: mask.length, maskA: Math.max(0, ...mask.map(o => o.alpha)), strange: strange.length, strangeA: Math.max(0, ...strange.map(o => o.alpha)), labels: labels.map(o => o.text) };
  }).concat([{ crowdEyes: where(ops, { op: 'fill', style: MASK, test: o => o.box.cy < 330 && o.box.cx > 1300 }).length,
               porters: JSON.stringify(where(ops, { test: o => o.box && o.box.cx > 1160 && o.box.cy > 500 }).map(o => [o.op, Math.round(o.box.x), Math.round(o.box.y), Math.round(o.box.w), Math.round(o.box.h)])),
               porterLabels: where(ops, { op: 'fillText', test: o => o.box.x > 1160 && o.box.y > 500 }).length }]);
}
const people = v => v.slice(0, 5), extra = v => v[5];
const kind = r => r.labels.includes('一张陌生的脸') && r.strange && !r.mask ? 'stranger' : r.mask && !r.strange && r.labels.length === 1 && r.labels[0].startsWith('像') ? 'known' : !r.mask && !r.strange && !r.labels.length ? 'unseen' : 'mixed';
const meter = () => (/认出的死去的人 (\d+) · 盯成陌生人的 (\d+)/.exec(page.text('meter')) || []).slice(1).map(Number);

// ① 刚上岸
settle();
let v = look();
const PORTERS0 = extra(v).porters;
check(people(v).every(r => kind(r) === 'unseen') && extra(v).crowdEyes === 0, '① 刚上岸：谁的脸都没画，人群没有眼睛');
check(page.el('stare').disabled === true, '① 还没看谁，「盯着看」按不了');

// ② 看一眼，五次
let orderOk = true, nameOk = true, othersOk = true, why = '';
for (let k = 0; k < 5; k++){
  const before = people(v).map(kind);
  page.click('look'); settle(); v = look();
  const after = people(v).map(kind);
  after.forEach((s, i) => {
    if (i === k && s !== 'known'){ orderOk = false; why = why || '第 ' + (k + 1) + ' 眼认出的不是第 ' + (k + 1) + ' 个（' + after.join(',') + '）'; }
    if (i !== k && s !== before[i]){ othersOk = false; why = why || '第 ' + (k + 1) + ' 眼别人也变了'; }
  });
  if (people(v)[k].labels[0] !== '像' + PEOPLE[k].who){ nameOk = false; why = why || '名字是「' + people(v)[k].labels[0] + '」'; }
}
check(orderOk, '② 看一眼认出一个，按书里的次序：水手、老人、病人、姑娘、小贩');
check(nameOk, '② 名字是书里那五个，写在他头上');
check(othersOk, '② 每看一眼只变那一个人');
if (why) console.log('  第一处不对：' + why);
check(extra(v).crowdEyes === 0, '⑤ 五个人都认出了，搬运工还没看，人群还没转过来');
check(JSON.stringify(meter()) === '[5,0]', '⑤ 计数 ' + page.text('meter'));

// ③ 盯着看最后那个（祖母）
page.click('stare');
if (!REDUCE){
  page.run(800); v = look(); const g = people(v)[4];
  check(g.mask && g.strange && g.maskA < .95 && g.strangeA < .95 && g.labels.length === 2, '③ 盯到一半：面具在褪（' + g.maskA.toFixed(2) + '），陌生的脸在出来（' + g.strangeA.toFixed(2) + '）');
}
settle(); v = look();
check(kind(people(v)[4]) === 'stranger' && people(v).slice(0, 4).every(r => kind(r) === 'known'), '③ 盯完：祖母成了一张陌生的脸，别人还是认出的样子');
check(JSON.stringify(meter()) === '[4,1]' && page.el('stare').disabled, '③ 计数 ' + page.text('meter') + '，再也盯不了');
// clicking her on the canvas again does nothing to bring her back
const r = page.el('c').getBoundingClientRect(), sx = r.width / W, sy = r.height / H;
page.click('c', PEOPLE[4].x * sx, (PEOPLE[4].y + 30) * sy); settle(); v = look();
check(kind(people(v)[4]) === 'stranger', '③ 再点她，还是陌生人');

// ④ 搬运工
check(page.el('look').textContent === '看台阶上的搬运工', '④ 按钮换成「看台阶上的搬运工」');
page.click('look'); settle(); v = look();
check(extra(v).porters === PORTERS0 && extra(v).porterLabels === 0 && /没有站直/.test(page.text('caption')), '④ 等他们站直：画面上的搬运工一笔没动、没有名字');

// ⑤ 人群
check(extra(v).crowdEyes === 11 && page.el('look').disabled, '⑤ 都看过了，人群十一个人都转过脸来（' + extra(v).crowdEyes + '），按钮不再能按');
check(/死人/.test(page.text('moral')) && /并不快乐/.test(page.text('moral')), '⑤ moral：' + page.text('moral').slice(-18));

// ⑥ reset，再用点画面
page.click('reset'); settle(); v = look();
check(people(v).every(r => kind(r) === 'unseen') && extra(v).crowdEyes === 0 && JSON.stringify(meter()) === '[0,0]', '⑥ reset 回到刚上岸');
page.click('c', PEOPLE[2].x * sx, (PEOPLE[2].y + 30) * sy); settle(); v = look();
const k1 = people(v).map(kind);
page.click('c', PEOPLE[0].x * sx, (PEOPLE[0].y + 30) * sy); settle();
page.click('c', PEOPLE[2].x * sx, (PEOPLE[2].y + 30) * sy); settle(); v = look();
const k2 = people(v).map(kind);
check(k1[2] === 'known' && k1.filter(s => s !== 'unseen').length === 1 && k2[2] === 'stranger' && k2[0] === 'known', '⑥ 点画面：点病人认出父亲，点水手，再点病人盯成陌生人，水手还认得');
page.click('look'); settle(); page.click('look'); settle(); v = look();
const k3 = people(v).map(kind);
check(k3[2] === 'stranger' && k3[1] === 'known' && k3[3] === 'known', '③ 盯成陌生人以后再接着看下两个人（' + k3.join(',') + '），病人还是陌生人');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
