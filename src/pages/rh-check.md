---
layout: ../layouts/Page.astro
title: "rh check: scripts and logs"
label: "writing · november 2026"
lede: "The files I ran, and the logs they produced, while checking the released Lean proof of the Riemann Hypothesis."
description: "Scripts, configuration files and logs from an independent check of the Lean proof of the Riemann Hypothesis linked from alpo.ge/remark.pdf."
---

These go with the post [Checking a claimed Lean proof of the Riemann Hypothesis](/writing/checking-a-claimed-lean-proof-of-rh/). The scripts were written with Claude. Everything ran on one [Jetstream2](https://docs.jetstream-cloud.org/general/vmsizes/) `m3.2xl` instance between 20 and 22 November 2026.

Treat the logs as a record of what happened on one machine, not as evidence. The point of a formal proof is that you can run the check yourself, and the community's [repository](https://github.com/leanprover-community/riemann-hypothesis) has a much cheaper route than mine.

**Download:** [`rh-check.zip`](/rh-check/rh-check.zip) (172 KB) has every file below except the three build logs, which are large and linked separately. [`README.txt`](/rh-check/README.txt) says the same things as this page.

Not here: the project itself, which is linked from [alpo.ge/remark.pdf](https://alpo.ge/remark.pdf), and the 61.6 GB proof export, whose size and hash are recorded below.

## Setup and inputs

- [`check_lean_parts.sh`](/rh-check/check_lean_parts.sh) downloads and reassembles the fourteen parts, lists and scans the archive, and checks the dependency pins against upstream Mathlib. Its header lists the subcommands.
- [`fetch.log`](/rh-check/fetch.log) is the output of its `fetch` step: part sizes and hashes, a summary of the archive, and the source scan.
- [`deps.log`](/rh-check/deps.log) is the output of its `deps` step: the pinned packages compared with Mathlib's own manifest at tag `v4.33.1`.
- [`Challenge.lean`](/rh-check/Challenge.lean) is the challenge file. It goes in the project's `src/` directory.
- [`comparator.json`](/rh-check/comparator.json) is the Comparator configuration: five theorem names and three permitted axioms.
- [`lakefile.toml`](/rh-check/lakefile.toml) is the project's lakefile with one addition, the `Challenge` library at the end. The rest is as released.
- [`smoke-simple_match.log`](/rh-check/smoke-simple_match.log) and [`smoke-simple_mismatch.log`](/rh-check/smoke-simple_mismatch.log) are Comparator's own two test cases, run on this machine before the real thing. The first is accepted and the second is rejected, as they should be.

## The build

The tools were Lean 4.33.1, the standalone Comparator at tag `v4.33.0` rebuilt with Lean 4.33.1, lean4export, and landrun as the sandbox.

- [`comparator-1.log.xz`](/rh-check/comparator-1.log.xz) (2.9 MB, 64 MB unpacked) is the first run, on 20 November. I stopped it after 59,408 project files, when the disk had filled with Lake's `*.setup.json` scratch files.
- [`comparator-2.log.xz`](/rh-check/comparator-2.log.xz) (7.6 MB, 174 MB unpacked) is the resumed run. It compiles the remaining 115,779 files and ends with `Build completed successfully (183893 jobs)`. The export step that followed was killed by `systemd-oomd` and left nothing in the log.
- [`comparator-3.log.xz`](/rh-check/comparator-3.log.xz) (6.7 MB, 169 MB unpacked) is the third run, on 21 November, after turning `systemd-oomd` off, re-downloading Mathlib and rebuilding `Statements` and `Challenge` from source. The project build is replayed, not redone. The export and the start of the Lean 4.33.1 kernel replay followed. I stopped the replay on 22 November after about eighteen CPU-hours, and those stages left nothing in the log.
- [`mem.log`](/rh-check/mem.log) has periodic snapshots of memory use and of the `comparator` and `lean4export` processes during the export and kernel-replay stages.

None of the three build logs has a line beginning `error:`. The only ``declaration uses `sorry` `` warnings are the five in `Challenge.lean`. Nearly all of the bulk is linter warnings. Unpack with `xz -d`.

The Comparator runs were started from the project directory with a small wrapper, `~/run_comparator.sh comparator.json comparator.log`. I deleted the instance without copying the wrapper off it. Reproduced from the session transcript, it was:

```bash
#!/bin/bash
exec systemd-run --property=RestrictAddressFamilies=~AF_UNIX --user --pty \
  -E PATH="$PATH" \
  -E COMPARATOR_LANDRUN="$HOME/landrun/landrun" \
  -E COMPARATOR_LEAN4EXPORT="$HOME/comparator/.lake/packages/lean4export/.lake/build/bin/lean4export" \
  --working-directory "$PWD" -- \
  bash -c "set -o pipefail; lake env $HOME/comparator/.lake/build/bin/comparator $1 2>&1 | tee $2"
```

## Export and independent checkers

- [`export.sh`](/rh-check/export.sh) exports the five theorems and everything they depend on with lean4export, inside the sandbox, hashing the stream as it is written. The list of export targets is the one the community repository uses.
- [`solution.sha256`](/rh-check/solution.sha256) and [`solution.bytes`](/rh-check/solution.bytes) are the hash and size of that export: `5ea74b912147c5c93cc2b6d70cc727cf908df2f62ac6a20480a3fa02f6be244e` and 61,570,595,788 bytes. These match the values on Andrew Sutherland's [results page](https://math.mit.edu/~drew/grh/).
- [`nanoda.json`](/rh-check/nanoda.json) is the configuration for `nanoda_bin`, the copy that ships with Lean 4.36.0.
- [`nanoda-result.txt`](/rh-check/nanoda-result.txt): nanoda prints nothing when it accepts, so its log was empty. This is the exit status and timing, copied from the terminal.
- [`conleche.log`](/rh-check/conleche.log) is the output of con-leche in compare mode on the challenge and solution exports.

## Dependency walk

- [`DepWalk.lean`](/rh-check/DepWalk.lean), [`depwalk.sh`](/rh-check/depwalk.sh) and [`depwalk.log`](/rh-check/depwalk.log) are a first pass, run inside Lean. It counts the declarations reachable from `riemannHypothesis`, lists the axioms among them, and reports whether each name on a short hand-picked list occurs.
- [`DepMapExe.lean`](/rh-check/DepMapExe.lean) is a compiled version that also records where each declaration lives, and [`depmap.log`](/rh-check/depmap.log) (1.1 MB) is its output. I did not keep its lakefile; it declared one executable with `supportInterpreter = true`, on Lean 4.33.1.

`depmap.log` is tab-separated, and the first field of each line says what it is:

- `P`: progress.
- `S`: root, declarations reached, number of levels (root included), modules used, modules in total.
- `N`: group, files, files used, declarations, declarations used, theorems used, fewest steps from the root.
- `E`: group, group, number of references from the first to the second.
- `C`: name looked for, declarations matching it, and the chain of references by which the first match was reached.

A group is a directory of the project three levels deep, or of Mathlib two levels deep.
