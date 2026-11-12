// 无头跑 raissa.html：桩掉 DOM/canvas/计时器，时间用假时钟一格一格（0.1 秒）往前走。
// 画面从记录下来的绘图调用里读：测试在 draw 里「灰的城」和「线」前后各插一个记号，把一帧切成三段
// （记号之前＝天和问到的人的名字；灰的城；线），不读页面自己的状态。
// 检查：
// ① 灰的城每一帧都是同一串绘图调用：不管线在哪一环、问没问人、问的是谁、过了多久
// ② 任一时刻正好一根线：线那一段里只有一个 moveTo，颜色只有灯色；它从链上第 k 环出发，
//    另一头要么正好在第 k+1 环，要么在去第 k+1 环的直线上（伸出去的那 0.3 秒）；两头的圈也只圈这两环
// ③ 顺序：k 照书里那句话的次序 0→9 走，每环 1.8 秒，走完从头再来；链上的名字和次序对着书核
// ④ 留不住：一边狂按「问一个人」、点画面，线的时间表跟没人碰的时候逐帧一样
// ⑤ 问人：十个人轮着问，各说各的，没有一句带「线」字；问到的人的话不随时间变（线正连着他时也不变）；
//    名字标在画面上、标在灰的城那一段之外；点画面上的人＝问那个人，点空地不变
// ⑥ 哲学家那句话：线第一次到书（第 10 环开始）之前不出现，之后一直在
// ⑦ REDUCE=1：线永远是直的、不透明、两头都有圈，不伸不垂
// 变异（自检用）：MUT=1..8 各弄坏一处，这个文件必须以非 0 退出。跑法见文件末尾注释。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("L(0, 760, W, 760);", "L(0, 760 + (clock() % 2), W, 760);");
if (MUT === '2') swap("ctx.globalAlpha = alpha; ctx.stroke();", "ctx.globalAlpha = alpha; ctx.stroke(); ctx.beginPath(); ctx.moveTo(NODES[0].at[0], NODES[0].at[1]); ctx.lineTo(NODES[1].at[0], NODES[1].at[1]); ctx.stroke();");
if (MUT === '3') swap("b = NODES[k + 1].at", "b = NODES[(k + 2) % NODES.length].at");
if (MUT === '4'){ swap("const clock = () => (performance.now() - T0) / 1000;", "let HOLD = 0; const clock = () => (performance.now() - T0) / 1000 - HOLD;"); swap("asked = (asked + 1) % ASK.length;", "asked = (asked + 1) % ASK.length; HOLD += .05;"); }
if (MUT === '5') swap("ASK[asked].name + '：' + ASK[asked].says", "ASK[asked].name + '：' + (NODES[linkAt(t)].name === ASK[asked].name ? '「有根线。」' : ASK[asked].says)");
if (MUT === '6') swap("t >= (NODES.length - 2) * D ? PHIL : START", "PHIL");
if (MUT === '7') swap("if (still || (u >= SHOOT && u < TAUT))", "if (u >= SHOOT && u < TAUT)");
if (MUT === '8') swap("{ name: '马',     at: [1486, 590] },\n    { name: '鹧鸪',   at: [1240, 170] },", "{ name: '鹧鸪',   at: [1240, 170] },\n    { name: '马',     at: [1486, 590] },");

