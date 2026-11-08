/* Alike Studio — pose solver: world transforms, constraints, physics, animation sampling.
   Also usable as a lightweight runtime. */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, DEG = M.DEG, RAD = M.RAD;
  const FIELD = { rotate: 'rot', x: 'x', y: 'y', scaleX: 'sx', scaleY: 'sy', shearX: 'shx', shearY: 'shy' };

  class Pose {
    constructor(project, skinName) {
      this.project = project;
      this.sk = project.skeleton;
      this.skinName = skinName || 'default';
      this.build();
    }

    build() {
      const sk = this.sk;
      const skins = [].concat(this.skinName).map((n) => Model.skin(sk, n)).filter(Boolean); // a skin name, or [active, ...pinned]
      const skinBones = new Set(skins.flatMap((s) => s.bones)), skinCons = new Set(skins.flatMap((s) => s.constraints));
      this.bones = []; this.boneMap = {};
      for (const d of sk.bones) {
        const b = { data: d, name: d.name, parent: null, children: [], a: 1, b: 0, c: 0, d: 1, wx: 0, wy: 0, q: null };
        b.active = !d.skinRequired || skinBones.has(d.name);
        this.bones.push(b); this.boneMap[d.name] = b;
      }
      for (const b of this.bones) {
        if (b.data.parent && this.boneMap[b.data.parent]) {
          b.parent = this.boneMap[b.data.parent]; b.parent.children.push(b);
          if (!b.parent.active) b.active = false;
        }
      }
      this.slots = []; this.slotMap = {};
      for (const d of sk.slots) {
        const s = { data: d, name: d.name, bone: this.boneMap[d.bone], color: d.color.slice(), dark: d.dark ? d.dark.slice() : null, attachment: d.attachment, deform: {}, seq: {} };
        if (!s.bone) continue;
        this.slots.push(s); this.slotMap[d.name] = s;
      }
      this.drawOrder = this.slots.slice();
      this.cons = []; this.conMap = {};
      for (const d of sk.constraints) {
        const c = Object.assign({}, d, { data: d });
        c.active = d.enabled !== false && (!d.skinRequired || skinCons.has(d.name));
        this.cons.push(c); this.conMap[d.name] = c;
      }
      this.setToSetup();
    }

    setToSetup() {
      for (const b of this.bones) {
        const d = b.data;
        b.x = d.x; b.y = d.y; b.rot = d.rotation; b.sx = d.scaleX; b.sy = d.scaleY; b.shx = d.shearX; b.shy = d.shearY;
      }
      for (const s of this.slots) {
        s.color = s.data.color.slice(); s.dark = s.data.dark ? s.data.dark.slice() : null;
        s.attachment = s.data.attachment; s.deform = {}; s.seq = {};
      }
      this.drawOrder = this.slots.slice();
      for (const c of this.cons) for (const k in c.data) if (typeof c.data[k] === 'number' || typeof c.data[k] === 'boolean') c[k] = c.data[k];
    }

    attachmentOf(slot) { return Model.getAttachment(this.sk, this.skinName, slot.name, slot.attachment); }

    /* ---------- animation ---------- */
    applyAnimation(anim, t, alpha = 1, opts = {}) {
      if (!anim) return;
      const folders = [];
      for (const tl of anim.timelines) {
        if (!tl.keys.length) continue;
        switch (tl.type) {
          case 'drawFolder': folders.push(tl); break; // applied after the main draw order
          case 'bone': {
            const b = this.boneMap[tl.target]; if (!b) break;
            const kv = Model.sample(tl, t); const f = FIELD[tl.prop];
            const val = Model.boneValueFromKey(b.data, tl.prop, kv);
            if (opts.additive) {
              const setup = Model.boneSetupValue(b.data, tl.prop);
              if (tl.prop === 'scaleX' || tl.prop === 'scaleY') b[f] *= 1 + (kv - 1) * alpha; else b[f] += (val - setup) * alpha;
            } else b[f] += (val - b[f]) * alpha;
            break;
          }
          case 'slot': {
            const s = this.slotMap[tl.target]; if (!s) break;
            const v = Model.sample(tl, t);
            if (tl.prop === 'attachment') { if (alpha >= 0.5) s.attachment = v; }
            else if (tl.prop === 'color') { for (let i = 0; i < 4; i++) s.color[i] += (v[i] - s.color[i]) * alpha; }
            else if (tl.prop === 'dark') { s.dark = s.dark || [0, 0, 0]; for (let i = 0; i < 3; i++) s.dark[i] += (v[i] - s.dark[i]) * alpha; }
            break;
          }
          case 'deform': {
            const s = this.slotMap[tl.target]; if (!s) break;
            const v = Model.sample(tl, t); if (!v) break;
            const cur = s.deform[tl.attachment];
            if (cur && alpha < 1) s.deform[tl.attachment] = cur.map((x, i) => x + ((v[i] || 0) - x) * alpha);
            else s.deform[tl.attachment] = alpha < 1 ? v.map((x) => x * alpha) : v;
            break;
          }
          case 'drawOrder': {
            if (alpha < 0.5 || opts.drawOrder === false) break;
            const v = Model.sample(tl, t); if (!v) break;
            const used = new Set(), order = [];
            for (const n of v) if (this.slotMap[n] && !used.has(n)) { order.push(this.slotMap[n]); used.add(n); }
            for (const s of this.slots) if (!used.has(s.name)) order.push(s);
            this.drawOrder = order;
            break;
          }
          case 'constraint': {
            const c = this.conMap[tl.target]; if (!c) break;
            const v = Model.sample(tl, t);
            if (typeof v === 'boolean') { if (alpha >= 0.5) c[tl.prop] = v; }
            else if (typeof v === 'number') c[tl.prop] += (v - c[tl.prop]) * alpha;
            break;
          }
          case 'sequence': {
            const s = this.slotMap[tl.target]; if (!s) break;
            const ks = tl.keys; let k = null;
            for (const kk of ks) if (kk.t <= t + 1e-6) k = kk;
            if (!k) break;
            const att = Model.getAttachment(this.sk, this.skinName, tl.target, tl.attachment);
            const count = att && att.sequence ? att.sequence.count : 1;
            const v = k.v, delay = v.delay || 1 / 15;
            let fr = Math.floor((t - k.t) / delay + 1e-6), idx = v.index || 0;
            switch (v.mode) {
              case 'hold': break;
              case 'once': idx = Math.min(count - 1, idx + fr); break;
              case 'loop': idx = (idx + fr) % count; break;
              case 'pingpong': { const n = Math.max(1, count * 2 - 2); let p = (idx + fr) % n; idx = p < count ? p : n - p; break; }
              case 'reverse': idx = ((idx - fr) % count + count) % count; break;
            }
            s.seq[tl.attachment] = idx;
            break;
          }
        }
      }
      for (const tl of folders) this.applyDrawFolder(tl, t, alpha, opts);
    }

    /* A draw order folder key reorders only the folder's slots, inside the places they currently hold,
       so folders keyed on different tracks layer on top of each other. */
    applyDrawFolder(tl, t, alpha, opts) {
      if (alpha < 0.5 || opts.drawOrder === false) return;
      const v = Model.sample(tl, t); if (!v) return;
      const f = tl.target, dO = this.drawOrder.slice(), pos = [];
      for (let i = 0; i < dO.length; i++) if (dO[i].data.folder === f) pos.push(i);
      if (!pos.length) return;
      const used = new Set(), order = [];
      for (const n of v) { const s = this.slotMap[n]; if (s && s.data.folder === f && !used.has(n)) { order.push(s); used.add(n); } }
      for (const s of this.slots) if (s.data.folder === f && !used.has(s.name)) order.push(s);
      pos.forEach((p, i) => { dO[p] = order[i]; });
      this.drawOrder = dO;
    }

    /* Collect events whose key time lies in (from, to]. Handles no wrap (caller splits). */
    collectEvents(anim, from, to, out) {
      if (!anim) return;
      for (const tl of anim.timelines) if (tl.type === 'event') for (const k of tl.keys) if (k.t > from && k.t <= to) out.push(Object.assign({ time: k.t }, k.v));
    }

    /* ---------- world transforms ---------- */
    inheritQ(p, d) {
      let a = p.a, b = p.b, c = p.c, dd = p.d;
      const det = a * dd - b * c;
      if (d.inheritRotation && d.inheritScale) {
        if (!d.inheritReflection && det < 0) { b = -b; dd = -dd; }
        return { a, b, c, d: dd };
      }
      if (!d.inheritRotation && !d.inheritScale) return { a: 1, b: 0, c: 0, d: 1 };
      if (d.inheritRotation) { // rotation only
        const r = Math.atan2(c, a), cs = Math.cos(r), sn = Math.sin(r);
        if (det < 0 && d.inheritReflection) return { a: cs, b: sn, c: sn, d: -cs };
        return { a: cs, b: -sn, c: sn, d: cs };
      }
      // scale only
      const sx = Math.hypot(a, c) || 1; let sy = det / sx;
      if (!d.inheritReflection) sy = Math.abs(sy);
      return { a: sx, b: 0, c: 0, d: sy };
    }
    computeWorld(b) {
      const rx = (b.arot + b.ashx) * DEG, ry = (b.arot + 90 + b.ashy) * DEG;
      const la = Math.cos(rx) * b.asx, lb = Math.cos(ry) * b.asy, lc = Math.sin(rx) * b.asx, ld = Math.sin(ry) * b.asy;
      const p = b.parent;
      if (!p) { b.a = la; b.b = lb; b.c = lc; b.d = ld; b.wx = b.ax; b.wy = b.ay; b.q = { a: 1, b: 0, c: 0, d: 1 }; return; }
      b.wx = p.a * b.ax + p.b * b.ay + p.wx;
      b.wy = p.c * b.ax + p.d * b.ay + p.wy;
      const q = this.inheritQ(p, b.data); b.q = q;
      b.a = q.a * la + q.b * lc; b.b = q.a * lb + q.b * ld;
      b.c = q.c * la + q.d * lc; b.d = q.c * lb + q.d * ld;
    }
    updateSubtree(b) {
      this.computeWorld(b);
      for (const c of b.children) this.updateSubtree(c);
    }
    parentSign(b) { const q = b.q; return q && q.a * q.d - q.b * q.c < 0 ? -1 : 1; }
    worldRot(b) { return Math.atan2(b.c, b.a) * RAD; }
    worldScaleX(b) { return Math.hypot(b.a, b.c); }
    worldScaleY(b) { return Math.hypot(b.b, b.d); }
    /* move bone so its world origin is at x,y (applied values) */
    setWorldPos(b, x, y) {
      if (!b.parent) { b.ax = x; b.ay = y; return; }
      const p = b.parent, inv = M.invert({ a: p.a, b: p.b, c: p.c, d: p.d, x: p.wx, y: p.wy });
      const l = M.apply(inv, x, y); b.ax = l[0]; b.ay = l[1];
    }
    rotateWorld(b, deg) { b.arot += deg * this.parentSign(b); }
    worldToLocal(b, x, y) { return M.apply(M.invert({ a: b.a, b: b.b, c: b.c, d: b.d, x: b.wx, y: b.wy }), x, y); }
    localToWorld(b, x, y) { return [b.a * x + b.b * y + b.wx, b.c * x + b.d * y + b.wy]; }
    /* local (animated) values of a bone from a world-space target position (for editor dragging) */
    parentWorldToLocal(b, x, y) {
      if (!b.parent) return [x, y];
      const p = b.parent; return M.apply(M.invert({ a: p.a, b: p.b, c: p.c, d: p.d, x: p.wx, y: p.wy }), x, y);
    }

    /* full update: sliders → world → constraints (in order) */
    update(dt = 0, physStore = null) {
      // sliders operate on local (animated) values, before the world pass
      for (const c of this.cons) {
        if (c.type !== 'slider' || !c.active) continue;
        const anim = Model.anim(this.sk, c.animation); if (!anim) continue;
        let t = c.time;
        const drv = c.bone && this.boneMap[c.bone];
        if (drv) t = drv[FIELD[c.property] || 'x'] * c.scale + c.offset;
        const dur = Model.animDuration(anim) || 0;
        if (c.loop && dur > 0) t = ((t % dur) + dur) % dur; else t = M.clamp(t, 0, dur);
        this.applyAnimation(anim, t, M.clamp(c.mix, 0, 1), { additive: c.additive });
      }
      for (const b of this.bones) {
        b.ax = b.x; b.ay = b.y; b.arot = b.rot; b.asx = b.sx; b.asy = b.sy; b.ashx = b.shx; b.ashy = b.shy;
        this.computeWorld(b);
      }
      for (const c of this.cons) {
        if (!c.active) continue;
        switch (c.type) {
          case 'ik': this.applyIK(c); break;
          case 'transform': this.applyTransform(c); break;
          case 'path': this.applyPath(c); break;
          case 'physics': this.applyPhysics(c, dt, physStore); break;
        }
      }
    }

    /* ---------- IK ---------- */
    applyIK(c) {
      const tgt = this.boneMap[c.target]; if (!tgt || !c.bones.length) return;
      const mix = M.clamp(c.mix, 0, 1); if (mix <= 0 && !c.stretch) return;
      let tx = tgt.wx, ty = tgt.wy;
      if (c.bones.length === 1) {
        const b = this.boneMap[c.bones[0]]; if (!b) return;
        const want = Math.atan2(ty - b.wy, tx - b.wx) * RAD;
        const cur = this.worldRot(b);
        this.rotateWorld(b, M.wrapDeg(want - cur) * mix);
        const len = b.data.length * this.worldScaleX(b);
        if (len > 0.0001) {
          const d = Math.hypot(tx - b.wx, ty - b.wy);
          if ((c.stretch && d > len) || (c.compress && d < len)) {
            const s = 1 + (d / len - 1) * mix; b.asx *= s; if (c.uniform) b.asy *= s; else if (c.volume) b.asy /= s;
          }
        }
        this.updateSubtree(b);
        return;
      }
      const p = this.boneMap[c.bones[0]], ch = this.boneMap[c.bones[1]];
      if (!p || !ch) return;
      const ox = p.wx, oy = p.wy;
      const l1 = Math.hypot(ch.wx - ox, ch.wy - oy);
      const l2 = ch.data.length * this.worldScaleX(ch);
      let dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy) || 1e-6;
      const reach = l1 + l2;
      let stretchK = 1;
      if (c.stretch && d > reach && reach > 0) stretchK = 1 + (d / reach - 1) * mix;
      // softness: ease the approach to full extension
      let dd = d;
      if (c.softness > 0 && reach > 0) {
        const s = c.softness, start = reach * stretchK - s;
        if (dd > start) dd = start + s * (1 - Math.exp(-(dd - start) / s));
      }
      const L1 = l1 * stretchK, L2 = l2 * stretchK;
      dd = M.clamp(dd, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-6);
      const base = Math.atan2(dy, dx);
      let cosA = (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd || 1e-6);
      const alpha = Math.acos(M.clamp(cosA, -1, 1));
      const bend = c.bendPositive ? 1 : -1;
      const a1 = base + alpha * bend;
      // compensate for child not lying on parent's x axis
      const phi = Math.atan2(ch.wy - oy, ch.wx - ox) - Math.atan2(p.c, p.a);
      const want1 = (a1 - phi) * RAD;
      this.rotateWorld(p, M.wrapDeg(want1 - this.worldRot(p)) * mix);
      if (stretchK !== 1) { p.asx *= stretchK; if (c.uniform) p.asy *= stretchK; else if (c.volume) p.asy /= stretchK; }
      this.updateSubtree(p);
      // child aims at the (softened) target point
      const ex = ox + Math.cos(base) * dd, ey = oy + Math.sin(base) * dd;
      const want2 = Math.atan2(ey - ch.wy, ex - ch.wx) * RAD;
      this.rotateWorld(ch, M.wrapDeg(want2 - this.worldRot(ch)) * mix);
      if (stretchK !== 1) { const cur = ch.data.length * this.worldScaleX(ch); if (cur > 1e-6) { const k2 = L2 / cur; ch.asx *= k2; if (c.uniform) ch.asy *= k2; else if (c.volume) ch.asy /= k2; } }
      this.updateSubtree(ch);
    }

    /* ---------- Transform constraint ---------- */
    /* value of a bone property in local (applied) or world space */
    propValue(b, prop, world) {
      if (world) {
        switch (prop) {
          case 'rotate': return this.worldRot(b); case 'x': return b.wx; case 'y': return b.wy;
          case 'scaleX': return this.worldScaleX(b); case 'scaleY': return this.worldScaleY(b);
          case 'shearY': return M.wrapDeg((Math.atan2(b.d, b.b) - Math.atan2(b.c, b.a)) * RAD - 90);
        }
        return 0;
      }
      switch (prop) { case 'rotate': return b.arot; case 'x': return b.ax; case 'y': return b.ay; case 'scaleX': return b.asx; case 'scaleY': return b.asy; case 'shearY': return b.ashy; }
      return 0;
    }
    /* 4.3-style transform constraint: each mapping drives one property from another (any type) */
    applyMappings(c, t) {
      const MIX = { rotate: 'mixRotate', x: 'mixX', y: 'mixY', scaleX: 'mixScaleX', scaleY: 'mixScaleY', shearY: 'mixShearY' };
      const AF = { rotate: 'arot', x: 'ax', y: 'ay', scaleX: 'asx', scaleY: 'asy', shearY: 'ashy' };
      const srcWorld = c.sourceSpace === 'world';
      for (const bn of c.bones) {
        const b = this.boneMap[bn]; if (!b || b === t) continue;
        for (const m of c.mappings) {
          const mix = c[MIX[m.to]] != null ? c[MIX[m.to]] : 1; if (!mix) continue;
          let v = (this.propValue(t, m.from, srcWorld) - (m.fromOffset || 0)) * (m.scale == null ? 1 : m.scale) + (m.toOffset || 0);
          if (m.clamp) v = M.clamp(v, m.min == null ? -Infinity : m.min, m.max == null ? Infinity : m.max);
          const f = AF[m.to];
          if (c.relative) b[f] += v * mix;
          else b[f] += (v - b[f]) * mix;
        }
        this.updateSubtree(b);
      }
    }
    applyTransform(c) {
      const t = this.boneMap[c.target]; if (!t) return;
      if (c.mappings && c.mappings.length) return this.applyMappings(c, t);
      for (const bn of c.bones) {
        const b = this.boneMap[bn]; if (!b || b === t) continue;
        if (c.local) {
          const k = c.relative ? 1 : 0;
          if (c.mixRotate) b.arot += (c.relative ? (t.arot + c.offRotate) : (t.arot + c.offRotate - b.arot)) * c.mixRotate;
          if (c.mixX) b.ax += (c.relative ? t.ax + c.offX : t.ax + c.offX - b.ax) * c.mixX;
          if (c.mixY) b.ay += (c.relative ? t.ay + c.offY : t.ay + c.offY - b.ay) * c.mixY;
          if (c.mixScaleX) b.asx *= k ? 1 + (t.asx - 1 + c.offScaleX) * c.mixScaleX : 1 + ((t.asx + c.offScaleX) / (b.asx || 1e-6) - 1) * c.mixScaleX;
          if (c.mixScaleY) b.asy *= k ? 1 + (t.asy - 1 + c.offScaleY) * c.mixScaleY : 1 + ((t.asy + c.offScaleY) / (b.asy || 1e-6) - 1) * c.mixScaleY;
          if (c.mixShearY) b.ashy += (c.relative ? t.ashy + c.offShearY : t.ashy + c.offShearY - b.ashy) * c.mixShearY;
          this.updateSubtree(b);
          continue;
        }
        // world space
        if (c.mixRotate) {
          const tr = this.worldRot(t) + c.offRotate;
          const d = c.relative ? tr : M.wrapDeg(tr - this.worldRot(b));
          this.rotateWorld(b, d * c.mixRotate); this.computeWorld(b);
        }
        if (c.mixX || c.mixY) {
          const [px, py] = this.localToWorld(t, c.offX, c.offY);
          let nx, ny;
          if (c.relative) { // add the target's own translation (relative to its parent), in world space
            const tp = t.parent, vx = tp ? tp.a * t.ax + tp.b * t.ay : t.ax, vy = tp ? tp.c * t.ax + tp.d * t.ay : t.ay;
            nx = b.wx + (vx + px - t.wx) * c.mixX; ny = b.wy + (vy + py - t.wy) * c.mixY;
          }
          else { nx = b.wx + (px - b.wx) * c.mixX; ny = b.wy + (py - b.wy) * c.mixY; }
          this.setWorldPos(b, nx, ny); this.computeWorld(b);
        }
        if (c.mixScaleX) {
          const bs = this.worldScaleX(b) || 1e-6, ts = this.worldScaleX(t) * (1 + c.offScaleX);
          const want = c.relative ? bs * ts : ts;
          b.asx *= 1 + (want / bs - 1) * c.mixScaleX;
        }
        if (c.mixScaleY) {
          const bs = this.worldScaleY(b) || 1e-6, ts = this.worldScaleY(t) * (1 + c.offScaleY);
          const want = c.relative ? bs * ts : ts;
          b.asy *= 1 + (want / bs - 1) * c.mixScaleY;
        }
        if (c.mixShearY) {
          const shOf = (x) => M.wrapDeg((Math.atan2(x.d, x.b) - Math.atan2(x.c, x.a)) * RAD - 90);
          const want = c.relative ? shOf(t) + c.offShearY : shOf(t) + c.offShearY - shOf(b);
          b.ashy += want * c.mixShearY;
        }
        this.updateSubtree(b);
      }
    }

    /* ---------- Path ---------- */
    pathWorld(slot, att) {
      const b = slot.bone, out = [];
      for (const p of att.points) {
        out.push({
          x: b.a * p.x + b.b * p.y + b.wx, y: b.c * p.x + b.d * p.y + b.wy,
          ix: b.a * p.ix + b.b * p.iy + b.wx, iy: b.c * p.ix + b.d * p.iy + b.wy,
          ox: b.a * p.ox + b.b * p.oy + b.wx, oy: b.c * p.ox + b.d * p.oy + b.wy,
        });
      }
      return out;
    }
    pathSampler(pts, closed, constantSpeed) {
      const segs = [];
      const n = pts.length; if (n < 2) return null;
      const count = closed ? n : n - 1;
      for (let i = 0; i < count; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        segs.push([a.x, a.y, a.ox, a.oy, b.ix, b.iy, b.x, b.y]);
      }
      const SUB = 24, table = []; let total = 0;
      segs.forEach((s, si) => {
        let px = s[0], py = s[1];
        for (let k = 1; k <= SUB; k++) {
          const u = k / SUB;
          const x = M.cubic(s[0], s[2], s[4], s[6], u), y = M.cubic(s[1], s[3], s[5], s[7], u);
          total += Math.hypot(x - px, y - py); table.push({ si, u, len: total }); px = x; py = y;
        }
      });
      const at = (si, u) => {
        const s = segs[si];
        const x = M.cubic(s[0], s[2], s[4], s[6], u), y = M.cubic(s[1], s[3], s[5], s[7], u);
        let dx = M.cubicD(s[0], s[2], s[4], s[6], u), dy = M.cubicD(s[1], s[3], s[5], s[7], u);
        if (Math.abs(dx) + Math.abs(dy) < 1e-6) { dx = s[6] - s[0]; dy = s[7] - s[1]; }
        return { x, y, angle: Math.atan2(dy, dx) * RAD };
      };
      return {
        total,
        at(dist) {
          if (closed) dist = ((dist % total) + total) % total;
          if (!constantSpeed) {
            const f = M.clamp(dist / (total || 1), 0, 1) * segs.length;
            const si = Math.min(segs.length - 1, Math.floor(f));
            return at(si, f - si);
          }
          if (dist <= 0) { const r = at(0, 0); if (dist < 0) { const a = r.angle * DEG; r.x += Math.cos(a) * dist; r.y += Math.sin(a) * dist; } return r; }
          if (dist >= total) { const r = at(segs.length - 1, 1); const a = r.angle * DEG, e = dist - total; r.x += Math.cos(a) * e; r.y += Math.sin(a) * e; return r; }
          let lo = 0, hi = table.length - 1;
          while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m].len < dist) lo = m; else hi = m; }
          const e1 = dist <= table[0].len ? { si: 0, u: 0, len: 0 } : table[lo], e2 = dist <= table[0].len ? table[0] : table[hi];
          const f = (dist - e1.len) / (e2.len - e1.len || 1);
          if (e1.si !== e2.si) return at(e2.si, e2.u * f);
          return at(e1.si, e1.u + (e2.u - e1.u) * f);
        },
      };
    }
    applyPath(c) {
      const slot = this.slotMap[c.target]; if (!slot) return;
      const att = this.attachmentOf(slot); if (!att || att.type !== 'path') return;
      const S = this.pathSampler(this.pathWorld(slot, att), att.closed, att.constantSpeed); if (!S) return;
      const bones = c.bones.map((n) => this.boneMap[n]).filter(Boolean); if (!bones.length) return;
      let dist = c.positionMode === 'percent' ? c.position * S.total : c.position;
      const pos = [];
      for (let i = 0; i < bones.length; i++) {
        pos.push(dist);
        const b = bones[i];
        let sp;
        switch (c.spacingMode) {
          case 'fixed': sp = c.spacing; break;
          case 'percent': sp = c.spacing * S.total; break;
          case 'proportional': sp = (S.total / bones.length) * (1 + c.spacing); break;
          default: sp = b.data.length * this.worldScaleX(b) + c.spacing;
        }
        dist += sp;
      }
      pos.push(dist);
      for (let i = 0; i < bones.length; i++) {
        const b = bones[i], P = S.at(pos[i]);
        this.setWorldPos(b, b.wx + (P.x - b.wx) * c.mixX, b.wy + (P.y - b.wy) * c.mixY);
        this.computeWorld(b);
        if (c.mixRotate) {
          let ang = P.angle;
          if (c.rotateMode !== 'tangent') { const N = S.at(pos[i + 1]); ang = Math.atan2(N.y - b.wy, N.x - b.wx) * RAD;
            if (c.rotateMode === 'chainScale') { const len = b.data.length * this.worldScaleX(b); if (len > 1e-4) b.asx *= 1 + (Math.hypot(N.x - b.wx, N.y - b.wy) / len - 1) * c.mixRotate; } }
          this.rotateWorld(b, M.wrapDeg(ang + c.offRotate - this.worldRot(b)) * c.mixRotate);
        }
        this.updateSubtree(b);
      }
    }

    /* ---------- Physics (spring–damper per bone) ---------- */
    applyPhysics(c, dt, store) {
      const b = this.boneMap[c.bone]; if (!b || !store) return;
      const st = store[c.name] = store[c.name] || { init: false };
      if (!st.init) Object.assign(st, { init: true, px: b.wx, py: b.wy, pvx: null, pvy: 0, ox: 0, oy: 0, vx: 0, vy: 0, r: 0, rv: 0, s: 0, sv: 0, acc: 0 });
      const len = Math.max(1, b.data.length * this.worldScaleX(b));
      const sxw = this.worldScaleX(b) || 1, ux = b.a / sxw, uy = b.c / sxw;
      if (dt > 0) {
        // pivot velocity / acceleration drive the spring (a moving pivot makes the bone lag behind)
        let vx = (b.wx - st.px) / dt, vy = (b.wy - st.py) / dt;
        st.px = b.wx; st.py = b.wy;
        const vl = Math.hypot(vx, vy);
        if (vl > c.limit) { vx *= c.limit / vl; vy *= c.limit / vl; }
        let ax = 0, ay = 0;
        if (st.pvx !== null) { ax = (vx - st.pvx) / dt; ay = (vy - st.pvy) / dt; }
        st.pvx = vx; st.pvy = vy;
        const h = 1 / Math.max(1, c.step);
        st.acc += Math.min(dt, 0.25);
        const m = Math.max(0.01, c.mass), k = Math.max(0, c.strength), damp = c.damping * 2 * Math.sqrt(k * m);
        const inr = c.inertia, gx = c.wind + (this.sk.wind || 0), gy = -(c.gravity + (this.sk.gravity || 0));
        while (st.acc >= h) {
          st.acc -= h;
          if (c.x) { st.vx += ((-k * st.ox - damp * st.vx) / m - ax * inr + gx) * h; st.ox += st.vx * h; }
          if (c.y) { st.vy += ((-k * st.oy - damp * st.vy) / m - ay * inr + gy) * h; st.oy += st.vy * h; }
          if (c.rotate || c.shearX) {
            const cr = Math.cos(st.r), sr = Math.sin(st.r), rx = ux * cr - uy * sr, ry = ux * sr + uy * cr;
            const torque = ((rx * gy - ry * gx) - (rx * ay - ry * ax) * inr) / len;
            st.rv += ((-k * st.r - damp * st.rv) / m + torque) * h; st.r += st.rv * h;
            if (st.r > 3) { st.r = 3; st.rv = 0; } else if (st.r < -3) { st.r = -3; st.rv = 0; }
          }
          if (c.scaleX) { st.sv += ((-k * st.s - damp * st.sv) / m - ((ux * ax + uy * ay) / len) * inr) * h; st.s += st.sv * h; }
        }
      }
      const mix = c.mix;
      if (c.x || c.y) { this.setWorldPos(b, b.wx + st.ox * mix, b.wy + st.oy * mix); }
      if (c.rotate) b.arot += st.r * RAD * mix * this.parentSign(b);
      if (c.shearX) b.ashx += st.r * RAD * mix;
      if (c.scaleX) { const k = Math.max(0.05, 1 + st.s * mix); b.asx *= k; if (c.volume) b.asy /= k; }
      this.updateSubtree(b);
    }

    /* ---------- geometry for rendering / hit testing ---------- */
    /* Returns { verts: world flat, uvs, tris, att, imagePath } or null */
    geometry(slot, attIn) {
      const att = attIn || this.attachmentOf(slot); if (!att) return null;
      const b = slot.bone;
      const seqPath = (a) => {
        if (!a.sequence) return a.path;
        const sq = a.sequence; const idx = slot.seq[a.name] != null ? slot.seq[a.name] : (sq.setup || 0);
        return a.path + String((sq.start || 0) + idx).padStart(sq.digits || 0, '0');
      };
      if (att.type === 'region') {
        const lm = M.compose(att.x, att.y, att.rotation, att.scaleX, att.scaleY, 0, 0);
        const hw = att.width / 2, hh = att.height / 2;
        const corners = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
        const verts = new Float32Array(8);
        for (let i = 0; i < 4; i++) {
          const [lx, ly] = M.apply(lm, corners[i * 2], corners[i * 2 + 1]);
          verts[i * 2] = b.a * lx + b.b * ly + b.wx; verts[i * 2 + 1] = b.c * lx + b.d * ly + b.wy;
        }
        return { verts, uvs: [0, 1, 1, 1, 1, 0, 0, 0], tris: [0, 1, 2, 2, 3, 0], att, image: seqPath(att), hull: 4 };
      }
      if (att.type === 'mesh' || att.type === 'linkedmesh') {
        let geo = att, defName = att.name;
        if (att.type === 'linkedmesh') {
          geo = Model.getAttachment(this.sk, this.skinName, att.parentSlot || slot.name, att.parent);
          if (!geo || geo.type !== 'mesh') return null;
          if (att.inheritDeform) defName = geo.name;
        }
        const verts = this.meshWorld(slot, geo, slot.deform[defName]);
        return { verts, uvs: geo.uvs, tris: geo.triangles, att, image: seqPath(att), hull: geo.hull, geo };
      }
      if (att.type === 'bbox' || att.type === 'clip') {
        return { verts: this.meshWorld(slot, att, slot.deform[att.name]), att, polygon: true };
      }
      if (att.type === 'point') {
        const [x, y] = this.localToWorld(b, att.x, att.y);
        return { verts: new Float32Array([x, y]), att, angle: this.worldRot(b) + att.rotation };
      }
      if (att.type === 'path') return { pts: this.pathWorld(slot, att), att };
      return null;
    }
    meshWorld(slot, geo, def) {
      const b = slot.bone;
      if (!geo.weights) {
        const v = geo.verts, out = new Float32Array(v.length);
        for (let i = 0; i < v.length; i += 2) {
          const lx = v[i] + (def ? def[i] || 0 : 0), ly = v[i + 1] + (def ? def[i + 1] || 0 : 0);
          out[i] = b.a * lx + b.b * ly + b.wx; out[i + 1] = b.c * lx + b.d * ly + b.wy;
        }
        return out;
      }
      const out = new Float32Array(geo.weights.length * 2);
      let e = 0;
      geo.weights.forEach((vw, i) => {
        let x = 0, y = 0;
        for (const w of vw) {
          const bb = this.boneMap[w.b];
          const lx = w.x + (def ? def[e * 2] || 0 : 0), ly = w.y + (def ? def[e * 2 + 1] || 0 : 0);
          e++;
          if (!bb) continue;
          x += (bb.a * lx + bb.b * ly + bb.wx) * w.w; y += (bb.c * lx + bb.d * ly + bb.wy) * w.w;
        }
        out[i * 2] = x; out[i * 2 + 1] = y;
      });
      return out;
    }
  }

  Pose.FIELD = FIELD;
  A.Pose = Pose;
})(window.A);
