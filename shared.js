// Slow Cities — tiny shared helpers. No dependencies.
(function(){
  // Deterministic random numbers, so a city looks the same every time it is opened.
  function rng(seed){
    return function(){
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function palette(){
    const s = getComputedStyle(document.documentElement);
    const v = n => s.getPropertyValue(n).trim();
    return { sky: v('--sky'), skyHi: v('--sky-hi'), ink: v('--ink'), dim: v('--dim'),
             lamp: v('--lamp'), chalk: v('--chalk'), rule: v('--rule'), display: v('--display') };
  }

  // Draws into a fixed W x H world, scaled to whatever size the canvas is shown at.
  function stage(canvas, W, H, draw){
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function fit(){
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    }
    const now = () => reduce ? 0 : performance.now() / 1000;
    const redraw = () => draw(ctx, now());
    window.addEventListener('resize', () => { fit(); redraw(); });
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    if (!reduce) (function loop(){ redraw(); requestAnimationFrame(loop); })();
    return { ctx, reduce, redraw };
  }

  function figure(ctx, color, x, y, s, sway){
    ctx.save(); ctx.translate(x, y); ctx.rotate(sway || 0); ctx.scale(s, s);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -38, 6, 0, 6.29); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -32); ctx.lineTo(0, -12);
    ctx.moveTo(0, -26); ctx.lineTo(-11, -18); ctx.moveTo(0, -26); ctx.lineTo(11, -34);
    ctx.moveTo(0, -12); ctx.lineTo(-7, 0); ctx.moveTo(0, -12); ctx.lineTo(7, 0);
    ctx.stroke(); ctx.restore();
  }

  // Labels with leader lines. items: [{ at:[x,y], text, lx, ly }].
  // Call this BEFORE drawing the thing being labelled, so the thing covers the ends of the
  // lines and stays exactly as it was. (Despina once drew them after, and its "0 pixels changed"
  // was only true of the bitmap, not of the screen.)
  function annotate(ctx, items, o){
    o = o || {};
    const a = o.alpha == null ? 1 : o.alpha;
    if (a <= .05) return;
    const p = palette();
    ctx.save();
    ctx.font = '400 ' + (o.size || 28) + 'px ' + p.display;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    items.forEach(it => {
      const below = it.ly > it.at[1];
      ctx.globalAlpha = a * .7; ctx.strokeStyle = o.line || p.chalk; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(it.lx, it.ly + (below ? -18 : 18)); ctx.lineTo(it.at[0], it.at[1]); ctx.stroke();
      ctx.globalAlpha = a; ctx.fillStyle = o.color || p.ink;
      ctx.fillText(it.text, it.lx, it.ly);
    });
    ctx.restore();
  }

  window.SC = { rng, palette, stage, figure, annotate };
})();
