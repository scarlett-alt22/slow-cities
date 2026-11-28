// 马洛奇亚。2026-11-29，用 canvas-spy 从画出来的东西里读：墙、缝里那座透明的城、亮起来的人、蜘蛛网、你在墙上的位置。
// 先列看的人应该看见什么，再测机关：
// ① 开头：一整道墙，墙上没有缝，街上有人；计数写「还没看见」
// ② 等着看：缝会开；每次开的时候，缝两边都有亮起来的人（一个人的高兴传给了另一个），缝在两人中间
// ③ 缝一眨眼就合上（正常动效不到 1 秒），合上的地方留一张蜘蛛网
// ④ 计数对得上画面：看见几次就记几次；开在你不在的那段，记进「别处」
// ⑤ 专门去找：高兴照样传（还是有两个人同时亮着），墙一次也不开；计数写下有几回没开
// ⑥ 沿墙走：位置条往前挪，走到头按钮按不动、不再往前；减少动效时街上的人不走
// 跑法：node tests/marozia_test.js        减少动效：REDUCE=1 node tests/marozia_test.js
// 变异：node tests/canvas-spy-mutate.js -- node tests/marozia_test.js
const path = require('path');
const { loadPage, where } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, WORLD = 4800, WALL_TOP = 250, WALL_BOT = 600, STREET = 860, BAR = 46;
const OPEN = REDUCE ? 1.6 : 0.9, TICK = 250;

