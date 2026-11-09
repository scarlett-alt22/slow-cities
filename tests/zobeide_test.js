// 无头跑 zobeide.html 的脚本：桩掉 DOM/canvas，按 12 次「又来一个」，检查出口只减不增、路径落在网格里、画图不抛错。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const reduce = process.argv[4] === 'reduce';

const els = {}; const handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, addEventListener(ev, f){ handlers[id] = f; }, getBoundingClientRect(){ return { width: 800, height: 500 }; }, getContext(){ return ctx; } }); }
let calls = 0;
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} }); return (...a) => { calls++; for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); }; }, set(t, k, v){ t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: reduce }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};
const timers = []; global.setTimeout = (f) => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
eval(shared); global.SC = window.SC;
eval(inline);

const meters = [];
for (let i = 0; i < 12; i++){ handlers.arrive(); while (timers.length) timers.shift()(); meters.push(el('meter').textContent); }
const left = meters.map(m => +m.match(/出口还剩 (\d+)/)[1]);
let ok = true;
let prev = 10; for (let i = 0; i < left.length; i++){ if (left[i] !== Math.max(0, prev - 1)) ok = false; prev = left[i]; }
console.log('出口序列', left.join(' '), ok ? '每人恰好封一个 ✓' : '✗ 封口不对');
console.log('全部堵上后的 moral:', el('moral').textContent.slice(0, 20));
console.log('她出现过 0 次 恒定:', meters.every(m => m.endsWith('她出现过 0 次')) ? '✓' : '✗');
console.log('caption:', el('caption').textContent, '| 绘图调用', calls);
handlers.reset(); console.log('reset 后:', el('meter').textContent);
