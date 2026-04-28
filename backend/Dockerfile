# Use Python 3.11 instead of 3.12
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    PYTHONPATH=/app

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    python3-pip \
    python3-setuptools \
    python3-wheel \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better cache
COPY requirements.txt .

# Create and activate virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install wheel setuptools && \
    pip install -r requirements.txt

# Copy project
COPY . .

# Create necessary directories
RUN mkdir -p /app/app/ml_model && \
    chmod -R 755 /app && \
    chown -R root:root /app

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Starting application setup..."\n\
echo "Current directory: $(pwd)"\n\
echo "Listing directory contents:"\n\
ls -la\n\
echo "Checking model files:"\n\
ls -la /app/app/ml_model\n\
echo "Starting database migrations..."\n\
alembic upgrade head\n\
echo "Database migrations completed"\n\
echo "Starting application..."\n\
python -c "import app.download_models; app.download_models.download_models()"\n\
echo "Verifying model files..."\n\
python -c "import pickle; pickle.load(open(\"/app/app/ml_model/movie_dict.pkl\", \"rb\")); pickle.load(open(\"/app/app/ml_model/simi.pkl\", \"rb\"))"\n\
echo "Model files verified successfully"\n\
echo "Starting uvicorn server..."\n\
uvicorn app.main:app --host 0.0.0.0 --port ${PORT}\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose the port
EXPOSE ${PORT}

# Command to run the application
CMD ["/app/start.sh"]
