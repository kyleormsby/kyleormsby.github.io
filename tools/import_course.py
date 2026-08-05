#!/usr/bin/env python3
"""
Convert a hand-written academicpages course page into the CSV + JSON pair the
Astro course template consumes.

Kyle's course pages come in three shapes, all handled here:

  bullets   Math 113. "**Monday February 9**:" then "- reading: ...",
            "- [worksheet](...) ❦ [solutions](...)", "- [assigned homework](...)".
  inline    Math 111 / 201 / 411 / 342. "**Monday 9 September**: topic, [notes](...)"
            — everything on one line, day before month.
  weekly    Math 544 / 545 / 546. "## week 3" then "*17 October - 21 October*",
            then "**Monday**: topic" with the date implied by the week.

Dates are resolved with a single cursor rule that covers all three: an explicit
date sets the cursor; a bare weekday advances the cursor to the next matching
day; a week's date range reseeds it. That is what lets Math 111 switch from
"**Wednesday 3 September**" to a bare "**Monday**" halfway down the page.

Usage:
    python3 tools/import_course.py _pages/544.md --format weekly \\
        --year 2022 --slug 544-fall22 --files-base /files/544/ \\
        --panopto https://uw.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id= \\
        --out src/data/courses
"""
import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]
ABBR = {m[:3]: i + 1 for i, m in enumerate(MONTHS)}
ABBR.update({m: i + 1 for i, m in enumerate(MONTHS)})
MONTH_RE = "|".join(MONTHS + [m[:3] for m in MONTHS])
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_RE = "|".join(DAYS)

WEEK_HEADER = re.compile(r"^##\s+(.*?)\s*$")
WEEK_RANGE = re.compile(r"^\*([^*]+)\*\s*$")
BOLD_HEADER = re.compile(r"^\*\*(.+?)\*\*:?\s*(.*)$")
LINK = re.compile(r"\[([^\]]*)\]\(([^)]*)\)")
PAGES = re.compile(r"\(?pp?\.\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)\)?")
DUE = re.compile(rf"\(due\s+(?:\w+day\s+)?({MONTH_RE})\.?\s+(\d{{1,2}})\)")
BY_TIME = re.compile(r"by\s+(\d{1,2}(?::\d{2})?\s*[ap]m)", re.I)

# header forms, most specific first
H_FULL_MD = re.compile(rf"^({DAY_RE})\s+({MONTH_RE})\.?\s+(\d{{1,2}})$")   # Monday February 9
H_FULL_DM = re.compile(rf"^({DAY_RE})\s+(\d{{1,2}})\s+({MONTH_RE})\.?$")   # Monday 9 February
H_WEEKDAY = re.compile(rf"^({DAY_RE})$")                                    # Monday
H_RANGE = re.compile(rf"^({MONTH_RE})\.?\s+(\d{{1,2}})\s*[-–]\s*(\d{{1,2}})$")  # May 11-14

COLUMNS = {
    "bullets": ["week", "date", "display", "type", "reading", "pages", "lecture",
                "worksheet", "solutions", "hw", "hw_due", "submit", "submit_by", "note"],
    "inline": ["week", "date", "display", "type", "topic", "resources", "note"],
    "weekly": ["week", "week_dates", "date", "display", "type", "topic", "reading",
               "pages", "supplemental", "notes", "recording", "handout", "homework", "note"],
}

RENDER = {
    "bullets": [
        {"col": "reading", "kind": "text", "label": "reading", "pages": "pages"},
        {"col": "lecture", "kind": "panopto", "label": "lecture",
         "text": "lecture and quiz", "note": "before class"},
        {"col": "worksheet", "kind": "pdf", "label": "in class", "text": "worksheet",
         "also": [{"col": "solutions", "text": "solutions"}]},
        {"col": "hw", "kind": "pdf", "label": "assigned", "text": "homework", "due": "hw_due"},
        {"col": "submit", "kind": "pdf", "label": "due", "text": "homework", "by": "submit_by"},
        {"col": "note", "kind": "md", "label": "note"},
    ],
    "inline": [
        {"col": "topic", "kind": "md"},
        {"col": "resources", "kind": "md", "label": "links"},
        {"col": "note", "kind": "md", "label": "note"},
    ],
    "weekly": [
        {"col": "topic", "kind": "md"},
        {"col": "reading", "kind": "md", "label": "reading", "pages": "pages"},
        {"col": "supplemental", "kind": "text", "label": "supplemental"},
        {"col": "notes", "kind": "pdf", "label": "notes", "text": "notes",
         "also": [{"col": "handout", "text": "handout"}]},
        {"col": "recording", "kind": "panopto", "label": "recording", "text": "recording"},
        {"col": "homework", "kind": "pdf", "label": "homework due", "text": "problem set"},
        {"col": "note", "kind": "md", "label": "note"},
    ],
}


