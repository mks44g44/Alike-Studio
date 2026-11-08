/* Alike Studio — project files, runtime export, atlas packing, image/video export */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, ed = A.ed, UI = A.UI, Act = A.Act, h = UI.h;

  /* ---------- minimal ZIP writer (store, no compression) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) { // [{name, data: Uint8Array}]
    const now = new Date(), DOS_T = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), DOS_D = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint16(10, DOS_T, true); lh.setUint16(12, DOS_D, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(12, DOS_T, true); ch.setUint16(14, DOS_D, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + sz;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  const blobToU8 = async (b) => new Uint8Array(await b.arrayBuffer());
  const canvasBlob = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));
  const dataUrlToU8 = (d) => { const b = atob(d.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const safe = (s) => (s || 'untitled').replace(/[^\w\-. ]+/g, '_');

  const IO = {
    handle: null,
    zip, download,

    serialize() { return JSON.stringify(A.Skeletons ? A.Skeletons.forSave() : ed.project); },
    load(json) {
      const p = typeof json === 'string' ? JSON.parse(json) : json;
      if (!p || !p.skeleton || !p.skeleton.bones) throw new Error('Not an Alike project');
      p.editor = p.editor || { activeSkin: 'default', activeAnim: null };
      p.images = p.images || {};
      p.audio = p.audio || {};
      if (A.Skeletons) A.Skeletons.onLoad(p);
      ed.project = p; ed.images = {}; ed.syncImages();
      ed.sel = []; ed.undoStack = []; ed.redoStack = []; ed.keySel.clear(); ed.vertSel.clear(); ed.clearOverrides(); ed.physStore = {};
      ed.time = 0; ed.playing = false; ed.dirty = false;
      if (ed.mode === 'animate' && !ed.anim) ed.mode = 'setup';
      ed.emit('mode'); ed.emit('anim'); ed.changed('structure'); ed.emit('selection'); ed.dirty = false;
      ed.emit('loaded', p);
      setTimeout(() => A.VP.frameAll(), 50);
    },
    async newProject() {
      if (ed.dirty && !(await UI.confirm('New project', 'Discard unsaved changes?'))) return;
      this.handle = null; this.nativePath = null;
      IO.load(Model.newProject());
    },
    async save(as = false) {
      const name = safe(ed.project.name) + '.alike';
      if (window.alikeNative) { // desktop app: real file dialogs, save in place
        const p = await window.alikeNative.save(name, IO.serialize(), as ? null : this.nativePath);
        if (!p) return;
        this.nativePath = p; ed.dirty = false; UI.toast('Saved ' + p.split(/[\\/]/).pop()); return;
      }
      const blob = new Blob([IO.serialize()], { type: 'application/json' });
      if (window.showSaveFilePicker) {
        try {
          if (!this.handle || as) this.handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Alike project', accept: { 'application/json': ['.alike'] } }] });
          const w = await this.handle.createWritable(); await w.write(blob); await w.close();
          ed.dirty = false; UI.toast('Saved ' + this.handle.name); return;
        } catch (e) { if (e.name === 'AbortError') return; console.warn(e); }
      }
      IO.download(blob, name); ed.dirty = false; UI.toast('Downloaded ' + name);
    },
    async open() {
      if (ed.dirty && !(await UI.confirm('Open project', 'Discard unsaved changes?'))) return;
      if (window.alikeNative) {
        const r = await window.alikeNative.open(); if (!r) return;
        try { IO.load(r.text); this.nativePath = /\.alike$/i.test(r.path) ? r.path : null; UI.toast('Opened ' + r.path.split(/[\\/]/).pop()); } catch (e) { UI.alert('Open failed', e.message); }
        return;
      }
      if (window.showOpenFilePicker) {
        try {
          const [hd] = await window.showOpenFilePicker({ types: [{ description: 'Alike project', accept: { 'application/json': ['.alike', '.json'] } }] });
          const f = await hd.getFile(); IO.load(await f.text()); this.handle = hd; UI.toast('Opened ' + f.name); return;
        } catch (e) { if (e.name === 'AbortError') return; if (e.message && e.message.includes('Alike')) return UI.alert('Open failed', e.message); }
      }
      const files = await Act.pickFiles('.alike,.json', false);
      if (!files || !files[0]) return;
      try { IO.load(await files[0].text()); this.handle = null; UI.toast('Opened ' + files[0].name); } catch (e) { UI.alert('Open failed', e.message); }
    },

    /* ---------- runtime export (JSON / ALKB binary + atlas + audio) ---------- */
    audioExt(rec) { const m = /^data:audio\/([\w.+-]+)/.exec(rec.data || ''); const t = m ? m[1] : 'mpeg'; return { mpeg: 'mp3', mp3: 'mp3', wav: 'wav', 'x-wav': 'wav', wave: 'wav', ogg: 'ogg', webm: 'webm', aac: 'aac', mp4: 'm4a', 'x-m4a': 'm4a', flac: 'flac' }[t] || t; },
    runtimeData(atlas, audio, src, o = {}) {
      src = src || { name: ed.project.name, skeleton: ed.project.skeleton };
      const sk = Model.clone(src.skeleton);
      Model.eachAttachment(sk, (a) => { delete a.uvMap; });
      if (o.cleanUp) sk.animations.forEach((an) => Model.cleanUpAnimation(sk, an));
      if (o.nonessential === false) { // editor-only display data
        sk.bones.forEach((b) => { delete b.color; delete b.icon; });
        Model.eachAttachment(sk, (a) => { if (['bbox', 'clip', 'path', 'point'].includes(a.type)) delete a.color; });
        delete sk.drawFolders; sk.slots.forEach((s) => { if (!sk.animations.some((an) => an.timelines.some((t) => t.type === 'drawFolder' && t.target === s.folder))) delete s.folder; });
      }
      delete sk.folders; // tree folders are editor-only (their path is already part of each name)
      return { format: 'alike-runtime', version: 2, name: src.name, skeleton: sk, atlas: atlas || null, audio: audio || [],
        images: Object.keys(ed.project.images).map((n) => ({ name: n, w: ed.project.images[n].w, h: ed.project.images[n].h })) };
    },
    exportSettings() {
      const e = ed.project.editor;
      e.export = Object.assign({ data: 'both', pretty: false, audio: true, atlas: Object.assign({}, A.Atlas.DEFAULTS) }, e.export || {});
      e.export.atlas = Object.assign({}, A.Atlas.DEFAULTS, e.export.atlas || {});
      return e.export;
    },
    /* every runtime file for one skeleton: [{ name, data: Uint8Array }] (used by the Export dialog and the command line) */
    async buildRuntime(o, src) {
      src = src || { name: ed.project.name, skeleton: ed.project.skeleton };
      const proj = { skeleton: src.skeleton, images: ed.project.images, audio: ed.project.audio };
      const base = safe(src.name);
      const files = [];
      let atlas = null, packInfo = null;
      if (Object.keys(ed.project.images).length) {
        let pages = [], tags = [];
        if (o.atlas.perSkin) { // one atlas per skin (shared images can repeat across skins)
          packInfo = { pages: [], warnings: [], packed: 0, aliases: 0 };
          for (const skin of src.skeleton.skins) {
            const only = A.Atlas.skinImages(skin); if (!only.size) continue;
            const r = A.Atlas.pack(proj, ed.images, Object.assign({}, o.atlas, { only }));
            r.pages.forEach((p, i) => { pages.push(p); tags.push({ skin: skin.name, file: base + '_' + skin.name.replace(/[^\w-]+/g, '_') + (r.pages.length > 1 ? '_' + (i + 1) : '') + '.png' }); });
            packInfo.warnings.push(...r.warnings); packInfo.packed += r.packed; packInfo.aliases += r.aliases;
          }
          packInfo.pages = pages;
        } else {
          packInfo = A.Atlas.pack(proj, ed.images, o.atlas);
          pages = packInfo.pages;
          tags = pages.map((p, i) => ({ file: base + (pages.length > 1 ? '_' + (i + 1) : '') + '.png' }));
        }
        atlas = { scale: o.atlas.scale, pma: !!o.atlas.pma, filter: o.atlas.filter || 'linear', perSkin: !!o.atlas.perSkin,
          pages: pages.map((p, i) => Object.assign({ w: p.w, h: p.h, regions: p.regions }, tags[i])) };
        for (let i = 0; i < pages.length; i++) files.push({ name: atlas.pages[i].file, data: await blobToU8(await canvasBlob(pages[i].canvas)) });
      }
      const audio = [];
      if (o.audio && ed.project.audio) for (const n in ed.project.audio) {
        const rec = ed.project.audio[n], file = 'audio/' + n + '.' + IO.audioExt(rec);
        audio.push({ name: n, file }); files.push({ name: file, data: dataUrlToU8(rec.data) });
      }
      const data = IO.runtimeData(atlas, audio, src, o);
      if (o.data === 'json' || o.data === 'both') files.unshift({ name: base + '.json', data: new TextEncoder().encode(JSON.stringify(data, null, o.pretty ? 1 : 0)) });
      if (o.data === 'binary' || o.data === 'both') files.unshift({ name: base + '.alkb', data: A.Binary.encode(data) });
      files.push({ name: 'README.txt', data: new TextEncoder().encode([
        'Alike runtime export', '',
        (o.data !== 'binary' ? base + '.json  skeleton data (Alike JSON v2)\n' : '') + (o.data !== 'json' ? base + '.alkb  same data in the compact ALKB binary format\n' : ''),
        atlas ? atlas.pages.map((p) => p.file).join(', ') + '  texture atlas pages (' + (atlas.pma ? 'premultiplied alpha' : 'straight alpha') + ', scale ' + atlas.scale + ')' : '',
        audio.length ? 'audio/  event sounds' : '', '',
        'Unity: copy engines/unity into your project, drop these files into Assets (rename .alkb → .alkb is fine; the importer handles it).',
        'Godot 4: copy engines/godot/addons/alike into res://addons, enable the plugin, add an AlikeSkeleton2D node.',
        'Web: runtime/player.html in Alike Studio.',
      ].join('\n')) });
      return { files, data, packInfo };
    },
    /* Export dialog: the active skeleton, or every skeleton in the project (one folder each) */
    async exportRuntime(optsIn) {
      const o = optsIn || IO.exportSettings();
      const list = o.skeletons === 'all' ? A.Skeletons.list() : [A.Skeletons.current()];
      const files = []; let r = null;
      for (const src of list) {
        r = await IO.buildRuntime(o, src);
        r.files.forEach((f) => files.push(list.length > 1 ? { name: safe(src.name) + '/' + f.name, data: f.data } : f));
        if (r.packInfo && r.packInfo.warnings.length) UI.alert('Atlas warnings' + (list.length > 1 ? ' (' + src.name + ')' : ''), h('div', null, ...r.packInfo.warnings.map((w) => h('div', null, '• ' + w))));
      }
      const base = list.length > 1 ? safe(A.Skeletons.projectName()) : safe(list[0].name), packInfo = r && r.packInfo;
      IO.download(zip(files), base + '-export.zip');
      UI.toast(`Exported ${base}-export.zip` + (list.length > 1 ? ` · ${list.length} skeletons` : packInfo ? ` · ${packInfo.pages.length} page${packInfo.pages.length === 1 ? '' : 's'}, ${packInfo.packed} images${packInfo.aliases ? ', ' + packInfo.aliases + ' duplicates merged' : ''}` : ''));
      return { files, data: r && r.data, packInfo };
    },
    async previewAtlas(opts) {
      const info = A.Atlas.pack(ed.project, ed.images, opts);
      const wrap = h('div.atlas-preview');
      info.pages.forEach((p, i) => {
        p.canvas.className = 'atlas-page';
        wrap.appendChild(h('div', null, h('div.note', null, `Page ${i + 1}: ${p.w} × ${p.h} · ${Object.keys(p.regions).length} regions`), p.canvas));
      });
      if (info.warnings.length) wrap.appendChild(h('div.note', null, info.warnings.join(' · ')));
      if (info.layoutsTried > 1) wrap.appendChild(h('div.note', null, `Brute force tried ${info.layoutsTried} layouts; total page area ${info.pages.reduce((s, p) => s + p.w * p.h, 0).toLocaleString()} px².`));
      UI.alert('Atlas preview', wrap);
    },
    exportImages() {
      const files = Object.keys(ed.project.images).map((n) => ({ name: 'images/' + n + '.' + A.Formats.extOf(ed.project.images[n].data), data: dataUrlToU8(ed.project.images[n].data) }));
      for (const n in ed.project.audio || {}) files.push({ name: 'audio/' + n + '.' + IO.audioExt(ed.project.audio[n]), data: dataUrlToU8(ed.project.audio[n].data) });
      if (!files.length) return UI.toast('No images');
      IO.download(zip(files), safe(ed.project.name) + '-images.zip');
    },

    /* ---------- rendering frames ---------- */
    bounds(animName, fps) {
      const an = Model.anim(ed.sk, animName);
      const dur = an ? Model.animDuration(an) : 0, n = Math.max(1, Math.round(dur * fps) + 1);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const phys = {};
      for (let i = 0; i < n; i++) {
        const p = new A.Pose(ed.project, ed.skinName); if (an) p.applyAnimation(an, i / fps); p.update(i ? 1 / fps : 0, phys);
        for (const s of p.drawOrder) { const g = p.geometry(s); if (!g || !g.tris) continue; for (let k = 0; k < g.verts.length; k += 2) { x0 = Math.min(x0, g.verts[k]); x1 = Math.max(x1, g.verts[k]); y0 = Math.min(y0, g.verts[k + 1]); y1 = Math.max(y1, g.verts[k + 1]); } }
      }
      if (!isFinite(x0)) return { x0: -100, y0: -100, x1: 100, y1: 100 };
      return { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 };
    },
    async renderFrames(o, onFrame) {
      const an = Model.anim(ed.sk, o.anim);
      const fps = o.fps, dur = an ? Model.animDuration(an) : 0, n = Math.max(1, Math.round(dur * fps) + (o.loop ? 0 : 1));
      const b = IO.bounds(o.anim, fps), sc = o.scale;
      const W = Math.max(2, Math.ceil((b.x1 - b.x0) * sc)), H = Math.max(2, Math.ceil((b.y1 - b.y0) * sc));
      const glc = document.createElement('canvas');
      const r = new A.GLRenderer(glc); r.resize(W / sc, H / sc, sc);
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const c = out.getContext('2d');
      const phys = {};
      for (let i = 0; i < n; i++) {
        const p = new A.Pose(ed.project, o.skin || ed.skinName); if (an) p.applyAnimation(an, i / fps); p.update(i ? 1 / fps : 0, phys);
        r.begin({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, zoom: 1 });
        r.drawPose(p, { images: ed.images });
        c.clearRect(0, 0, W, H);
        if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, W, H); }
        c.drawImage(glc, 0, 0, W, H);
        await onFrame(out, i, n);
      }
      return { W, H, n };
    },
    async exportDialog(kindIn) {
      const set = IO.exportSettings(), at = set.atlas;
      const anims = ed.sk.animations.map((a) => a.name);
      const st = Object.assign({ anim: ed.project.editor.activeAnim || anims[0], fps: ed.fps, scale: 1, bg: '', loop: true, skin: ed.skinName, gifColors: 255 }, set.media || {}, { kind: kindIn || set.kind || 'runtime' });
      if (!anims.includes(st.anim)) st.anim = anims[0];
      const body = h('div.form');
      const app = (...k) => body.append(...k.filter((x) => x != null)); // (append(null) would add the text "null")
      const render = () => {
        A.UI.clearRefreshers();
        body.innerHTML = '';
        app(UI.select('Export', [['runtime', 'Runtime data + atlas (.zip)'], ['html', 'HTML page (self-contained player)'], ['png', 'PNG sequence (.zip)'], ['sheet', 'Sprite sheet (.png)'], ['gif', 'Animated GIF'], ['apng', 'Animated PNG (APNG)'], ['jpg', 'JPEG sequence (.zip)'], ['webm', 'Video (.webm)'], ['mp4', 'Video (.mp4)'], ['images', 'Project images (.zip)']], () => st.kind, (v) => { st.kind = v; render(); }));
        if (st.kind === 'runtime') {
          app(
            ...(A.Skeletons.list().length > 1 ? [UI.select('Skeletons', [['active', 'Active skeleton (' + ed.project.name + ')'], ['all', 'All ' + A.Skeletons.list().length + ' skeletons (one folder each)']], () => set.skeletons || 'active', (v) => (set.skeletons = v))] : []),
            UI.select('Data', [['both', 'JSON + binary'], ['json', 'JSON (.json)'], ['binary', 'Binary (.alkb)']], () => set.data, (v) => (set.data = v)),
            UI.check('Pretty-print JSON', () => set.pretty, (v) => (set.pretty = v)),
            UI.check('Clean up animations (drop keys that change nothing)', () => !!set.cleanUp, (v) => (set.cleanUp = v)),
            UI.check('Nonessential data (bone colors, icons, box colors)', () => set.nonessential !== false, (v) => (set.nonessential = v)),
            UI.check('Include event audio', () => set.audio, (v) => (set.audio = v)),
            h('div.subhead', null, 'Texture atlas'),
            UI.select('Max page size', [256, 512, 1024, 2048, 4096, 8192].map((n) => [String(n), n + ' px']), () => String(at.maxSize), (v) => (at.maxSize = +v)),
            UI.num('Scale', () => at.scale, (v) => (at.scale = M.clamp(v, 0.05, 4)), { step: 0.05, prec: 2 }),
            UI.num('Padding', () => at.padding, (v) => (at.padding = M.clamp(Math.round(v), 0, 32)), { step: 0.2, prec: 0, suffix: 'px' }),
            UI.num('Edge padding', () => at.edge, (v) => (at.edge = M.clamp(Math.round(v), 0, 32)), { step: 0.2, prec: 0, suffix: 'px' }),
            UI.num('Bleed / extrude', () => at.extrude, (v) => (at.extrude = M.clamp(Math.round(v), 0, 8)), { step: 0.2, prec: 0, suffix: 'px' }),
            h('div.checkrow', null,
              UI.check('Power of two', () => at.pot, (v) => (at.pot = v)), UI.check('Square', () => at.square, (v) => (at.square = v)),
              UI.check('Allow rotation', () => at.rotate, (v) => (at.rotate = v)), UI.check('Strip whitespace', () => at.trim, (v) => (at.trim = v)),
              UI.check('Premultiply alpha', () => at.pma, (v) => (at.pma = v)), UI.check('Merge duplicates', () => at.dedupe, (v) => (at.dedupe = v)),
              UI.check('Only used images', () => at.usedOnly, (v) => (at.usedOnly = v)), UI.check('Atlas per skin', () => at.perSkin, (v) => (at.perSkin = v)),
              UI.check('Brute force (slower, smaller pages)', () => at.bruteForce, (v) => (at.bruteForce = v))),
            UI.select('Filtering', [['linear', 'Linear'], ['nearest', 'Nearest (pixel art)']], () => at.filter, (v) => (at.filter = v)),
            UI.row(UI.button('Preview atlas…', () => IO.previewAtlas(at))),
            UI.note('Whitespace is never stripped from images used by meshes (their UVs reach the image edges).'),
          );
        } else if (st.kind === 'html') {
          app(
            UI.select('Page uses', [['player', 'Player with animation and skin controls'], ['component', 'Web component: <alike-skeleton>']], () => set.htmlStyle || 'player', (v) => { set.htmlStyle = v; render(); }),
            UI.select('Animation', anims, () => st.anim, (v) => (st.anim = v)),
            UI.note(set.htmlStyle === 'component' ? 'One self-contained page. The skeleton is an <alike-skeleton> tag; copy runtime/alike-web.js to use the same tag on your own site.' : 'One self-contained page with the runtime, data, atlas and sounds embedded.'),
          );
        } else if (st.kind !== 'images') {
          app(
            UI.select('Animation', anims.concat([['*', '(all animations, one file each)']]), () => st.anim, (v) => (st.anim = v)),
            UI.select('Skin', ed.sk.skins.map((s) => s.name), () => st.skin, (v) => (st.skin = v)),
            UI.num('FPS', () => st.fps, (v) => (st.fps = M.clamp(Math.round(v), 1, 120)), { step: 1, prec: 0 }),
            UI.num('Scale', () => st.scale, (v) => (st.scale = M.clamp(v, 0.05, 8)), { step: 0.05, prec: 2 }),
            UI.check('Loop (skip duplicate last frame)', () => st.loop, (v) => (st.loop = v)),
            UI.text('Background', () => st.bg, (v) => (st.bg = v), { placeholder: st.kind === 'webm' ? '#000000' : 'transparent, or e.g. #202020' }),
            st.kind === 'gif' ? UI.note('GIF uses one shared 255-color palette; fully transparent pixels stay transparent, semi-transparent ones are blended over the background (or dithered to opaque when there is none).') : null,
          );
        }
      };
      render();
      const ok = await UI.modal('Export', body, [['Cancel', false], ['Export', true, true]]);
      if (!ok) return;
      set.kind = st.kind; set.media = { anim: st.anim, fps: st.fps, scale: st.scale, bg: st.bg, loop: st.loop, skin: st.skin };
      if (st.kind === 'runtime') return IO.exportRuntime(set);
      if (st.kind === 'html') return IO.exportHTML(Object.assign({}, set, { anim: st.anim }));
      if (st.anim === '*' && st.kind !== 'images') { // every animation, one file each
        for (const a of ed.sk.animations) await IO.exportMedia(Object.assign({}, st, { anim: a.name }));
        return;
      }
      return IO.exportMedia(st);
    },
    /* PNG sequence / sprite sheet / GIF / WebM / project images for st = { kind, anim, fps, scale, bg, loop, skin } (dialog and command line) */
    async exportMedia(st) {
      if (st.kind === 'images') return IO.exportImages();
      const base = safe(ed.project.name) + '-' + safe(st.anim);
      UI.toast('Rendering…');
      const grab = async (fn) => { const frames = []; const info = await IO.renderFrames(st, async (cv) => { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0); frames.push(c2); }); return fn(frames, info); };
      if (st.kind === 'png') {
        const files = [];
        await IO.renderFrames(st, async (cv, i) => files.push({ name: base + '_' + String(i).padStart(4, '0') + '.png', data: await blobToU8(await canvasBlob(cv)) }));
        IO.download(zip(files), base + '-frames.zip');
      } else if (st.kind === 'sheet') {
        await grab(async (frames, info) => {
          const cols = Math.ceil(Math.sqrt(info.n)), rows = Math.ceil(info.n / cols);
          const sheet = document.createElement('canvas'); sheet.width = cols * info.W; sheet.height = rows * info.H;
          const sc = sheet.getContext('2d'); frames.forEach((f, i) => sc.drawImage(f, (i % cols) * info.W, Math.floor(i / cols) * info.H));
          IO.download(await canvasBlob(sheet), base + `-sheet-${cols}x${rows}.png`);
        });
      } else if (st.kind === 'gif') {
        await grab(async (frames) => {
          const bytes = A.GIF.encode(frames, { delay: 100 / st.fps, loop: 0, background: st.bg || null });
          IO.download(new Blob([bytes], { type: 'image/gif' }), base + '.gif');
        });
      } else if (st.kind === 'apng') {
        await grab(async (frames) => {
          const pngs = []; for (const f of frames) pngs.push(await blobToU8(await canvasBlob(f)));
          IO.download(new Blob([IO.apng(pngs, Math.max(1, Math.round(st.fps)))], { type: 'image/apng' }), base + '.png');
        });
      } else if (st.kind === 'jpg') {
        const files = [];
        await IO.renderFrames(st, async (cv, i) => {
          const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const x = c2.getContext('2d');
          x.fillStyle = st.bg || '#ffffff'; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0); // JPEG has no transparency
          files.push({ name: base + '_' + String(i).padStart(4, '0') + '.jpg', data: await blobToU8(await new Promise((r) => c2.toBlob(r, 'image/jpeg', st.quality || 0.92))) });
        });
        IO.download(zip(files), base + '-frames-jpg.zip');
      } else if (st.kind === 'webm' || st.kind === 'mp4') {
        if (!window.MediaRecorder) return UI.alert('Export', 'Video recording is not supported in this browser.');
        const mimes = st.kind === 'mp4' ? ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m));
        if (!mime) return UI.alert('Export', (st.kind === 'mp4' ? 'MP4' : 'WebM') + ' recording is not supported here. ' + (st.kind === 'mp4' ? 'Use the desktop app or a current Chrome/Edge, or export WebM.' : ''));
        await grab(async (frames, info) => {
          const vc = document.createElement('canvas'); vc.width = info.W + (info.W % 2); vc.height = info.H + (info.H % 2);
          const vx = vc.getContext('2d');
          const stream = vc.captureStream(st.fps), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: st.bitrate || 8000000 });
          const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
          const done = new Promise((r) => (rec.onstop = r));
          rec.start();
          const keepAlpha = st.kind === 'webm' && !st.bg; // WebM can keep transparency when no background is set
          for (let loop = 0; loop < 2; loop++) for (const f of frames) { if (keepAlpha) vx.clearRect(0, 0, vc.width, vc.height); else { vx.fillStyle = st.bg || '#000'; vx.fillRect(0, 0, vc.width, vc.height); } vx.drawImage(f, 0, 0); await new Promise((r) => setTimeout(r, 1000 / st.fps)); }
          rec.stop(); await done;
          IO.download(new Blob(chunks, { type: mime.split(';')[0] }), base + '.' + st.kind);
        });
      }
      UI.toast('Export finished');
    },

    /* frames (PNG files of the same size) → one looping animated PNG */
    apng(pngs, fps) {
      const chunks = (u) => { const out = []; let p = 8; const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); while (p < u.length) { const len = dv.getUint32(p), type = String.fromCharCode(...u.subarray(p + 4, p + 8)); out.push({ type, data: u.subarray(p + 8, p + 8 + len) }); p += 12 + len; } return out; };
      const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
      const chunk = (type, data) => {
        const c = new Uint8Array(12 + data.length), dv = new DataView(c.buffer);
        dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i); c.set(data, 8);
        dv.setUint32(8 + data.length, crc32(c.subarray(4, 8 + data.length))); parts.push(c);
      };
      const be = (vals) => { const b = new Uint8Array(vals.reduce((s, [, n]) => s + n, 0)), dv = new DataView(b.buffer); let o = 0; for (const [v, n] of vals) { if (n === 4) dv.setUint32(o, v); else if (n === 2) dv.setUint16(o, v); else dv.setUint8(o, v); o += n; } return b; };
      const first = chunks(pngs[0]), ihdr = first.find((c) => c.type === 'IHDR').data, dv0 = new DataView(ihdr.buffer, ihdr.byteOffset, 8);
      const W = dv0.getUint32(0), H = dv0.getUint32(4);
      chunk('IHDR', ihdr);
      chunk('acTL', be([[pngs.length, 4], [0, 4]]));
      let seq = 0;
      pngs.forEach((png, i) => {
        chunk('fcTL', be([[seq++, 4], [W, 4], [H, 4], [0, 4], [0, 4], [1, 2], [fps, 2], [1, 1], [0, 1]]));
        for (const c of chunks(png)) if (c.type === 'IDAT') {
          if (i === 0) chunk('IDAT', c.data);
          else { const d = new Uint8Array(4 + c.data.length); new DataView(d.buffer).setUint32(0, seq++); d.set(c.data, 4); chunk('fdAT', d); }
        }
      });
      chunk('IEND', new Uint8Array(0));
      return new Blob(parts, { type: 'image/apng' });
    },

    /* ---------- package project: .alike + images/ + audio/ in one zip ---------- */
    async packageProject() {
      const base = safe(ed.project.name);
      const files = [{ name: base + '/' + base + '.alike', data: new TextEncoder().encode(IO.serialize()) }];
      for (const n in ed.project.images) files.push({ name: base + '/images/' + n + '.' + A.Formats.extOf(ed.project.images[n].data), data: dataUrlToU8(ed.project.images[n].data) });
      for (const n in ed.project.audio || {}) files.push({ name: base + '/audio/' + n + '.' + IO.audioExt(ed.project.audio[n]), data: dataUrlToU8(ed.project.audio[n].data) });
      IO.download(zip(files), base + '-package.zip');
      UI.toast('Packaged project: ' + files.length + ' files');
    },

    /* ---------- HTML export: one self-contained page with the runtime, data and atlas ---------- */
    async exportHTML(set) {
      if (!A.RUNTIME_SRC) return UI.alert('HTML export', 'js/runtime-src.js is missing. Run: node tools/build-bundle.js');
      const o = Object.assign({}, set || IO.exportSettings()); o.atlas = Object.assign({}, o.atlas, { perSkin: false });
      const info = A.Atlas.pack(ed.project, ed.images, o.atlas);
      const atlas = { scale: o.atlas.scale, pma: !!o.atlas.pma, pages: info.pages.map((p) => ({ w: p.w, h: p.h, regions: p.regions, data: p.canvas.toDataURL('image/png') })) };
      const data = IO.runtimeData(null, []);
      const sounds = {}; for (const n in ed.project.audio || {}) sounds[n] = ed.project.audio[n].data;
      const esc = (t) => t.replace(/<\/script/gi, '<\\/script');
      const name = (ed.project.name || 'skeleton').replace(/[<>&]/g, '');
      const R = A.RUNTIME_SRC;
      if (o.htmlStyle === 'component') {
        const files = {}; atlas.pages.forEach((pg, i) => { pg.file = 'page' + i + '.png'; files[pg.file] = pg.data; delete pg.data; });
        data.atlas = atlas; data.audio = Object.keys(sounds).map((n) => ({ name: n, file: 'audio/' + n })); for (const n in sounds) files[n] = sounds[n];
        const anim = (o.anim && Model.anim(ed.sk, o.anim) ? o.anim : (ed.sk.animations[0] || {}).name) || '';
        const attr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title>
<style>html,body{margin:0;min-height:100%;background:#16181d;color:#d9dce2;font:13px system-ui,sans-serif}
.bar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#20232a;flex-wrap:wrap}.bar b{color:#ff8a3d}
alike-skeleton{display:block;width:100%;height:calc(100vh - 48px)}#ev{position:fixed;left:12px;bottom:10px;color:#ffe27a;font-weight:600}</style></head>
<body><div class="bar"><b>${name}</b><select id="anim"></select><span id="skins"></span></div>
<alike-skeleton id="sk" src="#${attr(name)}" animation="${attr(anim)}" skin="${attr(ed.skinName)}"></alike-skeleton><div id="ev"></div>
<script>window.A={};<\/script>
${['math', 'model', 'pose', 'animstate', 'render', 'atlas', 'binary', 'element'].map((k) => '<script>' + esc(R[k]) + '<\/script>').join('\n')}
<script>
AlikeWeb.register(${esc(JSON.stringify(name))}, ${esc(JSON.stringify(data))}, ${esc(JSON.stringify(files))});
const el = document.getElementById('sk');
el.ready.then(() => {
  const sk = el.skeleton, $ = (i) => document.getElementById(i);
  $('anim').innerHTML = sk.animations.map((a) => '<option' + (a.name === el.getAttribute('animation') ? ' selected' : '') + '>' + a.name + '</option>').join('');
  $('anim').onchange = () => el.setAttribute('animation', $('anim').value);
  const cur = el.getAttribute('skin').split(',');
  $('skins').innerHTML = 'Skins: ' + sk.skins.filter((s) => s.name !== '__combined').map((s) => '<label><input type="checkbox" value="' + s.name + '"' + (cur.includes(s.name) ? ' checked' : '') + '> ' + s.name + '</label>').join(' ');
  $('skins').onchange = () => el.setAttribute('skin', [...document.querySelectorAll('#skins input:checked')].map((i) => i.value).join(',') || 'default');
});
el.addEventListener('alike-event', (e) => { document.getElementById('ev').textContent = '⚡ ' + e.detail.name; });
<\/script></body></html>`;
        IO.download(new Blob([page], { type: 'text/html' }), safe(ed.project.name) + '.html');
        UI.toast('Exported ' + safe(ed.project.name) + '.html (' + Math.round(page.length / 1024) + ' KB)');
        return page;
      }
      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title>
<style>html,body{margin:0;height:100%;background:#16181d;color:#d9dce2;font:13px system-ui,sans-serif;display:flex;flex-direction:column}
.bar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#20232a;flex-wrap:wrap}.bar b{color:#ff8a3d}#stage{flex:1;position:relative;min-height:0}
canvas{position:absolute;inset:0;width:100%;height:100%}select{font:inherit}#skins label{margin-right:6px}#ev{position:absolute;left:12px;bottom:10px;color:#ffe27a;font-weight:600}</style></head>
<body><div class="bar"><b>${name}</b><select id="anim"></select><span id="skins"></span><label><input type="checkbox" id="phys" checked> physics</label></div>
<div id="stage"><canvas id="cv"></canvas><div id="ev"></div></div>
<script>window.A={};<\/script>
${['math', 'model', 'pose', 'animstate', 'render', 'atlas'].map((k) => '<script>' + esc(R[k]) + '<\/script>').join('\n')}
<script>
const DATA=${esc(JSON.stringify(data))};
const ATLAS=${esc(JSON.stringify(atlas))};
const SOUNDS=${esc(JSON.stringify(sounds))};
(async function(){
  const sk=DATA.skeleton, images={};
  for (const page of ATLAS.pages){ const img=new Image(); img.src=page.data; await img.decode();
    for (const n in page.regions){ const c=A.Atlas.sliceRegion(img,page.regions[n]);
      if (ATLAS.pma){ const x=c.getContext('2d'),id=x.getImageData(0,0,c.width,c.height),d=id.data; for(let i=0;i<d.length;i+=4){const a=d[i+3]/255;if(a>0){d[i]/=a;d[i+1]/=a;d[i+2]/=a;}} x.putImageData(id,0,0); }
      images[n]=c; } }
  const $=(i)=>document.getElementById(i), R=new A.GLRenderer($('cv'));
  $('anim').innerHTML=sk.animations.map(a=>'<option>'+a.name+'</option>').join('');
  $('skins').innerHTML='Skins: '+sk.skins.map((s,i)=>'<label><input type="checkbox" value="'+s.name+'"'+(i===0?' checked':'')+'> '+s.name+'</label>').join('');
  let skinKey='', phys={};
  const combined=()=>{ const names=[...document.querySelectorAll('#skins input:checked')].map(i=>i.value); const key=names.join('+');
    if (key!==skinKey){ skinKey=key; phys={}; sk.skins=sk.skins.filter(s=>s.name!=='__combined');
      const c={name:'__combined',attachments:{},bones:[],constraints:[]};
      for (const n of names){ const s=sk.skins.find(x=>x.name===n); for (const sl in s.attachments){ c.attachments[sl]=Object.assign(c.attachments[sl]||{},s.attachments[sl]); } c.bones.push(...s.bones); c.constraints.push(...s.constraints); }
      sk.skins.push(c); } return '__combined'; };
  const st=new A.AnimationState(sk); st.setAnimation(0,sk.animations[0]?sk.animations[0].name:'',true);
  st.listeners.push((ev)=>{ $('ev').textContent='⚡ '+ev.name; const def=A.Model.event(sk,ev.name); if(def&&def.audio&&SOUNDS[def.audio]){const au=new Audio(SOUNDS[def.audio]);au.volume=Math.min(1,Math.max(0,ev.volume!=null?ev.volume:def.volume));au.play().catch(()=>{});} });
  $('anim').onchange=()=>st.setAnimation(0,$('anim').value,true);
  // fit camera to setup pose
  const p0=new A.Pose({skeleton:sk},combined()); p0.update(); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  p0.slots.forEach(s=>{const g=p0.geometry(s); if(g&&g.tris) for(let i=0;i<g.verts.length;i+=2){x0=Math.min(x0,g.verts[i]);x1=Math.max(x1,g.verts[i]);y0=Math.min(y0,g.verts[i+1]);y1=Math.max(y1,g.verts[i+1]);}});
  let last=performance.now();
  (function loop(now){ const dt=Math.min(0.1,(now-last)/1000); last=now; const r=$('cv').getBoundingClientRect(); R.resize(r.width,r.height,devicePixelRatio||1);
    const zoom=Math.min(r.width/((x1-x0)||1),r.height/((y1-y0)||1))*0.8;
    st.update(dt); const p=new A.Pose({skeleton:sk},combined()); st.apply(p); p.update($('phys').checked?dt:0,phys);
    R.begin({x:(x0+x1)/2,y:(y0+y1)/2,zoom}); R.drawPose(p,{images}); requestAnimationFrame(loop); })(last);
})();
<\/script></body></html>`;
      IO.download(new Blob([html], { type: 'text/html' }), safe(ed.project.name) + '.html');
      UI.toast('Exported ' + safe(ed.project.name) + '.html (' + Math.round(html.length / 1024) + ' KB)');
      return html;
    },

    /* ---------- autosave (IndexedDB) ---------- */
    db() {
      return new Promise((res, rej) => { const r = indexedDB.open('alike-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    },
    async autosave() {
      try { const db = await IO.db(); const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ when: Date.now(), json: IO.serialize() }, 'autosave'); } catch (e) { /* storage unavailable */ }
    },
    async loadAutosave() {
      try { const db = await IO.db(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('autosave'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; }
    },
  };

  A.IO = IO;
})(window.A);
