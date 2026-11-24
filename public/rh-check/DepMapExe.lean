import Lean
open Lean

def projectRoots : List String := ["Development", "Formalism", "GroundTheory",
  "ReciprocityTheory", "CompanionTheory", "PositivityTheory", "Lemmata", "Supplements", "BuildAid"]

def targets : Array String := #[
  "anyGeometry", "geoDegenerate", "divXFl", "divEx_prov", "hExpl6",
  "plugWin", "shapeWin", "topDesWin", "linkDIVt_closedK", "wordFacts_of", "divClausesR_of",
  "DivInputsR", "zeroFreeOn_of_tiedWin_cyc", "Hyps", "InGeo", "WeightCaseCondition",
  "HasTrueSurf", "IsGeoOf", "GeoTiedP", "tiedX_fl", "everyCharacter_of_row",
  "every_character_of_theta_integrals_local_matching", "PrincipalizationCertificate"]

def comps : Name → List String
  | .anonymous => []
  | .str p s => comps p ++ [s]
  | .num p n => comps p ++ [toString n]

def groupOf (m : Name) : String :=
  let cs := comps m
  match cs with
  | [] => "(none)"
  | r :: _ =>
    let k := if r == "Mathlib" then 2 else if projectRoots.contains r then 3 else 1
    let dir := cs.dropLast
    let base := if dir.isEmpty then cs else dir
    ".".intercalate (base.take k)

def hasComponent : Name → String → Bool
  | .str p t, s => t == s || hasComponent p s
  | .num p _, s => hasComponent p s
  | .anonymous, _ => false

def usedBy (ci : ConstantInfo) : Array Name :=
  let fromType := ci.type.getUsedConstants
  let fromValue := ((ci.value? (allowOpaque := true)).map (·.getUsedConstants)).getD #[]
  let extra : Array Name := match ci with
    | .inductInfo v => v.ctors.toArray
    | .ctorInfo v => #[v.induct]
    | .recInfo v => v.all.toArray
    | _ => #[]
  fromType ++ fromValue ++ extra

structure G where
  filesTotal : Nat := 0
  filesUsed : Nat := 0
  constsTotal : Nat := 0
  constsUsed : Nat := 0
  thmsUsed : Nat := 0
  minDepth : Nat := 1000000
  deriving Inhabited

def pathTo (parent : Std.HashMap Name Name) (n : Name) : Nat → Array Name → Array Name
  | 0, acc => acc.push n
  | fuel + 1, acc =>
    match parent.get? n with
    | none => acc.push n
    | some p => pathTo parent p fuel (acc.push n)

def run (env : Environment) (root : Name) : IO Unit := do
  let modNames := env.header.moduleNames
  let modData := env.header.moduleData
  let mut grpNames : Array String := #[]
  let mut grpId : Std.HashMap String Nat := {}
  let mut grpIdOfMod : Std.HashMap Name Nat := {}
  let mut stats : Array G := #[]
  for i in [0:modNames.size] do
    let m := modNames[i]!
    let g := groupOf m
    let mut id := grpNames.size
    match grpId.get? g with
    | some j => id := j
    | none =>
      grpNames := grpNames.push g
      grpId := grpId.insert g id
      stats := stats.push {}
    grpIdOfMod := grpIdOfMod.insert m id
    let nConsts := match modData[i]? with
      | some d => d.constNames.size
      | none => 0
    stats := stats.modify id fun s =>
      { s with filesTotal := s.filesTotal + 1, constsTotal := s.constsTotal + nConsts }
  let unknownId := grpNames.size
  grpNames := grpNames.push "(none)"
  stats := stats.push {}
  let gmap := grpIdOfMod
  let gid := fun (n : Name) => match env.getModuleIdxFor? n with
    | some idx => gmap.getD (modNames.getD idx.toNat Name.anonymous) unknownId
    | none => unknownId
  let mut seen : NameSet := ({} : NameSet).insert root
  let mut parent : Std.HashMap Name Name := {}
  let mut frontier : Array Name := #[root]
  let mut depth : Nat := 0
  let mut count : Nat := 0
  let mut usedMods : NameSet := {}
  let mut usedModCount : Nat := 0
  let mut edges : Std.HashMap Nat Nat := {}
  let mut firstHit : Array (Option Name) := targets.map fun _ => none
  let mut hitCount : Array Nat := targets.map fun _ => 0
  while !frontier.isEmpty do
    let mut next : Array Name := #[]
    for n in frontier do
      count := count + 1
      if count % 100000 == 0 then
        IO.eprintln s!"P\t{count} declarations visited, depth {depth}"
      let g := gid n
      for i in [0:targets.size] do
        if hasComponent n targets[i]! then
          hitCount := hitCount.modify i (· + 1)
          if firstHit[i]!.isNone then
            firstHit := firstHit.set! i (some n)
      if let some idx := env.getModuleIdxFor? n then
        let m := modNames.getD idx.toNat Name.anonymous
        unless usedMods.contains m do
          usedMods := usedMods.insert m
          usedModCount := usedModCount + 1
          stats := stats.modify g fun s => { s with filesUsed := s.filesUsed + 1 }
      match env.find? n with
      | none => pure ()
      | some ci =>
        let isThm := match ci with
          | .thmInfo _ => true
          | _ => false
        stats := stats.modify g fun s =>
          { s with constsUsed := s.constsUsed + 1,
                   thmsUsed := s.thmsUsed + (if isThm then 1 else 0),
                   minDepth := min s.minDepth depth }
        for c in usedBy ci do
          let g2 := gid c
          if g2 != g then
            let key := g * 1000000 + g2
            edges := edges.insert key (edges.getD key 0 + 1)
          unless seen.contains c do
            seen := seen.insert c
            parent := parent.insert c n
            next := next.push c
    frontier := next
    depth := depth + 1
  IO.println s!"S\t{root}\t{count}\t{depth}\t{usedModCount}\t{modNames.size}"
  for i in [0:grpNames.size] do
    let s := stats[i]!
    IO.println s!"N\t{grpNames[i]!}\t{s.filesTotal}\t{s.filesUsed}\t{s.constsTotal}\t{s.constsUsed}\t{s.thmsUsed}\t{s.minDepth}"
  for (key, k) in edges.toList do
    IO.println s!"E\t{grpNames[key / 1000000]!}\t{grpNames[key % 1000000]!}\t{k}"
  for i in [0:targets.size] do
    match firstHit[i]! with
    | none => IO.println s!"C\t{targets[i]!}\t0\t"
    | some h =>
      let chain := (pathTo parent h 100000 #[]).reverse
      let chainStr := " > ".intercalate (chain.toList.map fun n => n.toString)
      IO.println s!"C\t{targets[i]!}\t{hitCount[i]!}\t{chainStr}"

def main : IO Unit := do
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := `Main }] {}
  run env `riemannHypothesis
