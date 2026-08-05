# configuration.space

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
  components/Motif.astro   the landing-page configuration-space animation
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

20 posts: 19 imported from `thebrightobvious.wordpress.com` plus the existing
Jekyll post. `remark-math` + `rehype-katex` render `$…$` and `$$…$$` at build
time, so pages ship no math engine.

### The WordPress import needs a proof-read

WordPress.com renders `$latex …$` **server-side into images**, so the original
LaTeX source is not recoverable by scraping — the math had to be reconstructed
from rendered output. Two files need your eye:

- `when-something-is-nothing.md` — heaviest reconstruction. Homotopy sheaves came
  back as `∏` where `$\pi$` was meant; that and several other symbols were
  normalized by hand.
- `comparing-g-sets-and-quadratic-forms.md` — the one-dimensional form reads
  "takes $x$ to $ax$", which should probably be $ax^2$. Left as fetched rather
  than silently corrected.

Also: `monadnock.md` lost a video embed, and `_about-page.md` is the blog's About
page parked for you to fold into a real page (files beginning with `_` are
excluded from the collection).

**The clean fix:** in wp-admin, Tools → Export gives a WXR XML file containing the
original `$latex …$` source. If you export it and drop it here, the math posts
can be re-imported losslessly.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages. Set
`configuration.space` as the custom domain in the repository settings; GitHub
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

