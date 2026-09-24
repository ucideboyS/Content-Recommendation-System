from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List

from app.database import get_db
from app.models import User, Reminder
from app.schemas import ReminderAdd, ReminderResponse
from app.dependencies import get_current_user

router = APIRouter()

from app.http_client import safe_get
import os

TMDB_API_KEY = os.getenv("TMDB_API_KEY")

def _tmdb_get(path: str, params: dict = None):
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    resp = safe_get(f"https://api.themoviedb.org/3{path}", params=params)
    if resp.status_code == 200:
        return resp.json()
    return None

@router.get("")
def get_reminders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all reminders for the current user with TMDB metadata."""
    reminders = db.query(Reminder).filter(Reminder.user_id == current_user.id).all()
    
    results = []
    for r in reminders:
        endpoint = f"/{r.media_type}/{r.tmdb_id}"
        tmdb_data = _tmdb_get(endpoint, {"language": "en-US"})
        if tmdb_data:
            results.append({
                "id": r.id,
                "tmdb_id": r.tmdb_id,
                "media_type": r.media_type,
                "created_at": r.created_at,
                "title": tmdb_data.get("title") or tmdb_data.get("name") or "",
                "overview": tmdb_data.get("overview", ""),
                "poster_path": tmdb_data.get("poster_path"),
                "release_date": tmdb_data.get("release_date") or tmdb_data.get("first_air_date") or "",
                "vote_average": tmdb_data.get("vote_average", 0.0)
            })
    return results

@router.get("/check/{tmdb_id}")
def check_reminder(tmdb_id: int, media_type: str = "movie", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Check if a specific movie/show is in reminders."""
    exists = db.query(Reminder).filter(
        Reminder.user_id == current_user.id,
        Reminder.tmdb_id == tmdb_id,
        Reminder.media_type == media_type
    ).first() is not None
    return {"in_reminders": exists}

@router.post("", response_model=ReminderResponse)
def add_reminder(item: ReminderAdd, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Add a movie/tv show to reminders."""
    reminder = Reminder(
        user_id=current_user.id,
        tmdb_id=item.tmdb_id,
        media_type=item.media_type
    )
    
    try:
        db.add(reminder)
        db.commit()
        db.refresh(reminder)
        return reminder
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item already in reminders")

@router.delete("/{tmdb_id}")
def remove_reminder(tmdb_id: int, media_type: str = "movie", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove a movie/tv show from reminders."""
    reminder = db.query(Reminder).filter(
        Reminder.user_id == current_user.id,
        Reminder.tmdb_id == tmdb_id,
        Reminder.media_type == media_type
    ).first()
    
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
        
    db.delete(reminder)
    db.commit()
    return {"message": "Reminder removed successfully"}
