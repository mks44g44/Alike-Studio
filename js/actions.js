/* Alike Studio — editor commands shared by menus, tree, properties and shortcuts */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, MO = A.MeshOps, ed = A.ed, UI = A.UI, h = A.UI.h;

  const setupPose = () => { const p = new A.Pose(ed.project, ed.skinName); p.update(); return p; };

  const Act = {
    setupPose,

    newBone() {
      if (ed.mode !== 'setup') return UI.toast('Switch to Setup mode to add bones');
      const parentName = ed.selBones().pop() || 'root';
      const p = Model.bone(ed.sk, parentName);
      ed.commit('New bone', (sk) => {
        const name = Model.uniqueName(sk.bones, 'bone');
        sk.bones.push(Model.newBone(name, parentName, { x: p.length || 0, length: 50, color: p.color }));
        Model.sortBones(sk);
        ed.select({ k: 'bone', n: name });
      });
    },
    newSlot(boneName, imageName) {
      boneName = boneName || ed.selBones().pop() || 'root';
      return ed.commit('New slot', (sk) => {
        const name = Model.uniqueName(sk.slots, imageName || boneName + '-slot');
        const slot = Model.newSlot(name, boneName);
        sk.slots.push(slot);
        if (imageName) {
          const img = ed.project.images[imageName];
          const att = Model.newAttachment('region', imageName, { path: imageName, width: img ? img.w : 64, height: img ? img.h : 64 });
          Model.putAttachment(sk, ed.skinName, name, att);
          slot.attachment = imageName;
          ed.select({ k: 'att', n: att.name, slot: name, skin: Model.skin(sk, ed.skinName) ? ed.skinName : 'default' });
        } else ed.select({ k: 'slot', n: name });
        return name;
      });
    },
    newAttachment(type, slotName, imageName) {
      slotName = slotName || Act.currentSlot();
      if (!slotName) return UI.toast('Select a slot first');
      const sk = ed.sk;
      const base = { region: imageName || 'region', bbox: 'bounds', clip: 'clipping', path: 'path', point: 'point' }[type] || type;
      ed.commit('New ' + type, () => {
        const existing = Model.slotAttachmentNames(sk, slotName).map((n) => ({ name: n }));
        const name = Model.uniqueName(existing, base);
        let att;
        if (type === 'region') {
          const img = ed.project.images[imageName];
          att = Model.newAttachment('region', name, { path: imageName || name, width: img ? img.w : 64, height: img ? img.h : 64 });
        } else if (type === 'bbox' || type === 'clip') {
          att = Model.newAttachment(type, name, { verts: [-50, -50, 50, -50, 50, 50, -50, 50] });
        } else if (type === 'path') {
          att = Model.newAttachment('path', name, { points: [{ x: -100, y: 0, ix: -140, iy: -40, ox: -60, oy: 40 }, { x: 100, y: 0, ix: 60, iy: 40, ox: 140, oy: -40 }] });
        } else att = Model.newAttachment(type, name);
        Model.putAttachment(sk, ed.skinName, slotName, att);
        Model.slot(sk, slotName).attachment = name;
        ed.select({ k: 'att', n: name, slot: slotName, skin: Model.skin(sk, ed.skinName) ? ed.skinName : 'default' });
      });
    },
    currentSlot() {
      const p = ed.primary(); if (!p) return null;
      if (p.k === 'slot') return p.n;
      if (p.k === 'att') return p.slot;
      if (p.k === 'bone') { const s = Model.slotsOf(ed.sk, p.n)[0]; return s ? s.name : null; }
      return null;
    },
    convertToMesh() {
      const s = ed.selAttachment(); if (!s || s.att.type !== 'region') return;
      ed.commit('Convert to mesh', (sk) => {
        const mesh = MO.regionToMesh(s.att);
        Model.skin(sk, s.skin).attachments[s.slot][s.att.name] = mesh;
        ed.select({ k: 'att', n: mesh.name, slot: s.slot, skin: s.skin });
      });
      ed.tool = 'mesh'; ed.emit('tool');
    },
    linkedMesh() {
      const s = ed.selAttachment(); if (!s || s.att.type !== 'mesh') return;
      ed.commit('Linked mesh', (sk) => {
        const name = Model.uniqueName(Model.slotAttachmentNames(sk, s.slot).map((n) => ({ name: n })), s.att.name + '-linked');
        const lm = Model.newAttachment('linkedmesh', name, { parent: s.att.name, path: s.att.path, width: s.att.width, height: s.att.height });
        Model.putAttachment(sk, s.skin, s.slot, lm);
        ed.select({ k: 'att', n: name, slot: s.slot, skin: s.skin });
      });
    },
    newConstraint(type) {
      const sk = ed.sk, bones = ed.selBones();
      const name = Model.uniqueName(sk.constraints, type === 'ik' ? 'ik' : type);
      let c;
      if (type === 'ik') {
        if (!bones.length) return UI.toast('Select 1–2 bones (plus an optional target bone last)');
        let chain = bones.slice(), target = null;
        if (chain.length >= 2) {
          const last = chain[chain.length - 1];
          const lastIsChild = chain.length === 2 && Model.bone(sk, chain[1]).parent === chain[0];
          if (!lastIsChild) { target = last; chain = chain.slice(0, -1); }
        }
        if (chain.length === 2 && Model.bone(sk, chain[1]).parent !== chain[0]) return UI.toast('Two IK bones must be parent and child');
        chain = chain.slice(0, 2);
        ed.commit('New IK constraint', () => {
          if (!target) { // create a target bone at the chain's tip
            const pose = setupPose(), end = pose.boneMap[chain[chain.length - 1]];
            const tip = pose.localToWorld(end, end.data.length, 0);
            target = Model.uniqueName(sk.bones, chain[chain.length - 1] + '-target');
            sk.bones.push(Model.newBone(target, 'root', { x: M.round(tip[0], 2), y: M.round(tip[1], 2), color: 'ffc83cff' }));
          }
          sk.constraints.push(c = Model.newConstraint('ik', name, { bones: chain, target }));
          ed.select({ k: 'con', n: name });
        });
      } else if (type === 'transform') {
        if (bones.length < 2) return UI.toast('Select the constrained bones, then the target bone last');
        ed.commit('New transform constraint', () => { sk.constraints.push(Model.newConstraint('transform', name, { bones: bones.slice(0, -1), target: bones[bones.length - 1] })); ed.select({ k: 'con', n: name }); });
      } else if (type === 'path') {
        if (!bones.length) return UI.toast('Select the bones that should follow a path');
        let target = Act.currentSlot();
        const isPath = (sn) => Model.slotAttachmentNames(sk, sn).some((an) => { const a = Model.getAttachment(sk, ed.skinName, sn, an); return a && a.type === 'path'; });
        if (!target || !isPath(target)) target = (sk.slots.find((s) => isPath(s.name)) || {}).name;
        if (!target) return UI.toast('Create a path attachment first (slot → New → Path)');
        ed.commit('New path constraint', () => { sk.constraints.push(Model.newConstraint('path', name, { bones, target })); ed.select({ k: 'con', n: name }); });
      } else if (type === 'physics') {
        if (!bones.length) return UI.toast('Select one or more bones to add physics');
        ed.commit('New physics', () => {
          let last;
          for (const b of bones) { const n = Model.uniqueName(sk.constraints, b + '-physics'); sk.constraints.push(Model.newConstraint('physics', n, { bone: b })); last = n; }
          ed.select({ k: 'con', n: last });
        });
        ed.physStore = {};
      } else if (type === 'slider') {
        ed.commit('New slider', () => {
          sk.constraints.push(Model.newConstraint('slider', name, { animation: ed.project.editor.activeAnim || (sk.animations[0] && sk.animations[0].name) || null, bone: bones[0] || null }));
          ed.select({ k: 'con', n: name });
        });
      }
    },
    async newSkin() {
      const n = await UI.prompt('New skin', Model.uniqueName(ed.sk.skins, 'skin'));
      if (!n) return;
      if (Model.skin(ed.sk, n)) return UI.toast('A skin with that name exists');
      ed.commit('New skin', (sk) => { sk.skins.push({ name: n, attachments: {}, bones: [], constraints: [] }); ed.project.editor.activeSkin = n; ed.select({ k: 'skin', n }); });
    },
    async newEvent() {
      const n = await UI.prompt('New event', Model.uniqueName(ed.sk.events, 'event'));
      if (!n) return;
      if (Model.event(ed.sk, n)) return UI.toast('An event with that name exists');
      ed.commit('New event', (sk) => { sk.events.push(Model.newEvent(n)); ed.select({ k: 'event', n }); });
    },
    async newAnimation() {
      const n = await UI.prompt('New animation', Model.uniqueName(ed.sk.animations, 'animation'));
      if (!n) return;
      if (Model.anim(ed.sk, n)) return UI.toast('An animation with that name exists');
      ed.commit('New animation', (sk) => { sk.animations.push(Model.newAnimation(n)); });
      ed.setAnim(n); ed.select({ k: 'anim', n });
      if (ed.mode !== 'animate') ed.setMode('animate');
    },
    duplicateAnimation(name) {
      const a = Model.anim(ed.sk, name); if (!a) return;
      ed.commit('Duplicate animation', (sk) => { const c = Model.clone(a); c.name = Model.uniqueName(sk.animations, a.name + '-copy'); sk.animations.push(c); ed.setAnim(c.name); ed.select({ k: 'anim', n: c.name }); });
    },

    /* ---------- delete / duplicate ---------- */
    async deleteSelection() {
      const sel = ed.sel.slice(); if (!sel.length) return;
      const tf = sel.find((r) => r.k === 'tfolder'); if (tf) return A.Folders.deleteTreeFolder(tf.kind, tf.n, false);
      const sr = sel.find((r) => r.k === 'skel'); if (sr) return A.Skeletons.remove(sr.idx);
      if (sel.some((r) => r.k === 'bone' && r.n === 'root')) return UI.toast('The root bone cannot be deleted');
      ed.commit('Delete', (sk) => {
        for (const r of sel) {
          switch (r.k) {
            case 'bone': Model.deleteBone(sk, r.n); break;
            case 'slot': Model.deleteSlot(sk, r.n); break;
            case 'att': Model.deleteAttachment(sk, r.skin, r.slot, r.n); break;
            case 'con': Model.deleteConstraint(sk, r.n); break;
            case 'skin': if (r.n !== 'default') { sk.skins = sk.skins.filter((s) => s.name !== r.n); if (ed.project.editor.activeSkin === r.n) ed.project.editor.activeSkin = 'default'; } break;
            case 'anim': sk.animations = sk.animations.filter((a) => a.name !== r.n); if (ed.project.editor.activeAnim === r.n) ed.project.editor.activeAnim = sk.animations[0] ? sk.animations[0].name : null; break;
            case 'event': Model.deleteEvent(sk, r.n); break;
            case 'image': delete ed.project.images[r.n]; ed.syncImages(); break;
            case 'audio': if (ed.project.audio) delete ed.project.audio[r.n]; sk.events.forEach((e) => { if (e.audio === r.n) e.audio = ''; }); break;
            case 'dfolder': Model.deleteDrawFolder(sk, r.n); break;
          }
        }
        ed.sel = [];
      });
      ed.physStore = {};
      ed.emit('selection');
    },
    duplicateSelection() {
      const p = ed.primary(); if (!p) return;
      const sk = ed.sk;
      if (p.k === 'bone' && p.n !== 'root') {
        ed.commit('Duplicate bone', () => {
          const map = {};
          const names = [p.n, ...Model.descendants(sk, p.n)];
          for (const n of names) map[n] = Model.uniqueName(sk.bones.concat(Object.values(map).map((x) => ({ name: x }))), n + '-copy');
          for (const n of names) { const b = Model.clone(Model.bone(sk, n)); b.name = map[n]; if (map[b.parent]) b.parent = map[b.parent]; sk.bones.push(b); }
          for (const s of sk.slots.slice()) if (map[s.bone]) {
            const ns = Model.clone(s); ns.name = Model.uniqueName(sk.slots, s.name + '-copy'); ns.bone = map[s.bone];
            sk.slots.push(ns);
            for (const skin of sk.skins) if (skin.attachments[s.name]) {
              const atts = Model.clone(skin.attachments[s.name]);
              for (const a in atts) if (atts[a].weights) atts[a].weights.forEach((vw) => vw.forEach((e) => { if (map[e.b]) e.b = map[e.b]; }));
              skin.attachments[ns.name] = atts;
            }
          }
          Model.sortBones(sk);
          ed.select({ k: 'bone', n: map[p.n] });
        });
      } else if (p.k === 'att') {
        ed.commit('Duplicate attachment', () => {
          const skin = Model.skin(sk, p.skin), a = Model.clone(skin.attachments[p.slot][p.n]);
          a.name = Model.uniqueName(Model.slotAttachmentNames(sk, p.slot).map((n) => ({ name: n })), p.n + '-copy');
          skin.attachments[p.slot][a.name] = a;
          ed.select({ k: 'att', n: a.name, slot: p.slot, skin: p.skin });
        });
      } else if (p.k === 'dfolder') A.Folders.duplicateDrawFolder(p.n);
      else if (p.k === 'tfolder') A.Folders.duplicateTreeFolder(p.kind, p.n);
      else if (p.k === 'anim') Act.duplicateAnimation(p.n);
      else if (p.k === 'skin') {
        ed.commit('Duplicate skin', () => { const s = Model.clone(Model.skin(sk, p.n)); s.name = Model.uniqueName(sk.skins, p.n + '-copy'); sk.skins.push(s); ed.select({ k: 'skin', n: s.name }); });
      } else if (p.k === 'con') {
        ed.commit('Duplicate constraint', () => { const c = Model.clone(Model.constraint(sk, p.n)); c.name = Model.uniqueName(sk.constraints, p.n + '-copy'); sk.constraints.push(c); ed.select({ k: 'con', n: c.name }); });
      }
    },
    async renameRef(r) {
      if (!r) return;
      if (r.k === 'tfolder') return A.Folders.renameTreeFolder(r.kind, r.n);
      if (r.k === 'skel') return A.Skeletons.rename(r.idx);
      if (r.k === 'skeleton') return A.Skeletons.rename(A.Skeletons.activeIndex());
      const cur = r.k === 'skeleton' ? ed.project.name : r.n;
      const n = await UI.prompt('Rename', cur);
      if (!n || n === cur) return;
      const sk = ed.sk;
      const clash = { bone: () => Model.bone(sk, n), slot: () => Model.slot(sk, n), con: () => Model.constraint(sk, n), anim: () => Model.anim(sk, n), event: () => Model.event(sk, n), skin: () => Model.skin(sk, n), image: () => ed.project.images[n], audio: () => (ed.project.audio || {})[n], att: () => Model.slotAttachmentNames(sk, r.slot).includes(n) };
      if (clash[r.k] && clash[r.k]()) return UI.toast('That name is already used');
      ed.commit('Rename', () => {
        switch (r.k) {
          case 'bone': Model.renameBone(sk, r.n, n); break;
          case 'slot': Model.renameSlot(sk, r.n, n); break;
          case 'att': Model.renameAttachment(sk, r.slot, r.n, n); break;
          case 'con': Model.renameConstraint(sk, r.n, n); break;
          case 'anim': Model.renameAnimation(sk, r.n, n); if (ed.project.editor.activeAnim === r.n) ed.project.editor.activeAnim = n; break;
          case 'event': Model.renameEvent(sk, r.n, n); break;
          case 'skin': if (r.n === 'default') return; Model.renameSkin(sk, r.n, n); if (ed.project.editor.activeSkin === r.n) ed.project.editor.activeSkin = n; break;
          case 'image': Model.renameImage(ed.project, r.n, n); ed.syncImages(); break;
          case 'audio': ed.project.audio[n] = ed.project.audio[r.n]; delete ed.project.audio[r.n]; sk.events.forEach((e) => { if (e.audio === r.n) e.audio = n; }); break;
          case 'skeleton': ed.project.name = n; return;
          case 'dfolder': if ((sk.drawFolders || []).some((f) => f.name === n)) return UI.toast('That folder exists'); Model.renameDrawFolder(sk, r.n, n); break;
        }
        r.n = n;
      });
      ed.emit('selection');
    },

    /* ---------- hierarchy ---------- */
    reparentBone(name, parent, keepWorld = true) {
      const sk = ed.sk;
      if (name === 'root' || Model.isAncestor(sk, name, parent)) return UI.toast('Cannot parent a bone to itself or its child');
      ed.commit('Set parent', () => {
        const b = Model.bone(sk, name);
        if (keepWorld) {
          const pose = setupPose(), pb = pose.boneMap[name], np = pose.boneMap[parent];
          const inv = M.invert({ a: np.a, b: np.b, c: np.c, d: np.d, x: np.wx, y: np.wy });
          const [lx, ly] = M.apply(inv, pb.wx, pb.wy);
          const q = pose.inheritQ(np, b), qi = M.invert({ a: q.a, b: q.b, c: q.c, d: q.d, x: 0, y: 0 });
          const L = M.mul(qi, { a: pb.a, b: pb.b, c: pb.c, d: pb.d, x: 0, y: 0 });
          const dcmp = M.decompose(L.a, L.b, L.c, L.d);
          Object.assign(b, { x: M.round(lx, 2), y: M.round(ly, 2), rotation: M.round(dcmp.rot, 2), scaleX: M.round(dcmp.sx, 4), scaleY: M.round(dcmp.sy, 4), shearX: 0, shearY: M.round(dcmp.shy, 2) });
        }
        b.parent = parent; Model.sortBones(sk);
      });
    },
    setSlotBone(slotName, bone) { ed.commit('Set slot bone', (sk) => { Model.slot(sk, slotName).bone = bone; }); },
    /* where: 'top' | 'bottom' | ±n | { before: slotName }. folder: undefined keeps the slot's folder, null removes it.
       In Animate mode the change is keyed (as a draw order folder key when the slot stays inside its folder). */
    moveDrawOrder(slotName, where, folder) {
      if (ed.mode === 'animate' && ed.anim && ed.pose) return Act.moveDrawOrderKeyed(slotName, where);
      ed.commit('Draw order', (sk) => {
        const i = sk.slots.findIndex((s) => s.name === slotName); if (i < 0) return;
        const [s] = sk.slots.splice(i, 1);
        if (folder !== undefined) { if (folder) s.folder = folder; else delete s.folder; }
        let j = where === 'top' ? sk.slots.length : where === 'bottom' ? 0 : typeof where === 'number' ? M.clamp(i + where, 0, sk.slots.length) : i;
        if (s.folder && (where === 'top' || where === 'bottom')) { // inside a folder, top/bottom mean the folder's front/back
          const idx = sk.slots.map((x, k) => (x.folder === s.folder ? k : -1)).filter((k) => k >= 0);
          if (idx.length) j = where === 'top' ? idx[idx.length - 1] + 1 : idx[0];
        }
        if (typeof where === 'object' && where.before) { j = sk.slots.findIndex((x) => x.name === where.before); if (j < 0) j = sk.slots.length; }
        sk.slots.splice(j, 0, s);
        // keep folders together: a slot dropped next to its folder's block stays where it was dropped
        Model.normalizeDrawFolders(sk);
      });
    },
    moveDrawOrderKeyed(slotName, where) {
      const pose = ed.pose, cur = pose.drawOrder.map((s) => s.name);
      const i = cur.indexOf(slotName); if (i < 0) return;
      const folder = (Model.slot(ed.sk, slotName) || {}).folder;
      cur.splice(i, 1);
      let j = where === 'top' ? cur.length : where === 'bottom' ? 0 : typeof where === 'number' ? M.clamp(i + where, 0, cur.length) : i;
      if (typeof where === 'object' && where.before) { j = cur.indexOf(where.before); if (j < 0) j = cur.length; }
      const inF = (n) => { const s = Model.slot(ed.sk, n); return s && s.folder === folder; };
      if (folder && (where === 'top' || where === 'bottom')) { const idx = cur.map((n, k) => (inF(n) ? k : -1)).filter((k) => k >= 0); if (idx.length) j = where === 'top' ? idx[idx.length - 1] + 1 : idx[0]; }
      cur.splice(j, 0, slotName);
      if (folder) { // stays among its folder's slots → key only the folder
        const pos = cur.map((n, k) => (inF(n) ? k : -1)).filter((k) => k >= 0);
        if (pos[pos.length - 1] - pos[0] === pos.length - 1) return ed.keyDrawFolder(folder, cur.filter(inF));
      }
      ed.pushUndo('Key draw order');
      Model.setKey(Model.ensureTimeline(ed.anim, 'drawOrder'), ed.snapTime(ed.time), cur, 's');
      ed.changed('keys');
    },
    moveAttachment(fromSlot, skin, attName, toSlot) {
      if (fromSlot === toSlot) return;
      ed.commit('Move attachment', (sk) => {
        const s = Model.skin(sk, skin); const a = s.attachments[fromSlot][attName];
        delete s.attachments[fromSlot][attName];
        (s.attachments[toSlot] = s.attachments[toSlot] || {})[attName] = a;
        const fs = Model.slot(sk, fromSlot); if (fs.attachment === attName) fs.attachment = null;
        ed.select({ k: 'att', n: attName, slot: toSlot, skin });
      });
    },
    moveConstraint(name, delta) {
      ed.commit('Constraint order', (sk) => {
        const i = sk.constraints.findIndex((c) => c.name === name), j = M.clamp(i + delta, 0, sk.constraints.length - 1);
        const [c] = sk.constraints.splice(i, 1); sk.constraints.splice(j, 0, c);
      });
    },

    /* ---------- images ---------- */
    readImageFile(file) { return A.Formats.readImage(file); },
    readImageFileNative(file) {
      return new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => { const img = new Image(); img.onload = () => res({ data: fr.result, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res(null); img.src = fr.result; };
        fr.onerror = () => res(null);
        fr.readAsDataURL(file);
      });
    },
    async importImageFiles(files, opts = {}) {
      const list = [...files].filter((f) => A.Formats.isImage(f.name) || /^image\//.test(f.type || ''));
      if (!list.length) return UI.toast('No images found (PNG, JPG, WebP, GIF, BMP, TGA, TIFF, SVG, AVIF, QOI, PPM …)');
      ed.pushUndo('Import images');
      const added = [];
      for (const f of list) {
        const rec = await Act.readImageFile(f); if (!rec) continue;
        const name = (f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name).replace(/\.[^.]+$/, '');
        ed.addImage(name, rec.data, rec.w, rec.h); added.push(name);
      }
      ed.changed('structure');
      UI.toast(`Imported ${added.length} image${added.length === 1 ? '' : 's'}`);
      if (opts.toSkeleton) Act.imagesToSlots(added);
      return added;
    },
    imagesToSlots(names) {
      const bone = ed.selBones().pop() || 'root';
      ed.commit('Images → slots', (sk) => {
        for (const n of names) {
          const img = ed.project.images[n]; if (!img) continue;
          const sname = Model.uniqueName(sk.slots, n.split('/').pop());
          sk.slots.push(Model.newSlot(sname, bone, { attachment: n }));
          Model.putAttachment(sk, ed.skinName, sname, Model.newAttachment('region', n, { path: n, width: img.w, height: img.h }));
        }
      });
    },
    pickFiles(accept, multiple = true, dir = false) {
      return new Promise((res) => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
        if (dir) i.webkitdirectory = true;
        i.onchange = () => res(i.files); i.click();
      });
    },

    /* ---------- skins ---------- */
    /* copy every attachment of `from` into `to` (existing names are kept unless overwrite), plus its skin bones/constraints */
    mergeSkin(from, to, overwrite = false) {
      const sk = ed.sk, a = Model.skin(sk, from), b = Model.skin(sk, to); if (!a || !b || a === b) return;
      ed.commit('Merge skin', () => {
        let n = 0;
        for (const slot in a.attachments) for (const name in a.attachments[slot]) {
          const m = (b.attachments[slot] = b.attachments[slot] || {});
          if (m[name] && !overwrite) continue;
          m[name] = Model.clone(a.attachments[slot][name]); n++;
        }
        b.bones = [...new Set(b.bones.concat(a.bones))];
        b.constraints = [...new Set(b.constraints.concat(a.constraints))];
        UI.toast(`Merged ${n} attachment${n === 1 ? '' : 's'} from "${from}" into "${to}"`);
      });
    },

    /* ---------- key constrained values (bake) ---------- */
    /* keys the bones' values AFTER constraints/physics at the current frame (applied local values) */
    keyConstrained(names, label = 'Key constrained values') {
      const an = ed.anim, pose = ed.pose; if (!an || !pose) return UI.toast('Animate mode only');
      names = names && names.length ? names : ed.selBones();
      if (!names.length) return UI.toast('Select the bones to key');
      ed.pushUndo(label);
      Act._keyApplied(an, pose, names, ed.snapTime(ed.time));
      ed.changed('keys');
    },
    _keyApplied(an, pose, names, t) {
      const AF = { rotate: 'arot', x: 'ax', y: 'ay', scaleX: 'asx', scaleY: 'asy', shearX: 'ashx', shearY: 'ashy' };
      for (const n of names) {
        const b = Model.bone(ed.sk, n), pb = pose.boneMap[n]; if (!b || !pb) continue;
        for (const p in AF) {
          const val = pb[AF[p]], setupVal = Model.boneSetupValue(b, p);
          const tl = Model.findTimeline(an, 'bone', n, p);
          if (!tl && Math.abs(val - setupVal) < 1e-4) continue; // unchanged, no timeline: skip
          Model.setKey(Model.ensureTimeline(an, 'bone', n, p), t, M.round(Model.boneKeyFromValue(b, p, val), 4));
        }
      }
    },
    /* simulate the animation frame by frame (with physics) and key the constrained values */
    async bakeDialog() {
      const an = ed.anim; if (!an) return UI.toast('Animate mode only');
      const names = ed.selBones(); if (!names.length) return UI.toast('Select the bones to bake (e.g. physics-driven bones)');
      const fps = ed.fps, dur = Math.round(Model.animDuration(an) * fps);
      const st = { from: 0, to: dur, step: 2, warm: 1 };
      const ok = await UI.modal('Bake constrained motion', h('div.form', null,
        UI.note(`Bakes ${names.length} bone${names.length === 1 ? '' : 's'} (${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}). Physics, IK and other constraints become plain keys, so you can disable the constraints afterwards.`),
        UI.num('From frame', () => st.from, (v) => (st.from = Math.max(0, Math.round(v))), { step: 0.2, prec: 0 }),
        UI.num('To frame', () => st.to, (v) => (st.to = Math.max(0, Math.round(v))), { step: 0.2, prec: 0 }),
        UI.num('Key every', () => st.step, (v) => (st.step = Math.max(1, Math.round(v))), { step: 0.2, prec: 0, suffix: 'frames' }),
        UI.num('Warm-up loops', () => st.warm, (v) => (st.warm = Math.max(0, Math.round(v))), { step: 0.2, prec: 0, suffix: 'for looping physics' })),
        [['Cancel', false], ['Bake', true, true]]);
      if (!ok) return;
      ed.pushUndo('Bake constrained motion');
      const phys = {}, dt = 1 / fps, total = (st.to - st.from + 1);
      const poseAt = (f, step) => ed.computePose(step ? dt : 0, f / fps, true, phys);
      for (let w = 0; w < st.warm; w++) for (let f = st.from; f <= st.to; f++) poseAt(f, true);
      const results = [];
      for (let f = st.from; f <= st.to; f++) { const p = poseAt(f, f > st.from || st.warm > 0); if ((f - st.from) % st.step === 0 || f === st.to) results.push([f, p]); }
      for (const [f, p] of results) Act._keyApplied(an, p, names, f / fps);
      ed.changed('keys');
      UI.toast(`Baked ${results.length} keys × ${names.length} bones over ${total} frames`);
    },

    /* ---------- misc ---------- */
    resetPose() {
      if (ed.mode === 'animate') { ed.clearOverrides(); ed.changed('values'); return; }
    },
    keySelected() {
      if (ed.mode !== 'animate') return;
      if (ed.hasOverrides()) return ed.keyDirty();
      const bones = ed.selBones();
      if (bones.length) ed.keyBones(bones, ['rotate', 'x', 'y', 'scaleX', 'scaleY'], 'Key bones');
    },
  };

  A.Act = Act;
})(window.A);
