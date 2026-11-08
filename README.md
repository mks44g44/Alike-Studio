# Alike Studio

**Alike Studio** is a 2D skeletal animation editor written from scratch in plain HTML5, JavaScript and WebGL. It has no dependencies and no build step.

## Run it

- **Desktop app (Windows, Linux, macOS — see below):** run `dist/Alike-Studio-Setup-4.3.0.exe` to install. It adds Start-menu and desktop shortcuts and lets you double-click `.alike` files to open them. You can also run `dist/Alike-Studio-4.3.0-portable.exe` without installing.
- **In a browser:** double-click `index.html`. It opens in Chrome or Edge. Chrome and Edge are recommended because they support **Save** writing straight back to your file.
- **As a desktop app (optional):** install Node.js, then run these in this folder:
  ```
  npm install
  npm start            # opens Alike in its own window
  npm run dist         # builds dist/Alike-Studio-Setup-<version>.exe and a portable .exe
  ```

Alike opens with an empty project. **File → Open example project** loads the sample character **Pip**, which has a weighted tail mesh, IK legs, physics on the antenna and tail, a slider constraint, two skins, events and five animations.

## Features

| Area | What's in Alike |
|---|---|
| Modes | **Setup** (rest pose) and **Animate** (keys), toggled with Tab |
| Bones | Create tool, parenting (re-parenting keeps the world position), length, rotate/translate/scale/shear, inherit rotation/scale/reflection, colors, skin-required |
| Slots | Color, two-color tint ("tint black"), blend modes (normal/additive/multiply/screen), draw order (and draw order keys) |
| Draw order folders | Group slots into folders in the Draw Order list. A folder can be keyed on its own (only its slots move), so folders keyed in different animations play together on different tracks. Each track can turn its draw order off. Duplicate a folder with all its slots, reset it to the setup order, or clear its keys |
| Folders | Animations, skins, events and constraints can be put in folders (drag, or *Move to folder*). The folder is part of the name, e.g. `run/fast`, which is also the name in exported data. Rename, duplicate (with contents) or delete folders |
| Skeletons | Several skeletons in one project (File → New skeleton / Import skeletons from project). They share images and sounds; each has its own undo history. Inactive ones can be shown dimmed in the viewport. Export one or all |
| Attachments | Region, Mesh, Linked mesh, Bounding box, Clipping (stencil), Path (bezier), Point, image sequences |
| Meshes | Convert region → mesh, trace outline from alpha (with a **Uniform** slider that adds even interior vertices so meshes bend smoothly at joints), generate interior grid, add/move/delete vertices (vertices slide over the image; Alt reshapes), Delaunay triangulation |
| Weights | Bind bones, auto weights, paint brush (add/remove), smooth, prune, unbind, heat-map display, **weld** (vertices of different meshes that touch get one position and the same weights, so seams never open). All work on several meshes at once |
| Constraints | **IK** (1–2 bones, bend, softness, stretch, compress, uniform), **Transform** (world/local, relative, mixes, offsets), **Path** (position/spacing/rotate modes), **Physics** (inertia, strength, damping, mass, wind, gravity, x/y/rotate/scaleX/shearX), **Slider** (a bone property drives an animation). Constraints run in list order, and you can reorder them. |
| Animation | Auto key, key buttons on every property, uncommitted (orange) changes, dopesheet (move, box-select, copy/paste, delete), **graph editor with bezier handles**, curve presets, onion skin (frames before/after, step, opacity, tint, wrap-around, selected bones only), loop, speed, layered mix preview, events with int/float/string/audio data |
| Skins | Multiple skins, active skin, skin bones/constraints, merging. **Pin** skins (📌 in the tree) to show their attachments together with the active skin (View menu), and to limit the tree to the active + pinned skins |
| View | Bone icon size and icon shapes for zero-length bones (rotating with the bone), reference image, snapping, compensation, light theme |
| Bounding boxes & clipping | Both can be weighted to bones (bind, auto, paint, smooth, prune), so hitboxes and masks bend with meshes |
| Key tools | Drag the orange bracket above the dopesheet to stretch keys; Keys menu: offset (with wrap for loops), stretch, reverse, snap, insert/remove frames |
| Preview window | Animation → Preview (P): multi-track playback, crossfades with default and per-pair mix durations, queued animations, alpha/additive layers, skin, physics, event log with sound |
| Audio | Import sounds (File → Import audio or drop files), assign them to events; they play during playback and in Preview with each key's volume/balance. **Waveforms** show under event keys in the timeline and in the event and sound properties |
| Photoshop | File → Import Photoshop PSD (or drop a .psd/.psb): layers → images + slots, groups → bones, opacity, visibility, blend modes; tags `[ignore]`, `[bone]`, `[merge]` |
| Files | `.alike` project (images and audio embedded), autosave and recovery, drag-and-drop images, sounds, PSDs or projects |
| Import data | File → Import data: Alike runtime `.json` / `.alkb`, or **Spine 3.8–4.x JSON** / Spine 3.8 `.skel`, with the `.atlas` and pages (or the images folder). Bones, slots, skins, every attachment type (weighted meshes, linked meshes, clipping, paths, points, sequences), IK / transform / path / physics constraints, events and animations (bone, slot color and attachment, deform, draw order, constraint and event keys, bezier curves) come in editable. As a new project or as another skeleton |
| Images folder | Desktop app: link a folder of images to the project; saving an image again in your paint program updates it in Alike immediately |
| Texture Packer | File → Texture Packer: pack any images or folders (no skeleton needed) into pages plus an `.atlas` text file (compact or classic libGDX style, read by many engines) or Alike atlas JSON. **Texture Unpacker** rebuilds the separate images from an atlas |
| Export | Runtime data as JSON and/or **ALKB binary** (about 55% smaller) with a texture atlas: max page size, padding, edge padding, bleed, power-of-two, square, rotation, whitespace stripping, scale, premultiplied alpha, duplicate merging, filtering, **brute-force packing** (tries thousands of layouts for the smallest pages), live preview. Also PNG or JPEG sequence, sprite sheet, **animated GIF**, WebM (keeps transparency) or **MP4** video, images + audio (.zip) — for one animation or all of them. Optional animation **clean up** (drops keys that change nothing) and nonessential-data switch |
| Runtimes | JavaScript (`js/pose.js`, `js/animstate.js`, `js/render.js`, see `runtime/player.html`), **Unity** (`engines/unity`) and **Godot 4** (`engines/godot`). All three produce the same poses and draw order (checked frame by frame) |
| Web components | `runtime/alike-web.js` adds an `<alike-skeleton>` tag — no JavaScript needed (see `runtime/web-components.html`). Many skeletons share one WebGL canvas. *Export HTML page* can use it too |
| Command line | `alike-cli` exports projects or whole folders of projects, in parallel, with every Export option (data, atlas, HTML, PNG, sprite sheet, GIF, WebM). See below |

