#!/usr/bin/env python3
"""Contact sheet: one picture of a city's animation at several moments, so motion bugs can be seen.

The page's clock (performance.now) is pinned and then walked forward in small steps, redrawing at
each step, so a city that changes phase on its own (Sophronia's caravan) passes through every phase
just as it would in a browser. Nothing in the city's file changes; the copy lives in a temp folder.

  python3 tools/contact-sheet.py cities/sophronia.html out.png --do load*6 --at 0 1 2 3.5 13 30
  python3 tools/contact-sheet.py cities/zenobia.html out.png --do ask*3 --at 0 .3 .6 .9 1.2 1.6
  python3 tools/contact-sheet.py cities/sophronia.html phone.png --phone --at 0

--do clicks buttons (by id) before the clock starts, e.g. "ask*3" or "load*2,reset".
--phone shows the page at 375 px wide (a headless window can't be narrower than 500).
Uses Chrome headless with its own throwaway profile, never the everyday one.
"""
import argparse, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

PIN = '<script>(function(){window.__pin=1000;performance.now=()=>window.__pin;})()</script>\n'
DRIVE = '''<script>(function(){
  const h = new URLSearchParams(location.hash.slice(1));
  for (const step of (h.get('do') || '').split(',').filter(Boolean)){
    const [id, n] = step.split('*'), el = document.getElementById(id);
    if (!el) throw new Error('no button #' + id);
    for (let i = 0; i < (+n || 1); i++) el.click();
  }
  const t = +(h.get('t') || 0);
  // Walk the clock forward in 50 ms steps, redrawing each time, then land exactly on t.
  for (let s = 0; s < t; s += .05){ window.__pin = 1000 + s * 1000; dispatchEvent(new Event('resize')); }
  window.__pin = 1000 + t * 1000; dispatchEvent(new Event('resize'));
})()</script>
'''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('page'); ap.add_argument('out')
    ap.add_argument('--do', default='')
    ap.add_argument('--at', nargs='+', type=float, default=[0])
    ap.add_argument('--phone', action='store_true')
    a = ap.parse_args()

    tmp = tempfile.mkdtemp(prefix='contact-sheet-')
    try:
        os.makedirs(os.path.join(tmp, 'cities'))
        for f in ('shared.js', 'shared.css'): shutil.copy(os.path.join(ROOT, f), tmp)
        html = open(os.path.join(ROOT, a.page), encoding='utf-8').read()
        anchor = '<script src="../shared.js"></script>'
        if html.count(anchor) != 1 or html.count('</body>') != 1: sys.exit('page has no single shared.js tag / </body>')
        html = html.replace(anchor, PIN + anchor).replace('</body>', DRIVE + '</body>')
        open(os.path.join(tmp, 'cities', 'pin.html'), 'w', encoding='utf-8').write(html)

        w = 375 if a.phone else 800
        cells = ''.join('<figure><iframe src="cities/pin.html#do=%s&t=%g"></iframe><figcaption>t = %gs</figcaption></figure>' % (a.do, t, t) for t in a.at)
        cols = min(3, len(a.at))
        sheet = ('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(%d,%dpx);gap:6px;'
                 'color:#ccc;font:20px sans-serif}figure{margin:0}iframe{width:%dpx;height:%dpx;border:0}</style>%s') % (cols, w, w, 1500 if a.phone else 1150, cells)
        open(os.path.join(tmp, 'sheet.html'), 'w', encoding='utf-8').write(sheet)

        rows = (len(a.at) + cols - 1) // cols
        size = '%d,%d' % (max(500, cols * (w + 6)), rows * ((1500 if a.phone else 1150) + 36))
        out = os.path.abspath(a.out)
        r = subprocess.run([CHROME, '--headless=new', '--user-data-dir=' + os.path.join(tmp, 'profile'), '--allow-file-access-from-files',
                            '--hide-scrollbars', '--window-size=' + size, '--virtual-time-budget=4000', '--screenshot=' + out,
                            'file://' + os.path.join(tmp, 'sheet.html')], capture_output=True, text=True, timeout=90)
        if not os.path.exists(out): sys.exit('no screenshot written:\n' + r.stderr[-800:])
        print(out, size)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == '__main__':
    main()
