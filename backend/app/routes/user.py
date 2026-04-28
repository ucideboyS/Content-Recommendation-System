from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import requests
from app.database import get_db
from app.auth import hash_password, verify_password, create_access_token 
from app.models import User, Movie, History, Rating
from passlib.context import CryptContext
from app.schemas import HistoryResponse
from app.dependencies import get_current_user
from typing import List, Optional
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from jose import JWTError, jwt
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
        favorite_directors=user.favorite_directors or []
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
        
        # Fetch movie poster from TMDB API
        tmdb_url = f"https://api.themoviedb.org/3/movie/{movie.tmdb_id}?api_key={TMDB_API_KEY}"
        response = requests.get(tmdb_url)
        
        poster_path = None
        if response.status_code == 200:
            movie_data = response.json()
            poster_path = f"https://image.tmdb.org/t/p/w500{movie_data.get('poster_path', '')}"

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
        tmdb_url = f"https://api.themoviedb.org/3/movie/{tmdb_movie_id}?api_key={TMDB_API_KEY}"
        response = requests.get(tmdb_url)
        print(f"TMDB API Request: {tmdb_url}")  # Debugging
        print(f"TMDB API Status Code: {response.status_code}")  # Debugging

        if response.status_code != 200:
            print(f"TMDB API Error: {response.json()}")  # Debugging
            raise HTTPException(status_code=404, detail="Movie not found on TMDB")

        movie_data = response.json()
        title = movie_data.get("title", "Unknown Title")
        print(f"Movie Title: {title}")  # Debugging

        # Check if movie already exists in the database
        movie = db.query(Movie).filter(Movie.tmdb_id == tmdb_movie_id).first()
        
        if not movie:
            print("Creating new movie entry")  # Debugging
            # Insert new movie into the database
            new_movie = Movie(tmdb_id=tmdb_movie_id, title=title)  
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
    except Exception as e:
        print(f"Error in add_history: {str(e)}")  # Debugging
        raise HTTPException(status_code=500, detail=str(e))


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

# Get personalized movie recommendations
@router.get("/recommendations")
def get_personalized_recommendations(user: User = Depends(get_current_user)):
    try:
        # Get user's favorite genres, actors, and directors
        favorite_genres = user.favorite_genres or []
        favorite_actors = user.favorite_actors or []
        favorite_directors = user.favorite_directors or []

        # Build TMDB API query parameters
        params = {
            "api_key": TMDB_API_KEY,
            "language": "en-US",
            "page": 1,
            "sort_by": "popularity.desc"
        }

        # If user has favorite genres, use them
        if favorite_genres:
            # Get genre IDs from TMDB
            genre_response = requests.get(
                "https://api.themoviedb.org/3/genre/movie/list",
                params={"api_key": TMDB_API_KEY, "language": "en-US"}
            )
            if genre_response.status_code == 200:
                genre_map = {genre["name"].lower(): genre["id"] for genre in genre_response.json()["genres"]}
                genre_ids = [genre_map[genre.lower()] for genre in favorite_genres if genre.lower() in genre_map]
                if genre_ids:
                    params["with_genres"] = ",".join(map(str, genre_ids))

        # Fetch recommended movies from TMDB
        response = requests.get(
            "https://api.themoviedb.org/3/discover/movie",
            params=params
        )

        if response.status_code != 200:
            return {"recommendations": []}

        movies = response.json()["results"][:10]  # Get top 10 movies

        # If user has favorite actors or directors, try to include their movies
        if favorite_actors or favorite_directors:
            for person in favorite_actors + favorite_directors:
                # Search for person in TMDB
                person_response = requests.get(
                    "https://api.themoviedb.org/3/search/person",
                    params={
                        "api_key": TMDB_API_KEY,
                        "query": person,
                        "language": "en-US"
                    }
                )
                
                if person_response.status_code == 200 and person_response.json()["results"]:
                    person_id = person_response.json()["results"][0]["id"]
                    
                    # Get person's movies
                    person_movies_response = requests.get(
                        f"https://api.themoviedb.org/3/person/{person_id}/movie_credits",
                        params={"api_key": TMDB_API_KEY}
                    )
                    
                    if person_movies_response.status_code == 200:
                        person_movies = person_movies_response.json()
                        # Add cast/crew movies to recommendations
                        for movie in person_movies.get("cast", []) + person_movies.get("crew", []):
                            if movie not in movies:
                                movies.append(movie)

        # Format and return recommendations
        recommendations = [
            {
                "id": movie["id"],
                "title": movie["title"],
                "overview": movie["overview"],
                "poster_path": movie["poster_path"],
                "vote_average": movie["vote_average"]
            }
            for movie in movies[:10]  # Limit to top 10 recommendations
        ]

        return {"recommendations": recommendations}
    except Exception as e:
        print(f"Error getting recommendations: {str(e)}")
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
        "favorite_directors": user.favorite_directors or []
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
            "favorite_directors": user.favorite_directors
        }
    }

# Search movies
@router.get("/search/movie")
async def search_movies(query: str):
    try:
        print(f"Searching for movies with query: {query}")  # Debug log
        response = requests.get(
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
        response = requests.get(
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
            response = requests.get(
                f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}"
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
