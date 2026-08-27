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
import time
from cachetools import TTLCache, cached
import threading
from app.ml_model_v2.semantic_search import generate_embedding, query_similar_movies, calculate_semantic_similarity
import os
import re
from typing import List, Dict, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE = "https://api.themoviedb.org/3"

# Caches
tmdb_cache = TTLCache(maxsize=1000, ttl=3600)
recommendation_cache = TTLCache(maxsize=500, ttl=1800)


@cached(cache=tmdb_cache)
def _tmdb_get_cached(path: str, params_tuple: tuple) -> Optional[dict]:
    """Call TMDB API with cached wrapper. params_tuple is a tuple of sorted items to be hashable."""
    from app.http_client import safe_get
    import os
    params = dict(params_tuple)
    params["api_key"] = os.getenv("TMDB_API_KEY")
    try:
        resp = safe_get(f"{TMDB_BASE}{path}", params=params)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"TMDB FAIL {resp.status_code} on {path}")
    except Exception as e:
        logger.error("TMDB request failed: %s", e)
    return None

def tmdb_get_wrapper(path: str, params: dict = None) -> Optional[dict]:
    if params is None:
        params = {}
    return _tmdb_get_cached(path, tuple(sorted(params.items())))

def _movie_to_tfidf_text(movie: dict) -> str:
    """Convert a TMDB movie dict into a text string for TF-IDF vectorization.
    Focuses on non-repeated lexical terms."""
    parts = []
    
    title = movie.get("title") or movie.get("name", "")
    original_title = movie.get("original_title") or movie.get("original_name", "")
    if title: parts.append(title)
    if original_title and original_title != title: parts.append(original_title)
    
    genres = movie.get("genres")
    if genres and isinstance(genres, list):
        if isinstance(genres[0], dict):
            parts.append(" ".join(g["name"] for g in genres))
        else:
            parts.append(" ".join(str(g) for g in genres))
            
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
        
    keywords_data = movie.get("keywords")
    if keywords_data and isinstance(keywords_data, dict):
        kw_list = keywords_data.get("keywords", [])
        if kw_list:
            kw_text = " ".join(k["name"] for k in kw_list if k.get("name"))
            if kw_text:
                parts.append(kw_text)  # No artificial *3 repetition!
                
    overview = movie.get("overview", "")
    if overview: parts.append(overview)
    
    tagline = movie.get("tagline", "")
    if tagline: parts.append(tagline)
    return " ".join(parts).strip() or movie.get("title", movie.get("name", ""))

def _movie_to_semantic_text(movie: dict) -> str:
    """Convert a TMDB movie dict into a natural language sentence for Sentence Transformer embedding.
    EXCLUDES title and exact cast names to avoid sequel/franchise clustering."""
    parts = []
    
    genres = movie.get("genres")
    genre_str = ""
    if genres and isinstance(genres, list):
        if isinstance(genres[0], dict):
            genre_str = ", ".join(g["name"] for g in genres)
        else:
            genre_str = ", ".join(str(g) for g in genres)
    elif movie.get("genre_ids"):
        genre_id_map = {
            28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
            80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
            14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
            9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
            10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
        }
        genre_str = ", ".join(genre_id_map.get(gid, "") for gid in movie.get("genre_ids") if genre_id_map.get(gid))
        
    if genre_str:
        parts.append(f"Genres: {genre_str}.")
        
    keywords_data = movie.get("keywords")
    if keywords_data and isinstance(keywords_data, dict):
        kw_list = keywords_data.get("keywords", [])
        if kw_list:
            kw_text = ", ".join(k["name"] for k in kw_list if k.get("name"))
            if kw_text:
                parts.append(f"Themes: {kw_text}.")
                
    overview = movie.get("overview", "")
    if overview:
        parts.append(f"Plot: {overview}")
        
    return " ".join(parts).strip()


def _fetch_movie_details(tmdb_id: int) -> Optional[dict]:
    """Fetch full movie/TV details from TMDB."""
    data = tmdb_get_wrapper(f"/movie/{tmdb_id}", {"language": "en-US", "append_to_response": "credits,keywords"})
    if not data or data.get("success") == False:
        data = tmdb_get_wrapper(f"/tv/{tmdb_id}", {"language": "en-US", "append_to_response": "credits,keywords"})
        if data and data.get("id"):
            data["media_type"] = "tv"
            
    if data and data.get("id") and "media_type" not in data:
        data["media_type"] = "movie"
        
    return data if (data and data.get("id")) else None


