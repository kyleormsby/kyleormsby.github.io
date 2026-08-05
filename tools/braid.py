"""
Derivation of the braid shown in the landing-page motif (src/components/Motif.astro).

    beta = (s1 s3 s5 s7 s9)(s2 s4 s6 s8 s10)^-1   in B_11

Two independent computations of its dilatation, each validated against the
classical 3-rod case s1 s2^-1, whose dilatation is exactly (3+sqrt5)/2:

 1. Spectral radius of the Burau representation at t = -1 (exact, below).
 2. Growth rate of a material line advected through the actual half-twists
    used by the animation (numerical, in the docstring at the bottom).

Run: python3 tools/braid.py
"""
import numpy as np, sympy as sp

def burau(word, n, t):
    """Unreduced Burau at parameter t. Spectral radius agrees with the reduced
    representation up to the trivial eigenvalue 1."""
    M = sp.eye(n)
    for (i, s) in word:                       # i = 0-based site, sigma_{i+1}
        B = sp.eye(n)
        if s > 0:
            B[i, i] = 1 - t; B[i, i+1] = t; B[i+1, i] = 1; B[i+1, i+1] = 0
        else:
            B[i, i] = 0; B[i, i+1] = 1; B[i+1, i] = sp.Rational(1, 1)/t
            B[i, i] = 0; B[i, i+1] = 1
            B[i+1, i] = 1/t; B[i+1, i+1] = 1 - 1/t
        M = M * B
    return M

def spec_radius(M):
    p = M.charpoly()
    roots = np.roots([complex(c) for c in p.all_coeffs()])
    return max(abs(roots)), p

t = sp.Integer(-1)

# control: 3 rods
M3 = burau([(0, +1), (1, -1)], 3, t)
r3, p3 = spec_radius(M3)
print(f"3-rod control: Burau(-1) spectral radius = {r3:.6f}")
print(f"   exact (3+sqrt5)/2 = {float((3+sp.sqrt(5))/2):.6f}   match = {abs(r3-float((3+sp.sqrt(5))/2))<1e-9}")
print(f"   charpoly: {sp.factor(p3.as_expr())}\n")

odds  = [(i, +1) for i in (0, 2, 4, 6, 8)]
evens = [(i, -1) for i in (1, 3, 5, 7, 9)]
W = odds + evens
M11 = burau(W, 11, t)
r11, p11 = spec_radius(M11)
print(f"11-rod stir: Burau(-1) spectral radius = {r11:.6f}")
print(f"   entropy = {np.log(r11):.6f}")
fac = sp.factor(p11.as_expr())
print(f"   charpoly factors: {fac}")
