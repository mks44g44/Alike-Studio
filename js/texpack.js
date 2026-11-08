/* Alike Studio — standalone Texture Packer and Texture Unpacker (File menu).
   Packer: any images or folder of images → atlas pages + an atlas file (Alike JSON, or .atlas text for other engines).
   Unpacker: an atlas (.atlas text, or an Alike export .json / .alkb) + its page images → the original images. */
(function (A) {
  'use strict';
  const ed = A.ed, UI = A.UI, Act = A.Act, IO = A.IO, M = A.M, h = UI.h;
  const safe = (s) => (s || 'atlas').replace(/[^\w\-. ]+/g, '_');
  const u8 = async (blob) => new Uint8Array(await blob.arrayBuffer());
  const pngOf = (cv) => new Promise((r) => cv.toBlob(r, 'image/png'));
  const nameOf = (f) => (f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name).replace(/\.[^.]+$/, '');
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Cannot read image')); i.src = src; });
  const fileURL = (f) => URL.createObjectURL(f);

  const TP = {
    settings: Object.assign({}, A.Atlas.DEFAULTS, { usedOnly: false, name: 'atlas', format: 'v4' }),

    /* pack images ({ name: HTMLImageElement|canvas }) without any skeleton */
    pack(images, opts) {
      const project = { skeleton: A.Model.newSkeleton(), images: {} };
      for (const n in images) project.images[n] = { w: images[n].naturalWidth || images[n].width, h: images[n].naturalHeight || images[n].height };
      return A.Atlas.pack(project, images, Object.assign({}, opts, { usedOnly: false, rotateCCW: opts.format !== 'alike' }));
    },
    /* → [{ name, data }] ready to zip */
    async packFiles(images, opts) {
      const r = TP.pack(images, opts), base = safe(opts.name), files = [];
      const names = r.pages.map((p, i) => base + (r.pages.length > 1 ? '_' + (i + 1) : '') + '.png');
      for (let i = 0; i < r.pages.length; i++) files.push({ name: names[i], data: await u8(await pngOf(r.pages[i].canvas)) });
      if (opts.format === 'alike') {
        const atlas = { format: 'alike-atlas', version: 1, scale: opts.scale, pma: !!opts.pma, filter: opts.filter, pages: r.pages.map((p, i) => ({ file: names[i], w: p.w, h: p.h, regions: p.regions })) };
        files.push({ name: base + '.atlas.json', data: new TextEncoder().encode(JSON.stringify(atlas, null, 1)) });
      } else files.push({ name: base + '.atlas', data: new TextEncoder().encode(A.Atlas.toAtlasText(r.pages, names, opts, opts.format)) });
      return { files, info: r };
    },

    async packerDialog() {
      const st = TP.settings; let images = {}, count = 0;
      const status = h('div.note', null, 'No images chosen yet.');
      const choose = async (dir) => {
        const fl = await Act.pickFiles(dir ? '' : A.Formats.IMAGE_ACCEPT, true, dir); if (!fl) return;
        const list = [...fl].filter((f) => A.Formats.isImage(f.name));
        for (const f of list) { try { images[nameOf(f)] = await A.Formats.decode(new Uint8Array(await f.arrayBuffer()), f.name); } catch (e) { UI.toast('Skipped ' + f.name + ': ' + e.message); } }
        count = Object.keys(images).length; status.textContent = `${count} image${count === 1 ? '' : 's'} chosen.`;
      };
      const body = h('div.form', null,
        UI.note('Packs any images into texture pages — no skeleton needed. Subfolder names become part of the region names.'),
        UI.row(UI.button('Choose images…', () => choose(false), { primary: true }), UI.button('Choose folder…', () => choose(true)),
          UI.button('Use project images', () => { images = Object.assign({}, ed.images); count = Object.keys(images).length; status.textContent = `${count} project images.`; }),
          UI.button('Clear', () => { images = {}; count = 0; status.textContent = 'No images chosen yet.'; })),
        status,
        UI.text('Name', () => st.name, (v) => (st.name = v || 'atlas')),
        UI.select('Atlas file', [['v4', '.atlas text (compact, newer runtimes)'], ['legacy', '.atlas text (libGDX classic)'], ['alike', 'Alike atlas JSON']], () => st.format, (v) => (st.format = v)),
        UI.select('Max page size', [256, 512, 1024, 2048, 4096, 8192].map((n) => [String(n), n + ' px']), () => String(st.maxSize), (v) => (st.maxSize = +v)),
        UI.num('Scale', () => st.scale, (v) => (st.scale = M.clamp(v, 0.05, 4)), { step: 0.05, prec: 2 }),
        UI.num('Padding', () => st.padding, (v) => (st.padding = M.clamp(Math.round(v), 0, 32)), { step: 0.2, prec: 0, suffix: 'px' }),
        UI.num('Edge padding', () => st.edge, (v) => (st.edge = M.clamp(Math.round(v), 0, 32)), { step: 0.2, prec: 0, suffix: 'px' }),
        UI.num('Bleed', () => st.extrude, (v) => (st.extrude = M.clamp(Math.round(v), 0, 8)), { step: 0.2, prec: 0, suffix: 'px' }),
        h('div.checkrow', null,
          UI.check('Power of two', () => st.pot, (v) => (st.pot = v)), UI.check('Square', () => st.square, (v) => (st.square = v)),
          UI.check('Allow rotation', () => st.rotate, (v) => (st.rotate = v)), UI.check('Strip whitespace', () => st.trim, (v) => (st.trim = v)),
          UI.check('Premultiply alpha', () => st.pma, (v) => (st.pma = v)), UI.check('Merge duplicates', () => st.dedupe, (v) => (st.dedupe = v)),
          UI.check('Brute force', () => st.bruteForce, (v) => (st.bruteForce = v))),
        UI.select('Filtering', [['linear', 'Linear'], ['nearest', 'Nearest (pixel art)']], () => st.filter, (v) => (st.filter = v)),
        UI.row(UI.button('Preview…', () => {
          if (!count) return UI.toast('Choose images first');
          const r = TP.pack(images, st), wrap = h('div.atlas-preview');
          r.pages.forEach((p, i) => { p.canvas.className = 'atlas-page'; wrap.appendChild(h('div', null, h('div.note', null, `Page ${i + 1}: ${p.w} × ${p.h} · ${Object.keys(p.regions).length} regions`), p.canvas)); });
          if (r.warnings.length) wrap.appendChild(h('div.note', null, r.warnings.join(' · ')));
          UI.alert('Texture Packer preview', wrap);
        })));
      const ok = await UI.modal('Texture Packer', body, [['Cancel', false], ['Pack', true, true]]);
      if (!ok) return;
      if (!count) return UI.toast('No images to pack');
      const { files, info } = await TP.packFiles(images, st);
      IO.download(IO.zip(files), safe(st.name) + '-atlas.zip');
      if (info.warnings.length) UI.alert('Texture Packer', h('div', null, ...info.warnings.map((w) => h('div', null, '• ' + w))));
      UI.toast(`Packed ${info.packed} images into ${info.pages.length} page${info.pages.length === 1 ? '' : 's'}${info.aliases ? ' (' + info.aliases + ' duplicates merged)' : ''}`);
    },

    /* ---------- unpacker ---------- */
    /* files: File list with an atlas file and its page images → { name: canvas } */
    async unpack(files) {
      const list = [...files], byName = {};
      list.forEach((f) => { byName[f.name] = f; byName[f.name.toLowerCase()] = f; });
      const page = async (file) => {
        const f = byName[file] || byName[file.split('/').pop()] || byName[file.toLowerCase()] || byName[file.split('/').pop().toLowerCase()];
        if (!f) throw new Error('Missing page image ' + file);
        return loadImg(fileURL(f));
      };
      const out = {}, unpma = (c) => { const x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; if (a > 0) { d[i] = Math.min(255, d[i] / a); d[i + 1] = Math.min(255, d[i + 1] / a); d[i + 2] = Math.min(255, d[i + 2] / a); } } x.putImageData(id, 0, 0); };
      const text = list.find((f) => /\.atlas(\.txt)?$/i.test(f.name));
      const data = list.find((f) => /\.(json|alkb)$/i.test(f.name));
      if (text) {
        for (const p of A.Atlas.parseAtlasText(await text.text())) {
          const img = await page(p.file);
          for (const n in p.regions) { const r = p.regions[n]; const key = r.index >= 0 ? n + r.index : n; out[key] = A.Atlas.sliceTextRegion(img, r); if (p.pma) unpma(out[key]); }
        }
      } else if (data) {
        const d = /\.alkb$/i.test(data.name) ? A.Binary.decode(await data.arrayBuffer()) : JSON.parse(await data.text());
        const atlas = d.atlas || d; // runtime export or a standalone Alike atlas JSON
        if (!atlas || !atlas.pages) throw new Error(data.name + ' has no atlas');
        for (const p of atlas.pages) { const img = await page(p.file); for (const n in p.regions) { out[n] = A.Atlas.sliceRegion(img, p.regions[n]); if (atlas.pma) unpma(out[n]); } }
      } else throw new Error('Choose an .atlas file (or an Alike .json / .alkb export) together with its page images');
      return out;
    },
    async unpackerDialog() {
      const fl = await Act.pickFiles('.atlas,.txt,.json,.alkb,' + A.Formats.IMAGE_ACCEPT, true); if (!fl || !fl.length) return;
      let imgs;
      try { imgs = await TP.unpack(fl); } catch (e) { return UI.alert('Texture Unpacker', e.message); }
      const n = Object.keys(imgs).length;
      const r = await UI.modal('Texture Unpacker', h('div', null, `Found ${n} image${n === 1 ? '' : 's'}.`),
        [['Cancel', false], ['Add to project', 'project'], ['Download .zip', 'zip', true]]);
      if (r === 'zip') {
        const files = []; for (const k in imgs) files.push({ name: 'images/' + k + '.png', data: await u8(await pngOf(imgs[k])) });
        IO.download(IO.zip(files), 'unpacked-images.zip'); UI.toast(`Unpacked ${n} images`);
      } else if (r === 'project') {
        ed.pushUndo('Unpack atlas'); for (const k in imgs) ed.addImage(k, imgs[k].toDataURL('image/png'), imgs[k].width, imgs[k].height);
        ed.changed('structure'); UI.toast(`Added ${n} images to the project`);
      }
    },
  };

  A.TexPack = TP;
})(window.A);
