// 无头跑 zaira.html：桩掉 DOM/canvas，记录每次绘图调用（带描线色、填色、透明度），时钟可拨。测试侧注入只读钩子。
// 第一遍走交互和顺序；第二遍逐段在画面上点，读半途的画面（吊着的人、游行、跳下的情夫、猫、炮弹、老人），再看痕、尺寸变淡、下一段亮、渔网补上。
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
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); log.push(String(k) + '(' + a.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(',') + ')|' + t.strokeStyle + '|' + t.fillStyle + '|' + (t.globalAlpha == null ? 1 : t.globalAlpha)); }; },
  set(t, k, v){ t[k] = v; return true; } });
let NOW = 1000000;
global.window = { matchMedia: () => ({ matches: !!process.env.REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), querySelectorAll: () => [] };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
global.setTimeout = () => 1; global.clearTimeout = () => {}; global.setInterval = () => 1;
eval(shared); global.SC = window.SC;
// Record every person the page draws (x, y, scale), so the memories can be read off the picture.
let figs = []; const realFigure = SC.figure;
SC.figure = (c, col, x, y, s, sw) => { figs.push([x, y, s]); return realFigure(c, col, x, y, s, sw); };
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

// Second pass, reading the picture: press each measurement on the canvas itself, look at the memory half-way through,
// then check the thing kept a mark, its number faded and the next number lit up.
const label = (L, txt) => L.filter(l => l.startsWith('fillText(' + txt + ','));
const alphaOf = l => +l.split('|')[3];
const holes = L => L.filter(l => /^arc\((1150\.00,720\.00,11|1215\.00,760\.00,14|1255\.00,712\.00,9)\.00,/.test(l)).length;
check(holes(frame()) === 3, '渔网开头有三处破洞');
const SEEN = [
  ['路灯：吊着的人从灯臂垂下来', L => L.some(l => l.startsWith('moveTo(314.00,530.00)|--lamp'))],
  ['绳：大婚游行的人从街上走过', () => figs.filter(f => f[1] === T.GROUND && f[2] === .9).length >= 3],
  ['栏杆：情夫在栏杆和街面之间往下跳', () => figs.some(f => f[2] === 1 && f[0] > 610 && f[0] < 770 && f[1] > 500 && f[1] < T.GROUND + 12)],
  ['檐沟：猫顺着檐沟走', L => L.some(l => l.startsWith('ellipse('))],
  ['炮艇：炮弹在半空', L => L.some(l => /^arc\([\d.]+,[\d.]+,6\.00,/.test(l))],
  ['渔网：三个老人坐在码头上讲', L => figs.filter(f => f[2] === .85).length === 3 && L.some(l => l.startsWith('fillText(……那艘炮艇'))],
];
const MID = [.5, .5, .5, .35, .5, .5];
// Lamp-coloured strokes that are marks, not the closing thread (which is also lamp-coloured and appears with the sixth).
const markStrokes = L => L.filter((l, k) => l.startsWith('stroke()|--lamp') && !(L[k - 1] || '').startsWith('bezierCurveTo')).length;
// Where each measurement's dashed dimension line starts (the net has none).
const DIM = { lamp: 'moveTo(196.00,820.00)', festoon: 'moveTo(330.00,506.00)', rail: 'moveTo(700.00,820.00)', range: 'moveTo(1500.00,810.00)' };
for (let i = 0; i < T.N; i++){
  const id = T.PARTS[i].id, before = frame();
  tap(...onScreen(...T.LABEL[id]));
  check(T.playing && T.playing.i === i, '在画面上点「' + T.PARTS[i].label + '」开始吸' + T.PARTS[i].name);
  at(NOW / 1000 + (process.env.REDUCE ? .1 : T.DUR * MID[i])); figs = [];   // reduced motion finishes after .25 s and holds the picture at .6
  const mid = frame();
  check(SEEN[i][1](mid), SEEN[i][0]);
  finish();
  const after = frame();
  check(markStrokes(after) > markStrokes(before), T.PARTS[i].name + '吸完，东西身上多了痕');
  if (DIM[id]){ const dl = after.find(l => l.startsWith(DIM[id] + '|'));
    check(dl && alphaOf(dl) < .5, T.PARTS[i].name + '的尺寸线也淡了: alpha=' + (dl && alphaOf(dl))); }
  const own = label(after, T.PARTS[i].label);
  check(own.length === 1 && alphaOf(own[0]) < .5, T.PARTS[i].label + ' 这个数字淡下去了: alpha=' + (own[0] && alphaOf(own[0])));
  const nx = T.nextIndex();
  if (nx >= 0){
    const lit = label(after, T.PARTS[nx].label);
    const others = T.PARTS.filter((p, k) => k !== nx && !T.soaked[k]).map(p => label(after, p.label)[0]);
    check(lit.length === 1 && lit[0].includes('|--lamp|') && others.every(l => l && !l.includes('|--lamp|')), '只有下一段的数字「' + T.PARTS[nx].label + '」亮着');
  }
}
check(holes(frame()) === 0, '老人补过之后渔网上没有洞了');

console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
