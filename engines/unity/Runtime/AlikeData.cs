// Alike runtime for Unity — typed skeleton data parsed from the Alike export tree.
using System;
using System.Collections.Generic;

namespace Alike
{
    public class BoneData
    {
        public int index, parentIndex = -1;
        public string name, parent;
        public float length, x, y, rotation, scaleX = 1, scaleY = 1, shearX, shearY;
        public bool inheritRotation = true, inheritScale = true, inheritReflection = true, skinRequired;
    }

    public class SlotData
    {
        public int index;
        public string name, bone, attachment, blend = "normal";
        public string folder; // draw order folder (null = none)
        public float[] color = { 1, 1, 1, 1 };
        public float[] dark; // null = no tint black
    }

    public class WeightEntry { public string b; public float x, y, w; }
    public class PathPoint { public float x, y, ix, iy, ox, oy; }
    public class SequenceData { public int count = 1, start, digits, setup; }

    public class AttachmentData
    {
        public string type, name, path, parent, parentSlot, end;
        public bool inverse;
        public float[] color = { 1, 1, 1, 1 };
        public float x, y, rotation, scaleX = 1, scaleY = 1, width, height;
        public float[] uvs, verts;
        public WeightEntry[][] weights;
        public int[] triangles;
        public int hull;
        public bool inheritDeform = true, closed, constantSpeed = true;
        public PathPoint[] points;
        public SequenceData sequence;
    }

    public class SkinData
    {
        public string name;
        public Dictionary<string, Dictionary<string, AttachmentData>> attachments = new Dictionary<string, Dictionary<string, AttachmentData>>();
        public HashSet<string> bones = new HashSet<string>(), constraints = new HashSet<string>();
    }

    public class Mapping { public string from = "rotate", to = "rotate"; public float fromOffset, toOffset, scale = 1, min, max; public bool clamp, hasMin, hasMax; }

    public class ConstraintData
    {
        public List<Mapping> mappings = new List<Mapping>();
        public string sourceSpace = "local";
        public string type, name, target, bone, animation, property = "x", positionMode = "percent", spacingMode = "length", rotateMode = "tangent";
        public bool skinRequired, enabled = true;
        public string[] bones = new string[0];
        public Dictionary<string, float> num = new Dictionary<string, float>();
        public Dictionary<string, bool> flag = new Dictionary<string, bool>();
    }

    public class EventData { public string name, str = "", audio = ""; public int intValue; public float floatValue, volume = 1, balance; }

    public class EventKey { public string name, str; public int intValue; public float floatValue, volume = 1, balance, time; }
    public class SequenceKey { public string mode = "loop"; public int index; public float delay = 1f / 15; }

    public class Key
    {
        public float t;
        public float[] v;          // numbers (scalar = v[0]); colors; deform offsets
        public string s;           // attachment name (null = none)
        public string[] order;     // draw order
        public EventKey ev;
        public SequenceKey seq;
        public int curve;          // 0 linear, 1 stepped, 2 bezier
        public float[] c;          // bezier [x1, y1, x2, y2]
    }

    public class Timeline
    {
        public string type, target, prop, attachment;
        public bool discrete;
        public List<Key> keys = new List<Key>();
    }

    public class AnimationData
    {
        public string name;
        public float duration;
        public List<Timeline> timelines = new List<Timeline>();
    }

    public class AtlasRegion { public int page; public float x, y, w, h, ox, oy, ow, oh; public bool rot; }
    public class AtlasPage { public string file; public float w, h; }

    public class SkeletonData
    {
        public string name;
        public float fps = 30, wind, gravity;
        public List<BoneData> bones = new List<BoneData>();
        public List<SlotData> slots = new List<SlotData>();
        public List<SkinData> skins = new List<SkinData>();
        public List<ConstraintData> constraints = new List<ConstraintData>();
        public List<EventData> events = new List<EventData>();
        public List<AnimationData> animations = new List<AnimationData>();
        public List<AtlasPage> pages = new List<AtlasPage>();
        public Dictionary<string, AtlasRegion> regions = new Dictionary<string, AtlasRegion>();
        public bool pma;
        public float atlasScale = 1;
        public Dictionary<string, string> audioFiles = new Dictionary<string, string>();

