// 无头跑 ipazia.html：桩掉 DOM/canvas（含 createElement / querySelectorAll）；测试侧注入只读钩子。
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
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} }); return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); }; }, set(t, k, v){ t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null),
  querySelectorAll: sel => sel === '#wants button' ? el('wants').children : [] };
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
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

check(el('wants').children.length === 4 && el('places').children.length === 8, '4 个想要、8 个地方的按钮都生成了');
go('stables'); check(T.learned.size === 0 && el('caption').textContent === '先选一件你想要的。', '没选想要时去哪都不算');

// Wrong (obvious) place: not learned, and someone points to the real one.
want('beauty'); go('garden');
check(!T.learned.has('beauty') && T.pointed && T.pointed[0] === 'garden' && T.pointed[1] === 'stables', '去显然的地方扑空，有人指向马厩');
check(el('wants').children.find(b => b.dataset.want === 'beauty').attrs['aria-pressed'] === 'true', '当前选的想要标成按下');
go('cemetery'); check(!T.learned.has('beauty') && T.pointed === null && /没有你要找的/.test(el('caption').textContent), '去不相干的地方：没有，也没人指路');
go('stables'); check(T.learned.has('beauty') && T.mark.ok, '去马厩：找到了，学会一个');

// Canvas click maps to the nearest place.
want('wise'); const pg = T.PLACES.find(p => p.id === 'playground');
el('c').handlers.click({ clientX: pg.x + 20, clientY: pg.y - 10 });
check(T.learned.has('wise'), '点画布上的游乐园＝去游乐园');
want('music'); go('cemetery'); check(T.learned.has('music'), '墓地有音乐');

// Leaving: harbour fails; tower "works" but no ship ever comes.
want('leave'); go('harbour'); check(!T.learned.has('leave') && T.pointed[1] === 'tower', '码头走不了，有人指向塔');
for (let i = 0; i < 5; i++) go('tower');
check(T.learned.has('leave') && T.waited === 5 && T.ships === 0, '塔上等了 5 次，船 0 艘');
check(/学会了 4 \/ 4 · 塔上等过 5 次 · 船 0 艘/.test(meter()), 'meter: ' + meter());
check(el('moral').textContent.startsWith('你会说伊帕奇亚的话了'), 'DONE');

// The language is fixed: after reset, the same answers again.
el('reset').handlers.click();
check(meter() === '学会了 0 / 4 · 塔上等过 0 次 · 船 0 艘', 'reset');
const table = {};
for (const w of T.WANTS){ want(w.id); for (const p of T.PLACES){ go(p.id); if (T.mark.ok) (table[w.id] = table[w.id] || []).push(p.id); } }
check(JSON.stringify(table) === JSON.stringify({ beauty: ['stables'], wise: ['playground'], music: ['cemetery'], leave: ['tower'] }), '每件想要恰好一个对的地方、跟 reset 前一样: ' + JSON.stringify(table));
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
