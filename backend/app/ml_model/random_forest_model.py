"""
Random Forest Model — personalized recommendations using user rating behavior.
Requires ≥5 rated movies to train.
"""

import logging
import pickle
from pathlib import Path
from typing import List, Dict, Tuple, Optional

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent
RF_MODEL_PATH = MODEL_DIR / "random_forest.pkl"

FEATURE_NAMES = [
    "genre_match_score",
    "director_match",
    "cast_overlap",
    "avg_rating_for_genre",
    "movie_popularity",
    "vote_average",
]


def _jaccard(set_a, set_b) -> float:
    if not set_a or not set_b:
        return 0.0
    a, b = set(set_a), set(set_b)
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union > 0 else 0.0


def build_features(
    movie: Dict,
    user_fav_genres: List[str],
    user_fav_actors: List[str],
    user_fav_directors: List[str],
    user_genre_avg_ratings: Dict[str, float],
) -> List[float]:
    """Build feature vector for a single user-movie pair."""
    movie_genres = movie.get("genres") or []
    movie_cast = movie.get("cast_names") or []
    movie_director = movie.get("director") or ""

    # 1. Genre match (Jaccard similarity)
    genre_match = _jaccard(
        [g.lower() for g in user_fav_genres],
        [g.lower() for g in movie_genres],
    )

    # 2. Director match (binary)
    director_match = 1.0 if movie_director and movie_director.lower() in [
        d.lower() for d in user_fav_directors
    ] else 0.0

    # 3. Cast overlap (count)
    user_actors_lower = {a.lower() for a in user_fav_actors}
    cast_overlap = sum(1 for c in movie_cast if c.lower() in user_actors_lower)

    # 4. Average rating for this movie's genre
    genre_ratings = []
    for g in movie_genres:
        if g.lower() in user_genre_avg_ratings:
            genre_ratings.append(user_genre_avg_ratings[g.lower()])
    avg_rating_for_genre = np.mean(genre_ratings) if genre_ratings else 3.0

    # 5. Movie popularity (log-normalized)
    popularity = movie.get("popularity", 0) or 0
    movie_popularity = np.log1p(popularity)

    # 6. Vote average
    vote_avg = movie.get("vote_average", 0) or 0

    return [genre_match, director_match, cast_overlap, avg_rating_for_genre, movie_popularity, vote_avg]


def train_model(
    training_data: List[Tuple[Dict, float]],
    user_fav_genres: List[str],
    user_fav_actors: List[str],
    user_fav_directors: List[str],
    user_genre_avg_ratings: Dict[str, float],
) -> Optional[Dict]:
    """
    Train a Random Forest model on user's rating data.

    training_data: list of (movie_dict, rating) tuples
    Returns dict with model, feature_importances, accuracy
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import cross_val_score

    if len(training_data) < 5:
        logger.info("Not enough ratings (%d) for Random Forest", len(training_data))
        return None

    X = []
    y = []

    for movie, rating in training_data:
        features = build_features(movie, user_fav_genres, user_fav_actors,
                                   user_fav_directors, user_genre_avg_ratings)
        X.append(features)
        # Binary classification: liked (≥3.5) vs not liked
        y.append(1 if rating >= 3.5 else 0)

    X = np.array(X)
    y = np.array(y)

    # Handle edge case: all same class
    if len(set(y)) < 2:
        logger.warning("All ratings are the same class — can't train RF meaningfully")
        return None

    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )

    # Cross-validation score (if enough data)
    accuracy = 0.0
    if len(X) >= 10:
        scores = cross_val_score(rf, X, y, cv=min(5, len(X)), scoring="accuracy")
        accuracy = float(np.mean(scores))
        logger.info("RF cross-val accuracy: %.2f", accuracy)

    rf.fit(X, y)

    importances = {
        name: round(float(imp), 4)
        for name, imp in zip(FEATURE_NAMES, rf.feature_importances_)
    }

    logger.info("RF trained on %d samples | Feature importances: %s", len(X), importances)

    return {
        "model": rf,
        "feature_importances": importances,
        "accuracy": accuracy,
    }


def predict_ratings(
    rf_model,
    candidate_movies: List[Dict],
    user_fav_genres: List[str],
    user_fav_actors: List[str],
    user_fav_directors: List[str],
    user_genre_avg_ratings: Dict[str, float],
    top_n: int = 10,
) -> List[Tuple[int, float]]:
    """
    Predict "like" probability for candidate movies.
    Returns list of (tmdb_id, probability) sorted by probability desc.
    """
    if rf_model is None:
        return []

    predictions = []

    for movie in candidate_movies:
        features = build_features(movie, user_fav_genres, user_fav_actors,
                                   user_fav_directors, user_genre_avg_ratings)
        # Get probability of "like" class
        proba = rf_model.predict_proba([features])[0]
        like_prob = float(proba[1]) if len(proba) > 1 else float(proba[0])

        tmdb_id = movie.get("tmdb_id") or movie.get("id")
        if tmdb_id:
            predictions.append((tmdb_id, like_prob))

    predictions.sort(key=lambda x: x[1], reverse=True)
    return predictions[:top_n]
