/* Alike Studio — Import Data: turn exported skeleton data back into an editable skeleton.
   Reads Alike runtime exports (.json / .alkb + atlas pages) and Spine 3.8–4.x JSON (+ .atlas text and pages,
   or a folder of loose images), so existing work can be brought in. The result opens as a new project or
   is added as another skeleton to the current one. */
(function (A) {
  'use strict';
  const Model = A.Model, ed = A.ed, UI = A.UI, Act = A.Act, M = A.M, MO = A.MeshOps, h = UI.h;

  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Cannot read image')); i.src = src; });
  const relName = (f) => (f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name).replace(/\.[^.]+$/, '');
  const hex = (s, def) => {
    if (typeof s !== 'string' || !/^[0-9a-f]{6,8}$/i.test(s)) return def ? def.slice() : [1, 1, 1, 1];
    const n = (i) => parseInt(s.substr(i, 2), 16) / 255;
    return s.length >= 8 ? [n(0), n(2), n(4), n(6)] : [n(0), n(2), n(4), 1];
  };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /* ---------- curves: Spine stores absolute bezier handles per value channel; Alike stores them normalized per key ---------- */
  function curveFor(k, next, ch, v0, v1) {
    const c = k.curve;
    if (c === 'stepped') return 's';
    if (typeof c === 'number') return next ? [c, num(k.c2, 0), num(k.c3, 1), num(k.c4, 1)] : 'l'; // 3.x: already normalized
    if (!Array.isArray(c) || !next) return 'l';
    const i = ch * 4; if (c.length < i + 4) return 'l';
    const t0 = num(k.time, 0), t1 = num(next.time, 0), dt = t1 - t0, dv = v1 - v0;
    if (dt <= 0) return 'l';
    if (Math.abs(dv) < 1e-9) return [M.clamp((c[i] - t0) / dt, 0, 1), 0, M.clamp((c[i + 2] - t0) / dt, 0, 1), 1];
    return [M.clamp((c[i] - t0) / dt, 0, 1), (c[i + 1] - v0) / dv, M.clamp((c[i + 2] - t0) / dt, 0, 1), (c[i + 3] - v0) / dv];
  }
  /* keys: Spine key list; get(k) → value of channel; writes one Alike timeline */
  function channel(an, type, target, prop, keys, get, ch, opts = {}) {
    if (!keys || !keys.length) return;
    const tl = Model.ensureTimeline(an, type, target, prop, opts.attachment);
    keys.forEach((k, i) => {
      const v = get(k), nx = keys[i + 1];
      const c = opts.discrete ? 's' : curveFor(k, nx, ch, typeof v === 'number' ? v : 0, nx && typeof get(nx) === 'number' ? get(nx) : 0);
      tl.keys.push({ t: num(k.time, 0), v, c });
    });
    tl.keys.sort((a, b) => a.t - b.t);
  }

  /* ---------- Spine binary (.skel) → the same object Spine JSON would give ----------
     Supports the 3.8 binary layout. Newer binaries are recognised and the user is asked to export JSON. */
  function readSkel(buf) {
    const u = new Uint8Array(buf), dv = new DataView(buf); let p = 0;
    const byte = () => u[p++], sbyte = () => (u[p++] << 24) >> 24, bool = () => u[p++] !== 0;
    const int32 = () => { const v = dv.getInt32(p); p += 4; return v; }, float = () => { const v = dv.getFloat32(p); p += 4; return v; };
    const varint = (positive = true) => { let r = 0, shift = 0, b; do { b = u[p++]; r |= (b & 0x7f) << shift; shift += 7; } while ((b & 0x80) && shift < 35); r |= 0; return positive ? r : ((r >>> 1) ^ -(r & 1)); };
    const dec = new TextDecoder();
    const str = () => { const n = varint(); if (n === 0) return null; if (n === 1) return ''; const s2 = dec.decode(u.subarray(p, p + n - 1)); p += n - 1; return s2; };
    const hex8 = (v) => (v >>> 0).toString(16).padStart(8, '0'), hex6 = (v) => (v >>> 0 & 0xffffff).toString(16).padStart(6, '0');
    // header: 3.8 starts with hash + version strings; 4.x starts with an 8-byte hash, then the version
    const p0 = p; let hash = null, version = null;
    try { hash = str(); version = str(); } catch (e) { version = null; }
    if (!version || !/^\d+\.\d+/.test(version)) { p = p0 + 8; try { version = str(); } catch (e) { version = null; } }
    if (!version || !/^3\.8/.test(version)) throw new Error(version && /^\d/.test(version)
      ? `This .skel file is from version ${version}. Binary files from 3.8 can be read; for other versions export JSON from the editor that made them and import that.`
      : 'Not a skeleton binary (.skel) file.');
    void hash;
    const sp = { skeleton: { spine: version }, bones: [], slots: [], ik: [], transform: [], path: [], skins: [], events: {}, animations: {} };
    float(); float(); float(); float(); // x, y, width, height
    const nonessential = bool();
    if (nonessential) { sp.skeleton.fps = float(); str(); str(); }
    const strings = []; for (let i = 0, n = varint(); i < n; i++) strings.push(str());
    const ref = () => { const i = varint(); return i === 0 ? null : strings[i - 1]; };
    const TRANSFORM = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'], BLEND = ['normal', 'additive', 'multiply', 'screen'];
    for (let i = 0, n = varint(); i < n; i++) {
      const b = { name: str() }; if (i) b.parent = sp.bones[varint()].name;
      b.rotation = float(); b.x = float(); b.y = float(); b.scaleX = float(); b.scaleY = float(); b.shearX = float(); b.shearY = float(); b.length = float();
      b.transform = TRANSFORM[varint()] || 'normal'; b.skin = bool(); if (nonessential) b.color = hex8(int32());
      sp.bones.push(b);
    }
    for (let i = 0, n = varint(); i < n; i++) {
      const s2 = { name: str(), bone: sp.bones[varint()].name, color: hex8(int32()) }; const dark = int32(); if (dark !== -1) s2.dark = hex6(dark);
      s2.attachment = ref(); s2.blend = BLEND[varint()] || 'normal'; sp.slots.push(s2);
    }
    const boneList = () => { const out = []; for (let k = 0, m = varint(); k < m; k++) out.push(sp.bones[varint()].name); return out; };
    for (let i = 0, n = varint(); i < n; i++) {
      const c = { name: str(), order: varint(), skin: bool(), bones: boneList() }; c.target = sp.bones[varint()].name;
      c.mix = float(); c.softness = float(); c.bendPositive = sbyte() > 0; c.compress = bool(); c.stretch = bool(); c.uniform = bool(); sp.ik.push(c);
    }
    for (let i = 0, n = varint(); i < n; i++) {
      const c = { name: str(), order: varint(), skin: bool(), bones: boneList() }; c.target = sp.bones[varint()].name;
      c.local = bool(); c.relative = bool(); c.rotation = float(); c.x = float(); c.y = float(); c.scaleX = float(); c.scaleY = float(); c.shearY = float();
      c.rotateMix = float(); c.translateMix = float(); c.scaleMix = float(); c.shearMix = float(); sp.transform.push(c);
    }
    for (let i = 0, n = varint(); i < n; i++) {
      const c = { name: str(), order: varint(), skin: bool(), bones: boneList() }; c.target = sp.slots[varint()].name;
      c.positionMode = ['fixed', 'percent'][varint()]; c.spacingMode = ['length', 'fixed', 'percent'][varint()]; c.rotateMode = ['tangent', 'chain', 'chainScale'][varint()];
      c.rotation = float(); c.position = float(); c.spacing = float(); c.rotateMix = float(); c.translateMix = float(); sp.path.push(c);
    }
    const floats = (n) => { const a = []; for (let k = 0; k < n; k++) a.push(float()); return a; };
    const vertices = (count) => {
      if (!bool()) return floats(count * 2);
      const out = [];
      for (let k = 0; k < count; k++) { const bc = varint(); out.push(bc); for (let j = 0; j < bc; j++) out.push(varint(), float(), float(), float()); }
      return out;
    };
    const shorts = () => { const n = varint(), a = []; for (let k = 0; k < n; k++) { a.push(dv.getUint16(p)); p += 2; } return a; };
    const TYPES = ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping'];
    const attachment = (attName) => {
      const name = ref() || attName, type = TYPES[byte()], a = { type };
      switch (type) {
        case 'region': a.path = ref() || name; a.rotation = float(); a.x = float(); a.y = float(); a.scaleX = float(); a.scaleY = float(); a.width = float(); a.height = float(); a.color = hex8(int32()); break;
        case 'boundingbox': a.vertexCount = varint(); a.vertices = vertices(a.vertexCount); if (nonessential) a.color = hex8(int32()); break;
        case 'mesh': { a.path = ref() || name; a.color = hex8(int32()); const vc = varint(); a.uvs = floats(vc * 2); a.triangles = shorts(); a.vertices = vertices(vc); a.hull = varint();
          if (nonessential) { shorts(); a.width = float(); a.height = float(); } break; }
        case 'linkedmesh': a.path = ref() || name; a.color = hex8(int32()); a.skin = ref(); a.parent = ref(); a.deform = bool(); if (nonessential) { a.width = float(); a.height = float(); } break;
        case 'path': { a.closed = bool(); a.constantSpeed = bool(); a.vertexCount = varint(); a.vertices = vertices(a.vertexCount); a.lengths = floats(Math.floor(a.vertexCount / 3)); if (nonessential) a.color = hex8(int32()); break; }
        case 'point': a.rotation = float(); a.x = float(); a.y = float(); if (nonessential) a.color = hex8(int32()); break;
        case 'clipping': a.end = sp.slots[varint()].name; a.vertexCount = varint(); a.vertices = vertices(a.vertexCount); if (nonessential) a.color = hex8(int32()); break;
        default: throw new Error('Unknown attachment type in .skel');
      }
      if (name !== attName) a.name = name;
      return a;
    };
    const skin = (isDefault) => {
      let s2, slotCount;
      if (isDefault) { slotCount = varint(); if (!slotCount) return null; s2 = { name: 'default', attachments: {} }; }
      else {
        s2 = { name: ref(), attachments: {}, bones: [] };
        for (let k = 0, m = varint(); k < m; k++) s2.bones.push(sp.bones[varint()].name);
        s2.ik = []; for (let k = 0, m = varint(); k < m; k++) s2.ik.push(sp.ik[varint()].name);
        s2.transform = []; for (let k = 0, m = varint(); k < m; k++) s2.transform.push(sp.transform[varint()].name);
        s2.path = []; for (let k = 0, m = varint(); k < m; k++) s2.path.push(sp.path[varint()].name);
        slotCount = varint();
      }
      for (let k = 0; k < slotCount; k++) {
        const slot = sp.slots[varint()].name, map = (s2.attachments[slot] = {});
        for (let j = 0, m = varint(); j < m; j++) { const an = ref(); map[an] = attachment(an); }
      }
      return s2;
    };
    const def = skin(true); if (def) sp.skins.push(def);
    for (let i = 0, n = varint(); i < n; i++) sp.skins.push(skin(false));
    const eventList = [];
    for (let i = 0, n = varint(); i < n; i++) {
      const name = ref(), e = { int: varint(false), float: float(), string: str() || '' }; const audio = str();
      if (audio != null) { e.audio = audio; e.volume = float(); e.balance = float(); }
      sp.events[name] = e; eventList.push(name);
    }
    // animations
    const curve = (k) => { const t = byte(); if (t === 1) k.curve = 'stepped'; else if (t === 2) { k.curve = float(); k.c2 = float(); k.c3 = float(); k.c4 = float(); } };
    for (let i = 0, n = varint(); i < n; i++) {
      const an = {}, name = str(); sp.animations[name] = an;
      for (let k = 0, m = varint(); k < m; k++) {
        const slot = sp.slots[varint()].name, tls = ((an.slots = an.slots || {})[slot] = {});
        for (let j = 0, mm = varint(); j < mm; j++) {
          const type = byte(), fc = varint(), keys = [];
          for (let f = 0; f < fc; f++) {
            const key = { time: float() };
            if (type === 0) key.name = ref();
            else if (type === 1) { key.color = hex8(int32()); if (f < fc - 1) curve(key); }
            else { key.light = hex8(int32()); key.dark = hex6(int32()); if (f < fc - 1) curve(key); }
            keys.push(key);
          }
          tls[['attachment', 'color', 'twoColor'][type]] = keys;
        }
      }
      for (let k = 0, m = varint(); k < m; k++) {
        const bone = sp.bones[varint()].name, tls = ((an.bones = an.bones || {})[bone] = {});
        for (let j = 0, mm = varint(); j < mm; j++) {
          const type = byte(), fc = varint(), keys = [];
          for (let f = 0; f < fc; f++) {
            const key = { time: float() };
            if (type === 0) key.angle = float(); else { key.x = float(); key.y = float(); }
            if (f < fc - 1) curve(key); keys.push(key);
          }
          tls[['rotate', 'translate', 'scale', 'shear'][type]] = keys;
        }
      }
      for (let k = 0, m = varint(); k < m; k++) {
        const c = sp.ik[varint()].name, keys = [];
        for (let f = 0, fc = varint(); f < fc; f++) { const key = { time: float(), mix: float(), softness: float(), bendPositive: sbyte() > 0, compress: bool(), stretch: bool() }; if (f < fc - 1) curve(key); keys.push(key); }
        (an.ik = an.ik || {})[c] = keys;
      }
      for (let k = 0, m = varint(); k < m; k++) {
        const c = sp.transform[varint()].name, keys = [];
        for (let f = 0, fc = varint(); f < fc; f++) { const key = { time: float(), rotateMix: float(), translateMix: float(), scaleMix: float(), shearMix: float() }; if (f < fc - 1) curve(key); keys.push(key); }
        (an.transform = an.transform || {})[c] = keys;
      }
      for (let k = 0, m = varint(); k < m; k++) {
        const c = sp.path[varint()].name, tls = ((an.path = an.path || {})[c] = {});
        for (let j = 0, mm = varint(); j < mm; j++) {
          const type = byte(), keys = [];
          for (let f = 0, fc = varint(); f < fc; f++) { const key = { time: float() }; if (type === 2) { key.rotateMix = float(); key.translateMix = float(); } else key.value = float(); if (f < fc - 1) curve(key); keys.push(key); }
          tls[['position', 'spacing', 'mix'][type]] = keys;
        }
      }
      for (let k = 0, m = varint(); k < m; k++) {
        const sk2 = sp.skins[varint()];
        for (let j = 0, mm = varint(); j < mm; j++) {
          const slot = sp.slots[varint()].name;
          for (let q = 0, qq = varint(); q < qq; q++) {
            const attName = ref(), keys = [];
            for (let f = 0, fc = varint(); f < fc; f++) {
              const key = { time: float() }; let end = varint();
              if (end) { const start = varint(); key.offset = start; key.vertices = floats(end); }
              if (f < fc - 1) curve(key); keys.push(key);
            }
            const d = (an.deform = an.deform || {}); ((d[sk2.name] = d[sk2.name] || {})[slot] = (d[sk2.name] || {})[slot] || {})[attName] = keys;
          }
        }
      }
      const dc = varint();
      if (dc) {
        an.drawOrder = [];
        for (let k = 0; k < dc; k++) { const key = { time: float(), offsets: [] }; for (let j = 0, oc = varint(); j < oc; j++) key.offsets.push({ slot: sp.slots[varint()].name, offset: varint() }); an.drawOrder.push(key); }
      }
      const ec = varint();
      if (ec) {
        an.events = [];
        for (let k = 0; k < ec; k++) {
          const time = float(), en = eventList[varint()], def2 = sp.events[en];
          const e = { time, name: en, int: varint(false), float: float() };
          e.string = bool() ? str() : def2.string;
          if (def2.audio != null) { e.volume = float(); e.balance = float(); }
          an.events.push(e);
        }
      }
    }
    return sp;
  }

  const IMP = {
    readSkel,
    /* ---------- Spine 3.8–4.x JSON → Alike skeleton ---------- */
    fromSpine(json, scale = 1) {
      const sp = typeof json === 'string' ? JSON.parse(json) : json;
      if (!sp || !sp.bones) throw new Error('Not skeleton JSON');
      const ver = (sp.skeleton && sp.skeleton.spine) || '';
      if (/^[12]\.|^3\.[0-6]\./.test(ver)) throw new Error('This JSON is from version ' + ver + '. Re-export it as 3.8 or newer JSON first.');
      const S = scale, sk = Model.newSkeleton(); const warn = new Set();
      sk.bones = []; sk.skins = [];
      sk.fps = num(sp.skeleton && sp.skeleton.fps, 30);
      const INH = { normal: [true, true, true], onlyTranslation: [false, false, false], noRotationOrReflection: [false, true, false], noScale: [true, false, true], noScaleOrReflection: [true, false, false] };
      for (const b of sp.bones) {
        const inh = INH[b.inherit || b.transform || 'normal'] || INH.normal;
        sk.bones.push(Model.newBone(b.name, b.parent || null, { length: num(b.length, 0) * S, x: num(b.x, 0) * S, y: num(b.y, 0) * S, rotation: num(b.rotation, 0),
          scaleX: num(b.scaleX, 1), scaleY: num(b.scaleY, 1), shearX: num(b.shearX, 0), shearY: num(b.shearY, 0),
          inheritRotation: inh[0], inheritScale: inh[1], inheritReflection: inh[2], skinRequired: !!b.skin, color: (b.color || '9aa4b2ff').toLowerCase() }));
      }
      Model.sortBones(sk);
      const boneNames = sk.bones.map((b) => b.name);
      for (const s of sp.slots || []) sk.slots.push(Model.newSlot(s.name, s.bone, { color: hex(s.color), dark: s.dark ? hex(s.dark).slice(0, 3) : null, attachment: s.attachment || null, blend: s.blend || 'normal' }));
      /* constraints, in Spine's evaluation order */
      const cons = [];
      for (const c of sp.ik || []) cons.push([num(c.order, 0), Model.newConstraint('ik', c.name, { bones: c.bones || [], target: c.target, mix: num(c.mix, 1), softness: num(c.softness, 0) * S,
        bendPositive: c.bendPositive !== false, compress: !!c.compress, stretch: !!c.stretch, uniform: !!c.uniform, skinRequired: !!c.skin })]);
      for (const c of sp.transform || []) {
        const mx = num(c.mixX, num(c.translateMix, 1)), msx = num(c.mixScaleX, num(c.scaleMix, 1));
        cons.push([num(c.order, 0), Model.newConstraint('transform', c.name, { bones: c.bones || [], target: c.target, local: !!c.local, relative: !!c.relative, skinRequired: !!c.skin,
          mixRotate: num(c.mixRotate, num(c.rotateMix, 1)), mixX: mx, mixY: num(c.mixY, mx), mixScaleX: msx, mixScaleY: num(c.mixScaleY, msx), mixShearY: num(c.mixShearY, num(c.shearMix, 1)),
          offRotate: num(c.rotation, 0), offX: num(c.x, 0) * S, offY: num(c.y, 0) * S, offScaleX: num(c.scaleX, 0), offScaleY: num(c.scaleY, 0), offShearY: num(c.shearY, 0) })]);
        if (c.properties) warn.add('transform property mappings were simplified');
      }
      for (const c of sp.path || []) {
        const mx = num(c.mixX, num(c.translateMix, 1));
        cons.push([num(c.order, 0), Model.newConstraint('path', c.name, { bones: c.bones || [], target: c.target, skinRequired: !!c.skin,
          positionMode: c.positionMode || 'percent', spacingMode: c.spacingMode || 'length', rotateMode: c.rotateMode || 'tangent',
          offRotate: num(c.rotation, 0), position: num(c.position, 0) * ((c.positionMode || 'percent') === 'fixed' ? S : 1), spacing: num(c.spacing, 0) * (['length', 'fixed'].includes(c.spacingMode || 'length') ? S : 1),
          mixRotate: num(c.mixRotate, num(c.rotateMix, 1)), mixX: mx, mixY: num(c.mixY, mx) })]);
      }
      for (const c of sp.physics || []) cons.push([num(c.order, 0), Model.newConstraint('physics', c.name, { bone: c.bone, skinRequired: !!c.skin,
        x: num(c.x, 0) > 0, y: num(c.y, 0) > 0, rotate: num(c.rotate, 0) > 0, scaleX: num(c.scaleX, 0) > 0, shearX: num(c.shearX, 0) > 0,
        inertia: num(c.inertia, 1), strength: num(c.strength, 100), damping: num(c.damping, 1), mass: num(c.mass, 1), wind: num(c.wind, 0), gravity: num(c.gravity, 0),
        mix: num(c.mix, 1), step: num(c.fps, 60), limit: num(c.limit, 5000) * S })]);
      for (const c of sp.slider || []) { warn.add('slider constraints were left out'); void c; }
      cons.sort((a, b) => a[0] - b[0]); sk.constraints = cons.map((x) => x[1]);
      /* skins and attachments */
      const weightedPaths = [];
      const verts = (list, count) => { // Spine vertex list → { verts } or { weights }
        if (!list) return { verts: [], weights: null };
        if (list.length === count * 2) return { verts: list.map((v) => v * S), weights: null };
        const weights = []; let i = 0;
        while (i < list.length && weights.length < count) {
          const n = list[i++], vw = [];
          for (let k = 0; k < n; k++) { const bi = list[i], x = list[i + 1], y = list[i + 2], w = list[i + 3]; i += 4; vw.push({ b: boneNames[bi], x: x * S, y: y * S, w }); }
          weights.push(vw);
        }
        return { verts: [], weights };
      };
      const skins = Array.isArray(sp.skins) ? sp.skins : Object.keys(sp.skins || {}).map((n) => ({ name: n, attachments: sp.skins[n] }));
      if (!skins.some((s) => s.name === 'default')) skins.unshift({ name: 'default', attachments: {} });
      for (const s of skins) {
        const skin = { name: s.name, attachments: {}, bones: (s.bones || []).slice(), constraints: [].concat(s.ik || [], s.transform || [], s.path || [], s.physics || []) };
        for (const slot in s.attachments || {}) for (const an in s.attachments[slot]) {
          const a = s.attachments[slot][an], type = a.type || 'region', path = a.path || a.name || an;
          let att = null;
          if (type === 'region') att = Model.newAttachment('region', an, { path, x: num(a.x, 0) * S, y: num(a.y, 0) * S, rotation: num(a.rotation, 0), scaleX: num(a.scaleX, 1), scaleY: num(a.scaleY, 1),
            width: num(a.width, 32) * S, height: num(a.height, 32) * S, color: hex(a.color), sequence: a.sequence ? { count: num(a.sequence.count, 1), start: num(a.sequence.start, 1), digits: num(a.sequence.digits, 0), setup: num(a.sequence.setupIndex, 0) } : null });
          else if (type === 'mesh') {
            const n = (a.uvs || []).length / 2, v = verts(a.vertices, n);
            att = Model.newAttachment('mesh', an, { path, width: num(a.width, 32) * S, height: num(a.height, 32) * S, uvs: (a.uvs || []).slice(), triangles: (a.triangles || []).slice(), hull: num(a.hull, n),
              verts: v.verts, weights: v.weights, color: hex(a.color), sequence: a.sequence ? { count: num(a.sequence.count, 1), start: num(a.sequence.start, 1), digits: num(a.sequence.digits, 0), setup: num(a.sequence.setupIndex, 0) } : null });
            if (!v.weights) IMP.fitUvMap(att);
          } else if (type === 'linkedmesh') att = Model.newAttachment('linkedmesh', an, { path, parent: a.parent, parentSlot: null, inheritDeform: a.timelines !== false && a.deform !== false, width: num(a.width, 32) * S, height: num(a.height, 32) * S, color: hex(a.color) });
          else if (type === 'boundingbox' || type === 'clipping') {
            const v = verts(a.vertices, num(a.vertexCount, 0));
            att = Model.newAttachment(type === 'clipping' ? 'clip' : 'bbox', an, { verts: v.verts, weights: v.weights, color: hex(a.color, type === 'clipping' ? [0.95, 0.3, 0.45, 1] : [0.38, 0.9, 0.45, 1]) });
            if (type === 'clipping') att.end = a.end || null;
          } else if (type === 'point') att = Model.newAttachment('point', an, { x: num(a.x, 0) * S, y: num(a.y, 0) * S, rotation: num(a.rotation, 0), color: hex(a.color, [0.95, 0.85, 0.2, 1]) });
          else if (type === 'path') {
            const v = verts(a.vertices, num(a.vertexCount, 0));
            att = Model.newAttachment('path', an, { closed: !!a.closed, constantSpeed: a.constantSpeed !== false, color: hex(a.color, [1, 0.55, 0.15, 1]) });
            if (v.weights) weightedPaths.push({ att, slot, weights: v.weights });
            else for (let i = 0; i + 5 < v.verts.length; i += 6) att.points.push({ ix: v.verts[i], iy: v.verts[i + 1], x: v.verts[i + 2], y: v.verts[i + 3], ox: v.verts[i + 4], oy: v.verts[i + 5] });
          } else { warn.add('attachment type "' + type + '" was skipped'); continue; }
          (skin.attachments[slot] = skin.attachments[slot] || {})[an] = att;
        }
        sk.skins.push(skin);
      }
      // linked meshes: Spine names the parent's skin; Alike looks the parent up in the same slot
      for (const s of skins) for (const slot in s.attachments || {}) for (const an in s.attachments[slot]) {
        const a = s.attachments[slot][an]; if (a.type !== 'linkedmesh' || !a.skin || a.skin === s.name) continue;
        const own = Model.skin(sk, s.name).attachments[slot][an], src = Model.skin(sk, a.skin);
        if (src && src.attachments[slot] && src.attachments[slot][a.parent] && !Model.skin(sk, s.name).attachments[slot][a.parent]) warn.add('linked meshes whose parent is in another skin need the parent in the default skin');
        void own;
      }
      /* events */
      for (const n in sp.events || {}) { const e = sp.events[n]; sk.events.push(Object.assign(Model.newEvent(n), { int: num(e.int, 0), float: num(e.float, 0), string: e.string || '', audio: (e.audio || '').split('/').pop().replace(/\.[^.]+$/, ''), volume: num(e.volume, 1), balance: num(e.balance, 0) })); }
      /* weighted paths → slot-bone local points from the setup pose */
      if (weightedPaths.length) {
        const pose = new A.Pose({ skeleton: sk }); pose.update();
        for (const wp of weightedPaths) {
          const b = pose.slotMap[wp.slot] && pose.slotMap[wp.slot].bone; if (!b) continue;
          const loc = wp.weights.map((vw) => { let x = 0, y = 0; for (const e of vw) { const bb = pose.boneMap[e.b]; if (!bb) continue; x += (bb.a * e.x + bb.b * e.y + bb.wx) * e.w; y += (bb.c * e.x + bb.d * e.y + bb.wy) * e.w; } return pose.worldToLocal(b, x, y); });
          for (let i = 0; i + 2 < loc.length; i += 3) wp.att.points.push({ ix: loc[i][0], iy: loc[i][1], x: loc[i + 1][0], y: loc[i + 1][1], ox: loc[i + 2][0], oy: loc[i + 2][1] });
        }
        warn.add('weighted paths were converted to unweighted (they follow their slot bone)');
      }
      /* animations */
      for (const name in sp.animations || {}) sk.animations.push(IMP.spineAnim(name, sp.animations[name], sk, S, warn));
      return { skeleton: sk, name: (sp.skeleton && sp.skeleton.name) || null, images: sp.skeleton && sp.skeleton.images, audio: sp.skeleton && sp.skeleton.audio, warnings: [...warn], version: ver };
    },
    spineAnim(name, a, sk, S, warn) {
      const an = Model.newAnimation(name);
      for (const bn in a.bones || {}) for (const tn in a.bones[bn]) {
        const keys = a.bones[bn][tn], k1 = (p, d) => (k) => num(k[p], d);
        switch (tn) {
          case 'rotate': channel(an, 'bone', bn, 'rotate', keys, (k) => num(k.value, num(k.angle, 0)), 0); break;
          case 'translate': channel(an, 'bone', bn, 'x', keys, (k) => num(k.x, 0) * S, 0); channel(an, 'bone', bn, 'y', keys, (k) => num(k.y, 0) * S, 1); break;
          case 'translatex': channel(an, 'bone', bn, 'x', keys, (k) => num(k.value, 0) * S, 0); break;
          case 'translatey': channel(an, 'bone', bn, 'y', keys, (k) => num(k.value, 0) * S, 0); break;
          case 'scale': channel(an, 'bone', bn, 'scaleX', keys, k1('x', 1), 0); channel(an, 'bone', bn, 'scaleY', keys, k1('y', 1), 1); break;
          case 'scalex': channel(an, 'bone', bn, 'scaleX', keys, k1('value', 1), 0); break;
          case 'scaley': channel(an, 'bone', bn, 'scaleY', keys, k1('value', 1), 0); break;
          case 'shear': channel(an, 'bone', bn, 'shearX', keys, k1('x', 0), 0); channel(an, 'bone', bn, 'shearY', keys, k1('y', 0), 1); break;
          case 'shearx': channel(an, 'bone', bn, 'shearX', keys, k1('value', 0), 0); break;
          case 'sheary': channel(an, 'bone', bn, 'shearY', keys, k1('value', 0), 0); break;
          default: warn.add('bone "' + tn + '" keys were skipped');
        }
      }
      for (const sn in a.slots || {}) {
        const slot = Model.slot(sk, sn), setup = slot ? slot.color : [1, 1, 1, 1];
        for (const tn in a.slots[sn]) {
          const keys = a.slots[sn][tn];
          if (tn === 'attachment') channel(an, 'slot', sn, 'attachment', keys, (k) => k.name || null, 0, { discrete: true });
          else if (tn === 'rgba' || tn === 'color') channel(an, 'slot', sn, 'color', keys, (k) => hex(k.color), 0);
          else if (tn === 'rgb') channel(an, 'slot', sn, 'color', keys, (k) => hex(k.color).slice(0, 3).concat(setup[3]), 0);
          else if (tn === 'alpha') channel(an, 'slot', sn, 'color', keys, (k) => setup.slice(0, 3).concat(num(k.value, 1)), 0);
          else if (tn === 'rgba2' || tn === 'rgb2' || tn === 'twoColor') {
            channel(an, 'slot', sn, 'color', keys, (k) => (tn === 'rgb2' ? hex(k.light).slice(0, 3).concat(setup[3]) : hex(k.light)), 0);
            channel(an, 'slot', sn, 'dark', keys, (k) => hex(k.dark).slice(0, 3), tn === 'rgb2' ? 3 : 4);
          } else if (tn === 'sequence') warn.add('slot sequence keys were skipped');
          else warn.add('slot "' + tn + '" keys were skipped');
        }
      }
      const conKeys = (group, props) => { for (const cn in group || {}) { const keys = group[cn]; if (!Array.isArray(keys)) continue; props.forEach(([p, d, src, scale], ch) => channel(an, 'constraint', cn, p, keys, (k) => (typeof d === 'boolean' ? (k[src || p] == null ? d : !!k[src || p]) : num(k[src || p], typeof d === 'function' ? d(k) : d) * (scale || 1)), ch, { discrete: typeof d === 'boolean' })); } };
      conKeys(a.ik, [['mix', 1], ['softness', 0, null, S], ['bendPositive', true], ['compress', false], ['stretch', false]]);
      conKeys(a.transform, [['mixRotate', (k) => num(k.rotateMix, 1)], ['mixX', (k) => num(k.translateMix, 1)], ['mixY', (k) => num(k.mixX, num(k.translateMix, 1))],
        ['mixScaleX', (k) => num(k.scaleMix, 1)], ['mixScaleY', (k) => num(k.mixScaleX, num(k.scaleMix, 1))], ['mixShearY', (k) => num(k.shearMix, 1)]]);
      for (const cn in a.path || {}) for (const tn in a.path[cn]) {
        const keys = a.path[cn][tn], c = Model.constraint(sk, cn);
        if (tn === 'position') channel(an, 'constraint', cn, 'position', keys, (k) => num(k.value, 0) * (c && c.positionMode === 'fixed' ? S : 1), 0);
        else if (tn === 'spacing') channel(an, 'constraint', cn, 'spacing', keys, (k) => num(k.value, 0) * (c && ['length', 'fixed'].includes(c.spacingMode) ? S : 1), 0);
        else if (tn === 'mix') { const tm = (k) => num(k.mixX, num(k.translateMix, 1)); channel(an, 'constraint', cn, 'mixRotate', keys, (k) => num(k.mixRotate, num(k.rotateMix, 1)), 0); channel(an, 'constraint', cn, 'mixX', keys, tm, 1); channel(an, 'constraint', cn, 'mixY', keys, (k) => num(k.mixY, tm(k)), 2); }
      }
      for (const cn in a.physics || {}) for (const tn in a.physics[cn]) {
        if (tn === 'reset') { warn.add('physics reset keys were skipped'); continue; }
        const targets = cn ? [cn] : sk.constraints.filter((c) => c.type === 'physics').map((c) => c.name);
        for (const t of targets) channel(an, 'constraint', t, tn, a.physics[cn][tn], (k) => num(k.value, 0), 0);
      }
      // deform (4.1+: attachments.skin.slot.att.deform; 4.0: deform.skin.slot.att)
      const deform = (skinName, sn, attName, keys) => {
        const att = Model.getAttachment(sk, skinName, sn, attName); if (!att) return;
        const len = att.weights ? att.weights.reduce((x, vw) => x + vw.length, 0) * 2 : (att.verts || []).length;
        const tl = Model.ensureTimeline(an, 'deform', sn, null, attName);
        keys.forEach((k, i) => {
          const v = new Array(len).fill(0), off = num(k.offset, 0);
          (k.vertices || []).forEach((x, j) => { if (off + j < len) v[off + j] = x * S; });
          const nx = keys[i + 1];
          tl.keys.push({ t: num(k.time, 0), v, c: k.curve === 'stepped' ? 's' : Array.isArray(k.curve) && nx ? curveFor(k, nx, 0, 0, 1) : 'l' });
        });
      };
      for (const skn in a.attachments || {}) for (const sn in a.attachments[skn]) for (const atn in a.attachments[skn][sn]) {
        const t = a.attachments[skn][sn][atn];
        if (t.deform) deform(skn, sn, atn, t.deform);
        if (t.sequence) {
          const tl = Model.ensureTimeline(an, 'sequence', sn, null, atn);
          for (const k of t.sequence) tl.keys.push({ t: num(k.time, 0), v: { mode: { onceReverse: 'reverse', loopReverse: 'reverse', pingpongReverse: 'pingpong' }[k.mode] || k.mode || 'hold', index: num(k.index, 0), delay: num(k.delay, 1 / 15) }, c: 's' });
        }
      }
      for (const skn in a.deform || {}) for (const sn in a.deform[skn]) for (const atn in a.deform[skn][sn]) deform(skn, sn, atn, a.deform[skn][sn][atn]);
      if (a.drawOrder || a.draworder) {
        const tl = Model.ensureTimeline(an, 'drawOrder'), names = sk.slots.map((s) => s.name), count = names.length;
        for (const k of a.drawOrder || a.draworder) {
          let order = names.slice();
          if (k.offsets && k.offsets.length) {
            const dO = new Array(count).fill(-1), unchanged = []; let orig = 0;
            for (const o of k.offsets) {
              const si = names.indexOf(o.slot); if (si < 0) continue;
              while (orig !== si) unchanged.push(orig++);
              dO[orig + o.offset] = orig++;
            }
            while (orig < count) unchanged.push(orig++);
            for (let i = count - 1; i >= 0; i--) if (dO[i] === -1) dO[i] = unchanged.pop();
            order = dO.map((i) => names[i]);
          }
          tl.keys.push({ t: num(k.time, 0), v: order, c: 's' });
        }
      }
      if (a.events && a.events.length) {
        const tl = { type: 'event', keys: [] }; an.timelines.push(tl);
        for (const e of a.events) {
          const def = Model.event(sk, e.name) || {};
          tl.keys.push({ t: num(e.time, 0), v: { name: e.name, int: num(e.int, def.int || 0), float: num(e.float, def.float || 0), string: e.string != null ? e.string : def.string || '', volume: num(e.volume, def.volume != null ? def.volume : 1), balance: num(e.balance, def.balance || 0) }, c: 's' });
        }
      }
      an.timelines = an.timelines.filter((t) => t.keys.length);
      an.duration = Model.animDuration(an);
      return an;
    },
    /* least-squares uv → local map for an unweighted mesh (lets the mesh tools edit imported meshes) */
    fitUvMap(att) {
      const n = att.uvs.length / 2; if (n < 3) return;
      // solve [u v 1] · [a c x; b d y] ≈ [lx ly]
      let suu = 0, suv = 0, svv = 0, su = 0, sv = 0, s1 = n; const rx = [0, 0, 0], ry = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const u = att.uvs[i * 2], v = att.uvs[i * 2 + 1], x = att.verts[i * 2], y = att.verts[i * 2 + 1];
        suu += u * u; suv += u * v; svv += v * v; su += u; sv += v;
        rx[0] += u * x; rx[1] += v * x; rx[2] += x; ry[0] += u * y; ry[1] += v * y; ry[2] += y;
      }
      const Mx = [[suu, suv, su], [suv, svv, sv], [su, sv, s1]];
      const solve = (m, r) => { // 3×3 Cramer
        const det = (q) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
        const D = det(m); if (Math.abs(D) < 1e-12) return null;
        return [0, 1, 2].map((c) => det(m.map((row, i) => row.map((x, j) => (j === c ? r[i] : x)))) / D);
      };
      const X = solve(Mx, rx), Y = solve(Mx, ry); if (!X || !Y) return;
      att.uvMap = { a: X[0], b: Y[0], c: X[1], d: Y[1], x: X[2], y: Y[2] };
    },

    /* ---------- Alike runtime export → editable skeleton ---------- */
    fromAlikeRuntime(data) {
      if (!data || data.format !== 'alike-runtime' || !data.skeleton) throw new Error('Not Alike runtime data');
      const sk = Model.clone(data.skeleton);
      sk.drawFolders = sk.drawFolders || [];
      Model.eachAttachment(sk, (a) => { if (a.type === 'mesh' && !a.weights) IMP.fitUvMap(a); });
      return { skeleton: sk, name: data.name, warnings: [] };
    },

    /* images: from .atlas text + pages, an Alike atlas, or loose image files → { name: { data, w, h } } */
    async gatherImages(files, data) {
      const list = [...files], out = {};
      const byName = {}; list.forEach((f) => { byName[f.name.toLowerCase()] = f; });
      const pageImg = async (file) => { const f = byName[String(file).split('/').pop().toLowerCase()]; if (!f) throw new Error('Missing atlas page ' + file); return loadImg(URL.createObjectURL(f)); };
      const add = (n, cv) => { out[n] = { data: cv.toDataURL('image/png'), w: cv.width, h: cv.height }; };
      const atlasFile = list.find((f) => /\.atlas(\.txt)?$/i.test(f.name));
      if (atlasFile) for (const p of A.Atlas.parseAtlasText(await atlasFile.text())) { const img = await pageImg(p.file); for (const n in p.regions) { const r = p.regions[n]; add(r.index >= 0 ? n + r.index : n, A.Atlas.sliceTextRegion(img, r)); } }
      if (data && data.atlas && data.atlas.pages) for (const p of data.atlas.pages) { const img = await pageImg(p.file); for (const n in p.regions) add(n, A.Atlas.sliceRegion(img, p.regions[n])); }
      const pages = new Set(); if (data && data.atlas) data.atlas.pages.forEach((p) => pages.add(String(p.file).split('/').pop().toLowerCase()));
      if (atlasFile) A.Atlas.parseAtlasText(await atlasFile.text()).forEach((p) => pages.add(p.file.split('/').pop().toLowerCase()));
      for (const f of list) if (A.Formats.isImage(f.name) && !pages.has(f.name.toLowerCase())) { const r = await A.Formats.readImage(f); if (r) out[relName(f)] = r; }
      return out;
    },
    async gatherAudio(files) {
      const out = {};
      for (const f of files) if (A.Formats.isAudio(f.name)) { const d = await A.Formats.readAudio(f); if (d) out[f.name.replace(/\.[^.]+$/, '')] = { data: d }; }
      return out;
    },

    /* the whole flow: files → skeleton (+ images, audio) */
    async read(files, scale = 1) {
      const list = [...files];
      const dataFile = list.find((f) => /\.(alkb|skel)$/i.test(f.name)) || list.find((f) => /\.json$/i.test(f.name) && !/\.atlas\.json$/i.test(f.name));
      if (!dataFile) throw new Error('Choose the skeleton data file (.json, .alkb or .skel), together with its atlas and page images (or its images folder).');
      let raw = /\.alkb$/i.test(dataFile.name) ? A.Binary.decode(await dataFile.arrayBuffer()) : /\.skel$/i.test(dataFile.name) ? readSkel(await dataFile.arrayBuffer()) : JSON.parse(await dataFile.text());
      let res;
      if (raw.format === 'alike-runtime') res = IMP.fromAlikeRuntime(raw);
      else if (raw.format === 'alike-project') throw new Error('That is an Alike project: use File → Open, or Import skeletons from project.');
      else if (raw.bones) { res = IMP.fromSpine(raw, scale); raw = null; }
      else throw new Error(dataFile.name + ' is not skeleton data this version can read.');
      res.images = await IMP.gatherImages(list, raw);
      res.audio = await IMP.gatherAudio(list);
      res.name = res.name || dataFile.name.replace(/\.[^.]+$/, '');
      // region sizes for images that were found but attachments that had none
      Model.eachAttachment(res.skeleton, (a) => { const im = a.path && res.images[a.path]; if (im && a.type === 'mesh' && (!a.width || !a.height)) { a.width = im.w; a.height = im.h; } });
      const missing = new Set(); Model.eachAttachment(res.skeleton, (a) => { if (a.path && (a.type === 'region' || a.type === 'mesh' || a.type === 'linkedmesh') && !a.sequence && !res.images[a.path]) missing.add(a.path); });
      if (missing.size) res.warnings.push(`${missing.size} image${missing.size === 1 ? '' : 's'} not found (for example "${[...missing][0]}") — add the atlas and its pages, or the images folder`);
      return res;
    },
    /* files dropped on the window */
    async dropImport(files) {
      let res;
      try { res = await IMP.read(files, 1); } catch (e) { return UI.alert('Import data', e.message); }
      return IMP.finish(res, 'new');
    },
    async finish(res, into) {
      if (into === 'new') {
        if (ed.dirty && !(await UI.confirm('Import data', 'Discard unsaved changes in the current project?'))) return;
        const p = Model.newProject(); p.name = res.name; p.skeleton = res.skeleton; p.images = res.images; p.audio = res.audio;
        p.editor.activeAnim = res.skeleton.animations[0] ? res.skeleton.animations[0].name : null;
        A.IO.handle = null; A.IO.nativePath = null; A.IO.load(p); ed.dirty = true;
      } else {
        const S = A.Skeletons, list = S.entries(); S.sync();
        for (const n in res.images) if (!ed.project.images[n]) ed.project.images[n] = res.images[n];
        for (const n in res.audio) if (!ed.project.audio[n]) ed.project.audio[n] = res.audio[n];
        list.push({ name: Model.uniqueName(list, res.name), skeleton: res.skeleton, activeSkin: 'default', activeAnim: res.skeleton.animations[0] ? res.skeleton.animations[0].name : null, show: false, x: 0, y: 0 });
        ed.syncImages(); ed.dirty = true; S.switchTo(list.length - 1);
      }
      const sk = res.skeleton;
      UI.toast(`Imported ${sk.bones.length} bones, ${sk.slots.length} slots, ${sk.animations.length} animations, ${Object.keys(res.images).length} images`, 4000);
      if (res.warnings.length) UI.alert('Imported with notes', h('div', null, ...res.warnings.map((w) => h('div', null, '• ' + w))));
    },
    async dialog() {
      let files = [], scale = 1, into = 'new';
      const status = h('div.note', null, 'Nothing chosen yet.');
      const pick = async (dir) => { const f = await Act.pickFiles(dir ? '' : '.json,.alkb,.skel,.atlas,.txt,' + A.Formats.IMAGE_ACCEPT + ',' + A.Formats.AUDIO_ACCEPT, true, dir); if (!f) return; files = files.concat([...f]); status.textContent = files.length + ' file' + (files.length === 1 ? '' : 's') + ': ' + files.slice(0, 6).map((x) => x.name).join(', ') + (files.length > 6 ? ' …' : ''); };
      const body = h('div.form', null,
        UI.note('Brings exported skeleton data back in for editing: Alike runtime data (.json / .alkb), Spine 3.8–4.x JSON or Spine 3.8 binary (.skel). Choose the data file with its atlas (.atlas or the export\'s pages) — or the folder of images the skeleton uses.'),
        UI.row(UI.button('Choose files…', () => pick(false), { primary: true }), UI.button('Add a folder…', () => pick(true)), UI.button('Clear', () => { files = []; status.textContent = 'Nothing chosen yet.'; })),
        status,
        UI.num('Scale', () => scale, (v) => (scale = Math.max(0.01, v)), { step: 0.05, prec: 3 }),
        UI.select('Import into', [['new', 'A new project'], ['add', 'This project, as another skeleton']], () => into, (v) => (into = v)));
      const ok = await UI.modal('Import data', body, [['Cancel', false], ['Import', true, true]]);
      if (!ok || !files.length) return;
      let res;
      try { res = await IMP.read(files, scale); } catch (e) { return UI.alert('Import data', e.message); }
      return IMP.finish(res, into);
    },
  };

  A.Importer = IMP;
})(window.A);
