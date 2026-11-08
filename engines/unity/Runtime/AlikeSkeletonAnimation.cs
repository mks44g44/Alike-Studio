// Alike runtime for Unity — component that plays and renders an Alike skeleton.
// Add to a GameObject (it adds MeshFilter + MeshRenderer), assign an AlikeSkeletonAsset, pick an animation.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Alike.Unity
{
    [ExecuteAlways]
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    [AddComponentMenu("Alike/Skeleton Animation")]
    public class AlikeSkeletonAnimation : MonoBehaviour
    {
        delegate void ClipFn(float ax, float ay, float bx, float by, float cx, float cy, float au, float av, float bu, float bv, float cu, float cv, List<float[]> parts, Action<float, float, float, float> emit);
        public AlikeSkeletonAsset skeletonAsset;
        public string animationName = "";
        public bool loop = true;
        public string skin = "default";
        [Range(0, 3)] public float timeScale = 1;
        public bool physics = true;
        [Tooltip("Default crossfade duration (seconds) used by SetAnimation.")]
        public float defaultMix = 0.2f;
        public Color tint = Color.white;
        public bool flipX, flipY;
        public bool playSounds = true;
        [Tooltip("Shader used for skeleton materials (defaults to Alike/Skeleton).")]
        public Shader shader;

        /// <summary>Raised for every event key: (event, track).</summary>
        public event Action<EventKey, int> AnimationEvent;

        public SkeletonData Data { get; private set; }
        public AnimationState State { get; private set; }
        public Pose Pose { get; private set; }

        Mesh mesh; MeshRenderer meshRenderer; AudioSource audioSource;
        readonly Dictionary<string, PhysicsState> phys = new Dictionary<string, PhysicsState>();
        readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        readonly List<Vector3> verts = new List<Vector3>(); readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<Vector4> darks = new List<Vector4>(); readonly List<Color32> colors = new List<Color32>();
        readonly List<List<int>> submeshes = new List<List<int>>(); readonly List<Material> subMats = new List<Material>();
        string builtSkin, builtAnim; AlikeSkeletonAsset builtAsset;

        void OnEnable() { Initialize(true); }
        void OnValidate() { if (isActiveAndEnabled) Initialize(false); }
        void OnDisable() { if (mesh != null) { if (Application.isPlaying) Destroy(mesh); else DestroyImmediate(mesh); mesh = null; } }

        public void Initialize(bool force)
        {
            if (skeletonAsset == null) { Data = null; return; }
            if (!force && builtAsset == skeletonAsset && Data != null && builtSkin == skin && builtAnim == animationName) return;
            if (builtAsset != skeletonAsset) { skeletonAsset.ClearCache(); materials.Clear(); }
            Data = skeletonAsset.GetData(); if (Data == null) return;
            builtAsset = skeletonAsset; builtSkin = skin; builtAnim = animationName;
            Pose = new Pose(Data, skin);
            State = new AnimationState(Data) { defaultMix = defaultMix };
            State.OnEvent += HandleEvent;
            phys.Clear();
            if (!string.IsNullOrEmpty(animationName) && Data.FindAnimation(animationName) != null) State.SetAnimation(0, animationName, loop);
            meshRenderer = GetComponent<MeshRenderer>();
            if (mesh == null) { mesh = new Mesh { name = "Alike Skeleton" }; mesh.MarkDynamic(); mesh.hideFlags = HideFlags.DontSave; }
            GetComponent<MeshFilter>().sharedMesh = mesh;
            Rebuild(0);
        }

        /* ---------- playback API ---------- */
        public TrackEntry SetAnimation(int track, string anim, bool loopAnim) { State.defaultMix = defaultMix; return State.SetAnimation(track, anim, loopAnim); }
        public TrackEntry AddAnimation(int track, string anim, bool loopAnim, float delay = 0) { return State.AddAnimation(track, anim, loopAnim, delay); }
        public void SetSkin(string skinName) { skin = skinName; Pose = new Pose(Data, skin); phys.Clear(); }
        public void ResetPhysics() { phys.Clear(); }
        public Bone FindBone(string boneName) { Bone b; return Pose != null && Pose.boneMap.TryGetValue(boneName, out b) ? b : null; }
        /// <summary>World position (Unity space) of a bone.</summary>
        public Vector3 BonePosition(string boneName)
        {
            var b = FindBone(boneName); if (b == null) return transform.position;
            return transform.TransformPoint(ToLocal(b.wx, b.wy));
        }

        void HandleEvent(EventKey e, int track)
        {
            if (AnimationEvent != null) AnimationEvent(e, track);
            if (!playSounds || !Application.isPlaying) return;
            var def = Data.FindEvent(e.name); if (def == null || string.IsNullOrEmpty(def.audio)) return;
            var clip = skeletonAsset.FindSound(def.audio); if (clip == null) return;
            if (audioSource == null) { audioSource = GetComponent<AudioSource>(); if (audioSource == null) audioSource = gameObject.AddComponent<AudioSource>(); audioSource.playOnAwake = false; }
            audioSource.panStereo = Mathf.Clamp(e.balance, -1, 1);
            audioSource.PlayOneShot(clip, Mathf.Clamp01(e.volume));
        }

        void Update()
        {
            if (Data == null || State == null) { Initialize(true); if (Data == null) return; }
            float dt = Application.isPlaying ? Time.deltaTime * timeScale : 0;
            Rebuild(dt);
        }

        Vector3 ToLocal(float x, float y)
        {
            float ppu = skeletonAsset != null && skeletonAsset.pixelsPerUnit > 0 ? skeletonAsset.pixelsPerUnit : 100;
            return new Vector3((flipX ? -x : x) / ppu, (flipY ? -y : y) / ppu, 0);
        }

        Material MaterialFor(int page, string blend)
        {
            string key = page + "|" + blend; Material m;
            if (materials.TryGetValue(key, out m) && m != null) return m;
            var sh = shader != null ? shader : Shader.Find("Alike/Skeleton");
            m = new Material(sh) { name = "Alike " + key, hideFlags = HideFlags.DontSave };
            m.mainTexture = skeletonAsset.Page(page);
            m.SetFloat("_StraightAlpha", Data.pma ? 0 : 1);
            int src = 1, dst = 10; // One, OneMinusSrcAlpha
            if (blend == "additive") { src = 1; dst = 1; }
            else if (blend == "multiply") { src = 2; dst = 10; }  // DstColor, OneMinusSrcAlpha
            else if (blend == "screen") { src = 1; dst = 6; }     // One, OneMinusSrcColor
            m.SetFloat("_SrcBlend", src); m.SetFloat("_DstBlend", dst);
            materials[key] = m; return m;
        }

        void Rebuild(float dt)
        {
            if (Pose.skinName != skin) Pose = new Pose(Data, skin);
            State.Update(dt);
            Pose.SetToSetup();
            State.Apply(Pose);
            Pose.Update(physics ? dt : 0, physics ? phys : null);

            verts.Clear(); uvs.Clear(); colors.Clear(); darks.Clear(); subMats.Clear();
            foreach (var l in submeshes) l.Clear();
            int sub = -1; int curPage = -1; string curBlend = null;
            List<float[]> clipParts = null; string clipEnd = null; bool clipInverse = false;
            bool flipWinding = flipX ^ flipY;

            foreach (var slot in Pose.drawOrder)
            {
                if (!slot.bone.active) { if (clipEnd == slot.name) { clipParts = null; clipEnd = null; } continue; }
                var att = Pose.AttachmentOf(slot);
                if (att != null && att.type == "clip" && clipParts == null)
                {
                    var g0 = Pose.GetGeometry(slot, att);
                    if (g0 != null && g0.verts.Length >= 6) { clipParts = Clipper.ConvexParts(g0.verts); clipEnd = att.end ?? "\u0000end"; clipInverse = att.inverse; }
                }
                else if (att != null && (att.type == "region" || att.type == "mesh" || att.type == "linkedmesh"))
                {
                    var g = Pose.GetGeometry(slot, att);
                    AtlasRegion reg;
                    if (g != null && g.tris != null && g.image != null && Data.regions.TryGetValue(g.image, out reg))
                    {
                        var page = Data.pages[reg.page];
                        string blend = slot.data.blend ?? "normal";
                        if (reg.page != curPage || blend != curBlend)
                        {
                            sub++; curPage = reg.page; curBlend = blend;
                            if (submeshes.Count <= sub) submeshes.Add(new List<int>());
                            subMats.Add(MaterialFor(reg.page, blend));
                        }
                        var sc = slot.color; var ac = att.color;
                        var col = new Color32((byte)(Mathf.Clamp01(sc[0] * ac[0] * tint.r) * 255), (byte)(Mathf.Clamp01(sc[1] * ac[1] * tint.g) * 255), (byte)(Mathf.Clamp01(sc[2] * ac[2] * tint.b) * 255), (byte)(Mathf.Clamp01(sc[3] * ac[3] * tint.a) * 255));
                        var dark = slot.dark != null ? new Vector4(slot.dark[0], slot.dark[1], slot.dark[2], 1) : Vector4.zero;
                        var list = submeshes[sub];
                        if (clipParts == null)
                        {
                            int baseIndex = verts.Count, n = g.verts.Length / 2;
                            for (int i = 0; i < n; i++)
                            {
                                float pu, pv; AtlasUV.Map(reg, page, g.uvs[i * 2], g.uvs[i * 2 + 1], out pu, out pv);
                                verts.Add(ToLocal(g.verts[i * 2], g.verts[i * 2 + 1])); uvs.Add(new Vector2(pu, 1 - pv)); colors.Add(col); darks.Add(dark);
                            }
                            for (int i = 0; i < g.tris.Length; i += 3)
                            {
                                if (flipWinding) { list.Add(baseIndex + g.tris[i]); list.Add(baseIndex + g.tris[i + 2]); list.Add(baseIndex + g.tris[i + 1]); }
                                else { list.Add(baseIndex + g.tris[i]); list.Add(baseIndex + g.tris[i + 1]); list.Add(baseIndex + g.tris[i + 2]); }
                            }
                        }
                        else
                        {
                            var V = g.verts; var U = g.uvs;
                            for (int i = 0; i < g.tris.Length; i += 3)
                            {
                                int a = g.tris[i], b = g.tris[i + 1], c = g.tris[i + 2];
                                (clipInverse ? (ClipFn)Clipper.ClipTriangleInverse : Clipper.ClipTriangle)(V[a * 2], V[a * 2 + 1], V[b * 2], V[b * 2 + 1], V[c * 2], V[c * 2 + 1], U[a * 2], U[a * 2 + 1], U[b * 2], U[b * 2 + 1], U[c * 2], U[c * 2 + 1], clipParts,
                                    (x, y, u, v) =>
                                    {
                                        float pu, pv; AtlasUV.Map(reg, page, u, v, out pu, out pv);
                                        list.Add(verts.Count); verts.Add(ToLocal(x, y)); uvs.Add(new Vector2(pu, 1 - pv)); colors.Add(col); darks.Add(dark);
                                    });
                            }
                        }
                    }
                }
                if (clipEnd != null && clipEnd == slot.name) { clipParts = null; clipEnd = null; }
            }

            mesh.Clear();
            mesh.indexFormat = verts.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16;
            mesh.SetVertices(verts); mesh.SetUVs(0, uvs); mesh.SetUVs(1, darks); mesh.SetColors(colors);
            mesh.subMeshCount = sub + 1;
            for (int i = 0; i <= sub; i++) mesh.SetTriangles(submeshes[i], i, false);
            mesh.RecalculateBounds();
            meshRenderer.sharedMaterials = subMats.ToArray();
        }
    }
}
