// 无头跑 chloe.html：桩掉 DOM/canvas，假时钟；测试侧注入只读钩子（页面本身不带）。
// 11-27 补：手工变异 13 个只抓到 4 个——原来只读变量。现在假画布录每一笔（颜色用 CSS 变量名区分），读：目光的线是不是连在图形里那几个人之间、
// 会不会褪，被看的人亮、开过口的人灰，开口那对中间写的字，木马停了画面上真不转；另核开口找的是最近的人、三对故事不一样。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function ui(){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { advance, get people(){ return people; }, get shapes(){ return shapes; }, get made(){ return made; }, get pairs(){ return pairs; }, rate, redraw: () => st.redraw() };\n  ' + hook);

function boot(reduce){
  const els = {}, handlers = {};
  function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false,
    addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
    getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
  const rec = [];
  const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} }); return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); rec.push({ op: String(k), a, stroke: t.strokeStyle, fill: t.fillStyle, alpha: t.globalAlpha, lw: t.lineWidth }); if (rec.length > 200000) rec.splice(0, 100000); }; }, set(t, k, v){ t[k] = v; return true; } });
  let fake = 1000;
  global.window = { matchMedia: () => ({ matches: reduce }), addEventListener(){}, devicePixelRatio: 1 };
  global.document = { getElementById: el, documentElement: {}, fonts: null };
  global.getComputedStyle = () => ({ getPropertyValue: k => k });
  global.performance = { now: () => fake * 1000 };
  global.requestAnimationFrame = () => {};
  global.setTimeout = () => 1; global.clearTimeout = () => {};
  eval(shared); global.SC = window.SC;
  eval(src);
  const T = global.__T;
  return { el, handlers, T, frame(){ T.redraw(); const i = rec.map(r => r.op === 'fillRect' && r.a[0] === 0 && r.a[1] === 0 && r.a[2] === 1600).lastIndexOf(true); return rec.slice(i); }, run(sec){ for (let t = 0; t < sec; t += .05){ fake += .05; T.advance(fake); } }, now: () => fake };
}
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const NEED = { '三角形': [3, 3], '箭头': [4, 3], '星形': [5, 5] };
// reading a frame
const glances = (f, P) => { const out = []; for (let k = 0; k + 1 < f.length; k++){ const m = f[k], l = f[k + 1]; if (m.op === 'moveTo' && l.op === 'lineTo' && m.stroke === '--lamp' && P.some(p => p.x === m.a[0] && p.y - 38 === m.a[1])) out.push({ a: P.findIndex(p => p.x === m.a[0] && p.y - 38 === m.a[1]), b: P.findIndex(p => p.x === l.a[0] && p.y - 38 === l.a[1]), alpha: m.alpha }); } return out; };
const figColour = (f, p) => { const i = f.findIndex(r => r.op === 'translate' && r.a[0] === p.x && r.a[1] === p.y); const s = f.slice(i).find(r => r.op === 'stroke'); return i < 0 || !s ? '?' : s.stroke; };
const horses = f => JSON.stringify(f.filter(r => r.op === 'arc' && r.a[2] === 9 && r.fill === '--lamp').map(r => [r.a[0].toFixed(3), r.a[1].toFixed(3)]));

const A = boot(false);
let shapeOk = true; const seen = new Set();
for (let s = 0; s < 400; s++){ A.run(.05); for (const sh of A.T.shapes){ const k = sh.at + sh.name + sh.who.join(); if (seen.has(k)) continue; seen.add(k);
  const [nw, ne] = NEED[sh.name]; if (sh.who.length !== nw || new Set(sh.who).size !== nw || sh.edges.length !== ne) shapeOk = false; } }
const m0 = A.T.made;
check(m0 >= 25 && m0 <= 32, '20 秒全速拼出 ' + m0 + ' 个图形（约每 0.7 秒一个）');
check(A.el('meter').textContent.startsWith('目光拼出的图形 ' + m0 + ' 个'), '计数随拼出的图形实时更新: ' + A.el('meter').textContent);
check(shapeOk, '每个图形人数/连线数对得上（三角 3/3、箭头 4/3、星形 5/5）');
{
  const f = A.frame(), P = A.T.people, g = glances(f, P), want = A.T.shapes.flatMap(s => s.edges);
  const drawnOk = want.length > 0 && g.length === want.length && want.every(([a, b]) => g.some(x => x.a === a && x.b === b));
  check(drawnOk, '画面：目光的线正好连在图形里的人之间（' + g.length + ' 条 / 应 ' + want.length + ' 条）');
  check(g.some(x => x.alpha < .8) && g.every(x => x.alpha <= .85 + 1e-9), '画面：旧一点的目光在褪（透明度 ' + g.map(x => x.alpha.toFixed(2)).join(' ') + '）');
  const inShape = new Set(A.T.shapes.flatMap(s => s.who));
  check(P.every((p, i) => figColour(f, p) === (inShape.has(i) ? '--lamp' : '--ink')), '画面：被看的人亮、其余是墨色');
  const h1 = horses(f); A.run(.5); check(horses(A.frame()) !== h1, '画面：木马在转（半秒后小马挪了位置）');
}

