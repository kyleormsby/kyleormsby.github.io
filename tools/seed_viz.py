#!/usr/bin/env python3
"""Seed src/content/viz/*.md from the existing standalone visualizations."""
import os
import textwrap

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "content", "viz")

# slug, title, year, tags, blurb
ITEMS = [
    ("dual-view-curves", "Algebraic plane curves", 2026, ["algebraic geometry", "curves"],
     "A curve and its dual, side by side. Drag the coefficients and watch inflection points and bitangents migrate between the two pictures."),
    ("plane-curves", "Curves in the real projective plane", 2026, ["algebraic geometry", "RP²"],
     "Real plane curves drawn on a disc model of ℝP², where the line at infinity is just another line."),
    ("projective-surfaces", "Surfaces in ℝℙ³", 2026, ["algebraic geometry", "3D"],
     "Cubic and quartic surfaces rendered in projective 3-space, including the ones whose singularities only make sense once you leave affine coordinates."),
    ("jacobian-counterexample", "The Jacobian conjecture: a grid morph", 2026, ["algebraic geometry", "polynomial maps"],
     "Watching a polynomial map with constant nonzero Jacobian fold the plane — the picture that makes the conjecture feel plausible and hard at the same time."),
    ("finite-subgroups-SO3", "Finite subgroups of SO(3)", 2026, ["group theory", "3D"],
     "The cyclic, dihedral, tetrahedral, octahedral, and icosahedral groups, each shown acting on the sphere it was born to rotate."),
    ("F2-in-SO3", "F₂ inside SO(3) ≅ ℝP³", 2026, ["group theory", "3D"],
     "Two generic rotations generate a free group. Here are its words, plotted in ℝP³, drifting toward the Banach–Tarski paradox."),
    ("normC2S3", "The norm N(C₂→S₃)", 2026, ["equivariant homotopy", "group theory"],
     "The multiplicative norm of the swap action, made interactive — an equivariant construction that usually only lives in a diagram."),
    ("moduli-of-pentagons", "Pentagon moduli space", 2025, ["moduli", "configuration spaces"],
     "The space of pentagons with fixed side lengths, up to rotation — a surface you can walk around by bending a linkage."),
    ("lattices-vs-RP2", "Closed geodesics in X₃", 2026, ["number theory", "geodesics"],
     "Closed geodesics in the space of lattices attached to totally real cubic fields, drawn against ℝP²."),
    ("lattice-flow", "Periodic lattice flow", 2026, ["lattices", "dynamics"],
     "Orbs tracing a periodic flow on a lattice, because sometimes the right way to understand a group action is to let it run."),
    ("modular-graph", "G(a, m)", 2026, ["number theory", "graphs"],
     "The directed graph of b ↦ b + a modulo m. Change a and m and watch the cycle structure reorganize itself around gcd(a, m)."),
    ("sunzis-clock", "Sunzi's clock", 2026, ["number theory"],
     "ℤ/12 ≅ ℤ/4 × ℤ/3 as a pair of gears — the Chinese remainder theorem as a mechanism rather than a proof."),
    ("meanders", "Meandric systems", 2026, ["combinatorics", "Catalan"],
     "Closed curves crossing a line, counted and drawn, with the associahedron and multiplication table that organize them."),
    ("TL-stamps", "Temperley–Lieb Markov trace explorer", 2026, ["combinatorics", "diagram algebras"],
     "Temperley–Lieb diagrams and the Markov trace that turns them into knot invariants."),
    ("parse-explorer", "All parses: a PEMDAS explorer", 2026, ["combinatorics", "Catalan"],
     "Every way to parenthesize an expression, enumerated and evaluated — Catalan numbers doing their day job."),
    ("barycentric", "Barycentric subdivision", 2026, ["topology", "simplicial"],
     "Iterated barycentric subdivision of a simplex, and the alarming thinness of the simplices it produces."),
    ("bipartite-polyhedra", "Bipartite polyhedra", 2025, ["polytopes", "3D"],
     "Polyhedra whose graphs are bipartite, turned in space so you can check the two-coloring by eye."),
    ("nets", "Nets of 4D polytopes", 2026, ["polytopes", "4D"],
     "Unfoldings of the regular 4-polytopes, including all 261 nets of the tesseract."),
]

os.makedirs(OUT, exist_ok=True)
for slug, title, year, tags, blurb in ITEMS:
    tag_list = "\n".join(f"  - {t}" for t in tags)
    md = (
        "---\n"
        f'title: "{title}"\n'
        f"href: /{slug}/\n"
        f"year: {year}\n"
        f"thumb: /thumbs/{slug}.png\n"
        "tags:\n"
        f"{tag_list}\n"
        "---\n\n"
        f"{blurb}\n"
    )
    with open(os.path.join(OUT, f"{slug}.md"), "w", encoding="utf-8") as fh:
        fh.write(md)

print(f"wrote {len(ITEMS)} entries to {os.path.normpath(OUT)}")
