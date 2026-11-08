// Alike runtime for Unity — atlas UV mapping and clipping-polygon triangle clipping (engine independent).
using System;
using System.Collections.Generic;

namespace Alike
{
    public static class AtlasUV
    {
        /// <summary>Map an attachment uv (0..1 of the original image, v down) to page uv (v down).</summary>
        public static void Map(AtlasRegion r, AtlasPage p, float u, float v, out float pu, out float pv)
        {
            float px = u * r.ow - r.ox, py = v * r.oh - r.oy;
            if (!r.rot) { pu = (r.x + px) / p.w; pv = (r.y + py) / p.h; }
            else { pu = (r.x + r.h - py) / p.w; pv = (r.y + px) / p.h; }
        }
    }

    public static class Clipper
    {
        /// <summary>Ear-clipping triangulation of a simple polygon (flat x,y). Returns index triples.</summary>
        public static List<int> EarClip(float[] pts)
        {
            int n = pts.Length / 2; var tris = new List<int>(); if (n < 3) return tris;
            var idx = new List<int>(); for (int i = 0; i < n; i++) idx.Add(i);
            float area = 0; for (int i = 0, j = n - 1; i < n; j = i++) area += (pts[j * 2] - pts[i * 2]) * (pts[j * 2 + 1] + pts[i * 2 + 1]);
            if (area < 0) idx.Reverse(); // ensure counter-clockwise
            Func<int, int, int, float> cross = (a, b, c) => (pts[b * 2] - pts[a * 2]) * (pts[c * 2 + 1] - pts[a * 2 + 1]) - (pts[b * 2 + 1] - pts[a * 2 + 1]) * (pts[c * 2] - pts[a * 2]);
            int guard = 0;
            while (idx.Count > 3 && guard++ < 10000)
            {
                bool clipped = false;
                for (int i = 0; i < idx.Count; i++)
                {
                    int ia = idx[(i + idx.Count - 1) % idx.Count], ib = idx[i], ic = idx[(i + 1) % idx.Count];
                    if (cross(ia, ib, ic) <= 1e-9f) continue;
                    bool ok = true;
                    foreach (int j in idx)
                    {
                        if (j == ia || j == ib || j == ic) continue;
                        float d1 = cross(j, ia, ib), d2 = cross(j, ib, ic), d3 = cross(j, ic, ia);
                        bool neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
                        if (!(neg && pos)) { ok = false; break; }
                    }
                    if (!ok) continue;
                    tris.Add(ia); tris.Add(ib); tris.Add(ic); idx.RemoveAt(i); clipped = true; break;
                }
                if (!clipped) { for (int i = 1; i < idx.Count - 1; i++) { tris.Add(idx[0]); tris.Add(idx[i]); tris.Add(idx[i + 1]); } return tris; }
            }
            if (idx.Count == 3) { tris.Add(idx[0]); tris.Add(idx[1]); tris.Add(idx[2]); }
            return tris;
        }

        /// <summary>Clip-polygon decomposed into convex triangles (counter-clockwise).</summary>
        public static List<float[]> ConvexParts(float[] poly)
        {
            var parts = new List<float[]>(); var t = EarClip(poly);
            for (int i = 0; i < t.Count; i += 3)
            {
                float ax = poly[t[i] * 2], ay = poly[t[i] * 2 + 1], bx = poly[t[i + 1] * 2], by = poly[t[i + 1] * 2 + 1], cx = poly[t[i + 2] * 2], cy = poly[t[i + 2] * 2 + 1];
                if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) parts.Add(new[] { ax, ay, cx, cy, bx, by }); else parts.Add(new[] { ax, ay, bx, by, cx, cy });
            }
            return parts;
        }

