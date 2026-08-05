---
title: "Aha! A percolating pandemic and a perfect proof"
date: 2021-11-04
tags:
  - mathematics
  - combinatorics
updated: 2026-08-05
---

(If you're not one for preambles, you can [skip to the puzzle](#the-percolating-pandemic-puzzle).)

One of the greatest delights of my undergraduate career was attending Laci (rhymes with _Yahtzee!_) Babai's combinatorics lectures. Often drawing affectionate comparisons with Count von Count from Sesame Street, Babai's booming baritone and childlike enthusiasm have inspired legions of young students.

Coming from the Hungarian school, Babai's mathematics focused on problem-solving, the untangling of knotty puzzles. Sometimes those puzzles were solved through the diligent application of standard techniques; sometimes linear algebra or another theoretical edifice and big-name theorem could be brought to bear; sometimes a whole kitchen sink of techniques, reductions, and case-work was necessary. But sometimes – just sometimes – there was an "Aha!" proof: a blinding flash of insight that instantly unraveled the knot and left the puzzle exposed and defenseless.

Laci cultivated reverence for the "Aha!" among his students, peppering his lectures with challenges that revealed their mysteries when viewed from that just-right angle, and often pausing to see whose eyes suddenly sparkled. His favorite puzzle involved a checkerboard, a pandemic, and an evil mastermind, and I'm going to lay it out for you here. But don't worry: I will neither spoil the answer nor keep this gem permananently hidden. I recommend you try your best to divine an elegant, short, and utterly convincing argument. If, come what may, you either want to confirm your answer or simply must have it revealed, I've hidden the solution below, and I promise not to judge.

(Full disclosure: I spent a day with this problem and had to get a heavy-handed hint before seeing the solution. Meanwhile, some of my peers sniffed out the answer in under thirty seconds. Once you see it, you see it.)

(And also a disclaimer: The Aha! is but one beautiful and fun way of mathematizing. These types of arguments are not always available, and not always advisable. Over-cleverness sometimes obscures deeper structure.)

# The Percolating Pandemic Puzzle

But without further ado, here is Babai's puzzle: A pandemic has broken out on an $n\times n$ grid (think checkerboard, $n$ squares across and $n$ squares high). At time 0, some of the squares in the grid carry an infection. The infection then spreads according to the following rules:

1. Once infected, a square remains infected.
2. The infection spreads in discrete time steps where a previously uninfected square becomes infected if two or more of its edge-wise neighbors are infected.

As an example, here's the infection spread on a $7\times 7$ board, with black indicating initially infected squares, and lighter shades corresponding to later infection times:

<figure>
  <img src="/files/perc_7.gif" alt="Percolating pandemic on a 7x7 board." />
</figure>

We now introduce the evil mastermind to the problem. Their goal is to infect the entire grid on a budget, so they want to determine the minimum number of (cleverly positioned) initially infected squares that lead to a fully infected grid. Some brief introspection reveals that $n$ initial infections along the diagonal of the square suffice (here pictured for $n=10$):

<figure>
  <img src="/files/perc_10id.gif" alt="Full infection via diagonal seeding." />
</figure>

But the evil mastermind is greedy. Is it possible to do the job with fewer initially infected squares? That's the puzzle! Stated more formally:

> What is the minimal number of initially infected squares that can (when positioned in an optimal manner) lead to a full infection? Find this number and give an utterly convincing, very brief argument for why your answer is correct.

Good luck!

<figure>
  <img src="/files/perc_13.gif" alt="Percolating pandemic on a 13x13 board." />
</figure>

Now, I promised I wouldn't leave you hanging but also wouldn't give spoilers. Click on the arrows below to first reveal a hint (modest but substantive) and then reveal the solution. I've also included a followup puzzle in case you want to go deeper.

<details>
<summary>A hint.</summary>

The more things change, the more they stay the same (or decrease).

</details>

<details>
<summary>The solution.</summary>

The evil mastermind can do no better than $n$ initially infected squares. Why? In a word: _perimeter_. (If this wasn't your answer, perhaps pause here and see if the perimeter solution reveals itself.)

A short case-wise argument shows that the perimeter of the infected region stays the same or decreases as the infection spreads. When the board is fully infected, the infection perimeter is $4n$. The maximal perimeter of $k$ initially infected squares is $4k$, so to yield full infection we must have $k\ge n$. Initially infecting the diagonal yields a full infection, so $k=n$ suffices. Aha!

</details>

<details>
<summary>A followup puzzle.</summary>

Here's something a little deeper:

> What is the total number of configurations of $n$ initially infected squares that lead to full infection? Give an explicit description of the configurations, and find a formula for the total number in terms of $n$.

I won't provide a full solution, but you can click below to reveal the answer and some references.

<details>
<summary>Answer.</summary>

**This answer was wrong for five years.** What I originally wrote here answers a narrower question than the one I asked; see [the update](#update-august-2026) at the end of the post.

If you additionally require that the initially infected squares form a _permutation_ — exactly one in each row and each column — then the percolating configurations are precisely the locations of the 1's in permutation matrices for so-called [separable permutations](https://en.wikipedia.org/wiki/Separable_permutation). These are enumerated by the [Schröder numbers](https://en.wikipedia.org/wiki/Schr%C3%B6der_number): 1, 2, 6, 22, 90, 394, 1806, .... (See also [A006318](https://oeis.org/A006318) in the OEIS.) You can find details for the argument in [this article](https://doi.org/10.1137/0404025) by Shapiro and Stephens. Denis Bashkirov has since given [an operadic interpretation](https://arxiv.org/abs/2411.00753) of their theorem, which delights me for reasons the last paragraph of this post will explain.

But the puzzle as I posed it puts no such restriction on the configuration — several initially infected squares are allowed to share a row or a column — and there are a great many more of those:

| $n$ | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| percolating configurations | 1 | 2 | 14 | 130 | 1615 | 23140 |
| of which are permutations | 1 | 2 | 6 | 22 | 90 | 394 |

That first row is [A146971](https://oeis.org/A146971), which has no known closed form. So the "find a formula for the total number in terms of $n$" half of my followup puzzle was, let us say, optimistic.

</details>

</details>

On a personal note, I was surprised to rediscover this problem when thinking about operads in equivariant homotopy theory for the work in [this paper](https://dx.doi.org/10.4310/HHA.2021.v23.n1.a6). Go figure!

## Update, August 2026

Nathan Smith, then a senior at Brown, wrote to me in December 2025 to say that the answer I gave to the followup puzzle was wrong, and he is quite right. (That this correction is dated some months later reflects on me and not on him.)

The theorem of Shapiro and Stephens that I cited characterizes percolating _permutation_ matrices — configurations with exactly one initially infected square in each row and each column. The puzzle I actually posed allows several infected squares to share a row or a column, and once you allow that, the Schröder numbers undercount badly: 14 configurations rather than 6 when $n=3$, and 23140 rather than 394 when $n=6$. The correct count is [A146971](https://oeis.org/A146971), and nobody appears to have a formula for it. I had answered a question adjacent to the one I asked, which is a specialized form of being wrong that I recommend against.

Nathan also proposed a reformulation I like a great deal. An infecting set of $n$ squares determines an orientation of the grid's adjacency graph: point each edge in the direction the infection travels along it. Because no square is ever reinfected, that orientation is acyclic, and the perimeter argument above forces every square outside the initial set to have in-degree exactly two — a square infected by three or four neighbors would strictly decrease the perimeter, and at $k=n$ there is no slack to spend. So percolating configurations of size $n$ should be in bijection with acyclic orientations of the $n\times n$ grid graph in which all but $n$ vertices have in-degree exactly two. That is a much more tractable-looking object, and one can imagine getting at it with a suitably modified chromatic polynomial.

He also noticed something I had missed about the shape of the argument: the numerics fit almost suspiciously well. A square has four sides and needs two infected neighbors, so the ratio is exactly $2/4$; and $n$ separate $1\times 1$ squares have exactly the same perimeter as one $n\times n$ square. The bound isn't merely true, it is tight for a reason you can see.

Thank you, Nathan. Being told you are wrong by someone who has visibly enjoyed your problem is one of the better ways to be told you are wrong.
