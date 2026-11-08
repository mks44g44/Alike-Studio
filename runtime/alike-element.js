/* Alike web components — <alike-skeleton> plays an Alike export on any web page with no JavaScript to write.

     <script src="alike-web.js"></script>
     <alike-skeleton src="hero.json" animation="walk" skin="default" style="width:320px;height:320px"></alike-skeleton>

   Attributes
     src         .json or .alkb export (atlas pages and audio/ are loaded from the same folder), or "#name" for data
                 registered with AlikeWeb.register(name, data, files)
     animation   animation on track 0 (default: the first one)        loop        "false" to play once
     skin        skin name, or several separated by commas to combine them
     speed       time scale (1)            mix        default crossfade seconds (0.2)
     fit         "contain" (default: fit the setup pose in the box) or "none" (origin at the bottom center)
     scale       zoom when fit="none" (1)  offset-x / offset-y   camera offset in skeleton units
     physics     "false" turns physics off          paused      present = paused
     sound       "false" mutes event audio         isolated    present = own canvas (respects z-index; uses one WebGL context per element)
     background  CSS color painted behind the skeleton

   Many elements share one WebGL canvas laid over the page, so a page can show dozens of skeletons.
   Elements outside the window are not drawn.

   Script API (element methods/properties)
     el.ready (Promise) · el.state (AnimationState) · el.skeleton (skeleton data) · el.pose (last pose)
     el.setAnimation(name, loop = true, track = 0) · el.addAnimation(name, loop = true, delay = 0, track = 0)
     el.setSkin("a,b") · el.play() · el.pause() · el.bone(name) → { x, y, rotation } in page pixels
   DOM events: "alike-ready", "alike-event" (detail: { name, int, float, string, time, track }), "alike-error" */
