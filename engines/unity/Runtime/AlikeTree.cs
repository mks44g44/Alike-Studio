// Alike runtime for Unity — data tree readers (ALKB binary + JSON).
// Both produce: Dictionary<string, object>, List<object>, double, string, bool, null.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Alike
{
    public static class AlikeBinary
    {
        public static object Decode(byte[] u8)
        {
            if (u8.Length < 6 || u8[0] != 'A' || u8[1] != 'L' || u8[2] != 'K' || u8[3] != 'B') throw new Exception("Not an Alike binary (.alkb) file");
            int p = 4;
            int version = u8[p] | (u8[p + 1] << 8); p += 2;
            if (version != 1) throw new Exception("Unsupported ALKB version " + version);
            Func<long> varint = () => { long r = 0; int s = 0; byte b; do { b = u8[p++]; r |= (long)(b & 127) << s; s += 7; } while ((b & 128) != 0); return r; };
            int n = (int)varint();
            var strings = new string[n];
            for (int i = 0; i < n; i++) { int l = (int)varint(); strings[i] = Encoding.UTF8.GetString(u8, p, l); p += l; }
            Func<object> read = null;
            read = () =>
            {
                byte t = u8[p++];
                switch (t)
                {
                    case 0: return null;
                    case 1: return false;
                    case 2: return true;
                    case 3: { long z = varint(); return (double)((z & 1) != 0 ? -(z + 1) / 2 : z / 2); }
                    case 4: { float v = BitConverter.ToSingle(LE(u8, p, 4), 0); p += 4; return (double)v; }
                    case 9: { double v = BitConverter.ToDouble(LE(u8, p, 8), 0); p += 8; return v; }
                    case 5: return strings[(int)varint()];
                    case 6: { int c = (int)varint(); var a = new List<object>(c); for (int i = 0; i < c; i++) a.Add(read()); return a; }
                    case 7: { int c = (int)varint(); var o = new Dictionary<string, object>(c); for (int i = 0; i < c; i++) { string k = strings[(int)varint()]; o[k] = read(); } return o; }
                    case 8: { int c = (int)varint(); var a = new List<object>(c); for (int i = 0; i < c; i++) { a.Add((double)BitConverter.ToSingle(LE(u8, p, 4), 0)); p += 4; } return a; }
                    default: throw new Exception("Bad ALKB tag " + t);
                }
            };
            return read();
        }
        static byte[] LE(byte[] src, int p, int n)
        {
            var b = new byte[n]; Array.Copy(src, p, b, 0, n);
            if (!BitConverter.IsLittleEndian) Array.Reverse(b);
            return b;
        }
    }

    /// <summary>Small JSON reader (Unity's JsonUtility cannot read free-form trees).</summary>
    public static class AlikeJson
    {
        public static object Parse(string s) { int p = 0; var v = Value(s, ref p); return v; }
        static void Ws(string s, ref int p) { while (p < s.Length && char.IsWhiteSpace(s[p])) p++; }
        static object Value(string s, ref int p)
        {
            Ws(s, ref p);
            char c = s[p];
            if (c == '{')
            {
                p++; var o = new Dictionary<string, object>(); Ws(s, ref p);
                if (s[p] == '}') { p++; return o; }
                while (true) { Ws(s, ref p); string k = Str(s, ref p); Ws(s, ref p); p++; o[k] = Value(s, ref p); Ws(s, ref p); if (s[p] == ',') { p++; continue; } p++; return o; }
            }
            if (c == '[')
            {
                p++; var a = new List<object>(); Ws(s, ref p);
                if (s[p] == ']') { p++; return a; }
                while (true) { a.Add(Value(s, ref p)); Ws(s, ref p); if (s[p] == ',') { p++; continue; } p++; return a; }
            }
            if (c == '"') return Str(s, ref p);
            if (s.Substring(p).StartsWith("true")) { p += 4; return true; }
            if (s.Substring(p).StartsWith("false")) { p += 5; return false; }
            if (s.Substring(p).StartsWith("null")) { p += 4; return null; }
            int st = p; while (p < s.Length && "+-0123456789.eE".IndexOf(s[p]) >= 0) p++;
            return double.Parse(s.Substring(st, p - st), CultureInfo.InvariantCulture);
        }
        static string Str(string s, ref int p)
        {
            var sb = new StringBuilder(); p++;
            while (s[p] != '"')
            {
                char c = s[p++];
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[p++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break; case 't': sb.Append('\t'); break; case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break; case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(p, 4), 16)); p += 4; break;
                    default: sb.Append(e); break;
                }
            }
            p++; return sb.ToString();
        }
    }

    /// <summary>Typed access helpers for the data tree.</summary>
    public static class T
    {
        public static Dictionary<string, object> O(object o) { return o as Dictionary<string, object>; }
        public static List<object> L(object o) { return (o as List<object>) ?? new List<object>(); }
        public static object G(Dictionary<string, object> o, string k) { object v; return o != null && o.TryGetValue(k, out v) ? v : null; }
        public static float F(Dictionary<string, object> o, string k, float def = 0) { object v = G(o, k); if (v is double) return (float)(double)v; if (v is bool) return (bool)v ? 1 : 0; return def; }
        public static bool B(Dictionary<string, object> o, string k, bool def = false) { object v = G(o, k); if (v is bool) return (bool)v; if (v is double) return (double)v != 0; return def; }
        public static string S(Dictionary<string, object> o, string k, string def = null) { object v = G(o, k); return v as string ?? def; }
        public static float[] FA(object v) { var l = v as List<object>; if (l == null) return null; var a = new float[l.Count]; for (int i = 0; i < a.Length; i++) a[i] = l[i] is double ? (float)(double)l[i] : 0; return a; }
    }
}
