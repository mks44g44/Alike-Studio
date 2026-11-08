## Alike runtime for Godot 4 — pose solver (port of js/pose.js): world transforms, IK, transform,
## path, physics and slider constraints, animation sampling and attachment geometry.
## Coordinates are Alike's (y up); AlikeSkeleton2D flips y when drawing.
class_name AlikePose
extends RefCounted

const DEG := PI / 180.0
const RAD := 180.0 / PI
const FIELD := {"rotate": "rot", "x": "x", "y": "y", "scaleX": "sx", "scaleY": "sy", "shearX": "shx", "shearY": "shy"}
const SETUP := {"rotate": "rotation", "x": "x", "y": "y", "scaleX": "scaleX", "scaleY": "scaleY", "shearX": "shearX", "shearY": "shearY"}

class Bone:
	var data: Dictionary
	var name: String
	var parent: Bone = null
	var children: Array = []
	var active := true
	var x := 0.0; var y := 0.0; var rot := 0.0; var sx := 1.0; var sy := 1.0; var shx := 0.0; var shy := 0.0
	var ax := 0.0; var ay := 0.0; var arot := 0.0; var asx := 1.0; var asy := 1.0; var ashx := 0.0; var ashy := 0.0
	var a := 1.0; var b := 0.0; var c := 0.0; var d := 1.0; var wx := 0.0; var wy := 0.0
	var qa := 1.0; var qb := 0.0; var qc := 0.0; var qd := 1.0

	func get_field(f: String) -> float:
		match f:
			"rot": return rot
			"x": return x
			"y": return y
			"sx": return sx
			"sy": return sy
			"shx": return shx
			"shy": return shy
		return 0.0

	func set_field(f: String, v: float) -> void:
		match f:
			"rot": rot = v
			"x": x = v
			"y": y = v
			"sx": sx = v
			"sy": sy = v
			"shx": shx = v
			"shy": shy = v

class Slot:
	var data: Dictionary
	var name: String
	var bone: Bone
	var color: Array = [1.0, 1.0, 1.0, 1.0]
	var dark = null
	var attachment = null
	var deform: Dictionary = {}
	var seq: Dictionary = {}

var sk: Dictionary
var skin_name := "default"
var bones: Array = []
var bone_map: Dictionary = {}
var slots: Array = []
var slot_map: Dictionary = {}
var draw_order: Array = []
var cons: Array = []          # Dictionaries: data fields copied + "_data", "_active"
var con_map: Dictionary = {}

func _init(skeleton: Dictionary, skin := "default") -> void:
	sk = skeleton
	skin_name = skin if skin != "" else "default"
	build()

func build() -> void:
	var skin = AlikeModel.find(sk.get("skins", []), skin_name)
	var skin_bones: Array = skin.get("bones", []) if skin != null else []
	var skin_cons: Array = skin.get("constraints", []) if skin != null else []
	bones.clear(); bone_map.clear()
	for d in sk.get("bones", []):
		var b := Bone.new()
		b.data = d; b.name = d["name"]
		b.active = not d.get("skinRequired", false) or skin_bones.has(d["name"])
		bones.append(b); bone_map[b.name] = b
	for b in bones:
		var pn = b.data.get("parent")
		if pn != null and bone_map.has(pn):
			b.parent = bone_map[pn]; b.parent.children.append(b)
			if not b.parent.active: b.active = false
	slots.clear(); slot_map.clear()
	for d in sk.get("slots", []):
		if not bone_map.has(d["bone"]): continue
		var s := Slot.new()
		s.data = d; s.name = d["name"]; s.bone = bone_map[d["bone"]]
		slots.append(s); slot_map[s.name] = s
	cons.clear(); con_map.clear()
	for d in sk.get("constraints", []):
		var c := {"_data": d}
		c["_active"] = d.get("enabled", true) and (not d.get("skinRequired", false) or skin_cons.has(d["name"]))
		cons.append(c); con_map[d["name"]] = c
	set_to_setup()

func set_to_setup() -> void:
	for b in bones:
		var d: Dictionary = b.data
		b.x = d.get("x", 0.0); b.y = d.get("y", 0.0); b.rot = d.get("rotation", 0.0)
		b.sx = d.get("scaleX", 1.0); b.sy = d.get("scaleY", 1.0); b.shx = d.get("shearX", 0.0); b.shy = d.get("shearY", 0.0)
	for s in slots:
		s.color = Array(s.data.get("color", [1, 1, 1, 1])).duplicate()
		var dk = s.data.get("dark")
		s.dark = Array(dk).duplicate() if dk != null else null
		s.attachment = s.data.get("attachment")
		s.deform = {}; s.seq = {}
	draw_order = slots.duplicate()
	for c in cons:
		var d: Dictionary = c["_data"]
		for k in d:
			var v = d[k]
			if typeof(v) == TYPE_FLOAT or typeof(v) == TYPE_INT or typeof(v) == TYPE_BOOL: c[k] = v

func attachment_of(s: Slot) -> Variant:
	return AlikeModel.get_attachment(sk, skin_name, s.name, s.attachment)

