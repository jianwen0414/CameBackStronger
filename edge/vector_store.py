"""
edge/vector_store.py
Supabase pgvector backend for weapon-holder person embeddings.

Provides:
  - find_similar   : cosine similarity ANN search (blocking)
  - store_embedding: fire-and-forget async insert
  - next_person_id : globally unique ID via a Postgres sequence RPC

Embeddings are reduced from 2048-dim (ResNet50) → 2000-dim via a fixed-seed
random projection before any Supabase call.  2000 is the maximum dimension
supported by pgvector's ivfflat index.  The matrix is seeded with 42 so every
edge node produces identical projected vectors — cross-node similarity is
preserved by the Johnson-Lindenstrauss lemma.

Graceful degradation: if SUPABASE_URL / SUPABASE_SERVICE_KEY are absent or
the service is unreachable, all methods become no-ops and the system falls
back to in-memory-only re-identification.

SQL setup (run once in Supabase SQL editor):

    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE SEQUENCE IF NOT EXISTS weapon_person_id_seq START 1;

    CREATE TABLE IF NOT EXISTS weapon_holder_embeddings (
        id          BIGSERIAL PRIMARY KEY,
        person_id   INTEGER      NOT NULL,
        camera_id   INTEGER      NOT NULL,
        embedding   vector(2000) NOT NULL,
        weapon_type TEXT,
        confidence  FLOAT,
        created_at  TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS weapon_holder_embeddings_embedding_idx
        ON weapon_holder_embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);

    CREATE OR REPLACE FUNCTION match_weapon_holder(
        query_embedding vector(2000),
        match_threshold float,
        match_count     int
    )
    RETURNS TABLE (person_id integer, similarity float)
    LANGUAGE sql AS $$
        SELECT person_id,
               1 - (embedding <=> query_embedding) AS similarity
        FROM   weapon_holder_embeddings
        WHERE  1 - (embedding <=> query_embedding) > match_threshold
        ORDER  BY embedding <=> query_embedding
        LIMIT  match_count;
    $$;

    CREATE OR REPLACE FUNCTION next_weapon_person_id()
    RETURNS integer LANGUAGE sql AS $$
        SELECT nextval('weapon_person_id_seq')::integer;
    $$;
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# Random projection: 2048-dim (ResNet50) → 2000-dim (pgvector ivfflat limit)
#
# The matrix is generated once at import time with a fixed seed so that every
# edge node and every process restart uses the *exact same* projection.
# Cosine similarity is preserved in expectation by the Johnson-Lindenstrauss
# lemma; the projected vectors are re-normalised so cosine queries remain
# numerically correct.
# ---------------------------------------------------------------------------
_PROJ_IN  = 2048
_PROJ_OUT = 2000
_PROJ_MATRIX: np.ndarray = (
    np.random.default_rng(seed=42)
    .standard_normal((_PROJ_OUT, _PROJ_IN))
    .astype(np.float32)
)


def _project(embedding: np.ndarray) -> np.ndarray:
    """
    Project a 2048-dim L2-normalised embedding → 2000-dim, then re-normalise.

    The re-normalisation step ensures that cosine distance (<=> operator in
    pgvector) gives the same ranking as it would in the original space.
    """
    projected: np.ndarray = _PROJ_MATRIX @ embedding.astype(np.float32)  # (2000,)
    norm = np.linalg.norm(projected)
    return projected / norm if norm > 0 else projected


class SupabaseVectorStore:
    """
    Thin wrapper around the Supabase Python client for pgvector operations.

    The class is designed to be instantiated once per Detector and shared
    across background threads (all Supabase client calls are thread-safe).
    """

    def __init__(self, url: str, key: str) -> None:
        from supabase import create_client  # lazy import — only when available

        self._client = create_client(url, key)

        # Quick connectivity probe — raises if unreachable
        self._client.rpc("next_weapon_person_id", {}).execute()
        print("[VectorStore] Supabase connection verified.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def find_similar(
        self, embedding: np.ndarray, threshold: float = 0.70
    ) -> int | None:
        """
        Project `embedding` to 2000-dim, then run a cosine similarity search
        via the match_weapon_holder RPC.

        Returns the person_id with the highest similarity above `threshold`,
        or None if no match is found.  Blocking — call from a background thread
        if latency is a concern.
        """
        try:
            projected = _project(embedding)
            response = self._client.rpc(
                "match_weapon_holder",
                {
                    "query_embedding": projected.tolist(),
                    "match_threshold": float(threshold),
                    "match_count": 1,
                },
            ).execute()
            rows = response.data
            if rows:
                return int(rows[0]["person_id"])
            return None
        except Exception as e:
            print(f"[VectorStore] find_similar error: {e}")
            return None

    def store_embedding(
        self,
        person_id: int,
        camera_id: int,
        embedding: np.ndarray,
        weapon_type: str,
        confidence: float,
    ) -> None:
        """
        Project `embedding` to 2000-dim and insert a weapon-holder row.
        Intended to be called from a daemon thread (fire-and-forget);
        exceptions are logged and swallowed.
        """
        try:
            projected = _project(embedding)
            self._client.table("weapon_holder_embeddings").insert(
                {
                    "person_id":   person_id,
                    "camera_id":   camera_id,
                    "embedding":   projected.tolist(),
                    "weapon_type": weapon_type,
                    "confidence":  float(confidence),
                }
            ).execute()
        except Exception as e:
            print(f"[VectorStore] store_embedding error: {e}")

    def next_person_id(self) -> int:
        """
        Atomically fetch the next value from the weapon_person_id_seq Postgres
        sequence via the next_weapon_person_id() RPC.

        Returns a globally unique integer guaranteed to be unique across all
        edge nodes pointing at the same Supabase project.  Raises on failure
        so the caller can fall back to a local counter.
        """
        try:
            response = self._client.rpc("next_weapon_person_id", {}).execute()
            return int(response.data)
        except Exception as e:
            print(f"[VectorStore] next_person_id error: {e}")
            raise
