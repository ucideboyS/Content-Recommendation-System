#!/bin/bash

# Create necessary directories
mkdir -p app/ml_model

# Install dependencies
pip install -r requirements.txt

# Download model files only if they don't exist
if [ ! -f "app/ml_model/simi.pkl" ] || [ ! -f "app/ml_model/Movies_Datase.pkl" ]; then
    echo "Downloading model files..."
    python -c "from app.download_models import download_models; download_models()"
else
    echo "Model files already exist, skipping download..."
fi

# Run database migrations
alembic upgrade head

# Start the application
uvicorn app.main:app --host 0.0.0.0 --port $PORT 