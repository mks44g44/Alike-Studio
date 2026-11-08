// Alike Studio — desktop app (Electron main process).
// Run `npm install` then `npm start`; `npm run dist` builds the Windows installer + portable .exe.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// command-line workers may run on build machines without a GPU: allow the software WebGL fallback there
if (process.argv.includes('--cli')) app.commandLine.appendSwitch('enable-unsafe-swiftshader');

const ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
let win = null;
let pendingOpen = null;

function fileArg(argv) {
  return argv.slice(1).find((a) => /\.(alike|json|alkb)$/i.test(a) && fs.existsSync(a)) || null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1000, minHeight: 640,
    title: 'Alike Studio', icon: ICON, backgroundColor: '#16181d', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // the editor draws its own menu bar; macOS still gets the standard app / edit / window menus (Cmd+Q, copy & paste, …)
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // ALIKE_SELFTEST=1: load, check the editor and the native bridge, save a project through IPC, then quit (used for QA)
  if (process.env.ALIKE_SELFTEST) {
    win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) console.log('[page error]', msg); });
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(`(async () => {
          A.IO.load(A.Demo.create()); await new Promise((r) => setTimeout(r, 300));
          const ok = !!(window.A && A.ed && A.ed.pose && A.ed.pose.boneMap.head);
          const p = await window.alikeNative.save('x.alike', A.IO.serialize(), ${JSON.stringify(path.join(app.getPath('temp'), 'alike-selftest.alike'))});
          const back = await window.alikeNative.read(p);
          return JSON.stringify({ editor: ok, desktop: !!window.alikeNative, savedBytes: back.text.length, version: await window.alikeNative.version(), title: document.title });
        })()`);
        console.log('SELFTEST', r);
        const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(app.getPath('temp'), 'alike-selftest.png'), img.toPNG());
      } catch (e) { console.log('SELFTEST FAILED', e.message); }
      app.exit(0);
    }, 2500));
  }
  // links open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // ask before closing with unsaved changes (the page sets the flag)
  let closing = false;
  win.on('close', (e) => {
    if (closing) return;
    e.preventDefault();
    win.webContents.executeJavaScript('window.A && A.ed && A.ed.dirty').then((dirty) => {
      if (dirty) {
        const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Close without saving', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Alike Studio', message: 'You have unsaved changes. Close anyway?' });
        if (r !== 0) return;
      }
      closing = true; win.close();
    }).catch(() => { closing = true; win.close(); });
  });
}

