// 无头跑 ipazia.html：桩掉 DOM/canvas（含 createElement / querySelectorAll）；测试侧注入只读钩子。
// 11-27 补：手工变异 13 个只抓到 2 个——原来只读页面里的变量，画面一笔没看。现在假画布录下每一笔（颜色用 CSS 变量名区分），
// 读：指路的虚线从哪到哪、找到的地方名字亮不亮、去过的地方圈没圈、塔上等过有没有空海平线；说明文字对不对；只有当前那件想要按下。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { PLACES, WANTS, get learned(){ return learned; }, get waited(){ return waited; }, get ships(){ return ships; }, get pointed(){ return pointed; }, get mark(){ return mark; } };\n  ' + hook);

const els = {}, created = [];
function mk(id){ return { id, textContent: '', disabled: false, dataset: {}, attrs: {}, children: [], handlers: {},
  addEventListener(ev, f){ this.handlers[ev] = f; }, appendChild(c){ this.children.push(c); created.push(c); },
  setAttribute(k, v){ this.attrs[k] = v; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }; }
function el(id){ return els[id] || (els[id] = mk(id)); }
let rec = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} }); return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); rec.push({ op: String(k), a, fill: t.fillStyle, stroke: t.strokeStyle, dash: t.__dash || '', lw: t.lineWidth }); if (k === 'setLineDash') t.__dash = a[0].join(','); }; }, set(t, k, v){ t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null),
  querySelectorAll: sel => sel === '#wants button' ? el('wants').children : [] };
global.getComputedStyle = () => ({ getPropertyValue: k => k });
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};
global.setTimeout = () => 1; global.clearTimeout = () => {};
eval(shared); global.SC = window.SC;
eval(src);
const T = global.__T;
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const want = id => el('wants').children.find(b => b.dataset.want === id).handlers.click();
const go = id => el('places').children.find(b => b.dataset.place === id).handlers.click();
const meter = () => el('meter').textContent;
// what the last draw put on screen
const frame = () => { const i = rec.map(r => r.op === 'fillRect' && r.a[0] === 0 && r.a[1] === 0 && r.a[2] === 1600).lastIndexOf(true); return rec.slice(i); };
const pointer = () => { const f = frame(), m = f.find(r => r.op === 'moveTo' && r.dash === '12,10'), l = f.find(r => r.op === 'lineTo' && r.dash === '12,10' && r.stroke === '--lamp'); return m && l ? [m.a[0], m.a[1], l.a[0], l.a[1]] : null; };
const at = id => T.PLACES.find(p => p.id === id);
const lineIs = (from, to) => JSON.stringify(pointer()) === JSON.stringify([at(from).x, at(from).y, at(to).x, at(to).y]);
const nameColour = id => (frame().find(r => r.op === 'fillText' && r.a[0] === at(id).name) || {}).fill;
const ring = id => { const f = frame(), i = f.findIndex(r => r.op === 'translate' && r.a[0] === at(id).x && r.a[1] === at(id).y), s = f.slice(i).find(r => r.op === 'stroke'); return s ? s.stroke + '/' + s.lw : '?'; };
const lit = () => T.PLACES.filter(p => nameColour(p.id) === '--lamp').map(p => p.id);
const horizon = () => frame().some(r => r.op === 'moveTo' && r.a[0] === 1200 && r.a[1] === 960);
const pressed = () => el('wants').children.filter(b => b.attrs['aria-pressed'] === 'true').map(b => b.dataset.want);

check(el('wants').children.length === 4 && el('places').children.length === 8, '4 个想要、8 个地方的按钮都生成了');
go('stables'); check(T.learned.size === 0 && el('caption').textContent === '先选一件你想要的。', '没选想要时去哪都不算');

