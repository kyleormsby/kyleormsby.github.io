---
title: "When something is nothing"
date: 2017-06-03
tags:
  - mathematics
  - homotopy theory
source: https://thebrightobvious.wordpress.com/2017/06/03/when-something-is-nothing/
---

I'd like to tell you when something is nothing, where "something" refers to the bigraded homotopy sheaves of the motivic sphere spectrum, "nothing" means that this sheaf is 0, and "when" means a specific range of bigradings. These results are recorded formally in a recent preprint I coauthored with [Oliver Röndigs](https://www.mathematik.uni-osnabrueck.de/index.php?id=1956) and [Paul Arne Østvær](https://www.mn.uio.no/math/english/people/aca/paularne/):

- Vanishing in stable motivic homotopy sheaves [[arXiv:1704.04744](https://arxiv.org/abs/1704.04744)]

The paper breaks down into two parts. First, we determine a vanishing range in the bigraded stable stems of the $\eta$-complete motivic sphere spectrum. We then use a sequence of fracture squares and [Bachmann's theorem](https://arxiv.org/abs/1608.08855) identifying $\rho$-periodic motivic spectra with sheaves of spectra on the real étale site to "uncomplete" our vanishing region.

In order to frame this theorem, let's recall a few well-known characteristics of motivic stable stems. I'll use the "$m+n\alpha$" grading in which $m$ tells you the number of simplicial circles and $n$ is the number of geometric circles, $\mathbb{A}^1 - 0$, and I'll write $\pi_{m+n\alpha}$ for the $(m+n\alpha)$-th homotopy sheaf of the sphere spectrum (primarily because I don't want to fiddle with too much fancy formatting in WordPress). Morel's connectivity theorem tells us that $\pi_{m+n\alpha} = 0$ for $m < 0$, so we have an entire half plane vanishing region already. Morel has also computed $\pi_{0+n\alpha}$ in terms of Milnor-Witt $K$-theory, which is nonzero for every $n$, so the $\mathbb{Z}$-graded sheaf $\pi_{m+*\alpha}$ is not bounded in general!

Inspired by Morel's theorem, let's call $\pi_{m+*\alpha}$ the *$m$-th Milnor-Witt stem* (of the motivic sphere). Work of [Andrews and Miller](http://math.mit.edu/~mjandr/Inverting_the_Hopf_map.pdf) [pdf] on the $\eta$-periodic motivic sphere tells us that the $m$-th Milnor-Witt stem over over a characteristic 0 field is in fact not bounded whenever $m$ is nonnegative and congruent to 0 or 3 mod 4. Perhaps the Milnor-Witt stems are generically unbounded?

This turns out to not be the case, and we prove it in our paper. The $\eta$-complete variant is especially clean:

> **Theorem.** The $(m+n\alpha)$-th homotopy sheaf of the $\eta$-complete sphere spectrum is 0 whenever $m > 0$, $m$ is congruent to 1 or 2 mod 4, and $2n > \max\{3m+5, 4m\}$.

The proof of this theorem is a "simple" application of the slice spectral sequence, at least after the pioneering work of [Röndigs-Spitzweck-Østvær](https://arxiv.org/abs/1604.00365). This spectral sequence converges to the $\eta$-complete motivic stable stems, and its $E_1$-page is given by applying a shift of the motivic Eilenberg-MacLane functor to the $E_2$-page of the $MU$-Adams spectral sequence (*i.e.*, the Novikov spectral sequence). By Andrews-Miller, this $E_2$-page only consists of $\eta$-towers above a piecewise-linear curve. These towers of $\mathbb{F}_2$'s transform into towers of motivic $H\mathbb{F}_2$'s in the slice spectral sequence. The bigraded homotopy sheaf of $H\mathbb{F}_2$ is a polynomial algebra in a single variable $\tau$ over mod 2 Milnor $K$-theory. It turns out that there is a $d_1$ differential in the slice spectral sequence linking these towers by $\tau$-multiplication. When you pass to the $E_2$-page, you're just left with a bunch of mod 2 Milnor $K$-theory groups above the piecewise-linear curve when $m$ is nonnegative and congruent to 0 or 3 mod 4; when $m$ is positive and congruent to 1 or 2 mod 4 and you're above the curve, there are only 0's: that's the vanishing range!

When the base field is nonreal (so $-1$ is a sum of squares), you actually get vanishing for the integral motivic stable stems in the same range (up to a cohomological dimension condition in the positive characteristic case). This follows from Levine's theorem identifying the motivic sphere and $\eta$-complete motivic sphere when the base field has finite cohomological dimension.

When the base field is formally real (so $-1$ is not a sum of squares), the integral vanishing range becomes complicated by topological information:

> **Theorem.** If the base field is formally real, then $\pi_{m+n\alpha} = 0$ if the corresponding $\eta$-complete motivic stable stem is 0 and the $m$-th topological stable stem contains no odd torsion.

We deduce this by analyzing both the $\eta$-primary fracture square and the $\eta$-inverted 2-primary fracture square. In the latter square, the $(2,\eta)$-periodic motivic sphere spectrum appears. But, by the relation $(2+\rho\eta)\eta = 0$ in the 0-th Milnor-Witt stem, this object is the same as the $(2,\rho)$-periodic motivic sphere spectrum. By Bachmann's theorem, the $(2,\rho)$-periodic stable motivic homotopy category is equivalent to the homotopy category of 2-periodic sheaves of spectra on the real étale site of the base field. This category is in turn equivalent to 2-periodic sheaves of spectra on the Harrison space $X$ of orderings of the base field. Passing to a real closure of the base field turns $X$ into a point, in which case we are working with the 2-periodic Spanier-Whitehead category, and this is how the surprising topological condition in the theorem appears.

There's plenty left to study in this area. For instance:

1. Our bounds are not optimal (and are likely far from optimal). I doubt the slice spectral sequence is the right tool for producing optimal bounds, but you could make progress that way.
2. The first two "top" motivic stable stems in bounded Milnor-Witt stems correspond to topological stable stems: $\pi_{1+2\alpha} = \mathbb{Z}/24 = \pi_3$ and $\pi_{2+4\alpha} = \mathbb{Z}/2 = \pi_6$. That's a bit thin to make a conjecture, but perhaps it's the start of a pattern?
3. When a Milnor-Witt stem is bounded above, its structure is constrained by Morel's contraction construction. The contraction $\omega G$ of a sheaf $G$ is what you get when you take the kernel of the natural map $1 : \mathrm{Spec}(F) \to \mathbb{A}^1 - 0$. This corresponds to taking $(\mathbb{A}^1 - 0)$-loops, so on motivic stable stems we have the isomorphism $\omega\pi_{m+n\alpha} = \pi_{m+(n+1)\alpha}$. Tom Bachmann pointed out to us that $\omega G = 0$ is equivalent to $G$ being birational. It follows that in bounded Milnor-Witt stems, the top motivic stable stem is birational. Can we say something structural about the lower motivic stable stems? And can we leverage this structure in calculations?

Maybe you have further questions (or answers!). If so, let me know. For further technical details, remember to check out [the paper](https://arxiv.org/abs/1704.04744).
