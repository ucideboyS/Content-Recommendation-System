"""
Content-Based Filtering — TF-IDF + Cosine Similarity.
Used for cold-start users (no rating history).
"""

import logging
import pickle
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent
CB_MODEL_PATH = MODEL_DIR / "content_based.pkl"

# Lazy-loaded model
_vectorizer = None
_tfidf_matrix = None
_movie_ids = None  # tmdb_ids in the same order as the matrix rows


def _load_model() -> bool:
    global _vectorizer, _tfidf_matrix, _movie_ids
    if _tfidf_matrix is not None:
        return True

    if not CB_MODEL_PATH.exists():
        logger.warning("Content-based model not found at %s", CB_MODEL_PATH)
        return False

    try:
        with open(CB_MODEL_PATH, "rb") as f:
            data = pickle.load(f)
        _vectorizer = data["vectorizer"]
        _tfidf_matrix = data["tfidf_matrix"]
        _movie_ids = data["movie_ids"]
        logger.info("Content-based model loaded (%d movies)", len(_movie_ids))
        return True
    except Exception as e:
        logger.error("Failed to load content-based model: %s", e)
        return False


def get_similar_movies(tmdb_id: int, top_n: int = 10) -> List[Tuple[int, float]]:
    """
    Find movies most similar to the given movie by content.
    Returns list of (tmdb_id, similarity_score) tuples.
    """
    if not _load_model():
        return []

    if tmdb_id not in _movie_ids:
        logger.warning("Movie %d not in content-based index", tmdb_id)
        return []

    idx = _movie_ids.index(tmdb_id)

    # Compute cosine similarity for this movie against all others
    from sklearn.metrics.pairwise import cosine_similarity
    sim_scores = cosine_similarity(_tfidf_matrix[idx:idx+1], _tfidf_matrix).flatten()

    # Get top N (excluding self)
    top_indices = np.argsort(sim_scores)[::-1][1:top_n+1]

    results = []
    for i in top_indices:
        results.append((_movie_ids[i], float(sim_scores[i])))

    return results


def get_recs_from_preferences(
    favorite_genres: List[str] = None,
    favorite_actors: List[str] = None,
    favorite_directors: List[str] = None,
    media_type: str = "all",
    top_n: int = 10,
) -> List[Tuple[int, float]]:
    """
    Cold-start: build a pseudo-document from user preferences and find
    similar movies via TF-IDF cosine similarity.
    """
    if not _load_model():
        return []

    # Build a fake "document" from preferences
    parts = []
    if favorite_genres:
        parts.extend(favorite_genres)
    if favorite_actors:
        parts.extend(favorite_actors)
    if favorite_directors:
        parts.extend(favorite_directors)

    if not parts:
        return []

    pseudo_doc = " ".join(parts).lower()

    # Transform using the fitted vectorizer
    query_vec = _vectorizer.transform([pseudo_doc])

    from sklearn.metrics.pairwise import cosine_similarity
    sim_scores = cosine_similarity(query_vec, _tfidf_matrix).flatten()

    top_indices = np.argsort(sim_scores)[::-1][:top_n]

    results = []
    for i in top_indices:
        if sim_scores[i] > 0.01:  # Minimum threshold
            results.append((_movie_ids[i], float(sim_scores[i])))

    return results


def build_and_save_model(movies_data: List[Dict]):
    """
    Build TF-IDF model from movie data and save to disk.
    movies_data: list of dicts with keys: tmdb_id, overview, genres, cast_names, director, keywords
    """
    from sklearn.feature_extraction.text import TfidfVectorizer

    if not movies_data:
        logger.error("No movie data to build content-based model")
        return

    # Build combined text features for each movie
    documents = []
    movie_ids = []

    for m in movies_data:
        parts = []

        # Overview (most important)
        overview = m.get("overview", "") or ""
        parts.append(overview)

        # Genres (repeated for weight)
        genres = m.get("genres") or []
        parts.extend(genres * 2)

        # Cast
        cast = m.get("cast_names") or []
        parts.extend(cast)

        # Director (repeated for weight)
        director = m.get("director") or ""
        if director:
            parts.extend([director] * 2)

        # Keywords
        keywords = m.get("keywords") or []
        parts.extend(keywords)

        combined = " ".join(str(p) for p in parts).lower().strip()
        if combined:
            documents.append(combined)
            movie_ids.append(m["tmdb_id"])

    if not documents:
        logger.error("No valid documents to build TF-IDF model")
        return

    # Build TF-IDF matrix
    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words="english",
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.95,
    )
    tfidf_matrix = vectorizer.fit_transform(documents)

    # Save
    model_data = {
        "vectorizer": vectorizer,
        "tfidf_matrix": tfidf_matrix,
        "movie_ids": movie_ids,
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(CB_MODEL_PATH, "wb") as f:
        pickle.dump(model_data, f)

    logger.info("✅ Content-based model saved: %d movies, %d features",
                len(movie_ids), tfidf_matrix.shape[1])
