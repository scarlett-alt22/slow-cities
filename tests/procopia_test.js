// 无头跑 procopia.html：桩掉 DOM/canvas，一下一下按「又一年」，每一步录下画出来的绘图调用。
// 画面从调用里读：测试往页面代码里插三种记号——每画一张脸前 face(x,y)、每画一样风景前 item(名字)、画屋里前 room——
// 数脸、看位置、看哪样风景还画着；天的蓝色另外从 fillStyle 里直接认，不靠记号。
// 检查（书里的数写在这个文件里，不从页面读）：
// ① 前七步窗里的脸（鸡舍里的不算）正好是 0、1、3、6、16、29、47；鸡舍里的脸到第七步才有
// ② 脸只多不少：每一步的脸，位置一个不差地都还在下一步里（到「连天都没了」为止）
// ③ 风景一样样被挡住，挡住的不再回来；近处先、远处后，天最后；天没了那一步一样风景都不剩
// ④ 天的蓝色：天还在就画，天没了就一笔不画
// ⑤ 屋里那一步：正好 26 张脸、没有一样风景、没有蓝天；meter 说 26，moral 是「幸好大家都很有礼貌」
// ⑥ meter：前七步报的数就是书里的数；之后书不报数，页面也不带任何数字
// ⑦ 从头再来：回到第一步，画面跟刚打开时逐个调用一样
// ⑧ 缓存：同一步再重画一次，只是把缓存贴上去，一张脸都不重画
// 变异（自检用）：MUT=1..8 各弄坏一处，这个文件必须以非 0 退出。跑法见文件末尾注释。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("rowan: 8, bridge: 4, corn: 5 }", "rowan: 8, bridge: 4, corn: 6 }");
if (MUT === '2') swap("{ n: null, fill: [470, 300], gone: FRONT.concat(MIDDLE),", "{ n: null, fill: [470, 300], gone: FRONT.concat(MIDDLE, BACK),");
if (MUT === '3') swap("SPOTS[k].slice(0, n[k])", "SPOTS[k].slice(step % 2, n[k] + step % 2)");
if (MUT === '4') swap("for (let i = 0; i < 14; i++) out.push", "for (let i = 0; i < 13; i++) out.push");
if (MUT === '5') swap("{ n: null, fill: [470, 300, WY0], gone: FRONT.concat(MIDDLE, BACK),", "{ n: null, fill: [470, 300, WY0], gone: FRONT.slice(1).concat(MIDDLE, BACK),");
if (MUT === '6') swap("{ n: null, fill: [470], gone: FRONT, m: '数不清了，只会比看得见的多',", "{ n: null, fill: [470], gone: FRONT, m: '大概 60 张',");
if (MUT === '7') swap("if (key !== cacheKey){", "if (true){");
if (MUT === '8') swap("bramble: 3, henhouse: 5 }", "bramble: 2, henhouse: 6 }");

function hook(a, b){ if (!inline.includes(a)) throw new Error('hook point missing: ' + a); inline = inline.replace(a, b); }
hook("  function face(ctx, x, y, r){\n", "  function face(ctx, x, y, r){\n    ctx.__mark('face', x, y);\n");
hook("for (const k of ORDER) if (!gone.has(k)) SCENE[k](ctx);", "for (const k of ORDER) if (!gone.has(k)){ ctx.__mark('item', k); SCENE[k](ctx); }");
hook("  function room(ctx){\n", "  function room(ctx){\n    ctx.__mark('room');\n");
hook("  let step = 0;", "  let step = 0; global.__T = { PLACES, get redraw(){ return st.redraw; } };");

const BOOK = [0, 1, 3, 6, 16, 29, 47];       // 连绵的城市之三：没有人；一张脸；三个，回程时六个；十六；二十九；四十七
const ROOM_N = 26;
const SKY_BLUE = /#6f9cc8/i;
const W = 1600, H = 1000;
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({ canvas: { width: 1600, height: 1000 } }, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { calls.push([String(k), a]); return { addColorStop(){} }; };
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
const offscreen = { width: 0, height: 0, getContext(){ return ctx; } };
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, createElement: () => offscreen, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T, HH = T.PLACES.henhouse;
const inHen = p => p[0] >= HH.x0 - 1 && p[0] <= HH.x1 + 1 && p[1] >= HH.y0 - 1 && p[1] <= HH.y1 + 1;

function read(cs){
  const faces = [], items = []; let room = false, blue = false, blits = 0;
  for (const [k, a] of cs){
    if (k === '__mark'){ if (a[0] === 'face') faces.push([a[1], a[2]]); else if (a[0] === 'item') items.push(a[1]); else if (a[0] === 'room') room = true; }
    if (k === '=fillStyle' && SKY_BLUE.test(String(a))) blue = true;
    if (k === 'drawImage') blits++;
  }
  const from = cs.findIndex(c => c[0] === 'createLinearGradient');      // the painting itself, not the page-load fit()
  return { faces, items, room, blue, blits, sig: cs.slice(Math.max(0, from)).map(c => c[0] + JSON.stringify(c[1])).join('\n'),
           meter: el('meter').textContent, moral: el('moral').textContent, button: el('go').textContent, caption: el('caption').textContent };
}
const press = () => { calls = []; handlers['go:click'](); return read(calls); };

const first = read(calls);
const S = [first];
for (let i = 1; i <= 10; i++) S.push(press());
const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);

