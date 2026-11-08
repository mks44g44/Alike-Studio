/* Alike Studio — mesh building, triangulation and weight tools */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model;

  const MO = {
    regionMatrix(r) { // maps image-centered pixel coords (y up) to bone local
      return M.compose(r.x, r.y, r.rotation, r.scaleX, r.scaleY, 0, 0);
    },
    /* uvMap: uv (0..1, y down) -> bone local */
    uvToLocal(att, u, v) {
      const m = att.uvMap || { a: att.width, b: 0, c: 0, d: -att.height, x: -att.width / 2, y: att.height / 2 };
      return M.apply(m, u, v);
    },
    localToUV(att, x, y) {
      const m = att.uvMap || { a: att.width, b: 0, c: 0, d: -att.height, x: -att.width / 2, y: att.height / 2 };
      return M.apply(M.invert(m), x, y);
    },
    regionToMesh(r) {
      const rm = MO.regionMatrix(r);
      // uv -> image-centered pixels -> local
      const uvMap = M.mul(rm, { a: r.width, b: 0, c: 0, d: -r.height, x: -r.width / 2, y: r.height / 2 });
      const mesh = Model.newAttachment('mesh', r.name, { path: r.path, width: r.width, height: r.height, color: r.color.slice(), sequence: r.sequence ? Object.assign({}, r.sequence) : null });
      mesh.uvMap = uvMap;
      mesh.uvs = [0, 1, 1, 1, 1, 0, 0, 0];
      mesh.verts = [];
      for (let i = 0; i < 4; i++) { const p = M.apply(uvMap, mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]); mesh.verts.push(p[0], p[1]); }
      mesh.hull = 4;
      MO.triangulate(mesh);
      return mesh;
    },
    vertexCount(att) { return att.weights ? att.weights.length : att.verts.length / 2; },
    triangulate(att) {
      const pts = [];
      const n = MO.vertexCount(att);
      for (let i = 0; i < n; i++) pts.push(att.uvs[i * 2] * att.width, att.uvs[i * 2 + 1] * -att.height);
      let tris = n > att.hull ? M.delaunay(pts, att.hull) : M.earClip(pts.slice(0, att.hull * 2));
      if (!tris.length) tris = M.earClip(pts.slice(0, att.hull * 2));
      att.triangles = tris;
    },
    /* world positions of a mesh in a given pose */
    worldVerts(pose, slotName, att) {
      const slot = pose.slotMap[slotName]; if (!slot) return new Float32Array(0);
      return pose.meshWorld(slot, att, null);
    },
    /* set vertex positions from world coords (setup geometry, no deform) */
    setWorldVerts(pose, slotName, att, world) {
      const slot = pose.slotMap[slotName];
      if (!att.weights) {
        const inv = M.invert({ a: slot.bone.a, b: slot.bone.b, c: slot.bone.c, d: slot.bone.d, x: slot.bone.wx, y: slot.bone.wy });
        att.verts = [];
        for (let i = 0; i < world.length; i += 2) { const l = M.apply(inv, world[i], world[i + 1]); att.verts.push(l[0], l[1]); }
      } else {
        att.weights.forEach((vw, i) => {
          for (const e of vw) {
            const b = pose.boneMap[e.b]; if (!b) continue;
            const l = pose.worldToLocal(b, world[i * 2], world[i * 2 + 1]); e.x = l[0]; e.y = l[1];
          }
        });
      }
    },
    invalidateDeforms(sk, slotName, attName) {
      Model.eachAnim(sk, (an) => { an.timelines = an.timelines.filter((t) => !(t.type === 'deform' && t.target === slotName && t.attachment === attName)); });
    },
    /* add vertex at uv; if hull, insert into hull at nearest edge */
    addVertex(pose, slotName, att, u, v, asHull) {
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const slot = pose.slotMap[slotName];
      // world pos for the new vertex: interpolate from uv by barycentric of nearest triangle (handles weighted meshes)
      const wp = MO.uvToWorld(att, world, u, v, slot, pose);
      let idx;
      if (asHull) {
        // nearest hull edge in uv space
        let best = 0, bd = Infinity;
        for (let i = 0; i < att.hull; i++) {
          const j = (i + 1) % att.hull;
          const d = M.segDist(u, v, att.uvs[i * 2], att.uvs[i * 2 + 1], att.uvs[j * 2], att.uvs[j * 2 + 1]);
          if (d < bd) { bd = d; best = j; }
        }
        idx = best === 0 ? att.hull : best;
        att.hull++;
      } else idx = MO.vertexCount(att);
      att.uvs.splice(idx * 2, 0, u, v);
      world.splice(idx * 2, 0, wp[0], wp[1]);
      if (att.weights) {
        const w = MO.interpWeights(att, u, v);
        att.weights.splice(idx, 0, w);
      }
      MO.setWorldVerts(pose, slotName, att, world);
      MO.triangulate(att);
      return idx;
    },
    uvToWorld(att, world, u, v, slot, pose) {
      if (!att.weights && att.uvMap) { const l = MO.uvToLocal(att, u, v); return pose.localToWorld(slot.bone, l[0], l[1]); }
      // affine from first non-degenerate triangle containing / nearest
      const t = MO.findTri(att, u, v);
      if (!t) return [world[0] || 0, world[1] || 0];
      const [i, j, k, a, b, c] = t;
      return [world[i * 2] * a + world[j * 2] * b + world[k * 2] * c, world[i * 2 + 1] * a + world[j * 2 + 1] * b + world[k * 2 + 1] * c];
    },
    bary(px, py, ax, ay, bx, by, cx, cy) {
      const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay, v2x = px - ax, v2y = py - ay;
      const d = v0x * v1y - v1x * v0y || 1e-12;
      const b = (v2x * v1y - v1x * v2y) / d, c = (v0x * v2y - v2x * v0y) / d;
      return [1 - b - c, b, c];
    },
    findTri(att, u, v) {
      const T = att.triangles, U = att.uvs; let best = null, bestScore = -Infinity;
      for (let t = 0; t < T.length; t += 3) {
        const [i, j, k] = [T[t], T[t + 1], T[t + 2]];
        const w = MO.bary(u, v, U[i * 2], U[i * 2 + 1], U[j * 2], U[j * 2 + 1], U[k * 2], U[k * 2 + 1]);
        const score = Math.min(w[0], w[1], w[2]);
        if (score > bestScore) { bestScore = score; best = [i, j, k, w[0], w[1], w[2]]; }
      }
      return best;
    },
    interpWeights(att, u, v) {
      const t = MO.findTri(att, u, v); if (!t) return [];
      const acc = {};
      [[t[0], t[3]], [t[1], t[4]], [t[2], t[5]]].forEach(([vi, f]) => att.weights[vi].forEach((e) => { acc[e.b] = (acc[e.b] || 0) + e.w * Math.max(0, f); }));
      const out = Object.keys(acc).map((b) => ({ b, x: 0, y: 0, w: acc[b] })).filter((e) => e.w > 1e-4);
      const s = out.reduce((a, e) => a + e.w, 0) || 1; out.forEach((e) => (e.w /= s));
      return out.length ? out : att.weights[t[0]].map((e) => Object.assign({}, e));
    },
    removeVertices(pose, slotName, att, idxSet) {
      const n = MO.vertexCount(att);
      if (n - idxSet.size < 3) return false;
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const keep = [];
      for (let i = 0; i < n; i++) if (!idxSet.has(i)) keep.push(i);
      let hull = 0; for (let i = 0; i < att.hull; i++) if (!idxSet.has(i)) hull++;
      if (hull < 3) return false;
      att.uvs = keep.flatMap((i) => [att.uvs[i * 2], att.uvs[i * 2 + 1]]);
      const nw = keep.flatMap((i) => [world[i * 2], world[i * 2 + 1]]);
      if (att.weights) att.weights = keep.map((i) => att.weights[i]);
      att.hull = hull;
      MO.setWorldVerts(pose, slotName, att, nw);
      MO.triangulate(att);
      return true;
    },
    /* fill hull interior with a grid of vertices */
    generate(pose, slotName, att, spacingPx = 40) {
      const hullUV = att.uvs.slice(0, att.hull * 2);
      const W = att.width, H = att.height;
      // remove interior verts first
      const n = MO.vertexCount(att), inner = new Set(); for (let i = att.hull; i < n; i++) inner.add(i);
      if (inner.size) MO.removeVertices(pose, slotName, att, inner);
      const nx = Math.max(1, Math.round(W / spacingPx)), ny = Math.max(1, Math.round(H / spacingPx));
      for (let gy = 1; gy < ny; gy++) for (let gx = 1; gx < nx; gx++) {
        const u = gx / nx + (gy % 2 ? 0.5 / nx : 0), v = gy / ny;
        if (u >= 1) continue;
        if (!M.pointInPoly(u, v, hullUV)) continue;
        // keep some distance from hull edges
        let ok = true;
        for (let i = 0; i < att.hull; i++) { const j = (i + 1) % att.hull; if (M.segDist(u * W, v * H, hullUV[i * 2] * W, hullUV[i * 2 + 1] * H, hullUV[j * 2] * W, hullUV[j * 2 + 1] * H) < spacingPx * 0.35) { ok = false; break; } }
        if (ok) MO.addVertex(pose, slotName, att, u, v, false);
      }
      MO.triangulate(att);
    },
    /* trace an outline hull from image alpha */
    traceHull(pose, slotName, att, img, count = 12) {
      const cw = Math.min(256, img.naturalWidth), ch = Math.min(256, img.naturalHeight);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, cw, ch);
      const data = cx.getImageData(0, 0, cw, ch).data, pts = [];
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 16) {
          // only boundary-ish pixels (speed)
          const l = x === 0 || data[(y * cw + x - 1) * 4 + 3] <= 16, r = x === cw - 1 || data[(y * cw + x + 1) * 4 + 3] <= 16;
          if (l || r || y === 0 || y === ch - 1) pts.push([x / cw, y / ch]);
        }
      }
      if (pts.length < 3) return false;
      // pad a little so edges aren't cut
      const full = M.convexHull(pts);
      let hull = M.simplifyPoly(full, Math.max(3, count));
      // grow the simplified polygon about its centroid until it contains the full outline
      const ccx = hull.reduce((s, p) => s + p[0], 0) / hull.length, ccy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
      const pad = 2 / Math.max(cw, ch);
      let scaled = hull;
      for (let k = 1; k <= 40; k++) {
        const f = 1 + k * 0.01;
        scaled = hull.map(([u, v]) => [ccx + (u - ccx) * f, ccy + (v - ccy) * f]);
        const flat = scaled.flat();
        if (full.every(([u, v]) => M.pointInPoly(u + Math.sign(u - ccx) * pad, v + Math.sign(v - ccy) * pad, flat))) break;
      }
      hull = scaled.map(([u, v]) => [M.clamp(u, 0, 1), M.clamp(v, 0, 1)]);
      const uvMap = att.uvMap;
      att.weights = null;
      att.uvs = hull.flatMap((p) => p);
      att.hull = hull.length;
      att.verts = [];
      for (const [u, v] of hull) { const l = M.apply(uvMap, u, v); att.verts.push(l[0], l[1]); }
      MO.triangulate(att);
      return true;
    },

    /* trace the outline, then (uniform > 0) fill the inside with evenly spaced vertices: 0 = outline only, 1 = dense */
    trace(pose, slotName, att, img, count = 12, uniform = 0) {
      if (!MO.traceHull(pose, slotName, att, img, count)) return false;
      if (uniform > 0) {
        const size = Math.min(att.width || img.naturalWidth || 64, att.height || img.naturalHeight || 64);
        MO.generate(pose, slotName, att, Math.max(4, size * (0.45 - 0.33 * M.clamp(uniform, 0, 1))));
      }
      return true;
    },

    /* ---------- weights ---------- */
    boneSegDist(pose, bn, x, y) {
      const b = pose.boneMap[bn];
      const len = b.data.length;
      const tip = pose.localToWorld(b, len || 0.001, 0);
      return M.segDist(x, y, b.wx, b.wy, tip[0], tip[1]);
    },
    autoWeightsFor(pose, bones, x, y, maxInf = 4) {
      let ws = bones.map((bn) => ({ b: bn, d: MO.boneSegDist(pose, bn, x, y) }));
      ws.forEach((e) => (e.w = 1 / Math.pow(e.d + 1, 2.5)));
      ws.sort((a, b) => b.w - a.w);
      ws = ws.slice(0, maxInf);
      const s = ws.reduce((a, e) => a + e.w, 0) || 1;
      return ws.map((e) => ({ b: e.b, x: 0, y: 0, w: e.w / s })).filter((e) => e.w > 0.01);
    },
    bind(pose, slotName, att, bones) {
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const n = world.length / 2;
      att.weights = [];
      for (let i = 0; i < n; i++) {
        let w = MO.autoWeightsFor(pose, bones, world[i * 2], world[i * 2 + 1]);
        if (!w.length) w = [{ b: bones[0], x: 0, y: 0, w: 1 }];
        const s = w.reduce((a, e) => a + e.w, 0); w.forEach((e) => (e.w /= s));
        att.weights.push(w);
      }
      MO.setWorldVerts(pose, slotName, att, world);
    },
    unbind(pose, slotName, att) {
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      att.weights = null;
      MO.setWorldVerts(pose, slotName, att, world);
    },
    boundBones(att) {
      const s = new Set(); if (att.weights) att.weights.forEach((vw) => vw.forEach((e) => s.add(e.b)));
      return [...s];
    },
    addBones(pose, slotName, att, bones) {
      if (!att.weights) return MO.bind(pose, slotName, att, bones);
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const have = new Set(MO.boundBones(att));
      bones.forEach((b) => { if (!have.has(b)) att.weights.forEach((vw) => vw.push({ b, x: 0, y: 0, w: 0 })); });
      MO.setWorldVerts(pose, slotName, att, world);
    },
    auto(pose, slotName, att) {
      const bones = MO.boundBones(att); if (!bones.length) return;
      MO.bind(pose, slotName, att, bones);
    },
    normalizeVertex(vw) {
      const s = vw.reduce((a, e) => a + e.w, 0);
      if (s > 0) vw.forEach((e) => (e.w /= s)); else if (vw.length) vw.forEach((e) => (e.w = 1 / vw.length));
    },
    smooth(pose, slotName, att, amount = 0.5) {
      if (!att.weights) return;
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const n = att.weights.length, nb = Array.from({ length: n }, () => new Set());
      const T = att.triangles || [];
      for (let t = 0; t < T.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[T[t + a]].add(T[t + b]);
      if (!T.length) for (let i = 0; i < n; i++) { nb[i].add((i + 1) % n); nb[i].add((i + n - 1) % n); } // polygon ring
      const bones = MO.boundBones(att);
      const get = (vw, b) => { const e = vw.find((x) => x.b === b); return e ? e.w : 0; };
      const next = att.weights.map((vw, i) => {
        const m = {};
        bones.forEach((b) => {
          let avg = 0; nb[i].forEach((j) => (avg += get(att.weights[j], b)));
          avg = nb[i].size ? avg / nb[i].size : get(vw, b);
          m[b] = get(vw, b) * (1 - amount) + avg * amount;
        });
        const out = bones.map((b) => ({ b, x: 0, y: 0, w: m[b] })).filter((e) => e.w > 0.001);
        MO.normalizeVertex(out); return out;
      });
      att.weights = next;
      MO.setWorldVerts(pose, slotName, att, world);
    },
    prune(pose, slotName, att, threshold = 0.05, maxInf = 4) {
      if (!att.weights) return;
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      att.weights = att.weights.map((vw) => {
        let out = vw.filter((e) => e.w >= threshold).sort((a, b) => b.w - a.w).slice(0, maxInf);
        if (!out.length) out = [vw.slice().sort((a, b) => b.w - a.w)[0]];
        MO.normalizeVertex(out); return out;
      });
      MO.setWorldVerts(pose, slotName, att, world);
    },
    /* Weld: vertices of different meshes that sit within `tol` world units of each other are merged to one
       position and given identical (averaged) weights, so the meshes stay joined when they bend.
       items: [{ slot, att }] (meshes, bounding boxes or clipping). Unweighted ones get bound to their slot's bone. */
    weld(pose, items, tol = 2) {
      const all = [];
      const data = items.map((it, k) => {
        const world = Array.from(MO.worldVerts(pose, it.slot, it.att));
        const bone = pose.slotMap[it.slot] && pose.slotMap[it.slot].bone.name;
        const ws = it.att.weights ? it.att.weights.map((vw) => vw.map((e) => ({ b: e.b, w: e.w }))) : Array.from({ length: world.length / 2 }, () => [{ b: bone, w: 1 }]);
        for (let i = 0; i < world.length / 2; i++) all.push({ k, i, x: world[i * 2], y: world[i * 2 + 1] });
        return { world, ws, touched: false };
      });
      // union-find over vertices of *different* meshes within tolerance
      const parent = all.map((_, i) => i), find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
      const sorted = all.map((v, i) => i).sort((a, b) => all[a].x - all[b].x);
      for (let s = 0; s < sorted.length; s++) {
        const a = all[sorted[s]];
        for (let t = s + 1; t < sorted.length && all[sorted[t]].x - a.x <= tol; t++) {
          const b = all[sorted[t]];
          if (b.k !== a.k && Math.abs(b.y - a.y) <= tol && Math.hypot(b.x - a.x, b.y - a.y) <= tol) parent[find(sorted[s])] = find(sorted[t]);
        }
      }
      const groups = new Map();
      all.forEach((v, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(v); });
      let welded = 0;
      for (const g of groups.values()) {
        if (g.length < 2 || new Set(g.map((v) => v.k)).size < 2) continue;
        welded += g.length;
        const cx = g.reduce((s, v) => s + v.x, 0) / g.length, cy = g.reduce((s, v) => s + v.y, 0) / g.length, sum = {};
        for (const v of g) for (const e of data[v.k].ws[v.i]) sum[e.b] = (sum[e.b] || 0) + e.w / g.length;
        let w = Object.keys(sum).map((b) => ({ b, x: 0, y: 0, w: sum[b] })).sort((a, b) => b.w - a.w).slice(0, 4);
        MO.normalizeVertex(w);
        for (const v of g) { const d = data[v.k]; d.ws[v.i] = w.map((e) => Object.assign({}, e)); d.world[v.i * 2] = cx; d.world[v.i * 2 + 1] = cy; d.touched = true; }
      }
      items.forEach((it, k) => {
        const d = data[k]; if (!d.touched) return;
        it.att.weights = d.ws.map((vw) => vw.map((e) => ({ b: e.b, x: 0, y: 0, w: e.w })));
        if (it.att.type === 'mesh') it.att.verts = [];
        MO.setWorldVerts(pose, it.slot, it.att, d.world);
      });
      return welded;
    },
    /* meshes (in the active skin) whose vertices come within `tol` of this one */
    touchingMeshes(pose, sk, skinName, slotName, att, tol = 2) {
      const mine = MO.worldVerts(pose, slotName, att), out = [];
      for (const s of sk.slots) {
        if (!pose.slotMap[s.name]) continue;
        for (const an of Model.slotAttachmentNames(sk, s.name)) {
          const a = Model.getAttachment(sk, skinName, s.name, an);
          if (!a || a === att || !['mesh', 'bbox', 'clip'].includes(a.type)) continue;
          const w = MO.worldVerts(pose, s.name, a);
          let hit = false;
          for (let i = 0; i < mine.length && !hit; i += 2) for (let j = 0; j < w.length; j += 2) if (Math.abs(mine[i] - w[j]) <= tol && Math.abs(mine[i + 1] - w[j + 1]) <= tol) { hit = true; break; }
          if (hit) out.push({ slot: s.name, att: a });
        }
      }
      return out;
    },
    paint(pose, slotName, att, bone, wx, wy, radius, amount) {
      if (!att.weights) return false;
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      let touched = false;
      att.weights.forEach((vw, i) => {
        const d = Math.hypot(world[i * 2] - wx, world[i * 2 + 1] - wy);
        if (d > radius) return;
        const f = amount * (1 - d / radius);
        let e = vw.find((x) => x.b === bone);
        if (!e) { if (f <= 0) return; e = { b: bone, x: 0, y: 0, w: 0 }; vw.push(e); }
        const cur = e.w, target = M.clamp(cur + f, 0, 1);
        const others = vw.filter((x) => x !== e), os = others.reduce((a, x) => a + x.w, 0);
        e.w = target;
        if (others.length) {
          const rem = 1 - target;
          if (os > 1e-6) others.forEach((x) => (x.w = (x.w / os) * rem)); else others.forEach((x) => (x.w = rem / others.length));
        } else e.w = 1;
        att.weights[i] = vw.filter((x) => x.w > 1e-4 || x === e);
        if (!att.weights[i].length) att.weights[i] = [e];
        MO.normalizeVertex(att.weights[i]);
        touched = true;
      });
      if (touched) MO.setWorldVerts(pose, slotName, att, world);
      return touched;
    },
    /* insert a vertex into a polygon (bounding box / clipping) after index `at-1`, keeping weights consistent */
    polyInsert(pose, slotName, att, at, wx, wy) {
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const n = world.length / 2;
      world.splice(at * 2, 0, wx, wy);
      if (att.weights) {
        const a = (at - 1 + n) % n, b = at % n;
        const ax = world[a * 2], ay = world[a * 2 + 1], bx = world[(b >= at ? b + 1 : b) * 2], by = world[(b >= at ? b + 1 : b) * 2 + 1];
        const L = Math.hypot(bx - ax, by - ay) || 1, f = M.clamp(Math.hypot(wx - ax, wy - ay) / L, 0, 1);
        const acc = {};
        att.weights[a].forEach((e) => (acc[e.b] = (acc[e.b] || 0) + e.w * (1 - f)));
        att.weights[b].forEach((e) => (acc[e.b] = (acc[e.b] || 0) + e.w * f));
        const w = Object.keys(acc).map((k) => ({ b: k, x: 0, y: 0, w: acc[k] })).filter((e) => e.w > 1e-4);
        MO.normalizeVertex(w);
        att.weights.splice(at, 0, w);
        att.verts.splice(at * 2, 0, 0, 0);
      } else att.verts.splice(at * 2, 0, 0, 0);
      MO.setWorldVerts(pose, slotName, att, world);
    },
    polyRemove(pose, slotName, att, idxSet) {
      const world = Array.from(MO.worldVerts(pose, slotName, att));
      const n = world.length / 2; if (n - idxSet.size < 3) return false;
      const keep = []; for (let i = 0; i < n; i++) if (!idxSet.has(i)) keep.push(i);
      if (att.weights) att.weights = keep.map((i) => att.weights[i]);
      att.verts = keep.flatMap((i) => [att.verts[i * 2] || 0, att.verts[i * 2 + 1] || 0]);
      MO.setWorldVerts(pose, slotName, att, keep.flatMap((i) => [world[i * 2], world[i * 2 + 1]]));
      return true;
    },
    weightOf(att, i, bone) { if (!att.weights) return 0; const e = att.weights[i].find((x) => x.b === bone); return e ? e.w : 0; },
  };

  A.MeshOps = MO;
})(window.A);
