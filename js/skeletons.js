/* Alike Studio — several skeletons in one project.
   project.skeletons = [{ name, skeleton, activeSkin, activeAnim, show, x, y }]. The active one is mirrored in
   project.skeleton / project.name (what the whole editor works on); images and audio are shared by all.
   Each skeleton keeps its own undo history. Inactive skeletons can be shown dimmed in the viewport. */
(function (A) {
  'use strict';
  const Model = A.Model, ed = A.ed, UI = A.UI, h = UI.h;
  const history = new WeakMap(); // entry -> { undo, redo }

  const S = {
    entries() {
      const p = ed.project;
      if (!Array.isArray(p.skeletons) || !p.skeletons.length) { p.skeletons = [{ name: p.name || 'skeleton', skeleton: p.skeleton, show: false, x: 0, y: 0 }]; p.activeSkeleton = 0; }
      if (!(p.activeSkeleton >= 0 && p.activeSkeleton < p.skeletons.length)) p.activeSkeleton = 0;
      return p.skeletons;
    },
    activeIndex() { S.entries(); return ed.project.activeSkeleton; },
    /* copy the live editor state of the active skeleton back into its entry */
    sync() {
      const p = ed.project, e = S.entries()[p.activeSkeleton];
      e.skeleton = p.skeleton; e.name = p.name; e.activeSkin = p.editor.activeSkin; e.activeAnim = p.editor.activeAnim;
      return e;
    },
    list() { S.sync(); return S.entries().map((e) => ({ name: e.name, skeleton: e.skeleton })); },
    current() { return { name: ed.project.name, skeleton: ed.project.skeleton }; },
    projectName() { return ed.project.projectName || S.entries()[0].name; },
    /* the project as saved: the active skeleton is stored once (as project.skeleton) */
    forSave() {
      S.sync();
      const p = ed.project, act = p.activeSkeleton;
      if (p.skeletons.length < 2) { const o = Object.assign({}, p); delete o.skeletons; delete o.activeSkeleton; return o; }
      return Object.assign({}, p, { skeletons: p.skeletons.map((e, i) => (i === act ? Object.assign({}, e, { skeleton: null }) : e)) });
    },
    onLoad(p) {
      if (Array.isArray(p.skeletons) && p.skeletons.length) {
        const act = p.activeSkeleton >= 0 && p.activeSkeleton < p.skeletons.length ? p.activeSkeleton : 0;
        p.activeSkeleton = act;
        if (!p.skeletons[act].skeleton) p.skeletons[act].skeleton = p.skeleton;
        p.skeletons.forEach((e) => { if (!e.skeleton) e.skeleton = Model.newSkeleton(); });
      }
    },
    switchTo(i) {
      const list = S.entries(), p = ed.project;
      if (i === p.activeSkeleton || !list[i]) return;
      const cur = S.sync();
      history.set(cur, { undo: ed.undoStack, redo: ed.redoStack });
      const e = list[i], hist = history.get(e) || { undo: [], redo: [] };
      p.activeSkeleton = i; p.skeleton = e.skeleton; p.name = e.name;
      p.editor.activeSkin = e.activeSkin && Model.skin(e.skeleton, e.activeSkin) ? e.activeSkin : 'default';
      p.editor.activeAnim = e.activeAnim && Model.anim(e.skeleton, e.activeAnim) ? e.activeAnim : null;
      ed.undoStack = hist.undo; ed.redoStack = hist.redo;
      ed.sel = []; ed.keySel.clear(); ed.vertSel.clear(); ed.clearOverrides(); ed.physStore = {};
      ed.time = 0; ed.playing = false;
      ed.layer.anim = null;
      if (ed.mode === 'animate' && !ed.anim) ed.mode = 'setup';
      ed.emit('mode'); ed.emit('anim'); ed.changed('structure'); ed.emit('selection');
      UI.toast('Editing skeleton "' + e.name + '"');
    },
    async add(copyOf) {
      const list = S.entries(); S.sync();
      const base = copyOf != null ? list[copyOf].name + '-copy' : 'skeleton';
      const n = await UI.prompt(copyOf != null ? 'Duplicate skeleton' : 'New skeleton', Model.uniqueName(list, base));
      if (!n) return;
      if (list.some((e) => e.name === n)) return UI.toast('A skeleton with that name exists');
      const src = copyOf != null ? list[copyOf] : null;
      list.push({ name: n, skeleton: src ? Model.clone(src.skeleton) : Model.newSkeleton(), activeSkin: src ? src.activeSkin : 'default', activeAnim: src ? src.activeAnim : null, show: false, x: 0, y: 0 });
      ed.dirty = true;
      S.switchTo(list.length - 1);
    },
    async remove(i) {
      const list = S.entries(); if (list.length < 2) return UI.toast('A project needs at least one skeleton');
      if (!(await UI.confirm('Delete skeleton', `Delete skeleton "${list[i].name}" and everything in it? This cannot be undone.`))) return;
      S.sync();
      const wasActive = i === ed.project.activeSkeleton;
      if (wasActive) S.switchTo(i === 0 ? 1 : 0);
      const act = list[ed.project.activeSkeleton];
      list.splice(i, 1);
      ed.project.activeSkeleton = list.indexOf(act);
      ed.dirty = true; ed.changed('structure');
    },
    async rename(i) {
      const list = S.entries(); S.sync();
      const n = await UI.prompt('Rename skeleton', list[i].name);
      if (!n || n === list[i].name) return;
      if (list.some((e) => e.name === n)) return UI.toast('A skeleton with that name exists');
      list[i].name = n; if (i === ed.project.activeSkeleton) ed.project.name = n;
      ed.dirty = true; ed.changed('structure');
    },
    move(i, d) {
      const list = S.entries(), j = i + d; if (j < 0 || j >= list.length) return;
      S.sync(); const act = list[ed.project.activeSkeleton];
      [list[i], list[j]] = [list[j], list[i]];
      ed.project.activeSkeleton = list.indexOf(act); ed.dirty = true; ed.changed('structure');
    },
    /* add the skeletons of another .alike project (images and sounds it needs come along; existing names win) */
    importFrom(json) {
      const p = typeof json === 'string' ? JSON.parse(json) : json;
      if (!p || !p.skeleton) throw new Error('Not an Alike project');
      S.onLoad(p);
      const incoming = Array.isArray(p.skeletons) && p.skeletons.length ? p.skeletons : [{ name: p.name || 'skeleton', skeleton: p.skeleton }];
      const list = S.entries(); S.sync();
      let imgs = 0, clash = 0;
      for (const n in p.images || {}) { if (ed.project.images[n]) { if (ed.project.images[n].data !== p.images[n].data) clash++; continue; } ed.project.images[n] = p.images[n]; imgs++; }
      for (const n in p.audio || {}) if (!ed.project.audio[n]) ed.project.audio[n] = p.audio[n];
      for (const e of incoming) list.push({ name: Model.uniqueName(list, e.name), skeleton: e.skeleton, activeSkin: e.activeSkin || 'default', activeAnim: e.activeAnim || null, show: false, x: 0, y: 0 });
      ed.syncImages(); ed.dirty = true; ed.changed('structure');
      UI.toast(`Added ${incoming.length} skeleton${incoming.length === 1 ? '' : 's'} and ${imgs} image${imgs === 1 ? '' : 's'}` + (clash ? ` (${clash} images with the same name kept the current version)` : ''));
    },
    async importDialog() {
      const f = await A.Act.pickFiles('.alike,.json', false); if (!f || !f[0]) return;
      try { S.importFrom(await f[0].text()); } catch (e) { UI.alert('Import failed', e.message); }
    },

    /* viewport: draw the other visible skeletons (setup pose or their active animation's first frame), dimmed */
    drawOthers(gl) {
      const list = ed.project.skeletons; if (!Array.isArray(list) || list.length < 2) return;
      list.forEach((e, i) => {
        if (i === ed.project.activeSkeleton || !e.show || !e.skeleton) return;
        try {
          const pose = new A.Pose({ skeleton: e.skeleton }, e.activeSkin || 'default');
          const an = e.activeAnim && Model.anim(e.skeleton, e.activeAnim);
          if (an && ed.mode === 'animate') { const d = Model.animDuration(an) || 1; pose.applyAnimation(an, ed.time % d); }
          pose.update(0);
          for (const b of pose.bones) { b.wx += e.x || 0; b.wy += e.y || 0; }
          gl.drawPose(pose, { images: ed.images, tint: [1, 1, 1, 0.55] });
        } catch (err) { /* a broken skeleton must not stop the editor */ }
      });
    },

    /* tree rows for the skeleton list (the active skeleton's own row comes from the tree) */
    otherRows(push) {
      const list = S.entries(), act = ed.project.activeSkeleton;
      if (list.length < 2) return { before: [], after: [] };
      const row = (e, i) => ({ key: 'skel:' + i, depth: 0, icon: 'skeleton', label: e.name, sub: 'skeleton', ref: { k: 'skel', n: e.name, idx: i }, skelEye: i, dim: !e.show });
      return { before: list.slice(0, act).map((e, i) => row(e, i)), after: list.slice(act + 1).map((e, k) => row(e, act + 1 + k)) };
    },
  };

  /* properties of an inactive skeleton */
  A.Props.skel = function (ref) {
    const list = S.entries(), i = list.findIndex((e) => e.name === ref.n), e = list[i];
    if (!e) return UI.note('Missing skeleton');
    const sk = e.skeleton, set = (fn) => (v) => { fn(v); ed.dirty = true; ed.emit('redraw'); };
    return [h('div.ptitlebar', null, A.Tree.icon('skeleton'), h('span.pt-name', null, e.name), h('span.pt-sub', null, 'skeleton'), h('button.btn.small', { onclick: () => S.rename(i) }, 'Rename')),
      UI.section('Skeleton',
        UI.note(`${sk.bones.length} bones · ${sk.slots.length} slots · ${sk.skins.length} skins · ${sk.animations.length} animations`),
        UI.row(UI.button('Edit this skeleton', () => S.switchTo(i), { primary: true }), UI.button('Duplicate', () => S.add(i)), UI.button('Delete', () => S.remove(i), { danger: true })),
        UI.row(UI.button('Move up', () => S.move(i, -1)), UI.button('Move down', () => S.move(i, 1)))),
      UI.section('In the viewport',
        UI.check('Show while editing another skeleton', () => !!e.show, set((v) => (e.show = v))),
        UI.num2 ? UI.num2('Offset', { label: 'X', get: () => e.x || 0, set: set((v) => (e.x = v)) }, { label: 'Y', get: () => e.y || 0, set: set((v) => (e.y = v)) }) : null,
        UI.note('Shown dimmed and not selectable. In Animate mode it plays its own active animation.'))];
  };

  A.Skeletons = S;
})(window.A);
