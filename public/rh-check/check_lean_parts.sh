#!/bin/bash
# Fetch, reassemble, inspect and build the Lean archive from https://alpo.ge/remark.pdf
# (footnote 1: lean.tar.gz.part01 ... lean.tar.gz.part14).
#
#   ./check_lean_parts.sh download  fetch the parts, join, test gzip, list contents   (runs no archive code)
#   ./check_lean_parts.sh inspect   extract lean.tar.gz and scan the sources          (runs no archive code)
#   ./check_lean_parts.sh fetch     download + inspect
#   ./check_lean_parts.sh deps      check the pinned Mathlib and its deps against upstream (runs no archive code)
#   ./check_lean_parts.sh root      print the Lake project directory
#   ./check_lean_parts.sh build     plain 'lake build', unsandboxed                   (RUNS archive code)
#   ./check_lean_parts.sh axioms Some.Module some_theorem_name                        (RUNS archive code)
#
# For the sandboxed check use 'lake comparator' in the project directory instead of 'build'.
#
# Everything lands in ./alpo-lean (override with WORKDIR=...).
set -u
BASE_URL="${BASE_URL:-https://alpo.ge}"
NPARTS="${NPARTS:-14}"
WORKDIR="${WORKDIR:-$PWD/alpo-lean}"
PARTS="$WORKDIR/parts"
SRC="$WORKDIR/src"
ARCHIVE="$WORKDIR/lean.tar.gz"

