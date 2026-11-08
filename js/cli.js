/* Alike Studio — command-line export worker. The desktop app (main.js, "--cli") opens hidden editor windows
   with ?cli=1 and calls A.CLI.run(job) in each one; everything the Export dialog can make is available. */
(function (A) {
  'use strict';
  const ed = A.ed, IO = A.IO, Model = A.Model;

  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const safe = (s) => (s || 'untitled').replace(/[^\w\-. ]+/g, '_');
  const waitImages = () => Promise.all(Object.values(ed.images).map((img) => (img.complete && img.naturalWidth ? null : img.decode().catch(() => null))));

  const CLI = {
    enabled: /[?&]cli=1\b/.test(location.search),
    /* job: { text, file, out(name only, for logs), data: 'json'|'binary'|'both'|'none', pretty, audio, skeleton: 'all'|name,
              atlas: {…overrides}, html: 'player'|'component'|null, media: [{ kind, anim, fps, scale, bg, skin }], info, images } */
    async run(job) {
      const log = [], files = [];
      const add = (name, data) => files.push({ name, data });
      try {
        if (!job.text && job.file) job.text = (await window.alikeNative.read(job.file)).text;
        IO.load(job.text);
        await waitImages();
        const S = A.Skeletons, list = S.list();
        if (job.info) {
          return { log, info: { skeletons: list.map((sk) => ({ name: sk.name, bones: sk.skeleton.bones.length, slots: sk.skeleton.slots.length,
            skins: sk.skeleton.skins.map((s) => s.name), animations: sk.skeleton.animations.map((a) => a.name), events: sk.skeleton.events.map((e) => e.name) })),
            images: Object.keys(ed.project.images).length, sounds: Object.keys(ed.project.audio || {}).length } };
        }
        const pick = job.skeleton && job.skeleton !== 'all' ? list.filter((s) => s.name === job.skeleton) : list;
        if (!pick.length) throw new Error(`No skeleton named "${job.skeleton}" (has: ${list.map((s) => s.name).join(', ')})`);
        const multi = pick.length > 1, prefix = (n) => (multi ? safe(n) + '/' : '');
        const o = Object.assign({}, IO.exportSettings());
        o.atlas = Object.assign({}, o.atlas, job.atlas || {});
        if (job.data) o.data = job.data; if (job.pretty != null) o.pretty = job.pretty; if (job.audio != null) o.audio = job.audio;
        // capture "downloads" made by the media / HTML exporters
        const captured = []; const realDownload = IO.download;
        IO.download = (blob, name) => captured.push({ blob, name });
        const realToast = A.UI.toast; A.UI.toast = (t) => log.push(t);
        try {
          for (const src of pick) {
            const idx = S.entries().findIndex((e) => e.name === src.name);
            S.switchTo(idx); await waitImages();
            if (o.data !== 'none') {
              const r = await IO.buildRuntime(o, src);
              r.files.filter((f) => f.name !== 'README.txt').forEach((f) => add(prefix(src.name) + f.name, f.data));
              const pi = r.packInfo;
              log.push(`${src.name}: ${r.files.filter((f) => /\.(json|alkb)$/.test(f.name)).map((f) => f.name).join(' + ') || 'no data'}` +
                (pi ? `, ${pi.pages.length} atlas page${pi.pages.length === 1 ? '' : 's'} (${pi.packed} images${pi.layoutsTried > 1 ? ', ' + pi.layoutsTried + ' layouts tried' : ''})` : ''));
              if (pi) pi.warnings.forEach((w) => log.push('  warning: ' + w));
            }
            if (job.html) { captured.length = 0; await IO.exportHTML(Object.assign({}, o, { htmlStyle: job.html, anim: job.htmlAnim })); }
            for (const m of job.media || []) {
              const anims = ed.sk.animations.map((a) => a.name);
              const targets = m.anim === 'all' || !m.anim ? anims : [m.anim];
              for (const an of targets) {
                if (!anims.includes(an)) { log.push(`  warning: ${src.name} has no animation "${an}"`); continue; }
                await IO.exportMedia(Object.assign({ fps: ed.fps, scale: 1, bg: '', loop: true, skin: ed.skinName }, m, { anim: an }));
              }
            }
            if (job.images) await IO.exportImages();
            for (const c of captured.splice(0)) add(prefix(src.name) + c.name, new Uint8Array(await c.blob.arrayBuffer()));
          }
        } finally { IO.download = realDownload; A.UI.toast = realToast; }
        return { log, files: files.map((f) => ({ name: f.name, b64: toB64(f.data) })) };
      } catch (e) {
        return { log, error: e.message || String(e) };
      }
    },
  };

  /* --import: files on disk → serialized .alike project */
  CLI.importData = async (paths, scale) => {
    try {
      const files = [];
      for (const p of paths) { const r = await window.alikeNative.readBytes(p); files.push(new File([r.data], r.name)); }
      const res = await A.Importer.read(files, scale || 1);
      const pj = Model.newProject(); pj.name = res.name; pj.skeleton = res.skeleton; pj.images = res.images; pj.audio = res.audio;
      pj.editor.activeAnim = res.skeleton.animations[0] ? res.skeleton.animations[0].name : null;
      const sk = res.skeleton;
      return { name: safe(res.name), text: JSON.stringify(pj), warnings: res.warnings,
        summary: `${res.name}: ${sk.bones.length} bones, ${sk.slots.length} slots, ${sk.skins.length} skins, ${sk.animations.length} animations, ${Object.keys(res.images).length} images` };
    } catch (e) { return { error: e.message || String(e) }; }
  };
  A.CLI = CLI;
})(window.A);
