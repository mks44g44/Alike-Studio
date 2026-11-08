#!/bin/sh
# Alike Studio command line export (Linux / macOS). Run "alike-cli --help" for options.
# Linux .deb / .tar.gz: this script sits next to the "alike" program.
# macOS: copy it anywhere and set ALIKE_APP, e.g. ALIKE_APP="/Applications/Alike Studio.app"
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -n "$ALIKE_APP" ]; then BIN="$ALIKE_APP/Contents/MacOS/Alike Studio"
elif [ -x "$DIR/alike" ]; then BIN="$DIR/alike"
elif [ -x "/Applications/Alike Studio.app/Contents/MacOS/Alike Studio" ]; then BIN="/Applications/Alike Studio.app/Contents/MacOS/Alike Studio"
else echo "alike-cli: cannot find Alike Studio (set ALIKE_APP)" >&2; exit 2; fi
exec "$BIN" --cli "$@"
