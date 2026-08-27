import os
import sys
import time
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_score, recall_score, f1_score, accuracy_score, ndcg_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import SessionLocal
from app.models import User, Rating, Movie
from app.ml_model_v2.feature_engineering import extract_features, get_feature_names
from app.ml_model_v2.hybrid_recommender import _movie_to_text
from app.config import XGBOOST_MODEL_PATH

def db_movie_to_tmdb_dict(db_movie):
    """Convert local DB Movie object to a pseudo-TMDB dict for feature extraction."""
    return {
        "id": db_movie.tmdb_id,
        "title": db_movie.title,
        "overview": db_movie.overview,
        "genres": [{"name": g} for g in (db_movie.genres or [])],
        "original_language": "en", # local DB doesn't have it
        "vote_average": db_movie.vote_average,
        "popularity": db_movie.popularity,
        "release_date": db_movie.release_date,
        "credits": {
            "cast": [{"id": name, "name": name} for name in (db_movie.cast_names or [])],
            "crew": [{"id": db_movie.director, "job": "Director"}] if db_movie.director else []
        },
        "keywords": {"keywords": [{"id": k, "name": k} for k in (db_movie.keywords or [])]}
    }

def main():
    print("Starting XGBoost training data generation...")
    start_time = time.time()
    
    db = SessionLocal()
    
    # 1. Fetch all ratings and movies
    ratings = db.query(Rating).all()
    movies = {m.tmdb_id: m for m in db.query(Movie).all()}
    
    user_ratings = {}
    for r in ratings:
        if r.user_id not in user_ratings:
            user_ratings[r.user_id] = []
        user_ratings[r.user_id].append(r)
        
    print(f"Loaded {len(ratings)} ratings from {len(user_ratings)} users.")
    
    feature_names = get_feature_names()
    X = []
    y = []
    
    # 2. Build dataset (Seed = highest rated movie for user, Candidates = other rated movies)
    # Target: 1 if rating >= 4 else 0
    
    for user_id, uratings in user_ratings.items():
        if len(uratings) < 2:
            continue
            
        # Sort by rating descending
        uratings.sort(key=lambda x: x.rating, reverse=True)
        
        seed_rating = uratings[0]
        seed_movie_db = movies.get(seed_rating.tmdb_id)
        
        if not seed_movie_db:
            continue
            
        seed_dict = db_movie_to_tmdb_dict(seed_movie_db)
        seed_text = _movie_to_text(seed_dict)
        
        # We need a mini TF-IDF space for this user's candidates + seed
        cand_db_movies = [movies.get(r.tmdb_id) for r in uratings[1:]]
        # Filter out missing movies
        valid_cands = [(r, m) for r, m in zip(uratings[1:], cand_db_movies) if m is not None]
        
        if not valid_cands:
            continue
            
        all_texts = [seed_text] + [_movie_to_text(db_movie_to_tmdb_dict(m)) for _, m in valid_cands]
        
        vectorizer = TfidfVectorizer(stop_words="english", max_features=5000)
        try:
            tfidf_matrix = vectorizer.fit_transform(all_texts)
            similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])[0]
        except ValueError:
            # Vocabulary empty
            similarities = [0.0] * len(valid_cands)
            
        for idx, (r, m) in enumerate(valid_cands):
            cand_dict = db_movie_to_tmdb_dict(m)
            sim = float(similarities[idx])
            
            feats = extract_features(seed_dict, cand_dict, sim)
            X.append([feats[fname] for fname in feature_names])
            y.append(1 if r.rating >= 4.0 else 0)
            
    db.close()
    
    df_X = pd.DataFrame(X, columns=feature_names)
    df_y = pd.Series(y)
    
    pos_samples = (df_y == 1).sum()
    neg_samples = (df_y == 0).sum()
    
    print(f"Generated {len(df_X)} training samples.")
    print(f"Positive samples (>=4.0): {pos_samples}")
    print(f"Negative samples (<4.0): {neg_samples}")
    
    if len(df_X) < 10:
        print("Not enough data to train (need at least 10 samples). Exiting.")
        return
        
    # 3. Train/Test split
    X_train, X_test, y_train, y_test = train_test_split(df_X, df_y, test_size=0.2, random_state=42)
    
    print(f"Training samples: {len(X_train)}, Test samples: {len(X_test)}")
    
    # 4. Train XGBoost
    print("Training XGBoost model...")
    # XGBClassifier predicting probability
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        use_label_encoder=False,
        eval_metric='logloss'
    )
    
    model.fit(X_train, y_train)
    
    # 5. Evaluate
    print("Evaluating model...")
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1] if len(model.classes_) > 1 else y_pred
    
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    
    # Simple NDCG calculation for the test set as one query
    ndcg = ndcg_score([y_test.values], [y_prob]) if len(y_test) > 1 else 0.0
    
    print("\n" + "="*50)
    print("EVALUATION METRICS (TF-IDF + XGBoost)")
    print("="*50)
    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    print(f"NDCG:      {ndcg:.4f}")
    
    # Baseline comparison (just TF-IDF similarity thresholding for classification)
    # Using tfidf_similarity column from test set
    tfidf_scores_test = X_test['tfidf_similarity'].values
    # Assuming threshold of mean tfidf for positive classification as a simple baseline
    tfidf_thresh = np.mean(tfidf_scores_test) if len(tfidf_scores_test) > 0 else 0
    y_pred_base = (tfidf_scores_test >= tfidf_thresh).astype(int)
    
    acc_base = accuracy_score(y_test, y_pred_base)
    f1_base = f1_score(y_test, y_pred_base, zero_division=0)
    ndcg_base = ndcg_score([y_test.values], [tfidf_scores_test]) if len(y_test) > 1 else 0.0
    
    print("\n" + "="*50)
    print("BASELINE METRICS (TF-IDF Only)")
    print("="*50)
    print(f"Accuracy:  {acc_base:.4f}")
    print(f"F1 Score:  {f1_base:.4f}")
    print(f"NDCG:      {ndcg_base:.4f}")
    
    print("\n" + "="*50)
    print("FEATURE IMPORTANCES")
    print("="*50)
    importances = model.feature_importances_
    feat_imp = pd.DataFrame({'Feature': feature_names, 'Importance': importances})
    feat_imp = feat_imp.sort_values(by='Importance', ascending=False)
    for _, row in feat_imp.iterrows():
        print(f"{row['Feature']:20s} : {row['Importance']:.4f}")
        
    # 6. Save model
    os.makedirs(os.path.dirname(XGBOOST_MODEL_PATH), exist_ok=True)
    model.save_model(XGBOOST_MODEL_PATH)
    print(f"\nModel saved to: {XGBOOST_MODEL_PATH}")
    
    elapsed = time.time() - start_time
    print(f"Training completed in {elapsed:.2f} seconds.")

if __name__ == "__main__":
    main()
