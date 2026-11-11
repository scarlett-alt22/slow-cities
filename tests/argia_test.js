// 无头跑 argia.html：桩掉 DOM/canvas/计时器/AudioContext，时间用假时钟一格一格（0.25 秒）往前走。
// 画面从记录下来的绘图调用里读（自己跟踪 translate/scale/save/restore，把每一笔换算回画布坐标），不读页面的计数。
// 检查：
// ① 地面以下什么都没画：每一帧里，除了那一块土色的 fillRect，没有任何一笔的最低点超过「地面线 + 46」；
//    土色那块每帧正好一块、不透明、从地面线铺到画布底；用到的绘图方法都在白名单里（别的方法量不了，一律算错）
// ② 站着永远听不到：不贴地，过 5 分钟还是 0 声，计时器也没起
// ③ 只在夜里：每一声响的那一帧，天已经全黑（夜色那层的透明度到头）
// ④ 「有时」：第一声不早于 贴地后 6+7 秒、不晚于 6+26 秒；相邻两声隔 7–26 秒
// ⑤ 起来以后计时器停掉，再过 5 分钟一声不多；数字留着，moral 说得出听到过几声
// ⑥ 闷响的次数＝听到的次数（有 AudioContext 时）；没有 AudioContext、或者它一 new 就抛错，页面照样走
// ⑦ REDUCE=1：贴地那一帧地面线直接到位、天直接黑；响的时候石子不跳
// 变异（自检用）：MUT=1..7 各弄坏一处，这个文件必须以非 0 退出。跑法见文件末尾注释。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("ctx.fillStyle = SOIL; ctx.fillRect(0, hz, W, H - hz);", "ctx.fillStyle = SOIL; ctx.fillRect(0, hz, W, H - hz); ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(700, hz + 300); ctx.lineTo(760, hz + 300); ctx.stroke();");
if (MUT === '2'){ swap("if (!down) return;", ""); swap("base += now - downAt; down = false; nextSlam = Infinity;", "base += now - downAt; down = false;"); swap("clearInterval(timer); timer = null;", ""); }
if (MUT === '3') swap("nextSlam = now + NIGHT + gap();", "nextSlam = now + 1;");
if (MUT === '4') swap("nextSlam = now + gap(); thud(); }", "nextSlam = now + gap(); }");
if (MUT === '5') swap("!still && since >= 0 && since < .45", "since >= 0 && since < .45");
if (MUT === '6') swap("clearInterval(timer); timer = null;", "");
if (MUT === '7') swap("const gap = () => GAP_MIN + rg() * (GAP_MAX - GAP_MIN);", "const gap = () => 2;");

const hook = 'function tick(){';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, 'global.__T = { get redraw(){ return st.redraw; } };\n  ' + hook);

const REDUCE = process.env.REDUCE === '1';
const AUDIO = process.env.AUDIO || '1';          // 1 = 有；0 = 没有；throw = 一 new 就抛错
const W = 1600, H = 1000, SOIL = '#17131f', VEIL = '#070912', BAND = 46;
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { calls.push([String(k), a]); return { addColorStop(){} }; };
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
let NOW = 5000, tickFn = null, timers = 0, thuds = 0;
class FakeAC { constructor(){ if (AUDIO === 'throw') throw new Error('no audio'); this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator(){ return { frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){}, start(){ thuds++; }, stop(){} }; }
  createGain(){ return { gain: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }; } }
