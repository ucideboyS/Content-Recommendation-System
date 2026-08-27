"""
Hybrid Recommendation Service — SBERT-only mode.

Strategy:
  - Uses SBERT (all-MiniLM-L6-v2) for semantic similarity on TMDB-fetched data.
  - If user has rated movies, uses highest-rated movie as seed for SBERT.
  - Cold-start: uses favorite genres via TMDB discover.
  - Fallback: TMDB popular movies.
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


def get_hybrid_recommendations(
    user: User,
    db: Session,
    media_type: str = "all",
    top_n: int = 10,
) -> Dict:
    """
    Main recommendation function — SBERT-only mode.
    Uses user's highest-rated movie as seed for SBERT similarity.
    Falls back to TMDB discover/popular.
    """
    # Get user's rated movies
    ratings = db.query(Rating).filter(Rating.user_id == user.id).all()
    rated_ids = set()
    best_tmdb_id = None
    best_rating = -1

    for r in ratings:
        rated_ids.add(r.tmdb_id)
        if r.rating > best_rating:
            best_rating = r.rating
            best_tmdb_id = r.tmdb_id

    user_fav_genres = user.favorite_genres or []

    # ---------------------------------------------------------------
    # Path 1: User has rated movies -> SBERT similarity from best movie
    # ---------------------------------------------------------------
    if best_tmdb_id:
        logger.info("User %s: SBERT from highest-rated movie (tmdb_id=%d, rating=%.1f)",
                     user.id, best_tmdb_id, best_rating)
        try:
            from app.ml_model_v2.hybrid_recommender import recommend_by_id

            result = recommend_by_id(best_tmdb_id, top_n=top_n + len(rated_ids))

            if result.get("recommendations"):
                recommendations = []
                for rec in result["recommendations"]:
                    rec_id = rec.get("id") or rec.get("tmdb_id")
                    if rec_id and rec_id not in rated_ids:
                        recommendations.append({
                            "id": rec_id,
                            "title": rec.get("title", ""),
                            "overview": rec.get("overview", ""),
                            "poster_path": rec.get("poster_path"),
                            "vote_average": rec.get("vote_average", 0),
                            "release_date": rec.get("release_date", ""),
                            "media_type": "movie",
                            "hybrid_score": round(rec.get("final_score", rec.get("similarity", 0)), 3),
                            "tfidf_similarity": round(rec.get("similarity", 0), 3),
                            "xgboost_score": round(rec.get("xgboost_score", 0), 3),
                            "final_score": round(rec.get("final_score", 0), 3),
                        })
                    if len(recommendations) >= top_n:
                        break

                if recommendations:
                    return {
                        "recommendations": recommendations,
                        "strategy": result.get("strategy", "SBERT-live-TMDB"),
                        "feature_importances": None,
                    }
        except Exception as e:
            logger.error("SBERT engine failed: %s", e, exc_info=True)

    # ---------------------------------------------------------------
    # Path 2: Cold-start -> TMDB genre-based discovery
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