# ---------------------------------------------------------------- dates ----

class Cursor:
    """Resolves the mixture of absolute dates, bare weekdays, and week ranges."""

    def __init__(self, year):
        self.year = year
        self.at = None

    def _make(self, month_idx, day):
        y = self.year
        # A fall course runs Sept -> Dec; a page that wraps into January is the
        # next calendar year.
        if self.at is not None and month_idx < self.at.month and self.at.month >= 11:
            y += 1
        return datetime(y, month_idx, day)

    def absolute(self, month, day):
        self.at = self._make(ABBR[month[:3].title()], int(day))
        return self.at

    def weekday(self, name):
        if self.at is None:
            return None
        target = DAYS.index(name)
        d = self.at + timedelta(days=1)
        while d.weekday() != target:
            d += timedelta(days=1)
        self.at = d
        return d

    def reseed(self, text):
        """'28 September - 30 September' -> cursor just before the 28th."""
        m = re.search(rf"(\d{{1,2}})\s+({MONTH_RE})", text)
        if m:
            self.at = self._make(ABBR[m.group(2)[:3].title()], int(m.group(1))) - timedelta(days=1)
            return True
        m = re.search(rf"({MONTH_RE})\.?\s+(\d{{1,2}})", text)
        if m:
            self.at = self._make(ABBR[m.group(1)[:3].title()], int(m.group(2))) - timedelta(days=1)
            return True
        return False


# -------------------------------------------------------------- helpers ----

def stem(url, files_base):
    if not url:
        return ""
    if files_base and url.startswith(files_base):
        tail = url[len(files_base):]
        return tail[:-4] if tail.endswith(".pdf") else tail
    return url


def panopto_id(url):
    m = re.search(r"[?&]id=([0-9a-f-]{36})", url)
    return m.group(1) if m else url


def split_commas(text):
    """Split on commas that are not inside [] or ()."""
    out, depth, cur = [], 0, ""
    for ch in text:
        if ch in "[(":
            depth += 1
        elif ch in "])":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


def classify(text):
    low = text.lower()
    if "cancelled" in low or "no class" in low:
        return "cancelled"
    if "break" in low:
        return "break"
    if re.search(r"\bfinal exam\b", low):
        return "final"
    if re.search(r"\bin-class exam\b|^exam\b", low):
        return "exam"
    if low.startswith("review"):
        return "review"
    return "class"


# -------------------------------------------------------------- parsers ----

def parse_bullets(header_rest, bullets, row, files_base):
    leftovers = []
    if header_rest.strip():
        leftovers.append(header_rest.strip())

    for item in bullets:
        low = item.lower()
        links = LINK.findall(item)
        handled = False

        t = classify(item)
        if t != "class":
            row["type"] = t
            handled = t in ("cancelled", "break")

        if low.startswith("reading:"):
            body = item[len("reading:"):].strip()
            pg = PAGES.search(body)
            if pg:
                row["pages"] = re.sub(r"\s*[-–]\s*", "–", pg.group(1))
                body = PAGES.sub("", body).strip()
            row["reading"] = body.strip(" ,")
            handled = True
        elif "lecture" in low and links:
            row["lecture"] = panopto_id(links[0][1])
            handled = True
        elif "worksheet" in low and links:
            for text, url in links:
                if "solution" in text.lower():
                    row["solutions"] = stem(url, files_base)
                elif "worksheet" in text.lower() or not row["worksheet"]:
                    row["worksheet"] = stem(url, files_base)
            handled = True
        elif "assigned homework" in low:
            if links:
                row["hw"] = stem(links[0][1], files_base)
            d = DUE.search(item)
            if d:
                row["_hw_due_raw"] = (d.group(1), d.group(2))
            handled = True
        elif "submit homework" in low:
            if links:
                row["submit"] = stem(links[0][1], files_base)
            t = BY_TIME.search(item)
            if t:
                row["submit_by"] = t.group(1).lower().replace(" ", "")
            handled = True
        elif low in ("no reading or lecture", "no homework assigned", "no homework due"):
            handled = True

        if not handled:
            leftovers.append(item)

    row["note"] = " ❦ ".join(leftovers)


def parse_inline(header_rest, bullets, row, files_base):
    parts = split_commas(header_rest.strip())
    topic, resources, notes = [], [], []
    for p in parts:
        if not p:
            continue
        if LINK.fullmatch(p):
            (resources if topic or resources else topic).append(p)
        elif LINK.search(p):
            resources.append(p)
        else:
            (topic if not resources else notes).append(p)

    row["topic"] = ", ".join(topic)
    row["resources"] = " ❦ ".join(resources)
    row["note"] = " ❦ ".join(notes + [b for b in bullets])
    row["type"] = classify(header_rest)


