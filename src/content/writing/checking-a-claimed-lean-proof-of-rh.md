---
title: "Checking a claimed Lean proof of the Riemann Hypothesis"
date: 2026-11-24
tags:
  - mathematics
  - lean
---

There is a four-page note at [alpo.ge/remark.pdf](https://alpo.ge/remark.pdf) in which Levent Alpöge says he believes that he and Claude have found a proof of the Riemann Hypothesis, by a method that extends to Dirichlet $L$-functions. The note sketches a strategy, says the full argument is very long and not yet in readable form, and offers something else in place of a paper: a Lean formalization. A footnote links to fourteen files named `lean.tar.gz.part01` through `part14`.

I am a homotopy theorist, and I am not going to pretend to evaluate the number theory. But a formal proof makes an unusual offer: you don't have to understand it to check it. So I downloaded the files and tried to take the offer literally. This post is a log of what that involved.

*Caveat*: Alpöge produced his proof with Claude, and I used Claude extensively to set up and run Lean verification. (I also used Claude to summarize the project, and I rewrote and added to its summary to produce this blog post.) The verdict does not depend on AI. It comes from programs that check proofs.

The short version: it checks. Starting from those fourteen files, a fresh build on a machine I control produced exactly the proof object that others have published, and two independent proof checkers accept it and confirm that it proves [Mathlib](https://github.com/leanprover-community/mathlib4)'s statement of the Riemann Hypothesis. Getting there took a weekend, two detours, and one abandoned plan.

## Why "it compiles" isn't the question

The naive check is to run `lake build` and see whether it finishes. That tells you the kernel accepted every proof in the project, relative to whatever the project itself declares. It does not tell you that the theorem at the end is the one you care about. A project can define its own `RiemannHypothesis` that says something easier. It can add an axiom. It can ship pre-compiled files that don't match their source. And its build script is a program, as in effect is every Lean file, so building a stranger's project means running a stranger's code.

The tool built for this situation is [Comparator](https://github.com/leanprover/comparator), from the Lean FRO. You write a short *challenge* file that states the theorem and leaves the proof as `sorry`. The untrusted project is the *solution*. Comparator builds both inside a sandbox and then checks three things:

1. the solution's theorem has exactly the challenge's statement, down to every definition the statement mentions;
2. its proof uses no axioms beyond the ones you permit;
3. the kernel accepts the whole thing when it is replayed from scratch.

So the only Lean I have to read and believe is the Lean I wrote, plus Mathlib.

## What's in the box

The fourteen parts reassemble into a 239 MB archive. Unpacked, it is:

- 175,187 Lean files,
- 17.4 million lines, about a gigabyte of source,
- a short declarative build file, and a pin to Lean 4.33.1 with the matching Mathlib release,
- no pre-compiled anything.

For scale, Mathlib at that release is 8,312 files. This is twenty-one times that. Nobody is going to read it, which is rather the point of the exercise.

The top of the tree is tidy. `Statements.lean` is 16 lines defining four propositions, and `Main.lean` is 12 lines proving five theorems. The first is

```lean
theorem riemannHypothesis : RiemannHypothesis := rhOfAll
```

where `RiemannHypothesis` is Mathlib's own definition: every zero of $\zeta$ other than the trivial ones has real part $1/2$. The other four concern Dirichlet $L$-functions, including the statement that every zero of $L(\chi, s)$ in the critical strip lies on the critical line.

Before running a single line of it, we checked what could be checked by reading:

- The dependency pins match upstream Mathlib's `v4.33.1` tag exactly, package by package.
- There is no `sorry`, no `axiom`, and no `native_decide` anywhere in the source.
- `Main.lean` transitively imports all 175,187 files.
- 974 files declare notation or macros. I have not read them. That is what item 1 above is for.

## The setup

Comparator's sandbox is Linux-only, and I was not going to build this on my laptop, so the check ran on a fresh [Jetstream2](https://docs.jetstream-cloud.org/general/vmsizes/) instance with nothing else on it: an `m3.2xl`, which is 64 virtual cores, 250 GB of RAM, and (as it turned out, optimistically) a 500 GB disk.

There was one wrinkle. As of Lean 4.35, Comparator is built into the toolchain as `lake comparator`. But the project is pinned to 4.33.1, and compiled Lean files do not travel between versions. So I used the older standalone Comparator at its `v4.33.0` tag, rebuilt against 4.33.1, with [landrun](https://github.com/Zouuup/landrun) as the sandbox.

Before pointing it at the Riemann Hypothesis I pointed it at Comparator's own test cases. It accepted a proof that addition of natural numbers commutes, and it rejected a "solution" that merely asserted the same thing as an axiom. Good.

The challenge file is five lines of substance:

```lean
import Statements

theorem riemannHypothesis : RiemannHypothesis := by sorry
theorem riemannZeta_eq_zero_re : RiemannZetaZerosOnLine := by sorry
theorem LFunction_ne_zero_of_half_lt_re : DirichletLNonvanishingRightOfHalf := by sorry
theorem LFunction_eq_zero_re : DirichletLZerosOnLine := by sorry
theorem LFunction_eq_zero_re_of_isPrimitive : PrimitiveDirichletLZerosOnLine := by sorry
```

It imports the project's 16-line `Statements.lean`, which I did read, and which imports only Mathlib. The permitted axioms are the usual three: `propext`, `Quot.sound`, and `Classical.choice`.

## The build

The build started at about 8:25 on the morning of Friday, November 20, Pacific time, and finished a little after ten that night: thirteen hours of compiling on 64 cores, 183,893 build jobs, no errors, and no `sorry` anywhere but in my own challenge file. Two things went wrong on the way, neither of them the proof's fault.

**The progress bar lied.** Lake prints a counter like `[41139/41412]`, and an hour and forty minutes in, Claude and I read that as 99% done. Twenty minutes later it said `[46845/47290]`. The denominator is not a total; it is how much work Lake has discovered so far. The real total was 183,893, and we were a quarter of the way there.

**The disk filled with JSON.** A little after three hours, the 500 GB disk was at 85% and climbing by more than 100 GB an hour. We stopped the build with 59,413 files compiled, 34% of the way through, and looked. The compiled proofs came to 34 GB. The other 377 GB was scratch: before compiling each file, Lake writes out a JSON list of everything that file transitively imports, and then never looks at it again. With 175,000 files that each import tens of thousands of others, the lists add up quadratically. Claude read Lake's source to confirm the files are write-once, read-once; we tested deleting one; then we deleted them all and left a loop running that swept up any more than ten minutes old. The build resumed where it left off. The finished build is about 100 GB.

## The plan changes

Compiling was supposed to be the long part. Comparator's remaining steps are to export the proofs to a plain data file, compare the statements, and replay everything through the kernel. They turned out to be the hard part.

**A watchdog killed the export.** An hour and a half into the export, the run died without a word. The culprit was `systemd-oomd`, a service that kills jobs when the system spends too long shuffling memory. It fired with 92 GB of RAM still free. We turned it off and started again on Saturday morning. Before restarting we re-downloaded Mathlib and rebuilt the two trusted files from source, so that the challenge was once again captured from a state the untrusted build had never touched. None of the 175,187 project files needed recompiling.

**The replay would not end.** The second attempt got through the export. At that point the standalone Comparator was holding the proof in about 345 GB of memory on a 250 GB machine, with the excess parked in swap, and replaying it through the Lean 4.33.1 kernel on one core. Eighteen hours of CPU later it was still going, with no way to see how far along it was.

By then the picture outside had changed. The Lean and Mathlib communities had published [a joint statement](https://leanprover-community.github.io/blog/posts/riemann-hypothesis/) reporting that several independent checkers accept the proof, and Andrew Sutherland's [results page](https://math.mit.edu/~drew/grh/) gave a fingerprint for the exported proof: 61,570,595,788 bytes, with a SHA-256 hash. When I looked, it also listed the official kernel's single-threaded replay as still running there.

That reframed things. A pass from the 4.33.1 kernel alone was always going to be the weakest evidence on offer (more on that below), and I was spending 64 cores' worth of allocation to keep one core busy for an unknown number of days. So on Sunday morning we stopped it and asked a different question: does my build produce the same object theirs did?

## The ending

It does.

**The export matches.** Exporting the five theorems and everything they depend on took about two hours and produced a file of exactly 61,570,595,788 bytes with SHA-256 `5ea74b91…be244e`, byte for byte the published one. My copy came from the original fourteen files, compiled in a sandbox on a machine that had never seen anyone else's build. So every check that anyone has run on the published export is a check on mine.

**nanoda accepts it.** nanoda is a proof checker written in Rust that shares no code with Lean's kernel. On 64 threads it took 54 minutes and accepted every proof.

**con-leche accepts it, and the statements match.** [con-leche](https://github.com/leanprover/con-leche) is another independent checker, one the community statement describes as having a formal proof of its own soundness. Its compare mode takes my challenge and the solution. It accepted all 1,468,418 declarations and reported each of my five theorems as "justified by the solution". That took about ten minutes and 46 GB of memory.

So the three things I wanted from Comparator all happened, by a different route: the statements match the ones I wrote, the axioms are the standard three, and the proofs are accepted by kernels that are not the one the project was built with.

## What the proof is made of

While the kernels ground away I got curious about the shape of the thing. Claude wrote a small program that starts at `riemannHypothesis` and follows every reference: the declarations its proof uses, the ones those use, and so on down to the axioms.

- The theorem depends on 1,478,219 declarations, counting the auxiliary ones Lean generates.
- The only axioms among them are `propext`, `Quot.sound` and `Classical.choice`.
- 146,437 of the project's 175,187 files contribute at least one declaration. That is 84%, so about one file in six plays no part in RH. (I only traced RH; some of the rest may serve the four theorems about $L$-functions.)
- 65% of the project's 1.95 million declarations are used, along with 203,035 from Mathlib, about a third of it.
- The most distant dependency is 52 steps from the theorem.

### Something odd on the main road

Eight steps down from the theorem, the proof uses this definition:

```lean
def anyGeometry : GeoP := fun _ _ _ => True
```

`GeoP` is the project's type for a "geometry" condition on certain data. This particular condition holds of everything. Right beside it in the same file is `geoOf`, a geometry condition with two substantive clauses. The proof of RH never touches either clause.

Further down, at step 21, the proof passes through an object the code itself names `geoDegenerate`. It is a "geometric model" in which effectivity, nefness, bigness and base-point-freeness are each defined to be `True`, volumes and norms are zero, and the spaces of points and metrics have one element.

If you don't speak Lean, here is the analogy I'd offer. Suppose a paper's key lemma reads: let $X$ be a variety with such-and-such positivity; then the estimate holds. You look at where the lemma is used, and $X$ is always a point. Nothing false has been said. But positivity on $X$ cannot be what makes the estimate true.

**Does this undermine the verification?** No, for two reasons. The final theorem is stated in Mathlib's vocabulary, not the project's, so an empty definition inside the project cannot water down what was proved. It can only water down intermediate lemmas. And a watered-down lemma gives the next step less to work with, which the checker verifies too. Logic doesn't care that a witness is boring, only that it satisfies the stated conditions.

**What does it say about the proof?** That it can probably be made smaller, and that there are two kinds of dead weight. Some code is simply unused, and can be deleted; the community's copy of the repository has started doing that. Other code is used but empty, like the above. That can't just be deleted, because lemmas mention it. But a lemma that is only ever applied to a point can be restated as a lemma about a point, and then its hypotheses about $X$ evaporate. Whatever survives that kind of simplification is the actual proof, and it may be shorter, and shaped differently, than its file names suggest.

Two caveats: I examined only this one layer of a very large development, and I have not traced what the rest of it does. I also don't know how the proof came to look like this, so I won't speculate.

## What this does and doesn't establish

From my own runs, I can vouch for the following.

1. The released sources build, in a sandbox, with no errors and no `sorry`.
2. The proof object that build produces is identical to the published one.
3. Two independent checkers accept every proof in it.
4. One of them confirms that the five theorems are the ones I stated.
5. The Riemann Hypothesis theorem depends on no axioms beyond the standard three.

I am still trusting some things.

- **Mathlib's definitions.** That its $\zeta$ and its Dirichlet $L$-functions are the ones number theorists mean. For RH itself the statement is Mathlib's alone; for the other four theorems I am also trusting the sixteen lines of `Statements.lean`.
- **The checkers.** Two unrelated programs agreeing is strong, but they are programs.
- **The sandbox.** It prevented the build from writing outside its own directory. On the kernel I was running it could not block outgoing UDP, so I would not call it airtight against exfiltration; the machine held nothing worth taking.
- **The hardware.**

I did not finish one thing I set out to do: the replay through Lean's own 4.33.1 kernel. I no longer think it matters much, for the following reason: Lean's kernel has had an eventful year. [Version 4.33.1](https://lean-lang.org/doc/reference/latest/releases/v4.33.1/) was itself a soundness release, fixing two kernel bugs that each allowed a proof of `False`, and it predates [4.34.1](https://lean-lang.org/doc/reference/latest/releases/v4.34.1/), which fixed further bugs in the runtime that the release notes say could be pushed to a proof of `False`. A project pinned to 4.33.1 is therefore exactly the case where you want a second opinion from kernels that share no code with the first. That is what nanoda and con-leche provide.

And then there is what none of this is: understanding. A proof exists. That is not the same as anyone having read one. The note itself says the argument is long, not yet readable, and expected to simplify, and the trivial "geometry" above suggests the simplification could be substantial. A green check mark is the beginning of the mathematics, not the end of it.

## What it cost

About 53 hours of a 64-core instance, roughly 3,400 service units of a Jetstream2 allocation, most of it spent on a kernel replay I ended up not needing. If you want to repeat this, don't do what I did. The community's [repository](https://github.com/leanprover-community/riemann-hypothesis) has instructions for a much cheaper route, and the fast checkers run in minutes once you have the export.

The scripts, configuration files and logs from this check are posted [here](/rh-check/). That includes the challenge file, the Comparator and nanoda configurations, the export script, the two dependency-walk programs, and the log from every stage: the build, the hash of my export, the output of both checkers, and the dependency data behind the numbers above. Treat the logs as a record of what happened on one machine, not as evidence. The point of a formal proof is that you can run the check yourself.
