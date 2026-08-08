#!/usr/bin/env python3
"""
mcp_server.py
-------------
Expose LLM-Brains as an MCP (Model Context Protocol) server.

All Claude profiles can query your brain directly via tool calls:
  - search_brain        — hybrid FTS5 + vector search
  - get_wiki_article    — fetch a specific wiki article by slug/title
  - list_wiki_articles  — browse all wiki articles
  - ingest_note         — add a new note to the brain
  - get_brain_stats     — database statistics
  - run_dream_cycle     — trigger nightly consolidation on demand

Claude Desktop config (~/.config/claude/claude_desktop_config.json):

    {
      "mcpServers": {
        "llm-brains": {
          "command": "python",
          "args": ["/path/to/LLM-Brains/mcp_server.py"],
          "env": {
            "BRAIN_DIR": "/path/to/your/brain",
            "ANTHROPIC_API_KEY": "sk-ant-..."
          }
        }
      }
    }

Hermes profile config (profiles/*.yaml):

    mcp_servers:
      - name: llm-brains
        command: python /path/to/LLM-Brains/mcp_server.py

Run directly (for testing):
    python mcp_server.py
    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python mcp_server.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BRAIN_DIR = Path(os.getenv("BRAIN_DIR", "./brain"))
DB_PATH = BRAIN_DIR / "memory.db"


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _search_brain(query: str, top_k: int = 10, mode: str = "hybrid",
                  source: str = "both") -> dict:
    """Hybrid FTS5 + vector search over all notes and wiki articles."""
    try:
        from src.db_manager import DBManager
        from src.search import hybrid_search, keyword_search

        if not DB_PATH.exists():
            return {"error": f"Brain database not found at {DB_PATH}. Run: python main.py ingest <vault>"}

        search_wiki = source in ("both", "wiki")
        search_notes = source in ("both", "notes")

        with DBManager(str(DB_PATH)) as db:
            if mode == "keyword":
                results = keyword_search(db, query, top_k=top_k)
            else:
                results = hybrid_search(
                    db, query, top_k=top_k,
                    search_wiki=search_wiki,
                    search_notes=search_notes,
                )

        output = []
        for r in results:
            output.append({
                "source": r.get("source", "note"),
                "title": r.get("title", ""),
                "content_preview": r.get("content", "")[:400],
                "path": r.get("path") or r.get("slug", ""),
                "score": round(r.get("score", 0), 6),
                "tags": r.get("tags", ""),
            })
        return {"query": query, "results": output, "count": len(output)}

    except Exception as exc:
        return {"error": str(exc)}


def _get_wiki_article(identifier: str) -> dict:
    """Fetch a wiki article by slug, title, or filename."""
    try:
        from src.db_manager import DBManager

        # First try filesystem search (broader match)
        wiki_dir = BRAIN_DIR / "knowledge" / "wiki"
        if wiki_dir.exists():
            slug_lower = identifier.lower().replace(" ", "-")
            for p in wiki_dir.rglob("*.md"):
                name = p.stem.lower()
                if name == slug_lower or identifier.lower() in name:
                    return {
                        "title": p.stem.replace("-", " ").title(),
                        "slug": p.stem,
                        "content": p.read_text(encoding="utf-8"),
                        "path": str(p),
                    }

        # Fall back to SQLite
        if DB_PATH.exists():
            with DBManager(str(DB_PATH)) as db:
                article = db.get_wiki_article(identifier)
                if article:
                    return dict(article)

        return {"error": f"No wiki article found for: {identifier}"}

    except Exception as exc:
        return {"error": str(exc)}


def _list_wiki_articles(limit: int = 50, tag_filter: str = "") -> dict:
    """List all wiki articles, optionally filtered by tag."""
    try:
        wiki_dir = BRAIN_DIR / "knowledge" / "wiki"
        if not wiki_dir.exists():
            return {"articles": [], "count": 0}

        articles = []
        for p in sorted(wiki_dir.rglob("*.md")):
            content = p.read_text(encoding="utf-8", errors="ignore")
            # Extract title from frontmatter if present
            title = p.stem.replace("-", " ").title()
            if content.startswith("---"):
                for line in content.split("\n")[1:]:
                    if line.startswith("title:"):
                        title = line.split(":", 1)[1].strip().strip('"')
                        break

            article = {
                "slug": p.stem,
                "title": title,
                "preview": content[:200].replace("\n", " "),
                "modified": time.ctime(p.stat().st_mtime),
            }

            if tag_filter:
                if tag_filter.lower() not in content.lower():
                    continue

            articles.append(article)

        articles = articles[:limit]
        return {"articles": articles, "count": len(articles)}

    except Exception as exc:
        return {"error": str(exc)}


def _ingest_note(content: str, title: str = "", route: str = "knowledge",
                 tags: str = "") -> dict:
    """Add a new note to the brain database."""
    try:
        from src.db_manager import DBManager

        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        path = f"mcp_ingest/{int(time.time())}-{title[:30].replace(' ', '-') or 'note'}.md"

        with DBManager(str(DB_PATH)) as db:
            note_id = db.upsert_note(
                path=path,
                title=title or "Untitled",
                content=content,
                tags=json.dumps([t.strip() for t in tags.split(",") if t.strip()]),
                backlinks=json.dumps([]),
                modified_at=int(time.time()),
            )

        return {
            "success": True,
            "note_id": note_id,
            "path": path,
            "message": f"Note '{title or 'Untitled'}' ingested with ID {note_id}",
        }

    except Exception as exc:
        return {"error": str(exc)}


def _get_brain_stats() -> dict:
    """Return statistics about the brain database."""
    try:
        from src.db_manager import DBManager

        if not DB_PATH.exists():
            return {"error": "Brain database not initialised. Run: python main.py ingest <vault>"}

        with DBManager(str(DB_PATH)) as db:
            s = db.stats()

        # Count wiki files
        wiki_dir = BRAIN_DIR / "knowledge" / "wiki"
        wiki_files = len(list(wiki_dir.rglob("*.md"))) if wiki_dir.exists() else 0

        return {
            "db_path": str(s.get("db_path", DB_PATH)),
            "notes": s.get("notes", 0),
            "wiki_articles_db": s.get("wiki_articles", 0),
            "wiki_files": wiki_files,
            "embeddings": s.get("embeddings", 0),
            "sqlite_vec": s.get("sqlite_vec", False),
            "brain_dir": str(BRAIN_DIR),
        }
    except Exception as exc:
        return {"error": str(exc)}


def _run_dream_cycle(hours: int = 24, dry_run: bool = False) -> dict:
    """Trigger the dream cycle consolidation (episodic → semantic promotion)."""
    try:
        from dream_cycle import run_dream_cycle
        return run_dream_cycle(hours=hours, dry_run=dry_run, verbose=False)
    except Exception as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# MCP JSON-RPC server (stdio transport)
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "search_brain",
        "description": (
            "Hybrid FTS5 keyword + vector semantic search over all notes and wiki articles "
            "in the LLM-Brains knowledge base. Uses Reciprocal Rank Fusion (RRF) to merge "
            "both result sets. Returns ranked results with content previews."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
                "top_k": {"type": "integer", "default": 10, "description": "Max results (1-50)"},
                "mode": {
                    "type": "string",
                    "enum": ["hybrid", "keyword", "vector"],
                    "default": "hybrid",
                    "description": "Search mode: hybrid (default), keyword-only, or vector-only",
                },
                "source": {
                    "type": "string",
                    "enum": ["both", "notes", "wiki"],
                    "default": "both",
                    "description": "Which sources to search",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_wiki_article",
        "description": "Retrieve a full wiki article by its slug, title, or filename.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "identifier": {
                    "type": "string",
                    "description": "Article slug (e.g. 'transformer-attention'), title, or filename",
                },
            },
            "required": ["identifier"],
        },
    },
    {
        "name": "list_wiki_articles",
        "description": "List all wiki articles in the knowledge base with previews.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 50, "description": "Max articles to return"},
                "tag_filter": {"type": "string", "default": "", "description": "Filter by tag/keyword"},
            },
        },
    },
    {
        "name": "ingest_note",
        "description": (
            "Add a new note or piece of information directly to the brain database. "
            "Useful for capturing insights mid-conversation."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The note content (markdown)"},
                "title": {"type": "string", "default": "", "description": "Note title"},
                "route": {
                    "type": "string",
                    "default": "knowledge",
                    "description": "Category: me/work/knowledge/media",
                },
                "tags": {"type": "string", "default": "", "description": "Comma-separated tags"},
            },
            "required": ["content"],
        },
    },
    {
        "name": "get_brain_stats",
        "description": "Return statistics about the brain database: note count, wiki articles, embeddings.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "run_dream_cycle",
        "description": (
            "Trigger the dream cycle: scans recent episodic notes and promotes key insights "
            "to semantic wiki articles. Equivalent to a manual nightly consolidation pass."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "hours": {
                    "type": "integer",
                    "default": 24,
                    "description": "How many hours back to scan",
                },
                "dry_run": {
                    "type": "boolean",
                    "default": False,
                    "description": "Preview without writing files",
                },
            },
        },
    },
]

SERVER_INFO = {
    "name": "llm-brains",
    "version": "1.0.0",
    "description": "LLM-Brains personal second-brain — hybrid search, wiki, dream cycle consolidation",
}


def _dispatch_tool(name: str, args: dict) -> str:
    """Call the appropriate tool and return JSON string result."""
    if name == "search_brain":
        result = _search_brain(
            query=args["query"],
            top_k=args.get("top_k", 10),
            mode=args.get("mode", "hybrid"),
            source=args.get("source", "both"),
        )
    elif name == "get_wiki_article":
        result = _get_wiki_article(identifier=args["identifier"])
    elif name == "list_wiki_articles":
        result = _list_wiki_articles(
            limit=args.get("limit", 50),
            tag_filter=args.get("tag_filter", ""),
        )
    elif name == "ingest_note":
        result = _ingest_note(
            content=args["content"],
            title=args.get("title", ""),
            route=args.get("route", "knowledge"),
            tags=args.get("tags", ""),
        )
    elif name == "get_brain_stats":
        result = _get_brain_stats()
    elif name == "run_dream_cycle":
        result = _run_dream_cycle(
            hours=args.get("hours", 24),
            dry_run=args.get("dry_run", False),
        )
    else:
        result = {"error": f"Unknown tool: {name}"}

    return json.dumps(result, indent=2)


def _handle_request(req: dict) -> dict | None:
    """Handle one JSON-RPC request, return response dict or None for notifications."""
    req_id = req.get("id")
    method = req.get("method", "")
    params = req.get("params", {})

    def ok(result: dict) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def err(code: int, message: str) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

    if method == "initialize":
        return ok({
            "protocolVersion": "2024-11-05",
            "serverInfo": SERVER_INFO,
            "capabilities": {"tools": {}},
        })

    if method == "notifications/initialized":
        return None  # notification, no response

    if method == "tools/list":
        return ok({"tools": TOOLS})

    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        try:
            text = _dispatch_tool(tool_name, arguments)
            return ok({
                "content": [{"type": "text", "text": text}],
                "isError": False,
            })
        except Exception as exc:
            return ok({
                "content": [{"type": "text", "text": json.dumps({"error": str(exc)})}],
                "isError": True,
            })

    if method == "ping":
        return ok({})

    return err(-32601, f"Method not found: {method}")


def serve_stdio() -> None:
    """Run the MCP server over stdin/stdout (Claude Desktop / Hermes compatible)."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        response = _handle_request(req)
        if response is not None:
            print(json.dumps(response), flush=True)


if __name__ == "__main__":
    serve_stdio()
