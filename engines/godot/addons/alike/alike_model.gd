## Alike runtime for Godot 4 — data helpers: loading, lookups, timeline sampling with bezier curves.
class_name AlikeModel
extends RefCounted

const DISCRETE_TYPES := ["drawOrder", "drawFolder", "event", "sequence"]

## Load .alkb bytes or JSON text into a prepared tree: { name, skeleton, atlas, audio, ... }.
static func load_bytes(bytes: PackedByteArray) -> Dictionary:
	var tree: Variant
	if bytes.size() > 4 and bytes[0] == 65 and bytes[1] == 76 and bytes[2] == 75 and bytes[3] == 66:
		tree = AlikeBinary.decode(bytes)
	else:
		tree = JSON.parse_string(bytes.get_string_from_utf8())
	if typeof(tree) != TYPE_DICTIONARY:
		push_error("Alike: could not read skeleton data")
		return {}
	return prepare(tree)

## Sort keys, flag discrete timelines and convert numeric arrays to packed arrays.
static func prepare(root: Dictionary) -> Dictionary:
	var sk: Dictionary = root.get("skeleton", root)
	if not root.has("skeleton"):
		root = {"skeleton": sk}
	for skin in sk.get("skins", []):
		var atts: Dictionary = skin.get("attachments", {})
		for slot_name in atts:
			for att_name in atts[slot_name]:
				var a: Dictionary = atts[slot_name][att_name]
				if a.has("uvs") and a["uvs"] != null: a["uvs"] = PackedFloat32Array(a["uvs"])
				if a.has("verts") and a["verts"] != null: a["verts"] = PackedFloat32Array(a["verts"])
				if a.has("triangles") and a["triangles"] != null:
					var t := PackedInt32Array()
					for v in a["triangles"]: t.append(int(round(v)))
					a["triangles"] = t
				if not a.has("name"): a["name"] = att_name
	for anim in sk.get("animations", []):
		for tl in anim.get("timelines", []):
			tl["keys"].sort_custom(func(x, y): return x["t"] < y["t"])
			var ty: String = tl.get("type", "")
			var pr: String = str(tl.get("prop", ""))
			tl["discrete"] = (ty == "slot" and pr == "attachment") or ty in DISCRETE_TYPES or (ty == "constraint" and pr == "bendPositive")
	return root

static func find(list: Array, n: Variant) -> Variant:
	for x in list:
		if x.get("name") == n: return x
	return null

static func get_attachment(sk: Dictionary, skin_name: String, slot: String, att: Variant) -> Variant:
	if att == null: return null
	for sn in [skin_name, "default"]:
		var skin = find(sk.get("skins", []), sn)
		if skin != null:
			var m: Dictionary = skin.get("attachments", {})
			if m.has(slot) and m[slot].has(att): return m[slot][att]
	return null

static func anim_duration(anim: Dictionary) -> float:
	var d: float = anim.get("duration", 0.0)
	for tl in anim.get("timelines", []):
		for k in tl["keys"]:
			if k["t"] > d: d = k["t"]
	return d

static func bezier_at(c: Array, x: float) -> float:
	var x1: float = c[0]; var y1: float = c[1]; var x2: float = c[2]; var y2: float = c[3]
	var s := x
	for i in 8:
		var bx := 3.0 * (1 - s) * (1 - s) * s * x1 + 3.0 * (1 - s) * s * s * x2 + s * s * s
		var e := bx - x
		if absf(e) < 1e-6:
			return 3.0 * (1 - s) * (1 - s) * s * y1 + 3.0 * (1 - s) * s * s * y2 + s * s * s
		var d := 3.0 * (1 - s) * (1 - s) * x1 + 6.0 * (1 - s) * s * (x2 - x1) + 3.0 * s * s * (1 - x2)
		if absf(d) < 1e-6: break
		s -= e / d
	var lo := 0.0
	var hi := 1.0
	s = x
	for i in 40:
		var v := 3.0 * (1 - s) * (1 - s) * s * x1 + 3.0 * (1 - s) * s * s * x2 + s * s * s
		if absf(v - x) < 1e-6: break
		if v < x: lo = s
		else: hi = s
		s = (lo + hi) / 2.0
	return 3.0 * (1 - s) * (1 - s) * s * y1 + 3.0 * (1 - s) * s * s * y2 + s * s * s

## Returns [key, next_key_or_null, eased_fraction].
static func segment(tl: Dictionary, t: float) -> Array:
	var ks: Array = tl["keys"]
	if t <= ks[0]["t"]: return [ks[0], null, 0.0]
	var last: Dictionary = ks[ks.size() - 1]
	if t >= last["t"]: return [last, null, 0.0]
	var lo := 0
	var hi := ks.size() - 1
	while hi - lo > 1:
		var mid := (lo + hi) >> 1
		if ks[mid]["t"] <= t: lo = mid
		else: hi = mid
	var k0: Dictionary = ks[lo]
	var k1: Dictionary = ks[hi]
	var c = k0.get("c", "l")
	if tl["discrete"] or (typeof(c) == TYPE_STRING and c == "s"): return [k0, null, 0.0]
	var span: float = k1["t"] - k0["t"]
	var f: float = (t - k0["t"]) / (span if span != 0 else 1.0)
	if typeof(c) == TYPE_ARRAY: f = bezier_at(c, f)
	return [k0, k1, f]

static func sample_num(tl: Dictionary, t: float) -> float:
	var s := segment(tl, t)
	var a: float = float(s[0]["v"]) if s[0]["v"] != null else 0.0
	if s[1] == null: return a
	var b: float = float(s[1]["v"]) if s[1]["v"] != null else a
	return a + (b - a) * s[2]

static func sample_arr(tl: Dictionary, t: float) -> Array:
	var s := segment(tl, t)
	var a = s[0]["v"]
	if a == null: return []
	if s[1] == null or s[1]["v"] == null: return Array(a).duplicate()
	var b: Array = s[1]["v"]
	var out := []
	out.resize(a.size())
	for i in a.size():
		var bv: float = b[i] if i < b.size() else a[i]
		out[i] = a[i] + (bv - a[i]) * s[2]
	return out
