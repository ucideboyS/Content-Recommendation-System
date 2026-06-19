"""
AI-powered routes — Natural Language Search, Mood Recommendations, Trending Context.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.http_client import safe_get
import os
import logging

from app.dependencies import get_current_user
from app.models import User
from app.services.llm_service import (
    parse_natural_language_query,
    rank_movies_by_mood,
    generate_trending_context,
)

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SmartSearchRequest(BaseModel):
    query: str

class MoodRequest(BaseModel):
    mood: str  # happy | sad | tense | nostalgic | adventurous | romantic | thoughtful

class TrendingContextRequest(BaseModel):
    title: str
    genres: List[str] = []
    year: int = 2024
    rank: int = 1

class BatchTrendingRequest(BaseModel):
    movies: List[TrendingContextRequest]

# ---------------------------------------------------------------------------
# Genre name → TMDB ID mapping
# ---------------------------------------------------------------------------

GENRE_MAP = {
    "action": 28, "adventure": 12, "animation": 16, "comedy": 35,
    "crime": 80, "documentary": 99, "drama": 18, "family": 10751,
    "fantasy": 14, "history": 36, "horror": 27, "music": 10402,
    "mystery": 9648, "romance": 10749, "science fiction": 878,
    "sci-fi": 878, "tv movie": 10770, "thriller": 53,
    "war": 10752, "western": 37,
}

ERA_YEAR_RANGES = {
    "classic": ("1920-01-01", "1979-12-31"),
    "80s": ("1980-01-01", "1989-12-31"),
    "90s": ("1990-01-01", "1999-12-31"),
    "2000s": ("2000-01-01", "2009-12-31"),
    "2010s": ("2010-01-01", "2019-12-31"),
    "recent": ("2020-01-01", "2030-12-31"),
}

SORT_MAP = {
    "relevance": "popularity.desc",
    "rating": "vote_average.desc",
    "popularity": "popularity.desc",
    "recent": "release_date.desc",
}

# TMDB genre ID → name
GENRE_ID_TO_NAME = {v: k.title() for k, v in GENRE_MAP.items()}


def _tmdb_get(path: str, params: dict):
    """Helper to call TMDB API."""
    params["api_key"] = TMDB_API_KEY
    resp = safe_get(f"https://api.themoviedb.org/3{path}", params=params)
    resp.raise_for_status()
    return resp.json()


# ============================================================================
# 1. SMART SEARCH
# ============================================================================

@router.post("/smart-search")
async def smart_search(req: SmartSearchRequest, user: User = Depends(get_current_user)):
    """Parse a natural-language query with AI, then fetch matching movies from TMDB."""
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Step 1 — LLM parse
    parsed = parse_natural_language_query(req.query)

    if not parsed:
        # Fallback: just do a regular TMDB keyword search
        logger.warning("LLM parse failed, falling back to keyword search")
        try:
            data = _tmdb_get("/search/movie", {"query": req.query, "language": "en-US", "page": 1})
            return {"parsed_filters": None, "results": data.get("results", [])[:20]}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"TMDB search failed: {e}")

    # Step 2 — build TMDB discover params from the parsed filters
    params = {"language": "en-US", "page": 1, "vote_count.gte": 50}

    # Genres
    genre_ids = []
    for g in parsed.get("genres") or []:
        gid = GENRE_MAP.get(g.lower())
        if gid:
            genre_ids.append(str(gid))
    if genre_ids:
        params["with_genres"] = ",".join(genre_ids)

    # Era
    era = parsed.get("era")
    if era and era in ERA_YEAR_RANGES:
        start, end = ERA_YEAR_RANGES[era]
        params["primary_release_date.gte"] = start
        params["primary_release_date.lte"] = end

    # Runtime
    runtime = parsed.get("runtime")
    if runtime == "short":
        params["with_runtime.lte"] = 90
    elif runtime == "medium":
        params["with_runtime.gte"] = 90
        params["with_runtime.lte"] = 130
    elif runtime == "long":
        params["with_runtime.gte"] = 130

    # Sort
    sort = parsed.get("sort_by", "relevance")
    params["sort_by"] = SORT_MAP.get(sort, "popularity.desc")

    # If similar_to is specified, try TMDB search for that movie first, then get recs
    similar_to = parsed.get("similar_to")
    if similar_to:
        try:
            search_data = _tmdb_get("/search/movie", {"query": similar_to, "language": "en-US", "page": 1})
            if search_data.get("results"):
                anchor_id = search_data["results"][0]["id"]
                sim_data = _tmdb_get(f"/movie/{anchor_id}/similar", {"language": "en-US", "page": 1})
                return {
                    "parsed_filters": parsed,
                    "results": sim_data.get("results", [])[:20],
                }
        except Exception:
            pass  # fall through to discover

    # Actor / Director — search for person, use with_people
    people_ids = []
    for person_name in [parsed.get("actor"), parsed.get("director")]:
        if person_name:
            try:
                pdata = _tmdb_get("/search/person", {"query": person_name, "language": "en-US", "page": 1})
                if pdata.get("results"):
                    people_ids.append(str(pdata["results"][0]["id"]))
            except Exception:
                pass
    if people_ids:
        params["with_people"] = ",".join(people_ids)

    # Keywords — use keyword search
    keywords = parsed.get("keywords") or []
    if keywords and not genre_ids and not people_ids and not similar_to:
        # If we only have keywords and nothing else, do a text search instead
        try:
            data = _tmdb_get("/search/movie", {"query": " ".join(keywords), "language": "en-US", "page": 1})
            return {"parsed_filters": parsed, "results": data.get("results", [])[:20]}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"TMDB search failed: {e}")

    # Step 3 — TMDB discover
    try:
        data = _tmdb_get("/discover/movie", params)
        return {"parsed_filters": parsed, "results": data.get("results", [])[:20]}
    except Exception as e:
        logger.error(f"TMDB discover failed: {e}")
        raise HTTPException(status_code=502, detail=f"TMDB discover failed: {e}")


# ============================================================================
# 2. MOOD-BASED RECOMMENDATIONS (TMDB discovery + LLM ranking)
# ============================================================================

# Mood → genre IDs to seed candidates
MOOD_GENRE_SEEDS = {
    "happy": [35, 10751, 16, 12],       # Comedy, Family, Animation, Adventure
    "sad": [18, 10749],                   # Drama, Romance
    "tense": [53, 9648, 80, 27],         # Thriller, Mystery, Crime, Horror
    "nostalgic": [18, 35, 10751],         # Drama, Comedy, Family
    "adventurous": [28, 12, 878, 14],    # Action, Adventure, Sci-Fi, Fantasy
    "romantic": [10749, 18, 35],          # Romance, Drama, Comedy
    "thoughtful": [18, 878, 9648, 99],   # Drama, Sci-Fi, Mystery, Documentary
}


@router.post("/mood-recommendations")
async def mood_recommendations(req: MoodRequest, user: User = Depends(get_current_user)):
    """Get movie recommendations based on the user's current mood.

    Uses TMDB genre-based discovery to find candidates, then sends them
    to the LLM for final ranking by mood fit.
    """
    mood = req.mood.lower().strip()
    valid_moods = list(MOOD_GENRE_SEEDS.keys())
    if mood not in valid_moods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mood. Choose from: {', '.join(valid_moods)}",
        )

    # Step 1 — fetch candidate movies from TMDB by genre
    genre_ids = MOOD_GENRE_SEEDS[mood]
    try:
        data = _tmdb_get(
            "/discover/movie",
            {
                "language": "en-US",
                "sort_by": "popularity.desc",
                "with_genres": ",".join(str(g) for g in genre_ids[:2]),
                "vote_count.gte": 100,
                "vote_average.gte": 6.0,
                "page": 1,
            },
        )
        candidates = data.get("results", [])[:20]
    except Exception as e:
        logger.error("TMDB fetch for mood candidates failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to fetch candidate movies")

    if not candidates:
        return {"mood": mood, "recommendations": []}

    # Enrich with genre names
    try:
        genre_list_data = _tmdb_get("/genre/movie/list", {"language": "en-US"})
        genre_id_map = {g["id"]: g["name"] for g in genre_list_data.get("genres", [])}
    except Exception:
        genre_id_map = GENRE_ID_TO_NAME

    for movie in candidates:
        gids = movie.get("genre_ids", []) or [g["id"] for g in movie.get("genres", [])]
        movie["genre_names"] = [genre_id_map.get(gid, "Unknown") for gid in gids]

    # Step 2 — LLM ranking
    ranked = rank_movies_by_mood(mood, candidates)

    if ranked:
        ranked_ids = {item["movie_id"]: item for item in ranked}
        results = []
        for movie in candidates:
            if movie["id"] in ranked_ids:
                info = ranked_ids[movie["id"]]
                results.append({
                    "id": movie["id"],
                    "title": movie["title"],
                    "overview": movie.get("overview", ""),
                    "poster_path": movie.get("poster_path"),
                    "vote_average": movie.get("vote_average", 0),
                    "release_date": movie.get("release_date", ""),
                    "fit_score": info.get("fit_score", 0),
                    "reason": info.get("reason", ""),
                })
        results.sort(key=lambda x: x.get("fit_score", 0), reverse=True)
        return {"mood": mood, "recommendations": results[:5]}

    # Fallback: sort by vote_average
    fallback = sorted(candidates, key=lambda x: x.get("vote_average", 0), reverse=True)[:5]
    return {
        "mood": mood,
        "recommendations": [
            {
                "id": m["id"],
                "title": m["title"],
                "overview": m.get("overview", ""),
                "poster_path": m.get("poster_path"),
                "vote_average": m.get("vote_average", 0),
                "release_date": m.get("release_date", ""),
                "fit_score": 0.7,
                "reason": "Popular and highly rated in matching genres",
            }
            for m in fallback
        ],
    }


# ============================================================================
# 3. TRENDING CONTEXT
# ============================================================================

@router.post("/trending-context")
async def trending_context(req: TrendingContextRequest):
    """Generate a punchy one-liner for why a movie is trending."""
    line = generate_trending_context(req.title, req.genres, req.year, req.rank)
    if line:
        return {"context": line}
    return {"context": None}


@router.post("/trending-context/batch")
async def batch_trending_context(req: BatchTrendingRequest):
    """Generate trending context for multiple movies at once."""
    results = {}
    for movie in req.movies[:10]:  # Cap at 10 to avoid rate limits
        line = generate_trending_context(movie.title, movie.genres, movie.year, movie.rank)
        results[movie.title] = line
    return {"contexts": results}
