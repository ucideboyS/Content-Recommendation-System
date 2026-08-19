# 🎬 Content Recommendation System

A full-stack movie and TV content recommendation application built with **Next.js**, **FastAPI**, **PostgreSQL**, **SQLAlchemy**, **Alembic**, and the **TMDB API**.

This README describes the implementation currently present in the repository. Older recommendation/model code may still exist in the backend, but it is not presented as the primary recommendation architecture unless the current route uses it.

## 🚀 Live Demo

**Deployed application:**

https://content-recommendation-system-gold.vercel.app/

---

## ✨ Features

- User registration and login
- JWT-based authentication
- User preferences
- Movie and TV content browsing
- TMDB-based search and content data
- Movie detail pages
- Movie recommendations
- Personalized recommendation endpoint for authenticated users
- Mood-based recommendations
- Cold-start recommendations
- Ratings
- Watch history
- Wishlist
- AI-related backend endpoints

---

## 🛠️ Tech Stack

### Frontend

- Next.js
- React
- Tailwind CSS
- Zustand
- Axios
- Lottie

### Backend

- Python
- FastAPI
- Uvicorn
- SQLAlchemy
- Alembic
- PostgreSQL
- JWT authentication

### Recommendation / ML Libraries

- Scikit-learn
- NumPy
- Pandas
- SciPy
- Joblib
- Sentence Transformers

### External Services

- TMDB API
- OpenAI API integration in the backend

---

# 🧠 Recommendation System

The repository contains multiple recommendation paths. The main distinction is between the current movie-by-ID engine and older/other recommendation code that remains in the backend.

## 1. Movie-by-ID Recommendations

Endpoint:

```text
GET /api/recommend/by-id/{tmdb_id}
```

The current implementation is located in:

```text
backend/app/ml_model_v2/hybrid_recommender.py
```

### Flow

```text
TMDB movie ID
      ↓
Fetch seed movie from TMDB
      ↓
Generate candidates from TMDB
      ↓
Filter candidates by original language
      ↓
Build text features
      ↓
TF-IDF vectorization
      ↓
Cosine similarity
      ↓
Rank candidates
      ↓
Return Top-N recommendations
```

### Candidate generation

The current implementation obtains candidates from TMDB using several sources, including:

- TMDB recommendations
- TMDB similar movies
- Genre-based discovery
- Language + genre discovery
- Language-based discovery

### Language filtering

The seed movie's `original_language` is used to filter the candidate pool before similarity ranking.

### TF-IDF and cosine similarity

The current movie-by-ID implementation creates text representations from the available movie metadata and fits a `TfidfVectorizer` on the seed movie and candidate pool for that request.

Cosine similarity is then calculated between the seed movie vector and candidate vectors. Candidates are sorted by similarity and the requested number of results is returned.

### Important

The current `/api/recommend/by-id/{tmdb_id}` implementation gets its candidate content from TMDB at request time. It is **not documented here as a recommendation system trained only on the old 214-movie dataset** and it does **not require `content_based.pkl` for this endpoint**.

---

## 2. Personalized Recommendations

Endpoint:

```text
GET /api/recommend/hybrid
```

The authenticated recommendation flow is implemented in:

```text
backend/app/services/hybrid_service.py
```

The current service:

1. Reads the user's ratings.
2. Selects the highest-rated movie when a suitable rating exists.
3. Uses that movie's TMDB ID as the seed for the `ml_model_v2` recommendation engine.
4. Excludes movies already rated by the user.
5. Returns the resulting recommendations.

For users without a suitable rating history, the service falls back to TMDB discovery using the user's favorite genres.

---

## 3. Mood Recommendations

Endpoint:

```text
GET /api/recommend/mood/{mood}
```

The route supports:

```text
happy
sad
tense
nostalgic
adventurous
romantic
thoughtful
```

The route attempts to use the existing Naive Bayes mood recommendation implementation. If that path does not return usable results, it falls back to TMDB genre-based discovery.

This is separate from the current TF-IDF movie-by-ID recommendation flow.

---

## 4. Cold-Start Recommendations

Endpoint:

```text
GET /api/recommend/cold-start
```

For users without recommendation history, the endpoint can use saved favorite genres and TMDB discovery to generate content.

