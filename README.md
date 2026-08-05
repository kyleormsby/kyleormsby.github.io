# configuration.space

A prototype replacement for `kyleormsby.github.io`, built with
[Astro](https://astro.build). Three things are proven out here: the visual
identity, the visualization gallery, and course pages generated from a
spreadsheet.

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # -> dist/
```

## Layout

```
src/
  styles/global.css        design tokens — colors, type, spacing. Start here.
  layouts/Base.astro       shell: head, nav, footer
  components/Motif.astro   the landing-page configuration-space animation
  lib/csv.ts               small CSV reader, no dependencies
  lib/courses.ts           turns a CSV row into a rendered class meeting
  data/courses/            <course>.csv  +  <course>.json   ← course content
  content/viz/             one markdown file per visualization
  content/writing/         blog posts
  pages/
    index.astro            landing page
    [course]/index.astro   /113/, /111/, … generated from data/courses/
    viz/index.astro        gallery
    writing/               index + post pages
public/                    visualizations, verbatim, at their original URLs
tools/                     migration and thumbnail scripts
```

## Course pages

Each course is two files:

- `src/data/courses/113-spring26.csv` — one row per class meeting
- `src/data/courses/113-spring26.json` — title, term, office hours, links

The CSV columns are `week, date, type, reading, pages, lecture, worksheet,
solutions, hw, hw_due, submit, submit_by, note`.

Two conventions keep it readable in a spreadsheet:

- **File stems, not paths.** `07-group` becomes
  `/files/113spring26/07-group.pdf` using `filesBase` from the JSON.
- **Panopto IDs, not URLs.** The GUID alone becomes a full viewer link using
  `panoptoBase`.

`type` is one of `class`, `review`, `exam`, `cancelled`. Exams and review days
get accent styling automatically. Anything the importer could not classify
lands in `note`, which accepts markdown links and `❦` separators.

Edit the CSV in Excel, Numbers, or Google Sheets (export as CSV) and rebuild.
To pull from a published Google Sheet at build time instead, replace the
`import.meta.glob` call in `lib/courses.ts` with a `fetch` of the sheet's CSV
export URL — everything downstream is unchanged.

### Importing an existing course page

```bash
python3 tools/jekyll_course_to_csv.py path/to/_pages/113.md \
  --year 2026 --slug 113-spring26 \
  --files-base /files/113spring26/ --out src/data/courses
```

This got 40 of 40 meetings out of the current Math 113 page. Skim the `note`
column afterward — anything the parser did not recognize is preserved there
rather than dropped.

## Visualizations

The projects in `public/` are untouched and keep their original URLs
(`/lattice-flow/`, `/nets/`, …), so existing links and citations stay valid.
The gallery is built from `src/content/viz/*.md`; each file carries a title,
href, year, tags, and a one-line description.

Thumbnails are real screenshots:

```bash
npm run thumbs              # all 18
npm run thumbs -- nets      # just one
```

`tools/thumbnails.config.json` holds per-project tweaks (extra settling time, a
button to click, an element to scroll into view). Commit the PNGs so the site
builds without a browser.

### One thing to fix before launch

Ten of the eighteen visualizations load three.js from a CDN — `cdnjs` for
r128, `unpkg` for 0.160 via an importmap. That means an outage or a removed
version at either host silently breaks those pages. Vendoring the two library
versions into `public/vendor/` and pointing the importmaps at local paths would
make the whole gallery self-contained. The thumbnail script already stubs these
requests locally, which is why it works offline.

## Math

`remark-math` + `rehype-katex` render `$…$` and `$$…$$` at build time, so pages
ship no math engine. Existing posts carry over unchanged.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages. Set
`configuration.space` as the custom domain in the repository settings; GitHub
will then redirect `kyleormsby.github.io` to it, which keeps every old link
working.
