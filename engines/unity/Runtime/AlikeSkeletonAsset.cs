// Alike runtime for Unity — asset holding exported skeleton data, atlas pages and event sounds.
using System.Collections.Generic;
using UnityEngine;

namespace Alike.Unity
{
    [CreateAssetMenu(menuName = "Alike/Skeleton Asset", fileName = "NewAlikeSkeleton")]
    public class AlikeSkeletonAsset : ScriptableObject
    {
        [Tooltip("Contents of the exported .alkb (binary) or .json file.")]
        public byte[] data;
        [Tooltip("Optional: assign the exported .json as a TextAsset instead of using the importer.")]
        public TextAsset jsonOrBytes;
        [Tooltip("Atlas pages in the same order as the export (name_1.png, name_2.png …).")]
        public Texture2D[] pages = new Texture2D[0];
        [Tooltip("Event sounds, matched by name to the event's audio.")]
        public AudioClip[] sounds = new AudioClip[0];
        [Tooltip("Alike pixels per Unity unit.")]
        public float pixelsPerUnit = 100;

        [System.NonSerialized] SkeletonData cached;

        public SkeletonData GetData()
        {
            if (cached != null) return cached;
            byte[] bytes = data != null && data.Length > 0 ? data : jsonOrBytes != null ? jsonOrBytes.bytes : null;
            if (bytes == null || bytes.Length == 0) { Debug.LogError("Alike: skeleton asset '" + name + "' has no data", this); return null; }
            try { cached = SkeletonData.Load(bytes); }
            catch (System.Exception e) { Debug.LogError("Alike: failed to read '" + name + "': " + e.Message, this); }
            return cached;
        }
        public void ClearCache() { cached = null; }

        public AudioClip FindSound(string audioName)
        {
            if (string.IsNullOrEmpty(audioName)) return null;
            foreach (var s in sounds) if (s != null && s.name == audioName) return s;
            return null;
        }
        public Texture2D Page(int i) { return pages != null && i >= 0 && i < pages.Length ? pages[i] : null; }
    }
}
