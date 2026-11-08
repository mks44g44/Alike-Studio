/* Alike Studio — ALKB binary format.
   A compact tagged encoding of the runtime data tree with a string table.

   File layout (little endian):
     magic "ALKB" (4 bytes) · u16 version (1) · varint stringCount · strings (varint byteLen + UTF-8) · root value
   Value tags (1 byte):
     0 null · 1 false · 2 true · 3 int (zigzag varint) · 4 float32 · 5 string (varint index)
     6 array (varint n, n values) · 7 object (varint n, n × [varint keyIndex, value])
     8 float32 array (varint n, n × f32) · 9 float64
*/
(function (A) {
  'use strict';

  function encode(root) {
    const strings = [], index = new Map();
    const sid = (s) => { let i = index.get(s); if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i); } return i; };
    // pass 1: collect strings (keys first for locality)
    const collect = (v) => {
      if (typeof v === 'string') sid(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') for (const k in v) { if (v[k] === undefined) continue; sid(k); collect(v[k]); }
    };
    collect(root);
    const out = new Bytes();
    out.u8(65); out.u8(76); out.u8(75); out.u8(66); out.u16(1);
    out.varint(strings.length);
    const enc = new TextEncoder();
    for (const s of strings) { const b = enc.encode(s); out.varint(b.length); out.raw(b); }
    const isNumArray = (a) => a.length >= 4 && a.every((x) => typeof x === 'number');
    const write = (v) => {
      if (v === null || v === undefined) return out.u8(0);
      if (v === false) return out.u8(1);
      if (v === true) return out.u8(2);
      if (typeof v === 'number') {
        if (Number.isInteger(v) && Math.abs(v) < 2 ** 31) { out.u8(3); return out.varint(v >= 0 ? v * 2 : -v * 2 - 1); }
        if (Math.fround(v) === v || Math.abs(v - Math.fround(v)) < 1e-6 * Math.max(1, Math.abs(v))) { out.u8(4); return out.f32(v); }
        out.u8(9); return out.f64(v);
      }
      if (typeof v === 'string') { out.u8(5); return out.varint(index.get(v)); }
      if (Array.isArray(v) || ArrayBuffer.isView(v)) {
        const arr = Array.from(v);
        if (isNumArray(arr)) { out.u8(8); out.varint(arr.length); arr.forEach((x) => out.f32(x)); return; }
        out.u8(6); out.varint(arr.length); arr.forEach(write); return;
      }
      const keys = Object.keys(v).filter((k) => v[k] !== undefined);
      out.u8(7); out.varint(keys.length);
      for (const k of keys) { out.varint(index.get(k)); write(v[k]); }
    };
    write(root);
    return out.bytes();
  }

  function decode(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let p = 0;
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'ALKB') throw new Error('Not an Alike binary file');
    p = 4; const version = dv.getUint16(p, true); p += 2;
    if (version !== 1) throw new Error('Unsupported ALKB version ' + version);
    const varint = () => { let r = 0, s = 0, b; do { b = u8[p++]; r += (b & 127) * 2 ** s; s += 7; } while (b & 128); return r; };
    const dec = new TextDecoder();
    const n = varint(), strings = new Array(n);
    for (let i = 0; i < n; i++) { const l = varint(); strings[i] = dec.decode(u8.subarray(p, p + l)); p += l; }
    const read = () => {
      const t = u8[p++];
      switch (t) {
        case 0: return null; case 1: return false; case 2: return true;
        case 3: { const z = varint(); return z % 2 ? -(z + 1) / 2 : z / 2; }
        case 4: { const v = dv.getFloat32(p, true); p += 4; return Math.round(v * 1e6) / 1e6; }
        case 9: { const v = dv.getFloat64(p, true); p += 8; return v; }
        case 5: return strings[varint()];
        case 6: { const c = varint(), a = new Array(c); for (let i = 0; i < c; i++) a[i] = read(); return a; }
        case 7: { const c = varint(), o = {}; for (let i = 0; i < c; i++) { const k = strings[varint()]; o[k] = read(); } return o; }
        case 8: { const c = varint(), a = new Array(c); for (let i = 0; i < c; i++) { a[i] = Math.round(dv.getFloat32(p, true) * 1e6) / 1e6; p += 4; } return a; }
        default: throw new Error('Bad ALKB tag ' + t + ' at ' + (p - 1));
      }
    };
    return read();
  }

  class Bytes {
    constructor() { this.buf = new Uint8Array(1024); this.n = 0; this.dv = new DataView(this.buf.buffer); }
    grow(k) { if (this.n + k <= this.buf.length) return; let s = this.buf.length * 2; while (s < this.n + k) s *= 2; const b = new Uint8Array(s); b.set(this.buf); this.buf = b; this.dv = new DataView(b.buffer); }
    u8(v) { this.grow(1); this.buf[this.n++] = v; }
    u16(v) { this.grow(2); this.dv.setUint16(this.n, v, true); this.n += 2; }
    f32(v) { this.grow(4); this.dv.setFloat32(this.n, v, true); this.n += 4; }
    f64(v) { this.grow(8); this.dv.setFloat64(this.n, v, true); this.n += 8; }
    varint(v) { do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 128; this.u8(b); } while (v > 0); }
    raw(b) { this.grow(b.length); this.buf.set(b, this.n); this.n += b.length; }
    bytes() { return this.buf.slice(0, this.n); }
  }

  A.Binary = { encode, decode };
})(window.A);