def _fetch_candidates(tmdb_id: int, seed_details: dict = None, limit: int = 1000) -> list:
    """Fetch broad candidate pool from TMDB using multiple discovery methods."""
    candidates = {}
    details = seed_details or _fetch_movie_details(tmdb_id)
    if not details:
        return []

    # 1. TMDB recommendations & similar (Pages 1-3)
    mtype = details.get("media_type", "movie")
    for endpoint in ["recommendations", "similar"]:
        for page in (1, 2, 3):
            data = tmdb_get_wrapper(f"/{mtype}/{tmdb_id}/{endpoint}", {"language": "en-US", "page": page})
            if not data or not data.get("results"):
                break
            for m in data["results"]:
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    candidates[m["id"]] = m

    # 2. Keyword Discovery
    kw_key = "results" if mtype == "tv" else "keywords"
    keywords = details.get("keywords", {}).get(kw_key, [])
    if keywords:
        kw_str = "|".join(str(k["id"]) for k in keywords[:5])
        for page in (1, 2):
            data = tmdb_get_wrapper(f"/discover/{mtype}", {
                "language": "en-US",
                "with_keywords": kw_str,
                "sort_by": "popularity.desc",
                "page": page
            })
            if data and data.get("results"):
                for m in data["results"]:
                    if m["id"] != tmdb_id and m["id"] not in candidates:
                        candidates[m["id"]] = m

    # 3. Cast/Crew Discovery
    credits = details.get("credits", {})
    cast = credits.get("cast", [])
    crew = credits.get("crew", [])
    
    if cast:
        cast_str = "|".join(str(c["id"]) for c in cast[:3])
        for page in (1, 2, 3):
            data = tmdb_get_wrapper(f"/discover/{mtype}", {
                "language": "en-US",
                "with_cast": cast_str,
                "sort_by": "popularity.desc",
                "page": page
            })
            if data and data.get("results"):
                for m in data["results"]:
                    if m["id"] != tmdb_id and m["id"] not in candidates:
                        candidates[m["id"]] = m
                    
    directors = [c for c in crew if c.get("job") == "Director" or c.get("job") == "Executive Producer"]
    if directors:
        dir_str = "|".join(str(d["id"]) for d in directors[:2])
        data = tmdb_get_wrapper(f"/discover/{mtype}", {
            "language": "en-US",
            "with_crew": dir_str,
            "sort_by": "popularity.desc",
            "page": 1
        })
        if data and data.get("results"):
            for m in data["results"]:
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    m["media_type"] = mtype
                    candidates[m["id"]] = m

    # 4. Same language + genre discovery
    original_language = details.get("original_language")
    if original_language and original_language != "en" and details.get("genres"):
        genre_ids = "|".join(str(g["id"]) for g in details["genres"][:2])
        for page in (1, 2, 3):
            data = tmdb_get_wrapper(f"/discover/{mtype}", {
                "language": "en-US",
                "with_original_language": original_language,
                "with_genres": genre_ids,
                "sort_by": "popularity.desc",
                "vote_count.gte": 20,
                "page": page
            })
            if not data or not data.get("results"):
                break
            for m in data["results"]:
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    m["media_type"] = mtype
                    candidates[m["id"]] = m

    # 5. Same language broad fallback
    if original_language and original_language != "en":
        for page in (1, 2):
            data = tmdb_get_wrapper(f"/discover/{mtype}", {
                "language": "en-US",
                "with_original_language": original_language,
                "sort_by": "popularity.desc",
                "vote_count.gte": 100,
                "page": page
            })
            if not data or not data.get("results"):
                break
            for m in data["results"]:
                if m["id"] != tmdb_id and m["id"] not in candidates:
                    m["media_type"] = mtype
                    candidates[m["id"]] = m

    return list(candidates.values())



def _extract_year(date_str: str) -> Optional[int]:
    """Safely extract the year from a TMDB release_date like '2013-05-31'."""
    if not date_str:
        return None
    try:
        return int(date_str[:4])
    except (ValueError, IndexError):
        return None

