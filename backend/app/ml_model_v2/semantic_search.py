import os
import json
import logging
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
import concurrent.futures
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Constants
MODEL_NAME = 'all-MiniLM-L6-v2'
EMBEDDING_DIM = 384
INDEX_PATH = os.path.join(os.path.dirname(__file__), 'faiss_index.bin')
METADATA_PATH = os.path.join(os.path.dirname(__file__), 'faiss_metadata.json')

# Global state
_model = None
_index = None
_indexed_ids = set()

def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"Loading SentenceTransformer model {MODEL_NAME}...")
        _model = SentenceTransformer(MODEL_NAME)
    return _model

def get_index() -> faiss.IndexIDMap:
    global _index, _indexed_ids
    if _index is None:
        if os.path.exists(INDEX_PATH) and os.path.exists(METADATA_PATH):
            try:
                logger.info(f"Loading FAISS index from {INDEX_PATH}...")
                _index = faiss.read_index(INDEX_PATH)
                with open(METADATA_PATH, 'r') as f:
                    _indexed_ids = set(json.load(f))
                logger.info(f"Loaded FAISS index with {len(_indexed_ids)} movies.")
            except Exception as e:
                logger.error(f"Failed to load FAISS index: {e}")
                _initialize_empty_index()
        else:
            _initialize_empty_index()
    return _index

def _initialize_empty_index():
    global _index, _indexed_ids
    logger.info("Initializing empty FAISS index...")
    quantizer = faiss.IndexFlatIP(EMBEDDING_DIM)
    _index = faiss.IndexIDMap(quantizer)
    _indexed_ids = set()

def save_index_safe():
    global _index, _indexed_ids
    if _index is not None:
        faiss.write_index(_index, INDEX_PATH)
        with open(METADATA_PATH, 'w') as f:
            json.dump(list(_indexed_ids), f)

def generate_embedding(text: str) -> np.ndarray:
    model = get_model()
    # Normalize embeddings so Inner Product = Cosine Similarity
    embedding = model.encode([text], convert_to_numpy=True, normalize_embeddings=True)
    return embedding[0]

def add_movie_to_index(tmdb_id: int, movie_details: dict = None) -> bool:
    """Adds a single movie to the FAISS index if not already present."""
    global _indexed_ids
    index = get_index()
    
    if tmdb_id in _indexed_ids:
        return False
        
    from app.ml_model_v2.hybrid_recommender import _fetch_movie_details, _movie_to_semantic_text
    
    if movie_details is None:
        movie_details = _fetch_movie_details(tmdb_id)
        
    if not movie_details:
        return False
        
    text = _movie_to_semantic_text(movie_details)
    
    if not text.strip():
        return False
        
    vec = generate_embedding(text)
    # FAISS expects 2D array for vectors and 1D for IDs (must be int64)
    vecs = np.array([vec], dtype=np.float32)
    ids = np.array([tmdb_id], dtype=np.int64)
    
    index.add_with_ids(vecs, ids)
    _indexed_ids.add(tmdb_id)
    save_index_safe()
    return True

def query_similar_movies(seed_embedding: np.ndarray, top_k: int = 200) -> List[Tuple[int, float]]:
    """Returns list of tuples: (tmdb_id, cosine_similarity)"""
    index = get_index()
    if index.ntotal == 0:
        return []
        
    query_vec = np.array([seed_embedding], dtype=np.float32)
    k = min(top_k, index.ntotal)
    similarities, ids = index.search(query_vec, k)
    
    results = []
    for i in range(k):
        tmdb_id = int(ids[0][i])
        if tmdb_id != -1:
            results.append((tmdb_id, float(similarities[0][i])))
            
    return results

def build_initial_index(max_pages=50):
    """
    Bootstrap the index with popular Hindi movies.
    Do NOT inject specific movies to fake the diagnostic.
    """
    from app.ml_model_v2.hybrid_recommender import _tmdb_get, _fetch_movie_details, _movie_to_semantic_text
    import time
    
    logger.info("Starting initial FAISS bulk build...")
    index = get_index()
    
    movies_to_process = {}
    
    for page in range(1, max_pages + 1):
        data = _tmdb_get("/discover/movie", {
            "language": "en-US",
            "with_original_language": "hi",
            "sort_by": "popularity.desc",
            "page": page
        })
        if not data or not data.get("results"):
            break
            
        for m in data["results"]:
            movies_to_process[m["id"]] = m
            
    tmdb_ids = list(movies_to_process.keys())
    tmdb_ids = [tid for tid in tmdb_ids if tid not in _indexed_ids]
    
    if not tmdb_ids:
        logger.info("No new movies to index.")
        return
        
    logger.info(f"Fetching full details for {len(tmdb_ids)} movies...")
    
    def fetch_full(tid):
        return tid, _fetch_movie_details(tid)
        
    full_details = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        for tid, details in executor.map(fetch_full, tmdb_ids):
            if details:
                full_details[tid] = details
                
    logger.info("Generating embeddings...")
    texts = []
    valid_ids = []
    
    for tid, details in full_details.items():
        text = _movie_to_semantic_text(details)
        if text.strip():
            texts.append(text)
            valid_ids.append(tid)
            
    if not texts:
        return
        
    model = get_model()
    t0 = time.time()
    embeddings = model.encode(texts, batch_size=32, convert_to_numpy=True, normalize_embeddings=True)
    t1 = time.time()
    logger.info(f"Generated {len(texts)} embeddings in {t1 - t0:.2f} seconds.")
    
    vecs = np.array(embeddings, dtype=np.float32)
    ids_arr = np.array(valid_ids, dtype=np.int64)
    
    index.add_with_ids(vecs, ids_arr)
    _indexed_ids.update(valid_ids)
    save_index_safe()
    
    logger.info(f"Added {len(valid_ids)} movies to FAISS. Total in index: {index.ntotal}")

# Expose normalize function for dynamic scoring during recommend_by_id
def calculate_semantic_similarity(seed_embedding: np.ndarray, candidate_texts: List[str]) -> List[float]:
    if not candidate_texts:
        return []
    model = get_model()
    candidate_embeddings = model.encode(candidate_texts, convert_to_numpy=True, normalize_embeddings=True)
    similarities = np.dot(candidate_embeddings, seed_embedding)
    return similarities.tolist()
