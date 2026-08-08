"""
supabase_sync.py
----------------
Sync LLM-Brains SQLite data to self-hosted Supabase (Postgres + pgvector).

This module bridges the local SQLite store (fast, offline, zero-config) with
self-hosted Supabase (cloud-accessible, pgvector-native, REST API).

Use cases:
  - Sync brain to Supabase so multiple machines can query it
  - Use Supabase as the authoritative store for embeddings (pgvector HNSW)
  - Enable REST/realtime access from mobile apps or other Claude profiles

Config (in .env or .env.supabase):
    SUPABASE_DB_URL=postgresql://postgres:password@localhost:5432/postgres
    SUPABASE_URL=http://localhost:8000          (REST API endpoint)
    SUPABASE_SERVICE_KEY=your-service-role-key  (for REST API)

Usage:
    # Migrate schema (first time):
    python -m src.supabase_sync --migrate

    # Sync SQLite → Supabase:
    python -m src.supabase_sync --sync

    # Sync a single note:
    python -m src.supabase_sync --sync-path brain/raw/my-note.md

    # Search via pgvector (bypasses SQLite):
    python -m src.supabase_sync --search "transformer attention"
"""

from __future__ import annotations

import json
import os
import struct
import sys
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.supabase")

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8000")
SUPABASE_SERVICE_KEY = os.getenv("SERVICE_ROLE_KEY", "")
BRAIN_DIR = Path(os.getenv("BRAIN_DIR", "./brain"))
SQLITE_DB = BRAIN_DIR / "memory.db"


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def _get_pg_conn():
    """Get a psycopg2 connection to the self-hosted Supabase Postgres."""
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        raise ImportError(
            "psycopg2 is required for Supabase sync.\n"
            "Install with: pip install psycopg2-binary"
        )

    if not SUPABASE_DB_URL:
        raise ValueError(
            "SUPABASE_DB_URL is not set.\n"
            "Add it to .env.supabase: SUPABASE_DB_URL=postgresql://postgres:password@localhost:5432/postgres"
        )

    conn = psycopg2.connect(SUPABASE_DB_URL)
    conn.autocommit = False
    return conn


# ---------------------------------------------------------------------------
# Schema migration
# ---------------------------------------------------------------------------

def migrate(verbose: bool = True) -> None:
    """Apply the LLM-Brains schema to the self-hosted Supabase instance."""
    schema_path = Path(__file__).parent.parent / "docker" / "init" / "00-llm-brains.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    sql = schema_path.read_text(encoding="utf-8")
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        if verbose:
            print("✅ Schema migrated to self-hosted Supabase")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Sync SQLite → Supabase
# ---------------------------------------------------------------------------

def _sqlite_rows(query: str, params: tuple = ()) -> list[dict]:
    """Pull rows from SQLite as dicts."""
    import sqlite3
    if not SQLITE_DB.exists():
        return []
    conn = sqlite3.connect(str(SQLITE_DB))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _deserialize_vector(blob: bytes) -> list[float]:
    """Unpack sqlite-vec binary blob to float list."""
    n = len(blob) // 4
    return list(struct.unpack(f"{n}f", blob))


def sync_notes(verbose: bool = True) -> int:
    """Upsert all notes from SQLite into Supabase Postgres. Returns count."""
    rows = _sqlite_rows("SELECT * FROM notes ORDER BY modified_at ASC")
    if not rows:
        if verbose:
            print("  No notes found in SQLite.")
        return 0

    conn = _get_pg_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            for r in rows:
                tags = r.get("tags", "[]")
                if isinstance(tags, str):
                    tags = json.loads(tags)
                backlinks = r.get("backlinks", "[]")
                if isinstance(backlinks, str):
                    backlinks = json.loads(backlinks)

                cur.execute("""
                    INSERT INTO notes (path, title, content, route, tags, backlinks, updated_at)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, NOW())
                    ON CONFLICT (path) DO UPDATE SET
                        title     = EXCLUDED.title,
                        content   = EXCLUDED.content,
                        route     = EXCLUDED.route,
                        tags      = EXCLUDED.tags,
                        backlinks = EXCLUDED.backlinks,
                        updated_at = NOW()
                """, (
                    r["path"],
                    r.get("title", ""),
                    r.get("content", ""),
                    r.get("route", "knowledge"),
                    json.dumps(tags),
                    json.dumps(backlinks),
                ))
                count += 1

        conn.commit()
        if verbose:
            print(f"  Synced {count} notes → Supabase")
    finally:
        conn.close()
    return count


