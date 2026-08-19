# 📋 Implementation Changes Log

> **Project:** MovieRec — Intelligent Movie & TV Recommendation System  
> **Period:** May–June 2026  
> **Status:** ✅ Complete

---

## 📑 Table of Contents

- [Phase 1: Core ML & Backend](#phase-1-core-ml--backend-infrastructure)
- [Phase 2: Recommendation Engine Overhaul](#phase-2-recommendation-engine-overhaul)
- [Phase 3: Search & Home Screen](#phase-3-search--home-screen-improvements)
- [Phase 4: Performance Optimization](#phase-4-performance-optimization)
- [Phase 5: Railway Deployment Fixes](#phase-5-railway-deployment-fixes)
- [Phase 6: Movie Detail Page Overhaul](#phase-6-movie-detail-page-overhaul)
- [Files Modified Summary](#files-modified-summary)

---

## Phase 1: Core ML & Backend Infrastructure

### ML Models Trained & Integrated

| Model | File | Technique | Status |
|-------|------|-----------|--------|
| Content-Based | `backend/app/ml_model/content_based.py` | TF-IDF + Cosine Similarity | ✅ 214 movies, 2,402 features |
| Naive Bayes | `backend/app/ml_model/naive_bayes_model.py` | Multinomial NB Mood Classifier | ✅ 7 mood classes |
| Random Forest | `backend/app/ml_model/random_forest_model.py` | RF Regressor (per-user) | ✅ 6 features |
| Training Script | `backend/app/ml_model/train_models.py` | Orchestrates all model training | ✅ DB population + model saving |

### Backend Services Built

| Service | File | Description |
|---------|------|-------------|
| TMDB Data Service | `backend/app/services/tmdb_data_service.py` | Fetches & enriches 214 movies+TV from TMDB |
| Hybrid Recommendation Engine | `backend/app/services/hybrid_service.py` | RF(70%) + CB(30%) weighted blend |
| LLM Service | `backend/app/services/llm_service.py` | GPT-4o-mini via GitHub Models for AI features |

### API Endpoints Implemented

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /health` | GET | Health check |
| `GET /api/recommend?movie={name}` | GET | TMDB similar movies by name |
| `GET /api/recommend/by-id/{tmdb_id}` | GET | Hybrid multi-source recommendations |
| `GET /api/recommend/hybrid` | GET | Personalized ML recommendations (auth) |
| `GET /api/recommend/mood/{mood}` | GET | Mood-based NB recommendations |
| `GET /api/recommend/cold-start` | GET | New user preference-based recs |
| `POST /api/ai/smart-search` | POST | Natural language search via LLM |
| `POST /api/ai/mood-recommendations` | POST | LLM-ranked mood recommendations |
| `POST /api/ai/trending-context` | POST | AI-generated trending insights |
| `GET /api/wishlist` | GET | User's wishlist |
| `POST /api/wishlist/add` | POST | Add to wishlist (movie/TV) |
| `DELETE /api/wishlist/remove` | DELETE | Remove from wishlist |
| `GET /api/wishlist/check/{id}` | GET | Check if item in wishlist |

---

## Phase 2: Recommendation Engine Overhaul

### Problem
The recommendation algorithm was not producing relevant results. When searching "Fast and Furious", the recommendations were unrelated.

### Solution — Multi-Source Hybrid Engine
Upgraded `/api/recommend/by-id/{tmdb_id}` to merge **3 sources**:

1. **TMDB Recommendations** — viewing-pattern based (highest weight, `source_bonus=1.3`)
2. **TMDB Similar Movies** — genre/keyword matching (`source_bonus=1.0`)
3. **Content-Based ML Model** — TF-IDF cosine similarity from trained model (`score × 0.9`)
4. **TV Fallback** — auto-detects TV show IDs and fetches TV recommendations

**Scoring formula:**
```
score = vote_average × popularity_factor × source_bonus × rank_decay
```

Results are **deduplicated** across all sources, **self-references filtered out**, and **ranked by combined score** — returning the top 10.

### Files Changed
- `backend/app/routes/recommend.py` — Complete rewrite of `/by-id/{tmdb_id}` endpoint (lines 74–183)

---

## Phase 3: Search & Home Screen Improvements

### Live Search Implementation
- Replaced specific filter-endpoints with TMDB **multi-search** (`/search/multi`)
- Added **300ms debounced** live-typing (results appear as you type)
- Correctly assigns `media_type` (movie/tv) to all results
- Filters out kids content and person results from search
- Movie/TV/All tab filtering done **client-side** to avoid TMDB endpoint inconsistencies

### Home Screen Changes
- **Added Hindi Movies section** — TMDB Discover API with `with_original_language=hi`
- **Filtered kids content** — Family genre (10751) excluded from Trending, Popular, Top Rated, TV carousels
- **Sorted all carousels properly** — Trending/Popular/Hindi/TV by popularity, Top Rated by vote_average
- **Carousel order**: Trending → Popular → TV Series → 🇮🇳 Hindi Movies → Top Rated

### Files Changed
- `frontend/src/app/(main)/search/page.tsx` — Live multi-search with debounce
- `frontend/src/app/(main)/page.tsx` — Hindi section + sorting + kids filtering

---

## Phase 4: Performance Optimization

### Problem
The home page felt **laggy when scrolling** due to expensive CSS properties on 80+ MovieCard components.

### Root Causes & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Scroll jank | `backdrop-filter: blur(8px)` on every MovieCard | Removed blur, used solid `#f1f5f9` background |
| Hover stutter | `transition: all 0.3s` triggering layout repaints | Changed to specific `transition: box-shadow, border-color` |
| Image scaling | `group-hover:scale-110` on `w500` images | Reduced to `scale-105` with `w342` images |
| Animation lag | `animate-fadeIn` on carousel sections during scroll | Removed animation from carousels |
| Missing GPU hints | No `will-change` or `-webkit-overflow-scrolling` | Added `will-change: transform/scroll-position` |
| Layout isolation | Cards don't use CSS containment | Added `contain: content` on MovieCard |
| Badge blur | `backdrop-filter: blur(4px)` on rating/type badges | Removed, using solid `rgba(0,0,0,0.65)` |

### Files Changed
- `frontend/src/components/ui/MovieCard.tsx` — Removed all `backdrop-filter`, lazy loading, smaller images
- `frontend/src/app/globals.css` — Optimized carousel, glass-card, animations

---

## Phase 5: Railway Deployment Fixes

### Problem
Railway build fails: `pip install -r requirements.txt` with Python 3.13 — `numpy==1.24.3` and other packages incompatible.

### Solution

#### New `requirements.txt`
- **Removed 34 unnecessary sub-dependencies** (h11, sniffio, cffi, greenlet, etc.)
- **Removed `jwt==1.3.1`** — wrong package! Code uses `python-jose`, not `jwt`
- **Removed `gdown`** — references non-existent `download_models.py`
- Updated all packages to latest stable versions
- Uses flexible ranges (`>=X,<Y`) instead of exact pins

#### Key Version Upgrades

| Package | Old | New | Why |
|---------|-----|-----|-----|
| `numpy` | `1.24.3` | `>=1.26.0` | Doesn't build on Python 3.12+ |
| `scikit-learn` | `1.3.0` | `>=1.6.0` | Py3.12+ support |
| `pandas` | `2.0.3` | `>=2.2.0` | Py3.12+ and numpy 2.x compat |
| `scipy` | `1.11.2` | `>=1.14.0` | Py3.12+ support |
| `fastapi` | `0.103.1` | `>=0.115.0` | Major improvements |
| `SQLAlchemy` | `2.0.20` | `>=2.0.36` | Deprecation fixes |
| `psycopg2-binary` | `2.9.7` | `>=2.9.10` | Py3.12+ wheel support |

#### Code Fixes

| File | Fix |
|------|-----|
| `backend/app/database.py` | Fixed deprecated `declarative_base` import (moved to `sqlalchemy.orm`) |
| `backend/app/auth.py` | Fixed deprecated `datetime.utcnow()` → `datetime.now(timezone.utc)` |
| `backend/alembic/env.py` | Added missing Rating, Wishlist model imports |

#### New Railway Configuration Files

| File | Purpose |
|------|---------|
| `backend/runtime.txt` | Pins Python 3.12.8 |
| `backend/nixpacks.toml` | PostgreSQL libs + pip upgrade + start.sh entrypoint |
| `backend/start.sh` | Fixed model file names, removed broken download_models reference |

---

## Phase 6: Movie Detail Page Overhaul

### Problems Identified
1. AI Insight shows "No insight available" for guests
2. Recommendations section empty until button click
3. Rating shows TMDB score (7.3) not IMDB (8.3)
4. No loading skeletons
5. Overview card too basic — missing release date, runtime, language
6. Genre tag contrast too weak
7. Cast character names overflow on small screens
8. Cast fallback avatar is a generic emoji
9. Hero banner text hard to read
10. No rating saved confirmation
11. Recommendations include self-references

### Solutions Implemented

| # | Issue | Fix |
|---|-------|-----|
| 1 | AI Insight empty for guests | Added metadata-based fallback insight (no auth needed) |
| 2 | Recommendations require button click | Auto-load recommendations when movie data loads |
| 3 | TMDB ≠ IMDB rating | Fetch IMDB rating via OMDB API + show both with labels |
| 4 | No loading states | Full skeleton loading for hero, overview, cast, AI, recommendations |
| 5 | Basic overview card | Added Details card: release date, runtime, language, status, budget, revenue, production companies, spoken languages |
| 6 | Weak genre tags | Added `border`, brighter colors (`#93c5fd`), stronger `background` |
| 7 | Text overflow on cast | Added `truncate` class + `title` attribute for tooltip |
| 8 | Generic fallback avatar | Gradient avatar showing first letter of actor name |
| 9 | Hero text hard to read | Strengthened gradient: `0.95` → `0.75` → `0.4` (was `0.92/0.6/0.3`) |
| 10 | No rating confirmation | Green ✅ "Rating saved!" message with 3-second auto-fade |
| 11 | Self-reference in recs | Added `r.id !== movieId` filter on frontend + `seen_ids = {tmdb_id}` on backend |
| 12 | Missing Ratings card | New Ratings comparison card with visual progress bars for TMDB/IMDB/User |

### Files Changed
- `frontend/src/app/movies/[id]/page.tsx` — Complete rewrite with all 12 fixes

---

## Files Modified Summary

### Backend

| File | Action | Description |
|------|--------|-------------|
| `backend/requirements.txt` | ✏️ Rewritten | All dependencies updated for Python 3.12 |
| `backend/runtime.txt` | 🆕 Created | Python 3.12.8 pin for Railway |
| `backend/nixpacks.toml` | 🆕 Created | Railway Nixpacks build configuration |
| `backend/start.sh` | ✏️ Updated | Fixed model paths, removed broken download script |
| `backend/app/database.py` | ✏️ Fixed | Deprecated `declarative_base` import |
| `backend/app/auth.py` | ✏️ Fixed | Deprecated `datetime.utcnow()` |
| `backend/app/routes/recommend.py` | ✏️ Rewritten | Multi-source hybrid recommendation engine |
| `backend/alembic/env.py` | ✏️ Fixed | Added missing model imports |
| `backend/app/ml_model/content_based.py` | 🆕 Created | TF-IDF + Cosine Similarity model |
| `backend/app/ml_model/naive_bayes_model.py` | 🆕 Created | Mood classifier |
| `backend/app/ml_model/random_forest_model.py` | 🆕 Created | Personalized RF model |
| `backend/app/ml_model/train_models.py` | 🆕 Created | Training orchestrator |
| `backend/app/services/hybrid_service.py` | 🆕 Created | Hybrid recommendation service |
| `backend/app/services/llm_service.py` | 🆕 Created | LLM/AI service |
| `backend/app/services/tmdb_data_service.py` | 🆕 Created | TMDB data enrichment |
| `backend/app/routes/ai.py` | 🆕 Created | AI-powered routes |
| `backend/app/routes/wishlist.py` | 🆕 Created | Wishlist CRUD |
| `backend/app/http_client.py` | 🆕 Created | Connection-pooled HTTP client |

### Frontend

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/app/(main)/page.tsx` | ✏️ Updated | Hindi section, sorting, kids filtering, performance |
| `frontend/src/app/(main)/search/page.tsx` | ✏️ Rewritten | Live debounced multi-search |
| `frontend/src/app/movies/[id]/page.tsx` | ✏️ Rewritten | Full overhaul with IMDB, skeletons, auto-recs, details |
| `frontend/src/components/ui/MovieCard.tsx` | ✏️ Optimized | Removed backdrop-filter, lazy loading, smaller images |
| `frontend/src/app/globals.css` | ✏️ Optimized | GPU-accelerated scroll, optimized transitions |

### Documentation

| File | Action | Description |
|------|--------|-------------|
| `README.md` | ✏️ Rewritten | Full project documentation with ML details, API docs, architecture |
| `CHANGES.md` | 🆕 Created | This file — implementation changelog |

---

## Cleanup Performed

The following **unused files were deleted** during the cleanup phase:

- `frontend/src/components/ui/Navbar.tsx` — replaced by Sidebar
- `frontend/src/components/ui/SearchBar.tsx` — replaced by search page
- `backend/app/services/user_service.py` — unused
- Various other unused component files

---

*Last updated: June 2026*
