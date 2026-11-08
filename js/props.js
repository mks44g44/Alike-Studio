/* Alike Studio — properties panel */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, MO = A.MeshOps, ed = A.ed, UI = A.UI, Act = A.Act, h = UI.h;
  const FIELD = A.Pose.FIELD;

  const P = {
    trace: { count: 12, uniform: 0 }, // trace settings (Uniform adds evenly spaced interior vertices so meshes bend smoothly at joints)
    weldTol: 2,
    init(el) {
      this.el = el;
      this.head = h('div.panel-head', null, h('span.ptitle', null, 'Properties'));
      this.body = h('div.props-body');
      el.appendChild(this.head); el.appendChild(this.body);
      let pending = false;
      const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; this.render(); }); };
      ed.on('selection', later); ed.on('mode', later); ed.on('anim', later); ed.on('tool', later);
      ed.on('change', (w) => { if (w === 'structure' || w === 'mode') later(); });
      this.render();
    },
    render() {
      UI.clearRefreshers(); UI.exprVars = null;
      const b = this.body; const st = b.scrollTop; b.innerHTML = '';
      const p = ed.primary();
      let content;
      try {
        if (!p || p.k === 'skeleton') content = this.skeleton();
        else content = ({ bone: this.bone, slot: this.slot, att: this.attachment, con: this.constraint, skin: this.skin, anim: this.anim, event: this.event, image: this.image, audio: this.audio, dfolder: this.dfolder, tfolder: this.tfolder, skel: this.skel }[p.k] || this.skeleton).call(this, p);
      } catch (e) { console.error(e); content = UI.note('Error: ' + e.message); }
      [].concat(content).forEach((c) => c && b.appendChild(c));
      b.scrollTop = st;
    },
    title(icon, name, sub) {
      return h('div.ptitlebar', null, A.Tree.icon(icon), h('span.pt-name', null, name), sub ? h('span.pt-sub', null, sub) : null,
        h('button.btn.small', { onclick: () => Act.renameRef(Object.assign({}, ed.primary())), title: 'Rename (F2)' }, 'Rename'));
    },
    isAnim() { return ed.mode === 'animate' && !!ed.anim; },

    /* ---------------- skeleton ---------------- */
    skeleton() {
      const sk = ed.sk, pj = ed.project;
      let tris = 0, verts = 0;
      Model.eachAttachment(sk, (a) => { if (a.type === 'mesh') { tris += a.triangles.length / 3; verts += MO.vertexCount(a); } });
      return [
        h('div.ptitlebar', null, A.Tree.icon('skeleton'), h('span.pt-name', null, pj.name || 'Skeleton'), h('button.btn.small', { onclick: () => Act.renameRef({ k: 'skeleton' }) }, 'Rename')),
        UI.section('Skeleton',
          UI.num('FPS', () => sk.fps, (v, u) => { if (u) ed.pushUndo('FPS'); sk.fps = Math.max(1, Math.round(v)); ed.changed('values'); }, { step: 1, prec: 0, min: 1 }),
          UI.num('Wind', () => sk.wind || 0, (v, u) => { if (u) ed.pushUndo('Wind'); sk.wind = v; ed.changed('values'); }, { step: 1, prec: 1, suffix: 'all physics' }),
          UI.num('Gravity', () => sk.gravity || 0, (v, u) => { if (u) ed.pushUndo('Gravity'); sk.gravity = v; ed.changed('values'); }, { step: 1, prec: 1, suffix: 'all physics' }),
          UI.row(UI.button('Problems…', () => A.Problems.show()), UI.button('Reset physics', () => { ed.physStore = {}; })),
          UI.note(`${sk.bones.length} bones · ${sk.slots.length} slots · ${sk.constraints.length} constraints · ${sk.skins.length} skins · ${sk.animations.length} animations`),
          UI.note(`${Object.keys(pj.images).length} images · ${verts} mesh vertices · ${tris} triangles`)),
        (() => {
          const S = A.Skeletons, list = S.entries(), act = ed.project.activeSkeleton;
          return UI.section('Skeletons in this project (' + list.length + ')',
            h('div.bonelist', null, ...list.map((e, i) => h('div.bl-row' + (i === act ? '.on' : ''), { onclick: () => S.switchTo(i), title: i === act ? 'Being edited' : 'Click to edit this skeleton' },
              A.Tree.icon('skeleton'), h('span', null, e.name + (i === act ? '  (editing)' : ''))))),
            UI.row(UI.button('New skeleton', () => S.add()), UI.button('Duplicate', () => S.add(act)), UI.button('Delete', () => S.remove(act), { danger: true, disabled: list.length < 2 })),
            UI.row(UI.button('Import skeletons from project…', () => S.importDialog())),
            UI.note('Images and sounds are shared. Each skeleton has its own bones, skins, animations and undo history, and exports to its own files.'));
        })(),
        UI.section('Quick start',
          UI.note('1. Import images (File → Import). 2. Create bones with the Create tool (C) in Setup mode. 3. Select a bone, then New → Slot / drag images onto bones. 4. Switch to Animate (Tab), move bones and keys are created automatically.'),
          UI.row(UI.button('Import images…', async () => Act.importImageFiles(await Act.pickFiles(A.Formats.IMAGE_ACCEPT), { toSkeleton: false }))),
        ),
      ];
    },

    /* ---------------- bone ---------------- */
    bone(ref) {
      const sk = ed.sk, bd = Model.bone(sk, ref.n); if (!bd) return UI.note('Missing bone');
      UI.exprVars = () => ({ boneLength: bd.length, boneRotation: ed.boneValue(ref.n, 'rotate'), boneX: ed.boneValue(ref.n, 'x'), boneY: ed.boneValue(ref.n, 'y') });
      const names = () => { const s = ed.selBones(); return s.includes(ref.n) ? s : [ref.n]; };
      const get = (p) => () => ed.boneValue(ref.n, p);
      const set = (p) => (v, undo) => { const ch = {}; for (const n of names()) ch[n] = { [p]: v }; ed.setBoneValues(ch, 'Set ' + p, undo); };
      const key = (props) => this.isAnim() ? UI.keyBtn(() => { const st = props.map((p) => ed.keyState('bone', ref.n, p)); return st.includes('dirty') ? 'dirty' : st.includes('key') ? 'key' : st.includes('timeline') ? 'timeline' : 'none'; },
        () => ed.keyBones(names(), props, 'Key ' + props.join('/'))) : null;
      const tf = UI.section('Transform',
        UI.num('Rotate', get('rotate'), set('rotate'), { step: 0.5, key: key(['rotate']), suffix: '°' }),
        UI.num2('Translate', { label: 'X', get: get('x'), set: set('x'), step: 0.5 }, { label: 'Y', get: get('y'), set: set('y'), step: 0.5 }, key(['x', 'y'])),
        UI.num2('Scale', { label: 'X', get: get('scaleX'), set: set('scaleX'), step: 0.01, prec: 3 }, { label: 'Y', get: get('scaleY'), set: set('scaleY'), step: 0.01, prec: 3 }, key(['scaleX', 'scaleY'])),
        UI.num2('Shear', { label: 'X', get: get('shearX'), set: set('shearX'), step: 0.5 }, { label: 'Y', get: get('shearY'), set: set('shearY'), step: 0.5 }, key(['shearX', 'shearY'])),
      );
      const setupOnly = (fn) => (v, undo) => { if (ed.mode !== 'setup') return UI.toast('Bone setup properties are edited in Setup mode'); if (undo !== false) ed.pushUndo('Bone'); fn(v); ed.changed('values'); };
      const props = UI.section('Bone',
        UI.num('Length', () => bd.length, setupOnly((v) => { for (const n of names()) Model.bone(sk, n).length = Math.max(0, v); }), { step: 0.5, min: 0 }),
        UI.select('Parent', () => [[null, '(none)']].concat(sk.bones.filter((b) => !Model.isAncestor(sk, ref.n, b.name)).map((b) => b.name)), () => bd.parent, (v) => { if (v && ed.mode === 'setup') Act.reparentBone(ref.n, v, true); }),
        UI.check('Inherit rotation', () => bd.inheritRotation, setupOnly((v) => (bd.inheritRotation = v))),
        UI.check('Inherit scale', () => bd.inheritScale, setupOnly((v) => (bd.inheritScale = v))),
        UI.check('Inherit reflection', () => bd.inheritReflection, setupOnly((v) => (bd.inheritReflection = v))),
        UI.check('Skin required', () => bd.skinRequired, setupOnly((v) => (bd.skinRequired = v))),
        UI.color('Color', () => M.hexToRgba(bd.color), (c, u) => { if (u) ed.pushUndo('Bone color'); for (const n of names()) Model.bone(sk, n).color = M.rgbaToHex(c); ed.changed('values'); }, { noAlpha: true }),
        UI.select('Icon', () => [['bone', 'Circle'], ['square', 'Square'], ['diamond', 'Diamond'], ['star', 'Star'], ['cross', 'Cross'], ['eye', 'Eye']], () => bd.icon || 'bone',
          (v) => { ed.pushUndo('Bone icon'); for (const n of names()) Model.bone(sk, n).icon = v; ed.changed('values'); }),
      );
      const btns = UI.section('Actions',
        UI.row(UI.button('New child', () => Act.newBone()), UI.button('New slot', () => Act.newSlot(ref.n)), UI.button('Physics', () => Act.newConstraint('physics'), { title: 'Add physics to selected bones' })),
        UI.row(UI.button('IK', () => Act.newConstraint('ik'), { title: 'Select 1–2 bones (+ target last)' }), UI.button('Transform', () => Act.newConstraint('transform')), UI.button('Path', () => Act.newConstraint('path'))),
        this.isAnim() ? UI.row(UI.button('Key all', () => ed.keyBones(names(), ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearX', 'shearY'])), UI.button('Reset pose', () => Act.resetPose())) : null,
        UI.row(UI.button('Select children', () => ed.selectMany(Model.descendants(sk, ref.n).map((n) => ({ k: 'bone', n })))), UI.button('Delete', () => Act.deleteSelection(), { danger: true })),
      );
      return [this.title('bone', ref.n, names().length > 1 ? names().length + ' selected' : null), tf, props, btns];
    },

    /* ---------------- slot ---------------- */
    slot(ref) {
      const sk = ed.sk, sd = Model.slot(sk, ref.n); if (!sd) return UI.note('Missing slot');
      const ps = () => (ed.pose && ed.pose.slotMap[ref.n]) || sd;
      const key = (prop) => this.isAnim() ? UI.keyBtn(() => ed.keyState('slot', ref.n, prop), () => ed.keySlot(ref.n, prop)) : null;
      const atts = () => [[null, '(none)']].concat(Model.slotAttachmentNames(sk, ref.n));
      return [
        this.title('slot', ref.n),
        UI.section('Slot',
          UI.select('Attachment', atts, () => ps().attachment, (v) => ed.setSlotValue(ref.n, 'attachment', v, 'Set attachment'), key('attachment')),
          UI.color('Color', () => ps().color, (c, u) => ed.setSlotValue(ref.n, 'color', c, 'Slot color'), { key: key('color') }),
          UI.check('Tint black', () => !!(ps().dark), (v) => { if (ed.mode === 'setup') { ed.pushUndo('Tint black'); sd.dark = v ? [0, 0, 0] : null; ed.changed('values'); } else ed.setSlotValue(ref.n, 'dark', v ? [0, 0, 0] : null); }),
          ps().dark ? UI.color('Dark color', () => (ps().dark || [0, 0, 0]).concat(1), (c) => ed.setSlotValue(ref.n, 'dark', c.slice(0, 3), 'Dark color'), { noAlpha: true, key: key('dark') }) : null,
          UI.select('Blend', ['normal', 'additive', 'multiply', 'screen'], () => sd.blend, (v) => { ed.pushUndo('Blend'); sd.blend = v; ed.changed('values'); }),
          UI.select('Bone', () => sk.bones.map((b) => b.name), () => sd.bone, (v) => Act.setSlotBone(ref.n, v)),
        ),
        UI.section('Draw order',
          UI.row(UI.button('Front', () => Act.moveDrawOrder(ref.n, 'top')), UI.button('Forward', () => Act.moveDrawOrder(ref.n, 1)), UI.button('Back', () => Act.moveDrawOrder(ref.n, -1)), UI.button('Bottom', () => Act.moveDrawOrder(ref.n, 'bottom'))),
          this.isAnim() ? UI.row(UI.button('Key draw order', () => ed.keyDrawOrder(), { title: 'Keys the current draw order at this frame' }),
            sd.folder ? UI.button('Key folder "' + sd.folder + '"', () => ed.keyDrawFolder(sd.folder), { title: 'Keys only the order of this folder\'s slots' }) : null) : null,
          ed.mode === 'setup' ? UI.select('Folder', () => [['', '(none)']].concat((sk.drawFolders || []).map((f) => [f.name, f.name])).concat([['\u0000new', 'New folder…']]), () => sd.folder || '',
            (v) => { const names = ed.selected('slot').map((r) => r.n); if (!names.includes(ref.n)) names.push(ref.n); if (v === '\u0000new') A.Folders.newDrawFolder(names); else A.Folders.setSlotFolder(names, v || null); }) : null,
        ),
        UI.section('New attachment',
          UI.row(UI.button('Region…', (e) => this.imageMenu(e, ref.n)), UI.button('Bounding box', () => Act.newAttachment('bbox', ref.n)), UI.button('Clipping', () => Act.newAttachment('clip', ref.n))),
          UI.row(UI.button('Path', () => Act.newAttachment('path', ref.n)), UI.button('Point', () => Act.newAttachment('point', ref.n)), UI.button('Delete slot', () => Act.deleteSelection(), { danger: true })),
        ),
      ];
    },
    imageMenu(e, slot) {
      const imgs = Object.keys(ed.project.images);
      if (!imgs.length) return UI.toast('Import images first (File → Import images)');
      UI.menu(e.clientX, e.clientY, imgs.map((n) => ({ label: n, action: () => Act.newAttachment('region', slot, n) })));
    },

    /* ---------------- attachment ---------------- */
    attachment(ref) {
      const s = ed.selAttachment(); if (!s) return UI.note('Missing attachment');
      const att = s.att, sk = ed.sk;
      const setupEdit = (label, fn) => (v, undo) => { if (ed.mode !== 'setup') return UI.toast('Attachment geometry is edited in Setup mode'); if (undo !== false) ed.pushUndo(label); fn(v); ed.changed('values'); };
      const many = ed.selected('att').length > 1 ? this.bulkSection() : null;
      const out = [many, this.title(att.type === 'region' ? 'region' : att.type, att.name, att.type + (s.skin !== 'default' ? ' · ' + s.skin : '') + ' · ' + s.slot)];
      const imgs = () => Object.keys(ed.project.images);
      if (att.type === 'region' || att.type === 'mesh' || att.type === 'linkedmesh') {
        out.push(UI.section('Image',
          UI.select('Path', () => [[att.path, att.path]].concat(imgs().filter((n) => n !== att.path)), () => att.path, (v) => { ed.pushUndo('Image'); att.path = v; const im = ed.project.images[v]; if (im && att.type === 'region') { att.width = im.w; att.height = im.h; } ed.changed('values'); }),
          UI.color('Tint', () => att.color, setupEdit('Tint', (c) => (att.color = c))),
          ed.images[att.path] || (att.sequence) ? null : UI.note('⚠ Image "' + att.path + '" not found. Import it or pick another.'),
        ));
      }
      if (att.type === 'region') {
        out.push(UI.section('Region',
          UI.num2('Position', { label: 'X', get: () => att.x, set: setupEdit('Move', (v) => (att.x = v)), step: 0.5 }, { label: 'Y', get: () => att.y, set: setupEdit('Move', (v) => (att.y = v)), step: 0.5 }),
          UI.num('Rotate', () => att.rotation, setupEdit('Rotate', (v) => (att.rotation = v)), { step: 0.5, suffix: '°' }),
          UI.num2('Scale', { label: 'X', get: () => att.scaleX, set: setupEdit('Scale', (v) => (att.scaleX = v)), step: 0.01, prec: 3 }, { label: 'Y', get: () => att.scaleY, set: setupEdit('Scale', (v) => (att.scaleY = v)), step: 0.01, prec: 3 }),
          UI.num2('Size', { label: 'W', get: () => att.width, set: setupEdit('Size', (v) => (att.width = v)), step: 1 }, { label: 'H', get: () => att.height, set: setupEdit('Size', (v) => (att.height = v)), step: 1 }),
          UI.row(UI.button('Convert to mesh', () => Act.convertToMesh(), { primary: true }), UI.button('Reset size', setupEdit('Reset size', () => { const im = ed.project.images[att.path]; if (im) { att.width = im.w; att.height = im.h; } }))),
        ));
      }
      if (att.type === 'region' || att.type === 'mesh') out.push(this.sequenceSection(att, s));
      if (att.type === 'mesh') out.push(...this.meshSections(att, s));
      if (att.type === 'linkedmesh') {
        out.push(UI.section('Linked mesh',
          UI.select('Parent slot', () => [[null, '(this slot)']].concat(sk.slots.map((x) => x.name)), () => att.parentSlot, (v) => { ed.pushUndo('Parent slot'); att.parentSlot = v; ed.changed('structure'); }),
          UI.select('Parent mesh', () => Model.slotAttachmentNames(sk, att.parentSlot || s.slot).filter((n) => { const a = Model.getAttachment(sk, s.skin, att.parentSlot || s.slot, n); return a && a.type === 'mesh'; }), () => att.parent, (v) => { ed.pushUndo('Parent mesh'); att.parent = v; ed.changed('values'); }),
          UI.check('Inherit deform', () => att.inheritDeform, (v) => { ed.pushUndo('Inherit deform'); att.inheritDeform = v; ed.changed('values'); })));
      }
      if (att.type === 'bbox' || att.type === 'clip') {
        out.push(UI.section(att.type === 'bbox' ? 'Bounding box' : 'Clipping',
          UI.note(`${MO.vertexCount(att)} vertices${att.weights ? ' · weighted to ' + MO.boundBones(att).length + ' bones' : ''}. Use the Edit Mesh tool (M): click to add, drag to move, Delete to remove.`),
          att.type === 'clip' ? UI.check('Inverse (hide inside the shape)', () => att.inverse, (v) => { ed.pushUndo('Inverse clip'); att.inverse = v; ed.changed('values'); }) : null,
          att.type === 'clip' ? UI.select('End slot', () => [[null, '(end of draw order)']].concat(sk.slots.map((x) => x.name)), () => att.end, (v) => { ed.pushUndo('Clip end'); att.end = v; ed.changed('values'); }) : null,
          UI.color('Color', () => att.color, setupEdit('Color', (c) => (att.color = c))),
          UI.row(UI.button('Edit vertices (M)', () => { ed.tool = 'mesh'; ed.emit('tool'); }, { primary: true }),
            UI.button('Reset', () => { if (ed.mode !== 'setup') return; ed.pushUndo('Reset shape'); att.verts = [-50, -50, 50, -50, 50, 50, -50, 50]; att.weights = null; MO.invalidateDeforms(ed.sk, s.slot, att.name); ed.changed('structure'); }, { title: 'Back to a 100×100 square, unweighted' })),
          this.deformSection(att, s)));
        out.push(this.weightsSection(att, s, (label, fn) => () => {
          if (ed.mode !== 'setup') return UI.toast('Weight edits happen in Setup mode');
          ed.pushUndo(label); const r = fn(Act.setupPose()); if (r !== 'keep') MO.invalidateDeforms(ed.sk, s.slot, att.name); ed.changed('structure');
        }));
      }
      if (att.type === 'path') {
        out.push(UI.section('Path',
          UI.note(`${att.points.length} points. Edit Mesh tool (M): click to append points, drag points/handles (Alt = break handle symmetry).`),
          UI.check('Closed', () => att.closed, setupEdit('Closed', (v) => (att.closed = v))),
          UI.check('Constant speed', () => att.constantSpeed, setupEdit('Constant speed', (v) => (att.constantSpeed = v))),
          UI.color('Color', () => att.color, setupEdit('Color', (c) => (att.color = c))),
          UI.row(UI.button('Edit path (M)', () => { ed.tool = 'mesh'; ed.emit('tool'); }, { primary: true }),
            UI.button('Reset', () => { if (ed.mode !== 'setup') return; ed.pushUndo('Reset path'); att.points = [{ x: -100, y: 0, ix: -140, iy: -40, ox: -60, oy: 40 }, { x: 100, y: 0, ix: 60, iy: 40, ox: 140, oy: -40 }]; ed.changed('structure'); }))));
      }
      if (att.type === 'point') {
        out.push(UI.section('Point',
          UI.num2('Position', { label: 'X', get: () => att.x, set: setupEdit('Move', (v) => (att.x = v)) }, { label: 'Y', get: () => att.y, set: setupEdit('Move', (v) => (att.y = v)) }),
          UI.num('Rotate', () => att.rotation, setupEdit('Rotate', (v) => (att.rotation = v)), { step: 0.5 })));
      }
      out.push(UI.section('Actions', UI.row(UI.button('Show', () => ed.setSlotValue(s.slot, 'attachment', att.name, 'Show attachment')), UI.button('Duplicate', () => Act.duplicateSelection()), UI.button('Delete', () => Act.deleteSelection(), { danger: true }))));
      return out;
    },
    bulkSection() {
      const list = ed.selected('att').map((r) => { const sk2 = Model.skin(ed.sk, r.skin); const a = sk2 && sk2.attachments[r.slot] && sk2.attachments[r.slot][r.n]; return a ? { att: a, slot: r.slot } : null; }).filter((x) => x && ['mesh', 'bbox', 'clip'].includes(x.att.type));
      if (list.length < 2) return null;
      const run = (label, fn) => () => {
        if (ed.mode !== 'setup') return UI.toast('Mesh and weight edits happen in Setup mode');
        ed.pushUndo(label);
        for (const it of list) { fn(Act.setupPose(), it); MO.invalidateDeforms(ed.sk, it.slot, it.att.name); }
        ed.changed('structure'); UI.toast(label + ': ' + list.length + ' attachments');
      };
      return UI.section('All ' + list.length + ' selected attachments',
        UI.note('Bulk operations apply to every selected mesh / box / clipping attachment. Weight painting also affects all of them.'),
        UI.row(UI.button('Bind bones…', async () => { const b = await this.pickBones(ed.selBones()); if (b && b.length) run('Bind', (pose, it) => MO.bind(pose, it.slot, it.att, b))(); }, { primary: true }),
          UI.button('Auto weights', run('Auto weights', (pose, it) => it.att.weights && MO.auto(pose, it.slot, it.att)))),
        UI.row(UI.button('Smooth', run('Smooth', (pose, it) => it.att.weights && MO.smooth(pose, it.slot, it.att, 0.5))), UI.button('Prune', run('Prune', (pose, it) => it.att.weights && MO.prune(pose, it.slot, it.att))),
          UI.button('Trace', run('Trace', (pose, it) => { const img = ed.images[it.att.path]; if (it.att.type === 'mesh' && img) { if (it.att.weights) MO.unbind(pose, it.slot, it.att); MO.trace(pose, it.slot, it.att, img, P.trace.count, P.trace.uniform); } }))),
        UI.num('Weld distance', () => P.weldTol, (v) => (P.weldTol = Math.max(0.01, v)), { step: 0.1, prec: 2, suffix: 'px' }),
        UI.row(UI.button('Weld', () => {
          if (ed.mode !== 'setup') return UI.toast('Mesh and weight edits happen in Setup mode');
          ed.pushUndo('Weld'); const n = MO.weld(Act.setupPose(), list, P.weldTol);
          list.forEach((it) => MO.invalidateDeforms(ed.sk, it.slot, it.att.name)); ed.changed('structure');
          UI.toast(n ? `Welded ${n} vertices` : 'No vertices of different meshes are that close');
        }, { title: 'Vertices of different meshes within the weld distance get one position and the same weights, so seams never open' })));
    },
    sequenceSection(att, s) {
      const on = !!att.sequence;
      const sq = att.sequence;
      const ed2 = (fn) => (v, u) => { if (u !== false) ed.pushUndo('Sequence'); fn(v); ed.changed('values'); };
      return UI.section('Image sequence',
        UI.check('Use sequence', () => !!att.sequence, (v) => { ed.pushUndo('Sequence'); att.sequence = v ? { count: 4, start: 1, digits: 2, setup: 0 } : null; ed.changed('structure'); }),
        on ? UI.note('Frames are images named ' + att.path + String(sq.start).padStart(sq.digits, '0') + ', ' + att.path + String(sq.start + 1).padStart(sq.digits, '0') + ' …') : null,
        on ? UI.num('Count', () => sq.count, ed2((v) => (sq.count = Math.max(1, Math.round(v)))), { step: 0.2, prec: 0, min: 1 }) : null,
        on ? UI.num('Start', () => sq.start, ed2((v) => (sq.start = Math.max(0, Math.round(v)))), { step: 0.2, prec: 0 }) : null,
        on ? UI.num('Digits', () => sq.digits, ed2((v) => (sq.digits = Math.max(0, Math.round(v)))), { step: 0.2, prec: 0 }) : null,
        on ? UI.num('Setup frame', () => sq.setup || 0, ed2((v) => (sq.setup = Math.max(0, Math.round(v)))), { step: 0.2, prec: 0 }) : null,
        on && this.isAnim() ? UI.row(...['loop', 'once', 'pingpong', 'hold'].map((mode) => UI.button('Key ' + mode, () => {
          ed.pushUndo('Key sequence');
          Model.setKey(Model.ensureTimeline(ed.anim, 'sequence', s.slot, null, att.name), ed.snapTime(ed.time), { mode, index: 0, delay: 1 / 12 }, 's');
          ed.changed('keys');
        }))) : null);
    },
    deformSection(att, s) {
      if (!this.isAnim()) return null;
      return UI.row(
        UI.button('Key deform', () => {
          const ps = ed.pose.slotMap[s.slot]; const cur = ps && ps.deform[att.name];
          const len = att.weights ? att.weights.reduce((a, v) => a + v.length, 0) * 2 : (att.verts || []).length;
          ed.pushUndo('Key deform');
          Model.setKey(Model.ensureTimeline(ed.anim, 'deform', s.slot, null, att.name), ed.snapTime(ed.time), Array.from(cur || new Array(len).fill(0)));
          ed.changed('keys');
        }),
        UI.keyBtn(() => ed.keyState('deform', s.slot, null, att.name), () => {}),
      );
    },
    meshSections(att, s) {
      const bound = MO.boundBones(att);
      const run = (label, fn) => () => {
        if (ed.mode !== 'setup' && label !== 'Paint') return UI.toast('Mesh and weight edits happen in Setup mode');
        ed.pushUndo(label);
        const pose = Act.setupPose();
        const r = fn(pose);
        if (r !== 'keep') MO.invalidateDeforms(ed.sk, s.slot, att.name);
        ed.changed('structure');
      };
      if (!ed.weightBone || !bound.includes(ed.weightBone)) ed.weightBone = bound[0] || null;
      const spacing = { v: 40 };
      const meshSec = UI.section('Mesh',
        UI.note(`${MO.vertexCount(att)} vertices (${att.hull} hull) · ${att.triangles.length / 3} triangles${att.weights ? ' · weighted' : ''}`),
        UI.row(UI.button(ed.tool === 'mesh' ? 'Editing (M)' : 'Edit mesh (M)', () => { ed.tool = 'mesh'; ed.emit('tool'); }, { primary: ed.tool !== 'mesh' }), UI.button('Linked mesh', () => Act.linkedMesh())),
        UI.note('Edit tool: click inside to add a vertex, outside (or Shift) to extend the hull. Drag moves vertices over the image; Alt+drag reshapes. Delete removes.'),
        UI.num('Trace verts', () => P.trace.count, (v) => (P.trace.count = Math.max(3, Math.round(v))), { step: 0.2, prec: 0 }),
        UI.num('Uniform', () => P.trace.uniform, (v) => (P.trace.uniform = M.clamp(v, 0, 1)), { step: 0.01, prec: 2, min: 0, max: 1, suffix: '0 = outline only' }),
        UI.row(UI.button('Trace outline', run('Trace', (pose) => { const img = ed.images[att.path]; if (!img) return UI.toast('Image missing'); if (att.weights) MO.unbind(pose, s.slot, att); MO.trace(pose, s.slot, att, img, P.trace.count, P.trace.uniform); })),
          UI.button('Reset', run('Reset mesh', () => { const m = MO.regionToMesh(Object.assign(Model.newAttachment('region', att.name), { path: att.path, width: att.width, height: att.height })); m.uvMap = att.uvMap || m.uvMap; m.verts = []; for (let i = 0; i < 4; i++) { const p = M.apply(m.uvMap, m.uvs[i * 2], m.uvs[i * 2 + 1]); m.verts.push(p[0], p[1]); } Object.assign(att, { uvs: m.uvs, verts: m.verts, triangles: m.triangles, hull: 4, weights: null }); }))),
        UI.num('Grid spacing', () => spacing.v, (v) => (spacing.v = Math.max(5, v)), { step: 1, prec: 0 }),
        UI.row(UI.button('Generate interior', run('Generate', (pose) => MO.generate(pose, s.slot, att, spacing.v))), UI.button('Delete selected', () => A.VP.deleteSelectedVerts())),
      );
      const wSec = this.weightsSection(att, s, run);
      const out = [meshSec, wSec];
      const d = this.deformSection(att, s); if (d) out.push(UI.section('Deform', UI.note('In Animate mode, drag vertices with the Edit Mesh tool to deform; keys are made with Auto Key.'), d));
      return out;
    },

    weightsSection(att, s, run) {
      const bound = MO.boundBones(att);
      if (!ed.weightBone || !bound.includes(ed.weightBone)) ed.weightBone = bound[0] || null;
      const wBody = [];
      if (!att.weights) {
        wBody.push(UI.note('Not weighted. Select bones in the viewport/tree (Ctrl+click), then bind them to this mesh.'));
      } else {
        const list = h('div.bonelist');
        for (const b of bound) {
          const row = h('div.bl-row' + (ed.weightBone === b ? '.on' : ''), { onclick: () => { ed.weightBone = b; this.render(); } }, A.Tree.icon('bone'), h('span', null, b));
          list.appendChild(row);
        }
        wBody.push(h('div.flabel', null, 'Bound bones (click to paint):'), list);
      }
      const selB = () => ed.selBones().filter((b) => b);
      wBody.push(
        UI.row(UI.button(att.weights ? 'Bind bones…' : 'Bind bones…', async () => { const b = await this.pickBones(selB()); if (!b || !b.length) return; run('Bind', (pose) => MO.bind(pose, s.slot, att, b))(); }, { primary: !att.weights }),
          att.weights ? UI.button('Add bones…', async () => { const b = await this.pickBones(selB().filter((x) => !bound.includes(x))); if (!b || !b.length) return; run('Add bones', (pose) => MO.addBones(pose, s.slot, att, b))(); }) : null),
        att.weights ? UI.row(UI.button('Auto', run('Auto weights', (pose) => MO.auto(pose, s.slot, att))), UI.button('Smooth', run('Smooth', (pose) => { MO.smooth(pose, s.slot, att, 0.5); return 'keep'; })), UI.button('Prune', run('Prune', (pose) => MO.prune(pose, s.slot, att))), UI.button('Unbind', run('Unbind', (pose) => MO.unbind(pose, s.slot, att)), { danger: true })) : null,
        UI.row(UI.button('Weld to touching meshes', run('Weld', (pose) => {
          const items = [{ slot: s.slot, att }].concat(MO.touchingMeshes(pose, ed.sk, ed.skinName, s.slot, att, P.weldTol));
          if (items.length < 2) { UI.toast('No other mesh, box or clipping touches this one'); return 'keep'; }
          const n = MO.weld(pose, items, P.weldTol); items.forEach((it) => MO.invalidateDeforms(ed.sk, it.slot, it.att.name));
          UI.toast(`Welded ${n} vertices across ${items.length} attachments`);
        }), { title: 'Matches positions and weights with every mesh whose vertices are within ' + P.weldTol + 'px (set the distance with several meshes selected)' })),
        att.weights ? UI.row(UI.button(ed.tool === 'weights' ? 'Painting (W)' : 'Paint weights (W)', () => { ed.tool = 'weights'; ed.emit('tool'); }, { primary: ed.tool !== 'weights' })) : null,
        att.weights ? UI.num('Brush size', () => ed.brush.size, (v) => (ed.brush.size = M.clamp(v, 4, 300)), { step: 1, prec: 0, suffix: 'px' }) : null,
        att.weights ? UI.num('Strength', () => ed.brush.strength, (v) => (ed.brush.strength = M.clamp(v, 0.01, 1)), { step: 0.01, prec: 2 }) : null,
        att.weights ? UI.select('Brush', [['add', 'Add'], ['remove', 'Remove (or Alt)']], () => ed.brush.mode, (v) => (ed.brush.mode = v)) : null,
      );
      return UI.section('Weights', ...wBody);
    },

    pickBones(pre) {
      const pres = new Set(pre || []);
      const boxes = ed.sk.bones.map((b) => { const cb = h('input', { type: 'checkbox' }); cb.checked = pres.has(b.name); cb._n = b.name; return cb; });
      const list = h('div.pickbones', null, ...boxes.map((cb) => h('label.check', null, cb, h('span', null, cb._n))));
      return UI.modal('Bones to bind', h('div', null, UI.note('Weights are computed automatically from distance to each bone; refine with the paint brush.'), list),
        [['Cancel', null], ['Bind', () => boxes.filter((c) => c.checked).map((c) => c._n), true]]);
    },

    /* ---------------- constraints ---------------- */
    constraint(ref) {
      const sk = ed.sk, c = Model.constraint(sk, ref.n); if (!c) return UI.note('Missing constraint');
      const pc = () => (ed.pose && ed.pose.conMap[ref.n]) || c;
      const setup = (label, fn) => (v, u) => { if (u !== false) ed.pushUndo(label); fn(v); ed.physStore = {}; ed.changed('values'); };
      const mixNum = (label, prop, o = {}) => UI.num(label, () => pc()[prop], (v, u) => (ed.mode === 'setup' ? setup(label, (x) => (c[prop] = x))(v, u) : ed.setConValue(ref.n, prop, v, label)),
        Object.assign({ step: 0.01, prec: 3, key: this.isAnim() ? UI.keyBtn(() => ed.keyState('constraint', ref.n, prop), () => ed.keyCon(ref.n, prop)) : null }, o));
      const boneSel = (label, prop) => UI.select(label, () => [[null, '(none)']].concat(sk.bones.map((b) => b.name)), () => c[prop], setup(label, (v) => (c[prop] = v)));
      const bonesField = h('div.field', null, h('span.flabel', null, 'Bones'), h('span.val', null, (c.bones || []).join(', ') || '—'),
        h('button.btn.small', { onclick: () => { const b = ed.selBones(); if (!b.length) return UI.toast('Select bones in the viewport first'); setup('Set bones', () => (c.bones = c.type === 'ik' ? b.slice(0, 2) : b))(); this.render(); } }, 'Use selected'));
      const common = [
        UI.check('Enabled', () => c.enabled !== false, setup('Enable', (v) => (c.enabled = v))),
        UI.check('Skin required', () => c.skinRequired, setup('Skin required', (v) => (c.skinRequired = v))),
        UI.row(UI.button('▲ Earlier', () => Act.moveConstraint(ref.n, -1), { title: 'Constraints update in list order' }), UI.button('▼ Later', () => Act.moveConstraint(ref.n, 1)), UI.button('Delete', () => Act.deleteSelection(), { danger: true })),
      ];
      const out = [this.title(c.type === 'path' ? 'pathc' : c.type, c.name, c.type + ' constraint')];
      switch (c.type) {
        case 'ik':
          out.push(UI.section('IK', bonesField, boneSel('Target', 'target'),
            mixNum('Mix', 'mix', { min: 0, max: 1 }), mixNum('Softness', 'softness', { step: 0.5, prec: 2, min: 0 }),
            UI.check('Bend positive', () => pc().bendPositive, (v) => (ed.mode === 'setup' ? setup('Bend', (x) => (c.bendPositive = x))(v) : ed.setConValue(ref.n, 'bendPositive', v)), this.isAnim() ? UI.keyBtn(() => ed.keyState('constraint', ref.n, 'bendPositive'), () => ed.keyCon(ref.n, 'bendPositive')) : null),
            UI.check('Compress', () => c.compress, setup('Compress', (v) => (c.compress = v))),
            UI.check('Stretch', () => c.stretch, setup('Stretch', (v) => (c.stretch = v))),
            UI.check('Uniform', () => c.uniform, setup('Uniform', (v) => (c.uniform = v))),
            UI.check('Volume (preserve area when stretching)', () => c.volume, setup('Volume', (v) => (c.volume = v)))));
          break;
        case 'transform':
          out.push(this.mappingSection(c, setup));
          out.push(UI.section('Transform', bonesField, boneSel('Target', 'target'),
            UI.check('Local space', () => c.local, setup('Local', (v) => (c.local = v))), UI.check('Relative', () => c.relative, setup('Relative', (v) => (c.relative = v)))),
            UI.section('Mix', mixNum('Rotate', 'mixRotate'), mixNum('X', 'mixX'), mixNum('Y', 'mixY'), mixNum('Scale X', 'mixScaleX'), mixNum('Scale Y', 'mixScaleY'), mixNum('Shear Y', 'mixShearY')),
            UI.section('Offset', ...[['Rotate', 'offRotate', 0.5], ['X', 'offX', 0.5], ['Y', 'offY', 0.5], ['Scale X', 'offScaleX', 0.01], ['Scale Y', 'offScaleY', 0.01], ['Shear Y', 'offShearY', 0.5]].map(([l, p, st]) => UI.num(l, () => c[p], setup('Offset', (v) => (c[p] = v)), { step: st }))));
          break;
        case 'path':
          out.push(UI.section('Path', bonesField,
            UI.select('Target slot', () => sk.slots.map((x) => x.name), () => c.target, setup('Target', (v) => (c.target = v))),
            UI.select('Position', [['fixed', 'Fixed'], ['percent', 'Percent']], () => c.positionMode, setup('Mode', (v) => (c.positionMode = v))),
            UI.select('Spacing', [['length', 'Length'], ['fixed', 'Fixed'], ['percent', 'Percent'], ['proportional', 'Proportional']], () => c.spacingMode, setup('Mode', (v) => (c.spacingMode = v))),
            UI.select('Rotate', [['tangent', 'Tangent'], ['chain', 'Chain'], ['chainScale', 'Chain scale']], () => c.rotateMode, setup('Mode', (v) => (c.rotateMode = v))),
            UI.num('Offset rot.', () => c.offRotate, setup('Offset', (v) => (c.offRotate = v)), { step: 0.5 }),
            mixNum('Position', 'position', { step: c.positionMode === 'percent' ? 0.002 : 0.5 }), mixNum('Spacing', 'spacing', { step: c.spacingMode === 'percent' || c.spacingMode === 'proportional' ? 0.002 : 0.5 })),
            UI.section('Mix', mixNum('Rotate', 'mixRotate'), mixNum('X', 'mixX'), mixNum('Y', 'mixY')));
          break;
        case 'physics':
          out.push(UI.section('Physics', boneSel('Bone', 'bone'),
            h('div.checkrow', null, ...['x', 'y', 'rotate', 'scaleX', 'shearX'].map((p) => UI.check(p, () => c[p], setup('Physics', (v) => (c[p] = v))))),
            UI.check('Volume (scaleY compensates scaleX)', () => c.volume, setup('Volume', (v) => (c.volume = v))),
            UI.note('Global wind and gravity are on the skeleton (select the skeleton row).')),
            UI.section('Simulation', mixNum('Inertia', 'inertia', { min: 0, max: 1 }), mixNum('Strength', 'strength', { step: 1, prec: 1, min: 0 }), mixNum('Damping', 'damping', { min: 0, max: 5 }),
              mixNum('Mass', 'mass', { min: 0.01 }), mixNum('Wind', 'wind', { step: 2, prec: 1 }), mixNum('Gravity', 'gravity', { step: 2, prec: 1 }), mixNum('Mix', 'mix', { min: 0, max: 1 }),
              UI.num('Steps / sec', () => c.step, setup('Step', (v) => (c.step = Math.max(10, Math.round(v)))), { step: 1, prec: 0 }),
              UI.num('Limit', () => c.limit, setup('Limit', (v) => (c.limit = Math.max(1, v))), { step: 10, prec: 0 }),
              UI.row(UI.button('Reset simulation', () => { ed.physStore = {}; }))));
          break;
        case 'slider':
          out.push(UI.section('Slider',
            UI.select('Animation', () => [[null, '(none)']].concat(sk.animations.map((a) => a.name)), () => c.animation, setup('Animation', (v) => (c.animation = v))),
            boneSel('Driver bone', 'bone'),
            UI.select('Property', ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'shearX', 'shearY'], () => c.property, setup('Property', (v) => (c.property = v))),
            UI.num('Scale', () => c.scale, setup('Scale', (v) => (c.scale = v)), { step: 0.001, prec: 4 }),
            UI.num('Offset', () => c.offset, setup('Offset', (v) => (c.offset = v)), { step: 0.01, prec: 3 }),
            mixNum('Time', 'time', { step: 0.01, prec: 3 }), mixNum('Mix', 'mix', { min: 0, max: 1 }),
            UI.check('Loop', () => c.loop, setup('Loop', (v) => (c.loop = v))), UI.check('Additive', () => c.additive, setup('Additive', (v) => (c.additive = v))),
            UI.note('Without a driver bone, "Time" picks the pose from the animation. With a driver, time = bone property × scale + offset.')));
          break;
      }
      out.push(UI.section('Options', ...common));
      return out;
    },

    mappingSection(c, setup) {
      const props = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];
      c.mappings = c.mappings || [];
      const rows = c.mappings.map((m, i) => h('div.evkey', null,
        h('div.evkey-head', null, h('b', null, 'Mapping ' + (i + 1)), h('button.btn.small.danger', { onclick: () => { ed.pushUndo('Remove mapping'); c.mappings.splice(i, 1); ed.changed('structure'); } }, 'Remove')),
        UI.select('From', props, () => m.from, setup('Mapping', (v) => (m.from = v))),
        UI.select('To', props, () => m.to, setup('Mapping', (v) => (m.to = v))),
        UI.num('From offset', () => m.fromOffset || 0, setup('Mapping', (v) => (m.fromOffset = v)), { step: 0.5 }),
        UI.num('Scale', () => (m.scale == null ? 1 : m.scale), setup('Mapping', (v) => (m.scale = v)), { step: 0.01, prec: 3 }),
        UI.num('To offset', () => m.toOffset || 0, setup('Mapping', (v) => (m.toOffset = v)), { step: 0.5 }),
        UI.check('Clamp', () => m.clamp, setup('Mapping', (v) => (m.clamp = v))),
        m.clamp ? UI.num2('Range', { label: 'Min', get: () => (m.min == null ? 0 : m.min), set: setup('Mapping', (v) => (m.min = v)) }, { label: 'Max', get: () => (m.max == null ? 0 : m.max), set: setup('Mapping', (v) => (m.max = v)) }) : null));
      return UI.section('Property mappings',
        UI.note(c.mappings.length ? 'Mapping mode: each mapping drives a constrained-bone property from a target property (value = (source − from offset) × scale + to offset). The Mix values below still apply per destination property.' : 'Optional: map any target property to any bone property (e.g. rotation drives X). Without mappings the classic mode below is used.'),
        UI.select('Source space', [['local', 'Local (target bone’s own values)'], ['world', 'World']], () => c.sourceSpace || 'local', setup('Space', (v) => (c.sourceSpace = v))),
        ...rows,
        UI.row(UI.button('+ Add mapping', () => { ed.pushUndo('Add mapping'); c.mappings.push({ from: 'rotate', to: 'rotate', fromOffset: 0, scale: 1, toOffset: 0, clamp: false, min: -45, max: 45 }); ed.changed('structure'); })));
    },

    /* ---------------- skin / anim / event / image ---------------- */
    skin(ref) {
      const sk = ed.sk, s = Model.skin(sk, ref.n); if (!s) return UI.note('Missing skin');
      let count = 0; for (const sl in s.attachments) count += Object.keys(s.attachments[sl]).length;
      const setList = (prop, list) => { ed.pushUndo('Skin ' + prop); s[prop] = list; ed.changed('structure'); };
      return [this.title('skin', s.name),
        UI.section('Skin',
          UI.note(`${count} attachments${s.name === 'default' ? ' (default skin: used when the active skin has no attachment)' : ''}`),
          UI.row(UI.button(ed.skinName === s.name ? 'Active ✓' : 'Set active', () => { ed.project.editor.activeSkin = s.name; ed.physStore = {}; ed.changed('structure'); this.render(); }, { primary: ed.skinName !== s.name }), UI.button('Duplicate', () => Act.duplicateSelection())),
          UI.note('New attachments are added to the active skin.'),
          UI.select('Merge into', () => [['', '(choose skin)']].concat(ed.sk.skins.filter((x) => x !== s).map((x) => [x.name, x.name])), () => '', (v) => { if (v) Act.mergeSkin(s.name, v); })),
        UI.section('Skin bones & constraints',
          h('div.field', null, h('span.flabel', null, 'Bones'), h('span.val', null, s.bones.join(', ') || '—')),
          UI.row(UI.button('Add selected bones', () => setList('bones', [...new Set(s.bones.concat(ed.selBones()))])), UI.button('Clear', () => setList('bones', []))),
          h('div.field', null, h('span.flabel', null, 'Constraints'), h('span.val', null, s.constraints.join(', ') || '—')),
          UI.row(UI.button('Add selected constraints', () => setList('constraints', [...new Set(s.constraints.concat(ed.selected('con').map((r) => r.n)))])), UI.button('Clear', () => setList('constraints', []))),
          UI.note('Bones/constraints marked "Skin required" are active only when the active skin lists them.')),
        s.name !== 'default' ? UI.section('Danger', UI.row(UI.button('Delete skin', () => Act.deleteSelection(), { danger: true }))) : null];
    },
    anim(ref) {
      const a = Model.anim(ed.sk, ref.n); if (!a) return UI.note('Missing animation');
      const dur = Model.animDuration(a);
      return [this.title('anim', a.name),
        UI.section('Animation',
          UI.note(`${a.timelines.length} timelines · ${a.timelines.reduce((s, t) => s + t.keys.length, 0)} keys · ${Math.round(dur * ed.fps)} frames (${M.round(dur, 2)}s)`),
          UI.num('End frame', () => Math.round((a.duration || 0) * ed.fps), (v, u) => { if (u) ed.pushUndo('Duration'); a.duration = Math.max(0, Math.round(v)) / ed.fps; ed.changed('values'); }, { step: 0.25, prec: 0, min: 0 }),
          UI.row(UI.button(ed.project.editor.activeAnim === a.name && ed.mode === 'animate' ? 'Active ✓' : 'Animate this', () => { ed.setAnim(a.name); ed.setMode('animate'); this.render(); }, { primary: true }), UI.button('Duplicate', () => Act.duplicateAnimation(a.name)), UI.button('Delete', () => Act.deleteSelection(), { danger: true }))),
      ];
    },
    event(ref) {
      const e = Model.event(ed.sk, ref.n); if (!e) return UI.note('Missing event');
      const set = (p) => (v, u) => { if (u !== false) ed.pushUndo('Event'); e[p] = v; ed.changed('values'); };
      const sounds = () => [['', '(none)']].concat(Object.keys(ed.project.audio || {}).map((n) => [n, n]));
      const out = [this.title('event', e.name),
        UI.section('Defaults',
          UI.num('Int', () => e.int, set('int'), { step: 0.2, prec: 0 }), UI.num('Float', () => e.float, set('float'), { step: 0.01, prec: 3 }),
          UI.text('String', () => e.string, set('string')),
          UI.select('Audio', sounds, () => e.audio || '', (v) => { set('audio')(v || ''); this.render(); }),
          e.audio && (ed.project.audio || {})[e.audio] ? h('div.wavewrap', null, A.Audio.waveCanvas(e.audio, 250, 40)) : null,
          UI.num('Volume', () => e.volume, set('volume'), { min: 0, max: 1, step: 0.01 }), UI.num('Balance', () => e.balance, set('balance'), { min: -1, max: 1, step: 0.01 }),
          UI.row(UI.button('▶ Play sound', () => A.Audio.play(e.audio, e.volume, e.balance)), UI.button('Import audio…', async () => { const added = await A.Audio.importFiles(await Act.pickFiles(A.Formats.AUDIO_ACCEPT, true)); if (added && added.length && !e.audio) { e.audio = added[0]; ed.changed('structure'); } }))),
      ];
      if (this.isAnim()) {
        out.push(UI.section('Animate', UI.row(UI.button('Key event at frame ' + ed.frame(), () => ed.keyEvent(e.name), { primary: true }))));
        const tl = ed.anim.timelines.find((t) => t.type === 'event');
        const keys = tl ? tl.keys.filter((k) => k.v.name === e.name) : [];
        if (keys.length) {
          const kset = (k, p) => (v, u) => { if (u !== false) ed.pushUndo('Event key'); k.v[p] = v; ed.changed('values'); };
          out.push(UI.section('Keys in "' + ed.anim.name + '"', ...keys.map((k) => h('div.evkey', null,
            h('div.evkey-head', null, h('b', null, 'Frame ' + Math.round(k.t * ed.fps)), h('button.btn.small', { onclick: () => ed.setTime(k.t) }, 'Go'),
              h('button.btn.small.danger', { onclick: () => { ed.pushUndo('Delete event key'); tl.keys.splice(tl.keys.indexOf(k), 1); ed.changed('structure'); } }, 'Delete')),
            UI.num('Int', () => k.v.int, kset(k, 'int'), { step: 0.2, prec: 0 }), UI.num('Float', () => k.v.float, kset(k, 'float'), { step: 0.01, prec: 3 }),
            UI.text('String', () => k.v.string, kset(k, 'string')),
            UI.num('Volume', () => (k.v.volume == null ? 1 : k.v.volume), kset(k, 'volume'), { min: 0, max: 1, step: 0.01 }),
            UI.num('Balance', () => k.v.balance || 0, kset(k, 'balance'), { min: -1, max: 1, step: 0.01 })))));
        }
      } else out.push(UI.note('Switch to Animate mode to place this event on the timeline.'));
      return out;
    },
    audio(ref) {
      const rec = (ed.project.audio || {})[ref.n]; if (!rec) return UI.note('Missing sound');
      const users = ed.sk.events.filter((e) => e.audio === ref.n).map((e) => e.name);
      const kb = Math.round((rec.data.length * 3) / 4 / 1024);
      return [this.title('audio', ref.n),
        UI.section('Sound', h('div.wavewrap', null, A.Audio.waveCanvas(ref.n, 250, 64)), UI.note(`${kb} KB · used by ${users.length ? users.join(', ') : 'no events'}`),
          UI.row(UI.button('▶ Play', () => A.Audio.play(ref.n, 1, 0), { primary: true }), UI.button('Delete', () => Act.deleteSelection(), { danger: true })),
          UI.select('Assign to event', () => [['', '(choose event)']].concat(ed.sk.events.map((e) => [e.name, e.name])), () => '', (v) => { if (!v) return; ed.pushUndo('Event audio'); Model.event(ed.sk, v).audio = ref.n; ed.changed('structure'); this.render(); }))];
    },
    image(ref) {
      const rec = ed.project.images[ref.n]; if (!rec) return UI.note('Missing image');
      const img = h('img.thumb', { src: rec.data });
      let uses = 0; Model.eachAttachment(ed.sk, (a) => { if (a.path === ref.n) uses++; });
      return [this.title('image', ref.n),
        UI.section('Image', h('div.thumbwrap', null, img), UI.note(`${rec.w} × ${rec.h}px · used by ${uses} attachment${uses === 1 ? '' : 's'}`),
          UI.row(UI.button('Add to selected bone', () => Act.imagesToSlots(ed.selected('image').map((r) => r.n)), { primary: true }),
            UI.button('Replace…', async () => { const f = await Act.pickFiles(A.Formats.IMAGE_ACCEPT, false); if (!f || !f[0]) return; const r = await Act.readImageFile(f[0]); if (!r) return; ed.pushUndo('Replace image'); ed.addImage(ref.n, r.data, r.w, r.h); ed.changed('structure'); }),
            UI.button('Delete', () => Act.deleteSelection(), { danger: true })))];
    },
  };

  A.Props = P;
})(window.A);
