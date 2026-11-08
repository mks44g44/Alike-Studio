/* Alike Studio — viewport: camera, overlay gizmos, tools and hit testing */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, MO = A.MeshOps, ed = A.ed, Act = A.Act;
  const ACCENT = '#ff8a3d', ACCENT2 = '#3ddcff';

  const VP = {
    cam: { x: 0, y: 160, zoom: 1 },
    mouse: { sx: 0, sy: 0, wx: 0, wy: 0, inside: false },
    drag: null, space: false, flashes: [],
    W: 1, H: 1, dpr: 1,

    init(el) {
      this.el = el;
      el.innerHTML = '';
      const mk = (cls) => { const c = document.createElement('canvas'); c.className = 'vp-layer ' + cls; el.appendChild(c); return c; };
      this.bg = mk('bg'); this.glc = mk('gl'); this.ov = mk('ov');
      this.bctx = this.bg.getContext('2d'); this.octx = this.ov.getContext('2d');
      try { this.gl = new A.GLRenderer(this.glc); } catch (e) { console.error(e); this.gl = null; ed.setStatus('WebGL unavailable: images will not render'); }
      const ro = new ResizeObserver(() => this.resize()); ro.observe(el);
      this.resize();
      const o = this.ov;
      o.addEventListener('mousedown', (e) => this.down(e));
      window.addEventListener('mousemove', (e) => this.move(e));
      window.addEventListener('mouseup', (e) => this.up(e));
      o.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
      o.addEventListener('contextmenu', (e) => e.preventDefault());
      o.addEventListener('dblclick', (e) => this.dbl(e));
      o.addEventListener('mouseenter', () => (this.mouse.inside = true));
      o.addEventListener('mouseleave', () => (this.mouse.inside = false));
      ed.on('events', (list) => list.forEach((ev) => this.flashes.push({ text: ev.name + (ev.string ? ' "' + ev.string + '"' : ''), t: performance.now() })));
    },
    resize() {
      const r = this.el.getBoundingClientRect();
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = window.devicePixelRatio || 1;
      for (const c of [this.bg, this.ov]) { c.width = Math.round(this.W * this.dpr); c.height = Math.round(this.H * this.dpr); }
      if (this.gl) this.gl.resize(this.W, this.H, this.dpr);
      ed.emit('redraw');
    },
    toScreen(x, y) { return [this.W / 2 + (x - this.cam.x) * this.cam.zoom, this.H / 2 - (y - this.cam.y) * this.cam.zoom]; },
    toWorld(sx, sy) { return [this.cam.x + (sx - this.W / 2) / this.cam.zoom, this.cam.y - (sy - this.H / 2) / this.cam.zoom]; },
    zoomAt(sx, sy, f) {
      const [wx, wy] = this.toWorld(sx, sy);
      this.cam.zoom = M.clamp(this.cam.zoom * f, 0.05, 40);
      const [nx, ny] = this.toWorld(sx, sy);
      this.cam.x += wx - nx; this.cam.y += wy - ny;
    },
    frameAll() {
      const pose = ed.pose; if (!pose) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
      pose.bones.forEach((b) => { add(b.wx, b.wy); const t = pose.localToWorld(b, b.data.length, 0); add(t[0], t[1]); });
      pose.slots.forEach((s) => { const g = pose.geometry(s); if (g && g.verts) for (let i = 0; i < g.verts.length; i += 2) add(g.verts[i], g.verts[i + 1]); });
      if (!isFinite(x0)) return;
      if (x1 - x0 < 60 && y1 - y0 < 60) { this.cam.x = (x0 + x1) / 2; this.cam.y = (y0 + y1) / 2 + 100; this.cam.zoom = 1; return; }
      const w = Math.max(50, x1 - x0), h = Math.max(50, y1 - y0);
      this.cam.x = (x0 + x1) / 2; this.cam.y = (y0 + y1) / 2;
      this.cam.zoom = M.clamp(Math.min(this.W / w, this.H / h) * 0.8, 0.05, 10);
    },

    /* ================= rendering ================= */
    render(pose) {
      const dpr = this.dpr;
      // background + grid
      const b = this.bctx; b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(document.documentElement);
      b.fillStyle = css.getPropertyValue('--vp-bg').trim() || '#1b1d22'; b.fillRect(0, 0, this.W, this.H);
      if (ed.view.grid) this.drawGrid(b, css);
      this.drawReference(b);
      // images
      if (this.gl) {
        this.gl.begin(this.cam);
        if (ed.view.images) {
          if (A.Skeletons) A.Skeletons.drawOthers(this.gl);
          if (ed.mode === 'animate' && ed.ghost.on && ed.anim) this.drawGhosts();
          this.gl.drawPose(pose, { images: ed.images, hidden: ed.hiddenSlots });
        }
      }
      // overlay
      const o = this.octx; o.setTransform(dpr, 0, 0, dpr, 0, 0); o.clearRect(0, 0, this.W, this.H);
      this.drawOverlay(o, pose);
    },
    drawGhosts() {
      const g = ed.ghost, fps = ed.fps, dur = Model.animDuration(ed.anim), op = g.opacity ?? 0.5, wrap = g.wrap && ed.loop && dur > 0;
      let hidden = ed.hiddenSlots;
      if (g.onlySel) { // ghost only the slots of the selected bones (and their children)
        const sel = ed.selBones(); if (sel.length) {
          const keep = new Set(); sel.forEach((b) => { keep.add(b); Model.descendants(ed.sk, b).forEach((d) => keep.add(d)); });
          hidden = new Set([...ed.hiddenSlots, ...ed.sk.slots.filter((s) => !keep.has(s.bone)).map((s) => s.name)]);
        }
      }
      const draw = (k, n, sign, tint) => {
        let t = ed.time + (sign * k * g.step) / fps;
        if (wrap) t = ((t % dur) + dur) % dur; else if (t < 0 || t > dur) return;
        const p = ed.computePose(0, t, false, null), a = op * (1 - (k - 1) / (n + 1));
        this.gl.drawPose(p, { images: ed.images, hidden, tint: g.tint === false ? [1, 1, 1, a] : tint.concat(a) });
      };
      for (let k = g.before; k >= 1; k--) draw(k, g.before, -1, [0.35, 0.75, 1]);
      for (let k = g.after; k >= 1; k--) draw(k, g.after, 1, [1, 0.55, 0.3]);
    },
    drawReference(c) {
      const r = ed.project.editor.reference; if (!r || !r.show || !r.data) return;
      if (!this._refImg || this._refImg._src !== r.data) { this._refImg = new Image(); this._refImg._src = r.data; this._refImg.src = r.data; this._refImg.onload = () => ed.emit('redraw'); }
      const img = this._refImg; if (!img.complete || !img.naturalWidth) return;
      const w = img.naturalWidth * (r.scale || 1) * this.cam.zoom, hh = img.naturalHeight * (r.scale || 1) * this.cam.zoom;
      const [cx, cy] = this.toScreen(r.x || 0, r.y || 0);
      c.save(); c.globalAlpha = r.opacity == null ? 0.5 : r.opacity; c.drawImage(img, cx - w / 2, cy - hh / 2, w, hh); c.restore();
    },
    drawGrid(c, css) {
      const z = this.cam.zoom;
      let step = 50; while (step * z < 24) step *= 2; while (step * z > 120) step /= 2;
      const [x0, y1] = this.toWorld(0, 0), [x1, y0] = this.toWorld(this.W, this.H);
      c.lineWidth = 1;
      c.strokeStyle = css.getPropertyValue('--grid').trim() || 'rgba(255,255,255,0.05)';
      c.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const s = Math.round(this.toScreen(x, 0)[0]) + 0.5; c.moveTo(s, 0); c.lineTo(s, this.H); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const s = Math.round(this.toScreen(0, y)[1]) + 0.5; c.moveTo(0, s); c.lineTo(this.W, s); }
      c.stroke();
      c.strokeStyle = css.getPropertyValue('--grid-axis').trim() || 'rgba(255,255,255,0.15)';
      const [ox, oy] = this.toScreen(0, 0);
      c.beginPath(); c.moveTo(Math.round(ox) + 0.5, 0); c.lineTo(Math.round(ox) + 0.5, this.H); c.moveTo(0, Math.round(oy) + 0.5); c.lineTo(this.W, Math.round(oy) + 0.5); c.stroke();
    },

    drawOverlay(o, pose) {
      const sel = ed.selAttachment();
      const selBones = new Set(ed.selBones());
      const selSlots = new Set(ed.selected('slot').map((r) => r.n));
      // attachment outlines
      for (const slot of pose.drawOrder) {
        if (!slot.bone.active || ed.hiddenSlots.has(slot.name)) continue;
        const att = pose.attachmentOf(slot); if (!att) continue;
        const isSel = sel && sel.slot === slot.name && sel.att === att;
        const g = pose.geometry(slot, att); if (!g) continue;
        if (att.type === 'region' || att.type === 'mesh' || att.type === 'linkedmesh') {
          const missing = !ed.images[g.image];
          if (isSel || selSlots.has(slot.name) || missing || ed.view.meshes && att.type !== 'region') {
            if ((att.type !== 'region') && (isSel || ed.view.meshes)) this.drawWire(o, g.verts, g.tris, isSel ? 'rgba(61,220,255,0.55)' : 'rgba(61,220,255,0.25)');
            this.drawPoly(o, g.verts, g.hull, isSel ? ACCENT2 : missing ? 'rgba(255,90,120,0.8)' : 'rgba(255,255,255,0.5)', missing ? [4, 4] : null, isSel ? 1.6 : 1);
            if (missing) { const [sx, sy] = this.toScreen(g.verts[0], g.verts[1]); o.fillStyle = 'rgba(255,90,120,0.9)'; o.font = '10px sans-serif'; o.fillText('missing: ' + g.image, sx + 3, sy - 3); }
          }
        } else if (att.type === 'bbox' && ed.view.bboxes) {
          this.drawPoly(o, g.verts, g.verts.length / 2, M.cssColor(att.color, isSel ? 1 : 0.8), null, isSel ? 2 : 1, M.cssColor(att.color, 0.08));
        } else if (att.type === 'clip' && ed.view.clipping) {
          this.drawPoly(o, g.verts, g.verts.length / 2, M.cssColor(att.color, isSel ? 1 : 0.8), [6, 3], isSel ? 2 : 1);
        } else if (att.type === 'path' && ed.view.paths) {
          this.drawPath(o, g.pts, att.closed, M.cssColor(att.color), isSel);
        } else if (att.type === 'point' && ed.view.points) {
          const [sx, sy] = this.toScreen(g.verts[0], g.verts[1]);
          const a = -g.angle * M.DEG;
          o.strokeStyle = M.cssColor(att.color); o.lineWidth = isSel ? 2 : 1.2;
          o.beginPath(); o.arc(sx, sy, 5, 0, Math.PI * 2); o.moveTo(sx, sy); o.lineTo(sx + Math.cos(a) * 18, sy + Math.sin(a) * 18); o.stroke();
        }
      }
      // constraint helpers
      for (const c of pose.cons) {
        if (!c.active || !ed.view.bones) continue;
        if (c.type === 'ik') {
          const t = pose.boneMap[c.target], last = pose.boneMap[c.bones[c.bones.length - 1]];
          if (!t || !last) continue;
          const tip = pose.localToWorld(last, last.data.length, 0);
          const [ax, ay] = this.toScreen(tip[0], tip[1]), [bx, by] = this.toScreen(t.wx, t.wy);
          o.strokeStyle = 'rgba(255,200,60,0.6)'; o.setLineDash([3, 3]); o.lineWidth = 1;
          o.beginPath(); o.moveTo(ax, ay); o.lineTo(bx, by); o.stroke(); o.setLineDash([]);
          o.strokeStyle = 'rgba(255,200,60,0.9)'; o.beginPath(); o.arc(bx, by, 7, 0, Math.PI * 2); o.stroke();
        } else if (c.type === 'physics') {
          const b = pose.boneMap[c.bone]; if (!b) continue;
          const [sx, sy] = this.toScreen(b.wx, b.wy);
          o.strokeStyle = 'rgba(160,255,140,0.75)'; o.lineWidth = 1;
          o.beginPath(); for (let i = 0; i <= 12; i++) { const x = sx - 6 + i, y = sy - 12 + Math.sin(i * 1.6) * 3; i ? o.lineTo(x, y) : o.moveTo(x, y); } o.stroke();
        } else if (c.type === 'transform') {
          const t = pose.boneMap[c.target]; if (!t) continue;
          const [tx, ty] = this.toScreen(t.wx, t.wy);
          o.strokeStyle = 'rgba(200,140,255,0.5)'; o.setLineDash([2, 4]);
          for (const bn of c.bones) { const b = pose.boneMap[bn]; if (!b) continue; const [sx, sy] = this.toScreen(b.wx, b.wy); o.beginPath(); o.moveTo(sx, sy); o.lineTo(tx, ty); o.stroke(); }
          o.setLineDash([]);
        }
      }
      // bones
      if (ed.view.bones) {
        for (const b of pose.bones) {
          if (ed.hiddenBones.has(b.name)) continue;
          this.drawBone(o, pose, b, selBones.has(b.name));
        }
      }
      // mesh tool vertices
      if (ed.tool === 'mesh' && sel) this.drawVertexHandles(o, pose, sel);
      if (ed.tool === 'weights' && sel) this.drawWeights(o, pose, sel);
      // create preview / marquee
      const d = this.drag;
      if (d && d.type === 'marquee') {
        o.strokeStyle = ACCENT2; o.fillStyle = 'rgba(61,220,255,0.08)'; o.lineWidth = 1;
        const x = Math.min(d.sx, this.mouse.sx), y = Math.min(d.sy, this.mouse.sy), w = Math.abs(this.mouse.sx - d.sx), h = Math.abs(this.mouse.sy - d.sy);
        o.fillRect(x, y, w, h); o.strokeRect(x + 0.5, y + 0.5, w, h);
      }
      if (ed.tool === 'weights' && this.mouse.inside) {
        o.strokeStyle = 'rgba(255,255,255,0.7)'; o.beginPath(); o.arc(this.mouse.sx, this.mouse.sy, ed.brush.size, 0, Math.PI * 2); o.stroke();
      }
      // pivot of rotate/scale
      if (['rotate', 'scale', 'shear'].includes(ed.tool) && selBones.size) {
        const b = pose.boneMap[[...selBones].pop()];
        if (b) { const [sx, sy] = this.toScreen(b.wx, b.wy); o.strokeStyle = ACCENT; o.lineWidth = 1; o.beginPath(); o.arc(sx, sy, 18, 0, Math.PI * 2); o.stroke(); }
      }
      // event flashes
      const now = performance.now();
      this.flashes = this.flashes.filter((f) => now - f.t < 900);
      this.flashes.forEach((f, i) => {
        const a = 1 - (now - f.t) / 900;
        o.fillStyle = `rgba(255,230,120,${a})`; o.font = 'bold 13px system-ui, sans-serif';
        o.fillText('⚡ ' + f.text, 14, this.H - 18 - i * 18 - (1 - a) * 12);
      });
    },
    drawBone(o, pose, b, selected) {
      const len = b.data.length;
      const [ox, oy] = this.toScreen(b.wx, b.wy);
      const col = '#' + (b.data.color || '9aa4b2ff').slice(0, 6);
      const alpha = b.active ? 1 : 0.3;
      o.globalAlpha = alpha;
      if (len > 0) {
        const tip = pose.localToWorld(b, len, 0);
        const [tx, ty] = this.toScreen(tip[0], tip[1]);
        const L = Math.hypot(tx - ox, ty - oy);
        if (L > 2) {
          const ux = (tx - ox) / L, uy = (ty - oy) / L, w = Math.min(7, Math.max(2, L * 0.1));
          const mx = ox + ux * Math.min(L * 0.18, 14), my = oy + uy * Math.min(L * 0.18, 14);
          o.beginPath();
          o.moveTo(ox, oy); o.lineTo(mx - uy * w, my + ux * w); o.lineTo(tx, ty); o.lineTo(mx + uy * w, my - ux * w); o.closePath();
          o.fillStyle = selected ? ACCENT : col; o.globalAlpha = alpha * (selected ? 0.9 : 0.55); o.fill();
          o.globalAlpha = alpha; o.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,0.6)'; o.lineWidth = 1; o.stroke();
        }
      }
      const S = ed.view.boneSize || 1;
      o.beginPath(); o.arc(ox, oy, (selected ? 5 : 4) * S, 0, Math.PI * 2);
      o.fillStyle = selected ? ACCENT : col; o.fill(); o.strokeStyle = 'rgba(0,0,0,0.7)'; o.stroke();
      if (len === 0) this.drawBoneIcon(o, pose, b, ox, oy, selected ? ACCENT : col, S);
      if (ed.view.names || selected) {
        o.font = '11px system-ui, sans-serif'; o.fillStyle = selected ? '#fff' : 'rgba(255,255,255,0.75)';
        o.fillText(b.name, ox + 8, oy - 7);
      }
      o.globalAlpha = 1;
    },
    /* zero-length bones are drawn as an icon (bone.icon), scaled by View → Bone size and optionally rotated with the bone */
    drawBoneIcon(o, pose, b, ox, oy, col, S) {
      const r = 9 * S, kind = b.data.icon || 'bone';
      o.save(); o.translate(ox, oy);
      if (ed.view.iconRotation !== false) o.rotate(-pose.worldRot(b) * Math.PI / 180);
      o.strokeStyle = col; o.lineWidth = 1.25; o.beginPath();
      switch (kind) {
        case 'square': o.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); break;
        case 'diamond': o.moveTo(r, 0); o.lineTo(0, r); o.lineTo(-r, 0); o.lineTo(0, -r); o.closePath(); break;
        case 'star': for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; i ? o.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : o.moveTo(rr, 0); } o.closePath(); break;
        case 'cross': o.moveTo(-r, 0); o.lineTo(r, 0); o.moveTo(0, -r); o.lineTo(0, r); break;
        case 'eye': o.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2); o.moveTo(r * 0.3, 0); o.arc(0, 0, r * 0.3, 0, Math.PI * 2); break;
        default: o.arc(0, 0, r, 0, Math.PI * 2);
      }
      o.stroke();
      if (ed.view.iconRotation !== false) { o.beginPath(); o.moveTo(r * 0.55, 0); o.lineTo(r * 1.35, 0); o.stroke(); } // direction tick
      o.restore();
    },
    drawPoly(o, verts, count, stroke, dash, lw = 1, fill) {
      if (!count || count < 2) return;
      o.beginPath();
      for (let i = 0; i < count; i++) { const [x, y] = this.toScreen(verts[i * 2], verts[i * 2 + 1]); i ? o.lineTo(x, y) : o.moveTo(x, y); }
      o.closePath();
      if (fill) { o.fillStyle = fill; o.fill(); }
      o.strokeStyle = stroke; o.lineWidth = lw; if (dash) o.setLineDash(dash); o.stroke(); o.setLineDash([]);
    },
    drawWire(o, verts, tris, stroke) {
      if (!tris) return;
      o.beginPath();
      for (let t = 0; t < tris.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          const i = tris[t + k], [x, y] = this.toScreen(verts[i * 2], verts[i * 2 + 1]);
          k ? o.lineTo(x, y) : o.moveTo(x, y);
        }
        o.closePath();
      }
      o.strokeStyle = stroke; o.lineWidth = 0.8; o.stroke();
    },
    drawPath(o, pts, closed, color, isSel) {
      if (pts.length < 1) return;
      o.strokeStyle = color; o.lineWidth = isSel ? 2 : 1.4;
      o.beginPath();
      const n = pts.length, cnt = closed ? n : n - 1;
      const S = (x, y) => this.toScreen(x, y);
      let [x, y] = S(pts[0].x, pts[0].y); o.moveTo(x, y);
      for (let i = 0; i < cnt; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const c1 = S(a.ox, a.oy), c2 = S(b.ix, b.iy), e = S(b.x, b.y);
        o.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]);
      }
      o.stroke();
      for (const p of pts) { const [sx, sy] = S(p.x, p.y); o.fillStyle = color; o.fillRect(sx - 2.5, sy - 2.5, 5, 5); }
    },
    drawVertexHandles(o, pose, sel) {
      const slot = pose.slotMap[sel.slot]; if (!slot) return;
      const g = pose.geometry(slot, sel.att); if (!g) return;
      if (sel.att.type === 'path') {
        g.pts.forEach((p, i) => {
          const a = this.toScreen(p.x, p.y), hi = this.toScreen(p.ix, p.iy), ho = this.toScreen(p.ox, p.oy);
          o.strokeStyle = 'rgba(255,255,255,0.5)'; o.lineWidth = 1;
          o.beginPath(); o.moveTo(hi[0], hi[1]); o.lineTo(a[0], a[1]); o.lineTo(ho[0], ho[1]); o.stroke();
          const s = ed.vertSel.has(i);
          o.fillStyle = s ? ACCENT : '#fff'; o.fillRect(a[0] - 4, a[1] - 4, 8, 8);
          o.fillStyle = ACCENT2; o.beginPath(); o.arc(hi[0], hi[1], 3.5, 0, 7); o.arc(ho[0], ho[1], 3.5, 0, 7); o.fill();
        });
        return;
      }
      const v = g.verts; if (!v) return;
      const n = v.length / 2;
      for (let i = 0; i < n; i++) {
        const [x, y] = this.toScreen(v[i * 2], v[i * 2 + 1]);
        const s = ed.vertSel.has(i), hull = g.hull == null || i < g.hull;
        o.beginPath(); o.arc(x, y, s ? 5 : 3.5, 0, Math.PI * 2);
        o.fillStyle = s ? ACCENT : hull ? '#fff' : ACCENT2; o.fill();
        o.strokeStyle = 'rgba(0,0,0,0.7)'; o.lineWidth = 1; o.stroke();
      }
    },
    drawWeights(o, pose, sel) {
      const att = sel.att; if (!['mesh', 'bbox', 'clip'].includes(att.type)) return;
      const slot = pose.slotMap[sel.slot]; if (!slot) return;
      const g = pose.geometry(slot, att); if (!g) return;
      if (!g.tris) { this.drawPoly(o, g.verts, g.verts.length / 2, 'rgba(255,255,255,0.5)'); g.tris = []; }
      const bone = ed.weightBone;
      const heat = (w) => { const r = Math.round(255 * M.clamp(w * 2, 0, 1)), gg = Math.round(255 * M.clamp(1 - Math.abs(w - 0.5) * 2, 0, 1)), b = Math.round(255 * M.clamp(1 - w * 2, 0, 1)); return `rgb(${r},${gg},${b})`; };
      // triangles tinted
      if (att.weights) {
        for (let t = 0; t < g.tris.length; t += 3) {
          const ids = [g.tris[t], g.tris[t + 1], g.tris[t + 2]];
          const w = ids.reduce((a, i) => a + MO.weightOf(att, i, bone), 0) / 3;
          o.beginPath();
          ids.forEach((i, k) => { const [x, y] = this.toScreen(g.verts[i * 2], g.verts[i * 2 + 1]); k ? o.lineTo(x, y) : o.moveTo(x, y); });
          o.closePath(); o.fillStyle = heat(w); o.globalAlpha = 0.35; o.fill(); o.globalAlpha = 1;
        }
      }
      this.drawWire(o, g.verts, g.tris, 'rgba(255,255,255,0.25)');
      for (let i = 0; i < g.verts.length / 2; i++) {
        const [x, y] = this.toScreen(g.verts[i * 2], g.verts[i * 2 + 1]);
        o.beginPath(); o.arc(x, y, 4, 0, Math.PI * 2); o.fillStyle = att.weights ? heat(MO.weightOf(att, i, bone)) : '#888'; o.fill();
        o.strokeStyle = '#000'; o.lineWidth = 0.8; o.stroke();
      }
    },

    /* ================= hit testing ================= */
    hitBone(sx, sy) {
      const pose = ed.pose; let best = null, bd = 9;
      for (const b of pose.bones) {
        if (ed.hiddenBones.has(b.name) || !ed.view.bones || ed.locked.has('b:' + b.name)) continue;
        const [ox, oy] = this.toScreen(b.wx, b.wy);
        let d;
        if (b.data.length > 0) { const t = pose.localToWorld(b, b.data.length, 0); const [tx, ty] = this.toScreen(t[0], t[1]); d = M.segDist(sx, sy, ox, oy, tx, ty); }
        else d = Math.max(0, Math.hypot(sx - ox, sy - oy) - 5);
        if (d <= bd) { bd = d; best = b; }
      }
      return best;
    },
    hitAttachment(wx, wy) {
      const pose = ed.pose;
      for (let i = pose.drawOrder.length - 1; i >= 0; i--) {
        const slot = pose.drawOrder[i];
        if (!slot.bone.active || ed.hiddenSlots.has(slot.name) || ed.locked.has('s:' + slot.name)) continue;
        const att = pose.attachmentOf(slot); if (!att) continue;
        const g = pose.geometry(slot, att); if (!g) continue;
        if (g.tris && g.verts && ed.view.images) {
          const hull = Array.from(g.verts.slice(0, (g.hull || g.verts.length / 2) * 2));
          if (M.pointInPoly(wx, wy, hull)) return { slot: slot.name, att };
        } else if (g.polygon && ((att.type === 'bbox' && ed.view.bboxes) || (att.type === 'clip' && ed.view.clipping))) {
          // only edges are clickable for polygons
          const v = g.verts, n = v.length / 2;
          for (let k = 0; k < n; k++) { const j = (k + 1) % n; if (M.segDist(wx, wy, v[k * 2], v[k * 2 + 1], v[j * 2], v[j * 2 + 1]) * this.cam.zoom < 5) return { slot: slot.name, att }; }
        } else if (att.type === 'point' && ed.view.points) {
          if (Math.hypot(wx - g.verts[0], wy - g.verts[1]) * this.cam.zoom < 8) return { slot: slot.name, att };
        } else if (att.type === 'path' && ed.view.paths) {
          for (const p of g.pts) if (Math.hypot(wx - p.x, wy - p.y) * this.cam.zoom < 7) return { slot: slot.name, att };
        }
      }
      return null;
    },
    attRef(hit) {
      const skinName = Model.skin(ed.sk, ed.skinName) && Model.skin(ed.sk, ed.skinName).attachments[hit.slot] && Model.skin(ed.sk, ed.skinName).attachments[hit.slot][hit.att.name] ? ed.skinName : 'default';
      return { k: 'att', n: hit.att.name, slot: hit.slot, skin: skinName };
    },
    hitVertex(sx, sy) {
      const sel = ed.selAttachment(); if (!sel) return null;
      const slot = ed.pose.slotMap[sel.slot]; if (!slot) return null;
      const g = ed.pose.geometry(slot, sel.att); if (!g) return null;
      if (sel.att.type === 'path') {
        for (let i = 0; i < g.pts.length; i++) {
          const p = g.pts[i];
          for (const [h, x, y] of [['p', p.x, p.y], ['i', p.ix, p.iy], ['o', p.ox, p.oy]]) {
            const [px, py] = this.toScreen(x, y); if (Math.hypot(px - sx, py - sy) < 7) return { i, h };
          }
        }
        return null;
      }
      const v = g.verts; if (!v) return null;
      let best = null, bd = 8;
      for (let i = 0; i < v.length / 2; i++) { const [x, y] = this.toScreen(v[i * 2], v[i * 2 + 1]); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = { i }; } }
      return best;
    },

    /* ================= input ================= */
    local(e) { const r = this.ov.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    down(e) {
      this.ov.focus && this.ov.focus();
      if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
      const [sx, sy] = this.local(e), [wx, wy] = this.toWorld(sx, sy);
      Object.assign(this.mouse, { sx, sy, wx, wy });
      if (e.button === 1 || e.button === 2 || (e.button === 0 && this.space)) {
        this.drag = { type: 'pan', sx, sy, cx: this.cam.x, cy: this.cam.y }; return;
      }
      if (e.button !== 0) return;
      const tool = ed.tool;
      if (tool === 'create') return this.startCreate(sx, sy, wx, wy);
      if (tool === 'mesh' && ed.selAttachment()) return this.meshDown(e, sx, sy, wx, wy);
      if (tool === 'weights' && ed.selAttachment()) return this.paintStart(e, wx, wy);
      if (['rotate', 'scale', 'translate'].includes(tool) && ed.vertSel.size && ed.selAttachment() && ed.selAttachment().att.type !== 'path') return this.startVertexTransform(tool, sx, sy, wx, wy);
      // selection hit
      const hb = this.hitBone(sx, sy);
      const ha = hb ? null : this.hitAttachment(wx, wy);
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (hb) {
        const ref = { k: 'bone', n: hb.name };
        if (!ed.isSelected(ref) || additive) ed.select(ref, additive);
      } else if (ha) {
        if (ed.mode === 'animate' && !e.altKey) {
          const ref = { k: 'bone', n: Model.slot(ed.sk, ha.slot).bone };
          if (!ed.isSelected(ref) || additive) ed.select(ref, additive);
        } else {
          const ref = this.attRef(ha);
          if (!ed.isSelected(ref) || additive) ed.select(ref, additive);
        }
      } else if (tool === 'pose' || !ed.sel.length || additive) {
        if (!additive) ed.select(null);
        this.drag = { type: 'marquee', sx, sy, additive }; return;
      }
      this.startTransform(tool, sx, sy, wx, wy, e, !!(hb || ha));
    },
    startTransform(tool, sx, sy, wx, wy, e, onItem) {
      const pose = ed.pose;
      const attSel = ed.selAttachment();
      if (attSel && ed.mode === 'setup' && (tool !== 'pose' || onItem)) {
        ed.pushUndo('Transform attachment');
        this.drag = { type: 'att', tool: tool === 'pose' ? 'translate' : tool, sx, sy, wx, wy, start: Model.clone(attSel.att), ref: attSel };
        return;
      }
      let names = ed.selBones();
      if (!names.length) return;
      // skip bones whose ancestor is also selected (for translate)
      const set = new Set(names);
      const top = names.filter((n) => { let b = Model.bone(ed.sk, n); b = b && Model.bone(ed.sk, b.parent); while (b) { if (set.has(b.name)) return false; b = Model.bone(ed.sk, b.parent); } return true; });
      const start = {};
      for (const n of names) {
        const pb = pose.boneMap[n]; if (!pb) continue;
        start[n] = { rot: pb.rot, x: pb.x, y: pb.y, sx: pb.sx, sy: pb.sy, shx: pb.shx, shy: pb.shy, wx: pb.wx, wy: pb.wy, wrot: pose.worldRot(pb), sign: pose.parentSign(pb),
          inv: pb.parent ? M.invert({ a: pb.parent.a, b: pb.parent.b, c: pb.parent.c, d: pb.parent.d, x: 0, y: 0 }) : M.mat() };
      }
      let mode = tool;
      if (tool === 'pose') {
        const prim = pose.boneMap[names[names.length - 1]];
        const isIkTarget = ed.sk.constraints.some((c) => c.type === 'ik' && c.target === prim.name);
        mode = prim.data.length > 0 && !isIkTarget && !e.altKey ? 'poseRotate' : 'translate';
        if (mode === 'poseRotate') { names = [prim.name]; start.grab = Math.atan2(wy - prim.wy, wx - prim.wx) * M.RAD - pose.worldRot(prim); }
      }
      if (ed.mode === 'setup' || ed.autoKey) ed.pushUndo('Transform');
      const prim = pose.boneMap[names[names.length - 1]];
      this.drag = { type: 'bones', mode, sx, sy, wx, wy, names, top, start, pivot: [prim.wx, prim.wy], a0: Math.atan2(wy - prim.wy, wx - prim.wx), acc: 0, last: Math.atan2(wy - prim.wy, wx - prim.wx), comp: this.captureCompensation(names) };
    },
    startCreate(sx, sy, wx, wy) {
      if (ed.mode !== 'setup') { ed.setStatus('Create bones in Setup mode'); return; }
      const sk = ed.sk;
      let parent = ed.selBones().pop() || 'root';
      ed.pushUndo('Create bone');
      const pb = ed.pose.boneMap[parent];
      const l = M.apply(M.invert({ a: pb.a, b: pb.b, c: pb.c, d: pb.d, x: pb.wx, y: pb.wy }), wx, wy);
      const name = Model.uniqueName(sk.bones, 'bone');
      const b = Model.newBone(name, parent, { x: M.round(l[0], 2), y: M.round(l[1], 2), color: pb.data.color });
      sk.bones.push(b); Model.sortBones(sk);
      ed.select({ k: 'bone', n: name });
      ed.changed('structure');
      this.drag = { type: 'create', bone: name, wx, wy, parent };
    },
    meshDown(e, sx, sy, wx, wy) {
      const sel = ed.selAttachment();
      const hv = this.hitVertex(sx, sy);
      if (hv) {
        if (sel.att.type === 'path') {
          if (!ed.vertSel.has(hv.i) || e.shiftKey) { if (!e.shiftKey) ed.vertSel.clear(); ed.vertSel.add(hv.i); }
          ed.pushUndo('Edit path');
          this.drag = { type: 'pathHandle', h: hv.h, i: hv.i, wx, wy, start: Model.clone(sel.att.points), alt: e.altKey, ref: sel };
          ed.emit('selection-verts'); return;
        }
        if (e.shiftKey) { ed.vertSel.has(hv.i) ? ed.vertSel.delete(hv.i) : ed.vertSel.add(hv.i); }
        else if (!ed.vertSel.has(hv.i)) { ed.vertSel.clear(); ed.vertSel.add(hv.i); }
        this.beginVertDrag(sel, wx, wy, e.altKey);
        return;
      }
      this.drag = { type: 'meshClick', sx, sy, wx, wy, shift: e.shiftKey, ref: sel };
    },
    beginVertDrag(sel, wx, wy, alt) {
      const pose = ed.pose, slot = pose.slotMap[sel.slot];
      const g = pose.geometry(slot, sel.att);
      const d = { type: 'verts', wx, wy, ref: sel, alt, world0: g.verts ? Array.from(g.verts) : null, idx: [...ed.vertSel] };
      if (ed.mode === 'setup') { ed.pushUndo('Move vertices'); d.att0 = Model.clone(sel.att); d.setupPose = ed.computePose(0); }
      else {
        if (!ed.anim) return;
        if (ed.autoKey) ed.pushUndo('Deform');
        const defName = sel.att.type === 'linkedmesh' && sel.att.inheritDeform ? sel.att.parent : sel.att.name;
        const geo = g.geo || sel.att;
        const len = geo.weights ? geo.weights.reduce((a, vw) => a + vw.length, 0) * 2 : (geo.verts || []).length;
        d.def0 = Array.from(slot.deform[defName] || new Array(len).fill(0));
        while (d.def0.length < len) d.def0.push(0);
        d.defName = defName; d.geo = geo;
        // per-entry bone inverse 2x2 for weighted deform
        if (geo.weights) { d.entryInv = []; geo.weights.forEach((vw, vi) => vw.forEach((en) => { const b = pose.boneMap[en.b]; d.entryInv.push({ vi, inv: b ? M.invert({ a: b.a, b: b.b, c: b.c, d: b.d, x: 0, y: 0 }) : M.mat() }); })); }
        else d.inv = M.invert({ a: slot.bone.a, b: slot.bone.b, c: slot.bone.c, d: slot.bone.d, x: 0, y: 0 });
      }
      this.drag = d;
      ed.emit('selection-verts');
    },
    startVertexTransform(tool, sx, sy, wx, wy) {
      const sel = ed.selAttachment();
      this.beginVertDrag(sel, wx, wy, true);
      const d = this.drag; if (!d || !d.world0) return;
      d.vtool = tool; d.sx = sx; d.sy = sy;
      let cx = 0, cy = 0; d.idx.forEach((i) => { cx += d.world0[i * 2]; cy += d.world0[i * 2 + 1]; });
      d.pivot = [cx / d.idx.length, cy / d.idx.length]; d.a0 = Math.atan2(wy - d.pivot[1], wx - d.pivot[0]);
    },
    paintStart(e, wx, wy) {
      // multi-mesh weight painting: every selected weighted mesh / box / clipping is painted
      const refs = ed.selected('att').map((r) => { const sk2 = Model.skin(ed.sk, r.skin); const a = sk2 && sk2.attachments[r.slot] && sk2.attachments[r.slot][r.n]; return a ? { att: a, slot: r.slot } : null; })
        .filter((x) => x && ['mesh', 'bbox', 'clip'].includes(x.att.type) && x.att.weights);
      if (!refs.length) { ed.setStatus('Bind bones first (Weights panel → Bind bones…)'); return; }
      if (!ed.weightBone) ed.weightBone = MO.boundBones(refs[0].att)[0];
      ed.pushUndo('Paint weights');
      const setupPose = new A.Pose(ed.project, ed.skinName); setupPose.update();
      this.drag = { type: 'paint', refs, pose: setupPose, sub: e.altKey || ed.brush.mode === 'remove' };
      this.paintAt(wx, wy);
    },
    paintAt(wx, wy) {
      const d = this.drag;
      const r = ed.brush.size / this.cam.zoom;
      for (const ref of d.refs) MO.paint(d.pose, ref.slot, ref.att, ed.weightBone, wx, wy, r, (d.sub ? -1 : 1) * ed.brush.strength * 0.15);
      ed.changed('weights');
    },
    move(e) {
      if (!this.ov) return;
      const [sx, sy] = this.local(e), [wx, wy] = this.toWorld(sx, sy);
      Object.assign(this.mouse, { sx, sy, wx, wy });
      ed.emit('mouse', this.mouse);
      this.shiftDown = e.shiftKey;
      const d = this.drag; if (!d) return;
      const pose = ed.pose;
      switch (d.type) {
        case 'pan': this.cam.x = d.cx - (sx - d.sx) / this.cam.zoom; this.cam.y = d.cy + (sy - d.sy) / this.cam.zoom; break;
        case 'create': {
          const b = Model.bone(ed.sk, d.bone), pb = pose.boneMap[d.parent];
          const len = Math.hypot(wx - d.wx, wy - d.wy);
          const wang = Math.atan2(wy - d.wy, wx - d.wx) * M.RAD;
          b.length = M.round(len / Math.max(1e-6, Math.hypot(pb.a, pb.c)), 2);
          b.rotation = M.round(M.wrapDeg(wang - pose.worldRot(pb)) * pose.parentSign(pb), 2);
          ed.changed('values'); break;
        }
        case 'bones': this.dragBones(d, sx, sy, wx, wy, e); break;
        case 'att': this.dragAtt(d, sx, sy, wx, wy, e); break;
        case 'verts': this.dragVerts(d, wx, wy); break;
        case 'pathHandle': this.dragPath(d, wx, wy); break;
        case 'paint': this.paintAt(wx, wy); break;
      }
    },
    dragBones(d, sx, sy, wx, wy, e) {
      const ch = {};
      const S = d.start;
      if (d.mode === 'poseRotate') {
        const n = d.names[0], s = S[n];
        const want = Math.atan2(wy - s.wy, wx - s.wx) * M.RAD - S.grab;
        ch[n] = { rotate: M.round(s.rot + M.wrapDeg(want - s.wrot) * s.sign, 2) };
      } else if (d.mode === 'rotate') {
        const a = Math.atan2(wy - d.pivot[1], wx - d.pivot[0]);
        let da = a - d.last; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        d.acc += da; d.last = a;
        let deg = d.acc * M.RAD; if (e.shiftKey) deg = Math.round(deg / 15) * 15; else if (ed.snap.on) deg = Math.round(deg / ed.snap.angle) * ed.snap.angle;
        for (const n of d.names) ch[n] = { rotate: M.round(S[n].rot + deg * S[n].sign, 2) };
      } else if (d.mode === 'translate') {
        let dx = wx - d.wx, dy = wy - d.wy;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        for (const n of d.top) {
          const s = S[n]; if (!s) continue;
          const l = M.applyVec(s.inv, dx, dy);
          let nx = s.x + l[0], ny = s.y + l[1];
          if (ed.snap.on) { const g = ed.snap.move; nx = Math.round(nx / g) * g; ny = Math.round(ny / g) * g; }
          ch[n] = { x: M.round(nx, 2), y: M.round(ny, 2) };
        }
      } else if (d.mode === 'scale') {
        const fx = Math.exp((sx - d.sx) / 150), fy = Math.exp(-(sy - d.sy) / 150);
        for (const n of d.names) {
          const s = S[n];
          const snapS = (v) => (ed.snap.on ? Math.round(v / ed.snap.scale) * ed.snap.scale : v);
          ch[n] = e.shiftKey ? { scaleX: M.round(snapS(s.sx * fx), 3), scaleY: M.round(snapS(s.sy * fx), 3) } : { scaleX: M.round(snapS(s.sx * fx), 3), scaleY: M.round(snapS(s.sy * fy), 3) };
        }
      } else if (d.mode === 'shear') {
        for (const n of d.names) { const s = S[n]; ch[n] = { shearX: M.round(s.shx - (sy - d.sy) * 0.4, 2), shearY: M.round(s.shy + (sx - d.sx) * 0.4, 2) }; }
      }
      ed.setBoneValues(ch, 'Transform', false);
      if (d.comp) this.applyCompensation(d.comp);
    },
    /* Compensation (setup mode): keep children and/or attachments where they were while moving a bone */
    captureCompensation(names) {
      const C = ed.compensate; if (ed.mode !== 'setup' || (!C.children && !C.images)) return null;
      const pose = Act.setupPose(), set = new Set(names), out = { bones: [], atts: [] };
      const mat = (b) => ({ a: b.a, b: b.b, c: b.c, d: b.d, x: b.wx, y: b.wy });
      for (const n of names) {
        if (C.children) for (const c of Model.children(ed.sk, n)) if (!set.has(c.name)) out.bones.push({ name: c.name, parent: n, world: mat(pose.boneMap[c.name]) });
        if (C.images) for (const sl of Model.slotsOf(ed.sk, n)) for (const skin of ed.sk.skins) {
          const m = skin.attachments[sl.name]; if (!m) continue;
          for (const an in m) { const a = m[an]; if (a.weights) continue; out.atts.push({ att: a, bone: n, old: mat(pose.boneMap[n]), start: Model.clone(a) }); }
        }
      }
      return out.bones.length || out.atts.length ? out : null;
    },
    applyCompensation(comp) {
      const pose = Act.setupPose();
      for (const c of comp.bones) {
        const b = Model.bone(ed.sk, c.name), np = pose.boneMap[c.parent];
        const [lx, ly] = M.apply(M.invert({ a: np.a, b: np.b, c: np.c, d: np.d, x: np.wx, y: np.wy }), c.world.x, c.world.y);
        const q = pose.inheritQ(np, b), L = M.mul(M.invert({ a: q.a, b: q.b, c: q.c, d: q.d, x: 0, y: 0 }), { a: c.world.a, b: c.world.b, c: c.world.c, d: c.world.d, x: 0, y: 0 });
        const k = M.decompose(L.a, L.b, L.c, L.d);
        Object.assign(b, { x: M.round(lx, 2), y: M.round(ly, 2), rotation: M.round(k.rot, 2), scaleX: M.round(k.sx, 4), scaleY: M.round(k.sy, 4), shearX: 0, shearY: M.round(k.shy, 2) });
      }
      for (const c of comp.atts) {
        const nb = pose.boneMap[c.bone];
        const T = M.mul(M.invert({ a: nb.a, b: nb.b, c: nb.c, d: nb.d, x: nb.wx, y: nb.wy }), c.old); // old bone space → new bone space
        const a = c.att, s0 = c.start;
        const pt = (x, y) => M.apply(T, x, y);
        if (a.type === 'region' || a.type === 'point') {
          const lm = M.mul(T, M.compose(s0.x, s0.y, s0.rotation, s0.scaleX || 1, s0.scaleY || 1, 0, 0));
          const k = M.decompose(lm.a, lm.b, lm.c, lm.d);
          a.x = M.round(lm.x, 2); a.y = M.round(lm.y, 2); a.rotation = M.round(k.rot, 2);
          if (a.type === 'region') { a.scaleX = M.round(k.sx, 4); a.scaleY = M.round(k.sy, 4); }
        } else if (a.verts) {
          a.verts = s0.verts.map((v, i) => (i % 2 ? pt(s0.verts[i - 1], v)[1] : pt(v, s0.verts[i + 1])[0]));
          if (a.uvMap) a.uvMap = M.mul(T, s0.uvMap);
        } else if (a.points) {
          a.points = s0.points.map((p) => { const q = pt(p.x, p.y), i = pt(p.ix, p.iy), o = pt(p.ox, p.oy); return { x: q[0], y: q[1], ix: i[0], iy: i[1], ox: o[0], oy: o[1] }; });
        }
      }
    },
    dragAtt(d, sx, sy, wx, wy, e) {
      const att = d.ref.att, s = d.start, pose = ed.pose;
      const slot = pose.slotMap[d.ref.slot]; if (!slot) return;
      const b = slot.bone, inv = M.invert({ a: b.a, b: b.b, c: b.c, d: b.d, x: 0, y: 0 });
      let dx = wx - d.wx, dy = wy - d.wy;
      if (e.shiftKey && d.tool === 'translate') { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const [lx, ly] = M.applyVec(inv, dx, dy);
      const tr = (arr) => arr.map((v, i) => (i % 2 ? v + ly : v + lx));
      if (d.tool === 'translate') {
        if (att.type === 'region' || att.type === 'point') { att.x = M.round(s.x + lx, 2); att.y = M.round(s.y + ly, 2); }
        else if (att.type === 'mesh' && !att.weights) { att.verts = tr(s.verts); if (att.uvMap) { att.uvMap = Object.assign({}, s.uvMap, { x: s.uvMap.x + lx, y: s.uvMap.y + ly }); } }
        else if ((att.type === 'bbox' || att.type === 'clip') && !att.weights) att.verts = tr(s.verts);
        else if (att.type === 'path') att.points = s.points.map((p) => ({ x: p.x + lx, y: p.y + ly, ix: p.ix + lx, iy: p.iy + ly, ox: p.ox + lx, oy: p.oy + ly }));
      } else if (d.tool === 'rotate' && (att.type === 'region' || att.type === 'point')) {
        const [px, py] = pose.localToWorld(b, s.x, s.y);
        const a0 = Math.atan2(d.wy - py, d.wx - px), a1 = Math.atan2(wy - py, wx - px);
        let deg = M.wrapDeg((a1 - a0) * M.RAD) * pose.parentSign(b) ; if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        att.rotation = M.round(s.rotation + deg, 2);
      } else if (d.tool === 'scale' && att.type === 'region') {
        const fx = Math.exp((sx - d.sx) / 150), fy = e.shiftKey ? fx : Math.exp(-(sy - d.sy) / 150);
        att.scaleX = M.round(s.scaleX * fx, 3); att.scaleY = M.round(s.scaleY * fy, 3);
      }
      ed.changed('values');
    },
    vertDelta(d, i, dx, dy) {
      if (!d.vtool || d.vtool === 'translate') return [dx, dy];
      const x0 = d.world0[i * 2] - d.pivot[0], y0 = d.world0[i * 2 + 1] - d.pivot[1];
      if (d.vtool === 'rotate') {
        let a = Math.atan2(this.mouse.wy - d.pivot[1], this.mouse.wx - d.pivot[0]) - d.a0;
        if (ed.snap.on) a = Math.round(a * M.RAD / ed.snap.angle) * ed.snap.angle * M.DEG;
        const c = Math.cos(a), s = Math.sin(a);
        return [x0 * c - y0 * s - x0, x0 * s + y0 * c - y0];
      }
      const fx = Math.exp((this.mouse.sx - d.sx) / 150), fy = this.shiftDown ? fx : Math.exp(-(this.mouse.sy - d.sy) / 150);
      return [x0 * fx - x0, y0 * fy - y0];
    },
    dragVerts(d, wx, wy) {
      const dx = wx - d.wx, dy = wy - d.wy, att = d.ref.att;
      if (ed.mode === 'setup') {
        Object.assign(att, Model.clone(d.att0));
        if (d.vtool || ((att.type === 'bbox' || att.type === 'clip') && att.weights)) {
          const world = Array.from(MO.worldVerts(d.setupPose, d.ref.slot, att));
          d.idx.forEach((i) => { const [ddx, ddy] = this.vertDelta(d, i, dx, dy); world[i * 2] += ddx; world[i * 2 + 1] += ddy; });
          MO.setWorldVerts(d.setupPose, d.ref.slot, att, world);
        } else if (att.type === 'bbox' || att.type === 'clip') {
          const slot = d.setupPose.slotMap[d.ref.slot];
          const inv = M.invert({ a: slot.bone.a, b: slot.bone.b, c: slot.bone.c, d: slot.bone.d, x: 0, y: 0 });
          const [lx, ly] = M.applyVec(inv, dx, dy);
          d.idx.forEach((i) => { att.verts[i * 2] += lx; att.verts[i * 2 + 1] += ly; });
        } else if (att.type === 'mesh') {
          const world = Array.from(MO.worldVerts(d.setupPose, d.ref.slot, att));
          const slot = d.setupPose.slotMap[d.ref.slot];
          d.idx.forEach((i) => {
            world[i * 2] += dx; world[i * 2 + 1] += dy;
            if (!d.alt && att.uvMap) { // slide over the image: update uv too
              const l = d.setupPose.worldToLocal(slot.bone, world[i * 2], world[i * 2 + 1]);
              const uv = MO.localToUV(att, l[0], l[1]);
              att.uvs[i * 2] = M.clamp(uv[0], 0, 1); att.uvs[i * 2 + 1] = M.clamp(uv[1], 0, 1);
              const bl = MO.uvToLocal(att, att.uvs[i * 2], att.uvs[i * 2 + 1]);
              const back = d.setupPose.localToWorld(slot.bone, bl[0], bl[1]);
              world[i * 2] = back[0]; world[i * 2 + 1] = back[1];
            }
          });
          MO.setWorldVerts(d.setupPose, d.ref.slot, att, world);
        }
        ed.changed('values');
        return;
      }
      // animate: deform
      if (!d.def0) return;
      const def = d.def0.slice(), sel = new Set(d.idx);
      if (d.geo.weights) {
        d.entryInv.forEach((en, k) => { if (!sel.has(en.vi)) return; const [ddx, ddy] = this.vertDelta(d, en.vi, dx, dy); const l = M.applyVec(en.inv, ddx, ddy); def[k * 2] += l[0]; def[k * 2 + 1] += l[1]; });
      } else {
        sel.forEach((i) => { const [ddx, ddy] = this.vertDelta(d, i, dx, dy); const l = M.applyVec(d.inv, ddx, ddy); def[i * 2] += l[0]; def[i * 2 + 1] += l[1]; });
      }
      ed.setDeform(d.ref.slot, d.defName, def, false);
    },
    dragPath(d, wx, wy) {
      const att = d.ref.att, pose = ed.pose, slot = pose.slotMap[d.ref.slot];
      const inv = M.invert({ a: slot.bone.a, b: slot.bone.b, c: slot.bone.c, d: slot.bone.d, x: 0, y: 0 });
      const [lx, ly] = M.applyVec(inv, wx - d.wx, wy - d.wy);
      att.points = Model.clone(d.start);
      const p = att.points[d.i], s = d.start[d.i];
      if (d.h === 'p') {
        for (const i of ed.vertSel) { const q = att.points[i], s0 = d.start[i]; if (!q) continue; q.x = s0.x + lx; q.y = s0.y + ly; q.ix = s0.ix + lx; q.iy = s0.iy + ly; q.ox = s0.ox + lx; q.oy = s0.oy + ly; }
      } else {
        const k = d.h === 'i' ? ['ix', 'iy', 'ox', 'oy'] : ['ox', 'oy', 'ix', 'iy'];
        p[k[0]] = s[k[0]] + lx; p[k[1]] = s[k[1]] + ly;
        if (!d.alt) { // mirror the opposite handle (keep its length)
          const vx = p[k[0]] - p.x, vy = p[k[1]] - p.y, L = Math.hypot(vx, vy) || 1;
          const oL = Math.hypot(s[k[2]] - s.x, s[k[3]] - s.y);
          p[k[2]] = p.x - (vx / L) * oL; p[k[3]] = p.y - (vy / L) * oL;
        }
      }
      ed.changed('values');
    },
    up(e) {
      const d = this.drag; this.drag = null;
      if (!d) return;
      if (d.type === 'marquee') {
        const x0 = Math.min(d.sx, this.mouse.sx), x1 = Math.max(d.sx, this.mouse.sx), y0 = Math.min(d.sy, this.mouse.sy), y1 = Math.max(d.sy, this.mouse.sy);
        if (x1 - x0 > 3 || y1 - y0 > 3) {
          const refs = d.additive ? ed.sel.slice() : [];
          for (const b of ed.pose.bones) { const [sx, sy] = this.toScreen(b.wx, b.wy); if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && !refs.some((r) => r.k === 'bone' && r.n === b.name)) refs.push({ k: 'bone', n: b.name }); }
          ed.selectMany(refs);
        }
      } else if (d.type === 'meshClick') {
        const moved = Math.hypot(this.mouse.sx - d.sx, this.mouse.sy - d.sy);
        if (moved > 4) this.vertMarquee(d);
        else this.meshAddPoint(d);
      } else if (d.type === 'create') {
        const b = Model.bone(ed.sk, d.bone);
        if (b && b.length * this.cam.zoom < 3) b.length = 0;
        ed.changed('structure');
      } else if (d.type === 'bones' || d.type === 'att' || d.type === 'verts' || d.type === 'paint' || d.type === 'pathHandle') {
        ed.changed('structure');
      }
    },
    vertMarquee(d) {
      const pose = ed.pose, slot = pose.slotMap[d.ref.slot]; if (!slot) return;
      const g = pose.geometry(slot, d.ref.att); if (!g) return;
      const x0 = Math.min(d.sx, this.mouse.sx), x1 = Math.max(d.sx, this.mouse.sx), y0 = Math.min(d.sy, this.mouse.sy), y1 = Math.max(d.sy, this.mouse.sy);
      if (!d.shift) ed.vertSel.clear();
      const list = g.pts ? g.pts.map((p) => [p.x, p.y]) : Array.from({ length: g.verts.length / 2 }, (_, i) => [g.verts[i * 2], g.verts[i * 2 + 1]]);
      list.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ed.vertSel.add(i); });
      ed.emit('selection-verts');
    },
    meshAddPoint(d) {
      const { att, slot: slotName } = d.ref;
      if (ed.mode !== 'setup') { ed.vertSel.clear(); ed.emit('selection-verts'); return; }
      const pose = ed.computePose(0), slot = pose.slotMap[slotName];
      if (!slot) return;
      const [lx, ly] = pose.worldToLocal(slot.bone, d.wx, d.wy);
      ed.pushUndo('Add vertex');
      if (att.type === 'mesh') {
        let uv;
        if (!att.weights && att.uvMap) uv = MO.localToUV(att, lx, ly);
        else { // weighted: find uv by barycentric in world
          const world = MO.worldVerts(pose, slotName, att); let best = null, bs = -Infinity;
          for (let t = 0; t < att.triangles.length; t += 3) {
            const [i, j, k] = [att.triangles[t], att.triangles[t + 1], att.triangles[t + 2]];
            const w = MO.bary(d.wx, d.wy, world[i * 2], world[i * 2 + 1], world[j * 2], world[j * 2 + 1], world[k * 2], world[k * 2 + 1]);
            const sc = Math.min(...w); if (sc > bs) { bs = sc; best = [i, j, k, w]; }
          }
          if (!best) return;
          const [i, j, k, w] = best;
          uv = [att.uvs[i * 2] * w[0] + att.uvs[j * 2] * w[1] + att.uvs[k * 2] * w[2], att.uvs[i * 2 + 1] * w[0] + att.uvs[j * 2 + 1] * w[1] + att.uvs[k * 2 + 1] * w[2]];
        }
        uv = [M.clamp(uv[0], 0, 1), M.clamp(uv[1], 0, 1)];
        const hullUV = att.uvs.slice(0, att.hull * 2);
        const asHull = d.shift || !M.pointInPoly(uv[0], uv[1], hullUV);
        const idx = MO.addVertex(pose, slotName, att, uv[0], uv[1], asHull);
        MO.invalidateDeforms(ed.sk, slotName, att.name);
        ed.vertSel.clear(); ed.vertSel.add(idx);
      } else if (att.type === 'bbox' || att.type === 'clip') {
        const v = Array.from(MO.worldVerts(pose, slotName, att)), n = v.length / 2;
        let at = n;
        if (n >= 3) { let bd = Infinity; for (let i = 0; i < n; i++) { const j = (i + 1) % n; const dd = M.segDist(d.wx, d.wy, v[i * 2], v[i * 2 + 1], v[j * 2], v[j * 2 + 1]); if (dd < bd) { bd = dd; at = j === 0 ? n : j; } } }
        if (att.weights && n >= 2) MO.polyInsert(pose, slotName, att, at, d.wx, d.wy);
        else att.verts.splice(at * 2, 0, M.round(lx, 2), M.round(ly, 2));
        MO.invalidateDeforms(ed.sk, slotName, att.name);
        ed.vertSel.clear(); ed.vertSel.add(at);
      } else if (att.type === 'path') {
        const pts = att.points, last = pts[pts.length - 1];
        let hx = 30, hy = 0;
        if (last) { const vx = lx - last.x, vy = ly - last.y, L = Math.hypot(vx, vy) || 1; hx = (vx / L) * Math.min(60, L / 3); hy = (vy / L) * Math.min(60, L / 3); }
        pts.push({ x: lx, y: ly, ix: lx - hx, iy: ly - hy, ox: lx + hx, oy: ly + hy });
        ed.vertSel.clear(); ed.vertSel.add(pts.length - 1);
      } else if (att.type === 'point') { att.x = M.round(lx, 2); att.y = M.round(ly, 2); }
      ed.changed('structure');
    },
    deleteSelectedVerts() {
      const sel = ed.selAttachment(); if (!sel || !ed.vertSel.size || ed.mode !== 'setup') return false;
      const att = sel.att;
      ed.pushUndo('Delete vertices');
      if (att.type === 'mesh') {
        const pose = ed.computePose(0);
        if (!MO.removeVertices(pose, sel.slot, att, ed.vertSel)) { ed.undoStack.pop(); ed.setStatus('A mesh hull needs at least 3 vertices'); return true; }
      } else if (att.type === 'bbox' || att.type === 'clip') {
        if (att.weights) { if (!MO.polyRemove(ed.computePose(0), sel.slot, att, ed.vertSel)) { ed.undoStack.pop(); ed.setStatus('A polygon needs at least 3 vertices'); return true; } }
        else att.verts = att.verts.filter((_, k) => !ed.vertSel.has(k >> 1));
      } else if (att.type === 'path') att.points = att.points.filter((_, i) => !ed.vertSel.has(i));
      MO.invalidateDeforms(ed.sk, sel.slot, att.name);
      ed.vertSel.clear(); ed.changed('structure');
      return true;
    },
    dbl(e) {
      const [sx, sy] = this.local(e);
      const hb = this.hitBone(sx, sy);
      if (hb) ed.emit('rename', { k: 'bone', n: hb.name });
    },
  };

  A.VP = VP;
})(window.A);