/* ---------- native file access for the editor (see preload.js) ---------- */
ipcMain.handle('alike:save', async (_e, { suggestedName, data, path: knownPath, filters }) => {
  let target = knownPath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters: filters || [{ name: 'Alike project', extensions: ['alike'] }] });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await fs.promises.writeFile(target, typeof data === 'string' ? data : Buffer.from(data));
  return target;
});
ipcMain.handle('alike:open', async (_e, { filters } = {}) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [{ name: 'Alike project', extensions: ['alike', 'json'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  return { path: r.filePaths[0], text: await fs.promises.readFile(r.filePaths[0], 'utf8') };
});
ipcMain.handle('alike:read', async (_e, p) => ({ path: p, text: await fs.promises.readFile(p, 'utf8') }));
/* ---------- linked images folder: read every image, then watch for edits (like re-saving from Photoshop) ---------- */
const IMG_RE = /\.(png|apng|jpe?g|jfif|webp|gif|bmp|dib|ico|avif|svg|tga|tiff?|qoi|pbm|pgm|ppm|pnm)$/i;
function walkImages(root, dir = root, out = []) {
  for (const n of fs.readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const f = path.join(dir, n), st = fs.statSync(f);
    if (st.isDirectory()) walkImages(root, f, out); else if (IMG_RE.test(n)) out.push(f);
  }
  return out;
}
const imageRecord = (root, f) => {
  // raw bytes + file name: the editor converts formats it can't use directly (TGA, TIFF, …) to PNG
  return { name: path.relative(root, f).split(path.sep).join('/').replace(/\.[^.]+$/, ''), file: path.basename(f), b64: fs.readFileSync(f).toString('base64'), mtime: fs.statSync(f).mtimeMs };
};
let watcher = null;
ipcMain.handle('alike:pickFolder', async (_e, title) => { const r = await dialog.showOpenDialog(win, { title: title || 'Choose folder', properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('alike:readImages', async (_e, root) => { if (!root || !fs.existsSync(root)) return null; return walkImages(root).map((f) => imageRecord(root, f)); });
ipcMain.handle('alike:watchImages', async (_e, root) => {
  if (watcher) { watcher.close(); watcher = null; }
  if (!root || !fs.existsSync(root)) return false;
  const pending = new Map(); let timer = null;
  try {
    watcher = fs.watch(root, { recursive: true }, (_ev, rel) => {
      if (!rel || !IMG_RE.test(rel)) return;
      pending.set(rel, true); clearTimeout(timer);
      timer = setTimeout(() => { // wait until the image editor has finished writing
        const list = [];
        for (const r of pending.keys()) { const f = path.join(root, r); try { if (fs.existsSync(f) && fs.statSync(f).size > 0) list.push(imageRecord(root, f)); } catch (e) { /* half-written */ } }
        pending.clear(); if (list.length && win) win.webContents.send('alike:imagesChanged', list);
      }, 350);
    });
  } catch (e) { return false; }
  return true;
});
ipcMain.handle('alike:pendingOpen', () => { const p = pendingOpen; pendingOpen = null; return p; });
ipcMain.handle('alike:version', () => app.getVersion());
// engine plug-ins and web runtime ship as plain folders next to the app (resources/engines, resources/runtime)
ipcMain.handle('alike:openResource', (_e, name) => {
  if (!['engines', 'runtime'].includes(name)) return false;
  const p = app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, name);
  return shell.openPath(p).then((err) => !err);
});
ipcMain.on('alike:title', (_e, t) => { if (win) win.setTitle(t); });

/* ---------- command line export: Alike.exe --cli -i project.alike -o out [options] (see CLI_HELP) ---------- */
const CLI_HELP = `Alike Studio command line export

Usage:  alike-cli -i <project.alike | folder> [-i …] [-o <folder>] [options]
        (or: Alike.exe --cli …)

Input / output
  -i, --input <path>      an .alike project, or a folder searched for .alike files (repeatable)
  -o, --output <folder>   where files go (default: "<project>-export" next to each project).
                          With several projects each gets its own subfolder.
  --skeleton <name|all>   which skeletons to export (default: all; several → one subfolder each)
  --threads <n>           projects exported in parallel (default: CPU cores, max 8)
  --info                  list skeletons, skins, animations and events, then quit
  --log <file>            also write this output to a file

Data and atlas
  --data <json|binary|both|none>   runtime data (default: both)
  --pretty                pretty-print JSON          --no-audio     leave out event sounds
  --max-size <px>         atlas page size limit      --scale <n>     atlas scale
  --padding <px>  --edge <px>  --bleed <px>          --pot / --no-pot  --square  --rotate
  --no-trim  --pma  --per-skin  --brute-force  --all-images  --filter <linear|nearest>

Import (data → editable project)
  --import <files>        skeleton data to convert into an .alike project: a .json / .alkb (Alike) or
                          Spine 3.8–4.x .json or 3.8 .skel, plus its .atlas and page images (comma-separated, or
                          repeat the option). Written to -o (a folder, or a path ending in .alike).
  --import-scale <n>      scale the imported skeleton

Pages, images and video (anim = an animation name or "all"; repeatable)
  --html [player|component]   self-contained HTML page (default: player)
  --png <anim>  --jpg <anim>  --sheet <anim>  --gif <anim>  --apng <anim>  --webm <anim>  --mp4 <anim>
  --fps <n>  --media-scale <n>  --background <css color>  --skin <name>
  --images                project images (.zip)

Exit code: 0 = done, 1 = a project failed, 2 = bad arguments.
Example:  alike-cli -i art -o build --data binary --brute-force --gif idle --threads 4`;

function parseCli(argv) {
  const o = { inputs: [], media: [], atlas: {}, threads: 0 };
  const num = (v, name) => { const n = Number(v); if (!isFinite(n)) throw new Error(name + ' needs a number'); return n; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); return argv[++i]; };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '-i': case '--input': o.inputs.push(next()); break;
      case '-o': case '--output': o.output = next(); break;
      case '--skeleton': o.skeleton = next(); break;
      case '--threads': o.threads = Math.max(1, Math.round(num(next(), a))); break;
      case '--info': o.info = true; break;
      case '--log': o.log = next(); break;
      case '--data': o.data = next(); if (!['json', 'binary', 'both', 'none'].includes(o.data)) throw new Error('--data must be json, binary, both or none'); break;
      case '--pretty': o.pretty = true; break;
      case '--no-audio': o.audio = false; break;
      case '--max-size': o.atlas.maxSize = num(next(), a); break;
      case '--scale': o.atlas.scale = num(next(), a); break;
      case '--padding': o.atlas.padding = num(next(), a); break;
      case '--edge': o.atlas.edge = num(next(), a); break;
      case '--bleed': o.atlas.extrude = num(next(), a); break;
      case '--pot': o.atlas.pot = true; break;
      case '--no-pot': o.atlas.pot = false; break;
      case '--square': o.atlas.square = true; break;
      case '--rotate': o.atlas.rotate = true; break;
      case '--no-trim': o.atlas.trim = false; break;
      case '--pma': o.atlas.pma = true; break;
      case '--per-skin': o.atlas.perSkin = true; break;
      case '--brute-force': o.atlas.bruteForce = true; break;
      case '--all-images': o.atlas.usedOnly = false; break;
      case '--filter': o.atlas.filter = next(); break;
      case '--html': o.html = argv[i + 1] === 'component' || argv[i + 1] === 'player' ? argv[++i] : 'player'; break;
      case '--png': case '--jpg': case '--sheet': case '--gif': case '--apng': case '--webm': case '--mp4': o.media.push({ kind: a.slice(2), anim: next() }); break;
      case '--fps': o.fps = num(next(), a); break;
      case '--media-scale': o.mediaScale = num(next(), a); break;
      case '--background': o.background = next(); break;
      case '--skin': o.skin = next(); break;
      case '--images': o.images = true; break;
      case '--import': o.importFiles = (o.importFiles || []).concat(next().split(',')); break;
      case '--import-scale': o.importScale = num(next(), a); break;
      default:
        if (!a.startsWith('-') && a.toLowerCase().endsWith('.alike')) o.inputs.push(a); // bare project path
        else if (!a.startsWith('--') || !/^--(no-sandbox|disable-gpu|enable-logging|inspect)/.test(a)) throw new Error('Unknown option ' + a);
    }
  }
  return o;
}
function findProjects(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const n of fs.readdirSync(p).sort()) { if (n.startsWith('.') || n === 'node_modules') continue; const f = path.join(p, n); const s2 = fs.statSync(f); if (s2.isDirectory()) findProjects(f, out); else if (/\.alike$/i.test(n)) out.push(f); } }
  else out.push(p);
  return out;
}
async function runCli(argv) {
  let logFile = null;
  const say = (line) => { if (!process.env.ALIKE_CLI_QUIET) try { process.stdout.write(line + '\n'); } catch (e) { /* no console */ } if (logFile) try { fs.appendFileSync(logFile, line + '\n'); } catch (e) { /* ignore */ } };
  const li = argv.indexOf('--log'); // set up the log first so even argument errors reach it
  if (li >= 0 && argv[li + 1]) { logFile = path.resolve(argv[li + 1]); try { fs.writeFileSync(logFile, ''); } catch (e) { logFile = null; } }
  let o;
  try { o = parseCli(argv); } catch (e) { say('alike-cli: ' + e.message + '\nRun with --help for usage.'); return 2; }
  if (o.importFiles) return runImport(o, say);
  if (o.help || !o.inputs.length) { say(CLI_HELP); return o.help ? 0 : 2; }
  let projects = [];
  for (const inp of o.inputs) {
    if (!fs.existsSync(inp)) { say('alike-cli: not found: ' + inp); return 2; }
    projects = projects.concat(findProjects(path.resolve(inp)));
  }
  projects = [...new Set(projects)];
  if (!projects.length) { say('alike-cli: no .alike projects found'); return 2; }
  const threads = Math.min(projects.length, o.threads || Math.min(8, require('os').cpus().length || 2));
  say(`Alike Studio ${app.getVersion()} — ${projects.length} project${projects.length === 1 ? '' : 's'}, ${threads} worker${threads === 1 ? '' : 's'}`);
  const media = o.media.map((m) => Object.assign(m, o.fps ? { fps: o.fps } : {}, o.mediaScale ? { scale: o.mediaScale } : {}, o.background ? { bg: o.background } : {}, o.skin ? { skin: o.skin } : {}));
  const job = { info: o.info, data: o.data, pretty: o.pretty, audio: o.audio, skeleton: o.skeleton, atlas: o.atlas, html: o.html, media, images: o.images };
  const makeWorker = () => new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    w.webContents.on('console-message', (_e, level, msg) => { if (level >= 3 && process.env.ALIKE_CLI_DEBUG) say('  [page] ' + msg); });
    w.loadFile(path.join(__dirname, 'index.html'), { query: { cli: '1' } }).then(async () => {
      for (let k = 0; k < 200; k++) { if (await w.webContents.executeJavaScript('!!(window.A && A.CLI && window.__alikeReady)')) return resolve(w); await new Promise((r) => setTimeout(r, 50)); }
      reject(new Error('editor did not start'));
    }, reject);
  });
  let failed = 0, next = 0;
  const t0 = Date.now();
  const work = async () => {
    const w = await makeWorker();
    while (next < projects.length) {
      const file = projects[next++], name = path.basename(file).replace(/\.alike$/i, '');
      const outDir = o.output ? (projects.length > 1 ? path.join(path.resolve(o.output), name) : path.resolve(o.output)) : path.join(path.dirname(file), name + '-export');
      const t1 = Date.now();
      try {
        const r = await w.webContents.executeJavaScript(`A.CLI.run(${JSON.stringify(Object.assign({ file }, job))})`);
        if (r.error) throw new Error(r.error);
        if (r.info) { say(`\n${file}`); for (const s of r.info.skeletons) say(`  skeleton ${s.name}: ${s.bones} bones, ${s.slots} slots\n    skins: ${s.skins.join(', ')}\n    animations: ${s.animations.join(', ') || '—'}\n    events: ${s.events.join(', ') || '—'}`); say(`  ${r.info.images} images, ${r.info.sounds} sounds`); continue; }
        let bytes = 0;
        for (const f of r.files) {
          const target = path.resolve(outDir, f.name);
          if (!target.startsWith(path.resolve(outDir) + path.sep)) throw new Error('refusing to write outside the output folder: ' + f.name);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const buf = Buffer.from(f.b64, 'base64'); fs.writeFileSync(target, buf); bytes += buf.length;
        }
        say(`✓ ${name} → ${outDir} (${r.files.length} files, ${Math.round(bytes / 1024)} KB, ${((Date.now() - t1) / 1000).toFixed(1)}s)`);
        r.log.filter((l) => !/^Exported|^Rendering|^Editing skeleton|^Export finished/.test(l)).forEach((l) => say('  ' + l));
      } catch (e) { failed++; say(`✗ ${name}: ${e.message}`); }
    }
    w.destroy();
  };
  try { await Promise.all(Array.from({ length: threads }, work)); } catch (e) { say('alike-cli: ' + e.message); return 1; }
  if (!o.info) say(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s${failed ? ` — ${failed} failed` : ''}.`);
  return failed ? 1 : 0;
}

/* --import: data files → .alike project, done in one hidden editor window */
async function runImport(o, say) {
  const files = o.importFiles.map((f) => path.resolve(f));
  for (const f of files) if (!fs.existsSync(f)) { say('alike-cli: not found: ' + f); return 2; }
  const w = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await w.loadFile(path.join(__dirname, 'index.html'), { query: { cli: '1' } });
  for (let k = 0; k < 200 && !(await w.webContents.executeJavaScript('!!(window.A && A.CLI && window.__alikeReady)')); k++) await new Promise((r) => setTimeout(r, 50));
  const r = await w.webContents.executeJavaScript(`A.CLI.importData(${JSON.stringify(files)}, ${JSON.stringify(o.importScale || 1)})`);
  w.destroy();
  if (r.error) { say('✗ import: ' + r.error); return 1; }
  let target = o.output ? path.resolve(o.output) : path.join(path.dirname(files[0]), r.name + '.alike');
  if (!/\.alike$/i.test(target)) target = path.join(target, r.name + '.alike');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, r.text);
  say(`✓ ${r.summary} → ${target}`);
  r.warnings.forEach((x) => say('  note: ' + x));
  return 0;
}
ipcMain.handle('alike:readBytes', async (_e, p) => ({ name: path.basename(p), data: await fs.promises.readFile(p) }));

// macOS: double-clicked / dropped .alike files arrive as "open-file" events, not command-line arguments
app.on('open-file', (e, p) => { e.preventDefault(); if (win && !win.isDestroyed()) win.webContents.send('alike:openFile', p); else pendingOpen = p; });

const cliAt = process.argv.indexOf('--cli');
if (cliAt >= 0) {
  app.whenReady().then(() => runCli(process.argv.slice(cliAt + 1))).then((code) => app.exit(code), (e) => { console.error(e); app.exit(1); });
  app.on('window-all-closed', () => { /* stay alive until the export finishes */ });
} else
// single instance: double-clicking another .alike file opens it in the running window
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArg(argv);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (f) win.webContents.send('alike:openFile', f); }
  });
  app.whenReady().then(() => { pendingOpen = pendingOpen || fileArg(process.argv); createWindow(); });
}
app.on('window-all-closed', () => { if (cliAt < 0 && process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
