---

# 🎬 MovieRec — Intelligent Movie & TV Recommendation System

A **hybrid movie and TV recommendation platform** powered by multiple ML models, real-time TMDB data, and an AI-enhanced frontend. Built with **Next.js**, **FastAPI**, and **Scikit-learn**, MovieRec delivers personalized, mood-based, and content-similar recommendations with a premium glassmorphic UI.

---
## 🎥 Project Demo
[![MovieRec Demo](https://img.youtube.com/vi/e1pU-sygGWU/0.jpg)](https://youtu.be/e1pU-sygGWU)

# Watch the full project demo on YouTube:
[MovieRec – Full Project Demo | Movie Recommendation System](https://youtu.be/e1pU-sygGWU)

---

## 🚀 Live Demo

[![Visit Live Site](https://img.shields.io/badge/Live%20Demo-Visit%20Now-blue?style=for-the-badge)](https://movie-recommendation-system-nine-beta.vercel.app)

---

## 📌 Table of Contents

* [Abstract](#-abstract)
* [Features](#-features)
* [Tech Stack](#-tech-stack)
* [ML Models & Recommendation Engine](#-ml-models--recommendation-engine)
* [System Architecture](#️-system-architecture)
* [Installation](#-installation)
* [API Endpoints](#-api-endpoints)
* [Usage](#-usage)
* [Screenshots](#-screenshots)
* [Future Scope](#-future-scope)
* [License](#-license)

---

## 🧠 Abstract

MovieRec enhances the user experience by providing **personalized movie and TV show suggestions** using a **multi-source hybrid recommendation engine**. Unlike traditional systems that rely on a single algorithm, MovieRec combines:

- **Content-Based Filtering** (TF-IDF + Cosine Similarity) — analyzes movie metadata (overview, genres, cast, director, keywords)
- **Naive Bayes Mood Classifier** — maps user moods to genre combinations
- **Random Forest Personalization** — learns from individual user rating patterns
- **TMDB Recommendations & Similar** — leverages TMDB's viewing-pattern data

The system handles cold-start users via preference-based recommendations and progressively improves with user interaction. Built with **Python, FastAPI, Next.js, PostgreSQL**, and a modern glassmorphic UI.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | User registration with genre/actor/director preferences, JWT-based login |
| 🎯 **Hybrid Recommendations** | Multi-source engine combining TMDB + Content-Based ML + Random Forest |
| 🎭 **Mood-Based Discovery** | Select your mood → get AI-curated recommendations (7 mood categories) |
| 🔍 **Live Search** | Debounced real-time search (300ms) with movie/TV/all filter tabs |
| 🧠 **Smart Search** | AI-powered natural language search ("fun sci-fi movies from the 90s") |
| 📺 **TV Show Support** | Full TV series support with season info, proper labeling, and recommendations |
| 🇮🇳 **Hindi Movies** | Dedicated Bollywood/Hindi cinema section on home page |
| 👶 **Kids Section** | Separate kids-only section; family content filtered from main carousels |
| ❤️ **Wishlist** | Save movies/shows with dynamic media type support |
| 🎬 **Trailers** | Watch trailers directly in the app |
| 📊 **Rating System** | Rate movies on a 5-star scale |
| 📖 **Watch History** | Automatic history tracking of viewed content |
| 👤 **User Profile** | View and manage preferences |
| ⚡ **Optimized Performance** | GPU-accelerated scroll, lazy-loaded images, no backdrop-filter jank |

---

## Technologies Used

**Frontend**  
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)
![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white)
![Lottie](https://img.shields.io/badge/Lottie-000000?style=for-the-badge&logo=lottiefiles&logoColor=white)

**Backend & Database**  
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Uvicorn](https://img.shields.io/badge/Uvicorn-499848?style=for-the-badge&logo=uvicorn&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Neon DB](https://img.shields.io/badge/Neon%20DB-00f900?style=for-the-badge)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-000000?style=for-the-badge&logo=sqlalchemy&logoColor=white)
![Alembic](https://img.shields.io/badge/Alembic-000000?style=for-the-badge)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=white)

**Machine Learning**  
![Scikit-learn](https://img.shields.io/badge/scikit_learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-2C2D72?style=for-the-badge&logo=pandas&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-013243?style=for-the-badge&logo=numpy&logoColor=white)

**Development Tools**  
![VS Code](https://img.shields.io/badge/VS_Code-0078D4?style=for-the-badge&logo=visual%20studio%20code&logoColor=white)
![Jupyter](https://img.shields.io/badge/Jupyter-F37626?style=for-the-badge&logo=jupyter&logoColor=white)
![pip](https://img.shields.io/badge/pip-3775A9?style=for-the-badge&logo=pypi&logoColor=white)
![npm](https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Postman](https://img.shields.io/badge/Postman-FF6C37?style=for-the-badge&logo=postman&logoColor=white)
![.env](https://img.shields.io/badge/.env-ECD53F?style=for-the-badge)

---

## 🤖 ML Models & Recommendation Engine

### Trained Models

| Model | File | Technique | Details |
|-------|------|-----------|---------|
| Content-Based | `content_based.pkl` | TF-IDF + Cosine Similarity | 214 movies, 2,402 features |
| Naive Bayes | `naive_bayes_model.pkl` | Multinomial NB Mood Classifier | 7 mood classes, 214 training samples |
| Random Forest | `random_forest_model.pkl` | RF Regressor (per-user) | 6 features, personalized |

### Hybrid Recommendation Algorithm

The `/api/recommend/by-id/{tmdb_id}` endpoint uses a **multi-source hybrid approach**:

1. **TMDB Recommendations** — viewing-pattern based (highest weight, `source_bonus=1.3`)
2. **TMDB Similar Movies** — genre/keyword matching (`source_bonus=1.0`)
3. **Content-Based ML Model** — TF-IDF cosine similarity from trained model (`score × 0.9`)
4. **TV Fallback** — auto-detects TV show IDs and fetches TV recommendations

Each candidate is scored:
```
score = vote_average × popularity_factor × source_bonus × rank_decay
```

Results are **deduplicated** across all sources and **ranked by combined score**, returning the top 10.

### Mood-Based Recommendations

7 supported moods: `happy`, `sad`, `tense`, `nostalgic`, `adventurous`, `romantic`, `thoughtful`

Uses the trained Naive Bayes classifier to score movies against mood-genre mappings, with TMDB genre discovery as fallback.

---

## 🛠️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │  Browse   │ │  Search  │ │  Detail  │ │  Wishlist   │  │
│  │  (Home)   │ │  (Live)  │ │  (Movie/ │ │  History    │  │
│  │  Hindi    │ │  Smart   │ │   TV)    │ │  Profile    │  │
│  │  Kids     │ │  Filter  │ │  Rate    │ │  Trailers   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       │             │            │              │         │
└───────┼─────────────┼────────────┼──────────────┼─────────┘
        │             │            │              │
        ▼             ▼            ▼              ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend (FastAPI)                        │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐  │
│  │  User API │ │ Recommend │ │   AI API  │ │Wishlist │  │
│  │  (Auth)   │ │  (Hybrid) │ │  (Smart   │ │  API    │  │
│  │           │ │  (Mood)   │ │  Search)  │ │         │  │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └────┬────┘  │
│        │              │             │             │       │
│        ▼              ▼             ▼             ▼       │
│  ┌──────────────────────────────────────────────────┐    │
│  │          ML Models + TMDB API + PostgreSQL        │    │
│  │  Content-Based │ Naive Bayes │ Random Forest      │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Installation

Follow the steps below to set up the project locally:

---

### 📥 Clone the Repository

```bash
git clone https://github.com/mahesh-bhosale/movie-recommendation-system.git
cd movie-recommendation-system
```

---

### 🧠 Backend Setup (FastAPI)

#### 📌 Create and Activate Virtual Environment

```bash
cd backend
python -m venv venv
```

##### 🖥️ For Windows (PowerShell):

```bash
venv\Scripts\activate
```

#### 📦 Install Dependencies

```bash
pip install -r requirements.txt
```

#### 🛠️ Add `.env` File in `backend/` Folder

Create a `.env` file and add the following:

```env
# Database Configuration
DATABASE_URL=create_your_own_key_postgresql_neondb

# API Keys
TMDB_API_KEY=create_your_own_key_from_tmdb

# JWT Configuration
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

#### 🤖 Train ML Models

Run the training script to populate the database and generate model files:

```bash
python -m app.ml_model.train_models
```

This will:
- Fetch movie data from TMDB and enrich it
- Build the Content-Based TF-IDF model (`content_based.pkl`)
- Train the Naive Bayes mood classifier (`naive_bayes_model.pkl`)
- Prepare the Random Forest model (`random_forest_model.pkl`)

Alternatively, download pre-trained models:

```bash
python app/download_models.py
```

#### 🚀 Run FastAPI Server

```bash
uvicorn app.main:app --reload
```

The backend will be available at: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

### 🌐 Frontend Setup (Next.js)

Open a **new terminal**:

```bash
cd frontend
```

#### 📄 Add `.env.local` File in `frontend/` Folder

Create a `.env.local` file and add:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# TMDB API Key
NEXT_PUBLIC_TMDB_API_KEY=create_your_own_key_from_tmdb
```

#### 📦 Install Dependencies

```bash
npm install
```

#### 🚀 Run the Frontend

```bash
npm run dev
```

The frontend will be available at: [http://localhost:3000](http://localhost:3000)

---

## 📡 API Endpoints

### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register new user with preferences |
| POST | `/api/users/login` | Login and receive JWT token |
| GET | `/api/users/profile` | Get user profile |

### Recommendations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recommend?movie={name}` | TMDB-based similar movies |
| GET | `/api/recommend/by-id/{tmdb_id}` | **Hybrid** multi-source recommendations |
| GET | `/api/recommend/hybrid` | Personalized ML recommendations (auth required) |
| GET | `/api/recommend/mood/{mood}` | Mood-based recommendations |
| GET | `/api/recommend/cold-start` | New user recommendations from preferences |

### AI Features
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/smart-search` | Natural language movie search |
| POST | `/api/ai/mood-recommendations` | AI-enhanced mood recommendations |
| POST | `/api/ai/trending-context` | AI insights for movie detail page |

### Wishlist
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wishlist` | Get user's wishlist |
| POST | `/api/wishlist/add` | Add to wishlist (movie or TV) |
| DELETE | `/api/wishlist/remove` | Remove from wishlist |
| GET | `/api/wishlist/check/{id}` | Check if item is in wishlist |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

---

## 🚀 Usage

1. **Register** — Sign up with your favorite genres, actors, and directors
2. **Browse** — Explore Trending, Popular, Hindi, TV Series, and Top Rated carousels
3. **Search** — Start typing to see live results, filter by Movie/TV/All
4. **Discover by Mood** — Select how you're feeling for curated suggestions
5. **Movie Details** — View full info, watch trailers, rate, add to wishlist
6. **Get Recommendations** — Click "Get Recommendations" on any movie for similar content
7. **Kids Section** — Safe, family-friendly content in a dedicated section

---

## 📸 Screenshots

### 1. 🔐 User Registration

Users can register by providing a username, email ID, and password. They can also select their favorite genres, actors, and directors.
![image](https://github.com/user-attachments/assets/2c9a8898-169e-4a05-8465-33f4193b7ef9)
![image](https://github.com/user-attachments/assets/c5c8a0fe-0450-4895-9384-71c76c724dca)
![image](https://github.com/user-attachments/assets/4a392f0a-bdf3-42bd-bddc-56ff2c2456fd)

---

### 2. 🔓 User Login

Registered users can log in using their valid username and password.
![image](https://github.com/user-attachments/assets/21458588-5560-4a89-acd5-e9e7bb15b4d2)

---

### 3. 🏠 Home Page

Displays trending, popular, Hindi, TV series, and top-rated content with mood-based recommendations. Kids content is filtered to its own section.
![image](https://github.com/user-attachments/assets/61c45f8d-d2f1-4497-a502-2c0e8b277e0b)
![image](https://github.com/user-attachments/assets/62d5ce17-d5a4-46e3-8a63-334d71bcc1f8)

---

### 4. 🔍 Search Engine

Live search with debounced results (300ms), media type filtering (All/Movies/TV Series), and AI-powered Smart Search.
![image](https://github.com/user-attachments/assets/9d461008-304e-48b2-a46f-123e71f8e355)

---

### 5. 🎥 Movie & TV Show Details

Users can:

* View detailed information about movies and TV shows (with season count for TV)
![image](https://github.com/user-attachments/assets/2b1acbaf-de93-47d8-9937-b0f655d9e741)
 
* Watch trailers
![image](https://github.com/user-attachments/assets/9408fe39-7574-4f78-8509-d528553482cf)

* Rate movies on a scale of 5
![image](https://github.com/user-attachments/assets/99f8b6f6-63be-4f47-95a9-1c9afa95dccb)

* Get similar recommendations via the **hybrid multi-source engine** (TMDB + ML Model)
![image](https://github.com/user-attachments/assets/be9e69af-d959-4fb4-a281-1c357e76d045)
![image](https://github.com/user-attachments/assets/34be47dd-cdab-4598-9b34-f32366603592)

---

### 6. 📝 History

Displays a history of the movies watched by the user.
![image](https://github.com/user-attachments/assets/1da83be7-2166-4d2e-8e5b-1d68b0c7abd7)

---

### 7. 👤 User Profile

Users can view and manage their profile.
![image](https://github.com/user-attachments/assets/64735060-f955-4d47-a344-645a542e8f98)
![image](https://github.com/user-attachments/assets/60aeab1a-e70a-4e8d-937a-10cada0e3236)

---

## 🔮 Future Scope

* Collaborative filtering for enhanced hybrid recommendations
* User-to-user similarity for social recommendations
* Multi-language support beyond Hindi
* Watch providers integration (where to stream)
* Advanced analytics dashboard

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---