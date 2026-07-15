"""
app/chunker.py — Sentence/paragraph-boundary text chunker.

Strategy:
  1. Split text into paragraphs on blank lines first.
  2. Within a paragraph, split on sentence boundaries (". ", "! ", "? ").
  3. Accumulate sentences until the chunk would exceed MAX_TOKENS,
     then emit the chunk.
  4. Overlap: carry the last OVERLAP_TOKENS worth of text into the next chunk
     so that retrieval doesn't miss context split across a boundary.

No heavy NLP libraries — just string operations + tiktoken for token counting.
"""

from __future__ import annotations

import re
from typing import Generator

import tiktoken

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
MAX_TOKENS = 500
OVERLAP_TOKENS = 50

_enc = tiktoken.get_encoding("cl100k_base")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _token_len(text: str) -> int:
    return len(_enc.encode(text))


def _split_sentences(paragraph: str) -> list[str]:
    """
    Naive sentence splitter: split on ". " / "! " / "? " then strip.
    Each returned sentence includes its terminating punctuation.
    """
    parts = re.split(r"(?<=[.!?])\s+", paragraph.strip())
    return [p for p in parts if p]


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def chunk_text(text: str) -> Generator[str, None, None]:
    """
    Yield chunks of text, each ≤ MAX_TOKENS tokens, with OVERLAP_TOKENS
    of overlap between consecutive chunks.
    """
    # Split on one or more blank lines to get paragraphs.
    paragraphs = re.split(r"\n{2,}", text.strip())

    sentences: list[str] = []
    for para in paragraphs:
        sentences.extend(_split_sentences(para))

    current_chunk: list[str] = []
    current_tokens = 0
    overlap_buffer: list[str] = []

    def flush_chunk() -> str:
        return " ".join(current_chunk).strip()

    for sentence in sentences:
        sent_tokens = _token_len(sentence)

        # If a single sentence is already over the limit, emit it as its own chunk.
        if sent_tokens >= MAX_TOKENS:
            if current_chunk:
                yield flush_chunk()
            yield sentence
            # Use the tail of this oversized sentence as the overlap seed
            current_chunk = [sentence]
            current_tokens = sent_tokens
            continue

        if current_tokens + sent_tokens > MAX_TOKENS:
            # Emit current chunk
            yield flush_chunk()

            # Build overlap: walk back from the end of current_chunk until we
            # have ~OVERLAP_TOKENS of context to seed the next chunk.
            overlap_buffer = []
            overlap_tok = 0
            for s in reversed(current_chunk):
                t = _token_len(s)
                if overlap_tok + t > OVERLAP_TOKENS:
                    break
                overlap_buffer.insert(0, s)
                overlap_tok += t

            # Start new chunk from overlap
            current_chunk = overlap_buffer[:]
            current_tokens = overlap_tok

        current_chunk.append(sentence)
        current_tokens += sent_tokens

    if current_chunk:
        yield flush_chunk()
