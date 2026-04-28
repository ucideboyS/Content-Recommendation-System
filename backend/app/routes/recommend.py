from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.recommendations import recommend, recommend_by_preferences
from app.models import User, History
from app.dependencies import get_current_user

router = APIRouter()

@router.get("/")
def get_recommendations(movie: str = Query(..., description="Enter a movie name")):
    recommendations = recommend(movie)
    if not recommendations:
        raise HTTPException(status_code=404, detail="Movie not found")
    return {"recommendations": recommendations}

# ✅ Cold Start Recommendation Route (User Preferences-Based)
@router.get("/cold-start")
def get_cold_start_recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check if user has any history
    history_count = db.query(History).filter(History.user_id == user.id).count()
    
    if history_count > 0:
        return {"message": "User has history, use normal recommendations"}

    # Get user preferences
    if not user.favorite_genres and not user.favorite_actors and not user.favorite_directors:
        return {"message": "No preferences set, showing trending movies instead"}

    recommendations = recommend_by_preferences(user)
    return {"recommendations": recommendations}