## Windows, Linux and macOS

| System | Files | Install |
|---|---|---|
| Windows 10/11 (x64) | `Alike-Studio-Setup-4.3.0.exe`, `Alike-Studio-4.3.0-portable.exe` | Run the installer, or the portable exe. SmartScreen: More info → Run anyway |
| Linux (x64 and arm64) | `.AppImage`, `.deb`, `.tar.xz` | `chmod +x *.AppImage` and run it; or `sudo apt install ./alike-studio_4.3.0_amd64.deb`; or unpack the tar.xz. See `README-linux.txt` |
| macOS 11+ (Apple Silicon and Intel) | `Alike-Studio-4.3.0-mac-arm64.zip`, `…-mac-x64.zip` | Unzip, drag to Applications, first launch: Open Anyway in Privacy & Security (the app is ad-hoc signed, not notarized). See `README-mac.txt` |

Build them yourself with `npm run dist:win`, `npm run dist:linux` and `npm run dist:mac` (the macOS build makes an unsigned `.app`; sign it with `codesign` on a Mac, or ad-hoc with `rcodesign sign` on Linux).

Size optimizations in the builds: only English Chromium language files are bundled (about 40 MB less unpacked), maximum compression, and the Unity / Godot plug-ins and web runtime ship as plain folders next to the app (`resources/engines`, `resources/runtime`; Help → Show engine plug-ins) instead of inside the app archive.

## Supported file formats