(function (A) {
  'use strict';
  if (!window.customElements || customElements.get('alike-skeleton')) return;

  const registry = {};       // "#name" → { data, files }
  const waiting = {};        // "#name" registered later (the tag can come before the register() script)
  const registered = (name) => registry[name] ? Promise.resolve(registry[name]) : new Promise((res) => (waiting[name] = waiting[name] || []).push(res));
  const assetCache = new Map(); // src → Promise<{ data, images, sounds }>
  let uid = 0;

  function unpremultiply(c) {
    const x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; if (a > 0) { d[i] = Math.min(255, d[i] / a); d[i + 1] = Math.min(255, d[i + 1] / a); d[i + 2] = Math.min(255, d[i + 2] / a); } }
    x.putImageData(id, 0, 0);
  }
  async function loadImage(url) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode(); return img;
  }
  function loadAssets(src) {
    if (assetCache.has(src)) return assetCache.get(src);
    const p = (async () => {
      let data, files = {}, base = '';
      if (src.startsWith('#')) {
        const r = await registered(src.slice(1));
        data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; files = r.files || {};
      } else {
        const url = new URL(src, document.baseURI).href; base = url;
        const res = await fetch(url); if (!res.ok) throw new Error('Cannot load ' + src + ' (' + res.status + ')');
        data = /\.alkb(\?|#|$)/i.test(url) ? A.Binary.decode(await res.arrayBuffer()) : await res.json();
      }
      const resolve = (f) => files[f] || (base ? new URL(f, base).href : f);
      const images = {}, sounds = {};
      if (data.atlas) for (const page of data.atlas.pages) {
        const img = await loadImage(page.data || resolve(page.file));
        for (const name in page.regions) { const c = A.Atlas.sliceRegion(img, page.regions[name]); if (data.atlas.pma) unpremultiply(c); images[name] = c; }
      }
      for (const a of data.audio || []) sounds[a.name] = files[a.name] || resolve(a.file);
      return { data, images, sounds, key: 'w' + (++uid) + ':' };
    })();
    assetCache.set(src, p);
    p.catch(() => assetCache.delete(src));
    return p;
  }

  /* ---------- the shared overlay canvas ---------- */
  const Shared = {
    els: new Set(), canvas: null, R: null, raf: 0, last: 0,
    ensure() {
      if (this.R) return this.R;
      const c = this.canvas = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147483000' });
      document.body.appendChild(c);
      this.R = new A.GLRenderer(c);
      return this.R;
    },
    add(el) { this.els.add(el); this.start(); },
    remove(el) { this.els.delete(el); },
    start() {
      if (this.raf) return;
      this.last = performance.now();
      const tick = (now) => {
        const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
        const shared = [...this.els].filter((e) => !e.isolated && e._ready);
        for (const e of this.els) if (e._ready) e._advance(dt);
        if (shared.length) this.drawShared(shared);
        for (const e of this.els) if (e.isolated && e._ready) e._drawIsolated();
        this.raf = this.els.size ? requestAnimationFrame(tick) : 0;
      };
      this.raf = requestAnimationFrame(tick);
    },
    drawShared(list) {
      const R = this.ensure(), gl = R.gl, dpr = window.devicePixelRatio || 1;
      const vw = window.innerWidth, vh = window.innerHeight;
      R.resize(vw, vh, dpr);
      gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, R.canvas.width, R.canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      for (const el of list) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue; // off screen
        const x = Math.round(r.left * dpr), y = Math.round((vh - r.bottom) * dpr), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        gl.enable(gl.SCISSOR_TEST); gl.scissor(x, y, w, h); gl.viewport(x, y, w, h);
        el._render(R, r.width, r.height, true);
      }
      gl.disable(gl.SCISSOR_TEST);
    },
  };

  class AlikeSkeleton extends HTMLElement {
    static get observedAttributes() { return ['src', 'animation', 'skin', 'speed', 'mix', 'loop', 'paused', 'fit', 'scale', 'offset-x', 'offset-y', 'background']; }
    constructor() {
      super();
      this._ready = false; this.phys = {}; this.pose = null;
      this.ready = new Promise((r) => (this._resolveReady = r));
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>:host{display:inline-block;position:relative;width:300px;height:300px;vertical-align:middle}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style><slot></slot>';
    }
    get isolated() { return this.hasAttribute('isolated'); }
    connectedCallback() { if (!this._loading) this._load(); Shared.add(this); }
    disconnectedCallback() { Shared.remove(this); }
    attributeChangedCallback(name, oldV, v) {
      if (oldV === v || !this._ready) return;
      if (name === 'src') { this._ready = false; this._load(); }
      else if (name === 'animation') this.setAnimation(v || this.skeleton.animations[0].name, this.getAttribute('loop') !== 'false');
      else if (name === 'skin') this.setSkin(v);
      else if (name === 'mix') this.state.defaultMix = parseFloat(v) || 0;
      else if (name === 'fit' || name === 'skin') this._fit = null;
    }
    async _load() {
      this._loading = true;
      const src = this.getAttribute('src'); if (!src) return;
      try {
        const a = await loadAssets(src);
        this.assets = a;
        this.skeleton = JSON.parse(JSON.stringify(a.data.skeleton)); // own copy: skins get combined per element
        this.state = new A.AnimationState(this.skeleton);
        this.state.defaultMix = this.hasAttribute('mix') ? parseFloat(this.getAttribute('mix')) || 0 : 0.2;
        this.state.listeners.push((ev, track) => this._onEvent(ev, track));
        this.setSkin(this.getAttribute('skin'));
        const an = this.getAttribute('animation') || (this.skeleton.animations[0] && this.skeleton.animations[0].name);
        if (an) this.setAnimation(an, this.getAttribute('loop') !== 'false');
        this._fit = null; this._ready = true;
        this._resolveReady(this);
        this.dispatchEvent(new CustomEvent('alike-ready', { detail: { skeleton: this.skeleton }, bubbles: true }));
      } catch (e) {
        console.error('<alike-skeleton>', e);
        this.dispatchEvent(new CustomEvent('alike-error', { detail: { error: e }, bubbles: true }));
      }
    }
    setAnimation(name, loop = true, track = 0) { return this.state && this.state.setAnimation(track, name, loop); }
    addAnimation(name, loop = true, delay = 0, track = 0) { return this.state && this.state.addAnimation(track, name, loop, delay); }
    play() { this.removeAttribute('paused'); }
    pause() { this.setAttribute('paused', ''); }
    /* "a,b" combines skins (later ones win where they overlap) */
    setSkin(list) {
      const sk = this.skeleton; if (!sk) return;
      const names = String(list || 'default').split(',').map((s) => s.trim()).filter((n) => sk.skins.some((s) => s.name === n));
      sk.skins = sk.skins.filter((s) => s.name !== '__combined');
      if (names.length <= 1) { this.skinName = names[0] || 'default'; }
      else {
        const c = { name: '__combined', attachments: {}, bones: [], constraints: [] };
        for (const n of names) { const s = sk.skins.find((x) => x.name === n); for (const sl in s.attachments) c.attachments[sl] = Object.assign(c.attachments[sl] || {}, s.attachments[sl]); c.bones.push(...s.bones); c.constraints.push(...s.constraints); }
        sk.skins.push(c); this.skinName = '__combined';
      }
      this.phys = {}; this._fit = null;
    }
    _onEvent(ev, track) {
      this.dispatchEvent(new CustomEvent('alike-event', { detail: Object.assign({ track }, ev), bubbles: true, composed: true }));
      if (this.getAttribute('sound') === 'false') return;
      const def = A.Model.event(this.skeleton, ev.name), url = def && def.audio && this.assets.sounds[def.audio];
      if (url) { const au = new Audio(url); au.volume = Math.max(0, Math.min(1, ev.volume != null ? ev.volume : def.volume)); au.play().catch(() => {}); }
    }
    _advance(dt) {
      if (this.hasAttribute('paused')) dt = 0;
      dt *= this.hasAttribute('speed') ? parseFloat(this.getAttribute('speed')) || 0 : 1;
      this.state.update(dt);
      const p = new A.Pose({ skeleton: this.skeleton }, this.skinName);
      this.state.apply(p);
      p.update(this.getAttribute('physics') === 'false' ? 0 : dt, this.phys);
      this.pose = p;
    }
    _bounds() {
      if (this._fit) return this._fit;
      const p = new A.Pose({ skeleton: this.skeleton }, this.skinName); p.update();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const s of p.slots) { const g = p.geometry(s); if (g && g.tris) for (let i = 0; i < g.verts.length; i += 2) { x0 = Math.min(x0, g.verts[i]); x1 = Math.max(x1, g.verts[i]); y0 = Math.min(y0, g.verts[i + 1]); y1 = Math.max(y1, g.verts[i + 1]); } }
      if (x0 > x1) { x0 = -100; x1 = 100; y0 = 0; y1 = 200; }
      return (this._fit = { x0, y0, x1, y1 });
    }
    _camera(w, h) {
      const ox = parseFloat(this.getAttribute('offset-x')) || 0, oy = parseFloat(this.getAttribute('offset-y')) || 0;
      if (this.getAttribute('fit') === 'none') { const z = parseFloat(this.getAttribute('scale')) || 1; return { x: ox, y: h / 2 / z + oy, zoom: z }; }
      const b = this._bounds(), z = Math.min(w / (b.x1 - b.x0 || 1), h / (b.y1 - b.y0 || 1)) * 0.92;
      return { x: (b.x0 + b.x1) / 2 + ox, y: (b.y0 + b.y1) / 2 + oy, zoom: z };
    }
    _render(R, w, h, shared) {
      const gl = R.gl, cam = this._camera(w, h);
      this._cam = cam; this._size = [w, h];
      if (!shared) { R.begin(cam); } else {
        gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.useProgram(R.prog);
        gl.uniform4f(R.loc.uView, cam.x, cam.y, (cam.zoom * 2) / w, (cam.zoom * 2) / h);
        gl.uniform1i(R.loc.uTex, 0); gl.enable(gl.BLEND); R.setBlend('normal', true);
        R.count = 0; R.curTex = null; R.clipping = false;
      }
      const bg = this.getAttribute('background');
      if (bg) { const c = this._bg && this._bg[0] === bg ? this._bg[1] : (this._bg = [bg, parseColor(bg)])[1]; gl.clearColor(c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]); gl.clear(gl.COLOR_BUFFER_BIT); }
      R.drawPose(this.pose, { images: this.assets.images, texPrefix: this.assets.key });
    }
    _drawIsolated() {
      if (!this._canvas) { this._canvas = document.createElement('canvas'); this.shadowRoot.appendChild(this._canvas); this._R = new A.GLRenderer(this._canvas); }
      const r = this.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) return;
      this._R.resize(r.width, r.height, window.devicePixelRatio || 1);
      this._render(this._R, r.width, r.height, false);
    }
    /* bone position in page (client) pixels, e.g. to attach HTML to a hand */
    bone(name) {
      const b = this.pose && this.pose.boneMap[name]; if (!b || !this._cam) return null;
      const r = this.getBoundingClientRect(), c = this._cam;
      return { x: r.left + r.width / 2 + (b.wx - c.x) * c.zoom, y: r.top + r.height / 2 - (b.wy - c.y) * c.zoom, rotation: this.pose.worldRot(b) };
    }
  }
  function parseColor(css) {
    const c = document.createElement('canvas').getContext('2d'); c.fillStyle = css; c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
  }

  customElements.define('alike-skeleton', AlikeSkeleton);
  window.AlikeWeb = {
    /* register embedded data: <alike-skeleton src="#name">. files maps atlas page / audio file names to URLs (data: URLs work) */
    register(name, data, files) { registry[name] = { data, files }; (waiting[name] || []).forEach((f) => f(registry[name])); delete waiting[name]; },
    preload: (src) => loadAssets(src),
    Element: AlikeSkeleton,
  };
})(window.A);
