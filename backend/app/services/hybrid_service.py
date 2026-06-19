"""
Hybrid Recommendation Service — combines Content-Based (TF-IDF) and
Random Forest for personalized recommendations.

Strategy:
  - Cold-start (< 5 ratings) → Content-Based from user preferences
  - Warm user (≥ 5 ratings) → 70% Random Forest + 30% Content-Based
  - Always falls back to TMDB API if local models fail
"""

import logging
from typing import List, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Movie, Rating, User
from app.http_client import safe_get
import os

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")


def _tmdb_get(path: str, params: dict = None) -> Optional[dict]:
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    try:
        resp = safe_get(f"https://api.themoviedb.org/3{path}", params=params)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.error("TMDB request failed: %s", e)
    return None


def get_user_rating_data(user: User, db: Session) -> Tuple[List[Tuple[Dict, float]], Dict[str, float]]:
    """
    Fetch user's rated movies with full metadata.
    Returns (list of (movie_dict, rating), genre_avg_ratings dict).
    """
    ratings = db.query(Rating).filter(Rating.user_id == user.id).all()

    rated_movies = []
    genre_ratings = {}  # genre -> [ratings]

    for r in ratings:
        movie = db.query(Movie).filter(Movie.tmdb_id == r.tmdb_id).first()
        if movie:
            movie_dict = {
                "tmdb_id": movie.tmdb_id,
                "title": movie.title,
                "overview": movie.overview or "",
                "genres": movie.genres or [],
                "cast_names": movie.cast_names or [],
                "director": movie.director or "",
                "keywords": movie.keywords or [],
                "popularity": movie.popularity or 0,
                "vote_average": movie.vote_average or 0,
                "poster_path": movie.poster_path,
                "media_type": movie.media_type or "movie",
            }
            rated_movies.append((movie_dict, r.rating))

            # Track per-genre ratings
            for g in (movie.genres or []):
                genre_ratings.setdefault(g.lower(), []).append(r.rating)

    # Compute average rating per genre
    genre_avg = {g: sum(rs) / len(rs) for g, rs in genre_ratings.items() if rs}

    return rated_movies, genre_avg


def get_candidate_movies(db: Session, exclude_tmdb_ids: set, media_type: str = "all", limit: int = 200) -> List[Dict]:
    """Get candidate movies from DB for scoring."""
    query = db.query(Movie).filter(Movie.overview != None, Movie.overview != "")  # noqa: E711

    if media_type != "all":
        query = query.filter(Movie.media_type == media_type)

    movies = query.limit(limit + len(exclude_tmdb_ids)).all()

    candidates = []
    for m in movies:
        if m.tmdb_id in exclude_tmdb_ids:
            continue
        candidates.append({
            "tmdb_id": m.tmdb_id,
            "title": m.title,
            "overview": m.overview or "",
            "genres": m.genres or [],
            "cast_names": m.cast_names or [],
            "director": m.director or "",
            "keywords": m.keywords or [],
            "popularity": m.popularity or 0,
            "vote_average": m.vote_average or 0,
            "poster_path": m.poster_path,
            "release_date": m.release_date or "",
            "media_type": m.media_type or "movie",
        })
        if len(candidates) >= limit:
            break

    return candidates


