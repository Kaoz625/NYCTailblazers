#!/usr/bin/env python3
"""
dream_cycle.py
--------------
Nightly episodic → semantic memory promotion for LLM-Brains.

Inspired by how the brain consolidates memory during REM sleep:
  1. Scans recent episodic entries (brain/me/experiences/, brain/raw/, brain/me/)
  2. Extracts patterns and key insights via Claude
  3. Promotes high-value insights to semantic wiki articles
  4. Creates cross-links between recently touched concepts
  5. Writes a daily synthesis note to brain/me/timeline.md
  6. Re-indexes everything in SQLite

Cron setup (nightly at 3am):
    0 3 * * * cd /path/to/LLM-Brains && python dream_cycle.py >> brain/dream.log 2>&1

Usage:
    python dream_cycle.py                  # process last 24h
    python dream_cycle.py --hours 48       # process last 48h
    python dream_cycle.py --dry-run        # preview without writing
    python dream_cycle.py --verbose        # detailed output
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BRAIN_DIR = Path(os.getenv("BRAIN_DIR", "./brain"))
EPISODIC_DIRS = [
    BRAIN_DIR / "me" / "experiences",
    BRAIN_DIR / "raw",
    BRAIN_DIR / "me",
]
WIKI_DIR = BRAIN_DIR / "knowledge" / "wiki"
TIMELINE_PATH = BRAIN_DIR / "me" / "timeline.md"
DREAM_LOG_PATH = BRAIN_DIR / "dream.log"

# How many recent notes to pass to Claude in one context window
MAX_NOTES_PER_BATCH = 20
# Minimum content length worth promoting (chars)
MIN_PROMOTE_LENGTH = 200
# RRF/relevance threshold for cross-link creation
CROSS_LINK_SIMILARITY_THRESHOLD = 0.3


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_recent_files(hours: int) -> list[dict]:
    """Return all .md / .txt files modified within the last `hours` hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    found = []
    for directory in EPISODIC_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.md")) + sorted(directory.rglob("*.txt")):
            # skip already-compiled wiki articles
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            except OSError:
                continue
            if mtime >= cutoff:
                try:
                    content = path.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                found.append({
                    "path": str(path),
                    "relative": str(path.relative_to(BRAIN_DIR)),
                    "modified": mtime.isoformat(),
                    "content": content,
                    "size": len(content),
                })
    # sort newest-first, drop tiny files
    found = [f for f in found if f["size"] >= 50]
    found.sort(key=lambda f: f["modified"], reverse=True)
    return found[:MAX_NOTES_PER_BATCH]


def _build_episodic_context(files: list[dict]) -> str:
    """Format recent files into a compact context block for Claude."""
    lines = []
    for f in files:
        lines.append(f"### [{f['relative']}] (modified {f['modified'][:10]})")
        lines.append(f["content"][:2000])  # cap per-file to save tokens
        lines.append("")
    return "\n".join(lines)


