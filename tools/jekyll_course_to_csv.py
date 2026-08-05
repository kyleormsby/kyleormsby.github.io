#!/usr/bin/env python3
"""
Convert a hand-written academicpages course page (e.g. _pages/113.md) into
the CSV + YAML pair that the Astro course template consumes.

Usage:
    python3 jekyll_course_to_csv.py 113.md --year 2026 --slug 113-spring26 \
        --files-base /files/113spring26/ --out ../src/data/courses

This is a one-time migration aid. After migrating you edit the CSV
(or a Google Sheet exported to it), not the markdown.
"""
import argparse
import csv
import os
import re
import sys
from datetime import datetime

MONTHS = "January February March April May June July August September October November December".split()
MONTH_RE = "|".join(MONTHS)

DAY_HEADER = re.compile(
    rf"^\*\*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+({MONTH_RE})\s+(\d{{1,2}})\*\*:?\s*(.*)$"
)
WEEK_HEADER = re.compile(r"^##\s+(.*)$")
LINK = re.compile(r"\[([^\]]*)\]\(([^)]*)\)")
DUE = re.compile(rf"\(due\s+(?:\w+day\s+)?({MONTH_RE})\s+(\d{{1,2}})\)")
PAGES = re.compile(r"\(pp?\.\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)\)")
BY_TIME = re.compile(r"by\s+(\d{1,2}(?::\d{2})?\s*[ap]m)", re.I)

FIELDS = [
    "week", "date", "type", "reading", "pages", "lecture",
    "worksheet", "solutions", "hw", "hw_due", "submit", "submit_by", "note",
]


def stem(url, files_base):
    """/files/113spring26/01-group.pdf -> 01-group (only if under files_base)."""
    if not url:
        return ""
    if files_base and url.startswith(files_base):
        tail = url[len(files_base):]
        return tail[:-4] if tail.endswith(".pdf") else tail
    return url


def to_iso(month, day, year, prev=None):
    """Resolve a 'March 4' style date. Roll the year forward if we wrapped."""
    m = MONTHS.index(month) + 1
    y = year
    if prev is not None and (m, int(day)) < (prev.month, prev.day) and prev.month >= 11:
        y = year + 1
    return datetime(y, m, int(day))


def parse(path, year, files_base):
    rows, week, cur = [], "", None
    leftovers = []

    def flush():
        nonlocal cur, leftovers
        if cur is not None:
            cur["note"] = " ❦ ".join(leftovers)
            rows.append(cur)
        cur, leftovers = None, []

    last_date = None
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")

        wh = WEEK_HEADER.match(line)
        if wh:
            flush()
            label = wh.group(1).strip()
            m = re.search(r"week\s+(\d+)", label, re.I)
            week = m.group(1) if m else label
            continue

        dh = DAY_HEADER.match(line)
        if dh:
            flush()
            d = to_iso(dh.group(1), dh.group(2), year, last_date)
            last_date = d
            cur = {f: "" for f in FIELDS}
            cur["week"], cur["date"], cur["type"] = week, d.strftime("%Y-%m-%d"), "class"
            continue

        if cur is None or not line.strip().startswith("-"):
            continue

        item = line.strip().lstrip("- ").strip()
        low = item.lower()
        links = LINK.findall(item)
        handled = False

        if "class cancelled" in low or "no class" in low:
            cur["type"] = "cancelled"
            handled = True
        elif low.startswith("in-class exam") or low.startswith("exam"):
            cur["type"] = "exam"
        elif low.startswith("review"):
            cur["type"] = "review"

        if low.startswith("reading:"):
            body = item[len("reading:"):].strip()
            pg = PAGES.search(body)
            if pg:
                cur["pages"] = re.sub(r"\s*[-–]\s*", "–", pg.group(1))
                body = PAGES.sub("", body).strip()
            cur["reading"] = body.strip()
            handled = True
        elif "lecture" in low and links:
            url = links[0][1]
            pid = re.search(r"[?&]id=([0-9a-f-]{36})", url)
            cur["lecture"] = pid.group(1) if pid else url
            handled = True
        elif low.startswith("[worksheet]") or "worksheet" in low and links:
            for text, url in links:
                if "solution" in text.lower():
                    cur["solutions"] = stem(url, files_base)
                elif "worksheet" in text.lower() or not cur["worksheet"]:
                    cur["worksheet"] = stem(url, files_base)
            handled = True
        elif "assigned homework" in low:
            if links:
                cur["hw"] = stem(links[0][1], files_base)
            d = DUE.search(item)
            if d:
                cur["hw_due"] = to_iso(d.group(1), d.group(2), year, last_date).strftime("%Y-%m-%d")
            handled = True
        elif "submit homework" in low:
            if links:
                cur["submit"] = stem(links[0][1], files_base)
            t = BY_TIME.search(item)
            if t:
                cur["submit_by"] = t.group(1).lower().replace(" ", "")
            handled = True
        elif low in ("no reading or lecture", "no homework assigned", "no homework due"):
            handled = True

        if not handled:
            leftovers.append(item)

    flush()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--slug", required=True)
    ap.add_argument("--files-base", default="")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    rows = parse(a.source, a.year, a.files_base)
    os.makedirs(a.out, exist_ok=True)
    dest = os.path.join(a.out, f"{a.slug}.csv")
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    kinds = {}
    for r in rows:
        kinds[r["type"]] = kinds.get(r["type"], 0) + 1
    print(f"wrote {dest}: {len(rows)} meetings {kinds}", file=sys.stderr)
    unparsed = sum(1 for r in rows if r["note"])
    print(f"{unparsed} meetings carry free-text notes (check the note column)", file=sys.stderr)


if __name__ == "__main__":
    main()