static func _setup_value(d: Dictionary, prop: String) -> float:
	return float(d.get(SETUP.get(prop, prop), 1.0 if prop.begins_with("scale") else 0.0))

static func _value_from_key(d: Dictionary, prop: String, key: float) -> float:
	if prop == "scaleX" or prop == "scaleY": return _setup_value(d, prop) * key
	return _setup_value(d, prop) + key

# ---------- animation ----------
func apply_animation(anim: Dictionary, t: float, alpha := 1.0, additive := false, apply_draw_order := true) -> void:
	if anim.is_empty(): return
	var folders := []
	for tl in anim.get("timelines", []):
		var keys: Array = tl["keys"]
		if keys.is_empty(): continue
		var target = tl.get("target")
		match tl["type"]:
			"drawFolder":
				folders.append(tl) # applied after the main draw order
			"bone":
				if not bone_map.has(target): continue
				var b: Bone = bone_map[target]
				var prop: String = tl["prop"]
				var f: String = FIELD[prop]
				var kv := AlikeModel.sample_num(tl, t)
				var val := _value_from_key(b.data, prop, kv)
				var cur := b.get_field(f)
				if additive:
					if prop == "scaleX" or prop == "scaleY": b.set_field(f, cur * (1.0 + (kv - 1.0) * alpha))
					else: b.set_field(f, cur + (val - _setup_value(b.data, prop)) * alpha)
				else:
					b.set_field(f, cur + (val - cur) * alpha)
			"slot":
				if not slot_map.has(target): continue
				var s: Slot = slot_map[target]
				match tl["prop"]:
					"attachment":
						if alpha >= 0.5: s.attachment = AlikeModel.segment(tl, t)[0]["v"]
					"color":
						var v := AlikeModel.sample_arr(tl, t)
						for i in mini(4, v.size()): s.color[i] += (v[i] - s.color[i]) * alpha
					"dark":
						var v := AlikeModel.sample_arr(tl, t)
						if s.dark == null: s.dark = [0.0, 0.0, 0.0]
						for i in mini(3, v.size()): s.dark[i] += (v[i] - s.dark[i]) * alpha
			"deform":
				if not slot_map.has(target): continue
				var s: Slot = slot_map[target]
				var v := AlikeModel.sample_arr(tl, t)
				if v.is_empty(): continue
				var an: String = tl["attachment"]
				if s.deform.has(an) and alpha < 1.0:
					var cur: Array = s.deform[an]
					var o := []
					o.resize(cur.size())
					for i in cur.size(): o[i] = cur[i] + ((v[i] if i < v.size() else 0.0) - cur[i]) * alpha
					s.deform[an] = o
				else:
					if alpha < 1.0:
						for i in v.size(): v[i] *= alpha
					s.deform[an] = v
			"drawOrder":
				if alpha < 0.5 or not apply_draw_order: continue
				var v = AlikeModel.segment(tl, t)[0]["v"]
				if v == null: continue
				var used := {}
				var order := []
				for n in v:
					if slot_map.has(n) and not used.has(n):
						order.append(slot_map[n]); used[n] = true
				for s in slots:
					if not used.has(s.name): order.append(s)
				draw_order = order
			"constraint":
				if not con_map.has(target): continue
				var c: Dictionary = con_map[target]
				var prop: String = tl["prop"]
				var first = keys[0]["v"]
				if typeof(first) == TYPE_BOOL:
					if alpha >= 0.5: c[prop] = AlikeModel.segment(tl, t)[0]["v"]
				else:
					var v := AlikeModel.sample_num(tl, t)
					var cur: float = c.get(prop, 0.0)
					c[prop] = cur + (v - cur) * alpha
			"sequence":
				if not slot_map.has(target): continue
				var s: Slot = slot_map[target]
				var k = null
				for kk in keys:
					if kk["t"] <= t + 1e-6: k = kk
				if k == null: continue
				var att = AlikeModel.get_attachment(sk, skin_name, target, tl.get("attachment"))
				var count: int = int(att["sequence"]["count"]) if att != null and att.get("sequence") != null else 1
				var v: Dictionary = k["v"]
				var delay: float = v.get("delay", 1.0 / 15.0)
				if delay <= 0: delay = 1.0 / 15.0
				var fr := int(floor((t - k["t"]) / delay + 1e-6))
				var idx := int(v.get("index", 0))
				match v.get("mode", "loop"):
					"once": idx = mini(count - 1, idx + fr)
					"loop": idx = (idx + fr) % count
					"pingpong":
						var n2 := maxi(1, count * 2 - 2)
						var p := (idx + fr) % n2
						idx = p if p < count else n2 - p
					"reverse": idx = posmod(idx - fr, count)
				s.seq[tl["attachment"]] = idx
	for tl in folders: _apply_draw_folder(tl, t, alpha, apply_draw_order)

