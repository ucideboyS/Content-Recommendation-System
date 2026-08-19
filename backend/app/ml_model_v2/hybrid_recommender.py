"""
TF-IDF Recommendation Engine.

Uses scikit-learn's TfidfVectorizer + cosine similarity to rank movies
fetched live from TMDB. No local dataset, no persisted model — the
vectorizer is fit fresh on each request's own candidate pool (seed +
candidates), so there's nothing to retrain when new movies release.

Flow:
    1. Fetch seed movie details from TMDB (includes original_language)
    2. Fetch candidate movies from TMDB (similar + recommendations +
       genre discover + same-original-language discover +
       same-language-and-genre discover)
    3. Hard-filter candidates to the seed's original_language
    4. Vectorize seed + candidate texts with TF-IDF (fit on this request's
       corpus only)
    5. Rank candidates by cosine similarity to the seed vector
"""

import logging
import os
from typing import List, Dict, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE = "https://api.themoviedb.org/3"


def _tmdb_get(path: str, params: dict = None) -> Optional[dict]:
    """Call TMDB API."""
    from app.http_client import safe_get
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    try:
        resp = safe_get(f"{TMDB_BASE}{path}", params=params)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.error("TMDB request failed: %s", e)
    return None


def _movie_to_text(movie: dict) -> str:
    """Convert a TMDB movie dict into a text string for SBERT encoding."""
    parts = []

    # Title + original title (original_title carries the native-script
    # title — e.g. Hindi/Tamil — which helps the multilingual model match
    # same-language/same-industry films even when overviews are sparse).
    title = movie.get("title") or movie.get("name", "")
    original_title = movie.get("original_title") or movie.get("original_name", "")
    if title:
        parts.append(title)
    if original_title and original_title != title:
        parts.append(original_title)

    # Genre names (if available)
    genres = movie.get("genres")
    if genres and isinstance(genres, list):
        if isinstance(genres[0], dict):
            parts.append(" ".join(g["name"] for g in genres))
        else:
            parts.append(" ".join(str(g) for g in genres))

    # Genre IDs -> names mapping (for search results that only have genre_ids)
    genre_id_map = {
        28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
        80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
        14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
        9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
        10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    }
    genre_ids = movie.get("genre_ids")
    if genre_ids and isinstance(genre_ids, list):
        genre_names = [genre_id_map.get(gid, "") for gid in genre_ids]
        parts.append(" ".join(g for g in genre_names if g))

    # Keywords (TMDB "themes" tags — e.g. "college", "friendship", "exam
    # pressure" for 3 Idiots). These carry far more specific thematic
    # signal than genre alone, which is exactly what distinguishes
    # Chichore/Super 30 (college-life dramas) from a generic Hindi comedy.
    # Only present when this movie dict came from a details fetch with
    # append_to_response=keywords (currently: the seed movie only).
    # Repeated 3x to weight it comparably to overview length.
    keywords_data = movie.get("keywords")
    if keywords_data and isinstance(keywords_data, dict):
        kw_list = keywords_data.get("keywords", [])
        if kw_list:
            kw_text = " ".join(k["name"] for k in kw_list if k.get("name"))
            if kw_text:
                parts.append((kw_text + " ") * 3)

    # Overview
    overview = movie.get("overview", "")
    if overview:
        parts.append(overview)

    # Tagline
    tagline = movie.get("tagline", "")
    if tagline:
        parts.append(tagline)

    return " ".join(parts).strip() or movie.get("title", "")


def _fetch_movie_details(tmdb_id: int) -> Optional[dict]:
    """Fetch full movie details from TMDB."""
    data = _tmdb_get(f"/movie/{tmdb_id}", {"language": "en-US", "append_to_response": "credits,keywords"})
    return data


