// Alike runtime for Unity — pose solver (port of js/pose.js): world transforms, IK, transform,
// path, physics and slider constraints, animation sampling with bezier curves, attachment geometry.
using System;
using System.Collections.Generic;

namespace Alike
{
    public struct Q2 { public float a, b, c, d; public Q2(float a, float b, float c, float d) { this.a = a; this.b = b; this.c = c; this.d = d; } }

    public class Bone
    {
        public BoneData data; public string name; public Bone parent; public List<Bone> children = new List<Bone>();
        public bool active = true;
        public float x, y, rot, sx, sy, shx, shy;          // local (animated)
        public float ax, ay, arot, asx, asy, ashx, ashy;   // applied (after constraints)
        public float a = 1, b, c, d = 1, wx, wy;           // world
        public Q2 q = new Q2(1, 0, 0, 1);
    }

    public class Slot
    {
        public SlotData data; public string name; public Bone bone;
        public float[] color = new float[4]; public float[] dark;
        public string attachment;
        public Dictionary<string, float[]> deform = new Dictionary<string, float[]>();
        public Dictionary<string, int> seq = new Dictionary<string, int>();
    }

    public class Constraint
    {
        public ConstraintData data; public string type, name; public bool active;
        public Dictionary<string, float> num = new Dictionary<string, float>();
        public Dictionary<string, bool> flag = new Dictionary<string, bool>();
        public float N(string k, float def = 0) { float v; return num.TryGetValue(k, out v) ? v : def; }
        public bool F(string k, bool def = false) { bool v; return flag.TryGetValue(k, out v) ? v : def; }
    }

    public class PhysicsState { public bool init; public float px, py, pvx, pvy, ox, oy, vx, vy, r, rv, s, sv, acc; public bool hasPv; }

    public class Geometry
    {
        public float[] verts, uvs; public int[] tris; public AttachmentData att; public string image; public int hull; public bool polygon; public float angle;
        public PathPoint[] pts;
    }

    public class Pose
    {
        const float DEG = (float)(Math.PI / 180), RAD = (float)(180 / Math.PI);
        public SkeletonData sk; public string skinName;
        public List<Bone> bones = new List<Bone>(); public Dictionary<string, Bone> boneMap = new Dictionary<string, Bone>();
        public List<Slot> slots = new List<Slot>(); public Dictionary<string, Slot> slotMap = new Dictionary<string, Slot>();
        public List<Slot> drawOrder = new List<Slot>();
        public List<Constraint> cons = new List<Constraint>(); public Dictionary<string, Constraint> conMap = new Dictionary<string, Constraint>();

        public Pose(SkeletonData data, string skin = "default") { sk = data; skinName = skin ?? "default"; Build(); }

        public void Build()
        {
            var skin = sk.FindSkin(skinName);
            bones.Clear(); boneMap.Clear();
            foreach (var d in sk.bones)
            {
                var b = new Bone { data = d, name = d.name, active = !d.skinRequired || (skin != null && skin.bones.Contains(d.name)) };
                bones.Add(b); boneMap[d.name] = b;
            }
            foreach (var b in bones)
            {
                Bone p;
                if (b.data.parent != null && boneMap.TryGetValue(b.data.parent, out p)) { b.parent = p; p.children.Add(b); if (!p.active) b.active = false; }
            }
            slots.Clear(); slotMap.Clear();
            foreach (var d in sk.slots)
            {
                Bone bb; if (!boneMap.TryGetValue(d.bone, out bb)) continue;
                var s = new Slot { data = d, name = d.name, bone = bb };
                slots.Add(s); slotMap[d.name] = s;
            }
            cons.Clear(); conMap.Clear();
            foreach (var d in sk.constraints)
            {
                var c = new Constraint { data = d, type = d.type, name = d.name, active = d.enabled && (!d.skinRequired || (skin != null && skin.constraints.Contains(d.name))) };
                cons.Add(c); conMap[d.name] = c;
            }
            SetToSetup();
        }

        public void SetToSetup()
        {
            foreach (var b in bones) { var d = b.data; b.x = d.x; b.y = d.y; b.rot = d.rotation; b.sx = d.scaleX; b.sy = d.scaleY; b.shx = d.shearX; b.shy = d.shearY; }
            foreach (var s in slots)
            {
                Array.Copy(s.data.color, s.color, 4);
                s.dark = s.data.dark != null ? (float[])s.data.dark.Clone() : null;
                s.attachment = s.data.attachment; s.deform.Clear(); s.seq.Clear();
            }
            drawOrder = new List<Slot>(slots);
            foreach (var c in cons) { c.num = new Dictionary<string, float>(c.data.num); c.flag = new Dictionary<string, bool>(c.data.flag); }
        }

        public AttachmentData AttachmentOf(Slot s) { return sk.GetAttachment(skinName, s.name, s.attachment); }