say()  { printf '\n== %s\n' "$*"; }
die()  { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

# Shallowest directory under $SRC holding a lakefile, ignoring vendored packages.
find_root() {
  find "$SRC" \( -name lakefile.lean -o -name lakefile.toml \) -not -path '*/.lake/*' -print 2>/dev/null \
    | awk '{ n = gsub(/\//, "/"); print n "\t" $0 }' | sort -n | head -1 | cut -f2- | xargs -I{} dirname "{}"
}

cmd_download() {
  mkdir -p "$PARTS" || die "cannot create $PARTS"

  say "Downloading $NPARTS parts from $BASE_URL"
  for i in $(seq 1 "$NPARTS"); do
    p=$(printf 'lean.tar.gz.part%02d' "$i")
    if [ -s "$PARTS/$p.done" ]; then echo "have $p"; continue; fi
    curl -fL --retry 3 --retry-delay 2 -C - -o "$PARTS/$p" "$BASE_URL/$p" \
      || die "download of $p failed (curl exit $?)"
    echo ok > "$PARTS/$p.done"
  done

  say "Part sizes and SHA-256"
  ( cd "$PARTS" && ls -l lean.tar.gz.part?? | awk '{ print $5 "\t" $NF }' && shasum -a 256 lean.tar.gz.part?? )

  say "Joining parts in order"
  cat "$PARTS"/lean.tar.gz.part?? > "$ARCHIVE" || die "could not join parts"
  ls -l "$ARCHIVE" | awk '{ print $5 " bytes  " $NF }'
  shasum -a 256 "$ARCHIVE"

  say "Testing gzip integrity"
  gzip -t "$ARCHIVE" || die "joined file is not a valid gzip stream (missing, truncated or misordered part?)"
  echo "gzip OK"

  say "Listing archive"
  tar -tzf "$ARCHIVE" > "$WORKDIR/contents.txt" || die "not a readable tar archive"
  echo "$(wc -l < "$WORKDIR/contents.txt" | tr -d ' ') entries, listed in $WORKDIR/contents.txt"
  if grep -nE '(^/|(^|/)\.\.(/|$))' "$WORKDIR/contents.txt" | head -5 | grep -q .; then
    die "archive has absolute or ../ paths; not extracting. See contents.txt"
  fi
  echo "by extension:"
  awk -F/ '{ f = $NF; if (f == "") next; n = split(f, a, "."); print (n > 1 ? "." a[n] : "(none)") }' \
    "$WORKDIR/contents.txt" | sort | uniq -c | sort -rn | head -12

}

cmd_inspect() {
  [ -s "$ARCHIVE" ] || die "$ARCHIVE not found; run '$0 download' or copy the joined archive there"
  [ -e "$SRC" ] && die "$SRC already exists; move it away to extract afresh"
  if tar -tzf "$ARCHIVE" | grep -qE '(^/|(^|/)\.\.(/|$))'; then
    die "archive has absolute or ../ paths; not extracting"
  fi

  say "Extracting to $SRC"
  mkdir -p "$SRC" && tar -xzf "$ARCHIVE" -C "$SRC" || die "extraction failed"

  ROOT=$(find_root)
  [ -n "$ROOT" ] || die "no lakefile.lean / lakefile.toml found, so this is not a Lake project. Look in $SRC"
  say "Lake project root: $ROOT"
  echo "all lakefiles outside .lake:"
  find "$SRC" \( -name lakefile.lean -o -name lakefile.toml \) -not -path '*/.lake/*'
  echo
  echo "lean-toolchain: $(cat "$ROOT/lean-toolchain" 2>/dev/null || echo MISSING)"
  if [ -f "$ROOT/lake-manifest.json" ]; then
    echo "dependencies pinned in lake-manifest.json:"
    grep -E '"(name|url|rev|dir)"' "$ROOT/lake-manifest.json" | sed 's/^ */  /'
  else
    echo "lake-manifest.json: MISSING (dependency versions are not pinned)"
  fi
  if [ -d "$ROOT/.lake" ]; then
    echo
    echo "NOTE: the archive ships a .lake directory ($(du -sh "$ROOT/.lake" | cut -f1))."
    mv "$ROOT/.lake" "$WORKDIR/shipped.lake" || die "could not move the shipped .lake aside"
    echo "      Moved to $WORKDIR/shipped.lake so nothing prebuilt is trusted."
  fi
  NFILES=$(find "$ROOT" -name '*.lean' -not -path '*/.lake/*' | wc -l | tr -d ' ')
  NLINES=$(find "$ROOT" -name '*.lean' -not -path '*/.lake/*' -exec cat {} + | wc -l | tr -d ' ')
  echo
  echo "project Lean sources: $NFILES files, $NLINES lines"

  say "Static scan of project sources (hits are things to read, not verdicts)"
  scan() { # label, regex
    hits=$(grep -rnE --include='*.lean' --exclude-dir=.lake -e "$2" "$ROOT" 2>/dev/null)
    n=$(printf '%s' "$hits" | grep -c . )
    printf '%-52s %s\n' "$1" "$n"
    [ "$n" -gt 0 ] && printf '%s\n' "$hits" | head -8 | sed "s|$ROOT/|      |"
  }
  scan "sorry / admit"                              '(^|[^[:alnum:]_.])(sorry|admit|sorryAx)([^[:alnum:]_]|$)'
  scan "axiom declarations"                         '^[[:space:]]*(private |protected )?axiom[[:space:]]'
  scan "native_decide / ofReduceBool"               'native_decide|ofReduceBool|reduceBool'
  scan "unsafe / implemented_by / extern / opaque"  '(^|[^[:alnum:]_])unsafe[[:space:]]|implemented_by|@\[extern|^[[:space:]]*opaque[[:space:]]'
  scan "kernel or checking options turned off"      'skipKernelTC|set_option[[:space:]]+(debug|bootstrap)\.'
  scan "raw environment edits (addDecl etc.)"       'addDecl|addAndCompile|Environment\.add|modifyEnv|setEnv'
  scan "code run at build time (#eval, run_cmd...)" '#eval|run_cmd|run_meta|(^|[[:space:]])initialize[[:space:]]|IO\.Process|IO\.FS|System\.FilePath'
  scan "theorems stating RiemannHypothesis"         '^[[:space:]]*(private |protected )?(theorem|lemma)[[:space:]].*RiemannHypothesis'
  scan "mentions of RiemannHypothesis"              'RiemannHypothesis|riemannZeta'
  scan "local (re)definitions with Riemann in name" '^[[:space:]]*(def|abbrev|structure|class|notation).*[Rr]iemann'
  echo
  echo "Read $ROOT/lakefile.* before building: it is a program and runs on 'lake build'."
}

# Is the Mathlib that the project pins really upstream Mathlib, with upstream's own dependencies?
# Reads the manifest and talks to GitHub; runs nothing from the archive.
cmd_deps() {
  ROOT=$(find_root); [ -n "$ROOT" ] || die "run '$0 inspect' first"
  MAN="$ROOT/lake-manifest.json"
  [ -f "$MAN" ] || die "no lake-manifest.json; 'lake comparator' needs one and nothing is pinned"
  PY="$WORKDIR/deps_check.py"
  cat > "$PY" <<'DEPS_PY'
# Compare a project's lake-manifest.json with Mathlib's own manifest at the pinned Mathlib commit.
# usage: deps_check.py list <project-manifest>            -> prints packages, then "MATHLIB_REV <rev>"
#        deps_check.py compare <project-manifest> <mathlib-manifest>
import json, sys

OFFICIAL = ("https://github.com/leanprover-community/", "https://github.com/leanprover/")

def packages(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    out = {}
    for p in data.get("packages", []):
        out[str(p.get("name"))] = p
    return out

def main():
    mode, proj = sys.argv[1], packages(sys.argv[2])
    bad = 0
    if mode == "list":
        for name, p in sorted(proj.items()):
            url, rev, typ = str(p.get("url", p.get("dir", "?"))), str(p.get("rev", "-")), str(p.get("type", "?"))
            note = ""
            if typ != "git":
                note, bad = "  <-- NOT a git dependency (local path?): untrusted", bad + 1
            elif not url.startswith(OFFICIAL):
                note, bad = "  <-- not a leanprover / leanprover-community repo", bad + 1
            print("  %-22r %-10s %s  %r%s" % (name, typ, rev[:12], url, note))
        m = proj.get("mathlib")
        if m is None:
            print("  no package named 'mathlib' in the manifest")
            sys.exit(3)
        murl = str(m.get("url", "")).rstrip("/")
        if murl.removesuffix(".git") != "https://github.com/leanprover-community/mathlib4":
            print("  Mathlib is NOT pulled from leanprover-community/mathlib4: %r" % murl)
            sys.exit(4)
        rev = str(m.get("rev", ""))
        if not (len(rev) == 40 and all(c in "0123456789abcdef" for c in rev)):
            print("  Mathlib rev is not a full commit hash: %r" % rev)
            sys.exit(4)
        print("MATHLIB_REV " + rev)
        sys.exit(0)
    ref = packages(sys.argv[3])
    for name, p in sorted(proj.items()):
        if name == "mathlib":
            continue
        rev = str(p.get("rev", "-"))
        if name not in ref:
            print("  EXTRA    %r is not a dependency of Mathlib: treat it as part of the untrusted solution" % name)
            bad += 1
        elif str(ref[name].get("rev")) != rev or str(ref[name].get("url")) != str(p.get("url")):
            print("  MISMATCH %r: project pins %s, Mathlib pins %s" % (name, rev[:12], str(ref[name].get("rev"))[:12]))
            bad += 1
        else:
            print("  same     %r" % name)
    for name in sorted(set(ref) - set(proj)):
        print("  MISSING  %r is in Mathlib's manifest but not the project's" % name)
        bad += 1
    sys.exit(1 if bad else 0)

main()
DEPS_PY
  say "Packages pinned by the project"
  OUT=$(python3 -I "$PY" list "$MAN") || { printf '%s\n' "$OUT"; die "manifest does not pin upstream Mathlib"; }
  printf '%s\n' "$OUT" | grep -v '^MATHLIB_REV '
  REV=$(printf '%s\n' "$OUT" | sed -n 's/^MATHLIB_REV //p')

  REF="$WORKDIR/mathlib-ref"
  say "Fetching upstream Mathlib history into $REF (no checkout)"
  [ -d "$REF/.git" ] || git clone --quiet --filter=blob:none --no-checkout \
      https://github.com/leanprover-community/mathlib4 "$REF" || die "could not clone upstream Mathlib"
  git -C "$REF" fetch --quiet --tags origin || die "could not update $REF"

  say "Is $REV part of upstream Mathlib?"
  if git -C "$REF" merge-base --is-ancestor "$REV" origin/master 2>/dev/null; then
    echo "yes: on master, committed $(git -C "$REF" show -s --format=%cs "$REV")"
  else
    REFS=$(git -C "$REF" for-each-ref --contains "$REV" --format='%(refname:short)' refs/remotes refs/tags 2>/dev/null | head -5)
    [ -n "$REFS" ] || die "commit $REV is not reachable from any upstream branch or tag (fork-only or nonexistent)"
    echo "not on master, but contained in upstream refs:"; printf '  %s\n' $REFS
  fi

  say "Other packages versus Mathlib's own manifest at that commit"
  git -C "$REF" show "$REV:lake-manifest.json" > "$WORKDIR/mathlib-manifest.json" || die "could not read Mathlib's manifest"
  if python3 -I "$PY" compare "$MAN" "$WORKDIR/mathlib-manifest.json"; then
    echo "RESULT: dependencies are exactly upstream Mathlib's."
  else
    echo "RESULT: dependencies DIFFER from upstream Mathlib's (see above). Resolve before trusting a Challenge built on them."
    return 1
  fi
}

cmd_build() {
  ROOT=$(find_root); [ -n "$ROOT" ] || die "run '$0 fetch' first"
  command -v lake >/dev/null || die "lake not found; install elan (https://lean-lang.org/install/)"
  cd "$ROOT" || die "cannot cd to $ROOT"

  say "Toolchain"
  lake --version || die "elan could not install the toolchain in lean-toolchain"

  if grep -q '"mathlib"' lake-manifest.json 2>/dev/null || grep -qi mathlib lakefile.* 2>/dev/null; then
    say "Fetching Mathlib build cache (official prebuilt Mathlib only)"
    lake exe cache get || echo "cache fetch failed; Mathlib will be compiled from source (an hour or more)"
  fi

  say "lake build (log: $WORKDIR/build.log)"
  START=$(date +%s)
  lake build 2>&1 | tee "$WORKDIR/build.log"
  STATUS=${PIPESTATUS[0]}
  echo
  echo "elapsed: $(( $(date +%s) - START )) s"
  echo "errors:   $(grep -cE '(^|: )error:' "$WORKDIR/build.log")"
  echo "sorry warnings: $(grep -c "declaration uses 'sorry'" "$WORKDIR/build.log")"
  if [ "$STATUS" -eq 0 ]; then
    echo "RESULT: lake build succeeded (exit 0)."
    echo "Compiling is not the same as proving the claim. Next:"
    echo "  $0 axioms <Module.Name> <theorem_name>"
  else
    echo "RESULT: lake build FAILED (exit $STATUS). First errors:"
    grep -nE '(^|: )error:' "$WORKDIR/build.log" | head -10
  fi
  return "$STATUS"
}

cmd_axioms() {
  [ $# -eq 2 ] || die "usage: $0 axioms <Module.Name> <theorem_name>"
  ROOT=$(find_root); [ -n "$ROOT" ] || die "run '$0 fetch' first"
  cd "$ROOT" || die "cannot cd to $ROOT"
  T="$WORKDIR/AxiomCheck.lean"
  printf 'import %s\n#check @%s\n#print axioms %s\n' "$1" "$2" "$2" > "$T"
  say "Statement and axioms of $2"
  lake env lean "$T"
  echo
  echo "A clean result lists only propext, Classical.choice and Quot.sound."
  echo "sorryAx means an unfinished proof; Lean.ofReduceBool means native_decide; any other name is an added axiom."
}

case "${1:-}" in
  download) cmd_download ;;
  inspect)  cmd_inspect ;;
  deps)     cmd_deps ;;
  fetch)  cmd_download && cmd_inspect ;;
  root)   r=$(find_root); [ -n "$r" ] || die "no project found; run '$0 inspect' first"; echo "$r" ;;
  build)  cmd_build ;;
  axioms) shift; cmd_axioms "$@" ;;
  *) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
