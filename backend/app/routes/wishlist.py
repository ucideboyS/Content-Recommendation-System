"""
Wishlist routes — CRUD for user's movie/TV wishlist.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User, Wishlist
from app.dependencies import get_current_user
from app.http_client import safe_get
import os
import logging

logger = logging.getLogger(__name__)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")

router = APIRouter()


class WishlistAddRequest(BaseModel):
    tmdb_id: int
    media_type: str = "movie"  # "movie" or "tv"


class WishlistRemoveRequest(BaseModel):
    tmdb_id: int
    media_type: str = "movie"


def _tmdb_get(path: str, params: dict = None):
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    resp = safe_get(f"https://api.themoviedb.org/3{path}", params=params)
    if resp.status_code == 200:
        return resp.json()
    return None


@router.get("/")
def get_wishlist(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    media_type: Optional[str] = None,
):
    """Get all items in user's wishlist with TMDB metadata."""
    query = db.query(Wishlist).filter(Wishlist.user_id == user.id)
    if media_type:
        query = query.filter(Wishlist.media_type == media_type)

    items = query.order_by(Wishlist.added_at.desc()).all()

    results = []
    for item in items:
        # Fetch current TMDB data for each item
        endpoint = f"/{item.media_type}/{item.tmdb_id}"
        tmdb_data = _tmdb_get(endpoint, {"language": "en-US"})

        if tmdb_data:
            results.append({
                "id": item.id,
                "tmdb_id": item.tmdb_id,
                "media_type": item.media_type,
                "added_at": item.added_at.isoformat() if item.added_at else None,
                "title": tmdb_data.get("title") or tmdb_data.get("name", ""),
                "overview": tmdb_data.get("overview", ""),
                "poster_path": tmdb_data.get("poster_path"),
                "vote_average": tmdb_data.get("vote_average", 0),
                "release_date": tmdb_data.get("release_date") or tmdb_data.get("first_air_date", ""),
            })
        else:
            results.append({
                "id": item.id,
                "tmdb_id": item.tmdb_id,
                "media_type": item.media_type,
                "added_at": item.added_at.isoformat() if item.added_at else None,
                "title": "Unknown",
                "overview": "",
                "poster_path": None,
                "vote_average": 0,
                "release_date": "",
            })

    return {"wishlist": results, "total": len(results)}


@router.post("/add")
def add_to_wishlist(
    req: WishlistAddRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a movie/TV series to user's wishlist."""
    existing = db.query(Wishlist).filter(
        Wishlist.user_id == user.id,
        Wishlist.tmdb_id == req.tmdb_id,
        Wishlist.media_type == req.media_type,
    ).first()

    if existing:
        return {"message": "Already in wishlist", "id": existing.id}

    item = Wishlist(
        user_id=user.id,
        tmdb_id=req.tmdb_id,
        media_type=req.media_type,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {"message": "Added to wishlist", "id": item.id}


@router.delete("/remove")
def remove_from_wishlist(
    req: WishlistRemoveRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a movie/TV series from user's wishlist."""
    item = db.query(Wishlist).filter(
        Wishlist.user_id == user.id,
        Wishlist.tmdb_id == req.tmdb_id,
        Wishlist.media_type == req.media_type,
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not in wishlist")

    db.delete(item)
    db.commit()
    return {"message": "Removed from wishlist"}


@router.get("/check/{tmdb_id}")
def check_wishlist(
    tmdb_id: int,
    media_type: str = Query(default="movie"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check if a movie/TV series is in user's wishlist."""
    exists = db.query(Wishlist).filter(
        Wishlist.user_id == user.id,
        Wishlist.tmdb_id == tmdb_id,
        Wishlist.media_type == media_type,
    ).first()

    return {"in_wishlist": exists is not None}
