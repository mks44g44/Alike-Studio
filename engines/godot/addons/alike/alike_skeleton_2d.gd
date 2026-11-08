## Alike runtime for Godot 4 — plays and draws an Alike skeleton.
## Assign an imported .alkb (AlikeSkeletonData) or set data_file to an exported .json, pick an animation.
@tool
@icon("res://addons/alike/icon.svg")
class_name AlikeSkeleton2D
extends Node2D

## Emitted for every event key passed during playback.
signal animation_event(event_name: String, int_value: int, float_value: float, string_value: String, track: int)

@export var skeleton_data: AlikeSkeletonData:
	set(v):
		skeleton_data = v
		_reload()
## Alternative to skeleton_data: path to an exported .json (or .alkb) file.
@export_file("*.json", "*.alkb") var data_file := "":
	set(v):
		data_file = v
		if v != "": skeleton_data = AlikeSkeletonData.from_file(v)
@export var animation := "":
	set(v):
		animation = v
		if state != null and v != "" and AlikeModel.find(data.get("skeleton", {}).get("animations", []), v) != null:
			state.default_mix = default_mix
			state.set_animation(0, v, loop)
@export var loop := true
@export var skin := "default":
	set(v):
		skin = v
		if not data.is_empty(): pose = AlikePose.new(data["skeleton"], skin); _phys.clear()
@export_range(0.0, 3.0, 0.01) var time_scale := 1.0
@export var physics := true
## Default crossfade (seconds) used when switching animations.
@export var default_mix := 0.2
## Alike pixels → Godot pixels.
@export var pixel_scale := 1.0
@export var play_sounds := true
@export var preview_in_editor := true

var data: Dictionary = {}
var state: AlikeAnimationState
var pose: AlikePose
var _phys := {}
var _items: Array[RID] = []
var _materials := {}       # key -> ShaderMaterial
var _audio: AudioStreamPlayer2D
static var _shaders := {}

const SHADER_SRC := """
shader_type canvas_item;
render_mode %s;
uniform vec4 dark_color = vec4(0.0);
uniform bool pma_texture = false;
varying vec4 vcol;
void vertex() { vcol = COLOR; }
void fragment() {
	vec4 t = texture(TEXTURE, UV);
	if (!pma_texture) t.rgb *= t.a;
	vec3 rgb = t.rgb * vcol.rgb + (t.a - t.rgb) * dark_color.rgb * dark_color.a;
	%s
}
"""

func _ready() -> void:
	_reload()

func _reload() -> void:
	data = {}
	state = null
	pose = null
	if skeleton_data == null: return
	data = skeleton_data.get_data()
	if data.is_empty(): return
	var sk: Dictionary = data["skeleton"]
	pose = AlikePose.new(sk, skin)
	state = AlikeAnimationState.new(sk)
	state.default_mix = default_mix
	state.listeners.append(_on_event)
	_phys.clear()
	if animation != "" and AlikeModel.find(sk.get("animations", []), animation) != null:
		state.set_animation(0, animation, loop)
	notify_property_list_changed()

func _validate_property(p: Dictionary) -> void:
	if data.is_empty(): return
	var sk: Dictionary = data["skeleton"]
	if p.name == "animation":
		p.hint = PROPERTY_HINT_ENUM_SUGGESTION
		p.hint_string = ",".join(sk.get("animations", []).map(func(a): return a["name"]))
	elif p.name == "skin":
		p.hint = PROPERTY_HINT_ENUM_SUGGESTION
		p.hint_string = ",".join(sk.get("skins", []).map(func(s): return s["name"]))

# ---------- playback API ----------
func set_animation(anim_name: String, loop_anim := true, track := 0) -> AlikeAnimationState.Entry:
	if state == null: return null
	state.default_mix = default_mix
	return state.set_animation(track, anim_name, loop_anim)

func add_animation(anim_name: String, loop_anim := true, delay := 0.0, track := 0) -> AlikeAnimationState.Entry:
	return state.add_animation(track, anim_name, loop_anim, delay) if state != null else null

func set_mix(from: String, to: String, duration: float) -> void:
	if state != null: state.set_mix(from, to, duration)

func reset_physics() -> void: _phys.clear()

## Global position of a bone (for attaching nodes, e.g. a weapon to a hand).
func get_bone_global_position(bone_name: String) -> Vector2:
	if pose == null or not pose.bone_map.has(bone_name): return global_position
	var b = pose.bone_map[bone_name]
	return to_global(Vector2(b.wx, -b.wy) * pixel_scale)

func get_bone_global_rotation(bone_name: String) -> float:
	if pose == null or not pose.bone_map.has(bone_name): return global_rotation
	return global_rotation - deg_to_rad(pose.world_rot(pose.bone_map[bone_name]))

