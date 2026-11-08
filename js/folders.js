/* Alike Studio — folders.
   1) Draw order folders: slots grouped in the draw order. A folder can be keyed on its own (a "drawFolder"
      timeline reorders only that folder's slots), so different folders can be keyed in different animations
      and played on different tracks at once.
   2) Tree folders: animations, skins, events and constraints can live in folders. A folder is part of the
      item's name ("folder/sub/name"), which is also the name in exported data and the runtimes. */
(function (A) {
  'use strict';
  const Model = A.Model, ed = A.ed, UI = A.UI, Act = A.Act, P = A.Props, h = UI.h;

  const KINDS = {
    anim: { list: (sk) => sk.animations, label: 'animation', ref: 'anim' },
    skin: { list: (sk) => sk.skins, label: 'skin', ref: 'skin' },
    event: { list: (sk) => sk.events, label: 'event', ref: 'event' },
    con: { list: (sk) => sk.constraints, label: 'constraint', ref: 'con' },
  };
  const under = (name, folder) => name.startsWith(folder + '/');

  const F = {
    KINDS,
    /* ---------- draw order folders ---------- */
    folders: () => (ed.sk.drawFolders = ed.sk.drawFolders || []),
    async newDrawFolder(slotNames) {
      slotNames = slotNames || ed.selected('slot').map((r) => r.n);
      const n = await UI.prompt('New draw order folder', Model.uniqueName(F.folders(), 'folder'));
      if (!n) return;
      if (F.folders().some((f) => f.name === n)) return UI.toast('A draw order folder with that name exists');
      ed.commit('New draw order folder', (sk) => {
        sk.drawFolders.push({ name: n });
        sk.slots.forEach((s) => { if (slotNames.includes(s.name)) s.folder = n; });
        Model.normalizeDrawFolders(sk);
      });
      A.Tree.collapsed.delete('df:' + n);
      ed.select({ k: 'dfolder', n });
    },
    setSlotFolder(slotNames, folder) {
      ed.commit(folder ? 'Move to draw order folder' : 'Remove from draw order folder', (sk) => {
        sk.slots.forEach((s) => { if (slotNames.includes(s.name)) { if (folder) s.folder = folder; else delete s.folder; } });
        if (folder) { // move the slots to the front of the folder
          const moving = sk.slots.filter((s) => slotNames.includes(s.name));
          const rest = sk.slots.filter((s) => !slotNames.includes(s.name));
          let at = -1; rest.forEach((s, i) => { if (s.folder === folder) at = i; });
          rest.splice(at < 0 ? rest.length : at + 1, 0, ...moving);
          sk.slots = rest;
        }
        Model.normalizeDrawFolders(sk);
      });
    },
    async newDrawFolderFromMenu(slotNames) { return F.newDrawFolder(slotNames); },
    ungroupDrawFolder(name) {
      ed.commit('Delete draw order folder', (sk) => Model.deleteDrawFolder(sk, name));
      ed.select(null);
    },
    /* duplicates the folder with copies of all its slots and their attachments */
    duplicateDrawFolder(name) {
      const sk = ed.sk;
      ed.commit('Duplicate draw order folder', () => {
        const nf = Model.uniqueName(F.folders(), name + '-copy');
        sk.drawFolders.push({ name: nf });
        const members = Model.folderSlots(sk, name), copies = [];
        for (const s of members) {
          const ns = Model.clone(s); ns.name = Model.uniqueName(sk.slots.concat(copies), s.name + '-copy'); ns.folder = nf;
          for (const skin of sk.skins) if (skin.attachments[s.name]) skin.attachments[ns.name] = Model.clone(skin.attachments[s.name]);
          copies.push(ns);
        }
        let last = -1; sk.slots.forEach((s, i) => { if (s.folder === name) last = i; });
        sk.slots.splice(last + 1, 0, ...copies); // in front of the original
        ed.select({ k: 'dfolder', n: nf });
      });
    },
    /* Animate mode: key the folder back to its setup order. Setup mode: nothing to reset. */
    resetDrawFolder(name) {
      if (!(ed.mode === 'animate' && ed.anim)) return;
      ed.keyDrawFolder(name, Model.folderSlots(ed.sk, name).map((s) => s.name));
    },
    clearDrawFolderKeys(name) {
      const an = ed.anim; if (!an) return;
      ed.pushUndo('Clear draw order folder keys');
      an.timelines = an.timelines.filter((tl) => !(tl.type === 'drawFolder' && tl.target === name));
      ed.changed('keys');
    },
    resetDrawOrder() { // Animate mode: key the whole draw order back to setup
      if (!(ed.mode === 'animate' && ed.anim)) return;
      ed.pushUndo('Reset draw order');
      Model.setKey(Model.ensureTimeline(ed.anim, 'drawOrder'), ed.snapTime(ed.time), ed.sk.slots.map((s) => s.name), 's');
      for (const f of F.folders()) { const tl = Model.findTimeline(ed.anim, 'drawFolder', f.name); if (tl) Model.setKey(tl, ed.snapTime(ed.time), Model.folderSlots(ed.sk, f.name).map((s) => s.name), 's'); }
      ed.changed('keys');
    },
    folderMenu(slotNames) {
      const items = F.folders().map((f) => ({ label: f.name, action: () => F.setSlotFolder(slotNames, f.name) }));
      return [{ label: 'New folder…', action: () => F.newDrawFolder(slotNames) }].concat(items.length ? ['-'] : [], items,
        ['-', { label: 'No folder', action: () => F.setSlotFolder(slotNames, null), disabled: !slotNames.some((n) => (Model.slot(ed.sk, n) || {}).folder) }]);
    },

    /* ---------- tree folders ---------- */
    store(kind) { const sk = ed.sk; sk.folders = sk.folders || {}; return (sk.folders[kind] = sk.folders[kind] || []); },
    allFolders(kind) {
      const set = new Set();
      const add = (p) => { while (p) { set.add(p); p = Model.folderOf(p); } };
      KINDS[kind].list(ed.sk).forEach((it) => add(Model.folderOf(it.name)));
      F.store(kind).forEach(add);
      return [...set].sort();
    },
    renameItem(kind, from, to) {
      const sk = ed.sk;
      switch (kind) {
        case 'anim': Model.renameAnimation(sk, from, to); if (ed.project.editor.activeAnim === from) ed.project.editor.activeAnim = to; break;
        case 'skin': Model.renameSkin(sk, from, to); if (ed.project.editor.activeSkin === from) ed.project.editor.activeSkin = to; break;
        case 'event': Model.renameEvent(sk, from, to); break;
        case 'con': Model.renameConstraint(sk, from, to); break;
      }
    },
    async newTreeFolder(kind, parent = '') {
      const n = await UI.prompt('New folder', 'folder');
      if (!n) return;
      if (n.includes('/')) return UI.toast('Folder names cannot contain /');
      const path = parent ? parent + '/' + n : n;
      if (F.allFolders(kind).includes(path)) return UI.toast('That folder exists');
      ed.commit('New folder', () => { F.store(kind).push(path); });
      A.Tree.collapsed.delete('sec:' + kind); A.Tree.collapsed.delete('f:' + kind + ':' + parent);
      ed.select({ k: 'tfolder', kind, n: path });
    },
    /* move items (names) into folder ('' = top level) */
    moveToFolder(kind, names, folder) {
      const list = KINDS[kind].list(ed.sk);
      ed.commit('Move to folder', () => {
        for (const n of names) {
          if (kind === 'skin' && n === 'default') continue;
          const to = (folder ? folder + '/' : '') + Model.leafName(n);
          if (to === n) continue;
          if (list.some((x) => x.name === to)) { UI.toast(`"${to}" already exists`); continue; }
          F.renameItem(kind, n, to);
        }
        ed.sel = ed.sel.map((r) => (r.k === KINDS[kind].ref && names.includes(r.n) ? Object.assign({}, r, { n: (folder ? folder + '/' : '') + Model.leafName(r.n) }) : r));
      });
      ed.emit('selection');
    },
    async renameTreeFolder(kind, path) {
      const leaf = Model.leafName(path), parent = Model.folderOf(path);
      const n = await UI.prompt('Rename folder', leaf);
      if (!n || n === leaf) return;
      if (n.includes('/')) return UI.toast('Folder names cannot contain /');
      const np = parent ? parent + '/' + n : n;
      if (F.allFolders(kind).includes(np)) return UI.toast('That folder exists');
      ed.commit('Rename folder', (sk) => {
        for (const it of KINDS[kind].list(sk).slice()) if (under(it.name, path)) F.renameItem(kind, it.name, np + it.name.slice(path.length));
        sk.folders[kind] = F.store(kind).map((p) => (p === path || under(p, path) ? np + p.slice(path.length) : p));
      });
      ed.select({ k: 'tfolder', kind, n: np });
    },
    /* withContents: delete the items too; otherwise they move up one level */
    deleteTreeFolder(kind, path, withContents) {
      const parent = Model.folderOf(path);
      ed.commit('Delete folder', (sk) => {
        const items = KINDS[kind].list(sk).filter((it) => under(it.name, path)).map((it) => it.name);
        if (withContents) {
          for (const n of items) {
            if (kind === 'anim') { sk.animations = sk.animations.filter((a) => a.name !== n); if (ed.project.editor.activeAnim === n) ed.project.editor.activeAnim = sk.animations[0] ? sk.animations[0].name : null; }
            if (kind === 'skin') { sk.skins = sk.skins.filter((s) => s.name !== n); if (ed.project.editor.activeSkin === n) ed.project.editor.activeSkin = 'default'; }
            if (kind === 'event') Model.deleteEvent(sk, n);
            if (kind === 'con') Model.deleteConstraint(sk, n);
          }
        } else {
          const list = KINDS[kind].list(sk);
          for (const n of items) {
            const to = (parent ? parent + '/' : '') + n.slice(path.length + 1);
            if (!list.some((x) => x.name === to)) F.renameItem(kind, n, to);
          }
        }
        sk.folders[kind] = F.store(kind).filter((p) => !(p === path || under(p, path)));
        if (!withContents && parent) sk.folders[kind].push(parent);
        ed.sel = [];
      });
      ed.physStore = {}; ed.emit('selection');
    },
    /* copy a folder with everything in it ("name-copy") */
    duplicateTreeFolder(kind, path) {
      const sk = ed.sk, list = KINDS[kind].list(sk);
      let np = path + '-copy', i = 2; const all = F.allFolders(kind);
      while (all.includes(np)) np = path + '-copy' + i++;
      ed.commit('Duplicate folder', () => {
        for (const it of list.slice()) if (under(it.name, path)) {
          const c = Model.clone(it); c.name = np + it.name.slice(path.length);
          list.push(c);
        }
        F.store(kind).push(np);
      });
      ed.select({ k: 'tfolder', kind, n: np });
    },
  };

  /* ---------- properties panels ---------- */
  P.dfolder = function (ref) {
    const sk = ed.sk, f = (sk.drawFolders || []).find((x) => x.name === ref.n);
    if (!f) return UI.note('Missing draw order folder');
    const members = Model.folderSlots(sk, f.name);
    const anim = this.isAnim();
    const keyed = anim && ed.anim.timelines.some((t) => t.type === 'drawFolder' && t.target === f.name && t.keys.length);
    const out = [this.title('folder', f.name, 'draw order folder'),
      UI.section('Draw order folder',
        UI.note(`${members.length} slot${members.length === 1 ? '' : 's'} (front to back): ${members.slice().reverse().map((s) => s.name).join(', ') || '—'}`),
        UI.note('Keys on a folder reorder only its slots, so folders can be keyed in different animations and played on different tracks together.'),
        UI.row(UI.button('Add selected slots', () => F.setSlotFolder(ed.selected('slot').map((r) => r.n), f.name), { title: 'Select slots (Ctrl+click) first' }),
          UI.button('Duplicate', () => F.duplicateDrawFolder(f.name), { title: 'Copies the folder with all its slots and attachments' }),
          UI.button('Delete folder', () => F.ungroupDrawFolder(f.name), { danger: true, title: 'Slots stay; only the folder and its keys are removed' })))];
    if (anim) out.push(UI.section('Animate',
      UI.row(UI.button('Key folder order', () => ed.keyDrawFolder(f.name), { primary: true }),
        UI.button('Reset to setup order', () => F.resetDrawFolder(f.name), { title: 'Keys the setup order of this folder at the current frame' }),
        UI.button('Clear folder keys', () => F.clearDrawFolderKeys(f.name), { disabled: !keyed })),
      UI.note('Drag slots inside the folder in the Draw Order list to key a new order.')));
    return out;
  };
  P.tfolder = function (ref) {
    const kind = ref.kind, K = KINDS[kind]; if (!K) return UI.note('Unknown folder');
    const items = K.list(ed.sk).filter((it) => under(it.name, ref.n));
    return [this.title('folder', Model.leafName(ref.n), K.label + ' folder'),
      UI.section('Folder',
        UI.note(`${ref.n} · ${items.length} ${K.label}${items.length === 1 ? '' : 's'}`),
        UI.note('The folder path is part of each name ("' + ref.n + '/…"), which is also the name in exported data.'),
        UI.row(UI.button('New subfolder', () => F.newTreeFolder(kind, ref.n)), UI.button('Rename', () => F.renameTreeFolder(kind, ref.n)), UI.button('Duplicate', () => F.duplicateTreeFolder(kind, ref.n))),
        UI.row(UI.button('Delete folder (keep contents)', () => F.deleteTreeFolder(kind, ref.n, false)),
          UI.button('Delete with contents', async () => { if (await UI.confirm('Delete folder', `Delete "${ref.n}" and the ${items.length} ${K.label}(s) in it?`)) F.deleteTreeFolder(kind, ref.n, true); }, { danger: true })))];
  };

  A.Folders = F;
})(window.A);
