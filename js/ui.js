/* Alike Studio — small DOM/UI toolkit: fields, menus, dialogs */
(function (A) {
  'use strict';
  const M = A.M;

  function h(tag, attrs, ...kids) {
    const [t, ...cls] = tag.split('.');
    const el = document.createElement(t || 'div');
    if (cls.length) el.className = cls.join(' ');
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'cls') el.className += ' ' + v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const refreshers = new Set();
  /* Math in numeric fields: expressions, v/value, += -= *= /= prefixes, constants and functions. */
  const EXPR_FUNCS = { abs: Math.abs, min: Math.min, max: Math.max, sin: (d) => Math.sin(d * Math.PI / 180), cos: (d) => Math.cos(d * Math.PI / 180), tan: (d) => Math.tan(d * Math.PI / 180),
    sqrt: Math.sqrt, pow: Math.pow, round: Math.round, floor: Math.floor, ceil: Math.ceil, random: (a = 0, b = 1) => a + Math.random() * (b - a),
    clamp: (x, a, b) => Math.min(Math.max(x, a), b), lerp: (a, b, t) => a + (b - a) * t, pi: Math.PI, PI: Math.PI };
  const UI = {
    h,
    refreshers,
    exprVars: null, // optional () => ({ boneLength, boneRotation, ... }) set by the properties panel
    evalExpr(text, cur) {
      let expr = String(text).trim(), op = null;
      const m = /^([+\-*/])=\s*(.+)$/.exec(expr); if (m) { op = m[1]; expr = m[2]; }
      if (!expr) return NaN;
      const scope = Object.assign({}, EXPR_FUNCS, { v: cur, value: cur }, UI.exprVars ? UI.exprVars() : {});
      const ids = expr.replace(/(\d*\.)?\d+(e[+-]?\d+)?/gi, '0').match(/[A-Za-z_]\w*/g) || [];
      if (ids.some((id) => !(id in scope))) return NaN;
      if (/[^\w\s.+\-*/(),%]/.test(expr)) return NaN;
      let v;
      try { v = Function(...Object.keys(scope), '"use strict"; return (' + expr + ');')(...Object.values(scope)); } catch (e) { return NaN; }
      if (typeof v !== 'number' || !isFinite(v)) return NaN;
      if (op === '+') v = cur + v; else if (op === '-') v = cur - v; else if (op === '*') v = cur * v; else if (op === '/') v = v ? cur / v : cur;
      return v;
    },
    refreshAll() { for (const r of refreshers) { try { r(); } catch (e) { /* stale field */ } } },
    clearRefreshers() { refreshers.clear(); },

    /* key diamond button: state() → 'none'|'timeline'|'key'|'dirty' */
    keyBtn(state, onKey, title = 'Set key') {
      const b = h('button.keybtn', { title, onclick: (e) => { e.stopPropagation(); onKey(); } });
      const r = () => { const s = state(); if (b._s !== s) { b._s = s; b.className = 'keybtn k-' + s; } };
      refreshers.add(r); r();
      return b;
    },

    /* numeric field with scrubbable label.  set(value, pushUndo) */
    num(label, get, set, o = {}) {
      const step = o.step != null ? o.step : 0.1, prec = o.prec != null ? o.prec : 2;
      const input = h('input.num', { type: 'text', spellcheck: 'false' });
      const fmt = (v) => (typeof v === 'number' && isFinite(v) ? String(M.round(v, prec)) : '');
      const commit = () => {
        let v = UI.evalExpr(input.value, get());
        if (typeof v === 'number' && isFinite(v)) { if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v); set(v, true); }
        input.value = fmt(get());
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { commit(); input.blur(); }
        if (e.key === 'Escape') { input.value = fmt(get()); input.blur(); }
        e.stopPropagation();
      });
      input.addEventListener('change', commit);
      input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
      const lab = h('label.scrub', { title: 'Drag to scrub (Shift = fine, Ctrl = coarse)' }, label);
      lab.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const x0 = e.clientX, v0 = get(); let first = true;
        const mv = (ev) => {
          const k = ev.shiftKey ? 0.1 : ev.ctrlKey ? 10 : 1;
          let v = v0 + (ev.clientX - x0) * step * k;
          if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v);
          set(M.round(v, prec), first); first = false;
          input.value = fmt(v);
        };
        const upf = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', upf); if (o.onEnd) o.onEnd(); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', upf);
      });
      input.value = fmt(get());
      refreshers.add(() => { if (document.activeElement !== input) { const s = fmt(get()); if (input.value !== s) input.value = s; } });
      return h('div.field', null, lab, input, o.key || null, o.suffix ? h('span.suffix', null, o.suffix) : null);
    },
    /* two numeric inputs on one row sharing a key button */
    num2(label, a, b, key) {
      const row = h('div.field2', null, h('span.flabel', null, label), UI.num(a.label, a.get, a.set, a), UI.num(b.label, b.get, b.set, b), key || null);
      return row;
    },
    text(label, get, set, o = {}) {
      const input = h('input.txt', { type: 'text', spellcheck: 'false', placeholder: o.placeholder || '' });
      input.value = get() || '';
      const commit = () => { const v = input.value.trim(); if (v !== (get() || '')) set(v); input.value = get() || ''; };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); input.blur(); } if (e.key === 'Escape') { input.value = get() || ''; input.blur(); } e.stopPropagation(); });
      input.addEventListener('change', commit);
      refreshers.add(() => { if (document.activeElement !== input && input.value !== (get() || '')) input.value = get() || ''; });
      return h('div.field', null, h('span.flabel', null, label), input);
    },
    check(label, get, set, key) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !!get();
      cb.addEventListener('change', () => set(cb.checked));
      refreshers.add(() => { if (cb.checked !== !!get()) cb.checked = !!get(); });
      return h('label.check', null, cb, h('span', null, label), key || null);
    },
    select(label, options, get, set, key) {
      const sel = h('select');
      const fill = () => {
        const opts = typeof options === 'function' ? options() : options;
        sel.innerHTML = '';
        for (const op of opts) { const [v, t] = Array.isArray(op) ? op : [op, op]; sel.appendChild(h('option', { value: v == null ? '' : v }, t)); }
        sel.value = get() == null ? '' : get();
      };
      fill();
      sel.addEventListener('mousedown', () => fill());
      sel.addEventListener('change', () => set(sel.value === '' ? null : sel.value));
      refreshers.add(() => { if (document.activeElement !== sel) { const v = get() == null ? '' : get(); if (sel.value !== v) fill(); } });
      return h('div.field', null, label ? h('span.flabel', null, label) : null, sel, key || null);
    },
    color(label, get, set, o = {}) {
      // get() → [r,g,b,a]
      const inp = h('input', { type: 'color' });
      const alpha = h('input.num.alpha', { type: 'text', title: 'Alpha (0–1)' });
      const sync = () => { const c = get() || [1, 1, 1, 1]; inp.value = '#' + M.rgbaToHex(c, false); if (document.activeElement !== alpha) alpha.value = M.round(c[3] == null ? 1 : c[3], 2); };
      sync();
      let first = true;
      inp.addEventListener('input', () => { const c = M.hexToRgba(inp.value); const cur = get() || [1, 1, 1, 1]; c[3] = cur[3] == null ? 1 : cur[3]; set(c, first); first = false; });
      inp.addEventListener('change', () => { first = true; });
      alpha.addEventListener('keydown', (e) => e.stopPropagation());
      alpha.addEventListener('change', () => { const c = (get() || [1, 1, 1, 1]).slice(); c[3] = M.clamp(parseFloat(alpha.value) || 0, 0, 1); set(c, true); });
      refreshers.add(sync);
      return h('div.field', null, h('span.flabel', null, label), inp, o.noAlpha ? null : alpha, o.key || null);
    },
    button(label, onclick, o = {}) { return h('button.btn' + (o.primary ? '.primary' : '') + (o.danger ? '.danger' : ''), { onclick, title: o.title || '' }, label); },
    row(...kids) { return h('div.btnrow', null, ...kids); },
    section(title, ...kids) {
      const body = h('div.sec-body', null, ...kids);
      const head = h('div.sec-head', { onclick: () => sec.classList.toggle('collapsed') }, h('span.caret', null, '▾'), title);
      const sec = h('div.section', null, head, body);
      return sec;
    },
    note(t) { return h('div.note', null, t); },

    /* ---------- menus ---------- */
    menu(x, y, items) {
      UI.closeMenus();
      const m = h('div.menu');
      const build = (list, el) => {
        for (const it of list) {
          if (it === '-') { el.appendChild(h('div.menu-sep')); continue; }
          if (!it) continue;
          const row = h('div.menu-item' + (it.disabled ? '.disabled' : ''), null,
            h('span.mi-check', null, it.checked ? '✓' : ''), h('span.mi-label', null, it.label), h('span.mi-key', null, it.key || (it.sub ? '›' : '')));
          if (it.sub) {
            const sub = h('div.menu.sub'); build(it.sub, sub); row.appendChild(sub);
            row.classList.add('has-sub');
          } else if (!it.disabled) row.addEventListener('click', (e) => { e.stopPropagation(); UI.closeMenus(); it.action && it.action(); });
          el.appendChild(row);
        }
      };
      build(items, m);
      document.body.appendChild(m);
      const r = m.getBoundingClientRect();
      m.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px';
      m.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
      setTimeout(() => window.addEventListener('mousedown', UI._closer = (e) => { if (!m.contains(e.target)) UI.closeMenus(); }), 0);
      return m;
    },
    closeMenus() {
      document.querySelectorAll('body > .menu').forEach((m) => m.remove());
      if (UI._closer) { window.removeEventListener('mousedown', UI._closer); UI._closer = null; }
    },

    /* ---------- dialogs ---------- */
    modal(title, body, buttons) {
      return new Promise((resolve) => {
        const close = (v) => { bg.remove(); window.removeEventListener('keydown', kd, true); resolve(v); };
        const kd = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
        const btns = (buttons || [['OK', true]]).map(([t, v, primary]) => UI.button(t, () => close(typeof v === 'function' ? v() : v), { primary }));
        const dlg = h('div.dialog', null, h('div.dlg-title', null, title), h('div.dlg-body', null, body), h('div.dlg-btns', null, ...btns));
        const bg = h('div.dlg-bg', { onmousedown: (e) => { if (e.target === bg) close(null); } }, dlg);
        document.body.appendChild(bg);
        window.addEventListener('keydown', kd, true);
        const f = dlg.querySelector('input,select,textarea'); if (f) setTimeout(() => { f.focus(); f.select && f.select(); }, 30);
      });
    },
    prompt(title, value = '', label = 'Name') {
      const inp = h('input.txt.wide', { type: 'text', value });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.closest('.dialog').querySelector('.btn.primary').click(); });
      return UI.modal(title, h('div', null, h('div.flabel', null, label), inp), [['Cancel', null], ['OK', () => inp.value.trim() || null, true]]);
    },
    confirm(title, text) { return UI.modal(title, h('div', null, text), [['Cancel', false], ['OK', true, true]]); },
    alert(title, text) { return UI.modal(title, typeof text === 'string' ? h('div', null, text) : text, [['OK', true, true]]); },
    toast(text, ms = 2200) {
      const t = h('div.toast', null, text); document.body.appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
    },
  };

  A.UI = UI;
})(window.A);