def _call_claude(system: str, user: str) -> str:
    """Call Claude API and return the text response."""
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    msg = client.messages.create(
        model=os.getenv("ANTHROPIC_MODEL", "claude-opus-4-7"),
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text


def _slug(title: str) -> str:
    """Convert a title to a safe filename slug."""
    import re
    title = title.lower().strip()
    title = re.sub(r"[^\w\s-]", "", title)
    title = re.sub(r"[\s_]+", "-", title)
    return title[:80]


def _write_wiki_article(title: str, content: str, source_paths: list[str],
                         date_str: str, dry_run: bool, verbose: bool) -> Optional[Path]:
    """Write a new wiki article. Returns the path, or None on dry run."""
    WIKI_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{date_str}-{_slug(title)}.md"
    dest = WIKI_DIR / filename

    frontmatter = (
        f"---\n"
        f"title: \"{title}\"\n"
        f"created: {date_str}\n"
        f"source: dream_cycle\n"
        f"sources:\n"
    )
    for sp in source_paths:
        frontmatter += f"  - \"{sp}\"\n"
    frontmatter += "---\n\n"

    full_content = frontmatter + content

    if dry_run:
        if verbose:
            print(f"  [DRY RUN] Would write: {dest}")
            print(f"  Preview: {content[:200]}...\n")
        return None

    dest.write_text(full_content, encoding="utf-8")
    if verbose:
        print(f"  Wrote wiki article: {dest.name}")
    return dest


def _append_synthesis_to_timeline(synthesis: str, date_str: str,
                                   dry_run: bool, verbose: bool) -> None:
    """Append today's dream-cycle synthesis to the timeline file."""
    TIMELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    entry = (
        f"\n## Dream Cycle — {date_str}\n\n"
        f"{synthesis.strip()}\n"
        f"\n---\n"
    )
    if dry_run:
        if verbose:
            print(f"  [DRY RUN] Would append to {TIMELINE_PATH}:\n{entry[:300]}")
        return
    with TIMELINE_PATH.open("a", encoding="utf-8") as f:
        f.write(entry)
    if verbose:
        print(f"  Appended synthesis to {TIMELINE_PATH}")


def _index_new_articles(new_paths: list[Path], verbose: bool) -> int:
    """Add newly created wiki articles to the SQLite index."""
    if not new_paths:
        return 0
    try:
        from src.db_manager import DBManager
        db_path = BRAIN_DIR / "memory.db"
        indexed = 0
        with DBManager(str(db_path)) as db:
            for p in new_paths:
                content = p.read_text(encoding="utf-8", errors="ignore")
                title = p.stem.replace("-", " ").title()
                db.upsert_note(
                    path=str(p),
                    title=title,
                    content=content,
                    tags=json.dumps(["dream_cycle", "semantic"]),
                    backlinks=json.dumps([]),
                    modified_at=int(time.time()),
                )
                indexed += 1
        if verbose:
            print(f"  Indexed {indexed} new article(s) in SQLite")
        return indexed
    except Exception as exc:
        print(f"  Warning: could not index in SQLite: {exc}", file=sys.stderr)
        return 0


# ---------------------------------------------------------------------------
# Core dream cycle logic
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are the Dream Cycle engine for LLM-Brains — an AI memory consolidation
system inspired by how the brain consolidates memories during REM sleep.

Your job:
1. Read the recent episodic notes provided
2. Identify the 2-5 most important PATTERNS, INSIGHTS, or CONCEPTS worth preserving
3. For each one, decide if it merits promotion to a permanent semantic wiki article
4. Generate cross-links using [[WikiLink]] syntax to connect related concepts
5. Write a concise daily synthesis paragraph

You must respond with VALID JSON in exactly this schema:
{
  "synthesis": "One paragraph summarising today's themes and what matters most.",
  "promotions": [
    {
      "title": "Concept Title",
      "promote": true,
      "reason": "Why this deserves a wiki article",
      "article": "Full markdown content of the wiki article (with [[wikilinks]]).",
      "source_paths": ["relative/path/to/source.md"]
    }
  ],
  "cross_links": [
    {"from": "concept-slug", "to": "existing-wiki-article-slug", "relation": "extends"}
  ],
  "tags": ["tag1", "tag2"]
}

Rules:
- Only promote if the content has lasting value beyond today
- Wiki articles should be 200-600 words, written as structured knowledge
- Use [[WikiLink]] format for all concept references
- synthesis must be 2-4 sentences, honest and specific
- If nothing is worth promoting, set promotions to []
"""


def run_dream_cycle(
    hours: int = 24,
    dry_run: bool = False,
    verbose: bool = True,
) -> dict:
    """
    Run one full dream cycle pass.

    Returns a summary dict with counts of what was processed/promoted.
    """
    date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"🌙 Dream Cycle — {date_str} (scanning last {hours}h)")

    # 1. Load recent episodic content
    files = _load_recent_files(hours)
    if not files:
        print("  No recent episodic content found. Nothing to consolidate.")
        return {"files_scanned": 0, "promoted": 0, "indexed": 0}

    print(f"  Found {len(files)} recent file(s): {[f['relative'] for f in files]}")

    # 2. Build context and call Claude
    context = _build_episodic_context(files)
    user_prompt = (
        f"Today is {date_str}. Here are the recent episodic notes to consolidate:\n\n"
        f"{context}\n\n"
        "Apply the Dream Cycle analysis and respond with the JSON schema."
    )

    if verbose:
        print("  Calling Claude for consolidation analysis...")

    try:
        raw = _call_claude(SYSTEM_PROMPT, user_prompt)
    except Exception as exc:
        print(f"  Error calling Claude: {exc}", file=sys.stderr)
        return {"files_scanned": len(files), "promoted": 0, "indexed": 0, "error": str(exc)}

    # 3. Parse Claude's response
    try:
        # Strip markdown code blocks if present
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        print(f"  Warning: could not parse Claude response as JSON: {exc}", file=sys.stderr)
        if verbose:
            print(f"  Raw response: {raw[:500]}")
        return {"files_scanned": len(files), "promoted": 0, "indexed": 0, "error": "json_parse"}

    synthesis = result.get("synthesis", "")
    promotions = result.get("promotions", [])

    if verbose and synthesis:
        print(f"\n  📝 Today's synthesis:\n  {synthesis}\n")

    # 4. Write promoted wiki articles
    new_paths: list[Path] = []
    promoted_count = 0
    for promo in promotions:
        if not promo.get("promote"):
            continue
        title = promo.get("title", "Untitled")
        article_content = promo.get("article", "")
        source_paths = promo.get("source_paths", [])

        if len(article_content) < MIN_PROMOTE_LENGTH:
            if verbose:
                print(f"  Skipping '{title}' — content too short ({len(article_content)} chars)")
            continue

        print(f"  ✨ Promoting: {title}")
        path = _write_wiki_article(
            title=title,
            content=article_content,
            source_paths=source_paths,
            date_str=date_str,
            dry_run=dry_run,
            verbose=verbose,
        )
        if path:
            new_paths.append(path)
        promoted_count += 1

    # 5. Write daily synthesis to timeline
    if synthesis:
        _append_synthesis_to_timeline(synthesis, date_str, dry_run, verbose)

    # 6. Index new articles in SQLite
    indexed = _index_new_articles(new_paths, verbose)

    summary = {
        "date": date_str,
        "files_scanned": len(files),
        "promoted": promoted_count,
        "indexed": indexed,
        "synthesis": synthesis,
        "cross_links": result.get("cross_links", []),
        "tags": result.get("tags", []),
    }

    print(
        f"\n✅ Dream cycle complete: "
        f"{summary['files_scanned']} files → {summary['promoted']} promotions, "
        f"{summary['indexed']} indexed"
    )
    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="LLM-Brains Dream Cycle — nightly episodic → semantic memory promotion"
    )
    parser.add_argument(
        "--hours", type=int, default=24,
        help="How many hours back to scan for recent episodic entries (default: 24)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview what would happen without writing any files"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", default=True,
        help="Detailed output"
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true",
        help="Suppress verbose output"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Write the summary JSON to this file path"
    )
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
        print("Set it in your .env file or environment.", file=sys.stderr)
        sys.exit(1)

    verbose = args.verbose and not args.quiet

    summary = run_dream_cycle(
        hours=args.hours,
        dry_run=args.dry_run,
        verbose=verbose,
    )

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"Summary written to {output_path}")


if __name__ == "__main__":
    main()
