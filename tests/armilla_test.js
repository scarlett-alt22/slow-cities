// 无头跑 armilla.html：桩掉 DOM/canvas，记录每一次绘图调用（含参数），时钟钉死。
// 检查：①听哪种解释，画出来的东西逐调用一模一样 ②姑娘任何时候都在、个数不随时间变 ③歌声只在 5–10 点 ④白天水是彩色、夜里不是 ⑤滑块/按钮/reset
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const els = {}; let log = [];
function mk(id){ return { id, textContent: '', value: '7', dataset: {}, attrs: {}, children: [], handlers: {},
  addEventListener(ev, f){ this.handlers[ev] = f; }, appendChild(c){ this.children.push(c); }, setAttribute(k, v){ this.attrs[k] = v; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }; }
function el(id){ return els[id] || (els[id] = mk(id)); }
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); log.push(String(k) + '(' + a.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(',') + ')|' + t.strokeStyle + '|' + t.globalAlpha); }; },
  set(t, k, v){ t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), querySelectorAll: sel => sel === '#why button' ? el('why').children : [] };
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
global.performance = { now: () => 123456 };
global.requestAnimationFrame = () => {};
global.setTimeout = () => 1; global.clearTimeout = () => {};
eval(shared); global.SC = window.SC;
eval(src);
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const btn = id => el('why').children.find(b => b.dataset.why === id);
const setHour = h => { log = []; el('hour').value = String(h); el('hour').handlers.input(); };
const frame = () => { log = []; setHour(+el('hour').value); return log.slice(); };

setHour(8); const base = frame();
const frames = {};
for (const b of el('why').children){ log = []; b.handlers.click(); frames[b.dataset.why] = log.slice(); }
check(Object.values(frames).every(f => f.join('\n') === base.join('\n')), '四种解释各听一次，画面逐调用都跟没听时一样（' + base.length + ' 次调用）');
check(/听过的解释 4 \/ 4/.test(el('meter').textContent) && el('moral').textContent.startsWith('四种说法都听过了'), 'DONE: ' + el('meter').textContent);
check(el('why').children.every(b => b.attrs['aria-pressed'] === 'true'), '听过的都标成按下');

const bathers = h => { setHour(h); return el('meter').textContent.match(/姑娘 (\d+) 个/)[1]; };
const counts = [0, 3, 7, 12, 17, 22].map(bathers);
check(counts.every(c => c === counts[0]) && +counts[0] > 0, '任何时候都有姑娘、个数不变: ' + counts.join(' '));
const heads = h => { setHour(h); return log.filter(l => /^arc\(0\.00,-38\.00,6\.00,/.test(l)).length; };
const hc = [0, 3, 7, 12, 17, 22].map(heads);
check(hc.every(c => c === hc[0]) && hc[0] === +counts[0], '每个钟点真画出来的人头数都一样、等于计数: ' + hc.join(' '));
const songs = h => { setHour(h); return log.filter(l => l.startsWith('fillText(♪')).length; };
check(songs(7) > 0 && songs(9.5) > 0 && songs(4.5) === 0 && songs(10) === 0 && songs(14) === 0 && songs(23) === 0, '歌声只在 5–10 点: 7点 ' + songs(7) + '、14点 ' + songs(14));
const colour = h => { setHour(h); return log.some(l => /\|hsl\(/.test(l)); };
check(colour(13) && !colour(2) && !colour(23), '白天水是彩色，夜里不是');
check(/^07:00 · 早上/.test((setHour(7), el('time').textContent)) && /^23:30 · 夜里/.test((setHour(23.5), el('time').textContent)), '时间标签: ' + el('time').textContent);
el('reset').handlers.click();
check(/听过的解释 0 \/ 4/.test(el('meter').textContent) && el('why').children.every(b => b.attrs['aria-pressed'] === 'false'), 'reset');
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