        public BoneData FindBone(string n) { return bones.Find(b => b.name == n); }
        public SlotData FindSlot(string n) { return slots.Find(s => s.name == n); }
        public SkinData FindSkin(string n) { return skins.Find(s => s.name == n); }
        public AnimationData FindAnimation(string n) { return animations.Find(a => a.name == n); }
        public EventData FindEvent(string n) { return events.Find(e => e.name == n); }

        public AttachmentData GetAttachment(string skin, string slot, string att)
        {
            if (att == null) return null;
            Func<string, AttachmentData> trySkin = sn =>
            {
                var sk = FindSkin(sn); Dictionary<string, AttachmentData> m; AttachmentData a;
                return sk != null && sk.attachments.TryGetValue(slot, out m) && m.TryGetValue(att, out a) ? a : null;
            };
            return (skin != null ? trySkin(skin) : null) ?? trySkin("default");
        }

        public static float AnimDuration(AnimationData a)
        {
            float d = a.duration;
            foreach (var tl in a.timelines) foreach (var k in tl.keys) if (k.t > d) d = k.t;
            return d;
        }

        /* ---------- loading ---------- */
        public static SkeletonData Load(byte[] bytes)
        {
            object tree = bytes.Length > 4 && bytes[0] == 'A' && bytes[1] == 'L' && bytes[2] == 'K' && bytes[3] == 'B'
                ? AlikeBinary.Decode(bytes)
                : AlikeJson.Parse(System.Text.Encoding.UTF8.GetString(bytes));
            return FromTree(T.O(tree));
        }

