#!/bin/bash

set -e

echo "Starting application setup..."

# Create necessary directories
mkdir -p app/ml_model

# Run database migrations if Alembic is configured
if [ -f "alembic.ini" ]; then
    echo "Running database migrations..."
    python -m alembic upgrade head || echo "Migrations skipped (may already be up to date)"
fi

# Train ML models if they don't exist
if [ ! -f "app/ml_model/content_based.pkl" ] || [ ! -f "app/ml_model/naive_bayes.pkl" ]; then
    echo "Training ML models..."
    python -m app.ml_model.train_models || echo "Model training skipped (will use fallbacks)"
else
    echo "ML model files already exist, skipping training..."
fi

# Start FastAPI
echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}