---

# 🏗️ Application Architecture

```text
┌──────────────────────────────┐
│       Next.js Frontend       │
│ Browse • Search • Details    │
│ Ratings • Wishlist • Profile │
└──────────────┬───────────────┘
               │ REST API
               ▼
┌──────────────────────────────┐
│       FastAPI Backend        │
│ Auth • Recommendations       │
│ Mood • AI • Wishlist • Users │
└──────────┬───────────┬───────┘
           │           │
           ▼           ▼
     PostgreSQL       TMDB API
     SQLAlchemy       Live content
     + Alembic
```

---

# 📁 Important Backend Structure

```text
backend/
├── app/
│   ├── routes/
│   │   └── recommend.py
│   ├── services/
│   │   └── hybrid_service.py
│   ├── ml_model/
│   │   └── naive_bayes_model.py
│   ├── ml_model_v2/
│   │   └── hybrid_recommender.py
│   ├── models/
│   ├── schemas/
│   └── ...
├── alembic/
├── requirements.txt
└── ...
```

### `routes/recommend.py`

Defines the recommendation API routes and connects them to the relevant recommendation implementations.

### `ml_model_v2/hybrid_recommender.py`

Contains the current movie-by-ID recommendation implementation using TMDB candidate retrieval, language filtering, TF-IDF, and cosine similarity.

### `services/hybrid_service.py`

Handles the authenticated recommendation flow and the cold-start fallback.

### `ml_model/naive_bayes_model.py`

Contains the Naive Bayes implementation used by the mood recommendation path.

### `alembic/`

Contains database migration configuration and migration history used to update the PostgreSQL schema.

---

# 🗄️ Database

The backend uses **PostgreSQL** with **SQLAlchemy**.

**Alembic** is used for database migrations.

The database is used for application data such as users, ratings, history, wishlist information, preferences, and movie records used by the backend.

TMDB is used as the external source for movie and TV metadata.

---

# 📡 Main Recommendation API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recommend?movie={name}` | TMDB-based movie recommendation/search flow |
| GET | `/api/recommend/by-id/{tmdb_id}` | Current TF-IDF + cosine similarity recommendation engine |
| GET | `/api/recommend/hybrid` | Authenticated personalized recommendation flow |
| GET | `/api/recommend/mood/{mood}` | Mood-based recommendation flow |
| GET | `/api/recommend/cold-start` | Cold-start recommendation flow |

---

# 🔐 Authentication

The backend implements JWT-based authentication for user-specific functionality.

User-related functionality includes registration, login, preferences, ratings, history, and wishlist data.

---

# 💻 Local Setup

## 1. Clone the repository

```bash
git clone https://github.com/ucideboyS/Content-Recommendation-System.git
cd Content-Recommendation-System
```

## 2. Backend

```bash
cd backend
python -m venv venv
```

### Windows PowerShell

```powershell
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create the required backend environment variables, including the PostgreSQL connection string, TMDB API key, and authentication configuration.

Example:

```env
DATABASE_URL=your_postgresql_connection_string
TMDB_API_KEY=your_tmdb_api_key
SECRET_KEY=your_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

Run migrations:

```bash
alembic upgrade head
```

Start FastAPI:

```bash
uvicorn app.main:app --reload
```

## 3. Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Configure the frontend API URL according to the project's frontend environment configuration.

---

# ⚠️ Legacy / Additional Code

The repository contains older recommendation/model code in addition to the newer `ml_model_v2` implementation.

This README intentionally does not describe the old persisted-model architecture as the current movie-by-ID algorithm.

In particular, the old claims about a fixed 214-movie `content_based.pkl` model, Random Forest personalization, and a single combined scoring formula are not used here as the description of the current `/api/recommend/by-id/{tmdb_id}` implementation.

---

# 🔮 Future Improvements

Possible future improvements include:

- More user-personalization signals
- Recommendation evaluation metrics
- Better multilingual semantic representations
- Recommendation explanations
- More extensive TV recommendation support

---

## 👨‍💻 Author

**Sahil Jakhariya**

GitHub: https://github.com/ucideboyS

---

## 📄 License

This project is intended for educational and portfolio use.
