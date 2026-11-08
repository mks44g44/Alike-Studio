/* Alike Studio — Problems view: scans the project for warnings and offers one-click fixes */
(function (A) {
  'use strict';
  const Model = A.Model, MO = A.MeshOps, ed = A.ed, UI = A.UI, h = UI.h;

  function scan() {
    const sk = ed.sk, pj = ed.project, out = [];
    const add = (level, text, ref, fix, fixLabel) => out.push({ level, text, ref, fix, fixLabel });
    const usedImages = new Set();
    // attachments
    for (const skin of sk.skins) for (const slot in skin.attachments) for (const name in skin.attachments[slot]) {
      const a = skin.attachments[slot][name], ref = { k: 'att', n: name, slot, skin: skin.name };
      if (!Model.slot(sk, slot)) { add('error', `Skin "${skin.name}" has attachments for missing slot "${slot}"`, null, () => { delete skin.attachments[slot]; }, 'Remove'); continue; }
      if (a.path) {
        const paths = a.sequence ? Array.from({ length: a.sequence.count }, (_, i) => a.path + String((a.sequence.start || 0) + i).padStart(a.sequence.digits || 0, '0')) : [a.path];
        paths.forEach((p) => usedImages.add(p));
        const missing = paths.filter((p) => !pj.images[p]);
        if (missing.length) add('error', `${slot} › ${name}: missing image${missing.length > 1 ? 's' : ''} ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`, ref);
      }
      if (a.type === 'linkedmesh') {
        const parent = Model.getAttachment(sk, skin.name, a.parentSlot || slot, a.parent);
        if (!parent || parent.type !== 'mesh') add('error', `${slot} › ${name}: linked mesh parent "${a.parent}" not found`, ref);
      }
      if (a.weights) {
        let bad = 0, many = 0;
        a.weights.forEach((vw) => { const s = vw.reduce((x, e) => x + e.w, 0); if (Math.abs(s - 1) > 0.01) bad++; if (vw.length > 4) many++; if (vw.some((e) => !Model.bone(sk, e.b))) bad++; });
        if (bad) add('warn', `${slot} › ${name}: ${bad} vertices have weights that don't sum to 1 or use missing bones`, ref,
          () => { a.weights.forEach((vw, i) => { a.weights[i] = vw.filter((e) => Model.bone(sk, e.b)); MO.normalizeVertex(a.weights[i]); }); }, 'Normalize');
        if (many) add('info', `${slot} › ${name}: ${many} vertices are influenced by more than 4 bones`, ref,
          () => { MO.prune(A.Act.setupPose(), slot, a, 0.0, 4); }, 'Prune to 4');
      }
      if ((a.type === 'bbox' || a.type === 'clip') && MO.vertexCount(a) < 3) add('warn', `${slot} › ${name}: polygon has fewer than 3 vertices`, ref);
      if (a.type === 'clip' && a.end && !Model.slot(sk, a.end)) add('warn', `${slot} › ${name}: clipping end slot "${a.end}" doesn't exist`, ref, () => { a.end = null; }, 'Clip to end');
    }
    // images
    for (const n in pj.images) if (!usedImages.has(n)) add('info', `Image "${n}" is not used by any attachment`, { k: 'image', n }, () => { delete pj.images[n]; ed.syncImages(); }, 'Delete image');
    // slots / bones
    for (const s of sk.slots) if (!Model.slotAttachmentNames(sk, s.name).length) add('info', `Slot "${s.name}" has no attachments`, { k: 'slot', n: s.name }, () => Model.deleteSlot(sk, s.name), 'Delete slot');
    for (const b of sk.bones) {
      if (Math.abs(b.scaleX) < 1e-6 || Math.abs(b.scaleY) < 1e-6) add('warn', `Bone "${b.name}" has zero scale`, { k: 'bone', n: b.name }, () => { if (Math.abs(b.scaleX) < 1e-6) b.scaleX = 1; if (Math.abs(b.scaleY) < 1e-6) b.scaleY = 1; }, 'Set to 1');
    }
    // constraints
    for (const c of sk.constraints) {
      const ref = { k: 'con', n: c.name }, del = () => Model.deleteConstraint(sk, c.name);
      if (c.enabled === false) add('info', `Constraint "${c.name}" is disabled`, ref, () => { c.enabled = true; }, 'Enable');
      if ((c.type === 'ik' || c.type === 'transform') && !Model.bone(sk, c.target)) add('error', `${c.type} "${c.name}": target bone missing`, ref, del, 'Delete');
      if (c.type === 'ik' && c.bones.length === 2 && Model.bone(sk, c.bones[1]) && Model.bone(sk, c.bones[1]).parent !== c.bones[0]) add('error', `IK "${c.name}": the two bones must be parent and child`, ref);
      if (c.type === 'ik' && c.bones.some((n) => Model.isAncestor(sk, n, c.target))) add('error', `IK "${c.name}": target is a child of a constrained bone (feedback loop)`, ref);
      if (c.type === 'path') {
        const hasPath = Model.slotAttachmentNames(sk, c.target || '').some((an) => { const a = Model.getAttachment(sk, ed.skinName, c.target, an); return a && a.type === 'path'; });
        if (!hasPath) add('error', `Path "${c.name}": target slot has no path attachment`, ref);
      }
      if (c.type === 'physics' && Model.bone(sk, c.bone) && (c.rotate || c.scaleX) && !Model.bone(sk, c.bone).length) add('warn', `Physics "${c.name}": bone "${c.bone}" has zero length, rotation/scale physics need a length`, ref);
      if (c.type === 'slider' && !Model.anim(sk, c.animation)) add('warn', `Slider "${c.name}": no animation chosen`, ref);
      if (c.bones && !c.bones.length && c.type !== 'slider') add('error', `${c.type} "${c.name}" has no bones`, ref, del, 'Delete');
    }
    // animations
    const keyed = new Set();
    for (const an of sk.animations) {
      if (!an.timelines.some((t) => t.keys.length)) add('info', `Animation "${an.name}" has no keys`, { k: 'anim', n: an.name });
      for (const tl of an.timelines) {
        if (tl.type === 'event') tl.keys.forEach((k) => keyed.add(k.v.name));
        if (tl.type === 'deform') {
          const a = Model.getAttachment(sk, ed.skinName, tl.target, tl.attachment);
          const len = a ? (a.weights ? a.weights.reduce((x, v) => x + v.length, 0) * 2 : (a.verts || []).length) : -1;
          if (len < 0 || tl.keys.some((k) => k.v.length !== len)) add('warn', `Animation "${an.name}": deform keys for ${tl.target} › ${tl.attachment} don't match the mesh`, { k: 'anim', n: an.name },
            () => { an.timelines = an.timelines.filter((t) => t !== tl); }, 'Delete timeline');
        }
        if (tl.type === 'drawOrder' && tl.keys.some((k) => k.v.some((n) => !Model.slot(sk, n)))) add('warn', `Animation "${an.name}": draw order keys mention deleted slots`, { k: 'anim', n: an.name },
          () => tl.keys.forEach((k) => { k.v = k.v.filter((n) => Model.slot(sk, n)); }), 'Clean up');
        if (tl.type === 'drawFolder') {
          if (!(sk.drawFolders || []).some((f) => f.name === tl.target)) add('warn', `Animation "${an.name}": keys for draw order folder "${tl.target}", which no longer exists`, { k: 'anim', n: an.name },
            () => { an.timelines = an.timelines.filter((t) => t !== tl); }, 'Delete timeline');
          else if (tl.keys.some((k) => k.v.some((n) => { const s2 = Model.slot(sk, n); return !s2 || s2.folder !== tl.target; }))) add('warn', `Animation "${an.name}": folder "${tl.target}" keys mention slots that are not in the folder`, { k: 'anim', n: an.name },
            () => tl.keys.forEach((k) => { k.v = k.v.filter((n) => { const s2 = Model.slot(sk, n); return s2 && s2.folder === tl.target; }); }), 'Clean up');
        }
      }
    }
    for (const f of sk.drawFolders || []) if (!sk.slots.some((x) => x.folder === f.name)) add('info', `Draw order folder "${f.name}" is empty`, { k: 'dfolder', n: f.name }, () => Model.deleteDrawFolder(sk, f.name), 'Delete folder');
    for (const e of sk.events) {
      if (!keyed.has(e.name)) add('info', `Event "${e.name}" is never keyed`, { k: 'event', n: e.name });
      if (e.audio && !(pj.audio || {})[e.audio]) add('warn', `Event "${e.name}": sound "${e.audio}" not imported`, { k: 'event', n: e.name }, () => { e.audio = ''; }, 'Clear');
    }
    return out;
  }

  const Problems = {
    scan,
    async show() {
      const body = h('div.problems');
      const render = () => {
        body.innerHTML = '';
        const list = scan();
        const counts = { error: 0, warn: 0, info: 0 }; list.forEach((p) => counts[p.level]++);
        body.appendChild(h('div.note', null, list.length ? `${counts.error} errors · ${counts.warn} warnings · ${counts.info} notes` : '✓ No problems found.'));
        const order = { error: 0, warn: 1, info: 2 };
        list.sort((a, b) => order[a.level] - order[b.level]).forEach((p) => {
          body.appendChild(h('div.prob.' + p.level, null,
            h('span.prob-ico', null, p.level === 'error' ? '⛔' : p.level === 'warn' ? '⚠' : 'ℹ'),
            h('span.prob-text', null, p.text),
            p.ref ? h('button.btn.small', { onclick: () => { ed.select(p.ref); } }, 'Select') : null,
            p.fix ? h('button.btn.small.primary', { onclick: () => { ed.pushUndo('Fix: ' + p.fixLabel); p.fix(); ed.changed('structure'); render(); } }, p.fixLabel) : null));
        });
        const fixable = list.filter((p) => p.fix && p.level !== 'info');
        if (fixable.length > 1) body.appendChild(UI.row(UI.button(`Fix all ${fixable.length} warnings/errors`, () => { ed.pushUndo('Fix all problems'); fixable.forEach((p) => p.fix()); ed.changed('structure'); render(); }, { primary: true })));
      };
      render();
      await UI.alert('Problems', body);
    },
  };
  A.Problems = Problems;
})(window.A);
