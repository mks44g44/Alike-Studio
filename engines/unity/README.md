# Alike Runtime for Unity

The Unity runtime plays characters exported from Alike Studio. It needs Unity 2021.3 or newer and works with both the Built-in render pipeline and URP.

## Install

1. In Unity, open **Window → Package Manager → + → Add package from disk…** and pick `engines/unity/package.json`.
   Or copy the whole `engines/unity` folder into your project's `Packages/` folder.
2. In Alike Studio, go to **File → Export… → Runtime data + atlas**. Choose **Binary (.alkb)** or **JSON + binary**, then unzip the result.
3. Copy the `.alkb` file, the `.png` atlas pages and the `audio/` folder (if there is one) into a single folder under `Assets/`.
   The importer turns the `.alkb` into an **Alike Skeleton Asset**. It links the atlas pages and sounds it finds next to the file.
   - If you'd rather use JSON: right-click the `.json` file and choose **Alike → Create Skeleton Asset from JSON**.
4. Use **GameObject → Alike → Skeleton Animation**, then drag the skeleton asset onto it and pick an animation.

## Scripting

```csharp
using Alike.Unity;

var anim = GetComponent<AlikeSkeletonAnimation>();
anim.SetAnimation(0, "walk", true);              // track 0, crossfades with defaultMix
anim.AddAnimation(0, "jump", false);             // queued after walk
anim.AddAnimation(0, "idle", true);
anim.SetAnimation(1, "wave", true).alpha = 0.6f; // layer a second track on top
anim.State.SetMix("walk", "jump", 0.1f);         // per-pair mix duration
anim.SetSkin("party");
anim.AnimationEvent += (e, track) => Debug.Log(e.name + " " + e.intValue + " " + e.str);
Vector3 hand = anim.BonePosition("forearm-r");   // attach props to bones
```

## Supported features

- Bones with inherit rotation, scale and reflection.
- Region, mesh, linked mesh and weighted attachments.
- Image sequences.
- Slot colors, two-color tint and blend modes (normal, additive, multiply, screen).
- Draw order keys.
- Clipping: triangles are clipped against the polygon, and concave polygons work.
- IK, transform, path, physics and slider constraints.
- Skins, including skin-required bones and constraints.
- Events with sound, played through an AudioSource.
- Multi-track mixing: crossfades, queues and additive layers.
- Atlas pages that are trimmed, rotated, scaled or premultiplied.

The core files `AlikeTree.cs`, `AlikeData.cs`, `AlikePose.cs`, `AlikeAnimationState.cs` and `AlikeClipper.cs` don't use any Unity APIs. You can use them in any C# engine, such as MonoGame or a server.

Draw order folders: `drawFolder` timelines reorder only one folder's slots after the main draw order. Set `TrackEntry.drawOrder = false` to ignore a track's draw order keys.