def parse_weekly(header_rest, bullets, row, files_base):
    row["topic"] = header_rest.strip()
    row["type"] = classify(header_rest)
    leftovers = []

    for item in bullets:
        low = item.lower()
        links = LINK.findall(item)
        handled = False

        if low.startswith("reading:"):
            body = item.split(":", 1)[1].strip()
            pg = PAGES.search(body)
            if pg:
                row["pages"] = re.sub(r"\s*[-–]\s*", "–", pg.group(1))
                body = PAGES.sub("", body).strip()
            row["reading"] = body.strip(" ,")
            handled = True
        elif low.startswith("supplemental reading:"):
            body = item.split(":", 1)[1].strip()
            pg = PAGES.search(body)
            row["supplemental"] = (f"pp. {pg.group(1)}" if pg else body).strip()
            handled = True
        elif "homework due" in low:
            if links:
                row["homework"] = stem(links[0][1], files_base)
                handled = True
        elif links:
            for text, url in links:
                t = text.lower()
                if "recording" in t:
                    row["recording"] = panopto_id(url)
                    handled = True
                elif "note" in t:
                    row["notes"] = stem(url, files_base)
                    handled = True
                elif "handout" in t:
                    row["handout"] = stem(url, files_base)
                    handled = True
            if not handled:
                leftovers.append(item)
        if not handled and not links:
            leftovers.append(item)

    row["note"] = " ❦ ".join(leftovers)


PARSERS = {"bullets": parse_bullets, "inline": parse_inline, "weekly": parse_weekly}


# ----------------------------------------------------------------- main ----

def parse(path, fmt, year, files_base):
    cols = COLUMNS[fmt]
    cursor = Cursor(year)
    rows, week, week_dates = [], "", ""
    pending = None          # (header_text, header_rest, bullets)
    prose = []              # page preamble (before the first week header)
    week_prose = []         # loose text inside a week, e.g. 544's finals week
    frontmatter, facts = [], []  # facts: (indent, text)
    in_fm = False
    seen_rule = False

    def flush_week_prose():
        nonlocal week_prose
        if not week_prose:
            return
        row = {c: "" for c in cols}
        row["week"] = week
        if "week_dates" in row:
            row["week_dates"] = week_dates
        row["type"] = "note"
        row["note"] = " ".join(week_prose)
        rows.append(row)
        week_prose = []

    def flush():
        nonlocal pending
        if pending is None:
            return
        head, rest, bullets = pending
        row = {c: "" for c in cols}
        row["week"] = week
        row["type"] = "class"
        if "week_dates" in row:
            row["week_dates"] = week_dates

        m = H_FULL_MD.match(head) or None
        if m:
            row["date"] = cursor.absolute(m.group(2), m.group(3)).strftime("%Y-%m-%d")
        else:
            m = H_FULL_DM.match(head)
            if m:
                row["date"] = cursor.absolute(m.group(3), m.group(2)).strftime("%Y-%m-%d")
            else:
                m = H_WEEKDAY.match(head)
                if m:
                    d = cursor.weekday(m.group(1))
                    row["date"] = d.strftime("%Y-%m-%d") if d else ""
                    if not d:
                        row["display"] = head
                else:
                    m = H_RANGE.match(head)
                    row["display"] = head
                    if m:
                        cursor.absolute(m.group(1), m.group(3))

        PARSERS[fmt](rest, bullets, row, files_base)
        raw = row.pop("_hw_due_raw", None)
        if raw and "hw_due" in row:
            save = cursor.at
            row["hw_due"] = cursor.absolute(raw[0], raw[1]).strftime("%Y-%m-%d")
            cursor.at = save
        rows.append({k: row.get(k, "") for k in cols})
        pending = None

    lines = open(path, encoding="utf-8").read().split("\n")
    for i, raw in enumerate(lines):
        line = raw.rstrip()

        if line.strip() == "---":
            if i == 0:
                in_fm = True
                continue
            if in_fm:
                in_fm = False
                continue
            seen_rule = True
            continue
        if in_fm:
            frontmatter.append(line)
            continue

        # header bullet block, before the horizontal rule
        m = re.match(r"^(\s+)-\s+(.*)$", line) if not seen_rule else None
        if m:
            indent, text = len(m.group(1)), m.group(2).strip()
            # nested bullets ("Course meetings:" -> "F01: ...") belong to the
            # fact above them, not to a fact of their own
            if facts and indent > facts[-1][0]:
                prev = facts[-1][1]
                joiner = ":\n" if "\n" not in prev else "\n"
                facts[-1] = (facts[-1][0], prev.rstrip(": ") + joiner + text)
            else:
                facts.append((indent, text))
            continue

        wh = WEEK_HEADER.match(line)
        if wh:
            flush()
            flush_week_prose()
            label = wh.group(1).strip()
            m = re.search(r"week\s+(\d+)", label, re.I)
            week = m.group(1) if m else label
            week_dates = ""
            continue

        wr = WEEK_RANGE.match(line)
        if wr and pending is None:
            week_dates = wr.group(1).strip()
            cursor.reseed(week_dates)
            continue

        bh = BOLD_HEADER.match(line)
        if bh and seen_rule:
            flush()
            pending = (bh.group(1).strip(), bh.group(2).strip(), [])
            continue

        if pending is not None and re.match(r"^\s*-\s+", line):
            pending[2].append(re.sub(r"^\s*-\s+", "", line).strip())
            continue

        if seen_rule and line.strip() and not line.startswith("#"):
            if pending is not None:
                pending[2].append(line.strip())
            elif week:
                week_prose.append(line.strip())
            else:
                prose.append(line.strip())

    flush()
    flush_week_prose()
    return rows, frontmatter, [t for _, t in facts], prose


