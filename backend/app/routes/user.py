from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.http_client import safe_get
from app.database import get_db
from app.auth import hash_password, verify_password, create_access_token 
from app.models import User, Movie, History, Rating
from passlib.context import CryptContext
from app.schemas import HistoryResponse, PreferencesUpdate
from app.dependencies import get_current_user
from typing import List, Optional
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from jose import JWTError, jwt
import sqlalchemy.exc
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get environment variables
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
if not TMDB_API_KEY:
    raise ValueError("TMDB_API_KEY environment variable is not set")

# Create a password hashing context
bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()

# Define Pydantic models for request body
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    favorite_genres: Optional[List[str]] = None
    favorite_actors: Optional[List[str]] = None
    favorite_directors: Optional[List[str]] = None
    preferred_language: Optional[str] = None
    preferred_content_type: Optional[str] = None
    preferred_regional_languages: Optional[List[str]] = None
    preferred_movie_genres: Optional[List[str]] = None
    preferred_series_genres: Optional[List[str]] = None
    preferred_release_era: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class RatingRequest(BaseModel):
    rating: float

# ✅ Register Route
@router.post("/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_password = bcrypt_context.hash(user.password)
    
    new_user = User(
        username=user.username,
        email=user.email,
        password=hashed_password,
        favorite_genres=user.favorite_genres or [],
        favorite_actors=user.favorite_actors or [],
        favorite_directors=user.favorite_directors or [],
        preferred_language=user.preferred_language,
        preferred_content_type=user.preferred_content_type,
        preferred_regional_languages=user.preferred_regional_languages or [],
        preferred_movie_genres=user.preferred_movie_genres or [],
        preferred_series_genres=user.preferred_series_genres or [],
        preferred_release_era=user.preferred_release_era
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "User registered successfully"}

# ✅ Login Route
@router.post("/login")
def login(user_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}

# ✅ History Request Schema
class HistoryCreate(BaseModel):
    tmdb_movie_id: int  # Accepts TMDB movie ID from frontend

# ✅ Fetch User History
# @router.get("/history", response_model=list[HistoryResponse])
# def get_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
#     return db.query(History).filter(History.user_id == user.id).order_by(History.timestamp.desc()).all()
@router.get("/history")
def get_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    history_entries = (
        db.query(History)
        .filter(History.user_id == user.id)
        .order_by(History.timestamp.desc())
        .all()
    )

    result = []
    for entry in history_entries:
        movie = db.query(Movie).filter(Movie.id == entry.movie_id).first()
        poster_path = None

        if movie:
            try:
                tmdb_url = f"https://api.themoviedb.org/3/movie/{movie.tmdb_id}"
                response = safe_get(tmdb_url, params={"api_key": TMDB_API_KEY})
                if response.status_code == 200:
                    movie_data = response.json()
                    poster_path = f"https://image.tmdb.org/t/p/w500{movie_data.get('poster_path', '')}"
            except Exception as e:
                print(f"TMDB fetch failed for {entry.title}: {e}")

        result.append({
            "id": entry.id,
            "title": entry.title,
            "timestamp": entry.timestamp,
            "poster_path": poster_path or "/default-movie-poster.jpg",
        })

    return result


# ✅ Add Movie to User History
@router.post("/history")
def add_history(
    request: HistoryCreate,
    user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    try:
        tmdb_movie_id = request.tmdb_movie_id
        print(f"Received TMDB Movie ID: {tmdb_movie_id}")  # Debugging
        print(f"User ID: {user.id}")  # Debugging

        # Fetch movie details from TMDB API to verify it exists
        tmdb_url = f"https://api.themoviedb.org/3/movie/{tmdb_movie_id}"
        response = safe_get(tmdb_url, params={"api_key": TMDB_API_KEY})
        
        media_type = "movie"
        if response.status_code == 404:
            # Fallback to checking if it's a TV show
            tmdb_url = f"https://api.themoviedb.org/3/tv/{tmdb_movie_id}"
            response = safe_get(tmdb_url, params={"api_key": TMDB_API_KEY})
            media_type = "tv"

        if response.status_code != 200:
            print(f"TMDB API Error: {response.json()}")  # Debugging
            raise HTTPException(status_code=404, detail="Movie/TV not found on TMDB")

        movie_data = response.json()
        title = movie_data.get("title", movie_data.get("name", "Unknown Title"))
        print(f"Content Title: {title}, Type: {media_type}")  # Debugging

        # Check if movie already exists in the database
        movie = db.query(Movie).filter(Movie.tmdb_id == tmdb_movie_id).first()
        
        if not movie:
            print("Creating new movie entry")  # Debugging
            # Insert new movie into the database
            new_movie = Movie(tmdb_id=tmdb_movie_id, title=title, media_type=media_type)  
            db.add(new_movie)
            db.commit()
            db.refresh(new_movie)
            movie = new_movie
            print(f"Created new movie with ID: {movie.id}")  # Debugging
        else:
            print(f"Found existing movie with ID: {movie.id}")  # Debugging

        # Check if this movie is already in user's history
        existing_entry = db.query(History).filter(
            History.user_id == user.id,
            History.movie_id == movie.id
        ).first()

        if existing_entry:
            print("Movie already in user's history")  # Debugging
            return {"message": "Movie already in history"}

        # Add history entry
        new_entry = History(user_id=user.id, movie_id=movie.id, title=movie.title)
        db.add(new_entry)
        db.commit()
        print("Added new history entry")  # Debugging

        return {"message": "History saved successfully"}
    except HTTPException:
        raise
    except sqlalchemy.exc.IntegrityError:
        db.rollback()
        # This usually happens in React Strict Mode double-submits where 
        # two concurrent requests try to insert the same movie.
        return {"message": "History saved successfully (concurrent insert)"}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Error in add_history: {str(e)}\n{tb}")  # Debugging
        raise HTTPException(status_code=500, detail=f"{str(e)}\n{tb}")


# ✅ Clear User History
@router.delete("/history")
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(History).filter(History.user_id == user.id).delete()
    db.commit()
    return {"message": "History cleared"}

@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    Logout endpoint to clear server-side sessions.
    In a real application, you might want to:
    1. Add the token to a blacklist
    2. Clear any server-side sessions
    3. Clear any cached user data
    """
    return {"message": "Successfully logged out"}

# Get user's favorite genres
@router.get("/favorites/genres")
def get_favorite_genres(user: User = Depends(get_current_user)):
    return user.favorite_genres or []

# Get user's favorite actors
@router.get("/favorites/actors")
def get_favorite_actors(user: User = Depends(get_current_user)):
    return user.favorite_actors or []

# Get user's favorite directors
@router.get("/favorites/directors")
def get_favorite_directors(user: User = Depends(get_current_user)):
    return user.favorite_directors or []

# Update user's favorite genres
@router.put("/favorites/genres")
def update_favorite_genres(
    genres: List[str],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user.favorite_genres = genres
    db.commit()
    return {"message": "Favorite genres updated successfully"}

# Update user's favorite actors
@router.put("/favorites/actors")
def update_favorite_actors(
    actors: List[str],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user.favorite_actors = actors
    db.commit()
    return {"message": "Favorite actors updated successfully"}

# Update user's favorite directors
@router.put("/favorites/directors")
def update_favorite_directors(
    directors: List[str],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user.favorite_directors = directors
    db.commit()
    return {"message": "Favorite directors updated successfully"}

# Update user's extended preferences
@router.put("/preferences")
def update_preferences(
    update_req: PreferencesUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if update_req.preferred_language is not None:
        user.preferred_language = update_req.preferred_language
    if update_req.preferred_content_type is not None:
        user.preferred_content_type = update_req.preferred_content_type
    if update_req.preferred_regional_languages is not None:
        user.preferred_regional_languages = update_req.preferred_regional_languages
    if update_req.preferred_movie_genres is not None:
        user.preferred_movie_genres = update_req.preferred_movie_genres
    if update_req.preferred_series_genres is not None:
        user.preferred_series_genres = update_req.preferred_series_genres
    if update_req.preferred_release_era is not None:
        user.preferred_release_era = update_req.preferred_release_era
    if update_req.favorite_genres is not None:
        user.favorite_genres = update_req.favorite_genres
    if update_req.favorite_actors is not None:
        user.favorite_actors = update_req.favorite_actors
    if update_req.favorite_directors is not None:
        user.favorite_directors = update_req.favorite_directors
        
    db.commit()
    return {"message": "Preferences updated successfully"}


# Get personalized movie recommendations
@router.get("/recommendations")
def get_personalized_recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        from app.ml_model_v2.hybrid_recommender import recommend_by_id
        import traceback

        recs = []
        # 1. If user has history, use the most recent movie as a seed for hybrid_recommender
        last_history = db.query(History).filter(History.user_id == user.id).order_by(History.timestamp.desc()).first()
        if last_history and last_history.movie_id:
            movie = db.query(Movie).filter(Movie.id == last_history.movie_id).first()
            if movie and movie.tmdb_id:
                res = recommend_by_id(movie.tmdb_id, top_n=10, user_id=user.id, db=db)
                recs = res.get("recommendations", [])

        # 2. Fallback if no history or recommender returns empty
        if not recs:
            pref_type = (user.preferred_content_type or "both").lower()
            mtype = "movie" if pref_type == "movie" else "tv"
            
            params = {
                "api_key": TMDB_API_KEY,
                "language": "en-US",
                "page": 1,
                "sort_by": "popularity.desc",
                "vote_count.gte": 50,
            }
            if user.preferred_language:
                params["with_original_language"] = user.preferred_language
                
            if user.favorite_genres:
                genre_response = safe_get(f"https://api.themoviedb.org/3/genre/{mtype}/list", params={"api_key": TMDB_API_KEY, "language": "en-US"})
                if genre_response.status_code == 200:
                    genre_map = {g["name"].lower(): g["id"] for g in genre_response.json().get("genres", [])}
                    gids = [str(genre_map[g.lower()]) for g in user.favorite_genres if g.lower() in genre_map]
                    if gids:
                        params["with_genres"] = "|".join(gids)

            if mtype == "tv":
                params["without_genres"] = "10766,10767,10763,10764,10762,10751,99"
            else:
                params["without_genres"] = "99,10762"
                
            response = safe_get(f"https://api.themoviedb.org/3/discover/{mtype}", params=params)
            if response.status_code == 200:
                results = response.json().get("results", [])
                for m in results:
                    m["media_type"] = mtype
                recs = results[:10]

        # Format and return recommendations
        recommendations = [
            {
                "id": movie.get("id"),
                "title": movie.get("title", movie.get("name", "Unknown Title")),
                "overview": movie.get("overview", ""),
                "poster_path": movie.get("poster_path", ""),
                "vote_average": movie.get("vote_average", 0.0),
                "media_type": movie.get("media_type", "movie")
            }
            for movie in recs[:10]
        ]

        return {"recommendations": recommendations}
    except Exception as e:
        import traceback
        print(f"Error getting recommendations: {str(e)}\n{traceback.format_exc()}")
        return {"recommendations": []}

# Get user profile
@router.get("/profile")
def get_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "favorite_genres": user.favorite_genres or [],
        "favorite_actors": user.favorite_actors or [],
        "favorite_directors": user.favorite_directors or [],
        "preferred_language": user.preferred_language,
        "preferred_content_type": user.preferred_content_type,
        "preferred_regional_languages": user.preferred_regional_languages or [],
        "preferred_movie_genres": user.preferred_movie_genres or [],
        "preferred_series_genres": user.preferred_series_genres or [],
        "preferred_release_era": user.preferred_release_era
    }

# Update user profile
@router.put("/profile")
def update_profile(
    profile_update: UserCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Update user fields
    user.username = profile_update.username
    user.email = profile_update.email
    user.favorite_genres = profile_update.favorite_genres
    user.favorite_actors = profile_update.favorite_actors
    user.favorite_directors = profile_update.favorite_directors
    user.preferred_language = profile_update.preferred_language

    # Only update password if provided
    if profile_update.password:
        user.password = bcrypt_context.hash(profile_update.password)

    db.commit()
    db.refresh(user)

    return {
        "message": "Profile updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "favorite_genres": user.favorite_genres,
            "favorite_actors": user.favorite_actors,
            "favorite_directors": user.favorite_directors,
            "preferred_language": user.preferred_language
        }
    }

# Search movies
@router.get("/search/movie")
async def search_movies(query: str):
    try:
        print(f"Searching for movies with query: {query}")  # Debug log
        response = safe_get(
            "https://api.themoviedb.org/3/search/movie",
            params={
                "api_key": TMDB_API_KEY,
                "query": query,
                "language": "en-US",
                "page": 1
            }
        )
        
        if response.status_code != 200:
            print(f"TMDB API Error: {response.status_code} - {response.text}")  # Debug log
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch movies from TMDB")
            
        return response.json()
    except Exception as e:
        print(f"Error in search_movies: {str(e)}")  # Debug log
        raise HTTPException(status_code=500, detail=str(e))

# Get popular movies
@router.get("/movies/popular")
async def get_popular_movies():
    try:
        print(f"Fetching popular movies with API key: {TMDB_API_KEY[:5]}...")  # Debug log
        response = safe_get(
            "https://api.themoviedb.org/3/movie/popular",
            params={
                "api_key": TMDB_API_KEY,
                "language": "en-US",
                "page": 1
            }
        )
        
        if response.status_code != 200:
            print(f"TMDB API Error: {response.status_code} - {response.text}")  # Debug log
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch popular movies from TMDB")
            
        return response.json()
    except Exception as e:
        print(f"Error in get_popular_movies: {str(e)}")  # Debug log
        raise HTTPException(status_code=500, detail=str(e))

# Add rating for a movie
@router.post("/movies/{tmdb_id}/rate")
async def rate_movie(
    tmdb_id: int,
    rating_request: RatingRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        rating = rating_request.rating
        # Validate rating
        if not (0 <= rating <= 5):
            raise HTTPException(status_code=400, detail="Rating must be between 0 and 5")

        # Check if movie exists in our database
        movie = db.query(Movie).filter(Movie.tmdb_id == tmdb_id).first()
        if not movie:
            # Fetch movie details from TMDB
            response = safe_get(
                f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                params={"api_key": TMDB_API_KEY}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=404, detail="Movie not found")
            
            movie_data = response.json()
            movie = Movie(
                tmdb_id=tmdb_id,
                title=movie_data["title"],
                overview=movie_data.get("overview", "")
            )
            db.add(movie)
            db.commit()
            db.refresh(movie)

        # Check if user has already rated this movie
        existing_rating = db.query(Rating).filter(
            Rating.user_id == user.id,
            Rating.tmdb_id == tmdb_id
        ).first()

        if existing_rating:
            # Update existing rating
            existing_rating.rating = rating
        else:
            # Create new rating
            new_rating = Rating(
                user_id=user.id,
                tmdb_id=tmdb_id,
                rating=rating
            )
            db.add(new_rating)

        db.commit()
        return {"message": "Rating added successfully", "rating": rating}

    except Exception as e:
        print(f"Error in rate_movie: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get user's rating for a movie
@router.get("/movies/{tmdb_id}/rating")
async def get_movie_rating(
    tmdb_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        rating = db.query(Rating).filter(
            Rating.user_id == user.id,
            Rating.tmdb_id == tmdb_id
        ).first()

        if rating:
            return {"rating": rating.rating}
        return {"rating": None}

    except Exception as e:
        print(f"Error in get_movie_rating: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
