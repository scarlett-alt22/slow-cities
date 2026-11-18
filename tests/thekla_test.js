// 无头跑 thekla.html：桩掉 DOM/canvas/计时器，时间用假时钟往前走。画面从记录下来的绘图调用里读，不读页面的计数。
// 检查：
// ① 脚手架的每一根梁（木色的线）两头都落在星图的某颗星上；立柱一头落在星上、一头落在地面线上。70 天、每天白天和夜里都查
// ② 星图不跟着脚手架变：每个夜里画出来的星一模一样（320 颗，坐标逐颗相同），第 1 夜和第 70 夜也一样；
//    而且夜里画出的每个接头底下都正好有一颗画出来的星
// ③ 白天一颗星也不画；夜里（天全黑以后）每颗星都画
// ④ 拆不得：每一天结束时，前一天的每一根梁都还在；每天都多（星用完以后靠斜撑，照样多）
// ⑤ 现在不能停手：一天的五个接头没做完，「收工」按钮是灰的，硬点也不收工；做完才能收
// ⑥ 夜里 caption 是「喏，这就是蓝图。」，白天不是；三个问题的回答对得上
// ⑦ REDUCE=1：开工那一下五个接头就齐了，收工那一下天就全黑
// 变异：MUT=1..7 各弄坏一处，这个文件必须以非 0 退出。跑法见末尾。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("ctx.lineTo(STARS[b].x, STARS[b].y); });", "ctx.lineTo(STARS[b].x + 3, STARS[b].y); });");
if (MUT === '2') swap("ctx.arc(s.x, s.y, s.r, 0, 6.29)", "ctx.arc(s.x + day % 2, s.y, s.r, 0, 6.29)");
if (MUT === '3') swap("for (let i = 0; i < done; i++){\n      const s = STEPS[i];\n      s.beams", "for (let i = Math.max(0, done - 200); i < done; i++){\n      const s = STEPS[i];\n      s.beams");
if (MUT === '4') swap("ctx.fillStyle = C.ink; ctx.globalAlpha = n;", "ctx.fillStyle = C.ink; ctx.globalAlpha = 1;");
if (MUT === '4') swap("if (n > 0){\n      ctx.fillStyle = C.ink", "if (true){\n      ctx.fillStyle = C.ink");
if (MUT === '5') swap("if (done < target()) return;", "");
if (MUT === '6') swap("extra.forEach(p => STEPS.push({ node: -1, beams: [p], post: false }));", "");
if (MUT === '7') swap("const want = still ? target() :", "const want =");

