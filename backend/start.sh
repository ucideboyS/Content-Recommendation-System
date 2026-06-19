#!/bin/bash

set -e

echo "Starting application setup..."

# Create necessary directories
mkdir -p app/ml_model

# Download model files only if they don't exist
if [ ! -f "app/ml_model/simi.pkl" ] || [ ! -f "app/ml_model/Movies_Datase.pkl" ]; then
    echo "Downloading model files..."
    python -c "from app.download_models import download_models; download_models()"
else
    echo "Model files already exist, skipping download..."
fi

# Skip migrations for now
echo "Skipping database migrations..."

# Start FastAPI
echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT}