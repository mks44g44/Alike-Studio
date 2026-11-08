/* Alike Studio — texture atlas packer (MaxRects) with trim, rotation, scale, POT, PMA, extrude, de-duplication */
(function (A) {
  'use strict';
  const Model = A.Model;

  const DEFAULTS = { maxSize: 2048, padding: 2, edge: 0, extrude: 1, pot: true, square: false, rotate: false, trim: true, scale: 1, pma: false, dedupe: true, usedOnly: true, filter: 'linear', bruteForce: false };
  /* placement heuristics: [primary, secondary] score, lower is better */
  const HEUR = {
    bssf: (f, w, h) => [Math.min(f.w - w, f.h - h), Math.max(f.w - w, f.h - h)], // best short side fit
    blsf: (f, w, h) => [Math.max(f.w - w, f.h - h), Math.min(f.w - w, f.h - h)], // best long side fit
    baf: (f, w, h) => [f.w * f.h - w * h, Math.min(f.w - w, f.h - h)],            // best area fit
    bl: (f, w, h) => [f.y + h, f.x],                                               // bottom-left
  };
  const SORTS = {
    side: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
    area: (a, b) => b.w * b.h - a.w * a.h,
    height: (a, b) => b.h - a.h || b.w - a.w,
    width: (a, b) => b.w - a.w || b.h - a.h,
    perimeter: (a, b) => b.w + b.h - a.w - a.h,
  };

  class MaxRects {
    constructor(w, h, rot, heur) { this.w = w; this.h = h; this.rot = rot; this.score = HEUR[heur] || HEUR.bssf; this.free = [{ x: 0, y: 0, w, h }]; this.used = []; }
    find(w, h) {
      let best = null, bs = Infinity, bl = Infinity;
      const test = (rw, rh, rot) => {
        for (const f of this.free) {
          if (rw > f.w || rh > f.h) continue;
          const [s, l] = this.score(f, rw, rh);
          if (s < bs || (s === bs && l < bl)) { bs = s; bl = l; best = { x: f.x, y: f.y, w: rw, h: rh, rot }; }
        }
      };
      test(w, h, false);
      if (this.rot && w !== h) test(h, w, true);
      return best;
    }
    place(r) {
      const out = [];
      for (const f of this.free) {
        if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { out.push(f); continue; }
        if (r.x > f.x) out.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
        if (r.x + r.w < f.x + f.w) out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
        if (r.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
        if (r.y + r.h < f.y + f.h) out.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
      }
      // prune rects contained in others
      this.free = out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
      this.used.push(r);
    }
  }

  /* images whose pixels can't be trimmed safely (meshes sample outside the trimmed rect) */
  function meshImages(sk) {
    const s = new Set();
    Model.eachAttachment(sk, (a) => {
      if (a.type !== 'mesh' && a.type !== 'linkedmesh') return;
      if (a.sequence) for (let i = 0; i < a.sequence.count; i++) s.add(a.path + String((a.sequence.start || 0) + i).padStart(a.sequence.digits || 0, '0'));
      else s.add(a.path);
    });
    return s;
  }
  function usedImages(sk) {
    const s = new Set();
    Model.eachAttachment(sk, (a) => {
      if (!a.path) return;
      if (a.sequence) for (let i = 0; i < a.sequence.count; i++) s.add(a.path + String((a.sequence.start || 0) + i).padStart(a.sequence.digits || 0, '0'));
      else s.add(a.path);
    });
    return s;
  }

  function pack(project, imgEls, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const sk = project.skeleton, noTrim = meshImages(sk), used = usedImages(sk);
    let names = Object.keys(project.images).filter((n) => imgEls[n] && (imgEls[n].naturalWidth || imgEls[n].width));
    if (o.usedOnly) names = names.filter((n) => used.has(n));
    if (o.only) names = names.filter((n) => o.only.has(n));
    const items = [], byHash = new Map(), aliases = {};
    for (const n of names) {
      const el = imgEls[n];
      const W0 = el.naturalWidth || el.width, H0 = el.naturalHeight || el.height;
      const ow = Math.max(1, Math.round(W0 * o.scale)), oh = Math.max(1, Math.round(H0 * o.scale));
      const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
      const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(el, 0, 0, ow, oh);
      const data = c.getImageData(0, 0, ow, oh).data;
      let x0 = 0, y0 = 0, x1 = ow - 1, y1 = oh - 1;
      if (o.trim && !noTrim.has(n)) {
        x0 = ow; y0 = oh; x1 = -1; y1 = -1;
        for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) if (data[(y * ow + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (o.dedupe) {
        let hsh = 2166136261 >>> 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * ow + x) * 4; hsh = Math.imul(hsh ^ (data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)), 16777619) >>> 0; }
        const key = hsh + ':' + w + 'x' + h + ':' + ow + 'x' + oh + ':' + x0 + ',' + y0;
        if (byHash.has(key)) { aliases[n] = byHash.get(key); continue; }
        byHash.set(key, n);
      }
      const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
      items.push({ n, canvas: t, w, h, ox: x0, oy: y0, ow, oh });
    }
    const pad = o.padding, ex = o.extrude, edge = o.edge, inner = o.maxSize - edge * 2;
    const pageSize = (used) => {
      let W = 1, H = 1;
      used.forEach((r) => { W = Math.max(W, r.x + r.w - pad + edge * 2); H = Math.max(H, r.y + r.h - pad + edge * 2); });
      if (o.pot) { let p = 1; while (p < W) p *= 2; W = p; p = 1; while (p < H) p *= 2; H = p; }
      if (o.square) W = H = Math.max(W, H);
      return [W, H];
    };
    /* lay out every item on pages of at most bw × bh (no drawing) */
    const layout = (sorted, heur, bw, bh) => {
      const out = [], warn = []; let rest = sorted;
      while (rest.length) {
        const mr = new MaxRects(bw + pad, bh + pad, o.rotate, heur), left = [];
        for (const it of rest) {
          const r = mr.find(it.w + pad + ex * 2, it.h + pad + ex * 2);
          if (!r) { left.push(it); continue; }
          mr.place(r); r.item = it;
        }
        if (!mr.used.length) { left.forEach((it) => warn.push(`"${it.n}" (${it.w}×${it.h}) is larger than the max page size`)); break; }
        const [W, H] = pageSize(mr.used);
        out.push({ used: mr.used, W, H });
        rest = left;
      }
      return { pages: out, warnings: warn, area: out.reduce((s, p) => s + p.W * p.H, 0) };
    };
    let best = layout(items.slice().sort(SORTS.side), 'bssf', inner, inner), tried = 1;
    if (o.bruteForce && items.length) {
      // try every sort order × placement heuristic × narrower/shorter page limits; keep the fewest pages, then the least area
      const minW = Math.max(...items.map((it) => it.w + pad + ex * 2)), minH = Math.max(...items.map((it) => it.h + pad + ex * 2));
      const sizes = (min) => { const s = new Set([inner]); for (let k = 0.9; k > 0.05; k -= 0.1) { const v = Math.round(inner * k); if (v >= min) s.add(v); } let p = 16; while (p < inner) { if (p >= min) s.add(p); p *= 2; } return [...s]; };
      const t0 = performance.now();
      outer: for (const sk2 of Object.keys(SORTS)) {
        const sorted = items.slice().sort(SORTS[sk2]);
        for (const hz of Object.keys(HEUR)) for (const bw of sizes(minW)) for (const bh of sizes(minH)) {
          if (performance.now() - t0 > (o.bruteMs || 4000)) break outer;
          const r = layout(sorted, hz, bw, bh); tried++;
          if (r.warnings.length > best.warnings.length) continue;
          if (r.pages.length < best.pages.length || (r.pages.length === best.pages.length && r.area < best.area)) best = r;
        }
      }
    }
    const pages = [], warnings = best.warnings;
    for (const pg of best.pages) {
      const mr = { used: pg.used }, W = pg.W, H = pg.H;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d');
      const regions = {};
      for (const r of mr.used) {
        const it = r.item, x = r.x + edge + ex, y = r.y + edge + ex;
        const src = r.rot ? rotated(it.canvas, o.rotateCCW) : it.canvas;
        const sw = src.width, sh = src.height;
        if (ex > 0) { // extrude edge pixels to avoid filtering seams
          c.drawImage(src, 0, 0, sw, 1, x, y - ex, sw, ex); c.drawImage(src, 0, sh - 1, sw, 1, x, y + sh, sw, ex);
          c.drawImage(src, 0, 0, 1, sh, x - ex, y, ex, sh); c.drawImage(src, sw - 1, 0, 1, sh, x + sw, y, ex, sh);
          c.drawImage(src, 0, 0, 1, 1, x - ex, y - ex, ex, ex); c.drawImage(src, sw - 1, 0, 1, 1, x + sw, y - ex, ex, ex);
          c.drawImage(src, 0, sh - 1, 1, 1, x - ex, y + sh, ex, ex); c.drawImage(src, sw - 1, sh - 1, 1, 1, x + sw, y + sh, ex, ex);
        }
        c.drawImage(src, x, y);
        regions[it.n] = { x, y, w: it.w, h: it.h, ox: it.ox, oy: it.oy, ow: it.ow, oh: it.oh, rot: !!r.rot };
        if (r.rot && o.rotateCCW) regions[it.n].ccw = true;
      }
      if (o.pma) {
        const id = c.getImageData(0, 0, W, H), d = id.data;
        for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; d[i] = Math.round(d[i] * a); d[i + 1] = Math.round(d[i + 1] * a); d[i + 2] = Math.round(d[i + 2] * a); }
        c.putImageData(id, 0, 0);
      }
      pages.push({ canvas: cv, w: W, h: H, regions });
    }
    for (const a in aliases) for (const p of pages) if (p.regions[aliases[a]]) p.regions[a] = Object.assign({}, p.regions[aliases[a]]);
    return { pages, options: o, warnings, packed: items.length, aliases: Object.keys(aliases).length, layoutsTried: tried };
  }
  /* rotate 90° clockwise (Alike atlases) or counter-clockwise (.atlas text files read by other tools) */
  function rotated(src, ccw) {
    const c = document.createElement('canvas'); c.width = src.height; c.height = src.width;
    const x = c.getContext('2d');
    if (ccw) { x.translate(0, src.width); x.rotate(-Math.PI / 2); } else { x.translate(src.height, 0); x.rotate(Math.PI / 2); }
    x.drawImage(src, 0, 0);
    return c;
  }

  /* ---------- .atlas text (the libGDX-style format many engines and tools read) ---------- */
  /* style: 'v4' (compact "bounds:/offsets:" lines) or 'legacy' (libGDX "xy:/size:/orig:/offset:"). Pack with rotateCCW for rotated regions. */
  function toAtlasText(pages, files, o, style = 'v4') {
    const out = [], filt = o.filter === 'nearest' ? 'Nearest,Nearest' : 'Linear,Linear';
    pages.forEach((p, i) => {
      if (i || style === 'legacy') out.push('');
      out.push(files[i]);
      if (style === 'legacy') out.push(`size: ${p.w}, ${p.h}`, 'format: RGBA8888', `filter: ${filt.replace(',', ', ')}`, 'repeat: none');
      else { out.push(`size:${p.w},${p.h}`, `filter:${filt}`); if (o.pma) out.push('pma:true'); if (o.scale && o.scale !== 1) out.push('scale:' + o.scale); }
      for (const n of Object.keys(p.regions).sort()) {
        const r = p.regions[n], bottom = r.oh - r.oy - r.h, trimmed = r.ox || r.oy || r.w !== r.ow || r.h !== r.oh;
        out.push(n);
        if (style === 'legacy') out.push(`  rotate: ${r.rot ? 'true' : 'false'}`, `  xy: ${r.x}, ${r.y}`, `  size: ${r.w}, ${r.h}`, `  orig: ${r.ow}, ${r.oh}`, `  offset: ${r.ox}, ${bottom}`, '  index: -1');
        else { out.push(`bounds:${r.x},${r.y},${r.w},${r.h}`); if (trimmed) out.push(`offsets:${r.ox},${bottom},${r.ow},${r.oh}`); if (r.rot) out.push('rotate:' + (r.ccw ? 90 : 270)); }
      }
    });
    return out.join('\n') + '\n';
  }
  /* parse either .atlas text style → [{ file, w, h, pma, filter, scale, regions: { name: {x,y,w,h,ox,oy,ow,oh,deg} } }] */
  function parseAtlasText(text) {
    const pages = []; let page = null, reg = null, fresh = true;
    const nums = (v) => v.split(',').map((x) => parseFloat(x));
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { fresh = true; reg = null; continue; }
      const c = line.indexOf(':');
      if (c < 0) {
        if (fresh || !page) { page = { file: line, w: 0, h: 0, pma: false, filter: 'linear', scale: 1, regions: {} }; pages.push(page); reg = null; }
        else { reg = { x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0, ow: 0, oh: 0, deg: 0, bottom: 0, index: -1 }; page.regions[line] = reg; reg.name = line; }
        fresh = false; continue;
      }
      const k = line.slice(0, c).trim(), v = line.slice(c + 1).trim();
      if (!reg) {
        if (k === 'size') [page.w, page.h] = nums(v);
        else if (k === 'pma') page.pma = v === 'true';
        else if (k === 'filter') page.filter = /nearest/i.test(v.split(',').pop()) ? 'nearest' : 'linear';
        else if (k === 'scale') page.scale = parseFloat(v) || 1;
        continue;
      }
      if (k === 'bounds') { [reg.x, reg.y, reg.w, reg.h] = nums(v); reg.ow = reg.ow || reg.w; reg.oh = reg.oh || reg.h; }
      else if (k === 'xy') [reg.x, reg.y] = nums(v);
      else if (k === 'size') { [reg.w, reg.h] = nums(v); reg.ow = reg.ow || reg.w; reg.oh = reg.oh || reg.h; }
      else if (k === 'offsets') [reg.ox, reg.bottom, reg.ow, reg.oh] = nums(v);
      else if (k === 'orig') [reg.ow, reg.oh] = nums(v);
      else if (k === 'offset') [reg.ox, reg.bottom] = nums(v);
      else if (k === 'rotate') reg.deg = v === 'true' ? 90 : v === 'false' ? 0 : parseFloat(v) || 0;
      else if (k === 'index') reg.index = parseInt(v, 10);
    }
    for (const p of pages) for (const n in p.regions) { const r = p.regions[n]; r.oy = r.oh - r.bottom - r.h; }
    return pages;
  }
  /* rebuild the original (untrimmed) image of an .atlas text region */
  function sliceTextRegion(pageImg, r) {
    const c = document.createElement('canvas'); c.width = Math.max(1, r.ow); c.height = Math.max(1, r.oh);
    const x = c.getContext('2d');
    if (r.deg === 90) { x.translate(r.ox + r.w, r.oy); x.rotate(Math.PI / 2); x.drawImage(pageImg, r.x, r.y, r.h, r.w, 0, 0, r.h, r.w); } // stored counter-clockwise
    else if (r.deg === 270) { x.translate(r.ox, r.oy + r.h); x.rotate(-Math.PI / 2); x.drawImage(pageImg, r.x, r.y, r.h, r.w, 0, 0, r.h, r.w); }
    else if (r.deg === 180) { x.translate(r.ox + r.w, r.oy + r.h); x.rotate(Math.PI); x.drawImage(pageImg, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); }
    else x.drawImage(pageImg, r.x, r.y, r.w, r.h, r.ox, r.oy, r.w, r.h);
    return c;
  }

  /* Map an attachment uv (0..1 of the original image, v down) into page uv. */
  function mapUV(reg, page, u, v) {
    const px = u * reg.ow - reg.ox, py = v * reg.oh - reg.oy;
    if (!reg.rot) return [(reg.x + px) / page.w, (reg.y + py) / page.h];
    return [(reg.x + reg.h - py) / page.w, (reg.y + px) / page.h];
  }
  /* Rebuild an image of original size from an atlas region (used by the JS player). */
  function sliceRegion(pageImg, reg) {
    const c = document.createElement('canvas'); c.width = reg.ow; c.height = reg.oh;
    const x = c.getContext('2d');
    if (!reg.rot) x.drawImage(pageImg, reg.x, reg.y, reg.w, reg.h, reg.ox, reg.oy, reg.w, reg.h);
    else { x.translate(reg.ox, reg.oy + reg.h); x.rotate(-Math.PI / 2); x.drawImage(pageImg, reg.x, reg.y, reg.h, reg.w, 0, 0, reg.h, reg.w); }
    return c;
  }

  /* images referenced by one skin's attachments */
  function skinImages(skin) {
    const s = new Set();
    for (const slot in skin.attachments) for (const n in skin.attachments[slot]) {
      const a = skin.attachments[slot][n]; if (!a.path) continue;
      if (a.sequence) for (let i = 0; i < a.sequence.count; i++) s.add(a.path + String((a.sequence.start || 0) + i).padStart(a.sequence.digits || 0, '0'));
      else s.add(a.path);
    }
    return s;
  }
  A.Atlas = { pack, mapUV, sliceRegion, skinImages, DEFAULTS, MaxRects, toAtlasText, parseAtlasText, sliceTextRegion };
})(window.A);
