// 无头跑 zoe.html：桩掉 DOM/canvas；测试侧注入一个只读钩子看内部状态（页面本身不带钩子）。
// 检查：①墙里 18 座、墙外 10 座 ②每贴一次，同一用途至少落到 3 座房子、其中至少一座在墙另一边
// ③「只属于一座房子的用途」恒为 0 ④城墙百分比单调降到 0、第 10 次出 DONE ⑤点画布选中最近的房子 ⑥reset
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function uniqueUses(){';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, 'global.__T = { houses, get uses(){ return uses; }, get flash(){ return flash; } };\n  ' + hook);

const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false,
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} }); return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); }; }, set(t, k, v){ t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};
global.setTimeout = (f) => { f(); return 1; }; global.clearTimeout = () => {};
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T;
check(T.houses.filter(h => h.in).length === 18 && T.houses.filter(h => !h.in).length === 10, '墙里 18 / 墙外 10');

const walls = []; let spreadOk = true, crossOk = true, uniq = [];
for (let k = 0; k < 30; k++){
  if (k % 2) handlers['ask:click']();
  else { const h = T.houses[(k * 7) % T.houses.length]; handlers['c:click']({ clientX: h.x, clientY: h.y - 30 }); if (T.flash.i !== (k * 7) % T.houses.length) { spreadOk = false; console.log('点错房子', k); } }
  const f = T.flash, who = [f.i].concat(f.also);
  if (new Set(who).size !== 3 || !who.every(j => T.uses[j].has(f.use))) spreadOk = false;
  if (!f.also.some(j => T.houses[j].in !== T.houses[f.i].in)) crossOk = false;
  walls.push(+el('meter').textContent.match(/城墙还剩 (\d+)%/)[1]);
  uniq.push(+el('meter').textContent.match(/用途 (\d+) 个/)[1]);
  if (k === 9) check(el('moral').textContent.startsWith('城墙没了'), '第 10 次出 DONE');
}
check(spreadOk, '每次同一用途落到 3 座不同的房子；点画布选中的就是点的那座');
check(crossOk, '每次至少一座在墙的另一边');
check(uniq.every(n => n === 0), '只属于一座房子的用途恒为 0: ' + uniq.slice(0, 12).join(''));
check(walls.every((w, i) => i === 0 || w <= walls[i - 1]) && walls[9] === 0, '城墙单调降到 0: ' + walls.slice(0, 11).join(' '));
handlers['c:click']({ clientX: 5, clientY: 5 });
check(el('meter').textContent.startsWith('贴过 30 次'), '点空地不算');
handlers['reset:click']();
check(el('meter').textContent === '贴过 0 次 · 只属于一座房子的用途 0 个 · 城墙还剩 100%' && T.uses.every(s => s.size === 0), 'reset: ' + el('meter').textContent);
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