const hook = 'function tick(){';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, 'global.__T = { get redraw(){ return st.redraw; }, STARS, STEPS };\n  ' + hook);

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, GROUND = 880, WOOD = '#b08a5a';
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
let NOW = 5000, ivs = new Map(), nextId = 1;
global.window = { matchMedia: () => ({ matches: REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
global.setInterval = f => { const id = nextId++; ivs.set(id, f); return id; };
global.clearInterval = id => { ivs.delete(id); };
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T;
const starKey = new Set(T.STARS.map(s => s.x + ',' + s.y));

function frame(){
  calls = []; T.redraw();
  let stroke = null, fill = null, alpha = 1, path = [];
  const f = { beams: [], stars: [], woodPts: [] };
  for (const [k, a] of calls){
    if (k === '=strokeStyle'){ stroke = a; continue; }
    if (k === '=fillStyle'){ fill = a; continue; }
    if (k === '=globalAlpha'){ alpha = a; continue; }
    if (k === 'beginPath'){ path = []; continue; }
    if (k === 'moveTo' || k === 'lineTo'){ path.push({ k, x: a[0], y: a[1], wood: stroke === WOOD }); continue; }
    if (k === 'arc' && fill === '--ink' && alpha > 0) f.stars.push(a[0] + ',' + a[1]);
    if (k === 'stroke' && stroke === WOOD){
      for (let i = 0; i < path.length; i++) if (path[i].k === 'moveTo' && path[i + 1] && path[i + 1].k === 'lineTo')
        f.beams.push([path[i], path[i + 1]]);
    }
  }
  return f;
}
const onStar = p => starKey.has(p.x + ',' + p.y);
let audited = 0, offStar = [];
function audit(f, where){
  audited++;
  f.beams.forEach(([a, b]) => {
    const post = a.x === b.x && b.y === GROUND;
    const ok = post ? onStar(a) : onStar(a) && onStar(b);
    if (!ok && offStar.length < 3) offStar.push(where + ' (' + a.x + ',' + a.y + ')→(' + b.x + ',' + b.y + ')');
    if (!ok) offStar.n = (offStar.n || 0) + 1;
  });
  return f;
}
const beamSet = f => new Set(f.beams.filter(([a, b]) => !(a.x === b.x && b.y === GROUND)).map(([a, b]) => a.x + ',' + a.y + '-' + b.x + ',' + b.y));
const tickAll = () => [...ivs.values()].forEach(fn => fn());
function adv(sec){ for (let i = 0; i < Math.round(sec * 5); i++){ NOW += 200; tickAll(); } }
const btn = () => el('work'), cap = () => el('caption').textContent, moral = () => el('moral').textContent;
const press = id => handlers[id + ':click']();
const joints = () => +(/接头 (\d+)/.exec(el('meter').textContent) || [0, 0])[1];

// Day 1: work in progress, can't stop yet.
let f = audit(frame(), '开头');
check(f.stars.length === 0 && cap() === (REDUCE ? '今天的活做完了' : '泰克拉，白天，在建'),'③ 开头白天：一颗星也不画；caption: ' + cap());
if (!REDUCE){
  check(btn().disabled && btn().textContent === '还不能停手', '⑤ 刚开工：按钮是灰的「还不能停手」');
  const j0 = joints(); press('work');
  check(btn().disabled && joints() === j0 && frame().stars.length === 0, '⑤ 硬点也不收工，天不黑');
  press('plan');
  check(moral() === '等今天收了工就给你看，现在不能停手。', '⑥ 白天问蓝图: ' + moral());
}
press('why'); check(/^「为了不让毁灭开始。」/.test(moral()), '⑥ 为什么建这么久: ' + moral());
press('down'); check(/不光是城/.test(moral()), '⑥ 拆了会怎样: ' + moral());

let nights = [], prevBeams = null, everyDayMore = true, keptAll = true, dayStarsSeen = 0, starsUnderJoints = true, readyLate = [];
const D = 70;
for (let d = 1; d <= D; d++){
  if (!REDUCE) adv(6);
  const fd = audit(frame(), '第' + d + '天白天');
  dayStarsSeen += fd.stars.length;
  if (btn().disabled || btn().textContent !== '收工') readyLate.push(d);
  const bs = beamSet(fd);
  if (prevBeams){
    if (bs.size <= prevBeams.size) everyDayMore = false;
    for (const b of prevBeams) if (!bs.has(b)){ keptAll = false; break; }
  }
  prevBeams = bs;
  press('work');                                   // 收工
  if (!REDUCE) adv(3.2);
  const fn = audit(frame(), '第' + d + '夜');
  nights.push(fn.stars.slice().sort().join('|'));
  if (d === 1){ check(fn.stars.length === 320, '③ 第 1 夜画了 ' + fn.stars.length + ' 颗星'); check(cap() === '喏，这就是蓝图。', '⑥ 夜里 caption: ' + cap()); press('plan'); check(moral() === '他们指着天：喏，这就是蓝图。', '⑥ 夜里问蓝图: ' + moral()); }
  const drawn = new Set(fn.stars);
  fn.beams.forEach(([a, b]) => { if (!drawn.has(a.x + ',' + a.y)) starsUnderJoints = false; if (!(a.x === b.x && b.y === GROUND) && !drawn.has(b.x + ',' + b.y)) starsUnderJoints = false; });
  press('work');                                   // 天亮，开工
}
check(audited >= 2 * D && !offStar.n, '① ' + audited + ' 帧里每根梁两头都在星上' + (offStar.n ? '；不在的 ' + offStar.n + ' 处，比如 ' + offStar.join('；') : ''));
check(new Set(nights).size === 1, '② ' + D + ' 个夜里画出的星图' + (new Set(nights).size === 1 ? '都一样' : '有 ' + new Set(nights).size + ' 种'));
check(starsUnderJoints, '② 夜里每个接头底下都有一颗画出来的星');
check(dayStarsSeen === 0, '③ ' + D + ' 个白天一颗星也没画（数到 ' + dayStarsSeen + '）');
check(keptAll, '④ 拆不得：每天前一天的梁都还在');
check(everyDayMore, '④ 每天都多：第 ' + D + ' 天梁有 ' + prevBeams.size + ' 根（星只有 320 颗，接头 ' + joints() + '）');
check(joints() === 320 && prevBeams.size > 320 + 60, '④ 星用完了照样上工：接头到 320 以后还在加斜撑');
check(readyLate.length === 0, '⑤ 每天做完五个才变「收工」' + (readyLate.length ? '；没变的天: ' + readyLate.slice(0, 5).join(',') : ''));
if (REDUCE) check(ivs.size === 0, '⑦ 减少动效：没有计时器在跑（' + ivs.size + '）');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 变异自检：for m in 1 2 3 4 5 6 7; do MUT=$m node tests/thekla_test.js cities/thekla.html shared.js >/dev/null; echo "MUT=$m exit=$?"; done
// （MUT=7 要配 REDUCE=1 才抓得到，它弄坏的是减少动效那条路；MUT=5 只在正常动效下抓得到，减少动效时活一开工就做完了，没有「没做完」的时刻。）