| | Formats |
|---|---|
| Projects | `.alike` (also `.json` saved by Alike) |
| Images in | PNG, APNG, JPEG (jpg/jpeg/jfif), WebP, GIF, BMP, ICO, AVIF, SVG, **TGA**, **TIFF** (uncompressed, LZW, ZIP, PackBits), **QOI**, PBM/PGM/PPM, Photoshop PSD/PSB. Anything other than PNG/JPEG is converted to PNG |
| Sounds in | MP3, WAV, OGG/OGA (Vorbis, Opus, FLAC), Opus, FLAC, AAC, M4A/MP4, WebM/WebA, **AIFF/AIFC** (converted to WAV) |
| Skeleton data in | Alike `.json` / `.alkb`; Spine 3.8–4.x JSON; Spine 3.8 binary `.skel`; `.atlas` text (both styles) and Alike atlas JSON |
| Out | Alike `.json` / `.alkb` + PNG atlas pages; `.atlas` text or Alike atlas JSON (Texture Packer); PNG / JPEG sequences, sprite sheet, GIF, **APNG**, WebM, MP4, HTML page |

## Help

Help → **Tutorial** (F1) explains every part of the app and every button, in chapters A–N (A1 The window, B1 Importing images, C1 Bones … N3 File formats), with search.

## Command line export

