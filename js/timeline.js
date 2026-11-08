/* Alike Studio — timeline: dopesheet + graph editor with bezier curves */
(function (A) {
  'use strict';
  const M = A.M, Model = A.Model, ed = A.ed, UI = A.UI, Act = A.Act, h = UI.h;
  const NAMEW = 200, RULER = 24, ROWH = 20;
  const COLORS = { rotate: '#7ee787', x: '#ff7b72', y: '#7ee0a0', scaleX: '#e3b341', scaleY: '#f2cc60', shearX: '#d2a8ff', shearY: '#bc8cff',
    attachment: '#ff9bce', color: '#ffa657', dark: '#c38a57', deform: '#56d4dd', drawOrder: '#c9d1d9', drawFolder: '#b4bcc6', event: '#f0e68c', sequence: '#9ecbff' };
  const PRESETS = {
    linear: 'l', stepped: 's', ease: [0.42, 0, 0.58, 1], easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1],
    back: [0.34, 1.56, 0.64, 1], smooth: [0.25, 0.1, 0.25, 1],
  };

  const TL = {
    view: 'dope', pxf: 14, scrollF: -1, scrollY: 0, onlySel: true, collapsed: new Set(), rowSel: new Set(),
    gv: { auto: true, vmin: -10, vmax: 10 }, dirty: true, clip: null,

    init(el) {
      this.el = el;
      this.bar = h('div.tl-bar');
      this.cv = h('canvas.tl-canvas');
      this.wrap = h('div.tl-body', null, this.cv);
      el.appendChild(this.bar); el.appendChild(this.wrap);
      this.ctx = this.cv.getContext('2d');
      new ResizeObserver(() => { this.resize(); }).observe(this.wrap);
      this.cv.addEventListener('mousedown', (e) => this.down(e));
      window.addEventListener('mousemove', (e) => this.move(e));
      window.addEventListener('mouseup', (e) => this.up(e));
      this.cv.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      this.cv.addEventListener('dblclick', (e) => this.dbl(e));
      this.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.ctxMenu(e); });
      const mark = () => (this.dirty = true);
      ['change', 'time', 'selection', 'anim', 'mode'].forEach((ev) => ed.on(ev, mark));
      ed.on('anim', () => this.buildBar()); ed.on('mode', () => this.buildBar());
      ed.on('change', (w) => { if (w === 'structure') this.buildBar(); });
      this.buildBar();
      this.resize();
    },
    resize() {
      const r = this.wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
      this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
      this.dirty = true;
    },

    /* ---------------- toolbar ---------------- */
    buildBar() {
      const b = this.bar; b.innerHTML = '';
      const sk = ed.sk;
      const animSel = h('select.anim-select', { title: 'Active animation' });
      const fill = () => { animSel.innerHTML = ''; sk.animations.forEach((a) => animSel.appendChild(h('option', { value: a.name }, a.name))); animSel.value = ed.project.editor.activeAnim || ''; };
      fill(); animSel.addEventListener('mousedown', fill);
      animSel.addEventListener('change', () => ed.setAnim(animSel.value));
      const ib = (label, title, fn, cls = '') => h('button.tbtn' + cls, { title, onclick: fn }, label);
      const fps = ed.fps;
      const playBtn = ib(ed.playing ? '❚❚' : '▶', 'Play / pause (Space)', () => this.togglePlay(), '.play');
      this.playBtn = playBtn;
      const frameIn = h('input.num.frame', { type: 'text', title: 'Current frame' });
      frameIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { ed.setTime((parseInt(frameIn.value, 10) || 0) / fps); frameIn.blur(); } });
      this.frameIn = frameIn;
      this.durLabel = h('span.tl-dur');
      const auto = ib('● Auto key', 'Auto key: transforms create keys automatically', () => { ed.autoKey = !ed.autoKey; this.buildBar(); }, ed.autoKey ? '.on.rec' : '');
      const ghost = ib('◐ Ghosts', 'Onion skin (ghosting)', () => { ed.ghost.on = !ed.ghost.on; this.buildBar(); }, ed.ghost.on ? '.on' : '');
      const ghostCfg = ib('⚙', 'Ghost settings', (e) => UI.menu(e.clientX, e.clientY, [
        { label: 'Frames before: ' + ed.ghost.before, sub: [1, 2, 3, 4, 6, 8].map((n) => ({ label: String(n), checked: ed.ghost.before === n, action: () => (ed.ghost.before = n) })) },
        { label: 'Frames after: ' + ed.ghost.after, sub: [0, 1, 2, 3, 4, 6, 8].map((n) => ({ label: String(n), checked: ed.ghost.after === n, action: () => (ed.ghost.after = n) })) },
        { label: 'Step: ' + ed.ghost.step + ' frames', sub: [1, 2, 3, 4, 5, 8, 10].map((n) => ({ label: String(n), checked: ed.ghost.step === n, action: () => (ed.ghost.step = n) })) },
        { label: 'Opacity: ' + Math.round((ed.ghost.opacity ?? 0.5) * 100) + '%', sub: [0.2, 0.35, 0.5, 0.7, 0.9].map((n) => ({ label: Math.round(n * 100) + '%', checked: (ed.ghost.opacity ?? 0.5) === n, action: () => (ed.ghost.opacity = n) })) },
        { label: 'Tint (blue before, orange after)', checked: ed.ghost.tint !== false, action: () => (ed.ghost.tint = ed.ghost.tint === false) },
        { label: 'Wrap around in looping animations', checked: !!ed.ghost.wrap, action: () => (ed.ghost.wrap = !ed.ghost.wrap) },
        { label: 'Only the selected bones\' slots', checked: !!ed.ghost.onlySel, action: () => (ed.ghost.onlySel = !ed.ghost.onlySel) },
      ]));
      const layerSel = h('select', { title: 'Mix a second animation on top (preview layering)' });
      const lf = () => { layerSel.innerHTML = ''; layerSel.appendChild(h('option', { value: '' }, 'No layer')); sk.animations.forEach((a) => layerSel.appendChild(h('option', { value: a.name }, '+ ' + a.name))); layerSel.value = ed.layer.anim || ''; };
      lf(); layerSel.addEventListener('mousedown', lf);
      layerSel.addEventListener('change', () => { ed.layer.anim = layerSel.value || null; ed.physStore = {}; });
      const alpha = h('input.range', { type: 'range', min: 0, max: 1, step: 0.01, value: ed.layer.alpha, title: 'Layer mix alpha' });
      alpha.addEventListener('input', () => (ed.layer.alpha = parseFloat(alpha.value)));
      const views = h('div.seg', null,
        h('button' + (this.view === 'dope' ? '.on' : ''), { onclick: () => { this.view = 'dope'; this.buildBar(); this.dirty = true; } }, 'Dopesheet'),
        h('button' + (this.view === 'graph' ? '.on' : ''), { onclick: () => { this.view = 'graph'; this.gv.auto = true; this.buildBar(); this.dirty = true; } }, 'Graph'));
      const curve = (n, label, title) => ib(label, title, () => this.applyCurve(PRESETS[n]));
      const speed = h('select', { title: 'Playback speed' });
      [0.1, 0.25, 0.5, 1, 1.5, 2].forEach((s) => speed.appendChild(h('option', { value: s }, s + '×'))); speed.value = ed.speed;
      speed.addEventListener('change', () => (ed.speed = parseFloat(speed.value)));
      b.append(
        animSel, ib('+', 'New animation', () => Act.newAnimation()), ib('⧉', 'Duplicate animation', () => ed.anim && Act.duplicateAnimation(ed.anim.name)),
        h('span.sep'),
        ib('⏮', 'First frame (Home)', () => ed.setTime(0)), ib('◆◀', 'Previous key', () => this.jumpKey(-1)), ib('◀', 'Previous frame (,)', () => this.step(-1)),
        playBtn, ib('▶|', 'Next frame (.)', () => this.step(1)), ib('▶◆', 'Next key', () => this.jumpKey(1)), ib('⏭', 'Last frame (End)', () => ed.setTime(Model.animDuration(ed.anim || { timelines: [] }))),
        ib('⟲', 'Loop playback', () => { ed.loop = !ed.loop; this.buildBar(); }, ed.loop ? '.on' : ''), speed,
        h('span.sep'), h('span.tl-lbl', null, 'Frame'), frameIn, this.durLabel,
        h('span.sep'), auto, ib('◆ Key', 'Key changed / selected (K)', () => Act.keySelected()),
        h('span.sep'), ghost, ghostCfg, layerSel, alpha,
        h('span.flex'),
        curve('linear', '╱', 'Linear'), curve('stepped', '⌐', 'Stepped'), curve('ease', '∫', 'Ease in-out (bezier)'), curve('easeIn', '◟', 'Ease in'), curve('easeOut', '◝', 'Ease out'), curve('back', '↷', 'Overshoot'),
        h('span.sep'),
        ib('Keys ▾', 'Key tools: offset, stretch, reverse, insert / remove frames', (e) => UI.menu(e.clientX, e.clientY, this.keyToolsMenu())),
        ib('☰', 'Show only selected items', () => { this.onlySel = !this.onlySel; this.buildBar(); this.dirty = true; }, this.onlySel ? '.on' : ''),
        views,
      );
      this.dirty = true;
    },
    updateBarState() {
      if (this.playBtn) this.playBtn.textContent = ed.playing ? '❚❚' : '▶';
      if (this.frameIn && document.activeElement !== this.frameIn) this.frameIn.value = ed.frame();
      if (this.durLabel) this.durLabel.textContent = ' / ' + Math.round(Model.animDuration(ed.anim || { timelines: [] }) * ed.fps);
    },
    togglePlay() {
      if (!ed.anim) return;
      ed.playing = !ed.playing;
      if (ed.playing) { ed.clearOverrides(); const d = Model.animDuration(ed.anim); if (ed.time >= d - 1e-6) ed.setTime(0); }
      this.updateBarState();
    },
    step(n) { ed.playing = false; ed.setTime(Math.max(0, (ed.frame() + n) / ed.fps)); },
    jumpKey(dir) {
      const an = ed.anim; if (!an) return;
      const times = new Set(); this.rows().forEach((r) => r.tls.forEach((tl) => tl.keys.forEach((k) => times.add(Math.round(k.t * ed.fps)))));
      const f = ed.frame(); const arr = [...times].sort((a, b) => a - b);
      const t = dir > 0 ? arr.find((x) => x > f) : arr.reverse().find((x) => x < f);
      if (t != null) ed.setTime(t / ed.fps);
    },

    /* ---------------- rows ---------------- */
    rows() {
      const an = ed.anim; if (!an) return [];
      const groups = new Map();
      const sel = ed.sel;
      const selBones = new Set(sel.filter((r) => r.k === 'bone').map((r) => r.n));
      const selSlots = new Set(sel.filter((r) => r.k === 'slot' || r.k === 'att').map((r) => r.k === 'slot' ? r.n : r.slot));
      const selCons = new Set(sel.filter((r) => r.k === 'con').map((r) => r.n));
      const filter = this.onlySel && sel.length && sel.some((r) => ['bone', 'slot', 'att', 'con'].includes(r.k));
      for (const tl of an.timelines) {
        let id, label, kind;
        switch (tl.type) {
          case 'bone': id = 'b:' + tl.target; label = tl.target; kind = 'bone'; if (filter && !selBones.has(tl.target)) continue; break;
          case 'slot': id = 's:' + tl.target; label = tl.target; kind = 'slot'; if (filter && !selSlots.has(tl.target)) continue; break;
          case 'deform': id = 'd:' + tl.target + ':' + tl.attachment; label = tl.target + ' › ' + tl.attachment; kind = 'mesh'; if (filter && !selSlots.has(tl.target)) continue; break;
          case 'sequence': id = 'q:' + tl.target + ':' + tl.attachment; label = tl.target + ' › ' + tl.attachment; kind = 'region'; if (filter && !selSlots.has(tl.target)) continue; break;
          case 'constraint': { const c = Model.constraint(ed.sk, tl.target); id = 'c:' + tl.target; label = tl.target; kind = c ? (c.type === 'path' ? 'pathc' : c.type) : 'ik'; if (filter && !selCons.has(tl.target)) continue; break; }
          case 'drawOrder': id = 'o'; label = 'Draw order'; kind = 'order'; break;
          case 'drawFolder': id = 'f:' + tl.target; label = 'Draw order › ' + tl.target; kind = 'order'; if (filter && !Model.folderSlots(ed.sk, tl.target).some((x) => selSlots.has(x.name))) continue; break;
          case 'event': id = 'e'; label = 'Events'; kind = 'event'; break;
          default: continue;
        }
        if (!groups.has(id)) groups.set(id, { id, label, kind, tls: [], tl0: tl });
        groups.get(id).tls.push(tl);
      }
      const R = [{ id: 'sum', kind: 'summary', label: an.name, tls: an.timelines, depth: 0 }];
      const order = { bone: 0, slot: 1, mesh: 2, region: 2 };
      [...groups.values()].sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3)).forEach((g) => {
        const single = g.tls.length === 1 && (g.kind === 'order' || g.kind === 'event' || g.kind === 'mesh' || g.kind === 'region');
        R.push({ id: g.id, kind: g.kind, label: g.label, tls: g.tls, depth: 0, group: g, caret: single ? null : !this.collapsed.has(g.id), tl: single ? g.tls[0] : undefined });
        if (!single && !this.collapsed.has(g.id)) {
          const po = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearX', 'shearY', 'attachment', 'color', 'dark'];
          g.tls.slice().sort((a, b) => po.indexOf(a.prop) - po.indexOf(b.prop)).forEach((tl) => R.push({ id: g.id + '/' + (tl.prop || tl.type), kind: 'tl', label: tl.prop || tl.type, tls: [tl], depth: 1, tl }));
        }
      });
      return R;
    },
    colorOf(tl) { return COLORS[tl.prop] || COLORS[tl.type] || '#a5d6ff'; },

    /* ---------------- coordinates ---------------- */
    fx(frame) { return NAMEW + (frame - this.scrollF) * this.pxf; },
    xf(x) { return (x - NAMEW) / this.pxf + this.scrollF; },
    rowY(i) { return RULER + i * ROWH - this.scrollY; },
    gy(v) { const g = this.gv, top = RULER + 10, bot = this.H - 10; return bot - ((v - g.vmin) / (g.vmax - g.vmin || 1)) * (bot - top); },
    yv(y) { const g = this.gv, top = RULER + 10, bot = this.H - 10; return g.vmin + ((bot - y) / (bot - top)) * (g.vmax - g.vmin); },

    /* ---------------- drawing ---------------- */
    draw() {
      if (!this.dirty || !this.ctx || this.el.offsetParent === null) return;
      this.dirty = false;
      this.updateBarState();
      const c = this.ctx, dpr = window.devicePixelRatio || 1;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(document.documentElement), v = (n, d) => css.getPropertyValue(n).trim() || d;
      const BG = v('--panel', '#23262d'), BG2 = v('--panel2', '#1d2026'), LINE = v('--line', '#343841'), TXT = v('--text', '#d7dae0'), DIM = v('--dim', '#8b919c'), ACC = v('--accent', '#ff8a3d');
      c.fillStyle = BG2; c.fillRect(0, 0, this.W, this.H);
      const an = ed.anim;
      if (!an) { c.fillStyle = DIM; c.font = '12px system-ui'; c.fillText('No animation. Create one with + (or New → Animation).', NAMEW + 16, 60); return; }
      const rows = this.rows(); this._rows = rows;
      const fps = ed.fps, dur = Model.animDuration(an), durF = Math.round(dur * fps);
      // area after end
      const endX = this.fx(durF);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(Math.max(NAMEW, endX), RULER, this.W, this.H);
      // frame grid
      const f0 = Math.floor(this.scrollF), f1 = Math.ceil(this.xf(this.W));
      const labelEvery = this.pxf >= 22 ? 1 : this.pxf >= 10 ? 5 : this.pxf >= 4 ? 10 : 30;
      for (let f = Math.max(0, f0); f <= f1; f++) {
        const x = Math.round(this.fx(f)) + 0.5;
        if (this.pxf < 4 && f % 5) continue;
        c.strokeStyle = f % labelEvery === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
        c.beginPath(); c.moveTo(x, RULER); c.lineTo(x, this.H); c.stroke();
      }
      if (this.view === 'dope') this.drawDope(c, rows, { TXT, DIM, LINE, ACC, BG });
      else this.drawGraph(c, rows, { TXT, DIM, LINE, ACC, BG });
      // ruler
      c.fillStyle = BG; c.fillRect(NAMEW, 0, this.W, RULER);
      c.strokeStyle = LINE; c.beginPath(); c.moveTo(0, RULER + 0.5); c.lineTo(this.W, RULER + 0.5); c.stroke();
      c.fillStyle = DIM; c.font = '10px system-ui, sans-serif'; c.textAlign = 'center';
      for (let f = Math.max(0, f0); f <= f1; f++) {
        if (f % labelEvery) continue;
        const x = this.fx(f); if (x < NAMEW) continue;
        c.fillText(String(f), x, 15); c.fillRect(x, RULER - 5, 1, 5);
      }
      c.textAlign = 'left';
      this.drawBracket(c, { ACC });
      if (durF > 0 && endX > NAMEW) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(endX, 0, 1, this.H); }
      // playhead
      const px = this.fx(ed.time * fps);
      if (px >= NAMEW) {
        c.fillStyle = ACC; c.fillRect(Math.round(px), 0, 1.5, this.H);
        const lbl = String(ed.frame()); const w = c.measureText(lbl).width + 8;
        c.beginPath(); c.roundRect ? c.roundRect(px - w / 2, 3, w, 15, 3) : c.rect(px - w / 2, 3, w, 15); c.fill();
        c.fillStyle = '#111'; c.textAlign = 'center'; c.font = 'bold 10px system-ui'; c.fillText(lbl, px, 14); c.textAlign = 'left';
      }
      // names column
      c.fillStyle = BG; c.fillRect(0, 0, NAMEW, this.H);
      c.strokeStyle = LINE; c.beginPath(); c.moveTo(NAMEW + 0.5, 0); c.lineTo(NAMEW + 0.5, this.H); c.stroke();
      c.fillStyle = DIM; c.font = '10px system-ui'; c.fillText((ed.autoKey ? '● AUTO KEY  ' : '') + (fps + ' fps'), 8, 15);
      rows.forEach((r, i) => {
        const y = this.rowY(i); if (y < RULER - ROWH || y > this.H) return;
        if (y < RULER) return;
        const isSel = this.rowSel.has(r.id) || (r.group && this.groupSelected(r));
        if (isSel) { c.fillStyle = 'rgba(255,138,61,0.14)'; c.fillRect(0, y, NAMEW, ROWH); }
        const x = 8 + r.depth * 14;
        if (r.caret != null) { c.fillStyle = DIM; c.fillText(r.caret ? '▾' : '▸', x, y + 14); }
        c.fillStyle = r.kind === 'summary' ? ACC : r.kind === 'tl' ? (this.colorOf(r.tl)) : TXT;
        c.font = (r.kind === 'summary' ? 'bold ' : '') + '11.5px system-ui, sans-serif';
        c.fillText(r.label, x + 12, y + 14);
        c.strokeStyle = 'rgba(255,255,255,0.04)'; c.beginPath(); c.moveTo(0, y + ROWH - 0.5); c.lineTo(this.W, y + ROWH - 0.5); c.stroke();
      });
      c.fillStyle = BG; c.fillRect(0, 0, NAMEW, RULER);
      c.fillStyle = DIM; c.font = '10px system-ui'; c.fillText((ed.autoKey ? '● AUTO KEY · ' : '') + fps + ' fps', 8, 15);
      // marquee
      const d = this.drag;
      if (d && d.type === 'marquee') {
        c.strokeStyle = '#3ddcff'; c.fillStyle = 'rgba(61,220,255,0.08)';
        const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), hh = Math.abs(d.y1 - d.y0);
        c.fillRect(x, y, w, hh); c.strokeRect(x + 0.5, y + 0.5, w, hh);
      }
    },
    groupSelected(r) {
      const p = ed.primary(); if (!p) return false;
      return (r.id === 'b:' + p.n && p.k === 'bone') || (r.id === 's:' + p.n && p.k === 'slot') || (r.id === 'c:' + p.n && p.k === 'con');
    },
    framesOf(tls) {
      const m = new Map();
      tls.forEach((tl) => tl.keys.forEach((k) => { const f = Math.round(k.t * ed.fps); (m.get(f) || m.set(f, []).get(f)).push({ k, tl }); }));
      return m;
    },
    drawDope(c, rows, col) {
      rows.forEach((r, i) => {
        const y = this.rowY(i); if (y < RULER || y > this.H) return;
        if (i % 2) { c.fillStyle = 'rgba(255,255,255,0.015)'; c.fillRect(NAMEW, y, this.W, ROWH); }
        const fr = this.framesOf(r.tls);
        const cy = y + ROWH / 2;
        // audio waveforms under event keys whose event plays a sound
        if (ed.view.waveforms !== false && r.tl && r.tl.type === 'event') {
          for (const k of r.tl.keys) {
            const def = Model.event(ed.sk, k.v.name); if (!def || !def.audio) continue;
            const pk = A.Audio.peaks(def.audio, () => { this.dirty = true; }); if (!pk) continue;
            const x0 = this.fx(k.t * ed.fps), vol = k.v.volume != null ? k.v.volume : def.volume != null ? def.volume : 1;
            c.save(); c.beginPath(); c.rect(NAMEW, y, this.W - NAMEW, ROWH); c.clip();
            A.Audio.drawWave(c, pk, x0, this.pxf * ed.fps, cy, (ROWH / 2 - 1) * Math.max(0.15, Math.min(1, vol)), 'rgba(86,212,221,0.45)', NAMEW, this.W);
            c.restore();
          }
        }
        // hold bars between equal-valued keys (single timeline rows)
        if (r.tl && r.tl.keys.length > 1) {
          const ks = r.tl.keys;
          for (let k = 0; k < ks.length - 1; k++) {
            const same = JSON.stringify(ks[k].v) === JSON.stringify(ks[k + 1].v);
            const x0 = this.fx(ks[k].t * ed.fps), x1 = this.fx(ks[k + 1].t * ed.fps);
            c.fillStyle = same ? 'rgba(255,255,255,0.18)' : Array.isArray(ks[k].c) ? 'rgba(61,220,255,0.12)' : ks[k].c === 's' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.06)';
            c.fillRect(x0, cy - (same ? 2 : 1), x1 - x0, same ? 4 : 2);
          }
        }
        for (const [f, list] of fr) {
          const x = this.fx(f); if (x < NAMEW - 6 || x > this.W + 6) continue;
          const allSel = list.every((e) => ed.keySel.has(e.k)), anySel = list.some((e) => ed.keySel.has(e.k));
          const s = r.kind === 'summary' ? 4 : r.kind === 'tl' ? 5 : 5;
          c.beginPath(); c.moveTo(x, cy - s); c.lineTo(x + s, cy); c.lineTo(x, cy + s); c.lineTo(x - s, cy); c.closePath();
          const base = r.kind === 'tl' ? this.colorOf(r.tl) : r.kind === 'summary' ? '#9aa4b2' : list.length > 1 ? '#d7dae0' : this.colorOf(list[0].tl);
          c.fillStyle = allSel ? col.ACC : base; c.fill();
          c.strokeStyle = anySel ? '#fff' : 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke();
          if (r.tl && r.tl.type === 'event') { const ev = list[0].k.v; c.fillStyle = col.TXT; c.font = '10px system-ui'; c.fillText(ev.name, x + 7, cy + 4); }
          if (r.tl && r.tl.prop === 'attachment') { c.fillStyle = col.DIM; c.font = '10px system-ui'; c.fillText(list[0].k.v == null ? '∅' : String(list[0].k.v), x + 7, cy + 4); }
        }
      });
    },
    selFrames() {
      if (ed.keySel.size < 2) return null;
      let a = Infinity, b = -Infinity;
      ed.keySel.forEach((k) => { const f = Math.round(k.t * ed.fps); if (f < a) a = f; if (f > b) b = f; });
      return b > a ? [a, b] : null;
    },
    drawBracket(c, col) {
      const r = this.selFrames(); if (!r) return;
      const x0 = this.fx(r[0]), x1 = this.fx(r[1]), y = RULER - 6;
      c.fillStyle = 'rgba(255,138,61,0.35)'; c.fillRect(x0, y, x1 - x0, 4);
      c.fillStyle = col.ACC; c.fillRect(x0 - 4, y - 2, 8, 8); c.fillRect(x1 - 4, y - 2, 8, 8);
    },
    graphTls(rows) {
      let tls = [];
      // dopesheet → graph sync: timelines that contain selected keys come first
      if (ed.keySel.size && ed.anim) ed.anim.timelines.forEach((tl) => { if (tl.keys.some((k) => ed.keySel.has(k))) tls.push(tl); });
      if (!tls.length) rows.forEach((r) => { if (this.rowSel.has(r.id)) r.tls.forEach((t) => tls.push(t)); });
      if (!tls.length) rows.forEach((r) => { if (r.kind === 'tl') tls.push(r.tl); });
      if (!tls.length) rows.forEach((r) => { if (r.kind !== 'summary') r.tls.forEach((t) => tls.push(t)); });
      tls = [...new Set(tls)].filter((t) => t.keys.length && typeof t.keys[0].v === 'number').slice(0, 16);
      return tls;
    },
    drawGraph(c, rows, col) {
      const tls = this.graphTls(rows); this._gtls = tls;
      const fps = ed.fps;
      if (this.gv.auto) {
        let lo = Infinity, hi = -Infinity;
        tls.forEach((tl) => { const d = Model.animDuration(ed.anim); for (let s = 0; s <= 60; s++) { const v = Model.sample(tl, (s / 60) * Math.max(d, tl.keys[tl.keys.length - 1].t)); lo = Math.min(lo, v); hi = Math.max(hi, v); } tl.keys.forEach((k) => { lo = Math.min(lo, k.v); hi = Math.max(hi, k.v); }); });
        if (!isFinite(lo)) { lo = -1; hi = 1; }
        if (hi - lo < 1e-3) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.12; this.gv.vmin = lo - pad; this.gv.vmax = hi + pad;
      }
      // horizontal value grid
      const range = this.gv.vmax - this.gv.vmin;
      let step = Math.pow(10, Math.floor(Math.log10(range / 4))); if (range / step > 10) step *= 5; else if (range / step > 5) step *= 2;
      c.font = '10px system-ui';
      for (let v = Math.ceil(this.gv.vmin / step) * step; v <= this.gv.vmax; v += step) {
        const y = Math.round(this.gy(v)) + 0.5;
        c.strokeStyle = Math.abs(v) < 1e-9 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
        c.beginPath(); c.moveTo(NAMEW, y); c.lineTo(this.W, y); c.stroke();
        c.fillStyle = col.DIM; c.fillText(String(M.round(v, 3)), NAMEW + 4, y - 2);
      }
      for (const tl of tls) {
        const colr = this.colorOf(tl);
        c.strokeStyle = colr; c.lineWidth = 1.6; c.beginPath();
        const first = tl.keys[0].t * fps, last = tl.keys[tl.keys.length - 1].t * fps;
        let started = false;
        for (let x = NAMEW; x <= this.W; x += 2) {
          const f = this.xf(x);
          if (f < first || f > last) continue;
          const y = this.gy(Model.sample(tl, f / fps));
          started ? c.lineTo(x, y) : c.moveTo(x, y); started = true;
        }
        c.stroke();
        c.setLineDash([3, 4]); c.lineWidth = 1; c.beginPath();
        const y0 = this.gy(tl.keys[0].v), y1 = this.gy(tl.keys[tl.keys.length - 1].v);
        c.moveTo(NAMEW, y0); c.lineTo(this.fx(first), y0); c.moveTo(this.fx(last), y1); c.lineTo(this.W, y1); c.stroke(); c.setLineDash([]);
        // keys + handles
        tl.keys.forEach((k, i) => {
          const x = this.fx(k.t * fps), y = this.gy(k.v);
          const sel = ed.keySel.has(k);
          const next = tl.keys[i + 1], prev = tl.keys[i - 1];
          if (next && Array.isArray(k.c) && (sel || ed.keySel.has(next))) this.drawHandles(c, tl, k, next, colr);
          c.fillStyle = sel ? col.ACC : colr; c.fillRect(x - 3.5, y - 3.5, 7, 7);
          c.strokeStyle = sel ? '#fff' : '#000'; c.lineWidth = 1; c.strokeRect(x - 3.5, y - 3.5, 7, 7);
          void prev;
        });
      }
      if (!tls.length) { c.fillStyle = col.DIM; c.font = '12px system-ui'; c.fillText('Select timeline rows on the left (or bones) to see their curves.', NAMEW + 16, RULER + 40); }
    },
    handlePos(tl, k, next) {
      const fps = ed.fps, dt = (next.t - k.t) * fps, dv = next.v - k.v || 0, unit = Math.abs(dv) > 1e-9 ? dv : 0;
      const c = k.c;
      const h1 = [k.t * fps + c[0] * dt, k.v + c[1] * unit], h2 = [k.t * fps + c[2] * dt, k.v + c[3] * unit];
      return { h1, h2, dt, dv: unit };
    },
    drawHandles(c, tl, k, next, colr) {
      const { h1, h2 } = this.handlePos(tl, k, next), fps = ed.fps;
      const p0 = [this.fx(k.t * fps), this.gy(k.v)], p1 = [this.fx(next.t * fps), this.gy(next.v)];
      const a = [this.fx(h1[0]), this.gy(h1[1])], b = [this.fx(h2[0]), this.gy(h2[1])];
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(a[0], a[1]); c.moveTo(p1[0], p1[1]); c.lineTo(b[0], b[1]); c.stroke();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(a[0], a[1], 3.5, 0, 7); c.fill();
      c.beginPath(); c.arc(b[0], b[1], 3.5, 0, 7); c.fill();
    },

    /* ---------------- interaction ---------------- */
    local(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    rowAt(y) { if (y < RULER) return -1; return Math.floor((y + this.scrollY - RULER) / ROWH); },
    keysAt(x, y) {
      const i = this.rowAt(y), rows = this._rows || []; const r = rows[i]; if (!r) return null;
      const f = Math.round(this.xf(x));
      if (Math.abs(this.fx(f) - x) > 7) return null;
      const list = this.framesOf(r.tls).get(f);
      return list && list.length ? { row: r, list, f } : null;
    },
    graphHit(x, y) {
      const fps = ed.fps;
      for (const tl of this._gtls || []) {
        for (let i = 0; i < tl.keys.length; i++) {
          const k = tl.keys[i], next = tl.keys[i + 1];
          if (next && Array.isArray(k.c) && (ed.keySel.has(k) || ed.keySel.has(next))) {
            const { h1, h2 } = this.handlePos(tl, k, next);
            if (Math.hypot(this.fx(h1[0]) - x, this.gy(h1[1]) - y) < 6) return { handle: 1, tl, k, next };
            if (Math.hypot(this.fx(h2[0]) - x, this.gy(h2[1]) - y) < 6) return { handle: 2, tl, k, next };
          }
          if (Math.abs(this.fx(k.t * fps) - x) < 6 && Math.abs(this.gy(k.v) - y) < 6) return { key: k, tl };
        }
      }
      return null;
    },
    down(e) {
      const [x, y] = this.local(e);
      if (e.button !== 0) { if (e.button === 1) this.drag = { type: 'pan', x0: x, y0: y, f0: this.scrollF, s0: this.scrollY, v0: [this.gv.vmin, this.gv.vmax] }; return; }
      this.cv.focus && this.cv.focus();
      const br = this.selFrames();
      if (br && y < RULER && y > RULER - 14 && x > NAMEW) {
        const x0 = this.fx(br[0]), x1 = this.fx(br[1]);
        if (Math.abs(x - x0) < 7 || Math.abs(x - x1) < 7) {
          const right = Math.abs(x - x1) < Math.abs(x - x0);
          this.drag = { type: 'stretch', pivot: right ? br[0] : br[1], end: right ? br[1] : br[0], orig: [...ed.keySel].map((k) => ({ k, t: k.t })), pushed: false };
          return;
        }
        if (x > x0 && x < x1) { this.drag = { type: 'keys', x0: x, df: 0, orig: [...ed.keySel].map((k) => ({ k, t: k.t })), pushed: false }; return; }
      }
      if (y < RULER && x > NAMEW) { ed.playing = false; this.drag = { type: 'scrub' }; this.scrubTo(x); return; }
      if (x < NAMEW) {
        const i = this.rowAt(y), r = (this._rows || [])[i]; if (!r) return;
        if (r.caret != null && x < 22 + r.depth * 14) { this.collapsed.has(r.id) ? this.collapsed.delete(r.id) : this.collapsed.add(r.id); this.dirty = true; return; }
        if (!e.shiftKey && !e.ctrlKey) this.rowSel.clear();
        this.rowSel.has(r.id) ? this.rowSel.delete(r.id) : this.rowSel.add(r.id);
        // select all keys of row
        if (!e.shiftKey && !e.ctrlKey) ed.keySel.clear();
        r.tls.forEach((tl) => tl.keys.forEach((k) => ed.keySel.add(k)));
        if (r.group && r.group.tl0.target) {
          const t = r.group.tl0;
          const ref = t.type === 'bone' ? { k: 'bone', n: t.target } : t.type === 'constraint' ? { k: 'con', n: t.target } : (t.type === 'slot' || t.type === 'deform' || t.type === 'sequence') ? { k: 'slot', n: t.target } : null;
          if (ref && Model.slot(ed.sk, ref.n) || ref && ref.k !== 'slot') { const keep = this.onlySel; this.onlySel = false; ed.select(ref, e.shiftKey || e.ctrlKey); this.onlySel = keep; }
        }
        if (this.view === 'graph') this.gv.auto = true;
        this.dirty = true; return;
      }
      if (this.view === 'graph') return this.graphDown(e, x, y);
      const hit = this.keysAt(x, y);
      if (hit) {
        const ks = hit.list.map((e2) => e2.k);
        const allSel = ks.every((k) => ed.keySel.has(k));
        if (e.shiftKey || e.ctrlKey) { if (allSel) ks.forEach((k) => ed.keySel.delete(k)); else ks.forEach((k) => ed.keySel.add(k)); }
        else if (!allSel) { ed.keySel.clear(); ks.forEach((k) => ed.keySel.add(k)); }
        this.drag = { type: 'keys', x0: x, df: 0, orig: [...ed.keySel].map((k) => ({ k, t: k.t })), pushed: false };
        this.dirty = true; return;
      }
      this.drag = { type: 'marquee', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey || e.ctrlKey };
    },
    graphDown(e, x, y) {
      const hit = this.graphHit(x, y);
      if (hit && hit.handle) {
        ed.pushUndo('Edit curve');
        this.drag = { type: 'handle', hit }; return;
      }
      if (hit && hit.key) {
        if (e.shiftKey || e.ctrlKey) ed.keySel.has(hit.key) ? ed.keySel.delete(hit.key) : ed.keySel.add(hit.key);
        else if (!ed.keySel.has(hit.key)) { ed.keySel.clear(); ed.keySel.add(hit.key); }
        this.gv.auto = false;
        this.drag = { type: 'gkeys', x0: x, y0: y, orig: [...ed.keySel].map((k) => ({ k, t: k.t, v: k.v })), pushed: false };
        this.dirty = true; return;
      }
      this.drag = { type: 'marquee', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey || e.ctrlKey };
    },
    scrubTo(x) { const f = Math.max(0, Math.round(this.xf(x))); if (f !== ed.frame()) ed.setTime(f / ed.fps); },
    move(e) {
      const d = this.drag; if (!d) return;
      const [x, y] = this.local(e);
      const fps = ed.fps;
      if (d.type === 'scrub') this.scrubTo(x);
      else if (d.type === 'pan') {
        this.scrollF = d.f0 - (x - d.x0) / this.pxf;
        if (this.view === 'graph') { const dv = ((y - d.y0) / (this.H - RULER - 20)) * (d.v0[1] - d.v0[0]); this.gv.auto = false; this.gv.vmin = d.v0[0] + dv; this.gv.vmax = d.v0[1] + dv; }
        else this.scrollY = Math.max(0, d.s0 - (y - d.y0));
      } else if (d.type === 'keys') {
        const df = Math.round((x - d.x0) / this.pxf);
        if (df !== d.df) {
          if (!d.pushed) { ed.pushUndo('Move keys'); d.pushed = true; }
          d.df = df;
          const minT = Math.min(...d.orig.map((o) => o.t));
          const shift = Math.max(df / fps, -minT);
          d.orig.forEach((o) => (o.k.t = Math.round((o.t + shift) * fps) / fps));
          ed.changed('keys');
        }
      } else if (d.type === 'gkeys') {
        if (!d.pushed) { ed.pushUndo('Move keys'); d.pushed = true; }
        const df = e.shiftKey ? 0 : Math.round((x - d.x0) / this.pxf);
        const dv = e.altKey ? 0 : this.yv(y) - this.yv(d.y0);
        const minT = Math.min(...d.orig.map((o) => o.t));
        const shift = Math.max(df / fps, -minT);
        d.orig.forEach((o) => { o.k.t = Math.round((o.t + shift) * fps) / fps; if (typeof o.v === 'number') o.k.v = M.round(o.v + dv, 4); });
        ed.changed('keys');
      } else if (d.type === 'handle') {
        const { tl, k, next, handle } = d.hit;
        const f = this.xf(x), v = this.yv(y);
        const dt = (next.t - k.t) * fps, dvv = next.v - k.v;
        const fx = M.clamp((f - k.t * fps) / (dt || 1), 0, 1);
        const fy = Math.abs(dvv) > 1e-9 ? (v - k.v) / dvv : 0;
        if (!Array.isArray(k.c)) k.c = [1 / 3, 0, 2 / 3, 1];
        if (handle === 1) { k.c[0] = M.round(fx, 4); k.c[1] = M.round(fy, 4); }
        else { k.c[2] = M.round(fx, 4); k.c[3] = M.round(fy, 4); }
        void tl;
        ed.changed('keys');
      } else if (d.type === 'stretch') {
        const f = Math.round(this.xf(x));
        if (f === d.pivot) return;
        if (!d.pushed) { ed.pushUndo('Stretch keys'); d.pushed = true; }
        const k = (f - d.pivot) / (d.end - d.pivot);
        d.orig.forEach((o) => { o.k.t = Math.max(0, Math.round((d.pivot + (o.t * fps - d.pivot) * k)) / fps); });
        ed.setStatus(`Stretch ×${M.round(k, 2)}`);
        ed.changed('keys');
      } else if (d.type === 'marquee') { d.x1 = x; d.y1 = y; }
      this.dirty = true;
    },
    up() {
      const d = this.drag; this.drag = null; if (!d) return;
      if (d.type === 'keys' || d.type === 'gkeys' || d.type === 'stretch') { if (d.pushed) this.normalize(); }
      if (d.type === 'marquee') {
        const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
        if (x1 - x0 < 3 && y1 - y0 < 3) {
          if (!d.add) ed.keySel.clear();
          ed.playing = false; this.scrubTo(d.x0);
        } else {
          if (!d.add) ed.keySel.clear();
          const fps = ed.fps;
          if (this.view === 'graph') {
            (this._gtls || []).forEach((tl) => tl.keys.forEach((k) => { const kx = this.fx(k.t * fps), ky = this.gy(k.v); if (kx >= x0 && kx <= x1 && ky >= y0 && ky <= y1) ed.keySel.add(k); }));
          } else {
            (this._rows || []).forEach((r, i) => {
              const ry = this.rowY(i) + ROWH / 2; if (ry < y0 || ry > y1) return;
              r.tls.forEach((tl) => tl.keys.forEach((k) => { const kx = this.fx(k.t * fps); if (kx >= x0 && kx <= x1) ed.keySel.add(k); }));
            });
          }
        }
      }
      ed.changed('keys');
      this.dirty = true;
    },
    normalize() {
      const an = ed.anim; if (!an) return;
      for (const tl of an.timelines) {
        tl.keys.sort((a, b) => a.t - b.t);
        const out = [];
        for (const k of tl.keys) {
          const prev = out[out.length - 1];
          if (prev && Math.abs(prev.t - k.t) < 1e-6) { if (ed.keySel.has(k)) out[out.length - 1] = k; }
          else out.push(k);
        }
        tl.keys = out;
      }
      an.timelines = an.timelines.filter((t) => t.keys.length);
      ed.changed('keys');
    },
    wheel(e) {
      e.preventDefault();
      const [x] = this.local(e);
      if (e.ctrlKey || e.metaKey || (this.view === 'graph' && !e.shiftKey && x > NAMEW && e.altKey)) {
        if (this.view === 'graph' && e.altKey) { const c = this.yv(this.local(e)[1]), f = Math.exp(e.deltaY * 0.002); this.gv.auto = false; this.gv.vmin = c + (this.gv.vmin - c) * f; this.gv.vmax = c + (this.gv.vmax - c) * f; }
        else { const f0 = this.xf(x); this.pxf = M.clamp(this.pxf * Math.exp(-e.deltaY * 0.002), 1, 80); this.scrollF = f0 - (x - NAMEW) / this.pxf; }
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.scrollF += (e.deltaX || e.deltaY) / this.pxf;
      else if (this.view === 'graph' && x > NAMEW) { const c = this.yv(this.local(e)[1]), f = Math.exp(e.deltaY * 0.002); this.gv.auto = false; this.gv.vmin = c + (this.gv.vmin - c) * f; this.gv.vmax = c + (this.gv.vmax - c) * f; }
      else this.scrollY = Math.max(0, this.scrollY + e.deltaY * 0.5);
      this.dirty = true;
    },
    dbl(e) {
      const [x, y] = this.local(e);
      const hit = this.view === 'dope' ? this.keysAt(x, y) : null;
      if (hit) ed.setTime(hit.f / ed.fps);
      else if (this.view === 'graph') { this.gv.auto = true; this.dirty = true; }
    },
    ctxMenu(e) {
      const [x, y] = this.local(e);
      const hit = this.view === 'dope' ? this.keysAt(x, y) : null;
      if (hit && !hit.list.every((q) => ed.keySel.has(q.k))) { ed.keySel.clear(); hit.list.forEach((q) => ed.keySel.add(q.k)); }
      const has = ed.keySel.size > 0;
      UI.menu(e.clientX, e.clientY, [
        { label: 'Linear', action: () => this.applyCurve('l'), disabled: !has }, { label: 'Stepped', action: () => this.applyCurve('s'), disabled: !has },
        { label: 'Bezier ease in-out', action: () => this.applyCurve(PRESETS.ease), disabled: !has }, { label: 'Ease in', action: () => this.applyCurve(PRESETS.easeIn), disabled: !has },
        { label: 'Ease out', action: () => this.applyCurve(PRESETS.easeOut), disabled: !has }, { label: 'Overshoot', action: () => this.applyCurve(PRESETS.back), disabled: !has },
        '-',
        { label: 'Copy keys', key: 'Ctrl+C', action: () => this.copy(), disabled: !has }, { label: 'Paste at frame ' + ed.frame(), key: 'Ctrl+V', action: () => this.paste(), disabled: !this.clip },
        { label: 'Delete keys', key: 'Del', action: () => this.deleteKeys(), disabled: !has },
        '-',
        { label: 'Select all keys', key: 'Ctrl+A', action: () => this.selectAll() },
        { label: 'Fit view', action: () => this.fit() },
      ]);
    },

    /* ---------------- key tools ---------------- */
    keyToolsMenu() {
      const has = ed.keySel.size > 0, an = !!ed.anim;
      return [
        { label: 'Offset selected keys…', action: () => this.offsetDialog(), disabled: !has },
        { label: 'Stretch selected keys…', action: () => this.stretchDialog(), disabled: !has },
        { label: 'Reverse selected keys', action: () => this.reverseKeys(), disabled: !has },
        { label: 'Key constrained values', key: 'Shift+K', action: () => A.Act.keyConstrained(), disabled: !an },
        { label: 'Bake constrained motion…', action: () => A.Act.bakeDialog(), disabled: !an },
        { label: 'Clean up this animation', action: () => { ed.pushUndo('Clean up'); const n = Model.cleanUpAnimation(ed.sk, ed.anim); ed.keySel.clear(); ed.changed('keys'); UI.toast(n ? `Removed ${n} keys that changed nothing` : 'Nothing to clean up'); }, disabled: !an },
        { label: 'Clean up all animations', action: () => { ed.pushUndo('Clean up all'); let n = 0; ed.sk.animations.forEach((x) => (n += Model.cleanUpAnimation(ed.sk, x))); ed.keySel.clear(); ed.changed('keys'); UI.toast(n ? `Removed ${n} keys across ${ed.sk.animations.length} animations` : 'Nothing to clean up'); } },
        { label: 'New keys use last chosen curve', checked: !!this.useLastCurve, action: () => { this.useLastCurve = !this.useLastCurve; A.Model.newKeyCurve = this.useLastCurve ? (this.lastCurve || null) : null; } },
        '-',
        { label: 'Snap selected keys to frames', action: () => { ed.pushUndo('Snap keys'); ed.keySel.forEach((k) => (k.t = ed.snapTime(k.t))); this.normalize(); }, disabled: !has },
        '-',
        { label: 'Insert frames at playhead…', action: () => this.insertDialog(1), disabled: !an },
        { label: 'Remove frames at playhead…', action: () => this.insertDialog(-1), disabled: !an },
        { label: 'Select keys after playhead', action: () => { ed.keySel.clear(); (this._rows || this.rows()).forEach((r) => r.tls.forEach((tl) => tl.keys.forEach((k) => { if (k.t >= ed.time - 1e-6) ed.keySel.add(k); }))); this.dirty = true; }, disabled: !an },
        { label: 'Set end to last key', action: () => { const a = ed.anim; if (!a) return; ed.pushUndo('Animation length'); a.duration = 0; let d = 0; a.timelines.forEach((t) => t.keys.forEach((k) => (d = Math.max(d, k.t)))); a.duration = d; ed.changed('keys'); }, disabled: !an },
      ];
    },
    async offsetDialog() {
      const st = { frames: 1, wrap: true };
      const ok = await UI.modal('Offset keys', h('div.form', null,
        UI.num('Frames', () => st.frames, (v) => (st.frames = Math.round(v)), { step: 0.2, prec: 0 }),
        UI.check('Wrap around the animation (for loops)', () => st.wrap, (v) => (st.wrap = v)),
        UI.note('Moves the selected keys. With wrap, keys pushed past the end continue from the start, which shifts a loop\'s timing without breaking it.')), [['Cancel', false], ['Offset', true, true]]);
      if (ok) this.offsetKeys(st.frames, st.wrap);
    },
    offsetKeys(df, wrap) {
      const an = ed.anim; if (!an || !ed.keySel.size) return;
      ed.pushUndo('Offset keys');
      const fps = ed.fps, D = Math.round(Model.animDuration(an) * fps);
      ed.keySel.forEach((k) => {
        let f = Math.round(k.t * fps) + df;
        if (wrap && D > 0) f = ((f % D) + D) % D; else f = Math.max(0, f);
        k.t = f / fps;
      });
      this.normalize();
    },
    async stretchDialog() {
      const r = this.selFrames() || [ed.frame(), ed.frame()];
      const st = { factor: 2, pivot: 'first' };
      const ok = await UI.modal('Stretch keys', h('div.form', null,
        UI.num('Factor', () => st.factor, (v) => (st.factor = Math.max(0.01, v)), { step: 0.05, prec: 3, suffix: '×' }),
        UI.select('Pivot', [['first', 'First selected key (frame ' + r[0] + ')'], ['last', 'Last selected key (frame ' + r[1] + ')'], ['playhead', 'Playhead (frame ' + ed.frame() + ')']], () => st.pivot, (v) => (st.pivot = v)),
        UI.note('Tip: you can also drag the ends of the orange bracket above the dopesheet.')), [['Cancel', false], ['Stretch', true, true]]);
      if (ok) this.stretchKeys(st.factor, st.pivot === 'first' ? r[0] : st.pivot === 'last' ? r[1] : ed.frame());
    },
    stretchKeys(factor, pivotFrame) {
      if (!ed.keySel.size) return;
      ed.pushUndo('Stretch keys');
      const fps = ed.fps;
      ed.keySel.forEach((k) => { k.t = Math.max(0, Math.round(pivotFrame + (k.t * fps - pivotFrame) * factor)) / fps; });
      this.normalize();
    },
    reverseKeys() {
      const an = ed.anim; if (!an || !ed.keySel.size) return;
      const r = this.selFrames(); if (!r) return;
      ed.pushUndo('Reverse keys');
      const fps = ed.fps, flipC = (c) => (Array.isArray(c) ? [1 - c[2], 1 - c[3], 1 - c[0], 1 - c[1]] : c);
      for (const tl of an.timelines) {
        const sel = tl.keys.filter((k) => ed.keySel.has(k)).sort((a, b) => a.t - b.t);
        if (!sel.length) continue;
        const curves = sel.map((k) => k.c);
        sel.forEach((k) => (k.t = (r[0] + r[1] - Math.round(k.t * fps)) / fps));
        for (let i = 0; i < sel.length - 1; i++) sel[i + 1].c = flipC(curves[i]);
        sel[0].c = curves[sel.length - 1];
      }
      this.normalize();
    },
    async insertDialog(sign) {
      const st = { n: 5 };
      const ok = await UI.modal(sign > 0 ? 'Insert frames' : 'Remove frames', h('div.form', null,
        UI.num('Frames', () => st.n, (v) => (st.n = Math.max(1, Math.round(v))), { step: 0.2, prec: 0 }),
        UI.note(sign > 0 ? 'All keys at or after the playhead move later.' : 'Keys inside the removed range are deleted; later keys move earlier.')), [['Cancel', false], ['OK', true, true]]);
      if (ok) this.insertFrames(sign * st.n);
    },
    insertFrames(n) {
      const an = ed.anim; if (!an) return;
      ed.pushUndo(n > 0 ? 'Insert frames' : 'Remove frames');
      const fps = ed.fps, f0 = ed.frame();
      for (const tl of an.timelines) {
        if (n < 0) tl.keys = tl.keys.filter((k) => { const f = Math.round(k.t * fps); return !(f >= f0 && f < f0 - n); });
        tl.keys.forEach((k) => { const f = Math.round(k.t * fps); if (f >= f0) k.t = (f + n) / fps; });
      }
      if (an.duration) an.duration = Math.max(0, an.duration + n / fps);
      ed.keySel.clear();
      this.normalize();
    },

    /* ---------------- key operations ---------------- */
    applyCurve(c) {
      if (!ed.keySel.size) return UI.toast('Select keys first (the curve applies from each selected key to the next)');
      ed.pushUndo('Curve');
      ed.keySel.forEach((k) => { k.c = Array.isArray(c) ? c.slice() : c; });
      this.lastCurve = c; if (this.useLastCurve) A.Model.newKeyCurve = c;
      ed.changed('keys'); this.dirty = true;
    },
    deleteKeys() {
      if (!ed.keySel.size || !ed.anim) return false;
      ed.pushUndo('Delete keys');
      ed.anim.timelines.forEach((tl) => (tl.keys = tl.keys.filter((k) => !ed.keySel.has(k))));
      ed.anim.timelines = ed.anim.timelines.filter((t) => t.keys.length);
      ed.keySel.clear(); ed.changed('keys'); return true;
    },
    selectAll() { (this._rows || this.rows()).forEach((r) => r.tls.forEach((tl) => tl.keys.forEach((k) => ed.keySel.add(k)))); this.dirty = true; },
    copy() {
      const an = ed.anim; if (!an || !ed.keySel.size) return;
      const items = [];
      an.timelines.forEach((tl) => tl.keys.forEach((k) => { if (ed.keySel.has(k)) items.push({ desc: { type: tl.type, target: tl.target, prop: tl.prop, attachment: tl.attachment }, t: k.t, v: Model.clone(k.v), c: Model.clone(k.c) }); }));
      const t0 = Math.min(...items.map((i) => i.t)); items.forEach((i) => (i.t -= t0));
      this.clip = items; UI.toast(`Copied ${items.length} key${items.length === 1 ? '' : 's'}`);
    },
    paste() {
      const an = ed.anim; if (!an || !this.clip) return;
      ed.pushUndo('Paste keys'); ed.keySel.clear();
      const t0 = ed.snapTime(ed.time);
      this.clip.forEach((it) => {
        const tl = Model.ensureTimeline(an, it.desc.type, it.desc.target, it.desc.prop, it.desc.attachment);
        const k = Model.setKey(tl, Math.round((t0 + it.t) * ed.fps) / ed.fps, Model.clone(it.v), Model.clone(it.c));
        ed.keySel.add(k);
      });
      ed.changed('keys');
    },
    fit() {
      const an = ed.anim; if (!an) return;
      const d = Math.max(1, Math.round(Model.animDuration(an) * ed.fps));
      this.pxf = M.clamp((this.W - NAMEW - 40) / d, 1, 80); this.scrollF = -1; this.gv.auto = true; this.dirty = true;
    },
  };

  A.TL = TL;
})(window.A);
