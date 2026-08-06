# e-infinity.space

A replacement for `kyleormsby.github.io`, built with [Astro](https://astro.build).

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # -> dist/
npm run preview      # serve dist/ exactly as a static host would
```

### The files/ directory

Syllabi, worksheets, homework, notes, and slides are committed under
`public/files/` — 407 files, 668 MB. See "What is in files/" below for what was
pruned and why.

The 54x lecture notes and the two videos are *not* committed. To see them in dev
anyway, point `FILES_DIR` at the old repo:

```bash
FILES_DIR=~/Dropbox/GitHub/kyleormsby.github.io/files npm run dev
```

The default is `../kyleormsby.github.io/files`, so with the repos as siblings it
just works. Committed files always win, so dev matches production for everything
that ships.

`astro dev` also does not resolve a directory to its `index.html` inside
`public/`, so `/lattice-flow/` would 404 in dev while working in the built site.
Both gaps are closed by a small dev-only Vite plugin at the top of
`astro.config.mjs`; neither affects the production build.

## Layout

```
src/
  styles/global.css        design tokens — colors, type, spacing. Start here.
  layouts/Base.astro       shell: head, nav, footer
  components/Motif.astro   the landing-page E-infinity animation
  lib/csv.ts               small CSV reader, no dependencies
  lib/courses.ts           turns CSV rows into rendered class meetings
  data/courses/            <course>.csv  +  <course>.json   ← course content
  content/viz/             one markdown file per visualization
  content/writing/         blog posts
  pages/
    index.astro            landing page
    [course]/index.astro   /113/, /544/, … generated from data/courses/
    viz/index.astro        gallery
    teaching/, writing/, research/
public/                    visualizations, verbatim, at their original URLs
tools/                     importers and screenshot scripts
```

## Course pages

Each course is two files in `src/data/courses/`:

- `544-fall22.csv` — one row per class meeting
- `544-fall22.json` — title, term, office hours, links, and a **render spec**

### Why a render spec

The eight course pages did not share a shape. Math 111 is a topic and a couple
of demo links per day. Math 544 is reading + lecture notes + Panopto recording +
problem set. Math 113 adds worksheets, solutions, and two separate homework
columns (assigned and due). Forcing one schema on all of them would mean a CSV
that is mostly empty columns.

Instead each course JSON declares how to turn *its own* columns into the lines
of a meeting:

```json
"render": [
  { "col": "topic",   "kind": "md" },
  { "col": "reading", "kind": "md",      "label": "reading",  "pages": "pages" },
  { "col": "notes",   "kind": "pdf",     "label": "notes",    "text": "notes",
    "also": [{ "col": "handout", "text": "handout" }] },
  { "col": "recording", "kind": "panopto", "label": "recording", "text": "recording" }
]
```

`kind` is one of:

| kind | cell contains | becomes |
|---|---|---|
| `md` | inline markdown, including `$math$` | rendered inline |
| `text` | plain text | escaped text |
| `pdf` | a file stem, e.g. `07-group` | link to `{filesBase}07-group.pdf` |
| `url` | a full URL | a link |
| `panopto` | a bare GUID | link to `{panoptoBase}{guid}` |

Modifiers: `pages` (a column with a page range, shown dim), `due` (a column with
an ISO date, shown as "due March 4"), `by` (a column with a time), `note` (a
fixed dim suffix), `also` (extra links joined with ❦).

Adding a column to one course is a JSON edit, not a code change.

Two conventions keep the CSV readable in a spreadsheet: cells hold **file stems,
not paths** and **Panopto GUIDs, not URLs**. The prefixes live once in the JSON.

`type` is one of `class`, `review`, `exam`, `final`, `cancelled`, `break`,
`note`. Exams and review days style themselves. Past meetings dim and the
current one is anchored at *read* time, not build time, so the page stays honest
between deploys.

Math in schedules is rendered with KaTeX at build time — Math 411's "$L^2$ and
Hilbert spaces" and Math 544's "$\pi_1$" come through as real math.

### Importing an existing course page

```bash
python3 tools/import_course.py ../kyleormsby.github.io/_pages/544.md \
  --format weekly --year 2022 --slug 544-fall22 --term "fall 2022" \
  --files-base /files/544/ \
  --panopto "https://uw.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=" \
  --out src/data/courses
```

`--format` picks the source layout:

| format | courses | shape |
|---|---|---|
| `bullets` | 113 | `**Monday February 9**:` then `- reading: …`, `- [worksheet](…)` |
| `inline` | 111, 201, 342, 411 | `**Monday 9 September**: topic, [notes](…)` — day before month |
| `weekly` | 544, 545, 546 | `## week 3`, `*17 October - 21 October*`, then `**Monday**: topic` |

Dates are resolved with one cursor rule covering all three: an explicit date sets
the cursor, a bare weekday advances to the next matching day, and a week's date
range reseeds it. That is what lets Math 111 switch from
`**Wednesday 3 September**` to a bare `**Monday**` halfway down the page.

The importer also drafts the JSON — it labels the header bullets, folds nested
ones (`Course meetings:` → `F01: …`), and picks the render spec for the format.
It never overwrites an existing JSON, so re-running is safe once you have tuned
one.

Anything the parser cannot classify is preserved in a `note` column rather than
dropped. Skim that column after an import.

All eight pages converted: 300 meetings, every date verified as strictly
increasing and landing on a real class day.

### Known limitation

A course's `slug` is its URL. Teaching Math 113 again in a later term would mean
two JSON files claiming `/113/`. When that happens, give the older one a slug
like `113-spring26` and add a redirect.

## Visualizations

The projects in `public/` are untouched and keep their original URLs
(`/lattice-flow/`, `/nets/`, …), so existing links and citations stay valid. The
gallery is built from `src/content/viz/*.md`.

Thumbnails are real screenshots:

```bash
npm run thumbs              # all 18
npm run thumbs -- nets      # just one
```

`tools/thumbnails.config.json` holds per-project tweaks (settling time, a button
to click, an element to scroll into view). Commit the PNGs so the site builds
without a browser.

### No external dependencies

The visualizations used to load three.js from three different CDNs (cdnjs,
unpkg, jsdelivr) in two versions, and two of them pulled webfonts from
fonts.googleapis.com. Any of those hosts changing its mind would have silently
broken a page, and the font requests disclosed every reader's IP address to a
third party. Both are now vendored:

```bash
npm run vendor          # copy libraries in and rewrite the references
npm run vendor:check    # fail if any external reference reappears
```

`tools/vendor_three.mjs` copies the r128 and 0.160 builds, walks the addon
import graph so only reachable modules are included (14 files, not the whole
33 MB package), and rewrites every spelling of every CDN URL.
`tools/vendor_fonts.mjs` pulls the exact weights and styles each page asks for
from `@fontsource` and writes a local `@font-face` sheet.

Verify end to end with `npm run thumbs -- --no-stub`, which renders every
visualization with no CDN fallbacks at all and reports any offsite request. All
18 currently pass.

The first pass of this caught only 10 of the 17 references by matching one URL
spelling — hence `vendor:check`, which greps for the hosts rather than trusting
a pattern.

## Research

`src/data/research.json` holds 67 items across six sections — papers, student
papers, published and other exposition, organizing, and talks — imported from
the old 36 KB markdown page:

```bash
python3 tools/import_research.py ../kyleormsby.github.io/_pages/research.md \
  --out src/data/research.json
```

Each paper carries title, venue, links, abstract, and coauthors as separate
fields, so an arXiv number is typed once and can be rendered anywhere — this
page, a per-paper page, a CV, a BibTeX export. Section anchors are the slugified
headings (`#research-papers`, `#recent-talks`), matching what academicpages
generated, so existing deep links still resolve.

Titles and abstracts go through `src/lib/markup.ts`, the same small
markdown-plus-KaTeX renderer the course schedules use, so `$N_\infty$` and
`$C_{qp^n}$` render as math from inside JSON.

## Writing

22 posts: 19 imported from `thebrightobvious.wordpress.com` plus the three
Jekyll posts. The old Jekyll permalinks (`/posts/2021/11/aha/` and friends)
redirect to `/writing/<slug>/` via `redirects` in `astro.config.mjs`. `remark-math` + `rehype-katex` render `$…$` and `$$…$$` at build
time, so pages ship no math engine.

### The WordPress import: proof-read complete

WordPress.com renders `$latex …$` **server-side into images**, so scraping a
post normally loses the source. It turns out the source survives anyway — the
image URL is the LaTeX, percent-encoded:

```
https://s0.wp.com/latex.php?latex=K%5E%7BMW%7D_%2A%28F%29&bg=ffffff&…
                                   ^ K^{MW}_*(F)
```

Decoding those recovers ground truth for any post that used `$latex`. Results:

| post | how math was written | verdict |
|---|---|---|
| `the-homogeneous-spectrum-of-milnor-witt-k-theory` | `$latex …$` | **46 of 47 recovered expressions match the import verbatim** |
| `comparing-g-sets-and-quadratic-forms` | plain HTML/unicode | import matches the source word for word |
| `when-something-is-nothing` | plain unicode, no LaTeX at all | see below |
| `generalizing-the-fundamental-theorem-of-galois-theory` | plain text with italics | conversion to LaTeX is interpretive |

Two editorial changes were made, both easy to revert:

1. **`comparing-g-sets-and-quadratic-forms.md`** — the original says a
   one-dimensional form $\langle a\rangle$ "takes $x$ in $k$ to $ax$". A
   one-dimensional quadratic form sends $x \mapsto ax^2$; the original is a
   typo, and the same paragraph gets the trace form right with $x^2$. Changed
   to $ax^2$.

2. **`when-something-is-nothing.md`** — the author wrote homotopy sheaves as
   the literal character **∏ (U+220F, N-ARY PRODUCT)**, not π, and said so:
   "*primarily because I don't want to fiddle with too much fancy formatting in
   WordPress*". The import renders these as $\pi_{m+n\alpha}$, which is what
   was meant, so the parenthetical excuse no longer described anything true and
   was dropped.

### Checking the math

```bash
npm run check:math
```

Parses every math span with KaTeX in **strict** mode. The build deliberately
uses `strict: false` so one bad formula cannot fail a deploy — which also means
errors scroll past unnoticed. This fails loudly instead. Currently 497 spans,
0 rejected.

It caught the six that had been warning on every build: the lifting-property
operator was a raw **⧄ (U+29C4)**, which KaTeX cannot set. KaTeX has no
`\boxslash`, so `astro.config.mjs` defines one as
`{\square\mkern-11mu\diagup}` — no `\mathbin`, because it appears in
superscript position (`{}^\boxslash R`).

## The arXiv link

The footer currently points at an author *search*, which works but matches on a
name string. The better link is an author identifier, `arxiv.org/a/<id>`, which
is an exact match. To claim one, sign in at `arxiv.org/user` and either link an
ORCID iD — the identifier pages work as `arxiv.org/a/0000-0000-0000-0000` once
linked — or use "create an author identifier" for the classic
`arxiv.org/a/ormsby_k_1` form. Either way you then confirm which arXiv papers
are yours.

Once it resolves, swap the URL in `src/layouts/Base.astro`.

## Adding a visualization

Three things, then a build:

1. `public/<slug>/index.html` — self-contained, no CDN references.
2. `src/content/viz/<slug>.md` — title, `href`, year, thumb, tags, and one
   sentence of description.
3. `npm run thumbs -- <slug>` — renders it headless to
   `public/thumbs/<slug>.png`. Commit the PNG; CI has no browser.

`npm run thumbs -- --no-stub` disables the local CDN substitutions, so a full
run doubles as a check that every visualization is genuinely self-contained.

**`featured: true`** puts an entry in the three under *featured visualizations*
on the landing page. It decides first, with year and then title breaking ties
beneath it — so among the featured the order is alphabetical by title unless
their years differ.

The flag exists because sorting by year alone did not work: nearly every entry
carries the same year, which left seventeen tied and quietly showed the
alphabetically-first three under a heading that then said "recent".

## Checking before you push

```bash
npm run dev                      # fast loop, http://localhost:4321
npm run build && npm run preview # serves dist/ — exactly what deploys
npm run check                    # math, build, theme, contrast
```

`npm run dev` is for writing. `preview` is for believing: it serves the built
output, which is where the redirects (`/342/`, `/posts/…`), the canonical URLs,
and `/rss.xml` actually exist — dev resolves some of those differently.

`npm run check` chains everything and exits non-zero on the first failure, so
it is the one to run before pushing.

The browser-driven checks need Playwright's Chromium once:

```bash
npx playwright install chromium
```

They pass `executablePath: process.env.CHROMIUM_PATH` and fall back to
Playwright's own browser when that is unset, so no environment variable is
needed on a normal machine.

**To reproduce what CI does**, including lockfile drift — the classic thing
that builds locally and fails in Actions:

```bash
rm -rf node_modules && npm ci && npm run build
```

Note that `npm run dev` resolves `files/` through `FILES_DIR`, which defaults to
`../kyleormsby.github.io/files`. The 54x lecture notes and the two videos were
pruned from this repo to fit under the 1 GB Pages limit, so in dev they come
from the old repo and in production they are simply absent.

## Light and dark

**Light is the default outright.** `prefers-color-scheme` is deliberately not
consulted: the site is designed light, and dark is the option behind a switch
in the header. Two states, no `auto`.

Two details do the work:

- **The choice is applied before first paint**, by an inline `is:inline` script
  in `<head>` that reads `localStorage` and sets `data-theme` on `<html>`. Move
  that logic into a deferred bundle and a dark-mode visitor gets a frame of
  light on *every* load. It is written in ES5 with `try`/`catch` around
  storage, because it runs before anything else and must not throw in a private
  window or an embedded webview.
- **Every colour is written once.** `global.css` defines `--ink-light` and
  `--ink-dark` and so on; `:root` maps the light set and `[data-theme='dark']`
  maps the dark one. The hex values never appear twice.

The motif draws to a canvas and so cannot inherit CSS variables; it listens for
a `themechange` event and repaints.

```bash
npm run check:theme    # asserts every state, both OS settings, and pre-paint
```

That check exists for a specific silent failure: the toggle continuing to work
while the pre-paint script stops. A screenshot taken after load looks identical
either way, so the check reads `data-theme` at navigation *commit* instead.

## The feed

`src/pages/rss.xml.ts` generates `/rss.xml` from the writing collection. Every
page had been advertising that URL in its `<head>` since the site was built,
with nothing generating it — a 404 no visitor would notice and every feed
reader would. Hand-rolled rather than adding `@astrojs/rss`; the only fiddly
part is escaping.

## Contrast

```bash
npm run check:contrast
```

Measures every text colour on the main pages, in both schemes, against WCAG AA
(4.5:1 normal, 3:1 large). All text currently passes; the tightest is 4.57:1.

Dark is reached by setting `data-theme`, not by setting the OS preference —
since the palette ignores the OS, a `colorScheme` context would silently audit
light twice. And the audit **waits out the colour transition** before reading:
links animate over 0.18s, so measuring immediately catches every `<a>` part-way
between the old ink and the new against an already-switched background, which
reports dozens of failures that do not exist.

The subtlety it exists for is **`opacity`**. A colour can pass on its own and
fail in place, because opacity on an ancestor composites it toward the
background. Reading the computed `color` would have called the course pages
fine; folding in every ancestor's opacity first is what actually reaches the
eye. That is how these were found:

| what | was | now |
|---|---|---|
| `.sep` (the ❦ between links) | **1.29:1** — it used `--rule`, a hairline colour, as text | uses `--muted` |
| past meetings, mono labels | **2.97:1** — `--muted` under `opacity: 0.72` | 5.16:1 |
| past meetings, exam dates | **3.53:1** | 4.86:1 |
| `--muted-light` on its own | 5.22:1 | **7:1** (`#5A574D`) |

`.meeting.is-past` went from `opacity: 0.72` to `0.88` and cancelled meetings
from `0.55` to `0.85`. Dimming past meetings is worth doing, but gently: those
rows hold the worksheets and readings students go back to all term, so they are
not the ones to make hard to read.

## The landing-page motif

`src/components/Motif.astro` shows 11 points stirring a rectangle beside the
braid word the motion spells in pi_1. The braid is the alternating
"brick wall" stir

    beta = (s1 s3 s5 s7 s9)(s2 s4 s6 s8 s10)^-1   in B_11

The odd generators commute among themselves and so do the even ones, so each
half period is five simultaneous swaps — which is why the animation has a
two-beat rhythm rather than plodding through ten crossings one at a time.

One period permutes the points by an 11-cycle, so `beta^11` — 110 letters — is
a **pure** braid: every point returns to its own starting position, and the
path closes in the *ordered* configuration space Conf_11(R^2), which is what the
caption claims. The counter in the caption tracks progress toward those 110.

`beta` is pseudo-Anosov, and its dilatation is the largest root of

    x^10 - 19x^9 + 145x^8 - 575x^7 + 1289x^6 - 1683x^5
         + 1289x^4 - 575x^3 + 145x^2 - 19x + 1

a reciprocal polynomial, as a dilatation must be — lambda = 5.50071..., giving
topological entropy log lambda = 1.70488.

### Reading the picture

Each strand keeps one colour for its whole life. Ten come from a quiet ramp
between `--ink` and `--muted` — white to grey in dark mode, near-black to warm
grey in light — mixed in linear light so the middle does not go muddy; the
eleventh is `--accent`. A dot and its strand always share a colour, so the
accent one can be followed through the whole weave.

The `ramp` prop switches this: `neutral` drops the accent for a pure grey
field, `ink-accent` runs the full ramp to the accent colour. Neutral is the
prettiest of the three and the least useful — at this line weight eleven greys
are not tellable apart, and a strand you cannot follow is just texture.

Time runs *away* from the rectangle: the instant shown by the dots is the
diagram's **left** edge, and the past trails off to the right. Getting this
backwards puts a whole screen of history between a dot and the strand it
belongs to, which reads as lag. The two views also share one easing function,
`vprofile` — a swap in the rectangle is a rigid rotation, so its vertical
component is a cosine of the eased phase, and the diagram must interpolate the
same way or the views disagree about where a strand is mid-swap.

### Why you can believe that number

`tools/braid.py` computes it two independent ways, each first validated on the
classical 3-rod stir `s1 s2^-1`, whose dilatation is exactly (3+sqrt5)/2:

| method | 3-rod control | verdict |
|---|---|---|
| spectral radius of Burau at t = -1 | charpoly `x^2 - 3x + 1`, exact | ✓ |
| growth rate of an advected material line | 2.61810 vs 2.61803 | ✓ 0.003% |

The line-stretching computation advects a polyline through the very same
half-twist maps the animation uses, resampling as it stretches, and measures
the length ratio between successive periods. For 11 rods it converges down
toward 5.50 from above — agreeing with the Burau value to the precision the
method has. Two different routes, one answer.

```bash
python3 tools/braid.py     # prints both, with the controls
npm run shots:motif        # light, dark, narrow, reduced-motion captures
```

### The full teaching record

The teaching page lists every course, grouped by institution, newest first. It
merges two sources: the courses this site builds, and
`src/data/teaching-archive.json` — everything taught before this site existed,
whose pages still live where they always did on `people.reed.edu` or the old
Jekyll site.

An archive entry with no `href` is one whose host is gone: MIT Stellar was
decommissioned and `math.lsa.umich.edu` no longer resolves, so those courses
are listed **without** a link rather than with one that fails. Every link that
is there was checked. Courses move between the two sources by adding a JSON and
CSV under `src/data/courses/` and deleting the archive line.

`institution` on a course JSON puts it in the right group; it defaults to
`reed`.

### A course that lives somewhere else

Math 342 is a PreTeXt book published from its own repo, so its JSON carries an
`href`:

```json
"href": "https://kyleormsby.github.io/math342spring26/course/frontmatter.html"
```

Any course with an `href` still appears in "currently teaching" and in the
teaching index, but every link points at the real site and **no local page is
built** — there is no half-filled duplicate to drift out of date. `/342/`
redirects there too, since that URL existed before. Drop the `href` and the
local page comes back, schedule CSV and all; `342-spring26.csv` is still in
the repo for exactly that reason.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages. Set
`e-infinity.space` as the custom domain in the repository settings; GitHub
then redirects `kyleormsby.github.io` to it, which keeps old links working.

## What is in files/

`public/files/` is 668 MB across 407 files, down from 1,970 MB. GitHub Pages
publishes at most 1 GB, so the archive had to come down; here is exactly what
happened to it.

**Pruned** (still in the old repo, nothing deleted):

| | size |
|---|---|
| `544/notes`, `545/notes`, `546/notes` — 94 handwritten lecture notes | 859 MB |
| two `.mp4` recordings | 103 MB |
| LaTeX/OS build artifacts (`.aux`, `.log`, `.out`, `.DS_Store`) | 8 files |

The 54x *homework* survives — `hw/` is only 1–2 MB per course.

**Compressed**: the 90 remaining PDFs over 5 MB, via Ghostscript `/ebook`
(1,007 MB -> 668 MB). The 291 smaller PDFs and all 99 `.tex` sources are
byte-identical copies.

Compression is verified rather than assumed. A PDF keeps its compressed form
only if Ghostscript exited cleanly, printed no error, produced a smaller file,
**and** the page count still matches the original; otherwise the original is
copied through. One file took that path (`MRC/CatStrClosureOps.pdf`, which
Ghostscript inflated from 5.8 MB to 12.8 MB). A separate pass re-checked every
compressed PDF with `pdfinfo`; all 291 open and match their source page counts.

This matters because Ghostscript emitted `rangecheck` errors with
"output may be incorrect" on several images during the first run — silently
shipping those would have meant corrupted course notes.

Re-run with `tools/sync_files.sh` (see the header there for the manifest rules).

### Headroom

Published site is about 690 MB against the 1 GB ceiling. Roughly 330 MB spare —
a few years of new courses, but keep an eye on it. If it gets tight, the next
easy win is `201/lectures` (305 MB) and `111fall24/lectures` (184 MB), both past
courses.

