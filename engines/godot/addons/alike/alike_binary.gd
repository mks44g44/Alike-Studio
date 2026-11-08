## Alike runtime for Godot 4 — ALKB binary reader (see js/binary.js for the format).
class_name AlikeBinary
extends RefCounted

static func decode(u8: PackedByteArray) -> Variant:
	if u8.size() < 6 or u8[0] != 65 or u8[1] != 76 or u8[2] != 75 or u8[3] != 66:
		push_error("Alike: not an .alkb file")
		return null
	var r := _Reader.new()
	r.b = u8
	r.p = 4
	var version := u8.decode_u16(4)
	r.p = 6
	if version != 1:
		push_error("Alike: unsupported ALKB version %d" % version)
		return null
	var n := r.varint()
	r.strings.resize(n)
	for i in n:
		var l := r.varint()
		r.strings[i] = u8.slice(r.p, r.p + l).get_string_from_utf8()
		r.p += l
	return r.read()

class _Reader:
	var b: PackedByteArray
	var p := 0
	var strings: Array = []

	func varint() -> int:
		var res := 0
		var s := 0
		while true:
			var x := b[p]
			p += 1
			res |= (x & 127) << s
			s += 7
			if (x & 128) == 0:
				break
		return res

	func read() -> Variant:
		var t := b[p]
		p += 1
		match t:
			0: return null
			1: return false
			2: return true
			3:
				var z := varint()
				return float(-(z + 1) / 2) if (z & 1) == 1 else float(z / 2)
			4:
				var v := roundf(b.decode_float(p) * 1e6) / 1e6
				p += 4
				return v
			9:
				var v := b.decode_double(p)
				p += 8
				return v
			5: return strings[varint()]
			6:
				var c := varint()
				var a := []
				a.resize(c)
				for i in c:
					a[i] = read()
				return a
			7:
				var c := varint()
				var o := {}
				for i in c:
					var k: String = strings[varint()]
					o[k] = read()
				return o
			8:
				var c := varint()
				var a := []
				a.resize(c)
				for i in c:
					a[i] = roundf(b.decode_float(p) * 1e6) / 1e6
					p += 4
				return a
		push_error("Alike: bad ALKB tag %d" % t)
		return null