def _is_direct_sequel(seed: dict, cand: dict) -> bool:
    if not cand.get("poster_path"):
        return False
        
    seed_date_str = seed.get("release_date") or ""
    cand_date_str = cand.get("release_date") or ""
    
    if not seed_date_str or not cand_date_str:
        return False
        
    if cand_date_str <= seed_date_str:
        return False
        
    seed_title = seed.get("title", "").strip().lower()
    cand_title = cand.get("title", "").strip().lower()
    
    if cand_title.startswith(seed_title):
        return True
        
    seed_col = seed.get("belongs_to_collection", {})
    cand_col = cand.get("belongs_to_collection", {})
    
    if seed_col and cand_col and seed_col.get("id") == cand_col.get("id"):
        def get_significant_words(title):
            words = set(re.findall(r'\b\w+\b', title))
            stop_words = {"the", "a", "an", "and", "or", "of", "in", "to", "for", "with", "on", "at", "by", "from"}
            return words - stop_words
            
        seed_words = get_significant_words(seed_title)
        cand_words = get_significant_words(cand_title)
        
        if seed_words & cand_words:
            return True
            
        col_name = seed_col.get("name", "").lower()
        col_words = get_significant_words(col_name)
        if (seed_words & col_words) or (cand_words & col_words):
            return True

    return False

def _find_direct_sequel(seed_details: dict, candidates: list) -> Optional[dict]:
    sequels = [cand for cand in candidates if _is_direct_sequel(seed_details, cand)]
    if sequels:
        # Pick the chronologically earliest sequel among valid ones
        sequels.sort(key=lambda x: x.get("release_date") or "9999-99-99")
        return sequels[0]
    return None

def _extract_directors(movie_details: dict) -> set:
    """Extract director names from TMDB credits."""
    credits = movie_details.get("credits", {})
    crew = credits.get("crew", [])
    directors = [c.get("name") for c in crew if c.get("job") == "Director" and c.get("name")]
    return set(directors)

def _extract_cast(movie_details: dict) -> set:
    credits = movie_details.get("credits", {})
    cast = credits.get("cast", [])
    actors = [c.get("name") for c in cast if c.get("name")]
    return set(actors[:15])  # Top 15 cast

def _extract_genres(movie_details: dict) -> set:
    genres = movie_details.get("genres", [])
    if genres and isinstance(genres, list):
        if isinstance(genres[0], dict):
            return set(g.get("name") for g in genres if g.get("name"))
        else:
            # Fallback if it's just ID list
            genre_id_map = {
                28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
                80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
                14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
                9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
                10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
            }
            return set(genre_id_map.get(gid) for gid in genres if genre_id_map.get(gid))
    return set()


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
    search_data = tmdb_get_wrapper("/search/movie", {"query": title, "language": "en-US", "page": 1})
    if not search_data or not search_data.get("results"):
        return {"recommendations": [], "strategy": "title_not_found", "selected_title": None}

    seed_movie = search_data["results"][0]
    tmdb_id = seed_movie["id"]

    return recommend_by_id(tmdb_id, top_n=top_n)

@cached(cache=recommendation_cache)
def _recommend_by_id_cached(tmdb_id: int, top_n: int = 10, user_id: int = None, db=None) -> Dict:
    cache_key = f"{tmdb_id}_{top_n}_{user_id}"
    if cache_key in recommendation_cache:
        logger.info("[HYBRID] CACHE HIT tmdb_id=%s user_id=%s", tmdb_id, user_id)
        return recommendation_cache[cache_key]

    t0 = time.time()
    res = _recommend_by_id_impl(tmdb_id, top_n, user_id, db)
    logger.info("[HYBRID] COMPLETED  tmdb_id=%s  recs=%d  latency=%.2fs",
                tmdb_id, len(res.get("recommendations", [])), time.time() - t0)
    recommendation_cache[cache_key] = res
    return res

def recommend_by_id(tmdb_id: int, top_n: int = 10, user_id: int = None, db=None) -> Dict:
    """Wrapper to enable caching while keeping the same interface."""
    return _recommend_by_id_cached(tmdb_id, top_n, user_id, db)

