"""
Model Training Script — fetches data from DB (or TMDB), trains all 3 ML models.
Run: python -m app.ml_model.train_models
"""

import os
import sys
import logging

# Ensure parent path is available
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def get_training_data() -> list:
    """Load movie data from the database. Falls back to TMDB fetch if DB is empty."""
    from app.database import SessionLocal
    from app.models import Movie

    db = SessionLocal()
    movies = db.query(Movie).filter(Movie.overview != None, Movie.overview != "").all()  # noqa: E711

    if len(movies) < 50:
        logger.warning("Only %d movies in DB — populating from TMDB first...", len(movies))
        db.close()

        from app.services.tmdb_data_service import populate_database
        populate_database()

        db = SessionLocal()
        movies = db.query(Movie).filter(Movie.overview != None, Movie.overview != "").all()  # noqa: E711

    data = []
    for m in movies:
        data.append({
            "tmdb_id": m.tmdb_id,
            "title": m.title,
            "overview": m.overview or "",
            "genres": m.genres or [],
            "cast_names": m.cast_names or [],
            "director": m.director or "",
            "keywords": m.keywords or [],
            "popularity": m.popularity or 0,
            "vote_average": m.vote_average or 0,
            "media_type": m.media_type or "movie",
        })

    db.close()
    logger.info("Loaded %d movies for training", len(data))
    return data


def train_all():
    """Train all 3 ML models."""
    logger.info("=" * 60)
    logger.info("TRAINING ALL ML MODELS")
    logger.info("=" * 60)

    data = get_training_data()

    if len(data) < 20:
        logger.error("Not enough data to train models (%d movies). Aborting.", len(data))
        return

    # 1. Content-Based (TF-IDF + Cosine Similarity)
    logger.info("\n--- Training Content-Based Model ---")
    try:
        from app.ml_model.content_based import build_and_save_model as build_cb
        build_cb(data)
        logger.info("✅ Content-based model trained successfully")
    except Exception as e:
        logger.error("❌ Content-based training failed: %s", e)

    # 2. Naive Bayes (Mood Classifier)
    logger.info("\n--- Training Naive Bayes Mood Classifier ---")
    try:
        from app.ml_model.naive_bayes_model import build_and_save_model as build_nb
        build_nb(data)
        logger.info("✅ Naive Bayes model trained successfully")
    except Exception as e:
        logger.error("❌ Naive Bayes training failed: %s", e)

    # 3. Random Forest note — RF trains per-user at prediction time,
    #    so we don't pre-train it here. Just verify the module loads.
    logger.info("\n--- Verifying Random Forest Module ---")
    try:
        from app.ml_model.random_forest_model import build_features, FEATURE_NAMES
        logger.info("✅ Random Forest module loaded | Features: %s", FEATURE_NAMES)
    except Exception as e:
        logger.error("❌ Random Forest module failed to load: %s", e)

    logger.info("\n" + "=" * 60)
    logger.info("TRAINING COMPLETE")
    logger.info("=" * 60)


if __name__ == "__main__":
    train_all()
