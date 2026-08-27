import os
import logging
import xgboost as xgb
import pandas as pd

from app.config import XGBOOST_MODEL_PATH
from app.ml_model_v2.feature_engineering import extract_features, get_feature_names

logger = logging.getLogger(__name__)

# Cache the loaded model
_xgb_model = None
_model_loaded = False

def load_model():
    global _xgb_model, _model_loaded
    if _model_loaded:
        return _xgb_model
        
    if os.path.exists(XGBOOST_MODEL_PATH):
        try:
            _xgb_model = xgb.XGBClassifier()
            _xgb_model.load_model(XGBOOST_MODEL_PATH)
            logger.info("XGBoost model loaded successfully from %s", XGBOOST_MODEL_PATH)
        except Exception as e:
            logger.error("Failed to load XGBoost model: %s", e)
            _xgb_model = None
    else:
        logger.info("XGBoost model file not found at %s. Running without XGBoost ranking.", XGBOOST_MODEL_PATH)
        
    _model_loaded = True
    return _xgb_model

def score_candidates(seed_movie: dict, candidates: list, tfidf_scores: dict) -> list:
    """
    Score candidates using the trained XGBoost model.
    seed_movie: The seed movie dict from TMDB.
    candidates: List of candidate movie dicts from TMDB.
    tfidf_scores: Dictionary mapping candidate tmdb_id to tfidf_similarity score.
    
    Returns a list of candidate dicts enriched with 'xgboost_score'.
    """
    model = load_model()
    
    # If model is not available, return candidates with xgboost_score = 0
    if model is None:
        for cand in candidates:
            cand["xgboost_score"] = 0.0
        return candidates
        
    feature_names = get_feature_names()
    features_list = []
    
    for cand in candidates:
        cand_id = cand.get("id") or cand.get("tmdb_id")
        tfidf_sim = tfidf_scores.get(cand_id, 0.0)
        
        feats = extract_features(seed_movie, cand, tfidf_sim)
        features_list.append([feats[fname] for fname in feature_names])
        
    if not features_list:
        return candidates
        
    try:
        # Create DataFrame to match feature names used during training
        X = pd.DataFrame(features_list, columns=feature_names)
        
        # Predict probabilities of being relevant (class 1)
        probas = model.predict_proba(X)
        
        # In case the model only predicts 1 class (e.g. all 0s in training), handle safely
        if probas.shape[1] > 1:
            scores = probas[:, 1]
        else:
            # If only one class exists, predict_proba returns shape (n, 1)
            # Find out which class it is
            cls = model.classes_[0]
            scores = probas[:, 0] if cls == 1 else [0.0] * len(probas)
            
        for i, cand in enumerate(candidates):
            cand["xgboost_score"] = float(scores[i])
            
    except Exception as e:
        logger.error("Error during XGBoost prediction: %s", e)
        for cand in candidates:
            cand["xgboost_score"] = 0.0
            
    return candidates
