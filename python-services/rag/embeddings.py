"""
Embedding backends.

EMBEDDING_MODE=sentence-transformers (default)  -> real Sentence Transformers model (all-MiniLM-L6-v2, 384 dims).
EMBEDDING_MODE=hashing                           -> TEST-ONLY deterministic hashed bag-of-tokens (384 dims), for
                                                   offline environments where the model cannot be downloaded.
                                                   It is never selected automatically; every response reports
                                                   which mode produced the embeddings.
"""
import hashlib
import logging
import os
import re
from typing import List

import numpy as np

log = logging.getLogger("rag.embeddings")
DIM = 384


class Embedder:
    def __init__(self):
        self.mode = os.getenv("EMBEDDING_MODE", "sentence-transformers").strip().lower()
        self.model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        self._model = None
        if self.mode == "sentence-transformers":
            from sentence_transformers import SentenceTransformer  # imported lazily so hashing mode needs no torch

            self._model = SentenceTransformer(self.model_name)
            dim = self._model.get_sentence_embedding_dimension()
            if dim != DIM:
                raise RuntimeError(f"Model {self.model_name} has {dim} dims; schema expects {DIM}.")
        elif self.mode == "hashing":
            self.model_name = "hashing-test-only"
            log.warning("EMBEDDING_MODE=hashing: using TEST-ONLY hashed embeddings, not Sentence Transformers.")
        else:
            raise RuntimeError(f"Unknown EMBEDDING_MODE '{self.mode}'")

    def encode(self, texts: List[str]) -> np.ndarray:
        if self._model is not None:
            return np.asarray(self._model.encode(texts, normalize_embeddings=True), dtype=np.float32)
        return np.stack([self._hash_embed(t) for t in texts])

    @staticmethod
    def _hash_embed(text: str) -> np.ndarray:
        v = np.zeros(DIM, dtype=np.float32)
        tokens = re.findall(r"[a-z0-9.+#]+", text.lower())
        feats = tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
        for f in feats:
            h = int(hashlib.md5(f.encode()).hexdigest(), 16)
            v[h % DIM] += 1.0 if (h >> 9) & 1 else -1.0
        n = np.linalg.norm(v)
        return v / n if n else v
