"""
Naive Bayes Mood Classifier — classifies movies by emotional mood.
Uses MultinomialNB on TF-IDF features of movie overviews + genres.
"""

import logging
import pickle
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent
NB_MODEL_PATH = MODEL_DIR / "naive_bayes.pkl"

# Mood → keyword patterns for labeling training data
MOOD_KEYWORDS = {
    "happy": ["comedy", "funny", "laugh", "fun", "family", "animated", "animation",
              "musical", "cheerful", "joy", "humor", "hilarious", "heartwarming",
              "uplifting", "feel-good", "celebration", "party", "adventure"],
    "sad": ["drama", "tragic", "death", "loss", "grief", "tear", "sorrow",
            "emotional", "heartbreak", "devastating", "melancholy", "funeral",
            "farewell", "sacrifice", "suffering", "war", "poverty"],
    "tense": ["thriller", "horror", "mystery", "crime", "suspense", "danger",
              "killer", "detective", "murder", "stalker", "psycho", "chase",
              "escape", "hostage", "serial", "paranoia", "fear", "terror"],
    "nostalgic": ["coming-of-age", "childhood", "memory", "friendship", "school",
                  "teenager", "youth", "growing up", "reunion", "hometown",
                  "summer", "classic", "retro", "vintage", "reminisce"],
    "adventurous": ["action", "adventure", "science fiction", "fantasy", "hero",
                    "epic", "quest", "battle", "warrior", "expedition", "journey",
                    "exploration", "superhero", "space", "pirate", "treasure"],
    "romantic": ["romance", "love", "relationship", "couple", "wedding", "passion",
                 "kiss", "affair", "heart", "soulmate", "devotion", "intimate",
                 "charming", "date", "sweetheart", "Valentine"],
    "thoughtful": ["documentary", "philosophy", "political", "society", "human",
                   "moral", "existential", "cerebral", "intellectual", "debate",
                   "experiment", "psychology", "consciousness", "ethics", "dilemma"],
}

# Lazy-loaded model
_classifier = None
_vectorizer = None
_classes = None


def _load_model() -> bool:
    global _classifier, _vectorizer, _classes
    if _classifier is not None:
        return True

    if not NB_MODEL_PATH.exists():
        logger.warning("Naive Bayes model not found at %s — using fallback", NB_MODEL_PATH)
        return False

    try:
        with open(NB_MODEL_PATH, "rb") as f:
            data = pickle.load(f)
        _classifier = data["classifier"]
        _vectorizer = data["vectorizer"]
        _classes = data["classes"]
        logger.info("Naive Bayes mood classifier loaded (%d classes)", len(_classes))
        return True
    except Exception as e:
        logger.error("Failed to load Naive Bayes model: %s", e)
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def classify_mood(overview: str) -> Dict[str, float]:
    """Classify a movie's mood based on its overview. Returns mood → probability."""
    if not overview:
        return {mood: 1.0 / len(MOOD_KEYWORDS) for mood in MOOD_KEYWORDS}

    if _load_model():
        try:
            X = _vectorizer.transform([overview.lower()])
            probs = _classifier.predict_proba(X)[0]
            return {cls: float(prob) for cls, prob in zip(_classes, probs)}
        except Exception as e:
            logger.error("NB classification failed: %s", e)

    return _fallback_classify(overview)


def predict_mood(overview: str) -> str:
    """Return the single best mood for a movie."""
    probs = classify_mood(overview)
    return max(probs, key=probs.get)


def get_mood_recommendations(mood: str, movies_data: List[Dict], top_n: int = 10) -> List[Tuple[int, float]]:
    """
    Return top_n (tmdb_id, score) for movies matching the given mood.
    Uses NB classifier if available, else keyword fallback.
    """
    if not movies_data:
        return []

    if _load_model():
        try:
            overviews = [m.get("overview", "") or "" for m in movies_data]
            X = _vectorizer.transform([o.lower() for o in overviews])
            probs = _classifier.predict_proba(X)
            mood_idx = list(_classes).index(mood)
            mood_scores = probs[:, mood_idx]

            indexed = [(i, float(mood_scores[i])) for i in range(len(movies_data))]
            indexed.sort(key=lambda x: x[1], reverse=True)

            return [
                (movies_data[i].get("tmdb_id") or movies_data[i].get("id"), score)
                for i, score in indexed[:top_n]
            ]
        except Exception as e:
            logger.error("NB mood recommendation failed: %s", e)

    return _fallback_mood_movies(mood, movies_data, top_n)


# ---------------------------------------------------------------------------
# Fallbacks (keyword-based)
# ---------------------------------------------------------------------------

def _fallback_classify(overview: str) -> Dict[str, float]:
    text_lower = overview.lower()
    scores = {}
    for mood, keywords in MOOD_KEYWORDS.items():
        scores[mood] = sum(1 for kw in keywords if kw in text_lower)
    total = sum(scores.values()) or 1
    return {mood: s / total for mood, s in scores.items()}


def _fallback_mood_movies(mood: str, movies_data: List[Dict], top_n: int) -> List[Tuple[int, float]]:
    keywords = MOOD_KEYWORDS.get(mood, [])
    scored = []
    for m in movies_data:
        overview = (m.get("overview", "") or "").lower()
        genres = " ".join(m.get("genres") or []).lower()
        combined = overview + " " + genres
        score = sum(1 for kw in keywords if kw in combined)
        tmdb_id = m.get("tmdb_id") or m.get("id")
        scored.append((tmdb_id, float(score)))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_n]


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _label_movie(overview: str, genres: List[str]) -> str:
    """Assign a mood label to a movie based on keywords in overview + genres."""
    combined = (overview + " " + " ".join(genres)).lower()
    best_mood = "thoughtful"
    best_score = 0

    for mood, keywords in MOOD_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in combined)
        if score > best_score:
            best_score = score
            best_mood = mood

    return best_mood


def build_and_save_model(movies_data: List[Dict]):
    """Train Naive Bayes model from movie data and save to disk."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.naive_bayes import MultinomialNB

    if not movies_data:
        logger.error("No movie data to train Naive Bayes")
        return

    # Build labeled dataset
    texts = []
    labels = []

    for m in movies_data:
        overview = m.get("overview", "") or ""
        genres = m.get("genres") or []

        if not overview.strip():
            continue

        combined = overview + " " + " ".join(genres)
        texts.append(combined.lower())
        labels.append(_label_movie(overview, genres))

    if len(texts) < 20:
        logger.error("Not enough data for NB training (%d samples)", len(texts))
        return

    # TF-IDF
    vectorizer = TfidfVectorizer(
        max_features=3000,
        stop_words="english",
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.95,
    )
    X = vectorizer.fit_transform(texts)

    # Train NB
    nb = MultinomialNB(alpha=0.1)
    nb.fit(X, labels)

    classes = list(nb.classes_)

    # Save
    model_data = {
        "classifier": nb,
        "vectorizer": vectorizer,
        "classes": classes,
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(NB_MODEL_PATH, "wb") as f:
        pickle.dump(model_data, f)

    # Report distribution
    from collections import Counter
    dist = Counter(labels)
    logger.info("✅ Naive Bayes model saved: %d samples, %d classes | Distribution: %s",
                len(texts), len(classes), dict(dist))
