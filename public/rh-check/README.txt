Scripts and logs: checking the released Lean proof of the Riemann Hypothesis
Kyle Ormsby, November 2026

Write-up: https://e-infinity.space/writing/checking-a-claimed-lean-proof-of-rh/

These are the files I ran, and the logs they produced, while checking the Lean
project linked from https://alpo.ge/remark.pdf. The scripts were written with
Claude. Everything ran on one Jetstream2 m3.2xl instance (64 virtual cores,
250 GB of RAM, Linux 7.0, default user "exouser") between 20 and 22 November
2026.

Treat the logs as a record of what happened on one machine, not as evidence.
The point of a formal proof is that you can run the check yourself. If you
want to, the community repository has a much cheaper route than mine:
https://github.com/leanprover-community/riemann-hypothesis

Not here: the project itself (get it from the link above) and the 61.6 GB
proof export (its size and SHA-256 are in solution.bytes and solution.sha256).


SETUP AND INPUTS

check_lean_parts.sh
    Downloads and reassembles the fourteen parts, lists and scans the
    archive, and checks the dependency pins against upstream Mathlib. Its
    header lists the subcommands.
fetch.log
    Output of "check_lean_parts.sh fetch": part sizes and hashes, the
    archive listing summary, and the source scan.
deps.log
    Output of "check_lean_parts.sh deps": the pinned packages compared with
    Mathlib's own manifest at tag v4.33.1.
Challenge.lean
    The challenge file. It goes in the project's src/ directory.
comparator.json
    The Comparator configuration: five theorem names, three permitted axioms.
lakefile.toml
    The project's lakefile with one addition, the "Challenge" library at the
    end. The rest is as released.
smoke-simple_match.log, smoke-simple_mismatch.log
    Comparator's own two test cases, run on this machine before the real
    thing. The first is accepted and the second is rejected, as they should be.


THE BUILD

Tools: Lean 4.33.1; the standalone Comparator at tag v4.33.0, rebuilt with
Lean 4.33.1; lean4export; landrun as the sandbox.

The Comparator runs were started from the project directory with a small
wrapper, "~/run_comparator.sh comparator.json comparator.log". I deleted the
instance without copying the wrapper off it. Reproduced from the session
transcript, it was:

    #!/bin/bash
    exec systemd-run --property=RestrictAddressFamilies=~AF_UNIX --user --pty \
      -E PATH="$PATH" \
      -E COMPARATOR_LANDRUN="$HOME/landrun/landrun" \
      -E COMPARATOR_LEAN4EXPORT="$HOME/comparator/.lake/packages/lean4export/.lake/build/bin/lean4export" \
      --working-directory "$PWD" -- \
      bash -c "set -o pipefail; lake env $HOME/comparator/.lake/build/bin/comparator $1 2>&1 | tee $2"

comparator-1.log.xz   (64 MB unpacked)
    First run, 20 November. Stopped by hand after 59,408 project files, when
    the disk had filled with Lake's *.setup.json scratch files.
comparator-2.log.xz   (174 MB unpacked)
    The resumed run. It compiles the remaining 115,779 files and ends with
    "Build completed successfully (183893 jobs)". The export step that
    followed was killed by systemd-oomd and left nothing in the log.
comparator-3.log.xz   (169 MB unpacked)
    Third run, 21 November, after turning systemd-oomd off, re-downloading
    Mathlib and rebuilding Statements and Challenge from source. The project
    build is replayed, not redone. The export and the start of the Lean
    4.33.1 kernel replay followed; I stopped the replay on 22 November after
    about eighteen CPU-hours, and those stages left nothing in the log.

    None of the three logs has a line beginning "error:". The only
    "declaration uses `sorry`" warnings are the five in Challenge.lean.
    Nearly all of the bulk is linter warnings. Unpack with "xz -d".
mem.log
    Periodic snapshots of memory use and of the comparator and lean4export
    processes during the export and kernel-replay stages.


EXPORT AND INDEPENDENT CHECKERS

export.sh
    Exports the five theorems and everything they depend on with lean4export,
    inside the sandbox, hashing the stream as it is written. The list of
    export targets is the one the community repository uses.
solution.sha256, solution.bytes
    The hash and size of that export:
    5ea74b912147c5c93cc2b6d70cc727cf908df2f62ac6a20480a3fa02f6be244e
    61,570,595,788 bytes
    These match the values published at https://math.mit.edu/~drew/grh/.
nanoda.json
    Configuration for nanoda_bin, the copy that ships with Lean 4.36.0.
nanoda-result.txt
    nanoda prints nothing when it accepts, so its log was empty. This is the
    exit status and timing, copied from the terminal.
conleche.log
    Output of con-leche in compare mode on the challenge and solution exports.


DEPENDENCY WALK

DepWalk.lean, depwalk.sh, depwalk.log
    A first pass, run inside Lean. It counts the declarations reachable from
    riemannHypothesis, lists the axioms among them, and reports whether each
    name on a short hand-picked list occurs.
DepMapExe.lean, depmap.log
    A compiled version that also records where each declaration lives. I did
    not keep its lakefile; it declared one executable with
    supportInterpreter = true, on Lean 4.33.1. The log is tab-separated:

    P   progress
    S   root, declarations reached, number of levels (root included),
        modules used, modules in total
    N   group, files, files used, declarations, declarations used,
        theorems used, fewest steps from the root
    E   group, group, number of references from the first to the second
    C   name looked for, declarations matching it, and the chain of
        references by which the first match was reached

    A group is a directory of the project three levels deep, or of Mathlib
    two levels deep.
