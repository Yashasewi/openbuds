#!/bin/sh
# Build OpenBuds.app with SwiftPM and wrap it in an ad-hoc-signed bundle.
# macOS only opens Bluetooth RFCOMM channels for app bundles, so the bare binary cannot be run directly.
#   scripts/build-app.sh            build and launch
#   scripts/build-app.sh --install  also copy to /Applications and launch from there
set -e
cd "$(dirname "$0")/.."
# SwiftUI's macros (@State, #Preview) need full Xcode, not just the Command Line Tools.
if [ -z "$DEVELOPER_DIR" ] && [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
swift build -c release --product OpenBuds
pkill -x OpenBuds 2>/dev/null || true
BUNDLE_VERSION="$(git rev-list --count HEAD 2>/dev/null || echo 0)" ./scripts/package-app.sh
APP=.build/OpenBuds.app
if [ "$1" = "--install" ]; then
  rm -rf /Applications/OpenBuds.app
  cp -R "$APP" /Applications/OpenBuds.app
  APP=/Applications/OpenBuds.app
fi
open "$APP"
echo "Launched $APP"
