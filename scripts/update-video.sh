#!/usr/bin/env bash
# update-video.sh — swap the showcase video on links.visionbleu.com
#
# Usage:
#   bash scripts/update-video.sh <google-drive-link-or-fileId>
#   bash scripts/update-video.sh ./some-local-clip.mov
#
# Takes any iPhone .mov (or mp4), downloads it (if a Drive link), converts to a
# web-optimized H.264 MP4 + poster frame, and drops them in at the exact paths
# the page references. Then commit + push and Netlify redeploys.
#
# Requires: ffmpeg, ffprobe, and (for Drive links) the `gws` CLI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/assets/video"
OUT_MP4="$OUT_DIR/showcase.mp4"
OUT_POSTER="$OUT_DIR/showcase-poster.jpg"
SRC="$OUT_DIR/_src_input"

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/update-video.sh <drive-link|fileId|local-file>" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
ARG="$1"

if [ -f "$ARG" ]; then
  echo "→ Using local file: $ARG"
  cp "$ARG" "$SRC"
else
  # Extract the Drive file ID from a /file/d/<ID>/ link, ?id=<ID>, or a bare ID.
  FID="$(printf '%s' "$ARG" | sed -n 's#.*/file/d/\([^/]*\).*#\1#p')"
  [ -z "$FID" ] && FID="$(printf '%s' "$ARG" | sed -n 's#.*[?&]id=\([^&]*\).*#\1#p')"
  [ -z "$FID" ] && FID="$ARG"
  echo "→ Downloading Drive file: $FID"
  gws drive files get --params "{\"fileId\":\"$FID\",\"alt\":\"media\"}" -o "$SRC" >/dev/null
fi

echo "→ Source info:"
ffprobe -v error -show_entries stream=codec_name,width,height:format=duration,size \
  -of default=noprint_wrappers=1 "$SRC" || true

echo "→ Converting to web MP4 (720px wide, H.264, faststart)…"
ffmpeg -y -i "$SRC" \
  -vf "scale=720:-2" \
  -c:v libx264 -profile:v high -preset medium -crf 23 -pix_fmt yuv420p \
  -movflags +faststart \
  -c:a aac -b:a 128k \
  "$OUT_MP4"

echo "→ Generating poster frame…"
ffmpeg -y -ss 1.5 -i "$OUT_MP4" -frames:v 1 -q:v 3 "$OUT_POSTER"

rm -f "$SRC"

echo ""
echo "✅ Done."
ls -lh "$OUT_MP4" "$OUT_POSTER"
echo ""
echo "Next: git add assets/video/showcase.mp4 assets/video/showcase-poster.jpg && git commit && git push"
