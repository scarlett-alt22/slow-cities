// 无头跑 sophronia.html：桩掉 DOM/canvas，记录每次绘图调用，时钟可拨。测试侧注入只读钩子。
// 11-28 补（手工变异 15 个一个都没抓到：录了调用，只数了石头和尖叫）：拖车、各回各的空地、车上缩小、卸货一路飞回来、
// 小地图（车队、「这里」、别处是暗的小摩天轮）、空地的名字和虚线框、拿在手上的房子、摩天轮转木马动、车队走到哪说到哪，
// 和减少动效时定时器照样重画（原来 matchMedia 写死 false，减少动效从没跑过）。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const hook = 'function caption(t){';
if (!src.includes(hook)) throw new Error('hook point missing');
src = src.replace(hook, 'global.__T = { STONE, FAIR, CREST, AWAY, LEAVE, BACK, RATE, GROUND, lotX, slotX, track, carU, caravanAt, CORNER, step, day, loaded, get pieces(){ return pieces; }, get phase(){ return phase; }, get year(){ return year; }, get carry(){ return carry; }, get wobble(){ return wobble; }, get st(){ return st; } };\n  ' + hook);

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
const REDUCE = process.env.REDUCE === '1';
global.window = { matchMedia: () => ({ matches: REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null, createElement: () => mk(null), querySelectorAll: () => [] };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW };
global.requestAnimationFrame = () => {};
let IV = null;
global.setTimeout = () => 1; global.clearTimeout = () => {}; global.setInterval = f => { IV = f; return 1; };
eval(shared); global.SC = window.SC;
eval(src);
const T = global.__T;
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const at = s => { NOW = s * 1000; };
const frame = () => { log = []; T.st.redraw(); return log.slice(); };
const canvas = el('c');
const ptr = (ev, x, y) => canvas.handlers[ev]({ clientX: x, clientY: y, pointerId: 1 });
const stonesDrawn = L => L.filter(l => /^fillRect\(-55\.00,-\d+\.00,110\.00,/.test(l)).length;
const meter = () => el('meter').textContent;

at(1000);
check(T.phase === 'here' && T.loaded() === 0 && /装上车 0 \/ 6/.test(meter()) && stonesDrawn(frame()) === 6, '开头：石头六座都在空地上、画出来 6 座: ' + meter());
const has = (L, re) => L.some(l => re.test(l));
const n2 = v => v.toFixed(2).replace('.', '\\.');
{ const f = frame();
  check(T.STONE.every((p, i) => has(f, new RegExp('^translate\\(' + n2(T.lotX(i) + 55) + ',' + n2(T.GROUND) + '\\)'))), '六座房子各站在自己那块空地上');
  check(T.STONE.every((p, i) => has(f, new RegExp('^fillText\\(' + p.name + ',' + n2(T.lotX(i) + 55) + ','))) && T.STONE.every((p, i) => has(f, new RegExp('^strokeRect\\(' + n2(T.lotX(i)) + ',790\\.00,110\\.00,30\\.00\\)'))), '每块空地下写着名字、画着虚线框');
  check(T.STONE.every((p, i) => has(f, new RegExp('^strokeRect\\(' + n2(T.slotX(i) - 55) + ',888\\.00,110\\.00,12\\.00\\)'))), '路边停着六节拖车');
  check(has(f, /^fillText\(这里,1320\.00,/) && has(f, /^fillRect\(1308\.00,191\.00,24\.00,10\.00\)\|.*\|--lamp$/), '小地图：「这里」，车队停在这里');
  check(T.CORNER.every((c, k) => has(f, new RegExp('^arc\\(' + n2(c[0]) + ',' + n2(c[1]) + ',10\\.00.*\\|' + (k ? '--dim' : '--chalk') + '\\|'))), '小地图：这里的小摩天轮亮、另外三处暗');
  const spokes = L => L.filter((l, i) => i && /^lineTo/.test(l) && /^moveTo\(170\.00,600\.00\)/.test(L[i - 1])).join();
  const horses = L => L.filter(l => /^fillRect\((496|524|553|581|610)\.\d\d,/.test(l) && /--lamp$/.test(l)).join();
  at(1000.5); const fB = frame(); at(1000);
  check(spokes(f) !== spokes(fB) && horses(f) !== horses(fB), '摩天轮在转、木马在上下'); }

// Stone lifts with the hand and goes onto a truck when dropped on the road.
const p2 = T.STONE[2], gx = T.lotX(2) + 55, gy = T.GROUND - 100;
ptr('pointerdown', gx, gy);
check(T.carry === 2 && T.pieces[2].where === 'hand', '按住宫殿：它离开空地、跟着手（carry=2）');
ptr('pointermove', 300, 500);
check(T.pieces[2].hx === 300 && Math.abs(T.pieces[2].hy - (500 + 100)) < 1e-9, '拖动时房子跟着手走（抓的那一点不跳）');
check(has(frame(), /^translate\(300\.00,600\.00\)/), '画面：拿在手上的那座画在手的位置');
ptr('pointerup', 300, 500);
check(T.pieces[2].where === 'lot' && T.loaded() === 0, '放在半空（没到路上）：放回原来的空地，不算装车');
ptr('pointerdown', gx, gy); ptr('pointermove', 1100, 880); ptr('pointerup', 1100, 880);
check(T.pieces[2].where === 'truck' && T.loaded() === 1 && T.pieces[2].slot === 2, '拖到路上放手：装上离得最近的拖车 (slot ' + T.pieces[2].slot + ')');
{ const f = frame(), i = f.findIndex(l => new RegExp('^translate\\(' + n2(T.slotX(2)) + ',888\\.00\\)').test(l)); check(i >= 0 && /^rotate\(/.test(f[i + 1]) && /^scale\(0\.45,0\.45\)/.test(f[i + 2]), '画面：装上车的宫殿缩小了放在拖车上（紧跟着 translate 的那一个 scale）'); }

// The fair can't be picked up: pressing it only makes it wobble, and dragging it to the road loads nothing.
const before = T.loaded();
let fairOk = true;
for (const f of T.FAIR){
  const [x0, y0, x1, y1] = f.box, x = f.kind === 'coaster' ? 560 : (x0 + x1) / 2, y = f.kind === 'coaster' ? 340 : (y0 + y1) / 2 + 40;
  ptr('pointerdown', x, y); ptr('pointermove', 1200, 950); ptr('pointerup', 1200, 950);
  if (T.carry !== null || !T.wobble || T.wobble.kind !== f.kind || T.loaded() !== before || el('caption').textContent !== f.say){ fairOk = false; console.log('   ', f.kind, T.carry, T.wobble && T.wobble.kind); }
}
check(fairOk, '摩天轮/帐篷/木马/过山车：按住只晃、拖到路上也装不上车，说明对得上各自那句');

// The wobble is drawn, not only recorded: the wheel's pivot rotation is non-zero just after a press, zero later.
const rot = L => L.filter(l => /^rotate\(/.test(l) && !/^rotate\(0\.00\)/.test(l) && !/^rotate\(-0\.00\)/.test(l)).length;
at(2000); ptr('pointerdown', 170, 600); at(2000.05); const w1 = frame(); at(2003); const w2 = frame();
check(rot(w1) > rot(w2), '摩天轮被按住那一刻画面真的在晃（非零旋转 ' + rot(w1) + ' → 过后 ' + rot(w2) + '）');

// The car runs while the stone half is here.
at(3000); const u1 = T.carU(3000); at(3001.3); const u2 = T.carU(3001.3);
check(u1 !== u2, '石头那半在的时候过山车一直在跑');
check(!frame().some(l => l.startsWith('fillText(啊——')), '石头那半在的时候没有悬在半空的尖叫');

// Load the rest with the button; the caravan leaves.
for (let i = 0; i < 10; i++) el('load').handlers.click();
check(T.loaded() === 6 && T.phase === 'leaving' && el('load').disabled, '装满六座：车队出发，按钮变灰');
const tLeave = 3001.3;
at(tLeave + T.LEAVE + .01); T.step();
check(T.phase === 'away' && stonesDrawn(frame()) === 0, '车队走了：画面上一座石头房子都没有');
const tAway = tLeave + T.LEAVE + .01;
{ const LEG = 21, STAY = 70; check(T.AWAY === 4 * LEG + 3 * STAY, '一年在外 ' + T.AWAY + ' 天＝四段路三次停留');
  const want = d => d < LEG ? /往第 1 块别的空地去/ : d < LEG + STAY ? /停在第 1 块别的空地上/ : d < 2 * LEG + STAY ? /往第 2 块别的空地去/ : d >= 3 * LEG + 3 * STAY ? /回来的路上/ : null;
  let ok = true, bad = [];
  for (const d of [10, 50, 100, 280]){ at(tAway + (d + .5) / T.RATE); T.step(); const c = el('caption').textContent; if (!want(d).test(c)){ ok = false; bad.push(d + ':' + c); } }
  check(ok, '车队走到哪、说明就说到哪（第 10/50/100/280 天）' + bad.join(' '));
  at(tAway + 50.5 / T.RATE); T.step(); const p = T.caravanAt();
  check(has(frame(), new RegExp('^fillRect\\(' + n2(p[0] - 12) + ',' + n2(p[1] - 5) + ',24\\.00,10\\.00\\)')) && p[0] !== T.CORNER[0][0], '小地图：车队画在它此刻所在的地方');
  if (REDUCE){ at(tAway + 60.5 / T.RATE); log = []; IV(); check(log.length > 0, '减少动效：定时器每次都重画，日子照样往下走'); } }
at(tAway + 10); T.step(); frame();
check(T.day() === 120 && new RegExp('走了 120 天 · 还有 ' + (T.AWAY - 120) + ' 天回来').test(meter()), '日子往下数: ' + meter());
ptr('pointerdown', T.lotX(0) + 55, T.GROUND - 50);
check(T.carry === null, '车队不在时空地上抓不到东西');
// The car goes on to the crest and waits there; the scream hangs.
at(tAway + 20); T.step(); const fa = frame();
check(T.carU(tAway + 20) === T.CREST && fa.some(l => l.startsWith('fillText(啊——')), '车队走后过山车停在最高处、尖叫挂在那里');
const [cx, cy] = T.track(T.CREST);
check(cy <= Math.min(...Array.from({ length: 701 }, (_, k) => T.track(k / 700)[1])) + 1e-9, '它停的地方不比轨道上任何一处低 (y=' + cy.toFixed(2) + ')');
// The caravan on the little map visits the other three lots.
const seen = new Set();
for (let d = 0; d < T.AWAY; d += 3){ at(tAway + d / T.RATE); const p = T.caravanAt(); T.CORNER.forEach((c, k) => { if (p[0] === c[0] && p[1] === c[1]) seen.add(k); }); }
check([1, 2, 3].every(k => seen.has(k)), '小地图：车队在另外三块空地都停过 (' + [...seen].join(',') + ')');

// It comes back, unloads onto the lots, and the year turns.
at(tAway + T.AWAY / T.RATE + .01); T.step();
check(T.phase === 'back', '日子数完：车队开回来');
{ const tb = tAway + T.AWAY / T.RATE + .01; at(tb + T.BACK * .8); const f = frame();
  check(has(f, /^translate\(\d+\.\d\d,854\.00\)/) && has(f, /^scale\(0\.7\d,0\.7\d\)/), '卸货：房子从车上一路飞回空地（半路上、半大）'); }
at(tAway + T.AWAY / T.RATE + .01 + T.BACK + .01); T.step(); const fb = frame();
check(T.phase === 'here' && T.year === 2 && T.loaded() === 0 && stonesDrawn(fb) === 6 && T.pieces.every(p => p.where === 'lot'), '卸完货：六座回到空地，第 2 年: ' + meter());
check(Math.abs(T.carU(NOW / 1000) - T.CREST) < 1e-6 && !el('load').disabled, '过山车从最高处冲下去（不是瞬移），按钮又能按了');
check(el('moral').textContent.startsWith('车队要绕过另外三块空地'), '转过一年后出现最后那段话');

// 11-07 observation fixes: track keeps clear of the wheel; little wheels sit on their corners.
{ let worst = 1e9; for (let k = 0; k <= 1000; k++){ const [x, y] = T.track(k / 1000); worst = Math.min(worst, Math.hypot(x - 170, y - 600)); }
  check(worst >= 128 + 20, 'track stays outside the wheel (closest ' + worst.toFixed(1) + ' px from hub)'); }
check(T.track(T.CREST)[0] > 500 && T.track(T.CREST)[0] < 620, 'crest still at the tall hill, x=' + T.track(T.CREST)[0].toFixed(1));
{ const fm = frame(); check(T.CORNER.every(c => fm.some(l => l.startsWith('arc(' + c[0].toFixed(2) + ',' + c[1].toFixed(2) + ',10.00'))), 'each map wheel is centred on its corner'); }

console.log(fail ? '失败 ' + fail : '全过');
process.exit(fail ? 1 : 0);