def get_hybrid_recommendations(
    user: User,
    db: Session,
    media_type: str = "all",
    top_n: int = 10,
) -> Dict:
    """
    Main hybrid recommendation function.
    Returns dict with: recommendations, strategy, feature_importances (if RF used).
    """
    rated_movies, genre_avg = get_user_rating_data(user, db)
    rated_ids = {m["tmdb_id"] for m, _ in rated_movies}

    user_fav_genres = user.favorite_genres or []
    user_fav_actors = user.favorite_actors or []
    user_fav_directors = user.favorite_directors or []

    # ---------------------------------------------------------------
    # Warm user (≥ 5 ratings) → RF + CB hybrid
    # ---------------------------------------------------------------
    if len(rated_movies) >= 5:
        logger.info("User %s has %d ratings — using hybrid RF+CB", user.id, len(rated_movies))

        candidates = get_candidate_movies(db, rated_ids, media_type)

        if not candidates:
            return _tmdb_fallback(user_fav_genres, media_type, top_n)

        # Train RF on user's data
        try:
            from app.ml_model.random_forest_model import train_model, predict_ratings

            rf_result = train_model(
                rated_movies, user_fav_genres, user_fav_actors,
                user_fav_directors, genre_avg
            )

            rf_scores = {}
            if rf_result and rf_result["model"]:
                rf_predictions = predict_ratings(
                    rf_result["model"], candidates,
                    user_fav_genres, user_fav_actors,
                    user_fav_directors, genre_avg, top_n=50
                )
                rf_scores = {tmdb_id: score for tmdb_id, score in rf_predictions}
        except Exception as e:
            logger.error("RF prediction failed: %s", e)
            rf_scores = {}
            rf_result = None

        # CB scores
        cb_scores = {}
        try:
            from app.ml_model.content_based import get_similar_movies
            for m, rating in rated_movies:
                if rating >= 3.5:
                    similar = get_similar_movies(m["tmdb_id"], top_n=20)
                    for tmdb_id, sim_score in similar:
                        if tmdb_id not in rated_ids:
                            cb_scores[tmdb_id] = max(cb_scores.get(tmdb_id, 0), sim_score)
        except Exception as e:
            logger.error("CB scoring failed: %s", e)

        # Merge: 70% RF + 30% CB
        all_ids = set(rf_scores.keys()) | set(cb_scores.keys())
        merged = []
        for tmdb_id in all_ids:
            rf_s = rf_scores.get(tmdb_id, 0.5)
            cb_s = cb_scores.get(tmdb_id, 0.0)
            combined = 0.7 * rf_s + 0.3 * cb_s
            merged.append((tmdb_id, combined))

        merged.sort(key=lambda x: x[1], reverse=True)

        # Build result
        candidate_map = {c["tmdb_id"]: c for c in candidates}
        recommendations = []
        for tmdb_id, score in merged[:top_n]:
            movie = candidate_map.get(tmdb_id)
            if movie:
                recommendations.append({
                    "id": movie["tmdb_id"],
                    "title": movie["title"],
                    "overview": movie.get("overview", ""),
                    "poster_path": movie.get("poster_path"),
                    "vote_average": movie.get("vote_average", 0),
                    "release_date": movie.get("release_date", ""),
                    "media_type": movie.get("media_type", "movie"),
                    "hybrid_score": round(score, 3),
                })

        if recommendations:
            return {
                "recommendations": recommendations,
                "strategy": "hybrid_rf_cb",
                "feature_importances": rf_result["feature_importances"] if rf_result else None,
            }

    # ---------------------------------------------------------------
    # Cold-start (< 5 ratings) → Content-Based from preferences
    # ---------------------------------------------------------------
    if user_fav_genres or user_fav_actors or user_fav_directors:
        logger.info("User %s cold-start — using content-based from preferences", user.id)

        try:
            from app.ml_model.content_based import get_recs_from_preferences

            pref_recs = get_recs_from_preferences(
                user_fav_genres, user_fav_actors, user_fav_directors,
                media_type=media_type, top_n=top_n
            )

            if pref_recs:
                candidates = get_candidate_movies(db, rated_ids, media_type, limit=500)
                candidate_map = {c["tmdb_id"]: c for c in candidates}

                recommendations = []
                for tmdb_id, score in pref_recs:
                    movie = candidate_map.get(tmdb_id)
                    if movie:
                        recommendations.append({
                            "id": movie["tmdb_id"],
                            "title": movie["title"],
                            "overview": movie.get("overview", ""),
                            "poster_path": movie.get("poster_path"),
                            "vote_average": movie.get("vote_average", 0),
                            "release_date": movie.get("release_date", ""),
                            "media_type": movie.get("media_type", "movie"),
                            "hybrid_score": round(score, 3),
                        })

                if recommendations:
                    return {
                        "recommendations": recommendations,
                        "strategy": "content_based_preferences",
                        "feature_importances": None,
                    }
        except Exception as e:
            logger.error("CB preference recs failed: %s", e)

    # ---------------------------------------------------------------
    # Fallback → TMDB popular/genre-based
    # ---------------------------------------------------------------
    return _tmdb_fallback(user_fav_genres, media_type, top_n)


def _tmdb_fallback(favorite_genres: List[str], media_type: str, top_n: int) -> Dict:
    """Last resort: use TMDB API directly."""
    logger.info("Falling back to TMDB API for recommendations")

    GENRE_MAP = {
        "action": 28, "adventure": 12, "animation": 16, "comedy": 35,
        "crime": 80, "documentary": 99, "drama": 18, "family": 10751,
        "fantasy": 14, "history": 36, "horror": 27, "music": 10402,
        "mystery": 9648, "romance": 10749, "science fiction": 878,
        "thriller": 53, "war": 10752, "western": 37,
    }

    params = {
        "language": "en-US",
        "sort_by": "popularity.desc",
        "vote_count.gte": 50,
        "page": 1,
    }

    if favorite_genres:
        genre_ids = [str(GENRE_MAP.get(g.lower(), "")) for g in favorite_genres if g.lower() in GENRE_MAP]
        if genre_ids:
            params["with_genres"] = ",".join(genre_ids[:3])

    endpoint = "/discover/movie" if media_type != "tv" else "/discover/tv"
    data = _tmdb_get(endpoint, params)

    if not data:
        return {"recommendations": [], "strategy": "tmdb_fallback", "feature_importances": None}

    recommendations = []
    for m in data.get("results", [])[:top_n]:
        recommendations.append({
            "id": m["id"],
            "title": m.get("title") or m.get("name", ""),
            "overview": m.get("overview", ""),
            "poster_path": m.get("poster_path"),
            "vote_average": m.get("vote_average", 0),
            "release_date": m.get("release_date") or m.get("first_air_date", ""),
            "media_type": media_type if media_type != "all" else "movie",
            "hybrid_score": 0,
        })

    return {
        "recommendations": recommendations,
        "strategy": "tmdb_fallback",
        "feature_importances": None,
    }
