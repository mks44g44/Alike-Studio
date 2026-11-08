## Alike runtime for Godot 4 — resource holding exported skeleton data, atlas pages and sounds.
## Created automatically when you import an .alkb file, or with AlikeSkeletonData.from_file() for .json/.alkb.
@tool
class_name AlikeSkeletonData
extends Resource

@export var raw: PackedByteArray
## Atlas page textures in export order.
@export var pages: Array[Texture2D] = []
## audio name -> AudioStream
@export var sounds: Dictionary = {}
## Folder of the exported files (used to find pages that were not linked at import).
@export var source_dir := ""

var _parsed: Dictionary = {}

func get_data() -> Dictionary:
	if _parsed.is_empty() and not raw.is_empty():
		_parsed = AlikeModel.load_bytes(raw)
	return _parsed

func get_page(i: int) -> Texture2D:
	if i < pages.size() and pages[i] != null: return pages[i]
	var d := get_data()
	var atlas = d.get("atlas")
	if atlas == null or i >= atlas["pages"].size(): return null
	var p := source_dir.path_join(atlas["pages"][i]["file"])
	if ResourceLoader.exists(p):
		while pages.size() <= i: pages.append(null)
		pages[i] = load(p)
		return pages[i]
	return null

func get_sound(audio_name: String) -> AudioStream:
	if sounds.has(audio_name): return sounds[audio_name]
	var d := get_data()
	for a in d.get("audio", []):
		if a["name"] == audio_name:
			var p := source_dir.path_join(a["file"])
			if ResourceLoader.exists(p):
				sounds[audio_name] = load(p)
				return sounds[audio_name]
	return null

## Build from a .json or .alkb path (res:// or user://). Pages and sounds are loaded from the same folder.
static func from_file(path: String) -> AlikeSkeletonData:
	var res := AlikeSkeletonData.new()
	res.source_dir = path.get_base_dir()
	if path.ends_with(".json") and ResourceLoader.exists(path):
		var j = load(path)
		if j is JSON:
			res.raw = JSON.stringify(j.data).to_utf8_buffer()
	if res.raw.is_empty():
		res.raw = FileAccess.get_file_as_bytes(path)
	res.link_files()
	return res

## Load atlas pages and sounds that sit next to the data file.
func link_files() -> void:
	var d := get_data()
	pages.clear()
	var atlas = d.get("atlas")
	if atlas != null:
		for page in atlas["pages"]:
			var p := source_dir.path_join(page["file"])
			pages.append(load(p) if ResourceLoader.exists(p) else null)
	sounds.clear()
	for a in d.get("audio", []):
		var p := source_dir.path_join(a["file"])
		if ResourceLoader.exists(p): sounds[a["name"]] = load(p)
