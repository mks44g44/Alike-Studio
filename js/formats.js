/* Alike Studio — file formats for images and sounds.
   Images: PNG, JPEG (jpg/jpeg/jfif/pjpeg), WebP, GIF, APNG, BMP, ICO/CUR, AVIF, SVG (rasterized) — read by the browser —
   plus TGA, TIFF (uncompressed, LZW, Deflate, PackBits; strips or tiles), QOI and PBM/PGM/PPM decoded here.
   Everything except PNG and JPEG is converted to PNG when imported, so textures and exports always work.
   Sounds: MP3, WAV, OGG/OGA (Vorbis, Opus, FLAC), Opus, FLAC, AAC, M4A/MP4, WebM/WebA — played by the browser —
   plus AIFF/AIFC, converted to WAV. */
(function (A) {
  'use strict';
  const NATIVE_IMG = ['png', 'apng', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'webp', 'gif', 'bmp', 'dib', 'ico', 'cur', 'avif', 'svg'];
  const DECODED_IMG = ['tga', 'icb', 'vda', 'vst', 'tif', 'tiff', 'qoi', 'pbm', 'pgm', 'ppm', 'pnm'];
  const IMG_EXT = NATIVE_IMG.concat(DECODED_IMG);
  const NATIVE_AUDIO = ['mp3', 'wav', 'wave', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'mp4', 'webm', 'weba', 'mka'];
  const AUDIO_EXT = NATIVE_AUDIO.concat(['aif', 'aiff', 'aifc']);
  const ext = (name) => { const m = /\.([^.\\/]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  const re = (list) => new RegExp('\\.(' + list.join('|') + ')$', 'i');

  const toCanvas = (w, h, rgba) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const id = x.createImageData(w, h); id.data.set(rgba); x.putImageData(id, 0, 0); return c; };
  const readU8 = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));
  const dataURL = (file) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(file); });
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  /* ---------- TGA ---------- */
  function decodeTGA(u) {
    const idLen = u[0], cmType = u[1], type = u[2], cmFirst = u[3] | (u[4] << 8), cmLen = u[5] | (u[6] << 8), cmDepth = u[7];
    const w = u[12] | (u[13] << 8), h = u[14] | (u[15] << 8), bpp = u[16], desc = u[17];
    if (!w || !h || ![1, 2, 3, 9, 10, 11].includes(type)) throw new Error('Unsupported TGA');
    let p = 18 + idLen;
    let cmap = null;
    if (cmType) { const bytes = Math.ceil(cmDepth / 8); cmap = u.subarray(p, p + cmLen * bytes); p += cmLen * bytes; }
    const px = Math.ceil(bpp / 8), n = w * h, raw = new Uint8Array(n * px), rle = type >= 9;
    if (!rle) raw.set(u.subarray(p, p + n * px));
    else for (let i = 0; i < n;) {
      const c = u[p++], count = (c & 0x7f) + 1;
      if (c & 0x80) { const v = u.subarray(p, p + px); p += px; for (let k = 0; k < count && i < n; k++, i++) raw.set(v, i * px); }
      else { raw.set(u.subarray(p, p + count * px), i * px); p += count * px; i += count; }
    }
    const out = new Uint8ClampedArray(n * 4), color = (src, o, depth, dst) => {
      if (depth === 8 || depth === 1) { out[dst] = out[dst + 1] = out[dst + 2] = src[o]; out[dst + 3] = 255; }
      else if (depth === 15 || depth === 16) { const v = src[o] | (src[o + 1] << 8); out[dst] = ((v >> 10) & 31) * 255 / 31; out[dst + 1] = ((v >> 5) & 31) * 255 / 31; out[dst + 2] = (v & 31) * 255 / 31; out[dst + 3] = depth === 16 && !(v & 0x8000) && (desc & 15) ? 0 : 255; }
      else { out[dst] = src[o + 2]; out[dst + 1] = src[o + 1]; out[dst + 2] = src[o]; out[dst + 3] = depth === 32 ? src[o + 3] : 255; }
    };
    const topDown = !!(desc & 0x20), rtl = !!(desc & 0x10);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sy = topDown ? y : h - 1 - y, sx = rtl ? w - 1 - x : x, i = sy * w + sx, dst = (y * w + x) * 4;
      if (type === 1 || type === 9) { const idx = (px === 2 ? raw[i * 2] | (raw[i * 2 + 1] << 8) : raw[i]) - cmFirst; color(cmap, idx * Math.ceil(cmDepth / 8), cmDepth, dst); }
      else if (type === 3 || type === 11) { out[dst] = out[dst + 1] = out[dst + 2] = raw[i * px]; out[dst + 3] = px === 2 ? raw[i * px + 1] : 255; }
      else color(raw, i * px, bpp, dst);
    }
    if (bpp === 32) { let any = false; for (let i = 3; i < out.length; i += 4) if (out[i]) { any = true; break; } if (!any) for (let i = 3; i < out.length; i += 4) out[i] = 255; } // alpha channel left empty
    return toCanvas(w, h, out);
  }

  /* ---------- QOI ---------- */
  function decodeQOI(u) {
    const be = (o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
    if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== 'qoif') throw new Error('Not QOI');
    const w = be(4), h = be(8), n = w * h, out = new Uint8ClampedArray(n * 4), idx = new Uint8Array(256);
    let r = 0, g = 0, b = 0, a = 255, p = 14, run = 0;
    for (let i = 0; i < n; i++) {
      if (run > 0) run--;
      else {
        const b1 = u[p++];
        if (b1 === 0xfe) { r = u[p++]; g = u[p++]; b = u[p++]; }
        else if (b1 === 0xff) { r = u[p++]; g = u[p++]; b = u[p++]; a = u[p++]; }
        else if ((b1 & 0xc0) === 0x00) { const k = (b1 & 63) * 4; r = idx[k]; g = idx[k + 1]; b = idx[k + 2]; a = idx[k + 3]; }
        else if ((b1 & 0xc0) === 0x40) { r = (r + ((b1 >> 4) & 3) - 2) & 255; g = (g + ((b1 >> 2) & 3) - 2) & 255; b = (b + (b1 & 3) - 2) & 255; }
        else if ((b1 & 0xc0) === 0x80) { const b2 = u[p++], vg = (b1 & 63) - 32; r = (r + vg - 8 + ((b2 >> 4) & 15)) & 255; g = (g + vg) & 255; b = (b + vg - 8 + (b2 & 15)) & 255; }
        else run = b1 & 63;
        const k = ((r * 3 + g * 5 + b * 7 + a * 11) % 64) * 4; idx[k] = r; idx[k + 1] = g; idx[k + 2] = b; idx[k + 3] = a;
      }
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
    }
    return toCanvas(w, h, out);
  }

  /* ---------- PBM / PGM / PPM ---------- */
  function decodePNM(u) {
    let p = 0; const tok = () => {
      for (;;) { while (p < u.length && /\s/.test(String.fromCharCode(u[p]))) p++; if (u[p] === 35) { while (p < u.length && u[p] !== 10) p++; } else break; }
      let s = ''; while (p < u.length && !/\s/.test(String.fromCharCode(u[p]))) s += String.fromCharCode(u[p++]); return s;
    };
    const magic = tok(), kind = +magic[1]; if (magic[0] !== 'P' || !(kind >= 1 && kind <= 6)) throw new Error('Not PNM');
    const w = +tok(), h = +tok(), max = kind === 1 || kind === 4 ? 1 : +tok(); p++;
    const ch = kind === 3 || kind === 6 ? 3 : 1, n = w * h, out = new Uint8ClampedArray(n * 4), wide = max > 255;
    let bitRow = 0;
    for (let i = 0; i < n; i++) {
      const vals = [];
      for (let c = 0; c < ch; c++) {
        let v;
        if (kind <= 3) v = +tok();
        else if (kind === 4) { const x = i % w; if (x === 0 && i) p = bitRow + Math.ceil(w / 8); if (x === 0) bitRow = p; v = (u[bitRow + (x >> 3)] >> (7 - (x & 7))) & 1; }
        else if (wide) { v = (u[p] << 8) | u[p + 1]; p += 2; } else v = u[p++];
        vals.push(kind === 1 || kind === 4 ? (v ? 0 : 255) : Math.round((v / max) * 255));
      }
      out[i * 4] = vals[0]; out[i * 4 + 1] = vals[ch - 1 > 0 ? 1 : 0]; out[i * 4 + 2] = vals[ch - 1 > 0 ? 2 : 0]; out[i * 4 + 3] = 255;
    }
    return toCanvas(w, h, out);
  }

  /* ---------- TIFF ---------- */
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  function lzwTIFF(src, expect) {
    const out = new Uint8Array(expect); let o = 0, bitPos = 0, width = 9;
    let dict = [], prev = null;
    const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push(null, null); width = 9; prev = null; };
    const read = () => { let v = 0; for (let i = 0; i < width; i++) { const byte = src[(bitPos + i) >> 3]; v = (v << 1) | ((byte >> (7 - ((bitPos + i) & 7))) & 1); } bitPos += width; return v; };
    reset();
    while (bitPos + width <= src.length * 8 && o < expect) {
      const code = read();
      if (code === 256) { reset(); continue; }
      if (code === 257) break;
      let entry;
      if (code < dict.length && dict[code]) entry = dict[code];
      else if (prev) entry = prev.concat(prev[0]);
      else break;
      for (const b of entry) { if (o < expect) out[o++] = b; }
      if (prev) dict.push(prev.concat(entry[0]));
      prev = entry;
      if (dict.length + 1 >= (1 << width) && width < 12) width++;
    }
    return out;
  }
  function packBits(src, expect) {
    const out = new Uint8Array(expect); let o = 0, p = 0;
    while (p < src.length && o < expect) {
      const n = (src[p++] << 24) >> 24;
      if (n >= 0) { for (let i = 0; i <= n && o < expect; i++) out[o++] = src[p++]; }
      else if (n !== -128) { const v = src[p++]; for (let i = 0; i < 1 - n && o < expect; i++) out[o++] = v; }
    }
    return out;
  }
  async function decodeTIFF(u) {
    const le = u[0] === 0x49, dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
    if (u16(2) !== 42) throw new Error('Not TIFF (or BigTIFF, which is not supported)');
    const ifd = u32(4), n = u16(ifd), tags = {};
    const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SZ[type] || 1) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8), vals = [];
      for (let k = 0; k < Math.min(count, 1 << 20); k++) vals.push(type === 3 ? u16(at + k * 2) : type === 4 ? u32(at + k * 4) : u[at + k]);
      tags[tag] = vals;
    }
    const g = (t, d) => (tags[t] ? tags[t][0] : d);
    const w = g(256), h = g(257), bps = g(258, 1), comp = g(259, 1), photo = g(262, 2), spp = g(277, 1), pred = g(317, 1), planar = g(284, 1);
    if (planar !== 1) throw new Error('Planar TIFF is not supported');
    if (![1, 8, 16].includes(bps)) throw new Error(bps + '-bit TIFF is not supported');
    const extra = tags[338] ? tags[338][0] : 0, bytesPP = Math.max(1, (bps * spp) / 8);
    const tiled = !!tags[322], tw = tiled ? g(322) : w, th = tiled ? g(323) : g(278, h);
    const offs = tiled ? tags[324] : tags[273], counts = tiled ? tags[325] : tags[279];
    const across = tiled ? Math.ceil(w / tw) : 1;
    const out = new Uint8ClampedArray(w * h * 4), cmap = tags[320];
    for (let s = 0; s < offs.length; s++) {
      const rowBytes = Math.ceil((tw * bps * spp) / 8), expect = rowBytes * th;
      let d = u.subarray(offs[s], offs[s] + counts[s]);
      if (comp === 5) d = lzwTIFF(d, expect);
      else if (comp === 8 || comp === 32946) d = await inflate(d);
      else if (comp === 32773) d = packBits(d, expect);
      else if (comp !== 1) throw new Error('TIFF compression ' + comp + ' is not supported (use uncompressed, LZW, ZIP or PackBits)');
      if (pred === 2 && bps === 8) for (let y = 0; y < th; y++) for (let x = spp; x < tw * spp; x++) d[y * rowBytes + x] = (d[y * rowBytes + x] + d[y * rowBytes + x - spp]) & 255;
      const ox = tiled ? (s % across) * tw : 0, oy = tiled ? Math.floor(s / across) * th : s * th;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const X = ox + x, Y = oy + y; if (X >= w || Y >= h) continue;
        const dst = (Y * w + X) * 4;
        const sample = (c) => {
          if (bps === 1) { const bit = (d[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1; return bit * 255; }
          const i = y * rowBytes + (x * spp + c) * (bps / 8);
          return bps === 16 ? (le ? d[i + 1] : d[i]) : d[i];
        };
        if (photo === 3 && cmap) { const k = sample(0), m = cmap.length / 3; out[dst] = cmap[k] >> 8; out[dst + 1] = cmap[m + k] >> 8; out[dst + 2] = cmap[2 * m + k] >> 8; out[dst + 3] = 255; }
        else if (photo === 0 || photo === 1) { let v = sample(0); if (photo === 0) v = 255 - v; out[dst] = out[dst + 1] = out[dst + 2] = v; out[dst + 3] = spp > 1 ? sample(1) : 255; }
        else {
          let r = sample(0), gg = sample(1), b = sample(2), a = spp > 3 ? sample(3) : 255;
          if (spp > 3 && extra === 1 && a > 0 && a < 255) { r = Math.min(255, (r * 255) / a); gg = Math.min(255, (gg * 255) / a); b = Math.min(255, (b * 255) / a); } // associated alpha
          out[dst] = r; out[dst + 1] = gg; out[dst + 2] = b; out[dst + 3] = a;
        }
      }
    }
    void bytesPP;
    return toCanvas(w, h, out);
  }

  /* ---------- AIFF → WAV ---------- */
  function aiffToWav(u) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), str = (o, n) => String.fromCharCode(...u.subarray(o, o + n));
    if (str(0, 4) !== 'FORM' || !['AIFF', 'AIFC'].includes(str(8, 4))) throw new Error('Not AIFF');
    let ch = 0, frames = 0, bits = 16, rate = 44100, little = false, data = null;
    for (let p = 12; p + 8 <= u.length;) {
      const id = str(p, 4), size = dv.getUint32(p + 4);
      if (id === 'COMM') {
        ch = dv.getUint16(p + 8); frames = dv.getUint32(p + 10); bits = dv.getUint16(p + 14);
        const e = dv.getUint16(p + 16) & 0x7fff, hi = dv.getUint32(p + 18), lo = dv.getUint32(p + 22);
        rate = Math.round((hi * 2 ** 32 + lo) * 2 ** (e - 16383 - 63));
        if (str(8, 4) === 'AIFC' && size >= 22) { const c = str(p + 26, 4); if (c === 'sowt') little = true; else if (c !== 'NONE' && c !== 'twos') throw new Error('Compressed AIFC (' + c + ') is not supported'); }
      } else if (id === 'SSND') { const off = dv.getUint32(p + 8); data = u.subarray(p + 16 + off, p + 8 + size); }
      p += 8 + size + (size & 1);
    }
    if (!data || !ch) throw new Error('AIFF has no sound data');
    const bps = Math.ceil(bits / 8), n = Math.min(frames * ch, Math.floor(data.length / bps));
    const wav = new DataView(new ArrayBuffer(44 + n * 2)), ws = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, ch, true);
    wav.setUint32(24, rate, true); wav.setUint32(28, rate * ch * 2, true); wav.setUint16(32, ch * 2, true); wav.setUint16(34, 16, true); ws(36, 'data'); wav.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const o = i * bps; let v;
      if (bps === 1) v = ((data[o] << 24) >> 24) << 8;
      else { const b0 = little ? data[o + bps - 1] : data[o], b1 = little ? data[o + bps - 2] : data[o + 1]; v = ((b0 << 24) >> 16) | b1; }
      wav.setInt16(44 + i * 2, v, true);
    }
    return new Uint8Array(wav.buffer);
  }
  const u8ToDataURL = (u, mime) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return 'data:' + mime + ';base64,' + btoa(s); };

  const F = {
    IMAGE_EXT: IMG_EXT, AUDIO_EXT,
    IMAGE_RE: re(IMG_EXT), AUDIO_RE: re(AUDIO_EXT),
    IMAGE_ACCEPT: 'image/*,' + IMG_EXT.map((e) => '.' + e).join(','),
    AUDIO_ACCEPT: 'audio/*,' + AUDIO_EXT.map((e) => '.' + e).join(','),
    isImage: (name) => re(IMG_EXT).test(name),
    isAudio: (name) => re(AUDIO_EXT).test(name),
    ext,
    /* decode image bytes of any supported format to a canvas */
    async decode(bytes, name) {
      const e = ext(name);
      if (['tga', 'icb', 'vda', 'vst'].includes(e)) return decodeTGA(bytes);
      if (e === 'tif' || e === 'tiff') return decodeTIFF(bytes);
      if (e === 'qoi') return decodeQOI(bytes);
      if (['pbm', 'pgm', 'ppm', 'pnm'].includes(e)) return decodePNM(bytes);
      const mime = e === 'svg' ? 'image/svg+xml' : e === 'ico' || e === 'cur' ? 'image/x-icon' : e === 'jpg' || e === 'jfif' || e === 'pjpeg' || e === 'pjp' ? 'image/jpeg' : 'image/' + (e === 'dib' ? 'bmp' : e === 'apng' ? 'png' : e);
      const img = await loadImg(URL.createObjectURL(new Blob([bytes], { type: mime })));
      if (!img) throw new Error('This browser cannot read ' + (name || 'the image'));
      let w = img.naturalWidth, h = img.naturalHeight;
      if (e === 'svg' && (!w || !h)) { w = 512; h = 512; }
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c;
    },
    /* File → { data (PNG or JPEG data URL), w, h } or null */
    async readImage(file) {
      const e = ext(file.name), type = file.type || '';
      try {
        if (/^image\/(png|jpeg)$/.test(type) || ['png', 'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp'].includes(e)) {
          const d = await dataURL(file), img = d && (await loadImg(d));
          if (img) return { data: d.replace(/^data:[^;,]*/, 'data:image/' + (['png'].includes(e) || /png/.test(type) ? 'png' : 'jpeg')), w: img.naturalWidth, h: img.naturalHeight };
        }
        const c = await F.decode(await readU8(file), file.name);
        return { data: c.toDataURL('image/png'), w: c.width, h: c.height };
      } catch (err) { console.warn('Image import failed', file.name, err); A.UI && A.UI.toast(`Could not read ${file.name}: ${err.message}`, 3500); return null; }
    },
    /* image bytes from disk (desktop images folder) → data URL the editor can use */
    async bytesToImageURL(bytes, name) {
      const e = ext(name);
      if (['png', 'jpg', 'jpeg', 'jfif'].includes(e)) return u8ToDataURL(bytes, e === 'png' ? 'image/png' : 'image/jpeg');
      return (await F.decode(bytes, name)).toDataURL('image/png');
    },
    /* File → audio data URL (AIFF becomes WAV); checks that it can be played */
    async readAudio(file) {
      const e = ext(file.name);
      let u = await readU8(file), mime;
      if (['aif', 'aiff', 'aifc'].includes(e)) { u = aiffToWav(u); mime = 'audio/wav'; }
      else mime = file.type && file.type.startsWith('audio/') ? file.type : 'audio/' + ({ mp3: 'mpeg', m4a: 'mp4', aac: 'aac', oga: 'ogg', opus: 'ogg', wave: 'wav', weba: 'webm', mka: 'webm' }[e] || e);
      try {
        const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (OC) await new OC(1, 1, 44100).decodeAudioData(u.slice().buffer);
      } catch (err) { A.UI && A.UI.toast(`${file.name}: this format can't be played here`, 3500); return null; }
      return u8ToDataURL(u, mime);
    },
    /* file extension for a stored data URL */
    extOf(data) { const m = /^data:([^;,]+)/.exec(data || ''); const t = m ? m[1] : ''; return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[t] || 'png'; },
    decodeTGA, decodeQOI, decodePNM, decodeTIFF, aiffToWav,
  };
  A.Formats = F;
})(window.A);