def _fetch_candidates(tmdb_id: int, seed_details: Optional[dict] = None, limit: int = 250) -> List[dict]:
    """Fetch candidate movies from multiple TMDB sources.

    seed_details is optional — pass it in when you already fetched it
    (e.g. from recommend_by_id) to avoid a duplicate TMDB call. If not
    provided, it's fetched here as needed for the genre/language sources.
    """
    candidates = {}

    # Source 1: TMDB recommendations
    rec_data = _tmdb_get(f"/movie/{tmdb_id}/recommendations", {"language": "en-US", "page": 1})
    if rec_data:
        for m in rec_data.get("results", []):
            if m["id"] != tmdb_id and m["id"] not in candidates:
                candidates[m["id"]] = m

    # Source 2: TMDB similar movies
    sim_data = _tmdb_get(f"/movie/{tmdb_id}/similar", {"language": "en-US", "page": 1})
    if sim_data:
        for m in sim_data.get("results", []):
            if m["id"] != tmdb_id and m["id"] not in candidates:
                candidates[m["id"]] = m

    # Make sure we have seed details for genre / language lookups below
    details = seed_details
    if details is None:
        details = _fetch_movie_details(tmdb_id)

    # Source 3: If we have few candidates, try discover with same genres
    if len(candidates) < 15 and details and details.get("genres"):
        genre_ids = ",".join(str(g["id"]) for g in details["genres"][:2])
        disc_data = _tmdb_get("/discover/movie", {
            "language": "en-US",
            "sort_by": "popularity.desc",
            "with_genres": genre_ids,
            "vote_count.gte": 50,
            "page": 1,
        })
        if disc_data:
            for m in disc_data.get("results", []):
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    candidates[m["id"]] = m

    # Source 4 (was "Source 5"): Same language AND same genre combined.
    # This runs BEFORE the broad popularity-only language source below —
    # deliberately. It's the most targeted source (matches both language
    # AND genre), so it must be inserted into `candidates` while the dict
    # is still empty/small, not after a broader source has already filled
    # it. See note at the bottom of this function about why insertion
    # order used to silently drop this source's results entirely.
    original_language = details.get("original_language") if details else None
    if original_language and original_language != "en" and details and details.get("genres"):
        genre_ids = ",".join(str(g["id"]) for g in details["genres"][:2])
        combo_count_before = len(candidates)
        for page in (1, 2, 3):
            combo_data = _tmdb_get("/discover/movie", {
                "language": "en-US",
                "with_original_language": original_language,
                "with_genres": genre_ids,
                "sort_by": "popularity.desc",
                "vote_count.gte": 20,
                "page": page,
            })
            if not combo_data:
                break
            results = combo_data.get("results", [])
            if not results:
                break
            for m in results:
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    candidates[m["id"]] = m
            if page >= combo_data.get("total_pages", 1):
                break
        logger.info(
            "Language+genre combo discover for '%s' genres=%s: +%d candidates",
            original_language, genre_ids, len(candidates) - combo_count_before,
        )

    # Source 5: Same original_language discover, sorted by raw popularity
    # across ALL genres. This is intentionally broad/lower-precision (it's
    # how a horror film like Tumbbad or a thriller like Dhurandhar can end
    # up in the pool for a comedy-drama seed) — it exists only to pad out
    # the pool when the targeted combo source above comes back thin for a
    # sparsely-covered regional industry. It runs LAST so it can never
    # crowd out the targeted Source 4 results before the final ranking.
    if original_language and original_language != "en":
        same_lang_count_before = sum(
            1 for m in candidates.values() if m.get("original_language") == original_language
        )
        for page in (1, 2, 3):
            lang_data = _tmdb_get("/discover/movie", {
                "language": "en-US",
                "with_original_language": original_language,
                "sort_by": "popularity.desc",
                "vote_count.gte": 100,
                "page": page,
            })
            if not lang_data:
                break
            results = lang_data.get("results", [])
            if not results:
                break
            for m in results:
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    candidates[m["id"]] = m
            if page >= lang_data.get("total_pages", 1):
                break

        same_lang_count_after = sum(
            1 for m in candidates.values() if m.get("original_language") == original_language
        )
        logger.info(
            "Language-aware discover for '%s': %d -> %d same-language candidates",
            original_language, same_lang_count_before, same_lang_count_after,
        )

        if same_lang_count_after < 5:
            logger.warning(
                "Only %d same-language candidates found for '%s' (tmdb_id=%d); "
                "pool may be thin for this regional industry",
                same_lang_count_after, original_language, tmdb_id,
            )

    # NOTE: we deliberately do NOT slice to `limit` here. TF-IDF over a few
    # hundred short text documents is cheap (milliseconds), and slicing by
    # insertion order here was the actual bug: whichever source ran last
    # (previously the most targeted one) would get silently truncated away
    # before TF-IDF ever saw it, regardless of how relevant it was. Instead,
    # the full pool is ranked by cosine similarity in recommend_by_id(), and
    # only the top_n *by similarity* is returned. `limit` is still applied
    # as a hard ceiling so a pathological case can't blow up the TF-IDF
    # matrix, but it's generous enough (default below) that it's a safety
    # cap, not a routine truncation.
    all_candidates = list(candidates.values())
    if len(all_candidates) > limit:
        logger.info(
            "Candidate pool (%d) exceeds hard cap (%d); truncating before TF-IDF "
            "as a safety measure only — this should rarely trigger",
            len(all_candidates), limit,
        )
    return all_candidates[:limit]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def recommend_by_title(title: str, top_n: int = 10) -> Dict:
    """
    Get TF-IDF-powered recommendations for a movie title.

    1. Search TMDB for the movie
    2. Fetch candidates from TMDB
    3. Vectorize with TF-IDF and rank by cosine similarity
    """
    # Search for the movie on TMDB
    search_data = _tmdb_get("/search/movie", {"query": title, "language": "en-US", "page": 1})
    if not search_data or not search_data.get("results"):
        return {"recommendations": [], "strategy": "title_not_found", "selected_title": None}

    seed_movie = search_data["results"][0]
    tmdb_id = seed_movie["id"]

    return recommend_by_id(tmdb_id, top_n=top_n)