def _recommend_by_id_impl(tmdb_id: int, top_n: int = 10, user_id: int = None, db=None) -> Dict:
    """
    Get TF-IDF + cosine similarity recommendations for a TMDB ID.

    1. Fetch seed movie details from TMDB
    2. Fetch candidate movies from TMDB
    3. Hard-filter candidates to the seed's original_language
    4. Vectorize seed + candidates with TF-IDF (fit fresh per request)
    5. Rank by cosine similarity
    """
    import time
    t_impl = time.time()
    
    user_prefs = None
    if user_id and db:
        from app.models import User
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user_prefs = {
                "favorite_directors": set([d.lower().strip() for d in (user.favorite_directors or [])]),
                "favorite_actors": set([a.lower().strip() for a in (user.favorite_actors or [])]),
                "favorite_genres": set([g.lower().strip() for g in (user.favorite_genres or [])]),
                "preferred_content_type": (user.preferred_content_type or "").lower().strip(),
                "preferred_regional_languages": set([l.lower().strip() for l in (user.preferred_regional_languages or [])]),
                "preferred_release_era": (user.preferred_release_era or "").lower().strip(),
            }

    # Fetch seed movie details
    seed_details = _fetch_movie_details(tmdb_id)
    if not seed_details:
        logger.warning("[HYBRID] seed not found  tmdb_id=%s", tmdb_id)
        return {"recommendations": [], "strategy": "seed_not_found", "selected_title": None}

    selected_title = seed_details.get("title", seed_details.get("name", ""))
    seed_language = seed_details.get("original_language")
    logger.info("[HYBRID] seed='%s'  lang=%s  tmdb_id=%s", selected_title, seed_language, tmdb_id)

    # Fetch candidate movies from TMDB
    tmdb_candidates = _fetch_candidates(tmdb_id, seed_details=seed_details, limit=250)
    logger.info("[HYBRID] tmdb_candidates=%d  tmdb_id=%s", len(tmdb_candidates), tmdb_id)

    # Build text representation for seed
    seed_text_semantic = _movie_to_semantic_text(seed_details)
    seed_text_tfidf = _movie_to_tfidf_text(seed_details)

    # Fetch FAISS semantic candidates
    try:
        seed_embedding = generate_embedding(seed_text_semantic)
        faiss_results = query_similar_movies(seed_embedding, top_k=200)
        logger.info("[HYBRID] faiss_results=%d  tmdb_id=%s", len(faiss_results), tmdb_id)
    except Exception as e:
        logger.warning("[HYBRID] FAISS failed  tmdb_id=%s  error=%s", tmdb_id, e)
        faiss_results = []
        seed_embedding = None
        
    # Merge candidates
    candidates_dict = {m["id"]: m for m in tmdb_candidates}
    for m in tmdb_candidates:
        m["retrieval_source"] = "tmdb"
        
    faiss_scores = {tid: score for tid, score in faiss_results}
    missing_faiss_ids = [tid for tid in faiss_scores.keys() if tid not in candidates_dict]
    
    import concurrent.futures
    def fetch_basic(tid):
        return tid, _fetch_movie_details(tid)
        
    if missing_faiss_ids:
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            for tid, details in executor.map(fetch_basic, missing_faiss_ids):
                if details:
                    details["retrieval_source"] = "faiss"
                    candidates_dict[tid] = details
                    
    for tid in faiss_scores.keys():
        if tid in candidates_dict:
            if candidates_dict[tid].get("retrieval_source") == "tmdb":
                candidates_dict[tid]["retrieval_source"] = "both"
            candidates_dict[tid]["faiss_score"] = faiss_scores[tid]
            
    if tmdb_id in candidates_dict:
        del candidates_dict[tmdb_id]
    candidates = list(candidates_dict.values())
    
    from app.ml_model_v2.semantic_search import add_movie_to_index, _indexed_ids
    
    unindexed = [m for m in candidates if m["id"] not in _indexed_ids]
    if unindexed:
        def fetch_full_and_add(cands):
            for cand in cands:
                full_cand = _fetch_movie_details(cand["id"])
                if full_cand:
                    add_movie_to_index(cand["id"], full_cand)
        # Background thread so we don't block the API or trigger 429s during request
        threading.Thread(target=fetch_full_and_add, args=(unindexed,), daemon=True).start()

    if not candidates:
        return {"recommendations": [], "strategy": "no_candidates", "selected_title": selected_title}

    # Language is now a soft feature, no hard filter applied.

    # LIVE SEMANTIC SCORING (For ALL candidates, including live TMDB ones)
    if seed_embedding is not None:
        cand_semantic_texts = [_movie_to_semantic_text(m) for m in candidates]
        live_scores = calculate_semantic_similarity(seed_embedding, cand_semantic_texts)
        for i, cand in enumerate(candidates):
            cand["faiss_score"] = float(live_scores[i])

    # TF-IDF on lightweight metadata (Fast Pass)
    candidate_texts_tfidf = [_movie_to_tfidf_text(m) for m in candidates]
    all_texts = [seed_text_tfidf] + candidate_texts_tfidf
    vectorizer = TfidfVectorizer(stop_words="english", max_features=10000)
    tfidf_matrix = vectorizer.fit_transform(all_texts)
    
    seed_vector = tfidf_matrix[0:1]
    candidate_matrix = tfidf_matrix[1:]
    
    similarities = cosine_similarity(seed_vector, candidate_matrix)[0]
    
    for i, cand in enumerate(candidates):
        cand["lightweight_similarity"] = float(similarities[i])
        
    # Union-based Selection: Top 30 TF-IDF + Top 30 FAISS
    candidates_sorted_tfidf = sorted(candidates, key=lambda x: x["lightweight_similarity"], reverse=True)
    top_tfidf = candidates_sorted_tfidf[:30]
    
    candidates_sorted_faiss = sorted(candidates, key=lambda x: x.get("faiss_score", 0.0), reverse=True)
    top_faiss = candidates_sorted_faiss[:30]
    
    top_candidates_dict = {m["id"]: m for m in top_tfidf}
    for m in top_faiss:
        top_candidates_dict[m["id"]] = m
        
    top_candidates = list(top_candidates_dict.values())
    
    # Concurrently fetch full details for top candidates
    def fetch_full(cand):
        full = _fetch_movie_details(cand["id"])
        if full:
            cand.update(full)
        return cand

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        list(executor.map(fetch_full, top_candidates))
        
    # Full TF-IDF Pass on Top candidates
    full_candidate_texts = [_movie_to_tfidf_text(m) for m in top_candidates]
    full_all_texts = [seed_text_tfidf] + full_candidate_texts
    full_vectorizer = TfidfVectorizer(stop_words="english", max_features=10000)
    full_tfidf_matrix = full_vectorizer.fit_transform(full_all_texts)
    
    full_seed_vector = full_tfidf_matrix[0:1]
    full_candidate_matrix = full_tfidf_matrix[1:]
    full_similarities = cosine_similarity(full_seed_vector, full_candidate_matrix)[0]
    
    tfidf_scores = {cand["id"]: float(full_similarities[i]) for i, cand in enumerate(top_candidates)}
    
    # Dynamic Semantic Scoring for ALL Top candidates (Full Text)
    if seed_embedding is not None:
        full_semantic_texts = [_movie_to_semantic_text(m) for m in top_candidates]
        semantic_scores = calculate_semantic_similarity(seed_embedding, full_semantic_texts)
        for i, cand in enumerate(top_candidates):
            cand["semantic_score"] = float(semantic_scores[i])
    else:
        for cand in top_candidates:
            cand["semantic_score"] = cand.get("faiss_score", 0.0)
    
    # Run XGBoost scoring
    from app.ml_model_v2.xgboost_ranker import score_candidates
    from app.config import XGBOOST_WEIGHT
    import numpy as np
    
    top_candidates = score_candidates(seed_details, top_candidates, tfidf_scores)
    
    # Calculate final hybrid score
    max_tfidf = max(tfidf_scores.values()) if tfidf_scores else 1.0
    if max_tfidf == 0.0:
        max_tfidf = 1.0
        
    seed_directors = _extract_directors(seed_details)
        
    for cand in top_candidates:
        tf_score = tfidf_scores.get(cand["id"], 0.0)
        xgb_score = cand.get("xgboost_score", 0.0)
        norm_tfidf = tf_score / max_tfidf
        sem_score = cand.get("semantic_score", 0.0)
        
        pop = cand.get("popularity", 0.0)
        pop_norm = min(np.log1p(pop) / 7.0, 1.0)
        vote = cand.get("vote_average", 0.0)
        vote_norm = vote / 10.0
        
        cand["tf_norm"] = norm_tfidf
        cand["pop_norm"] = pop_norm
        cand["vote_norm"] = vote_norm
        
        # New Bayesian Rating
        v = cand.get("vote_count", 0.0)
        R = cand.get("vote_average", 0.0)
        m = 50.0 # Prior weight
        C = 6.5 # Global average assumption
        bayesian_rating = ((v / (v + m)) * R + (m / (v + m)) * C)
        cand["bayesian_rating"] = bayesian_rating
        vote_norm = bayesian_rating / 10.0
        
        # Language Match Feature
        lang_match = 1.0 if cand.get("original_language") == seed_language else 0.0
        cand["language_match"] = lang_match
        
        if xgb_score == 0.0:
            # Fallback Redesign
            # High weight on semantics & TF-IDF, medium on language/rating, low on popularity
            base_score = (
                (0.40 * sem_score) +
                (0.25 * norm_tfidf) +
                (0.15 * lang_match) +
                (0.12 * vote_norm) +
                (0.10 * pop_norm)
            )
        else:
            base_score = (XGBOOST_WEIGHT * xgb_score) + ((1.0 - XGBOOST_WEIGHT) * norm_tfidf)
            
        # Director Match Boost
        cand_directors = _extract_directors(cand)
        director_match = 1.0 if seed_directors and cand_directors and not seed_directors.isdisjoint(cand_directors) else 0.0
        cand["director_match"] = director_match
        
        if director_match == 1.0:
            base_score += 0.05
            logger.info(
                "\nSeed: %s\nSeed Director(s): %s\nCandidate: %s\nCandidate Director(s): %s\nDirector Match: 1\nDirector Boost: +0.05\n",
                seed_details.get("title"), list(seed_directors), cand.get("title"), list(cand_directors)
            )
            
        # Temporal Relevance Penalty
        # Movies from the same era or newer are preferred. 
        # Older movies receive a smooth exponential penalty.
        seed_year = _extract_year(seed_details.get("release_date", ""))
        cand_year = _extract_year(cand.get("release_date", ""))
        
        temporal_penalty = 1.0
        year_diff = 0
        if seed_year and cand_year:
            year_diff = cand_year - seed_year
            abs_diff = abs(year_diff)
            
            if year_diff < 0:
                # Candidate is older. Harsher penalty (halflife ~ 17 years)
                temporal_penalty = np.exp(-abs_diff / 20.0)
            else:
                # Candidate is newer. Gentle penalty (halflife ~ 35 years)
                temporal_penalty = np.exp(-abs_diff / 50.0)
                
            # Floor the penalty so an exceptionally good old movie can still surface
            temporal_penalty = max(0.5, temporal_penalty)
            
        cand["year_difference"] = abs(cand_year - seed_year) if (seed_year and cand_year) else None
        cand["temporal_penalty"] = round(temporal_penalty, 4)
        
        # --- User Preference Boosts ---
        pref_boost = 0.0
        if user_prefs:
            # Director Boost
            if user_prefs.get("favorite_directors") and cand_directors:
                cand_dirs_lower = set([d.lower().strip() for d in cand_directors])
                if not user_prefs["favorite_directors"].isdisjoint(cand_dirs_lower):
                    pref_boost += 0.08
                    
            # Actor Boost
            cand_cast = _extract_cast(cand)
            if user_prefs.get("favorite_actors") and cand_cast:
                cand_cast_lower = set([c.lower().strip() for c in cand_cast])
                if not user_prefs["favorite_actors"].isdisjoint(cand_cast_lower):
                    pref_boost += 0.06
                    
            # Genre Boost
            cand_genres = _extract_genres(cand)
            if user_prefs.get("favorite_genres") and cand_genres:
                cand_genres_lower = set([g.lower().strip() for g in cand_genres])
                if not user_prefs["favorite_genres"].isdisjoint(cand_genres_lower):
                    pref_boost += 0.04
            
            # Content Type Match / Downrank
            pref_type = user_prefs.get("preferred_content_type")
            cand_type = cand.get("media_type", "movie").lower()
            if pref_type and pref_type in ["movie", "movies", "tv", "series"]:
                # If they explicitly prefer movie/tv, downrank the opposite
                if (pref_type in ["movie", "movies"] and cand_type == "tv") or \
                   (pref_type in ["tv", "series"] and cand_type == "movie"):
                    pref_boost -= 0.15
                    
            # Regional Language Boost
            if user_prefs.get("preferred_regional_languages") and cand.get("original_language"):
                if cand.get("original_language").lower() in user_prefs["preferred_regional_languages"]:
                    pref_boost += 0.05
                    
        cand["final_score"] = (base_score + pref_boost) * temporal_penalty
            
        cand["similarity"] = tf_score # keeping this for fallback/transparency
        
    # ── Franchise / Sequel Detection ──────────────────────────────────────
    # Scan the wide candidate pool (prior to truncation) for a valid direct sequel
    sequel_candidate = _find_direct_sequel(seed_details, top_candidates)
    
    if sequel_candidate:
        logger.info(
            "[HYBRID] sequel detected  seed=%s  next=%s (%s)",
            tmdb_id, sequel_candidate.get("id"), sequel_candidate.get("title")
        )
        # Pull it out of the normal candidate pool so it doesn't duplicate
        top_candidates = [c for c in top_candidates if c["id"] != sequel_candidate["id"]]

    # Tag every candidate with franchise membership (informational)
    seed_collection = seed_details.get("belongs_to_collection", {})
    seed_collection_id = seed_collection.get("id") if seed_collection else None
    
    for cand in top_candidates:
        cand_collection = cand.get("belongs_to_collection", {})
        cand_collection_id = cand_collection.get("id") if cand_collection else None
        cand["is_same_franchise"] = bool(
            seed_collection_id and cand_collection_id == seed_collection_id
        )

    # Rank by final_score (normal hybrid ranking)
    top_candidates.sort(key=lambda x: x["final_score"], reverse=True)
    
    # ── Helper to build a recommendation dict from a candidate ───────────
    def _build_rec(m, extra_reasons=None):
        reasons = extra_reasons or []
        if m.get("semantic_score", 0.0) > 0.7:
            reasons.append("Strong semantic match")
        if m.get("tf_norm", 0.0) > 0.6:
            reasons.append("Similar themes/keywords")
        if m.get("language_match") == 1.0:
            reasons.append("Same language")
        if m.get("bayesian_rating", 0.0) > 7.5:
            reasons.append("Highly rated")
        if m.get("temporal_penalty", 0.0) > 0.8:
            reasons.append("Similar era")
        if m.get("director_match") == 1.0:
            reasons.append("Same director")
        return {
            "id": m["id"],
            "title": m.get("title") or m.get("name", ""),
            "tmdb_id": m["id"],
            "overview": m.get("overview", ""),
            "poster_path": m.get("poster_path"),
            "vote_average": m.get("vote_average", 0),
            "bayesian_rating": round(m.get("bayesian_rating", 0.0), 2),
            "release_date": m.get("release_date", ""),
            "media_type": "movie",
            "similarity": round(m.get("similarity", 0.0), 4),
            "semantic_score": round(m.get("semantic_score", 0.0), 4),
            "xgboost_score": round(m.get("xgboost_score", 0.0), 4),
            "temporal_penalty": round(m.get("temporal_penalty", 1.0), 4),
            "final_score": round(m.get("final_score", 0.0), 4),
            "reasons": reasons,
            "is_same_franchise": m.get("is_same_franchise", False),
        }

    recommendations = []
    used_ids = {tmdb_id}  # always exclude the seed movie

    # ── Rank #1: Direct sequel / next installment (if found) ───────────
    if sequel_candidate and sequel_candidate.get("poster_path"):
        recommendations.append(
            _build_rec(sequel_candidate, extra_reasons=["Next in franchise"])
        )
        used_ids.add(sequel_candidate["id"])

    # ── Ranks #2–5 (or #1–5 if no sequel): normal hybrid ranking ───────
    for m in top_candidates:
        if m["id"] in used_ids or not m.get("poster_path"):
            continue
        recommendations.append(_build_rec(m))
        used_ids.add(m["id"])
        if len(recommendations) >= top_n:
            break

    logger.info("Hybrid XGBoost: %d recommendations for '%s' (tmdb_id=%d)", len(recommendations), selected_title, tmdb_id)

    return {
        "recommendations": recommendations,
        "strategy": "tfidf-xgboost-hybrid",
        "selected_title": selected_title,
    }


def get_similar_by_tmdb_id(tmdb_id: int, top_n: int = 10) -> List[Dict]:
    """
    Find similar movies by TMDB ID using live TF-IDF + cosine similarity.
    Returns list of dicts with movie metadata + similarity score.
    """
    result = recommend_by_id(tmdb_id, top_n=top_n)
    return result.get("recommendations", [])