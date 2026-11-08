/* Alike Studio — Help → Tutorial: every part of the app, chapter by chapter (A1, A2, B1 …).
   Body items: 'text' = paragraph · '## text' = sub-heading · ['Button / field', 'what it does'] = one row of a list · '> text' = tip. */
(function (A) {
  'use strict';
  const UI = A.UI, h = UI.h;

  const CH = {
    A: 'Getting started', B: 'Importing', C: 'Rigging', D: 'Transform tools', E: 'Meshes & weights', F: 'Constraints', G: 'Coloring & blending',
    H: 'Animation', I: 'Preview & mixing', J: 'Exporting', K: 'Using your exports', L: 'View & settings', M: 'Organizing big projects', N: 'Checking & reference',
  };

  const T = [
    /* ---------------- A ---------------- */
    { id: 'A1', title: 'The window at a glance', body: [
      'Alike is a 2D skeletal animation editor: you cut a character into images, attach them to bones, then animate the bones. Everything happens in one window.',
      '## Parts of the window',
      ['Top bar', 'Menus (File, Edit, View, Animation, Help) and the Setup / Animate switch.'],
      ['Tool rail (left)', 'The tools: Pose (Q), Rotate (R), Translate (T), Scale (S), Shear (H), Create bones (C), Edit mesh (M), Weights (W), then Frame all, Undo and Redo.'],
      ['Viewport (center)', 'Shows the skeleton. Drag to pose, scroll to zoom, middle- or right-drag (or Space + drag) to pan.'],
      ['Viewport buttons (top of viewport)', 'The mode badge, then on/off switches for Bones, Images, Mesh, Boxes, Paths, Names, Physics, Snap, Keep children, Keep images, and the Skin menu.'],
      ['Timeline (bottom)', 'Animation controls, keys (Dopesheet) and curves (Graph). Drag the bar above it to resize.'],
      ['Hierarchy (right, top)', 'The tree of everything in the skeleton: bones, slots, attachments, draw order, constraints, skins, events, animations, images and sounds.'],
      ['Properties (right, bottom)', 'Settings of whatever is selected.'],
      ['Status bar (bottom)', 'Mode, cursor position, zoom, the selection path (breadcrumbs) and a hint for the current tool.'],
      '> Press ? at any time for the list of keyboard shortcuts.',
    ] },
    { id: 'A2', title: 'Projects: new, open, save', body: [
      'A project is one .alike file. It contains the skeletons, their animations, and all images and sounds, so it is easy to move or share.',
      ['File → New project (Ctrl+N)', 'Starts an empty project.'],
      ['File → Open… (Ctrl+O)', 'Opens an .alike project (or a project saved as .json).'],
      ['File → Open example project (Pip)', 'Loads the sample character, useful for learning.'],
      ['File → Save (Ctrl+S)', 'Saves to the current file; the first time it asks where.'],
      ['File → Save as… (Ctrl+Shift+S)', 'Saves to a new file.'],
      ['File → Package project (.zip)', 'One zip with the .alike file plus every image and sound as separate files.'],
      ['Autosave', 'Every 20 seconds unsaved work is kept in the background. If the app closes unexpectedly, the next start offers to Restore it.'],
      '> Double-clicking an .alike file in Windows opens it in Alike (installed version). Dropping an .alike file onto the window opens it too.',
    ] },
    { id: 'A3', title: 'Setup mode and Animate mode', body: [
      'Alike has two modes. Switch with the Setup / Animate buttons at the top, or with Tab.',
      ['Setup', 'Builds the skeleton and its rest pose (the "setup pose"): bones, slots, attachments, meshes, weights, constraints and skins. Changes here are not animation.'],
      ['Animate', 'Records changes as keys in the active animation. The viewport badge turns orange. Changes that are not keyed yet are shown in orange too.'],
      '> If an animation looks wrong, check you are in the right mode: moving a bone in Setup changes the character in every animation.',
    ] },
    { id: 'A4', title: 'Selecting and moving around', body: [
      ['Click', 'Selects a bone, image or other item in the viewport or the tree.'],
      ['Shift / Ctrl + click', 'Adds to or removes from the selection.'],
      ['Alt + click an image', 'Selects the image (attachment) instead of its bone.'],
      ['Esc', 'Clears the selection.'],
      ['Ctrl+A', 'Selects all bones.'],
      ['Mouse wheel', 'Zooms the viewport around the cursor.'],
      ['Middle / right drag, or Space + drag', 'Pans the viewport.'],
      ['F (or the Frame all tool button)', 'Fits the whole skeleton in view.'],
      ['1', 'Zoom 100%.'],
      ['Breadcrumbs (status bar)', 'Show the parent chain of the selection, e.g. root › hip › torso.'],
    ] },
    { id: 'A5', title: 'Undo, rename, duplicate, delete', body: [
      ['Edit → Undo (Ctrl+Z) / Redo (Ctrl+Y)', 'Steps back and forward. The Edit menu shows what will be undone. Each skeleton has its own history.'],
      ['Edit → Rename (F2) or double-click in the tree', 'Renames the selection. References (keys, constraints, weights) follow the new name.'],
      ['Edit → Duplicate (Ctrl+D)', 'Copies bones (with children, slots and attachments), attachments, animations, skins, constraints, folders.'],
      ['Edit → Delete (Del)', 'Removes the selection and everything that used it. With keys selected in the timeline, Del deletes the keys; in the mesh tool it deletes vertices.'],
    ] },

    /* ---------------- B ---------------- */
    { id: 'B1', title: 'Importing images', body: [
      'Images are stored inside the project. Alike reads PNG, JPEG, WebP, GIF, BMP, ICO, AVIF, SVG, TGA, TIFF, QOI and PBM/PGM/PPM. Formats other than PNG and JPEG are converted to PNG.',
      ['File → Import images…', 'Adds images to the project (they appear under Images in the tree).'],
      ['File → Import image folder…', 'Adds every image in a folder; subfolders become part of the name, e.g. arms/left.'],
      ['File → Import images as slots…', 'Adds images and creates a slot with a region attachment for each, on the selected bone.'],
      ['Drag and drop', 'Drop image files on the window. Dropped on the viewport, they become slots on the selected bone.'],
      ['Images in the tree', 'Select one to see a preview, how many attachments use it, Add to selected bone, Replace… and Delete.'],
      '> Name your images the way you want the attachments named — the image name is used for the slot and attachment.',
    ] },
    { id: 'B2', title: 'Photoshop (PSD / PSB)', body: [
      'File → Import Photoshop PSD… (or drop a .psd / .psb) turns layers into images and slots, placed exactly where they are in the document.',
      ['Layers', 'Each visible layer becomes an image + slot. Opacity and blend mode (normal, multiply, screen, additive) carry over.'],
      ['Groups', 'Become bones, so a group "arm" gives an arm bone with its layers on it.'],
      ['Tag [ignore]', 'Put it in a layer or group name to skip it.'],
      ['Tag [bone]', 'Makes a layer a bone instead of an image.'],
      ['Tag [merge]', 'Merges a group into one image.'],
    ] },
    { id: 'B3', title: 'Importing sounds', body: [
      'Sounds are played by events during animations. Alike reads MP3, WAV, OGG (Vorbis, Opus, FLAC), Opus, FLAC, AAC, M4A/MP4, WebM and AIFF (converted to WAV).',
      ['File → Import audio…', 'Adds sounds to the project (Audio in the tree), or drop sound files on the window.'],
      ['Sound properties', 'Waveform, size, which events use it, ▶ Play, Delete and Assign to event.'],
      '> See H9 for putting sounds on the timeline.',
    ] },
    { id: 'B4', title: 'Import data (exported skeletons)', body: [
      'File → Import data brings exported skeleton data back as an editable skeleton. Choose the data file together with its atlas and page images (or the folder of images it uses).',
      ['Alike runtime data', '.json or .alkb from Alike\'s Export, with its atlas page images.'],
      ['Spine JSON', 'Versions 3.8 to 4.x, with the .atlas file and its pages (or loose images).'],
      ['Spine binary (.skel)', 'Version 3.8. For other versions export JSON from the editor that made them.'],
      ['Choose files… / Add a folder…', 'Pick the files; you can add more than once.'],
      ['Scale', 'Resizes the skeleton while importing.'],
      ['Import into', 'A new project, or this project as another skeleton.'],
      'Bones, slots, skins, every attachment type, IK / transform / path / physics constraints, events and animations (with bezier curves, deform and draw order keys) come in. A list of anything that could not be brought over is shown afterwards.',
      '> Dropping a .json, .skel or .alkb with its atlas and images onto the window imports it directly.',
    ] },
    { id: 'B5', title: 'Import skeletons from another project', body: [
      'File → Import skeletons from project… adds every skeleton of another .alike file to this project as extra skeletons, with the images and sounds they need. Images with a name that already exists keep the current version.',
    ] },
    { id: 'B6', title: 'Linked images folder (live updates)', body: [
      'Desktop app: File → Link images folder (live updates)… points the project at a folder on disk. Every image there is loaded, and whenever you save an image again in your paint program, it updates in Alike within a second.',
      ['Images folder: … (change…)', 'Picks a different folder.'],
      ['Unlink images folder', 'Stops watching (the images stay in the project).'],
      ['Reload images now', 'Reads the folder again.'],
      'In a browser, File → Reload images from folder… re-imports a folder; images with the same names are replaced.',
    ] },

    /* ---------------- C ---------------- */
    { id: 'C1', title: 'Bones', body: [
      'Bones are the skeleton. Every bone has a parent (except root); moving a parent moves its children.',
      ['Create bones tool (C)', 'In Setup mode, drag in the viewport: a new bone is made as a child of the selected bone, from where you press to where you release.'],
      ['Reparent', 'Drag a bone onto another bone in the tree. Its world position is kept.'],
      '## Bone properties',
      ['Rotate / Translate X Y / Scale X Y / Shear X Y', 'The bone\'s transform relative to its parent. The ◇ buttons set keys in Animate mode.'],
      ['Length', 'Length of the bone. A bone with length 0 is drawn as an icon.'],
      ['Parent', 'Changes the parent bone.'],
      ['Inherit rotation / scale / reflection', 'Turn off to stop following the parent\'s rotation, scale or mirroring.'],
      ['Skin required', 'The bone only works when the active skin lists it (C5).'],
      ['Color', 'Bone color in the viewport (also for organizing).'],
      ['Icon', 'Shape drawn for zero-length bones: circle, square, diamond, star, cross, eye.'],
      ['Key all / Reset pose (Animate mode)', 'Keys every transform of the selected bones / clears changes that are not keyed yet.'],
      '> Right-click a bone in the tree for: New child bone, New slot, Add physics.',
    ] },
    { id: 'C2', title: 'Slots', body: [
      'A slot sits on a bone and shows one attachment at a time. Slots set the draw order, color and blending of what they show.',
      ['New → Slot', 'Adds a slot to the selected bone.'],
      ['Attachment', 'Which of the slot\'s attachments is visible (or none). Keyable.'],
      ['Color / Tint black / Blend', 'See chapter G.'],
      ['Bone', 'Moves the slot to another bone.'],
      ['Draw order buttons', 'Front, Forward, Back, Bottom (C4).'],
      ['Folder', 'Puts the slot in a draw order folder (Setup mode).'],
      ['New attachment', 'Region…, Bounding box, Clipping, Path, Point, Delete slot.'],
      '> The dot in front of an attachment in the tree shows / hides it.',
    ] },
    { id: 'C3', title: 'Attachments', body: [
      ['Region', 'A plain image. Position, rotation, scale, width/height, color, Reset size.'],
      ['Mesh', 'An image cut into triangles that can bend and be weighted to several bones (chapter E).'],
      ['Linked mesh', 'Uses another mesh\'s shape and weights with a different image (great for skins). Choose the parent mesh; "Inherit deform" makes it follow the parent\'s deform keys.'],
      ['Bounding box', 'A polygon for hit testing in your game. Can be weighted.'],
      ['Clipping', 'A polygon that masks the slots after it in draw order, up to its End slot. "Inverse" hides what is inside instead.'],
      ['Path', 'A bezier curve for path constraints (F3). Edit points with the mesh tool; Closed and Constant speed options.'],
      ['Point', 'A position and angle, e.g. where a gun fires from.'],
      ['Image sequence', 'Turns a region or mesh into a flip-book: images named name01, name02 … Count, Start, Digits, Setup frame; key Loop / Once / Pingpong / Hold in Animate mode.'],
      '> Bulk: select several attachments (Ctrl+click) to bind, auto-weight, smooth, prune, trace or weld them all at once.',
    ] },
    { id: 'C4', title: 'Draw order and draw order folders', body: [
      'Draw order decides what is in front. The Draw Order section of the tree lists slots front to back.',
      ['Drag in the Draw Order list', 'Reorders slots. In Animate mode this sets a draw order key instead.'],
      ['Front / Forward / Back / Bottom', 'Slot property buttons; also Bring to front / Send to back in the right-click menu.'],
      ['Key draw order', 'Animate mode: keys the current order (Animation menu, slot properties or right-click Draw Order).'],
      '## Draw order folders',
      ['New → Draw order folder (selected slots)', 'Groups the selected slots. A folder keeps its slots together.'],
      ['Drag a slot onto a folder', 'Moves it into the folder (Setup mode). Right-click a slot → Draw order folder for the same.'],
      ['Key folder order', 'A folder can be keyed on its own; only its slots move. Folders keyed in different animations play together on different tracks.'],
      ['Reset to setup order / Clear folder keys', 'Animate mode folder actions.'],
      ['Duplicate folder', 'Copies the folder with all its slots and attachments.'],
      ['Delete folder (keep slots)', 'Removes the folder only.'],
    ] },
    { id: 'C5', title: 'Skins', body: [
      'Skins swap sets of attachments — outfits, characters sharing one skeleton, equipment.',
      ['New → Skin', 'Adds a skin. New attachments go into the active skin.'],
      ['Active skin', 'The dot in the tree, the Skin menu above the viewport, or Set active in the skin properties.'],
      ['default skin', 'Attachments here are used when the active skin has none for that slot.'],
      ['Skin bones & constraints', 'Bones / constraints marked Skin required only work when the active skin lists them. Add selected bones / constraints, Clear.'],
      ['Merge into', 'Copies every attachment of this skin into another one.'],
      ['📌 Pin', 'Pin skins in the tree; View → Show pinned skins with the active skin shows them together (e.g. a hat skin on top of a body skin).'],
      ['View → Tree shows attachments of', 'All skins, the active skin only, or the active + pinned skins.'],
    ] },
    { id: 'C6', title: 'Locking, snapping and compensation', body: [
      ['🔓 Lock (tree)', 'Locked bones and slots can\'t be clicked in the viewport, so they don\'t get in the way.'],
      ['● Eye (tree)', 'Hides a bone or slot in the viewport only.'],
      ['Snap (viewport button)', 'Translate snaps to a grid, rotate to an angle step, scale to a step. View → Snap settings… sets the steps.'],
      ['Keep children (viewport button)', 'Setup mode: moving or rotating a bone leaves its child bones where they are.'],
      ['Keep images (viewport button)', 'Setup mode: moving a bone leaves its attachments where they are — handy for fixing a bone\'s position under finished art.'],
    ] },

    /* ---------------- D ---------------- */
    { id: 'D1', title: 'Pose tool (Q)', body: [
      'The everyday tool. Click to select. Drag a bone to aim it (rotate toward the mouse). Drag an IK target or a zero-length bone to move it. Alt + drag moves any bone.',
    ] },
    { id: 'D2', title: 'Rotate tool (R)', body: ['Drag anywhere to rotate the selection around its pivot. Hold Shift for 15° steps. With vertices selected (mesh tool), rotates the vertices.'] },
    { id: 'D3', title: 'Translate tool (T)', body: ['Drag anywhere to move the selection. Hold Shift to lock to one axis. The axes can be Local, Parent or World. With vertices selected, moves the vertices.'] },
    { id: 'D4', title: 'Scale tool (S)', body: ['Drag right/left for X and up/down for Y. Hold Shift for uniform scale. With vertices selected, scales the vertices.'] },
    { id: 'D5', title: 'Shear tool (H)', body: ['Drag to shear (slant) the selected bones.'] },
    { id: 'D6', title: 'Number fields and math', body: [
      'Every number box accepts math. Press Enter to apply, or drag the box left/right.',
      ['+= 10, -= 5, *= 2, /= 4', 'Changes the current value.'],
      ['v', 'The current value, e.g. v*1.5.'],
      ['boneLength', 'In bone fields: the bone\'s length, e.g. boneLength*2.'],
      ['Functions', 'sin, cos, tan, abs, min, max, round, floor, ceil, sqrt, pow, clamp(x, a, b), random(), pi.'],
    ] },

    /* ---------------- E ---------------- */
    { id: 'E1', title: 'Creating meshes', body: [
      ['Convert to mesh', 'Right-click a region attachment (or its properties) → Convert to mesh.'],
      ['Edit mesh (M)', 'Click inside to add a vertex, click outside (or Shift) to extend the outline, drag to move (vertices slide over the image; Alt + drag reshapes the image), Del removes.'],
      ['Trace verts / Uniform / Trace outline', 'Builds the outline from the image\'s transparency with about that many points. Uniform 0 = outline only; higher values add evenly spaced inner vertices so the mesh bends smoothly at joints.'],
      ['Grid spacing / Generate interior', 'Fills the inside with a grid of vertices.'],
      ['Reset', 'Back to a 4-corner mesh.'],
      ['Delete selected', 'Removes the selected vertices.'],
      ['Linked mesh', 'Makes a linked copy (C3).'],
    ] },
    { id: 'E2', title: 'Weights', body: [
      'Weights let one mesh follow several bones, like skin over joints.',
      ['Bind bones…', 'Binds the mesh to the chosen bones (select bones first with Ctrl+click) and computes automatic weights.'],
      ['Add bones…', 'Adds more bones to an already bound mesh.'],
      ['Auto', 'Recomputes weights from the bone positions.'],
      ['Smooth', 'Softens weight changes between neighbouring vertices.'],
      ['Prune', 'Removes tiny weights and keeps at most 4 bones per vertex.'],
      ['Unbind', 'Removes the weights, keeping the shape.'],
      ['Bound bones list', 'Click a bone to paint its weights; the viewport shows its influence as a heat map.'],
      ['Paint weights (W)', 'Brush: drag over vertices to add weight for the chosen bone. Alt (or Brush: Remove) takes weight away.'],
      ['Brush size / Strength / Brush', 'Radius in pixels, how strongly each stroke changes weights, add or remove.'],
    ] },
    { id: 'E3', title: 'Welding and bulk operations', body: [
      ['Weld to touching meshes', 'Vertices of this mesh and of other meshes / boxes / clipping that touch it get one position and the same weights, so the seam never opens when bones move.'],
      ['Weld (several selected)', 'Select attachments with Ctrl+click: Weld welds all of them. Weld distance sets how close vertices must be.'],
      ['Bulk Bind / Auto weights / Smooth / Prune / Trace', 'The same tools applied to every selected attachment.'],
    ] },
    { id: 'E4', title: 'Deform keys', body: [
      'In Animate mode, drag mesh vertices with the Edit mesh tool to bend the image itself; Auto key records deform keys. Key deform in the Deform section keys the current shape. Deform keys work on top of the bones and weights.',
    ] },

    /* ---------------- F ---------------- */
    { id: 'F1', title: 'IK constraint', body: [
      'Inverse kinematics: point a chain of 1 or 2 bones at a target bone, like a leg reaching the floor. Select the bones (and last the target), then New → IK constraint.',
      ['Target', 'The bone the chain reaches for. Move it with the Pose tool.'],
      ['Mix', '0 = off, 1 = fully on. Keyable.'],
      ['Softness', 'Slows the chain down as it straightens, avoiding a sudden snap.'],
      ['Bend positive', 'Which way the knee/elbow bends. Keyable.'],
      ['Stretch / Compress', 'Bones stretch to reach a far target / shrink for a near one.'],
      ['Uniform', 'Stretching scales the bone on both axes.'],
      ['Volume', 'Stretching thins the bone to keep its volume.'],
      ['Enabled / Skin required', 'Turn the constraint off, or only use it with skins that list it.'],
    ] },
    { id: 'F2', title: 'Transform constraint', body: [
      'Copies the transform of a target bone onto other bones, e.g. a second hand that follows the first.',
      ['Mix rotate / X / Y / scale X / scale Y / shear Y', 'How much of each is copied (0–1). Keyable.'],
      ['Offsets', 'Added to the copied values.'],
      ['Local / Relative', 'Copy local values instead of world; add to the bones\' own values instead of replacing.'],
      ['Property mappings (+ Add mapping)', 'Any property of the target drives any property of the bones: from, to, scale, offsets, and an optional min/max clamp — e.g. the target\'s rotation slides the bones on X. Source space chooses local or world values.'],
    ] },
    { id: 'F3', title: 'Path constraint', body: [
      'Bones follow a path attachment, like a train on a track or a tail following a curve.',
      ['Target', 'The slot with the path attachment.'],
      ['Position mode / Position', 'Where along the path the first bone sits: a percent of the path or a fixed distance. Keyable.'],
      ['Spacing mode / Spacing', 'Distance between bones: bone length, fixed, percent or proportional. Keyable.'],
      ['Rotate mode', 'Tangent (follow the curve), Chain, or Chain scale (stretch bones to fit).'],
      ['Mix rotate / X / Y', 'How strongly bones are rotated and moved onto the path.'],
    ] },
    { id: 'F4', title: 'Physics constraint', body: [
      'Makes a bone jiggle, sway and lag behind on its own — hair, tails, antennas, cloth. Select the bone → New → Physics constraint (or right-click → Add physics).',
      ['X / Y / Rotate / Scale X / Shear X', 'Which properties are simulated.'],
      ['Inertia', 'How much the bone keeps moving when its parent moves.'],
      ['Strength', 'How strongly it springs back.'],
      ['Damping', 'How quickly the motion calms down.'],
      ['Mass', 'Heavier = slower, bigger swings.'],
      ['Wind / Gravity', 'Constant forces. The skeleton also has Wind and Gravity applied to every physics constraint (skeleton properties).'],
      ['Mix / Step / Limit', 'Overall strength; simulation steps per second; maximum speed.'],
      ['Volume', 'Scale X stretching keeps volume.'],
      ['Reset simulation / Reset physics', 'Stops all current motion.'],
      ['Physics (viewport button)', 'Turns the simulation on or off in the editor.'],
      '> Animation → Bake constrained motion… turns physics motion into ordinary keys.',
    ] },
    { id: 'F5', title: 'Slider constraint', body: [
      'Plays an animation by a value instead of by time: e.g. a "smile" animation driven by a bone\'s X position, or by the slider\'s own keyed Time.',
      ['Animation', 'The animation to scrub.'],
      ['Bone / Property / Scale / Offset', 'Optional driver: the bone property × scale + offset gives the time.'],
      ['Time / Mix / Loop / Additive', 'Time when no bone drives it; strength; wrap around; add on top instead of replacing.'],
    ] },
    { id: 'F6', title: 'Constraint order', body: [
      'Constraints run top to bottom as listed in the tree. Use ▲ Earlier / ▼ Later in a constraint\'s properties when one constraint must run after another (e.g. IK before physics).',
    ] },

    /* ---------------- G ---------------- */
    { id: 'G1', title: 'Slot color, alpha and tint black', body: [
      ['Color', 'Multiplies the slot\'s image by this color; the number next to it is alpha (opacity). White = unchanged.'],
      ['Tint black', 'Adds a second, dark color: it replaces the black parts of the image, so you can tint shadows and lights separately (two-color tinting).'],
      '> Color, alpha and tint black are keyable: change them in Animate mode for flashes, fades and color shifts.',
    ] },
    { id: 'G2', title: 'Blend modes', body: [
      ['Normal', 'Standard drawing.'],
      ['Additive', 'Adds light — glows, fire, magic.'],
      ['Multiply', 'Darkens — shadows.'],
      ['Screen', 'Lightens softly — highlights.'],
    ] },
    { id: 'G3', title: 'Attachment colors', body: [
      'Every attachment has its own color too (in its properties). For bounding boxes, clipping, paths and points the color is only how they are drawn in the editor.',
    ] },
    { id: 'G4', title: 'Bone colors and icons', body: ['Bone colors (C1) only change the viewport display. Use them to tell left from right or to group parts.'] },

    /* ---------------- H ---------------- */
    { id: 'H1', title: 'Animations', body: [
      ['New → Animation, or + in the timeline', 'Creates an animation and switches to Animate mode.'],
      ['⧉ (timeline)', 'Duplicates the active animation.'],
      ['Animation menu (timeline)', 'Chooses the active animation. The dot in the tree does the same.'],
      ['Animation properties', 'Number of timelines and keys, End frame (length when the last key is earlier), Animate this, Duplicate.'],
      ['Folders', 'Right-click Animations → New folder, then drag animations in (M2).'],
    ] },
    { id: 'H2', title: 'Timeline toolbar', body: [
      ['⏮ / ⏭', 'First / last frame (Home / End).'],
      ['◆◀ / ▶◆', 'Previous / next key.'],
      ['◀ / ▶| (, and .)', 'Previous / next frame.'],
      ['▶ / ❚❚ (Space)', 'Play / pause.'],
      ['⟲', 'Loop playback.'],
      ['Speed', '0.1× to 2× playback speed (preview only).'],
      ['Frame', 'Type a frame number and press Enter to jump. Next to it: the animation length in frames.'],
      ['● Auto key', 'When on, every change in Animate mode becomes a key.'],
      ['◆ Key (K)', 'Keys the changed or selected properties now.'],
      ['◐ Ghosts and ⚙', 'Onion skin and its settings (H7).'],
      ['No layer / + animation and slider', 'Plays a second animation on top for previewing combinations, at the chosen strength (H8).'],
      ['╱ ⌐ ∫ ◟ ◝ ↷', 'Curve presets for the selected keys: linear, stepped, ease in-out, ease in, ease out, overshoot.'],
      ['Keys ▾', 'Key tools (H6).'],
      ['☰', 'Show only the selected items\' rows.'],
      ['Dopesheet / Graph', 'Switch between keys and curves.'],
    ] },
    { id: 'H3', title: 'Making keys', body: [
      'In Animate mode, pick a frame, then pose: with Auto key on, keys are created as you go. With Auto key off, changes stay orange (uncommitted) until you press K or the ◇ button next to the property.',
      ['◇ / ◆ beside a property', 'Empty = no key here, filled = key on this frame, orange = changed but not keyed. Click to key.'],
      ['K', 'Key changed or selected.'],
      ['Shift+K (Key constrained values)', 'Keys bones where IK, transform, path or physics constraints put them.'],
      ['◆ in the tree', 'Marks items that have keys in the active animation.'],
    ] },
    { id: 'H4', title: 'Dopesheet', body: [
      'One row per bone, slot, constraint, deform, draw order and events; the first row sums up all keys.',
      ['Click / drag a box', 'Select keys. Shift adds to the selection.'],
      ['Drag keys', 'Move them in time.'],
      ['Ctrl+C / Ctrl+V', 'Copy keys and paste them at the current frame.'],
      ['Del', 'Delete selected keys.'],
      ['Orange bracket', 'With several keys selected, drag the bracket ends above the rows to stretch or squash timing.'],
      ['Click the ruler', 'Moves the current frame; drag to scrub.'],
      ['Ctrl+wheel / wheel', 'Zoom / scroll the timeline.'],
      ['Bars between keys', 'Show held values (equal keys) and curve types.'],
    ] },
    { id: 'H5', title: 'Graph editor', body: [
      'Shows the curves of the selected rows. Drag keys up/down to change values and left/right to retime. Drag the round bezier handles to shape the ease. The curve presets (H2) apply to selected keys. "New keys use last chosen curve" (Keys menu) makes new keys start with the curve you used last.',
    ] },
    { id: 'H6', title: 'Key tools (Keys ▾)', body: [
      ['Offset selected keys…', 'Moves keys by a number of frames; Wrap moves keys that pass the end to the start (loops).'],
      ['Stretch selected keys…', 'Scales timing by a factor.'],
      ['Reverse selected keys', 'Plays them backwards.'],
      ['Insert / remove frames', 'Adds or removes time at the current frame, moving later keys.'],
      ['Key constrained values', 'As Shift+K.'],
      ['Bake constrained motion…', 'Writes the result of physics and constraints as keys on every frame (or every N frames).'],
      ['Clean up this animation / all animations', 'Removes keys that change nothing, keeping the motion identical.'],
      ['New keys use last chosen curve', 'Toggle.'],
    ] },
    { id: 'H7', title: 'Ghosting (onion skin)', body: [
      'Shows faded copies of the skeleton at earlier (blue) and later (orange) frames, to judge spacing.',
      ['◐ Ghosts', 'On / off (G).'],
      ['Frames before / after', 'How many ghosts on each side.'],
      ['Step', 'Frames between ghosts.'],
      ['Opacity', 'How visible they are.'],
      ['Tint', 'Blue/orange colouring, or plain.'],
      ['Wrap around', 'In looping animations, ghosts continue past the ends.'],
      ['Only the selected bones\' slots', 'Ghosts only the part you are working on.'],
    ] },
    { id: 'H8', title: 'Layer preview', body: ['The layer menu in the timeline plays a second animation on top of the active one (with the strength slider), e.g. a "blink" over a "walk", without changing either.'] },
    { id: 'H9', title: 'Events and sound', body: [
      'Events are named markers your game reacts to (footstep, attack hits, play a sound).',
      ['New → Event', 'Creates an event with default Int, Float, String values, an optional Audio sound, Volume and Balance.'],
      ['Key event at frame N', 'Event properties in Animate mode: places the event at the current frame. Each key can change the values.'],
      ['▶ Play sound', 'Plays the event\'s sound.'],
      ['Waveforms', 'Sounds show as waveforms under their event keys in the timeline (View → Audio waveforms in the timeline).'],
      'During playback and in the Preview window, event sounds play with the key\'s volume and balance.',
    ] },
    { id: 'H10', title: 'Draw order and attachment keys', body: ['In Animate mode, choosing a slot\'s attachment keys the swap (e.g. open/closed eyes), and reordering the Draw Order list keys the order (C4).'] },

    /* ---------------- I ---------------- */
    { id: 'I1', title: 'Preview window (P)', body: [
      'Animation → Preview window plays animations like your game will: several tracks at once with smooth transitions.',
      ['Track rows', 'Each track plays one animation; higher tracks play on top.'],
      ['Loop / Alpha / Additive', 'Loop the track; its strength; add to lower tracks instead of replacing.'],
      ['Draw order', 'Whether the track\'s draw order keys apply.'],
      ['Queue', 'Plays another animation after the current one ends.'],
      ['Default mix / per-pair mixes', 'Crossfade time when switching animations, for all or for specific pairs.'],
      ['Crossfade curve', 'Linear or eased transitions.'],
      ['Skin / Physics', 'Preview another skin; turn physics on or off.'],
      ['Event log', 'Lists events as they fire (sounds play).'],
    ] },

    /* ---------------- J ---------------- */
    { id: 'J1', title: 'Export: runtime data and atlas', body: [
      'File → Export… (Ctrl+E) → Runtime data + atlas creates the files your game uses.',
      ['Skeletons', 'With several skeletons: the active one or all (one folder each).'],
      ['Data', 'JSON (.json, readable), binary (.alkb, smaller and faster) or both.'],
      ['Pretty-print JSON', 'Indented JSON for reading.'],
      ['Clean up animations', 'Drops keys that change nothing.'],
      ['Nonessential data', 'Off = leave out editor-only data (bone colors, icons, box colors).'],
      ['Include event audio', 'Copies sounds into audio/.'],
      ['Max page size / Scale', 'Atlas page size limit and image scale.'],
      ['Padding / Edge padding / Bleed', 'Space between images, around the page edge, and repeated edge pixels to prevent seams.'],
      ['Power of two / Square', 'Page size rules some engines need.'],
      ['Allow rotation', 'Rotates images 90° to pack tighter.'],
      ['Strip whitespace', 'Trims transparent borders (never for meshes).'],
      ['Premultiply alpha', 'Stores premultiplied colors.'],
      ['Merge duplicates', 'Identical images are stored once.'],
      ['Only used images', 'Skips images no attachment uses.'],
      ['Atlas per skin', 'One atlas per skin.'],
      ['Brute force', 'Tries thousands of layouts for the smallest pages (slower).'],
      ['Filtering', 'Linear (smooth) or Nearest (pixel art).'],
      ['Preview atlas…', 'Shows the pages before exporting.'],
    ] },
    { id: 'J2', title: 'Export: HTML page', body: [
      'One self-contained web page that plays the skeleton (runtime, data, images and sounds inside).',
      ['Page uses: Player', 'With an animation menu and skin checkboxes.'],
      ['Page uses: Web component', 'Uses the <alike-skeleton> tag (K3).'],
    ] },
    { id: 'J3', title: 'Export: images', body: [
      ['PNG sequence', 'One PNG per frame (zip).'],
      ['JPEG sequence', 'One JPEG per frame (zip), on the background color (white if none).'],
      ['Sprite sheet', 'All frames in one PNG grid.'],
      ['Animated GIF', 'Looping GIF.'],
      ['Animated PNG (APNG)', 'Looping PNG with full transparency.'],
      ['Animation', 'One animation, or (all animations, one file each).'],
      ['Skin / FPS / Scale / Loop / Background', 'What to render and how.'],
      ['Project images', 'All project images (zip).'],
    ] },
    { id: 'J4', title: 'Export: video', body: [
      ['Video (.webm)', 'WebM; keeps transparency when Background is empty.'],
      ['Video (.mp4)', 'MP4 (H.264) — plays everywhere.'],
    ] },
    { id: 'J5', title: 'Texture Packer and Unpacker', body: [
      'File → Texture Packer… packs any images into atlas pages — no skeleton needed.',
      ['Choose images… / Choose folder… / Use project images', 'What to pack.'],
      ['Atlas file', '.atlas text (compact or classic libGDX style, read by many engines) or Alike atlas JSON.'],
      ['Settings', 'The same as J1.'],
      ['Preview… / Pack', 'Look first, then download pages + atlas as a zip.'],
      'File → Texture Unpacker… takes an atlas (.atlas, or an Alike export) with its pages and gives back the separate images: download them, or add them to the project.',
    ] },
    { id: 'J6', title: 'Command line', body: [
      'The installed app has alike-cli next to Alike.exe for automatic exports (build scripts).',
      ['alike-cli -i project.alike -o out', 'Exports data + atlas.'],
      ['-i folder', 'Exports every project in the folder; --threads N runs several at once.'],
      ['--data, --brute-force, --pma, --max-size …', 'Export settings.'],
      ['--png / --jpg / --sheet / --gif / --apng / --webm / --mp4 <anim|all>', 'Images and video.'],
      ['--html [player|component]', 'HTML page.'],
      ['--import data.json,data.atlas,data.png -o hero.alike', 'Turns exported data into a project.'],
      ['--info / --help', 'Lists what is inside a project / every option.'],
    ] },

    /* ---------------- K ---------------- */
    { id: 'K1', title: 'Unity', body: ['Add engines/unity with Package Manager → Add package from disk. Drop the exported .alkb, atlas .png and audio/ into Assets, then GameObject → Alike → Skeleton Animation. See engines/unity/README.md.'] },
    { id: 'K2', title: 'Godot 4', body: ['Copy engines/godot/addons/alike into res://addons/alike and enable the plug-in. The .alkb imports as AlikeSkeletonData; add an AlikeSkeleton2D node. See engines/godot/README.md.'] },
    { id: 'K3', title: 'Web', body: [
      ['runtime/alike-web.js', 'One script that adds the <alike-skeleton> tag: <alike-skeleton src="hero.json" animation="walk" skin="a,b">. Attributes: src, animation, loop, skin, speed, mix, fit, scale, offset-x, offset-y, physics, paused, sound, background, isolated.'],
      ['runtime/player.html', 'A simple player you can open and load exports into.'],
    ] },

    /* ---------------- L ---------------- */
    { id: 'L1', title: 'View menu', body: [
      ['Bones, Images, Mesh wireframes, Bounding boxes, Clipping, Paths, Points, Bone names, Grid', 'Show or hide each kind of item.'],
      ['Bone size…', 'Size of bone icons; Rotate icons with bones.'],
      ['Show pinned skins with the active skin', 'See C5.'],
      ['Tree shows attachments of', 'See C5.'],
      ['Audio waveforms in the timeline', 'See H9.'],
      ['Frame all / Zoom 100%', 'See A4.'],
      ['Snapping / Snap settings… / Compensate children / Compensate images', 'See C6.'],
      ['Reference image…', 'A tracing image behind the skeleton: choose, opacity, scale, position. Saved with the project, never exported.'],
      ['Physics simulation', 'On / off.'],
      ['Light theme', 'Switches between dark and light.'],
    ] },
    { id: 'L2', title: 'Hierarchy panel tools', body: [
      ['Filter…', 'Type to show only matching items.'],
      ['+ New', 'Menu to create bones, slots, attachments, constraints, folders, skins, events, animations, and to import.'],
      ['🗑', 'Delete the selection.'],
      ['Right-click', 'Every item has a menu with what you can do with it.'],
      ['Drag and drop', 'Reparent bones, move slots to bones, move attachments between slots, reorder draw order, move items into folders.'],
    ] },

    /* ---------------- M ---------------- */
    { id: 'M1', title: 'Several skeletons in one project', body: [
      ['File → New skeleton…', 'Adds an empty skeleton and switches to it.'],
      ['Skeletons in the tree', 'Click a skeleton row to see it, double-click (or Edit this skeleton) to edit it. Its eye shows it dimmed in the viewport while you edit another (with an Offset).'],
      ['Skeleton properties', 'The list of skeletons with New, Duplicate, Delete and Import skeletons from project.'],
      'Images and sounds are shared; each skeleton has its own bones, skins, animations and undo history, and its own export files.',
    ] },
    { id: 'M2', title: 'Folders and filtering', body: [
      'Animations, skins, events and constraints can live in folders. Right-click their section → New folder, drag items onto a folder, or right-click an item → Move to folder. The folder is part of the name ("run/fast"), which is also the name in exported data. Folder properties: New subfolder, Rename, Duplicate (with everything in it), Delete folder (keep contents) or Delete with contents.',
    ] },

    /* ---------------- N ---------------- */
    { id: 'N1', title: 'Problems', body: [
      'Edit → Problems… (also Help) checks the project: missing images or sounds, broken linked meshes, weights that don\'t add up, empty polygons, constraint mistakes, keys for deleted things, unused images and more. Fix fixes one problem, Fix all fixes everything that can be fixed automatically; click a problem to select the item.',
    ] },
    { id: 'N2', title: 'Keyboard shortcuts', body: [
      ['Tab', 'Setup / Animate.'], ['Q R T S H', 'Pose, Rotate, Translate, Scale, Shear.'], ['C / M / W', 'Create bones, Edit mesh, Weights.'],
      ['Space', 'Play / pause (hold + drag to pan).'], [', and .', 'Previous / next frame.'], ['Home / End', 'First / last frame.'],
      ['K / Shift+K', 'Key / key constrained values.'], ['G', 'Ghosts.'], ['P', 'Preview window.'], ['F / 1', 'Frame all / zoom 100%.'],
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo.'], ['Ctrl+D', 'Duplicate.'], ['F2', 'Rename.'], ['Del', 'Delete.'], ['Ctrl+C / Ctrl+V', 'Copy / paste keys.'],
      ['Ctrl+S / Ctrl+O / Ctrl+N / Ctrl+E', 'Save / open / new / export.'], ['?', 'Shortcut list.'],
    ] },
    { id: 'N3', title: 'Supported file formats', body: [
      ['Projects', '.alike (also .json saved by Alike).'],
      ['Images in', 'PNG, APNG, JPEG (jpg, jpeg, jfif), WebP, GIF, BMP, ICO, AVIF, SVG, TGA, TIFF, QOI, PBM/PGM/PPM, Photoshop PSD/PSB.'],
      ['Sounds in', 'MP3, WAV, OGG/OGA, Opus, FLAC, AAC, M4A/MP4, WebM/WebA, AIFF/AIFC.'],
      ['Skeleton data in', 'Alike .json / .alkb; Spine 3.8–4.x JSON; Spine 3.8 .skel; atlases: .atlas text (both styles) and Alike atlas JSON.'],
      ['Data out', 'Alike .json and .alkb with PNG atlas pages; .atlas text or Alike atlas JSON from the Texture Packer.'],
      ['Images / video out', 'PNG and JPEG sequences, sprite sheet PNG, GIF, APNG, WebM, MP4, HTML page.'],
    ] },
  ];

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const Tut = {
    topics: T, chapters: CH,
    render(t) {
      const out = [h('div.tut-id', null, t.id + ' · ' + CH[t.id[0]]), h('h2.tut-title', null, t.title)];
      let list = null;
      for (const item of t.body) {
        if (Array.isArray(item)) { if (!list) { list = h('dl.tut-dl'); out.push(list); } list.append(h('dt', null, item[0]), h('dd', null, item[1])); continue; }
        list = null;
        if (item.startsWith('## ')) out.push(h('h3.tut-sub', null, item.slice(3)));
        else if (item.startsWith('> ')) out.push(h('div.tut-tip', null, item.slice(2)));
        else out.push(h('p', null, item));
      }
      return out;
    },
    show(startId) {
      const nav = h('div.tut-nav'), body = h('div.tut-body'), search = h('input.search', { type: 'text', placeholder: 'Search the tutorial…', spellcheck: 'false' });
      let cur = Math.max(0, T.findIndex((t) => t.id === startId));
      const text = (t) => (t.id + ' ' + t.title + ' ' + t.body.map((b) => (Array.isArray(b) ? b.join(' ') : b)).join(' ')).toLowerCase();
      const go = (i) => {
        cur = (i + T.length) % T.length; body.innerHTML = ''; body.append(...Tut.render(T[cur]));
        body.append(h('div.tut-pager', null, UI.button('◀ ' + T[(cur - 1 + T.length) % T.length].id, () => go(cur - 1)), h('span.flex'), UI.button(T[(cur + 1) % T.length].id + ' ▶', () => go(cur + 1), { primary: true })));
        body.scrollTop = 0; buildNav();
      };
      const buildNav = () => {
        const q = search.value.trim().toLowerCase(); nav.innerHTML = '';
        let ch = '';
        T.forEach((t, i) => {
          if (q && !text(t).includes(q)) return;
          if (t.id[0] !== ch) { ch = t.id[0]; nav.appendChild(h('div.tut-ch', null, ch + ' — ' + CH[ch])); }
          nav.appendChild(h('div.tut-item' + (i === cur ? '.on' : ''), { onclick: () => go(i) }, h('b', null, t.id), ' ' + t.title));
        });
        if (!nav.children.length) nav.appendChild(h('div.note', null, 'Nothing found.'));
      };
      search.addEventListener('input', () => { buildNav(); const q = search.value.trim().toLowerCase(); const first = T.findIndex((t) => text(t).includes(q)); if (q && first >= 0 && !text(T[cur]).includes(q)) go(first); });
      search.addEventListener('keydown', (e) => e.stopPropagation());
      const wrap = h('div.tut', null, h('div.tut-side', null, search, nav), body);
      go(cur);
      UI.modal('Tutorial', wrap, [['Close', true, true]]);
      setTimeout(() => { const d = wrap.closest('.dialog'); if (d) d.classList.add('dialog-wide'); }, 0);
    },
    esc,
  };
  A.Tutorial = Tut;
})(window.A);