        public static SkeletonData FromTree(Dictionary<string, object> root)
        {
            var d = new SkeletonData();
            d.name = T.S(root, "name", "skeleton");
            var sk = T.O(T.G(root, "skeleton")) ?? root;
            d.fps = T.F(sk, "fps", 30); d.wind = T.F(sk, "wind"); d.gravity = T.F(sk, "gravity");
            foreach (var bo in T.L(T.G(sk, "bones")))
            {
                var o = T.O(bo);
                var b = new BoneData
                {
                    index = d.bones.Count, name = T.S(o, "name"), parent = T.S(o, "parent"), length = T.F(o, "length"),
                    x = T.F(o, "x"), y = T.F(o, "y"), rotation = T.F(o, "rotation"), scaleX = T.F(o, "scaleX", 1), scaleY = T.F(o, "scaleY", 1),
                    shearX = T.F(o, "shearX"), shearY = T.F(o, "shearY"), inheritRotation = T.B(o, "inheritRotation", true),
                    inheritScale = T.B(o, "inheritScale", true), inheritReflection = T.B(o, "inheritReflection", true), skinRequired = T.B(o, "skinRequired"),
                };
                if (b.parent != null) { var p = d.FindBone(b.parent); b.parentIndex = p != null ? p.index : -1; }
                d.bones.Add(b);
            }
            foreach (var so in T.L(T.G(sk, "slots")))
            {
                var o = T.O(so);
                var s = new SlotData { index = d.slots.Count, name = T.S(o, "name"), bone = T.S(o, "bone"), attachment = T.S(o, "attachment"), blend = T.S(o, "blend", "normal"), folder = T.S(o, "folder") };
                var col = T.FA(T.G(o, "color")); if (col != null && col.Length >= 4) s.color = col;
                s.dark = T.FA(T.G(o, "dark"));
                d.slots.Add(s);
            }
            foreach (var ko in T.L(T.G(sk, "skins")))
            {
                var o = T.O(ko);
                var skin = new SkinData { name = T.S(o, "name") };
                foreach (var b in T.L(T.G(o, "bones"))) skin.bones.Add(b as string);
                foreach (var c in T.L(T.G(o, "constraints"))) skin.constraints.Add(c as string);
                var atts = T.O(T.G(o, "attachments"));
                if (atts != null) foreach (var slotKv in atts)
                {
                    var m = new Dictionary<string, AttachmentData>();
                    foreach (var aKv in T.O(slotKv.Value)) m[aKv.Key] = ParseAttachment(T.O(aKv.Value), aKv.Key);
                    skin.attachments[slotKv.Key] = m;
                }
                d.skins.Add(skin);
            }
            foreach (var co in T.L(T.G(sk, "constraints")))
            {
                var o = T.O(co);
                var c = new ConstraintData { type = T.S(o, "type"), name = T.S(o, "name"), target = T.S(o, "target"), bone = T.S(o, "bone"), animation = T.S(o, "animation"),
                    property = T.S(o, "property", "x"), positionMode = T.S(o, "positionMode", "percent"), spacingMode = T.S(o, "spacingMode", "length"), rotateMode = T.S(o, "rotateMode", "tangent"),
                    skinRequired = T.B(o, "skinRequired"), enabled = T.B(o, "enabled", true) };
                var bl = T.L(T.G(o, "bones")); c.bones = new string[bl.Count]; for (int i = 0; i < bl.Count; i++) c.bones[i] = bl[i] as string;
                c.sourceSpace = T.S(o, "sourceSpace", "local");
                foreach (var mo in T.L(T.G(o, "mappings")))
                {
                    var mm = T.O(mo); if (mm == null) continue;
                    c.mappings.Add(new Mapping { from = T.S(mm, "from", "rotate"), to = T.S(mm, "to", "rotate"), fromOffset = T.F(mm, "fromOffset"), toOffset = T.F(mm, "toOffset"),
                        scale = T.F(mm, "scale", 1), clamp = T.B(mm, "clamp"), min = T.F(mm, "min"), max = T.F(mm, "max"), hasMin = T.G(mm, "min") is double, hasMax = T.G(mm, "max") is double });
                }
                foreach (var kv in o)
                {
                    if (kv.Value is double) c.num[kv.Key] = (float)(double)kv.Value;
                    else if (kv.Value is bool) c.flag[kv.Key] = (bool)kv.Value;
                }
                d.constraints.Add(c);
            }
            foreach (var eo in T.L(T.G(sk, "events")))
            {
                var o = T.O(eo);
                d.events.Add(new EventData { name = T.S(o, "name"), intValue = (int)T.F(o, "int"), floatValue = T.F(o, "float"), str = T.S(o, "string", ""), audio = T.S(o, "audio", ""), volume = T.F(o, "volume", 1), balance = T.F(o, "balance") });
            }
            foreach (var ao in T.L(T.G(sk, "animations")))
            {
                var o = T.O(ao);
                var a = new AnimationData { name = T.S(o, "name"), duration = T.F(o, "duration") };
                foreach (var to in T.L(T.G(o, "timelines"))) a.timelines.Add(ParseTimeline(T.O(to)));
                d.animations.Add(a);
            }
            var atlas = T.O(T.G(root, "atlas"));
            if (atlas != null)
            {
                d.pma = T.B(atlas, "pma"); d.atlasScale = T.F(atlas, "scale", 1);
                var pages = T.L(T.G(atlas, "pages"));
                for (int i = 0; i < pages.Count; i++)
                {
                    var po = T.O(pages[i]);
                    d.pages.Add(new AtlasPage { file = T.S(po, "file"), w = T.F(po, "w"), h = T.F(po, "h") });
                    var regs = T.O(T.G(po, "regions"));
                    if (regs != null) foreach (var kv in regs)
                    {
                        var r = T.O(kv.Value);
                        d.regions[kv.Key] = new AtlasRegion { page = i, x = T.F(r, "x"), y = T.F(r, "y"), w = T.F(r, "w"), h = T.F(r, "h"), ox = T.F(r, "ox"), oy = T.F(r, "oy"), ow = T.F(r, "ow", T.F(r, "w")), oh = T.F(r, "oh", T.F(r, "h")), rot = T.B(r, "rot") };
                    }
                }
            }
            foreach (var au in T.L(T.G(root, "audio"))) { var o = T.O(au); if (o != null) d.audioFiles[T.S(o, "name")] = T.S(o, "file"); }
            return d;
        }

