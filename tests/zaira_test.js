// 无头跑 zaira.html：桩掉 DOM/canvas，记录每次绘图调用，时钟可拨。测试侧注入只读钩子。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { PARTS, N, DUR, GROW, GROUND, HIT, LABEL, step, count, nextIndex, remember, get soaked(){ return soaked; }, get playing(){ return playing; }, get st(){ return st; } };\n  ' + hook);

const els = {}; let log = [];
function mk(id){ return { id, textContent: '', disabled: false, dataset: {}, attrs: {}, children: [], handlers: {}, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ this.handlers[ev] = f; }, appendChild(c){ this.children.push(c); }, setAttribute(k, v){ this.attrs[k] = v; }, setPointerCapture(){},
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }; }
function el(id){ return els[id] || (els[id] = mk(id)); }
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); log.push(String(k) + '(' + a.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(',') + ')|' + t.strokeStyle + '|' + t.fillStyle); }; },
  set(t, k, v){ t[k] = v; return true; } });
let NOW = 1000000;
global.window = { matchMedia: () => ({ matches: !!process.env.REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), querySelectorAll: () => [] };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
global.setTimeout = () => 1; global.clearTimeout = () => {}; global.setInterval = () => 1;
eval(shared); global.SC = window.SC;
eval(src);
const T = global.__T;
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const at = s => { NOW = s * 1000; };
const frame = () => { log = []; T.st.redraw(); return log.slice(); };
const canvas = el('c');
const tap = (x, y) => canvas.handlers.pointerdown({ clientX: x, clientY: y, pointerId: 1 });
const meter = () => el('meter').textContent, cap = () => el('caption').textContent;
// A world point, as it appears on screen once the city has swollen k times.
const onScreen = (x, y) => { const s = 1 + T.GROW * T.count(); return [800 + (x - 800) * s, T.GROUND + (y - T.GROUND) * s]; };
const lampStrokes = L => L.filter(l => l.startsWith('stroke()|--lamp')).length;
const finish = () => { at(NOW / 1000 + (process.env.REDUCE ? .3 : T.DUR + .01)); T.step(); };
const hanging = L => L.some(l => l.startsWith('lineTo(725.00,448.00)'));

at(1000);
const f0 = frame();
check(T.count() === 0 && /0 \/ 6/.test(meter()) && !el('next').disabled && lampStrokes(f0) === 0, '开头：0/6，没有痕，按钮能按: ' + meter());
check(!hanging(f0), '开头檐沟是完整的');

tap(...T.LABEL.lamp);
check(T.playing && T.playing.i === 0 && cap() === T.PARTS[0].say && el('next').disabled, '点路灯的尺寸：开始吸进路灯那段，说明对得上，按钮暂停');
tap(...T.LABEL.net);
check(T.playing.i === 0 && cap() === '这一段还没吸完。' && !T.soaked[5], '吸的过程中点别处：不插队');
finish();
check(T.soaked[0] && !T.playing && /1 \/ 6/.test(meter()) && T.nextIndex() === 1, '吸完：1/6，下一段提示是那根绳（书里的顺序）');
check(lampStrokes(frame()) > lampStrokes(f0), '吸完之后路灯上多了痕（灯色描线变多）');
tap(...T.LABEL.lamp);
check(!T.playing && /已经吸进去了/.test(cap()), '再点路灯：不会重吸，只说剩几道痕');

// Out of order: the nets first. The hint then goes back round to the first one not yet in.
tap(...onScreen(...T.LABEL.net)); finish();
check(T.soaked[5] && T.nextIndex() === 1, '跳着点渔网也行；提示绕回还没吸的第一段（绳）');

// The city has swollen twice now; a point near the edge of the railing's box must still hit the railing.
tap(...onScreen(535, 585));
check(T.playing && T.playing.i === 2, '城胀大以后，点栏杆边上照样点得中（屏幕坐标换回去了）');
finish();
check(T.soaked[2] && T.nextIndex() === 3, '吸完栏杆，提示跳到它后面那段（檐沟），不是回头找绳');

// The gutter is whole until the gunboat's shell lands, and broken after.
check(!hanging(frame()), '炮艇那段之前檐沟完整');
tap(...onScreen(...T.LABEL.range)); at(NOW / 1000 + (process.env.REDUCE ? 0 : T.DUR * .5));
check(process.env.REDUCE || !hanging(frame()), '炮弹还在半空时檐沟还是完整的');
finish();
check(T.soaked[4] && hanging(frame()), '炮弹落下之后檐沟断了，挂下来一截');

// The button plays the rest in order and the thread closes back to the lamp.
let guard = 0;
while (T.count() < T.N && guard++ < 10){ el('next').handlers.click(); finish(); }
const fe = frame();
check(T.count() === 6 && el('next').disabled && /6 \/ 6/.test(meter()), '按钮把剩下的吸完：6/6，按钮停了');
check(fe.some(l => l.startsWith('bezierCurveTo')) && /扣回了路灯/.test(cap()) && el('moral').textContent.startsWith('扎伊拉自己不讲这些'), '六段吸完：线头从码头绕回路灯，最后那段话出现');
check(fe.some(l => l.startsWith('scale(1.09,1.09)')), '城胀大了 6 × 1.5%');

el('reset').handlers.click();
check(T.count() === 0 && !T.playing && !hanging(frame()) && /0 \/ 6/.test(meter()), '回到只有尺寸的扎伊拉：全清空，檐沟又是完整的');

console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
