// 无头跑 ersilia.html：桩掉 DOM/canvas，时钟可拨，测试侧注入只读钩子。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { LIMIT, DUR, GROUND, HOUSES, KINDS, tie, crowd, year, step, houseAt, tap, slot, get city(){ return city; }, get ruins(){ return ruins; }, get leaving(){ return leaving; }, get picked(){ return picked; }, get st(){ return st; } };\n  ' + hook);
const els = {}; let log = [];
function mk(id){ return { id, textContent: '', disabled: false, dataset: {}, attrs: {}, style: {}, children: [], handlers: {}, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ this.handlers[ev] = f; }, appendChild(c){ this.children.push(c); }, setAttribute(k, v){ this.attrs[k] = v; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }; }
function el(id){ return els[id] || (els[id] = mk(id)); }
const kindBtns = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); log.push(String(k) + '(' + a.map(v => typeof v === 'number' ? v.toFixed(1) : String(v)).join(',') + ')|' + t.strokeStyle + '|' + t.globalAlpha); }; },
  set(t, k, v){ t[k] = v; return true; } });
let NOW = 1000000;
global.window = { matchMedia: () => ({ matches: !!process.env.REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), createTextNode: t => ({ t }), querySelectorAll: () => [] };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
eval(src);
const T = global.__T;
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const at = s => { NOW = s * 1000; };
const frame = () => { log = []; T.st.redraw(); return log.slice(); };
const canvas = el('c'), meter = () => el('meter').textContent, cap = () => el('caption').textContent;
// world → screen (canvas shown at 800x500, world is 1600x1000)
const press = (x, y) => canvas.handlers.pointerdown({ clientX: x / 2, clientY: y / 2 });
const pressHouse = i => { const h = T.city.houses[i]; press(h.x, T.GROUND - h.h / 2); };
const finish = () => { at(NOW / 1000 + T.DUR + .01); frame(); };

at(1000);
check(T.city.cords.length === 0 && /绳 0 根/.test(meter()) && /旧艾尔西里亚 0 座/.test(meter()), '开头：0 根绳，0 座旧城：' + meter());
const hs = T.city.houses;
check(hs.length === 7 && hs.every((h, i) => i === 0 || h.x - h.w / 2 > hs[i - 1].x + hs[i - 1].w / 2) && hs[0].x - hs[0].w / 2 > 0 && hs[6].x + hs[6].w / 2 < 1600, '七座房子不重叠、都在画面里');

pressHouse(1); check(T.picked === 1 && /第 2 家/.test(cap()), '点第 2 家：选中');
pressHouse(4); check(T.city.cords.length === 1 && T.picked === null && /黑绳：第 2 家和第 5 家是亲戚/.test(cap()), '再点第 5 家：拉上一根黑绳（默认亲缘，中译本顺序）');
const cd = T.city.cords[0];
check(Math.abs(cd.a[0] - (hs[1].x + hs[1].w / 2)) < .01 && Math.abs(cd.b[0] - (hs[4].x - hs[4].w / 2)) < .01, '绳挂在两家相对的那面墙上');
pressHouse(4); pressHouse(1); check(T.city.cords.length === 1 && /已经有这种绳/.test(cap()), '反过来再拉同一种：不重复');
el('kinds').children[1].handlers.click(); pressHouse(4); pressHouse(1);
check(T.city.cords.length === 2 && T.city.cords[1].kind === 1 && /白绳.*做买卖/.test(cap()), '换成交易再拉同一对：多一根白绳');
pressHouse(3); pressHouse(3); check(T.picked === null && T.city.cords.length === 2, '同一家点两次：取消');
press(800, 100); check(T.picked === null, '点天空：什么都不选');

// crowd: both cords span houses 2..5 → 2 overhead there
check(T.crowd() === 2, '最挤处 2 根：' + T.crowd());
// the posts stay; the houses leave
const f1 = frame();
check(f1.some(l => l.startsWith('quadraticCurveTo')), '画面里画了绳');

// years until it is crowded
const R = process.env.REDUCE, gen0 = T.city.gen; let before = 0;
const live = () => !T.leaving && T.ruins.length === 0;
let guard = 0; while (live() && guard++ < 40){ before = T.city.cords.length; el('year').handlers.click(); }
if (!R){
  before = T.city.cords.length;
  check(!!T.leaving && T.crowd() >= T.LIMIT && el('year').disabled, '一年年过去，最挤处到 ' + T.LIMIT + ' 根：开始搬，按钮停了（' + guard + ' 年）');
  pressHouse(0); check(/正在搬/.test(cap()) && T.city.cords.length === before, '搬的时候点房子：不拉绳');
} else { before = T.ruins[0].cords.length; check(T.ruins.length === 1 && guard < 10 && T.crowd(T.ruins[0]) >= T.LIMIT, '减少动效：挤满的那一下直接搬完（' + guard + ' 年）'); }
if (!process.env.REDUCE){
  at(NOW / 1000 + T.DUR * .3); const mid = frame();
  const houseFills = mid.filter(l => l.startsWith('fill()')).length;
  check(T.leaving && mid.some(l => l.startsWith('translate(0.0,-') ), '搬到一半：房子在往上抬走');
  finish();
}
check(!T.leaving && T.ruins.length === 1 && T.ruins[0].cords.length === before && T.city.gen === gen0 + 1 && T.city.cords.length === 0, '搬完：平原上一座旧城，绳全留在它那里；新城 0 根绳');
check(/旧艾尔西里亚 1 座/.test(meter()) && /更复杂，也更规整/.test(el('moral').textContent) && !el('year').disabled, '计数 1 座，第二段话出来，按钮恢复');
const f2 = frame();
const ruinScale = f2.find(l => l.startsWith('scale(0.2,0.2)'));
check(!!ruinScale, '旧城按 0.22 缩到远处平原上画');
// the old web keeps its posts but no houses: count house fills ("fill()" after moveTo 5-pt) is only the new city's
check(T.ruins[0].posts.length > 0, '旧城留着柱子：' + T.ruins[0].posts.length + ' 根');
check(JSON.stringify(T.city.houses.map(h => Math.round(h.x))) !== JSON.stringify(hs.map(h => Math.round(h.x))), '第二座城的房子跟第一座摆法不一样');

// two more
for (let k = 0; k < 2; k++){ const n0 = T.ruins.length; guard = 0; while (!T.leaving && T.ruins.length === n0 && guard++ < 40) el('year').handlers.click(); if (!R) finish(); }
check(T.ruins.length === 3 && /只剩一张张关系的网/.test(el('moral').textContent), '丢下三座：第三段话');
const slots = T.ruins.map(r => r.at.x + ',' + r.at.y);
check(new Set(slots).size === 3, '三座旧城各占一个位置');
// determinism: reset and replay gives the same first-city cords
el('reset').handlers.click();
check(T.ruins.length === 0 && T.city.gen === 0 && T.city.cords.length === 0 && /旧艾尔西里亚 0 座/.test(meter()), '重来：回到第 1 座');
console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
