#!/usr/bin/env python3
"""
Convert the academicpages research page into src/data/research.json.

The source is 36 KB of hand-maintained markdown in which every paper repeats
the same shape:

    * **Title**. Venue. [arXiv:2508.20786](https://arxiv.org/abs/2508.20786).
      <details>
        <summary>Abstract and coauthors.</summary>

        Abstract text. (With A, B, and C.)
      </details>

Six sections use four variants of that shape. Pulling them into JSON means an
arXiv number, a DOI, and a coauthor list are typed once and can then be rendered
anywhere — the research page, a per-paper page, a CV, a BibTeX export.

Usage:
    python3 tools/import_research.py ../kyleormsby.github.io/_pages/research.md \\
        --out src/data/research.json
"""
import argparse
import json
import re
import sys

LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
BOLD_TITLE = re.compile(r"^\*\*(.+?)\*\*")
ITAL_TITLE = re.compile(r"^\*(.+?)\*(?=,|$)")
COAUTHORS = re.compile(r"\((?:With|with)\s+(.+?)\.?\)\s*$", re.S)
DATE = re.compile(r"\b(\d{1,2}\s+\w+\s+\d{4})\b")

# Section heading -> style. Anchors are the slugified heading, which is what
# academicpages generated, so the intro's in-page links and any external deep
# links keep working.
STYLES = {
    "research papers": "paper",
    "student papers": "paper",
    "published expository writing": "paper",
    "other expository writing": "paper",
    "seminars and conferences organized": "plain",
    "recent talks": "talk",
}


def strip_links(text):
    """Return (text without link markup, [{text, url}])."""
    links = [{"text": t, "url": u} for t, u in LINK.findall(text)]
    return LINK.sub("", text), links


def tidy(text):
    """Collapse whitespace and clean up the punctuation that removing an inline
    link leaves behind ("Submitted. ." -> "Submitted.")."""
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*([.,;])(?:\s*[.,;])+", r"\1", text)   # ". ." -> "."
    text = re.sub(r"\s+([.,;])", r"\1", text)                # " ." -> "."
    text = re.sub(r"^[.,;\s]+", "", text)
    text = re.sub(r"[\s,;]+$", "", text)
    return text.strip()


def parse_paper(block):
    head, _, rest = block.partition("<details>")
    item = {}

    m = BOLD_TITLE.match(head.strip())
    if m:
        item["title"] = m.group(1).strip()
        head = head.strip()[m.end():]
    else:
        item["title"] = tidy(head)
        head = ""

    by = re.match(r"\s*by\s+([^.]+)\.", head)
    if by:
        item["by"] = by.group(1).strip()
        head = head[by.end():]

    meta, links = strip_links(head)
    meta = tidy(meta)
    if meta:
        item["meta"] = meta
    if links:
        item["links"] = links

    body = re.sub(r"</?details>|<summary>.*?</summary>", "", rest, flags=re.S)
    body = tidy(body)
    if body:
        c = COAUTHORS.search(body)
        if c:
            item["coauthors"] = tidy(c.group(1))
            body = COAUTHORS.sub("", body).strip()
        item["abstract"] = tidy(body)
    return item


def parse_talk(block):
    item = {}
    text = block.strip()
    m = ITAL_TITLE.match(text)
    if m:
        item["title"] = m.group(1).strip()
        text = text[m.end():]
    rest, links = strip_links(text)
    rest = tidy(rest)

    d = DATE.search(rest)
    if d:
        item["date"] = d.group(1)
        rest = tidy(rest.replace(d.group(1), ""))
    venue = tidy(rest).rstrip(".")
    if venue:
        item["venue"] = venue
    if links:
        item["links"] = links
    return item


def parse(path):
    text = open(path, encoding="utf-8").read()
    # drop the Jekyll frontmatter
    if text.startswith("---"):
        text = text.split("---", 2)[2]

    intro, sections, current = [], [], None
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        h = re.match(r"^#\s+(.*)$", line)
        if h:
            name = h.group(1).strip().lower()
            sid = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
            style = STYLES.get(name, "paper")
            current = {"id": sid, "title": name, "style": style, "note": "", "items": []}
            sections.append(current)
            i += 1
            continue

        if line.startswith("* "):
            block = [line[2:]]
            i += 1
            while i < len(lines) and not lines[i].startswith("* ") and not lines[i].startswith("# "):
                block.append(lines[i])
                i += 1
            raw = "\n".join(block)
            if current is None:
                i += 1
                continue
            if current["style"] == "talk":
                current["items"].append(parse_talk(raw))
            elif current["style"] == "plain":
                t, links = strip_links(raw)
                current["items"].append({"text": tidy(raw)})
            else:
                current["items"].append(parse_paper(raw))
            continue

        if line.strip():
            if current is None:
                intro.append(line.strip())
            elif not current["items"]:
                current["note"] = (current["note"] + " " + line.strip()).strip()
        i += 1

    return {"intro": " ".join(intro), "sections": sections}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    data = parse(a.source)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    total = 0
    for s in data["sections"]:
        n = len(s["items"])
        total += n
        missing = sum(1 for it in s["items"] if s["style"] == "paper" and not it.get("abstract"))
        print(f"  {s['title']}: {n} items"
              + (f"  ({missing} without an abstract)" if missing else ""), file=sys.stderr)
    print(f"{total} items -> {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
