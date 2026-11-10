// 无头跑 moriana.html：桩掉 DOM/canvas；颜色桩成变量名（'--lamp' 之类），这样每一帧画的是哪一面可以从画面本身读出来。
// 测试侧注入只读钩子（theta 和 redraw），页面本身不带钩子。看哪一面用测试自己的规则：cos(角度)>0.04 正面、<-0.04 背面、其余是侧面；
// 角度由测试自己按按键次数算（每下 π/12），不借页面的 faceOf。
// 检查：①每一帧只画一面（正面有 --lamp 没有 --dim，背面反过来），从不两面一起画 ②画哪一面跟测试自己的规则对得上，侧面只画一条竖线
// ③两面是同一张纸：背面轮廓＝正面轮廓左右翻，横向缩放从不为负（不画镜像字）④翻面次数只在真换面时加，走到侧面再退回不算
// ⑤按钮：正常动效时中途在侧面停住（≥0.5 秒），说「只剩一条线」；减少动效时直接翻过去，不说没画出来的那条线 ⑥拖动、松手吸到侧面
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, 'global.__T = { get theta(){ return theta; }, get redraw(){ return st.redraw; } };\n  ' + hook);

const REDUCE = process.env.REDUCE === '1';
const GY = 840, CX = 800;
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
let NOW = 5000;
global.window = { matchMedia: () => ({ matches: REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T;

// Read one frame off the recorded calls.
function frame(){
  calls = []; T.redraw();
  const cs = calls;
  const si = cs.findIndex((c, i) => c[0] === 'scale' && c[1][1] === 1 && i > 0 && cs[i - 1][0] === 'translate' && cs[i - 1][1][0] === CX);
  if (si < 0){
    const line = cs.some((c, i) => c[0] === 'moveTo' && c[1][0] === CX && c[1][1] === GY && cs[i + 1] && cs[i + 1][0] === 'lineTo' && cs[i + 1][1][0] === CX && cs[i + 1][1][1] < GY - 300);
    const lamp = cs.some(c => c[1] === '--lamp');
    return { face: line && !lamp ? 'edge' : 'nothing?', sx: null };
  }
  let d = 1, j = si + 1;
  for (; j < cs.length; j++){ if (cs[j][0] === 'save') d++; if (cs[j][0] === 'restore' && --d === 0) break; }
  const sl = cs.slice(si + 1, j);
  const lamp = sl.some(c => c[0].startsWith('=') && c[1] === '--lamp');
  const dim = sl.some(c => c[0].startsWith('=') && c[1] === '--dim');
  const pts = [];
  for (const c of sl){ if (c[0] === 'moveTo' || c[0] === 'lineTo') pts.push(c[1].slice()); if (c[0] === 'closePath') break; }
  return { face: lamp && !dim ? 'front' : dim && !lamp ? 'back' : 'mixed', sx: cs[si][1][0], pts };
}
const expect = a => Math.cos(a) > .04 ? 'front' : Math.cos(a) < -.04 ? 'back' : 'edge';
const key = k => handlers['c:keydown']({ key: k });
const meter = () => el('meter').textContent, moral = () => el('moral').textContent, cap = () => el('caption').textContent;

// ① start
let f0 = frame();
check(f0.face === 'front' && /正面 · 翻过 0 次/.test(meter()) && /另一面/.test(moral()), '开头是正面: ' + meter());
const frontPts = f0.pts;

// ④ to the edge and back: no flip counted
for (let i = 0; i < 6; i++) key('ArrowRight');
let fe = frame();
check(fe.face === 'edge' && /一条线/.test(meter()) && /一条线/.test(cap()), '方向键走 6 下到侧面，只画一条线: ' + meter());
check(/背贴着背/.test(moral()), '见过侧面后 moral 换成 edge 那句');
for (let i = 0; i < 6; i++) key('ArrowLeft');
check(frame().face === 'front' && /翻过 0 次/.test(meter()), '退回正面，不算翻面: ' + meter());

// ①② sweep two full turns, one frame per key press
let a = 0, ownFlips = 0, last = 'front', bad = [], negScale = 0, backPts = null, mixed = 0;
for (let k = 1; k <= 48; k++){   // 48 × π/12 = two full turns
  key('ArrowRight'); a += Math.PI / 12;
  const fr = frame(), ex = expect(a);
  if (fr.face === 'mixed') mixed++;
  if (fr.face !== ex) bad.push(k + ':' + fr.face + '≠' + ex);
  if (fr.sx != null && fr.sx < 0) negScale++;
  if (fr.face === 'back' && !backPts) backPts = fr.pts;
  if (ex !== 'edge' && ex !== last){ ownFlips++; last = ex; }
}
check(mixed === 0, '没有一帧同时画两面');
check(bad.length === 0, '每一帧画的面都跟测试自己算的对得上 ' + bad.slice(0, 4).join(' '));
check(negScale === 0, '横向缩放从不为负（背面不是镜像画）');
check(new RegExp('翻过 ' + ownFlips + ' 次').test(meter()) && ownFlips === 4, '两圈翻 4 次，计数对得上: ' + meter());

// ③ one sheet: the back's outline is the front's, mirrored
const mirrored = frontPts.map(p => [-p[0], p[1]]);
check(backPts && JSON.stringify(backPts) === JSON.stringify(mirrored), '背面轮廓＝正面轮廓左右翻');
check(JSON.stringify(backPts) !== JSON.stringify(frontPts), '轮廓本身不对称（不然上一条什么也没证明）');

// ⑥ drag: half of 560 world units is a quarter turn; let go near the edge and it snaps there
const th0 = T.theta;
handlers['c:pointerdown']({ clientX: 600, clientY: 500, pointerId: 1 });
handlers['c:pointermove']({ clientX: 600 + 250, clientY: 500 });
const fd = frame();
check(fd.face === 'front' && fd.sx > .1 && fd.sx < .25, '拖 250：还是正面，变得很窄 (sx=' + (fd.sx && fd.sx.toFixed(3)) + ')');
handlers['c:pointerup']({});
check(frame().face === 'edge' && Math.abs(Math.cos(T.theta)) < 1e-9, '松手吸到正侧面');
handlers['c:pointerdown']({ clientX: 600, clientY: 500, pointerId: 1 });
handlers['c:pointermove']({ clientX: 600 - 280, clientY: 500 });
handlers['c:pointerup']({});
check(frame().face === 'front' && Math.abs(T.theta - th0) < 1e-9, '往回拖 280 回到原来的正面');

// ⑤ the button
const before = meter().match(/翻过 (\d+)/)[1] | 0;
if (REDUCE){
  // A fresh page would have sawEdge=false; this one has seen the edge above, so only check the caption and the picture.
  handlers['half:click']();
  const fb = frame();
  check(fb.face === 'back' && !/一条线/.test(cap()), '减少动效：按钮直接翻到背面，caption 不提没画出来的那条线: ' + cap());
  check(new RegExp('翻过 ' + (before + 1) + ' 次').test(meter()), '翻面计数 +1');
} else {
  handlers['half:click']();
  const seq = [];
  for (let t = 0; t <= 2.5; t += 1 / 60){ NOW = 5000 + t * 1000 + 1; seq.push(frame().face); }
  const firstEdge = seq.indexOf('edge'), lastEdge = seq.lastIndexOf('edge');
  check(firstEdge > 0 && seq.slice(0, firstEdge).every(x => x === 'front') && seq.slice(lastEdge + 1).every(x => x === 'back'), '按钮：先正面、再侧面、再背面');
  check(seq.filter(x => x === 'edge').length >= 30, '在侧面停住 ≥0.5 秒（' + seq.filter(x => x === 'edge').length + ' 帧）');
  check(!seq.includes('mixed') && !seq.includes('nothing?'), '动画中每一帧都只有一面或一条线');
  check(/背面/.test(cap()) && /一条线/.test(cap()), '到了以后 caption 说中途只剩一条线: ' + cap());
  check(new RegExp('翻过 ' + (before + 1) + ' 次').test(meter()), '翻面计数 +1: ' + meter());
}

check(!/回到……/.test(html) && !/翻过 0 次/.test(meter()), '没有「回到……」按钮，计数动过');
console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
