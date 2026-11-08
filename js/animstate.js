/* Alike Studio — AnimationState: multi-track playback with crossfades, queues, events.
   Used by the Preview panel and the runtime player (ported 1:1 to the Unity and Godot runtimes). */
(function (A) {
  'use strict';
  const Model = A.Model;

  class TrackEntry {
    constructor(anim, loop) {
      this.anim = anim; this.loop = loop; this.time = 0; this.lastTime = -1;
      this.timeScale = 1; this.alpha = 1; this.mixDuration = 0.2; this.mixTime = 0; this.from = null;
      this.additive = false; this.delay = 0; this.next = null; this.fresh = true; this.mixCurve = 'linear';
      this.drawOrder = true; // false: this track's draw order and draw order folder keys are ignored
      this.duration = Model.animDuration(anim);
    }
    animTime() {
      const d = this.duration;
      if (this.loop && d > 0) return this.time % d;
      return Math.min(this.time, d);
    }
    complete() { return !this.loop && this.time >= this.duration; }
  }

  class AnimationState {
    constructor(skeleton) {
      this.sk = skeleton;            // skeleton data (project.skeleton)
      this.tracks = [];
      this.timeScale = 1;
      this.defaultMix = 0.2;
      this.mixes = {};               // "from>to" → seconds
      this.mixCurve = 'linear';      // 'linear' | 'ease' crossfade interpolation
      this.listeners = [];           // fn(event, trackIndex, entry)
    }
    mixFor(from, to) { const k = from + '>' + to; return k in this.mixes ? this.mixes[k] : this.defaultMix; }
    setMix(from, to, d) { this.mixes[from + '>' + to] = d; }
    setAnimation(track, name, loop = true) {
      const anim = Model.anim(this.sk, name); if (!anim) return null;
      const e = new TrackEntry(anim, loop); e.mixCurve = this.mixCurve;
      const cur = this.tracks[track];
      if (cur) {
        e.mixDuration = this.mixFor(cur.anim.name, name);
        e.alpha = cur.alpha; e.additive = cur.additive; e.drawOrder = cur.drawOrder;
        if (e.mixDuration > 0) { e.from = cur; cur.from = null; cur.next = null; }
      } else e.mixDuration = 0;
      this.tracks[track] = e;
      return e;
    }
    /* queue after the current entry finishes (or after `delay` seconds when > 0) */
    addAnimation(track, name, loop = true, delay = 0) {
      const anim = Model.anim(this.sk, name); if (!anim) return null;
      let last = this.tracks[track];
      if (!last) return this.setAnimation(track, name, loop);
      while (last.next) last = last.next;
      const e = new TrackEntry(anim, loop); e.mixCurve = this.mixCurve;
      e.delay = delay > 0 ? delay : Math.max(0, last.duration - this.mixFor(last.anim.name, name));
      e.mixDuration = this.mixFor(last.anim.name, name);
      e.alpha = last.alpha; e.additive = last.additive; e.drawOrder = last.drawOrder;
      last.next = e;
      return e;
    }
    clearTrack(i) { this.tracks[i] = null; }
    clearTracks() { this.tracks = []; }

    update(dt) {
      dt *= this.timeScale;
      this.tracks.forEach((e, i) => {
        if (!e) return;
        const d = dt * e.timeScale;
        e.lastTime = e.fresh ? -1 : e.time; e.fresh = false; e.time += d;
        if (e.from) { e.from.lastTime = e.from.time; e.from.time += d * e.from.timeScale; e.mixTime += d; if (e.mixTime >= e.mixDuration) e.from = null; }
        this.fireEvents(e, i);
        if (e.next && e.time >= e.next.delay - 1e-9) {
          const n = e.next; e.next = null;
          n.from = n.mixDuration > 0 ? e : null; n.time = e.time - n.delay; n.lastTime = -1; n.fresh = true; n.mixTime = 0;
          if (n.time < 0) n.time = 0;
          this.tracks[i] = n;
        }
      });
    }
    fireEvents(e, i) {
      if (!this.listeners.length) return;
      const d = e.duration, out = [];
      const collect = (a, b) => { for (const tl of e.anim.timelines) if (tl.type === 'event') for (const k of tl.keys) if (k.t > a && k.t <= b) out.push(Object.assign({ time: k.t }, k.v)); };
      if (e.lastTime < 0) collect(-1, e.loop && d > 0 ? e.time % d : e.time);
      else if (e.loop && d > 0) {
        const l0 = Math.floor(e.lastTime / d), l1 = Math.floor(e.time / d), a = e.lastTime % d, b = e.time % d;
        if (l0 === l1) collect(a, b); else { collect(a, d); collect(-1, b); }
      } else collect(e.lastTime, Math.min(e.time, d));
      for (const ev of out) this.listeners.forEach((f) => f(ev, i, e));
    }
    apply(pose) {
      this.tracks.forEach((e, i) => {
        if (!e) return;
        const dr = e.drawOrder;
        if (e.from) {
          let m = e.mixDuration > 0 ? Math.min(1, e.mixTime / e.mixDuration) : 1;
          if (e.mixCurve === 'ease') m = m * m * (3 - 2 * m);
          const add = i === 0 && !e.additive ? true : e.additive; // track 0 crossfades relative to the setup pose: exact blend
          pose.applyAnimation(e.from.anim, e.from.animTime(), e.alpha * (1 - m), { additive: add, drawOrder: dr });
          pose.applyAnimation(e.anim, e.animTime(), e.alpha * m, { additive: add, drawOrder: dr });
        } else pose.applyAnimation(e.anim, e.animTime(), e.alpha, { additive: e.additive, drawOrder: dr });
      });
    }
  }

  A.AnimationState = AnimationState;
  A.TrackEntry = TrackEntry;
})(window.A);
