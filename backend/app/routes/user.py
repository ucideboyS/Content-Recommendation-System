from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.http_client import safe_get
from app.database import get_db
from app.auth import hash_password, verify_password, create_access_token 
from app.models import User, Movie, History, Rating, PasswordResetToken, RecoveryCode, OAuthExchangeCode
from passlib.context import CryptContext
from app.schemas import (
    HistoryResponse, PreferencesUpdate, 
    ForgotPasswordRequest, ResetPasswordRequest,
    Verify2FASetupRequest, Verify2FALoginRequest, Disable2FARequest, RegenerateRecoveryCodesRequest,
    OAuthExchangeRequest, ProfileUpdate
)
from app.dependencies import get_current_user
from typing import List, Optional
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import sqlalchemy.exc
import os
import secrets
import requests
import urllib.parse
import uuid
from dotenv import load_dotenv
from app.services.totp_service import generate_totp_secret, get_totp_uri, verify_totp_code, encrypt_secret, decrypt_secret, generate_recovery_codes
from app.services.email_service import email_service
from app.limiter import limiter

# Load environment variables
load_dotenv(override=True)

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
def login(request: Request, response: Response, user_data: LoginRequest, db: Session = Depends(get_db)):
    # Simple brute-force prevention could be applied here via a global rate limiter
    user = db.query(User).filter(User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # If 2FA is enabled, issue a temporary 2FA token instead of a full access token
    if getattr(user, 'two_factor_enabled', False):
        # Issue a short-lived token meant ONLY for 2FA verification
        to_encode = {"sub": user.username, "type": "2fa_partial"}
        expire = datetime.now(timezone.utc) + timedelta(minutes=5)
        to_encode.update({"exp": expire})
        temp_token = jwt.encode(to_encode, os.environ.get("SECRET_KEY", "secret"), algorithm=os.environ.get("ALGORITHM", "HS256"))
        
        response.status_code = status.HTTP_202_ACCEPTED
        return {"requires_2fa": True, "2fa_token": temp_token, "message": "2FA verification required"}

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
        "auth_provider": getattr(user, 'auth_provider', 'local'),
        "profile_picture_url": getattr(user, 'profile_picture_url', None),
        "google_profile_picture_url": getattr(user, 'google_profile_picture_url', None),
        "favorite_genres": user.favorite_genres or [],
        "favorite_actors": user.favorite_actors or [],
        "favorite_directors": user.favorite_directors or [],
        "preferred_language": user.preferred_language,
        "preferred_content_type": user.preferred_content_type,
        "preferred_regional_languages": user.preferred_regional_languages or [],
        "preferred_movie_genres": user.preferred_movie_genres or [],
        "preferred_series_genres": user.preferred_series_genres or [],
        "preferred_release_era": user.preferred_release_era,
        "two_factor_enabled": getattr(user, 'two_factor_enabled', False)
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

# Update username
@router.patch("/profile")
def update_username(
    profile_update: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if profile_update.username != user.username:
        # Check uniqueness
        existing_user = db.query(User).filter(User.username == profile_update.username).first()
        if existing_user:
            raise HTTPException(status_code=409, detail="Username already exists")
        user.username = profile_update.username
        db.commit()
        db.refresh(user)
    
    return {
        "message": "Username updated successfully",
        "username": user.username
    }

# Upload profile photo
@router.post("/profile/photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validate content type
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, PNG, and WebP are allowed.")
    
    # Read file to check size
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")
    
    # Generate unique filename
    ext = file.filename.split(".")[-1] if (file.filename and "." in file.filename) else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    
    upload_dir = "uploads/profiles"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as f:
        f.write(contents)
        
    user.profile_picture_url = f"/uploads/profiles/{filename}"
    db.commit()
    
    return {"message": "Profile photo updated", "profile_picture_url": user.profile_picture_url}

# Delete custom profile photo
@router.delete("/profile/photo")
def delete_profile_photo(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Optional: Delete file from disk if desired. For now just clear reference.
    user.profile_picture_url = None
    db.commit()
    return {"message": "Profile photo removed", "profile_picture_url": None, "google_profile_picture_url": user.google_profile_picture_url}

# Use Google photo
@router.post("/profile/photo/use-google")
def use_google_profile_photo(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.google_profile_picture_url:
        raise HTTPException(status_code=400, detail="No Google profile photo available")
        
    user.profile_picture_url = None
    db.commit()
    return {"message": "Switched to Google profile photo", "profile_picture_url": None, "google_profile_picture_url": user.google_profile_picture_url}

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
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# AUTHENTICATION ENHANCEMENTS
# ==========================================

@router.post("/login/verify-2fa")
@limiter.limit("5/minute")
def verify_login_2fa(request: Request, verify_req: Verify2FALoginRequest, db: Session = Depends(get_db)):
    # Decode the 2fa_token
    try:
        payload = jwt.decode(verify_req.token, os.environ.get("SECRET_KEY", "secret"), algorithms=[os.environ.get("ALGORITHM", "HS256")])
        if payload.get("type") != "2fa_partial":
            raise HTTPException(status_code=401, detail="Invalid token type")
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired 2FA token")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if verify_req.is_recovery_code:
        # Check recovery codes
        valid = False
        codes = db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id, RecoveryCode.used == False).all()
        for rc in codes:
            if verify_password(verify_req.code, rc.code_hash):
                valid = True
                rc.used = True
                db.commit()
                break
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid recovery code")
    else:
        # Check TOTP
        if not user.totp_secret:
            raise HTTPException(status_code=400, detail="2FA is not properly configured")
        
        secret = decrypt_secret(user.totp_secret)
        if not verify_totp_code(secret, verify_req.code):
            raise HTTPException(status_code=401, detail="Invalid authenticator code")

    # Issue final access token
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    
    # Always return success to prevent enumeration
    msg = "If an account exists for this email, a password reset link has been sent."
    
    if user:
        # Generate raw token
        raw_token = secrets.token_urlsafe(32)
        hashed_token = hash_password(raw_token)
        
        # Invalidate old tokens
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None)
        ).update({"used_at": datetime.utcnow()})
        
        # Create new token, expires in 30 mins
        expires = datetime.utcnow() + timedelta(minutes=30)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=hashed_token,
            expires_at=expires
        )
        db.add(reset_token)
        db.commit()
        
        # Send email
        email_service.send_password_reset_email(user.email, raw_token)

    return {"message": msg}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest, db: Session = Depends(get_db)):
    # Search all valid tokens. In a huge system we might send user_id in the link, but here we just iterate valid tokens (or if we had a dedicated token format).
    # Since we use bcrypt, we can't look up by hash directly.
    # To avoid full table scan with bcrypt on every reset, a better approach is to send `token_id:raw_token`.
    # Let's adjust: Since we already sent the link without ID, we can just find any unused, unexpired token that matches.
    # Wait, bcrypt is slow. It's better to find all recent tokens.
    recent_tokens = db.query(PasswordResetToken).filter(
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > datetime.utcnow()
    ).all()
    
    valid_token = None
    for token_record in recent_tokens:
        if verify_password(req.token, token_record.token_hash):
            valid_token = token_record
            break
            
    if not valid_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    user = db.query(User).filter(User.id == valid_token.user_id).first()
    user.password = hash_password(req.new_password)
    
    valid_token.used_at = datetime.utcnow()
    
    db.commit()
    return {"message": "Password has been successfully reset."}