## A draw order folder key reorders only that folder's slots, inside the places they currently hold.
func _apply_draw_folder(tl: Dictionary, t: float, alpha: float, apply_draw_order: bool) -> void:
	if alpha < 0.5 or not apply_draw_order: return
	var v = AlikeModel.segment(tl, t)[0]["v"]
	if v == null: return
	var folder = tl.get("target")
	var pos := []
	for i in draw_order.size():
		if draw_order[i].data.get("folder") == folder: pos.append(i)
	if pos.is_empty(): return
	var used := {}
	var order := []
	for n in v:
		if slot_map.has(n) and slot_map[n].data.get("folder") == folder and not used.has(n):
			order.append(slot_map[n]); used[n] = true
	for s in slots:
		if s.data.get("folder") == folder and not used.has(s.name): order.append(s)
	var d_o := draw_order.duplicate()
	for i in pos.size(): d_o[pos[i]] = order[i]
	draw_order = d_o

func collect_events(anim: Dictionary, from: float, to: float, out: Array) -> void:
	for tl in anim.get("timelines", []):
		if tl["type"] != "event": continue
		for k in tl["keys"]:
			if k["t"] > from and k["t"] <= to:
				var e: Dictionary = k["v"].duplicate()
				e["time"] = k["t"]
				out.append(e)

# ---------- world transforms ----------
func _inherit_q(p: Bone, d: Dictionary) -> Array:
	var a := p.a; var b := p.b; var c := p.c; var dd := p.d
	var det := a * dd - b * c
	var ir: bool = d.get("inheritRotation", true)
	var isc: bool = d.get("inheritScale", true)
	var irf: bool = d.get("inheritReflection", true)
	if ir and isc:
		if not irf and det < 0:
			b = -b; dd = -dd
		return [a, b, c, dd]
	if not ir and not isc: return [1.0, 0.0, 0.0, 1.0]
	if ir:
		var r := atan2(c, a)
		var cs := cos(r)
		var sn := sin(r)
		if det < 0 and irf: return [cs, sn, sn, -cs]
		return [cs, -sn, sn, cs]
	var sxx := sqrt(a * a + c * c)
	if sxx == 0: sxx = 1.0
	var syy := det / sxx
	if not irf: syy = absf(syy)
	return [sxx, 0.0, 0.0, syy]

func compute_world(b: Bone) -> void:
	var rx := (b.arot + b.ashx) * DEG
	var ry := (b.arot + 90.0 + b.ashy) * DEG
	var la := cos(rx) * b.asx; var lb := cos(ry) * b.asy; var lc := sin(rx) * b.asx; var ld := sin(ry) * b.asy
	var p := b.parent
	if p == null:
		b.a = la; b.b = lb; b.c = lc; b.d = ld; b.wx = b.ax; b.wy = b.ay
		b.qa = 1; b.qb = 0; b.qc = 0; b.qd = 1
		return
	b.wx = p.a * b.ax + p.b * b.ay + p.wx
	b.wy = p.c * b.ax + p.d * b.ay + p.wy
	var q := _inherit_q(p, b.data)
	b.qa = q[0]; b.qb = q[1]; b.qc = q[2]; b.qd = q[3]
	b.a = b.qa * la + b.qb * lc; b.b = b.qa * lb + b.qb * ld
	b.c = b.qc * la + b.qd * lc; b.d = b.qc * lb + b.qd * ld

func update_subtree(b: Bone) -> void:
	compute_world(b)
	for c in b.children: update_subtree(c)

func parent_sign(b: Bone) -> float: return -1.0 if b.qa * b.qd - b.qb * b.qc < 0 else 1.0
func world_rot(b: Bone) -> float: return atan2(b.c, b.a) * RAD
func world_scale_x(b: Bone) -> float: return sqrt(b.a * b.a + b.c * b.c)
func world_scale_y(b: Bone) -> float: return sqrt(b.b * b.b + b.d * b.d)

func set_world_pos(b: Bone, x: float, y: float) -> void:
	if b.parent == null:
		b.ax = x; b.ay = y
		return
	var l := _inv_apply(b.parent.a, b.parent.b, b.parent.c, b.parent.d, b.parent.wx, b.parent.wy, x, y)
	b.ax = l.x; b.ay = l.y

func rotate_world(b: Bone, deg: float) -> void: b.arot += deg * parent_sign(b)
func world_to_local(b: Bone, x: float, y: float) -> Vector2: return _inv_apply(b.a, b.b, b.c, b.d, b.wx, b.wy, x, y)
func local_to_world(b: Bone, x: float, y: float) -> Vector2: return Vector2(b.a * x + b.b * y + b.wx, b.c * x + b.d * y + b.wy)

static func _inv_apply(a: float, b: float, c: float, d: float, tx: float, ty: float, x: float, y: float) -> Vector2:
	var det := a * d - b * c
	if det == 0: det = 1e-9
	var k := 1.0 / det
	var ia := d * k; var ib := -b * k; var ic := -c * k; var id := a * k
	return Vector2(ia * x + ib * y - (ia * tx + ib * ty), ic * x + id * y - (ic * tx + id * ty))

static func _wrap(d: float) -> float: return fposmod(d + 180.0, 360.0) - 180.0

