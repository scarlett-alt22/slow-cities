// 劳多米亚。2026-11-28，用 canvas-spy 从画出来的东西里读：上半的沙堆、下半一间间没窗的小房子、细颈里的人、两种想法各画了什么。
// ① 开头：细颈里 6 个人，死者城空着，上半沙堆 150 粒；沙漏按钮按不动
// ② 又过一代：死者城正好多 6 间、原来的一间不挪；细颈里还是 6 个人；上半一粒不少（页面从不把上面画少）
// ③ 换一种想法：「很多」那种画虚线漏斗，一代比一代多；「会落完」那种圈出沙堆最顶上那一粒，过多少代它都还在顶上
// ④ 去死者那里：没死者时没有解释；有了就圈出一间、写「你的姓氏」，给一个理由；去尚未出世者那里：问的是自己的事，只有回声、没有理由
// ⑤ 正常动效：落到一半，新的 6 间还没落定、细颈里有往下落的灰色的人；落完才算进去
// ⑥ reset 回到开头
// 跑法：node tests/laudomia_test.js        减少动效：REDUCE=1 node tests/laudomia_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/laudomia_test.js
const path = require('path');
const { loadPage, where } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, CX = 800, NECK0 = 430, NECK1 = 570, K = 6;
const DUST = '#b9a27a', TOMB = '#8b8496';

