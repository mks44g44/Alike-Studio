/* Alike Studio — application shell: layout, menus, shortcuts, main loop */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, ed = A.ed, UI = A.UI, Act = A.Act, IO = A.IO, VP = A.VP, TL = A.TL, h = UI.h;

  const TOOLS = [
    ['pose', 'Q', 'Pose', 'Click to select. Drag a bone to aim it; drag IK targets / zero-length bones to move. Alt+drag = move.', 'M3 13L13 3 M9 3h4v4'],
    ['rotate', 'R', 'Rotate', 'Drag anywhere to rotate the selection around its pivot. Shift = 15° steps.', 'M12.5 8a4.5 4.5 0 1 1-1.3-3.2 M12 2.5v2.8H9.2'],
    ['translate', 'T', 'Translate', 'Drag anywhere to move the selection. Shift = lock axis.', 'M8 1.5v13M1.5 8h13M8 1.5l-2 2M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2'],
    ['scale', 'S', 'Scale', 'Drag right/left for X, up/down for Y. Shift = uniform.', 'M2.5 13.5h5v-5h-5z M7.5 8.5l6-6 M10 2.5h3.5V6'],
    ['shear', 'H', 'Shear', 'Drag to shear the selected bones.', 'M5 3h8l-2 10H3z'],
    ['create', 'C', 'Create bones', 'Setup mode: drag from a point to create a child bone of the selected bone.', 'M3 13L11 5 M11 2v6 M8 5h6'],
    ['mesh', 'M', 'Edit mesh', 'Select a mesh / box / clipping / path / point attachment. Click to add vertices, drag to move, Delete to remove.', 'M2.5 12.5l5.5-9 5.5 9z M8 3.5v9 M2.5 12.5L8 8l5.5 4.5'],
    ['weights', 'W', 'Weights', 'Paint vertex weights for the chosen bone on a bound mesh. Alt = remove.', 'M3 13c2-1 3-4 6-7l2 2c-3 3-6 4-7 6z M10 4l2-2 2 2-2 2'],
  ];
  function svgIcon(d) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', 'ico');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); return s;
  }

  const App = {
    focus: 'viewport',
    init() {
      const $ = (id) => document.getElementById(id);
      this.buildMenubar($('menubar'));
      this.buildMode($('modeSwitch'));
      this.buildRail($('toolrail'));
      VP.init($('viewport'));
      this.buildHud($('vpHud'));
      A.Tree.init($('treePanel'));
      A.Props.init($('propsPanel'));
      TL.init($('timeline'));
      this.status = $('statusbar');
      this.splitters();
      this.keys();
      this.dropZone();
      ['viewport', 'timeline', 'treePanel', 'propsPanel'].forEach((id) => $(id).addEventListener('mousedown', () => (this.focus = id === 'viewport' ? 'viewport' : id === 'timeline' ? 'timeline' : 'panel'), true));
      ed.on('mode', () => this.onMode()); ed.on('tool', () => this.onTool());
      ed.on('status', (s) => { this.lastStatus = s; this.lastStatusT = performance.now(); });
      this.onMode(); this.onTool();
      let last = performance.now(), lastRefresh = 0;
      const loop = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        this.advance(dt);
        try { ed.pose = ed.computePose(dt); VP.render(ed.pose); } catch (e) { console.error(e); }
        TL.draw();
        if (now - lastRefresh > 90) { lastRefresh = now; UI.refreshAll(); this.updateStatus(); }
        requestAnimationFrame(loop);
      };
      ed.pose = ed.computePose(0);
      requestAnimationFrame(loop);
      const cli = A.CLI && A.CLI.enabled; // command-line workers never touch the user's autosave
      setInterval(() => { if (ed.dirty && !cli) IO.autosave(); }, 20000);
      window.addEventListener('beforeunload', (e) => { if (ed.dirty && !cli) { IO.autosave(); e.preventDefault(); e.returnValue = ''; } });
      this.startup();
      // empty-project welcome card in the viewport
      const card = document.getElementById('vpEmpty');
      const acts = { images: async () => Act.importImageFiles(await Act.pickFiles(A.Formats.IMAGE_ACCEPT), { toSkeleton: true }), psd: async () => { const f = await Act.pickFiles('.psd,.psb', false); if (f && f[0]) A.PSD.importPSD(f[0]); },
        data: () => A.Importer.dialog(), open: () => IO.open(), demo: () => IO.load(A.Demo.create()), tutorial: () => A.Tutorial.show() };
      card.addEventListener('click', (e) => { const a = e.target.dataset && e.target.dataset.act; if (a && acts[a]) acts[a](); });
      const upd = () => { const sk = ed.sk; card.hidden = !(sk.slots.length === 0 && sk.bones.length <= 1 && !Object.keys(ed.project.images).length && (!ed.project.skeletons || ed.project.skeletons.length < 2)); };
      ed.on('change', upd); ed.on('loaded', upd); upd();
    },
    async startup() {
      if (A.CLI && A.CLI.enabled) { IO.load(Model.newProject()); window.__alikeReady = true; return; } // hidden command-line worker
      if (window.alikeNative) {
        window.alikeNative.onOpenFile(async (p) => { try { const r = await window.alikeNative.read(p); IO.load(r.text); IO.nativePath = /\.alike$/i.test(p) ? p : null; } catch (e) { UI.alert('Open failed', e.message); } });
        const pending = await window.alikeNative.pendingOpen();
        if (pending) { try { const r = await window.alikeNative.read(pending); IO.load(r.text); IO.nativePath = /\.alike$/i.test(pending) ? pending : null; return; } catch (e) { UI.alert('Open failed', e.message); } }
      }
      const saved = await IO.loadAutosave();
      if (saved && saved.json) {
        const when = new Date(saved.when).toLocaleString();
        const r = await UI.modal('Welcome back', h('div', null, 'An autosaved project from ' + when + ' was found.'), [['Start empty', 'empty'], ['Restore', 'restore', true]]);
        if (r === 'restore') { try { IO.load(saved.json); ed.dirty = true; return; } catch (e) { UI.toast('Autosave could not be restored'); } }
      }
      IO.load(Model.newProject()); // start empty (File → Open example project shows the sample character)
    },
    advance(dt) {
      if (!(ed.playing && ed.mode === 'animate' && ed.anim)) return;
      const an = ed.anim, dur = Model.animDuration(an);
      if (dur <= 0) { ed.playing = false; return; }
      const prev = ed.time; let t = prev + dt * ed.speed;
      const evs = [];
      const pose = ed.pose || new A.Pose(ed.project);
      if (t >= dur) {
        if (ed.loop) { pose.collectEvents(an, prev, dur, evs); t = t % dur; pose.collectEvents(an, -1, t, evs); }
        else { pose.collectEvents(an, prev, dur, evs); t = dur; ed.playing = false; }
      } else pose.collectEvents(an, prev, t, evs);
      if (evs.length) ed.emit('events', evs);
      ed.setTime(t, true);
    },

    /* ---------------- chrome ---------------- */
    buildMenubar(el) {
      const menus = {
        File: () => [
          { label: 'New project', key: 'Ctrl+N', action: () => IO.newProject() },
          { label: 'Open…', key: 'Ctrl+O', action: () => IO.open() },
          { label: 'New skeleton…', action: () => A.Skeletons.add() },
          { label: 'Import skeletons from project…', action: () => A.Skeletons.importDialog() },
          '-',
          { label: 'Open example project (Pip)', action: async () => { if (ed.dirty && !(await UI.confirm('Open demo', 'Discard unsaved changes?'))) return; IO.handle = null; IO.load(A.Demo.create()); } },
          '-',
          { label: 'Save', key: 'Ctrl+S', action: () => IO.save() },
          { label: 'Save as…', key: 'Ctrl+Shift+S', action: () => IO.save(true) },
          '-',
          { label: 'Import images…', action: async () => Act.importImageFiles(await Act.pickFiles(A.Formats.IMAGE_ACCEPT)) },
          { label: 'Import image folder…', action: async () => Act.importImageFiles(await Act.pickFiles('', true, true)) },
          { label: 'Import images as slots…', action: async () => Act.importImageFiles(await Act.pickFiles(A.Formats.IMAGE_ACCEPT), { toSkeleton: true }) },
          { label: 'Import Photoshop PSD…', action: async () => { const f = await Act.pickFiles('.psd,.psb', false); if (f && f[0]) A.PSD.importPSD(f[0]); } },
          { label: 'Import audio…', action: async () => A.Audio.importFiles(await Act.pickFiles(A.Formats.AUDIO_ACCEPT, true)) },
          window.alikeNative && window.alikeNative.watchImages
            ? { label: A.ImageSync.folder() ? 'Images folder: ' + A.ImageSync.folder().split(/[\\/]/).pop() + ' (change…)' : 'Link images folder (live updates)…', action: () => A.ImageSync.link() }
            : { label: 'Reload images from folder…', action: () => A.ImageSync.browserReload() },
          ...(A.ImageSync.folder() ? [{ label: 'Unlink images folder', action: () => A.ImageSync.unlink() }, { label: 'Reload images now', action: () => A.ImageSync.sync(false) }] : []),
          '-',
          { label: 'Import data (.json / .alkb / Spine JSON)…', action: () => A.Importer.dialog() },
          { label: 'Import project (skeletons)…', action: () => A.Skeletons.importDialog() },
          '-',
          { label: 'Export…', key: 'Ctrl+E', action: () => IO.exportDialog() },
          { label: 'Export HTML page…', action: () => IO.exportDialog('html') },
          { label: 'Package project (.zip)…', action: () => IO.packageProject() },
          { label: 'Export runtime data + atlas', action: () => IO.exportRuntime() },
          { label: 'Export GIF…', action: () => IO.exportDialog('gif') },
          { label: 'Export project images (.zip)', action: () => IO.exportImages() },
          '-',
          { label: 'Texture Packer…', action: () => A.TexPack.packerDialog() },
          { label: 'Texture Unpacker…', action: () => A.TexPack.unpackerDialog() },
        ],
        Edit: () => [
          { label: 'Undo' + (ed.undoStack.length ? ' ' + ed.undoStack[ed.undoStack.length - 1].label : ''), key: 'Ctrl+Z', action: () => ed.undo(), disabled: !ed.undoStack.length },
          { label: 'Redo', key: 'Ctrl+Y', action: () => ed.redo(), disabled: !ed.redoStack.length },
          '-',
          { label: 'Rename', key: 'F2', action: () => Act.renameRef(ed.primary()), disabled: !ed.primary() },
          { label: 'Duplicate', key: 'Ctrl+D', action: () => Act.duplicateSelection() },
          { label: 'Delete', key: 'Del', action: () => Act.deleteSelection() },
          '-',
          { label: 'Problems…', action: () => A.Problems.show() },
          '-',
          { label: 'Select all bones', key: 'Ctrl+A', action: () => ed.selectMany(ed.sk.bones.map((b) => ({ k: 'bone', n: b.name }))) },
          { label: 'Deselect', key: 'Esc', action: () => ed.select(null) },
          '-',
          { label: 'New', sub: [
            { label: 'Bone', action: () => Act.newBone() }, { label: 'Slot', action: () => Act.newSlot() },
            { label: 'IK constraint', action: () => Act.newConstraint('ik') }, { label: 'Transform constraint', action: () => Act.newConstraint('transform') },
            { label: 'Path constraint', action: () => Act.newConstraint('path') }, { label: 'Physics constraint', action: () => Act.newConstraint('physics') },
            { label: 'Slider constraint', action: () => Act.newConstraint('slider') }, { label: 'Skin', action: () => Act.newSkin() },
            { label: 'Event', action: () => Act.newEvent() }, { label: 'Animation', action: () => Act.newAnimation() }] },
        ],
        View: () => [
          ...[['bones', 'Bones'], ['images', 'Images'], ['meshes', 'Mesh wireframes'], ['bboxes', 'Bounding boxes'], ['clipping', 'Clipping'], ['paths', 'Paths'], ['points', 'Points'], ['names', 'Bone names'], ['grid', 'Grid']]
            .map(([k, l]) => ({ label: l, checked: ed.view[k], action: () => { ed.view[k] = !ed.view[k]; this.buildHud(document.getElementById('vpHud')); } })),
          '-',
          { label: 'Bone size…', action: () => this.boneSizeDialog() },
          { label: 'Rotate bone icons with bones', checked: ed.view.iconRotation !== false, action: () => { ed.view.iconRotation = ed.view.iconRotation === false; } },
          { label: 'Show pinned skins with the active skin', checked: ed.view.pinnedSkins, action: () => { ed.view.pinnedSkins = !ed.view.pinnedSkins; ed.physStore = {}; ed.changed('values'); } },
          { label: 'Tree shows attachments of', sub: [['all', 'All skins'], ['active', 'Active skin only'], ['pinned', 'Active + pinned skins only']].map(([k, l]) => ({ label: l, checked: ed.view.treeSkins === k, action: () => { ed.view.treeSkins = k; A.Tree.render(); } })) },
          { label: 'Audio waveforms in the timeline', checked: ed.view.waveforms, action: () => { ed.view.waveforms = !ed.view.waveforms; TL.dirty = true; } },
          '-',
          { label: 'Frame all', key: 'F', action: () => VP.frameAll() },
          { label: 'Snapping (grid / angle / scale)', checked: ed.snap.on, action: () => { ed.snap.on = !ed.snap.on; this.buildHud(document.getElementById('vpHud')); } },
          { label: 'Snap settings…', action: () => this.snapDialog() },
          { label: 'Compensate children (setup)', checked: ed.compensate.children, action: () => { ed.compensate.children = !ed.compensate.children; this.buildHud(document.getElementById('vpHud')); } },
          { label: 'Compensate images (setup)', checked: ed.compensate.images, action: () => { ed.compensate.images = !ed.compensate.images; this.buildHud(document.getElementById('vpHud')); } },
          { label: 'Reference image…', action: () => this.referenceDialog() },
          { label: 'Zoom 100%', key: '1', action: () => { VP.cam.zoom = 1; } },
          { label: 'Physics simulation', checked: ed.physics, action: () => { ed.physics = !ed.physics; ed.physStore = {}; this.buildHud(document.getElementById('vpHud')); } },
          '-',
          { label: 'Light theme', checked: document.documentElement.dataset.theme === 'light', action: () => this.setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light') },
        ],
        Animation: () => [
          { label: 'Setup mode', key: 'Tab', checked: ed.mode === 'setup', action: () => ed.setMode('setup') },
          { label: 'Animate mode', key: 'Tab', checked: ed.mode === 'animate', action: () => ed.setMode('animate') },
          '-',
          { label: 'Play / pause', key: 'Space', action: () => TL.togglePlay(), disabled: ed.mode !== 'animate' },
          { label: 'Key selected / changed', key: 'K', action: () => Act.keySelected(), disabled: ed.mode !== 'animate' },
          { label: 'Key constrained values', key: 'Shift+K', action: () => Act.keyConstrained(), disabled: ed.mode !== 'animate' },
          { label: 'Bake constrained motion…', action: () => Act.bakeDialog(), disabled: ed.mode !== 'animate' },
          { label: 'Auto key', checked: ed.autoKey, action: () => { ed.autoKey = !ed.autoKey; TL.buildBar(); } },
          { label: 'Onion skin (ghosts)', key: 'G', checked: ed.ghost.on, action: () => { ed.ghost.on = !ed.ghost.on; TL.buildBar(); } },
          { label: 'Key draw order', action: () => ed.keyDrawOrder(), disabled: ed.mode !== 'animate' },
          '-',
          { label: 'Preview window (tracks & mixing)', key: 'P', checked: A.Preview.open, action: () => A.Preview.toggle() },
          { label: 'Keys', sub: TL.keyToolsMenu() },
          '-',
          { label: 'New animation', action: () => Act.newAnimation() },
          { label: 'Fit timeline', action: () => TL.fit() },
        ],
        Help: () => [
          { label: 'Tutorial', key: 'F1', action: () => A.Tutorial.show() },
          { label: 'Keyboard shortcuts', key: '?', action: () => this.shortcuts() },
          ...(window.alikeNative && window.alikeNative.openResource ? [
            { label: 'Show engine plug-ins (Unity, Godot)', action: () => window.alikeNative.openResource('engines') },
            { label: 'Show web runtime (alike-web.js, player)', action: () => window.alikeNative.openResource('runtime') }] : []),
          { label: 'Feature guide', action: () => this.guide() },
          { label: 'Problems…', action: () => A.Problems.show() },
          '-',
          { label: 'About Alike Studio', action: () => this.about() },
        ],
      };
      el.innerHTML = '';
      for (const name in menus) {
        const b = h('button.menu-btn', null, name);
        b.addEventListener('mousedown', (e) => { e.stopPropagation(); const r = b.getBoundingClientRect(); UI.menu(r.left, r.bottom + 2, menus[name]()); });
        b.addEventListener('mouseenter', () => { if (document.querySelector('body > .menu')) { const r = b.getBoundingClientRect(); UI.menu(r.left, r.bottom + 2, menus[name]()); } });
        el.appendChild(b);
      }
    },
    buildMode(el) {
      el.innerHTML = '';
      const s = h('button', { onclick: () => ed.setMode('setup'), title: 'Setup mode (Tab)' }, 'Setup');
      const a = h('button', { onclick: () => ed.setMode('animate'), title: 'Animate mode (Tab)' }, 'Animate');
      el.append(s, a); this.modeBtns = { setup: s, animate: a };
    },
    buildRail(el) {
      el.innerHTML = '';
      this.toolBtns = {};
      for (const [id, key, name, tip, d] of TOOLS) {
        const b = h('button.tool', { title: `${name} (${key})\n${tip}`, onclick: () => { ed.tool = id; ed.emit('tool'); } }, svgIcon(d), h('span.tkey', null, key));
        this.toolBtns[id] = b; el.appendChild(b);
      }
      el.appendChild(h('div.rail-sep'));
      el.appendChild(h('button.tool', { title: 'Frame all (F)', onclick: () => VP.frameAll() }, svgIcon('M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3 M6 6h4v4H6z')));
      el.appendChild(h('button.tool', { title: 'Undo (Ctrl+Z)', onclick: () => ed.undo() }, svgIcon('M5 3L2 6l3 3 M2 6h7a4 4 0 0 1 0 8H6')));
      el.appendChild(h('button.tool', { title: 'Redo (Ctrl+Y)', onclick: () => ed.redo() }, svgIcon('M11 3l3 3-3 3 M14 6H7a4 4 0 0 0 0 8h3')));
    },
    buildHud(el) {
      el.innerHTML = '';
      const tog = (k, label, title) => h('button.hud-btn' + (ed.view[k] ? '.on' : ''), { title, onclick: () => { ed.view[k] = !ed.view[k]; this.buildHud(el); } }, label);
      const skinSel = h('select.hud-sel', { title: 'Active skin' });
      const fill = () => { skinSel.innerHTML = ''; ed.sk.skins.forEach((s) => skinSel.appendChild(h('option', { value: s.name }, 'Skin: ' + s.name))); skinSel.value = ed.skinName; };
      fill(); skinSel.addEventListener('mousedown', fill);
      skinSel.addEventListener('change', () => { ed.project.editor.activeSkin = skinSel.value; ed.physStore = {}; ed.changed('structure'); });
      this.hudSkinFill = () => { if (document.activeElement !== skinSel) fill(); };
      if (!this.hudHooked) { this.hudHooked = true; ed.on('change', (w) => { if (w === 'structure' && this.hudSkinFill) this.hudSkinFill(); }); }
      el.append(
        h('span.mode-badge.' + ed.mode, null, ed.mode === 'setup' ? 'SETUP' : 'ANIMATE'),
        tog('bones', 'Bones', 'Show bones'), tog('images', 'Images', 'Show images'), tog('meshes', 'Mesh', 'Show mesh wireframes'),
        tog('bboxes', 'Boxes', 'Bounding boxes'), tog('paths', 'Paths', 'Paths'), tog('names', 'Names', 'Bone names'),
        h('button.hud-btn' + (ed.physics ? '.on' : ''), { title: 'Physics simulation on/off', onclick: () => { ed.physics = !ed.physics; ed.physStore = {}; this.buildHud(el); } }, 'Physics'),
        h('button.hud-btn' + (ed.snap.on ? '.on' : ''), { title: 'Snapping: translate to ' + ed.snap.move + 'px, rotate to ' + ed.snap.angle + '°, scale to ' + ed.snap.scale, onclick: () => { ed.snap.on = !ed.snap.on; this.buildHud(el); } }, 'Snap'),
        h('button.hud-btn' + (ed.compensate.children ? '.on' : ''), { title: 'Compensate children: moving a bone in Setup mode leaves its child bones in place', onclick: () => { ed.compensate.children = !ed.compensate.children; this.buildHud(el); } }, 'Keep children'),
        h('button.hud-btn' + (ed.compensate.images ? '.on' : ''), { title: 'Compensate images: moving a bone in Setup mode leaves its attachments in place', onclick: () => { ed.compensate.images = !ed.compensate.images; this.buildHud(el); } }, 'Keep images'),
        skinSel,
      );
    },
    onMode() {
      document.body.dataset.mode = ed.mode;
      for (const k in this.modeBtns) this.modeBtns[k].classList.toggle('on', k === ed.mode);
      this.buildHud(document.getElementById('vpHud'));
      TL.resize(); setTimeout(() => { TL.resize(); VP.resize(); TL.fit(); }, 30);
    },
    onTool() { for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', k === ed.tool); document.getElementById('viewport').dataset.tool = ed.tool; },
    setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('alike-theme', t); } catch (e) { /* ignore */ } TL.dirty = true; },
    updateStatus() {
      const m = VP.mouse, p = ed.primary();
      const sel = this.breadcrumbs(p) + (ed.sel.length > 1 ? ` (+${ed.sel.length - 1})` : '');
      const title = (ed.dirty ? '• ' : '') + (ed.project.name || 'Untitled') + ' — Alike Studio';
      if (document.title !== title) { document.title = title; if (window.alikeNative) window.alikeNative.setTitle(title); }
      const tool = TOOLS.find((t) => t[0] === ed.tool);
      const msg = this.lastStatus && performance.now() - this.lastStatusT < 4000 ? this.lastStatus : tool ? tool[3] : '';
      this.status.textContent = '';
      this.status.append(
        h('span.st-mode.' + ed.mode, null, ed.mode === 'setup' ? 'Setup' : 'Animate'),
        h('span', null, 'x ' + M.round(m.wx, 1) + '  y ' + M.round(m.wy, 1)),
        h('span', null, Math.round(VP.cam.zoom * 100) + '%'),
        h('span', null, sel),
        h('span.st-msg', null, msg),
        h('span.st-right', null, ed.dirty ? '● unsaved' : 'saved'),
      );
    },

    breadcrumbs(p) {
      if (!p) return 'nothing selected';
      const sk = ed.sk, chain = (bn) => { const out = []; let b = Model.bone(sk, bn); while (b) { out.unshift(b.name); b = Model.bone(sk, b.parent); } return out; };
      switch (p.k) {
        case 'bone': return chain(p.n).join(' › ');
        case 'slot': { const s = Model.slot(sk, p.n); return (s ? chain(s.bone).join(' › ') + ' › ' : '') + '[' + p.n + ']'; }
        case 'att': { const s = Model.slot(sk, p.slot); return (s ? chain(s.bone).join(' › ') + ' › ' : '') + '[' + p.slot + '] › ' + p.n + (p.skin !== 'default' ? ' (' + p.skin + ')' : ''); }
        case 'con': return 'Constraints › ' + p.n;
        case 'skin': return 'Skins › ' + p.n;
        case 'anim': return 'Animations › ' + p.n;
        case 'event': return 'Events › ' + p.n;
        case 'image': return 'Images › ' + p.n;
        case 'audio': return 'Audio › ' + p.n;
      }
      return p.n || p.k;
    },
    async about() {
      const ver = window.alikeNative ? await window.alikeNative.version() : A.VERSION;
      UI.alert('About', h('div.about', null, h('img', { src: 'assets/icon.png', alt: '' }), h('div', null,
        h('h2', null, 'Alike Studio'),
        h('p', null, 'Version ' + ver + (window.alikeNative ? ' · desktop' : ' · browser')),
        h('p', null, '2D skeletal animation editor: bones, slots, skins, meshes and weights, IK / transform / path / physics / slider constraints, dopesheet and bezier graph editor, multi-track preview, PSD import, event audio, and runtimes for the web, Unity and Godot.'),
        h('p', null, 'Name, icon and this text are placeholders. Replace assets/icon.* and edit About in js/app.js to rebrand.'),
        h('p', null, '© 2026 Alike. All rights reserved.'))));
    },
    async snapDialog() {
      const s = ed.snap;
      await UI.alert('Snapping', h('div.form', null,
        UI.check('Snapping on', () => s.on, (v) => (s.on = v)),
        UI.num('Translate grid', () => s.move, (v) => (s.move = Math.max(0.1, v)), { step: 0.5, prec: 1, suffix: 'px' }),
        UI.num('Rotate step', () => s.angle, (v) => (s.angle = Math.max(0.1, v)), { step: 0.5, prec: 1, suffix: '°' }),
        UI.num('Scale step', () => s.scale, (v) => (s.scale = Math.max(0.001, v)), { step: 0.01, prec: 3 }),
        UI.note('Shift still forces 15° steps when rotating.')));
      this.buildHud(document.getElementById('vpHud'));
    },
    async boneSizeDialog() {
      await UI.alert('Bone display', h('div.form', null,
        UI.num('Bone icon size', () => ed.view.boneSize || 1, (v) => { ed.view.boneSize = M.clamp(v, 0.25, 4); }, { step: 0.05, prec: 2, suffix: '×' }),
        UI.check('Rotate icons with bones', () => ed.view.iconRotation !== false, (v) => { ed.view.iconRotation = v; }),
        UI.note('Bones with zero length are drawn as icons. Pick each bone\'s icon shape in its properties.')));
    },
    async referenceDialog() {
      const pe = ed.project.editor; const r = pe.reference = pe.reference || { show: true, opacity: 0.5, scale: 1, x: 0, y: 150, data: null };
      await UI.alert('Reference image', h('div.form', null,
        UI.note('A tracing image drawn behind everything in the viewport. It is saved with the project but never exported.'),
        UI.row(UI.button(r.data ? 'Replace image…' : 'Choose image…', async () => { const f = await Act.pickFiles(A.Formats.IMAGE_ACCEPT, false); if (!f || !f[0]) return; const rec = await Act.readImageFile(f[0]); if (rec) { r.data = rec.data; r.show = true; ed.changed('values'); } }, { primary: true }),
          UI.button('Remove', () => { pe.reference = null; ed.changed('values'); })),
        UI.check('Show', () => r.show, (v) => (r.show = v)),
        UI.num('Opacity', () => r.opacity, (v) => (r.opacity = M.clamp(v, 0, 1)), { step: 0.01, prec: 2 }),
        UI.num('Scale', () => r.scale, (v) => (r.scale = Math.max(0.01, v)), { step: 0.01, prec: 3 }),
        UI.num2('Center', { label: 'X', get: () => r.x, set: (v) => (r.x = v) }, { label: 'Y', get: () => r.y, set: (v) => (r.y = v) })));
      ed.dirty = true;
    },

    /* ---------------- layout splitters ---------------- */
    splitters() {
      const root = document.documentElement;
      const drag = (el, fn) => el.addEventListener('mousedown', (e) => {
        e.preventDefault(); const mv = (ev) => { fn(ev); VP.resize(); TL.resize(); };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); document.body.classList.remove('resizing'); };
        document.body.classList.add('resizing'); window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
      drag(document.getElementById('splitSide'), (e) => root.style.setProperty('--side-w', M.clamp(window.innerWidth - e.clientX, 240, 700) + 'px'));
      drag(document.getElementById('splitTL'), (e) => { const c = document.getElementById('center').getBoundingClientRect(); root.style.setProperty('--tl-h', M.clamp(c.bottom - e.clientY, 120, c.height - 120) + 'px'); });
      drag(document.getElementById('splitTree'), (e) => { const s = document.getElementById('side').getBoundingClientRect(); root.style.setProperty('--tree-h', M.clamp(((e.clientY - s.top) / s.height) * 100, 15, 85) + '%'); });
    },

    /* ---------------- keyboard ---------------- */
    keys() {
      let spaceUsed = false;
      window.addEventListener('keydown', (e) => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && t.type !== 'checkbox' && t.type !== 'range') return;
        if (document.querySelector('.dlg-bg')) return;
        const k = e.key, ctrl = e.ctrlKey || e.metaKey;
        const tl = this.focus === 'timeline';
        const handled = () => { e.preventDefault(); e.stopPropagation(); };
        if (ctrl) {
          switch (k.toLowerCase()) {
            case 'z': handled(); return e.shiftKey ? ed.redo() : ed.undo();
            case 'y': handled(); return ed.redo();
            case 's': handled(); return IO.save(e.shiftKey);
            case 'o': handled(); return IO.open();
            case 'n': handled(); return IO.newProject();
            case 'e': handled(); return IO.exportDialog();
            case 'd': handled(); return Act.duplicateSelection();
            case 'c': if (tl) { handled(); return TL.copy(); } return;
            case 'v': if (tl) { handled(); return TL.paste(); } return;
            case 'a': handled(); return tl ? TL.selectAll() : ed.selectMany(ed.sk.bones.map((b) => ({ k: 'bone', n: b.name })));
          }
          return;
        }
        if (k === ' ') { handled(); if (!VP.space) { VP.space = true; spaceUsed = false; } return; }
        if (k === 'Tab') { handled(); return ed.setMode(ed.mode === 'setup' ? 'animate' : 'setup'); }
        if (k === 'Delete' || k === 'Backspace') {
          handled();
          if (ed.tool === 'mesh' && ed.vertSel.size && VP.deleteSelectedVerts()) return;
          if ((tl || ed.mode === 'animate') && ed.keySel.size && TL.deleteKeys()) return;
          return Act.deleteSelection();
        }
        if (k === 'Escape') { if (ed.vertSel.size) { ed.vertSel.clear(); return; } ed.keySel.clear(); ed.select(null); ed.tool = 'pose'; ed.emit('tool'); return; }
        if (k === 'F2') { handled(); return Act.renameRef(ed.primary()); }
        if (k === '?') return this.shortcuts();
        if (k === 'F1') { handled(); return A.Tutorial.show(); }
        if (k === ',' || k === 'ArrowLeft' && tl) { handled(); return TL.step(-1); }
        if (k === '.' || k === 'ArrowRight' && tl) { handled(); return TL.step(1); }
        if (k === 'Home') { handled(); return ed.setTime(0); }
        if (k === 'End') { handled(); return ed.anim && ed.setTime(Model.animDuration(ed.anim)); }
        const tool = TOOLS.find((x) => x[1].toLowerCase() === k.toLowerCase());
        if (tool && !e.altKey) { handled(); ed.tool = tool[0]; ed.emit('tool'); return; }
        switch (k.toLowerCase()) {
          case 'k': handled(); return e.shiftKey ? Act.keyConstrained() : Act.keySelected();
          case 'f': handled(); return VP.frameAll();
          case 'g': handled(); ed.ghost.on = !ed.ghost.on; return TL.buildBar();
          case '1': handled(); VP.cam.zoom = 1; return;
          case 'l': handled(); ed.loop = !ed.loop; return TL.buildBar();
          case 'p': handled(); return A.Preview.toggle();
        }
      });
      window.addEventListener('keyup', (e) => {
        if (e.key === ' ') {
          VP.space = false;
          if (!spaceUsed && ed.mode === 'animate' && !(e.target && e.target.tagName === 'INPUT')) TL.togglePlay();
        }
      });
      window.addEventListener('mousedown', () => { if (VP.space) spaceUsed = true; }, true);
    },
    dropZone() {
      window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
      window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
      window.addEventListener('drop', async (e) => {
        document.body.classList.remove('dropping');
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        const files = [...e.dataTransfer.files];
        const proj = files.find((f) => /\.alike$/i.test(f.name));
        if (proj) { try { IO.load(await proj.text()); UI.toast('Opened ' + proj.name); } catch (err) { UI.alert('Open failed', err.message); } return; }
        const data = files.find((f) => /\.(json|alkb|skel)$/i.test(f.name));
        if (data) { // a project saved as .json, or skeleton data to import (with its atlas / images / sounds)
          if (/\.json$/i.test(data.name)) { try { const j = JSON.parse(await data.text()); if (j && j.format === 'alike-project') { IO.load(j); UI.toast('Opened ' + data.name); return; } } catch (err) { /* not JSON we know: try importing */ } }
          return A.Importer.dropImport(files);
        }
        const psd = files.find((f) => /\.(psd|psb)$/i.test(f.name));
        if (psd) return A.PSD.importPSD(psd);
        if (files.some((f) => A.Formats.isAudio(f.name))) { await A.Audio.importFiles(files); if (!files.some((f) => A.Formats.isImage(f.name))) return; }
        const onViewport = document.getElementById('viewport').contains(e.target);
        Act.importImageFiles(files, { toSkeleton: onViewport });
      });
    },

    shortcuts() {
      const rows = [
        ['Tab', 'Toggle Setup / Animate'], ['Q R T S H', 'Pose, Rotate, Translate, Scale, Shear'], ['C', 'Create bones'], ['M', 'Edit mesh / vertices / path'], ['W', 'Paint weights'],
        ['Space', 'Play / pause (hold + drag to pan)'], [', .', 'Previous / next frame'], ['Home / End', 'First / last frame'], ['K', 'Key changed or selected'], ['G', 'Onion skin'], ['L', 'Loop'],
        ['F', 'Frame all'], ['1', 'Zoom 100%'], ['Wheel', 'Zoom (viewport) · Scroll (timeline)'], ['Ctrl+Wheel', 'Zoom timeline'], ['Middle / right drag', 'Pan'],
        ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+D', 'Duplicate'], ['F2', 'Rename'], ['Del', 'Delete selection / keys / vertices'], ['Ctrl+C / Ctrl+V', 'Copy / paste keys (timeline)'],
        ['P', 'Preview window (multi-track mixing)'], ['Shift+K', 'Key constrained values (after IK / physics)'], ['Alt+drag selection ends', 'Stretch keys (dopesheet bracket)'],
        ['Ctrl+S', 'Save'], ['Ctrl+O', 'Open'], ['Ctrl+E', 'Export'], ['Shift / Ctrl+click', 'Add to selection'], ['Alt+click image', 'Select attachment in Animate mode'],
      ];
      UI.alert('Keyboard shortcuts', h('table.keys', null, ...rows.map(([a, b]) => h('tr', null, h('td', null, h('kbd', null, a)), h('td', null, b)))));
    },
    guide() {
      const items = [
        ['Setup vs Animate', 'Setup mode edits the rest pose: bones, slots, attachments and constraints. Animate mode records changes as keys on the active animation (Auto key on), or leaves them orange until you press K.'],
        ['Bones', 'Create tool (C): drag in the viewport to add a child of the selected bone. Drag bones in the tree to re-parent (world position is kept). Inherit rotation / scale / reflection per bone.'],
        ['Slots & draw order', 'Slots hold attachments and set color, tint-black (dark) color and blend mode. Reorder in the Draw Order section or with Front/Back buttons; key draw order in Animate mode.'],
        ['Draw order folders', 'Select slots, then New → Draw order folder (or right-click → Draw order folder). A folder keeps its slots together. In Animate mode, dragging slots inside a folder keys only that folder, so folders keyed in different animations play together on different tracks. Each Preview track has a Draw order switch.'],
        ['Folders', 'Right-click Animations, Skins, Events or Constraints → New folder; drag items onto a folder or use Move to folder. The folder is part of the name ("run/fast"), also in exported data. Folders can be renamed, duplicated with everything in them, or deleted.'],
        ['Several skeletons', 'File → New skeleton or Import skeletons from project. Click a skeleton row to edit it; its eye shows it dimmed while you edit another. Images and sounds are shared; export one skeleton or all of them.'],
        ['Attachments', 'Region (image), Mesh, Linked mesh, Bounding box, Clipping, Path and Point. Image sequences make frame-by-frame attachments.'],
        ['Meshes & weights', 'Convert a region to a mesh, trace its outline (Uniform adds even interior vertices so it bends smoothly), generate interior vertices, then bind bones and paint weights. Weld joins meshes that touch: their shared vertices get one position and the same weights. In Animate mode drag vertices to make deform keys.'],
        ['Constraints', 'IK (1–2 bones, softness, stretch/compress), Transform (world or local, relative), Path (bones follow a bezier path), Physics (spring inertia, damping, wind, gravity), Slider (a bone drives an animation). Order matters: earlier constraints apply first.'],
        ['Timeline', 'Dopesheet shows keys per item and property; drag to retime, box-select, copy/paste. Graph view shows the curves: drag keys and bezier handles; presets in the toolbar.'],
        ['Skins', 'Skins swap attachment sets (try the "party" skin on Pip). Bones/constraints marked Skin required only work when the skin lists them.'],
        ['Preview', 'Animation → Preview window (P): play several tracks at once, crossfade with mix durations, queue animations, layer additively, hear event sounds.'],
        ['Key tools', 'Select keys, then drag the orange bracket ends above the dopesheet to stretch them, or use the Keys menu: offset (with wrap), stretch, reverse, insert/remove frames.'],
        ['Photoshop', 'File → Import Photoshop PSD (or drop a .psd): each layer becomes a slot + image, groups become bones. Tags: [ignore], [bone], [merge].'],
        ['Audio', 'File → Import audio, then pick the sound on an event. Sounds play during playback and in Preview with the key volume/balance; their waveforms show under the event keys in the timeline.'],
        ['Import data', 'File → Import data: bring exported skeleton data back for editing — Alike .json/.alkb, or Spine 3.8–4.x JSON — with its .atlas and page images (or its images folder). Opens as a new project or as another skeleton.'],
        ['Texture Packer', 'File → Texture Packer packs any images or folders into atlas pages, with an .atlas text file other engines read, or Alike atlas JSON. Texture Unpacker turns an atlas back into separate images.'],
        ['Images folder', 'Desktop app: File → Link images folder. Every image there is loaded, and when you save an image again in your paint program it updates in Alike right away.'],
        ['Web components', 'runtime/alike-web.js defines the <alike-skeleton> tag: <alike-skeleton src="hero.json" animation="walk" skin="a,b">. Dozens can share one page. Export HTML page can also use it.'],
        ['Command line', 'alike-cli -i project.alike -o out (installed next to Alike.exe; or Alike.exe --cli …). Folders of projects export in parallel; --help lists every option.'],
        ['Export', 'File → Export: runtime JSON and/or ALKB binary with a configurable atlas (max size, padding, rotation, whitespace stripping, scale, premultiplied alpha), PNG frames, sprite sheet, GIF or WebM. Unity and Godot plug-ins live in engines/.'],
      ];
      UI.alert('Feature guide', h('div.guide', null, ...items.map(([a, b]) => h('div', null, h('b', null, a), h('p', null, b)))));
    },
  };

  A.VERSION = '4.3.0';
  A.App = App;
  try { const t = localStorage.getItem('alike-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
  window.addEventListener('DOMContentLoaded', () => App.init());
})(window.A);
