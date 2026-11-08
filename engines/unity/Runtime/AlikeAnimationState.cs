// Alike runtime for Unity — AnimationState (port of js/animstate.js): tracks, crossfades, queues, events.
using System;
using System.Collections.Generic;

namespace Alike
{
    public class TrackEntry
    {
        public AnimationData animation; public bool loop; public double time, lastTime = -1, mixTime, delay; public float timeScale = 1, alpha = 1, mixDuration = 0.2f, duration;
        public TrackEntry from, next; public bool additive, fresh = true, drawOrder = true; public string mixCurve = "linear";
        public TrackEntry(AnimationData a, bool loop) { animation = a; this.loop = loop; duration = SkeletonData.AnimDuration(a); }
        public float AnimTime() { if (loop && duration > 0) return (float)(time % duration); return (float)Math.Min(time, duration); }
        public bool IsComplete { get { return !loop && time >= duration; } }
    }

    public class AnimationState
    {
        public SkeletonData data;
        public List<TrackEntry> tracks = new List<TrackEntry>();
        public float timeScale = 1, defaultMix = 0.2f;
        public string mixCurve = "linear";
        public Dictionary<string, float> mixes = new Dictionary<string, float>();
        /// <summary>Fired for every event key passed: (event, track index).</summary>
        public event Action<EventKey, int> OnEvent;

        public AnimationState(SkeletonData d) { data = d; }
        public float MixFor(string from, string to) { float v; return mixes.TryGetValue(from + ">" + to, out v) ? v : defaultMix; }
        public void SetMix(string from, string to, float d) { mixes[from + ">" + to] = d; }
        TrackEntry Get(int i) { return i < tracks.Count ? tracks[i] : null; }
        void Put(int i, TrackEntry e) { while (tracks.Count <= i) tracks.Add(null); tracks[i] = e; }

        public TrackEntry SetAnimation(int track, string name, bool loop = true)
        {
            var anim = data.FindAnimation(name); if (anim == null) throw new ArgumentException("Animation not found: " + name);
            var e = new TrackEntry(anim, loop) { mixCurve = mixCurve }; var cur = Get(track);
            if (cur != null)
            {
                e.mixDuration = MixFor(cur.animation.name, name); e.alpha = cur.alpha; e.additive = cur.additive; e.drawOrder = cur.drawOrder;
                if (e.mixDuration > 0) { e.from = cur; cur.from = null; cur.next = null; }
            }
            else e.mixDuration = 0;
            Put(track, e); return e;
        }
        public TrackEntry AddAnimation(int track, string name, bool loop = true, float delay = 0)
        {
            var anim = data.FindAnimation(name); if (anim == null) throw new ArgumentException("Animation not found: " + name);
            var last = Get(track); if (last == null) return SetAnimation(track, name, loop);
            while (last.next != null) last = last.next;
            var e = new TrackEntry(anim, loop) { mixCurve = mixCurve };
            e.delay = delay > 0 ? delay : Math.Max(0, last.duration - MixFor(last.animation.name, name));
            e.mixDuration = MixFor(last.animation.name, name); e.alpha = last.alpha; e.additive = last.additive; e.drawOrder = last.drawOrder;
            last.next = e; return e;
        }
        public void ClearTrack(int i) { if (i < tracks.Count) tracks[i] = null; }
        public void ClearTracks() { tracks.Clear(); }

        public void Update(float dtIn)
        {
            double dt = (double)dtIn * timeScale;
            for (int i = 0; i < tracks.Count; i++)
            {
                var e = tracks[i]; if (e == null) continue;
                double d = dt * e.timeScale;
                e.lastTime = e.fresh ? -1 : e.time; e.fresh = false; e.time += d;
                if (e.from != null) { e.from.lastTime = e.from.time; e.from.time += d * e.from.timeScale; e.mixTime += d; if (e.mixTime >= e.mixDuration) e.from = null; }
                FireEvents(e, i);
                if (e.next != null && e.time >= e.next.delay - 1e-9)
                {
                    var n = e.next; e.next = null;
                    n.from = n.mixDuration > 0 ? e : null; n.time = Math.Max(0, e.time - n.delay); n.lastTime = -1; n.fresh = true; n.mixTime = 0;
                    tracks[i] = n;
                }
            }
        }
        void FireEvents(TrackEntry e, int i)
        {
            if (OnEvent == null) return;
            float d = e.duration; var outList = new List<EventKey>();
            Action<double, double> collect = (a, b) => { foreach (var tl in e.animation.timelines) if (tl.type == "event") foreach (var k in tl.keys) if (k.t > a && k.t <= b && k.ev != null) outList.Add(k.ev); };
            if (e.lastTime < 0) collect(-1, e.loop && d > 0 ? e.time % d : e.time);
            else if (e.loop && d > 0)
            {
                double l0 = Math.Floor(e.lastTime / d), l1 = Math.Floor(e.time / d); double a = e.lastTime % d, b = e.time % d;
                if (l0 == l1) collect(a, b); else { collect(a, d); collect(-1, b); }
            }
            else collect(e.lastTime, Math.Min(e.time, d));
            foreach (var ev in outList) OnEvent(ev, i);
        }
        public void Apply(Pose pose)
        {
            for (int i = 0; i < tracks.Count; i++)
            {
                var e = tracks[i]; if (e == null) continue;
                if (e.from != null)
                {
                    float m = e.mixDuration > 0 ? (float)Math.Min(1, e.mixTime / e.mixDuration) : 1;
                    if (e.mixCurve == "ease") m = m * m * (3 - 2 * m);
                    bool add = (i == 0 && !e.additive) ? true : e.additive;
                    pose.ApplyAnimation(e.from.animation, e.from.AnimTime(), e.alpha * (1 - m), add, e.drawOrder);
                    pose.ApplyAnimation(e.animation, e.AnimTime(), e.alpha * m, add, e.drawOrder);
                }
                else pose.ApplyAnimation(e.animation, e.AnimTime(), e.alpha, e.additive, e.drawOrder);
            }
        }
    }
}
