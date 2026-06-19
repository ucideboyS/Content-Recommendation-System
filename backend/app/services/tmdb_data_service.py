"""
TMDB Data Service — fetches movies and TV series from TMDB and stores them
in the local database for ML model training.
"""

import os
import time
import logging
from typing import List, Dict, Optional

from sqlalchemy.orm import Session
from app.http_client import safe_get
from app.models import Movie
from app.database import SessionLocal

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
BASE_URL = "https://api.themoviedb.org/3"


def _tmdb_get(path: str, params: dict = None) -> Optional[dict]:
    """Helper to call TMDB API with rate limiting."""
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    params.setdefault("language", "en-US")

    try:
        resp = safe_get(f"{BASE_URL}{path}", params=params)
        if resp.status_code == 200:
            return resp.json()
        logger.warning("TMDB %s returned %s", path, resp.status_code)
    except Exception as e:
        logger.error("TMDB request failed for %s: %s", path, e)
    return None


# ---------------------------------------------------------------------------
# Fetch functions
# ---------------------------------------------------------------------------

def fetch_popular_movies(pages: int = 5) -> List[Dict]:
    """Fetch popular movies from TMDB."""
    movies = []
    for page in range(1, pages + 1):
        data = _tmdb_get("/movie/popular", {"page": page})
        if data and data.get("results"):
            movies.extend(data["results"])
        time.sleep(0.25)  # Rate limit
    logger.info("Fetched %d popular movies", len(movies))
    return movies


def fetch_popular_tv(pages: int = 5) -> List[Dict]:
    """Fetch popular TV series from TMDB."""
    shows = []
    for page in range(1, pages + 1):
        data = _tmdb_get("/tv/popular", {"page": page})
        if data and data.get("results"):
            for item in data["results"]:
                # Normalize TV fields to match movie schema
                item["title"] = item.get("name", item.get("title", ""))
                item["release_date"] = item.get("first_air_date", "")
            shows.extend(data["results"])
        time.sleep(0.25)
    logger.info("Fetched %d popular TV series", len(shows))
    return shows


def fetch_trending(media_type: str = "all", time_window: str = "week", pages: int = 3) -> List[Dict]:
    """Fetch trending movies/TV from TMDB."""
    items = []
    for page in range(1, pages + 1):
        data = _tmdb_get(f"/trending/{media_type}/{time_window}", {"page": page})
        if data and data.get("results"):
            for item in data["results"]:
                # Normalize TV fields
                if "name" in item and "title" not in item:
                    item["title"] = item["name"]
                if "first_air_date" in item and "release_date" not in item:
                    item["release_date"] = item["first_air_date"]
            items.extend(data["results"])
        time.sleep(0.25)
    logger.info("Fetched %d trending items", len(items))
    return items


def enrich_movie(tmdb_id: int, media_type: str = "movie") -> Optional[Dict]:
    """Fetch full details for a single movie/TV series (credits, keywords)."""
    endpoint = f"/{media_type}/{tmdb_id}"
    data = _tmdb_get(endpoint, {"append_to_response": "credits,keywords"})
    if not data:
        return None

    # Extract genres
    genres = [g["name"] for g in data.get("genres", [])]

    # Extract cast (top 10)
    credits = data.get("credits", {})
    cast_names = [c["name"] for c in credits.get("cast", [])[:10]]

    # Extract director
    director = None
    for crew in credits.get("crew", []):
        if crew.get("job") == "Director":
            director = crew["name"]
            break

    # Extract keywords
    kw_data = data.get("keywords", {})
    # Movies use "keywords", TV uses "results"
    kw_list = kw_data.get("keywords", kw_data.get("results", []))
    keywords = [k["name"] for k in kw_list]

    return {
        "tmdb_id": data.get("id"),
        "title": data.get("title") or data.get("name", ""),
        "overview": data.get("overview", ""),
        "media_type": media_type,
        "genres": genres,
        "cast_names": cast_names,
        "director": director,
        "popularity": data.get("popularity", 0),
        "keywords": keywords,
        "poster_path": data.get("poster_path"),
        "vote_average": data.get("vote_average", 0),
        "release_date": data.get("release_date") or data.get("first_air_date", ""),
    }