const page = loadPage(path.join(__dirname, '..', 'cities', 'laudomia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['heap.forEach(p =>', 'heap.slice(0, Math.max(1, heap.length - gens * K)).forEach(p =>'],                       // 1 上面一代比一代少
    ['gens += 1; dead += K;', 'gens += 1; dead += K - 1;'],                                                         // 2 落下去的比细颈里的少
    ['const s = slots[i]; ctx.fillRect', 'const s = slots[(i + gens) % slots.length]; ctx.fillRect'],               // 3 死者城的房子挪位置
    ['Math.pow(2, Math.min(gens, 5))', '1'],                                                                        // 4 漏斗不变多
    ['p.y < a.y ? p : a', 'p.y > a.y ? p : a'],                                                                     // 5 圈错了那一粒
    ["'」空屋顶下只有脚步的回声。'", "'」空屋顶下只有脚步的回声。' + REASONS[0]"],                                   // 6 尚未出世者给了理由
    ['if (mine != null && mine < settled){', 'if (false){'],                                                        // 7 死者那里不圈你的姓氏
    ["document.getElementById('flip').addEventListener('click',", "document.getElementById('flip').disabled = false; document.getElementById('flip').addEventListener('click',"], // 8 沙漏能倒
    ['Array.from({ length: K }, (_, i) =>', 'Array.from({ length: K - 1 }, (_, i) =>'],                             // 9 细颈里少一个人
    ['const settled = anim ? dead - K : dead;', 'const settled = dead;'],                                           // 10 还没落下就算进去（正常动效下才看得见）
    ['function reset(){ gens = 0; dead = 0;', 'function reset(){ gens = 0;'],                                       // 11 reset 不清死者城
    ["if (!dead){ caption('死者的劳多米亚还空着，没有可以去找的解释。'); return; }", ''],                              // 12 没有死者也给出解释
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const V = page.cssVars, INK = V['--ink'], DIM = V['--dim'], LAMP = V['--lamp'];
const settle = () => page.run(REDUCE ? 20 : 2000);

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const dust = where(ops, { op: 'fill', style: DUST });
  const tombs = where(ops, { op: 'fillRect', style: TOMB, test: o => Math.abs(o.box.w - 14) < .5 && Math.abs(o.box.h - 12) < .5 }).map(o => Math.round(o.box.cx) + ',' + Math.round(o.box.cy));
  const heads = c => where(ops, { op: 'stroke', style: c, test: o => o.box.w < 12 && Math.abs(o.box.w - o.box.h) < 1 && o.box.cy > NECK0 - 40 && o.box.cy < NECK1 + 400 });
  const neck = heads(INK).filter(o => o.box.cy > NECK0 && o.box.cy < NECK1);
  const funnels = where(ops, { op: 'stroke', style: LAMP, test: o => o.lineDash.length > 0 && o.box.cy < NECK0 });
  const ring = where(ops, { op: 'stroke', style: LAMP, test: o => !o.lineDash.length && Math.abs(o.box.w - 18) < 1.5 && o.box.cy < NECK0 });
  const texts = where(ops, { op: 'fillText' }).map(o => o.text);
  const mark = where(ops, { op: 'strokeRect', style: LAMP, test: o => o.box.cy > NECK1 });
  return { dust: dust.length, dustTop: Math.min(...dust.map(o => o.box.cy)), dustTopX: (dust.find(o => o.box.cy === Math.min(...dust.map(d => d.box.cy))) || { box: {} }).box.cx,
           tombs, neck: neck.length, falling: heads(DIM).length, funnels: funnels.length, ring: ring.map(o => [Math.round(o.box.cx), Math.round(o.box.cy)]), texts, mark };
}
const meterGens = () => +((/过了 (\d+) 代/.exec(page.text('meter')) || [0, -1])[1]);

// ① 开头
settle();
let v = look();
const HEAP = v.dust;
check(v.neck === K && v.tombs.length === 0 && HEAP === 150, '① 开头：细颈里 ' + v.neck + ' 人，死者城 ' + v.tombs.length + ' 间，上半 ' + HEAP + ' 粒');
check(page.el('flip').disabled === true && /不知道/.test(page.text('meter')), '① 沙漏按钮按不动；上面有多少写的是「不知道」');
const cap0 = page.text('caption'); page.click('flip');
check(page.text('caption') === cap0, '① 按沙漏没反应');

// ④a 还没死者时去死者那里
page.click('dead'); settle(); v = look();
check(/空着/.test(page.text('caption')) && !/理由/.test(page.text('caption')) && v.mark.length === 0, '④ 死者城空着：找不到解释，也没圈出谁');

// ② 一代一代
let prev = [], tombsOk = true, heapOk = true, neckOk = true, funnelsSeq = [];
for (let g = 1; g <= 5; g++){
  page.click('gen'); settle(); v = look();
  if (v.tombs.length !== g * K || !prev.every(t => v.tombs.includes(t))) tombsOk = false;
  if (v.dust !== HEAP) heapOk = false;
  if (v.neck !== K) neckOk = false;
  funnelsSeq.push(v.funnels);
  prev = v.tombs;
}
check(tombsOk, '② 每过一代死者城正好多 ' + K + ' 间，原来的一间不挪（5 代后 ' + v.tombs.length + ' 间）');
check(heapOk, '② 上半一粒不少：过了几代都是 ' + v.dust + ' 粒');
check(neckOk, '② 细颈里一直是 ' + K + ' 个人');
check(meterGens() === 5, '② 计数 ' + page.text('meter'));

// ③ 两种想法
check(funnelsSeq.every((n, i) => n > 0 && (i === 0 || n >= funnelsSeq[i - 1])) && funnelsSeq[4] > funnelsSeq[0], '③ 「很多」：虚线漏斗一代比一代多 ' + funnelsSeq.join(' '));
check(v.ring.length === 0, '③ 「很多」时不圈最后一粒');
page.click('think'); settle(); v = look();
const ring1 = v.ring[0];
check(v.funnels === 0 && v.ring.length === 1 && Math.abs(ring1[1] - v.dustTop) <= 1 && Math.abs(ring1[0] - v.dustTopX) <= 1 && v.texts.includes('最后一粒，还在顶上等着'),
  '③ 「会落完」：圈的是沙堆最顶上那一粒（' + ring1 + '），写着还在顶上等着');
for (let g = 0; g < 4; g++){ page.click('gen'); settle(); }
v = look();
check(v.ring.length === 1 && v.ring[0][0] === ring1[0] && v.ring[0][1] === ring1[1] && v.dust === HEAP, '③ 又过 4 代，那一粒还在原处、沙堆一粒不少');
page.click('think'); settle();

// ④ 去死者那里、去尚未出世者那里
page.click('dead'); settle(); v = look();
const markIn = v.mark.length === 1 && v.tombs.some(t => { const [x, y] = t.split(',').map(Number); const b = v.mark[0].box; return b.x < x && x < b.x + b.w && b.y < y && y < b.y + b.h; });
check(markIn && v.texts.includes('你的姓氏') && /理由/.test(page.text('caption')), '④ 死者那里：圈出一间真有的房子、写着你的姓氏，给了一个理由：' + page.text('caption').slice(-12));
page.click('unborn'); settle(); v = look();
check(/「[^」]*我[^」]*？」/.test(page.text('caption')) && /回声/.test(page.text('caption')) && !/理由/.test(page.text('caption')) && v.mark.length === 0, '④ 尚未出世者那里：问的是自己，只有回声、没有理由：' + page.text('caption'));

// ⑤ 落到一半（只在正常动效下）
if (!REDUCE){
  const before = look().tombs.length;
  page.click('gen'); page.run(800); v = look();
  check(v.tombs.length === before && v.falling === K, '⑤ 落到一半：新的还没算进死者城（' + v.tombs.length + '），有 ' + v.falling + ' 个灰色的人在往下落');
  settle(); v = look();
  check(v.tombs.length === before + K && v.falling === 0, '⑤ 落完：死者城 ' + v.tombs.length + ' 间');
}

// ⑥ reset
page.click('reset'); settle(); v = look();
check(v.tombs.length === 0 && v.neck === K && v.dust === HEAP && meterGens() === 0, '⑥ reset 回到开头');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