def recommend_by_id(tmdb_id: int, top_n: int = 10) -> Dict:
    """
    Get TF-IDF + cosine similarity recommendations for a TMDB ID.

    1. Fetch seed movie details from TMDB
    2. Fetch candidate movies from TMDB
    3. Hard-filter candidates to the seed's original_language
    4. Vectorize seed + candidates with TF-IDF (fit fresh per request)
    5. Rank by cosine similarity
    """
    # Fetch seed movie details
    seed_details = _fetch_movie_details(tmdb_id)
    if not seed_details:
        return {"recommendations": [], "strategy": "seed_not_found", "selected_title": None}

    selected_title = seed_details.get("title", "")
    seed_language = seed_details.get("original_language")

    # Fetch candidate movies (pass seed_details so we don't re-fetch it)
    candidates = _fetch_candidates(tmdb_id, seed_details=seed_details, limit=250)
    if not candidates:
        return {"recommendations": [], "strategy": "no_candidates", "selected_title": selected_title}

    # ---------------------------------------------------------------
    # HARD FILTER: only recommend movies in the same original_language
    # as the seed. This is a strict requirement, not a ranking boost —
    # a Hindi movie must only surface Hindi candidates, Tamil -> Tamil,
    # Marathi -> Marathi, Gujarati -> Gujarati, etc. English seed movies
    # are not filtered (original_language == "en" candidates only, same rule).
    # ---------------------------------------------------------------
    if seed_language:
        before_count = len(candidates)
        candidates = [m for m in candidates if m.get("original_language") == seed_language]
        logger.info(
            "Same-language filter ('%s') for '%s': %d -> %d candidates",
            seed_language, selected_title, before_count, len(candidates),
        )

    if not candidates:
        # No candidates survived the language filter — TMDB's candidate
        # pool for this language was too thin. We do NOT fall back to
        # cross-language results, since the same-language rule is strict.
        logger.warning(
            "No same-language ('%s') candidates found for '%s' (tmdb_id=%d)",
            seed_language, selected_title, tmdb_id,
        )
        return {
            "recommendations": [],
            "strategy": "no_same_language_candidates",
            "selected_title": selected_title,
        }

    # Build text representations
    seed_text = _movie_to_text(seed_details)
    candidate_texts = [_movie_to_text(m) for m in candidates]

    # ---------------------------------------------------------------
    # TF-IDF + cosine similarity. The vectorizer is fit on this request's
    # own corpus (seed + candidates) — nothing persisted, nothing to
    # retrain when new movies release. stop_words="english" is safe here
    # because TMDB overview/tagline text is fetched with language=en-US
    # regardless of the movie's original_language, so the text body is
    # always English even for Hindi/Tamil/etc. seed movies.
    # ---------------------------------------------------------------
    all_texts = [seed_text] + candidate_texts
    vectorizer = TfidfVectorizer(stop_words="english", max_features=10000)
    tfidf_matrix = vectorizer.fit_transform(all_texts)

    seed_vector = tfidf_matrix[0:1]
    candidate_matrix = tfidf_matrix[1:]

    similarities = cosine_similarity(seed_vector, candidate_matrix)[0]

    # Rank by similarity
    ranked_indices = similarities.argsort()[::-1]

    recommendations = []
    for idx in ranked_indices[:top_n]:
        m = candidates[idx]
        sim_score = float(similarities[idx])
        recommendations.append({
            "id": m["id"],
            "title": m.get("title") or m.get("name", ""),
            "tmdb_id": m["id"],
            "overview": m.get("overview", ""),
            "poster_path": m.get("poster_path"),
            "vote_average": m.get("vote_average", 0),
            "release_date": m.get("release_date", ""),
            "media_type": "movie",
            "similarity": round(sim_score, 4),
        })

    logger.info("TF-IDF: %d recommendations for '%s' (tmdb_id=%d)", len(recommendations), selected_title, tmdb_id)

    return {
        "recommendations": recommendations,
        "strategy": "tfidf-cosine-live-TMDB",
        "selected_title": selected_title,
    }


def get_similar_by_tmdb_id(tmdb_id: int, top_n: int = 10) -> List[Dict]:
    """
    Find similar movies by TMDB ID using live TF-IDF + cosine similarity.
    Returns list of dicts with movie metadata + similarity score.
    """
    result = recommend_by_id(tmdb_id, top_n=top_n)
    return result.get("recommendations", [])