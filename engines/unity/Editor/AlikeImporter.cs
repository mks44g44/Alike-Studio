// Alike runtime for Unity — editor importer for .alkb files and helpers for .json exports.
// Drop the unzipped export (name.alkb, name.png pages, audio/) into Assets. The importer creates an
// AlikeSkeletonAsset that links the atlas pages and sounds found next to the file.
using System.IO;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Alike.Unity.Editor
{
    [ScriptedImporter(1, "alkb")]
    public class AlikeImporter : ScriptedImporter
    {
        public float pixelsPerUnit = 100;

        public override void OnImportAsset(AssetImportContext ctx)
        {
            byte[] bytes = File.ReadAllBytes(ctx.assetPath);
            var asset = ScriptableObject.CreateInstance<AlikeSkeletonAsset>();
            asset.data = bytes;
            asset.pixelsPerUnit = pixelsPerUnit;
            AlikeAssetLinker.Link(asset, ctx.assetPath, ctx);
            ctx.AddObjectToAsset("skeleton", asset);
            ctx.SetMainObject(asset);
        }
    }

    public static class AlikeAssetLinker
    {
        /// <summary>Find atlas pages and audio clips next to the data file and assign them.</summary>
        public static void Link(AlikeSkeletonAsset asset, string assetPath, AssetImportContext ctx = null)
        {
            SkeletonData data;
            try { data = SkeletonData.Load(asset.data != null && asset.data.Length > 0 ? asset.data : asset.jsonOrBytes.bytes); }
            catch (System.Exception e) { Debug.LogError("Alike: " + e.Message); return; }
            string dir = Path.GetDirectoryName(assetPath).Replace('\\', '/');
            var pages = new Texture2D[data.pages.Count];
            for (int i = 0; i < pages.Length; i++)
            {
                string p = dir + "/" + data.pages[i].file;
                if (ctx != null) ctx.DependsOnArtifact(p);
                pages[i] = AssetDatabase.LoadAssetAtPath<Texture2D>(p);
                if (pages[i] == null) Debug.LogWarning("Alike: atlas page not found (import it next to the data file): " + p);
            }
            asset.pages = pages;
            var sounds = new System.Collections.Generic.List<AudioClip>();
            foreach (var kv in data.audioFiles)
            {
                string p = dir + "/" + kv.Value;
                var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(p);
                if (clip != null) sounds.Add(clip);
            }
            asset.sounds = sounds.ToArray();
        }

        [MenuItem("Assets/Alike/Create Skeleton Asset from JSON", true)]
        static bool CanCreateFromJson() { return Selection.activeObject is TextAsset && AssetDatabase.GetAssetPath(Selection.activeObject).EndsWith(".json"); }

        [MenuItem("Assets/Alike/Create Skeleton Asset from JSON")]
        static void CreateFromJson()
        {
            var text = (TextAsset)Selection.activeObject;
            string path = AssetDatabase.GetAssetPath(text);
            var asset = ScriptableObject.CreateInstance<AlikeSkeletonAsset>();
            asset.jsonOrBytes = text;
            Link(asset, path);
            string outPath = AssetDatabase.GenerateUniqueAssetPath(Path.ChangeExtension(path, null) + "_Skeleton.asset");
            AssetDatabase.CreateAsset(asset, outPath);
            AssetDatabase.SaveAssets();
            Selection.activeObject = asset;
        }

        [MenuItem("GameObject/Alike/Skeleton Animation", false, 10)]
        static void CreateSkeletonObject(MenuCommand cmd)
        {
            var go = new GameObject("Alike Skeleton");
            GameObjectUtility.SetParentAndAlign(go, cmd.context as GameObject);
            var anim = go.AddComponent<AlikeSkeletonAnimation>();
            if (Selection.activeObject is AlikeSkeletonAsset) anim.skeletonAsset = (AlikeSkeletonAsset)Selection.activeObject;
            Undo.RegisterCreatedObjectUndo(go, "Create Alike Skeleton");
            Selection.activeObject = go;
        }
    }

    /// <summary>Atlas pages: no mipmaps, clamp, keep alpha as exported.</summary>
    public class AlikeTexturePostprocessor : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            string dir = Path.GetDirectoryName(assetPath);
            if (!Directory.Exists(dir)) return;
            if (Directory.GetFiles(dir, "*.alkb").Length == 0 && Directory.GetFiles(dir, "*.json").Length == 0) return;
            var ti = (TextureImporter)assetImporter;
            ti.textureType = TextureImporterType.Default;
            ti.mipmapEnabled = false;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.alphaIsTransparency = false;
            ti.npotScale = TextureImporterNPOTScale.None;
        }
    }
}