LABELS = {
    "course meetings": "meetings", "zulip": "discussion",
    "zulip channel": "discussion", "zulip workspace": "discussion",
    "gradescope": "submissions", "text": "textbook", "ta": "teaching assistant",
    "drop-in hours": "office hours", "scheduling link": "scheduling",
    "course information & syllabus": "syllabus", "videos": "video",
    "reading reflections": "reading reflections",
}
BARE_LINK = re.compile(r"^\[([^\]]+)\]\(([^)]+)\)$")


def curate(facts):
    """Header bullets -> {label, value}. 'Office hours: MWF 9-10' splits on the
    colon; a bare '[Syllabus](...)' uses its own link text as the label."""
    out, seen = [], {}
    for f in facts:
        f = f.strip()
        if not f or f.lower().startswith("instructor:"):
            continue
        m = BARE_LINK.match(f)
        if m:
            label, value = m.group(1), f
        elif ":" in f and not f.startswith("["):
            head, _, tail = f.partition(":")
            if len(head) < 40:
                label, value = head, tail.strip()
            else:
                label, value = "note", f
        else:
            label, value = "note", f
        label = label.strip().lower()
        label = LABELS.get(label, label)
        if label in seen:                     # fold repeats into one row
            out[seen[label]]["value"] += " ❦ " + value
        else:
            seen[label] = len(out)
            out.append({"label": label, "value": value})
    return out


def draft_meta(args, frontmatter, facts, prose):
    fm = "\n".join(frontmatter)
    title = re.search(r'title:\s*"?([^"\n]+)"?', fm)
    full = title.group(1).strip() if title else args.slug
    number, _, name = full.partition(":")
    return {
        "slug": args.permalink,
        "number": number.strip().lower(),
        "title": name.strip().lower() or number.strip().lower(),
        "term": args.term,
        "schedule": f"{args.slug}.csv",
        "filesBase": args.files_base,
        **({"panoptoBase": args.panopto} if args.panopto else {}),
        "current": args.current,
        "blurb": "",
        **({"preamble": " ".join(prose)} if prose else {}),
        "facts": curate(facts),
        "render": RENDER[args.format],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--format", choices=list(COLUMNS), required=True)
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--slug", required=True, help="basename for the data files")
    ap.add_argument("--permalink", help="url segment; defaults to the leading digits of --slug")
    ap.add_argument("--term", default="")
    ap.add_argument("--files-base", default="")
    ap.add_argument("--panopto", default="")
    ap.add_argument("--current", action="store_true")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    a.permalink = a.permalink or re.match(r"\d+", a.slug).group(0)

    rows, frontmatter, facts, prose = parse(a.source, a.format, a.year, a.files_base)
    os.makedirs(a.out, exist_ok=True)

    csv_path = os.path.join(a.out, f"{a.slug}.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS[a.format])
        w.writeheader()
        w.writerows(rows)

    json_path = os.path.join(a.out, f"{a.slug}.json")
    if not os.path.exists(json_path):
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(draft_meta(a, frontmatter, facts, prose), fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        note = "drafted"
    else:
        note = "kept existing"

    kinds = {}
    for r in rows:
        kinds[r["type"]] = kinds.get(r["type"], 0) + 1
    dated = sum(1 for r in rows if r["date"])
    print(f"{a.slug}: {len(rows)} meetings ({dated} dated) {kinds}", file=sys.stderr)
    print(f"  -> {csv_path}\n  -> {json_path} ({note})", file=sys.stderr)
    if any(r["note"] for r in rows):
        n = sum(1 for r in rows if r["note"])
        print(f"  {n} rows carry free-text notes — review the note column", file=sys.stderr)


if __name__ == "__main__":
    main()
