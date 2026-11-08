/* Alike Studio — linked images folder. In the desktop app the project can point at a folder of images on disk:
   every image there is loaded, and when one is saved again (from Photoshop, Krita, …) it updates in Alike at once.
   In a browser, "Reload images from folder" re-imports a chosen folder. */
(function (A) {
  'use strict';
  const ed = A.ed, UI = A.UI, Act = A.Act;
  const N = () => window.alikeNative && window.alikeNative.watchImages ? window.alikeNative : null;
  const size = (data) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = data; });

  const IS = {
    folder() { return ed.project.editor.imagesFolder || null; },
    /* add/replace project images from records [{ name, data }]; returns how many changed */
    async apply(list, quiet) {
      let changed = 0;
      for (const r of list) {
        if (!r.data && r.b64) { // raw bytes from the desktop folder
          const bin = atob(r.b64), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
          try { r.data = await A.Formats.bytesToImageURL(u, r.file); } catch (e) { UI.toast('Skipped ' + r.file + ': ' + e.message); continue; }
        }
        const cur = ed.project.images[r.name]; if (cur && cur.data === r.data) continue;
        const wh = await size(r.data); if (!wh) continue;
        ed.addImage(r.name, r.data, wh[0], wh[1]); changed++;
      }
      if (changed) { ed.dirty = true; ed.changed('structure'); ed.emit('redraw'); if (!quiet) UI.toast(`Updated ${changed} image${changed === 1 ? '' : 's'} from the images folder`); }
      return changed;
    },
    async link() {
      const n = N(); if (!n) return IS.browserReload();
      const f = await n.pickFolder('Images folder for this project'); if (!f) return;
      ed.project.editor.imagesFolder = f; ed.dirty = true;
      await IS.sync(false);
    },
    unlink() { const n = N(); ed.project.editor.imagesFolder = null; ed.dirty = true; if (n) n.watchImages(null); UI.toast('Images folder unlinked (the images stay in the project)'); },
    /* load everything from the linked folder, then keep watching it */
    async sync(quiet = true) {
      const n = N(), f = IS.folder(); if (!n || !f) return;
      const list = await n.readImages(f);
      if (!list) { UI.toast('The images folder ' + f + ' was not found'); return; }
      const c = await IS.apply(list, true);
      await n.watchImages(f);
      if (!quiet || c) UI.toast(`Images folder linked: ${list.length} images${c ? `, ${c} new or changed` : ''}. Edits there show up here automatically.`, 3500);
    },
    async browserReload() {
      const files = await Act.pickFiles('', true, true); if (!files || !files.length) return;
      await Act.importImageFiles(files);
    },
  };
  if (N()) N().onImagesChanged((list) => IS.apply(list));
  ed.on('loaded', () => { if (N() && IS.folder()) IS.sync(true); else if (N()) N().watchImages(null); });
  A.ImageSync = IS;
})(window.A);
