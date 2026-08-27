import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is not set")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# TMDB Configuration
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
if not TMDB_API_KEY:
    raise ValueError("TMDB_API_KEY environment variable is not set")

# GitHub Models / LLM Configuration (optional — AI features degrade gracefully)
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

# XGBoost Configuration
XGBOOST_MODEL_PATH = os.path.join(os.path.dirname(__file__), "ml_model_v2", "xgboost_model.json")
XGBOOST_WEIGHT = float(os.getenv("XGBOOST_WEIGHT", "0.7"))