# ---------------------------------------------------------------------------
# Database storage
# ---------------------------------------------------------------------------

def store_movies_to_db(movies: List[Dict], media_type: str = "movie", db: Session = None):
    """Upsert movies into the database."""
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True

    stored = 0
    skipped = 0

    # Pre-build genre map
    genre_map = _get_genre_map(media_type)

    for m in movies:
        tmdb_id = m.get("id")
        if not tmdb_id:
            continue

        existing = db.query(Movie).filter(Movie.tmdb_id == tmdb_id).first()

        # Map genre_ids to genre names
        genre_ids = m.get("genre_ids", [])
        genre_names = [genre_map.get(gid, f"genre_{gid}") for gid in genre_ids]

        title = m.get("title") or m.get("name", "Unknown")

        if existing:
            # Update fields if they're empty
            if not existing.genres:
                existing.genres = genre_names
            if not existing.poster_path:
                existing.poster_path = m.get("poster_path")
            if not existing.vote_average:
                existing.vote_average = m.get("vote_average")
            if not existing.release_date:
                existing.release_date = m.get("release_date") or m.get("first_air_date", "")
            if not existing.popularity:
                existing.popularity = m.get("popularity")
            existing.media_type = media_type
            skipped += 1
        else:
            movie = Movie(
                tmdb_id=tmdb_id,
                title=title,
                overview=m.get("overview", ""),
                media_type=media_type,
                genres=genre_names,
                poster_path=m.get("poster_path"),
                vote_average=m.get("vote_average", 0),
                release_date=m.get("release_date") or m.get("first_air_date", ""),
                popularity=m.get("popularity", 0),
            )
            db.add(movie)
            stored += 1

    db.commit()
    logger.info("Stored %d new %s(s), updated %d existing", stored, media_type, skipped)

    if close_session:
        db.close()


def enrich_db_movies(db: Session = None, limit: int = 200):
    """Enrich existing DB movies with cast, director, keywords."""
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True

    # Find movies missing cast/director/keywords
    movies = (
        db.query(Movie)
        .filter(
            (Movie.cast_names == None) | (Movie.director == None) | (Movie.keywords == None)  # noqa: E711
        )
        .limit(limit)
        .all()
    )

    logger.info("Enriching %d movies with credits + keywords...", len(movies))

    for i, movie in enumerate(movies):
        enriched = enrich_movie(movie.tmdb_id, movie.media_type or "movie")
        if enriched:
            movie.cast_names = enriched["cast_names"]
            movie.director = enriched["director"]
            movie.keywords = enriched["keywords"]
            if not movie.genres:
                movie.genres = enriched["genres"]
        time.sleep(0.25)  # Rate limit

        if (i + 1) % 50 == 0:
            db.commit()
            logger.info("  enriched %d/%d", i + 1, len(movies))

    db.commit()
    logger.info("✅ Enrichment complete")

    if close_session:
        db.close()


def _get_genre_map(media_type: str = "movie") -> Dict[int, str]:
    """Fetch genre ID → name mapping from TMDB."""
    endpoint = f"/genre/{media_type}/list"
    data = _tmdb_get(endpoint)
    if data and data.get("genres"):
        return {g["id"]: g["name"] for g in data["genres"]}
    return {}


# ---------------------------------------------------------------------------
# Main entry point — run to populate the database
# ---------------------------------------------------------------------------

def populate_database():
    """Fetch and store popular movies + TV series into the database."""
    logger.info("=== Populating database with TMDB data ===")

    # Fetch movies
    movies = fetch_popular_movies(pages=5)
    store_movies_to_db(movies, media_type="movie")

    # Fetch TV series
    tv_shows = fetch_popular_tv(pages=5)
    store_movies_to_db(tv_shows, media_type="tv")

    # Fetch trending (mix of movies + TV)
    trending = fetch_trending("all", "week", pages=3)
    for item in trending:
        mt = item.get("media_type", "movie")
        if mt in ("movie", "tv"):
            store_movies_to_db([item], media_type=mt)

    # Enrich with cast, director, keywords
    enrich_db_movies(limit=200)

    logger.info("=== Database population complete! ===")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    populate_database()
