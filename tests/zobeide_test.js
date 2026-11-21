// 佐贝伊德。2026-11-21 用 canvas-spy 重写。原来那份（7a6ec72 里）只打印、断言失败不改退出码，也没有变异；这份从画出来的东西里读：
// ① 开头：迷宫是完美的（240 格全连通，恰好拆掉 239 道内墙），边上十个出口都开着
// ② 每来一个人：画出来的追逐路线（虚线）一步走一格、不穿墙；最后一步伸出城外的那个口子本来是开着的，梦做完它被砌上，
//    出口恰好少一个；砌墙那一刻有一道灯色的新墙在同一个位置；迷宫内部不变
// ③ 梦做到一半，出口还一个没少（新墙要等梦结束才出现）——正常动效才查
// ④ 十个出口全堵上以后，第 11 个人的路停在城里的死胡同，出口还是 0，moral 换成「全堵上了」
// ⑤ 页面上的「来过几个」「出口还剩几个」跟画出来的对得上，「她出现过 0 次」从头到尾不变；做完的梦留下灰色的路，条数＝人数
// ⑥ reset：十个出口又开了、迷宫还是同一个完美迷宫、灰路没了
// 跑法：node tests/zobeide_test.js        减少动效：REDUCE=1 node tests/zobeide_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/zobeide_test.js
const path = require('path');
const { loadPage, where, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, COLS = 20, ROWS = 12, CELL = 70, OX = 100, OY = 80;
const EXITS = ['h:0:3', 'h:0:10', 'h:0:16', 'h:12:5', 'h:12:12', 'h:12:18', 'v:4:0', 'v:9:0', 'v:2:20', 'v:8:20'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'zobeide.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "const st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['if (c.exit){ walls.add(c.exit.key);', 'if (c.exit && n % 2){ walls.add(c.exit.key);'],                // 只砌单数人的口子
    ['walls.delete(n[2]); seen.add', 'walls.delete(n[2]); if (rand() < .08) walls.delete(neighbours(r, c, true)[0][2]); seen.add'], // 迷宫有环
    ['for (const n of neighbours(r, c, false)){', 'for (const n of neighbours(r, c, true)){'],               // 追的时候穿墙
    ['last[0] + exit.out[0] * CELL * .55', 'last[0] - exit.out[0] * CELL * .55'],                          // 最后一步往城里伸
    ["出口还剩 ' + left", "出口还剩 ' + (EXITS.length - n)"],                                      // 页面的数是算的不是看的
    ['end = reduce ? start :', 'end = false ? start :'],                                                   // 减少动效还在动
    ['clearTimeout(timer); carve();', 'clearTimeout(timer);'],                                             // reset 不重建
    ['if (!closed.has(k) || now >= closed.get(k)) wallLine(ctx, k);', 'wallLine(ctx, k);'],                // 新墙一开始就画上
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const CHALK = css('--chalk'), LAMP = css('--lamp'), DIM = css('--dim');
const text = id => page.text(id);
const near = (a, b) => Math.abs(a - b) < 1e-6;

// 画面里读出：墙（粉笔色线段 → 格子边的 key）、灯色新墙、虚线路线、灰色的路
function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const keyOf = op => {
    const [p, q] = op.points; if (!p || !q || op.points.length !== 2) return null;
    if (near(p.y, q.y)) return 'h:' + Math.round((p.y - OY) / CELL) + ':' + Math.round((Math.min(p.x, q.x) - OX) / CELL);
    if (near(p.x, q.x)) return 'v:' + Math.round((Math.min(p.y, q.y) - OY) / CELL) + ':' + Math.round((p.x - OX) / CELL);
    return null;
  };
  const walls = new Set(where(ops, { op: 'stroke', style: CHALK }).map(keyOf).filter(Boolean));
  const fresh = new Set(where(ops, { op: 'stroke', style: LAMP, dashed: false }).map(keyOf).filter(Boolean));
  const dashed = where(ops, { op: 'stroke', style: LAMP, dashed: true });
  const route = dashed.length ? dashed[dashed.length - 1].points : null;
  const streets = where(ops, { op: 'stroke', style: DIM }).length;
  return { walls, fresh, route, streets };
}
const openExits = v => EXITS.filter(k => !v.walls.has(k));
function maze(v){
  // interior walls only; a perfect maze on 240 cells has 239 openings and reaches everything
  let openings = 0;
  const adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++){
    if (r + 1 < ROWS && !v.walls.has('h:' + (r + 1) + ':' + c)){ openings++; link(r + ':' + c, (r + 1) + ':' + c); }
    if (c + 1 < COLS && !v.walls.has('v:' + r + ':' + (c + 1))){ openings++; link(r + ':' + c, r + ':' + (c + 1)); }
  }
  const seen = new Set(['0:0']), q = ['0:0'];
  while (q.length) for (const n of adj.get(q.shift()) || []) if (!seen.has(n)){ seen.add(n); q.push(n); }
  return { openings, reached: seen.size };
}
const cellOf = p => {
  const c = (p.x - OX - CELL / 2) / CELL, r = (p.y - OY - CELL / 2) / CELL;
  return near(c, Math.round(c)) && near(r, Math.round(r)) && c >= 0 && c < COLS && r >= 0 && r < ROWS ? [Math.round(r), Math.round(c)] : null;
};
const between = (a, b) => a[0] === b[0] ? 'v:' + a[0] + ':' + Math.max(a[1], b[1]) : 'h:' + Math.max(a[0], b[0]) + ':' + a[1];
// 路线：一格一格走、不穿墙；最后若伸出城外，返回伸出去穿过的那条边
function walk(route, walls){
  const cells = [], out = { ok: true, why: '', exitKey: null };
  for (let i = 0; i < route.length; i++){
    const c = cellOf(route[i]);
    if (c){ cells.push(c); continue; }
    if (i !== route.length - 1){ out.ok = false; out.why = '第 ' + i + ' 点不在格子中心'; return out; }
    const last = cells[cells.length - 1], p = route[i];
    const dx = Math.sign(Math.round(p.x - (OX + last[1] * CELL + CELL / 2))), dy = Math.sign(Math.round(p.y - (OY + last[0] * CELL + CELL / 2)));
    out.exitKey = dy ? 'h:' + (last[0] + (dy > 0 ? 1 : 0)) + ':' + last[1] : 'v:' + last[0] + ':' + (last[1] + (dx > 0 ? 1 : 0));
    const beyond = dy ? (dy < 0 ? p.y < OY : p.y > OY + ROWS * CELL) : (dx < 0 ? p.x < OX : p.x > OX + COLS * CELL);
    if (!beyond){ out.ok = false; out.why = '最后一步没伸出城外'; }
  }
  for (let i = 1; i < cells.length; i++){
    const [a, b] = [cells[i - 1], cells[i]];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1){ out.ok = false; out.why = '第 ' + i + ' 步跳格'; break; }
    if (walls.has(between(a, b))){ out.ok = false; out.why = '第 ' + i + ' 步穿墙 ' + between(a, b); break; }
  }
  return out;
}
const meter = () => { const m = /来过 (\d+) 个做这个梦的人 · 出口还剩 (\d+) \/ 10 · 她出现过 0 次$/.exec(text('meter')); return m ? [+m[1], +m[2]] : null; };

// ① 开头
let v = look();
const m0 = maze(v);
check(openExits(v).length === 10, '① 开头十个出口都开着（画出来 ' + openExits(v).length + ' 个）');
check(m0.openings === 239 && m0.reached === 240, '① 迷宫是完美的：内墙拆了 ' + m0.openings + ' 道、从角上走得到 ' + m0.reached + ' 格');
check(JSON.stringify(meter()) === '[0,10]' && text('caption') === '建城那一夜之前', '⑤ 开头页面：' + text('meter'));

// ②③④⑤ 来 11 个人
let prevOpen = openExits(v), routeOk = true, routeWhy = '', closeOk = true, closeWhy = '', freshOk = true, midOk = true, mazeOk = true, meterOk = true, streetsOk = true;
for (let n = 1; n <= 11; n++){
  page.click('arrive');
  if (!REDUCE){
    page.frame(300);
    const mid = look();
    if (!mid.route || openExits(mid).length !== prevOpen.length) midOk = false;
  }
  for (let i = 0; i < 400 && page.el('arrive').disabled; i++) page.frame(100);
  if (REDUCE) page.frame(0);
  v = look();
  const before = new Set(prevOpen);
  const w = v.route ? walk(v.route, new Set([...v.walls].filter(k => !before.has(k)))) : { ok: false, why: '没画路线' };
  if (!w.ok){ routeOk = false; if (!routeWhy) routeWhy = '第 ' + n + ' 个人：' + w.why; }
  const nowOpen = openExits(v);
  if (prevOpen.length){
    const ok = w.exitKey && before.has(w.exitKey) && !nowOpen.includes(w.exitKey) && nowOpen.length === prevOpen.length - 1;
    if (!ok){ closeOk = false; if (!closeWhy) closeWhy = '第 ' + n + ' 个人：伸出 ' + w.exitKey + '，出口 ' + prevOpen.length + '→' + nowOpen.length; }
    if (!v.fresh.has(w.exitKey)) freshOk = false;
  } else if (w.exitKey || nowOpen.length !== 0){ closeOk = false; if (!closeWhy) closeWhy = '第 ' + n + ' 个人：没出口了还伸出 ' + w.exitKey; }
  const mz = maze(v);
  if (mz.openings !== 239 || mz.reached !== 240) mazeOk = false;
  const mt = meter();
  if (!mt || mt[0] !== n || mt[1] !== nowOpen.length) meterOk = false;
  if (n === 11) check(/^出口全堵上了/.test(text('moral')) && /死胡同/.test(text('caption')), '④ 第 11 个人：' + text('caption'));
  page.frame(6000);
  if (look().streets !== n) streetsOk = false;
  prevOpen = nowOpen;
}
check(routeOk, '② 每条追逐路线一步一格、不穿墙' + (routeWhy ? '；' + routeWhy : ''));
check(closeOk, '② 每人伸出去的那个口子本来开着、梦做完被砌上，出口恰好少一个；没出口后路线停在城里' + (closeWhy ? '；' + closeWhy : ''));
check(freshOk, '② 砌上的那一刻，同一个位置有一道灯色的新墙');
if (!REDUCE) check(midOk, '③ 梦做到一半，出口一个没少');
check(mazeOk, '② 来了 11 个人，迷宫内部还是同一个完美迷宫');
check(meterOk, '⑤ 每一步页面上的人数和出口数跟画出来的对得上：' + text('meter'));
check(streetsOk, '⑤ 做完的梦都留下一条灰路，条数＝人数');

// ⑥ reset
page.click('reset');
v = look();
const m1 = maze(v);
check(openExits(v).length === 10 && m1.openings === 239 && m1.reached === 240 && v.streets === 0, '⑥ reset：十个出口又开了、迷宫完美、灰路 ' + v.streets + ' 条');
check(JSON.stringify(meter()) === '[0,10]', '⑥ reset 后页面：' + text('meter'));

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