const pre = A.T.people.map(p => [p.x, p.y]);
A.handlers['speak:click']();
const p1 = A.T.pairs[0];
check(A.T.pairs.length === 1 && A.T.people[p1[0]].spoke === 0 && A.T.people[p1[1]].spoke === 0 && p1[0] !== p1[1], '第一对开口: ' + p1.slice(0, 2).join('+') + ' ' + p1[2]);
{
  const [i, j] = p1, d = k => Math.hypot(pre[k][0] - pre[i][0], pre[k][1] - pre[i][1]);
  const near = A.T.people.map((p, k) => k).filter(k => k !== i && (A.T.people[k].spoke === null || k === j)).sort((a, b) => d(a) - d(b))[0];
  check(near === j, '开口找的是离他最近的那个人（' + j + '，最近 ' + near + '）');
  const f = A.frame(), P = A.T.people, wd = f.find(r => r.op === 'fillText' && r.a[0] === p1[2]);
  check(figColour(f, P[i]) === '--dim' && figColour(f, P[j]) === '--dim', '画面：开过口的两个人变灰');
  check(wd && wd.fill === '--dim' && Math.abs(wd.a[1] - (P[i].x + P[j].x) / 2) < 1, '画面：两人中间写着「' + p1[2] + '」');
}
const before = A.T.made; let leak = false;
for (let s = 0; s < 400; s++){ A.run(.05); if (A.T.shapes.some(sh => sh.who.some(i => A.T.people[i].spoke !== null))) leak = true; }
const slowed = A.T.made - before;
check(!leak, '木马还在转时，开过口的那对不进任何新图形');
check(slowed >= 17 && slowed <= 22, '一对开口后 20 秒只拼出 ' + slowed + ' 个（全速约 28，应约 2/3）');

const pos = () => A.T.people.filter(p => p.spoke !== null).map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
const tgt = A.T.people.findIndex(p => p.spoke === null);
A.handlers['c:click']({ clientX: A.T.people[tgt].x, clientY: A.T.people[tgt].y - 20 });
check(A.T.pairs.length === 2 && A.T.pairs[1][0] === tgt, '点画布上的人，开口的就是他');
A.handlers['speak:click']();
check(A.T.pairs.length === 3 && A.T.rate() === 0 && A.el('speak').disabled, '第三对开口：旋转木马停、按钮禁用');
check(A.el('moral').textContent.startsWith('第三对人开口'), 'DONE 出现');
check(A.T.pairs.map(p => p[2]).join('') === '追求误会谎话', '三对之间是三段不同的故事: ' + A.T.pairs.map(p => p[2]).join('、'));
const hStop = horses(A.frame());
check(/开过口的 6 人 · 旋转木马 停了/.test(A.el('meter').textContent), 'meter: ' + A.el('meter').textContent);
const stopped = pos(), m3 = A.T.made; let spokeInShape = false;
for (let s = 0; s < 200; s++){ A.run(.1); if (A.T.shapes.some(sh => sh.who.some(i => A.T.people[i].spoke !== null))) spokeInShape = true; }
check(A.T.made === m3, '停了以后再过 20 秒，一个图形都没有新拼出');
check(!spokeInShape, '开过口的人不再出现在任何图形里');
check(pos() === stopped, '开过口的人站着不动');
check(horses(A.frame()) === hStop && glances(A.frame(), A.T.people).length === 0, '画面：停了以后小马一动不动、一条目光都没有');
A.handlers['speak:click'](); check(A.T.pairs.length === 3, '停了以后再按不会多出第四对');
A.handlers['reset:click']();
check(A.T.pairs.length === 0 && A.T.made === 0 && !A.el('speak').disabled && A.T.rate() === 1, 'reset');

const B = boot(true);
check(B.T.shapes.length > 0 && B.T.made > 0, 'reduce 模式开场就有看得见的图形: ' + B.T.shapes.length + ' 个');
B.handlers['reset:click']();
check(B.T.shapes.length > 0, 'reduce 模式 reset 后也有');
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
