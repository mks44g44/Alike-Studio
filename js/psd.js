/* Alike Studio — Photoshop (PSD/PSB) reader and importer.
   Reads layers (raw + RLE channels, 8/16-bit, RGB/grayscale), groups, visibility, opacity,
   blend mode and unicode names, then builds bones / slots / region attachments. */
(function (A) {
  'use strict';

  function parse(buffer) {
    const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
    let p = 0;
    const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
    const i16 = () => { const v = dv.getInt16(p); p += 2; return v; };
    const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
    const i32 = () => { const v = dv.getInt32(p); p += 4; return v; };
    const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + i]); p += n; return s; };
    if (str(4) !== '8BPS') throw new Error('Not a Photoshop file');
    const version = u16(); if (version !== 1 && version !== 2) throw new Error('Unsupported PSD version ' + version);
    const psb = version === 2;
    const len64 = () => (psb ? u32() * 4294967296 + u32() : u32());
    p += 6;
    const channels = u16(), height = u32(), width = u32(), depth = u16(), mode = u16();
    if (depth !== 8 && depth !== 16) throw new Error(depth + '-bit PSD files are not supported (use 8 or 16 bits/channel)');
    if (mode !== 3 && mode !== 1) throw new Error('Only RGB and Grayscale PSD files are supported (this one uses color mode ' + mode + ')');
    { const _l = u32(); p += _l; } // color mode data
    { const _l = u32(); p += _l; } // image resources
    const lmLen = len64(), lmEnd = p + lmLen;
    const layers = [];
    if (lmLen > 0) {
      const liLen = len64(), liEnd = p + liLen;
      if (liLen > 0) {
        let count = Math.abs(i16());
        const recs = [];
        for (let i = 0; i < count; i++) {
          const top = i32(), left = i32(), bottom = i32(), right = i32();
          const nch = u16(), chans = [];
          for (let c = 0; c < nch; c++) chans.push({ id: i16(), len: len64() });
          if (str(4) !== '8BIM') throw new Error('Bad layer blend signature');
          const blend = str(4), opacity = u8[p++], clipping = u8[p++], flags = u8[p++]; p++;
          const exLen = u32(), exEnd = p + exLen;
          { const _l = u32(); p += _l; } // layer mask
          { const _l = u32(); p += _l; } // blending ranges
          const nl = u8[p++]; let name = ''; for (let k = 0; k < nl; k++) name += String.fromCharCode(u8[p + k]);
          p += nl; const padded = (nl + 1 + 3) & ~3; p += padded - (nl + 1);
          let section = 0;
          while (p + 12 <= exEnd) {
            const sig = str(4);
            if (sig !== '8BIM' && sig !== '8B64') { p -= 3; continue; } // skip stray padding byte
            const key = str(4);
            const big = psb && ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD'].includes(key);
            const l = big ? len64() : u32(), start = p;
            if (key === 'luni') { const n = u32(); let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(dv.getUint16(p + k * 2)); if (s.endsWith('\0')) s = s.slice(0, -1); name = s; }
            if (key === 'lsct' || key === 'lsdk') section = dv.getUint32(p);
            p = start + l;
          }
          p = exEnd;
          recs.push({ name, top, left, bottom, right, chans, blend, opacity: opacity / 255, clipping, visible: !(flags & 2), section });
        }
        // channel image data
        const bpc = depth / 8;
        for (const r of recs) {
          const w = r.right - r.left, hgt = r.bottom - r.top;
          let rgba = null;
          if (w > 0 && hgt > 0 && !r.section) rgba = new Uint8ClampedArray(w * hgt * 4).fill(255);
          for (const ch of r.chans) {
            const start = p, end = p + ch.len;
            if (rgba && ch.id >= -1 && ch.len >= 2) {
              const comp = u16();
              const plane = readPlane(comp, w, hgt, bpc, psb);
              if (plane) {
                const off = ch.id === -1 ? 3 : mode === 1 ? -1 : ch.id;
                if (off === -1) { for (let k = 0; k < w * hgt; k++) { rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = plane[k]; } }
                else if (off <= 3) for (let k = 0; k < w * hgt; k++) rgba[k * 4 + off] = plane[k];
              } else r.unsupported = comp;
            }
            p = end; void start;
          }
          if (rgba && !r.chans.some((c) => c.id === -1)) for (let k = 3; k < rgba.length; k += 4) rgba[k] = 255;
          r.rgba = rgba; r.w = w; r.h = hgt;
        }
        // build groups: records are bottom → top
        const stack = [], out = [];
        for (let i = recs.length - 1; i >= 0; i--) {
          const r = recs[i];
          if (r.section === 1 || r.section === 2) { const g = { name: r.name, visible: r.visible, opacity: r.opacity, path: stack.map((s) => s.name).concat(r.name) }; stack.push(g); continue; }
          if (r.section === 3) { stack.pop(); continue; }
          r.groups = stack.slice();
          r.groupPath = stack.map((s) => s.name);
          r.groupVisible = stack.every((s) => s.visible);
          out.push(r);
        }
        layers.push(...out.reverse()); // back to bottom → top order
      }
      p = liEnd;
    }
    p = lmEnd;
    function readPlane(comp, w, hgt, bpc, isPsb) {
      const n = w * hgt, plane = new Uint8Array(n);
      const rowBytes = w * bpc;
      if (comp === 0) {
        for (let k = 0; k < n; k++) plane[k] = u8[p + k * bpc];
        p += n * bpc; return plane;
      }
      if (comp === 1) {
        const counts = [];
        for (let y = 0; y < hgt; y++) counts.push(isPsb ? u32() : u16());
        const row = new Uint8Array(rowBytes);
        for (let y = 0; y < hgt; y++) {
          const rowEnd = p + counts[y]; let o = 0;
          while (p < rowEnd && o < rowBytes) {
            let c = u8[p++]; if (c > 127) c -= 256;
            if (c >= 0) { for (let k = 0; k <= c && o < rowBytes; k++) row[o++] = u8[p++]; }
            else if (c !== -128) { const v = u8[p++]; for (let k = 0; k < 1 - c && o < rowBytes; k++) row[o++] = v; }
          }
          p = rowEnd;
          for (let x = 0; x < w; x++) plane[y * w + x] = row[x * bpc];
        }
        return plane;
      }
      return null; // zip compression is not supported
    }
    return { width, height, depth, mode, channels, layers };
  }

  function layerCanvas(r) {
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    c.getContext('2d').putImageData(new ImageData(r.rgba, r.w, r.h), 0, 0);
    return c;
  }
  const BLEND = { 'lddg': 'additive', 'lgCl': 'additive', 'mul ': 'multiply', 'scrn': 'screen' };
  const clean = (s) => (s || 'layer').replace(/\[[^\]]*\]/g, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'layer';

  /* import into the current project */
  async function importPSD(file) {
    const ed = A.ed, Model = A.Model, UI = A.UI, h = UI.h, M = A.M;
    let doc;
    try { doc = parse(await file.arrayBuffer()); } catch (e) { return UI.alert('PSD import failed', e.message); }
    const pixelLayers = doc.layers.filter((l) => l.rgba && l.w > 0 && l.h > 0);
    const opt = { bones: true, hidden: false, scale: 1, origin: 'bottom', prefix: file.name.replace(/\.(psd|psb)$/i, ''), parent: ed.selBones().pop() || 'root' };
    const body = h('div.form', null,
      UI.note(`${file.name}: ${doc.width} × ${doc.height}px, ${pixelLayers.length} layers${doc.layers.some((l) => l.unsupported) ? ' (some layers use ZIP compression and will be empty: re-save with "Maximize compatibility")' : ''}.`),
      UI.check('Create a bone for each group', () => opt.bones, (v) => (opt.bones = v)),
      UI.check('Import hidden layers (as hidden slots)', () => opt.hidden, (v) => (opt.hidden = v)),
      UI.num('Scale', () => opt.scale, (v) => (opt.scale = M.clamp(v, 0.01, 10)), { step: 0.01, prec: 3 }),
      UI.select('Origin', [['bottom', 'Bottom center of canvas'], ['center', 'Center of canvas'], ['topleft', 'Top left of canvas']], () => opt.origin, (v) => (opt.origin = v)),
      UI.select('Parent bone', () => ed.sk.bones.map((b) => b.name), () => opt.parent, (v) => (opt.parent = v)),
      UI.text('Image folder', () => opt.prefix, (v) => (opt.prefix = v)),
      UI.note('Layer-name tags: [ignore] skips a layer or group, [bone] makes a group a bone even when group bones are off, [merge] imports a group as one image.'),
    );
    if (!(await UI.modal('Import PSD', body, [['Cancel', false], ['Import', true, true]]))) return;
    const ox = opt.origin === 'topleft' ? 0 : doc.width / 2, oy = opt.origin === 'center' ? doc.height / 2 : opt.origin === 'topleft' ? 0 : doc.height;
    const toWorld = (px, py) => [(px - ox) * opt.scale, (oy - py) * opt.scale];
    ed.pushUndo('Import PSD');
    const sk = ed.sk;
    let pose = new A.Pose(ed.project, ed.skinName); pose.update();
    const parentName = pose.boneMap[opt.parent] ? opt.parent : 'root';
    const localIn = (bone, wx, wy) => { const pb = pose.boneMap[bone]; return pb ? pose.worldToLocal(pb, wx, wy) : [wx, wy]; };
    // merged groups
    const merged = new Map();
    let list = pixelLayers.filter((l) => !/\[ignore\]/i.test(l.name) && !l.groups.some((g) => /\[ignore\]/i.test(g.name)));
    if (!opt.hidden) list = list.filter((l) => l.visible && l.groupVisible);
    list = list.filter((l) => {
      const gi = l.groups.findIndex((g) => /\[merge\]/i.test(g.name));
      if (gi < 0) return true;
      const key = l.groups.slice(0, gi + 1).map((g) => g.name).join('/');
      if (!merged.has(key)) merged.set(key, { name: l.groups[gi].name, groups: l.groups.slice(0, gi), groupPath: l.groupPath.slice(0, gi), parts: [], visible: true, groupVisible: true, opacity: 1, blend: 'norm' });
      merged.get(key).parts.push(l);
      return false;
    });
    for (const m of merged.values()) { // flatten group into one layer
      const x0 = Math.min(...m.parts.map((l) => l.left)), y0 = Math.min(...m.parts.map((l) => l.top)), x1 = Math.max(...m.parts.map((l) => l.right)), y1 = Math.max(...m.parts.map((l) => l.bottom));
      const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0; const cx = c.getContext('2d');
      m.parts.forEach((l) => { cx.globalAlpha = l.opacity; cx.drawImage(layerCanvas(l), l.left - x0, l.top - y0); });
      Object.assign(m, { left: x0, top: y0, right: x1, bottom: y1, w: c.width, h: c.height, canvas: c, idx: doc.layers.indexOf(m.parts[m.parts.length - 1]) });
      list.push(m);
    }
    list.sort((a, b) => (a.idx != null ? a.idx : doc.layers.indexOf(a)) - (b.idx != null ? b.idx : doc.layers.indexOf(b)));
    // pass 1: a bone for each group (placed at the center of the group's layers)
    const groupBone = (groups) => {
      let parent = parentName;
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (!opt.bones && !/\[bone\]/i.test(g.name)) continue;
        const key = groups.slice(0, i + 1).map((x) => x.name).join('/');
        if (!g._bone) {
          const members = list.filter((l) => l.groupPath.slice(0, i + 1).join('/') === key);
          const x0 = Math.min(...members.map((l) => l.left)), x1 = Math.max(...members.map((l) => l.right)), y0 = Math.min(...members.map((l) => l.top)), y1 = Math.max(...members.map((l) => l.bottom));
          const [wx, wy] = isFinite(x0) ? toWorld((x0 + x1) / 2, (y0 + y1) / 2) : [0, 0];
          const name = Model.uniqueName(sk.bones, clean(g.name));
          const [lx, ly] = localIn(parent, wx, wy);
          sk.bones.push(Model.newBone(name, parent, { x: M.round(lx, 2), y: M.round(ly, 2), color: 'c9a0ffff' }));
          Model.sortBones(sk);
          pose = new A.Pose(ed.project, ed.skinName); pose.update();
          g._bone = name;
        }
        parent = g._bone;
      }
      return parent;
    };
    const boneOf = list.map((l) => groupBone(l.groups || []));
    // pass 2: images, slots and region attachments (bottom → top = back → front)
    let added = 0;
    list.forEach((l, i) => {
      const canvas = l.canvas || layerCanvas(l);
      const imgName = Model.uniqueName(Object.keys(ed.project.images).map((n) => ({ name: n })), [opt.prefix, ...l.groupPath.map(clean), clean(l.name)].filter(Boolean).join('/'));
      ed.addImage(imgName, canvas.toDataURL('image/png'), l.w, l.h);
      const bone = boneOf[i];
      const [wx, wy] = toWorld(l.left + l.w / 2, l.top + l.h / 2);
      const [lx, ly] = localIn(bone, wx, wy);
      const pb = pose.boneMap[bone], rot = pb ? -pose.worldRot(pb) : 0;
      const slotName = Model.uniqueName(sk.slots, clean(l.name));
      const visible = l.visible && l.groupVisible;
      const alpha = l.opacity * (l.groups || []).reduce((a, g) => a * (g.opacity == null ? 1 : g.opacity), 1);
      sk.slots.push(Model.newSlot(slotName, bone, { attachment: visible ? imgName : null, color: [1, 1, 1, M.round(alpha, 3)], blend: BLEND[l.blend] || 'normal' }));
      Model.putAttachment(sk, ed.skinName, slotName, Model.newAttachment('region', imgName, { path: imgName, x: M.round(lx, 2), y: M.round(ly, 2), rotation: M.round(rot, 2), width: l.w, height: l.h, scaleX: opt.scale, scaleY: opt.scale }));
      added++;
    });
    Model.sortBones(sk);
    ed.changed('structure');
    UI.toast(`Imported ${added} layer${added === 1 ? '' : 's'} from ${file.name}`);
    setTimeout(() => A.VP.frameAll(), 60);
  }

  A.PSD = { parse, importPSD };
})(window.A);