The installed app puts `alike-cli.cmd` next to `Alike.exe` (usually `C:\Users\<you>\AppData\Local\Programs\Alike Studio\`). From a terminal:

```
"%LOCALAPPDATA%\Programs\Alike Studio\alike-cli" -i art -o build --data binary --brute-force --gif idle --threads 4
alike-cli -i hero.alike --info          # list skeletons, skins, animations, events
alike-cli --help                        # every option
```

`-i` takes a project or a folder (searched for `.alike` files). Several projects are exported at the same time (`--threads`). With Node.js you can also run `npm run cli -- -i hero.alike -o out` in this folder. `--import data.json,data.atlas,data.png -o hero.alike` converts exported data (Alike or Spine JSON) into a project. Exit codes: 0 done, 1 a project failed, 2 bad arguments.

## Web components

```html
<script src="alike-web.js"></script>
<alike-skeleton src="hero.json" animation="walk" skin="default,hat" style="width:300px;height:300px"></alike-skeleton>
```

Attributes: `src` (.json or .alkb; atlas pages and `audio/` load from the same folder), `animation`, `loop`, `skin` (comma-separated skins are combined), `speed`, `mix`, `fit` (`contain` or `none`), `scale`, `offset-x`, `offset-y`, `physics`, `paused`, `sound`, `background`, `isolated` (own canvas). From script: `el.ready`, `el.setAnimation()`, `el.addAnimation()`, `el.setSkin()`, `el.state`, `el.bone(name)`; DOM events `alike-ready`, `alike-event`, `alike-error`. Open `runtime/web-components.html` through a local web server to see thirty at once.

## Shortcuts

Press **?** inside the app to see the full list.

| Key | Action |
|---|---|
| Tab | Switch Setup / Animate |
| Q R T S H | Pose, Rotate, Translate, Scale, Shear |
| C | Create bones |
| M | Edit mesh / vertices / path |
| W | Paint weights |
| Space | Play/pause (hold and drag to pan) |
| , . | Previous / next frame |
| K | Key changes |
| G | Onion skin |
| F | Frame all |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Save |
| Ctrl+E | Export |
| P | Preview window |

## Source layout

```
index.html         layout
css/alike.css      theme (dark + light)
js/math.js         affine math, bezier easing, triangulation, hulls
js/model.js        data model, rename/delete with reference updates, timelines
js/pose.js         world transforms, IK/transform/path/physics/slider, animation sampling (runtime)
js/render.js       WebGL renderer: two-color tint, blend modes, stencil clipping
js/editor.js       editor state, selection, undo/redo, keying
js/meshops.js      mesh building and weight tools
js/viewport.js     camera, gizmos, tools, hit testing
js/tree.js         hierarchy panel
js/props.js        properties panel
js/timeline.js     dopesheet + graph editor
js/io.js           save/open, export, atlas packer, zip writer, autosave
js/demo.js         procedural demo character
js/app.js          menus, shortcuts, main loop
js/folders.js      draw order folders and tree folders
js/skeletons.js    several skeletons per project
js/cli.js          command-line export worker (main.js runs it in hidden windows)
js/importer.js     Import data (Alike runtime data, Spine 3.8–4.x JSON)
js/texpack.js      Texture Packer / Unpacker
js/imagesync.js    linked images folder with live reload (desktop)
runtime/alike-element.js  <alike-skeleton> web component (bundled into runtime/alike-web.js)
runtime/player.html  example runtime player
```

## Engine plug-ins

- **Unity** (2021.3+, Built-in pipeline or URP): add `engines/unity` with Package Manager → *Add package from disk*. Drop the exported `.alkb`, atlas `.png` and `audio/` into Assets, then GameObject → Alike → Skeleton Animation. See `engines/unity/README.md`.
- **Godot 4** (4.2+): copy `engines/godot/addons/alike` to `res://addons/alike` and enable the plug-in. The `.alkb` imports as AlikeSkeletonData; add an AlikeSkeleton2D node. See `engines/godot/README.md`.

## File formats

- `.alike`: the editor project (JSON with embedded images and sounds).
- `.json`: runtime data (`format: "alike-runtime"`, version 2).
- `.alkb`: the same data as compact binary. The layout is documented at the top of `js/binary.js`: a string table, then tagged values with float32 arrays.
- Atlas regions: `x, y, w, h` (the packed rectangle), `ox, oy` (whitespace stripped from the top-left), `ow, oh` (original size), and `rot` (stored rotated 90° clockwise).

## Feature checklist against Spine Pro 4.3

This list compares Alike with the [Spine 4.3 release notes](https://en.esotericsoftware.com/blog/Spine-4.3-released). Alike is its own implementation with its own file formats.

**Done:**
- Slider constraints, including bone-driven ones and an enable toggle.
- Transform constraint property mapping (any property drives any other) with clamping and source space.
- Volume-preserving scale for IK and physics.
- Inverse clipping.
- Skeleton-wide wind and gravity.
- Linked meshes whose parent is in another slot.
- Multi-mesh weight painting, plus bulk bind, auto-weight, smooth, prune and trace.
- Keying values after constraints (Shift+K) and baking constrained or physics motion into keys.
- Dopesheet-to-graph sync.
- An option for new keys to use the last chosen curve.
- Eased crossfades.
- A Problems view with one-click fixes.
- Math in numeric fields: `+=`, `-=`, `*=`, `/=`, `v`, `boneLength`, `random()`, `clamp()` and more.
- Skin merging.
- An atlas per skin.
- Package Project.
- HTML export with skin combining.
- Breadcrumbs.
- Reset buttons for paths, bounding boxes and clipping.
- PSD import with tags.
- Locking items, snapping, compensating children and images, rotating and scaling vertices, and a reference image.

- Draw order folders with their own keys, layered across tracks, plus per-track draw order, folder duplication and reset.
- Mesh welding, and bulk bind/weld/smooth/auto-weight/prune on several meshes.
- The "uniform" trace slider.
- Tree folders for animations, skins, events and constraints.
- A command-line exporter with parallel export.
- Web components (`<alike-skeleton>`), and HTML export that uses them.
- Several skeletons in one project.
- Audio waveforms in the timeline.
- Pinned skins, bone icon size and rotation, and brute-force packing.

**Not done yet (smaller gaps):**
- Export inside the editor runs on one thread (the command line runs several projects at once).
- Tree annotations, and folders for bones and slots.
- Spine `.skel` binaries newer than 3.8 (export JSON instead), Spine slider constraints and physics reset keys, and Spine `.spine` project files (a closed format).
- A waveform-based audio editor (trimming, fades).

## Branding

The name **Alike Studio**, the icon (`assets/icon.svg`, `.png`, `.ico`) and the About text (`js/app.js → about()`) are placeholders. To rebrand, replace those files, then rebuild with `npm run dist`.

## Still to come


- Spine-style mesh tools (bone-guided mesh generation) and weighted path attachments
- A binary *project* format for very large projects (the `.alike` file is JSON)
- More engine runtimes, such as Defold, MonoGame or Cocos (the C# core in `engines/unity/Runtime` already works outside Unity)
