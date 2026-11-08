/* Alike Studio — math utilities (original implementation) */
window.A = window.A || {};
(function (A) {
  'use strict';
  const DEG = Math.PI / 180, RAD = 180 / Math.PI;

  const M = {
    DEG, RAD,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    wrapDeg(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d; },
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    round(v, p = 3) { const k = Math.pow(10, p); return Math.round(v * k) / k; },

    /* ---------- Cubic bezier easing ----------
       Curve c = [x1, y1, x2, y2], normalized: x is fraction of time between keys,
       y is fraction of the value change. Returns eased fraction for time fraction x. */
    bezierAt(c, x) {
      const [x1, y1, x2, y2] = c;
      const bx = (s) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
      const by = (s) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
      const dbx = (s) => 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
      let s = x;
      for (let i = 0; i < 8; i++) {           // Newton iterations
        const e = bx(s) - x, d = dbx(s);
        if (Math.abs(e) < 1e-6) return by(s);
        if (Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      let lo = 0, hi = 1; s = x;               // bisection fallback
      for (let i = 0; i < 40; i++) {
        const v = bx(s);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = s; else hi = s;
        s = (lo + hi) / 2;
      }
      return by(s);
    },

    /* Evaluate a point on a cubic bezier segment */
    cubic(p0, p1, p2, p3, t) {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    },
    cubicD(p0, p1, p2, p3, t) {
      const u = 1 - t;
      return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
    },

    /* ---------- Affine (a b / c d, x y) ---------- */
    mat(a = 1, b = 0, c = 0, d = 1, x = 0, y = 0) { return { a, b, c, d, x, y }; },
    apply(m, lx, ly) { return [m.a * lx + m.b * ly + m.x, m.c * lx + m.d * ly + m.y]; },
    applyVec(m, lx, ly) { return [m.a * lx + m.b * ly, m.c * lx + m.d * ly]; },
    invert(m) {
      const det = m.a * m.d - m.b * m.c || 1e-9, id = 1 / det;
      const a = m.d * id, b = -m.b * id, c = -m.c * id, d = m.a * id;
      return { a, b, c, d, x: -(a * m.x + b * m.y), y: -(c * m.x + d * m.y) };
    },
    mul(m, n) { // m * n
      return {
        a: m.a * n.a + m.b * n.c, b: m.a * n.b + m.b * n.d,
        c: m.c * n.a + m.d * n.c, d: m.c * n.b + m.d * n.d,
        x: m.a * n.x + m.b * n.y + m.x, y: m.c * n.x + m.d * n.y + m.y,
      };
    },
    /* Compose a local transform (rotation in degrees, with shear) */
    compose(x, y, rot, sx, sy, shx, shy) {
      const rx = (rot + shx) * DEG, ry = (rot + 90 + shy) * DEG;
      return { a: Math.cos(rx) * sx, b: Math.cos(ry) * sy, c: Math.sin(rx) * sx, d: Math.sin(ry) * sy, x, y };
    },
    /* Decompose a 2x2 into rotation, scaleX, scaleY, shearY (shearX = 0) */
    decompose(a, b, c, d) {
      const sx = Math.hypot(a, c);
      const rot = Math.atan2(c, a) * RAD;
      const det = a * d - b * c;
      const sign = det < 0 ? -1 : 1;
      const sy = Math.hypot(b, d) * sign;
      let shy = Math.atan2(d * sign, b * sign) * RAD - rot - 90;
      shy = M.wrapDeg(shy);
      return { rot, sx, sy, shy };
    },

    /* ---------- Geometry ---------- */
    segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = M.clamp(t, 0, 1);
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    },
    pointInPoly(px, py, pts) { // pts flat [x,y,...]
      let inside = false;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
      }
      return inside;
    },
    polyArea(pts) {
      let s = 0;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) s += (pts[j] - pts[i]) * (pts[j + 1] + pts[i + 1]);
      return s / 2;
    },

    /* Ear-clipping triangulation of a simple polygon (flat array). Returns index list. */
    earClip(pts) {
      const n = pts.length / 2;
      if (n < 3) return [];
      const idx = [];
      for (let i = 0; i < n; i++) idx.push(i);
      if (M.polyArea(pts) < 0) idx.reverse();
      const tris = [];
      const P = (i) => [pts[i * 2], pts[i * 2 + 1]];
      const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const inTri = (p, a, b, c) => {
        const d1 = cross(p, a, b), d2 = cross(p, b, c), d3 = cross(p, c, a);
        return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
      };
      let guard = 0;
      while (idx.length > 3 && guard++ < 10000) {
        let clipped = false;
        for (let i = 0; i < idx.length; i++) {
          const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
          const a = P(ia), b = P(ib), c = P(ic);
          if (cross(a, b, c) <= 1e-9) continue; // reflex (expects CCW)
          let ok = true;
          for (const j of idx) {
            if (j === ia || j === ib || j === ic) continue;
            if (inTri(P(j), a, b, c)) { ok = false; break; }
          }
          if (!ok) continue;
          tris.push(ia, ib, ic);
          idx.splice(i, 1);
          clipped = true;
          break;
        }
        if (!clipped) { // degenerate: fan the rest
          for (let i = 1; i < idx.length - 1; i++) tris.push(idx[0], idx[i], idx[i + 1]);
          return tris;
        }
      }
      if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
      return tris;
    },

    /* Delaunay (Bowyer–Watson). pts flat. Optional hull count: triangles whose
       centroid is outside the first `hull` points' polygon are discarded. */
    delaunay(pts, hull) {
      const n = pts.length / 2;
      if (n < 3) return [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        minX = Math.min(minX, pts[i * 2]); maxX = Math.max(maxX, pts[i * 2]);
        minY = Math.min(minY, pts[i * 2 + 1]); maxY = Math.max(maxY, pts[i * 2 + 1]);
      }
      const dm = Math.max(maxX - minX, maxY - minY) * 20 || 1000, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
      const P = pts.slice();
      P.push(mx - dm, my - dm, mx, my + dm, mx + dm, my - dm);
      const s0 = n, s1 = n + 1, s2 = n + 2;
      const circ = (i, j, k) => {
        const ax = P[i * 2], ay = P[i * 2 + 1], bx = P[j * 2], by = P[j * 2 + 1], cx = P[k * 2], cy = P[k * 2 + 1];
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
        return { i, j, k, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
      };
      let tris = [circ(s0, s1, s2)];
      for (let p = 0; p < n; p++) {
        const px = P[p * 2], py = P[p * 2 + 1];
        const bad = [], keep = [];
        for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 <= t.r2 * (1 + 1e-9) ? bad : keep).push(t);
        const edges = new Map();
        for (const t of bad) for (const [a, b] of [[t.i, t.j], [t.j, t.k], [t.k, t.i]]) {
          const key = a < b ? a + ',' + b : b + ',' + a;
          edges.set(key, edges.has(key) ? null : [a, b]);
        }
        tris = keep;
        for (const e of edges.values()) if (e) tris.push(circ(e[0], e[1], p));
      }
      const out = [];
      const hullPts = hull >= 3 ? pts.slice(0, hull * 2) : null;
      for (const t of tris) {
        if (t.i >= n || t.j >= n || t.k >= n) continue;
        if (hullPts) {
          const cx = (P[t.i * 2] + P[t.j * 2] + P[t.k * 2]) / 3, cy = (P[t.i * 2 + 1] + P[t.j * 2 + 1] + P[t.k * 2 + 1]) / 3;
          if (!M.pointInPoly(cx, cy, hullPts)) continue;
        }
        out.push(t.i, t.j, t.k);
      }
      return out;
    },

    /* Convex hull (monotone chain), input array of [x,y]; returns CCW list */
    convexHull(points) {
      const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (p.length < 3) return p;
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
      up.pop(); lo.pop();
      return lo.concat(up);
    },
    /* Reduce a closed polygon to `count` vertices by removing least significant points */
    simplifyPoly(poly, count) {
      const p = poly.slice();
      while (p.length > count) {
        let best = -1, bestA = Infinity;
        for (let i = 0; i < p.length; i++) {
          const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
          const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
          if (area < bestA) { bestA = area; best = i; }
        }
        p.splice(best, 1);
      }
      return p;
    },

    /* ---------- Color ---------- */
    hexToRgba(hex) {
      hex = (hex || 'ffffffff').replace('#', '');
      if (hex.length === 6) hex += 'ff';
      const v = [];
      for (let i = 0; i < 8; i += 2) v.push(parseInt(hex.substr(i, 2), 16) / 255);
      return v;
    },
    rgbaToHex(c, alpha = true) {
      const h = (x) => Math.round(M.clamp(x, 0, 1) * 255).toString(16).padStart(2, '0');
      return h(c[0]) + h(c[1]) + h(c[2]) + (alpha ? h(c[3] == null ? 1 : c[3]) : '');
    },
    cssColor(c, alphaMul = 1) {
      return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${(c[3] == null ? 1 : c[3]) * alphaMul})`;
    },
  };
  A.M = M;
})(window.A);
