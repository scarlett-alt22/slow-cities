// 苔斯皮那。2026-11-23 第一份测试（这座城 11-04 做的，一直没有测试），用 canvas-spy 从画出来的东西里读：
// ① 剪影是开页时画好的一张图：滑块从沙漠拉到海、再等动画走几秒，那张图一次都没重画，
//    每帧都把同一张图贴在同一个位置，而且是最后贴、盖在标签线上面——页面上「剪影改过的像素：0」说的就是这个
// ② 剪影本身：只用一种墨色；墙脚确实挖了四个拱门
// ③ 沙漠那头：沙丘和骑骆驼的人，标签是赶骆驼人看见的那一列；海那头：海浪和小船，标签是水手那一列；
//    中间两边都不站：没有前景、没有标签。canvas 上的字跟下面表格对得上；书里的船（桅杆、风向袋、天线、烟囱）
//    和骆驼（峰、流苏）都在
// ④ 每根标签线的另一头都落在剪影上（墙脚那一根落在拱门里）
// ⑤ moral 和 caption 跟着站的那一边换
// 跑法：node tests/despina_test.js        减少动效：REDUCE=1 node tests/despina_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/despina_test.js
const path = require('path');
const { loadPage, where, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, HZ = 640, S = 2, CITY_INK = '#0b0f1e';
const DUNES = ['#3a2f3a', '#4d3a3a', '#61463c'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'despina.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ["    labels(ctx, 'desert', da);", "    ctx.drawImage(city, 0, 0, W, H); labels(ctx, 'desert', da);"],       // 1 剪影贴了两回、标签盖在上面
    ['ctx.drawImage(city, 0, 0, W, H);', 'ctx.drawImage(city, 0, (v - 18) * .2, W, H);'],                       // 2 剪影跟着滑块挪
    ['const desertA = () => Math.max(0, Math.min(1, (44 - v) / 30));', 'const desertA = () => Math.max(0, Math.min(1, (60 - v) / 30));'], // 3 中间还看得见沙丘
    ["labels(ctx, 'desert', da);", "labels(ctx, 'sea', da);"],                                                  // 4 沙漠那头标成水手的
    ['at: [930, 488]', 'at: [930, 388]'],                                                                        // 5 标签线指到天上
    ["const side = v < 44 ? 'desert'", "const side = v < 56 ? 'desert'"],                                     // 6 中间那段话说错边
    ["const INK = '#0b0f1e';", "const INK = '#3b3a52';"],                                                      // 7 剪影换了颜色（跟测试说的墨色不一样）
    ['[628, 732, 852, 956].forEach', '[628, 732, 852].forEach'],                                                // 8 少挖一个拱门
    ['[p.name, p.desert, p.sea].forEach', '[p.name, p.sea, p.desert].forEach'],                                 // 9 表格两列对调
    ['const seaA = () => Math.max(0, Math.min(1, (v - 56) / 30));', 'const seaA = () => Math.max(0, Math.min(1, (v - 26) / 30));'],       // 10 中间还看得见海
    ['v = +e.target.value; ui();', "v = +e.target.value; city.getContext('2d').fillRect(600, 300, 4, 4); ui();"],  // 11 拉滑块时偷偷补一笔剪影
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const LAMP = css('--lamp'), CHALK = css('--chalk'), INK = css('--ink');

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const blits = ops.filter(o => o.op === 'drawImage');
  const labels = ops.filter(o => o.op === 'fillText' && o.alpha > .05);
  // annotate draws each label's line from near the word to the point it names
  const lines = where(ops, { op: 'stroke', style: CHALK, test: o => o.points.length === 2 && o.alpha > .05 && o.lineWidth === 1.5 });
  const dunes = ops.filter(o => o.op === 'fill' && DUNES.some(c => sameColor(c, o.style)) && o.alpha > 0);
  const lamp = where(ops, { op: 'stroke', style: LAMP }).filter(o => o.alpha > 0);
  const seaBand = ops.filter(o => o.op === 'fillRect' && o.style && o.style.kind === 'linear' && o.box.y >= HZ - 1e-6 && o.alpha > 0);
  return { ops, blits, labels, lines, dunes, lamp, seaBand };
}
const table = () => Array.from(page.$$('#rows tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent));
const boxKey = b => [b.x, b.y, b.w, b.h].map(n => n.toFixed(6)).join(',');

// ── ① 同一张图，从头到尾 ──
let v = look();
const img = v.blits[0] && v.blits[0].image;
const cityRec = img ? page.canvas(img) : null;
const cityOps0 = cityRec ? cityRec.ops.length : -1;
const box0 = v.blits[0] ? boxKey(v.blits[0].box) : '';
check(v.blits.length === 1 && v.ops[v.ops.length - 1] === v.blits[0] && cityOps0 > 10,
  '① 开页：剪影是一张事先画好的图（' + cityOps0 + ' 笔），每帧贴一次、最后贴');

let sameImg = true, onePaste = true, onTop = true, samePlace = true, never = true, why = '';
const seen = {};
for (const pos of [18, 0, 10, 20, 30, 40, 44, 50, 56, 60, 70, 80, 90, 100, 50, 0]){
  page.input('side', String(pos));
  if (!REDUCE) page.frame(1000 / 60);
  v = look();
  seen[pos] = v;
  if (v.blits.length !== 1){ onePaste = false; why = why || '滑到 ' + pos + ' 贴了 ' + v.blits.length + ' 回'; continue; }
  const b = v.blits[0];
  if (b.image !== img){ sameImg = false; why = why || '滑到 ' + pos + ' 换了一张图'; }
  if (boxKey(b.box) !== box0){ samePlace = false; why = why || '滑到 ' + pos + ' 图挪到 ' + boxKey(b.box); }
  const lastLabel = Math.max(-1, ...v.ops.map((o, i) => (o.op === 'fillText' || (o.op === 'stroke' && sameColor(o.style, CHALK) && o.lineWidth === 1.5)) ? i : -1));
  if (v.ops[v.ops.length - 1] !== b || lastLabel > v.ops.indexOf(b)){ onTop = false; why = why || '滑到 ' + pos + ' 有东西画在剪影上面'; }
  if (cityRec.ops.length !== cityOps0){ never = false; why = why || '滑到 ' + pos + ' 剪影被重画了'; }
}
if (!REDUCE){
  // let time run: the camel bobs and the waves move, the outline doesn't
  page.input('side', '0');
  const a = look(); page.run(2000); const b = look();
  const moved = JSON.stringify(a.lamp.map(o => o.points)) !== JSON.stringify(b.lamp.map(o => o.points));
  if (!moved){ why = why || '两秒过去骆驼没动（这条查的是动画真在跑）'; never = false; }
  if (cityRec.ops.length !== cityOps0 || b.blits.length !== 1 || b.blits[0].image !== img || boxKey(b.blits[0].box) !== box0){ never = false; why = why || '动画跑着剪影变了'; }
}
check(onePaste && sameImg, '① 每帧只贴一回，一直是同一张图');
check(samePlace, '① 贴的位置一直是整块画布（' + box0 + '）');
check(onTop, '① 剪影最后贴，标签和线都在它下面');
check(never, '① 滑块拉遍、动画跑着，那张图一笔都没重画（还是 ' + cityOps0 + ' 笔）' + (REDUCE ? '' : '，骆驼在动'));
check(page.text('meter') === '剪影改过的像素：0', '① 页面上写的：' + page.text('meter'));
if (why) console.log('  第一处不对：' + why);

// ── ② 剪影本身 ──
const cops = cityRec.ops;
const inked = cops.filter(o => o.composite !== 'destination-out');
const arches = cops.filter(o => o.composite === 'destination-out' && o.op === 'fill');
check(inked.length > 10 && inked.every(o => sameColor(o.style, CITY_INK)), '② 剪影只用一种墨色 ' + CITY_INK + '（' + inked.length + ' 笔）');
const archXs = arches.map(o => Math.round(o.box.x / S)).sort((a, b) => a - b);
check(arches.length === 4 && arches.every(o => Math.abs(o.box.y + o.box.h - HZ * S) < 1e-6), '② 墙脚挖了四个拱门，都开在地平线上（左边 x：' + archXs.join('/') + '）');

// ── ③ 两头看见的东西 ──
const rows = table();
const col = k => rows.map(r => r[k]);
const d = seen[0], s = seen[100], m = seen[50];
check(rows.length === 8, '③ 表格 8 行');
check(JSON.stringify(d.labels.map(o => o.text)) === JSON.stringify(col(1)), '③ 从沙漠来：canvas 上的字就是表格「赶骆驼的人看见」那一列（' + d.labels.map(o => o.text).join('、') + '）');
check(JSON.stringify(s.labels.map(o => o.text)) === JSON.stringify(col(2)), '③ 从海上来：canvas 上的字就是表格「水手看见」那一列（' + s.labels.map(o => o.text).join('、') + '）');
const dw = col(1).join(''), sw = col(2).join('');
check(['桅杆', '风向袋', '天线', '烟囱'].every(w => dw.includes(w)) && ['峰', '流苏'].every(w => sw.includes(w)), '③ 书里那艘船的桅杆、风向袋、天线、烟囱，那头骆驼的峰和流苏，都在');
check(d.dunes.length === 3 && d.lamp.length > 0 && d.seaBand.length === 0, '③ 沙漠那头：三层沙丘、骑骆驼的人，没有海');
check(s.dunes.length === 0 && s.lamp.length > 0 && s.seaBand.length === 1, '③ 海那头：海和小船，没有沙丘');
check(m.dunes.length === 0 && m.lamp.length === 0 && m.seaBand.length === 0 && m.labels.length === 0 && m.lines.length === 0, '③ 中间两边都不站：没有前景、没有标签');

// ── ④ 标签线落在剪影上 ──
const inBox = (p, b, e) => p.x >= b.x - e && p.x <= b.x + b.w + e && p.y >= b.y - e && p.y <= b.y + b.h + e;
const cityBoxes = inked.map(o => ({ x: o.box.x / S, y: o.box.y / S, w: o.box.w / S, h: o.box.h / S }));
const archBoxes = arches.map(o => ({ x: o.box.x / S, y: o.box.y / S, w: o.box.w / S, h: o.box.h / S }));
let anchorsOk = d.lines.length === 8, archOk = false, off = '';
for (const l of d.lines){
  const at = l.points[1];
  const hit = cityBoxes.some(b => inBox(at, b, 2)), inArch = archBoxes.some(b => inBox(at, b, 0));
  if (inArch) archOk = true;
  if (!hit && !inArch){ anchorsOk = false; off = off || '(' + at.x.toFixed(0) + ',' + at.y.toFixed(0) + ')'; }
}
check(anchorsOk, '④ 8 根标签线的另一头都落在剪影上' + (off ? '；落空的：' + off : ''));
check(archOk, '④ 墙脚那一根落在拱门里');

// ── ⑤ 跟着站的那边换话 ──
const say = pos => { page.input('side', String(pos)); return [page.text('caption'), page.text('moral')]; };
const [c0, m0] = say(0), [c5, m5] = say(50), [c9, m9] = say(100), [c43] = say(43), [c57] = say(57);
check(c0 === '从沙漠这边看' && /一艘/.test(m0), '⑤ 沙漠这边：「' + c0 + '」，moral 说船');
check(c9 === '从海上看' && /一头/.test(m9), '⑤ 海上：「' + c9 + '」，moral 说骆驼');
check(c5 === '苔斯皮那' && /说不出像什么/.test(m5), '⑤ 中间：「' + c5 + '」，moral 说说不出像什么');
check(c43 === '从沙漠这边看' && c57 === '从海上看', '⑤ 换边的地方：43 还是沙漠、57 已是海');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