function hook(a, b){ if (!inline.includes(a)) throw new Error('hook point missing: ' + a); inline = inline.replace(a, b); }
hook("let asked = -1, st = null;", "let asked = -1, st = null; global.__T = { NODES, ASK, D, get redraw(){ return st.redraw; } };");
hook("    grey(ctx);\n    thread(ctx, t);", "    ctx.__mark('g0'); grey(ctx); ctx.__mark('g1'); thread(ctx, t); ctx.__mark('t1');");

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, LAMP = '--lamp';
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { calls.push([String(k), a]); return { addColorStop(){} }; };
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
let NOW = 7000, tickFn = null, timers = 0;
global.window = { matchMedia: () => ({ matches: REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
global.setInterval = f => { tickFn = f; timers++; return timers; };
global.clearInterval = () => { tickFn = null; };
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T, N = T.NODES, D = T.D, LINKS = N.length - 1;
const START_MS = NOW;
const tNow = () => (NOW - START_MS) / 1000;
const ALLOWED = new Set(['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'arc', 'stroke', 'fill', 'fillRect', 'strokeRect', 'fillText', 'createLinearGradient', '__mark']);
const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
const nodeAt = p => N.findIndex(n => same(n.at, p));

// Read one frame, cut into: before the grey city / the grey city / the thread.
function frame(){
  calls = []; T.redraw();
  const i0 = calls.findIndex(c => c[0] === '__mark' && c[1][0] === 'g0'), i1 = calls.findIndex(c => c[0] === '__mark' && c[1][0] === 'g1'), i2 = calls.findIndex(c => c[0] === '__mark' && c[1][0] === 't1');
  if (i0 < 0 || i1 < i0 || i2 < i1) throw new Error('frame markers missing');
  const pre = calls.slice(0, i0), grey = calls.slice(i0 + 1, i1), thr = calls.slice(i1 + 1, i2);
  const f = { greyKey: JSON.stringify(grey), greyN: grey.length, labels: pre.filter(c => c[0] === 'fillText').map(c => c[1][0]),
    greyTexts: grey.filter(c => c[0] === 'fillText').length, unknown: calls.filter(c => c[0][0] !== '=' && !ALLOWED.has(c[0])).map(c => c[0]),
    moves: [], end: null, kind: null, arcs: [], colors: new Set(), alphas: [], strokes: 0, after: calls.length - i2 - 1 };
  let alpha = 1;
  thr.forEach(c => {
    const [k, a] = c;
    if (k === '=globalAlpha') alpha = a;
    else if (k === '=strokeStyle' || k === '=fillStyle') f.colors.add(a);
    else if (k === 'moveTo') f.moves.push([a[0], a[1]]);
    else if (k === 'lineTo'){ f.end = [a[0], a[1]]; f.kind = 'line'; }
    else if (k === 'quadraticCurveTo'){ f.end = [a[2], a[3]]; f.kind = 'curve'; f.sag = a[1]; }
    else if (k === 'arc') f.arcs.push([a[0], a[1]]);
    else if (k === 'stroke'){ f.strokes++; f.alphas.push(alpha); }
    else if (k === 'fill' || k === 'fillRect' || k === 'fillText' || k === 'strokeRect') f.colors.add('!' + k);
  });
  return f;
}
// What the thread is doing in this frame, and whether that is allowed.
function readThread(f, k){
  const a = N[k].at, b = N[k + 1].at, bad = [];
  if (f.moves.length !== 1) bad.push('moveTo ' + f.moves.length + ' 个');
  if (f.colors.size !== 1 || !f.colors.has(LAMP)) bad.push('颜色 ' + [...f.colors].join(','));
  if (!f.moves[0] || !same(f.moves[0], a)) bad.push('起点不在第 ' + k + ' 环');
  let reach = 'full';
  if (!f.end) bad.push('没有另一头');
  else if (!same(f.end, b)){
    reach = 'part';
    const dx = b[0] - a[0], dy = b[1] - a[1], ex = f.end[0] - a[0], ey = f.end[1] - a[1];
    const cross = Math.abs(dx * ey - dy * ex), along = (ex * dx + ey * dy) / (dx * dx + dy * dy);
    if (f.kind !== 'line' || cross > 1e-6 || along < -1e-9 || along > 1 + 1e-9) bad.push('另一头不在去第 ' + (k + 1) + ' 环的线上');
  }
  const okArcs = f.arcs.length >= 1 && f.arcs.length <= 2 && same(f.arcs[0], a) && (f.arcs.length === 1 || same(f.arcs[1], b));
  if (!okArcs) bad.push('圈 ' + f.arcs.length + ' 个或圈错了地方');
  if (f.strokes !== 1 + f.arcs.length) bad.push('笔数 ' + f.strokes);
  if (!f.alphas.every(x => x > 0 && x <= 1)) bad.push('透明度 ' + f.alphas.join(','));
  if (f.after !== 0) bad.push('线之后还画了 ' + f.after + ' 笔');
  return { bad, reach, kind: f.kind, alpha: f.alphas[0], arcs: f.arcs.length, sig: [k, f.kind, reach, f.arcs.length, (f.alphas[0] || 0).toFixed(6), f.end ? f.end.map(v => v.toFixed(4)).join(',') : '', f.kind === 'curve' ? f.sag.toFixed(4) : ''].join('|') };
}
const cap = () => el('caption').textContent, moral = () => el('moral').textContent, meter = () => el('meter').textContent;
const press = () => handlers['ask:click']();
const tap = (x, y) => handlers['c:click']({ clientX: x / W * 800, clientY: y / H * 500 });
const expectK = t => Math.floor(t / D) % LINKS;

// ③ the chain is the book's
const BOOK = ['孩子', '狗', '瓦匠', '女招待', '伞匠', '贵夫人', '军官', '马', '鹧鸪', '画家', '书'];
check(N.length === 11 && N.every((n, i) => n.name === BOOK[i]), '③ 链上十一环的名字和次序跟书里那句话一样: ' + N.map(n => n.name).join('→'));
check(D >= 1 && D <= 3, '每环 ' + D + ' 秒');

// start
const f0 = frame();
const GREY = f0.greyKey;
check(f0.greyN > 150 && f0.greyTexts === 0, '灰的城这一段有 ' + f0.greyN + ' 个绘图调用，里面没有字');
check(/孩子.*狗/.test(cap()) && /不等人/.test(moral()) && !/哲学家/.test(moral()) && meter() === '还没问过谁', '开头的字: ' + cap() + ' / ' + meter());
check(f0.labels.length === 0 && tickFn !== null && timers === 1, '开头画面上没有名字；计时器起了一个');

let frames = 0, greyBad = [], thrBad = [], unknown = new Set();
const CAPS = [/孩子.*狗/, /狗.*瓦匠/, /瓦匠.*女招待/, /女招待.*伞匠/, /伞匠.*贵夫人/, /贵夫人.*军官/, /军官.*马/, /马.*鹧鸪/, /鹧鸪.*画家/, /画家.*书/];
// Walk the clock; audit every frame; return what the thread did, frame by frame.
function walk(sec, tag, each){
  const out = [];
  for (let i = 0; i < Math.round(sec * 10); i++){
    NOW += 100; if (each) each(i); if (tickFn) tickFn();
    const t = tNow(), k = expectK(t), f = frame(); frames++;
    if (f.greyKey !== GREY) greyBad.push(tag + ' t=' + t.toFixed(2));
    f.unknown.forEach(u => unknown.add(u));
    const r = readThread(f, k);
    if (r.bad.length) thrBad.push(tag + ' t=' + t.toFixed(2) + ' k=' + k + ' ' + r.bad.join('；'));
    out.push({ t, k, r, cap: cap(), moral: moral(), meter: meter(), labels: f.labels });
  }
  return out;
}
NOW -= 50;                                   // so samples land at 0.05, 0.15, …: between link boundaries, never on one
const lap1 = walk(LINKS * D, '第一圈');
const lap2 = walk(LINKS * D, '第二圈');
const both = lap1.concat(lap2);

// ③ order and pace
const runs = []; both.forEach(s => { const last = runs[runs.length - 1]; if (last && last.k === s.k) last.n++; else runs.push({ k: s.k, n: 1 }); });
check(runs.length === 2 * LINKS && runs.every((r, i) => r.k === i % LINKS && r.n === Math.round(D * 10)), '③ 两圈里线依次走过 ' + runs.map(r => r.k).join(' ') + '，每环 ' + [...new Set(runs.map(r => r.n))].join('/') + ' 帧');
check(both.every(s => CAPS[s.k].test(s.cap)), '③ 每一环的 caption 说的就是那两环的事（第 1 环: ' + lap1[0].cap + '）');

// ② one thread, adjacent links only
check(thrBad.length === 0, '② ' + frames + ' 帧里每帧正好一根线、只连相邻两环' + (thrBad.length ? '；出错 ' + thrBad.length + ' 帧，第一帧: ' + thrBad[0] : ''));
if (!REDUCE){
  const kinds = new Set(lap1.map(s => s.r.kind + '/' + s.r.reach));
  check(kinds.has('line/part') && kinds.has('line/full') && kinds.has('curve/full'), '一环里线先伸出去、绷直、再垂下来松开（见到 ' + [...kinds].join(' ') + '）');
  const slack = lap1.filter(s => s.r.kind === 'curve');
  check(slack.every(s => s.r.alpha < 1) && lap1.filter(s => s.r.kind === 'line').every(s => s.r.alpha === 1), '绷着的时候不透明，松开的时候在变淡（最淡 ' + Math.min(...slack.map(s => s.r.alpha)).toFixed(2) + '，从不为 0）');
  check(lap1.filter(s => s.r.reach === 'part').every(s => s.r.arcs === 1) && lap1.filter(s => s.r.reach === 'full').every(s => s.r.arcs === 2), '线还没到的时候只圈出发的那一环，到了才圈两环');
} else {
  check(both.every(s => s.r.kind === 'line' && s.r.reach === 'full' && s.r.alpha === 1 && s.r.arcs === 2), '⑦ 减少动效：' + both.length + ' 帧里线都是直的、不透明、两头有圈');
}

// ⑥ the philosopher
const firstPhil = both.findIndex(s => /哲学家/.test(s.moral));
check(firstPhil >= 0 && both[firstPhil].k === LINKS - 1 && both.slice(0, firstPhil).every(s => s.k < LINKS - 1 && /不等人/.test(s.moral)), '⑥ 哲学家那句话在线第一次到书的那一环才出现（t=' + (firstPhil >= 0 ? both[firstPhil].t.toFixed(2) : '无') + '）');
check(firstPhil >= 0 && both.slice(firstPhil).every(s => /她自己不知道/.test(s.moral)), '⑥ 之后一直在，第二圈回到孩子时也在');
check(both.every(s => s.meter === '还没问过谁' && s.labels.length === 0), '没问人的两圈里，meter 和画面上的名字都没动过');

// ⑤ asking
const A = T.ASK, seen = [];
for (let i = 0; i < A.length; i++){ press(); const f = frame(); seen.push({ meter: meter(), labels: f.labels, grey: f.greyKey === GREY }); }
check(A.length === 10 && seen.every((s, i) => s.meter === A[i].name + '：' + A[i].says), '⑤ 十个人轮着问: ' + seen.map(s => s.meter.split('：')[0]).join('、'));
check(new Set(A.map(a => a.name)).size === 10 && A.every(a => !/线/.test(a.says) && !/线/.test(a.name)), '⑤ 十个人各说各的，没有一句带「线」字');
check(seen.every((s, i) => s.labels.length === 1 && s.labels[0] === A[i].name && s.grey), '⑤ 问到谁，谁的名字标在画面上（标在灰的城那一段之外，灰的城没变）');
press(); check(meter() === A[0].name + '：' + A[0].says, '⑤ 第十一下回到第一个人');
press(); press(); press();                                    // now asking the mason (index 3), who is on the chain
check(meter().startsWith('瓦匠：'), '问到瓦匠: ' + meter());
const said = meter(), lap3 = walk(LINKS * D, '问着瓦匠的一圈');
const touched = lap3.filter(s => s.k === 1 || s.k === 2).length;
check(touched === 2 * Math.round(D * 10) && lap3.every(s => s.meter === said && s.labels.length === 1 && s.labels[0] === '瓦匠'), '⑤ 线连着瓦匠的 ' + touched + ' 帧里，他说的还是那一句: ' + said);

// ④ no holding it: hammer the button and the picture for a whole lap
let n = 0;
const lap4 = walk(LINKS * D, '狂按的一圈', i => { press(); n++; if (i % 3 === 0){ tap(1150, 684); n++; } if (i % 7 === 0){ tap(800, 60); n++; } });
const sig = l => l.map(s => s.r.sig).join('\n');
check(sig(lap4) === sig(lap1) && sig(lap3) === sig(lap1), '④ 按了、点了 ' + n + ' 下的一圈，线逐帧跟没人碰的那一圈一样（' + lap4.length + ' 帧）');

// ⑤ tapping the picture
tap(1150, 684); const fl = frame();
check(meter().startsWith('贵夫人：') && fl.labels[0] === '贵夫人', '⑤ 点画面上的贵夫人＝问她: ' + meter());
const before = meter(); tap(800, 60);
check(meter() === before, '⑤ 点空地，问的人不变');

// ① over every frame seen
check(greyBad.length === 0 && unknown.size === 0, '① ' + frames + ' 帧里灰的城都是同一串调用' + (greyBad.length ? '；变了 ' + greyBad.length + ' 帧，第一帧: ' + greyBad[0] : '') + (unknown.size ? '；不认识的方法 ' + [...unknown].join(',') : ''));

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 变异自检：for m in 1 2 3 4 5 6 7 8; do MUT=$m node tests/raissa_test.js cities/raissa.html shared.js >/dev/null; echo "MUT=$m exit=$?"; done
// （MUT=7 要配 REDUCE=1 才抓得到，它弄坏的是减少动效那条路。）
