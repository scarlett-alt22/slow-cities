// 无头跑 valdrada.html：桩掉 DOM/canvas；测试侧注入一个只读钩子看那个人在哪（页面本身不带钩子）。
// 规则由测试自己写死（水线 540，四层街 470/380/290/200），不借页面的 mirrorY/LEVELS 作证。
// 检查：①拖岸上那个、拖水里那个都能动，另一个跟着 ②两双脚永远隔着 ≥140（岸壁和它的倒影），岸上的脚不下水、水里的不上岸
// ③水里那座是整幅上下翻（translate(0,1080)+scale(1,-1)），不左右翻，人画两次在同一个 x
// ③b 读画面：岸壁、两边房子一样多、水面的纱半透明、水线压在最上 ③c 抓头拖不跳层、meter 街数
// ④没有计数、没有「回到……」按钮 ⑤按钮、方向键、点空处、左右边界
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, 'global.__T = { get man(){ return man; } };\n  ' + hook);

const WL = 540, FEET = [470, 380, 290, 200];
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ t[k] = v; calls.push(['=' + String(k), [v]]); return true; } });
global.window = { matchMedia: () => ({ matches: process.env.REDUCE === '1' }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
global.performance = { now: () => 1234 };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
const figs = []; const realFigure = SC.figure;
SC.figure = (c, col, x, y, s, sw) => { figs.push([x, y]); return realFigure(c, col, x, y, s, sw); };
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T;
const shoreFeet = () => FEET[T.man.l];
const waterFeet = () => 2 * WL - shoreFeet();
const down = (x, y) => handlers['c:pointerdown']({ clientX: x, clientY: y, pointerId: 1 });
const move = (x, y) => handlers['c:pointermove']({ clientX: x, clientY: y });
const up = () => handlers['c:pointerup']({});

check(T.man.l === 2 && /第三层街/.test(el('meter').textContent), '开头在第三层街: ' + el('meter').textContent);

// ① drag the man on the shore down to the quay
down(T.man.x, shoreFeet() - 40); move(900, 475); up();
check(T.man.x === 900 && T.man.l === 0, '拖岸上那个到岸沿 (x=' + T.man.x + ' l=' + T.man.l + ')');
check(/岸沿/.test(el('meter').textContent) && /对望/.test(el('moral').textContent), '岸沿时 meter/moral 换了: ' + el('moral').textContent.slice(0, 20));
check(el('down').disabled && !el('up').disabled, '在岸沿：「走到水边」不可按');

// ① drag the one in the water (the test finds him by its own rule: 2*WL - feet)
const wy = waterFeet();
check(wy === 610, '水里那个的脚在 610（按测试自己的规则）');
down(900, wy + 40); move(700, 2 * WL - 200); up();
check(T.man.l === 3 && T.man.x === 700, '拖水里那个往深处 → 岸上那个上到最高层 (l=' + T.man.l + ' x=' + T.man.x + ')');
check(/照样跟着走/.test(el('moral').textContent) && !/一举一动/.test(el('moral').textContent), '拖过水里那个后 moral 换成 water 那句（不是 walk 那句）');
check(/你拖的是水里那个/.test(el('caption').textContent), 'caption 说拖的是水里那个');

// ② never touch: try to drag the shore man into the water and the reflection onto the shore
let minGap = Infinity, wet = false, dry = false;
// 读页面真画出来的脚高（SC.figure 收到的 y），不是测试自己按层号算的——否则岸壁改矮了也看不出
const drawnFeet = () => { if (!figs.length) throw new Error('nothing drawn'); return figs[figs.length - 1][1]; };
const probe = () => { const f = drawnFeet(), g = (2 * WL - f) - f; minGap = Math.min(minGap, g); if (f > WL - 70) wet = true; if (2 * WL - f < WL + 70) dry = true; };
down(T.man.x, shoreFeet() - 40);
for (let y = 100; y <= 1000; y += 25){ move(800, y); probe(); }
up();
down(T.man.x, waterFeet() + 40);
for (let y = 1000; y >= 0; y -= 25){ move(800, y); probe(); }
up();
check(minGap === 140, '两双脚最近隔 140（岸壁 70＋倒影 70），从不更近: ' + minGap);
check(!wet && !dry, '岸上的脚没下水，水里的脚没上岸');

// ③ the reflection is the whole drawing turned upside down, not left-right
calls = []; figs.length = 0;
handlers['up:click']();
const tr = calls.findIndex(c => c[0] === 'translate' && c[1][0] === 0 && c[1][1] === 2 * WL);
const nx = calls[tr + 1];
check(tr >= 0 && nx && nx[0] === 'scale' && nx[1][0] === 1 && nx[1][1] === -1, '倒影＝translate(0,1080) 后紧跟 scale(1,-1)');
check(calls.filter(c => c[0] === 'scale' && c[1][0] < 0).length === 0, '没有任何左右翻');
check(figs.length >= 2 && figs.filter(f => f[0] === T.man.x && f[1] === shoreFeet()).length === 2 && figs.length === 2, '人画了两次，同一个 x、同一个脚高（翻转交给变换）: ' + JSON.stringify(figs));
const clipBefore = calls.slice(0, tr).some(c => c[0] === 'clip');
check(clipBefore, '倒影只画在水线以下（先 clip）');
check(T.man.l === 3 && /最高的那层街/.test(el('meter').textContent), '「走上高处」一下到最高那层: l=' + T.man.l);

// ③b read the picture, not just the transform: the quay wall, the houses on both sides, the veil, the waterline
const rs = calls.findIndex((c, i) => i > tr && c[0] === 'restore');
const shoreCalls = calls.slice(0, tr), waterCalls = calls.slice(tr, rs), after = calls.slice(rs);
const isRect = (c, a) => c[1].length === 4 && a.every((v, i) => c[1][i] === v);
check(shoreCalls.some(c => c[0] === 'fillRect' && isRect(c, [0, 470, 1600, 70])), '岸上画了岸壁：从岸沿 470 一直到水线 540 的整条墙');
const houses = cs => cs.filter(c => c[0] === 'strokeRect').length;
check(houses(shoreCalls) >= 20 && houses(waterCalls) === houses(shoreCalls), '岸上的房子都画了，水里一座不少: ' + houses(shoreCalls) + '/' + houses(waterCalls));
// the veil over the water must stay see-through, or the other Valdrada is painted over
let alpha = 1, veil = null;
for (const c of after){ if (c[0] === '=globalAlpha') alpha = c[1][0]; if (c[0] === 'fillRect' && isRect(c, [0, 540, 1600, 460])){ veil = alpha; break; } }
check(veil !== null && veil > 0 && veil <= .6, '水面那层纱是半透明的，倒影透得出来: alpha=' + veil);
const wlIdx = after.findIndex((c, i) => c[0] === 'moveTo' && c[1][0] === 0 && c[1][1] === 540 && after[i + 1] && after[i + 1][0] === 'lineTo' && after[i + 1][1][0] === 1600 && after[i + 1][1][1] === 540);
check(wlIdx >= 0 && after.slice(wlIdx).some(c => c[0] === 'stroke'), '最后在倒影和纱之上画了水线');

// ③c grabbing the head must not make him jump a street (the grab offset is kept)
handlers['down:click'](); handlers['c:keydown']({ key: 'ArrowUp' });
const l1 = T.man.l, hx = T.man.x;
down(hx, shoreFeet() - 100); move(hx, shoreFeet() - 100); up();
check(T.man.l === l1, '抓岸上那个的头、原地不动，他不跳层: ' + l1 + '→' + T.man.l);
down(hx, waterFeet() + 100); move(hx, waterFeet() + 100); up();
check(T.man.l === l1, '抓水里那个的头、原地不动，他不跳层: ' + l1 + '→' + T.man.l);
check(el('meter').textContent.includes('：' + l1 + ' 层街'), 'meter 里两双脚之间的街数＝他所在的层号: ' + el('meter').textContent);

// ④ no counter that never moves, no "回到……"
check(!/回到/.test(html) && !/ 0 /.test(el('meter').textContent), '没有「回到……」，计数行里没有恒 0');

// ⑤ buttons, keys, empty clicks
handlers['down:click']();
check(T.man.l === 0 && /岸沿/.test(el('caption').textContent), '「走到水边」');
const x0 = T.man.x;
handlers['c:keydown']({ key: 'ArrowUp' }); handlers['c:keydown']({ key: 'ArrowRight' });
check(T.man.l === 1 && T.man.x === x0 + 40, '方向键 ↑ →');
handlers['c:keydown']({ key: 'ArrowDown' }); handlers['c:keydown']({ key: 'ArrowDown' });
check(T.man.l === 0, '方向键 ↓ 到岸沿就停');
const before = JSON.stringify(T.man);
down(100, 100); move(1400, 900); up();
check(JSON.stringify(T.man) === before, '点空处拖不动任何人');
for (let i = 0; i < 40; i++) handlers['c:keydown']({ key: 'ArrowLeft' });
check(T.man.x === 90, '不出左边界: ' + T.man.x);
for (let i = 0; i < 40; i++) handlers['c:keydown']({ key: 'ArrowRight' });
check(T.man.x === 1510, '不出右边界: ' + T.man.x);

console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
