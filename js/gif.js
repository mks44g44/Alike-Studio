/* Alike Studio — animated GIF encoder (median-cut palette, LZW, transparency, looping) */
(function (A) {
  'use strict';

  function medianCut(pixels, maxColors) { // pixels: Uint32Array of 0xRRGGBB
    if (!pixels.length) return [[0, 0, 0]];
    let boxes = [pixels];
    const range = (b) => {
      let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
      for (let i = 0; i < b.length; i++) { const c = b[i], r = c >> 16, g = (c >> 8) & 255, bl = c & 255;
        if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (bl < b0) b0 = bl; if (bl > b1) b1 = bl; }
      return [r1 - r0, g1 - g0, b1 - b0];
    };
    while (boxes.length < maxColors) {
      let bi = -1, best = -1, ch = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; const rg = range(b), m = Math.max(...rg); const score = m * Math.log(b.length + 1); if (score > best) { best = score; bi = i; ch = rg.indexOf(m); } });
      if (bi < 0 || best <= 0) break;
      const b = boxes[bi], shift = [16, 8, 0][ch];
      const sorted = Array.from(b).sort((x, y) => ((x >> shift) & 255) - ((y >> shift) & 255));
      const mid = sorted.length >> 1;
      boxes.splice(bi, 1, Uint32Array.from(sorted.slice(0, mid)), Uint32Array.from(sorted.slice(mid)));
    }
    return boxes.filter((b) => b.length).map((b) => {
      let r = 0, g = 0, bl = 0;
      for (let i = 0; i < b.length; i++) { r += b[i] >> 16; g += (b[i] >> 8) & 255; bl += b[i] & 255; }
      return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)];
    });
  }

  function lzw(indices, minCode, out) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, dict = new Map();
    let cur = 0, bits = 0; const bytes = [];
    const write = (code) => { cur |= code << bits; bits += size; while (bits >= 8) { bytes.push(cur & 255); cur >>>= 8; bits -= 8; } };
    write(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = prefix * 256 + k, code = dict.get(key);
      if (code !== undefined) { prefix = code; continue; }
      write(prefix);
      if (next === 4096) { write(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
      else { if (next >= 1 << size) size++; dict.set(key, next++); }
      prefix = k;
    }
    write(prefix); write(eoi);
    if (bits > 0) bytes.push(cur & 255);
    out.push(minCode);
    for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(bytes[i + j]); }
    out.push(0);
  }

  /* frames: canvases of equal size. opts: { delay (1/100 s), loop (0 = forever), background (css color or null) } */
  function encode(frames, opts = {}) {
    const W = frames[0].width, H = frames[0].height;
    let bg = null;
    if (opts.background) { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = opts.background; c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; bg = [d[0], d[1], d[2]]; }
    const datas = frames.map((f) => f.getContext('2d').getImageData(0, 0, W, H).data);
    const comp = (d, i) => { // composite pixel → [r,g,b,transparent]
      const a = d[i + 3];
      if (bg) { const f = a / 255; return [Math.round(d[i] * f + bg[0] * (1 - f)), Math.round(d[i + 1] * f + bg[1] * (1 - f)), Math.round(d[i + 2] * f + bg[2] * (1 - f)), false]; }
      return [d[i], d[i + 1], d[i + 2], a < 128];
    };
    // sample for palette
    const total = W * H * frames.length, step = Math.max(1, Math.floor(total / 250000));
    const samples = [];
    let idx = 0;
    for (const d of datas) for (let i = 0; i < d.length; i += 4) { if ((idx++ % step) !== 0) continue; const [r, g, b, tr] = comp(d, i); if (!tr) samples.push((r << 16) | (g << 8) | b); }
    const transparent = !bg;
    const palette = medianCut(Uint32Array.from(samples), transparent ? 255 : 256);
    const tIndex = transparent ? palette.length : -1;
    const palSize = Math.max(2, 1 << Math.ceil(Math.log2(palette.length + (transparent ? 1 : 0))));
    const cache = new Map();
    const nearest = (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let v = cache.get(key); if (v !== undefined) return v;
      let best = 0, bd = Infinity;
      for (let i = 0; i < palette.length; i++) { const p = palette[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, dd = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (dd < bd) { bd = dd; best = i; } }
      cache.set(key, best); return best;
    };
    const out = [];
    const str = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
    const u16 = (v) => { out.push(v & 255, (v >> 8) & 255); };
    str('GIF89a'); u16(W); u16(H);
    const gctBits = Math.log2(palSize) - 1;
    out.push(0x80 | 0x70 | gctBits, 0, 0);
    for (let i = 0; i < palSize; i++) { const p = palette[i] || [0, 0, 0]; out.push(p[0], p[1], p[2]); }
    // NETSCAPE loop extension
    out.push(0x21, 0xff, 11); str('NETSCAPE2.0'); out.push(3, 1); u16(opts.loop || 0); out.push(0);
    const minCode = Math.max(2, Math.log2(palSize));
    let acc = 0;
    datas.forEach((d) => {
      acc += opts.delay || 4; const delay = Math.round(acc); acc -= delay;
      out.push(0x21, 0xf9, 4, (transparent ? 2 << 2 : 1 << 2) | (transparent ? 1 : 0)); u16(delay); out.push(transparent ? tIndex : 0, 0);
      out.push(0x2c); u16(0); u16(0); u16(W); u16(H); out.push(0);
      const ind = new Uint8Array(W * H);
      for (let i = 0, k = 0; i < d.length; i += 4, k++) { const [r, g, b, tr] = comp(d, i); ind[k] = tr ? tIndex : nearest(r, g, b); }
      lzw(ind, minCode, out);
    });
    out.push(0x3b);
    return new Uint8Array(out);
  }

  A.GIF = { encode, medianCut };
})(window.A);