global.window = { matchMedia: () => ({ matches: REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
if (AUDIO !== '0') global.window.AudioContext = FakeAC;
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
global.setInterval = f => { tickFn = f; timers++; return timers; };
global.clearInterval = () => { tickFn = null; };
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T;
const ALLOWED = new Set(['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'arc', 'stroke', 'fill', 'fillRect', 'fillText', 'createLinearGradient']);

// Read one frame: every stroke converted back to canvas coordinates.
function frame(){
  calls = []; T.redraw();
  let m = [1, 0, 0, 1, 0, 0], alpha = 1, fill = null; const stack = [];
  const Y = (x, y) => m[1] * x + m[3] * y + m[5], S = () => Math.hypot(m[2], m[3]);
  const f = { soil: [], veil: 0, ops: [], unknown: [], heads: 0, pebbles: [], texts: [], soilAt: -1 };
  calls.forEach((c, i) => {
    const [k, a] = c;
    if (k === '=globalAlpha'){ alpha = a; return; }
    if (k === '=fillStyle'){ fill = a; return; }
    if (k[0] === '=') return;
    if (!ALLOWED.has(k)){ f.unknown.push(k); return; }
    if (k === 'save') stack.push({ m: m.slice(), alpha, fill });
    else if (k === 'restore'){ const s = stack.pop(); m = s.m; alpha = s.alpha; fill = s.fill; }
    else if (k === 'translate'){ m[4] += m[0] * a[0] + m[2] * a[1]; m[5] += m[1] * a[0] + m[3] * a[1]; }
    else if (k === 'scale'){ m[0] *= a[0]; m[1] *= a[0]; m[2] *= a[1]; m[3] *= a[1]; }
    else if (k === 'rotate'){ const co = Math.cos(a[0]), si = Math.sin(a[0]); m = [m[0] * co + m[2] * si, m[1] * co + m[3] * si, -m[0] * si + m[2] * co, -m[1] * si + m[3] * co, m[4], m[5]]; }
    else if (k === 'moveTo' || k === 'lineTo') f.ops.push({ k, y: Y(a[0], a[1]), i });
    else if (k === 'arc'){ const y = Y(a[0], a[1]); f.ops.push({ k, y: y + a[2] * S(), i }); if (f.soilAt < 0) f.heads++; else f.pebbles.push(y); }
    else if (k === 'fillText'){ f.texts.push(a[0]); f.ops.push({ k, y: Y(a[1], a[2]) + 20, i }); }
    else if (k === 'fillRect'){
      if (fill === SOIL){ f.soil.push({ x: a[0], y: a[1], w: a[2], h: a[3], alpha }); f.soilAt = i; }
      else { if (fill === VEIL) f.veil = alpha; f.ops.push({ k, y: Math.max(Y(a[0], a[1]), Y(a[0], a[1] + a[3])), i }); }
    }
  });
  f.hz = f.soil.length ? f.soil[0].y : NaN;
  f.below = f.ops.filter(o => o.y > f.hz + BAND + 1e-6);
  return f;
}
let frames = 0, bad = [];
function audit(f, where){
  frames++;
  const s = f.soil[0];
  const ok = f.soil.length === 1 && s.alpha === 1 && s.x === 0 && s.w === W && Math.abs(s.y + s.h - H) < 1e-6 && f.below.length === 0 && f.unknown.length === 0;
  if (!ok) bad.push(where + ' 土块' + f.soil.length + ' 越界' + f.below.length + (f.below[0] ? '(' + f.below[0].k + ' y=' + f.below[0].y.toFixed(0) + ' 线=' + f.hz.toFixed(0) + ')' : '') + ' 不认识的方法[' + f.unknown.join(',') + ']');
  return f;
}
const meter = () => el('meter').textContent, moral = () => el('moral').textContent, cap = () => el('caption').textContent, btn = () => el('ear').textContent;
const heard = () => { const m = /听到 (\d+) 声/.exec(meter()); return m ? +m[1] : 0; };
const press = () => handlers['ear:click']();
const slams = [];
// Walk the fake clock; audit a frame at every step; note every slam with the frame it happened in.
function adv(sec, tag){
  for (let i = 0; i < Math.round(sec * 4); i++){
    NOW += 250; const before = heard(); if (tickFn) tickFn();
    const f = audit(frame(), tag + '+' + ((i + 1) / 4) + 's');
    if (heard() > before) slams.push({ t: NOW / 1000, veil: f.veil, cap: cap(), pebbles: f.pebbles.slice(), hz: f.hz });
  }
}

// ① + ② standing
let f0 = audit(frame(), '开头');
check(f0.hz === 640 && f0.heads === 2 && f0.texts.some(t => /她就在下面/.test(t)), '开头站着：地面线在 640，地上两个人，其中一个说「她就在下面」');
check(meter() === '还没贴着地听过' && btn() === '把耳朵贴在地上' && /什么也看不见/.test(moral()) && /从上面看/.test(cap()), '开头的字: ' + meter() + ' / ' + cap());
adv(300, '站着');
check(heard() === 0 && tickFn === null && timers === 0 && slams.length === 0, '② 站着过 5 分钟：0 声，计时器没起');

// lie down
const t0 = NOW / 1000; press();
let f1 = audit(frame(), '刚贴地');
check(btn() === '起来' && tickFn !== null, '贴地：按钮变「起来」，计时器起了');
if (REDUCE) check(f1.hz === 210 && Math.abs(f1.veil - .6) < 1e-9 && f1.heads === 0, '⑦ 减少动效：贴地那一帧地面线直接到 210、天直接全黑、地上的人不画');
else check(f1.hz === 640 && f1.veil === 0, '正常动效：贴地那一帧还在原位，天还没黑');
adv(1.25, '下降');
const f2 = frame();
check(f2.hz === 210 && f2.heads === 0, '1.25 秒后地面线到 210，地上的人不画了（地面以上只剩一条天）');
check(/没人知道/.test(moral()), '贴着地、还没听到时的 moral 是土里那段');

// ③ ④ wait for ten slams
let guard = 0; while (slams.length < 10 && guard++ < 400) adv(1, '贴地');
check(slams.length === 10, '听到了 10 声（等了 ' + (NOW / 1000 - t0).toFixed(0) + ' 秒）');
const first = slams[0] ? slams[0].t - t0 : NaN;
check(first >= 13 - 1e-9 && first <= 32 + .25 + 1e-9, '④ 第一声在贴地后 ' + first.toFixed(2) + ' 秒（要在 13–32 之间）');
const gaps = slams.slice(1).map((s, i) => s.t - slams[i].t);
check(gaps.length === 9 && gaps.every(g => g >= 7 - 1e-9 && g <= 26 + .25 + 1e-9), '④ 相邻两声的间隔都在 7–26 秒: ' + gaps.map(g => g.toFixed(1)).join(' '));
check(new Set(gaps.map(g => g.toFixed(2))).size >= 5, '④ 间隔不是同一个数（' + new Set(gaps.map(g => g.toFixed(2))).size + ' 种）');
check(slams.every(s => Math.abs(s.veil - .6) < 1e-9), '③ 每一声响的时候天都已经全黑: ' + slams.map(s => s.veil.toFixed(2)).join(' '));
check(slams.every(s => s.cap === '砰。'), '每一声响的那一帧 caption 是「砰。」');
check(/关上了一扇门/.test(moral()), '听到以后 moral 换成关门那句');
if (AUDIO === '1') check(thuds === heard() && thuds === 10, '⑥ 闷响 ' + thuds + ' 次＝听到 ' + heard() + ' 声');
else check(thuds === 0 && heard() === 10, '⑥ 没有声音可用（AUDIO=' + AUDIO + '）：页面照样走，听到 ' + heard() + ' 声');

// pebbles: jump on a slam unless reduced motion
const calm = frame();   // some time after the last slam? make sure: wait 1 s first
adv(1, '静');
const still = frame().pebbles.map(y => y - 210);
const atSlam = slams[9].pebbles.map(y => y - slams[9].hz);
const moved = atSlam.filter((y, i) => Math.abs(y - still[i]) > 1e-6).length;
if (REDUCE) check(moved === 0, '⑦ 减少动效：响的那一帧石子一颗没动');
else check(moved === atSlam.length && atSlam.every((y, i) => y < still[i]), '响的那一帧 ' + moved + '/' + atSlam.length + ' 颗石子都往上跳了一点');

// ⑤ get up
const n = heard(); press();
check(btn() === '把耳朵贴在地上' && tickFn === null, '⑤ 起来：按钮变回去，计时器停了');
const before = slams.length; adv(300, '起来以后');
check(heard() === n && slams.length === before, '⑤ 起来以后再过 5 分钟，一声不多（还是 ' + heard() + ' 声）');
check(new RegExp('听到过 ' + n + ' 声').test(moral()) && /从上面看/.test(cap()), '⑤ moral: ' + moral());
const f3 = frame();
check(f3.hz === 640 && f3.heads === 2 && f3.veil === 0, '起来以后地面线回到 640，天不黑，两个人又在');

// ① over every frame seen
check(bad.length === 0, '① ' + frames + ' 帧里地面以下只有那一块土色' + (bad.length ? '；出错 ' + bad.length + ' 帧，第一帧: ' + bad[0] : ''));

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 变异自检：for m in 1 2 3 4 5 6 7; do MUT=$m node tests/argia_test.js cities/argia.html shared.js >/dev/null; echo "MUT=$m exit=$?"; done
// （MUT=5 要配 REDUCE=1 才抓得到，它弄坏的是减少动效那条路。）
