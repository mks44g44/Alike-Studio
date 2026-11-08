## Alike runtime for Godot 4 — AnimationState (port of js/animstate.js): tracks, crossfades, queues, events.
class_name AlikeAnimationState
extends RefCounted

class Entry:
	var anim: Dictionary
	var loop := true
	var time := 0.0
	var last_time := -1.0
	var time_scale := 1.0
	var alpha := 1.0
	var mix_duration := 0.2
	var mix_time := 0.0
	var delay := 0.0
	var duration := 0.0
	var additive := false
	var fresh := true
	var draw_order := true ## false: this track's draw order and draw order folder keys are ignored
	var mix_curve := "linear"
	var from: Entry = null
	var next: Entry = null

	func _init(a: Dictionary, l: bool) -> void:
		anim = a; loop = l; duration = AlikeModel.anim_duration(a)

	func anim_time() -> float:
		if loop and duration > 0: return fmod(time, duration)
		return minf(time, duration)

	func is_complete() -> bool: return not loop and time >= duration

var sk: Dictionary
var tracks: Array = []
var time_scale := 1.0
var default_mix := 0.2
var mixes: Dictionary = {}
## "linear" or "ease" crossfade interpolation
var mix_curve := "linear"
## Callables called as fn(event: Dictionary, track: int)
var listeners: Array = []

func _init(skeleton: Dictionary) -> void:
	sk = skeleton

func mix_for(from: String, to: String) -> float: return mixes.get(from + ">" + to, default_mix)
func set_mix(from: String, to: String, d: float) -> void: mixes[from + ">" + to] = d

func _track_at(i: int) -> Entry: return tracks[i] if i < tracks.size() else null
func _put_track(i: int, e: Entry) -> void:
	while tracks.size() <= i: tracks.append(null)
	tracks[i] = e

func set_animation(track: int, anim_name: String, loop := true) -> Entry:
	var anim = AlikeModel.find(sk.get("animations", []), anim_name)
	if anim == null:
		push_warning("Alike: animation not found: " + anim_name)
		return null
	var e := Entry.new(anim, loop)
	e.mix_curve = mix_curve
	var cur := _track_at(track)
	if cur != null:
		e.mix_duration = mix_for(cur.anim["name"], anim_name); e.alpha = cur.alpha; e.additive = cur.additive; e.draw_order = cur.draw_order
		if e.mix_duration > 0:
			e.from = cur; cur.from = null; cur.next = null
	else:
		e.mix_duration = 0.0
	_put_track(track, e)
	return e

func add_animation(track: int, anim_name: String, loop := true, delay := 0.0) -> Entry:
	var anim = AlikeModel.find(sk.get("animations", []), anim_name)
	if anim == null: return null
	var last := _track_at(track)
	if last == null: return set_animation(track, anim_name, loop)
	while last.next != null: last = last.next
	var e := Entry.new(anim, loop)
	e.mix_curve = mix_curve
	e.delay = delay if delay > 0 else maxf(0.0, last.duration - mix_for(last.anim["name"], anim_name))
	e.mix_duration = mix_for(last.anim["name"], anim_name); e.alpha = last.alpha; e.additive = last.additive; e.draw_order = last.draw_order
	last.next = e
	return e

func clear_track(i: int) -> void:
	if i < tracks.size(): tracks[i] = null

func clear_tracks() -> void: tracks.clear()

func update(dt: float) -> void:
	dt *= time_scale
	for i in tracks.size():
		var e: Entry = tracks[i]
		if e == null: continue
		var d := dt * e.time_scale
		e.last_time = -1.0 if e.fresh else e.time
		e.fresh = false
		e.time += d
		if e.from != null:
			e.from.last_time = e.from.time; e.from.time += d * e.from.time_scale; e.mix_time += d
			if e.mix_time >= e.mix_duration: e.from = null
		_fire_events(e, i)
		if e.next != null and e.time >= e.next.delay - 1e-9:
			var n := e.next
			e.next = null
			n.from = e if n.mix_duration > 0 else null
			n.time = maxf(0.0, e.time - n.delay); n.last_time = -1.0; n.fresh = true; n.mix_time = 0.0
			tracks[i] = n

func _fire_events(e: Entry, i: int) -> void:
	if listeners.is_empty(): return
	var d := e.duration
	var out := []
	if e.last_time < 0:
		_collect(e, -1.0, fmod(e.time, d) if e.loop and d > 0 else e.time, out)
	elif e.loop and d > 0:
		var l0 := floorf(e.last_time / d)
		var l1 := floorf(e.time / d)
		var a := fmod(e.last_time, d)
		var b := fmod(e.time, d)
		if l0 == l1: _collect(e, a, b, out)
		else:
			_collect(e, a, d, out); _collect(e, -1.0, b, out)
	else:
		_collect(e, e.last_time, minf(e.time, d), out)
	for ev in out:
		for f in listeners: f.call(ev, i)

func _collect(e: Entry, a: float, b: float, out: Array) -> void:
	for tl in e.anim.get("timelines", []):
		if tl["type"] != "event": continue
		for k in tl["keys"]:
			if k["t"] > a and k["t"] <= b:
				var ev: Dictionary = k["v"].duplicate()
				ev["time"] = k["t"]
				out.append(ev)

func apply(pose: AlikePose) -> void:
	for i in tracks.size():
		var e: Entry = tracks[i]
		if e == null: continue
		if e.from != null:
			var m := minf(1.0, e.mix_time / e.mix_duration) if e.mix_duration > 0 else 1.0
			if e.mix_curve == "ease": m = m * m * (3.0 - 2.0 * m)
			var add := true if (i == 0 and not e.additive) else e.additive
			pose.apply_animation(e.from.anim, e.from.anim_time(), e.alpha * (1.0 - m), add, e.draw_order)
			pose.apply_animation(e.anim, e.anim_time(), e.alpha * m, add, e.draw_order)
		else:
			pose.apply_animation(e.anim, e.anim_time(), e.alpha, e.additive, e.draw_order)
