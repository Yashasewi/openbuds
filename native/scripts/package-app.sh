#!/bin/sh
# Wrap the release binary in an ad-hoc-signed app bundle.
# macOS only opens Bluetooth RFCOMM channels for app bundles.
# BUNDLE_VERSION overrides CFBundleVersion (the GitHub release uses the commit count).
# OPENBUDS_BETA=1 marks the bundle so About follows prereleases. Stable builds leave it unset.
set -e
cd "$(dirname "$0")/.."
APP=.build/OpenBuds.app
VERSION="${BUNDLE_VERSION:-2}"
beta_row=""
if [ "${OPENBUDS_BETA:-}" = "1" ]; then
  beta_row="  <key>OpenBudsBeta</key><true/>"
fi
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/OpenBuds "$APP/Contents/MacOS/OpenBuds"
cp Support/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.yashasewi.openbuds</string>
  <key>CFBundleName</key><string>OpenBuds</string>
  <key>CFBundleDisplayName</key><string>OpenBuds</string>
  <key>CFBundleExecutable</key><string>OpenBuds</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.3</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
${beta_row}
  <key>LSMinimumSystemVersion</key><string>26.0</string>
  <key>LSUIElement</key><true/>
  <key>NSBluetoothAlwaysUsageDescription</key><string>OpenBuds talks to your OnePlus Buds 4 to show battery and change settings.</string>
</dict>
</plist>
EOF
codesign --force --sign - "$APP"
echo "Packaged $APP"
