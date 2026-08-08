-- LLM-Brains schema for self-hosted Supabase
-- This runs automatically on first `docker compose up`
-- Mirrors the SQLite schema into Postgres + pgvector

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id          BIGSERIAL PRIMARY KEY,
    path        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    route       TEXT NOT NULL DEFAULT 'knowledge',
    tags        JSONB NOT NULL DEFAULT '[]',
    backlinks   JSONB NOT NULL DEFAULT '[]',
    source_url  TEXT,
    source_type TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vector embeddings (pgvector)
CREATE TABLE IF NOT EXISTS note_embeddings (
    note_id     BIGINT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    model       TEXT NOT NULL DEFAULT 'nomic-embed-text',
    embedding   vector(768),
    dim         INTEGER NOT NULL DEFAULT 768,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wiki articles
CREATE TABLE IF NOT EXISTS wiki_articles (
    id           BIGSERIAL PRIMARY KEY,
    slug         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL DEFAULT '',
    source_paths JSONB NOT NULL DEFAULT '[]',
    tags         JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wiki embeddings
CREATE TABLE IF NOT EXISTS wiki_embeddings (
    article_id  BIGINT PRIMARY KEY REFERENCES wiki_articles(id) ON DELETE CASCADE,
    model       TEXT NOT NULL DEFAULT 'nomic-embed-text',
    embedding   vector(768),
    dim         INTEGER NOT NULL DEFAULT 768,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dream cycle log
CREATE TABLE IF NOT EXISTS dream_cycles (
    id           BIGSERIAL PRIMARY KEY,
    run_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    files_scanned INTEGER NOT NULL DEFAULT 0,
    promoted     INTEGER NOT NULL DEFAULT 0,
    synthesis    TEXT,
    tags         JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index (Postgres built-in)
CREATE INDEX IF NOT EXISTS notes_fts_idx ON notes
    USING GIN (to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'')));

CREATE INDEX IF NOT EXISTS wiki_fts_idx ON wiki_articles
    USING GIN (to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(content,'')));

-- Vector similarity search index (HNSW — fast ANN)
CREATE INDEX IF NOT EXISTS note_embeddings_vector_idx ON note_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS wiki_embeddings_vector_idx ON wiki_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER wiki_updated_at BEFORE UPDATE ON wiki_articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
