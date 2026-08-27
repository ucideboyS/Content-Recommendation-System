import datetime

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

def get_genres(movie: dict) -> set:
    """Extract genre IDs or names as a set."""
    genres = movie.get("genres")
    if genres and isinstance(genres, list):
        if isinstance(genres[0], dict):
            return {str(g.get("id", g.get("name"))) for g in genres}
        else:
            return {str(g) for g in genres}
    
    genre_ids = movie.get("genre_ids")
    if genre_ids and isinstance(genre_ids, list):
        return {str(g) for g in genre_ids}
    
    return set()

def get_year(release_date: str) -> int:
    if release_date and isinstance(release_date, str) and len(release_date) >= 4:
        try:
            return int(release_date[:4])
        except ValueError:
            pass
    return 2000 # fallback

def extract_features(seed_movie: dict, candidate_movie: dict, tfidf_similarity: float) -> dict:
    """
    Extract features for XGBoost model.
    seed_movie: The user's highly rated movie.
    candidate_movie: The movie being considered for recommendation.
    tfidf_similarity: The TF-IDF cosine similarity between the two.
    """
    
    # 1. TF-IDF Similarity
    features = {
        "tfidf_similarity": safe_float(tfidf_similarity)
    }
    
    # 2. Genre Similarity (Jaccard)
    seed_genres = get_genres(seed_movie)
    cand_genres = get_genres(candidate_movie)
    
    if seed_genres and cand_genres:
        intersection = len(seed_genres.intersection(cand_genres))
        union = len(seed_genres.union(cand_genres))
        features["genre_similarity"] = intersection / union if union > 0 else 0.0
    else:
        features["genre_similarity"] = 0.0
        
    seed_lang = seed_movie.get("original_language", "en")
    cand_lang = candidate_movie.get("original_language", "en")
    features["language_match"] = 1.0 if seed_lang == cand_lang else 0.0
    
    # 4. Semantic Similarity (FAISS + SentenceTransformer)
    features["semantic_similarity"] = safe_float(candidate_movie.get("semantic_score", 0.0))
    
    # 4. TMDB Metadata
    features["tmdb_vote_average"] = safe_float(candidate_movie.get("vote_average", 0.0))
    features["tmdb_popularity"] = safe_float(candidate_movie.get("popularity", 0.0))
    features["tmdb_vote_count"] = safe_float(candidate_movie.get("vote_count", 0.0))
    
    # 5. Release Year / Age
    cand_year = get_year(candidate_movie.get("release_date", ""))
    current_year = datetime.datetime.now().year
    features["movie_age"] = max(0, current_year - cand_year)
    
    seed_year = get_year(seed_movie.get("release_date", ""))
    features["year_diff"] = abs(seed_year - cand_year)
    
    # 6. Cast Overlap (if available)
    def get_cast(movie):
        credits = movie.get("credits", {})
        if isinstance(credits, dict) and "cast" in credits:
            return {c.get("id") for c in credits["cast"][:10] if c.get("id")}
        return set()
        
    seed_cast = get_cast(seed_movie)
    cand_cast = get_cast(candidate_movie)
    if seed_cast and cand_cast:
        features["cast_overlap"] = len(seed_cast.intersection(cand_cast))
    else:
        features["cast_overlap"] = 0.0
        
    # 7. Director Overlap (if available)
    def get_directors(movie):
        credits = movie.get("credits", {})
        if isinstance(credits, dict) and "crew" in credits:
            return {c.get("id") for c in credits["crew"] if c.get("job") == "Director"}
        return set()
        
    seed_directors = get_directors(seed_movie)
    cand_directors = get_directors(candidate_movie)
    if seed_directors and cand_directors:
        features["director_overlap"] = len(seed_directors.intersection(cand_directors))
    else:
        features["director_overlap"] = 0.0

    # 8. Keyword Similarity
    def get_keywords(movie):
        kw_data = movie.get("keywords", {})
        if isinstance(kw_data, dict) and "keywords" in kw_data:
            return {k.get("id") for k in kw_data["keywords"]}
        elif isinstance(kw_data, dict) and "results" in kw_data: # sometimes TV uses results
            return {k.get("id") for k in kw_data["results"]}
        return set()
        
    seed_kw = get_keywords(seed_movie)
    cand_kw = get_keywords(candidate_movie)
    if seed_kw and cand_kw:
        intersection = len(seed_kw.intersection(cand_kw))
        union = len(seed_kw.union(cand_kw))
        features["keyword_similarity"] = intersection / union if union > 0 else 0.0
    else:
        features["keyword_similarity"] = 0.0
        
    return features

def get_feature_names():
    """Return the ordered list of feature names to ensure consistent order."""
    return [
        "tfidf_similarity",
        "genre_similarity",
        "language_match",
        "tmdb_vote_average",
        "tmdb_popularity",
        "tmdb_vote_count",
        "movie_age",
        "year_diff",
        "cast_overlap",
        "director_overlap",
        "keyword_similarity"
    ]