        /// <summary>Keep the part of a polygon on the left (inside, for CCW clip polygons) or right of edge (x1,y1)→(x2,y2).</summary>
        public static List<float> HalfPlane(List<float> input, float x1, float y1, float x2, float y2, bool keepInside)
        {
            var output = new List<float>(); int n = input.Count / 2;
            for (int i = 0; i < n; i++)
            {
                float px = input[i * 2], py = input[i * 2 + 1], qx = input[(i + 1) % n * 2], qy = input[(i + 1) % n * 2 + 1];
                float sp = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1), sq = (x2 - x1) * (qy - y1) - (y2 - y1) * (qx - x1);
                if (!keepInside) { sp = -sp; sq = -sq; }
                bool pin = sp >= 0, qin = sq >= 0;
                if (pin) { output.Add(px); output.Add(py); }
                if (pin != qin) { float t = sp / (sp - sq); output.Add(px + (qx - px) * t); output.Add(py + (qy - py) * t); }
            }
            return output;
        }

        /// <summary>Sutherland–Hodgman: clip a polygon (flat) by a convex CCW polygon. Returns flat points.</summary>
        public static List<float> ClipConvex(List<float> subject, float[] clip)
        {
            var output = subject; int cn = clip.Length / 2;
            for (int e = 0; e < cn && output.Count >= 6; e++)
                output = HalfPlane(output, clip[e * 2], clip[e * 2 + 1], clip[(e + 1) % cn * 2], clip[(e + 1) % cn * 2 + 1], true);
            return output;
        }

        /// <summary>Polygon minus convex CCW polygon, as a list of convex pieces.</summary>
        public static List<List<float>> SubtractConvex(List<float> subject, float[] clip)
        {
            var pieces = new List<List<float>>(); var inside = subject; int cn = clip.Length / 2;
            for (int e = 0; e < cn && inside.Count >= 6; e++)
            {
                float x1 = clip[e * 2], y1 = clip[e * 2 + 1], x2 = clip[(e + 1) % cn * 2], y2 = clip[(e + 1) % cn * 2 + 1];
                var outside = HalfPlane(inside, x1, y1, x2, y2, false);
                if (outside.Count >= 6) pieces.Add(outside);
                inside = HalfPlane(inside, x1, y1, x2, y2, true);
            }
            return pieces;
        }

        /// <summary>
        /// Clip triangle (world verts + uvs) against convex parts. Calls emit(x, y, u, v) for each output vertex,
        /// three per output triangle.
        /// </summary>
        public static void ClipTriangle(float ax, float ay, float bx, float by, float cx, float cy, float au, float av, float bu, float bv, float cu, float cv,
            List<float[]> parts, Action<float, float, float, float> emit)
        {
            float det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
            if (Math.Abs(det) < 1e-12f) return;
            foreach (var part in parts)
            {
                var poly = ClipConvex(new List<float> { ax, ay, bx, by, cx, cy }, part);
                if (poly.Count < 6) continue;
                if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) { /* keep winding; fan works either way */ }
                int n = poly.Count / 2;
                Action<int> put = (i) =>
                {
                    float x = poly[i * 2], y = poly[i * 2 + 1];
                    float l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
                    emit(x, y, au * l1 + bu * l2 + cu * l3, av * l1 + bv * l2 + cv * l3);
                };
                for (int i = 1; i < n - 1; i++) { put(0); put(i); put(i + 1); }
            }
        }

        /// <summary>Inverse clipping: emit the parts of the triangle OUTSIDE the clip polygon.</summary>
        public static void ClipTriangleInverse(float ax, float ay, float bx, float by, float cx, float cy, float au, float av, float bu, float bv, float cu, float cv,
            List<float[]> parts, Action<float, float, float, float> emit)
        {
            float det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
            if (Math.Abs(det) < 1e-12f) return;
            var pieces = new List<List<float>> { new List<float> { ax, ay, bx, by, cx, cy } };
            foreach (var part in parts)
            {
                var next = new List<List<float>>();
                foreach (var pc in pieces) next.AddRange(SubtractConvex(pc, part));
                pieces = next;
                if (pieces.Count == 0) return;
            }
            foreach (var poly in pieces)
            {
                int n = poly.Count / 2;
                Action<int> put = (i) =>
                {
                    float x = poly[i * 2], y = poly[i * 2 + 1];
                    float l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
                    emit(x, y, au * l1 + bu * l2 + cu * l3, av * l1 + bv * l2 + cv * l3);
                };
                for (int i = 1; i < n - 1; i++) { put(0); put(i); put(i + 1); }
            }
        }
    }
}
