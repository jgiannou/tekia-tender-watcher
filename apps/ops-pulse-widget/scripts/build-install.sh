#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "error: Full Xcode required. Install from App Store, then:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo "  sudo xcodebuild -license accept"
  exit 1
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "error: xcodegen missing. Run: brew install xcodegen"
  exit 1
fi

bash "$(dirname "$0")/generate-secrets.sh"
xcodegen generate

# Prefer first available development team from local signing identities.
TEAM_ID="${DEVELOPMENT_TEAM:-37ZNXDS49B}"
if [[ -z "$TEAM_ID" ]]; then
  TEAM_ID="$(
    security find-identity -v -p codesigning 2>/dev/null \
      | sed -n 's/.*(\([A-Z0-9]\{10\}\)).*/\1/p' \
      | head -1 || true
  )"
fi

DERIVED="${TMPDIR:-/tmp}/arc-pulse-build"
rm -rf "$DERIVED"
mkdir -p "$DERIVED"

ARGS=(
  -project ARCPulse.xcodeproj
  -scheme ARCPulse
  -configuration Release
  -derivedDataPath "$DERIVED"
  -destination "platform=macOS,arch=$(uname -m)"
  CODE_SIGN_STYLE=Automatic
  ONLY_ACTIVE_ARCH=YES
)

if [[ -n "$TEAM_ID" ]]; then
  echo "Using DEVELOPMENT_TEAM=$TEAM_ID"
  ARGS+=(DEVELOPMENT_TEAM="$TEAM_ID")
else
  echo "warning: No DEVELOPMENT_TEAM detected. Open Xcode once to select your Personal Team if signing fails."
fi

xcodebuild "${ARGS[@]}" build

APP="$(find "$DERIVED/Build/Products/Release" -name 'ARC Tenders Pulse.app' -o -name 'ARC Pulse.app' | head -1)"
if [[ -z "$APP" ]]; then
  echo "error: built app not found under $DERIVED"
  exit 1
fi

DEST="/Applications/ARC Tenders Pulse.app"
# Remove old short name if present
rm -rf "/Applications/ARC Pulse.app"
rm -rf "$DEST"
cp -R "$APP" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

LS=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
# Prevent WidgetKit from binding to the DerivedData /tmp copy (shows blank / stale UI).
killall ARCPulseWidget 2>/dev/null || true
killall chronod 2>/dev/null || true
"$LS" -u "$(dirname "$(dirname "$(dirname "$APP")")")/ARC Pulse.app" 2>/dev/null || true
"$LS" -u "$APP" 2>/dev/null || true
pluginkit -r "$APP/Contents/PlugIns/ARCPulseWidget.appex" 2>/dev/null || true
"$LS" -f -R -trusted "$DEST"
pluginkit -a "$DEST/Contents/PlugIns/ARCPulseWidget.appex" 2>/dev/null || true
pluginkit -e use -i gr.tekia.arc.tenders.pulse.widget 2>/dev/null || true

echo "Installed: $DEST"
pluginkit -mAvvv -p com.apple.widgetkit-extension 2>/dev/null | grep -A5 'tenders.pulse.widget' || true
open "$DEST"
echo "Next: REMOVE any old widget, then Edit Widgets → add “ARC Tenders Pulse” again."
echo "Tap → Ops Desk · ↻ → refresh. Token is baked from .env at build time."