@router.post("/2fa/setup")
def setup_2fa(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, user.email)
    
    # Generate recovery codes
    raw_codes = generate_recovery_codes()
    
    # Temporarily store secret on user but keep enabled=False until verified
    user.totp_secret = encrypt_secret(secret)
    user.two_factor_enabled = False
    
    # Delete old unused recovery codes if any
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete()
    
    for code in raw_codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=hash_password(code)))
        
    db.commit()
    
    return {
        "secret": secret,
        "uri": uri,
        "recovery_codes": raw_codes,
        "message": "Scan the QR code and verify to complete setup."
    }


@router.post("/2fa/verify-setup")
@limiter.limit("5/minute")
def verify_setup_2fa(request: Request, req: Verify2FASetupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
        
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Setup not initiated")
        
    secret = decrypt_secret(user.totp_secret)
    if not verify_totp_code(secret, req.code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
        
    user.two_factor_enabled = True
    db.commit()
    
    return {"message": "2FA successfully enabled"}


@router.post("/2fa/disable")
@limiter.limit("5/minute")
def disable_2fa(request: Request, req: Disable2FARequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid password")
        
    if req.is_recovery_code:
        valid = False
        codes = db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id, RecoveryCode.used == False).all()
        for rc in codes:
            if verify_password(req.code, rc.code_hash):
                valid = True
                rc.used = True
                break
        if not valid:
            raise HTTPException(status_code=400, detail="Invalid recovery code")
    else:
        if not user.totp_secret:
            raise HTTPException(status_code=400, detail="2FA is not enabled")
        secret = decrypt_secret(user.totp_secret)
        if not verify_totp_code(secret, req.code):
            raise HTTPException(status_code=400, detail="Invalid authenticator code")
            
    user.two_factor_enabled = False
    user.totp_secret = None
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete()
    db.commit()
    
    return {"message": "2FA successfully disabled"}


@router.post("/2fa/recovery-codes/regenerate")
@limiter.limit("5/minute")
def regenerate_recovery_codes(request: Request, req: RegenerateRecoveryCodesRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid password")
        
    if not user.two_factor_enabled or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA is not enabled")
        
    secret = decrypt_secret(user.totp_secret)
    if not verify_totp_code(secret, req.code):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
        
    raw_codes = generate_recovery_codes()
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete()
    
    for code in raw_codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=hash_password(code)))
        
    db.commit()
    return {"recovery_codes": raw_codes, "message": "Recovery codes regenerated successfully"}

# ==========================================
# GOOGLE OAUTH 2.0
# ==========================================

@router.get("/auth/google/login")
def google_oauth_login(request: Request):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    
    # SAFE DIAGNOSTIC LOGGING
    masked_client = f"{client_id[:10]}...{client_id[-25:]}" if client_id and len(client_id) > 35 else client_id
    print(f"GOOGLE_CLIENT_ID configured: {bool(client_id)}")
    print(f"GOOGLE_CLIENT_ID: {masked_client}")
    print(f"GOOGLE_REDIRECT_URI: {redirect_uri}")

    if not client_id or not redirect_uri:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")

    state = secrets.token_urlsafe(32)
    # Ideally store state in a secure cookie, or db, to prevent CSRF.
    # For a simple stateless flow without sessions, we set it as an HttpOnly cookie
    
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?response_type=code"
        f"&client_id={client_id}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri)}"
        f"&scope=openid%20email%20profile"
        f"&state={state}"
        f"&access_type=online"
    )
    
    response = Response(status_code=302)
    response.headers["Location"] = auth_url
    response.set_cookie(key="oauth_state", value=state, httponly=True, max_age=600, samesite="lax")
    return response