func _on_event(ev: Dictionary, track: int) -> void:
	animation_event.emit(ev.get("name", ""), int(ev.get("int", 0)), float(ev.get("float", 0.0)), str(ev.get("string", "")), track)
	if not play_sounds or Engine.is_editor_hint(): return
	var def = AlikeModel.find(data["skeleton"].get("events", []), ev.get("name"))
	if def == null or str(def.get("audio", "")) == "": return
	var stream := skeleton_data.get_sound(def["audio"])
	if stream == null: return
	if _audio == null:
		_audio = AudioStreamPlayer2D.new()
		add_child(_audio)
	_audio.stream = stream
	_audio.volume_db = linear_to_db(clampf(float(ev.get("volume", def.get("volume", 1.0))), 0.0001, 1.0))
	_audio.play()

func _process(delta: float) -> void:
	if state == null:
		if skeleton_data != null: _reload()
		if state == null: return
	if Engine.is_editor_hint() and not preview_in_editor: delta = 0.0
	if pose.skin_name != skin: pose = AlikePose.new(data["skeleton"], skin)
	var dt := delta * time_scale
	state.update(dt)
	pose.set_to_setup()
	state.apply(pose)
	pose.update(dt if physics else 0.0, _phys if physics else null)
	_render()

# ---------- drawing ----------
func _material(blend: String, dark, pma: bool, slot_name: String) -> ShaderMaterial:
	var mode := "blend_premul_alpha"
	var out := "COLOR = vec4(rgb * vcol.a, t.a * vcol.a);"
	if blend == "additive" or blend == "screen":
		mode = "blend_add"; out = "COLOR = vec4(rgb * vcol.a, 1.0);"
	elif blend == "multiply":
		mode = "blend_mul"; out = "COLOR = vec4(rgb * vcol.a + vec3(1.0 - t.a * vcol.a), 1.0);"
	if not _shaders.has(mode):
		var sh := Shader.new()
		sh.code = SHADER_SRC % [mode, out]
		_shaders[mode] = sh
	var key := blend + ("|" + slot_name if dark != null else "")
	if not _materials.has(key):
		var m := ShaderMaterial.new()
		m.shader = _shaders[mode]
		_materials[key] = m
	var mat: ShaderMaterial = _materials[key]
	mat.set_shader_parameter("pma_texture", pma)
	mat.set_shader_parameter("dark_color", Color(dark[0], dark[1], dark[2], 1.0) if dark != null else Color(0, 0, 0, 0))
	return mat

func _item(i: int) -> RID:
	while _items.size() <= i:
		var it := RenderingServer.canvas_item_create()
		RenderingServer.canvas_item_set_parent(it, get_canvas_item())
		_items.append(it)
	return _items[i]

func _exit_tree() -> void:
	for it in _items: RenderingServer.free_rid(it)
	_items.clear()

static func _map_uv(reg: Dictionary, page: Dictionary, u: float, v: float) -> Vector2:
	var px: float = u * reg.get("ow", reg["w"]) - reg.get("ox", 0.0)
	var py: float = v * reg.get("oh", reg["h"]) - reg.get("oy", 0.0)
	if not reg.get("rot", false): return Vector2((reg["x"] + px) / page["w"], (reg["y"] + py) / page["h"])
	return Vector2((reg["x"] + reg["h"] - py) / page["w"], (reg["y"] + px) / page["h"])

func _find_region(image: String) -> Array:
	var atlas = data.get("atlas")
	if atlas == null: return []
	var pages: Array = atlas["pages"]
	for i in pages.size():
		if pages[i]["regions"].has(image): return [i, pages[i]["regions"][image], pages[i]]
	return []

