// 梅拉尼亚。2026-11-26，用 canvas-spy 从画出来的东西里读：每个演员是一种颜色，站在哪一格就是演哪个角色。
// ① 开场：九格都有人、九种颜色各不相同；角色名和台词是第 1 场的；每句台词前的色点＝此刻站在那个角色上的人
// ② 每过十五年：九格一直都满；每一串里活下来的人只往老的那头挪、次序不变、不换串；走了的人再也不回来；
//    新来的人只从年轻那头进，进来几个就走了几个；说明文字里「死了」「新来一个人」的次数跟画面对得上
// ③ 同一场里台词一字不改，色点跟着换人；换场只在九十年的整数倍，场次只增不减，到第 4 场就停；换场时角色名最多改两个
// ④ 第 3 场以后台上没有人是第一场就在的（寿命比一场短，页面数出来的跟画面一致）；最后的 moral 说收尾书里没写
// ⑤ 「一直看着」每 1.4 秒自己过十五年，再按一下停；reset 回到开场
// 跑法：node tests/melania_test.js        减少动效：REDUCE=1 node tests/melania_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/melania_test.js
const path = require('path');
const { loadPage, where, origin } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, FLOOR = 760, STEP = 15, SCENE = 90;
const GX = [290, 800, 1310], DX = 150;
const slotX = (g, r) => GX[g] + (r - 1) * DX;

