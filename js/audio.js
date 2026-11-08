/* Alike Studio — event audio: imported sounds, WebAudio playback with volume & balance */
(function (A) {
  'use strict';
  const ed = A.ed, Model = A.Model;

  const Au = {
    ctx: null, buffers: new Map(), enabled: true,
    context() {
      if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ctx = new C(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    async buffer(name) {
      const rec = ed.project.audio && ed.project.audio[name]; if (!rec) return null;
      const hit = this.buffers.get(name);
      if (hit && hit.src === rec.data) return hit.buf;
      const ctx = this.context(); if (!ctx) return null;
      const bin = atob(rec.data.split(',')[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      try { const buf = await ctx.decodeAudioData(u8.buffer); this.buffers.set(name, { src: rec.data, buf }); return buf; } catch (e) { console.warn('Audio decode failed', name, e); return null; }
    },
    async play(name, volume = 1, balance = 0) {
      if (!this.enabled || !name) return;
      const ctx = this.context(); if (!ctx) return;
      const buf = await this.buffer(name); if (!buf) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain(); gain.gain.value = Math.max(0, volume);
      let node = src.connect(gain);
      if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, balance)); node = node.connect(pan); }
      node.connect(ctx.destination);
      src.start();
      return buf.duration;
    },
    /* ---------- waveforms ---------- */
    peakCache: new Map(), // name -> { src, peaks: Float32Array [min,max,…] at PEAK_RATE buckets per second, duration } | 'pending'
    PEAK_RATE: 200,
    /* returns cached peaks, or null while decoding (onReady is called once they exist) */
    peaks(name, onReady) {
      const rec = ed.project.audio && ed.project.audio[name]; if (!rec) return null;
      const hit = this.peakCache.get(name);
      if (hit && hit !== 'pending' && hit.src === rec.data) return hit;
      if (hit === 'pending') return null;
      this.peakCache.set(name, 'pending');
      (async () => {
        try {
          const bin = atob(rec.data.split(',')[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; // decodes without a user gesture
          const buf = await new OC(1, 1, 44100).decodeAudioData(u8.buffer);
          const n = Math.max(1, Math.ceil(buf.duration * this.PEAK_RATE)), per = buf.length / n, peaks = new Float32Array(n * 2);
          const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
          for (let i = 0; i < n; i++) {
            let lo = 0, hi = 0; const a = Math.floor(i * per), b = Math.min(buf.length, Math.floor((i + 1) * per));
            for (let j = a; j < b; j++) { let v = 0; for (const ch of chans) v += ch[j]; v /= chans.length; if (v < lo) lo = v; if (v > hi) hi = v; }
            peaks[i * 2] = lo; peaks[i * 2 + 1] = hi;
          }
          this.peakCache.set(name, { src: rec.data, peaks, duration: buf.duration });
        } catch (e) { this.peakCache.set(name, { src: rec.data, peaks: new Float32Array(0), duration: 0 }); }
        if (onReady) onReady();
        ed.emit('waveform', name);
      })();
      return null;
    },
    /* draw a waveform: x0..x1 covers `seconds` of the sound starting at 0 */
    drawWave(c, pk, x0, pxPerSec, yMid, halfH, color, clipX0 = -Infinity, clipX1 = Infinity) {
      if (!pk || !pk.peaks.length) return;
      const n = pk.peaks.length / 2, step = pxPerSec / this.PEAK_RATE;
      c.fillStyle = color; c.beginPath();
      const start = Math.max(0, Math.floor((clipX0 - x0) / step)), end = Math.min(n, Math.ceil((clipX1 - x0) / step));
      for (let i = start; i < end;) { // merge buckets that fall on the same pixel column
        const x = x0 + i * step; let lo = 0, hi = 0, j = i;
        do { lo = Math.min(lo, pk.peaks[j * 2]); hi = Math.max(hi, pk.peaks[j * 2 + 1]); j++; } while (j < end && x0 + j * step < x + 1);
        c.rect(x, yMid - hi * halfH, Math.max(1, (j - i) * step), Math.max(1, (hi - lo) * halfH));
        i = j;
      }
      c.fill();
    },
    waveCanvas(name, w = 260, hgt = 54) {
      const cv = document.createElement('canvas'); const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = hgt * dpr; cv.style.width = w + 'px'; cv.style.height = hgt + 'px'; cv.className = 'wave';
      const draw = () => {
        const pk = this.peaks(name, draw); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
        c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(0, 0, w, hgt);
        if (!pk) { c.fillStyle = '#8b919c'; c.font = '11px system-ui'; c.fillText('decoding…', 8, hgt / 2 + 4); return; }
        this.drawWave(c, pk, 0, pk.duration ? w / pk.duration : 1, hgt / 2, hgt / 2 - 2, '#56d4dd');
        c.fillStyle = '#8b919c'; c.font = '10px system-ui'; c.fillText(pk.duration.toFixed(2) + 's', 4, 11);
      };
      draw(); return cv;
    },
    /* play the sound for a fired event (key values override the event defaults) */
    playEvent(ev, sk) {
      const def = Model.event(sk || ed.sk, ev.name); if (!def || !def.audio) return;
      Au.play(def.audio, ev.volume != null ? ev.volume : def.volume, ev.balance != null ? ev.balance : def.balance);
    },
    readFile(file) {
      return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(file); });
    },
    async importFiles(files) {
      const list = [...files].filter((f) => A.Formats.isAudio(f.name) || (f.type || '').startsWith('audio/'));
      if (!list.length) return [];
      ed.pushUndo('Import audio');
      ed.project.audio = ed.project.audio || {};
      const added = [];
      for (const f of list) {
        const data = await A.Formats.readAudio(f); if (!data) continue;
        const name = f.name.replace(/\.[^.]+$/, '');
        ed.project.audio[name] = { data };
        added.push(name);
      }
      ed.changed('structure');
      A.UI.toast(`Imported ${added.length} sound${added.length === 1 ? '' : 's'}`);
      return added;
    },
  };
  ed.on('events', (list) => list.forEach((ev) => Au.playEvent(ev)));
  A.Audio = Au;
})(window.A);
