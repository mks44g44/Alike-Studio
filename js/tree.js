/* Alike Studio — hierarchy tree panel */
(function (A) {
  'use strict';
  const Model = A.Model, ed = A.ed, UI = A.UI, Act = A.Act, h = UI.h;

  const ICON_PATHS = {
    skeleton: 'M8 2.5a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM8 6v4.5M5 7.5h6M8 10.5l-2.5 3M8 10.5l2.5 3',
    bone: 'M3 13L13 3M3 13l1.5-4 3.5 3.5z M13 3a1.2 1.2 0 1 1-.1 0',
    slot: 'M3 4.5h10v7H3z M5 8h6',
    region: 'M2.5 3.5h11v9h-11z M3.5 11l3-3.5 2.5 2.5 1.5-1.5 2.5 2.5 M10.5 6a.8.8 0 1 1-.1 0',
    mesh: 'M2.5 12.5l5.5-9 5.5 9z M8 3.5l-2.5 9 M8 3.5l2.5 9 M4 10h8',
    linkedmesh: 'M2.5 12.5l5.5-9 5.5 9z M5 9.5h6',
    bbox: 'M3 3h10v10H3z',
    clip: 'M3 3h10v10H3z M3 3l10 10',
    path: 'M2 12c3-9 6 5 12-8 M2 12a1 1 0 1 1 .1 0 M14 4a1 1 0 1 1 .1 0',
    point: 'M8 3v10M3 8h10 M8 6a2 2 0 1 1-.1 0',
    ik: 'M8 3a5 5 0 1 1-.1 0 M8 6a2 2 0 1 1-.1 0',
    transform: 'M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M14 8l-2-2M14 8l-2 2',
    pathc: 'M2 13c4-10 8 2 12-10 M5 7l2 2',
    physics: 'M2 8c1.5-4 3 4 4.5 0s3 4 4.5 0 3 4 3 0',
    slider: 'M2 8h12 M6 5.5h3v5H6z',
    audio: 'M3 6h3l4-3v10l-4-3H3z M12 5.5c1 1.2 1 3.8 0 5',
    skin: 'M5 2.5l3 1.5 3-1.5 3 3-2 1.5v7H4v-7L2 5.5z',
    anim: 'M5 3l8 5-8 5z',
    event: 'M9 1.5L4 9h4l-1 5.5L12 7H8z',
    image: 'M2.5 3.5h11v9h-11z M3.5 11l3-3 2 2 2-2 2 3',
    folder: 'M2 4.5h4l1.5 1.5H14v7H2z',
    order: 'M3 4h10M3 8h10M3 12h10',
  };
  function icon(name, cls = '') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', 'ico ' + cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.slot);
    s.appendChild(p); return s;
  }

  const Tree = {
    collapsed: new Set(['sec:images']),
    filter: '',
    icon,
    init(el) {
      this.el = el;
      const search = h('input.search', { type: 'text', placeholder: 'Filter…', spellcheck: 'false' });
      search.addEventListener('input', () => { this.filter = search.value.trim().toLowerCase(); this.render(); });
      search.addEventListener('keydown', (e) => e.stopPropagation());
      const add = h('button.btn.small', { title: 'New…', onclick: (e) => this.newMenu(e.clientX, e.clientY) }, '+ New');
      const del = h('button.btn.small.icon', { title: 'Delete (Del)', onclick: () => Act.deleteSelection() }, '🗑');
      this.list = h('div.tree-list', { tabindex: '0' });
      el.appendChild(h('div.panel-head', null, h('span.ptitle', null, 'Hierarchy'), search, add, del));
      el.appendChild(this.list);
      let pending = false;
      const later = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; this.render(); }); };
      ed.on('change', (w) => { if (w !== 'values' && w !== 'weights') later(); });
      ed.on('selection', later); ed.on('mode', later); ed.on('anim', later);
      this.render();
    },
    newMenu(x, y) {
      const bonesSel = ed.selBones().length > 0, slot = Act.currentSlot(), imgs = Object.keys(ed.project.images);
      UI.menu(x, y, [
        { label: 'Bone', key: 'C', action: () => Act.newBone(), disabled: ed.mode !== 'setup' },
        { label: 'Slot', action: () => Act.newSlot() },
        { label: 'Attachment', sub: [
          { label: 'Region (image)', sub: imgs.length ? imgs.slice(0, 60).map((n) => ({ label: n, action: () => (slot ? Act.newAttachment('region', slot, n) : Act.newSlot(null, n)) })) : [{ label: 'Import images first', disabled: true }] },
          { label: 'Bounding box', action: () => Act.newAttachment('bbox', slot) , disabled: !slot },
          { label: 'Clipping', action: () => Act.newAttachment('clip', slot), disabled: !slot },
          { label: 'Path', action: () => Act.newAttachment('path', slot), disabled: !slot },
          { label: 'Point', action: () => Act.newAttachment('point', slot), disabled: !slot },
        ] },
        '-',
        { label: 'IK constraint', action: () => Act.newConstraint('ik'), disabled: !bonesSel },
        { label: 'Transform constraint', action: () => Act.newConstraint('transform'), disabled: !bonesSel },
        { label: 'Path constraint', action: () => Act.newConstraint('path'), disabled: !bonesSel },
        { label: 'Physics constraint', action: () => Act.newConstraint('physics'), disabled: !bonesSel },
        { label: 'Slider constraint', action: () => Act.newConstraint('slider') },
        '-',
        { label: 'Draw order folder (selected slots)', action: () => A.Folders.newDrawFolder(), disabled: ed.mode === 'animate' },
        '-',
        { label: 'Skin', action: () => Act.newSkin() },
        { label: 'Event', action: () => Act.newEvent() },
        { label: 'Animation', action: () => Act.newAnimation() },
        '-',
        { label: 'Import images…', action: async () => Act.importImageFiles(await Act.pickFiles(A.Formats.IMAGE_ACCEPT)) },
        { label: 'Import image folder…', action: async () => Act.importImageFiles(await Act.pickFiles('', true, true)) },
        { label: 'Import Photoshop PSD…', action: async () => { const f = await Act.pickFiles('.psd,.psb', false); if (f && f[0]) A.PSD.importPSD(f[0]); } },
        { label: 'Import audio…', action: async () => A.Audio.importFiles(await Act.pickFiles(A.Formats.AUDIO_ACCEPT, true)) },
      ]);
    },

    rows() {
      const sk = ed.sk, R = [];
      const C = this.collapsed, f = this.filter;
      const push = (r) => { if (!f || (r.label || '').toLowerCase().includes(f) || r.section) R.push(r); };
      const exp = (k) => (f ? true : !C.has(k));
      const others = A.Skeletons.otherRows();
      others.before.forEach((r) => R.push(r));
      push({ key: 'skeleton', depth: 0, icon: 'skeleton', label: ed.project.name || 'Skeleton', ref: { k: 'skeleton' }, sub: others.before.length + others.after.length ? 'editing' : null });
      const boneRow = (b, depth) => {
        const kids = Model.children(sk, b.name), slots = Model.slotsOf(sk, b.name);
        const key = 'b:' + b.name, has = kids.length + slots.length > 0;
        push({ key, depth, icon: 'bone', label: b.name, ref: { k: 'bone', n: b.name }, caret: has ? exp(key) : null, eye: 'bone', drag: 'bone', drop: 'bone', color: b.color });
        if (!has || !exp(key)) return;
        for (const s of slots.slice().reverse()) {
          const sk2 = 's:' + s.name, attNames = this.visibleAtts(sk, s.name);
          push({ key: sk2, depth: depth + 1, icon: 'slot', label: s.name, ref: { k: 'slot', n: s.name }, caret: attNames.length ? exp(sk2) : null, eye: 'slot', drag: 'slot', drop: 'slot' });
          if (attNames.length && exp(sk2)) {
            for (const an of attNames) {
              const skinName = Model.skin(sk, ed.skinName) && Model.skin(sk, ed.skinName).attachments[s.name] && Model.skin(sk, ed.skinName).attachments[s.name][an] ? ed.skinName : sk.skins.find((x) => x.attachments[s.name] && x.attachments[s.name][an]).name;
              const att = Model.skin(sk, skinName).attachments[s.name][an];
              push({ key: 'a:' + s.name + ':' + an, depth: depth + 2, icon: att.type === 'region' ? 'region' : att.type, label: an, sub: skinName !== 'default' ? skinName : null,
                ref: { k: 'att', n: an, slot: s.name, skin: skinName }, dot: s.name, drag: 'att' });
            }
          }
        }
        for (const c of kids) boneRow(c, depth + 1);
      };
      sk.bones.filter((b) => !b.parent).forEach((b) => boneRow(b, 1));
      const sec = (key, label, ic, items, fn) => {
        push({ key, depth: 0, icon: ic, label: label + ' (' + items.length + ')', section: true, caret: items.length ? exp(key) : null });
        if (items.length && exp(key)) items.forEach(fn);
      };
      /* draw order: front→back, slots grouped under their draw order folders (Animate mode shows the animated order) */
      const order = (ed.mode === 'animate' && ed.anim && ed.pose ? ed.pose.drawOrder.map((s) => s.data) : sk.slots).slice().reverse();
      const dfs = sk.drawFolders || [];
      push({ key: 'sec:order', depth: 0, icon: 'order', label: 'Draw Order (' + sk.slots.length + ')', section: true, caret: sk.slots.length || dfs.length ? exp('sec:order') : null, drop: 'dsec' });
      if (exp('sec:order')) {
        const animK = ed.mode === 'animate' && ed.anim;
        let curF = null;
        const folderRow = (name) => push({ key: 'df:' + name, depth: 1, icon: 'folder', label: name, sub: 'folder', ref: { k: 'dfolder', n: name }, caret: exp('df:' + name), drop: 'dfolder', drag: 'dfolder',
          keyed: animK && ed.anim.timelines.some((t) => t.type === 'drawFolder' && t.target === name && t.keys.length) });
        for (const s of order) {
          if (s.folder) {
            if (s.folder !== curF) { curF = s.folder; folderRow(curF); }
            if (exp('df:' + curF)) push({ key: 'o:' + s.name, depth: 2, icon: 'slot', label: s.name, ref: { k: 'slot', n: s.name }, drag: 'order', drop: 'order' });
          } else { curF = null; push({ key: 'o:' + s.name, depth: 1, icon: 'slot', label: s.name, ref: { k: 'slot', n: s.name }, drag: 'order', drop: 'order' }); }
        }
        dfs.filter((f) => !sk.slots.some((s) => s.folder === f.name)).forEach((f) => folderRow(f.name));
      }
      /* sections whose items can be put in folders ("folder/name") */
      const fsec = (kind, key, label, ic, items, rowFn) => {
        push({ key, depth: 0, icon: ic, label: label + ' (' + items.length + ')', section: true, caret: items.length || A.Folders.store(kind).length ? exp(key) : null, drop: 'tsec', kind });
        if (!exp(key)) return;
        const all = A.Folders.allFolders(kind);
        const emit = (parent, depth) => {
          for (const p of all.filter((x) => Model.folderOf(x) === parent)) {
            const fk = 'f:' + kind + ':' + p;
            push({ key: fk, depth, icon: 'folder', label: Model.leafName(p), ref: { k: 'tfolder', kind, n: p }, caret: exp(fk), drop: 'tfolder', drag: 'tfolder', kind });
            if (exp(fk)) emit(p, depth + 1);
          }
          items.filter((it) => Model.folderOf(it.name) === parent).forEach((it) => rowFn(it, depth));
        };
        emit('', 1);
      };
      fsec('con', 'sec:cons', 'Constraints', 'transform', sk.constraints, (c, d) => push({ key: 'c:' + c.name, depth: d, icon: c.type === 'path' ? 'pathc' : c.type, label: Model.leafName(c.name), sub: c.type, ref: { k: 'con', n: c.name }, dim: c.enabled === false, drag: 'titem', kind: 'con' }));
      const pins = new Set((ed.project.editor.pinnedSkins || []));
      fsec('skin', 'sec:skins', 'Skins', 'skin', sk.skins, (s, d) => push({ key: 'k:' + s.name, depth: d, icon: 'skin', label: Model.leafName(s.name), ref: { k: 'skin', n: s.name }, active: ed.skinName === s.name, radio: 'skin', drag: s.name === 'default' ? null : 'titem', kind: 'skin', pin: s.name, pinned: pins.has(s.name) }));
      fsec('event', 'sec:events', 'Events', 'event', sk.events, (e, d) => push({ key: 'e:' + e.name, depth: d, icon: 'event', label: Model.leafName(e.name), ref: { k: 'event', n: e.name }, drag: 'titem', kind: 'event' }));
      fsec('anim', 'sec:anims', 'Animations', 'anim', sk.animations, (a, d) => push({ key: 'n:' + a.name, depth: d, icon: 'anim', label: Model.leafName(a.name), ref: { k: 'anim', n: a.name }, active: ed.project.editor.activeAnim === a.name, radio: 'anim', drag: 'titem', kind: 'anim' }));
      others.after.forEach((r) => R.push(r));
      sec('sec:images', 'Images', 'folder', Object.keys(ed.project.images).sort(), (n) => push({ key: 'i:' + n, depth: 1, icon: 'image', label: n, ref: { k: 'image', n }, drag: 'image' }));
      sec('sec:audio', 'Audio', 'audio', Object.keys(ed.project.audio || {}).sort(), (n) => push({ key: 'u:' + n, depth: 1, icon: 'audio', label: n, ref: { k: 'audio', n } }));
      return R;
    },

    /* View → "Tree shows attachments of": all skins, the active skin, or the active + pinned skins */
    visibleAtts(sk, slotName) {
      const all = Model.slotAttachmentNames(sk, slotName), mode = ed.view.treeSkins || 'all';
      if (mode === 'all') return all;
      const allow = new Set(['default', ed.skinName].concat(mode === 'pinned' ? ed.project.editor.pinnedSkins || [] : []));
      return all.filter((an) => sk.skins.some((x) => allow.has(x.name) && x.attachments[slotName] && x.attachments[slotName][an]));
    },
    render() {
      const list = this.list; if (!list) return;
      const st = list.scrollTop;
      list.innerHTML = '';
      const sk = ed.sk;
      for (const r of this.rows()) {
        const selected = r.ref && ed.isSelected(r.ref);
        const row = h('div.trow' + (selected ? '.sel' : '') + (r.section ? '.section-row' : '') + (r.dim ? '.dim' : ''), { style: { paddingLeft: 6 + r.depth * 14 + 'px' } });
        const caret = h('span.tcaret', null, r.caret == null ? '' : r.caret ? '▾' : '▸');
        if (r.caret != null) caret.addEventListener('click', (e) => { e.stopPropagation(); this.collapsed.has(r.key) ? this.collapsed.delete(r.key) : this.collapsed.add(r.key); this.render(); });
        row.appendChild(caret);
        if (r.dot) { // attachment visibility dot
          const slot = ed.pose && ed.pose.slotMap[r.dot];
          const on = slot ? slot.attachment === r.ref.n : Model.slot(sk, r.dot).attachment === r.ref.n;
          const dot = h('span.adot' + (on ? '.on' : ''), { title: 'Show this attachment' });
          dot.addEventListener('click', (e) => { e.stopPropagation(); ed.setSlotValue(r.dot, 'attachment', on ? null : r.ref.n, 'Set attachment'); this.render(); });
          row.appendChild(dot);
        }
        if (r.radio) {
          const dot = h('span.adot' + (r.active ? '.on' : ''), { title: r.radio === 'skin' ? 'Active skin' : 'Active animation' });
          dot.addEventListener('click', (e) => { e.stopPropagation(); if (r.radio === 'skin') { ed.project.editor.activeSkin = r.ref.n; ed.physStore = {}; ed.changed('structure'); } else { ed.setAnim(r.ref.n); if (ed.mode !== 'animate') ed.setMode('animate'); } this.render(); });
          row.appendChild(dot);
        }
        const ic = icon(r.icon, r.section ? 'sec' : '');
        if (r.color) ic.style.color = '#' + r.color.slice(0, 6);
        row.appendChild(ic);
        row.appendChild(h('span.tname', null, r.label));
        if (r.sub) row.appendChild(h('span.tsub', null, r.sub));
        if (r.ref && ed.mode === 'animate' && ed.anim && (r.ref.k === 'bone' || r.ref.k === 'slot' || r.ref.k === 'con')) {
          const type = r.ref.k === 'con' ? 'constraint' : r.ref.k;
          if (ed.anim.timelines.some((t) => t.type === type && t.target === r.ref.n && t.keys.length)) row.appendChild(h('span.tkeyed', { title: 'Has keys in this animation' }, '◆'));
        }
        if (r.keyed) row.appendChild(h('span.tkeyed', { title: 'Has keys in this animation' }, '◆'));
        if (r.skelEye != null) {
          const e = ed.project.skeletons[r.skelEye];
          const eye = h('span.teye' + (e.show ? '' : '.off'), { title: 'Show in the viewport while editing another skeleton' }, e.show ? '●' : '◌');
          eye.addEventListener('click', (ev) => { ev.stopPropagation(); e.show = !e.show; ed.dirty = true; this.render(); ed.emit('redraw'); });
          row.appendChild(eye);
          row.addEventListener('dblclick', (ev) => { ev.stopPropagation(); A.Skeletons.switchTo(r.skelEye); });
        }
        if (r.pin) {
          const pin = h('span.tpin' + (r.pinned ? '.on' : ''), { title: r.pinned ? 'Pinned: shown by "Show pinned skins" (click to unpin)' : 'Pin this skin' }, '📌');
          pin.addEventListener('click', (e) => { e.stopPropagation(); const pe = ed.project.editor; const set = new Set(pe.pinnedSkins || []); set.has(r.pin) ? set.delete(r.pin) : set.add(r.pin); pe.pinnedSkins = [...set]; ed.emit('redraw'); this.render(); });
          row.appendChild(pin);
        }
        if (r.eye) {
          const hidden = r.eye === 'bone' ? ed.hiddenBones.has(r.ref.n) : ed.hiddenSlots.has(r.ref.n);
          const eye = h('span.teye' + (hidden ? '.off' : ''), { title: 'Toggle visibility' }, hidden ? '◌' : '●');
          const lk = (r.eye === 'bone' ? 'b:' : 's:') + r.ref.n, locked = ed.locked.has(lk);
          const lock = h('span.tlock' + (locked ? '.on' : ''), { title: locked ? 'Locked: not selectable in the viewport (click to unlock)' : 'Lock (not selectable in the viewport)' }, locked ? '🔒' : '🔓');
          lock.addEventListener('click', (e) => { e.stopPropagation(); locked ? ed.locked.delete(lk) : ed.locked.add(lk); this.render(); });
          row.appendChild(lock);
          eye.addEventListener('click', (e) => { e.stopPropagation(); const s = r.eye === 'bone' ? ed.hiddenBones : ed.hiddenSlots; s.has(r.ref.n) ? s.delete(r.ref.n) : s.add(r.ref.n); this.render(); });
          row.appendChild(eye);
        }
        if (r.ref) {
          row.addEventListener('click', (e) => ed.select(Object.assign({}, r.ref), e.shiftKey || e.ctrlKey || e.metaKey));
          if (r.skelEye == null) row.addEventListener('dblclick', () => Act.renameRef(Object.assign({}, r.ref)));
          row.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!ed.isSelected(r.ref)) ed.select(Object.assign({}, r.ref)); this.ctx(e.clientX, e.clientY, r.ref); });
        } else if (r.caret != null) row.addEventListener('click', () => { this.collapsed.has(r.key) ? this.collapsed.delete(r.key) : this.collapsed.add(r.key); this.render(); });
        if (r.section) row.addEventListener('contextmenu', (e) => { e.preventDefault(); this.secCtx(e.clientX, e.clientY, r); });
        if (r.drag) {
          row.draggable = true;
          row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/alike', JSON.stringify({ kind: r.drag, ref: r.ref, tkind: r.kind })); e.dataTransfer.effectAllowed = 'move'; });
        }
        if (r.drop) {
          row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); });
          row.addEventListener('dragleave', () => row.classList.remove('drop'));
          row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('drop'); this.onDrop(r, e.dataTransfer.getData('text/alike')); });
        }
        list.appendChild(row);
      }
      list.scrollTop = st;
    },
    onDrop(r, data) {
      if (!data) return;
      const d = JSON.parse(data);
      if (r.drop === 'bone') {
        if (d.kind === 'bone' && d.ref.n !== r.ref.n) Act.reparentBone(d.ref.n, r.ref.n, true);
        else if (d.kind === 'slot' || d.kind === 'order') Act.setSlotBone(d.ref.n, r.ref.n);
      } else if (r.drop === 'slot') {
        if (d.kind === 'att') Act.moveAttachment(d.ref.slot, d.ref.skin, d.ref.n, r.ref.n);
        else if (d.kind === 'image') Act.newAttachment('region', r.ref.n, d.ref.n);
      } else if (r.drop === 'order' && (d.kind === 'order' || d.kind === 'slot') && d.ref.n !== r.ref.n) {
        // list is shown front→back; dropping onto a row places the dragged slot just in front of it (and into its folder)
        const sk = ed.sk, target = Model.slot(sk, r.ref.n);
        if (ed.mode === 'animate' && ed.anim && ed.pose) {
          const cur = ed.pose.drawOrder, idx = cur.findIndex((s) => s.name === r.ref.n), after = cur[idx + 1];
          return Act.moveDrawOrder(d.ref.n, after && after.name !== d.ref.n ? { before: after.name } : 'top');
        }
        const idx = sk.slots.findIndex((s) => s.name === r.ref.n), after = sk.slots[idx + 1];
        Act.moveDrawOrder(d.ref.n, after && after.name !== d.ref.n ? { before: after.name } : 'top', target.folder || null);
      } else if (r.drop === 'dfolder' && (d.kind === 'order' || d.kind === 'slot')) {
        if (ed.mode === 'animate') return UI.toast('Folders are changed in Setup mode');
        A.Folders.setSlotFolder(ed.isSelected(d.ref) ? ed.selected('slot').map((x) => x.n) : [d.ref.n], r.ref.n);
      } else if (r.drop === 'dsec' && (d.kind === 'order' || d.kind === 'slot') && ed.mode !== 'animate') {
        Act.moveDrawOrder(d.ref.n, 'top', null);
      } else if ((r.drop === 'tfolder' || r.drop === 'tsec') && r.kind === d.tkind) {
        const folder = r.drop === 'tsec' ? '' : r.ref.n;
        if (d.kind === 'titem') {
          const refK = A.Folders.KINDS[r.kind].ref;
          const names = ed.isSelected(d.ref) ? ed.sel.filter((x) => x.k === refK).map((x) => x.n) : [d.ref.n];
          A.Folders.moveToFolder(r.kind, names, folder);
        } else if (d.kind === 'tfolder' && d.ref.n !== folder && !folder.startsWith(d.ref.n + '/')) {
          // move a folder (and its contents) into another folder
          const F = A.Folders, kind = r.kind, from = d.ref.n, np = (folder ? folder + '/' : '') + Model.leafName(from);
          if (F.allFolders(kind).includes(np)) return UI.toast('That folder exists');
          ed.commit('Move folder', (sk) => {
            for (const it of F.KINDS[kind].list(sk).slice()) if (it.name.startsWith(from + '/')) F.renameItem(kind, it.name, np + it.name.slice(from.length));
            sk.folders[kind] = F.store(kind).map((p) => (p === from || p.startsWith(from + '/') ? np + p.slice(from.length) : p));
          });
        }
      }
    },
    secCtx(x, y, r) {
      const F = A.Folders;
      if (r.kind) return UI.menu(x, y, [{ label: 'New folder', action: () => F.newTreeFolder(r.kind, '') }]);
      if (r.key === 'sec:order') return UI.menu(x, y, [{ label: 'New draw order folder (selected slots)', action: () => F.newDrawFolder(), disabled: ed.mode === 'animate' },
        { label: 'Key draw order', action: () => ed.keyDrawOrder(), disabled: !(ed.mode === 'animate' && ed.anim) },
        { label: 'Reset draw order to setup', action: () => F.resetDrawOrder(), disabled: !(ed.mode === 'animate' && ed.anim) }]);
    },
    ctx(x, y, ref) {
      const items = [];
      if (ref.k === 'bone') items.push({ label: 'New child bone', action: () => Act.newBone(), disabled: ed.mode !== 'setup' }, { label: 'New slot', action: () => Act.newSlot(ref.n) },
        { label: 'Add physics', action: () => Act.newConstraint('physics') }, '-');
      if (ref.k === 'slot') items.push({ label: 'New bounding box', action: () => Act.newAttachment('bbox', ref.n) }, { label: 'New clipping', action: () => Act.newAttachment('clip', ref.n) },
        { label: 'New path', action: () => Act.newAttachment('path', ref.n) }, { label: 'New point', action: () => Act.newAttachment('point', ref.n) },
        { label: 'Bring to front', action: () => Act.moveDrawOrder(ref.n, 'top') }, { label: 'Send to back', action: () => Act.moveDrawOrder(ref.n, 'bottom') },
        { label: 'Draw order folder', sub: A.Folders.folderMenu(ed.selected('slot').map((x) => x.n).concat(ed.isSelected(ref) ? [] : [ref.n])), disabled: ed.mode === 'animate' }, '-');
      if (ref.k === 'dfolder') {
        const F = A.Folders;
        if (ed.mode === 'animate' && ed.anim) items.push({ label: 'Key folder order', action: () => ed.keyDrawFolder(ref.n) }, { label: 'Reset to setup order', action: () => F.resetDrawFolder(ref.n) }, { label: 'Clear folder keys', action: () => F.clearDrawFolderKeys(ref.n) }, '-');
        items.push({ label: 'Duplicate folder', action: () => F.duplicateDrawFolder(ref.n) }, { label: 'Delete folder (keep slots)', action: () => F.ungroupDrawFolder(ref.n) }, '-');
      }
      if (ref.k === 'tfolder') {
        const F = A.Folders;
        items.push({ label: 'New subfolder', action: () => F.newTreeFolder(ref.kind, ref.n) }, { label: 'Duplicate folder', action: () => F.duplicateTreeFolder(ref.kind, ref.n) },
          { label: 'Delete folder (keep contents)', action: () => F.deleteTreeFolder(ref.kind, ref.n, false) },
          { label: 'Delete with contents', action: async () => { if (await UI.confirm('Delete folder', 'Delete "' + ref.n + '" and everything in it?')) F.deleteTreeFolder(ref.kind, ref.n, true); } }, '-');
      }
      const fk = { anim: 'anim', skin: 'skin', event: 'event', con: 'con' }[ref.k];
      if (fk && !(fk === 'skin' && ref.n === 'default')) {
        const F = A.Folders, names = ed.sel.filter((x) => x.k === ref.k).map((x) => x.n);
        items.push({ label: 'Move to folder', sub: [{ label: 'New folder…', action: async () => { const n = await UI.prompt('New folder', 'folder'); if (n && !n.includes('/')) F.moveToFolder(fk, names, n); } },
          { label: '(top level)', action: () => F.moveToFolder(fk, names, ''), disabled: names.every((n) => !Model.folderOf(n)) }].concat(F.allFolders(fk).map((p) => ({ label: p, action: () => F.moveToFolder(fk, names, p) }))) }, '-');
      }
      if (ref.k === 'att') { const a = ed.selAttachment(); if (a && a.att.type === 'region') items.push({ label: 'Convert to mesh', action: () => Act.convertToMesh() }, '-'); }
      if (ref.k === 'image') items.push({ label: 'Add to selected bone', action: () => Act.imagesToSlots(ed.selected('image').map((r) => r.n)) }, '-');
      if (ref.k === 'anim') items.push({ label: 'Set active', action: () => { ed.setAnim(ref.n); ed.setMode('animate'); } }, '-');
      items.push({ label: 'Rename', key: 'F2', action: () => Act.renameRef(ref) });
      if (['bone', 'att', 'anim', 'skin', 'con'].includes(ref.k)) items.push({ label: 'Duplicate', key: 'Ctrl+D', action: () => Act.duplicateSelection() });
      if (ref.k !== 'skeleton') items.push({ label: 'Delete', key: 'Del', action: () => Act.deleteSelection() });
      UI.menu(x, y, items);
    },
  };

  A.Tree = Tree;
})(window.A);
