// 无头跑 zenobia.html：桩掉 DOM/canvas，记录每次绘图调用（含 strokeStyle/alpha），时钟可拨。测试侧注入只读钩子。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { EXTRAS, GROUND, RISE, box, hidden, fit, highest, founding, get layers(){ return layers; }, get dream(){ return dream; }, get asked(){ return asked; }, get anim(){ return anim; }, get st(){ return st; } };\n  ' + hook);

const els = {}; let log = [];
function mk(id){ return { id, textContent: '', disabled: false, dataset: {}, attrs: {}, children: [], handlers: {},
  addEventListener(ev, f){ this.handlers[ev] = f; }, appendChild(c){ this.children.push(c); }, setAttribute(k, v){ this.attrs[k] = v; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }; }
function el(id){ return els[id] || (els[id] = mk(id)); }
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); log.push(String(k) + '(' + a.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(',') + ')|' + t.strokeStyle + '|' + t.globalAlpha); }; },
  set(t, k, v){ t[k] = v; return true; } });
let NOW = 123456;
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), querySelectorAll: () => [] };
global.getComputedStyle = () => ({ getPropertyValue: n => n });   // palette colours come back as their own names
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
global.setTimeout = () => 1; global.clearTimeout = () => {};
eval(shared); global.SC = window.SC;
eval(src);
const T = global.__T;
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const ask = () => { log = []; el('ask').handlers.click(); return log.slice(); };
const frameAt = t => { NOW = t; log = []; T.st.redraw(); return log.slice(); };

const base = T.layers[0], baseTypes = new Set(base.map(p => p.type));
check(['house', 'deck', 'pile', 'ladder'].concat(T.EXTRAS).every(t => baseTypes.has(t)) && !baseTypes.has('ribbon'), '最早那层有全部零件、没有彩带: ' + [...baseTypes].join(','));

// Piles and ladders must stand on something: the ground or a deck that is really there below them.
const decks = base.filter(p => p.type === 'deck');
const standing = () => T.layers.every((L, i) => { const ds = [].concat(...T.layers.slice(0, i + 1)).filter(p => p.type === 'deck');
  return L.filter(p => p.type === 'pile' || p.type === 'ladder').every(p => p.y1 > p.y0 && (p.y1 === T.GROUND || ds.some(d => d.y === p.y1 && d.x - 10 <= p.x && p.x <= d.x + d.w + 10))); });
check(standing(), '每根桩、每架梯都往下落在地上或真有的平台上');

const hsl0 = (() => { log = []; el('reset').handlers.click(); return log.some(l => /hsl\(/.test(l)); })();
check(!hsl0, '没人被问过时画面里没有彩带');
const chalkFirst = log.some(l => /^strokeRect.*\|--chalk\|/.test(l));
check(chalkFirst, '没问过时最早那层用亮色描（认得出来）');

const hiddenSeq = [T.hidden()[0]], dreams = [];
let firstAskLog;
for (let i = 0; i < 6; i++){ const L = ask(); if (i === 0) firstAskLog = L; dreams.push(T.dream); hiddenSeq.push(T.hidden()[0]); }
check(!firstAskLog.some(l => /^strokeRect.*\|--chalk\|/.test(l)), '问过一个人以后最早那层就不再特别亮');
check(firstAskLog.some(l => /hsl\(/.test(l)), '第一个人说的城画出了彩带');

const ok = dreams.every(d => d.filter(p => p.type !== 'ribbon').every(p => baseTypes.has(p.type)) && d.some(p => p.type === 'ribbon'));
check(ok, '六个人说的城：除了彩带，零件全是最早那层里有的；每座都有彩带');
const sig = d => JSON.stringify(d.filter(p => p.type !== 'ribbon'));
check(new Set(dreams.map(sig).concat([sig(base)])).size === 7, '六个人说的城彼此不同、也跟最早那层不同');
check(standing(), '六层以后，每根桩、每架梯照样往下落在地上或真有的平台上');
check(T.layers.length === 6 && T.asked === 6 && T.layers[5] === dreams[4], '问第 n+1 个人时第 n 个人的城搭上去了（6 问 → 1+5 层，第 6 个还在虚线里）');
check(hiddenSeq.every((v, i) => i === 0 || v >= hiddenSeq[i - 1]) && hiddenSeq[0] === 0 && hiddenSeq[6] > 0, '最早那层被挡住的件数从 0 起、只增不减: ' + hiddenSeq.join(' '));
check(new RegExp('被后来的挡住或穿过 ' + hiddenSeq[6] + ' / ').test(el('meter').textContent) && el('moral').textContent.startsWith('问珍诺比亚算幸福'), 'meter/DONE: ' + el('meter').textContent);

// Every later layer is drawn after the ones below it (so "挡住" is what you see, not only what we count).
// strokeRect is called for decks, houses and barrels, in part order; the dashed dream comes last.
const want = [].concat(...T.layers, T.dream).filter(p => /deck|house|barrel/.test(p.type)).length;
const rects = firstAskLog.length && (() => { NOW += 10; log = []; ask(); return log.filter(l => l.startsWith('strokeRect(')); })();
const order = [].concat(...T.layers, T.dream).filter(p => /deck|house|barrel/.test(p.type)).map(p => p.type === 'deck' ? p.x : p.type === 'house' ? p.x : p.x - 19).map(x => x.toFixed(2));
check(rects.length === order.length && rects.every((l, i) => l.startsWith('strokeRect(' + order[i] + ',')), '画出来的方块逐个对得上层的顺序（' + rects.length + ' 个，后来的盖在前面的上面）');

// The whole city stays in view however tall it gets.
const top = T.highest(), s = T.fit(top);
check(T.GROUND - (T.GROUND - top) * s >= 0 && s < 1, '再高也整座在画面里: 最高点缩放后 y=' + (T.GROUND - (T.GROUND - top) * s).toFixed(1) + '，比例 ' + s.toFixed(2));

// Animation: the new dream starts 90 below and faint, ends in place. (Fake clock.)
el('reset').handlers.click(); NOW = 500000; ask();
const shift = L => L.filter(l => /^translate\(0\.00,/.test(l)).map(l => +l.slice(15).split(')')[0]);
const sheet = [0, .4, .8, 1.2, 1.6, 3].map(dt => shift(frameAt(500000 + dt * 1000)));
check(sheet[0][0] === 90 && sheet[4][0] === 0 && sheet[5][0] === 0 && sheet[1][0] > sheet[2][0] && sheet[2][0] > sheet[3][0], '新的那座从低 90 处升上来、停在原位: ' + sheet.map(a => a[0]).join(' → '));
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