// ①
const counted = S.slice(0, 7).map(s => s.faces.filter(p => !inHen(p)).length);
check(counted.join() === BOOK.join(), '① 前七步窗里的脸（鸡舍里的不算）: ' + counted.join('、') + '；书里: ' + BOOK.join('、'));
const hen = S.slice(0, 7).map(s => s.faces.filter(inHen).length);
check(hen.slice(0, 6).every(n => n === 0) && hen[6] > 0, '① 鸡舍里的脸第七步才有（' + hen[6] + ' 张），之前一张没有');

// ②
let sub = true, where = '';
for (let i = 0; i < 9; i++){
  const next = new Set(S[i + 1].faces.map(key));
  const lost = S[i].faces.filter(p => !next.has(key(p)));
  if (lost.length){ sub = false; where = '第 ' + (i + 1) + '→' + (i + 2) + ' 步丢了 ' + lost.length + ' 张'; break; }
}
const fc = S.slice(0, 10).map(s => s.faces.length);
check(sub && fc.every((n, i) => i === 0 || n >= fc[i - 1]), '② 脸只多不少、原来的脸都在原处（各步: ' + fc.join(' ') + '）' + (where ? '；' + where : ''));

// ③
const vis = S.slice(0, 10).map(s => new Set(s.items));
let shrink = true; for (let i = 1; i < 10; i++) for (const k of vis[i]) if (!vis[i - 1].has(k)) shrink = false;
check(shrink, '③ 挡住的风景不再回来（各步还看得见的: ' + vis.map(v => v.size).join(' ') + '）');
const FRONT = ['ditch', 'wall', 'rowan', 'corn', 'bramble'], MID = ['bridge', 'henhouse', 'hill'], BACK = ['cloud', 'sky'];
const goneAt = k => vis.findIndex(v => !v.has(k));
const gf = Math.max(...FRONT.map(goneAt)), gm = Math.min(...MID.map(goneAt)), gm2 = Math.max(...MID.map(goneAt)), gb = Math.min(...BACK.map(goneAt));
check(vis[0].size === 10 && gf > 0 && gf <= gm && gm2 <= gb, '③ 近处先挡、远处后挡：近处最晚第 ' + (gf + 1) + ' 步，中间第 ' + (gm + 1) + '–' + (gm2 + 1) + ' 步，云和天第 ' + (gb + 1) + ' 步起');
const skyGone = goneAt('sky');
check(skyGone === 9 && vis.slice(0, 9).every(v => v.has('sky')) && vis[9].size === 0, '③ 天是最后一样：一直到第 9 步都在，第 10 步没了，那一步一样风景都不剩');

// ④
check(S.slice(0, 10).every((s, i) => s.blue === vis[i].has('sky')), '④ 天的蓝色只在天还在的时候画（' + S.slice(0, 10).map(s => s.blue ? '蓝' : '—').join('') + '）');

// ⑤
const R = S[10];
check(R.room && R.faces.length === ROOM_N && R.items.length === 0 && !R.blue, '⑤ 屋里那一步：' + R.faces.length + ' 张脸，风景 ' + R.items.length + ' 样，蓝天 ' + (R.blue ? '有' : '没有'));
check(/26/.test(R.meter) && R.moral === '幸好大家都很有礼貌。', '⑤ meter「' + R.meter + '」，moral「' + R.moral + '」');
check(S.slice(0, 10).every(s => !s.room && s.moral !== '幸好大家都很有礼貌。'), '⑤ 之前没有一步画了屋里，也没有一步说「幸好」');

// ⑥
const meters = S.map(s => s.meter);
check(BOOK.every((n, i) => (meters[i].match(/\d+/g) || []).join() === String(n)), '⑥ 前七步 meter 报的数就是书里的数: ' + meters.slice(0, 7).join(' ｜ '));
check(meters.slice(7, 10).every(m => !/\d/.test(m)), '⑥ 之后三步不带数字: ' + meters.slice(7, 10).map(m => '「' + m + '」').join(' '));

// ⑦
const again = press();
check(again.sig === first.sig && again.meter === first.meter && again.caption === first.caption, '⑦ 从头再来：画面和文字跟刚打开时一样（' + first.sig.split('\n').length + ' 个调用逐个相同）');

// ⑧
calls = []; T.redraw(); const re = read(calls);
check(re.faces.length === 0 && re.items.length === 0 && re.blits === 1, '⑧ 同一步重画只贴一次缓存（重画了 ' + re.faces.length + ' 张脸，贴图 ' + re.blits + ' 次）');

// button labels follow the book's beats
check(S[2].button === '回程时再看一眼' && S[9].button === '离开窗户' && S[10].button === '从头再来', '按钮：第三年之后「' + S[2].button + '」，天没了之后「' + S[9].button + '」，屋里之后「' + S[10].button + '」');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 变异自检：for m in 1 2 3 4 5 6 7 8; do MUT=$m node tests/procopia_test.js cities/procopia.html shared.js >/dev/null; echo "MUT=$m exit=$?"; done
