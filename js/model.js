/* Alike Studio — project / skeleton data model */
(function (A) {
  'use strict';
  const M = A.M;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const BONE_PROPS = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearX', 'shearY'];

  const Model = {
    clone, BONE_PROPS,

    newProject() {
      return {
        format: 'alike-project', version: 1,
        name: 'Untitled',
        images: {}, // name -> { data: dataURL, w, h }
        audio: {},  // name -> { data: dataURL }
        skeleton: Model.newSkeleton(),
        editor: { activeSkin: 'default', activeAnim: null },
      };
    },
    newSkeleton() {
      return {
        fps: 30,
        wind: 0, gravity: 0, // global physics forces (added to every physics constraint)
        bones: [Model.newBone('root', null)],
        slots: [],
        drawFolders: [], // [{ name }] — slots with slot.folder = name are kept together in draw order
        skins: [{ name: 'default', attachments: {}, bones: [], constraints: [] }],
        constraints: [],
        events: [],
        animations: [],
      };
    },
    newBone(name, parent, o = {}) {
      return Object.assign({
        name, parent, length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0,
        inheritRotation: true, inheritScale: true, inheritReflection: true,
        color: '9aa4b2ff', skinRequired: false, icon: 'bone',
      }, o);
    },
    newSlot(name, bone, o = {}) {
      return Object.assign({ name, bone, color: [1, 1, 1, 1], dark: null, attachment: null, blend: 'normal' }, o);
    },
    newAttachment(type, name, o = {}) {
      const base = { type, name, color: [1, 1, 1, 1] };
      switch (type) {
        case 'region': Object.assign(base, { path: name, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 64, height: 64, sequence: null }); break;
        case 'mesh': Object.assign(base, { path: name, width: 64, height: 64, uvs: [], verts: [], weights: null, triangles: [], hull: 0, sequence: null }); break;
        case 'linkedmesh': Object.assign(base, { path: name, parent: '', parentSlot: null, inheritDeform: true, width: 64, height: 64 }); break;
        case 'bbox': Object.assign(base, { verts: [], weights: null, color: [0.38, 0.9, 0.45, 1] }); break;
        case 'clip': Object.assign(base, { verts: [], weights: null, end: null, inverse: false, color: [0.95, 0.3, 0.45, 1] }); break;
        case 'path': Object.assign(base, { points: [], closed: false, constantSpeed: true, color: [1, 0.55, 0.15, 1] }); break;
        case 'point': Object.assign(base, { x: 0, y: 0, rotation: 0, color: [0.95, 0.85, 0.2, 1] }); break;
      }
      return Object.assign(base, o);
    },
    newConstraint(type, name, o = {}) {
      const base = { type, name, skinRequired: false, enabled: true };
      switch (type) {
        case 'ik': Object.assign(base, { bones: [], target: null, mix: 1, softness: 0, bendPositive: true, compress: false, stretch: false, uniform: false, volume: false }); break;
        case 'transform': Object.assign(base, { bones: [], target: null, local: false, relative: false, sourceSpace: 'local', mappings: [],
          mixRotate: 1, mixX: 1, mixY: 1, mixScaleX: 1, mixScaleY: 1, mixShearY: 1,
          offRotate: 0, offX: 0, offY: 0, offScaleX: 0, offScaleY: 0, offShearY: 0 }); break;
        case 'path': Object.assign(base, { bones: [], target: null, positionMode: 'percent', spacingMode: 'length', rotateMode: 'tangent',
          offRotate: 0, position: 0, spacing: 0, mixRotate: 1, mixX: 1, mixY: 1 }); break;
        case 'physics': Object.assign(base, { bone: null, x: false, y: false, rotate: true, scaleX: false, shearX: false,
          inertia: 0.5, strength: 100, damping: 0.4, mass: 1, wind: 0, gravity: 0, mix: 1, step: 60, limit: 5000, volume: false }); break;
        case 'slider': Object.assign(base, { animation: null, bone: null, property: 'x', scale: 0.01, offset: 0, time: 0, mix: 1, loop: false, additive: false }); break;
      }
      return Object.assign(base, o);
    },
    newEvent(name) { return { name, int: 0, float: 0, string: '', audio: '', volume: 1, balance: 0 }; },
    newAnimation(name) { return { name, timelines: [], duration: 0 }; },

    /* ---------- lookups ---------- */
    bone: (sk, n) => sk.bones.find((b) => b.name === n),
    slot: (sk, n) => sk.slots.find((s) => s.name === n),
    skin: (sk, n) => sk.skins.find((s) => s.name === n),
    constraint: (sk, n) => sk.constraints.find((c) => c.name === n),
    anim: (sk, n) => sk.animations.find((a) => a.name === n),
    event: (sk, n) => sk.events.find((e) => e.name === n),
    children: (sk, n) => sk.bones.filter((b) => b.parent === n),
    slotsOf: (sk, n) => sk.slots.filter((s) => s.bone === n),
    isAncestor(sk, anc, n) { // is `anc` an ancestor of `n` (or equal)
      let b = Model.bone(sk, n);
      while (b) { if (b.name === anc) return true; b = Model.bone(sk, b.parent); }
      return false;
    },
    descendants(sk, n) {
      const out = [];
      const walk = (p) => { for (const c of Model.children(sk, p)) { out.push(c.name); walk(c.name); } };
      walk(n); return out;
    },
    /* Keep bones ordered parents-before-children (stable). */
    sortBones(sk) {
      const out = [], seen = new Set();
      const add = (b) => {
        if (seen.has(b.name)) return;
        if (b.parent) { const p = Model.bone(sk, b.parent); if (p) add(p); else b.parent = null; }
        seen.add(b.name); out.push(b);
      };
      sk.bones.forEach(add);
      sk.bones = out;
    },
    uniqueName(list, base) {
      const names = new Set(list.map((x) => x.name));
      if (!names.has(base)) return base;
      let i = 2; const stem = base.replace(/\d+$/, '');
      while (names.has(stem + i)) i++;
      return stem + i;
    },
    allAttachmentNames(sk) {
      const arr = [];
      for (const skin of sk.skins) for (const s in skin.attachments) for (const a in skin.attachments[s]) arr.push({ name: a });
      return arr;
    },

    /* ---------- attachments / skins ---------- */
    getAttachment(sk, skinName, slotName, attName) {
      if (!attName) return null;
      const tryskin = (sn) => { const sk2 = Model.skin(sk, sn); return sk2 && sk2.attachments[slotName] && sk2.attachments[slotName][attName]; };
      if (Array.isArray(skinName)) { for (const n of skinName) { const a = tryskin(n); if (a) return a; } return tryskin('default') || null; } // active skin + pinned skins
      return (skinName && tryskin(skinName)) || tryskin('default') || null;
    },
    /* every (skin, slot, attachment) triple */
    eachAttachment(sk, fn) {
      for (const skin of sk.skins) for (const s in skin.attachments) for (const a in skin.attachments[s]) fn(skin.attachments[s][a], s, skin, a);
    },
    slotAttachmentNames(sk, slotName) {
      const set = new Set();
      for (const skin of sk.skins) if (skin.attachments[slotName]) Object.keys(skin.attachments[slotName]).forEach((n) => set.add(n));
      return [...set];
    },
    putAttachment(sk, skinName, slotName, att) {
      const skin = Model.skin(sk, skinName) || sk.skins[0];
      (skin.attachments[slotName] = skin.attachments[slotName] || {})[att.name] = att;
      return att;
    },

    /* ---------- rename with reference updates ---------- */
    renameBone(sk, from, to) {
      const b = Model.bone(sk, from); if (!b || from === to) return;
      b.name = to;
      sk.bones.forEach((x) => { if (x.parent === from) x.parent = to; });
      sk.slots.forEach((s) => { if (s.bone === from) s.bone = to; });
      Model.eachAttachment(sk, (a) => { if (a.weights) a.weights.forEach((vw) => vw.forEach((e) => { if (e.b === from) e.b = to; })); });
      sk.constraints.forEach((c) => {
        if (c.bones) c.bones = c.bones.map((n) => (n === from ? to : n));
        if (c.target === from) c.target = to;
        if (c.bone === from) c.bone = to;
      });
      sk.skins.forEach((s) => { s.bones = s.bones.map((n) => (n === from ? to : n)); });
      Model.eachTimeline(sk, (tl) => { if (tl.type === 'bone' && tl.target === from) tl.target = to; });
    },
    renameSlot(sk, from, to) {
      const s = Model.slot(sk, from); if (!s || from === to) return;
      s.name = to;
      sk.skins.forEach((skin) => { if (skin.attachments[from]) { skin.attachments[to] = skin.attachments[from]; delete skin.attachments[from]; } });
      Model.eachAttachment(sk, (a) => { if (a.type === 'clip' && a.end === from) a.end = to; });
      sk.constraints.forEach((c) => { if (c.type === 'path' && c.target === from) c.target = to; });
      Model.eachTimeline(sk, (tl) => {
        if ((tl.type === 'slot' || tl.type === 'deform' || tl.type === 'sequence') && tl.target === from) tl.target = to;
        if (tl.type === 'drawOrder' || tl.type === 'drawFolder') tl.keys.forEach((k) => { k.v = k.v.map((n) => (n === from ? to : n)); });
      });
    },
    renameAttachment(sk, slotName, from, to) {
      sk.skins.forEach((skin) => {
        const m = skin.attachments[slotName];
        if (m && m[from]) { m[to] = m[from]; m[to].name = to; delete m[from]; }
      });
      Model.eachAttachment(sk, (a, s) => { if (s === slotName && a.type === 'linkedmesh' && a.parent === from) a.parent = to; });
      const sl = Model.slot(sk, slotName); if (sl && sl.attachment === from) sl.attachment = to;
      Model.eachTimeline(sk, (tl) => {
        if (tl.target !== slotName) return;
        if (tl.type === 'slot' && tl.prop === 'attachment') tl.keys.forEach((k) => { if (k.v === from) k.v = to; });
        if ((tl.type === 'deform' || tl.type === 'sequence') && tl.attachment === from) tl.attachment = to;
      });
    },
    renameConstraint(sk, from, to) {
      const c = Model.constraint(sk, from); if (!c) return;
      c.name = to;
      sk.skins.forEach((s) => { s.constraints = s.constraints.map((n) => (n === from ? to : n)); });
      Model.eachTimeline(sk, (tl) => { if (tl.type === 'constraint' && tl.target === from) tl.target = to; });
    },
    renameAnimation(sk, from, to) {
      const a = Model.anim(sk, from); if (!a) return;
      a.name = to;
      sk.constraints.forEach((c) => { if (c.type === 'slider' && c.animation === from) c.animation = to; });
    },
    renameEvent(sk, from, to) {
      const e = Model.event(sk, from); if (!e) return;
      e.name = to;
      Model.eachTimeline(sk, (tl) => { if (tl.type === 'event') tl.keys.forEach((k) => { if (k.v.name === from) k.v.name = to; }); });
    },
    renameSkin(sk, from, to) { const s = Model.skin(sk, from); if (s && from !== 'default') s.name = to; },
    renameImage(project, from, to) {
      if (!project.images[from] || project.images[to]) return;
      project.images[to] = project.images[from]; delete project.images[from];
      Model.eachAttachment(project.skeleton, (a) => { if (a.path === from) a.path = to; });
    },

    /* ---------- delete with reference cleanup ---------- */
    deleteBone(sk, name) {
      const b = Model.bone(sk, name); if (!b || !b.parent) return false; // root can't be deleted
      const doomed = new Set([name, ...Model.descendants(sk, name)]);
      sk.slots.filter((s) => doomed.has(s.bone)).forEach((s) => Model.deleteSlot(sk, s.name));
      sk.bones = sk.bones.filter((x) => !doomed.has(x.name));
      sk.constraints = sk.constraints.filter((c) => {
        if (c.bones) c.bones = c.bones.filter((n) => !doomed.has(n));
        if (c.type === 'path') return c.bones.length > 0;
        if (c.type === 'slider') { if (doomed.has(c.bone)) c.bone = null; return true; }
        if (c.type === 'physics') return !doomed.has(c.bone);
        return c.bones.length > 0 && !doomed.has(c.target);
      });
      sk.skins.forEach((s) => { s.bones = s.bones.filter((n) => !doomed.has(n)); });
      Model.eachAttachment(sk, (a) => { if (a.weights) Model.stripWeights(a, doomed); });
      Model.eachAnim(sk, (an) => { an.timelines = an.timelines.filter((tl) => !(tl.type === 'bone' && doomed.has(tl.target))); });
      return true;
    },
    stripWeights(att, doomedSet) {
      att.weights.forEach((vw, i) => {
        const keep = vw.filter((e) => !doomedSet.has(e.b));
        const sum = keep.reduce((s, e) => s + e.w, 0);
        if (keep.length && sum > 0) keep.forEach((e) => (e.w /= sum));
        att.weights[i] = keep;
      });
      if (att.weights.some((vw) => vw.length === 0)) { // vertex lost all bones → unweight mesh (keep shape)
        att.weights = null;
      }
    },
    deleteSlot(sk, name) {
      sk.slots = sk.slots.filter((s) => s.name !== name);
      sk.skins.forEach((skin) => delete skin.attachments[name]);
      sk.constraints = sk.constraints.filter((c) => !(c.type === 'path' && c.target === name));
      Model.eachAnim(sk, (an) => {
        an.timelines = an.timelines.filter((tl) => !(['slot', 'deform', 'sequence'].includes(tl.type) && tl.target === name));
        an.timelines.forEach((tl) => { if (tl.type === 'drawOrder' || tl.type === 'drawFolder') tl.keys.forEach((k) => { k.v = k.v.filter((n) => n !== name); }); });
      });
    },
    deleteAttachment(sk, skinName, slotName, attName) {
      const skin = Model.skin(sk, skinName);
      if (skin && skin.attachments[slotName]) {
        delete skin.attachments[slotName][attName];
        if (!Object.keys(skin.attachments[slotName]).length) delete skin.attachments[slotName];
      }
      const sl = Model.slot(sk, slotName);
      if (sl && sl.attachment === attName && !Model.getAttachment(sk, null, slotName, attName)) sl.attachment = null;
      Model.eachAnim(sk, (an) => { an.timelines = an.timelines.filter((tl) => !(tl.type === 'deform' && tl.target === slotName && tl.attachment === attName)); });
    },
    deleteConstraint(sk, name) {
      sk.constraints = sk.constraints.filter((c) => c.name !== name);
      sk.skins.forEach((s) => { s.constraints = s.constraints.filter((n) => n !== name); });
      Model.eachAnim(sk, (an) => { an.timelines = an.timelines.filter((tl) => !(tl.type === 'constraint' && tl.target === name)); });
    },
    deleteEvent(sk, name) {
      sk.events = sk.events.filter((e) => e.name !== name);
      Model.eachAnim(sk, (an) => an.timelines.forEach((tl) => { if (tl.type === 'event') tl.keys = tl.keys.filter((k) => k.v.name !== name); }));
    },

    /* ---------- draw order folders ---------- */
    folderSlots: (sk, f) => sk.slots.filter((s) => s.folder === f),
    /* drop stale folder refs and keep each folder's slots next to each other (at the first member's place) */
    normalizeDrawFolders(sk) {
      sk.drawFolders = sk.drawFolders || [];
      const names = new Set(sk.drawFolders.map((f) => f.name));
      sk.slots.forEach((s) => { if (s.folder && !names.has(s.folder)) delete s.folder; });
      const out = [], done = new Set();
      for (const s of sk.slots) {
        if (!s.folder) { out.push(s); continue; }
        if (done.has(s.folder)) continue;
        done.add(s.folder); out.push(...Model.folderSlots(sk, s.folder));
      }
      sk.slots = out;
    },
    renameDrawFolder(sk, from, to) {
      const f = (sk.drawFolders || []).find((x) => x.name === from); if (!f || from === to) return;
      f.name = to;
      sk.slots.forEach((s) => { if (s.folder === from) s.folder = to; });
      Model.eachTimeline(sk, (tl) => { if (tl.type === 'drawFolder' && tl.target === from) tl.target = to; });
    },
    deleteDrawFolder(sk, name) {
      sk.drawFolders = (sk.drawFolders || []).filter((f) => f.name !== name);
      sk.slots.forEach((s) => { if (s.folder === name) delete s.folder; });
      Model.eachAnim(sk, (an) => { an.timelines = an.timelines.filter((tl) => !(tl.type === 'drawFolder' && tl.target === name)); });
    },

    /* ---------- tree folders ("folder/name" paths for animations, skins, events, constraints) ---------- */
    folderOf: (name) => { const i = (name || '').lastIndexOf('/'); return i < 0 ? '' : name.slice(0, i); },
    leafName: (name) => { const i = (name || '').lastIndexOf('/'); return i < 0 ? name : name.slice(i + 1); },

    /* ---------- clean up: remove keys and timelines that change nothing ---------- */
    sameVal(a, b) {
      if (a === b) return true;
      if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-5;
      if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => Model.sameVal(x, b[i]));
      if (a && b && typeof a === 'object' && typeof b === 'object') { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every((k) => Model.sameVal(a[k], b[k])); }
      return false;
    },
    setupValueOf(sk, tl) {
      switch (tl.type) {
        case 'bone': return tl.prop === 'scaleX' || tl.prop === 'scaleY' ? 1 : 0;
        case 'slot': { const s = Model.slot(sk, tl.target); if (!s) return undefined; return tl.prop === 'attachment' ? s.attachment : tl.prop === 'color' ? s.color : s.dark; }
        case 'constraint': { const c = Model.constraint(sk, tl.target); return c ? c[tl.prop] : undefined; }
        case 'deform': return 'zeros';
        default: return undefined;
      }
    },
    /* returns how many keys were removed; keeps the animation's length */
    cleanUpAnimation(sk, an) {
      an.duration = Math.max(an.duration || 0, Model.animDuration(an));
      let removed = 0;
      for (const tl of an.timelines) {
        if (tl.type === 'event') continue;
        const ks = tl.keys, disc = Model.isDiscrete(tl);
        // a key equal to the previous one changes nothing when the value is held after it anyway
        for (let i = ks.length - 1; i >= 1; i--) {
          if (!Model.sameVal(ks[i].v, ks[i - 1].v)) continue;
          const next = ks[i + 1];
          if (disc || !next || Model.sameVal(ks[i].v, next.v) || (ks[i - 1].c === 's' && ks[i].c === 's')) { if (!disc && next) ks[i - 1].c = ks[i].c; ks.splice(i, 1); removed++; }
        }
        if (ks.length === 1) {
          const sv = Model.setupValueOf(sk, tl), v = ks[0].v;
          if (sv === 'zeros' ? Array.isArray(v) && v.every((x) => Math.abs(x) < 1e-5) : sv !== undefined && Model.sameVal(v, sv)) { ks.length = 0; removed++; }
        }
      }
      an.timelines = an.timelines.filter((tl) => tl.keys.length);
      return removed;
    },

    /* ---------- timelines ---------- */
    eachAnim(sk, fn) { sk.animations.forEach(fn); },
    eachTimeline(sk, fn) { sk.animations.forEach((a) => a.timelines.forEach(fn)); },
    tlKey(tl) { return [tl.type, tl.target || '', tl.prop || '', tl.attachment || '', tl.skin || ''].join('|'); },
    findTimeline(anim, type, target, prop, attachment) {
      return anim.timelines.find((t) => t.type === type && (t.target || null) === (target || null) && (t.prop || null) === (prop || null) && (t.attachment || null) === (attachment || null));
    },
    ensureTimeline(anim, type, target, prop, attachment) {
      let tl = Model.findTimeline(anim, type, target, prop, attachment);
      if (!tl) {
        tl = { type, keys: [] };
        if (target) tl.target = target;
        if (prop) tl.prop = prop;
        if (attachment) tl.attachment = attachment;
        anim.timelines.push(tl);
      }
      return tl;
    },
    keyIndexAt(tl, t) { return tl.keys.findIndex((k) => Math.abs(k.t - t) < 1e-4); },
    setKey(tl, t, v, curve) {
      const i = Model.keyIndexAt(tl, t);
      if (i >= 0) { tl.keys[i].v = v; if (curve !== undefined) tl.keys[i].c = curve; return tl.keys[i]; }
      const k = { t, v, c: curve === undefined ? Model.defaultCurve(tl) : curve };
      tl.keys.push(k);
      tl.keys.sort((a, b) => a.t - b.t);
      return k;
    },
    newKeyCurve: null, // editor hook: curve used for new numeric keys ("last chosen curve")
    defaultCurve(tl) {
      if (tl.type === 'slot' && tl.prop === 'attachment') return 's';
      if (['drawOrder', 'drawFolder', 'event', 'sequence'].includes(tl.type)) return 's';
      if (Model.isDiscrete(tl)) return 's';
      const c = Model.newKeyCurve; return c ? (Array.isArray(c) ? c.slice() : c) : 'l';
    },
    isDiscrete(tl) {
      return (tl.type === 'slot' && tl.prop === 'attachment') || tl.type === 'drawOrder' || tl.type === 'drawFolder' || tl.type === 'event' || tl.type === 'sequence' || (tl.type === 'constraint' && tl.prop === 'bendPositive');
    },
    /* Sample a timeline at time t (seconds). Returns value or undefined if no keys. */
    sample(tl, t) {
      const ks = tl.keys;
      if (!ks.length) return undefined;
      if (t <= ks[0].t) return ks[0].v;
      const last = ks[ks.length - 1];
      if (t >= last.t) return last.v;
      let lo = 0, hi = ks.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ks[mid].t <= t) lo = mid; else hi = mid; }
      const k0 = ks[lo], k1 = ks[hi];
      if (Model.isDiscrete(tl) || k0.c === 's') return k0.v;
      let f = (t - k0.t) / (k1.t - k0.t || 1);
      if (Array.isArray(k0.c)) f = M.bezierAt(k0.c, f);
      const a = k0.v, b = k1.v;
      if (typeof a === 'number') return a + (b - a) * f;
      if (Array.isArray(a)) { const out = new Array(a.length); for (let i = 0; i < a.length; i++) out[i] = a[i] + ((b[i] == null ? a[i] : b[i]) - a[i]) * f; return out; }
      return a;
    },
    animDuration(anim) {
      let d = anim.duration || 0;
      anim.timelines.forEach((tl) => tl.keys.forEach((k) => { if (k.t > d) d = k.t; }));
      return d;
    },

    /* setup value of bone property, used for timeline offsets */
    boneSetupValue(b, prop) {
      switch (prop) {
        case 'rotate': return b.rotation; case 'x': return b.x; case 'y': return b.y;
        case 'scaleX': return b.scaleX; case 'scaleY': return b.scaleY;
        case 'shearX': return b.shearX; case 'shearY': return b.shearY;
      }
      return 0;
    },
    /* converts a final local value into the stored key value (offsets / multipliers) */
    boneKeyFromValue(b, prop, value) {
      if (prop === 'scaleX' || prop === 'scaleY') { const s = Model.boneSetupValue(b, prop); return Math.abs(s) > 1e-6 ? value / s : value; }
      return value - Model.boneSetupValue(b, prop);
    },
    boneValueFromKey(b, prop, key) {
      if (prop === 'scaleX' || prop === 'scaleY') return Model.boneSetupValue(b, prop) * key;
      return Model.boneSetupValue(b, prop) + key;
    },
  };

  A.Model = Model;
})(window.A);
