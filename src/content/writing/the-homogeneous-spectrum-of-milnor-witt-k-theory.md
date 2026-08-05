---
title: "The homogeneous spectrum of Milnor-Witt K-theory"
date: 2015-11-02
tags:
  - mathematics
  - homotopy theory
  - algebraic geometry
source: https://thebrightobvious.wordpress.com/2015/11/02/the-homogeneous-spectrum-of-milnor-witt-k-theory/
---

*Update as of 4.V.16*: Riley's work is now published in [Journal of Algebra](http://www.sciencedirect.com/science/article/pii/S0021869316300539)!

*Update as of 9.VIII.16*: Jeremiah Heller and I now have a paper on the arXiv detailing our results on Balmer's comparison map from the tensor triangular spectrum of the stable motivic homotopy category to the homogeneous Zariski spectrum of Milnor-Witt $K$-theory. I have updated the text below to reflect our current understanding of the subject.

In this post I want to tell you about the wonderful world of *tensor triangular geometry* and what my student Riley Thornton's work might tell us about stable motivic homotopy theory. For full details, check out Riley's paper,

- [The homogeneous spectrum of Milnor-Witt $K$-theory](http://arxiv.org/abs/1510.08499) [arXiv:1510.08499].

Suppose you have a triangulated category $\mathcal{C}$ with a compatible symmetric monoidal structure $\otimes$. For instance, perhaps you're a stable homotopy theorist studying topological spectra under smash product. Or perhaps you're a noncommutative geometer studying $C^*$-algebras via $KK$-theory. Or maybe you're an algebraic geometer studying perfect complexes. Or a representation theorist studying stable $G$-modules. It's a big umbrella.

One fruitful way to study your *tensor triangular category* is via its *prime ideals*: thick full subcategories $\mathcal{P}$ such that $c\otimes p\in\mathcal{P}$ whenever $p\in\mathcal{P}$ (so, ideals with respect to $\otimes$) satisfying a primality condition: $a\otimes b\in\mathcal{P}$ implies $a$ or $b\in \mathcal{P}$.

This is the approach of [Paul Balmer](http://www.math.ucla.edu/~balmer/)'s school, and it goes under the heading *tensor triangular geometry*. Without getting into the details, one builds a Zariski spectrum-esque topological space $\mathrm{Spc}(\mathcal{C})$ which, as a set, consists of the tensor triangular primes in $\mathcal{C}$. Understanding $\mathrm{Spc}(\mathcal{C})$ sheds light on properties of $\mathcal{C}$ related to nilpotence and other cool stuff. If you want to learn more about this perspective, you may as well [start here](http://www.math.ucla.edu/~balmer/research/Pubfile/SSS.pdf) [pdf].

But how can you get a handle on $\mathrm{Spc}(\mathcal{C})$? It turns out that the Zariski spectrum of the endomorphisms of the $\otimes$-unit object $1\in \mathcal{C}$ contains coarse but important information about $\mathrm{Spc}(\mathcal{C})$. In particular, there is a continuous map $\rho:\mathrm{Spc}(\mathcal{C})\to \mathrm{Spec}(\mathrm{End}(1))$ which, under favorable circumstances, is surjective. Given such a surjective map and knowledge of the structure of $\mathrm{Spec}(\mathrm{End}(1))$, we might hope to determine $\mathrm{Spc}(\mathcal{C})$ fiberwise.

But in certain contexts, $\mathrm{Spec}(\mathrm{End}(1))$ is a little *too* coarse. For instance, if $\mathcal{C} = \mathrm{SH}^{\mathbb{A}^1}(F)$ is the (for the experts: full subcategory of compact objects in) the stable motivic homotopy category of a field $F$, then $\mathrm{End}(1) = GW(F)$, the [Grothendieck-Witt ring](https://en.wikipedia.org/wiki/Witt_group#Grothendieck-Witt_ring) of quadratic forms over $F$, and this is a picture of $\mathrm{Spec}(GW(F))$:

[![Prime ideals in the Grothendieck-Witt ring.](https://thebrightobvious.wordpress.com/wp-content/uploads/2015/10/gw.jpg?w=460&h=348)](https://thebrightobvious.wordpress.com/wp-content/uploads/2015/10/gw.jpg)

Prime ideals in the Grothendieck-Witt ring.

So what exactly is going on here? We see a bunch of copies of $\mathrm{Spec}(\mathbb{Z})$ in which all of the points $(2)$ are glued together. There is a distinguished copy of $\mathrm{Spec}(\mathbb{Z})$ associated with the dimension homomorphism, and the rest are indexed by $X_F$, the space of [orderings](https://en.wikipedia.org/wiki/Ordered_field) on $F$. (For these purposes, it's best to think of an ordering as a group homomorphism $\alpha:F^\times\to \pm 1$ which also satisfies additivity: $\alpha(a+b)=1$ whenever $\alpha(a)=\alpha(b)=1$. We recover the positive cone of $\alpha$ via $P_\alpha = \alpha^{-1}(1)$.) The copy of $\mathrm{Spec}(\mathbb{Z})$ associated with $\alpha\in X_F$ arises via pullback along the signature homomorphism

$\mathrm{sgn}_\alpha:GW(F)\to GW(F_\alpha) \to W(F_\alpha) \cong \mathbb{Z}$

Here $F_\alpha$ is the *real closure* of $F$ with respect to $\alpha$, and $W(E) = GW(E)/(h)$ is the Witt ring, given by modding out by the hyperbolic plane $h = x^2-y^2$. (If things like real closure are feeling hazy, go read your favorite algebra text's treatment of the Artin-Schreier Theorem. Real closed fields are ordered fields which are maximal with respect to algebraic extensions which respect ordering.) The "dimension copy" of $\mathrm{Spec}(\mathbb{Z})$ arises via pullback along

$\mathrm{dim}:GW(F)\to GW(\overline{F})\cong \mathbb{Z}$

where $\overline{F}$ is the algebraic closure of $F$. All of this is essentially a classical result from Lorenz and Leicht's 1970 Inventiones article.

Why might we be disappointed with $\mathrm{Spec}(GW(F))$ as the target of our comparison map $\mathrm{Spc}(\mathrm{SH}^{\mathbb{A}^1}(F))\to \mathrm{Spec}(GW(F))$? Well, doesn't it feel a little unnatural that all the characteristic two primes are collapsed to a point? Do we really think that all the odd and zero characteristic triangular primes will know about the rich order structure on $F$, but that triangular primes which map to $(2)$ remain clueless? I mean, $(2)$ is the *most* interesting prime — if anything there should be more going on there!

And there is. In order to see this, we need to introduce a new character and prove two theorems. The character is Milnor-Witt $K$-theory, $K^{MW}_*(F)$. This is a $\mathbb{Z}$-graded ring defined as a quotient of the free associative algebra on symbols $[a]$ where $a\in F^\times$ (these are in degree $1$) and $\eta$ (in degree $-1$). I'll send you to the paper for the explicit relations, but they include the Steinberg relation $[a][b] = 0$ for $a+b=1$, and $K^{MW}_*(F)$ is a sort of quadratic enhancement of [Milnor $K$-theory](https://en.wikipedia.org/wiki/Milnor_K-theory). (In particular, $K^{MW}_0(F)\cong GW(F)$.)

A theorem of Morel tells us that $K^{MW}_*(F)$ is a *graded* ring of endomorphisms of the unit object $S_F$ in $\mathrm{SH}^{\mathbb{A}^1}(F)$. In particular,

$K^{MW}_n(F) \cong [S_F,\mathbb{G}_m^{\wedge n}]$

the group of stable homotopy classes of maps from the motivic sphere spectrum to the $n$-fold smash product of $\mathbb{G}_m = \mathbb{A}^1\smallsetminus 0$. (The $\mathbb{Z}$-grading arises because $\mathbb{G}_m$ is a smash-invertible object in the stable motivic homotopy category.)

Let $\mathrm{Spec}^h(K^{MW}_*(F))$ denote the collection of homogeneous prime ideals in $K^{MW}_*(F)$; it has a natural Zariski topology. For any such homogeneous spectrum of a graded endomorphism ring, Balmer produces a continuous map from the tensor triangular spectrum to the homogeneous spectrum. In this case, it takes the form

$\rho^\bullet:\mathrm{Spc}(\mathrm{SH}^{\mathbb{A}^1}(F))\to \mathrm{Spec}^h(K^{MW}_*(F))$

(Technical note: we actually need to replace $\mathrm{SH}^{\mathbb{A}^1}(F)$ with its full subcategory of compact objects. Later we will replace this category with compact cellular objects. These are quite a bit simpler, but still very rich and the target of the map remains the same.) We'll be able to study $\mathrm{Spc}(\mathrm{SH}^{\mathbb{A}^1}(F))$ fiberwise via this map as long as

- we know the structure of $\mathrm{Spec}^h(K^{MW}_*(F))$, and
- we know that $\rho^\bullet$ is surjective.

This leads us to the main result of Riley's paper (in cartoon form):

**Theorem [Thornton].** If $F$ is a field of characteristic different from $2$, then the homogeneous prime ideals in $K^{MW}_*(F)$ take the form:

[![Homogeneous primes in Milnor-Witt K-theory.](https://thebrightobvious.wordpress.com/wp-content/uploads/2015/11/kmw.jpg?w=460&h=435)](https://thebrightobvious.wordpress.com/wp-content/uploads/2015/11/kmw.jpg)

Homogeneous primes in Milnor-Witt K-theory.

If you want to know exactly which prime is what, I'll send you to the paper: it's quite readable if you have some basic background in Milnor-Witt $K$-theory. For our purposes, let's simply observe that Milnor-Witt $K$-theory resolves the "problem" with the Grothendieck-Witt ring: we now have characteristic two primes indexed by $X_F\amalg \{\mathrm{dim}\}$. In fact, we even get a bonus characteristic two prime at the bottom of the diagram!

But all of this is for naught if $\rho^\bullet$ doesn't hit these new primes. Balmer produces several criteria for surjectivity of $\rho$ and $\rho^\bullet$, and the connectivity of the stable motivic homotopy category guarantees that $\rho$ surjects onto $\mathrm{Spec}(GW(F))$. But none of Balmer's criteria apply to $\rho^\bullet$ in this context. Nonetheless, we have the following result, which leverages Thornton's computation to find explicit triangular primes in the stable motivic homotopy category living over each homogeneous Zariski prime.

In order to state it, a small bit of terminology: let $SH^{\mathbb{A}^1}(F)^c$ denote the full subcategory of compact motivic spectra over $F$.

**Theorem [Heller-Ormsby].** Balmer's map

$\rho^\bullet:\mathrm{Spc}(SH^{\mathbb{A}^1}(F)^c)\to \mathrm{Spec}^h(K^{MW}_*(F))$

is surjective.

Some brief notes on the proof/construction:

- It proceeds via explicit knowledge of the target (Thornton's theorem) and topological arguments.
- Homogeneous Zariski primes not containing 2 are easy to hit since the map $(~)_0:\mathrm{Spec}^h(K^{MW}_*(F))\to \mathrm{Spec}(GW(F))$ is a homeomorphism away from these primes (and $\rho$ is surjective by connectivity).
- This means that characteristic 2 primes are the crux, and we rely on a topological argument to ensure they are hit by $\rho^\bullet$. Note, though, that this does not produce any explicit tensor triangular primes over these ideals! If we pass to the cellular motivic category, we can construct explicit tt-primes as subcategories of acyclics for novel cellular field spectra.

You can read a full account of these results [here](https://arxiv.org/abs/1608.02876).

At this point, I think that more questions have been raised than answered. What else lives over Riley's prime ideals? Do all of the triangular primes pull back from real and algebraic closures? How do the cellular primes compare to non-cellular primes? Are the triangular primes in the above theorem maximal (or close to maximal)? (Note that $\rho^\bullet$ reverses inclusions.) What about nilpotence in the stable motivic homotopy category? Certainly the exotic non-nilpotent elements of Andrews, Isaksen, *et al* will enter the story…. [Jeremiah Heller](http://www.math.uiuc.edu/~jbheller/) and I are actively working on these questions and more, but everyone's input is welcome!
