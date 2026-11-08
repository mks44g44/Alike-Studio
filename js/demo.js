/* Alike Studio — built-in demo character "Pip" (all art drawn procedurally) */
(function (A) {
  'use strict';
  const Model = A.Model, MO = A.MeshOps;

  function img(w, hgt, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    const x = c.getContext('2d'); draw(x, w, hgt);
    return { data: c.toDataURL('image/png'), w, h: hgt };
  }
  const OUT = '#1d3b35', LW = 3;
  function capsule(x, w, h, c1, c2) {
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
    const r = (w - LW * 2) / 2;
    x.beginPath(); x.roundRect ? x.roundRect(LW, LW, w - LW * 2, h - LW * 2, r) : x.rect(LW, LW, w - LW * 2, h - LW * 2);
    x.fillStyle = g; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke();
  }
  const TEAL1 = '#6fe0bd', TEAL2 = '#2f9a7c';

  function art() {
    return {
      body: img(132, 162, (x, w, h) => {
        const g = x.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, h * 0.6); g.addColorStop(0, TEAL1); g.addColorStop(1, TEAL2);
        x.beginPath(); x.ellipse(w / 2, h / 2 + 4, w / 2 - LW, h / 2 - LW - 4, 0, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke();
        x.beginPath(); x.ellipse(w / 2, h * 0.62, w * 0.3, h * 0.28, 0, 0, Math.PI * 2); x.fillStyle = '#dcf7ea'; x.fill();
      }),
      head: img(172, 142, (x, w, h) => {
        const g = x.createRadialGradient(w * 0.38, h * 0.3, 8, w / 2, h / 2, w * 0.6); g.addColorStop(0, TEAL1); g.addColorStop(1, TEAL2);
        x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - LW, h / 2 - LW, 0, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke();
        x.fillStyle = 'rgba(255,120,150,0.45)';
        x.beginPath(); x.ellipse(w * 0.2, h * 0.62, 14, 8, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(w * 0.8, h * 0.62, 14, 8, 0, 0, 7); x.fill();
      }),
      eye: img(34, 42, (x, w, h) => {
        x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = OUT; x.stroke();
        x.beginPath(); x.ellipse(w / 2 + 2, h / 2 + 3, 8, 11, 0, 0, 7); x.fillStyle = '#1a1f2b'; x.fill();
        x.beginPath(); x.arc(w / 2 + 5, h / 2 - 2, 3.2, 0, 7); x.fillStyle = '#fff'; x.fill();
      }),
      'eye-closed': img(34, 42, (x, w, h) => { x.beginPath(); x.arc(w / 2, h / 2 - 6, 13, 0.25 * Math.PI, 0.75 * Math.PI); x.lineWidth = 3.5; x.lineCap = 'round'; x.strokeStyle = OUT; x.stroke(); }),
      mouth: img(44, 22, (x, w) => { x.beginPath(); x.arc(w / 2, -4, 18, 0.2 * Math.PI, 0.8 * Math.PI); x.lineWidth = 3.5; x.lineCap = 'round'; x.strokeStyle = OUT; x.stroke(); }),
      'arm-upper': img(26, 62, (x, w, h) => capsule(x, w, h, TEAL1, TEAL2)),
      'arm-lower': img(24, 56, (x, w, h) => capsule(x, w, h, TEAL1, TEAL2)),
      hand: img(32, 32, (x, w) => { x.beginPath(); x.arc(w / 2, w / 2, w / 2 - LW, 0, 7); x.fillStyle = '#dcf7ea'; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke(); }),
      thigh: img(32, 74, (x, w, h) => capsule(x, w, h, TEAL1, TEAL2)),
      shin: img(28, 68, (x, w, h) => capsule(x, w, h, TEAL1, TEAL2)),
      foot: img(56, 28, (x, w, h) => { x.beginPath(); x.roundRect ? x.roundRect(LW, LW, w - LW * 2, h - LW * 2, 11) : x.rect(LW, LW, w - LW * 2, h - LW * 2); x.fillStyle = '#ffb454'; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke(); }),
      antenna: img(12, 34, (x, w, h) => capsule(x, w, h, '#8be8cc', TEAL2)),
      'antenna-tip': img(28, 28, (x, w) => { const g = x.createRadialGradient(w * 0.4, w * 0.4, 2, w / 2, w / 2, w / 2); g.addColorStop(0, '#fff7b0'); g.addColorStop(1, '#ffc23d'); x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 2, 0, 7); x.fillStyle = g; x.fill(); x.lineWidth = 2.5; x.strokeStyle = OUT; x.stroke(); }),
      glow: img(96, 96, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,230,120,0.9)'); g.addColorStop(0.4, 'rgba(255,190,60,0.35)'); g.addColorStop(1, 'rgba(255,170,40,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }),
      tail: img(152, 46, (x, w, h) => {
        const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, TEAL2); g.addColorStop(1, TEAL1);
        x.beginPath(); x.moveTo(4, 6); x.quadraticCurveTo(w * 0.6, 8, w - 14, h / 2 - 6); x.quadraticCurveTo(w - 2, h / 2, w - 14, h / 2 + 6); x.quadraticCurveTo(w * 0.6, h - 8, 4, h - 6); x.closePath();
        x.fillStyle = g; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(30 + i * 28, h / 2, 5 - i, 0, 7); x.fill(); }
      }),
      shadow: img(170, 34, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.scale(1, h / w); x.fillStyle = g; x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, 7); x.fill(); x.restore(); }),
      hat: img(64, 76, (x, w, h) => {
        x.beginPath(); x.moveTo(w / 2, 4); x.lineTo(w - 6, h - 8); x.lineTo(6, h - 8); x.closePath();
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ff6fa8'); g.addColorStop(1, '#a24cff'); x.fillStyle = g; x.fill(); x.lineWidth = LW; x.strokeStyle = OUT; x.stroke();
        x.fillStyle = '#ffe066'; [[w * 0.45, h * 0.4], [w * 0.6, h * 0.62], [w * 0.36, h * 0.72]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill(); });
        x.beginPath(); x.arc(w / 2, 6, 6, 0, 7); x.fillStyle = '#fff'; x.fill();
      }),
    };
  }

  function create() {
    const p = Model.newProject();
    p.name = 'Pip';
    p.images = art();
    const sk = p.skeleton;
    const B = (name, parent, o) => sk.bones.push(Model.newBone(name, parent, o));
    sk.bones[0].color = 'e6e6e6ff';
    B('hip', 'root', { y: 150, color: 'ff8a3dff' });
    B('torso', 'hip', { rotation: 90, length: 100, color: '7ee787ff' });
    B('head', 'torso', { x: 100, length: 90, color: '7ee787ff' });
    B('antenna-1', 'head', { x: 80, y: -25, rotation: -20, length: 28, color: 'f2cc60ff' });
    B('antenna-2', 'antenna-1', { x: 28, length: 28, color: 'f2cc60ff' });
    B('antenna-3', 'antenna-2', { x: 28, length: 24, color: 'f2cc60ff' });
    B('arm-l', 'torso', { x: 85, y: 58, rotation: 165, length: 55, color: '58a6ffff' });
    B('forearm-l', 'arm-l', { x: 55, rotation: 10, length: 50, color: '58a6ffff' });
    B('arm-r', 'torso', { x: 85, y: -58, rotation: -165, length: 55, color: 'ff7b72ff' });
    B('forearm-r', 'arm-r', { x: 55, rotation: -10, length: 50, color: 'ff7b72ff' });
    B('thigh-l', 'hip', { x: -28, y: -5, rotation: -90, length: 68, color: '58a6ffff' });
    B('shin-l', 'thigh-l', { x: 68, length: 62, color: '58a6ffff' });
    B('thigh-r', 'hip', { x: 28, y: -5, rotation: -90, length: 68, color: 'ff7b72ff' });
    B('shin-r', 'thigh-r', { x: 68, length: 62, color: 'ff7b72ff' });
    B('foot-l', 'root', { x: -28, y: 15, color: 'ffc83cff' });
    B('foot-r', 'root', { x: 28, y: 15, color: 'ffc83cff' });
    B('tail-1', 'hip', { x: 50, y: -20, rotation: 10, length: 42, color: 'd2a8ffff' });
    B('tail-2', 'tail-1', { x: 42, length: 42, color: 'd2a8ffff' });
    B('tail-3', 'tail-2', { x: 42, length: 40, color: 'd2a8ffff' });
    B('look-ctrl', 'root', { y: 430, color: 'ff6fa8ff' });

    const R = (name, image, o = {}) => { const im = p.images[image]; return Model.newAttachment('region', name, Object.assign({ path: image, width: im.w, height: im.h }, o)); };
    const S = (name, bone, atts, o = {}) => {
      const s = Model.newSlot(name, bone, o); sk.slots.push(s);
      atts.forEach((a, i) => { Model.putAttachment(sk, 'default', name, a); if (i === 0 && o.attachment === undefined) s.attachment = a.name; });
      return s;
    };
    S('shadow', 'root', [R('shadow', 'shadow', { y: 6 })], { blend: 'multiply' });
    S('tail', 'tail-1', [R('tail', 'tail', { x: 62 })]);
    S('arm-r', 'arm-r', [R('arm-upper', 'arm-upper', { x: 27, rotation: 90 })]);
    S('forearm-r', 'forearm-r', [R('arm-lower', 'arm-lower', { x: 25, rotation: 90 })]);
    S('hand-r', 'forearm-r', [R('hand', 'hand', { x: 52 })]);
    S('thigh-r', 'thigh-r', [R('thigh', 'thigh', { x: 34, rotation: 90 })]);
    S('shin-r', 'shin-r', [R('shin', 'shin', { x: 31, rotation: 90 })]);
    S('foot-r', 'foot-r', [R('foot', 'foot', { x: 8, y: 6 })]);
    S('thigh-l', 'thigh-l', [R('thigh', 'thigh', { x: 34, rotation: 90 })]);
    S('shin-l', 'shin-l', [R('shin', 'shin', { x: 31, rotation: 90 })]);
    S('foot-l', 'foot-l', [R('foot', 'foot', { x: -8, y: 6, scaleX: -1 })]);
    S('body', 'torso', [R('body', 'body', { x: 55, rotation: -90 })]);
    S('head', 'head', [R('head', 'head', { x: 60, rotation: -90 })]);
    S('eye-l', 'head', [R('eye', 'eye', { x: 70, y: 28, rotation: -90 }), R('eye-closed', 'eye-closed', { x: 70, y: 28, rotation: -90 })]);
    S('eye-r', 'head', [R('eye', 'eye', { x: 70, y: -28, rotation: -90 }), R('eye-closed', 'eye-closed', { x: 70, y: -28, rotation: -90 })]);
    S('mouth', 'head', [R('mouth', 'mouth', { x: 36, rotation: -90 })]);
    const hat = Model.newSlot('hat', 'head', { attachment: 'hat' }); sk.slots.push(hat);
    S('arm-l', 'arm-l', [R('arm-upper', 'arm-upper', { x: 27, rotation: 90 })]);
    S('forearm-l', 'forearm-l', [R('arm-lower', 'arm-lower', { x: 25, rotation: 90 })]);
    S('hand-l', 'forearm-l', [R('hand', 'hand', { x: 52 })]);
    S('antenna-1', 'antenna-1', [R('antenna', 'antenna', { x: 14, rotation: 90 })]);
    S('antenna-2', 'antenna-2', [R('antenna', 'antenna', { x: 14, rotation: 90 })]);
    S('antenna-3', 'antenna-3', [R('antenna', 'antenna', { x: 12, rotation: 90 })]);
    S('glow', 'antenna-3', [R('glow', 'glow', { x: 28 })], { blend: 'additive', color: [1, 1, 1, 0.85] });
    S('antenna-tip', 'antenna-3', [R('antenna-tip', 'antenna-tip', { x: 28 })]);
    S('hitbox', 'torso', [Model.newAttachment('bbox', 'hitbox', { verts: [-12, -70, -12, 70, 230, 80, 230, -80] })]);

    // party skin: adds a hat
    sk.skins.push({ name: 'party', attachments: { hat: { hat: R('hat', 'hat', { x: 140, y: 10, rotation: -100 }) } }, bones: [], constraints: [] });

    sk.constraints.push(
      Model.newConstraint('ik', 'leg-l', { bones: ['thigh-l', 'shin-l'], target: 'foot-l', bendPositive: false }),
      Model.newConstraint('ik', 'leg-r', { bones: ['thigh-r', 'shin-r'], target: 'foot-r', bendPositive: true }),
      Model.newConstraint('slider', 'look', { animation: 'look', bone: 'look-ctrl', property: 'x', scale: 0.01, offset: 0.5, additive: true }),
    );
    ['antenna-1', 'antenna-2', 'antenna-3'].forEach((b, i) => sk.constraints.push(Model.newConstraint('physics', b + '-physics', { bone: b, inertia: 0.5, strength: 90 - i * 15, damping: 0.35 })));
    ['tail-1', 'tail-2', 'tail-3'].forEach((b, i) => sk.constraints.push(Model.newConstraint('physics', b + '-physics', { bone: b, inertia: 0.6, strength: 70 - i * 12, damping: 0.35 })));
    sk.events.push(Model.newEvent('footstep'), Object.assign(Model.newEvent('wave'), { string: 'hi!' }), Model.newEvent('land'));

    // tail → weighted mesh
    const pose = new A.Pose(p); pose.update();
    const tailRegion = Model.getAttachment(sk, 'default', 'tail', 'tail');
    const mesh = MO.regionToMesh(tailRegion);
    sk.skins[0].attachments.tail.tail = mesh;
    const pose2 = new A.Pose(p); pose2.update();
    MO.generate(pose2, 'tail', mesh, 22);
    MO.bind(pose2, 'tail', mesh, ['tail-1', 'tail-2', 'tail-3']);

    // ---------- animations ----------
    const E = [0.42, 0, 0.58, 1];
    const anim = (name, dur) => { const a = Model.newAnimation(name); a.duration = dur; sk.animations.push(a); return a; };
    const K = (a, bone, prop, keys, curve = E) => { const tl = Model.ensureTimeline(a, 'bone', bone, prop); keys.forEach(([t, v]) => Model.setKey(tl, t, v, curve)); };
    const ATT = (a, slot, keys) => { const tl = Model.ensureTimeline(a, 'slot', slot, 'attachment'); keys.forEach(([t, v]) => Model.setKey(tl, t, v, 's')); };
    const EV = (a, list) => { const tl = { type: 'event', keys: [] }; list.forEach(([t, n]) => { const e = Model.event(sk, n); tl.keys.push({ t, v: { name: n, int: e.int, float: e.float, string: e.string, volume: 1, balance: 0 }, c: 's' }); }); a.timelines.push(tl); };

    let a = anim('idle', 2);
    K(a, 'torso', 'scaleY', [[0, 1], [1, 1.04], [2, 1]]); K(a, 'torso', 'scaleX', [[0, 1], [1, 0.98], [2, 1]]);
    K(a, 'hip', 'y', [[0, 0], [1, -4], [2, 0]]); K(a, 'head', 'rotate', [[0, 0], [1, 3], [2, 0]]);
    K(a, 'arm-l', 'rotate', [[0, 0], [1, -5], [2, 0]]); K(a, 'arm-r', 'rotate', [[0, 0], [1, 5], [2, 0]]);
    K(a, 'tail-1', 'rotate', [[0, 0], [1, 8], [2, 0]]);
    ['eye-l', 'eye-r'].forEach((s) => ATT(a, s, [[0, 'eye'], [1.3, 'eye-closed'], [1.4, 'eye']]));

    a = anim('walk', 1);
    K(a, 'foot-l', 'x', [[0, 35], [0.5, -35], [0.75, 0], [1, 35]], 'l'); K(a, 'foot-l', 'y', [[0, 0], [0.5, 0], [0.75, 28], [1, 0]]);
    K(a, 'foot-r', 'x', [[0, -35], [0.25, 0], [0.5, 35], [1, -35]], 'l'); K(a, 'foot-r', 'y', [[0, 0], [0.25, 28], [0.5, 0], [1, 0]]);
    K(a, 'hip', 'y', [[0, -8], [0.25, 2], [0.5, -8], [0.75, 2], [1, -8]]);
    K(a, 'torso', 'rotate', [[0, 3], [0.5, -3], [1, 3]]); K(a, 'head', 'rotate', [[0, -2], [0.5, 2], [1, -2]]);
    K(a, 'arm-l', 'rotate', [[0, -22], [0.5, 22], [1, -22]]); K(a, 'arm-r', 'rotate', [[0, 22], [0.5, -22], [1, 22]]);
    K(a, 'forearm-l', 'rotate', [[0, 10], [0.5, -5], [1, 10]]); K(a, 'forearm-r', 'rotate', [[0, -10], [0.5, 5], [1, -10]]);
    EV(a, [[0, 'footstep'], [0.5, 'footstep']]);

    a = anim('wave', 1.5);
    K(a, 'arm-r', 'rotate', [[0, 0], [0.3, 135], [1.2, 135], [1.5, 0]]);
    K(a, 'forearm-r', 'rotate', [[0, 0], [0.3, 20], [0.5, 55], [0.7, 10], [0.9, 55], [1.1, 10], [1.5, 0]]);
    K(a, 'head', 'rotate', [[0, 0], [0.3, -8], [1.2, -8], [1.5, 0]]);
    K(a, 'torso', 'rotate', [[0, 0], [0.3, -4], [1.2, -4], [1.5, 0]]);
    EV(a, [[0.3, 'wave']]);

    a = anim('jump', 1.2);
    K(a, 'hip', 'y', [[0, 0], [0.2, -35], [0.45, 110], [0.65, 105], [0.85, 0], [0.95, -25], [1.2, 0]]);
    ['foot-l', 'foot-r'].forEach((f) => K(a, f, 'y', [[0, 0], [0.25, 0], [0.45, 70], [0.65, 60], [0.85, 0], [1.2, 0]]));
    K(a, 'arm-l', 'rotate', [[0, 0], [0.2, 20], [0.45, -70], [0.85, 0], [1.2, 0]]);
    K(a, 'arm-r', 'rotate', [[0, 0], [0.2, -20], [0.45, 70], [0.85, 0], [1.2, 0]]);
    K(a, 'torso', 'scaleY', [[0, 1], [0.2, 0.88], [0.45, 1.08], [0.85, 1], [0.92, 0.86], [1.2, 1]]);
    K(a, 'torso', 'scaleX', [[0, 1], [0.2, 1.08], [0.45, 0.95], [0.85, 1], [0.92, 1.1], [1.2, 1]]);
    ['eye-l', 'eye-r'].forEach((s) => ATT(a, s, [[0, 'eye'], [0.18, 'eye-closed'], [0.3, 'eye'], [0.9, 'eye-closed'], [1.0, 'eye']]));
    EV(a, [[0.85, 'land']]);

    a = anim('look', 1);
    K(a, 'head', 'rotate', [[0, 12], [1, -12]], 'l'); K(a, 'torso', 'rotate', [[0, 3], [1, -3]], 'l');

    p.editor = { activeSkin: 'default', activeAnim: 'idle' };
    return p;
  }

  A.Demo = { create };
})(window.A);