// Wrong (obvious) place: not learned, and someone points to the real one.
want('beauty'); go('garden');
check(!T.learned.has('beauty') && T.pointed && T.pointed[0] === 'garden' && T.pointed[1] === 'stables', '去显然的地方扑空，有人指向马厩');
check(lineIs('garden', 'stables') && /螃蟹/.test(el('caption').textContent), '画面：一条虚线从湖边花园指到马厩；说明是水底的螃蟹');
check(ring('garden') === '--dim/4' && lit().length === 0, '画面：湖边花园圈出来（灰），没有哪个地方亮');
check(el('wants').children.find(b => b.dataset.want === 'beauty').attrs['aria-pressed'] === 'true', '当前选的想要标成按下');
go('cemetery'); check(!T.learned.has('beauty') && T.pointed === null && /没有你要找的/.test(el('caption').textContent), '去不相干的地方：没有，也没人指路');
go('stables'); check(T.learned.has('beauty') && T.mark.ok, '去马厩：找到了，学会一个');
check(JSON.stringify(lit()) === '["stables"]' && ring('stables') === '--lamp/4' && pointer() === null && /马粪/.test(el('caption').textContent), '画面：只有马厩亮、圈成灯色，指路线没了；说明是马粪那句');

// Canvas click maps to the nearest place.
want('wise'); const pg = T.PLACES.find(p => p.id === 'playground');
el('c').handlers.click({ clientX: pg.x + 20, clientY: pg.y - 10 });
check(T.learned.has('wise'), '点画布上的游乐园＝去游乐园');
want('music'); go('cemetery'); check(T.learned.has('music'), '墓地有音乐');
check(el('moral').textContent.startsWith('再学一个'), '学会 3 个还没到 DONE: ' + el('moral').textContent.slice(0, 12));
check(!horizon(), '还没上过塔：没有海平线');

// Leaving: harbour fails; tower "works" but no ship ever comes.
want('leave'); go('harbour'); check(!T.learned.has('leave') && T.pointed[1] === 'tower', '码头走不了，有人指向塔');
check(lineIs('harbour', 'tower'), '画面：虚线从码头指到塔');
for (let i = 0; i < 5; i++) go('tower');
check(horizon() && JSON.stringify(lit()) === '["tower"]', '画面：塔亮了，远处一条空海平线');
check(T.learned.has('leave') && T.waited === 5 && T.ships === 0, '塔上等了 5 次，船 0 艘');
check(/学会了 4 \/ 4 · 塔上等过 5 次 · 船 0 艘/.test(meter()), 'meter: ' + meter());
check(el('moral').textContent.startsWith('你会说伊帕奇亚的话了'), 'DONE');

// The language is fixed: after reset, the same answers again.
el('reset').handlers.click();
check(meter() === '学会了 0 / 4 · 塔上等过 0 次 · 船 0 艘', 'reset');
const table = {};
for (const w of T.WANTS){ want(w.id); for (const p of T.PLACES){ go(p.id); if (T.mark.ok) (table[w.id] = table[w.id] || []).push(p.id); } }
check(JSON.stringify(table) === JSON.stringify({ beauty: ['stables'], wise: ['playground'], music: ['cemetery'], leave: ['tower'] }), '每件想要恰好一个对的地方、跟 reset 前一样: ' + JSON.stringify(table));

// After reset: no want chosen, so going anywhere asks you to pick one; choosing another want clears the pointing line.
el('reset').handlers.click();
go('garden'); check(el('caption').textContent === '先选一件你想要的。' && pressed().length === 0, 'reset 后没选想要：去哪都先叫你选，一个都没按下');
want('beauty'); go('garden'); check(lineIs('garden', 'stables'), 'reset 后重来：又有指路线');
want('music'); check(pointer() === null && ring('garden') === '--chalk/2', '换一件想要：指路线和圈都清掉');
check(JSON.stringify(pressed()) === '["music"]', '只有当前那件想要按下: ' + pressed().join(','));
go('square'); check(/风/.test(el('caption').textContent) && lineIs('square', 'cemetery'), '广场扑空：说明是风，虚线指向墓地');
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
