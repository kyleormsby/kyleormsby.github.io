#!/bin/bash
#
# Rebuild public/files/ from the old repo's files/ directory.
#
# The archive is 1,970 MB; GitHub Pages publishes at most 1 GB. This applies the
# agreed policy and lands at 668 MB:
#
#   pruned      544/notes, 545/notes, 546/notes   (94 handwritten notes, 859 MB)
#               *.mp4                             (2 recordings, 103 MB)
#               *.aux *.log *.out *.gz .DS_Store  (build artifacts)
#               113spring26 worksheets, solutions, homework, practice exams
#                                                 (130 files; withdrawn from the
#                                                 site so the problems can be
#                                                 reused — the course page links
#                                                 to /unavailable/ instead)
#   compressed  PDFs over 5 MB, ghostscript /ebook
#   verbatim    everything else
#
# A compressed PDF is only kept if ghostscript exited cleanly, printed no error,
# produced a smaller file, and preserved the page count. Otherwise the original
# is copied through. That check is not optional: ghostscript emits `rangecheck`
# errors with "output may be incorrect" on some of these images, and a silently
# corrupted set of lecture notes is worse than a large one.
#
# Usage:  tools/sync_files.sh [SRC] [DST]
# Safe to re-run: files already present in DST are skipped.

set -u
SRC="${1:-../kyleormsby.github.io/files}"
DST="${2:-public/files}"
BIG=$((5 * 1024 * 1024))
JOBS="${JOBS:-4}"
LOG=${LOG:-/tmp/sync_files}

command -v gs >/dev/null || { echo "ghostscript not found"; exit 1; }
command -v pdfinfo >/dev/null || echo "warning: pdfinfo missing, page-count check disabled"

SRC=$(cd "$SRC" && pwd)
mkdir -p "$DST" "$LOG"; DST=$(cd "$DST" && pwd)
: > "$LOG/fallbacks.txt"

find "$SRC" -type f \
  ! -path "$SRC/544/notes/*" ! -path "$SRC/545/notes/*" ! -path "$SRC/546/notes/*" \
  ! -iname '*.mp4' ! -iname '*.aux' ! -iname '*.log' ! -iname '*.out' \
  ! -iname '*.gz' ! -name '.DS_Store' \
  ! -path "$SRC/113spring26/*-group.pdf" ! -path "$SRC/113spring26/*-group-sol.pdf" \
  ! -path "$SRC/113spring26/*-hw.pdf" ! -path "$SRC/113spring26/*-hw.tex" \
  ! -path "$SRC/113spring26/*_practice.pdf" \
  -printf '%s\t%P\n' | sort -k1 -rn > "$LOG/manifest.tsv"

echo "$(wc -l < "$LOG/manifest.tsv") files to place"

export SRC DST BIG LOG
one() {
  size="${1%%$'\t'*}"; rel="${1#*$'\t'}"
  out="$DST/$rel"
  [ -s "$out" ] && return
  mkdir -p "$(dirname "$out")"
  low="${rel,,}"

  if [ "${low: -4}" = ".pdf" ] && [ "$size" -gt "$BIG" ]; then
    err=$(timeout 150 gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.7 -dPDFSETTINGS=/ebook \
          -dNOPAUSE -dQUIET -dBATCH -sOutputFile="$out" "$SRC/$rel" 2>&1); rc=$?
    o=$(stat -c%s "$out" 2>/dev/null || echo 0)
    pin=$(pdfinfo "$SRC/$rel" 2>/dev/null | awk '/^Pages:/{print $2}')
    pout=$(pdfinfo "$out"      2>/dev/null | awk '/^Pages:/{print $2}')
    bad=""
    [ $rc -ne 0 ]                            && bad="exit $rc"
    grep -qi error <<<"$err"                 && bad="${bad:+$bad; }ghostscript error"
    [ "$o" -eq 0 ]                           && bad="${bad:+$bad; }empty"
    [ "$o" -ge "$size" ]                     && bad="${bad:+$bad; }grew"
    [ -n "$pin" ] && [ "$pin" != "$pout" ]   && bad="${bad:+$bad; }pages $pin->$pout"
    if [ -n "$bad" ]; then
      cp -f "$SRC/$rel" "$out"
      printf '%s\t%s\n' "$rel" "$bad" >> "$LOG/fallbacks.txt"
    fi
  else
    cp -f "$SRC/$rel" "$out"
  fi
}
export -f one

xargs -a "$LOG/manifest.tsv" -d '\n' -P "$JOBS" -I{} bash -c 'one "$@"' _ {}

echo "placed $(find "$DST" -type f | wc -l) files, $(du -sm "$DST" | cut -f1) MB"
echo "kept original for $(wc -l < "$LOG/fallbacks.txt") file(s):"
cat "$LOG/fallbacks.txt"