func update(dt := 0.0, phys = null) -> void:
	for c in cons:
		if c["_data"]["type"] != "slider" or not c["_active"]: continue
		var anim = AlikeModel.find(sk.get("animations", []), c["_data"].get("animation"))
		if anim == null: continue
		var t: float = c.get("time", 0.0)
		var bn = c["_data"].get("bone")
		if bn != null and bone_map.has(bn):
			t = bone_map[bn].get_field(FIELD.get(c["_data"].get("property", "x"), "x")) * c.get("scale", 0.01) + c.get("offset", 0.0)
		var dur := AlikeModel.anim_duration(anim)
		if c.get("loop", false) and dur > 0: t = fposmod(t, dur)
		else: t = clampf(t, 0.0, dur)
		apply_animation(anim, t, clampf(c.get("mix", 1.0), 0.0, 1.0), c.get("additive", false))
	for b in bones:
		b.ax = b.x; b.ay = b.y; b.arot = b.rot; b.asx = b.sx; b.asy = b.sy; b.ashx = b.shx; b.ashy = b.shy
		compute_world(b)
	for c in cons:
		if not c["_active"]: continue
		match c["_data"]["type"]:
			"ik": _apply_ik(c)
			"transform": _apply_transform(c)
			"path": _apply_path(c)
			"physics": _apply_physics(c, dt, phys)

# ---------- IK ----------
func _apply_ik(c: Dictionary) -> void:
	var d: Dictionary = c["_data"]
	var tn = d.get("target")
	var names: Array = d.get("bones", [])
	if tn == null or not bone_map.has(tn) or names.is_empty(): return
	var tgt: Bone = bone_map[tn]
	var mix := clampf(c.get("mix", 1.0), 0.0, 1.0)
	var stretch: bool = c.get("stretch", false)
	if mix <= 0 and not stretch: return
	var tx := tgt.wx
	var ty := tgt.wy
	if names.size() == 1:
		if not bone_map.has(names[0]): return
		var b: Bone = bone_map[names[0]]
		var want := atan2(ty - b.wy, tx - b.wx) * RAD
		rotate_world(b, _wrap(want - world_rot(b)) * mix)
		var len: float = float(b.data.get("length", 0.0)) * world_scale_x(b)
		if len > 0.0001:
			var dist := Vector2(tx - b.wx, ty - b.wy).length()
			if (stretch and dist > len) or (c.get("compress", false) and dist < len):
				var s := 1.0 + (dist / len - 1.0) * mix
				b.asx *= s
				if c.get("uniform", false): b.asy *= s
				elif c.get("volume", false): b.asy /= s
		update_subtree(b)
		return
	if not bone_map.has(names[0]) or not bone_map.has(names[1]): return
	var p: Bone = bone_map[names[0]]
	var ch: Bone = bone_map[names[1]]
	var ox := p.wx
	var oy := p.wy
	var l1 := Vector2(ch.wx - ox, ch.wy - oy).length()
	var l2: float = float(ch.data.get("length", 0.0)) * world_scale_x(ch)
	var dx := tx - ox
	var dy := ty - oy
	var dist := Vector2(dx, dy).length()
	if dist == 0: dist = 1e-6
	var reach := l1 + l2
	var stretch_k := 1.0
	if stretch and dist > reach and reach > 0: stretch_k = 1.0 + (dist / reach - 1.0) * mix
	var dd := dist
	var soft: float = c.get("softness", 0.0)
	if soft > 0 and reach > 0:
		var start := reach * stretch_k - soft
		if dd > start: dd = start + soft * (1.0 - exp(-(dd - start) / soft))
	var L1 := l1 * stretch_k
	var L2 := l2 * stretch_k
	dd = clampf(dd, absf(L1 - L2) + 1e-4, L1 + L2 - 1e-6)
	var bse := atan2(dy, dx)
	var den := 2.0 * L1 * dd
	if den == 0: den = 1e-6
	var alpha := acos(clampf((L1 * L1 + dd * dd - L2 * L2) / den, -1.0, 1.0))
	var a1 := bse + alpha * (1.0 if c.get("bendPositive", true) else -1.0)
	var phi := atan2(ch.wy - oy, ch.wx - ox) - atan2(p.c, p.a)
	var want1 := (a1 - phi) * RAD
	rotate_world(p, _wrap(want1 - world_rot(p)) * mix)
	if stretch_k != 1.0:
		p.asx *= stretch_k
		if c.get("uniform", false): p.asy *= stretch_k
		elif c.get("volume", false): p.asy /= stretch_k
	update_subtree(p)
	var ex := ox + cos(bse) * dd
	var ey := oy + sin(bse) * dd
	var want2 := atan2(ey - ch.wy, ex - ch.wx) * RAD
	rotate_world(ch, _wrap(want2 - world_rot(ch)) * mix)
	if stretch_k != 1.0:
		var cur_len: float = float(ch.data.get("length", 0.0)) * world_scale_x(ch)
		if cur_len > 1e-6:
			var k2 := L2 / cur_len
			ch.asx *= k2
			if c.get("uniform", false): ch.asy *= k2
			elif c.get("volume", false): ch.asy /= k2
	update_subtree(ch)

# ---------- Transform ----------
static func _shear_of(x: Bone) -> float: return _wrap((atan2(x.d, x.b) - atan2(x.c, x.a)) * RAD - 90.0)