const page = loadPage(path.join(__dirname, '..', 'cities', 'melania.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['for (let r = wr; r > 0; r--){', 'for (let r = wr; r > 1; r--){'],                                                   // 1 链只顶一格，最底下空着
    ["slots[wg][0] = n;", "slots[wg][wr] = n;"],                                                                            // 2 新人直接站到死者的格子
    ['const scene = y => Math.min(SCENES.length - 1, Math.floor(y / SCENE));', 'const scene = y => Math.floor(y / SCENE) % SCENES.length;'], // 3 演完又从头
    ['const y = 136 + i * 72, sp = slots[ln[0]][ln[1]];', 'const y = 136 + i * 72, sp = slots[ln[0]][0];'],                // 4 色点标错了人
    ["const n = newActor(wg, t);\n      slots[wg][0] = n;", "const n = slots[wg][1] || newActor(wg, t);\n      slots[wg][0] = n;"], // 5 一个人占两格
    ["const n = newActor(wg, t);\n      slots[wg][0] = n;", "const n = newActor(wg, t);\n      slots[wg][0] = who; who.dies = n.dies;"], // 6 死了的人又回来演（11-26 换掉「不按死的先后」：那个变异最后站位一样，是等价的）
    ["新来 ' + said.length + ' 个人。';", "新来 ' + (said.length - 1) + ' 个人。';"],                                  // 7 说明文字少报一个新人
    ["lines: [[1, 2, '别哭了，他总有一天会认你的。']", "lines: [[1, 2, '别哭了，他总有一天会认你的。'], [0, 0, '我也有一句。']"], // 8 第 2 场多出一句
    ['const was = all.filter(a => a.entered < k * SCENE).length,', 'const was = all.length,'], // 9 「上一场就在台上的」不数，直接说九个（11-26 换掉「first = 0」：寿命对的时候它本来就是 0，等价）
    ["if (on) timer = setInterval(() => advance(STEP), 1400);", "if (on) timer = setInterval(() => advance(STEP * 2), 1400);"], // 10 一直看着一跳二十四年
    ["const age = 22 + r * 19 + rand() * 6, left = 4 + rand() * (r === 2 ? 22 : r === 1 ? 40 : 55);", "const age = 22 + r * 19 + rand() * 6, left = r === 0 ? 200 : 4 + rand() * (r === 2 ? 22 : 40);"], // 11 开场的年轻人活过两场
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const near = (a, b, e = .5) => Math.abs(a - b) < e;

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  // figures: stroked in a per-actor hsl colour, standing on the floor
  const figs = where(ops, { op: 'stroke', test: o => /^hsl\(/.test(o.style) && near(origin(o).y, FLOOR) && o.alpha > .99 });
  const grid = [[], [], []], stray = [];
  for (const f of figs){
    const x = origin(f).x; let hit = false;
    for (let g = 0; g < 3; g++) for (let r = 0; r < 3; r++) if (near(x, slotX(g, r))){
      hit = true; if (grid[g][r] && grid[g][r] !== f.style) stray.push('两种颜色在同一格'); grid[g][r] = f.style;
    }
    if (!hit) stray.push('格子外有人 x=' + x.toFixed(1));
  }
  const names = [[], [], []];
  for (const t of where(ops, { op: 'fillText', test: o => near(o.box.y, FLOOR + 24) || near(o.box.y, FLOOR + 68) }))
    for (let g = 0; g < 3; g++) for (let r = 0; r < 3; r++) if (near(t.box.x, slotX(g, r)) && near(t.box.y, FLOOR + (r === 1 ? 68 : 24))) names[g][r] = t.text;
  const lines = where(ops, { op: 'fillText', test: o => near(o.box.x, 110) }).map(o => o.text);
  const dots = where(ops, { op: 'fill', test: o => near(o.box.cx, 82) && o.box.cy > 100 && o.box.cy < 300 }).map(o => o.style);
  const sceneText = (where(ops, { op: 'fillText', test: o => /^第 \d 场$/.test(o.text) })[0] || {}).text;
  return { grid, stray, names, lines, dots, scene: sceneText ? +sceneText.match(/\d/)[0] : -1 };
}
const year = () => +(/过了 (\d+) 年/.exec(page.text('meter')) || [0, -1])[1];
const settle = () => page.run(REDUCE ? 20 : 1000);
const flat = grid => grid.flat();
// speaker of each line, by the part name before the colon, located among the drawn part names
function speakers(v){
  return v.lines.map(l => {
    const who = l.split('：')[0];
    for (let g = 0; g < 3; g++) for (let r = 0; r < 3; r++) if (v.names[g][r] === who) return v.grid[g][r];
    return null;
  });
}

// ① 开场
settle();
let v = look();
const OPEN = JSON.stringify(v.grid);
check(flat(v.grid).filter(Boolean).length === 9 && new Set(flat(v.grid)).size === 9 && !v.stray.length, '① 开场九格都有人、九种颜色');
check(v.names[0].join() === '伪君子,吹牛的军人,寄生虫' && v.names[1].join() === '女友,恋爱中的女儿,拉皮条的女人' && v.names[2].join() === '星相家,愚蠢的仆人,吝啬的父亲',
  '① 三串角色照书里的次序：' + v.names.map(n => n.join('→')).join('｜'));
check(v.scene === 1 && v.lines.length === 3 && JSON.stringify(v.dots) === JSON.stringify(speakers(v)), '① 第 1 场三句台词，每句的色点是站在那个角色上的人');

// ② ③ ④ 过四十次十五年
const firstSeenYear = {}, wasSeen = new Set();
const gone = new Set(), seen = new Set(flat(v.grid));
flat(v.grid).forEach(c => { firstSeenYear[c] = 0; });
const textOfScene = {}, namesOfScene = {};
let ok = { full: true, upOnly: true, noReturn: true, inBottom: true, balance: true, caption: true, sameText: true, dotsFollow: true, sceneAt: true, sceneMono: true, rename: true, stop: true, first: true, moralCount: true };
let why = '', dotChanged = false, prevScene = 1, prev = v;
const note = (k, msg) => { if (ok[k]){ ok[k] = false; why = why || msg; } };
for (let step = 1; step <= 40; step++){
  page.click('years'); settle();
  v = look();
  const y = year(), cap = page.text('caption');
  if (y !== step * STEP) note('sceneAt', '第 ' + step + ' 次之后年份 ' + y);
  if (flat(v.grid).filter(Boolean).length !== 9 || new Set(flat(v.grid)).size !== 9 || v.stray.length) note('full', '第 ' + y + ' 年格子不满或重复：' + v.stray.join(' '));
  let deaths = 0, newcomers = 0;
  for (let g = 0; g < 3; g++){
    const before = prev.grid[g], after = v.grid[g];
    const survivors = before.filter(c => after.includes(c));
    const left = before.filter(c => !after.includes(c));
    const fresh = after.filter(c => !before.includes(c));
    deaths += left.length; newcomers += fresh.length;
    left.forEach(c => gone.add(c));
    if (fresh.length !== left.length) note('balance', g + ' 串走了 ' + left.length + ' 来了 ' + fresh.length);
    for (const c of survivors){ if (after.indexOf(c) < before.indexOf(c)) note('upOnly', '第 ' + y + ' 年有人往年轻那头挪'); }
    const order = after.filter(c => survivors.includes(c));
    if (order.join() !== survivors.join()) note('upOnly', '第 ' + y + ' 年 ' + g + ' 串次序变了');
    for (const c of fresh){
      if (gone.has(c) || seen.has(c)) note('noReturn', '第 ' + y + ' 年有人回来了');
      if (survivors.some(s => after.indexOf(s) < after.indexOf(c))) note('inBottom', '第 ' + y + ' 年新人站到了老人前面');
    }
    for (let h = 0; h < 3; h++) if (h !== g) for (const c of after) if (prev.grid[h].includes(c)) note('upOnly', '第 ' + y + ' 年有人换了串');
  }
  flat(v.grid).forEach(c => seen.add(c));
  const dm = /^(.*?)死了/.exec(cap), capDeaths = dm ? dm[1].split('、').length : 0;
  const capNew = /新来一个人/.test(cap) ? 1 : +((/新来 (\d+) 个人/.exec(cap) || [0, 0])[1]);
  if (capDeaths !== deaths || capNew !== newcomers) note('caption', '第 ' + y + ' 年画面走 ' + deaths + ' 来 ' + newcomers + '，说明写 ' + capDeaths + '／' + capNew);
  // scenes
  const want = Math.min(4, Math.floor(y / SCENE) + 1);
  if (v.scene !== want) note('sceneAt', '第 ' + y + ' 年是第 ' + v.scene + ' 场，该是第 ' + want + ' 场');
  if (v.scene < prevScene) note('sceneMono', '场次倒回去了');
  const key = v.scene;
  if (textOfScene[key] == null){ textOfScene[key] = v.lines.join('\n'); namesOfScene[key] = flat(v.names).join(); }
  else {
    if (textOfScene[key] !== v.lines.join('\n') || namesOfScene[key] !== flat(v.names).join()) note('sameText', '第 ' + key + ' 场台词或角色名变了');
    if (v.scene === prev.scene && JSON.stringify(v.dots) !== JSON.stringify(prev.dots)) dotChanged = true;
  }
  if (v.scene !== prev.scene){
    const a = flat(prev.names), b = flat(v.names), diff = a.filter((n, i) => n !== b[i]).length;
    if (diff > 2 || diff === 0) note('rename', '换到第 ' + v.scene + ' 场改了 ' + diff + ' 个角色名');
  }
  if (JSON.stringify(v.dots) !== JSON.stringify(speakers(v)) || v.dots.length !== 3) note('dotsFollow', '第 ' + y + ' 年色点不是说话的人');
  // a newcomer first seen at year y stepped on some time in (y - 15, y]
  flat(v.grid).forEach(c => { if (firstSeenYear[c] === undefined) firstSeenYear[c] = y; });
  // nobody on stage now has been there since the first scene, once we are in the third
  if (v.scene >= 3){
    if (flat(v.grid).some(c => firstSeenYear[c] <= SCENE)) note('first', '第 ' + y + ' 年台上还有第一场就在的人');
    const m = /第一场时就在台上的，(.+?)。/.exec(page.text('moral'));
    const said = m ? (m[1] === '一个也没有' ? 0 : +(/还有 (\d+) 个/.exec(m[1]) || [0, -1])[1]) : (v.scene === 4 && y >= 360 ? null : -1);
    const real = flat(v.grid).filter(c => firstSeenYear[c] <= SCENE).length;
    if (said !== null && said !== real) note('moralCount', '第 ' + y + ' 年页面说第一场的人还有 ' + said + '，画面上 ' + real);
  }
  if (v.scene >= 2){
    const m = /上一场就在台上的有 (\d+) 个/.exec(page.text('moral'));
    const real = flat(v.grid).filter(c => firstSeenYear[c] !== undefined && firstSeenYear[c] <= (v.scene - 1) * SCENE).length;
    if (m && +m[1] !== real) note('moralCount', '第 ' + y + ' 年页面说上一场就在台上的有 ' + m[1] + '，画面上 ' + real);
    if (!m && !(v.scene === 4 && y >= 360)) note('moralCount', '第 ' + y + ' 年 moral 没说上一场的人');
    if (m) wasSeen.add(+m[1]);
  }
  prevScene = v.scene; prev = v;
}
check(ok.full, '② 每过十五年九格都满、没有两种颜色挤一格');
check(ok.upOnly, '② 活下来的人只往老的那头挪、次序不变、不换串');
check(ok.noReturn, '② 走了的人再也没回来（六百年里一共 ' + seen.size + ' 个人上过台）');
check(ok.inBottom && ok.balance, '② 新人只从年轻那头进，走几个来几个');
check(ok.caption, '② 说明文字里「死了」「新来一个人」的次数跟画面对得上');
check(ok.sameText && dotChanged, '③ 同一场里台词和角色名一字不改，色点换过人');
check(ok.dotsFollow, '③ 每句台词的色点一直是此刻站在那个角色上的人');
check(ok.sceneAt && ok.sceneMono, '③ 换场只在九十年的整数倍、只增不减、停在第 4 场');
check(ok.rename, '③ 每次换场改了一到两个角色名');
check(ok.first && ok.moralCount && wasSeen.size > 1, '④ 第 3 场以后台上没有第一场就在的人；页面数的「上一场就在台上的」跟画面一样（见过 ' + [...wasSeen].join('、') + ' 个）');
if (why) console.log('  第一处不对：' + why);
check(/收尾/.test(page.text('moral')) && /书里没写/.test(page.text('moral')), '④ 最后：' + page.text('moral').slice(0, 20));

// ⑤ 一直看着、reset
page.click('reset'); settle();
const y0 = year();
page.click('watch'); page.run(1400 * 3 + 100);
const y3 = year();
page.click('watch'); page.run(1400 * 3);
check(y0 === 0 && y3 === 3 * STEP && year() === y3 && page.el('watch').getAttribute('aria-pressed') === 'false', '⑤ 一直看着：4.2 秒过了 ' + y3 + ' 年，再按一下就停了');
page.click('reset'); settle();
v = look();
check(year() === 0 && JSON.stringify(v.grid) === OPEN && v.scene === 1, '⑤ reset 回到开场那九个人');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
