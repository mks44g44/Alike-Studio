## Alike runtime for Godot 4 — imports exported .alkb files as AlikeSkeletonData resources,
## linking the atlas pages and event sounds that sit in the same folder.
@tool
extends EditorImportPlugin

func _get_importer_name() -> String: return "alike.skeleton"
func _get_visible_name() -> String: return "Alike Skeleton"
func _get_recognized_extensions() -> PackedStringArray: return PackedStringArray(["alkb"])
func _get_save_extension() -> String: return "res"
func _get_resource_type() -> String: return "Resource"
func _get_preset_count() -> int: return 1
func _get_preset_name(_i: int) -> String: return "Default"
func _get_import_options(_path: String, _preset: int) -> Array[Dictionary]: return []
func _get_option_visibility(_path: String, _option: StringName, _options: Dictionary) -> bool: return true
func _get_priority() -> float: return 1.0
# run after textures and audio so they can be linked
func _get_import_order() -> int: return 100

func _import(source_file: String, save_path: String, _options: Dictionary, _platform_variants: Array[String], _gen_files: Array[String]) -> Error:
	var bytes := FileAccess.get_file_as_bytes(source_file)
	if bytes.is_empty(): return ERR_FILE_CANT_READ
	var res = load("res://addons/alike/alike_skeleton_data.gd").new()
	res.raw = bytes
	res.source_dir = source_file.get_base_dir()
	if res.get_data().is_empty(): return ERR_PARSE_ERROR
	res.link_files()
	return ResourceSaver.save(res, "%s.%s" % [save_path, _get_save_extension()])
