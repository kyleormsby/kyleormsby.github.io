#!/bin/bash
set -o pipefail
export LEAN_ABORT_ON_PANIC=1
cd ~/rh/src/lean || exit 1
T="Quot Quot.mk Quot.lift Quot.ind riemannHypothesis riemannZeta_eq_zero_re LFunction_ne_zero_of_half_lt_re LFunction_eq_zero_re LFunction_eq_zero_re_of_isPrimitive propext Quot.sound Classical.choice Nat.add Nat.sub Nat.mul Nat.pow Nat.gcd Nat.div Nat.mod Nat.beq Nat.ble Nat.land Nat.lor Nat.xor Nat.shiftLeft Nat.shiftRight String.ofList Char.ofNat List eagerReduce Nat String String.mk Char optParam autoParam semiOutParam outParam"
lake env ~/landrun/landrun --best-effort --rox / --rw /dev --env PATH --env HOME --env LEAN_PATH --env LEAN_ABORT_ON_PANIC -- \
  ~/comparator/.lake/packages/lean4export/.lake/build/bin/lean4export Main -- $T \
  | tee >(sha256sum > ~/rh/solution.sha256) >(wc -c > ~/rh/solution.bytes) \
  | zstd -q -f -T16 --long=30 -o ~/rh/solution.ndjson.zst
echo "pipeline exit: $?"
