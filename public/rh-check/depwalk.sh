#!/bin/bash
cd ~/rh/src/lean || exit 1
LEAN=$(elan which lean)
exec systemd-run --property=RestrictAddressFamilies=~AF_UNIX --user --pty \
  -E PATH="$PATH" --working-directory "$PWD" -- \
  bash -c "lake env $HOME/landrun/landrun --best-effort --rox / --rw /dev --env PATH --env HOME --env LEAN_PATH -- $LEAN --tstack=400000 $HOME/rh/DepWalk.lean 2>&1 | tee $HOME/rh/depwalk.log"
