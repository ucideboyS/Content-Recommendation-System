"""
Recommendation routes — TMDB-based, Hybrid ML, and Mood-based recommendations.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, History, Movie
from app.dependencies import get_current_user
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
def get_recommendations_by_id(tmdb_id: int):
    """
    Get high-quality recommendations by combining multiple sources:
    1. TMDB Recommendations (viewing-pattern based)
    2. TMDB Similar Movies (genre/keyword based)
    3. Content-Based ML model (TF-IDF cosine similarity)
    Results are deduplicated, filtered to match the source movie's
    original language, and ranked with content similarity as the
    dominant signal (popularity/rating only act as a tiebreaker).
    """
    # --- Determine source movie's original language first ---
    source_data = _tmdb_get(f"/movie/{tmdb_id}", {"language": "en-US"})
    source_language = (source_data or {}).get("original_language")

    seen_ids = {tmdb_id}  # exclude the source movie itself
    candidates = {}  # id -> movie_dict with score info

    def _add_candidates(results: list, source_bonus: float):
        """Merge results into candidates with source bonus.

        Filters out candidates whose original_language does not match
        the source movie's language, so e.g. a Hindi movie doesn't get
        polluted with English recommendations just because TMDB's
        similar/recommendations endpoints return mixed-language results.
        """
        for rank, m in enumerate(results):
            # --- Change 1: language filter ---
            if source_language and m.get("original_language") != source_language:
                continue

            mid = m.get("id")
            if not mid or mid in seen_ids:
                continue
            # Skip items without poster
            if not m.get("poster_path"):
                continue
            seen_ids.add(mid)
            # Quality score used only as a tiebreaker / fallback signal
            # (dominant ranking still comes from content similarity where available)
            vote = m.get("vote_average", 0)
            pop = min(m.get("popularity", 10), 500)  # cap popularity
            pop_factor = 1.0 + (pop / 500) * 0.5  # 1.0 to 1.5
            rank_decay = 1.0 / (1.0 + rank * 0.08)  # gentle rank decay
            score = vote * pop_factor * source_bonus * rank_decay

            candidates[mid] = {
                "id": mid,
                "title": m.get("title") or m.get("name", ""),
                "overview": m.get("overview", ""),
                "poster_path": m.get("poster_path"),
                "vote_average": vote,
                "release_date": m.get("release_date") or m.get("first_air_date", ""),
                "media_type": m.get("media_type", "movie"),
                "_score": score,
            }

    # --- Source 1: TMDB Recommendations (best quality, highest bonus) ---
    rec_data = _tmdb_get(f"/movie/{tmdb_id}/recommendations", {"language": "en-US", "page": 1})
    if rec_data and rec_data.get("results"):
        _add_candidates(rec_data["results"], source_bonus=1.3)

    # --- Source 2: TMDB Similar Movies (genre-based, moderate bonus) ---
    sim_data = _tmdb_get(f"/movie/{tmdb_id}/similar", {"language": "en-US", "page": 1})
    if sim_data and sim_data.get("results"):
        _add_candidates(sim_data["results"], source_bonus=1.0)

    # --- Source 3: Content-Based ML Model (if movie is in our DB) ---
    try:
        from app.ml_model.content_based import get_similar_movies
        from app.database import SessionLocal
        from app.models import Movie

        cb_results = get_similar_movies(tmdb_id, top_n=15)
        if cb_results:
            db = SessionLocal()

            cb_ids = [tid for tid, _ in cb_results]

            # --- Change 2: filter local TF-IDF candidates to source language ---
            query = db.query(Movie).filter(Movie.tmdb_id.in_(cb_ids))
            if source_language and hasattr(Movie, "original_language"):
                query = query.filter(Movie.original_language == source_language)
            db_movies = query.all()

            db_map = {m.tmdb_id: m for m in db_movies}
            db.close()

            for tid, sim_score in cb_results:
                if tid in seen_ids:
                    continue
                m = db_map.get(tid)
                if not m or not m.poster_path:
                    continue
                seen_ids.add(tid)
                # --- Change 3: similarity-first scoring ---
                # Content similarity dominates; vote_average is a minor tiebreaker.
                score = sim_score * 10 + (m.vote_average or 5) * 0.1
                candidates[tid] = {
                    "id": tid,
                    "title": m.title or "",
                    "overview": m.overview or "",
                    "poster_path": m.poster_path,
                    "vote_average": m.vote_average or 0,
                    "release_date": m.release_date or "",
                    "media_type": m.media_type or "movie",
                    "_score": score,
                }
    except Exception as e:
        logger.debug("Content-based model skipped: %s", e)

    # --- Source 4: TV fallback (if no movie results, try as TV show) ---
    if len(candidates) < 3:
        tv_rec = _tmdb_get(f"/tv/{tmdb_id}/recommendations", {"language": "en-US", "page": 1})
        if tv_rec and tv_rec.get("results"):
            _add_candidates(tv_rec["results"], source_bonus=1.2)
        tv_sim = _tmdb_get(f"/tv/{tmdb_id}/similar", {"language": "en-US", "page": 1})
        if tv_sim and tv_sim.get("results"):
            _add_candidates(tv_sim["results"], source_bonus=0.9)

    # --- Fallback: if language filtering left too few candidates, relax it ---
    # This avoids returning an empty/near-empty list for movies whose
    # local dataset or TMDB neighborhood is thin in their language.
    if len(candidates) < 3 and source_language:
        logger.debug(
            "Only %d candidates after language filter for tmdb_id=%s (lang=%s); "
            "relaxing filter to avoid empty results",
            len(candidates), tmdb_id, source_language,
        )
        if rec_data and rec_data.get("results"):
            for rank, m in enumerate(rec_data["results"]):
                mid = m.get("id")
                if not mid or mid in seen_ids or not m.get("poster_path"):
                    continue
                seen_ids.add(mid)
                vote = m.get("vote_average", 0)
                pop = min(m.get("popularity", 10), 500)
                pop_factor = 1.0 + (pop / 500) * 0.5
                rank_decay = 1.0 / (1.0 + rank * 0.08)
                # Penalize off-language fallback results so on-language
                # candidates still rank above them if any exist.
                score = vote * pop_factor * 1.3 * rank_decay * 0.5
                candidates[mid] = {
                    "id": mid,
                    "title": m.get("title") or m.get("name", ""),
                    "overview": m.get("overview", ""),
                    "poster_path": m.get("poster_path"),
                    "vote_average": vote,
                    "release_date": m.get("release_date") or m.get("first_air_date", ""),
                    "media_type": m.get("media_type", "movie"),
                    "_score": score,
                }

    # --- Rank and return top 10 ---
    sorted_candidates = sorted(candidates.values(), key=lambda x: x["_score"], reverse=True)

    recommendations = []
    for m in sorted_candidates[:10]:
        recommendations.append({
            "id": m["id"],
            "title": m["title"],
            "overview": m["overview"],
            "poster_path": m["poster_path"],
            "vote_average": m["vote_average"],
            "release_date": m["release_date"],
        })

    return {"recommendations": recommendations}


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
