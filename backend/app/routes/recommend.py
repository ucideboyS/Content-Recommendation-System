"""
Recommendation routes — TMDB-based, Hybrid ML, and Mood-based recommendations.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, History, Movie
from app.dependencies import get_current_user, get_optional_user
from app.http_client import safe_get
import os
import logging

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")

router = APIRouter()


def _tmdb_get(path: str, params: dict) -> dict | None:
    """Helper to call TMDB API."""
    params["api_key"] = TMDB_API_KEY
    resp = safe_get(f"https://api.themoviedb.org/3{path}", params=params)
    if resp.status_code == 200:
        return resp.json()
    return None


def _search_tmdb_movie(title: str) -> dict | None:
    """Search TMDB for a movie by title, return the top result."""
    data = _tmdb_get("/search/movie", {"query": title, "language": "en-US", "page": 1})
    if data and data.get("results"):
        return data["results"][0]
    return None


# ============================================================================
# 1. BASIC TMDB-BASED RECOMMENDATIONS
# ============================================================================

@router.get("/")
def get_recommendations(movie: str = Query(..., description="Enter a movie name")):
    """Get similar movies via TMDB Similar Movies API."""
    found = _search_tmdb_movie(movie)
    if not found:
        raise HTTPException(status_code=404, detail="Movie not found on TMDB")

    tmdb_id = found["id"]

    similar_data = _tmdb_get(f"/movie/{tmdb_id}/similar", {"language": "en-US", "page": 1})
    if not similar_data or not similar_data.get("results"):
        rec_data = _tmdb_get(f"/movie/{tmdb_id}/recommendations", {"language": "en-US", "page": 1})
        if not rec_data or not rec_data.get("results"):
            return {"recommendations": [], "source_movie": found.get("title")}
        results = rec_data["results"]
    else:
        results = similar_data["results"]

    recommendations = []
    for m in results[:10]:
        recommendations.append({
            "id": m["id"],
            "title": m["title"],
            "overview": m.get("overview", ""),
            "poster_path": m.get("poster_path"),
            "vote_average": m.get("vote_average", 0),
            "release_date": m.get("release_date", ""),
        })

    return {"recommendations": recommendations, "source_movie": found.get("title")}


@router.get("/by-id/{tmdb_id}")
def get_recommendations_by_id(
    tmdb_id: int, 
    user: User = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    Get high-quality recommendations using the live-TMDB hybrid TF-IDF +
    Sentence-Transformer + Bayesian ranking engine.
    Auth is NOT required — this endpoint is public.
    """
    import time
    import traceback

    t_start = time.time()
    logger.info("[RECOMMEND] START  tmdb_id=%s user_id=%s", tmdb_id, user.id if user else None)

    try:
        from app.ml_model_v2.hybrid_recommender import recommend_by_id as hybrid_recommend

        user_id = user.id if user else None
        result = hybrid_recommend(tmdb_id, top_n=5, user_id=user_id, db=db)
        recs = result.get("recommendations", [])

        t_total = time.time() - t_start
        logger.info(
            "[RECOMMEND] DONE   tmdb_id=%s  candidates=%d  strategy=%s  latency=%.2fs",
            tmdb_id, len(recs), result.get('strategy', 'unknown'), t_total,
        )
        return {"recommendations": recs}

    except Exception as e:
        t_total = time.time() - t_start
        logger.error(
            "[RECOMMEND] FAIL   tmdb_id=%s  latency=%.2fs  error=%s\n%s",
            tmdb_id, t_total, e, traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 2. HYBRID ML RECOMMENDATIONS
# ============================================================================

@router.get("/hybrid")
def get_hybrid_recommendations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    media_type: str = Query(default="all", description="Filter by: movie, tv, all"),
    top_n: int = Query(default=10, ge=1, le=30),
):
    """
    Get personalized hybrid recommendations using ML models.
    - Cold-start (< 5 ratings): Content-Based from user preferences
    - Warm user (≥ 5 ratings): 70% Random Forest + 30% Content-Based
    - Fallback: TMDB popular movies
    """
    try:
        from app.services.hybrid_service import get_hybrid_recommendations as hybrid_recs
        result = hybrid_recs(user, db, media_type=media_type, top_n=top_n)
        return result
    except Exception as e:
        logger.error("Hybrid recommendations failed: %s", e)
        raise HTTPException(status_code=500, detail="Recommendation engine error")


# ============================================================================
# 3. MOOD-BASED RECOMMENDATIONS
# ============================================================================

