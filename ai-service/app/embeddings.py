"""
app/embeddings.py — Mistral embedding calls.

Model: mistral-embed  (output dimension: 1024)
Batches up to 32 texts per API call to stay within rate limits.
"""

from __future__ import annotations

import os
from typing import Sequence

from mistralai import Mistral

EMBED_MODEL = "mistral-embed"
BATCH_SIZE = 32

_client: Mistral | None = None


def get_client() -> Mistral:
    global _client
    if _client is None:
        api_key = os.environ.get("MISTRAL_API_KEY")
        if not api_key:
            raise RuntimeError("MISTRAL_API_KEY environment variable is not set.")
        _client = Mistral(api_key=api_key)
    return _client


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """
    Embed a list of texts using Mistral's mistral-embed model.
    Returns a list of 1024-dimensional float vectors, one per input text.
    Automatically batches requests if len(texts) > BATCH_SIZE.
    """
    client = get_client()
    all_vectors: list[list[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = list(texts[i : i + BATCH_SIZE])
        response = client.embeddings.create(
            model=EMBED_MODEL,
            inputs=batch,
        )
        # response.data is a list of EmbeddingObject, sorted by index
        for obj in sorted(response.data, key=lambda x: x.index):
            all_vectors.append(obj.embedding)

    return all_vectors


def embed_single(text: str) -> list[float]:
    """Convenience wrapper for a single query string."""
    return embed_texts([text])[0]
