import logging
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List

logger = logging.getLogger(__name__)

# Constants
MODEL_NAME = 'all-MiniLM-L6-v2'
EMBEDDING_DIM = 384

# Global state
_model = None

def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"Loading SentenceTransformer model {MODEL_NAME}...")
        _model = SentenceTransformer(MODEL_NAME)
    return _model

def generate_embedding(text: str) -> np.ndarray:
    model = get_model()
    # Normalize embeddings so Inner Product = Cosine Similarity
    embedding = model.encode([text], convert_to_numpy=True, normalize_embeddings=True)
    return embedding[0]

def calculate_semantic_similarity(seed_embedding: np.ndarray, candidate_texts: List[str]) -> List[float]:
    if not candidate_texts:
        return []
    model = get_model()
    candidate_embeddings = model.encode(candidate_texts, convert_to_numpy=True, normalize_embeddings=True)
    similarities = np.dot(candidate_embeddings, seed_embedding)
    return similarities.tolist()
