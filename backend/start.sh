#!/bin/bash

set -e

echo "Starting application setup..."

if [ -f "alembic.ini" ]; then
    echo "Running database migrations..."
    python -m alembic upgrade head || echo "Migrations skipped (may already be up to date)"
fi

echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