@router.get("/auth/google/callback")
def google_oauth_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    original_state = request.cookies.get("oauth_state")
    if not original_state or original_state != state:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")

    # Exchange code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    
    token_res = requests.post(token_url, data=token_data)
    if not token_res.ok:
        raise HTTPException(status_code=400, detail="Failed to exchange Google OAuth code")
        
    access_token = token_res.json().get("access_token")
    
    # Get user info
    userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
    userinfo_res = requests.get(userinfo_url, headers={"Authorization": f"Bearer {access_token}"})
    if not userinfo_res.ok:
        raise HTTPException(status_code=400, detail="Failed to fetch Google user info")
        
    userinfo = userinfo_res.json()
    email = userinfo.get("email")
    google_id = userinfo.get("sub")
    picture = userinfo.get("picture")
    
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
        
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Link account
        updated = False
        if getattr(user, 'google_id', None) != google_id:
            user.google_id = google_id
            updated = True
        if picture and getattr(user, 'google_profile_picture_url', None) != picture:
            user.google_profile_picture_url = picture
            updated = True
            
        if updated:
            db.commit()
    else:
        # Create new user
        # Generate a fallback username
        base_username = email.split('@')[0]
        username = base_username
        suffix = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{suffix}"
            suffix += 1
            
        user = User(
            username=username,
            email=email,
            password=None,
            auth_provider="google",
            google_id=google_id,
            google_profile_picture_url=picture
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Generate single-use exchange code
    exchange_code = secrets.token_urlsafe(32)
    db_exchange = OAuthExchangeCode(
        user_id=user.id,
        code=exchange_code,
        expires_at=datetime.utcnow() + timedelta(minutes=5)
    )
    db.add(db_exchange)
    db.commit()

    # Redirect to frontend
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    redirect_url = f"{frontend_url}/login?oauth_code={exchange_code}"
    
    response = Response(status_code=302)
    response.headers["Location"] = redirect_url
    response.delete_cookie("oauth_state")
    return response

@router.post("/auth/google/exchange")
@limiter.limit("5/minute")
def google_oauth_exchange(request: Request, req: OAuthExchangeRequest, db: Session = Depends(get_db)):
    db_code = db.query(OAuthExchangeCode).filter(
        OAuthExchangeCode.code == req.code,
        OAuthExchangeCode.used == False,
        OAuthExchangeCode.expires_at > datetime.utcnow()
    ).first()
    
    if not db_code:
        raise HTTPException(status_code=400, detail="Invalid or expired exchange code")
        
    db_code.used = True
    db.commit()
    
    user = db.query(User).filter(User.id == db_code.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.two_factor_enabled:
        # Issue partial JWT
        expires = datetime.utcnow() + timedelta(minutes=5)
        payload = {
            "sub": user.username,
            "type": "2fa_partial",
            "exp": expires
        }
        token = jwt.encode(payload, os.environ.get("SECRET_KEY", "secret"), algorithm=os.environ.get("ALGORITHM", "HS256"))
        return {"requires_2fa": True, "2fa_token": token}
        
    # Issue normal JWT
    access_token_expires = timedelta(minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30)))
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer", "requires_2fa": False}
