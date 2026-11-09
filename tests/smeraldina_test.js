// 无头跑 smeraldina.html：桩掉 DOM/canvas，时钟可拨，测试侧注入只读钩子。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { nodes, edges, can, route, keyOf, walk, tap, nodeAt, swallowAt, DUR, FADE, TRIES, get A(){ return A; }, get B(){ return B; }, get walks(){ return walks; }, get seen(){ return seen; }, get roofs(){ return roofs; }, get unders(){ return unders; }, get trace(){ return trace; }, get traces(){ return traces; }, get st(){ return st; } };\n  ' + hook);
const els = {}; let log = [];
function mk(id){ return { id, textContent: '', disabled: false, dataset: {}, attrs: {}, style: {}, children: [], handlers: {}, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ this.handlers[ev] = f; }, appendChild(c){ this.children.push(c); }, setAttribute(k, v){ this.attrs[k] = v; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }; }
function el(id){ return els[id] || (els[id] = mk(id)); }
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); log.push({ op: String(k), a, stroke: t.strokeStyle, alpha: t.globalAlpha, w: t.lineWidth }); }; },
  set(t, k, v){ t[k] = v; return true; } });
let NOW = 1000000;
global.window = { matchMedia: () => ({ matches: !!process.env.REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), createTextNode: t => ({ t }), querySelectorAll: () => [] };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
eval(src);
const T = global.__T, R = !!process.env.REDUCE;
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const at = s => { NOW = s * 1000; };
const frame = () => { log = []; T.st.redraw(); return log.slice(); };
const canvas = el('c'), meter = () => el('meter').textContent, cap = () => el('caption').textContent, moral = () => el('moral').textContent;
const press = (x, y) => canvas.handlers.pointerdown({ clientX: x / 2, clientY: y / 2 });
const pressNode = i => press(T.nodes[i].x + 10, T.nodes[i].y - 10);
const WATER = '#7cc4f0', INK = '--ink';

// A walk is legal only if it is a chain from A to B and every stretch is passable the way he goes it.
function legal(w, A, B){
  const s = w.segs; if (!s.length) return false;
  if (s[0].from !== A || s[s.length - 1].to !== B) return false;
  for (let i = 0; i < s.length; i++){
    const e = T.edges[s[i].edge];
    if (!((e.a === s[i].from && e.b === s[i].to) || (e.b === s[i].from && e.a === s[i].to))) return false;
    // the test's own rule, not the page's can(): a canal is for boats, a street for feet, both for either
    if (!(e.type === 'both' || (s[i].mode === 'water' ? e.type === 'water' : e.type === 'street'))) return false;
    if (i && s[i].from !== s[i - 1].to) return false;
  }
  return true;
}

at(1000);
check(T.nodes.length === 40 && T.edges.length === 67, '地图 40 个路口、67 段路：' + T.nodes.length + '/' + T.edges.length);
const types = T.edges.reduce((m, e) => (m[e.type] = (m[e.type] || 0) + 1, m), {});
check(types.water > 5 && types.street > 5 && types.both > 5, '河、街、河边带路三种都有：' + JSON.stringify(types));
check(T.nodes.every(n => n.x > 60 && n.x < 1540 && n.y > 60 && n.y < 940), '路口都在画面里');
check(/还没选两个地方/.test(meter()) && el('tomorrow').disabled, '开头：没选地方，「明天」按钮停着');

press(800, 30); check(T.A == null, '点在空处（离路口远）：什么都不选');
const A = 0 * 8 + 0, B = 4 * 8 + 7;   // top-left to bottom-right
pressNode(A); check(T.A === A && T.B == null && /去哪儿/.test(cap()), '点左上角：起点');
pressNode(A); check(T.A == null, '起点再点一次：取消');
pressNode(A); pressNode(B);
check(T.B === B && T.walks.length === 1 && legal(T.walks[0], A, B), '再点右下角：第 1 天的路从起点连到终点、每段都走得通');
check(/第 1 天/.test(cap()) && /1 天，1 条不同的路/.test(meter()) && !el('tomorrow').disabled, '说明和计数：' + cap() + ' | ' + meter());

// Many days: all different, all legal.
for (let d = 0; d < 11; d++) el('tomorrow').handlers.click();
const ws = T.walks, keys = new Set(ws.map(w => w.key));
check(ws.length === 12 && keys.size === 12 && ws.every(w => w.fresh), '走 12 天：12 条路两两不同');
check(ws.every(w => legal(w, A, B)), '12 条都合法');
check(ws.some(w => w.segs.some(s => s.mode === 'water')) && ws.some(w => w.segs.some(s => s.mode === 'land')), '有走水路的，也有走陆路的');
check(ws.some(w => w.segs.some((s, i) => i && s.mode !== w.segs[i - 1].mode)), '有在半路上下船的');
check(/12 天，12 条不同的路/.test(meter()) && /一模一样/.test(moral()), '计数 12 天 12 条；第二段话');

// Drawing: today's route bright, old ones faint.
const today = T.walks[T.walks.length - 1];
if (!R){
  at(1000 + 0);   // the clock does not move: today's walk was made "now", nothing drawn yet
  const f0 = frame().filter(l => l.op === 'lineTo' && l.alpha === 1 && (l.stroke === WATER || l.stroke === INK) && (l.w === 9 || l.w === 7));
  at(1000 + T.DUR / 2);
  const fh = frame().filter(l => l.op === 'lineTo' && l.alpha === 1 && (l.stroke === WATER || l.stroke === INK) && (l.w === 9 || l.w === 7));
  at(1000 + T.DUR + .1);
  const ff = frame().filter(l => l.op === 'lineTo' && l.alpha === 1 && (l.stroke === WATER || l.stroke === INK) && (l.w === 9 || l.w === 7));
  check(fh.length > 0 && fh.length < ff.length && ff.length === today.segs.length, '今天的路一段段画出来：一半时 ' + fh.length + ' 段，画完 ' + ff.length + '/' + today.segs.length + ' 段');
} else {
  const ff = frame().filter(l => l.op === 'lineTo' && l.alpha === 1 && (l.stroke === WATER || l.stroke === INK) && (l.w === 9 || l.w === 7));
  check(ff.length === today.segs.length, '减少动效：今天的路一下全画上 ' + ff.length + '/' + today.segs.length);
}
const faint = frame().filter(l => l.op === 'lineTo' && Math.abs(l.alpha - .22) < 1e-9).length;
check(faint === T.walks.slice(0, -1).reduce((s, w) => s + w.segs.length, 0), '以前那 11 天的路淡淡地留着：' + faint + ' 段');

// Roofs and drains.
const f1 = frame();
check(!f1.some(l => l.stroke === '--lamp' && l.op === 'lineTo' && l.w === 5), '屋顶那层没开：不画');
el('roof').handlers.click();
check(el('roof').attrs['aria-pressed'] === 'true' && /猫、小偷/.test(cap()) && /屋顶上断断续续/.test(moral()), '开屋顶：按钮按下、说明、第三段话');
const rs = T.roofs;
check(rs[0] === A && rs[rs.length - 1] === B && rs.every((n, i) => !i || (Math.abs(T.nodes[n].c - T.nodes[rs[i - 1]].c) <= 1 && Math.abs(T.nodes[n].r - T.nodes[rs[i - 1]].r) <= 1 && n !== rs[i - 1])), '屋顶那条从起点跳到终点，每步跳到相邻一格：' + rs.length + ' 步');
check(rs.some((n, i) => i && T.nodes[n].c !== T.nodes[rs[i - 1]].c && T.nodes[n].r !== T.nodes[rs[i - 1]].r), '屋顶那条有斜着跳的');
const fr = frame();
const roofLines = fr.filter(l => l.stroke === '--lamp' && l.op === 'lineTo' && l.w === 5);
const roofEnds = fr.filter(l => l.stroke === '--lamp' && (l.op === 'lineTo' || l.op === 'moveTo') && l.w === 5);
const nearNode = p => Math.min(...T.nodes.map(n => Math.hypot(n.x - (p[0] + 6), n.y - (p[1] + 6))));
check(roofLines.length === rs.length - 1, '屋顶那条画了 ' + roofLines.length + ' 段');
check(roofEnds.length === 2 * (rs.length - 1) && roofEnds.every(l => nearNode(l.a) > 25), '每段两头都不碰路口（中间断开、是跳过去的）：最近 ' + Math.round(Math.min(...roofEnds.map(l => nearNode(l.a)))));
el('under').handlers.click();
const us = T.unders;
check(us[0] === A && us[us.length - 1] === B && us.every((n, i) => !i || Math.abs(T.nodes[n].c - T.nodes[us[i - 1]].c) + Math.abs(T.nodes[n].r - T.nodes[us[i - 1]].r) === 1), '下水道那条只横竖走、从起点到终点：' + us.length + ' 步');
check(/乳酪/.test(cap()) && frame().filter(l => l.stroke === '#a68bd0' && l.op === 'lineTo').length === us.length - 1, '开下水道：说明、画出来');
el('roof').handlers.click(); el('under').handlers.click();
check(el('roof').attrs['aria-pressed'] === 'false' && !frame().some(l => l.stroke === '--lamp' && l.w === 5 && l.op === 'lineTo'), '再点关掉');

// Swallows.
const s0 = T.swallowAt(0, 0), s1 = T.swallowAt(0, 3.5);
check(Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) > 100, '燕子在飞（半个周期挪了很远）');
el('swallow').handlers.click();
check(T.traces === 1 && /燕子的路描了 1 次/.test(meter()) && /最难标/.test(moral()), '描燕子：计数 1，第四段话');
if (!R){
  check(!!T.trace && /不在那条线上/.test(cap()), '描下了一段');
  const t0 = NOW / 1000;
  const dashed = () => frame().filter(l => l.op === 'lineTo' && l.stroke === INK && l.w === 2).length;
  // 41 points → 40 strokes, or 39 if the pen lifts where the swallow re-enters (this moment, 1002.5 s, is such a one)
  check(dashed() >= 39 && dashed() <= 40, '描下的那段画在图上：' + dashed() + ' 段');
  at(t0 + T.FADE + .1); dashed();
  check(T.trace === null && dashed() === 0, '一秒半以后淡没了');
  // Trace at a moment whose last 2 s include the swallow leaving one edge and coming back at the other
  // (bird 0 has period 7 s, so 7·143 + 1 s is 1 s after it re-enters): no stroke may jump across the map.
  at(7 * 143 + 1); el('swallow').handlers.click();
  const tr = frame().filter(l => l.stroke === INK && l.w === 2 && (l.op === 'lineTo' || l.op === 'moveTo'));
  let jump = 0; tr.forEach((l, i) => { if (i && l.op === 'lineTo') jump = Math.max(jump, Math.hypot(l.a[0] - tr[i - 1].a[0], l.a[1] - tr[i - 1].a[1])); });
  check(tr.filter(l => l.op === 'moveTo').length === 2 && tr.filter(l => l.op === 'lineTo').length === 39 && jump < 60,
    '描线跨过燕子重新进场的那一刻：断成两截、没有一笔横穿地图（最长一笔 ' + Math.round(jump) + 'px）');
} else {
  check(T.trace === null && /没有地方落笔/.test(cap()), '减少动效：描不上');
}

