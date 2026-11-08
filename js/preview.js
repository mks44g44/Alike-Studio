/* Alike Studio — Preview window: multi-track playback with crossfades, queues, layers and events */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, ed = A.ed, UI = A.UI, h = UI.h;

  const PV = {
    open: false, playing: true, physics: true, skin: null, cam: { x: 0, y: 150, zoom: 0.6 }, log: [],
    show() {
      if (this.win) { this.win.style.display = 'flex'; this.open = true; this.build(); this.loop(); return; }
      this.state = new A.AnimationState(ed.sk);
      this.state.mixes = Object.assign({}, ed.project.editor.mixes || {});
      this.state.listeners.push((ev, track) => {
        this.log.unshift({ text: `t${track} · ${ev.name}${ev.string ? ' "' + ev.string + '"' : ''}${ev.int ? ' int ' + ev.int : ''}${ev.float ? ' float ' + M.round(ev.float, 2) : ''}`, at: performance.now() });
        this.log.length = Math.min(this.log.length, 8);
        A.Audio.playEvent(ev);
        this.renderLog();
      });
      const first = ed.project.editor.activeAnim || (ed.sk.animations[0] && ed.sk.animations[0].name);
      if (first) this.state.setAnimation(0, first, true);
      this.win = h('div.pv-win', null);
      document.body.appendChild(this.win);
      this.open = true;
      this.build();
      this.loop();
    },
    hide() { this.open = false; if (this.win) this.win.style.display = 'none'; },
    toggle() { this.open ? this.hide() : this.show(); },
    build() {
      const w = this.win; w.innerHTML = '';
      const head = h('div.pv-head', null, h('b', null, 'Preview'), h('span.pv-sub', null, 'independent playback · tracks mix top to bottom'), h('span.flex'), h('button.tbtn', { onclick: () => this.hide(), title: 'Close' }, '✕'));
      this.dragWin(head);
      this.cv = h('canvas.pv-canvas');
      const stage = h('div.pv-stage', null, this.cv);
      try { this.R = new A.GLRenderer(this.cv); } catch (e) { stage.appendChild(UI.note('WebGL unavailable')); }
      this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.zoom = M.clamp(this.cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.05, 10); }, { passive: false });
      this.cv.addEventListener('mousedown', (e) => {
        const x0 = e.clientX, y0 = e.clientY, cx = this.cam.x, cy = this.cam.y;
        const mv = (ev) => { this.cam.x = cx - (ev.clientX - x0) / this.cam.zoom; this.cam.y = cy + (ev.clientY - y0) / this.cam.zoom; };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
      const st = this.state;
      const anims = () => [['', '(empty)']].concat(ed.sk.animations.map((a) => [a.name, a.name]));
      const ctl = h('div.pv-controls', null,
        h('button.tbtn.play', { onclick: () => { this.playing = !this.playing; this.build(); } }, this.playing ? '❚❚' : '▶'),
        h('button.tbtn', { title: 'Restart all tracks', onclick: () => { st.tracks.forEach((e, i) => { if (e) st.setAnimation(i, e.anim.name, e.loop).mixDuration = 0; if (st.tracks[i]) st.tracks[i].from = null; }); this.phys = {}; } }, '⟲'),
        h('span.tl-lbl', null, 'Speed'), this.range(0, 2, 0.05, () => st.timeScale, (v) => (st.timeScale = v)),
        h('span.tl-lbl', null, 'Default mix'), this.numIn(() => st.defaultMix, (v) => (st.defaultMix = Math.max(0, v)), 's'),
        this.sel(() => [['linear', 'Linear crossfade'], ['ease', 'Eased crossfade']], () => st.mixCurve, (v) => { st.mixCurve = v; st.tracks.forEach((e) => { if (e) e.mixCurve = v; }); }),
        this.sel(() => ed.sk.skins.map((s) => [s.name, 'Skin: ' + s.name]), () => this.skin || ed.skinName, (v) => { this.skin = v; this.phys = {}; }),
        h('label.check', null, this.cb(() => this.physics, (v) => { this.physics = v; this.phys = {}; }), 'Physics'),
        h('label.check', null, this.cb(() => A.Audio.enabled, (v) => (A.Audio.enabled = v)), 'Sound'),
        h('button.tbtn', { title: 'Fit view', onclick: () => this.fit() }, '⛶'),
      );
      const tracks = h('div.pv-tracks');
      const n = Math.max(1, st.tracks.length);
      for (let i = 0; i < n; i++) {
        const e = st.tracks[i];
        const row = h('div.pv-track', null,
          h('span.pv-tn', null, 'Track ' + i),
          this.sel(anims, () => (e ? e.anim.name : ''), (v) => { if (!v) st.clearTrack(i); else { const ne = st.setAnimation(i, v, e ? e.loop : true); if (ne && !e && i > 0) ne.alpha = 1; } this.build(); }),
          h('label.check', { title: 'Loop' }, this.cb(() => (e ? e.loop : true), (v) => { if (st.tracks[i]) st.tracks[i].loop = v; }), 'Loop'),
          h('span.tl-lbl', null, 'Alpha'), this.range(0, 1, 0.01, () => (st.tracks[i] ? st.tracks[i].alpha : 1), (v) => { if (st.tracks[i]) st.tracks[i].alpha = v; }),
          h('label.check', { title: 'Add on top of lower tracks instead of replacing' }, this.cb(() => (st.tracks[i] ? st.tracks[i].additive : false), (v) => { if (st.tracks[i]) st.tracks[i].additive = v; }), 'Additive'),
          h('label.check', { title: 'Apply this track\'s draw order and draw order folder keys' }, this.cb(() => (st.tracks[i] ? st.tracks[i].drawOrder !== false : true), (v) => { if (st.tracks[i]) st.tracks[i].drawOrder = v; }), 'Draw order'),
          h('span.tl-lbl', null, 'Queue'), this.sel(anims, () => '', (v) => { if (v) { st.addAnimation(i, v, false); this.build(); } }),
          i > 0 ? h('button.tbtn', { title: 'Remove track', onclick: () => { st.tracks.splice(i, 1); this.build(); } }, '✕') : null,
        );
        const prog = h('div.pv-prog', null, h('div.pv-bar'));
        row.appendChild(prog);
        tracks.appendChild(row);
      }
      tracks.appendChild(h('div.btnrow', null,
        UI.button('+ Add track', () => { st.tracks.push(null); this.build(); }),
        UI.button('Mix durations…', () => this.mixDialog())));
      this.logEl = h('div.pv-log');
      w.append(head, stage, ctl, tracks, this.logEl);
      this.trackEls = [...tracks.querySelectorAll('.pv-track')];
      this.renderLog();
      if (!this.fitted) { this.fitted = true; setTimeout(() => this.fit(), 30); }
    },
    async mixDialog() {
      const st = this.state, names = ed.sk.animations.map((a) => a.name);
      const pair = { from: names[0], to: names[1] || names[0], d: st.defaultMix };
      const list = h('div.note');
      const refresh = () => { list.textContent = Object.keys(st.mixes).map((k) => k.replace('>', ' → ') + ': ' + st.mixes[k] + 's').join(' · ') || 'No custom mixes yet.'; };
      refresh();
      const body = h('div.form', null,
        UI.select('From', names, () => pair.from, (v) => (pair.from = v)), UI.select('To', names, () => pair.to, (v) => (pair.to = v)),
        UI.num('Duration', () => pair.d, (v) => (pair.d = Math.max(0, v)), { step: 0.01, prec: 2, suffix: 's' }),
        UI.row(UI.button('Set mix', () => { st.setMix(pair.from, pair.to, pair.d); refresh(); }, { primary: true }), UI.button('Clear all', () => { st.mixes = {}; refresh(); })), list);
      await UI.alert('Mix durations', body);
      ed.project.editor.mixes = Object.assign({}, st.mixes);
    },
    renderLog() {
      if (!this.logEl) return;
      this.logEl.innerHTML = '';
      this.logEl.appendChild(h('span.tl-lbl', null, 'Events: '));
      if (!this.log.length) this.logEl.appendChild(h('span.note', null, 'none yet'));
      this.log.forEach((l) => this.logEl.appendChild(h('span.pv-ev', null, l.text)));
    },
    fit() {
      const p = new A.Pose(ed.project, this.skin || ed.skinName); p.update();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      p.slots.forEach((s) => { const g = p.geometry(s); if (g && g.tris) for (let i = 0; i < g.verts.length; i += 2) { x0 = Math.min(x0, g.verts[i]); x1 = Math.max(x1, g.verts[i]); y0 = Math.min(y0, g.verts[i + 1]); y1 = Math.max(y1, g.verts[i + 1]); } });
      if (!isFinite(x0)) return;
      const r = this.cv.getBoundingClientRect();
      this.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom: M.clamp(Math.min(r.width / (x1 - x0 + 1), r.height / (y1 - y0 + 1)) * 0.75, 0.05, 6) };
    },
    loop() {
      if (this.looping) return; this.looping = true;
      let last = performance.now();
      const tick = (now) => {
        if (!this.open) { this.looping = false; return; }
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        try { this.frame(this.playing ? dt : 0); } catch (e) { console.error(e); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    frame(dt) {
      const st = this.state; st.sk = ed.sk;
      // drop entries whose animation was deleted/renamed
      st.tracks.forEach((e, i) => { if (e && !ed.sk.animations.includes(e.anim)) { const a = Model.anim(ed.sk, e.anim.name); if (a) e.anim = a; else st.tracks[i] = null; } });
      st.update(dt);
      const pose = new A.Pose(ed.project, this.skin || ed.skinName);
      st.apply(pose);
      this.phys = this.phys || {};
      pose.update(this.physics ? dt : 0, this.physics ? this.phys : null);
      if (this.R) {
        const r = this.cv.getBoundingClientRect();
        this.R.resize(r.width, r.height, window.devicePixelRatio || 1);
        this.R.begin(this.cam); this.R.drawPose(pose, { images: ed.images });
      }
      (this.trackEls || []).forEach((el, i) => {
        const e = st.tracks[i], bar = el.querySelector('.pv-bar');
        if (!bar) return;
        bar.style.width = e && e.duration > 0 ? (e.animTime() / e.duration) * 100 + '%' : '0%';
        bar.classList.toggle('mixing', !!(e && e.from));
        const sel = el.querySelector('select');
        if (e && sel && document.activeElement !== sel && sel.value !== e.anim.name) sel.value = e.anim.name;
      });
    },
    /* small controls */
    range(min, max, step, get, set) { const r = h('input.range', { type: 'range', min, max, step }); r.value = get(); r.addEventListener('input', () => set(parseFloat(r.value))); return r; },
    cb(get, set) { const c = h('input', { type: 'checkbox' }); c.checked = get(); c.addEventListener('change', () => set(c.checked)); return c; },
    sel(opts, get, set) {
      const s = h('select');
      const fill = () => { s.innerHTML = ''; opts().forEach(([v, t]) => s.appendChild(h('option', { value: v }, t))); s.value = get(); };
      fill(); s.addEventListener('mousedown', fill); s.addEventListener('change', () => set(s.value)); return s;
    },
    numIn(get, set, suffix) {
      const i = h('input.num.small', { type: 'text', value: get() });
      i.addEventListener('keydown', (e) => e.stopPropagation());
      i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v)) set(v); i.value = get(); });
      return h('span', null, i, suffix ? h('span.suffix', null, ' ' + suffix) : null);
    },
    dragWin(head) {
      head.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const r = this.win.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
        const mv = (ev) => { this.win.style.left = M.clamp(ev.clientX - x0, 0, window.innerWidth - 80) + 'px'; this.win.style.top = M.clamp(ev.clientY - y0, 0, window.innerHeight - 40) + 'px'; this.win.style.right = 'auto'; };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
    },
  };

  A.Preview = PV;
})(window.A);