        static AttachmentData ParseAttachment(Dictionary<string, object> o, string key)
        {
            var a = new AttachmentData
            {
                type = T.S(o, "type"), name = T.S(o, "name", key), path = T.S(o, "path"), parent = T.S(o, "parent"), parentSlot = T.S(o, "parentSlot"), end = T.S(o, "end"), inverse = T.B(o, "inverse"),
                x = T.F(o, "x"), y = T.F(o, "y"), rotation = T.F(o, "rotation"), scaleX = T.F(o, "scaleX", 1), scaleY = T.F(o, "scaleY", 1),
                width = T.F(o, "width"), height = T.F(o, "height"), uvs = T.FA(T.G(o, "uvs")), verts = T.FA(T.G(o, "verts")),
                hull = (int)T.F(o, "hull"), inheritDeform = T.B(o, "inheritDeform", true), closed = T.B(o, "closed"), constantSpeed = T.B(o, "constantSpeed", true),
            };
            var col = T.FA(T.G(o, "color")); if (col != null && col.Length >= 4) a.color = col;
            var tri = T.FA(T.G(o, "triangles"));
            if (tri != null) { a.triangles = new int[tri.Length]; for (int i = 0; i < tri.Length; i++) a.triangles[i] = (int)Math.Round(tri[i]); }
            var w = T.G(o, "weights") as List<object>;
            if (w != null)
            {
                a.weights = new WeightEntry[w.Count][];
                for (int i = 0; i < w.Count; i++)
                {
                    var vw = T.L(w[i]); a.weights[i] = new WeightEntry[vw.Count];
                    for (int j = 0; j < vw.Count; j++) { var e = T.O(vw[j]); a.weights[i][j] = new WeightEntry { b = T.S(e, "b"), x = T.F(e, "x"), y = T.F(e, "y"), w = T.F(e, "w") }; }
                }
            }
            var pts = T.G(o, "points") as List<object>;
            if (pts != null)
            {
                a.points = new PathPoint[pts.Count];
                for (int i = 0; i < pts.Count; i++) { var p = T.O(pts[i]); a.points[i] = new PathPoint { x = T.F(p, "x"), y = T.F(p, "y"), ix = T.F(p, "ix"), iy = T.F(p, "iy"), ox = T.F(p, "ox"), oy = T.F(p, "oy") }; }
            }
            var sq = T.O(T.G(o, "sequence"));
            if (sq != null) a.sequence = new SequenceData { count = (int)T.F(sq, "count", 1), start = (int)T.F(sq, "start"), digits = (int)T.F(sq, "digits"), setup = (int)T.F(sq, "setup") };
            return a;
        }

        static Timeline ParseTimeline(Dictionary<string, object> o)
        {
            var tl = new Timeline { type = T.S(o, "type"), target = T.S(o, "target"), prop = T.S(o, "prop"), attachment = T.S(o, "attachment") };
            tl.discrete = (tl.type == "slot" && tl.prop == "attachment") || tl.type == "drawOrder" || tl.type == "drawFolder" || tl.type == "event" || tl.type == "sequence" || (tl.type == "constraint" && tl.prop == "bendPositive");
            foreach (var ko in T.L(T.G(o, "keys")))
            {
                var k = T.O(ko);
                var key = new Key { t = T.F(k, "t") };
                object v = T.G(k, "v"), c = T.G(k, "c");
                if (c is string) key.curve = (string)c == "s" ? 1 : 0;
                else if (c is List<object>) { key.curve = 2; key.c = T.FA(c); }
                if (tl.type == "event")
                {
                    var e = T.O(v);
                    key.ev = new EventKey { name = T.S(e, "name"), intValue = (int)T.F(e, "int"), floatValue = T.F(e, "float"), str = T.S(e, "string", ""), volume = T.F(e, "volume", 1), balance = T.F(e, "balance"), time = key.t };
                }
                else if (tl.type == "drawOrder" || tl.type == "drawFolder") { var l = T.L(v); key.order = new string[l.Count]; for (int i = 0; i < l.Count; i++) key.order[i] = l[i] as string; }
                else if (tl.type == "sequence") { var s = T.O(v); key.seq = new SequenceKey { mode = T.S(s, "mode", "loop"), index = (int)T.F(s, "index"), delay = T.F(s, "delay", 1f / 15) }; }
                else if (tl.type == "slot" && tl.prop == "attachment") key.s = v as string;
                else if (v is double) key.v = new[] { (float)(double)v };
                else if (v is bool) key.v = new[] { (bool)v ? 1f : 0f };
                else if (v is List<object>) key.v = T.FA(v);
                tl.keys.Add(key);
            }
            tl.keys.Sort((x, y) => x.t.CompareTo(y.t));
            return tl;
        }
    }
}