// New pair, same pair again → same walks (seeded); reset.
el('reset').handlers.click();
check(T.A == null && T.walks.length === 0 && el('tomorrow').disabled && /还没选/.test(meter()), '换两个地方：清空');
pressNode(A); pressNode(B);
check(T.walks[0].key === ws[0].key, '同样两处，第 1 天的路跟上回一样（按两处定的随机数）');
pressNode(3);
check(T.A === 3 && T.B == null && T.walks.length === 0, '走完再点一处：重新选起点');
// A short trip has only a few ways. Find them all by sampling the page's route() with many seeds,
// then walk 8 days: he must not repeat a way while an unwalked one is left.
el('reset').handlers.click();
const A2 = 1 * 8 + 2, B2 = 2 * 8 + 3, all = new Set();
for (let k = 0; k < 3000; k++) all.add(T.keyOf(T.route(A2, B2, SC.rng(77 + k))));
pressNode(A2); pressNode(B2);
for (let d = 0; d < 7; d++) el('tomorrow').handlers.click();
const want = Math.min(8, all.size), firstRepeat = T.walks.findIndex(w => !w.fresh);
check(T.seen.size === want && (firstRepeat < 0 || firstRepeat >= all.size), '近处只有 ' + all.size + ' 种走法：8 天里走出 ' + T.seen.size + ' 种，用完之前不重复（第一次重复在第 ' + (firstRepeat + 1) + ' 天）');
if (all.size < 8) check(/能走的都走过了/.test(el('caption').textContent) || T.walks[T.walks.length - 1].fresh === false, '走法用完以后：说这两处之间能走的都走过了');
// every pair has a legal walk (no stranded corner)
let bad = 0;
for (let a = 0; a < 40; a += 3) for (let b = 1; b < 40; b += 5) if (a !== b){ const w = { segs: T.route(a, b, SC.rng(a * 40 + b)) }; if (!legal(w, a, b)) bad++; }
check(bad === 0, '随便哪两处之间都找得到合法的路（抽 ' + Math.ceil(40 / 3) * 8 + ' 对，坏 ' + bad + '）');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
