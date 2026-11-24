import Main
open Lean

namespace DepWalkKO

def suspects : Array String := #[
  "anyGeometry", "geoCl", "GeoCl", "geoDegenerate", "algDegenerate", "padDegenerate",
  "mdlJunk", "divXFl", "divEx_prov", "divEx_of_ox", "hExpl6",
  "rhOfAll", "allChi", "everyCharacter", "plugAll", "rh_of_every",
  "geoOf_surf", "degree_value_of_determinant", "formsTieX"]

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

def walk (env : Environment) (root : Name) : IO Unit := do
  let mut seen : NameSet := {}
  let mut stack : Array Name := #[root]
  let mut count : Nat := 0
  let mut axioms : Array Name := #[]
  let mut missing : Nat := 0
  let mut hitCount : Array Nat := suspects.map fun _ => 0
  let mut hitNames : Array (Array Name) := suspects.map fun _ => #[]
  while !stack.isEmpty do
    let n := stack.back!
    stack := stack.pop
    unless seen.contains n do
      seen := seen.insert n
      count := count + 1
      for i in [0:suspects.size] do
        if hasComponent n suspects[i]! then
          hitCount := hitCount.modify i (· + 1)
          if hitNames[i]!.size < 6 then
            hitNames := hitNames.modify i (·.push n)
      match env.find? n with
      | none => missing := missing + 1
      | some ci =>
        match ci with
        | .axiomInfo _ => axioms := axioms.push n
        | _ => pure ()
        for c in usedBy ci do
          unless seen.contains c do
            stack := stack.push c
  IO.println s!"root: {root}"
  IO.println s!"constants in dependency closure: {count}"
  IO.println s!"names not found in environment: {missing}"
  IO.println s!"axioms in closure: {axioms}"
  for i in [0:suspects.size] do
    IO.println s!"{suspects[i]!}: {hitCount[i]!} {hitNames[i]!}"

end DepWalkKO

set_option maxHeartbeats 0 in
#eval show CoreM Unit from do
  DepWalkKO.walk (← getEnv) `riemannHypothesis
