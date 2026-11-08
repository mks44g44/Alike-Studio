/* Alike Studio — editor state, selection, history, keying */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, FIELD = A.Pose.FIELD;
  const DATA = { rotate: 'rotation', x: 'x', y: 'y', scaleX: 'scaleX', scaleY: 'scaleY', shearX: 'shearX', shearY: 'shearY' };

  const listeners = {};
  const ed = {
    project: Model.newProject(),
    images: {},          // name -> HTMLImageElement
    mode: 'setup',
    tool: 'pose',
    axes: 'local',       // translate axes: local | parent | world
    sel: [],             // [{k, n, slot, skin}]
    time: 0, playing: false, loop: true, speed: 1,
    autoKey: true,
    ghost: { on: false, before: 3, after: 3, step: 3 },
    physics: true,
    physStore: {},
    layer: { anim: null, alpha: 0.5, additive: false }, // second track for mix preview
    ov: { bones: {}, slots: {}, deform: {}, cons: {} }, // uncommitted animate-mode changes
    view: { bones: true, images: true, meshes: false, bboxes: true, paths: true, points: true, clipping: true, names: false, grid: true,
      boneSize: 1, iconRotation: true, pinnedSkins: false, treeSkins: 'all' /* all | active | pinned */, waveforms: true },
    hiddenSlots: new Set(), hiddenBones: new Set(), locked: new Set(),
    snap: { on: false, move: 10, angle: 5, scale: 0.05 },
    compensate: { children: false, images: false },
    keySel: new Set(),   // selected timeline keys (objects)
    vertSel: new Set(),  // selected vertex indices (mesh tool)
    weightBone: null,
    brush: { size: 40, strength: 0.5, mode: 'add' },
    undoStack: [], redoStack: [],
    dirty: false,
    pose: null,
    status: '',
    get sk() { return this.project.skeleton; },
    get anim() { return Model.anim(this.sk, this.project.editor.activeAnim); },
    get skinName() { return this.project.editor.activeSkin || 'default'; },
    get fps() { return this.sk.fps || 30; },

    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, arg) { (listeners[ev] || []).forEach((f) => f(arg)); },
    changed(what = 'change') { this.dirty = true; this.emit('change', what); },
    setStatus(s) { this.status = s; this.emit('status', s); },

    /* ---------- history ---------- */
    snapshot() { return { sk: JSON.stringify(this.project.skeleton), images: Object.assign({}, this.project.images), audio: Object.assign({}, this.project.audio || {}), editor: JSON.stringify(this.project.editor) }; },
    restore(s) {
      this.project.skeleton = JSON.parse(s.sk);
      this.project.images = Object.assign({}, s.images);
      this.project.audio = Object.assign({}, s.audio || {});
      this.project.editor = JSON.parse(s.editor);
      this.syncImages();
      this.sel = this.sel.filter((r) => this.refExists(r));
      this.keySel.clear(); this.vertSel.clear();
      this.clearOverrides();
    },
    pushUndo(label) {
      this.undoStack.push({ label, s: this.snapshot() });
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack.length = 0;
    },
    undo() {
      const e = this.undoStack.pop(); if (!e) return;
      this.redoStack.push({ label: e.label, s: this.snapshot() });
      this.restore(e.s); this.setStatus('Undo: ' + e.label); this.changed('structure'); this.emit('selection');
    },
    redo() {
      const e = this.redoStack.pop(); if (!e) return;
      this.undoStack.push({ label: e.label, s: this.snapshot() });
      this.restore(e.s); this.setStatus('Redo: ' + e.label); this.changed('structure'); this.emit('selection');
    },
    /* run a structural edit with undo */
    commit(label, fn, what = 'structure') {
      this.pushUndo(label);
      const r = fn(this.sk);
      this.changed(what);
      return r;
    },

    /* ---------- images ---------- */
    syncImages() {
      for (const n in this.project.images) {
        const rec = this.project.images[n];
        const cur = this.images[n];
        if (!cur || cur._src !== rec.data) {
          const img = new Image(); img._src = rec.data; img.src = rec.data;
          img.onload = () => this.emit('redraw');
          this.images[n] = img;
        }
      }
      for (const n in this.images) if (!this.project.images[n]) delete this.images[n];
    },
    addImage(name, dataURL, w, h) {
      this.project.images[name] = { data: dataURL, w, h };
      this.syncImages();
    },

    /* ---------- selection ---------- */
    refExists(r) {
      const sk = this.sk;
      switch (r.k) {
        case 'bone': return !!Model.bone(sk, r.n);
        case 'slot': return !!Model.slot(sk, r.n);
        case 'att': return !!(Model.skin(sk, r.skin) && Model.skin(sk, r.skin).attachments[r.slot] && Model.skin(sk, r.skin).attachments[r.slot][r.n]);
        case 'con': return !!Model.constraint(sk, r.n);
        case 'skin': return !!Model.skin(sk, r.n);
        case 'anim': return !!Model.anim(sk, r.n);
        case 'event': return !!Model.event(sk, r.n);
        case 'image': return !!this.project.images[r.n];
        case 'audio': return !!(this.project.audio && this.project.audio[r.n]);
        default: return true;
      }
    },
    sameRef: (a, b) => a.k === b.k && a.n === b.n && (a.kind || null) === (b.kind || null) && (a.slot || null) === (b.slot || null) && (a.skin || null) === (b.skin || null),
    select(ref, additive = false) {
      if (!ref) { this.sel = []; }
      else if (additive) {
        const i = this.sel.findIndex((r) => this.sameRef(r, ref));
        if (i >= 0) this.sel.splice(i, 1); else this.sel.push(ref);
      } else this.sel = [ref];
      this.vertSel.clear();
      const p = this.primary();
      if (p && p.k === 'anim') { this.setAnim(p.n); }
      this.emit('selection');
    },
    selectMany(refs) { this.sel = refs; this.vertSel.clear(); this.emit('selection'); },
    primary() { return this.sel[this.sel.length - 1] || null; },
    selected(k) { return this.sel.filter((r) => r.k === k); },
    isSelected(ref) { return this.sel.some((r) => this.sameRef(r, ref)); },
    selBones() { return this.selected('bone').map((r) => r.n).filter((n) => Model.bone(this.sk, n)); },
    selAttachment() {
      const p = this.primary(); if (!p || p.k !== 'att') return null;
      const skin = Model.skin(this.sk, p.skin);
      const att = skin && skin.attachments[p.slot] && skin.attachments[p.slot][p.n];
      return att ? { att, slot: p.slot, skin: p.skin } : null;
    },

    /* ---------- mode / animation / time ---------- */
    setMode(m) {
      if (m === this.mode) return;
      if (m === 'animate' && !this.anim) {
        if (!this.sk.animations.length) this.commit('New animation', (sk) => sk.animations.push(Model.newAnimation('animation')));
        this.project.editor.activeAnim = this.sk.animations[0].name;
      }
      this.mode = m; this.playing = false; this.clearOverrides(); this.physStore = {};
      this.emit('mode', m); this.changed('mode');
    },
    setAnim(name) {
      if (this.project.editor.activeAnim === name) return;
      this.project.editor.activeAnim = name; this.time = 0; this.keySel.clear(); this.clearOverrides(); this.physStore = {};
      this.emit('anim'); this.emit('time');
    },
    setTime(t, fromPlayback = false) {
      const old = this.time;
      this.time = Math.max(0, t);
      if (!fromPlayback) { this.clearOverrides(); if (t < old) this.physStore = {}; }
      this.emit('time');
    },
    frame() { return Math.round(this.time * this.fps); },
    snapTime(t) { return Math.round(t * this.fps) / this.fps; },
    clearOverrides() { this.ov = { bones: {}, slots: {}, deform: {}, cons: {} }; },
    hasOverrides() { const o = this.ov; return Object.keys(o.bones).length + Object.keys(o.slots).length + Object.keys(o.deform).length + Object.keys(o.cons).length > 0; },

    /* ---------- pose computation ---------- */
    computePose(dt = 0, time = this.time, withOverrides = true, phys = this.physStore) {
      const pins = this.view.pinnedSkins ? (this.project.editor.pinnedSkins || []).filter((n) => n !== this.skinName && Model.skin(this.sk, n)) : [];
      const pose = new A.Pose(this.project, pins.length ? [this.skinName, ...pins] : this.skinName);
      if (this.mode === 'animate') {
        const an = this.anim;
        if (an) pose.applyAnimation(an, time, 1);
        if (this.layer.anim && this.layer.anim !== this.project.editor.activeAnim) {
          const la = Model.anim(this.sk, this.layer.anim);
          if (la) { const d = Model.animDuration(la) || 1; pose.applyAnimation(la, time % d, this.layer.alpha, { additive: this.layer.additive }); }
        }
        if (withOverrides) this.applyOverrides(pose);
      }
      pose.update(this.physics ? dt : 0, this.physics ? phys : null);
      return pose;
    },
    applyOverrides(pose) {
      for (const n in this.ov.bones) { const b = pose.boneMap[n]; if (b) Object.assign(b, this.ov.bones[n]); }
      for (const n in this.ov.slots) { const s = pose.slotMap[n]; if (s) for (const f in this.ov.slots[n]) { const v = this.ov.slots[n][f]; s[f] = Array.isArray(v) ? v.slice() : v; } }
      for (const k in this.ov.deform) { const [sn, an] = k.split('\u0001'); const s = pose.slotMap[sn]; if (s) s.deform[an] = this.ov.deform[k]; }
      for (const n in this.ov.cons) { const c = pose.conMap[n]; if (c) Object.assign(c, this.ov.cons[n]); }
    },

    /* ---------- bone property editing (mode aware) ---------- */
    boneValue(name, prop) {
      if (this.mode === 'setup' || !this.pose) { const b = Model.bone(this.sk, name); return b ? b[DATA[prop]] : 0; }
      const pb = this.pose.boneMap[name]; return pb ? pb[FIELD[prop]] : 0;
    },
    /* set many bone props at once: changes = { boneName: { prop: value } } */
    setBoneValues(changes, label = 'Transform', undo = true) {
      if (this.mode === 'setup') {
        if (undo) this.pushUndo(label);
        for (const n in changes) { const b = Model.bone(this.sk, n); if (!b) continue; for (const p in changes[n]) b[DATA[p]] = changes[n][p]; }
        this.changed('values');
        return;
      }
      if (!this.anim) return;
      if (this.autoKey) {
        if (undo) this.pushUndo(label);
        for (const n in changes) {
          const b = Model.bone(this.sk, n); if (!b) continue;
          for (const p in changes[n]) {
            const tl = Model.ensureTimeline(this.anim, 'bone', n, p);
            Model.setKey(tl, this.snapTime(this.time), Model.boneKeyFromValue(b, p, changes[n][p]));
            if (this.ov.bones[n]) delete this.ov.bones[n][FIELD[p]];
          }
        }
        this.changed('keys');
      } else {
        for (const n in changes) {
          const o = this.ov.bones[n] = this.ov.bones[n] || {};
          for (const p in changes[n]) o[FIELD[p]] = changes[n][p];
        }
        this.changed('values');
      }
    },
    keyBones(names, props, label = 'Key') {
      const an = this.anim; if (!an || !this.pose) return;
      this.pushUndo(label);
      const t = this.snapTime(this.time);
      for (const n of names) {
        const b = Model.bone(this.sk, n), pb = this.pose.boneMap[n]; if (!b || !pb) continue;
        for (const p of props) {
          const tl = Model.ensureTimeline(an, 'bone', n, p);
          Model.setKey(tl, t, Model.boneKeyFromValue(b, p, pb[FIELD[p]]));
          if (this.ov.bones[n]) delete this.ov.bones[n][FIELD[p]];
        }
      }
      this.changed('keys');
    },
    /* keys only changed (overridden) props of selected bones + slots */
    keyDirty() {
      const an = this.anim; if (!an || !this.pose) return;
      this.pushUndo('Key changes');
      const t = this.snapTime(this.time);
      for (const n in this.ov.bones) {
        const b = Model.bone(this.sk, n); if (!b) continue;
        for (const f in this.ov.bones[n]) {
          const p = Object.keys(FIELD).find((k) => FIELD[k] === f);
          Model.setKey(Model.ensureTimeline(an, 'bone', n, p), t, Model.boneKeyFromValue(b, p, this.ov.bones[n][f]));
        }
      }
      for (const n in this.ov.slots) for (const f in this.ov.slots[n]) {
        const v = this.ov.slots[n][f];
        Model.setKey(Model.ensureTimeline(an, 'slot', n, f), t, Array.isArray(v) ? v.slice() : v);
      }
      for (const k in this.ov.deform) {
        const [sn, at] = k.split('\u0001');
        Model.setKey(Model.ensureTimeline(an, 'deform', sn, null, at), t, Array.from(this.ov.deform[k]));
      }
      for (const n in this.ov.cons) for (const f in this.ov.cons[n]) Model.setKey(Model.ensureTimeline(an, 'constraint', n, f), t, this.ov.cons[n][f]);
      this.clearOverrides();
      this.changed('keys');
    },
    keyState(type, target, prop, attachment) {
      const an = this.anim; if (this.mode !== 'animate' || !an) return 'none';
      if (type === 'bone' && this.ov.bones[target] && this.ov.bones[target][FIELD[prop]] !== undefined) return 'dirty';
      if (type === 'slot' && this.ov.slots[target] && this.ov.slots[target][prop] !== undefined) return 'dirty';
      if (type === 'constraint' && this.ov.cons[target] && this.ov.cons[target][prop] !== undefined) return 'dirty';
      if (type === 'deform' && this.ov.deform[target + '\u0001' + attachment]) return 'dirty';
      const tl = Model.findTimeline(an, type, target, prop, attachment);
      if (!tl || !tl.keys.length) return 'none';
      return Model.keyIndexAt(tl, this.snapTime(this.time)) >= 0 ? 'key' : 'timeline';
    },

    /* generic (slot / constraint) animate-aware setter */
    setSlotValue(name, prop, value, label = 'Slot') {
      if (this.mode === 'setup') { this.pushUndo(label); const s = Model.slot(this.sk, name); s[prop] = value; this.changed('values'); return; }
      if (!this.anim) return;
      if (this.autoKey) {
        this.pushUndo(label);
        Model.setKey(Model.ensureTimeline(this.anim, 'slot', name, prop), this.snapTime(this.time), Array.isArray(value) ? value.slice() : value);
        this.changed('keys');
      } else { (this.ov.slots[name] = this.ov.slots[name] || {})[prop] = value; this.changed('values'); }
    },
    keySlot(name, prop) {
      if (!this.anim || !this.pose) return;
      const ps = this.pose.slotMap[name]; if (!ps) return;
      this.pushUndo('Key slot');
      let v = ps[prop]; if (prop === 'dark' && !v) v = [0, 0, 0];
      Model.setKey(Model.ensureTimeline(this.anim, 'slot', name, prop), this.snapTime(this.time), Array.isArray(v) ? v.slice() : v);
      if (this.ov.slots[name]) delete this.ov.slots[name][prop];
      this.changed('keys');
    },
    setConValue(name, prop, value, label = 'Constraint') {
      if (this.mode === 'setup') { this.pushUndo(label); Model.constraint(this.sk, name)[prop] = value; this.changed('values'); return; }
      if (!this.anim) return;
      if (this.autoKey) {
        this.pushUndo(label);
        Model.setKey(Model.ensureTimeline(this.anim, 'constraint', name, prop), this.snapTime(this.time), value);
        this.changed('keys');
      } else { (this.ov.cons[name] = this.ov.cons[name] || {})[prop] = value; this.changed('values'); }
    },
    keyCon(name, prop) {
      if (!this.anim || !this.pose) return;
      const pc = this.pose.conMap[name]; if (!pc) return;
      this.pushUndo('Key constraint');
      Model.setKey(Model.ensureTimeline(this.anim, 'constraint', name, prop), this.snapTime(this.time), pc[prop]);
      if (this.ov.cons[name]) delete this.ov.cons[name][prop];
      this.changed('keys');
    },
    setDeform(slot, attName, arr, undo = true) {
      if (!this.anim) return;
      if (this.autoKey) {
        if (undo) this.pushUndo('Deform');
        Model.setKey(Model.ensureTimeline(this.anim, 'deform', slot, null, attName), this.snapTime(this.time), Array.from(arr));
        delete this.ov.deform[slot + '\u0001' + attName];
        this.changed('keys');
      } else { this.ov.deform[slot + '\u0001' + attName] = Array.from(arr); this.changed('values'); }
    },

    /* events */
    keyEvent(name) {
      const an = this.anim, ev = Model.event(this.sk, name); if (!an || !ev) return;
      this.pushUndo('Key event');
      const tl = an.timelines.find((t) => t.type === 'event') || (an.timelines.push({ type: 'event', keys: [] }), an.timelines[an.timelines.length - 1]);
      const t = this.snapTime(this.time);
      tl.keys = tl.keys.filter((k) => !(Math.abs(k.t - t) < 1e-4 && k.v.name === name));
      tl.keys.push({ t, v: { name, int: ev.int, float: ev.float, string: ev.string, volume: ev.volume, balance: ev.balance }, c: 's' });
      tl.keys.sort((a, b) => a.t - b.t);
      this.changed('keys');
    },
    /* key the current order of one draw order folder (only the folder's slots move) */
    keyDrawFolder(folder, names) {
      const an = this.anim; if (!an || !this.pose) return;
      this.pushUndo('Key draw order folder');
      const order = names || this.pose.drawOrder.filter((s) => s.data.folder === folder).map((s) => s.name);
      Model.setKey(Model.ensureTimeline(an, 'drawFolder', folder), this.snapTime(this.time), order, 's');
      this.changed('keys');
    },
    keyDrawOrder() {
      const an = this.anim; if (!an || !this.pose) return;
      this.pushUndo('Key draw order');
      Model.setKey(Model.ensureTimeline(an, 'drawOrder'), this.snapTime(this.time), this.pose.drawOrder.map((s) => s.name), 's');
      this.changed('keys');
    },
  };
  ed.DATA = DATA;
  A.ed = ed;
})(window.A);