def sync_wiki_articles(verbose: bool = True) -> int:
    """Upsert all wiki articles from SQLite into Supabase. Returns count."""
    rows = _sqlite_rows("SELECT * FROM wiki_articles ORDER BY updated_at ASC")
    if not rows:
        if verbose:
            print("  No wiki articles found in SQLite.")
        return 0

    conn = _get_pg_conn()
    count = 0
    try:
        with conn.cursor() as cur:
            for r in rows:
                source_paths = r.get("source_paths", "[]")
                if isinstance(source_paths, str):
                    source_paths = json.loads(source_paths)

                cur.execute("""
                    INSERT INTO wiki_articles (slug, title, content, source_paths, updated_at)
                    VALUES (%s, %s, %s, %s::jsonb, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        title        = EXCLUDED.title,
                        content      = EXCLUDED.content,
                        source_paths = EXCLUDED.source_paths,
                        updated_at   = NOW()
                """, (
                    r["slug"],
                    r.get("title", ""),
                    r.get("content", ""),
                    json.dumps(source_paths),
                ))
                count += 1

        conn.commit()
        if verbose:
            print(f"  Synced {count} wiki articles → Supabase")
    finally:
        conn.close()
    return count


def sync_embeddings(verbose: bool = True) -> int:
    """Sync note embeddings from SQLite (sqlite-vec) to Supabase pgvector."""
    try:
        import sqlite3
        import sqlite_vec  # type: ignore

        if not SQLITE_DB.exists():
            return 0

        conn_sqlite = sqlite3.connect(str(SQLITE_DB))
        conn_sqlite.enable_load_extension(True)
        sqlite_vec.load(conn_sqlite)
        conn_sqlite.enable_load_extension(False)

        rows = conn_sqlite.execute(
            "SELECT note_id, embedding FROM note_embeddings"
        ).fetchall()
        conn_sqlite.close()

    except Exception as exc:
        if verbose:
            print(f"  Skipping embedding sync (sqlite-vec unavailable): {exc}")
        return 0

    if not rows:
        return 0

    conn_pg = _get_pg_conn()
    count = 0
    try:
        # Build note_id → supabase_id mapping
        with conn_pg.cursor() as cur:
            # We need the Supabase IDs for the notes we just synced
            # Use a temporary mapping via path
            sqlite_conn2 = __import__("sqlite3").connect(str(SQLITE_DB))
            sqlite_conn2.row_factory = __import__("sqlite3").Row

            for sqlite_note_id, emb_blob in rows:
                note_row = sqlite_conn2.execute(
                    "SELECT path FROM notes WHERE id=?", (sqlite_note_id,)
                ).fetchone()
                if not note_row:
                    continue

                pg_row = cur.execute(
                    "SELECT id FROM notes WHERE path=%s", (note_row["path"],)
                ).fetchone()
                if not pg_row:
                    continue

                pg_note_id = pg_row[0]
                vector = _deserialize_vector(emb_blob)

                cur.execute("""
                    INSERT INTO note_embeddings (note_id, embedding)
                    VALUES (%s, %s)
                    ON CONFLICT (note_id) DO UPDATE SET embedding = EXCLUDED.embedding
                """, (pg_note_id, vector))
                count += 1

            sqlite_conn2.close()

        conn_pg.commit()
        if verbose:
            print(f"  Synced {count} embeddings → pgvector")
    finally:
        conn_pg.close()
    return count