const _AF := {"rotate": "arot", "x": "ax", "y": "ay", "scaleX": "asx", "scaleY": "asy", "shearY": "ashy"}
const _MIX := {"rotate": "mixRotate", "x": "mixX", "y": "mixY", "scaleX": "mixScaleX", "scaleY": "mixScaleY", "shearY": "mixShearY"}

func _prop_value(b: Bone, prop: String, world: bool) -> float:
	if world:
		match prop:
			"rotate": return world_rot(b)
			"x": return b.wx
			"y": return b.wy
			"scaleX": return world_scale_x(b)
			"scaleY": return world_scale_y(b)
			"shearY": return _shear_of(b)
		return 0.0
	return b.get(_AF.get(prop, "arot"))

func _apply_mappings(c: Dictionary, t: Bone) -> void:
	var d: Dictionary = c["_data"]
	var src_world: bool = d.get("sourceSpace", "local") == "world"
	var rel: bool = c.get("relative", false)
	for bn in d.get("bones", []):
		if not bone_map.has(bn): continue
		var b: Bone = bone_map[bn]
		if b == t: continue
		for m in d["mappings"]:
			var to: String = m.get("to", "rotate")
			var mix: float = c.get(_MIX[to], 1.0)
			if mix == 0: continue
			var v: float = (_prop_value(t, m.get("from", "rotate"), src_world) - float(m.get("fromOffset", 0.0))) * float(m.get("scale", 1.0)) + float(m.get("toOffset", 0.0))
			if m.get("clamp", false):
				if m.get("min") != null: v = maxf(v, m["min"])
				if m.get("max") != null: v = minf(v, m["max"])
			var f: String = _AF[to]
			var cur: float = b.get(f)
			b.set(f, cur + v * mix if rel else cur + (v - cur) * mix)
		update_subtree(b)

func _apply_transform(c: Dictionary) -> void:
	var d: Dictionary = c["_data"]
	var tn = d.get("target")
	if tn == null or not bone_map.has(tn): return
	var t: Bone = bone_map[tn]
	if not d.get("mappings", []).is_empty():
		_apply_mappings(c, t)
		return
	var rel: bool = c.get("relative", false)
	var mR: float = c.get("mixRotate", 0.0); var mX: float = c.get("mixX", 0.0); var mY: float = c.get("mixY", 0.0)
	var mSX: float = c.get("mixScaleX", 0.0); var mSY: float = c.get("mixScaleY", 0.0); var mSh: float = c.get("mixShearY", 0.0)
	var oR: float = c.get("offRotate", 0.0); var oX: float = c.get("offX", 0.0); var oY: float = c.get("offY", 0.0)
	var oSX: float = c.get("offScaleX", 0.0); var oSY: float = c.get("offScaleY", 0.0); var oSh: float = c.get("offShearY", 0.0)
	for bn in d.get("bones", []):
		if not bone_map.has(bn): continue
		var b: Bone = bone_map[bn]
		if b == t: continue
		if c.get("local", false):
			if mR != 0: b.arot += ((t.arot + oR) if rel else (t.arot + oR - b.arot)) * mR
			if mX != 0: b.ax += ((t.ax + oX) if rel else (t.ax + oX - b.ax)) * mX
			if mY != 0: b.ay += ((t.ay + oY) if rel else (t.ay + oY - b.ay)) * mY
			if mSX != 0: b.asx *= (1.0 + (t.asx - 1.0 + oSX) * mSX) if rel else (1.0 + ((t.asx + oSX) / (b.asx if b.asx != 0 else 1e-6) - 1.0) * mSX)
			if mSY != 0: b.asy *= (1.0 + (t.asy - 1.0 + oSY) * mSY) if rel else (1.0 + ((t.asy + oSY) / (b.asy if b.asy != 0 else 1e-6) - 1.0) * mSY)
			if mSh != 0: b.ashy += ((t.ashy + oSh) if rel else (t.ashy + oSh - b.ashy)) * mSh
			update_subtree(b)
			continue
		if mR != 0:
			var tr := world_rot(t) + oR
			var dr := tr if rel else _wrap(tr - world_rot(b))
			rotate_world(b, dr * mR); compute_world(b)
		if mX != 0 or mY != 0:
			var pw := local_to_world(t, oX, oY)
			var nx: float
			var ny: float
			if rel:
				var tp := t.parent
				var vx: float = (tp.a * t.ax + tp.b * t.ay) if tp != null else t.ax
				var vy: float = (tp.c * t.ax + tp.d * t.ay) if tp != null else t.ay
				nx = b.wx + (vx + pw.x - t.wx) * mX; ny = b.wy + (vy + pw.y - t.wy) * mY
			else:
				nx = b.wx + (pw.x - b.wx) * mX; ny = b.wy + (pw.y - b.wy) * mY
			set_world_pos(b, nx, ny); compute_world(b)
		if mSX != 0:
			var bs := world_scale_x(b)
			if bs == 0: bs = 1e-6
			var ts := world_scale_x(t) * (1.0 + oSX)
			var want := bs * ts if rel else ts
			b.asx *= 1.0 + (want / bs - 1.0) * mSX
		if mSY != 0:
			var bs := world_scale_y(b)
			if bs == 0: bs = 1e-6
			var ts := world_scale_y(t) * (1.0 + oSY)
			var want := bs * ts if rel else ts
			b.asy *= 1.0 + (want / bs - 1.0) * mSY
		if mSh != 0:
			var want := (_shear_of(t) + oSh) if rel else (_shear_of(t) + oSh - _shear_of(b))
			b.ashy += want * mSh
		update_subtree(b)

