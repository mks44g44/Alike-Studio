/* Alike Studio — WebGL attachment renderer (two-color tint, blend modes, stencil clipping) */
(function (A) {
  'use strict';
  const M = A.M;

  const VS = `
    attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aLight; attribute vec3 aDark;
    uniform vec4 uView; // camX, camY, sx, sy
    varying vec2 vUV; varying vec4 vLight; varying vec3 vDark;
    void main(){
      vUV = aUV; vLight = aLight; vDark = aDark;
      gl_Position = vec4((aPos.x - uView.x) * uView.z, (aPos.y - uView.y) * uView.w, 0.0, 1.0);
    }`;
  const FS = `
    precision mediump float;
    uniform sampler2D uTex; uniform float uUseDark;
    varying vec2 vUV; varying vec4 vLight; varying vec3 vDark;
    void main(){
      vec4 t = texture2D(uTex, vUV);           // premultiplied
      vec3 rgb = t.rgb * vLight.rgb + (t.a - t.rgb) * vDark * uUseDark;
      gl_FragColor = vec4(rgb * vLight.a, t.a * vLight.a);
    }`;

  const STRIDE = 11;

  class GLRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl', { stencil: true, premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL not available');
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = this.prog = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      this.loc = {
        aPos: gl.getAttribLocation(p, 'aPos'), aUV: gl.getAttribLocation(p, 'aUV'),
        aLight: gl.getAttribLocation(p, 'aLight'), aDark: gl.getAttribLocation(p, 'aDark'),
        uView: gl.getUniformLocation(p, 'uView'), uTex: gl.getUniformLocation(p, 'uTex'), uUseDark: gl.getUniformLocation(p, 'uUseDark'),
      };
      this.buf = gl.createBuffer();
      this.data = new Float32Array(STRIDE * 3 * 8192);
      this.count = 0;
      this.tex = new Map();
      this.white = this.makeTex(null);
      this.curTex = null; this.curBlend = 'normal'; this.curDark = false;
    }
    makeTex(img) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    textureFor(name, img) {
      if (!img) return null;
      if (img instanceof HTMLCanvasElement ? !img.width : !img.complete || !img.naturalWidth) return null;
      let e = this.tex.get(name);
      if (e && e.img === img) return e.t;
      if (e) this.gl.deleteTexture(e.t);
      const t = this.makeTex(img); this.tex.set(name, { img, t });
      return t;
    }
    resize(w, h, dpr) {
      const c = this.canvas;
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      this.cssW = w; this.cssH = h;
    }
    begin(cam) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.useProgram(this.prog);
      gl.uniform4f(this.loc.uView, cam.x, cam.y, (cam.zoom * 2) / this.cssW, (cam.zoom * 2) / this.cssH);
      gl.uniform1i(this.loc.uTex, 0);
      gl.enable(gl.BLEND);
      this.setBlend('normal', true);
      this.count = 0; this.curTex = null; this.clipping = false;
    }
    setBlend(mode, force) {
      if (!force && mode === this.curBlend) return;
      const gl = this.gl; this.curBlend = mode;
      switch (mode) {
        case 'additive': gl.blendFunc(gl.ONE, gl.ONE); break;
        case 'multiply': gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA); break;
        case 'screen': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
        default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
    }
    flush() {
      if (!this.count) return;
      const gl = this.gl, L = this.loc;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.curTex || this.white);
      gl.uniform1f(L.uUseDark, this.curDark ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * STRIDE), gl.STREAM_DRAW);
      const B = 4 * STRIDE;
      gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 2, gl.FLOAT, false, B, 0);
      gl.enableVertexAttribArray(L.aUV); gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, B, 8);
      gl.enableVertexAttribArray(L.aLight); gl.vertexAttribPointer(L.aLight, 4, gl.FLOAT, false, B, 16);
      gl.enableVertexAttribArray(L.aDark); gl.vertexAttribPointer(L.aDark, 3, gl.FLOAT, false, B, 32);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.count = 0;
    }
    pushTris(verts, uvs, tris, tex, blend, light, dark) {
      const useDark = !!dark;
      if (tex !== this.curTex || blend !== this.curBlend || useDark !== this.curDark) {
        this.flush(); this.curTex = tex; this.setBlend(blend); this.curDark = useDark;
      }
      if ((this.count + tris.length) * STRIDE > this.data.length) {
        this.flush();
        if (tris.length * STRIDE > this.data.length) this.data = new Float32Array(tris.length * STRIDE * 2);
      }
      const d = this.data; let o = this.count * STRIDE;
      const dr = dark ? dark[0] : 0, dg = dark ? dark[1] : 0, db = dark ? dark[2] : 0;
      for (let i = 0; i < tris.length; i++) {
        const k = tris[i];
        d[o++] = verts[k * 2]; d[o++] = verts[k * 2 + 1];
        d[o++] = uvs[k * 2]; d[o++] = uvs[k * 2 + 1];
        d[o++] = light[0]; d[o++] = light[1]; d[o++] = light[2]; d[o++] = light[3];
        d[o++] = dr; d[o++] = dg; d[o++] = db;
      }
      this.count += tris.length;
    }
    beginClip(worldPoly, inverse) {
      const gl = this.gl;
      this.flush();
      gl.enable(gl.STENCIL_TEST);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
      const tris = M.earClip(Array.from(worldPoly));
      const uvs = new Float32Array(worldPoly.length);
      this.pushTris(worldPoly, uvs, tris, this.white, this.curBlend, [1, 1, 1, 1], null);
      this.flush();
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(inverse ? gl.NOTEQUAL : gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      this.clipping = true;
    }
    endClip() {
      if (!this.clipping) return;
      this.flush();
      this.gl.disable(this.gl.STENCIL_TEST);
      this.clipping = false;
    }

    /* Draw a full skeleton pose.
       opts: images (name -> HTMLImageElement), tint [r,g,b,a], hidden Set(slotName), texPrefix (texture cache key prefix) */
    drawPose(pose, opts) {
      const tint = opts.tint || [1, 1, 1, 1];
      let clipEnd = null;
      for (const slot of pose.drawOrder) {
        if (!slot.bone.active) { if (clipEnd === slot.name) { this.endClip(); clipEnd = null; } continue; }
        const hidden = opts.hidden && opts.hidden.has(slot.name);
        const att = pose.attachmentOf(slot);
        if (att && att.type === 'clip' && !clipEnd && !hidden && att.verts.length >= 6) {
          const g = pose.geometry(slot, att);
          this.beginClip(g.verts, !!att.inverse);
          clipEnd = att.end || '__end__';
        } else if (att && !hidden && (att.type === 'region' || att.type === 'mesh' || att.type === 'linkedmesh')) {
          const g = pose.geometry(slot, att);
          if (g && g.tris && g.tris.length) {
            const tex = this.textureFor((opts.texPrefix || '') + g.image, opts.images[g.image]);
            if (tex) {
              const sc = slot.color, ac = att.color || [1, 1, 1, 1];
              const light = [sc[0] * ac[0] * tint[0], sc[1] * ac[1] * tint[1], sc[2] * ac[2] * tint[2], sc[3] * ac[3] * tint[3]];
              if (light[3] > 0.001) this.pushTris(g.verts, g.uvs, g.tris, tex, slot.data.blend || 'normal', light, slot.dark);
            }
          }
        }
        if (clipEnd && clipEnd === slot.name) { this.endClip(); clipEnd = null; }
      }
      this.flush();
      this.endClip();
    }
  }

  A.GLRenderer = GLRenderer;
})(window.A);
