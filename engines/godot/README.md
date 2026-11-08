# Alike Runtime for Godot 4

The Godot runtime plays characters exported from Alike Studio in Godot 4.2 and newer. It's tested with Godot 4.3.

## Install

1. Copy `engines/godot/addons/alike` into your project as `res://addons/alike`.
2. Open **Project → Project Settings → Plugins** and enable **Alike Runtime**.
3. In Alike Studio, go to **File → Export… → Runtime data + atlas** and unzip the result.
4. Copy the `.alkb` file (or the `.json`), the `.png` atlas pages and the `audio/` folder into one folder of your project.
   The `.alkb` file is imported as an **AlikeSkeletonData** resource, and its atlas pages and sounds are linked automatically.
5. Add an **AlikeSkeleton2D** node. Then either drag the `.alkb` onto **Skeleton Data**, or set **Data File** to the `.json`. Pick an **Animation**.

## Scripting

```gdscript
@onready var hero: AlikeSkeleton2D = $Hero

func _ready():
    hero.set_animation("walk", true)            # track 0, crossfades using default_mix
    hero.add_animation("jump", false)           # queued
    hero.add_animation("idle", true)
    hero.set_animation("wave", true, 1).alpha = 0.6   # layer on track 1
    hero.set_mix("walk", "jump", 0.1)
    hero.skin = "party"
    hero.animation_event.connect(func(name, i, f, s, track): print(name, " ", s))

func _process(_d):
    $Sword.global_position = hero.get_bone_global_position("forearm-r")
```

## Supported features

- Bones, meshes, weights, linked meshes and image sequences.
- Slot colors and two-color tint, applied with a shader.
- Blend modes: normal, additive and multiply. Screen is drawn as additive.
- Draw order keys.
- Clipping, using `Geometry2D.intersect_polygons`, so concave polygons work.
- IK, transform, path, physics and slider constraints.
- Skins.
- Events with sound, played through an AudioStreamPlayer2D.
- Multi-track mixing: crossfades, queues and additive layers.
- Atlas pages that are trimmed, rotated, scaled or premultiplied, with nearest filtering for pixel art.

Alike uses y-up coordinates and Godot uses y-down. The node flips y for you, and `pixel_scale` sets the size.

Draw order folders: `drawFolder` timelines reorder only one folder's slots after the main draw order. Set `entry.draw_order = false` on a track entry to ignore its draw order keys.
