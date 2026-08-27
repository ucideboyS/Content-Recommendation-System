# 🎬 Content Recommendation System

A modern, full-stack movie and TV content recommendation platform built with **Next.js**, **FastAPI**, **PostgreSQL**, **SQLAlchemy**, and the **TMDB API**.

The application provides a seamless streaming-style interface (similar to Netflix) while powering personalized, high-quality movie and TV/web-series recommendations through an advanced Machine Learning backend using **TF-IDF**, **Sentence Transformers**, and **XGBoost**.

## 🚀 Live Demo

**Deployed application:**
https://content-recommendation-system-gold.vercel.app/

---

## ✨ Key Features

- **Advanced Personalized Recommendations:** Integrates your explicit profile preferences (genres, content type, languages, favorite actors/directors) and watch history to generate deeply personalized content feeds.
- **Strict Media Type Separation:** Fully supports both Movies and TV Shows natively, providing distinct sections for Indian Web Series, Indian Movies, and mixed-type carousels based on user preference.
- **Robust OTT Content Filtering:** A custom validation layer automatically identifies and rejects low-quality broadcast television, reality shows, and daily soaps, ensuring only legitimate OTT web series and high-quality movies reach your feed.
- **Dynamic Hybrid Recommendation Engine:** Uses a custom ML pipeline (`TF-IDF` + `Sentence Transformers` + `XGBoost`) to generate highly relevant, semantic recommendations from a single seed movie or TV show.
- **User Profiles & History:** Save preferences, build a watch history, maintain a wishlist, and rate your favorite titles.
- **Interactive Browsing:** Fast, dynamic carousels with global deduplication, intelligent fallback logic, and a mood-based discovery engine.
- **Secure Authentication:** JWT-based user registration and login.

---

## 🛠️ Tech Stack

### Frontend
- Next.js (App Router)
- React
- Tailwind CSS
- Zustand (State Management)
- Axios

### Backend
- Python 3.11+
- FastAPI & Uvicorn
- SQLAlchemy & Alembic (ORM & Migrations)
- PostgreSQL
- JWT authentication

### Recommendation & ML Libraries
- Scikit-learn
- XGBoost
- Sentence Transformers (HuggingFace)
- NumPy & Pandas

### External Services
- TMDB API (Real-time content catalog and metadata)

---

## 🧠 Recommendation System Architecture

The core of the platform is driven by a sophisticated backend recommendation engine (`backend/app/ml_model_v2/hybrid_recommender.py`) that operates without relying on stale, static datasets.

### 1. Hybrid ML Recommendation Pipeline (`/api/recommend/by-id/{tmdb_id}`)
When a user requests recommendations for a specific title (Movie or TV):
1. **Seed Processing:** The system fetches live metadata, credits, and keywords from TMDB, dynamically detecting if the seed is a Movie or a TV show.
2. **Candidate Generation:** It builds a massive candidate pool by querying TMDB recommendations, similar titles, shared genres, and shared cast/crew.
3. **TF-IDF Vectorization:** The system extracts plots, genres, and keywords, fitting a fresh `TfidfVectorizer` against the candidate pool.
4. **Semantic Embedding:** It generates deep sentence embeddings using Sentence Transformers to capture thematic similarities that keyword-matching misses.
5. **XGBoost Ranking:** An XGBoost ranker combines the TF-IDF score, Semantic score, TMDB popularity, and vote averages into a final personalized hybrid score.

### 2. Personalized "Recommended For You" (`/api/users/recommendations`)
For authenticated users, the system checks the PostgreSQL database for their most recently watched title (`History`).
- **If History exists:** It feeds that title into the Hybrid ML pipeline while injecting the user's explicit profile preferences (e.g., boosting favorite directors or strictly filtering out unwanted languages).
- **Cold Start:** If no history exists, it constructs a highly targeted TMDB discovery query that perfectly maps to the user's saved `preferred_content_type`, `favorite_genres`, and regional languages, applying the strict OTT validation layer before returning results.

---

## 🏗️ Project Structure

```text
content-recommendation-system/
├── frontend/                     # Next.js Application
│   ├── src/
│   │   ├── app/                  # App Router pages (Browse, Profile, Details)
│   │   ├── components/           # Reusable UI components (Carousels, Nav)
│   │   └── store/                # Zustand state (Auth)
│   └── package.json
│
├── backend/                      # FastAPI Application
│   ├── app/
│   │   ├── ml_model_v2/          # Core Hybrid Recommender (TF-IDF, XGBoost)
│   │   ├── routes/               # API Endpoints (user.py, recommend.py)
│   │   ├── models.py             # SQLAlchemy Database Models
│   │   ├── schemas.py            # Pydantic Validation Schemas
│   │   └── main.py               # FastAPI Entrypoint
│   ├── alembic/                  # Database Migrations
│   └── requirements.txt
```

---

## 📡 Key Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/users/register` | Register a new user |
| `POST` | `/api/users/login` | Authenticate and retrieve JWT |
| `GET`  | `/api/users/recommendations` | Get highly personalized recommendations based on profile/history |
| `POST` | `/api/users/history` | Save a Movie or TV show to user's watch history |
| `PUT`  | `/api/users/preferences` | Update explicit user content preferences |
| `GET`  | `/api/recommend/by-id/{tmdb_id}`| Generate semantic hybrid recommendations for a specific title |

---

## 💻 Local Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python (3.11+)
- PostgreSQL installed and running

### 1. Clone the repository
```bash
git clone https://github.com/ucideboyS/Content-Recommendation-System.git
cd Content-Recommendation-System
```

### 2. Backend Setup
Navigate to the backend directory and create a virtual environment:
```bash
cd backend
python -m venv venv
```

**Activate the virtual environment:**
- Windows: `venv\Scripts\activate`
- Mac/Linux: `source venv/bin/activate`

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Environment Variables:**
Create a `.env` file in the `backend/` directory. **Never commit this file to version control.**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/your_db_name
TMDB_API_KEY=your_tmdb_api_key_here
SECRET_KEY=your_secure_jwt_secret_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

**Run Database Migrations:**
```bash
alembic upgrade head
```

**Start the FastAPI Server:**
```bash
python -m uvicorn app.main:app --reload
```
*The backend will be available at http://localhost:8000*

### 3. Frontend Setup
Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
npm install
```

**Environment Variables:**
Create a `.env.local` file in the `frontend/` directory.
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_TMDB_API_KEY=your_tmdb_api_key_here
```

**Start the Next.js Development Server:**
```bash
npm run dev
```
*The frontend will be available at http://localhost:3000*

---

## 🔒 Security & Configuration
- **Secrets Management:** All API keys, database credentials, and JWT secrets must be stored securely in `.env` files. Ensure `.env` is listed in your `.gitignore` to prevent accidental exposure to Git.
- **Authentication:** All personalized endpoints (`/api/users/*`) require a valid JWT Bearer token.

---

## 👨‍💻 Author

**Sahil Jakhariya**  
GitHub: [ucideboyS](https://github.com/ucideboyS)

## 📄 License

This project is intended for educational and portfolio use.
