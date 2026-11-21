'use strict';
// Fake time. The page sees performance.now(), Date.now(), requestAnimationFrame,
// setTimeout and setInterval; none of them move unless the test moves them.

function createClock(options = {}) {
  let now = options.start ?? 1000;           // ms, performance.now() origin
  const epoch = options.epoch ?? Date.UTC(2026, 0, 1);
  let frames = new Map(), nextFrame = 1;
  const timers = new Map(); let nextTimer = 1;

  const api = {
    get now() { return now; },
    set now(v) { if (v < now) throw new Error('canvas-spy: time only goes forward'); now = v; },

    performance: { now: () => now, timeOrigin: epoch },
    dateNow: () => epoch + now,

    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },

    setTimeout(fn, ms = 0, ...args) {
      const id = nextTimer++;
      timers.set(id, { fn, at: now + Math.max(0, +ms || 0), args, every: 0 });
      return id;
    },
    setInterval(fn, ms = 0, ...args) {
      const id = nextTimer++;
      const every = Math.max(1, +ms || 0);
      timers.set(id, { fn, at: now + every, args, every });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    clearInterval(id) { timers.delete(id); },

    get pendingFrames() { return frames.size; },
    get pendingTimers() { return timers.size; },

    // Run timers that are due, oldest first. Timers scheduled while running
    // also run if they are due.
    runTimers() {
      let ran = 0;
      for (;;) {
        let best = null;
        for (const [id, t] of timers) if (t.at <= now && (!best || t.at < best[1].at || (t.at === best[1].at && id < best[0]))) best = [id, t];
        if (!best) return ran;
        const [id, t] = best;
        if (t.every) t.at += t.every; else timers.delete(id);
        t.fn(...t.args);
        if (++ran > 10000) throw new Error('canvas-spy: more than 10000 timers in one step; runaway setTimeout?');
      }
    },

    // Run the animation frames that were requested before this call, once.
    // Frames they request go to the next call, like a browser.
    runFrame() {
      const batch = frames; frames = new Map();
      for (const fn of batch.values()) fn(now);
      return batch.size;
    },

    // Move time forward by ms, then run due timers and one animation frame.
    tick(ms = 1000 / 60) {
      api.now = now + ms;
      api.runTimers();
      return api.runFrame();
    },

    // Move forward by ms in steps of `step`, running timers and a frame each step.
    advance(ms, step = 1000 / 60) {
      const end = now + ms;
      while (now + step < end) api.tick(step);
      api.tick(end - now);
    },
  };
  return api;
}

module.exports = { createClock };