func _render() -> void:
	for it in _items: RenderingServer.canvas_item_clear(it)
	if pose == null: return
	var atlas = data.get("atlas")
	var pma: bool = atlas != null and atlas.get("pma", false)
	var nearest: bool = atlas != null and atlas.get("filter", "linear") == "nearest"
	var s := pixel_scale
	var n := 0
	var clip_poly := PackedVector2Array()
	var clip_parts := []
	var clip_inverse := false
	var clip_end = null
	for slot in pose.draw_order:
		if not slot.bone.active:
			if clip_end != null and clip_end == slot.name:
				clip_poly = PackedVector2Array(); clip_end = null
			continue
		var att = pose.attachment_of(slot)
		if att != null and att.get("type") == "clip" and clip_end == null:
			var g0 := pose.geometry(slot, att)
			var v0: PackedFloat32Array = g0.get("verts", PackedFloat32Array())
			if v0.size() >= 6:
				clip_poly = PackedVector2Array()
				for i in range(0, v0.size(), 2): clip_poly.append(Vector2(v0[i], -v0[i + 1]) * s)
				clip_end = att.get("end") if att.get("end") != null else "<<end>>"
				clip_inverse = att.get("inverse", false)
				clip_parts = _convex_parts(clip_poly) if clip_inverse else []
		elif att != null and att.get("type") in ["region", "mesh", "linkedmesh"]:
			var g := pose.geometry(slot, att)
			if g.is_empty() or g.get("tris") == null: pass
			else:
				var found := _find_region(g["image"])
				var tex: Texture2D = skeleton_data.get_page(found[0]) if not found.is_empty() else null
				if tex != null:
					var reg: Dictionary = found[1]
					var page: Dictionary = found[2]
					var sc: Array = slot.color
					var ac: Array = att.get("color", [1, 1, 1, 1])
					var col := Color(sc[0] * ac[0], sc[1] * ac[1], sc[2] * ac[2], sc[3] * ac[3]) * modulate
					var verts: PackedFloat32Array = g["verts"]
					var uvs_src = g["uvs"]
					var tris = g["tris"]
					var pts := PackedVector2Array()
					var uvs := PackedVector2Array()
					var cols := PackedColorArray()
					var idx := PackedInt32Array()
					if clip_poly.is_empty():
						for i in range(0, verts.size(), 2):
							pts.append(Vector2(verts[i], -verts[i + 1]) * s)
							uvs.append(_map_uv(reg, page, uvs_src[i], uvs_src[i + 1]))
							cols.append(col)
						for t in tris: idx.append(int(t))
					else:
						for ti in range(0, tris.size(), 3):
							var ia := int(tris[ti]); var ib := int(tris[ti + 1]); var ic := int(tris[ti + 2])
							var A := Vector2(verts[ia * 2], -verts[ia * 2 + 1]) * s
							var B := Vector2(verts[ib * 2], -verts[ib * 2 + 1]) * s
							var C := Vector2(verts[ic * 2], -verts[ic * 2 + 1]) * s
							var uA := Vector2(uvs_src[ia * 2], uvs_src[ia * 2 + 1]); var uB := Vector2(uvs_src[ib * 2], uvs_src[ib * 2 + 1]); var uC := Vector2(uvs_src[ic * 2], uvs_src[ic * 2 + 1])
							var det := (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y)
							if absf(det) < 1e-9: continue
							var polys: Array = _subtract_parts(PackedVector2Array([A, B, C]), clip_parts) if clip_inverse else Geometry2D.intersect_polygons(PackedVector2Array([A, B, C]), clip_poly)
							for poly in polys:
								var tri := Geometry2D.triangulate_polygon(poly)
								var base := pts.size()
								for p in poly:
									var l1 := ((B.y - C.y) * (p.x - C.x) + (C.x - B.x) * (p.y - C.y)) / det
									var l2 := ((C.y - A.y) * (p.x - C.x) + (A.x - C.x) * (p.y - C.y)) / det
									var uv := uA * l1 + uB * l2 + uC * (1.0 - l1 - l2)
									pts.append(p); uvs.append(_map_uv(reg, page, uv.x, uv.y)); cols.append(col)
								for k in tri: idx.append(base + k)
					if not idx.is_empty():
						var it := _item(n)
						n += 1
						RenderingServer.canvas_item_set_draw_index(it, n)
						if nearest: RenderingServer.canvas_item_set_default_texture_filter(it, RenderingServer.CANVAS_ITEM_TEXTURE_FILTER_NEAREST)
						RenderingServer.canvas_item_set_material(it, _material(slot.data.get("blend", "normal"), slot.dark, pma, slot.name).get_rid())
						RenderingServer.canvas_item_add_triangle_array(it, idx, pts, cols, uvs, PackedInt32Array(), PackedFloat32Array(), tex.get_rid())
		if clip_end != null and clip_end == slot.name:
			clip_poly = PackedVector2Array(); clip_end = null; clip_inverse = false
	_rendered_items = n

# ---------- inverse clipping helpers ----------
static func _convex_parts(poly: PackedVector2Array) -> Array:
	var parts := []
	var idx := Geometry2D.triangulate_polygon(poly)
	for i in range(0, idx.size(), 3):
		var a := poly[idx[i]]; var b := poly[idx[i + 1]]; var c := poly[idx[i + 2]]
		if (b - a).cross(c - a) < 0: parts.append(PackedVector2Array([a, c, b]))
		else: parts.append(PackedVector2Array([a, b, c]))
	return parts

static func _half_plane(inp: PackedVector2Array, p1: Vector2, p2: Vector2, keep_inside: bool) -> PackedVector2Array:
	var out := PackedVector2Array()
	var n := inp.size()
	for i in n:
		var p := inp[i]; var q := inp[(i + 1) % n]
		var sp := (p2 - p1).cross(p - p1); var sq := (p2 - p1).cross(q - p1)
		if not keep_inside:
			sp = -sp; sq = -sq
		if sp >= 0: out.append(p)
		if (sp >= 0) != (sq >= 0): out.append(p + (q - p) * (sp / (sp - sq)))
	return out

## Triangle minus the clip polygon (as convex parts) → list of convex polygons.
static func _subtract_parts(tri: PackedVector2Array, parts: Array) -> Array:
	var pieces := [tri]
	for part in parts:
		var nxt := []
		for pc in pieces:
			var inside: PackedVector2Array = pc
			var cn: int = part.size()
			for e in cn:
				if inside.size() < 3: break
				var outside := _half_plane(inside, part[e], part[(e + 1) % cn], false)
				if outside.size() >= 3: nxt.append(outside)
				inside = _half_plane(inside, part[e], part[(e + 1) % cn], true)
		pieces = nxt
		if pieces.is_empty(): break
	return pieces

## Number of canvas items drawn last frame (for debugging).
var _rendered_items := 0