MOOD_GENRE_SEEDS = {
    "happy": [35, 10751, 16, 12],
    "sad": [18, 10749],
    "tense": [53, 9648, 80, 27],
    "nostalgic": [18, 35, 10751],
    "adventurous": [28, 12, 878, 14],
    "romantic": [10749, 18, 35],
    "thoughtful": [18, 878, 9648, 99],
}

@router.get("/mood/{mood}")
def get_mood_recommendations(
    mood: str,
    top_n: int = Query(default=10, ge=1, le=20),
):
    """Get recommendations based on mood using Naive Bayes classifier."""
    mood = mood.lower().strip()
    valid_moods = list(MOOD_GENRE_SEEDS.keys())
    if mood not in valid_moods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mood. Choose from: {', '.join(valid_moods)}",
        )

    # Try NB classifier first
    try:
        from app.ml_model.naive_bayes_model import get_mood_recommendations as nb_mood
        from app.database import SessionLocal
        from app.models import Movie

        db = SessionLocal()
        movies = db.query(Movie).filter(
            Movie.overview != None, Movie.overview != ""  # noqa: E711
        ).limit(500).all()

        movies_data = [{
            "tmdb_id": m.tmdb_id,
            "title": m.title,
            "overview": m.overview or "",
            "genres": m.genres or [],
            "poster_path": m.poster_path,
            "vote_average": m.vote_average or 0,
            "release_date": m.release_date or "",
            "media_type": m.media_type or "movie",
        } for m in movies]
        db.close()

        if movies_data:
            scored = nb_mood(mood, movies_data, top_n=top_n)
            movie_map = {m["tmdb_id"]: m for m in movies_data}

            recommendations = []
            for tmdb_id, score in scored:
                if tmdb_id in movie_map:
                    m = movie_map[tmdb_id]
                    recommendations.append({
                        "id": m["tmdb_id"],
                        "title": m["title"],
                        "overview": m.get("overview", ""),
                        "poster_path": m.get("poster_path"),
                        "vote_average": m.get("vote_average", 0),
                        "release_date": m.get("release_date", ""),
                        "media_type": m.get("media_type", "movie"),
                        "mood_score": round(score, 3),
                    })

            if recommendations:
                return {"mood": mood, "recommendations": recommendations}
    except Exception as e:
        logger.error("NB mood recommendations failed: %s", e)

    # Fallback: TMDB genre-based discovery
    genre_ids = MOOD_GENRE_SEEDS[mood]
    data = _tmdb_get("/discover/movie", {
        "language": "en-US",
        "sort_by": "popularity.desc",
        "with_genres": ",".join(str(g) for g in genre_ids[:2]),
        "vote_count.gte": 100,
        "vote_average.gte": 6.0,
        "page": 1,
    })

    if not data:
        return {"mood": mood, "recommendations": []}

    recommendations = [{
        "id": m["id"],
        "title": m["title"],
        "overview": m.get("overview", ""),
        "poster_path": m.get("poster_path"),
        "vote_average": m.get("vote_average", 0),
        "release_date": m.get("release_date", ""),
        "media_type": "movie",
        "mood_score": 0,
    } for m in data.get("results", [])[:top_n]]

    return {"mood": mood, "recommendations": recommendations}


# ============================================================================
# 4. COLD START
# ============================================================================

@router.get("/cold-start")
def get_cold_start_recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cold start: recommend based on user's favorite genres via TMDB discover."""
    history_count = db.query(History).filter(History.user_id == user.id).count()

    if history_count > 0:
        return {"message": "User has history, use /hybrid for personalized recommendations"}

    if not user.favorite_genres:
        return {"message": "No preferences set, showing trending movies instead"}

    GENRE_MAP = {
        "action": 28, "adventure": 12, "animation": 16, "comedy": 35,
        "crime": 80, "documentary": 99, "drama": 18, "family": 10751,
        "fantasy": 14, "history": 36, "horror": 27, "music": 10402,
        "mystery": 9648, "romance": 10749, "science fiction": 878,
        "thriller": 53, "war": 10752, "western": 37,
    }

    genre_ids = []
    for g in user.favorite_genres:
        gid = GENRE_MAP.get(g.lower())
        if gid:
            genre_ids.append(str(gid))

    params = {
        "language": "en-US",
        "sort_by": "popularity.desc",
        "vote_count.gte": 50,
        "page": 1,
    }
    if genre_ids:
        params["with_genres"] = ",".join(genre_ids[:3])

    data = _tmdb_get("/discover/movie", params)
    if not data:
        return {"recommendations": []}

    recommendations = [{
        "id": m["id"],
        "title": m["title"],
        "overview": m.get("overview", ""),
        "poster_path": m.get("poster_path"),
        "vote_average": m.get("vote_average", 0),
    } for m in data.get("results", [])[:10]]

    return {"recommendations": recommendations}