def sync_all(verbose: bool = True) -> dict:
    """Full sync: notes + wiki + embeddings."""
    print("🔄 Syncing LLM-Brains → self-hosted Supabase...")
    notes = sync_notes(verbose=verbose)
    wiki = sync_wiki_articles(verbose=verbose)
    emb = sync_embeddings(verbose=verbose)
    result = {"notes": notes, "wiki_articles": wiki, "embeddings": emb}
    print(f"✅ Sync complete: {result}")
    return result


# ---------------------------------------------------------------------------
# pgvector hybrid search (alternative to SQLite search)
# ---------------------------------------------------------------------------

def pgvector_search(query: str, top_k: int = 10,
                     embedding_backend: Optional[str] = None) -> list[dict]:
    """
    Hybrid search directly on Supabase Postgres:
    - Full-text search via tsvector
    - Vector similarity via pgvector HNSW index
    - RRF fusion of both result sets
    """
    try:
        from src.embeddings import embed_texts
        query_embedding = embed_texts([query], backend=embedding_backend)[0]
    except Exception:
        query_embedding = None

    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            # FTS results
            cur.execute("""
                SELECT id, title, content, path, route,
                       ts_rank(to_tsvector('english', title || ' ' || content),
                               plainto_tsquery('english', %s)) AS fts_score
                FROM notes
                WHERE to_tsvector('english', title || ' ' || content)
                      @@ plainto_tsquery('english', %s)
                ORDER BY fts_score DESC
                LIMIT %s
            """, (query, query, top_k * 3))
            fts_rows = cur.fetchall()
            fts_ids = [r[0] for r in fts_rows]
            fts_data = {r[0]: {"id": r[0], "title": r[1], "content": r[2],
                                "path": r[3], "route": r[4]} for r in fts_rows}

            # Vector results
            vec_ids: list[int] = []
            if query_embedding:
                vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
                cur.execute("""
                    SELECT n.id, n.title, n.content, n.path, n.route,
                           1 - (e.embedding <=> %s::vector) AS vec_score
                    FROM note_embeddings e
                    JOIN notes n ON e.note_id = n.id
                    ORDER BY e.embedding <=> %s::vector
                    LIMIT %s
                """, (vec_str, vec_str, top_k * 3))
                vec_rows = cur.fetchall()
                vec_ids = [r[0] for r in vec_rows]
                for r in vec_rows:
                    if r[0] not in fts_data:
                        fts_data[r[0]] = {"id": r[0], "title": r[1], "content": r[2],
                                           "path": r[3], "route": r[4]}

            # RRF fusion
            k = 60
            scores: dict[int, float] = {}
            for rank, nid in enumerate(fts_ids, 1):
                scores[nid] = scores.get(nid, 0.0) + 1.0 / (k + rank)
            for rank, nid in enumerate(vec_ids, 1):
                scores[nid] = scores.get(nid, 0.0) + 1.0 / (k + rank)

            merged = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)[:top_k]
            return [
                {**fts_data[nid], "score": round(scores[nid], 6)}
                for nid in merged if nid in fts_data
            ]

    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LLM-Brains Supabase sync tool")
    parser.add_argument("--migrate", action="store_true", help="Apply schema to Supabase")
    parser.add_argument("--sync", action="store_true", help="Sync all data SQLite → Supabase")
    parser.add_argument("--search", type=str, help="Search via pgvector")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--verbose", "-v", action="store_true", default=True)
    args = parser.parse_args()

    if args.migrate:
        migrate(verbose=args.verbose)

    elif args.sync:
        sync_all(verbose=args.verbose)

    elif args.search:
        results = pgvector_search(args.search, top_k=args.top_k)
        for i, r in enumerate(results, 1):
            print(f"{i}. [{r.get('route','?')}] {r['title']} (score: {r['score']:.4f})")
            print(f"   {r['content'][:160].replace(chr(10),' ')}...")
            print()

    else:
        parser.print_help()
