from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List

from app.database import get_db
from app.models import User, Reminder
from app.schemas import ReminderAdd, ReminderResponse
from app.dependencies import get_current_user

router = APIRouter()

@router.get("", response_model=List[ReminderResponse])
def get_reminders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all reminders for the current user."""
    reminders = db.query(Reminder).filter(Reminder.user_id == current_user.id).all()
    return reminders

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
def remove_reminder(tmdb_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove a movie/tv show from reminders."""
    reminder = db.query(Reminder).filter(
        Reminder.user_id == current_user.id,
        Reminder.tmdb_id == tmdb_id
    ).first()
    
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
        
    db.delete(reminder)
    db.commit()
    return {"message": "Reminder removed successfully"}