        /* ---------- animation ---------- */
        static float Bezier(float[] c, float x)
        {
            float x1 = c[0], y1 = c[1], x2 = c[2], y2 = c[3];
            Func<float, float> bx = s => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
            Func<float, float> by = s => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
            Func<float, float> dbx = s => 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
            float t = x;
            for (int i = 0; i < 8; i++) { float e = bx(t) - x, dd = dbx(t); if (Math.Abs(e) < 1e-6f) return by(t); if (Math.Abs(dd) < 1e-6f) break; t -= e / dd; }
            float lo = 0, hi = 1; t = x;
            for (int i = 0; i < 40; i++) { float v = bx(t); if (Math.Abs(v - x) < 1e-6f) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
            return by(t);
        }
        /* returns the key index whose segment contains t, and the eased fraction (-1 = before first / hold) */
        static Key Segment(Timeline tl, float t, out Key next, out float f)
        {
            var ks = tl.keys; next = null; f = 0;
            if (t <= ks[0].t) return ks[0];
            var last = ks[ks.Count - 1];
            if (t >= last.t) return last;
            int lo = 0, hi = ks.Count - 1;
            while (hi - lo > 1) { int mid = (lo + hi) >> 1; if (ks[mid].t <= t) lo = mid; else hi = mid; }
            var k0 = ks[lo]; var k1 = ks[hi];
            if (tl.discrete || k0.curve == 1) return k0;
            f = (t - k0.t) / (k1.t - k0.t == 0 ? 1 : k1.t - k0.t);
            if (k0.curve == 2 && k0.c != null) f = Bezier(k0.c, f);
            next = k1; return k0;
        }
        static float SampleNum(Timeline tl, float t)
        {
            Key n; float f; var k = Segment(tl, t, out n, out f);
            float a = k.v != null && k.v.Length > 0 ? k.v[0] : 0;
            if (n == null) return a;
            float b = n.v != null && n.v.Length > 0 ? n.v[0] : a;
            return a + (b - a) * f;
        }
        static float[] SampleArr(Timeline tl, float t)
        {
            Key n; float f; var k = Segment(tl, t, out n, out f);
            if (k.v == null) return null;
            if (n == null || n.v == null) return (float[])k.v.Clone();
            var o = new float[k.v.Length];
            for (int i = 0; i < o.Length; i++) { float b = i < n.v.Length ? n.v[i] : k.v[i]; o[i] = k.v[i] + (b - k.v[i]) * f; }
            return o;
        }
        static float SetupValue(BoneData b, string prop)
        {
            switch (prop) { case "rotate": return b.rotation; case "x": return b.x; case "y": return b.y; case "scaleX": return b.scaleX; case "scaleY": return b.scaleY; case "shearX": return b.shearX; case "shearY": return b.shearY; }
            return 0;
        }
        static float ValueFromKey(BoneData b, string prop, float key) { return prop == "scaleX" || prop == "scaleY" ? SetupValue(b, prop) * key : SetupValue(b, prop) + key; }
        static float GetField(Bone b, string p) { switch (p) { case "rotate": return b.rot; case "x": return b.x; case "y": return b.y; case "scaleX": return b.sx; case "scaleY": return b.sy; case "shearX": return b.shx; case "shearY": return b.shy; } return 0; }
        static void SetField(Bone b, string p, float v) { switch (p) { case "rotate": b.rot = v; break; case "x": b.x = v; break; case "y": b.y = v; break; case "scaleX": b.sx = v; break; case "scaleY": b.sy = v; break; case "shearX": b.shx = v; break; case "shearY": b.shy = v; break; } }

        public void ApplyAnimation(AnimationData anim, float t, float alpha = 1, bool additive = false, bool applyDrawOrder = true)
        {
            if (anim == null) return;
            List<Timeline> folders = null;
            foreach (var tl in anim.timelines)
            {
                if (tl.keys.Count == 0) continue;
                switch (tl.type)
                {
                    case "drawFolder": (folders ?? (folders = new List<Timeline>())).Add(tl); break; // applied after the main draw order
                    case "bone":
                        {
                            Bone b; if (!boneMap.TryGetValue(tl.target, out b)) break;
                            float kv = SampleNum(tl, t), val = ValueFromKey(b.data, tl.prop, kv), cur = GetField(b, tl.prop);
                            if (additive)
                            {
                                if (tl.prop == "scaleX" || tl.prop == "scaleY") SetField(b, tl.prop, cur * (1 + (kv - 1) * alpha));
                                else SetField(b, tl.prop, cur + (val - SetupValue(b.data, tl.prop)) * alpha);
                            }
                            else SetField(b, tl.prop, cur + (val - cur) * alpha);
                            break;
                        }
                    case "slot":
                        {
                            Slot s; if (!slotMap.TryGetValue(tl.target, out s)) break;
                            if (tl.prop == "attachment") { if (alpha >= 0.5f) { Key n; float f; s.attachment = Segment(tl, t, out n, out f).s; } }
                            else if (tl.prop == "color") { var v = SampleArr(tl, t); if (v != null) for (int i = 0; i < 4 && i < v.Length; i++) s.color[i] += (v[i] - s.color[i]) * alpha; }
                            else if (tl.prop == "dark") { var v = SampleArr(tl, t); if (v != null) { if (s.dark == null) s.dark = new float[3]; for (int i = 0; i < 3 && i < v.Length; i++) s.dark[i] += (v[i] - s.dark[i]) * alpha; } }
                            break;
                        }
                    case "deform":
                        {
                            Slot s; if (!slotMap.TryGetValue(tl.target, out s)) break;
                            var v = SampleArr(tl, t); if (v == null) break;
                            float[] cur;
                            if (s.deform.TryGetValue(tl.attachment, out cur) && alpha < 1) { var o = new float[cur.Length]; for (int i = 0; i < o.Length; i++) o[i] = cur[i] + ((i < v.Length ? v[i] : 0) - cur[i]) * alpha; s.deform[tl.attachment] = o; }
                            else { if (alpha < 1) for (int i = 0; i < v.Length; i++) v[i] *= alpha; s.deform[tl.attachment] = v; }
                            break;
                        }
                    case "drawOrder":
                        {
                            if (alpha < 0.5f || !applyDrawOrder) break;
                            Key n; float f; var k = Segment(tl, t, out n, out f); if (k.order == null) break;
                            var used = new HashSet<string>(); var order = new List<Slot>();
                            foreach (var nm in k.order) { Slot s; if (slotMap.TryGetValue(nm, out s) && used.Add(nm)) order.Add(s); }
                            foreach (var s in slots) if (!used.Contains(s.name)) order.Add(s);
                            drawOrder = order; break;
                        }
                    case "constraint":
                        {
                            Constraint c; if (!conMap.TryGetValue(tl.target, out c)) break;
                            if (tl.prop == "bendPositive" || c.flag.ContainsKey(tl.prop)) { if (alpha >= 0.5f) { Key n; float f; var k = Segment(tl, t, out n, out f); c.flag[tl.prop] = k.v != null && k.v[0] != 0; } }
                            else { float v = SampleNum(tl, t), cur = c.N(tl.prop); c.num[tl.prop] = cur + (v - cur) * alpha; }
                            break;
                        }
                    case "sequence":
                        {
                            Slot s; if (!slotMap.TryGetValue(tl.target, out s)) break;
                            Key k = null; foreach (var kk in tl.keys) if (kk.t <= t + 1e-6f) k = kk;
                            if (k == null || k.seq == null) break;
                            var att = sk.GetAttachment(skinName, tl.target, tl.attachment);
                            int count = att != null && att.sequence != null ? att.sequence.count : 1;
                            float delay = k.seq.delay > 0 ? k.seq.delay : 1f / 15;
                            int fr = (int)Math.Floor((t - k.t) / delay + 1e-6f), idx = k.seq.index;
                            switch (k.seq.mode)
                            {
                                case "once": idx = Math.Min(count - 1, idx + fr); break;
                                case "loop": idx = (idx + fr) % count; break;
                                case "pingpong": { int n2 = Math.Max(1, count * 2 - 2); int p = (idx + fr) % n2; idx = p < count ? p : n2 - p; break; }
                                case "reverse": idx = ((idx - fr) % count + count) % count; break;
                            }
                            s.seq[tl.attachment] = idx; break;
                        }
                }
            }
            if (folders != null) foreach (var tl in folders) ApplyDrawFolder(tl, t, alpha, applyDrawOrder);
        }

        /* a draw order folder key reorders only that folder's slots, inside the places they currently hold */
        void ApplyDrawFolder(Timeline tl, float t, float alpha, bool applyDrawOrder)
        {
            if (alpha < 0.5f || !applyDrawOrder) return;
            Key n; float f; var k = Segment(tl, t, out n, out f); if (k.order == null) return;
            string folder = tl.target; var pos = new List<int>();
            for (int i = 0; i < drawOrder.Count; i++) if (drawOrder[i].data.folder == folder) pos.Add(i);
            if (pos.Count == 0) return;
            var used = new HashSet<string>(); var order = new List<Slot>();
            foreach (var nm in k.order) { Slot s; if (slotMap.TryGetValue(nm, out s) && s.data.folder == folder && used.Add(nm)) order.Add(s); }
            foreach (var s in slots) if (s.data.folder == folder && !used.Contains(s.name)) order.Add(s);
            var dO = new List<Slot>(drawOrder);
            for (int i = 0; i < pos.Count; i++) dO[pos[i]] = order[i];
            drawOrder = dO;
        }

        public void CollectEvents(AnimationData anim, float from, float to, List<EventKey> outList)
        {
            if (anim == null) return;
            foreach (var tl in anim.timelines) if (tl.type == "event") foreach (var k in tl.keys) if (k.t > from && k.t <= to && k.ev != null) outList.Add(k.ev);
        }

        /* ---------- world transforms ---------- */
        public Q2 InheritQ(Bone p, BoneData d)
        {
            float a = p.a, b = p.b, c = p.c, dd = p.d, det = a * dd - b * c;
            if (d.inheritRotation && d.inheritScale) { if (!d.inheritReflection && det < 0) { b = -b; dd = -dd; } return new Q2(a, b, c, dd); }
            if (!d.inheritRotation && !d.inheritScale) return new Q2(1, 0, 0, 1);
            if (d.inheritRotation)
            {
                double r = Math.Atan2(c, a); float cs = (float)Math.Cos(r), sn = (float)Math.Sin(r);
                if (det < 0 && d.inheritReflection) return new Q2(cs, sn, sn, -cs);
                return new Q2(cs, -sn, sn, cs);
            }
            float sx = (float)Math.Sqrt(a * a + c * c); if (sx == 0) sx = 1; float sy = det / sx;
            if (!d.inheritReflection) sy = Math.Abs(sy);
            return new Q2(sx, 0, 0, sy);
        }
        public void ComputeWorld(Bone b)
        {
            double rx = (b.arot + b.ashx) * DEG, ry = (b.arot + 90 + b.ashy) * DEG;
            float la = (float)Math.Cos(rx) * b.asx, lb = (float)Math.Cos(ry) * b.asy, lc = (float)Math.Sin(rx) * b.asx, ld = (float)Math.Sin(ry) * b.asy;
            var p = b.parent;
            if (p == null) { b.a = la; b.b = lb; b.c = lc; b.d = ld; b.wx = b.ax; b.wy = b.ay; b.q = new Q2(1, 0, 0, 1); return; }
            b.wx = p.a * b.ax + p.b * b.ay + p.wx; b.wy = p.c * b.ax + p.d * b.ay + p.wy;
            var q = InheritQ(p, b.data); b.q = q;
            b.a = q.a * la + q.b * lc; b.b = q.a * lb + q.b * ld; b.c = q.c * la + q.d * lc; b.d = q.c * lb + q.d * ld;
        }
        public void UpdateSubtree(Bone b) { ComputeWorld(b); foreach (var c in b.children) UpdateSubtree(c); }
        public float ParentSign(Bone b) { return b.q.a * b.q.d - b.q.b * b.q.c < 0 ? -1 : 1; }
        public float WorldRot(Bone b) { return (float)Math.Atan2(b.c, b.a) * RAD; }
        public float WorldScaleX(Bone b) { return (float)Math.Sqrt(b.a * b.a + b.c * b.c); }
        public float WorldScaleY(Bone b) { return (float)Math.Sqrt(b.b * b.b + b.d * b.d); }
        static void Inv(float a, float b, float c, float d, float x, float y, out float ia, out float ib, out float ic, out float id, out float ix, out float iy)
        {
            float det = a * d - b * c; if (det == 0) det = 1e-9f; float k = 1 / det;
            ia = d * k; ib = -b * k; ic = -c * k; id = a * k; ix = -(ia * x + ib * y); iy = -(ic * x + id * y);
        }
        public void SetWorldPos(Bone b, float x, float y)
        {
            if (b.parent == null) { b.ax = x; b.ay = y; return; }
            var p = b.parent; float ia, ib, ic, id, ix, iy; Inv(p.a, p.b, p.c, p.d, p.wx, p.wy, out ia, out ib, out ic, out id, out ix, out iy);
            b.ax = ia * x + ib * y + ix; b.ay = ic * x + id * y + iy;
        }
        public void RotateWorld(Bone b, float deg) { b.arot += deg * ParentSign(b); }
        public void WorldToLocal(Bone b, float x, float y, out float lx, out float ly)
        {
            float ia, ib, ic, id, ix, iy; Inv(b.a, b.b, b.c, b.d, b.wx, b.wy, out ia, out ib, out ic, out id, out ix, out iy);
            lx = ia * x + ib * y + ix; ly = ic * x + id * y + iy;
        }
        public void LocalToWorld(Bone b, float x, float y, out float wx, out float wy) { wx = b.a * x + b.b * y + b.wx; wy = b.c * x + b.d * y + b.wy; }
        static float Wrap(float d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
        static float Clamp(float v, float a, float b) { return v < a ? a : v > b ? b : v; }

        public void Update(float dt = 0, Dictionary<string, PhysicsState> phys = null)
        {
            foreach (var c in cons)
            {
                if (c.type != "slider" || !c.active) continue;
                var anim = sk.FindAnimation(c.data.animation); if (anim == null) continue;
                float t = c.N("time");
                Bone drv; if (c.data.bone != null && boneMap.TryGetValue(c.data.bone, out drv)) t = GetField(drv, c.data.property ?? "x") * c.N("scale") + c.N("offset");
                float dur = SkeletonData.AnimDuration(anim);
                if (c.F("loop") && dur > 0) t = ((t % dur) + dur) % dur; else t = Clamp(t, 0, dur);
                ApplyAnimation(anim, t, Clamp(c.N("mix", 1), 0, 1), c.F("additive"));
            }
            foreach (var b in bones) { b.ax = b.x; b.ay = b.y; b.arot = b.rot; b.asx = b.sx; b.asy = b.sy; b.ashx = b.shx; b.ashy = b.shy; ComputeWorld(b); }
            foreach (var c in cons)
            {
                if (!c.active) continue;
                switch (c.type)
                {
                    case "ik": ApplyIK(c); break;
                    case "transform": ApplyTransform(c); break;
                    case "path": ApplyPath(c); break;
                    case "physics": ApplyPhysics(c, dt, phys); break;
                }
            }
        }

        /* ---------- IK ---------- */
        void ApplyIK(Constraint c)
        {
            Bone tgt; if (c.data.target == null || !boneMap.TryGetValue(c.data.target, out tgt) || c.data.bones.Length == 0) return;
            float mix = Clamp(c.N("mix", 1), 0, 1); bool stretch = c.F("stretch"), compress = c.F("compress"), uniform = c.F("uniform");
            if (mix <= 0 && !stretch) return;
            float tx = tgt.wx, ty = tgt.wy;
            if (c.data.bones.Length == 1)
            {
                Bone b; if (!boneMap.TryGetValue(c.data.bones[0], out b)) return;
                float want = (float)Math.Atan2(ty - b.wy, tx - b.wx) * RAD;
                RotateWorld(b, Wrap(want - WorldRot(b)) * mix);
                float len = b.data.length * WorldScaleX(b);
                if (len > 0.0001f)
                {
                    float d = (float)Math.Sqrt((tx - b.wx) * (tx - b.wx) + (ty - b.wy) * (ty - b.wy));
                    if ((stretch && d > len) || (compress && d < len)) { float s = 1 + (d / len - 1) * mix; b.asx *= s; if (uniform) b.asy *= s; else if (c.F("volume")) b.asy /= s; }
                }
                UpdateSubtree(b); return;
            }
            Bone p, ch; if (!boneMap.TryGetValue(c.data.bones[0], out p) || !boneMap.TryGetValue(c.data.bones[1], out ch)) return;
            float ox = p.wx, oy = p.wy;
            float l1 = (float)Math.Sqrt((ch.wx - ox) * (ch.wx - ox) + (ch.wy - oy) * (ch.wy - oy));
            float l2 = ch.data.length * WorldScaleX(ch);
            float dx = tx - ox, dy = ty - oy, dist = (float)Math.Sqrt(dx * dx + dy * dy); if (dist == 0) dist = 1e-6f;
            float reach = l1 + l2, stretchK = 1;
            if (stretch && dist > reach && reach > 0) stretchK = 1 + (dist / reach - 1) * mix;
            float dd = dist, soft = c.N("softness");
            if (soft > 0 && reach > 0) { float start = reach * stretchK - soft; if (dd > start) dd = start + soft * (1 - (float)Math.Exp(-(dd - start) / soft)); }
            float L1 = l1 * stretchK, L2 = l2 * stretchK;
            dd = Clamp(dd, Math.Abs(L1 - L2) + 1e-4f, L1 + L2 - 1e-6f);
            double bse = Math.Atan2(dy, dx);
            float denom = 2 * L1 * dd; if (denom == 0) denom = 1e-6f;
            double alpha = Math.Acos(Clamp((L1 * L1 + dd * dd - L2 * L2) / denom, -1, 1));
            double a1 = bse + alpha * (c.F("bendPositive", true) ? 1 : -1);
            double phi = Math.Atan2(ch.wy - oy, ch.wx - ox) - Math.Atan2(p.c, p.a);
            float want1 = (float)((a1 - phi) * RAD);
            RotateWorld(p, Wrap(want1 - WorldRot(p)) * mix);
            if (stretchK != 1) { p.asx *= stretchK; if (uniform) p.asy *= stretchK; else if (c.F("volume")) p.asy /= stretchK; }
            UpdateSubtree(p);
            float ex = ox + (float)Math.Cos(bse) * dd, ey = oy + (float)Math.Sin(bse) * dd;
            float want2 = (float)Math.Atan2(ey - ch.wy, ex - ch.wx) * RAD;
            RotateWorld(ch, Wrap(want2 - WorldRot(ch)) * mix);
            if (stretchK != 1) { float cur = ch.data.length * WorldScaleX(ch); if (cur > 1e-6f) { float k2 = L2 / cur; ch.asx *= k2; if (uniform) ch.asy *= k2; else if (c.F("volume")) ch.asy /= k2; } }
            UpdateSubtree(ch);
        }

        /* ---------- Transform ---------- */
        static float ShearOf(Bone x) { return Wrap((float)((Math.Atan2(x.d, x.b) - Math.Atan2(x.c, x.a)) * RAD) - 90); }
        float PropValue(Bone b, string prop, bool world)
        {
            if (world)
            {
                switch (prop) { case "rotate": return WorldRot(b); case "x": return b.wx; case "y": return b.wy; case "scaleX": return WorldScaleX(b); case "scaleY": return WorldScaleY(b); case "shearY": return ShearOf(b); }
                return 0;
            }
            switch (prop) { case "rotate": return b.arot; case "x": return b.ax; case "y": return b.ay; case "scaleX": return b.asx; case "scaleY": return b.asy; case "shearY": return b.ashy; }
            return 0;
        }
        static float GetApplied(Bone b, string p) { switch (p) { case "rotate": return b.arot; case "x": return b.ax; case "y": return b.ay; case "scaleX": return b.asx; case "scaleY": return b.asy; case "shearY": return b.ashy; } return 0; }
        static void SetApplied(Bone b, string p, float v) { switch (p) { case "rotate": b.arot = v; break; case "x": b.ax = v; break; case "y": b.ay = v; break; case "scaleX": b.asx = v; break; case "scaleY": b.asy = v; break; case "shearY": b.ashy = v; break; } }
        static string MixKey(string to) { switch (to) { case "rotate": return "mixRotate"; case "x": return "mixX"; case "y": return "mixY"; case "scaleX": return "mixScaleX"; case "scaleY": return "mixScaleY"; default: return "mixShearY"; } }
        void ApplyMappings(Constraint c, Bone t)
        {
            bool srcWorld = c.data.sourceSpace == "world", rel = c.F("relative");
            foreach (var bn in c.data.bones)
            {
                Bone b; if (!boneMap.TryGetValue(bn, out b) || b == t) continue;
                foreach (var m in c.data.mappings)
                {
                    float mix = c.N(MixKey(m.to), 1); if (mix == 0) continue;
                    float v = (PropValue(t, m.from, srcWorld) - m.fromOffset) * m.scale + m.toOffset;
                    if (m.clamp) { if (m.hasMin && v < m.min) v = m.min; if (m.hasMax && v > m.max) v = m.max; }
                    float cur = GetApplied(b, m.to);
                    SetApplied(b, m.to, rel ? cur + v * mix : cur + (v - cur) * mix);
                }
                UpdateSubtree(b);
            }
        }
        void ApplyTransform(Constraint c)
        {
            Bone t; if (c.data.target == null || !boneMap.TryGetValue(c.data.target, out t)) return;
            if (c.data.mappings.Count > 0) { ApplyMappings(c, t); return; }
            bool rel = c.F("relative");
            float mR = c.N("mixRotate"), mX = c.N("mixX"), mY = c.N("mixY"), mSX = c.N("mixScaleX"), mSY = c.N("mixScaleY"), mSh = c.N("mixShearY");
            float oR = c.N("offRotate"), oX = c.N("offX"), oY = c.N("offY"), oSX = c.N("offScaleX"), oSY = c.N("offScaleY"), oSh = c.N("offShearY");
            foreach (var bn in c.data.bones)
            {
                Bone b; if (!boneMap.TryGetValue(bn, out b) || b == t) continue;
                if (c.F("local"))
                {
                    if (mR != 0) b.arot += (rel ? (t.arot + oR) : (t.arot + oR - b.arot)) * mR;
                    if (mX != 0) b.ax += (rel ? t.ax + oX : t.ax + oX - b.ax) * mX;
                    if (mY != 0) b.ay += (rel ? t.ay + oY : t.ay + oY - b.ay) * mY;
                    if (mSX != 0) b.asx *= rel ? 1 + (t.asx - 1 + oSX) * mSX : 1 + ((t.asx + oSX) / (b.asx == 0 ? 1e-6f : b.asx) - 1) * mSX;
                    if (mSY != 0) b.asy *= rel ? 1 + (t.asy - 1 + oSY) * mSY : 1 + ((t.asy + oSY) / (b.asy == 0 ? 1e-6f : b.asy) - 1) * mSY;
                    if (mSh != 0) b.ashy += (rel ? t.ashy + oSh : t.ashy + oSh - b.ashy) * mSh;
                    UpdateSubtree(b); continue;
                }
                if (mR != 0) { float tr = WorldRot(t) + oR; float d = rel ? tr : Wrap(tr - WorldRot(b)); RotateWorld(b, d * mR); ComputeWorld(b); }
                if (mX != 0 || mY != 0)
                {
                    float px, py; LocalToWorld(t, oX, oY, out px, out py);
                    float nx, ny;
                    if (rel)
                    {
                        var tp = t.parent; float vx = tp != null ? tp.a * t.ax + tp.b * t.ay : t.ax, vy = tp != null ? tp.c * t.ax + tp.d * t.ay : t.ay;
                        nx = b.wx + (vx + px - t.wx) * mX; ny = b.wy + (vy + py - t.wy) * mY;
                    }
                    else { nx = b.wx + (px - b.wx) * mX; ny = b.wy + (py - b.wy) * mY; }
                    SetWorldPos(b, nx, ny); ComputeWorld(b);
                }
                if (mSX != 0) { float bs = WorldScaleX(b); if (bs == 0) bs = 1e-6f; float ts = WorldScaleX(t) * (1 + oSX); float want = rel ? bs * ts : ts; b.asx *= 1 + (want / bs - 1) * mSX; }
                if (mSY != 0) { float bs = WorldScaleY(b); if (bs == 0) bs = 1e-6f; float ts = WorldScaleY(t) * (1 + oSY); float want = rel ? bs * ts : ts; b.asy *= 1 + (want / bs - 1) * mSY; }
                if (mSh != 0) { float want = rel ? ShearOf(t) + oSh : ShearOf(t) + oSh - ShearOf(b); b.ashy += want * mSh; }
                UpdateSubtree(b);
            }
        }

        /* ---------- Path ---------- */
        public PathPoint[] PathWorld(Slot slot, AttachmentData att)
        {
            var b = slot.bone; var o = new PathPoint[att.points.Length];
            for (int i = 0; i < o.Length; i++)
            {
                var p = att.points[i];
                o[i] = new PathPoint { x = b.a * p.x + b.b * p.y + b.wx, y = b.c * p.x + b.d * p.y + b.wy, ix = b.a * p.ix + b.b * p.iy + b.wx, iy = b.c * p.ix + b.d * p.iy + b.wy, ox = b.a * p.ox + b.b * p.oy + b.wx, oy = b.c * p.ox + b.d * p.oy + b.wy };
            }
            return o;
        }
        static float Cubic(float p0, float p1, float p2, float p3, float t) { float u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; }
        static float CubicD(float p0, float p1, float p2, float p3, float t) { float u = 1 - t; return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2); }

        class PathSampler
        {
            public float total; List<float[]> segs = new List<float[]>(); List<float[]> table = new List<float[]>(); bool closed, constant;
            public PathSampler(PathPoint[] pts, bool closed, bool constant)
            {
                this.closed = closed; this.constant = constant;
                int n = pts.Length, count = closed ? n : n - 1;
                for (int i = 0; i < count; i++) { var a = pts[i]; var b = pts[(i + 1) % n]; segs.Add(new[] { a.x, a.y, a.ox, a.oy, b.ix, b.iy, b.x, b.y }); }
                const int SUB = 24;
                for (int si = 0; si < segs.Count; si++)
                {
                    var s = segs[si]; float px = s[0], py = s[1];
                    for (int k = 1; k <= SUB; k++)
                    {
                        float u = (float)k / SUB, x = Cubic(s[0], s[2], s[4], s[6], u), y = Cubic(s[1], s[3], s[5], s[7], u);
                        total += (float)Math.Sqrt((x - px) * (x - px) + (y - py) * (y - py)); table.Add(new[] { si, u, total }); px = x; py = y;
                    }
                }
            }
            void At(int si, float u, out float x, out float y, out float ang)
            {
                var s = segs[si];
                x = Cubic(s[0], s[2], s[4], s[6], u); y = Cubic(s[1], s[3], s[5], s[7], u);
                float dx = CubicD(s[0], s[2], s[4], s[6], u), dy = CubicD(s[1], s[3], s[5], s[7], u);
                if (Math.Abs(dx) + Math.Abs(dy) < 1e-6f) { dx = s[6] - s[0]; dy = s[7] - s[1]; }
                ang = (float)Math.Atan2(dy, dx) * RAD;
            }
            public void Get(float dist, out float x, out float y, out float ang)
            {
                if (closed) dist = ((dist % total) + total) % total;
                if (!constant)
                {
                    float f = Clamp(dist / (total == 0 ? 1 : total), 0, 1) * segs.Count; int si = Math.Min(segs.Count - 1, (int)Math.Floor(f));
                    At(si, f - si, out x, out y, out ang); return;
                }
                if (dist <= 0) { At(0, 0, out x, out y, out ang); if (dist < 0) { float a = ang * DEG; x += (float)Math.Cos(a) * dist; y += (float)Math.Sin(a) * dist; } return; }
                if (dist >= total) { At(segs.Count - 1, 1, out x, out y, out ang); float a = ang * DEG, e = dist - total; x += (float)Math.Cos(a) * e; y += (float)Math.Sin(a) * e; return; }
                int lo = 0, hi = table.Count - 1;
                while (hi - lo > 1) { int m = (lo + hi) >> 1; if (table[m][2] < dist) lo = m; else hi = m; }
                float[] e1, e2;
                if (dist <= table[0][2]) { e1 = new float[] { 0, 0, 0 }; e2 = table[0]; } else { e1 = table[lo]; e2 = table[hi]; }
                float ff = (dist - e1[2]) / (e2[2] - e1[2] == 0 ? 1 : e2[2] - e1[2]);
                if ((int)e1[0] != (int)e2[0]) At((int)e2[0], e2[1] * ff, out x, out y, out ang);
                else At((int)e1[0], e1[1] + (e2[1] - e1[1]) * ff, out x, out y, out ang);
            }
        }
        void ApplyPath(Constraint c)
        {
            Slot slot; if (c.data.target == null || !slotMap.TryGetValue(c.data.target, out slot)) return;
            var att = AttachmentOf(slot); if (att == null || att.type != "path" || att.points == null || att.points.Length < 2) return;
            var S = new PathSampler(PathWorld(slot, att), att.closed, att.constantSpeed);
            var bl = new List<Bone>(); foreach (var n in c.data.bones) { Bone b; if (boneMap.TryGetValue(n, out b)) bl.Add(b); }
            if (bl.Count == 0) return;
            float position = c.N("position"), spacing = c.N("spacing"), mR = c.N("mixRotate"), mX = c.N("mixX"), mY = c.N("mixY"), offR = c.N("offRotate");
            float dist = c.data.positionMode == "percent" ? position * S.total : position;
            var pos = new List<float>();
            foreach (var b in bl)
            {
                pos.Add(dist); float sp;
                switch (c.data.spacingMode)
                {
                    case "fixed": sp = spacing; break;
                    case "percent": sp = spacing * S.total; break;
                    case "proportional": sp = (S.total / bl.Count) * (1 + spacing); break;
                    default: sp = b.data.length * WorldScaleX(b) + spacing; break;
                }
                dist += sp;
            }
            pos.Add(dist);
            for (int i = 0; i < bl.Count; i++)
            {
                var b = bl[i]; float px, py, pa; S.Get(pos[i], out px, out py, out pa);
                SetWorldPos(b, b.wx + (px - b.wx) * mX, b.wy + (py - b.wy) * mY); ComputeWorld(b);
                if (mR != 0)
                {
                    float ang = pa;
                    if (c.data.rotateMode != "tangent")
                    {
                        float nx, ny, na; S.Get(pos[i + 1], out nx, out ny, out na);
                        ang = (float)Math.Atan2(ny - b.wy, nx - b.wx) * RAD;
                        if (c.data.rotateMode == "chainScale") { float len = b.data.length * WorldScaleX(b); if (len > 1e-4f) b.asx *= 1 + ((float)Math.Sqrt((nx - b.wx) * (nx - b.wx) + (ny - b.wy) * (ny - b.wy)) / len - 1) * mR; }
                    }
                    RotateWorld(b, Wrap(ang + offR - WorldRot(b)) * mR);
                }
                UpdateSubtree(b);
            }
        }

        /* ---------- Physics ---------- */
        void ApplyPhysics(Constraint c, float dt, Dictionary<string, PhysicsState> store)
        {
            Bone b; if (store == null || c.data.bone == null || !boneMap.TryGetValue(c.data.bone, out b)) return;
            PhysicsState st; if (!store.TryGetValue(c.name, out st)) { st = new PhysicsState(); store[c.name] = st; }
            if (!st.init) { st.init = true; st.px = b.wx; st.py = b.wy; st.hasPv = false; st.ox = st.oy = st.vx = st.vy = st.r = st.rv = st.s = st.sv = st.acc = 0; }
            float len = Math.Max(1, b.data.length * WorldScaleX(b));
            float sxw = WorldScaleX(b); if (sxw == 0) sxw = 1; float ux = b.a / sxw, uy = b.c / sxw;
            bool cx = c.F("x"), cy = c.F("y"), cr = c.F("rotate"), csx = c.F("scaleX"), csh = c.F("shearX");
            if (dt > 0)
            {
                float vx = (b.wx - st.px) / dt, vy = (b.wy - st.py) / dt; st.px = b.wx; st.py = b.wy;
                float vl = (float)Math.Sqrt(vx * vx + vy * vy), limit = c.N("limit", 5000);
                if (vl > limit) { vx *= limit / vl; vy *= limit / vl; }
                float axl = 0, ayl = 0;
                if (st.hasPv) { axl = (vx - st.pvx) / dt; ayl = (vy - st.pvy) / dt; }
                st.pvx = vx; st.pvy = vy; st.hasPv = true;
                float h = 1f / Math.Max(1, c.N("step", 60));
                st.acc += Math.Min(dt, 0.25f);
                float m = Math.Max(0.01f, c.N("mass", 1)), k = Math.Max(0, c.N("strength", 100)), damp = c.N("damping", 0.4f) * 2 * (float)Math.Sqrt(k * m);
                float inr = c.N("inertia", 0.5f), gx = c.N("wind") + sk.wind, gy = -(c.N("gravity") + sk.gravity);
                while (st.acc >= h)
                {
                    st.acc -= h;
                    if (cx) { st.vx += ((-k * st.ox - damp * st.vx) / m - axl * inr + gx) * h; st.ox += st.vx * h; }
                    if (cy) { st.vy += ((-k * st.oy - damp * st.vy) / m - ayl * inr + gy) * h; st.oy += st.vy * h; }
                    if (cr || csh)
                    {
                        float co = (float)Math.Cos(st.r), si = (float)Math.Sin(st.r), rx = ux * co - uy * si, ry = ux * si + uy * co;
                        float torque = ((rx * gy - ry * gx) - (rx * ayl - ry * axl) * inr) / len;
                        st.rv += ((-k * st.r - damp * st.rv) / m + torque) * h; st.r += st.rv * h;
                        if (st.r > 3) { st.r = 3; st.rv = 0; } else if (st.r < -3) { st.r = -3; st.rv = 0; }
                    }
                    if (csx) { st.sv += ((-k * st.s - damp * st.sv) / m - ((ux * axl + uy * ayl) / len) * inr) * h; st.s += st.sv * h; }
                }
            }
            float mix = c.N("mix", 1);
            if (cx || cy) SetWorldPos(b, b.wx + st.ox * mix, b.wy + st.oy * mix);
            if (cr) b.arot += st.r * RAD * mix * ParentSign(b);
            if (csh) b.ashx += st.r * RAD * mix;
            if (csx) { float k = Math.Max(0.05f, 1 + st.s * mix); b.asx *= k; if (c.F("volume")) b.asy /= k; }
            UpdateSubtree(b);
        }

        /* ---------- geometry ---------- */
        static string Pad(int n, int digits) { var s = n.ToString(); while (s.Length < digits) s = "0" + s; return s; }
        public string ImagePath(Slot slot, AttachmentData a)
        {
            if (a.sequence == null) return a.path;
            int idx; if (!slot.seq.TryGetValue(a.name, out idx)) idx = a.sequence.setup;
            return a.path + Pad(a.sequence.start + idx, a.sequence.digits);
        }
        static readonly float[] QuadUV = { 0, 1, 1, 1, 1, 0, 0, 0 };
        static readonly int[] QuadTris = { 0, 1, 2, 2, 3, 0 };
        public Geometry GetGeometry(Slot slot, AttachmentData att = null)
        {
            att = att ?? AttachmentOf(slot); if (att == null) return null;
            var b = slot.bone;
            switch (att.type)
            {
                case "region":
                    {
                        double rx = att.rotation * DEG, ry = (att.rotation + 90) * DEG;
                        float la = (float)Math.Cos(rx) * att.scaleX, lb = (float)Math.Cos(ry) * att.scaleY, lc = (float)Math.Sin(rx) * att.scaleX, ld = (float)Math.Sin(ry) * att.scaleY;
                        float hw = att.width / 2, hh = att.height / 2;
                        float[] corners = { -hw, -hh, hw, -hh, hw, hh, -hw, hh };
                        var v = new float[8];
                        for (int i = 0; i < 4; i++)
                        {
                            float cx = corners[i * 2], cy = corners[i * 2 + 1], lx = la * cx + lb * cy + att.x, ly = lc * cx + ld * cy + att.y;
                            v[i * 2] = b.a * lx + b.b * ly + b.wx; v[i * 2 + 1] = b.c * lx + b.d * ly + b.wy;
                        }
                        return new Geometry { verts = v, uvs = QuadUV, tris = QuadTris, att = att, image = ImagePath(slot, att), hull = 4 };
                    }
                case "mesh":
                case "linkedmesh":
                    {
                        var geo = att; string defName = att.name;
                        if (att.type == "linkedmesh")
                        {
                            geo = sk.GetAttachment(skinName, att.parentSlot ?? slot.name, att.parent);
                            if (geo == null || geo.type != "mesh") return null;
                            if (att.inheritDeform) defName = geo.name;
                        }
                        float[] def; slot.deform.TryGetValue(defName, out def);
                        return new Geometry { verts = MeshWorld(slot, geo, def), uvs = geo.uvs, tris = geo.triangles, att = att, image = ImagePath(slot, att), hull = geo.hull };
                    }
                case "bbox":
                case "clip":
                    {
                        float[] def; slot.deform.TryGetValue(att.name, out def);
                        return new Geometry { verts = MeshWorld(slot, att, def), att = att, polygon = true };
                    }
                case "point":
                    {
                        float x, y; LocalToWorld(b, att.x, att.y, out x, out y);
                        return new Geometry { verts = new[] { x, y }, att = att, angle = WorldRot(b) + att.rotation };
                    }
                case "path": return new Geometry { pts = PathWorld(slot, att), att = att };
            }
            return null;
        }
        public float[] MeshWorld(Slot slot, AttachmentData geo, float[] def)
        {
            var b = slot.bone;
            if (geo.weights == null)
            {
                var v = geo.verts ?? new float[0]; var o = new float[v.Length];
                for (int i = 0; i < v.Length; i += 2)
                {
                    float lx = v[i] + (def != null && i < def.Length ? def[i] : 0), ly = v[i + 1] + (def != null && i + 1 < def.Length ? def[i + 1] : 0);
                    o[i] = b.a * lx + b.b * ly + b.wx; o[i + 1] = b.c * lx + b.d * ly + b.wy;
                }
                return o;
            }
            var outv = new float[geo.weights.Length * 2]; int e = 0;
            for (int i = 0; i < geo.weights.Length; i++)
            {
                float x = 0, y = 0;
                foreach (var w in geo.weights[i])
                {
                    float lx = w.x + (def != null && e * 2 < def.Length ? def[e * 2] : 0), ly = w.y + (def != null && e * 2 + 1 < def.Length ? def[e * 2 + 1] : 0);
                    e++;
                    Bone bb; if (!boneMap.TryGetValue(w.b, out bb)) continue;
                    x += (bb.a * lx + bb.b * ly + bb.wx) * w.w; y += (bb.c * lx + bb.d * ly + bb.wy) * w.w;
                }
                outv[i * 2] = x; outv[i * 2 + 1] = y;
            }
            return outv;
        }
    }
}