const page = loadPage(path.join(__dirname, '..', 'cities', 'marozia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: 1000 },
  expose: { 'const st = SC.stage(canvas, W, H, draw);': '{ redraw: () => st.redraw() }' },
  mutations: [
    ['if (best < RANGE) pend.push', 'pend.push'],                                                        // 1 没人接住也开缝（离得再远也算）
    ['if (hunt){', 'if (false){'],                                                                         // 2 专门找也照样开
    ['if (now - c.t < OPEN) return true;', 'if (now - c.t < OPEN * 4) return true;'],                     // 3 缝开很久
    ['webs.push(c.x); if', 'if'],                                                                          // 4 合上不留蜘蛛网
    ['if (here){ seen++;', 'if (true){ seen++;'],                                                          // 5 别处开的也算你看见
    ['ctx.globalAlpha = .28; ctx.fillStyle = C.ink;', 'ctx.globalAlpha = .28; ctx.fillStyle = C.rule;'], // 6 缝里没有那座透明的城
    ['glows.push({ i: p.b, t: p.at });', ''],                                                              // 7 高兴没传过去，另一个人不亮
    ['const posT = t => reduce ? 0 : t;', 'const posT = t => t;'],                                         // 8 减少动效时人还在走
    ['walk = Math.max(0, Math.min(WORLD - W, walk + d));', 'walk = Math.max(0, walk + d);'],               // 9 走过了墙头
    ['else missed++;', ''],                                                                                // 10 别处开的不记
    ['ctx.fillStyle = C.rule; ctx.fillRect(walk, WALL_TOP', 'ctx.fillStyle = C.rule; ctx.rect(walk, WALL_TOP'], // 11 墙没画
    ['mid(xOf(p.a, p.at), xOf(p.b, p.at))', 'xOf(p.a, p.at)'],                                             // 12 缝不在两人中间
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const V = page.cssVars, INK = V['--ink'], LAMP = V['--lamp'], DIM = V['--dim'], CHALK = V['--chalk'], RULE = V['--rule'], SKYHI = V['--sky-hi'];

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const heads = c => where(ops, { op: 'stroke', style: c, test: o => o.box && o.box.w > 13 && o.box.w < 19 && Math.abs(o.box.w - o.box.h) < 1.5 && o.box.cy > STREET - 75 && o.box.cy < STREET - 35 }).map(o => o.box.cx);
  return {
    wall: where(ops, { op: 'fillRect', style: RULE, test: o => o.box.w >= W - 1 && Math.abs(o.box.y - WALL_TOP) < 1 && Math.abs(o.box.h - (WALL_BOT - WALL_TOP)) < 1 }).length,
    cracks: where(ops, { op: 'fillRect', style: INK, test: o => o.box.h > 200 && o.box.w < 200 && o.box.cy > WALL_TOP && o.box.cy < WALL_BOT }).map(o => o.box.cx),
    lit: heads(LAMP), dark: heads(INK),
    webs: where(ops, { op: 'stroke', style: DIM, test: o => o.box && Math.abs(o.box.w - 68) < 3 && Math.abs(o.box.cy - (WALL_TOP + 70)) < 3 }).map(o => o.box.cx),
    view: (where(ops, { op: 'strokeRect', style: CHALK, test: o => Math.abs(o.box.cy - BAR) < 2 })[0] || { box: { x: NaN } }).box.x,
  };
}
const tick = () => { page.frame(TICK); return look(); };
const meterNum = re => +((re.exec(page.text('meter')) || [0, 0])[1]);

// ① 开头
page.run(100);
let v = look();
check(v.wall === 1 && v.cracks.length === 0 && v.dark.length >= 4, '① 一整道墙，没有缝，街上 ' + v.dark.length + ' 个人');
check(/还没看见/.test(page.text('meter')) && page.el('back').disabled && !page.el('fwd').disabled, '① 计数写「还没看见」；在墙这一头，「往回走」按不动');

// ② ③ ④ 等着看 60 秒
const episodes = []; let open = null, pairOk = true, pairMsg = '';
for (let k = 0; k < 240; k++){
  v = tick();
  if (v.cracks.length){
    const x = v.cracks[0];
    if (!open) open = { x, frames: 0 };
    open.frames++;
    // two lit people, one on each side, the crack between them
    const near = v.lit.filter(h => Math.abs(h - x) < 330).sort((a, b) => a - b);
    const between = near.length >= 2 && Math.abs((near[0] + near[near.length - 1]) / 2 - x) < 45;
    if (!between && pairOk){ pairOk = false; pairMsg = '缝在 ' + Math.round(x) + '，亮着的人 ' + JSON.stringify(v.lit.map(Math.round)); }
  } else if (open){
    open.webAfter = v.webs.some(w => Math.abs(w - open.x) < 30);
    episodes.push(open); open = null;
  }
}
const inView = episodes.filter(e => e.x >= 0 && e.x <= W);
check(inView.length >= 1, '② 等了 60 秒，墙上开过缝（看见 ' + inView.length + ' 次）');
check(pairOk, '② 每次开缝，缝两边都有亮起来的人、缝在他们中间' + (pairMsg ? '：' + pairMsg : ''));
check(episodes.every(e => e.frames * TICK / 1000 <= OPEN + TICK / 1000), '③ 缝一眨眼就合上（最长 ' + Math.max(...episodes.map(e => e.frames)) * TICK / 1000 + ' 秒，上限 ' + OPEN + '）');
check(episodes.length > 0 && episodes.every(e => e.webAfter), '③ 合上的地方都留了一张蜘蛛网');
check(meterNum(/裂开过 (\d+) 次/) === inView.length, '④ 计数「看见」' + meterNum(/裂开过 (\d+) 次/) + ' 次，画面上开过 ' + inView.length + ' 次');
check(meterNum(/别处裂开过 (\d+) 次/) > 0, '④ 开在你不在的那段的，记进「别处」：' + page.text('meter'));

// ⑤ 专门去找
page.click('hunt');
check(page.el('hunt').getAttribute('aria-pressed') === 'true' && /不来/.test(page.text('moral')), '⑤ 按下「专门去找」：' + page.text('moral').slice(0, 12));
let huntCracks = 0, pairsLit = 0;
for (let k = 0; k < 240; k++){ v = tick(); huntCracks += v.cracks.length; if (v.lit.length >= 2) pairsLit++; }
check(huntCracks === 0, '⑤ 专门找的 60 秒里，墙一次也没开');
check(pairsLit > 0 && meterNum(/有 (\d+) 回高兴传了过去/) > 0, '⑤ 高兴照样传（' + pairsLit + ' 帧里有两个人同时亮着），计数记下 ' + meterNum(/有 (\d+) 回高兴传了过去/) + ' 回没开');
page.click('hunt');
check(page.el('hunt').getAttribute('aria-pressed') === 'false' && !/不来/.test(page.text('moral')), '⑤ 不找了');

// ⑥ 沿墙走
v = look(); const x0 = v.view;
page.click('fwd'); v = look();
check(Math.abs(v.view - x0 - 400 * W / WORLD) < .5 && !page.el('back').disabled, '⑥ 往前走一步，位置条挪了 ' + (v.view - x0).toFixed(1));
for (let k = 0; k < 20; k++) page.click('fwd');
v = look();
check(page.el('fwd').disabled && Math.abs(v.view - (WORLD - W) * W / WORLD) < .5, '⑥ 走到墙头：按钮按不动，位置条停在 ' + v.view.toFixed(1));
page.key('ArrowRight', 'c'); const v2 = look();
check(v2.view === v.view, '⑥ 墙头再按方向键也不往前');
page.key('ArrowLeft', 'c');
check(Math.abs(look().view - (WORLD - W - 400) * W / WORLD) < .5, '⑥ 方向键往回走一步');
const a = look().dark.concat(look().lit).sort((p, q) => p - q);
page.frame(1000);
const b = look().dark.concat(look().lit).sort((p, q) => p - q);
if (REDUCE) check(JSON.stringify(a) === JSON.stringify(b), '⑥ 减少动效：街上的人不走');
else check(JSON.stringify(a) !== JSON.stringify(b), '⑥ 正常动效：街上的人在走');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