# ---------- Path ----------
func path_world(slot: Slot, att: Dictionary) -> Array:
	var b := slot.bone
	var out := []
	for p in att.get("points", []):
		out.append({
			"x": b.a * p["x"] + b.b * p["y"] + b.wx, "y": b.c * p["x"] + b.d * p["y"] + b.wy,
			"ix": b.a * p["ix"] + b.b * p["iy"] + b.wx, "iy": b.c * p["ix"] + b.d * p["iy"] + b.wy,
			"ox": b.a * p["ox"] + b.b * p["oy"] + b.wx, "oy": b.c * p["ox"] + b.d * p["oy"] + b.wy })
	return out

static func _cubic(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
	var u := 1.0 - t
	return u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3
static func _cubic_d(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
	var u := 1.0 - t
	return 3.0 * u * u * (p1 - p0) + 6.0 * u * t * (p2 - p1) + 3.0 * t * t * (p3 - p2)

class PathSampler:
	var segs: Array = []
	var table: Array = []
	var total := 0.0
	var closed := false
	var constant := true

	func _init(pts: Array, is_closed: bool, const_speed: bool) -> void:
		closed = is_closed; constant = const_speed
		var n := pts.size()
		var count := n if closed else n - 1
		for i in count:
			var a: Dictionary = pts[i]
			var b: Dictionary = pts[(i + 1) % n]
			segs.append([a["x"], a["y"], a["ox"], a["oy"], b["ix"], b["iy"], b["x"], b["y"]])
		var SUB := 24
		for si in segs.size():
			var s: Array = segs[si]
			var px: float = s[0]
			var py: float = s[1]
			for k in range(1, SUB + 1):
				var u := float(k) / SUB
				var x := AlikePose._cubic(s[0], s[2], s[4], s[6], u)
				var y := AlikePose._cubic(s[1], s[3], s[5], s[7], u)
				total += Vector2(x - px, y - py).length()
				table.append([si, u, total]); px = x; py = y

	func at(si: int, u: float) -> Array:
		var s: Array = segs[si]
		var x := AlikePose._cubic(s[0], s[2], s[4], s[6], u)
		var y := AlikePose._cubic(s[1], s[3], s[5], s[7], u)
		var dx := AlikePose._cubic_d(s[0], s[2], s[4], s[6], u)
		var dy := AlikePose._cubic_d(s[1], s[3], s[5], s[7], u)
		if absf(dx) + absf(dy) < 1e-6:
			dx = s[6] - s[0]; dy = s[7] - s[1]
		return [x, y, atan2(dy, dx) * AlikePose.RAD]

	func get_at(dist: float) -> Array:
		if closed: dist = fposmod(dist, total)
		if not constant:
			var f := clampf(dist / (total if total != 0 else 1.0), 0.0, 1.0) * segs.size()
			var si := mini(segs.size() - 1, int(floor(f)))
			return at(si, f - si)
		if dist <= 0:
			var r := at(0, 0.0)
			if dist < 0:
				var a: float = r[2] * AlikePose.DEG
				r[0] += cos(a) * dist; r[1] += sin(a) * dist
			return r
		if dist >= total:
			var r := at(segs.size() - 1, 1.0)
			var a: float = r[2] * AlikePose.DEG
			var e := dist - total
			r[0] += cos(a) * e; r[1] += sin(a) * e
			return r
		var lo := 0
		var hi := table.size() - 1
		while hi - lo > 1:
			var m := (lo + hi) >> 1
			if table[m][2] < dist: lo = m
			else: hi = m
		var e1: Array
		var e2: Array
		if dist <= table[0][2]:
			e1 = [0, 0.0, 0.0]; e2 = table[0]
		else:
			e1 = table[lo]; e2 = table[hi]
		var span: float = e2[2] - e1[2]
		var ff: float = (dist - e1[2]) / (span if span != 0 else 1.0)
		if int(e1[0]) != int(e2[0]): return at(int(e2[0]), e2[1] * ff)
		return at(int(e1[0]), e1[1] + (e2[1] - e1[1]) * ff)

func _apply_path(c: Dictionary) -> void:
	var d: Dictionary = c["_data"]
	var tn = d.get("target")
	if tn == null or not slot_map.has(tn): return
	var slot: Slot = slot_map[tn]
	var att = attachment_of(slot)
	if att == null or att.get("type") != "path" or att.get("points", []).size() < 2: return
	var S := PathSampler.new(path_world(slot, att), att.get("closed", false), att.get("constantSpeed", true))
	var bl := []
	for n in d.get("bones", []):
		if bone_map.has(n): bl.append(bone_map[n])
	if bl.is_empty(): return
	var position: float = c.get("position", 0.0)
	var spacing: float = c.get("spacing", 0.0)
	var mR: float = c.get("mixRotate", 1.0); var mX: float = c.get("mixX", 1.0); var mY: float = c.get("mixY", 1.0)
	var offR: float = c.get("offRotate", 0.0)
	var dist := position * S.total if d.get("positionMode", "percent") == "percent" else position
	var pos := []
	for b in bl:
		pos.append(dist)
		var sp: float
		match d.get("spacingMode", "length"):
			"fixed": sp = spacing
			"percent": sp = spacing * S.total
			"proportional": sp = (S.total / bl.size()) * (1.0 + spacing)
			_: sp = float(b.data.get("length", 0.0)) * world_scale_x(b) + spacing
		dist += sp
	pos.append(dist)
	var rmode: String = d.get("rotateMode", "tangent")
	for i in bl.size():
		var b: Bone = bl[i]
		var P := S.get_at(pos[i])
		set_world_pos(b, b.wx + (P[0] - b.wx) * mX, b.wy + (P[1] - b.wy) * mY)
		compute_world(b)
		if mR != 0:
			var ang: float = P[2]
			if rmode != "tangent":
				var N := S.get_at(pos[i + 1])
				ang = atan2(N[1] - b.wy, N[0] - b.wx) * RAD
				if rmode == "chainScale":
					var len: float = float(b.data.get("length", 0.0)) * world_scale_x(b)
					if len > 1e-4: b.asx *= 1.0 + (Vector2(N[0] - b.wx, N[1] - b.wy).length() / len - 1.0) * mR
			rotate_world(b, _wrap(ang + offR - world_rot(b)) * mR)
		update_subtree(b)

# ---------- Physics ----------
func _apply_physics(c: Dictionary, dt: float, store) -> void:
	var d: Dictionary = c["_data"]
	var bn = d.get("bone")
	if store == null or bn == null or not bone_map.has(bn): return
	var b: Bone = bone_map[bn]
	var name: String = d["name"]
	if not store.has(name):
		store[name] = {"px": b.wx, "py": b.wy, "pv": false, "pvx": 0.0, "pvy": 0.0, "ox": 0.0, "oy": 0.0, "vx": 0.0, "vy": 0.0, "r": 0.0, "rv": 0.0, "s": 0.0, "sv": 0.0, "acc": 0.0}
	var st: Dictionary = store[name]
	var len := maxf(1.0, float(b.data.get("length", 0.0)) * world_scale_x(b))
	var sxw := world_scale_x(b)
	if sxw == 0: sxw = 1.0
	var ux := b.a / sxw
	var uy := b.c / sxw
	var cx: bool = c.get("x", false); var cy: bool = c.get("y", false); var cr: bool = c.get("rotate", false)
	var csx: bool = c.get("scaleX", false); var csh: bool = c.get("shearX", false)
	if dt > 0:
		var vx: float = (b.wx - st["px"]) / dt
		var vy: float = (b.wy - st["py"]) / dt
		st["px"] = b.wx; st["py"] = b.wy
		var vl := Vector2(vx, vy).length()
		var limit: float = c.get("limit", 5000.0)
		if vl > limit:
			vx *= limit / vl; vy *= limit / vl
		var axl := 0.0
		var ayl := 0.0
		if st["pv"]:
			axl = (vx - st["pvx"]) / dt; ayl = (vy - st["pvy"]) / dt
		st["pvx"] = vx; st["pvy"] = vy; st["pv"] = true
		var h := 1.0 / maxf(1.0, c.get("step", 60.0))
		st["acc"] += minf(dt, 0.25)
		var m := maxf(0.01, c.get("mass", 1.0))
		var k := maxf(0.0, c.get("strength", 100.0))
		var damp: float = c.get("damping", 0.4) * 2.0 * sqrt(k * m)
		var inr: float = c.get("inertia", 0.5)
		var gx: float = c.get("wind", 0.0) + float(sk.get("wind", 0.0))
		var gy: float = -(c.get("gravity", 0.0) + float(sk.get("gravity", 0.0)))
		while st["acc"] >= h:
			st["acc"] -= h
			if cx:
				st["vx"] += ((-k * st["ox"] - damp * st["vx"]) / m - axl * inr + gx) * h
				st["ox"] += st["vx"] * h
			if cy:
				st["vy"] += ((-k * st["oy"] - damp * st["vy"]) / m - ayl * inr + gy) * h
				st["oy"] += st["vy"] * h
			if cr or csh:
				var co := cos(st["r"])
				var si := sin(st["r"])
				var rx := ux * co - uy * si
				var ry := ux * si + uy * co
				var torque := ((rx * gy - ry * gx) - (rx * ayl - ry * axl) * inr) / len
				st["rv"] += ((-k * st["r"] - damp * st["rv"]) / m + torque) * h
				st["r"] += st["rv"] * h
				if st["r"] > 3.0:
					st["r"] = 3.0; st["rv"] = 0.0
				elif st["r"] < -3.0:
					st["r"] = -3.0; st["rv"] = 0.0
			if csx:
				st["sv"] += ((-k * st["s"] - damp * st["sv"]) / m - ((ux * axl + uy * ayl) / len) * inr) * h
				st["s"] += st["sv"] * h
	var mix: float = c.get("mix", 1.0)
	if cx or cy: set_world_pos(b, b.wx + st["ox"] * mix, b.wy + st["oy"] * mix)
	if cr: b.arot += st["r"] * RAD * mix * parent_sign(b)
	if csh: b.ashx += st["r"] * RAD * mix
	if csx:
		var k3 := maxf(0.05, 1.0 + st["s"] * mix)
		b.asx *= k3
		if c.get("volume", false): b.asy /= k3
	update_subtree(b)

# ---------- geometry ----------
const QUAD_UV := [0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0]
const QUAD_TRIS := [0, 1, 2, 2, 3, 0]

func image_path(slot: Slot, a: Dictionary) -> String:
	var sq = a.get("sequence")
	if sq == null: return a.get("path", "")
	var idx: int = slot.seq.get(a["name"], int(sq.get("setup", 0)))
	var n := str(int(sq.get("start", 0)) + idx)
	while n.length() < int(sq.get("digits", 0)): n = "0" + n
	return a.get("path", "") + n

## Returns {verts: PackedFloat32Array (world), uvs, tris, att, image, polygon} or {}.
func geometry(slot: Slot, att = null) -> Dictionary:
	if att == null: att = attachment_of(slot)
	if att == null: return {}
	var b := slot.bone
	match att.get("type"):
		"region":
			var rx: float = att.get("rotation", 0.0) * DEG
			var ry: float = (att.get("rotation", 0.0) + 90.0) * DEG
			var sx: float = att.get("scaleX", 1.0)
			var sy: float = att.get("scaleY", 1.0)
			var la := cos(rx) * sx; var lb := cos(ry) * sy; var lc := sin(rx) * sx; var ld := sin(ry) * sy
			var hw: float = att.get("width", 0.0) / 2.0
			var hh: float = att.get("height", 0.0) / 2.0
			var corners := [-hw, -hh, hw, -hh, hw, hh, -hw, hh]
			var v := PackedFloat32Array()
			v.resize(8)
			for i in 4:
				var cxx: float = corners[i * 2]
				var cyy: float = corners[i * 2 + 1]
				var lx: float = la * cxx + lb * cyy + att.get("x", 0.0)
				var ly: float = lc * cxx + ld * cyy + att.get("y", 0.0)
				v[i * 2] = b.a * lx + b.b * ly + b.wx; v[i * 2 + 1] = b.c * lx + b.d * ly + b.wy
			return {"verts": v, "uvs": QUAD_UV, "tris": QUAD_TRIS, "att": att, "image": image_path(slot, att)}
		"mesh", "linkedmesh":
			var geo: Dictionary = att
			var def_name: String = att["name"]
			if att["type"] == "linkedmesh":
				var ps = att.get("parentSlot")
				var g2 = AlikeModel.get_attachment(sk, skin_name, ps if ps != null else slot.name, att.get("parent"))
				if g2 == null or g2.get("type") != "mesh": return {}
				geo = g2
				if att.get("inheritDeform", true): def_name = geo["name"]
			return {"verts": mesh_world(slot, geo, slot.deform.get(def_name)), "uvs": geo["uvs"], "tris": geo["triangles"], "att": att, "image": image_path(slot, att)}
		"bbox", "clip":
			return {"verts": mesh_world(slot, att, slot.deform.get(att["name"])), "att": att, "polygon": true}
		"point":
			var p := local_to_world(b, att.get("x", 0.0), att.get("y", 0.0))
			return {"verts": PackedFloat32Array([p.x, p.y]), "att": att, "angle": world_rot(b) + att.get("rotation", 0.0)}
		"path":
			return {"pts": path_world(slot, att), "att": att}
	return {}

func mesh_world(slot: Slot, geo: Dictionary, def) -> PackedFloat32Array:
	var b := slot.bone
	var out := PackedFloat32Array()
	var weights = geo.get("weights")
	if weights == null:
		var v: PackedFloat32Array = geo.get("verts", PackedFloat32Array())
		out.resize(v.size())
		var i := 0
		while i < v.size():
			var lx: float = v[i] + (def[i] if def != null and i < def.size() else 0.0)
			var ly: float = v[i + 1] + (def[i + 1] if def != null and i + 1 < def.size() else 0.0)
			out[i] = b.a * lx + b.b * ly + b.wx; out[i + 1] = b.c * lx + b.d * ly + b.wy
			i += 2
		return out
	out.resize(weights.size() * 2)
	var e := 0
	for i in weights.size():
		var x := 0.0
		var y := 0.0
		for w in weights[i]:
			var lx: float = w["x"] + (def[e * 2] if def != null and e * 2 < def.size() else 0.0)
			var ly: float = w["y"] + (def[e * 2 + 1] if def != null and e * 2 + 1 < def.size() else 0.0)
			e += 1
			if not bone_map.has(w["b"]): continue
			var bb: Bone = bone_map[w["b"]]
			x += (bb.a * lx + bb.b * ly + bb.wx) * w["w"]
			y += (bb.c * lx + bb.d * ly + bb.wy) * w["w"]
		out[i * 2] = x; out[i * 2 + 1] = y
	return out
