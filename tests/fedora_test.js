// 无头跑 fedora.html：桩掉 DOM/canvas。
// 检查：①封球时城恰好变 3–5 栋 ②城怎么变跟草图无关（两种草图、同一时代 → 同一座城）
// ③球里存的是封之前的草图，封完草图重置成新城 ④拖画只改点到的那一栋 ⑤画图不抛错
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function boot(reduce){
  const els = {}, handlers = {};
  function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false,
    addEventListener(ev, f){ handlers[id + ':' + ev] = f; }, setPointerCapture(){},
    getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
  let calls = 0;
  const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop(){} }); return (...a) => { calls++; for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); }; }, set(t, k, v){ t[k] = v; return true; } });
  global.window = { matchMedia: () => ({ matches: reduce }), addEventListener(){}, devicePixelRatio: 1 };
  global.document = { getElementById: el, documentElement: {}, fonts: null };
  global.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = () => {};
  const timers = []; global.setTimeout = (f) => { timers.push(f); return timers.length; }; global.clearTimeout = () => {};
  eval(shared); global.SC = window.SC;
  eval(inline);
  return { el, handlers, timers, calls: () => calls, flush(){ while (timers.length) timers.shift()(); } };
}
let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const changed = cap => +(cap.match(/有 (\d+) 栋/) || [0, -1])[1];

// A: never touch the sketch, seal 7 times.
const A = boot(false); const capsA = [];
for (let i = 0; i < 7; i++){ A.handlers['seal:click'](); check(A.el('seal').disabled, '封球期间按钮禁用 #' + (i + 1)); A.flush(); capsA.push(A.el('caption').textContent); }
check(capsA.every(c => changed(c) >= 3 && changed(c) <= 5), '每次封球城变 3–5 栋: ' + capsA.map(changed).join(' '));
check(/跟城一样的球 0 只/.test(A.el('meter').textContent), 'meter: ' + A.el('meter').textContent);
check(A.el('moral').textContent.startsWith('大的菲朵拉'), '第 6 只以后出 DONE');

// B: same eras, but paint wild sketches first. City changes must be identical to A.
const B = boot(false); const capsB = [];
for (let i = 0; i < 7; i++){
  for (let x = 130; x < 1480; x += 40) B.handlers['c:pointerdown']({ clientX: x, clientY: 500 + (x % 300), pointerId: 1 });
  B.handlers['seal:click'](); B.flush(); capsB.push(B.el('caption').textContent);
}
check(JSON.stringify(capsA.map(changed)) === JSON.stringify(capsB.map(changed)), '城的变化跟草图无关（A/B 一致）');

// C: painting one column changes exactly one; sealing stores the sketch, then resets it.
const C = boot(true);
C.handlers['c:pointerdown']({ clientX: 120 + 85 * 5 + 10, clientY: 300, pointerId: 1 }); C.handlers['c:pointerup']();
check(C.el('caption').textContent === '你改了 1 栋。', '点一栋只改一栋: ' + C.el('caption').textContent);
C.handlers['c:pointermove']({ clientX: 900, clientY: 300 });
check(C.el('caption').textContent === '你改了 1 栋。', '松手后移动不再画');
C.handlers['c:pointerdown']({ clientX: 800, clientY: 150, pointerId: 1 });
check(C.el('caption').textContent === '你改了 1 栋。', '点在架子上不算');
C.handlers['seal:click'](); C.flush();
check(/玻璃球 1 只 · 石头城换过 1 个样子/.test(C.el('meter').textContent), 'reduce 模式立即封好: ' + C.el('meter').textContent);
C.handlers['c:pointerdown']({ clientX: 120 + 85 * 9 + 10, clientY: 930 - 70, pointerId: 1 });
check(/^(你改了 1 栋。|跟今天的城一模一样。)$/.test(C.el('caption').textContent), '封完草图重置成新城，再点只差 ≤1 栋: ' + C.el('caption').textContent);
C.handlers['reset:click']();
check(C.el('meter').textContent.startsWith('玻璃球 0 只 · 石头城换过 0'), 'reset');
console.log('绘图调用', A.calls(), B.calls(), C.calls(), fail ? '\n失败 ' + fail : '\n全过');
process.exit(fail ? 1 : 0);
